// The post stack's GLSL is split across js/render/shaders/: js/render/shaders.js
// re-exports the strings its modules define, and the modules never import it.
// This covers that contract.
//
// - js/render/shaders.js still exports exactly the names it did before the
//   split, so js/render/PostFX.js does not change.
// - Every pass but FXAA_FRAG starts with COMMON, once, and FXAA_FRAG doesn't
//   use it. A pass that lost it would still load in Node, but the browser
//   couldn't compile it.
// - Every module in js/render/shaders/ loads in Node, and js/render/shaders.js
//   re-exports each name one defines. No name is defined in two modules.
// - No module in js/render/shaders/ imports js/render/shaders.js.
// - The imports follow one rule: js/render/shaders.js imports every module in
//   the folder, common.js imports nothing, and the rest import common.js or
//   nothing. So COMMON exists before any pass joins it, and the folder has no
//   cycle. Each specifier spells its file's name as it is on disk: macOS
//   resolves a wrong case, and Vercel does not.
// - readShadersSource() hands the text checks every shader file.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameModule, repoRoot } from './lib/headless-three.mjs';
import { readShadersSource } from './lib/game-source.mjs';
import { assertNoImportOf, assertSourceHolds } from './lib/split-modules.mjs';

const dir = join(repoRoot, 'js', 'render', 'shaders');
const files = readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
const entry = await loadGameModule('render', 'shaders.js');

// ---------------------------------------------------------------------------
// js/render/shaders.js exports the same names as before the split.
// ---------------------------------------------------------------------------
const NAMES = [
  'COMMON', 'AO_FRAG', 'AO_BLUR_FRAG', 'VOLUMETRIC_FRAG', 'VOL_UPSAMPLE_FRAG', 'SSR_FRAG', 'MOTION_BLUR_FRAG',
  'BLOOM_PREFILTER_FRAG', 'BLOOM_DOWN_FRAG', 'BLOOM_UP_FRAG', 'LUM_DOWN_FRAG', 'LUM_ADAPT_FRAG',
  'COMPOSITE_FRAG', 'FXAA_FRAG', 'DOF_FRAG',
];
assert.deepEqual(Object.keys(entry).sort(), [...NAMES].sort(),
  'js/render/shaders.js must export exactly the names it exported before the split');
for (const name of NAMES) assert.equal(typeof entry[name], 'string', `${name} must be a GLSL string`);

// ---------------------------------------------------------------------------
// Every pass but FXAA_FRAG starts with COMMON, once, and FXAA_FRAG doesn't use
// it. rawDepth, luma and the other helpers reach the GPU only as COMMON's text,
// so a pass that lost it still loads here and fails to compile there.
// ---------------------------------------------------------------------------
/** The names among `shaders` that join COMMON wrongly: each pass but FXAA_FRAG once at its start, FXAA_FRAG never. */
function commonBreaks(shaders) {
  const { COMMON } = shaders;
  return Object.entries(shaders).filter(([name, glsl]) => {
    if (name === 'COMMON') return false;
    if (name === 'FXAA_FRAG') return glsl.includes(COMMON);
    return !glsl.startsWith(COMMON) || glsl.includes(COMMON, COMMON.length);
  }).map(([name]) => name);
}
assert.deepEqual(commonBreaks(entry), [],
  'every pass but FXAA_FRAG must start with COMMON exactly once, and FXAA_FRAG must not use it');
assert.deepEqual(
  commonBreaks({
    ...entry,
    AO_FRAG: entry.COMMON + entry.AO_FRAG,
    FXAA_FRAG: entry.COMMON + entry.FXAA_FRAG,
    SSR_FRAG: entry.SSR_FRAG.slice(entry.COMMON.length),
  }),
  ['AO_FRAG', 'FXAA_FRAG', 'SSR_FRAG'],
  'a pass that joins COMMON twice, an FXAA_FRAG that joins it, and an SSR_FRAG without it must be rejected',
);

// ---------------------------------------------------------------------------
// Every module in js/render/shaders/ loads in Node, and js/render/shaders.js
// re-exports each name one defines.
// ---------------------------------------------------------------------------
const definedIn = new Map();
for (const file of files) {
  for (const [name, value] of Object.entries(await loadGameModule('render', 'shaders', file))) {
    assert.equal(definedIn.has(name), false, `${name} is defined in both ${definedIn.get(name)} and ${file}`);
    definedIn.set(name, file);
    assert.ok(entry[name] === value, `js/render/shaders.js must re-export ${name} from js/render/shaders/${file}`);
  }
}

// ---------------------------------------------------------------------------
// No module in js/render/shaders/ imports js/render/shaders.js.
// ---------------------------------------------------------------------------
const specifiers = assertNoImportOf('render/shaders.js', 'render/shaders', files);

// ---------------------------------------------------------------------------
// The imports follow one rule.
// ---------------------------------------------------------------------------
/** The relative import specifiers in the file at `path`. */
const importsOf = (path) => [...readFileSync(path, 'utf8').matchAll(/^\s*(?:import|export)\b[^'"]*?\bfrom\s*'([^']+)'/gm)]
  .map(([, spec]) => spec)
  .filter((spec) => spec.startsWith('.'));

/** One message per import that breaks the rule, given the entry's specifiers and each module's. */
function ruleBreaks(entryImports, moduleImports) {
  const modules = [...moduleImports.keys()].map((file) => `./shaders/${file}`);
  return [
    ...entryImports.filter((spec) => !modules.includes(spec))
      .map((spec) => `js/render/shaders.js imports ${spec}, which is not a module in js/render/shaders/`),
    ...modules.filter((spec) => !entryImports.includes(spec))
      .map((spec) => `js/render/shaders.js does not import ${spec}`),
    ...[...moduleImports].flatMap(([file, specs]) => specs
      .filter((spec) => file === 'common.js' || spec !== './common.js')
      .map((spec) => `js/render/shaders/${file} imports ${spec}`)),
  ];
}
const moduleImports = new Map(files.map((file) => [file, importsOf(join(dir, file))]));
const entryImports = importsOf(join(repoRoot, 'js', 'render', 'shaders.js'));
assert.deepEqual(ruleBreaks(entryImports, moduleImports), [],
  'common.js must import nothing, the other modules only ./common.js, and js/render/shaders.js every module, spelled as on disk');
assert.deepEqual(ruleBreaks(entryImports, new Map([...moduleImports, ['common.js', ['./ao.js']]])),
  ['js/render/shaders/common.js imports ./ao.js'], 'a common.js that imports ao.js must be rejected');

// ---------------------------------------------------------------------------
// readShadersSource() holds every shader file.
// ---------------------------------------------------------------------------
assertSourceHolds(readShadersSource(), 'readShadersSource()', ['render/shaders.js', ...files.map((f) => `render/shaders/${f}`)]);

console.log(`Shader modules OK: js/render/shaders.js exports its ${NAMES.length} names, ${definedIn.size} of them from `
  + `${files.length} modules in js/render/shaders/ (${specifiers} relative imports), which never import it; `
  + 'every pass but FXAA_FRAG starts with COMMON once (a doubled, stray or missing COMMON is rejected); '
  + 'the imports follow the rule (a common.js that imports ao.js is rejected); readShadersSource() holds them all.');
