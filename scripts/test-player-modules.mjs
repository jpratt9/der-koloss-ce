// The player code is split across js/player/: js/player.js re-exports the names
// every caller imports, and the modules behind it import one another but never
// js/player.js itself. This covers that contract.
//
// - js/player.js still exports exactly the names it did before the split, so
//   no caller has to change.
// - No module in js/player/ imports js/player.js. One that did would put an
//   import cycle through the entry point every caller loads.
// - readPlayerSource() hands the text checks every player file.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameModule, repoRoot } from './lib/headless-three.mjs';
import { readPlayerSource } from './lib/game-source.mjs';
import { assertNoImportOf, assertSourceHolds } from './lib/split-modules.mjs';

const files = readdirSync(join(repoRoot, 'js', 'player'), { recursive: true }).filter((f) => f.endsWith('.js')).sort();
const entry = await loadGameModule('player.js');

// ---------------------------------------------------------------------------
// js/player.js exports the same names as before the split.
// ---------------------------------------------------------------------------
assert.deepEqual(Object.keys(entry).sort(), ['LocalPlayer', 'RemotePlayer', 'SoldierVisual'],
  'js/player.js must export exactly the names callers imported from it before the split');

// ---------------------------------------------------------------------------
// No module in js/player/ imports js/player.js.
// ---------------------------------------------------------------------------
const specifiers = assertNoImportOf('player.js', 'player', files);

// ---------------------------------------------------------------------------
// readPlayerSource() holds every player file.
// ---------------------------------------------------------------------------
assertSourceHolds(readPlayerSource(), 'readPlayerSource()', ['player.js', ...files.map((f) => `player/${f}`)]);

console.log(`Player modules OK: js/player.js exports ${Object.keys(entry).length} names; `
  + `${files.length} modules in js/player/ (${specifiers} relative imports) never import it; readPlayerSource() holds them all.`);
