// Net is split across js/net/: js/net.js builds Net and copies the methods of
// the classes in js/net/ onto it, and js/net/identity.js holds the names more
// than one of those files reads. This covers that contract.
//
// - js/net.js still exports exactly the one name it did before the split, so
//   main.js doesn't change.
// - No module in js/net/ imports js/net.js. One that did would put an import
//   cycle through the entry point main.js loads.
// - Every module in js/net/ but identity.js is one class of Net methods, and
//   each of those methods is on Net.prototype. Nothing in scripts/ runs Net, so
//   a file left out of the install would only fail in a co-op match.
// - The imports go one way: identity.js imports nothing, each other module at
//   most identity.js from js/net/ and never a sibling, and js/net.js every
//   module. So the folder has no cycle. Each specifier spells its file's name as
//   it is on disk: macOS resolves a wrong case, and Vercel does not.
// - readNetSource() hands the text checks every net file.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { loadGameModule, repoRoot } from './lib/headless-three.mjs';
import { readNetSource } from './lib/game-source.mjs';
import { assertMethodFilesInstalled, assertNoImportOf, assertSourceHolds, importsOf, onDisk } from './lib/split-modules.mjs';

const dir = join(repoRoot, 'js', 'net');
const entryPath = join(repoRoot, 'js', 'net.js');
const files = readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
const SHARED = 'identity.js';
const entry = await loadGameModule('net.js');

// ---------------------------------------------------------------------------
// js/net.js exports the same name as before the split.
// ---------------------------------------------------------------------------
assert.deepEqual(Object.keys(entry), ['Net'],
  'js/net.js must export exactly the name main.js imported from it before the split');

// ---------------------------------------------------------------------------
// No module in js/net/ imports js/net.js.
// ---------------------------------------------------------------------------
const specifiers = assertNoImportOf('net.js', 'net', files);

// ---------------------------------------------------------------------------
// Every module but identity.js is a class of Net methods, and it's installed.
// ---------------------------------------------------------------------------
assert.ok(files.includes(SHARED), 'js/net/identity.js must hold the names the net files share');
const isClass = (v) => typeof v === 'function' && Function.prototype.toString.call(v).startsWith('class ');
assert.deepEqual(Object.values(await loadGameModule('net', SHARED)).filter(isClass), [],
  'js/net/identity.js must export no class: its names are not Net methods');
const mixinFiles = files.filter((f) => f !== SHARED);
assert.ok(mixinFiles.length >= 1, `expected Net's method files in js/net/, found ${mixinFiles.length}`);
const methods = await assertMethodFilesInstalled(entry.Net, 'net', mixinFiles);

// ---------------------------------------------------------------------------
// The imports go one way.
// ---------------------------------------------------------------------------
/** The file in js/net/ that `spec`, imported by the file at `from`, names, or null for a file outside it. */
function inFolder(from, spec) {
  const target = resolve(dirname(from), spec.replace(/\?.*$/, ''));
  return dirname(target) === dir ? basename(target) : null;
}
/** One message per import that breaks the rule, given the entry's specifiers and each module's. */
function ruleBreaks(entryImports, moduleImports) {
  const imported = entryImports.map((spec) => inFolder(entryPath, spec)).filter(Boolean);
  return [
    ...imported.filter((file) => !moduleImports.has(file))
      .map((file) => `js/net.js imports ./net/${file}, which is not a module in js/net/`),
    ...[...moduleImports.keys()].filter((file) => !imported.includes(file))
      .map((file) => `js/net.js does not import ./net/${file}`),
    ...[...moduleImports].flatMap(([file, specs]) => specs
      .filter((spec) => file === SHARED || ![null, SHARED].includes(inFolder(join(dir, file), spec)))
      .map((spec) => `js/net/${file} imports ${spec}`)),
  ];
}
const moduleImports = new Map(files.map((file) => [file, importsOf(join(dir, file))]));
const entryImports = importsOf(entryPath);
assert.deepEqual(ruleBreaks(entryImports, moduleImports), [],
  'identity.js must import nothing, each other module in js/net/ at most identity.js from the folder, and js/net.js every module');
assert.deepEqual(ruleBreaks(entryImports, new Map([...moduleImports, ['lobby.js', [...moduleImports.get('lobby.js'), './host.js']]])),
  ['js/net/lobby.js imports ./host.js'], 'a lobby.js that imports host.js must be rejected');
assert.deepEqual(ruleBreaks(entryImports, new Map([...moduleImports, [SHARED, ['../utils.js']]])),
  ['js/net/identity.js imports ../utils.js'], 'an identity.js that imports anything must be rejected');
assert.deepEqual(ruleBreaks(entryImports.map((spec) => spec.replace('./net/lobby.js', './net/Lobby.js')), moduleImports),
  ['js/net.js imports ./net/Lobby.js, which is not a module in js/net/', 'js/net.js does not import ./net/lobby.js'],
  'an entry that imports ./net/Lobby.js must be rejected');

const miscased = [entryPath, ...files.map((file) => join(dir, file))]
  .flatMap((from) => importsOf(from).filter((spec) => !onDisk(from, spec)).map((spec) => `${relative(repoRoot, from)} imports ${spec}`));
assert.deepEqual(miscased, [], 'every relative import must name its file as it is spelled on disk');
assert.equal(onDisk(entryPath, './net/Lobby.js'), false, 'a specifier with the wrong case must be rejected');

// ---------------------------------------------------------------------------
// readNetSource() holds every net file.
// ---------------------------------------------------------------------------
assertSourceHolds(readNetSource(), 'readNetSource()', ['net.js', ...files.map((f) => `net/${f}`)]);

console.log(`Net modules OK: js/net.js exports ${Object.keys(entry).length} name; ${files.length} modules in js/net/ `
  + `(${specifiers} relative imports) never import it; ${methods.size} Net methods installed from ${mixinFiles.join(', ')}; `
  + 'identity.js holds no class; the imports go one way (a lobby.js that imports host.js, an identity.js that imports '
  + 'anything and a miscased entry import are rejected); readNetSource() holds them all.');
