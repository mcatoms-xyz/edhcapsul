// ============================================================================
// EDHCapsul Multiplayer — Networking layer (TV host side)
// ============================================================================
// Loaded into gamenight.html when ?mp=1 is in the URL.
// Turns gamenight.html into a TV host that phones can join as player controllers.
//
// Architecture:
//   - TV is authoritative. Polls gameState every 400ms, pushes diffs to Supabase.
//   - Phones send events via Supabase broadcast channel.
//   - TV dispatches incoming events to existing global functions (adjustLife, etc.)
//   - No rewrite of game logic — thin wrapper only.
// ============================================================================

(function () {
  'use strict';

  const SUPABASE_URL = 'https://txkivthzagrkcdhnoflh.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_chxrej0Rj3girU-xf8-LCA_t2OcNw_d';

  // Only activate if ?mp=1 is in the URL
  const params = new URLSearchParams(window.location.search);
  if (params.get('mp') !== '1') {
    console.log('[EDHMP] multiplayer OFF (add ?mp=1 to URL to enable)');
    return;
  }

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('[EDHMP] Supabase client not loaded. Ensure the CDN <script> is included before multiplayer.js.');
    return;
  }

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // --------------------------------------------------------------------------
  // Identity + helpers
  // --------------------------------------------------------------------------

  function getDeviceId() {
    let id = localStorage.getItem('edhmp_device_id');
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || ('tv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
      localStorage.setItem('edhmp_device_id', id);
    }
    return id;
  }
  const deviceId = getDeviceId();

  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  function generateRoomCode() {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return code;
  }

  function buildPlayUrl(code) {
    const base = window.location.origin + window.location.pathname.replace(/[^/]+$/, '');
    return base + 'play.html?code=' + code;
  }

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------

  let currentRoom = null;
  let eventChannel = null;
  let stateChannel = null;
  let pollTimer = null;
  let lastStateSnapshot = null;
  let pushInFlight = false;
  let pushPending = false;

  // --------------------------------------------------------------------------
  // Event dispatch — phone -> TV
  // Maps incoming phone event types to existing global functions in gamenight.html
  // --------------------------------------------------------------------------

  const actionMap = {
    adjustLife:             (p) => window.adjustLife && window.adjustLife(p.pid, p.amount),
    adjustPoison:           (p) => window.adjustPoison && window.adjustPoison(p.pid, p.amount),
    adjustEnergy:           (p) => window.adjustEnergy && window.adjustEnergy(p.pid, p.amount),
    adjustExperience:       (p) => window.adjustExperience && window.adjustExperience(p.pid, p.amount),
    adjustRad:              (p) => window.adjustRad && window.adjustRad(p.pid, p.amount),
    adjustCommanderDamage:  (p) => window.adjustCommanderDamage && window.adjustCommanderDamage(p.targetPid, p.sourcePid, p.amount),
    castCommander:          (p) => window.castCommander && window.castCommander(p.pid),
    castPartner:            (p) => window.castPartner && window.castPartner(p.pid),
    nextTurn:               ()  => window.nextTurn && window.nextTurn(),
    setMonarch:             (p) => window.setMonarch && window.setMonarch(p.pid),
    setInitiative:          (p) => window.setInitiative && window.setInitiative(p.pid),
    toggleCityBlessing:     (p) => window.toggleCityBlessing && window.toggleCityBlessing(p.pid),
    concede: (p) => {
      // confirmDeath(pid, cause) handles everything: sets isDead, deathCause,
      // deathTurn (using TV's turnNumber), dismisses modal, grays seat, auto-
      // advances turn if current, runs variant win checks.
      if (window.confirmDeath) window.confirmDeath(p.pid, 'concede');
    }
  };

  function handlePhoneEvent(event) {
    console.log('[EDHMP] phone event:', event);
    const handler = actionMap[event.type];
    if (!handler) {
      console.warn('[EDHMP] unknown event type:', event.type);
      return;
    }
    try {
      handler(event);
    } catch (e) {
      console.error('[EDHMP] handler error for', event.type, e);
    }
  }

  // --------------------------------------------------------------------------
  // State polling — TV -> DB
  // Snapshots gameState + related globals every 400ms, pushes to DB on change.
  // --------------------------------------------------------------------------

  function gatherState() {
    // gamenight.html declares these as top-level const/let, so they're
    // globals in the same script scope but NOT on window. typeof guards
    // avoid ReferenceErrors if they aren't set yet.
    var gs = (typeof gameState !== 'undefined') ? gameState : null;
    var ap = (typeof activePod !== 'undefined') ? activePod : [];
    var ms = (typeof matchupSelections !== 'undefined') ? matchupSelections : {};
    var sa = (typeof slotAssignments !== 'undefined') ? slotAssignments : [];
    var av = (typeof activeVariant !== 'undefined') ? activeVariant : 'standard';
    // pod.js exposes MTG_POD as a var so it IS on window
    var pod = (window.MTG_POD && window.MTG_POD.players) ? window.MTG_POD.players : [];

    // Derive current turn state from TV globals so the phone can read
    // gameState.activePlayerId directly (gamenight.html uses
    // seatOrder[currentTurnIdx] as the source of truth — there is no
    // activePlayerId field natively).
    var so = (typeof seatOrder !== 'undefined') ? seatOrder : null;
    var cti = (typeof currentTurnIdx !== 'undefined') ? currentTurnIdx : 0;
    var tn = (typeof turnNumber !== 'undefined') ? turnNumber : 0;
    var activePid = (so && so.length) ? so[cti] : null;

    // Shallow-copy gameState to inject activePlayerId + turnNumber without
    // mutating TV-side authoritative state. players/log/etc references are
    // shared — fine for JSON serialization and diff-based push.
    var gsSnapshot = gs ? Object.assign({}, gs, {
      activePlayerId: activePid,
      turnNumber: tn
    }) : null;

    return {
      gameState: gsSnapshot,
      activePod: ap,
      pod: pod,
      matchupSelections: ms,
      slotAssignments: sa,
      variant: av,
      ts: Date.now()
    };
  }

  async function pollAndPush() {
    if (!currentRoom) return;
    const snapshot = gatherState();
    const { ts, ...compare } = snapshot;
    const serialized = JSON.stringify(compare);
    if (serialized === lastStateSnapshot) return;
    lastStateSnapshot = serialized;

    if (pushInFlight) { pushPending = true; return; }
    pushInFlight = true;
    try {
      const { error } = await supabase
        .from('rooms')
        .update({ state: snapshot })
        .eq('code', currentRoom.code);
      if (error) console.warn('[EDHMP] push failed:', error);
    } catch (e) {
      console.warn('[EDHMP] push threw:', e);
    } finally {
      pushInFlight = false;
      if (pushPending) { pushPending = false; pollAndPush(); }
    }
  }

  // --------------------------------------------------------------------------
  // Room lifecycle
  // --------------------------------------------------------------------------

  async function startRoom(attempt) {
    attempt = attempt || 0;
    const code = generateRoomCode();
    const initial = gatherState();
    const { data, error } = await supabase
      .from('rooms')
      .insert({
        code,
        state: initial,
        claimed_seats: {},
        host_device_id: deviceId
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505' && attempt < 5) {
        return startRoom(attempt + 1); // code collision, retry
      }
      console.error('[EDHMP] failed to create room:', error);
      showError('Could not create room: ' + (error.message || 'unknown'));
      return;
    }

    currentRoom = data;
    const { ts, ...compare } = initial;
    lastStateSnapshot = JSON.stringify(compare);
    console.log('[EDHMP] room created:', code);

    // Broadcast channel — phones publish events
    eventChannel = supabase.channel('room:' + code + ':events');
    eventChannel
      .on('broadcast', { event: 'action' }, (payload) => {
        handlePhoneEvent(payload.payload);
      })
      .subscribe((status) => {
        console.log('[EDHMP] event channel:', status);
      });

    // Postgres changes — watch seat claims from phones
    stateChannel = supabase
      .channel('room:' + code + ':row')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: 'code=eq.' + code
      }, (payload) => {
        if (payload.new && payload.new.claimed_seats) {
          currentRoom.claimed_seats = payload.new.claimed_seats;
          renderSeatClaims();
        }
      })
      .subscribe();

    showOverlay(code);
    pollTimer = setInterval(pollAndPush, 400);
  }

  // --------------------------------------------------------------------------
  // UI — floating overlay with room code + QR
  // --------------------------------------------------------------------------

  function showOverlay(code) {
    const joinUrl = buildPlayUrl(code);
    injectStyles();
    const overlay = document.createElement('div');
    overlay.id = 'edhmpOverlay';
    overlay.innerHTML =
      '<div class="edhmp-card">' +
        '<button class="edhmp-toggle" onclick="document.getElementById(\'edhmpOverlay\').classList.toggle(\'edhmp-min\')" title="Minimize">−</button>' +
        '<div class="edhmp-title">🎮 MULTIPLAYER LIVE</div>' +
        '<div class="edhmp-qr">' +
          '<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=6&data=' + encodeURIComponent(joinUrl) + '" alt="Scan to join" onerror="this.style.display=\'none\'">' +
        '</div>' +
        '<div class="edhmp-code">' + code + '</div>' +
        '<div class="edhmp-url">' + joinUrl + '</div>' +
        '<div id="edhmpSeats" class="edhmp-seats"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    renderSeatClaims();
  }

  function renderSeatClaims() {
    const el = document.getElementById('edhmpSeats');
    if (!el || !currentRoom) return;
    const claims = currentRoom.claimed_seats || {};
    const claimed = Object.keys(claims);
    if (!claimed.length) {
      el.innerHTML = '<div class="edhmp-seats-empty">awaiting phones...</div>';
      return;
    }
    el.innerHTML = '<div class="edhmp-seats-title">CONNECTED:</div>' +
      claimed.map((pid) => '<span class="edhmp-seat">' + pid + '</span>').join(' ');
  }

  function showError(msg) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:16px;left:16px;background:#c00;color:#fff;padding:12px 16px;border-radius:6px;z-index:99999;font-family:system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.4);';
    el.textContent = '[EDHMP] ' + msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 10000);
  }

  function injectStyles() {
    if (document.getElementById('edhmpStyles')) return;
    const s = document.createElement('style');
    s.id = 'edhmpStyles';
    s.textContent = [
      '#edhmpOverlay{position:fixed;top:16px;right:16px;z-index:99999;font-family:system-ui,-apple-system,sans-serif;}',
      '#edhmpOverlay .edhmp-card{position:relative;background:rgba(0,0,0,0.92);border:2px solid #C9A849;color:#fff;padding:14px 16px 16px;border-radius:14px;min-width:240px;box-shadow:0 10px 40px rgba(0,0,0,0.7);}',
      '#edhmpOverlay .edhmp-toggle{position:absolute;top:8px;right:8px;background:transparent;border:1px solid #C9A849;color:#C9A849;width:26px;height:26px;border-radius:13px;cursor:pointer;font-size:16px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0;}',
      '#edhmpOverlay .edhmp-title{font-size:11px;letter-spacing:2px;color:#C9A849;margin:0 0 10px;text-align:center;font-weight:800;padding-right:28px;}',
      '#edhmpOverlay .edhmp-qr{background:#fff;padding:6px;border-radius:8px;display:flex;justify-content:center;margin-bottom:10px;}',
      '#edhmpOverlay .edhmp-qr img{display:block;width:200px;height:200px;}',
      '#edhmpOverlay .edhmp-code{font-size:36px;text-align:center;letter-spacing:8px;font-weight:900;margin-bottom:6px;color:#C9A849;}',
      '#edhmpOverlay .edhmp-url{font-size:10px;text-align:center;color:#888;word-break:break-all;margin-bottom:10px;}',
      '#edhmpOverlay .edhmp-seats{font-size:11px;color:#ccc;margin-top:6px;text-align:center;}',
      '#edhmpOverlay .edhmp-seats-title{color:#888;margin-bottom:4px;letter-spacing:1px;font-weight:700;}',
      '#edhmpOverlay .edhmp-seats-empty{color:#666;font-style:italic;}',
      '#edhmpOverlay .edhmp-seat{background:rgba(201,168,73,0.25);padding:3px 8px;border-radius:4px;margin:2px;display:inline-block;font-size:11px;color:#fff;}',
      '#edhmpOverlay.edhmp-min .edhmp-qr,#edhmpOverlay.edhmp-min .edhmp-url,#edhmpOverlay.edhmp-min .edhmp-seats{display:none;}',
      '#edhmpOverlay.edhmp-min .edhmp-card{min-width:110px;padding:10px 14px;}',
      '#edhmpOverlay.edhmp-min .edhmp-title{font-size:9px;margin-bottom:4px;padding-right:24px;}',
      '#edhmpOverlay.edhmp-min .edhmp-code{font-size:22px;letter-spacing:4px;margin-bottom:0;}'
    ].join('');
    document.head.appendChild(s);
  }

  // --------------------------------------------------------------------------
  // Public API for debugging
  // --------------------------------------------------------------------------

  window.EDHMP = {
    getRoom: () => currentRoom,
    deviceId,
    forcePush: pollAndPush,
    stop: () => {
      if (pollTimer) clearInterval(pollTimer);
      if (eventChannel) eventChannel.unsubscribe();
      if (stateChannel) stateChannel.unsubscribe();
      const ov = document.getElementById('edhmpOverlay');
      if (ov) ov.remove();
      console.log('[EDHMP] stopped');
    }
  };

  // --------------------------------------------------------------------------
  // Boot
  // --------------------------------------------------------------------------

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startRoom);
  } else {
    startRoom();
  }
})();
