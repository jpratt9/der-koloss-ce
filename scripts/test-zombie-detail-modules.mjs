// The corpse damage detail is split across js/render/ZombieDetail/:
// js/render/ZombieDetail.js keeps its contract header, its scratch objects and
// the three public functions, and the modules behind it build what the variant
// pool hands out. This covers that contract.
//
// - js/render/ZombieDetail.js still exports exactly the three names it exported
//   before the split — and NONE of the 22 that moved. The split must not widen
//   the API: nothing outside this folder should be able to build a garment.
// - Every module in js/render/ZombieDetail/ loads in Node, no name is defined
//   in two of them, and each moved name comes from the module it belongs to.
// - No module in js/render/ZombieDetail/ imports js/render/ZombieDetail.js. One
//   that did would re-enter the measurement it is part of.
// - The imports follow one rule: constants.js imports nothing, materials.js,
//   primitives.js and fitting.js import nothing from the folder, variant.js
//   imports the four leaves, and the entry imports only folder modules. Each
//   specifier spells its file's name as it is on disk: macOS resolves a wrong
//   case, and Vercel does not.
// - THE VARIANT POOL IS ONE POOL. Two corpses of the same model and variant get
//   meshes pointing at the SAME geometry, and a second model gets its own set.
//   A module that ended up with its own WeakMap passes every other check here
//   and every corpse still looks right, while the horde leaks a full damage
//   build per zombie — the exact failure the file's header says the design
//   exists to prevent.
// - A DETACH DISPOSES NOTHING. The rest of the horde is drawing it.
// - THE VARIANTS ARE SEEDED AND DISTINCT. mulberry32 is what makes a horde look
//   varied without twinning, and nothing checked it.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameModule, repoRoot } from './lib/headless-three.mjs';
import { seedRandom } from './lib/headless-map.mjs';
import { loadZombieModels } from './lib/headless-zombies.mjs';
import { assertNoImportOf, importsOf, onDisk } from './lib/split-modules.mjs';

const dir = join(repoRoot, 'js', 'render', 'ZombieDetail');
const files = readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
const entry = await loadGameModule('render', 'ZombieDetail.js');

// ---------------------------------------------------------------------------
// js/render/ZombieDetail.js exports the same names as before the split.
// ---------------------------------------------------------------------------
const PUBLIC = ['attachZombieDetail', 'detachZombieDetail', 'setZombieDetailVisible'];
assert.deepEqual(Object.keys(entry).sort(), [...PUBLIC].sort(),
  'js/render/ZombieDetail.js must export exactly the three names it exported before the split');
for (const name of PUBLIC) assert.equal(typeof entry[name], 'function', `${name} must be a function`);

// ---------------------------------------------------------------------------
// Every module loads, defines its names once, and owns the ones it should.
// ---------------------------------------------------------------------------
const OWNER = {
  VARIANTS: 'constants.js', REFERENCE_SPAN: 'constants.js', TUNIC_CLEAR: 'constants.js',
  SKIRT_CLEAR: 'constants.js', RAG_CLEAR: 'constants.js', HEAD_WIDTH: 'constants.js',
  mulberry32: 'materials.js', materials: 'materials.js',
  stripGeo: 'primitives.js', garmentGeo: 'primitives.js', placed: 'primitives.js',
  oriented: 'primitives.js', mergeOne: 'primitives.js',
  X_AXIS: 'fitting.js', Y_AXIS: 'fitting.js', measureSkin: 'fitting.js', farthestHit: 'fitting.js',
  centreOf: 'fitting.js', bodyProfile: 'fitting.js', reachAt: 'fitting.js', fitToBody: 'fitting.js',
  fittedFor: 'variant.js',
};
const definedIn = new Map();
for (const file of files) {
  for (const name of Object.keys(await loadGameModule('render', 'ZombieDetail', file))) {
    assert.equal(definedIn.has(name), false, `${name} is defined in both ${definedIn.get(name)} and ${file}`);
    definedIn.set(name, file);
  }
}
for (const [name, file] of Object.entries(OWNER)) {
  assert.equal(definedIn.get(name), file, `${name} must be defined in ${file}`);
}
assert.equal(definedIn.size, Object.keys(OWNER).length,
  `js/render/ZombieDetail/ must export exactly the ${Object.keys(OWNER).length} names that moved, `
  + `got ${[...definedIn.keys()].sort().join(', ')}`);
// The builder's internals and the region table have one reader each and stay in.
for (const name of ['buildVariant', 'armFrame', 'headFrame', 'REGION_OF']) {
  assert.equal(definedIn.has(name), false, `${name} has no reader outside its module and must stay private`);
}
// None of the 22 may reach the entry: a caller that could build a garment could
// build one per corpse, which is what the pool exists to stop.
for (const name of Object.keys(OWNER)) {
  assert.equal(name in entry, false, `${name} was private before the split and must not become part of the API`);
}

// ---------------------------------------------------------------------------
// No module in js/render/ZombieDetail/ imports js/render/ZombieDetail.js.
// ---------------------------------------------------------------------------
const specifiers = assertNoImportOf('render/ZombieDetail.js', 'render/ZombieDetail', files);

// ---------------------------------------------------------------------------
// The imports follow one rule.
// ---------------------------------------------------------------------------
const ALLOWED = {
  'constants.js': [],
  'materials.js': ['../CreatureShading.js'],
  'primitives.js': ['../../../vendor/utils/BufferGeometryUtils.js'],
  'fitting.js': [],
  'variant.js': ['../../../vendor/utils/BufferGeometryUtils.js', './constants.js', './materials.js',
    './primitives.js', './fitting.js'],
};
const FOLDER = files.map((f) => `./ZombieDetail/${f}`);
/** One message per import that breaks the rule, given the entry's specifiers and each module's. */
function ruleBreaks(entryImports, moduleImports) {
  return [
    ...entryImports.filter((spec) => !FOLDER.includes(spec))
      .map((spec) => `js/render/ZombieDetail.js imports ${spec}, which is not a module in js/render/ZombieDetail/`),
    ...[...moduleImports].flatMap(([file, specs]) => specs
      .filter((spec) => !(ALLOWED[file] ?? []).includes(spec))
      .map((spec) => `js/render/ZombieDetail/${file} imports ${spec}`)),
  ];
}
const moduleImports = new Map(files.map((file) => [file, importsOf(join(dir, file))]));
const entryImports = [...new Set(importsOf(join(repoRoot, 'js', 'render', 'ZombieDetail.js')))];
assert.deepEqual(ruleBreaks(entryImports, moduleImports), [],
  'constants.js and fitting.js must import nothing but three, variant.js only the four leaves, '
  + 'and js/render/ZombieDetail.js only modules in the folder');
assert.deepEqual(ruleBreaks(entryImports, new Map([...moduleImports, ['fitting.js', ['./variant.js']]])),
  ['js/render/ZombieDetail/fitting.js imports ./variant.js'],
  'a fitting.js that imports variant.js must be rejected');

const entryPath = join(repoRoot, 'js', 'render', 'ZombieDetail.js');
for (const spec of entryImports) {
  assert.ok(onDisk(entryPath, spec), `js/render/ZombieDetail.js imports ${spec}, which is not on disk with that case`);
}
for (const [file, specs] of moduleImports) {
  for (const spec of specs) {
    assert.ok(onDisk(join(dir, file), spec), `js/render/ZombieDetail/${file} imports ${spec}, which is not on disk with that case`);
  }
}
assert.equal(onDisk(entryPath, './ZombieDetail/Constants.js'), false, 'a miscased specifier must be rejected');

// ---------------------------------------------------------------------------
// The variant pool is one pool.
// ---------------------------------------------------------------------------
seedRandom(0x0d37a11);
await loadZombieModels();
const { ZombieVisual } = await loadGameModule('zombies.js');
const { VARIANTS } = await loadGameModule('render', 'ZombieDetail', 'constants.js');
const { attachZombieDetail, detachZombieDetail, setZombieDetailVisible } = entry;

/** The geometries a fresh corpse of `model` gets for `variant`, in order. */
function geometriesOf(model, variant) {
  const meshes = attachZombieDetail(new ZombieVisual(model), variant);
  assert.ok(meshes.length, `model ${model} variant ${variant} must attach something`);
  return meshes.map((m) => m.geometry);
}
const same = (a, b) => a.length === b.length && a.every((g, i) => g === b[i]);

for (const model of [0, 1]) {
  for (let v = 0; v < VARIANTS; v++) {
    assert.ok(same(geometriesOf(model, v), geometriesOf(model, v)),
      `model ${model} variant ${v} rebuilt its geometry for a second corpse: the pool must be shared, `
      + 'or a horde leaks a full damage build per zombie');
  }
}
// The two models must NOT share: the pool is keyed on the visual's source, and
// one keyed wrongly would hand the Chubby the Basic's build and still pass above.
for (let v = 0; v < VARIANTS; v++) {
  const basic = geometriesOf(0, v);
  const chubby = geometriesOf(1, v);
  assert.equal(basic.filter((g) => chubby.includes(g)).length, 0,
    `the two models share geometry on variant ${v}: they are measured separately and must be pooled separately`);
}
// The index wraps, so a caller cannot fall off the pool.
assert.ok(same(geometriesOf(0, 0), geometriesOf(0, VARIANTS)), 'the variant index must wrap');
assert.ok(same(geometriesOf(0, VARIANTS - 1), geometriesOf(0, -1)), 'a negative variant index must wrap');

// ---------------------------------------------------------------------------
// The variants are seeded and distinct.
// ---------------------------------------------------------------------------
/** A hash of what a build actually contains, not of the objects holding it. */
function contentOf(geos) {
  const h = createHash('sha256');
  for (const g of geos) {
    const p = g.attributes.position;
    h.update(String(p.count));
    for (let i = 0; i < p.array.length; i++) h.update(p.array[i].toFixed(6));
  }
  return h.digest('hex');
}
// Identity is the wrong test here: buildVariant makes fresh geometry every call,
// so a builder that ignored its seed would still return VARIANTS distinct
// objects holding VARIANTS identical builds.
const builds = Array.from({ length: VARIANTS }, (_, v) => contentOf(geometriesOf(0, v)));
const twins = [];
for (let a = 0; a < VARIANTS; a++) {
  for (let b = a + 1; b < VARIANTS; b++) if (builds[a] === builds[b]) twins.push(`${a}/${b}`);
}
assert.deepEqual(twins, [], `variants ${twins.join(', ')} are the same build: mulberry32 is what keeps a horde `
  + 'from twinning');

// ---------------------------------------------------------------------------
// LOD, and a detach that disposes nothing.
// ---------------------------------------------------------------------------
const meshes = attachZombieDetail(new ZombieVisual(0), 3);
setZombieDetailVisible(meshes, false);
assert.deepEqual(meshes.filter((m) => m.visible), [], 'setZombieDetailVisible(false) must hide every piece');
setZombieDetailVisible(meshes, true);
assert.equal(meshes.filter((m) => m.visible).length, meshes.length, 'and true must bring them all back');
// three's dispose() leaves the attributes in place and only fires an event, so
// listening is the only way to see one. Checking the attributes survived does
// not catch it.
const disposed = [];
for (const m of meshes) {
  m.geometry.addEventListener('dispose', () => disposed.push('geometry'));
  for (const mat of [m.material].flat()) mat.addEventListener('dispose', () => disposed.push('material'));
}
detachZombieDetail(meshes);
assert.deepEqual(meshes.filter((m) => m.parent), [], 'detach must unparent every piece');
assert.deepEqual(disposed, [],
  `detach disposed ${disposed.join(', ')}: every other corpse of that variant is drawing this geometry`);
assert.deepEqual(meshes.filter((m) => !m.geometry?.attributes?.position || !m.material), [],
  'detach must leave every piece whole');
assert.ok(same(geometriesOf(0, 3), meshes.map((m) => m.geometry)),
  'a corpse attached after a detach must still get the pooled build');

console.log(`ZombieDetail modules OK: js/render/ZombieDetail.js exports its ${PUBLIC.length} public names and none `
  + `of the ${definedIn.size} that moved; those come from ${files.length} modules in js/render/ZombieDetail/ `
  + `(${specifiers} relative imports) which never import it; the imports follow the rule (a fitting.js that imports `
  + `variant.js is rejected) and are spelled as on disk; ${VARIANTS} variants on 2 models pool their geometry per `
  + 'model, wrap at both ends, none twins, and a detach disposes nothing.');
