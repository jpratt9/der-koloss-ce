// The weapon material library is split across js/render/WeaponMaterials/:
// js/render/WeaponMaterials.js keeps the lazy `_lib` cache, the `WM` proxy and
// `matSet`, and the modules behind it generate what the proxy fills itself
// with. This covers that contract.
//
// - js/render/WeaponMaterials.js still exports exactly WM and matSet, and NOT
//   buildLibrary, so none of the 18 files that import it changes.
// - Every module in js/render/WeaponMaterials/ loads in Node, no name is
//   defined in two of them, and buildLibrary comes from library.js.
// - No module in js/render/WeaponMaterials/ imports js/render/WeaponMaterials.js.
//   One that did would trigger the proxy from inside the build it is part of.
// - The imports follow one rule: canvas.js imports nothing from the folder,
//   surfaces.js only ./canvas.js, library.js only ./surfaces.js, and the entry
//   only ./WeaponMaterials/library.js. Each specifier spells its file's name as
//   it is on disk: macOS resolves a wrong case, and Vercel does not.
// - THE LIBRARY IS ONE LIBRARY. Reading a key twice hands back the same object,
//   every material carries userData.wmShared, and every slot matSet() names is
//   IDENTICAL to the WM entry rather than a copy. A second `_lib` passes every
//   other check here and every gun still looks right — world-display.js would
//   just start disposing materials another weapon is still drawing.
// - IT IS STILL LAZY. Importing the entry must build nothing. The proxy exists
//   for that, and no other check in the repo would notice it going: an eager
//   library generates 29 canvas textures on every page load, weapon or no.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameModule, repoRoot } from './lib/headless-three.mjs';
import { assertNoImportOf, importsOf, onDisk } from './lib/split-modules.mjs';

const dir = join(repoRoot, 'js', 'render', 'WeaponMaterials');
const files = readdirSync(dir).filter((f) => f.endsWith('.js')).sort();

// ---------------------------------------------------------------------------
// It is still lazy. This has to be the FIRST thing that touches the module, so
// it runs before any other import in this file: `_lib` is module-private, the
// proxy is the only thing that can fill it, and the work it does is visible as
// canvas allocations on the headless document stub.
// ---------------------------------------------------------------------------
let canvases = 0;
const realCreate = globalThis.document.createElement;
globalThis.document.createElement = (tag) => { if (tag === 'canvas') canvases++; return realCreate(tag); };
const entry = await loadGameModule('render', 'WeaponMaterials.js');
assert.equal(canvases, 0, 'importing js/render/WeaponMaterials.js must build nothing: the library is lazy');
assert.equal(typeof entry.WM, 'object', 'WM must exist before it is read');
const firstRead = entry.WM.blued;
assert.ok(canvases > 0, 'the first read through WM must build the library');
const built = canvases;
assert.ok(entry.WM.machined && entry.WM.papCore, 'more reads must come out of the cache');
assert.equal(canvases, built, `the library must be built exactly once: ${canvases - built} extra canvases after `
  + 'the first read');
assert.ok(entry.WM.blued === firstRead, 'reading the same key twice must hand back the same material');
globalThis.document.createElement = realCreate;

// ---------------------------------------------------------------------------
// js/render/WeaponMaterials.js exports the same names as before the split.
// ---------------------------------------------------------------------------
assert.deepEqual(Object.keys(entry).sort(), ['WM', 'matSet'],
  'js/render/WeaponMaterials.js must export exactly WM and matSet');
assert.equal(typeof entry.matSet, 'function', 'matSet must be a function');
assert.equal('buildLibrary' in entry, false,
  'buildLibrary must stay behind the proxy: a caller that built its own library would not share it');

// ---------------------------------------------------------------------------
// Every module loads, defines its names once, and library.js owns buildLibrary.
// ---------------------------------------------------------------------------
const definedIn = new Map();
for (const file of files) {
  for (const name of Object.keys(await loadGameModule('render', 'WeaponMaterials', file))) {
    assert.equal(definedIn.has(name), false, `${name} is defined in both ${definedIn.get(name)} and ${file}`);
    definedIn.set(name, file);
  }
}
assert.equal(definedIn.get('buildLibrary'), 'library.js', 'buildLibrary must be defined in library.js');
for (const name of ['rng', 'canvas2d', 'texture', 'normalFromHeight']) {
  assert.equal(definedIn.get(name), 'canvas.js', `${name} must be defined in canvas.js`);
}
for (const name of ['steelSurface', 'woodSurface', 'leatherSurface', 'bakeliteSurface', 'checkerSurface', 'etchSurface']) {
  assert.equal(definedIn.get(name), 'surfaces.js', `${name} must be defined in surfaces.js`);
}

// ---------------------------------------------------------------------------
// No module in js/render/WeaponMaterials/ imports js/render/WeaponMaterials.js.
// ---------------------------------------------------------------------------
const specifiers = assertNoImportOf('render/WeaponMaterials.js', 'render/WeaponMaterials', files);

// ---------------------------------------------------------------------------
// The imports follow one rule.
// ---------------------------------------------------------------------------
const ALLOWED = { 'canvas.js': [], 'surfaces.js': ['./canvas.js'], 'library.js': ['./surfaces.js'] };
/** One message per import that breaks the rule, given the entry's specifiers and each module's. */
function ruleBreaks(entryImports, moduleImports) {
  return [
    ...entryImports.filter((spec) => spec !== './WeaponMaterials/library.js')
      .map((spec) => `js/render/WeaponMaterials.js imports ${spec}, and must import only ./WeaponMaterials/library.js`),
    ...[...moduleImports].flatMap(([file, specs]) => specs
      .filter((spec) => !(ALLOWED[file] ?? []).includes(spec))
      .map((spec) => `js/render/WeaponMaterials/${file} imports ${spec}`)),
  ];
}
const moduleImports = new Map(files.map((file) => [file, importsOf(join(dir, file))]));
const entryImports = [...new Set(importsOf(join(repoRoot, 'js', 'render', 'WeaponMaterials.js')))];
assert.deepEqual(ruleBreaks(entryImports, moduleImports), [],
  'canvas.js must import nothing from the folder, surfaces.js only ./canvas.js, library.js only ./surfaces.js, '
  + 'and the entry only ./WeaponMaterials/library.js');
assert.deepEqual(ruleBreaks(entryImports, new Map([...moduleImports, ['library.js', ['./canvas.js']]])),
  ['js/render/WeaponMaterials/library.js imports ./canvas.js'],
  'a library.js that reaches past the generators for a canvas helper must be rejected');

const entryPath = join(repoRoot, 'js', 'render', 'WeaponMaterials.js');
for (const spec of entryImports) {
  assert.ok(onDisk(entryPath, spec), `js/render/WeaponMaterials.js imports ${spec}, which is not on disk with that case`);
}
for (const [file, specs] of moduleImports) {
  for (const spec of specs) {
    assert.ok(onDisk(join(dir, file), spec), `js/render/WeaponMaterials/${file} imports ${spec}, which is not on disk with that case`);
  }
}
assert.equal(onDisk(entryPath, './WeaponMaterials/Library.js'), false, 'a miscased specifier must be rejected');

// ---------------------------------------------------------------------------
// The library is one library.
// ---------------------------------------------------------------------------
const { WM, matSet } = entry;
const keys = Object.keys(WM);
assert.ok(keys.length > 40, `the library must have its full key set, got ${keys.length}`);

const unstable = keys.filter((k) => WM[k] !== WM[k]);
assert.deepEqual(unstable, [], `reading ${unstable.join(', ')} twice gave two objects: the proxy must cache`);

const untagged = keys.filter((k) => WM[k]?.userData?.wmShared !== true);
assert.deepEqual(untagged, [], `${untagged.join(', ')} is not tagged wmShared: js/weapons/world-display.js disposes `
  + 'anything without the flag, and these belong to every other weapon in the game');

// Every slot must BE a library material, not a copy of one.
const byObject = new Map(keys.map((k) => [WM[k], k]));
for (const pap of [false, true]) {
  const set = matSet(pap);
  assert.equal(Object.keys(set).length, 15, `matSet(${pap}) must fill all 15 slots`);
  const strays = Object.entries(set).filter(([, mat]) => !byObject.has(mat)).map(([slot]) => slot);
  assert.deepEqual(strays, [], `matSet(${pap}) returned a material that is not in the library for ${strays.join(', ')}: `
    + 'the slots must forward the shared material, not clone it');
}
// The two sets must differ: PaP swaps the ferrous materials for the anodised set.
const plain = matSet(false);
const pap = matSet(true);
const same = Object.keys(plain).filter((slot) => plain[slot] === pap[slot]);
assert.deepEqual(same, [], `matSet(true) reused the stock material for ${same.join(', ')}`);

// Textures are shared across materials, which is why there is one library.
const maps = new Set();
for (const k of keys) {
  for (const slot of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) if (WM[k][slot]) maps.add(WM[k][slot]);
}
const bindings = keys.reduce((n, k) => n
  + ['map', 'normalMap', 'roughnessMap', 'emissiveMap'].filter((s) => WM[k][s]).length, 0);
assert.ok(maps.size < bindings, `${bindings} map bindings across ${keys.length} materials resolve to ${maps.size} `
  + 'textures — if every binding had its own, the generators would be running per material');

// The legacy aliases still alias.
for (const [alias, real] of [['steel', 'blued'], ['steelDark', 'ironDark'], ['steelLight', 'machined']]) {
  assert.ok(WM[alias] === WM[real], `WM.${alias} must still be WM.${real}`);
}

console.log(`WeaponMaterials modules OK: js/render/WeaponMaterials.js exports WM and matSet and builds nothing until `
  + `a key is read; ${definedIn.size} names come from ${files.length} modules in js/render/WeaponMaterials/ `
  + `(${specifiers} relative imports) which never import it; the imports follow the rule (a library.js that reaches `
  + `for a canvas helper is rejected) and are spelled as on disk; and the ${keys.length} materials are one shared `
  + `library — all tagged wmShared, ${bindings} map bindings onto ${maps.size} textures, both matSet variants `
  + 'forwarding library objects rather than copies.');
