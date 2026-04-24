# EDHCapsul

Commander (EDH) game night HQ — deck registry, game logger, matchup preview, pod analytics, and multiplayer game tracking with phone-as-controller.

## What this is

A Jackbox-style experience for in-person Commander game night. The game runs on the TV (or laptop plugged into the TV). Players join from their phones with a 4-char room code. Phones become player-specific controllers — life totals, commander damage, turn actions, private info (Kingdoms roles, Archenemy schemes) all flow through them in real time.

## Layout

- **`index.html`** — app shell (home, navigation)
- **`gamenight.html`** — live in-game tracker (the TV view during a game)
- **`gamelog.html`** — historical game browser
- **`arsenal.html`** — pod deck registry
- **`play.html`** — phone-side player controller  _(coming tonight — Jackbox pattern)_
- **`multiplayer.js`** — Supabase Realtime sync layer  _(coming tonight)_
- **`data/`** — pod roster, decks, games, seasons, achievements, cards, planes, horde/archenemy definitions
- **`assets/`** — background videos (gitignored, see below), deck photos
- **`supabase-schema.sql`** — database schema
- **`edhcapsul-spec-history.md`** — original spec from March 2026 (historical, when this was MTGCapsul inside MyCapsul)

## Architecture

- **TV view** (`gamenight.html`) — big screen in the room, authoritative game state
- **Phone view** (`play.html`) — each player's device, scoped to their seat
- **Supabase Realtime** — state broadcast between devices via room code
- **No accounts tonight** — anonymous device IDs. Real auth comes later with the product path.

The TV remains authoritative. Phones send events (life change, turn pass, cast commander). TV applies them via the existing game-state functions and broadcasts snapshots back. No two-way state-bind, no conflict resolution yet — "last write wins" is fine for 4 trusted players around a table.

## Heritage

This was originally MTGCapsul, a satellite of MyCapsul. Spun out April 23, 2026 into its own standalone app because:
- The phone-as-controller / Jackbox model is a distinct product, not a dashboard tile
- The data model (multi-player, multi-pod) doesn't fit the single-user Capsul pattern
- Clean identity (EDHCapsul = Commander/EDH-specific) is a better commercial positioning

## Known follow-ups

- Background videos (`assets/*.mov`, `*.mp4`) are gitignored — too large for repo. Migrate to Cloudinary/CDN or compress to web-ready `.mp4` under 5MB each.
- Filename cleanup: `gamenight.html` → `host.html`, update internal links. Cosmetic, not tonight.
- RLS policies are permissive for tonight (anyone with code can read/write). Tighten when multi-pod support lands.
- URL cutover: tonight deploys to `*.netlify.app`; future home `mcatoms.com/edhcapsul/` via Netlify redirect or subfolder deploy.
- Variant phone UIs — Kingdoms role reveal, Archenemy scheme privacy, Planechase die roll — after tonight's Commander MVP ships.
