// Contract checks shared by the tests of the files split into folders:
// test-game-modules.mjs (js/game/), test-weapon-modules.mjs (js/weapons/),
// test-zombie-modules.mjs (js/zombies/), test-cinematic-modules.mjs
// (js/cinematic-director/), test-player-modules.mjs (js/player/),
// test-map-modules.mjs (js/map/), test-audio-modules.mjs (js/audio/),
// test-main-modules.mjs (js/main/), test-shader-modules.mjs
// (js/render/shaders/), test-hellhound-modules.mjs
// (js/render/HellhoundModel/) and test-map-props-modules.mjs
// (js/map-props/). The builder-call check serves the entries that call their
// modules' builders, and the case check the folders whose imports must match
// the spelling on disk.
// Every path here is relative to js/, except the file paths importsOf() and
// onDisk() take.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
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

const nameList = (text = '') => text.split(',').map((s) => s.trim()).filter(Boolean).sort();

/**
 * Every builder a module in `modules` ({ file, source } for each file under
 * js/<dir>/) exports is called exactly once in `entrySource`, the text of
 * js/<entry>, with exactly the names in its parameter list, and returns every
 * name the entry destructures from it. A name the call left out would reach the
 * builder as undefined. Returns how many builders were checked.
 */
export function checkBuilderCalls(entry, dir, entrySource, modules) {
  let builders = 0;
  for (const { file, source } of modules) {
    for (const [, name, params] of source.matchAll(/^export function (\w+)\((?:\{([^}]*)\})?\) \{$/gm)) {
      builders++;
      const calls = [...entrySource.matchAll(new RegExp(`(?:const \\{([^}]*)\\} = )?\\b${name}\\((?:\\{([^}]*)\\})?\\);`, 'g'))];
      assert.equal(calls.length, 1, `js/${entry} must call ${name}() from js/${dir}/${file} exactly once, found ${calls.length}`);
      const [, destructured, passed] = calls[0];
      assert.deepEqual(nameList(passed), nameList(params),
        `js/${entry} must pass ${name}() exactly the names in its parameter list: a name left out reaches the builder as undefined`);
      const fn = source.slice(source.indexOf(`export function ${name}(`));
      const returned = /\n {2}return \{([^}]*)\};$/.exec(fn.slice(0, fn.indexOf('\n}\n')))?.[1];
      for (const n of nameList(destructured)) {
        assert.ok(nameList(returned).includes(n), `${name}() in js/${dir}/${file} does not return ${n}, which js/${entry} destructures from it`);
      }
    }
  }
  return builders;
}

/** The relative import specifiers in the file at `path`. */
export const importsOf = (path) => [...readFileSync(path, 'utf8').matchAll(/^\s*(?:import|export)\b[^'"]*?\bfrom\s*'([^']+)'/gm)]
  .map(([, spec]) => spec)
  .filter((spec) => spec.startsWith('.'));

/** Whether `spec`, imported by the file at `from`, names a file that exists with exactly that case. */
export function onDisk(from, spec) {
  let path = dirname(from);
  for (const part of spec.replace(/\?.*$/, '').split('/')) {
    if (part === '.') continue;
    if (part === '..') { path = dirname(path); continue; }
    if (!readdirSync(path).includes(part)) return false;
    path = join(path, part);
  }
  return true;
}
