// The contract checks in scripts/lib/split-modules.mjs guard the folders that
// game.js, weapons.js and zombies.js were split into. A check that passed
// everything would hide exactly the mistakes it exists to catch, so each one is
// run here against input it must reject, and against input it must accept.
import assert from 'node:assert/strict';
import { loadGameModule } from './lib/headless-three.mjs';
import { readZombiesSource } from './lib/game-source.mjs';
import { assertMethodFilesInstalled, assertNoImportOf, assertSourceHolds } from './lib/split-modules.mjs';

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

console.log('split-module checks OK: each rejects an uninstalled class, a duplicate method, a classless file, '
  + 'an import or re-export of the entry point (cache token or not) and a missing file, and accepts the real ones');
