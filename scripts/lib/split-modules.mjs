// Contract checks shared by the tests of the files split into folders:
// test-game-modules.mjs (js/game/), test-weapon-modules.mjs (js/weapons/),
// test-zombie-modules.mjs (js/zombies/), test-cinematic-modules.mjs
// (js/cinematic-director/) and test-player-modules.mjs (js/player/). Every
// path here is relative to js/.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadGameModule, repoRoot } from './headless-three.mjs';

/**
 * Each of `files` (under js/<dir>/) exports exactly one class, and every method
 * of it is installed on Target.prototype. A file left out of the install list
 * would leave its methods undefined until the first call, in the middle of a
 * match. Returns a map of each method name to the file that defines it.
 */
export async function assertMethodFilesInstalled(Target, dir, files) {
  const ownerOf = new Map();
  for (const file of files) {
    const classes = Object.values(await loadGameModule(dir, file))
      .filter((v) => typeof v === 'function' && Function.prototype.toString.call(v).startsWith('class '));
    assert.equal(classes.length, 1, `js/${dir}/${file} must export exactly one class of ${Target.name} methods`);
    const names = Object.getOwnPropertyNames(classes[0].prototype).filter((n) => n !== 'constructor');
    assert.ok(names.length, `js/${dir}/${file} holds no methods`);
    for (const name of names) {
      assert.equal(ownerOf.has(name), false, `${Target.name}.${name} is defined in both ${ownerOf.get(name)} and ${file}`);
      ownerOf.set(name, file);
      assert.equal(Target.prototype[name], classes[0].prototype[name],
        `${Target.name}.${name} from js/${dir}/${file} is not installed on ${Target.name}.prototype — is its class in the install list?`);
    }
  }
  return ownerOf;
}

/**
 * No module among `files` (under js/<dir>/) imports js/<entry>. One that did
 * would put an import cycle through the entry point every caller loads.
 * Returns how many relative import specifiers were checked.
 */
export function assertNoImportOf(entry, dir, files) {
  const entryPath = join(repoRoot, 'js', entry);
  let specifiers = 0;
  for (const file of files) {
    const path = join(repoRoot, 'js', dir, file);
    for (const [, spec] of readFileSync(path, 'utf8').matchAll(/^\s*(?:import|export)\b[^'"]*?\bfrom\s*'([^']+)'/gm)) {
      if (!spec.startsWith('.')) continue;
      specifiers++;
      assert.notEqual(resolve(dirname(path), spec.replace(/\?.*$/, '')), entryPath,
        `js/${dir}/${file} imports js/${entry}: import from the module that defines the name instead`);
    }
  }
  return specifiers;
}

/** The text a read…Source() helper returned holds every one of `paths` (under js/). */
export function assertSourceHolds(source, helper, paths) {
  for (const file of paths) {
    assert.ok(source.includes(readFileSync(join(repoRoot, 'js', file), 'utf8')), `${helper} is missing js/${file}`);
  }
}
