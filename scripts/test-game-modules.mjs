// Game's per-domain files: js/game.js copies the methods of every class in
// js/game/*.js onto Game.prototype. This covers that contract and the methods
// that only became callable on their own when init was split up.
//
// - Every js/game/ file is installed, method for method. A file added there
//   but left out of game.js's list would leave its methods undefined until
//   the first call, in the middle of a match.
// - readGameSource() hands the text checks all of Game, not just game.js.
// - onNetEvent offers each message to every domain handler, and a handler
//   never acts on a message type another one owns.
// - _mountViewmodel places the viewmodel lens the way the ADS solve expects,
//   and _installAudioOcclusion muffles sound through walls and props.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { THREE, loadGameModule, repoRoot } from './lib/headless-three.mjs';
import './lib/headless-map.mjs';
import { readGameSource } from './lib/game-source.mjs';
import { assertMethodFilesInstalled, assertSourceHolds } from './lib/split-modules.mjs';

const { Game } = await loadGameModule('game.js');
const { audio } = await loadGameModule('audio.js');
const source = readGameSource();

// ---------------------------------------------------------------------------
// Every domain file is installed on Game.prototype, method for method.
// ---------------------------------------------------------------------------
const files = readdirSync(join(repoRoot, 'js', 'game')).filter((f) => f.endsWith('.js')).sort();
assert.ok(files.length >= 16, `expected Game's domain files in js/game/, found ${files.length}`);
const ownerOf = await assertMethodFilesInstalled(Game, 'game', files);
assertSourceHolds(source, 'readGameSource()', ['game.js', ...files.map((f) => `game/${f}`)]);

// ---------------------------------------------------------------------------
// onNetEvent offers every message to every domain handler; each handler acts
// only on its own message types.
// ---------------------------------------------------------------------------
const handlers = Object.getOwnPropertyNames(Game.prototype).filter((n) => /^_\w+Event$/.test(n));
assert.equal(handlers.length, 7, `expected 7 net event handlers, found ${handlers.join(', ')}`);
{
  const calls = [];
  const game = Object.create(Game.prototype);
  for (const name of handlers) game[name] = (msg, from) => calls.push({ name, msg, from });
  const msg = { t: 'door', id: 'd_test' };
  game.onNetEvent(msg, 'peer-a');
  assert.deepEqual(calls.map((c) => c.name).sort(), [...handlers].sort(), 'onNetEvent must offer a message to every handler');
  assert.ok(calls.every((c) => c.msg === msg && c.from === 'peer-a'), 'every handler must get the same message and sender');
}
const labelsOf = (name) => [...Function.prototype.toString.call(Game.prototype[name]).matchAll(/^\s*case '(\w+)':/gm)]
  .map((m) => m[1]);
// A `this` that throws on any read but the `const p = this.player` every
// handler may start with: a handler that reads nothing else did not act.
const untouched = new Proxy({}, {
  get(_, key) {
    if (key === 'player') return undefined;
    throw new Error(`read this.${String(key)}`);
  },
});
let offered = 0;
for (const name of handlers) {
  assert.ok(labelsOf(name).length, `${name} handles no message types`);
  for (const other of handlers) {
    if (other === name) continue;
    for (const t of labelsOf(other)) {
      assert.doesNotThrow(() => Game.prototype[name].call(untouched, { t }, 'peer-a'),
        `${name} acted on '${t}', which ${other} handles`);
      offered++;
    }
  }
}

// ---------------------------------------------------------------------------
// _mountViewmodel: the lens compensation the ADS pose solves against.
// ---------------------------------------------------------------------------
{
  const constant = (name) => {
    const m = source.match(new RegExp(`const ${name} = ([\\d.]+)`));
    assert.ok(m, `${name} not found in the game's source`);
    return Number(m[1]);
  };
  const halfTan = (fov) => Math.tan(fov * Math.PI / 360);
  const k = (halfTan(constant('VIEWMODEL_FOV')) / halfTan(constant('VIEWMODEL_REF_FOV'))) * constant('VIEWMODEL_PRESENCE');
  const z = -(1 - k) * constant('VIEWMODEL_PIVOT_Z');
  const lens = [];
  const game = Object.create(Game.prototype);
  game.camera = new THREE.PerspectiveCamera();
  game.weaponRig = { root: new THREE.Group(), setViewLens: (...args) => lens.push(args) };
  game._mountViewmodel();
  const near = (a, b) => Math.abs(a - b) < 1e-12;
  assert.equal(game.vmRoot.parent, game.camera, 'the lens node must ride the world camera');
  assert.equal(game.weaponRig.root.parent, game.vmRoot, 'the rig must hang under the lens node');
  assert.ok(near(game.vmRoot.scale.x, k) && near(game.vmRoot.scale.y, k) && near(game.vmRoot.scale.z, k),
    `the lens node must scale the weapon by ${k}, got ${game.vmRoot.scale.toArray()}`);
  assert.ok(near(game.vmRoot.position.z, z), `the lens node must sit at z ${z}, got ${game.vmRoot.position.z}`);
  assert.equal(lens.length, 1, 'the rig must be told the lens exactly once');
  assert.ok(near(lens[0][0], k) && near(lens[0][1], z), `setViewLens(${lens[0]}) must get (${k}, ${z})`);
}

// ---------------------------------------------------------------------------
// _installAudioOcclusion: walls muffle, props partly, pass-through volumes not.
// ---------------------------------------------------------------------------
{
  const game = Object.create(Game.prototype);
  game.map = { colliders: [] };
  let test = null;
  const install = audio.setOcclusionTest;
  audio.setOcclusionTest = (fn) => { test = fn; };
  try {
    game._installAudioOcclusion();
  } finally {
    audio.setOcclusionTest = install;
  }
  assert.equal(typeof test, 'function', '_installAudioOcclusion must hand the audio engine a test');
  // A wall across the x axis, and a listener 2m either side of it.
  const wall = { minX: -0.1, maxX: 0.1, minZ: -5, maxZ: 5, y0: 0, h: 3 };
  const crate = (x) => ({ minX: x - 0.1, maxX: x + 0.1, minZ: -5, maxZ: 5, y0: 0, h: 3, prop: true });
  const across = (colliders) => {
    game.map.colliders = colliders;
    return test(-2, 1.5, 0, 2, 1.5, 0);
  };
  assert.equal(across([]), 0, 'open air must not muffle');
  assert.equal(across([wall]), 1, 'a wall must muffle fully');
  assert.equal(across([crate(0)]), 0.35, 'a prop must muffle partly');
  assert.ok(Math.abs(across([crate(-0.5), crate(0.5)]) - 0.7) < 1e-9, 'props in a row must add up');
  assert.equal(across([crate(-1), crate(0), crate(1)]), 1, 'and stop at fully muffled');
  for (const flag of ['noRaycast', 'shootOk', 'bulletPass']) {
    assert.equal(across([{ ...wall, [flag]: true }]), 0, `a ${flag} collider must not muffle`);
  }
  assert.equal(across([{ ...wall, h: 1 }]), 0, 'sound must pass over a wall below it');
  assert.equal(across([{ ...wall, y0: 2 }]), 0, 'and under a volume above it');
  game.map.colliders = [wall];
  assert.equal(test(-0.1, 1.5, 0, 0.1, 1.5, 0), 0, 'an emitter within 0.25m of the listener must never be muffled');
}

console.log(`Game modules OK: ${files.length} domain files installed (${ownerOf.size} methods), `
  + `${handlers.length} net handlers ignored ${offered} foreign message types, viewmodel lens and audio occlusion.`);
