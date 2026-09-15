// The zombies are split across js/zombies/: js/zombies.js re-exports the names
// every caller imports, and the modules behind it import one another but never
// js/zombies.js itself. This covers that contract.
//
// - js/zombies.js still exports exactly the names it did before the split, so
//   no caller has to change.
// - No module in js/zombies/ imports js/zombies.js. One that did would put an
//   import cycle through the entry point every caller loads.
// - readZombiesSource() hands the text checks every zombies file.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameModule, repoRoot } from './lib/headless-three.mjs';
import { readZombiesSource } from './lib/game-source.mjs';
import { assertNoImportOf, assertSourceHolds } from './lib/split-modules.mjs';

const files = readdirSync(join(repoRoot, 'js', 'zombies'), { recursive: true }).filter((f) => f.endsWith('.js')).sort();
const entry = await loadGameModule('zombies.js');

// ---------------------------------------------------------------------------
// js/zombies.js exports the same names as before the split.
// ---------------------------------------------------------------------------
assert.deepEqual(Object.keys(entry).sort(), [
  'ZSTATES', 'ZombieManager', 'ZombieVisual', 'applyHellhoundPose', 'createZombieModel', 'createZombieVisual',
  'isZombieSpawnRoomAllowed', 'measureNeutralBounds', 'measureStandingBounds', 'rayHitZombieBody', 'zombieAimPoint',
  'zombiePoseForState',
].sort(), 'js/zombies.js must export exactly the names callers imported from it before the split');

// ---------------------------------------------------------------------------
// No module in js/zombies/ imports js/zombies.js.
// ---------------------------------------------------------------------------
const specifiers = assertNoImportOf('zombies.js', 'zombies', files);

// ---------------------------------------------------------------------------
// readZombiesSource() holds every zombies file.
// ---------------------------------------------------------------------------
assertSourceHolds(readZombiesSource(), 'readZombiesSource()', ['zombies.js', ...files.map((f) => `zombies/${f}`)]);

console.log(`Zombie modules OK: js/zombies.js exports ${Object.keys(entry).length} names; `
  + `${files.length} modules in js/zombies/ (${specifiers} relative imports) never import it; readZombiesSource() holds them all.`);
