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
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadGameModule, repoRoot } from './lib/headless-three.mjs';
import { readWeaponsSource } from './lib/game-source.mjs';

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
const entryPath = join(repoRoot, 'js', 'weapons.js');
let specifiers = 0;
for (const file of files) {
  const path = join(weaponsDir, file);
  for (const [, spec] of readFileSync(path, 'utf8').matchAll(/^\s*(?:import|export)\b[^'"]*?\bfrom\s*'([^']+)'/gm)) {
    if (!spec.startsWith('.')) continue;
    specifiers++;
    assert.notEqual(resolve(dirname(path), spec.replace(/\?.*$/, '')), entryPath,
      `js/weapons/${file} imports js/weapons.js: import from the module that defines the name instead`);
  }
}

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
const rigMethodFile = new Map();
for (const file of rigFiles) {
  const classes = Object.values(await loadGameModule('weapons', file))
    .filter((v) => typeof v === 'function' && Function.prototype.toString.call(v).startsWith('class '));
  assert.equal(classes.length, 1, `js/weapons/${file} must export exactly one class of WeaponRig methods`);
  const names = Object.getOwnPropertyNames(classes[0].prototype).filter((n) => n !== 'constructor');
  assert.ok(names.length, `js/weapons/${file} holds no methods`);
  for (const name of names) {
    assert.equal(rigMethodFile.has(name), false, `WeaponRig.${name} is defined in both ${rigMethodFile.get(name)} and ${file}`);
    rigMethodFile.set(name, file);
    assert.equal(entry.WeaponRig.prototype[name], classes[0].prototype[name],
      `WeaponRig.${name} from js/weapons/${file} is not installed on WeaponRig.prototype`);
  }
}

// ---------------------------------------------------------------------------
// readWeaponsSource() holds every weapons file.
// ---------------------------------------------------------------------------
const source = readWeaponsSource();
for (const file of ['weapons.js', ...files.map((f) => `weapons/${f}`)]) {
  assert.ok(source.includes(readFileSync(join(repoRoot, 'js', file), 'utf8')), `readWeaponsSource() is missing js/${file}`);
}

console.log(`Weapon modules OK: js/weapons.js exports ${Object.keys(entry).length} names; `
  + `${files.length} modules in js/weapons/ (${specifiers} relative imports) never import it; `
  + `${builderFile.size} weapons have one builder each across ${modelFiles.length} class files; `
  + `${rigMethodFile.size} WeaponRig methods from ${rigFiles.length} files installed; readWeaponsSource() holds them all.`);
