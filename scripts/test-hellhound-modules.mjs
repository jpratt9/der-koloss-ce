// The hellhound model is split across js/render/HellhoundModel/:
// js/render/HellhoundModel.js builds the variants and rigs a hound from the
// parts its modules build, and the modules never import it. This covers that
// contract.
//
// - js/render/HellhoundModel.js still exports exactly the names it did before
//   the split, so js/zombies/ does not change.
// - Every module in js/render/HellhoundModel/ loads in Node, and the entry's
//   houndMaterials is the one materials.js defines.
// - No module in js/render/HellhoundModel/ imports js/render/HellhoundModel.js.
// - The folder imports in one direction: materials.js imports nothing from it,
//   primitives.js only materials.js, and every other module only
//   primitives.js. So the folder has no cycle. Every relative import in the
//   entry is a module in the folder.
// - Each relative specifier names a file that exists with that exact case:
//   macOS resolves a wrong case, and Vercel does not.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { loadGameModule, repoRoot } from './lib/headless-three.mjs';
import { assertNoImportOf } from './lib/split-modules.mjs';

const dir = join(repoRoot, 'js', 'render', 'HellhoundModel');
const entryPath = join(repoRoot, 'js', 'render', 'HellhoundModel.js');
const files = readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
const entry = await loadGameModule('render', 'HellhoundModel.js');

// ---------------------------------------------------------------------------
// js/render/HellhoundModel.js exports the same names as before the split.
// ---------------------------------------------------------------------------
const FUNCTIONS = ['buildHellhound', 'houndMaterials', 'prewarmHellhounds', 'setHellhoundLOD'];
assert.deepEqual(Object.keys(entry).sort(), ['HOUND_VARIANTS', ...FUNCTIONS].sort(),
  'js/render/HellhoundModel.js must export exactly the names it exported before the split');
assert.equal(entry.HOUND_VARIANTS, 5, 'HOUND_VARIANTS must stay 5');
for (const name of FUNCTIONS) assert.equal(typeof entry[name], 'function', `${name} must be a function`);

// ---------------------------------------------------------------------------
// Every module in js/render/HellhoundModel/ loads in Node.
// ---------------------------------------------------------------------------
for (const file of files) await loadGameModule('render', 'HellhoundModel', file);
const { houndMaterials } = await loadGameModule('render', 'HellhoundModel', 'materials.js');
assert.ok(entry.houndMaterials === houndMaterials,
  'js/render/HellhoundModel.js must re-export houndMaterials from js/render/HellhoundModel/materials.js');

// ---------------------------------------------------------------------------
// No module in js/render/HellhoundModel/ imports js/render/HellhoundModel.js.
// ---------------------------------------------------------------------------
const specifiers = assertNoImportOf('render/HellhoundModel.js', 'render/HellhoundModel', files);

// ---------------------------------------------------------------------------
// The imports follow one rule.
// ---------------------------------------------------------------------------
/** The relative import specifiers in the file at `path`. */
const importsOf = (path) => [...readFileSync(path, 'utf8').matchAll(/^\s*(?:import|export)\b[^'"]*?\bfrom\s*'([^']+)'/gm)]
  .map(([, spec]) => spec)
  .filter((spec) => spec.startsWith('.'));

/** The modules in the folder each module may import. Any module not listed may import only primitives.js. */
const ALLOWED = { 'materials.js': [], 'primitives.js': ['./materials.js'] };

/** One message per import that breaks the rule, given the entry's specifiers and each module's. */
function ruleBreaks(entryImports, moduleImports) {
  const modules = [...moduleImports.keys()].map((file) => `./HellhoundModel/${file}`);
  return [
    ...entryImports.filter((spec) => !modules.includes(spec))
      .map((spec) => `js/render/HellhoundModel.js imports ${spec}, which is not a module in js/render/HellhoundModel/`),
    ...[...moduleImports].flatMap(([file, specs]) => specs
      .filter((spec) => spec.startsWith('./') && !(ALLOWED[file] ?? ['./primitives.js']).includes(spec))
      .map((spec) => `js/render/HellhoundModel/${file} imports ${spec}`)),
  ];
}
const moduleImports = new Map(files.map((file) => [file, importsOf(join(dir, file))]));
const entryImports = importsOf(entryPath);
assert.deepEqual(ruleBreaks(entryImports, moduleImports), [],
  'materials.js must import nothing from js/render/HellhoundModel/, primitives.js only materials.js, the other '
  + 'modules only primitives.js, and js/render/HellhoundModel.js only modules in the folder');
assert.deepEqual(ruleBreaks(entryImports, new Map([...moduleImports, ['materials.js', ['./primitives.js']]])),
  ['js/render/HellhoundModel/materials.js imports ./primitives.js'],
  'a materials.js that imports primitives.js must be rejected');

// ---------------------------------------------------------------------------
// Each relative specifier names a file as it is spelled on disk.
// ---------------------------------------------------------------------------
/** Whether `spec`, imported by the file at `from`, names a file that exists with exactly that case. */
function onDisk(from, spec) {
  let path = dirname(from);
  for (const part of spec.replace(/\?.*$/, '').split('/')) {
    if (part === '.') continue;
    if (part === '..') { path = dirname(path); continue; }
    if (!readdirSync(path).includes(part)) return false;
    path = join(path, part);
  }
  return true;
}
const miscased = [[entryPath, entryImports], ...files.map((file) => [join(dir, file), moduleImports.get(file)])]
  .flatMap(([from, specs]) => specs.filter((spec) => !onDisk(from, spec)).map((spec) => `${relative(repoRoot, from)} imports ${spec}`));
assert.deepEqual(miscased, [], 'every relative import must name its file as it is spelled on disk');
assert.equal(onDisk(entryPath, './HellhoundModel/Materials.js'), false, 'a specifier with the wrong case must be rejected');

console.log(`Hellhound modules OK: js/render/HellhoundModel.js exports its ${FUNCTIONS.length + 1} names; `
  + `${files.length} modules in js/render/HellhoundModel/ load (${specifiers} relative imports) and never import it; `
  + 'the imports follow the rule (a materials.js that imports primitives.js is rejected) '
  + 'and name their files as spelled on disk (a wrong case is rejected).');
