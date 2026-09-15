// A teammate as this machine draws them, fed snapshots the way netcode does.
//
// RemotePlayer is js/player/remote.js. No other validator builds one: the ones
// that cover it read its text. A name the module forgot to import would throw
// the first time a guest joined. This drives it with 15 Hz snapshots and 60 Hz
// frames, as game.js and js/game/netcode.js do:
// - it draws a soldier, or a capsule when the soldier model has not loaded
// - position and yaw interpolate between snapshots, yaw the short way round
// - the clip follows the transmitted state: idle, walk, run, sprint, prone,
//   down and dead; a crouch lowers the body
// - a perk drink poses the bottle before it shows, breaks it and belches on the
//   shared timeline, then takes it away
// - the host's authoritative loadout holds two weapons and rejects the rest
// - dispose takes the teammate out of the scene
import assert from 'node:assert/strict';
import { THREE, loadGameModule } from './lib/headless-three.mjs';
import { seedRandom } from './lib/headless-map.mjs';
import { loadZombieModels } from './lib/headless-zombies.mjs';

const assets = await loadZombieModels();
const { RemotePlayer } = await loadGameModule('player.js');
const { audio } = await loadGameModule('audio.js');
const { PERK_DRINK_TIMELINE } = await loadGameModule('gameplay-rules.js');
seedRandom(0x7ea4);

const sounds = [];
audio.play = (name) => { sounds.push(name); };

const DT = 1 / 60;
const SNAPSHOT_FRAMES = 4;   // 15 Hz
const camera = new THREE.PerspectiveCamera();

function snapshot(state) {
  return {
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0, down: 0, dead: 0, hp: 100, points: 500, kills: 0, downs: 0, revives: 0,
    perks: [], w: 'm1911', pap: 0, bleed: 0, crouch: 0, sprint: 0, name: 'Nikolai', c: 1, ...state,
  };
}

/**
 * Move the teammate at `speed` m/s along -Z for `frames` frames. A snapshot
 * lands every fourth frame, and every frame interpolates.
 */
function drive(rp, clock, frames, state = {}, speed = 0) {
  for (let i = 0; i < frames; i++) {
    clock.now += DT;
    clock.z -= speed * DT;
    if (clock.frame++ % SNAPSHOT_FRAMES === 0) rp.applyState(snapshot({ z: clock.z, ...state }), clock.now);
    camera.position.set(rp.x + 2, 1.6, rp.z);
    rp.interpolate(clock.now, DT, camera);
  }
}

// ---------------------------------------------------------------------------
// A soldier when the model is loaded; a capsule when it is not.
// ---------------------------------------------------------------------------
{
  const scene = new THREE.Scene();
  const rp = new RemotePlayer(scene, { id: 'g1', name: 'Nikolai', c: 1, persona: 2 });
  assert.ok(rp.visual?.ok && rp.group.children.includes(rp.visual.group), 'a teammate is drawn as a soldier');
  assert.equal(rp.personaIdx, 2, 'the persona picks the soldier');
  assert.ok(scene.children.includes(rp.group), 'the teammate is added to the scene');
  assert.equal(new RemotePlayer(scene, { id: 'g2', name: 'Takeo', c: 3 }).personaIdx, 3, 'without a persona, the colour picks the soldier');

  const model = assets.models.zombie1;
  delete assets.models.zombie1;
  try {
    const capsule = new RemotePlayer(scene, { id: 'g3', name: 'Dempsey', c: 0 });
    assert.equal(capsule.visual, null, 'no model, no soldier');
    assert.equal(capsule.group.children.filter((o) => o.isMesh).length, 2, 'the fallback is a torso and a head');
    assert.equal(capsule.muzzleWorld(new THREE.Vector3()), null, 'a capsule has no muzzle');
    const clock = { now: 0, frame: 0, z: 0 };
    drive(capsule, clock, 8, { down: 1 });
    assert.ok(Math.abs(capsule.group.rotation.z - 1.4) < 1e-9, 'a downed capsule lies on its side');
  } finally {
    assets.models.zombie1 = model;
  }
}

// ---------------------------------------------------------------------------
// Interpolation between snapshots.
// ---------------------------------------------------------------------------
{
  const rp = new RemotePlayer(new THREE.Scene(), { id: 'g1', name: 'Nikolai', c: 1, x: 0, z: 0 });
  rp.applyState(snapshot({ x: 0, yaw: 3.0 }), 0);
  rp.interpolate(0.1, DT, camera);
  rp.applyState(snapshot({ x: 2, yaw: -3.0 }), 0.0667);
  rp.interpolate(0.0667 + 0.0333, DT, camera);
  assert.ok(Math.abs(rp.x - 1) < 0.02, `halfway between snapshots at x 0 and 2 the teammate must be near x 1, got ${rp.x}`);
  assert.ok(Math.abs(rp.yaw) > 3.0, `yaw from 3.0 to -3.0 must turn the short way through pi, got ${rp.yaw}`);
  assert.ok(Math.abs(rp.group.rotation.y - (rp.yaw + Math.PI)) < 1e-9, 'the model faces +Z, so it turns half a circle from yaw');
  rp.interpolate(1, DT, camera);
  assert.equal(rp.x, 2, 'past the next snapshot the teammate holds its position');
}

// ---------------------------------------------------------------------------
// The clip follows the transmitted state.
// ---------------------------------------------------------------------------
{
  const rp = new RemotePlayer(new THREE.Scene(), { id: 'g1', name: 'Nikolai', c: 1 });
  const clock = { now: 0, frame: 0, z: 0 };
  const clipAfter = (state, speed) => { drive(rp, clock, 90, state, speed); return rp.visual.current; };
  assert.equal(clipAfter({}, 0), 'Idle');
  assert.equal(clipAfter({}, 1.4), 'Walk');
  assert.equal(clipAfter({}, 5.0), 'Run');
  assert.equal(clipAfter({ sprint: 1 }, 6.5), 'Run_Arms', 'a sprint swings the arms');
  assert.equal(clipAfter({ crouch: 2 }, 0.8), 'Crawl', 'prone crawls');
  assert.equal(clipAfter({ crouch: 1 }, 0), 'Idle');
  assert.ok(Math.abs(rp.group.position.y - (rp.y - 0.16)) < 1e-3, 'a crouch lowers the body by the residual hip drop');
  assert.equal(clipAfter({ down: 1 }, 0.3), 'Crawl', 'a downed teammate crawls');
  assert.equal(clipAfter({ dead: 1 }, 0), 'Death');
  assert.equal(rp.visual.weaponId, 'm1911', 'the soldier holds the weapon from the wire');
  drive(rp, clock, 8, { w: 'kar98', pap: 1 });
  assert.deepEqual([rp.visual.weaponId, rp.visual.weaponPap], ['kar98', true], 'a weapon change on the wire reaches the soldier');
  const muzzle = rp.muzzleWorld(new THREE.Vector3());
  assert.ok(muzzle && [muzzle.x, muzzle.y, muzzle.z].every(Number.isFinite), 'a soldier reports a muzzle for fire effects');
}

// ---------------------------------------------------------------------------
// The perk drink.
// ---------------------------------------------------------------------------
{
  const rp = new RemotePlayer(new THREE.Scene(), { id: 'g1', name: 'Nikolai', c: 1 });
  const clock = { now: 0, frame: 0, z: 0 };
  drive(rp, clock, 8);
  sounds.length = 0;
  assert.equal(rp.startPerkDrink('jug'), true);
  assert.equal(rp.startPerkDrink('speed'), false, 'one drink at a time');
  const { bottle } = rp.perkDrink;
  assert.ok(bottle.parent === rp.group && bottle.position.distanceTo(new THREE.Vector3(0.34, 0.7, -0.1)) < 1e-9,
    'the bottle is posed at the hip before its first frame');
  assert.deepEqual(sounds, ['drink']);
  let heard = [];
  let maxY = 0;
  const frames = Math.ceil(PERK_DRINK_TIMELINE.duration / DT) + 2;
  for (let i = 0; i < frames; i++) {
    const before = sounds.length;
    drive(rp, clock, 1);
    if (sounds.length > before) heard.push([sounds.at(-1), rp.perkDrink ? rp.perkDrink.elapsed : PERK_DRINK_TIMELINE.duration]);
    if (rp.perkDrink) maxY = Math.max(maxY, bottle.position.y);
  }
  heard = heard.map(([name, t]) => [name, Math.round(t * 10) / 10]);
  assert.deepEqual(heard.map(([name]) => name), ['bottle_break', 'belch'], 'the bottle breaks, then the teammate belches');
  assert.ok(Math.abs(heard[0][1] - PERK_DRINK_TIMELINE.breakAt) < 0.1 && Math.abs(heard[1][1] - PERK_DRINK_TIMELINE.belchAt) < 0.1,
    `the break and the belch follow the shared timeline, heard ${JSON.stringify(heard)}`);
  assert.ok(maxY > 1.5, 'the bottle is raised to the mouth');
  assert.ok(rp.perkDrink === null && bottle.parent === null, 'the bottle is gone when the drink ends');
}

// ---------------------------------------------------------------------------
// The host's authoritative loadout.
// ---------------------------------------------------------------------------
{
  const rp = new RemotePlayer(new THREE.Scene(), { id: 'g1', name: 'Nikolai', c: 1 });
  const owned = () => [...rp.ownedWeapons];
  assert.deepEqual(owned(), [['m1911', false]], 'a teammate starts with the pistol');
  rp.setAuthoritativeLoadout([{ id: 'kar98' }, { id: 'mp40', pap: true }, { id: 'fg42' }]);
  assert.deepEqual([owned(), rp.weaponId, rp.weaponPap], [[['kar98', false], ['mp40', true]], 'kar98', false], 'a loadout holds two weapons');
  assert.equal(rp.authorizeWeapon('fg42'), true);
  assert.deepEqual([owned(), rp.weaponId], [[['mp40', true], ['fg42', false]], 'fg42'], 'a third weapon replaces the one in hand');
  assert.equal(rp.authorizeWeapon(42), false, 'a weapon id must be a string');
  assert.deepEqual([rp.equipAuthorizedWeapon('mp40'), rp.weaponId, rp.weaponPap], [true, 'mp40', true]);
  assert.equal(rp.equipAuthorizedWeapon('kar98'), false, 'a weapon the host no longer lists cannot be equipped');
  rp.setAuthoritativeLoadout('not a loadout');
  assert.deepEqual([owned(), rp.weaponId], [[['m1911', false]], 'm1911'], 'a malformed loadout falls back to the pistol');
}

// ---------------------------------------------------------------------------
// Dispose.
// ---------------------------------------------------------------------------
{
  const scene = new THREE.Scene();
  const rp = new RemotePlayer(scene, { id: 'g1', name: 'Nikolai', c: 1 });
  rp.startPerkDrink('qr');
  rp.dispose(scene);
  assert.ok(!scene.children.includes(rp.group) && rp.visual === null && rp.perkDrink === null, 'dispose takes the teammate out of the scene');
}

console.log('remote player OK: soldier or capsule, interpolation the short way round, clips from the wire, the perk drink timeline, the authoritative loadout and dispose');
