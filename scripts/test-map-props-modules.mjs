// The prop dressing is split across js/map-props/: decorateMap() in
// js/map-props.js calls one builder per part, in build order, passing the names
// that builder takes and destructuring the names it hands back. This covers
// that contract.
//
// - js/map-props.js still exports exactly the name it did before the split, so
//   js/map.js does not change.
// - No module in js/map-props/ imports js/map-props.js, or another module in
//   js/map-props/. Everything that passes between them goes through
//   decorateMap().
// - Every builder is called once, with exactly the names in its parameter
//   list, and returns every name js/map-props.js destructures from it. A name
//   the call left out would reach the builder as undefined, which doesn't
//   always throw.
// - Each relative specifier names a file that exists with that exact case:
//   macOS resolves a wrong case, and Vercel does not.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadGameModule, repoRoot } from './lib/headless-three.mjs';
import { assertNoImportOf, checkBuilderCalls, importsOf, onDisk } from './lib/split-modules.mjs';

const dir = join(repoRoot, 'js', 'map-props');
const entryPath = join(repoRoot, 'js', 'map-props.js');
const files = readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
const entry = await loadGameModule('map-props.js');

// ---------------------------------------------------------------------------
// js/map-props.js exports the same name as before the split.
// ---------------------------------------------------------------------------
assert.deepEqual(Object.keys(entry), ['decorateMap'],
  'js/map-props.js must export exactly the name js/map.js imported from it before the split');

// ---------------------------------------------------------------------------
// No module in js/map-props/ imports js/map-props.js, or another module in it.
// ---------------------------------------------------------------------------
const specifiers = assertNoImportOf('map-props.js', 'map-props', files);
for (const file of files) assertNoImportOf(`map-props/${file}`, 'map-props', files);

// ---------------------------------------------------------------------------
// Every builder is called once, with exactly the names in its parameter list,
// and returns every name js/map-props.js destructures from it.
// ---------------------------------------------------------------------------
const entrySource = readFileSync(entryPath, 'utf8');
const modules = files.map((file) => ({ file, source: readFileSync(join(dir, file), 'utf8') }));
const check = (source) => checkBuilderCalls('map-props.js', 'map-props', source, modules);
const builders = check(entrySource);
assert.equal(builders, files.length, `each module in js/map-props/ must export one builder the check can read, found ${builders}`);

// The check has to reject what it exists to catch.
const make = /makePropBuilders\(\{[^}]*\}\);/.exec(entrySource)?.[0];
assert.ok(make, 'js/map-props.js must call makePropBuilders()');
assert.throws(() => check(entrySource.replace(make, make.replace(' pick,', ''))),
  /must pass makePropBuilders\(\) exactly the names/, 'a call that leaves a name out must fail');
assert.throws(() => check(entrySource.replace(make, make.replace(' lights,', ' lights: animated,'))),
  /must pass makePropBuilders\(\) exactly the names/, 'a name passed under another name must fail');
assert.throws(() => check(entrySource.replace('} = makePropBuilders(', '  tarp,\n  } = makePropBuilders(')),
  /does not return tarp/, 'a destructured name the builder does not return must fail');

// ---------------------------------------------------------------------------
// Each relative specifier names a file as it is spelled on disk.
// ---------------------------------------------------------------------------
const miscased = [entryPath, ...files.map((file) => join(dir, file))]
  .flatMap((from) => importsOf(from).filter((spec) => !onDisk(from, spec)).map((spec) => `${relative(repoRoot, from)} imports ${spec}`));
assert.deepEqual(miscased, [], 'every relative import must name its file as it is spelled on disk');
assert.equal(onDisk(entryPath, './map-props/Builders.js'), false, 'a specifier with the wrong case must be rejected');

console.log('Map props modules OK: js/map-props.js exports decorateMap; '
  + `${files.length} modules in js/map-props/ (${specifiers} relative imports) import neither it nor each other; `
  + `${builders} builders are each called once with exactly their parameter names and return what js/map-props.js takes `
  + '(a left-out, renamed or unreturned name is rejected); every relative import names its file as spelled on disk '
  + '(a wrong case is rejected).');
