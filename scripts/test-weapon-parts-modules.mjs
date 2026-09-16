// The firearm sub-assemblies are split across js/render/WeaponParts/:
// js/render/WeaponParts.js re-exports the names its four modules define, and
// the modules never import it. This covers that contract.
//
// - js/render/WeaponParts.js still exports exactly the 35 names it exported
//   before the split, so none of the 13 files that import it changes.
// - Every module in js/render/WeaponParts/ loads in Node, and the entry
//   re-exports each name one defines. No name is defined in two modules.
// - No module in js/render/WeaponParts/ imports js/render/WeaponParts.js.
// - The imports follow one rule: js/render/WeaponParts.js imports every module
//   in the folder, geometry.js imports nothing from it, and the rest import
//   geometry.js or nothing. So the folder has no cycle. Each specifier spells
//   its file's name as it is on disk: macOS resolves a wrong case, Vercel does
//   not.
// - THE CACHE IS ONE CACHE. `geo()` hands back the same object for the same
//   key, and a geometry reached through muzzles.js is the same object as one
//   reached through geometry.js. A module that declared its own `_geo` would
//   pass every other check here and every weapon would still look right — it
//   would just stop thirty-one weapons sharing a receiver box, doubling GPU
//   memory, and hand the Pack-a-Punch teardown geometries that other weapons
//   are still drawing.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { THREE, loadGameModule, repoRoot } from './lib/headless-three.mjs';
import { assertNoImportOf, importsOf, onDisk } from './lib/split-modules.mjs';

const dir = join(repoRoot, 'js', 'render', 'WeaponParts');
const files = readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
const entry = await loadGameModule('render', 'WeaponParts.js');

// ---------------------------------------------------------------------------
// js/render/WeaponParts.js exports the same names as before the split.
// ---------------------------------------------------------------------------
const NUMBERS = ['NOTCH_DEPTH', 'FRONT_POST_H'];
const FUNCTIONS = [
  'geo', 'bevelBoxGeo', 'plateGeo', 'cylGeo', 'sphereGeo', 'torusGeo', 'ringGeo', 'latheGeo',
  'mesh', 'bx', 'cyl', 'barrel', 'perfShroud', 'flashHider', 'compensator', 'muzzleCone',
  'suppressor', 'frontSight', 'rearNotch', 'rearAperture', 'rearTangent', 'railRearSight',
  'redDot', 'scope', 'ejectionPort', 'triggerGroup', 'magazine', 'rail', 'screw', 'slingLoop',
  'chargingHandle', 'selector', 'bipod',
];
assert.deepEqual(Object.keys(entry).sort(), [...FUNCTIONS, ...NUMBERS].sort(),
  'js/render/WeaponParts.js must export exactly the names it exported before the split');
for (const name of FUNCTIONS) assert.equal(typeof entry[name], 'function', `${name} must be a function`);
for (const name of NUMBERS) assert.equal(typeof entry[name], 'number', `${name} must be a number`);

// ---------------------------------------------------------------------------
// Every module loads in Node, and the entry re-exports each name one defines.
// ---------------------------------------------------------------------------
const definedIn = new Map();
for (const file of files) {
  for (const [name, value] of Object.entries(await loadGameModule('render', 'WeaponParts', file))) {
    assert.equal(definedIn.has(name), false, `${name} is defined in both ${definedIn.get(name)} and ${file}`);
    definedIn.set(name, file);
    assert.ok(entry[name] === value, `js/render/WeaponParts.js must re-export ${name} from js/render/WeaponParts/${file}`);
  }
}
assert.equal(definedIn.size, FUNCTIONS.length + NUMBERS.length,
  'every name the entry exports must be defined in exactly one module in js/render/WeaponParts/');

// ---------------------------------------------------------------------------
// No module in js/render/WeaponParts/ imports js/render/WeaponParts.js.
// ---------------------------------------------------------------------------
const specifiers = assertNoImportOf('render/WeaponParts.js', 'render/WeaponParts', files);

// ---------------------------------------------------------------------------
// The imports follow one rule.
// ---------------------------------------------------------------------------
/** One message per import that breaks the rule, given the entry's specifiers and each module's. */
function ruleBreaks(entryImports, moduleImports) {
  const modules = [...moduleImports.keys()].map((file) => `./WeaponParts/${file}`);
  return [
    ...entryImports.filter((spec) => !modules.includes(spec))
      .map((spec) => `js/render/WeaponParts.js imports ${spec}, which is not a module in js/render/WeaponParts/`),
    ...modules.filter((spec) => !entryImports.includes(spec))
      .map((spec) => `js/render/WeaponParts.js does not import ${spec}`),
    ...[...moduleImports].flatMap(([file, specs]) => specs
      .filter((spec) => file === 'geometry.js' || (spec !== './geometry.js' && spec !== '../WeaponMaterials.js'))
      .map((spec) => `js/render/WeaponParts/${file} imports ${spec}`)),
  ];
}
const moduleImports = new Map(files.map((file) => [file, importsOf(join(dir, file))]));
// The entry only re-exports, but importsOf() matches the `export … from` side
// too, and an entry that both imported and re-exported one module would list it
// twice. Dedupe, so the rule reads the set of modules and not the syntax.
const entryImports = [...new Set(importsOf(join(repoRoot, 'js', 'render', 'WeaponParts.js')))];
assert.deepEqual(ruleBreaks(entryImports, moduleImports), [],
  'geometry.js must import nothing from the folder, the others only ./geometry.js and ../WeaponMaterials.js, '
  + 'and js/render/WeaponParts.js every module');
assert.deepEqual(ruleBreaks(entryImports, new Map([...moduleImports, ['geometry.js', ['./sights.js']]])),
  ['js/render/WeaponParts/geometry.js imports ./sights.js'], 'a geometry.js that imports sights.js must be rejected');

// Each specifier spells its file as it is on disk.
const entryPath = join(repoRoot, 'js', 'render', 'WeaponParts.js');
for (const spec of entryImports) {
  assert.ok(onDisk(entryPath, spec), `js/render/WeaponParts.js imports ${spec}, which is not on disk with that case`);
}
for (const [file, specs] of moduleImports) {
  for (const spec of specs) {
    assert.ok(onDisk(join(dir, file), spec), `js/render/WeaponParts/${file} imports ${spec}, which is not on disk with that case`);
  }
}
assert.equal(onDisk(entryPath, './WeaponParts/Geometry.js'), false, 'a miscased specifier must be rejected');

// ---------------------------------------------------------------------------
// The cache is one cache.
// ---------------------------------------------------------------------------
const { geo, bevelBoxGeo, cylGeo, barrel, perfShroud, triggerGroup, frontSight } = entry;
const MAT = new THREE.MeshStandardMaterial();
const a = geo('test-one-cache', [1, 2, 3], () => new THREE.BufferGeometry());
assert.ok(geo('test-one-cache', [1, 2, 3], () => { throw new Error('geo() rebuilt a cached key'); }) === a,
  'geo() must hand back the cached geometry for a key it has already built');
assert.equal(a.userData.wpShared, true, 'geo() must tag what it caches as wpShared');

const box = bevelBoxGeo(0.04, 0.03, 0.12);
assert.ok(bevelBoxGeo(0.04, 0.03, 0.12) === box, 'bevelBoxGeo must reuse its cached geometry');

// perfShroud is the one builder outside geometry.js that calls geo(). It bakes
// its forty-odd primitives under the key ['shroud', r, len, rows, holes,
// holeW, band, seg] — so asking geometry.js' geo() for that exact key must hand
// back the shroud muzzles.js just built. A muzzles.js with its own _geo passes
// every other check in this file and fails here: its Map would be a second one
// the entry cannot see, and make() would run again.
const shroud = perfShroud(MAT, { r: 0.03, len: 0.4, rows: 4, holes: 8 }).children[0].geometry;
assert.ok(geo('shroud', [0.03, 0.4, 4, 8, 0.42, 0.4, 4], () => {
  throw new Error('js/render/WeaponParts/muzzles.js caches into a Map of its own, not geometry.js\'');
}) === shroud, 'perfShroud must cache into the one shared cache geometry.js owns');

// Two parts built from the same primitive share it across module boundaries:
// the barrel's bore tube (muzzles.js) and a cylinder asked for directly.
const bore = cylGeo(0.007, 0.00602, 0.055, 14, true);
const barrelGroup = barrel(MAT, { r: 0.014, len: 0.4, seg: 18 });
const tubes = [];
barrelGroup.traverse((o) => { if (o.isMesh) tubes.push(o.geometry); });
assert.ok(tubes.some((g) => g === bore),
  'the barrel must build its bore from the SAME cached cylinder geometry.js hands out');

// Every geometry any module caches carries the tag the PaP teardown reads.
const built = [];
for (const part of [triggerGroup(MAT, {}), frontSight(MAT, { aimY: 0.02, z: -0.2 }), barrelGroup]) {
  part.traverse((o) => { if (o.isMesh) built.push(o.geometry); });
}
assert.deepEqual(built.filter((g) => g.userData.wpShared !== true), [],
  'every geometry a part is built from must be tagged wpShared');

console.log(`WeaponParts modules OK: js/render/WeaponParts.js exports its ${FUNCTIONS.length + NUMBERS.length} names, `
  + `all of them from ${files.length} modules in js/render/WeaponParts/ (${specifiers} relative imports), which never `
  + 'import it; the imports follow the rule (a geometry.js that imports sights.js is rejected) and are spelled as on '
  + `disk; and the ${new Set(built).size + 3} geometries built here all come from one cache, tagged wpShared.`);
