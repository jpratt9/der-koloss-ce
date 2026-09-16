// The prop surface library is split across js/props/materials/:
// js/props/materials.js keeps the normal-filter material factory, the singleton
// cache and the three helpers built on it, and the modules behind it draw what
// the singletons memoise. This covers that contract.
//
// - js/props/materials.js still exports exactly the 15 names it exported before
//   the split, so none of the 8 files that import it changes — and the kit's
//   private helpers are NOT among them. A split must not widen the API.
// - Every module in js/props/materials/ loads in Node, no name is defined in
//   two of them, and each moved name comes from the module it belongs to.
// - No module in js/props/materials/ imports js/props/materials.js. One that
//   did would ask the singleton cache for a value it is in the middle of
//   computing.
// - The imports follow one rule: kit.js imports nothing from the folder,
//   surfaces.js and textures.js only ./kit.js, and the entry only the three
//   modules. Each specifier spells its file's name as it is on disk: macOS
//   resolves a wrong case, and Vercel does not.
// - THE SINGLETONS ARE SINGLETONS. `shared.iron` read twice is the same object,
//   and ironMaterial() called twice gives two materials pointing at ONE texture
//   set. A `shared` whose getters stopped memoising looks identical on screen
//   and uploads eight more textures per machine.
// - EVERY GENERATOR IS SEEDED. The file's header promises a machine looks the
//   same in every session, and nothing checked it. Same seed, same draw calls;
//   different seed, different draw calls.
// - Every height->normal Sobel names its own BLUR radius, checked against the
//   module that owns it rather than the joined source, so a generator added to
//   surfaces.js without a table entry fails in the file it was added to.
// - readPropMaterialsSource() holds all four files.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameModule, repoRoot } from './lib/headless-three.mjs';
import { readPropMaterialsSource } from './lib/game-source.mjs';
import { assertNoImportOf, assertSourceHolds, importsOf, onDisk } from './lib/split-modules.mjs';

const dir = join(repoRoot, 'js', 'props', 'materials');
const files = readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
const entry = await loadGameModule('props', 'materials.js');

// ---------------------------------------------------------------------------
// js/props/materials.js exports the same names as before the split.
// ---------------------------------------------------------------------------
const EXPORTS = [
  'mulberry32', 'PROP_NORMAL_FILTER', 'propMaterial',
  'enamelMaps', 'castIronMaps', 'brassMaps', 'plankMaps',
  'stencilTexture', 'hazardTexture', 'signTexture', 'glassRoughness',
  'shared', 'ironMaterial', 'brassMaterial', 'scaleUV',
];
assert.deepEqual(Object.keys(entry).sort(), [...EXPORTS].sort(),
  'js/props/materials.js must export exactly the names it exported before the split');
for (const name of EXPORTS) {
  if (name === 'PROP_NORMAL_FILTER' || name === 'shared') continue;
  assert.equal(typeof entry[name], 'function', `${name} must be a function`);
}
// The kit was private and must stay private: moving it into a module of its own
// is not a reason for a prop to start drawing its own canvases.
for (const name of ['mkCanvas', 'finish', 'boxBlur', 'BLUR', 'normalFromHeight', 'blotches', 'hexRGB']) {
  assert.equal(name in entry, false, `${name} was private before the split and must not become part of the API`);
}

// ---------------------------------------------------------------------------
// Every module loads, defines its names once, and owns the ones it should.
// ---------------------------------------------------------------------------
const OWNER = {
  mulberry32: 'kit.js', mkCanvas: 'kit.js', finish: 'kit.js', BLUR: 'kit.js',
  normalFromHeight: 'kit.js', blotches: 'kit.js', hexRGB: 'kit.js',
  enamelMaps: 'surfaces.js', castIronMaps: 'surfaces.js', brassMaps: 'surfaces.js', plankMaps: 'surfaces.js',
  stencilTexture: 'textures.js', hazardTexture: 'textures.js', signTexture: 'textures.js',
  glassRoughness: 'textures.js',
};
const definedIn = new Map();
for (const file of files) {
  for (const name of Object.keys(await loadGameModule('props', 'materials', file))) {
    assert.equal(definedIn.has(name), false, `${name} is defined in both ${definedIn.get(name)} and ${file}`);
    definedIn.set(name, file);
  }
}
for (const [name, file] of Object.entries(OWNER)) {
  assert.equal(definedIn.get(name), file, `${name} must be defined in ${file}`);
}
assert.equal(definedIn.has('boxBlur'), false, 'boxBlur has one caller and must stay private to kit.js');

// ---------------------------------------------------------------------------
// No module in js/props/materials/ imports js/props/materials.js.
// ---------------------------------------------------------------------------
const specifiers = assertNoImportOf('props/materials.js', 'props/materials', files);

// ---------------------------------------------------------------------------
// The imports follow one rule.
// ---------------------------------------------------------------------------
const ALLOWED = { 'kit.js': [], 'surfaces.js': ['./kit.js'], 'textures.js': ['./kit.js'] };
const FOLDER = ['./materials/kit.js', './materials/surfaces.js', './materials/textures.js'];
/** One message per import that breaks the rule, given the entry's specifiers and each module's. */
function ruleBreaks(entryImports, moduleImports) {
  return [
    ...entryImports.filter((spec) => spec.startsWith('./materials/') && !FOLDER.includes(spec))
      .map((spec) => `js/props/materials.js imports ${spec}, which is not a module in js/props/materials/`),
    ...[...moduleImports].flatMap(([file, specs]) => specs
      .filter((spec) => !(ALLOWED[file] ?? []).includes(spec))
      .map((spec) => `js/props/materials/${file} imports ${spec}`)),
  ];
}
const moduleImports = new Map(files.map((file) => [file, importsOf(join(dir, file))]));
// importsOf() matches the `export … from` side too, and the entry both imports
// from and re-exports surfaces.js and textures.js. Dedupe, so the rule reads the
// set of modules and not the syntax.
const entryImports = [...new Set(importsOf(join(repoRoot, 'js', 'props', 'materials.js')))];
assert.deepEqual(ruleBreaks(entryImports, moduleImports), [],
  'kit.js must import nothing from the folder, surfaces.js and textures.js only ./kit.js, '
  + 'and js/props/materials.js only modules in it');
assert.deepEqual(ruleBreaks(entryImports, new Map([...moduleImports, ['kit.js', ['./surfaces.js']]])),
  ['js/props/materials/kit.js imports ./surfaces.js'], 'a kit.js that imports surfaces.js must be rejected');

// The entry's own edge out of the folder must not move: validate-coplanar-
// surfaces.mjs pins '../render/Materials.js' by its exact relative path, which
// only holds while propMaterial stays in the entry.
assert.ok(entryImports.includes('../render/Materials.js'),
  'propMaterial must stay in js/props/materials.js: moving it deepens the applyNormalFilter path '
  + 'and breaks the pin in validate-coplanar-surfaces.mjs');

const entryPath = join(repoRoot, 'js', 'props', 'materials.js');
for (const spec of entryImports) {
  assert.ok(onDisk(entryPath, spec), `js/props/materials.js imports ${spec}, which is not on disk with that case`);
}
for (const [file, specs] of moduleImports) {
  for (const spec of specs) {
    assert.ok(onDisk(join(dir, file), spec), `js/props/materials/${file} imports ${spec}, which is not on disk with that case`);
  }
}
assert.equal(onDisk(entryPath, './materials/Kit.js'), false, 'a miscased specifier must be rejected');

// ---------------------------------------------------------------------------
// The singletons are singletons.
// ---------------------------------------------------------------------------
const { shared, ironMaterial, brassMaterial } = entry;
const keys = Object.keys(shared);
assert.ok(keys.length >= 8, `shared must expose its full set, got ${keys.length}`);
const unstable = keys.filter((k) => shared[k] !== shared[k]);
assert.deepEqual(unstable, [], `shared.${unstable.join(', shared.')} rebuilt on the second read: once() must memoise`);
// Distinct entries must be distinct: a cache keyed wrongly would hand every
// getter the same maps and still pass the check above.
assert.ok(shared.iron !== shared.ironDark && shared.brass !== shared.copper && shared.planks !== shared.planksFine,
  'each shared entry must be its own set: the cache is keyed per name, not per generator');

// A material is new every call; the textures on it are not.
const ironA = ironMaterial();
const ironB = ironMaterial();
assert.ok(ironA !== ironB, 'ironMaterial must hand back a fresh material each call');
for (const slot of ['map', 'normalMap', 'roughnessMap']) {
  assert.ok(ironA[slot] && ironA[slot] === ironB[slot],
    `two iron materials must share one ${slot}: that is what the singleton cache is for`);
  assert.equal(ironA[slot], shared.iron[slot], `ironMaterial's ${slot} must come from shared.iron`);
}
assert.equal(brassMaterial({ copper: true }).map, shared.copper.map, 'the copper branch must read shared.copper');
assert.equal(brassMaterial().map, shared.brass.map, 'the default branch must read shared.brass');
// The normal filter is on, and it is the props' tuning, not the map's.
assert.equal(typeof ironA.onBeforeCompile, 'function', 'prop materials must carry the normal filter');
assert.equal(entry.PROP_NORMAL_FILTER.subtractGeometric, true,
  'prop materials must not double-count the part seams three already widens');

// ---------------------------------------------------------------------------
// Every generator is seeded.
// ---------------------------------------------------------------------------
/** The 2D calls `fn` makes, as one string: every argument is a function of the seed. */
function drawnBy(fn) {
  const lines = [];
  const realCreate = globalThis.document.createElement;
  globalThis.document.createElement = (tag) => {
    const c = realCreate(tag);
    if (tag !== 'canvas') return c;
    const realGet = c.getContext;
    c.getContext = (...a) => {
      const g = realGet(...a);
      for (const m of ['fillRect', 'arc', 'moveTo', 'lineTo', 'fillText', 'putImageData']) {
        const orig = g[m].bind(g);
        g[m] = (...args) => { lines.push(`${m}(${args.map((v) => (typeof v === 'number' ? v.toFixed(4) : '')).join(',')})`); return orig(...args); };
      }
      return g;
    };
    return c;
  };
  try { fn(); } finally { globalThis.document.createElement = realCreate; }
  return lines.join('\n');
}
const SEEDED = [
  ['enamelMaps', (s) => entry.enamelMaps('#1d6fa5', s)],
  ['castIronMaps', (s) => entry.castIronMaps(s)],
  ['brassMaps', (s) => entry.brassMaps(s)],
  ['plankMaps', (s) => entry.plankMaps(s)],
  ['hazardTexture', () => entry.hazardTexture({})],
  ['glassRoughness', (s) => entry.glassRoughness(s)],
];
for (const [name, gen] of SEEDED) {
  assert.equal(drawnBy(() => gen(3)), drawnBy(() => gen(3)),
    `${name} must draw the same thing from the same seed: a machine looks identical in every session`);
}
for (const [name, gen] of SEEDED.filter(([n]) => n !== 'hazardTexture')) {
  assert.notEqual(drawnBy(() => gen(3)), drawnBy(() => gen(4)),
    `${name} ignores its seed argument`);
}

// ---------------------------------------------------------------------------
// Every Sobel names its own BLUR radius, in the module that owns the generator.
// ---------------------------------------------------------------------------
const kitSource = readFileSync(join(dir, 'kit.js'), 'utf8');
const surfSource = readFileSync(join(dir, 'surfaces.js'), 'utf8');
const table = kitSource.match(/^export const BLUR = \{$([\s\S]*?)^\};$/m);
assert.ok(table, 'js/props/materials/kit.js must declare the exported BLUR table');
const radii = [...table[1].matchAll(/^\s{2}(\w+): (\d+),$/gm)].map(([, k]) => k);
const named = [...surfSource.matchAll(/normalFromHeight\([^)]*BLUR\.(\w+)\)/g)].map((m) => m[1]);
assert.equal(named.length, 4, `every generator in surfaces.js must Sobel with a BLUR radius, found ${named.length}`);
assert.equal(new Set(named).size, named.length, 'each generator must name its own BLUR entry');
for (const n of named) assert.ok(radii.includes(n), `${n} is not in the BLUR table`);

// ---------------------------------------------------------------------------
// readPropMaterialsSource() holds every file.
// ---------------------------------------------------------------------------
assertSourceHolds(readPropMaterialsSource(), 'readPropMaterialsSource()',
  ['props/materials.js', ...files.map((f) => `props/materials/${f}`)]);

console.log(`Prop material modules OK: js/props/materials.js exports its ${EXPORTS.length} names and none of the `
  + `kit's ${7} private helpers; ${definedIn.size} names come from ${files.length} modules in js/props/materials/ `
  + `(${specifiers} relative imports) which never import it; the imports follow the rule (a kit.js that imports `
  + `surfaces.js is rejected) and keep propMaterial's pinned path; ${keys.length} shared entries memoise and stay `
  + `distinct while every material is fresh; ${SEEDED.length} generators reproduce from their seed; and all `
  + `${named.length} Sobels name their own radius from the ${radii.length}-entry BLUR table.`);
