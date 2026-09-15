// The audio engine is split across js/audio/: js/audio.js builds AudioEngine
// and copies the methods in js/audio/engine-*.js onto it, and the modules in
// js/audio/ never import js/audio.js. This covers that contract.
//
// - js/audio.js still exports exactly the one name it did before the split, so
//   no caller has to change.
// - No module in js/audio/ imports js/audio.js. One that did would put an
//   import cycle through the entry point every caller loads.
// - Every method in js/audio/engine-*.js is on AudioEngine.prototype. A file
//   left out of the install would not throw: play() skips a synth fallback it
//   cannot find, and the ambience bed checks for the sample methods before it
//   calls them, so the sounds would just go missing.
// - Every module in js/ is imported with one query string. The modules in
//   js/audio/ are imported with `?v=` tokens, and a module imported under two
//   different specifiers loads twice.
// - readAudioSource() hands the text checks every audio file.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { loadGameModule, repoRoot } from './lib/headless-three.mjs';
import { readAudioSource } from './lib/game-source.mjs';
import { assertMethodFilesInstalled, assertNoImportOf, assertSourceHolds } from './lib/split-modules.mjs';

const jsRoot = join(repoRoot, 'js');
const files = readdirSync(join(jsRoot, 'audio'), { recursive: true }).filter((f) => f.endsWith('.js')).sort();
const entry = await loadGameModule('audio.js');

// ---------------------------------------------------------------------------
// js/audio.js exports the same name as before the split.
// ---------------------------------------------------------------------------
assert.deepEqual(Object.keys(entry), ['audio'],
  'js/audio.js must export exactly the name callers imported from it before the split');

// ---------------------------------------------------------------------------
// No module in js/audio/ imports js/audio.js.
// ---------------------------------------------------------------------------
const specifiers = assertNoImportOf('audio.js', 'audio', files);

// ---------------------------------------------------------------------------
// The engine-*.js files are installed on AudioEngine.prototype, method for
// method. MasterMix, VoicePool, AmbienceBed and OcclusionCache are classes in
// js/audio/ too, hence the filter.
// ---------------------------------------------------------------------------
const engineFiles = files.filter((f) => /^engine-[\w-]+\.js$/.test(f));
assert.ok(engineFiles.length >= 1, `expected AudioEngine's method files in js/audio/, found ${engineFiles.length}`);
const methods = await assertMethodFilesInstalled(entry.audio.constructor, 'audio', engineFiles);

// ---------------------------------------------------------------------------
// Every module in js/ is imported with one query string.
// ---------------------------------------------------------------------------
/** One message per module imported under more than one query string, naming an importer of each. */
function specifierConflicts(imports) {
  const byTarget = new Map();
  for (const { importer, target, query } of imports) {
    if (!byTarget.has(target)) byTarget.set(target, new Map());
    const queries = byTarget.get(target);
    if (!queries.has(query)) queries.set(query, importer);
  }
  return [...byTarget].filter(([, queries]) => queries.size > 1).map(([target, queries]) =>
    `${relative(repoRoot, target)} is imported as ${[...queries].map(([query, importer]) => `'${query || '(no query)'}' by ${importer}`).join(' and ')}`);
}
const imports = [];
for (const file of readdirSync(jsRoot, { recursive: true }).filter((f) => f.endsWith('.js')).sort()) {
  const path = join(jsRoot, file);
  for (const [, spec] of readFileSync(path, 'utf8').matchAll(/^\s*(?:import|export)\b[^'"]*?\bfrom\s*'([^']+)'/gm)) {
    if (!spec.startsWith('.')) continue;
    const [bare, query = ''] = spec.split(/(?=\?)/);
    imports.push({ importer: `js/${file}`, target: resolve(dirname(path), bare), query });
  }
}
assert.deepEqual(specifierConflicts(imports), [],
  'a module imported under two query strings loads twice: import it with the same one everywhere');
const doctored = specifierConflicts([...imports, { importer: 'js/doctored.js', target: join(jsRoot, 'audio', 'ir.js'), query: '' }]);
assert.deepEqual(doctored, ["js/audio/ir.js is imported as '?v=1' by js/audio.js and '(no query)' by js/doctored.js"],
  'an untokened import of js/audio/ir.js must be caught');
const tokened = new Set(imports.filter((i) => i.query).map((i) => i.target));

// ---------------------------------------------------------------------------
// readAudioSource() holds every audio file.
// ---------------------------------------------------------------------------
assertSourceHolds(readAudioSource(), 'readAudioSource()', ['audio.js', ...files.map((f) => `audio/${f}`)]);

console.log(`Audio modules OK: js/audio.js exports ${Object.keys(entry).length} name; `
  + `${files.length} modules in js/audio/ (${specifiers} relative imports) never import it; `
  + `${methods.size} AudioEngine methods installed from ${engineFiles.join(', ')}; `
  + `${imports.length} relative imports in js/ agree on their query strings (${tokened.size} modules imported with one); `
  + 'readAudioSource() holds them all.');
