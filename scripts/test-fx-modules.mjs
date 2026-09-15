// FX is split across js/fx/: js/fx.js builds FX and copies the methods of the
// classes in js/fx/ onto it, and js/fx/surfaces.js and js/fx/textures.js hold
// the names more than one of those files reads. This covers that contract.
//
// - js/fx.js still exports exactly the two names it did before the split, so
//   game.js and map/hand-placed.js don't change.
// - No module in js/fx/ imports js/fx.js. One that did would put an import
//   cycle through the entry point every caller loads.
// - Every module in js/fx/ but the two shared ones is one class of FX methods,
//   and each of those methods is on FX.prototype. Nothing in scripts/ runs FX,
//   so a file left out of the install would only fail the first time the effect
//   is played.
// - The imports go one way: the shared modules import nothing relative, each
//   other module at most a shared one from js/fx/ and never a sibling, and
//   js/fx.js every module. So the folder has no cycle. Each specifier spells
//   its file's name as it is on disk: macOS resolves a wrong case, and Vercel
//   does not.
// - readFxSource() hands the text checks every fx file.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { loadGameModule, repoRoot } from './lib/headless-three.mjs';
import { readFxSource } from './lib/game-source.mjs';
import { assertMethodFilesInstalled, assertNoImportOf, assertSourceHolds, importsOf, onDisk } from './lib/split-modules.mjs';

const dir = join(repoRoot, 'js', 'fx');
const entryPath = join(repoRoot, 'js', 'fx.js');
const files = readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
const SHARED = ['surfaces.js', 'textures.js'];
const entry = await loadGameModule('fx.js');

// ---------------------------------------------------------------------------
// js/fx.js exports the same names as before the split.
// ---------------------------------------------------------------------------
assert.deepEqual(Object.keys(entry).sort(), ['BLOOD_DECAL_COLOR', 'FX'],
  'js/fx.js must export exactly the names game.js and map/hand-placed.js imported from it before the split');
assert.equal(entry.BLOOD_DECAL_COLOR, (await loadGameModule('fx', 'surfaces.js')).BLOOD_DECAL_COLOR,
  'js/fx.js must re-export the blood decal colour js/fx/surfaces.js defines, not a second copy of the value');

// ---------------------------------------------------------------------------
// No module in js/fx/ imports js/fx.js.
// ---------------------------------------------------------------------------
const specifiers = assertNoImportOf('fx.js', 'fx', files);

// ---------------------------------------------------------------------------
// Every module but the shared ones is a class of FX methods, and it's installed.
// ---------------------------------------------------------------------------
for (const shared of SHARED) assert.ok(files.includes(shared), `js/fx/${shared} must hold the names the fx files share`);
const isClass = (v) => typeof v === 'function' && Function.prototype.toString.call(v).startsWith('class ');
for (const shared of SHARED) {
  assert.deepEqual(Object.values(await loadGameModule('fx', shared)).filter(isClass), [],
    `js/fx/${shared} must export no class: its names are not FX methods`);
}
const mixinFiles = files.filter((f) => !SHARED.includes(f));
assert.ok(mixinFiles.length >= 1, `expected FX's method files in js/fx/, found ${mixinFiles.length}`);
const methods = await assertMethodFilesInstalled(entry.FX, 'fx', mixinFiles);

// ---------------------------------------------------------------------------
// The imports go one way.
// ---------------------------------------------------------------------------
/** The file in js/fx/ that `spec`, imported by the file at `from`, names, or null for a file outside it. */
function inFolder(from, spec) {
  const target = resolve(dirname(from), spec.replace(/\?.*$/, ''));
  return dirname(target) === dir ? basename(target) : null;
}
/** One message per import that breaks the rule, given the entry's specifiers and each module's. */
function ruleBreaks(entryImports, moduleImports) {
  const imported = entryImports.map((spec) => inFolder(entryPath, spec)).filter(Boolean);
  return [
    ...imported.filter((file) => !moduleImports.has(file))
      .map((file) => `js/fx.js imports ./fx/${file}, which is not a module in js/fx/`),
    ...[...moduleImports.keys()].filter((file) => !imported.includes(file))
      .map((file) => `js/fx.js does not import ./fx/${file}`),
    ...[...moduleImports].flatMap(([file, specs]) => specs
      .filter((spec) => SHARED.includes(file) || ![null, ...SHARED].includes(inFolder(join(dir, file), spec)))
      .map((spec) => `js/fx/${file} imports ${spec}`)),
  ];
}
const moduleImports = new Map(files.map((file) => [file, importsOf(join(dir, file))]));
// Deduped: importsOf() sees the `export … from` side too, so a module the entry
// both imports names from and re-exports would otherwise be listed twice.
const entryImports = [...new Set(importsOf(entryPath))];
assert.deepEqual(ruleBreaks(entryImports, moduleImports), [],
  'the shared modules must import nothing relative, each other module in js/fx/ at most a shared one from the folder, and js/fx.js every module');
assert.deepEqual(ruleBreaks(entryImports, new Map([...moduleImports, ['update.js', [...moduleImports.get('update.js'), './decals.js']]])),
  ['js/fx/update.js imports ./decals.js'], 'an update.js that imports decals.js must be rejected');
assert.deepEqual(ruleBreaks(entryImports, new Map([...moduleImports, ['surfaces.js', ['../utils.js']]])),
  ['js/fx/surfaces.js imports ../utils.js'], 'a surfaces.js that imports anything must be rejected');
assert.deepEqual(ruleBreaks(entryImports.map((spec) => spec.replace('./fx/surfaces.js', './fx/Surfaces.js')), moduleImports),
  ['js/fx.js imports ./fx/Surfaces.js, which is not a module in js/fx/', 'js/fx.js does not import ./fx/surfaces.js'],
  'an entry that imports ./fx/Surfaces.js must be rejected');
assert.deepEqual(ruleBreaks(entryImports.filter((spec) => spec !== './fx/update.js'), moduleImports),
  ['js/fx.js does not import ./fx/update.js'], 'an entry that drops its update.js import must be rejected');

const miscased = [entryPath, ...files.map((file) => join(dir, file))]
  .flatMap((from) => importsOf(from).filter((spec) => !onDisk(from, spec)).map((spec) => `${relative(repoRoot, from)} imports ${spec}`));
assert.deepEqual(miscased, [], 'every relative import must name its file as it is spelled on disk');
assert.equal(onDisk(entryPath, './fx/Surfaces.js'), false, 'a specifier with the wrong case must be rejected');

// ---------------------------------------------------------------------------
// readFxSource() holds every fx file.
// ---------------------------------------------------------------------------
assertSourceHolds(readFxSource(), 'readFxSource()', ['fx.js', ...files.map((f) => `fx/${f}`)]);

console.log(`FX modules OK: js/fx.js exports ${Object.keys(entry).length} names; ${files.length} modules in js/fx/ `
  + `(${specifiers} relative imports) never import it; ${methods.size} FX methods installed from ${mixinFiles.join(', ')}; `
  + `${SHARED.join(' and ')} hold no class; the imports go one way (an update.js that imports decals.js, a surfaces.js that `
  + 'imports anything, a miscased entry import and a dropped one are rejected); readFxSource() holds them all.');
