// The soldiers' gear is split across js/render/SoldierGear/:
// js/render/SoldierGear.js keeps the geometry pool and the three public
// attach/LOD/detach functions, re-exports the constants and the palettes, and
// builds a wardrobe out of the modules behind it. This covers that contract.
//
// - js/render/SoldierGear.js still exports exactly the 10 names it exported
//   before the split, so js/player/atlas.js, soldier-pose.js and soldier.js do
//   not change.
// - Every module in js/render/SoldierGear/ loads in Node, no name is defined in
//   two of them, and each re-exported name comes from the module that defines it.
// - No module in js/render/SoldierGear/ imports js/render/SoldierGear.js.
// - The imports follow one rule: constants.js and looks.js import nothing at
//   all, materials.js and kit.js import nothing from the folder, wardrobe.js
//   imports only ./constants.js and ./kit.js, and the entry imports only
//   modules in the folder. Each specifier spells its file's name as it is on
//   disk: macOS resolves a wrong case, and Vercel does not.
// - THE TWO CACHES STAY ONE CACHE EACH. `_pool` holds one wardrobe per persona
//   for the life of the process and `_matSets` one material set, so a second
//   avatar of a persona gets Meshes pointing at geometry that already exists. A
//   module that ended up with a cache of its own would pass every other check
//   here and every avatar would still look right — four players would just
//   allocate four wardrobes instead of one, which is the thing the file's
//   header promises does not happen.
// - readSoldierGearSource() hands validate-remote-avatar.mjs' twelve text pins
//   every one of the six files.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameModule, repoRoot } from './lib/headless-three.mjs';
// headless-map.mjs installs the browser globals GLTFLoader needs (ProgressEvent
// among them), so it has to be imported before the zombie models are parsed.
import { seedRandom } from './lib/headless-map.mjs';
import { loadZombieModels } from './lib/headless-zombies.mjs';
import { readSoldierGearSource } from './lib/game-source.mjs';
import { assertNoImportOf, assertSourceHolds, importsOf, onDisk } from './lib/split-modules.mjs';

const dir = join(repoRoot, 'js', 'render', 'SoldierGear');
const files = readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
const entry = await loadGameModule('render', 'SoldierGear.js');

// ---------------------------------------------------------------------------
// js/render/SoldierGear.js exports the same names as before the split.
// ---------------------------------------------------------------------------
const NUMBERS = ['HEAD_SCALE', 'HAND_SCALE', 'FOOT_SCALE'];
const TABLES = ['HEAD_SHAPE', 'LIMB_SHAPE', 'SPINE_FIX', 'SOLDIER_LOOKS'];
const FUNCTIONS = ['attachSoldierGear', 'setSoldierGearLOD', 'detachSoldierGear'];
assert.deepEqual(Object.keys(entry).sort(), [...NUMBERS, ...TABLES, ...FUNCTIONS].sort(),
  'js/render/SoldierGear.js must export exactly the names it exported before the split');
for (const name of NUMBERS) assert.equal(typeof entry[name], 'number', `${name} must be a number`);
for (const name of TABLES) assert.equal(typeof entry[name], 'object', `${name} must be a table`);
for (const name of FUNCTIONS) assert.equal(typeof entry[name], 'function', `${name} must be a function`);
assert.equal(entry.SOLDIER_LOOKS.length, 4, 'there are four playable marines');

// ---------------------------------------------------------------------------
// Every module loads, defines its names once, and the entry forwards them.
// ---------------------------------------------------------------------------
const definedIn = new Map();
for (const file of files) {
  for (const [name, value] of Object.entries(await loadGameModule('render', 'SoldierGear', file))) {
    assert.equal(definedIn.has(name), false, `${name} is defined in both ${definedIn.get(name)} and ${file}`);
    definedIn.set(name, file);
    // The entry forwards the public names and keeps the rest private.
    if (name in entry) {
      assert.ok(entry[name] === value, `js/render/SoldierGear.js must re-export ${name} from js/render/SoldierGear/${file}`);
    }
  }
}
for (const name of [...NUMBERS, ...TABLES]) {
  assert.ok(definedIn.has(name), `${name} must be defined in a module in js/render/SoldierGear/, not in the entry`);
}
for (const name of FUNCTIONS) {
  assert.equal(definedIn.has(name), false, `${name} is the public API and must stay in js/render/SoldierGear.js`);
}

// ---------------------------------------------------------------------------
// No module in js/render/SoldierGear/ imports js/render/SoldierGear.js.
// ---------------------------------------------------------------------------
const specifiers = assertNoImportOf('render/SoldierGear.js', 'render/SoldierGear', files);

// ---------------------------------------------------------------------------
// The imports follow one rule.
// ---------------------------------------------------------------------------
const ALLOWED = {
  'constants.js': [], 'looks.js': [], 'materials.js': [],
  'kit.js': ['../../../vendor/utils/BufferGeometryUtils.js'],
  'wardrobe.js': ['./constants.js', './kit.js'],
};
/** One message per import that breaks the rule, given the entry's specifiers and each module's. */
function ruleBreaks(entryImports, moduleImports) {
  const modules = [...moduleImports.keys()].map((file) => `./SoldierGear/${file}`);
  return [
    ...entryImports.filter((spec) => !modules.includes(spec))
      .map((spec) => `js/render/SoldierGear.js imports ${spec}, which is not a module in js/render/SoldierGear/`),
    ...[...moduleImports].flatMap(([file, specs]) => specs
      .filter((spec) => !(ALLOWED[file] ?? []).includes(spec))
      .map((spec) => `js/render/SoldierGear/${file} imports ${spec}`)),
  ];
}
const moduleImports = new Map(files.map((file) => [file, importsOf(join(dir, file))]));
// The entry both imports from and re-exports js/render/SoldierGear/looks.js, and
// importsOf() matches the `export … from` side too, so that path is listed
// twice. Dedupe, so the rule reads the set of modules and not the syntax.
const entryImports = [...new Set(importsOf(join(repoRoot, 'js', 'render', 'SoldierGear.js')))];
assert.deepEqual(ruleBreaks(entryImports, moduleImports), [],
  'constants.js and looks.js must import nothing, wardrobe.js only ./constants.js and ./kit.js, '
  + 'and js/render/SoldierGear.js only modules in the folder');
assert.deepEqual(ruleBreaks(entryImports, new Map([...moduleImports, ['constants.js', ['./kit.js']]])),
  ['js/render/SoldierGear/constants.js imports ./kit.js'], 'a constants.js that imports kit.js must be rejected');

const entryPath = join(repoRoot, 'js', 'render', 'SoldierGear.js');
for (const spec of entryImports) {
  assert.ok(onDisk(entryPath, spec), `js/render/SoldierGear.js imports ${spec}, which is not on disk with that case`);
}
for (const [file, specs] of moduleImports) {
  for (const spec of specs) {
    assert.ok(onDisk(join(dir, file), spec), `js/render/SoldierGear/${file} imports ${spec}, which is not on disk with that case`);
  }
}
assert.equal(onDisk(entryPath, './SoldierGear/Looks.js'), false, 'a miscased specifier must be rejected');

// ---------------------------------------------------------------------------
// The two caches stay one cache each.
// ---------------------------------------------------------------------------
await loadZombieModels();
const { SoldierVisual } = await loadGameModule('player.js');
seedRandom(0x501d1e5);

/** bone -> [geometry, materials[]] for one freshly built avatar of `variant`. */
function gearOf(variant) {
  const v = new SoldierVisual(variant);
  assert.ok(v.gear?.byBone?.size, `persona ${variant} must be dressed`);
  // A multi-material mesh gets a fresh ARRAY every time it is built; what is
  // pooled is the materials inside it, so compare those and not the wrapper.
  return new Map([...v.gear.byBone].map(([bone, mesh]) => [bone, [mesh.geometry, [mesh.material].flat()]]));
}
/** Whether two material lists are the same objects in the same order. */
const sameMats = (a, b) => a.length === b.length && a.every((m, i) => m === b[i]);
for (const variant of [0, 1, 2, 3]) {
  const first = gearOf(variant);
  const second = gearOf(variant);
  assert.deepEqual([...second.keys()].sort(), [...first.keys()].sort(),
    `two avatars of persona ${variant} must wear the same bones`);
  const rebuilt = [...first].filter(([bone, [geo]]) => second.get(bone)[0] !== geo).map(([bone]) => bone);
  assert.deepEqual(rebuilt, [], `persona ${variant} rebuilt geometry for ${rebuilt.join(', ')}: _pool must hand `
    + 'the second avatar the wardrobe it already built');
  const remade = [...first].filter(([bone, [, mats]]) => !sameMats(mats, second.get(bone)[1])).map(([bone]) => bone);
  assert.deepEqual(remade, [], `persona ${variant} remade materials for ${remade.join(', ')}: _matSets must hand `
    + 'the second avatar the set it already built');
}
// Different personas must NOT share: the pool is keyed on look.id, and a pool
// that handed every persona the same wardrobe would pass the checks above.
const dempsey = gearOf(0);
const nikolai = gearOf(1);
const shared = [...dempsey].filter(([bone, [geo]]) => nikolai.get(bone)?.[0] === geo).map(([bone]) => bone);
assert.deepEqual(shared, [], `dempsey and nikolai share geometry on ${shared.join(', ')}: the pool is keyed per persona`);

// Detach keeps everything alive, because it is shared with the rest of the squad.
const spare = new SoldierVisual(0);
const handle = spare.gear;
entry.detachSoldierGear(handle);
assert.deepEqual(handle.meshes.filter((m) => m.parent), [], 'detach must unparent every gear mesh');
assert.deepEqual(handle.meshes.filter((m) => !m.geometry?.attributes?.position || !m.material), [],
  'detach must NOT dispose: the geometry and materials belong to every other avatar of that persona');
assert.ok([...gearOf(0)].every(([bone, [geo]]) => geo === dempsey.get(bone)[0]),
  'a soldier built after a detach must still get the pooled wardrobe');

// ---------------------------------------------------------------------------
// readSoldierGearSource() holds every file.
// ---------------------------------------------------------------------------
assertSourceHolds(readSoldierGearSource(), 'readSoldierGearSource()',
  ['render/SoldierGear.js', ...files.map((f) => `render/SoldierGear/${f}`)]);

const forwarded = [...definedIn.keys()].filter((n) => n in entry).length;
console.log(`SoldierGear modules OK: js/render/SoldierGear.js exports its ${Object.keys(entry).length} names — `
  + `${forwarded} forwarded from ${files.length} modules in js/render/SoldierGear/ (${definedIn.size} names, `
  + `${specifiers} relative imports) which never import it, ${FUNCTIONS.length} kept in the entry; the imports `
  + 'follow the rule (a constants.js that imports kit.js is rejected) and are spelled as on disk; two avatars of '
  + 'each of the four personas share one pooled wardrobe and one material set, no two personas share geometry, '
  + 'and a detach disposes nothing.');
