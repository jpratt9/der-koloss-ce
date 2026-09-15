// The player code is split across js/player/: js/player.js re-exports the names
// every caller imports, and the modules behind it import one another but never
// js/player.js itself. This covers that contract.
//
// - js/player.js still exports exactly the names it did before the split, so
//   no caller has to change.
// - No module in js/player/ imports js/player.js. One that did would put an
//   import cycle through the entry point every caller loads.
// - Every LocalPlayer method in js/player/local-*.js is on
//   LocalPlayer.prototype, and every SoldierVisual method in
//   js/player/soldier-*.js is on SoldierVisual.prototype.
// - readPlayerSource() hands the text checks every player file.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameModule, repoRoot } from './lib/headless-three.mjs';
import { readPlayerSource } from './lib/game-source.mjs';
import { assertMethodFilesInstalled, assertNoImportOf, assertSourceHolds } from './lib/split-modules.mjs';

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
// LocalPlayer's local-*.js files are installed on LocalPlayer.prototype,
// method for method.
// ---------------------------------------------------------------------------
const localFiles = files.filter((f) => /^local-[\w-]+\.js$/.test(f));
assert.ok(localFiles.length >= 1, `expected LocalPlayer's method files in js/player/, found ${localFiles.length}`);
const localMethods = await assertMethodFilesInstalled(entry.LocalPlayer, 'player', localFiles);

// ---------------------------------------------------------------------------
// SoldierVisual's soldier-*.js files are installed on SoldierVisual.prototype,
// method for method.
// ---------------------------------------------------------------------------
const soldierFiles = files.filter((f) => /^soldier-[\w-]+\.js$/.test(f));
assert.ok(soldierFiles.length >= 2, `expected SoldierVisual's method files in js/player/, found ${soldierFiles.length}`);
const soldierMethods = await assertMethodFilesInstalled(entry.SoldierVisual, 'player', soldierFiles);

// ---------------------------------------------------------------------------
// readPlayerSource() holds every player file.
// ---------------------------------------------------------------------------
assertSourceHolds(readPlayerSource(), 'readPlayerSource()', ['player.js', ...files.map((f) => `player/${f}`)]);

console.log(`Player modules OK: js/player.js exports ${Object.keys(entry).length} names; `
  + `${files.length} modules in js/player/ (${specifiers} relative imports) never import it; `
  + `${localMethods.size} LocalPlayer methods installed from ${localFiles.join(', ')}; `
  + `${soldierMethods.size} SoldierVisual methods from ${soldierFiles.join(', ')}; readPlayerSource() holds them all.`);
