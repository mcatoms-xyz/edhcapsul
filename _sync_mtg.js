#!/usr/bin/env node
// One-off sync script: edhcapsul/data → mcatoms-new/mtg/index.html
// Run from edhcapsul dir: node _sync_mtg.js

const fs = require('fs');
const path = require('path');

const EDHCAPSUL_DATA_DIR = path.resolve(__dirname, 'data');
const MTG_INDEX = path.resolve(__dirname, '../mcatoms-new/mtg/index.html');

// ---- Load edhcapsul data ----
function loadVar(file, varName) {
  const txt = fs.readFileSync(file, 'utf8');
  const re = new RegExp('var\\s+' + varName + '\\s*=\\s*(\\{[\\s\\S]*\\})\\s*;?\\s*$');
  const m = txt.match(re);
  if (!m) throw new Error('parse fail: ' + file + ' / ' + varName);
  return JSON.parse(m[1]);
}

const games = loadVar(path.join(EDHCAPSUL_DATA_DIR, 'games.js'), 'MTG_GAMES').games;
const decks = loadVar(path.join(EDHCAPSUL_DATA_DIR, 'decks.js'), 'MTG_DECKS').decks;

// ---- Backdate Apr 25 games to Apr 24 (Game Night was Friday night) ----
let backdated = 0;
games.forEach(g => {
  if (g.date === '2026-04-25') { g.date = '2026-04-24'; backdated++; }
});
console.log('Backdated', backdated, 'games from 2026-04-25 to 2026-04-24');

// ---- Map decks to /mtg's simplified schema ----
function toMtgDeck(d) {
  return {
    id: d.id,
    owner: d.owner,
    name: d.name,
    commander: d.commander,
    art: d.commanderArt,
    colors: d.colors,
    bracket: d.bracket,
    manaCost: d.commanderManaCost,
    archidektUrl: d.archidektUrl,
    stats: d.stats || { gamesPlayed: 0, wins: 0, winRate: 0 }
  };
}
const mtgDecks = decks.map(toMtgDeck);

// ---- Read /mtg index.html ----
let html = fs.readFileSync(MTG_INDEX, 'utf8');
const before = html.length;

// 1. Replace GAMES_DATA block
const gamesDataStr = JSON.stringify({ games }, null, 2);
const gamesRe = /const\s+GAMES_DATA\s*=\s*\{[\s\S]*?\};/m;
if (!gamesRe.test(html)) throw new Error('GAMES_DATA not found in /mtg/index.html');
html = html.replace(gamesRe, 'const GAMES_DATA = ' + gamesDataStr + ';');

// 2. Replace DECKS_DATA block (preserve minified single-line format)
const decksDataStr = JSON.stringify(mtgDecks);
const decksRe = /const\s+DECKS_DATA\s*=\s*\[[\s\S]*?\];/m;
if (!decksRe.test(html)) throw new Error('DECKS_DATA not found in /mtg/index.html');
html = html.replace(decksRe, 'const DECKS_DATA = ' + decksDataStr + ';');

// 3. Update RECAPS map (add 2026-04-24)
const recapsRe = /const\s+RECAPS\s*=\s*\{[\s\S]*?\};/m;
const recapsMatch = html.match(recapsRe);
if (!recapsMatch) throw new Error('RECAPS not found');
const newRecaps = `const RECAPS = {
  "2026-03-28": "recaps/2026-03-28.html",
  "2026-04-11": "recaps/2026-04-11.html",
  "2026-04-24": "recaps/2026-04-24.html"
};`;
html = html.replace(recapsRe, newRecaps);

// 4. Update NIGHT_NAMES map (add 2026-04-24 → Kingslayers)
const nightNamesRe = /const\s+NIGHT_NAMES\s*=\s*\{[\s\S]*?\};/m;
const nightNamesMatch = html.match(nightNamesRe);
if (!nightNamesMatch) throw new Error('NIGHT_NAMES not found');
// Try to preserve existing entries
const existing = nightNamesMatch[0];
// Inject the new entry before the closing brace
const newNightNames = existing.replace(/\s*\};\s*$/, ',\n  "2026-04-24": { num: 3, name: "Kingslayers" }\n};');
html = html.replace(nightNamesRe, newNightNames);

fs.writeFileSync(MTG_INDEX, html);
console.log('Wrote', MTG_INDEX, '|', html.length, 'bytes (was', before + ')');
console.log('Games in /mtg:', games.length);
console.log('Decks in /mtg:', mtgDecks.length);
console.log('');
console.log('Now backdating 4 games in edhcapsul/data/games.js (source of truth)...');

// Also backdate in source (edhcapsul games.js)
const gamesFilePath = path.join(EDHCAPSUL_DATA_DIR, 'games.js');
let gamesTxt = fs.readFileSync(gamesFilePath, 'utf8');
const replacements = (gamesTxt.match(/"date"\s*:\s*"2026-04-25"/g) || []).length;
gamesTxt = gamesTxt.replace(/"date"\s*:\s*"2026-04-25"/g, '"date": "2026-04-24"');
fs.writeFileSync(gamesFilePath, gamesTxt);
console.log('Replaced', replacements, '"2026-04-25" date strings in games.js');
