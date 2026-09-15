// The contract checks in scripts/lib/split-modules.mjs guard the folders that
// game.js, weapons.js and zombies.js were split into. A check that passed
// everything would hide exactly the mistakes it exists to catch, so each one is
// run here against input it must reject, and against input it must accept.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { loadGameModule, repoRoot } from './lib/headless-three.mjs';
import { readZombiesSource } from './lib/game-source.mjs';
import {
  assertMethodFilesInstalled, assertNoImportOf, assertSourceHolds, checkBuilderCalls, importsOf, onDisk,
} from './lib/split-modules.mjs';

const { ZombieManager } = await loadGameModule('zombies.js');

// ---------------------------------------------------------------------------
// assertMethodFilesInstalled: one class per file, every method on the target.
// ---------------------------------------------------------------------------
{
  const owners = await assertMethodFilesInstalled(ZombieManager, 'zombies', ['manager-ai.js']);
  assert.equal(owners.get('stepZombie'), 'manager-ai.js', 'an installed method file must pass and name its methods');

  class Uninstalled {}
  await assert.rejects(assertMethodFilesInstalled(Uninstalled, 'zombies', ['manager-ai.js']),
    /Uninstalled\.setDormant from js\/zombies\/manager-ai\.js is not installed on Uninstalled\.prototype/,
    'a method file whose class was never installed must fail');
  await assert.rejects(assertMethodFilesInstalled(ZombieManager, 'zombies', ['manager-ai.js', 'manager-ai.js']),
    /ZombieManager\.setDormant is defined in both manager-ai\.js and manager-ai\.js/,
    'a method defined in two files must fail');
  await assert.rejects(assertMethodFilesInstalled(ZombieManager, 'zombies', ['states.js']),
    /js\/zombies\/states\.js must export exactly one class of ZombieManager methods/,
    'a file with no class of methods must fail');
}

// ---------------------------------------------------------------------------
// assertNoImportOf: no module in the folder imports the entry point.
// ---------------------------------------------------------------------------
{
  assert.ok(assertNoImportOf('zombies.js', 'zombies', ['manager.js']) > 0,
    'a module that imports its siblings, not the entry point, must pass');
  assert.throws(() => assertNoImportOf('utils.js', 'zombies', ['manager.js']),
    /js\/zombies\/manager\.js imports js\/utils\.js/, 'an import of the entry point must fail');
  assert.throws(() => assertNoImportOf('audio/casings.js', 'weapons', ['catalog.js']),
    /js\/weapons\/catalog\.js imports js\/audio\/casings\.js/, 'a cache token must not hide an import of the entry point');
  assert.throws(() => assertNoImportOf('zombies/states.js', '.', ['zombies.js']),
    /imports js\/zombies\/states\.js/, 'a re-export is an import too');
}

// ---------------------------------------------------------------------------
// assertSourceHolds: the joined source contains every file, byte for byte.
// ---------------------------------------------------------------------------
{
  const source = readZombiesSource();
  assertSourceHolds(source, 'readZombiesSource()', ['zombies.js', 'zombies/states.js']);
  assert.throws(() => assertSourceHolds(source.replace('const ZSTATES', 'const ZSTATE'), 'readZombiesSource()', ['zombies/states.js']),
    /readZombiesSource\(\) is missing js\/zombies\/states\.js/, 'a file that changed or is left out must fail');
}

// ---------------------------------------------------------------------------
// checkBuilderCalls: each builder called once, with exactly its names, and
// returning every name the entry destructures.
// ---------------------------------------------------------------------------
{
  const modules = [{ file: 'kit.js', source: 'export function buildKit({ a, b }) {\n  const c = a + b;\n  return { c };\n}\n' }];
  const check = (entrySource) => checkBuilderCalls('entry.js', 'parts', entrySource, modules);
  assert.equal(check('  const { c } = buildKit({ b, a });\n'), 1, 'a builder called once with its names, in any order, must pass');
  assert.throws(() => check('  buildKit({ a, b });\n  buildKit({ a, b });\n'),
    /js\/entry\.js must call buildKit\(\) from js\/parts\/kit\.js exactly once, found 2/, 'a builder called twice must fail');
  assert.throws(() => check('  const c = 1;\n'), /exactly once, found 0/, 'a builder never called must fail');
  assert.throws(() => check('  const { c } = buildKit({ a });\n'),
    /js\/entry\.js must pass buildKit\(\) exactly the names/, 'a call that leaves a name out must fail');
  assert.throws(() => check('  const { c, d } = buildKit({ a, b });\n'),
    /buildKit\(\) in js\/parts\/kit\.js does not return d, which js\/entry\.js destructures from it/,
    'a destructured name the builder does not return must fail');
}

// ---------------------------------------------------------------------------
// importsOf and onDisk: a file's relative specifiers, spelled as on disk.
// ---------------------------------------------------------------------------
{
  const js = (...parts) => join(repoRoot, 'js', ...parts);
  assert.deepEqual(importsOf(js('map-props.js')),
    ['../vendor/utils/BufferGeometryUtils.js', './map-props/builders.js', './map-props/placement.js'],
    'importsOf() must list the relative specifiers in order, and skip a bare one like three');
  assert.ok(importsOf(js('map.js')).includes('./map-layout.js'), 'importsOf() must read an import that spans lines');
  assert.ok(importsOf(js('zombies.js')).includes('./zombies/states.js'), 'importsOf() must read a re-export');

  assert.ok(onDisk(js('weapons', 'catalog.js'), '../audio/casings.js?v=1'), 'a specifier that climbs a folder and carries a cache token must pass');
  assert.equal(onDisk(js('weapons', 'catalog.js'), '../Audio/casings.js'), false, 'a folder spelled with the wrong case must fail');
  assert.equal(onDisk(js('map-props.js'), './map-props/Placement.js'), false, 'a file spelled with the wrong case must fail');
  assert.equal(onDisk(js('map-props.js'), './map-props/missing.js'), false, 'a file that does not exist must fail');
}

console.log('split-module checks OK: each rejects an uninstalled class, a duplicate method, a classless file, '
  + 'an import or re-export of the entry point (cache token or not), a missing file, a builder called twice or never, '
  + 'a left-out or unreturned name, and a miscased or missing import, and accepts the real ones');
