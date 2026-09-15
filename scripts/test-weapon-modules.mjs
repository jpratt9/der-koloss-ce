// The weapons are split across js/weapons/: js/weapons.js re-exports the names
// every caller imports, and the modules behind it import one another but never
// js/weapons.js itself. This covers that contract.
//
// - js/weapons.js still exports exactly the names it did before the split, so
//   no caller has to change.
// - No module in js/weapons/ imports js/weapons.js. One that did would put an
//   import cycle through the entry point every caller loads.
// - Every weapon has exactly one view-model builder in js/weapons/models/.
// - Every WeaponRig method in js/weapons/rig-*.js is on WeaponRig.prototype.
// - readWeaponsSource() hands the text checks every weapons file.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameModule, repoRoot } from './lib/headless-three.mjs';
import { readWeaponsSource } from './lib/game-source.mjs';
import { assertMethodFilesInstalled, assertNoImportOf, assertSourceHolds } from './lib/split-modules.mjs';

const weaponsDir = join(repoRoot, 'js', 'weapons');
const files = readdirSync(weaponsDir, { recursive: true }).filter((f) => f.endsWith('.js')).sort();
const entry = await loadGameModule('weapons.js');

// ---------------------------------------------------------------------------
// js/weapons.js exports the same names as before the split.
// ---------------------------------------------------------------------------
assert.deepEqual(Object.keys(entry).sort(), [
  'BOX_POOL', 'CASING_BY_SFX', 'KNUCKLE_DUR', 'WEAPONS', 'WeaponRig', 'buildDisplayWeapon', 'buildMonkey',
  'buildPapDisplayWeapon', 'buildPerkBottle', 'buildViewmodel', 'disposePapDisplayWeapon', 'getStats',
  'poseKnuckleCrack', 'updatePapDisplayWeapon',
].sort(), 'js/weapons.js must export exactly the names callers imported from it before the split');

// ---------------------------------------------------------------------------
// No module in js/weapons/ imports js/weapons.js.
// ---------------------------------------------------------------------------
const specifiers = assertNoImportOf('weapons.js', 'weapons', files);

// ---------------------------------------------------------------------------
// Every weapon has exactly one view-model builder. buildViewmodel() merges the
// class files' tables into one, so an id in two tables would silently lose one
// builder, and an id in none would throw the first time the weapon is built.
// ---------------------------------------------------------------------------
const builderFile = new Map();
const modelFiles = files.filter((f) => f.startsWith('models/') && f !== 'models/kit.js');
for (const file of modelFiles) {
  const tables = Object.values(await loadGameModule('weapons', file)).filter((v) => v && typeof v === 'object');
  assert.equal(tables.length, 1, `js/weapons/${file} must export exactly one table of view-model builders`);
  for (const [id, build] of Object.entries(tables[0])) {
    assert.equal(typeof build, 'function', `js/weapons/${file}: ${id} is not a builder`);
    assert.equal(builderFile.has(id), false, `${id} has a view-model builder in both ${builderFile.get(id)} and ${file}`);
    builderFile.set(id, file);
  }
}
assert.deepEqual([...builderFile.keys()].sort(), Object.keys(entry.WEAPONS).sort(),
  'the view-model builders must cover exactly the WEAPONS ids');

// ---------------------------------------------------------------------------
// WeaponRig's rig-*.js files are installed on WeaponRig.prototype, method for
// method. A file left out of the install list would leave its methods
// undefined until the first call, mid-match.
// ---------------------------------------------------------------------------
const rigFiles = files.filter((f) => /^rig-[\w-]+\.js$/.test(f));
assert.ok(rigFiles.length >= 3, `expected WeaponRig's method files in js/weapons/, found ${rigFiles.length}`);
const rigMethodFile = await assertMethodFilesInstalled(entry.WeaponRig, 'weapons', rigFiles);

// ---------------------------------------------------------------------------
// readWeaponsSource() holds every weapons file.
// ---------------------------------------------------------------------------
assertSourceHolds(readWeaponsSource(), 'readWeaponsSource()', ['weapons.js', ...files.map((f) => `weapons/${f}`)]);

console.log(`Weapon modules OK: js/weapons.js exports ${Object.keys(entry).length} names; `
  + `${files.length} modules in js/weapons/ (${specifiers} relative imports) never import it; `
  + `${builderFile.size} weapons have one builder each across ${modelFiles.length} class files; `
  + `${rigMethodFile.size} WeaponRig methods from ${rigFiles.length} files installed; readWeaponsSource() holds them all.`);
