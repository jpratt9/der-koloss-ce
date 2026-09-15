// The map is built across js/map/: buildMap() in js/map.js calls one builder
// per section, in build order, passing the names that builder takes and
// destructuring the names it hands back. This covers that contract.
//
// - js/map.js still exports exactly the names it did before the split, so no
//   caller has to change.
// - No module in js/map/ imports js/map.js, or another module in js/map/.
//   Everything that passes between sections goes through buildMap().
// - Every builder is called once, with exactly the names in its parameter
//   list, and returns every name js/map.js destructures from it. A name the
//   call left out would reach the section as undefined, and nothing would
//   throw.
// - readMapSource() hands the text checks every map file.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameModule, repoRoot } from './lib/headless-three.mjs';
import { readMapSource } from './lib/game-source.mjs';
import { assertNoImportOf, assertSourceHolds } from './lib/split-modules.mjs';

const files = readdirSync(join(repoRoot, 'js', 'map'), { recursive: true }).filter((f) => f.endsWith('.js')).sort();
const entry = await loadGameModule('map.js');

// ---------------------------------------------------------------------------
// js/map.js exports the same names as before the split.
// ---------------------------------------------------------------------------
assert.deepEqual(Object.keys(entry).sort(), ['GRADE', 'MOON_DIR', 'buildMap'],
  'js/map.js must export exactly the names callers imported from it before the split');

// ---------------------------------------------------------------------------
// No module in js/map/ imports js/map.js, or another module in js/map/.
// ---------------------------------------------------------------------------
const specifiers = assertNoImportOf('map.js', 'map', files);
for (const file of files) assertNoImportOf(`map/${file}`, 'map', files);

// ---------------------------------------------------------------------------
// Every builder is called once, with exactly the names in its parameter list,
// and returns every name js/map.js destructures from it.
// ---------------------------------------------------------------------------
const nameList = (text = '') => text.split(',').map((s) => s.trim()).filter(Boolean).sort();

function checkBuilderCalls(mapSource, modules) {
  let builders = 0;
  for (const { file, source } of modules) {
    for (const [, name, params] of source.matchAll(/^export function (\w+)\((?:\{([^}]*)\})?\) \{$/gm)) {
      builders++;
      const calls = [...mapSource.matchAll(new RegExp(`(?:const \\{([^}]*)\\} = )?\\b${name}\\((?:\\{([^}]*)\\})?\\);`, 'g'))];
      assert.equal(calls.length, 1, `js/map.js must call ${name}() from js/map/${file} exactly once, found ${calls.length}`);
      const [, destructured, passed] = calls[0];
      assert.deepEqual(nameList(passed), nameList(params),
        `js/map.js must pass ${name}() exactly the names in its parameter list: a name left out reaches the section as undefined`);
      const fn = source.slice(source.indexOf(`export function ${name}(`));
      const returned = /\n {2}return \{([^}]*)\};$/.exec(fn.slice(0, fn.indexOf('\n}\n')))?.[1];
      for (const n of nameList(destructured)) {
        assert.ok(nameList(returned).includes(n), `${name}() in js/map/${file} does not return ${n}, which js/map.js destructures from it`);
      }
    }
  }
  return builders;
}

const mapSource = readFileSync(join(repoRoot, 'js', 'map.js'), 'utf8');
const modules = files.map((file) => ({ file, source: readFileSync(join(repoRoot, 'js', 'map', file), 'utf8') }));
const builders = checkBuilderCalls(mapSource, modules);
assert.ok(builders >= 2, `expected the section builders in js/map/, found ${builders}`);

// The check has to reject what it exists to catch.
const merge = /mergeSolidGeometry\(\{[^}]*\}\);/.exec(mapSource)?.[0];
assert.ok(merge, 'js/map.js must call mergeSolidGeometry()');
assert.throws(() => checkBuilderCalls(mapSource.replace(merge, merge.replace(', matCeiling', '')), modules),
  /must pass mergeSolidGeometry\(\) exactly the names/, 'a call that leaves a name out must fail');
assert.throws(() => checkBuilderCalls(mapSource.replace(merge, merge.replace('matWood,', 'matWood: matMetal,')), modules),
  /must pass mergeSolidGeometry\(\) exactly the names/, 'a name passed under another name must fail');
assert.throws(() => checkBuilderCalls(mapSource.replace('} = buildSurfaces();', '  matGlass,\n  } = buildSurfaces();'), modules),
  /does not return matGlass/, 'a destructured name the builder does not return must fail');

// ---------------------------------------------------------------------------
// readMapSource() holds every map file.
// ---------------------------------------------------------------------------
assertSourceHolds(readMapSource(), 'readMapSource()', ['map.js', ...files.map((f) => `map/${f}`)]);

console.log(`Map modules OK: js/map.js exports ${Object.keys(entry).length} names; `
  + `${files.length} modules in js/map/ (${specifiers} relative imports) import neither it nor each other; `
  + `${builders} builders are each called once with exactly their parameter names and return what js/map.js takes `
  + '(a left-out, renamed or unreturned name is rejected); readMapSource() holds them all.');
