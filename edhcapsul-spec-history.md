# MTGCapsul — Product Spec

**Status**: Specced, ready for build
**Type**: MyCapsul Satellite (Capsul pattern)
**Created**: Mar 19, 2026 (Session 38)
**Target V1**: Game Night, Mar 27, 2026

---

## What It Is

MTGCapsul is a Commander game night command center — collection tracker, game logger, pod analytics, and price monitor built on top of Archidekt and Scryfall APIs. It's the first **social capsul** in the MyCapsul ecosystem.

## Why It Matters

- First capsul designed for **multiple users** — the pod (Adam, Bryan, Shake, Waid)
- Proves the capsul-as-modular-app pattern: standalone HTML + JSON data layer, portable, could graduate to a real app
- The hook that gets Adam's friends into MyCapsul ("wait, what is this?")
- Fills a gap neither Archidekt nor Scryfall covers: game night tracking, pod analytics, cross-collection insights

## Architecture

### Capsul Pattern (same as FinCapsul)
```
projects/mtgcapsul/
├── mtgcapsul.html              # Main UI — single-file HTML/CSS/JS
├── mtgcapsul-spec.md           # This file
├── data/
│   ├── pod.json                # Player profiles
│   ├── decks.json              # All decks (synced from Archidekt + enriched via Scryfall)
│   ├── games.json              # Game log (manually entered)
│   ├── achievements.json       # Unlocked achievements per player
│   ├── seasons.json            # Season definitions + standings
│   ├── watchlist.json          # Price watchlist (The Vault)
│   └── cache/
│       └── scryfall-prices.json # Cached Scryfall pricing (refreshed on load, TTL 24hr)
└── assets/
    └── deck-photos/            # Adam's physical deck photos (symlinked from Personal/MTG/)
```

### Data Model

#### Players (pod.json)
```json
{
  "players": [
    {
      "id": "adam",
      "name": "Adam",
      "nickname": "McAtoms",
      "archidekt": "McAtoms",
      "archidektUrl": "https://archidekt.com/u/McAtoms",
      "avatar": null,
      "elo": 1200,
      "joinedDate": "2026-03-27"
    }
  ]
}
```

#### Decks (decks.json)
```json
{
  "decks": [
    {
      "id": "adam-gitrog",
      "archidektId": 13090656,
      "owner": "adam",
      "name": "Gitrog",
      "commander": "The Gitrog Monster",
      "commanderArt": "https://cards.scryfall.io/art_crop/...",
      "colors": ["B", "G"],
      "bracket": 2,
      "cardCount": 100,
      "estimatedValue": null,
      "tags": [],
      "retired": false,
      "photoPath": "Personal/MTG/Gitrog-Golgari/",
      "lastPlayed": null,
      "stats": {
        "gamesPlayed": 0,
        "wins": 0,
        "winRate": 0
      }
    }
  ]
}
```

#### Games (games.json)
```json
{
  "games": [
    {
      "id": "2026-03-27-001",
      "date": "2026-03-27",
      "gameNight": true,
      "players": [
        { "playerId": "adam", "deckId": "adam-gitrog" },
        { "playerId": "bryan", "deckId": "bryan-muldrotha" },
        { "playerId": "shake", "deckId": "shake-oloro" },
        { "playerId": "waid", "deckId": "waid-unknown" }
      ],
      "winner": "adam",
      "winningDeck": "adam-gitrog",
      "salt": 3,
      "note": "Turn 6 Gitrog combo, table couldn't answer it",
      "duration": null
    }
  ]
}
```

#### Achievements (achievements.json)
```json
{
  "definitions": [
    {
      "id": "first-blood",
      "name": "First Blood",
      "description": "Win your first game",
      "icon": "🗡️",
      "condition": "player.stats.totalWins >= 1"
    },
    {
      "id": "diversified",
      "name": "Diversified Portfolio",
      "description": "Win with 5 different decks",
      "icon": "📊",
      "condition": "player.stats.uniqueDeckWins >= 5"
    },
    {
      "id": "kingslayer",
      "name": "Kingslayer",
      "description": "Beat the #1 ranked player",
      "icon": "👑",
      "condition": "special"
    },
    {
      "id": "salt-mine",
      "name": "Salt Mine",
      "description": "Play 3 games rated 5 salt",
      "icon": "🧂",
      "condition": "special"
    },
    {
      "id": "iron-throne",
      "name": "Iron Throne",
      "description": "Win 3 games in a row",
      "icon": "🪑",
      "condition": "player.stats.currentStreak >= 3"
    },
    {
      "id": "jank-tank",
      "name": "Jank Tank",
      "description": "Win with a deck valued under $50",
      "icon": "🗑️",
      "condition": "special"
    },
    {
      "id": "one-more-game",
      "name": "One More Game",
      "description": "Win the last game of the night 3 times",
      "icon": "🌙",
      "condition": "special"
    },
    {
      "id": "nemesis",
      "name": "Nemesis",
      "description": "Beat the same player 5 times in a row",
      "icon": "💀",
      "condition": "special"
    }
  ],
  "unlocked": {}
}
```

### API Integration

#### Archidekt (deck data)
- **Endpoint**: `https://archidekt.com/api/decks/{id}/` (full deck with cards)
- **Endpoint**: `https://archidekt.com/api/decks/{id}/small/` (metadata only)
- **Auth**: None required
- **Rate limit**: Reasonable (no documented limit, be polite)
- **Data**: Deck name, cards with oracle IDs, categories, bracket, colors, owner
- **Sync strategy**: Manual refresh button. Pull all decks for all pod members, diff against local, update.

##### Pod Deck IDs
**Adam (McAtoms)**: 12978554, 12978600, 13018574, 13018638, 13018656, 13018680, 13018710, 13018747, 13018834, 13081907, 13081945, 13089995, 13090578, 13090656, 13090876
**Bryan (BPWyndon)**: 11450004, 11450530, 11450776, 11450958, 11451029, 11451139, 11451227, 12635696, 12916360, 14274824, 15064684, 17494527, 17947350, 19347963, 19655938
**Shake (shakenbake1738)**: 10874173, 11038757, 11039358, 11040318, 11040618, 11040988, 11041312, 11689449
**Waid (TheToasterCzar)**: (no public decks — manual entry)

#### Scryfall (pricing + art + oracle)
- **Endpoint**: `https://api.scryfall.com/cards/named?exact={name}` (single card)
- **Endpoint**: `https://api.scryfall.com/cards/{scryfallId}` (by ID)
- **Bulk**: `https://api.scryfall.com/bulk-data` (full database download for offline)
- **Auth**: None required
- **Rate limit**: 10 requests/second (be polite, add 100ms delay)
- **Data**: USD/EUR/foil pricing, art_crop images, color identity, CMC, EDHREC rank, oracle text, legality
- **Cache strategy**: localStorage with 24hr TTL per card. Bulk refresh on "Sync Prices" button.

### Design System

Inherits MyCapsul/Atomia Command DNA:
- **Fonts**: Museo Slab 500 (headings), Museo Sans 500 (body)
- **Palette**: Extend tri-color with MTG identity colors:
  - White (W): #F9FAF4
  - Blue (U): #0E68AB
  - Black (B): #150B00
  - Red (R): #D3202A
  - Green (G): #00733E
  - Colorless: #CAC5C0
  - Gold/Multi: #C9A849
- **Cards**: Glassmorphic, consistent with Atomia Command
- **Background**: Dark (#000), card art hero images, subtle particle effects
- **Nav**: "← MyCapsul" back link. Tab structure TBD.

### Persistence

- **Primary**: localStorage (same pattern as Atomia Command)
- **Prefix**: `mtg_` for all keys
- **Export**: "Sync to Rocky" button exports all `mtg_` keys to JSON file
- **Future**: If this graduates to a shared app, swap localStorage for a real backend

---

## Feature Backlog (Prioritized)

### LAYER 1 — Foundation (must exist first)
- [ ] Data model implementation (pod.json, decks.json, games.json)
- [ ] Archidekt sync — pull all 38 decks for all pod members
- [ ] Scryfall integration — commander art + pricing per deck
- [ ] Deck Registry view — home screen grid of all decks, grouped by player
- [ ] Player Profiles — name, avatar, deck count, stats shell

### LAYER 2 — Engine (creates the data)
- [ ] Game Logger — quick input: date, players, decks, winner, salt (1-5), note
- [ ] Game Night Summary — tonight's results card

### LAYER 3 — The Show (the wow factor)
- [ ] Pregame Matchup Preview — select 4 decks, see commander art side-by-side, color wheel, brackets, historical matchup data
- [ ] Collection Value — per-deck and total, powered by Scryfall
- [ ] Pod Power Rankings — ELO system, leaderboard, streaks
- [ ] Rivalry Tracker — head-to-head records (Adam vs Bryan: 3-2)
- [ ] Salt Index — per-game, per-deck, per-player salt leaderboards
- [ ] Meta Report — pod-wide color/strategy analysis
- [ ] Season Mode — quarterly champion, standings, historical archive
- [ ] Achievement System — unlockable badges with conditions
- [ ] Game Night Recap Generator — shareable summary for group chat

### LAYER 4 — Collector Tools
- [ ] The Vault — most valuable cards, price trend sparklines
- [ ] Acquisition Queue — watchlist with price alerts
- [ ] Cross-Deck Card Tracker — shared cards across decks, shortage detection
- [ ] Collection ROI — purchase price vs current market
- [ ] Deck Personality Tags — pet deck, tryhard, jank, retired legend

### LAYER 5 — Game Night Theater
- [ ] Pregame ESPN Mode — full-screen matchup display for the table
- [ ] Live Scoreboard Mode — tablet display, current game, standings
- [ ] Deck Evolution Timeline — card swap history, performance impact
- [ ] Deck Retirement Archive — final stats, hall of fame, eulogy
- [ ] Trade Finder — cross-pod collection overlap
- [ ] Budget Brew Challenge — build competitive under $X

---

## V1 Build Plan (Tonight)

**Goal**: Layer 1 + Layer 2 + Pregame Matchup Preview + Collection Value

**Steps**:
1. Create `data/` directory structure
2. Pull all deck data from Archidekt API → populate decks.json
3. Enrich with Scryfall (commander art, pricing) → update decks.json
4. Build mtgcapsul.html:
   - Deck Registry (home screen — all decks in a grid)
   - Player Profiles (sidebar or header)
   - Game Logger (modal or slide-out)
   - Pregame Matchup Preview (select 4 decks, compare)
   - Collection Value (per-deck, total)
5. Wire up localStorage persistence
6. Test with real data

**Design target**: Open this on a laptop at game night and have Bryan say "what the hell is that."

---

## Key Architectural Insight

**Capsuls are modular standalone apps that dock with MyCapsul.**

MTGCapsul proves the pattern:
- Self-contained HTML + JSON data layer
- Independently useful (friends don't need MyCapsul)
- Social by nature (multi-player data model)
- Portable data (JSON can power a future React Native app, Discord bot, or web app)
- Trojan horse (come for MTG, discover the ecosystem)

If this works, every future capsul follows the same pattern. The data contract is the product.

---

*Spec by Rocky, Mar 19, 2026. Architecture session with Adam.*
