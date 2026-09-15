// Ambient zombie groans. ZombieManager.update() counts groanTimer down, and each
// time it runs out one zombie groans and the timer is set again for 9-14 s. The
// constructor never set the timer, so the first frame made it NaN and no ambient
// groan played in any match.
//
// This drives the real ZombieManager on the real map, as a match does:
// - groans play, and the timer stays a number;
// - the first comes no sooner than 9 s in, and each comes at least 9 s after
//   the last;
// - a zombie that groaned stays quiet for at least 26 s;
// - a hellhound never groans.
import assert from 'node:assert/strict';
import { THREE, loadGameModule } from './lib/headless-three.mjs';
import { buildHeadlessMap, seedRandom } from './lib/headless-map.mjs';

const { ZombieManager } = await loadGameModule('zombies.js');
const { map } = await buildHeadlessMap();
seedRandom(0x6a0a);

const spawn = map.playerSpawns[0];
const players = [{ id: 'p', x: spawn.x, y: 0, z: spawn.z, dead: false, down: false }];

/** Run one round for `seconds` of frames; return the manager, every groan and how many hounds spawned. */
function runRound(round, seconds, { dogRound = false } = {}) {
  const groans = [];
  let hounds = 0;
  const zm = new ZombieManager(new THREE.Scene(), map, {
    onGroan: (z) => groans.push({ id: z.id, dog: z.dog, t: zm.time }),
    onSpawned: (z) => { if (z.dog) hounds++; },
  }, true);
  if (dogRound) zm.nextDogRound = round;
  zm.startRound(round, players.length);
  for (let frame = 0; frame < seconds * 60; frame++) zm.update(1 / 60, players);
  return { zm, groans, hounds };
}

// ---------------------------------------------------------------------------
// A normal round groans, sparsely, and never the same zombie twice running.
// ---------------------------------------------------------------------------
{
  const { zm, groans } = runRound(1, 90);
  assert.ok(Number.isFinite(zm.groanTimer), `the groan timer must stay a number, got ${zm.groanTimer}`);
  assert.ok(groans.length >= 4, `90 s of round 1 must have ambient groans, got ${groans.length}`);
  assert.ok(groans[0].t >= 9, `the first ambient groan must wait at least 9 s, came at ${groans[0].t.toFixed(2)} s`);
  const lastById = new Map();
  for (let i = 0; i < groans.length; i++) {
    const { id, t } = groans[i];
    if (i) {
      const gap = t - groans[i - 1].t;
      assert.ok(gap >= 9 - 1e-9, `ambient groans must be at least 9 s apart, got ${gap.toFixed(2)} s`);
    }
    if (lastById.has(id)) {
      const quiet = t - lastById.get(id);
      assert.ok(quiet >= 26 - 1e-9, `zombie ${id} groaned again after ${quiet.toFixed(2)} s`);
    }
    lastById.set(id, t);
  }
}

// ---------------------------------------------------------------------------
// A dog round's hounds never groan.
// ---------------------------------------------------------------------------
{
  const { groans, hounds } = runRound(5, 60, { dogRound: true });
  assert.ok(hounds > 0, 'the dog round must spawn hounds for this to test anything');
  assert.deepEqual(groans, [], 'a hellhound must never groan');
}

console.log('zombie groans OK: a normal round groans at least 9 s apart, a zombie stays quiet 26 s after groaning, hounds never groan');
