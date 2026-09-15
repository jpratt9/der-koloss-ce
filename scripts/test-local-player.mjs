// The local player, driven frame by frame on the real map.
//
// js/player/local.js and js/player/local-movement.js hold LocalPlayer, and no
// other validator runs it: the ones that cover it read its text. A name a module
// forgot to import, or a method left out of the mixin install, would throw only
// in the middle of a match. This runs every method, as game.js does, with the
// keys a player would press:
// - speed: walking, sprinting, aiming, crouching and prone, and letting go stops
// - a slide launches faster than the sprint and ends crouched while C is held
// - the stance machine: tap to crouch and back, hold for prone, sprint out
// - a jump leaves the floor and lands; a ledge in reach is mantled instead
// - a sprint into a wall never ends inside a collider or outside the rooms
// - going down mid-slide parks the body, stashes the loadout and ends the slide;
//   Quick Revive's self-revive gives it back; a bleedout kills
// - points, the loadout, perks, regen, the magazine clamp and serialize()
import assert from 'node:assert/strict';
import { loadGameModule } from './lib/headless-three.mjs';
import { buildHeadlessMap, seedRandom } from './lib/headless-map.mjs';

const { map } = await buildHeadlessMap();
const { LocalPlayer } = await loadGameModule('player.js');
const { input } = await loadGameModule('input.js');
const { audio } = await loadGameModule('audio.js');
const { CFG } = await loadGameModule('config.js');
const { getStats } = await loadGameModule('weapons.js');
seedRandom(0x10ca1);

const sounds = [];
audio.play = (name) => { sounds.push(name); };

const DT = 1 / 60;
// A straight run across the factory floor that nothing blocks for a slide.
const OPEN_FLOOR = { x: 0, z: -52, yaw: 3 * Math.PI / 4 };
// On the ground west of the mainframe platform, facing the 0.9 m step up onto it.
const BELOW_PLATFORM = { x: -6.5, z: 16.4, yaw: 3 * Math.PI / 2 };

function makeGame() {
  const calls = [];
  return {
    calls,
    map, options: { sensitivity: 1, invertY: false }, mode: 'solo', qrSelfRevives: 1, godMode: false, time: 0,
    weaponRig: { isReloading: false, papHide: false, equip: (id, pap) => calls.push(`equip ${id} ${pap}`) },
    hud: { setPerks: () => {}, banner: (text) => calls.push(`banner ${text}`) },
    fx: { damageFlash: () => {}, shake: () => {} },
    netSend: (msg) => calls.push(`net ${msg.t}`),
    onPlayerDown: () => calls.push('down'),
    onPlayerDead: () => calls.push('dead'),
  };
}

/** A player standing at `at` ({x, z, yaw}), or at the solo spawn on the mainframe platform. */
function makePlayer(at = null) {
  const spot = at || { ...map.playerSpawns[0], yaw: 0 };
  const p = new LocalPlayer('local', 'Test', 0, { x: spot.x, z: spot.z });
  p.y = map.floorY(spot.x, spot.z, at ? 0 : 2);
  p.yaw = spot.yaw;
  p.events = [];
  p.onSlideStart = () => p.events.push('slideStart');
  p.onSlideEnd = (crouched) => p.events.push(`slideEnd ${crouched}`);
  p.onMantle = () => p.events.push('mantle');
  return p;
}

/** Run `frames` frames with `keys` held. `press` goes down on the first frame only; `rmb` holds aim. */
function run(p, game, frames, { keys = [], press = [], rmb = false, each } = {}) {
  for (let i = 0; i < frames; i++) {
    input.keys = Object.fromEntries(keys.map((k) => [k, true]));
    input.pressed = Object.fromEntries((i === 0 ? press : []).map((k) => [k, true]));
    input.mouseDX = 0;
    input.mouseDY = 0;
    input.rmbDown = rmb;
    game.time += DT;
    p.update(DT, game);
    each?.(i);
  }
}

// ---------------------------------------------------------------------------
// Speed: walking, sprinting, aiming, crouching and prone each set the speed the
// body accelerates to, and letting go stops it.
// ---------------------------------------------------------------------------
{
  const game = makeGame();
  const move = getStats('m1911', false).move ?? 1;
  const speedAfter = (opts, setup) => {
    const p = makePlayer(OPEN_FLOOR);
    setup?.(p);
    run(p, game, 30, opts);
    return p;
  };
  const walk = speedAfter({ keys: ['KeyW'] });
  assert.ok(Math.abs(walk.speed2D - CFG.WALK_SPEED * move) < 1e-6, `walking must reach walk speed, got ${walk.speed2D}`);
  assert.ok(Math.hypot(walk.x - OPEN_FLOOR.x, walk.z - OPEN_FLOOR.z) > 1.5, 'half a second of walking must cover ground');
  run(walk, game, 5);
  assert.equal(walk.speed2D, 0, 'letting go must stop the player');
  assert.equal(speedAfter({ keys: ['KeyW', 'ShiftLeft'] }).maxSpeed, CFG.SPRINT_SPEED * move, 'sprint speed');
  assert.equal(speedAfter({ keys: ['KeyW'], rmb: true }).maxSpeed, CFG.ADS_SPEED * move, 'aiming slows to ADS speed');
  assert.equal(speedAfter({ keys: ['KeyW', 'ShiftLeft'], rmb: true }).sprinting, false, 'aiming blocks the sprint');
  assert.equal(speedAfter({ keys: ['KeyW'] }, (p) => { p.stance = 1; }).maxSpeed, CFG.WALK_SPEED * move * 0.55, 'crouch speed');
  assert.equal(speedAfter({ keys: ['KeyW'] }, (p) => { p.stance = 2; }).maxSpeed, CFG.WALK_SPEED * move * 0.22, 'prone speed');
  game.weaponRig.isReloading = true;
  assert.equal(speedAfter({ keys: ['KeyW', 'ShiftLeft'] }).maxSpeed, CFG.WALK_SPEED, 'a reload holds a sprint to walk speed');
}

// ---------------------------------------------------------------------------
// A slide launches past sprint speed and, with C still held, ends crouched.
// ---------------------------------------------------------------------------
{
  const game = makeGame();
  const p = makePlayer(OPEN_FLOOR);
  run(p, game, 60, { keys: ['KeyW', 'ShiftLeft'] });
  assert.ok(p.sprinting && p.speed2D > CFG.WALK_SPEED * 1.1, 'the run-up must be a sprint');
  run(p, game, 1, { keys: ['KeyW', 'ShiftLeft', 'KeyC'], press: ['KeyC'] });
  assert.ok(p.sliding, 'pressing C mid-sprint must start a slide');
  assert.ok(p.speed2D > CFG.SPRINT_SPEED, `a slide must launch faster than the sprint, got ${p.speed2D}`);
  let frames = 1;
  run(p, game, 90, { keys: ['KeyW', 'ShiftLeft', 'KeyC'], each: () => { if (p.sliding) frames++; } });
  assert.deepEqual(p.events, ['slideStart', 'slideEnd true'], 'one slide, ended crouched');
  assert.ok(frames >= 30 && frames <= 66, `a slide must run most of a second, ran ${frames} frames`);
  assert.equal(p.stance, 1, 'holding C through the slide must leave the player crouched');
}

// ---------------------------------------------------------------------------
// The stance machine is latched: tap to toggle crouch, hold for prone.
// ---------------------------------------------------------------------------
{
  const game = makeGame();
  const p = makePlayer(OPEN_FLOOR);
  const tap = () => { run(p, game, 8, { keys: ['KeyC'], press: ['KeyC'] }); run(p, game, 1); };
  tap();
  assert.equal(p.stance, 1, 'a tap of C crouches');
  tap();
  assert.equal(p.stance, 0, 'a second tap stands back up');
  run(p, game, 40, { keys: ['KeyC'], press: ['KeyC'] });
  assert.equal(p.stance, 2, 'holding C drops prone');
  run(p, game, 20);
  assert.equal(p.stance, 2, 'letting go of C must not stand the player out of prone');
  tap();
  assert.equal(p.stance, 1, 'a tap from prone comes up to a crouch');
  run(p, game, 40, { keys: ['KeyC'], press: ['KeyC'] });
  run(p, game, 1);
  run(p, game, 2, { keys: ['KeyW', 'ShiftLeft'] });
  assert.equal(p.stance, 0, 'sprinting breaks prone');
  run(p, game, 60);
  assert.ok(Math.abs(p.eyeHeight - CFG.EYE_HEIGHT) < 0.01, `standing eye height must settle at ${CFG.EYE_HEIGHT}, got ${p.eyeHeight}`);
}

// ---------------------------------------------------------------------------
// A jump leaves the floor and lands. A ledge in reach is mantled instead.
// ---------------------------------------------------------------------------
{
  const game = makeGame();
  const p = makePlayer(OPEN_FLOOR);
  run(p, game, 5);
  assert.equal(p._findMantle(game), null, 'the jump spot must have no ledge in reach for this to test a jump');
  const floor = p.y;
  run(p, game, 1, { press: ['Space'] });
  assert.ok(p.velY > 0 && !p.grounded && p.y > floor, 'Space must leave the floor');
  run(p, game, 60);
  assert.ok(p.grounded && Math.abs(p.y - floor) < 1e-6, 'the jump must land back on the floor');
  assert.ok(p.landImpact > 0, 'landing must hand the camera rig an impact');

  const q = makePlayer(BELOW_PLATFORM);
  run(q, game, 5);
  const top = map.floorY(q.x + 1, q.z, 2);
  run(q, game, 1, { keys: ['KeyW'], press: ['Space'] });
  assert.deepEqual(q.events, ['mantle'], 'Space facing a ledge in reach must mantle');
  assert.ok(q.mantling, 'the mantle plays out as an arc');
  run(q, game, 60, { keys: ['KeyW'] });
  assert.equal(q.mantling, null, 'the mantle must finish within a second');
  assert.ok(q.grounded && Math.abs(q.y - top) < 1e-6, `the mantle must stand the player on the platform at ${top}, got ${q.y}`);
  assert.ok(q.x > BELOW_PLATFORM.x + 0.5 && map.roomAt(q.x, q.z, q.y), 'the mantle must carry the player over the ledge and inside a room');
}

// ---------------------------------------------------------------------------
// A sprint into a wall never ends inside a collider, or outside the rooms.
// ---------------------------------------------------------------------------
{
  const game = makeGame();
  const p = makePlayer();
  let slowest = Infinity;
  run(p, game, 300, {
    keys: ['KeyW', 'ShiftLeft'],
    each: (i) => {
      if (i > 30) slowest = Math.min(slowest, p.speed2D);
      assert.ok(map.roomAt(p.x, p.z, p.y), `frame ${i}: the player left the rooms at ${p.x}, ${p.z}`);
      for (const c of p._activeMapColliders(game)) {
        const dx = p.x - Math.max(c.minX, Math.min(c.maxX, p.x));
        const dz = p.z - Math.max(c.minZ, Math.min(c.maxZ, p.z));
        assert.ok(Math.hypot(dx, dz) >= CFG.PLAYER_RADIUS - 1e-3, `frame ${i}: the player is inside a collider at ${p.x}, ${p.z}`);
      }
    },
  });
  assert.ok(slowest < CFG.SPRINT_SPEED * 0.5, 'the sprint must reach a wall for this to test anything');
}

// ---------------------------------------------------------------------------
// Going down mid-slide, the self-revive, and a bleedout.
// ---------------------------------------------------------------------------
{
  const game = makeGame();
  const p = makePlayer(OPEN_FLOOR);
  p.giveWeapon('mp40');
  const loadout = p.weapons;
  p.perks.add('qr');
  p.perks.add('jug');
  run(p, game, 60, { keys: ['KeyW', 'ShiftLeft'] });
  run(p, game, 5, { keys: ['KeyW', 'ShiftLeft', 'KeyC'], press: ['KeyC'] });
  assert.ok(p.sliding, 'the player must be mid-slide when downed');
  sounds.length = 0;
  p.damage(9999, game);
  assert.ok(p.down && p.hp === 0, 'lethal damage downs the player');
  assert.equal(p.perks.size, 0, 'perks are lost at the down');
  assert.ok(p.selfReviveAvailable, 'solo Quick Revive with a charge left arms the self-revive');
  assert.deepEqual([p.vx, p.vz, p.speed2D, p.moving, p.sprinting, p.strafeInput, p.sliding], [0, 0, 0, false, false, 0, false],
    'going down must park the motion state the camera rig reads');
  assert.equal(p.events.at(-1), 'slideEnd false', 'going down must end the slide');
  assert.deepEqual(p.weapons, [{ id: 'm1911', pap: false, mag: 8, reserve: 80 }], 'a downed player fights with the starting pistol');
  assert.equal(p._stashedWeapons, loadout, 'the real loadout is stashed whole');
  assert.ok(game.calls.includes('equip m1911 false') && game.calls.includes('down') && sounds.includes('down'),
    'going down equips the pistol, tells the game and plays the down sound');

  p.weapons[0].reserve = 3;
  p.refillAmmo();
  assert.equal(p.weapons[0].reserve, 3, 'Max Ammo must not top up the down pistol');
  const where = { x: p.x, z: p.z };
  run(p, game, 60, { keys: ['KeyW'] });
  assert.deepEqual({ x: p.x, z: p.z }, where, 'a downed player does not move');
  assert.ok(p.eyeHeight < 1, 'the eye eases down toward the floor');

  run(p, game, 8 * 60);
  assert.ok(!p.down && !p.dead, 'Quick Revive stands the player up after 8 s');
  assert.equal(p.weapons, loadout, 'the self-revive gives the stashed loadout back');
  assert.equal(p.hp, CFG.BASE_HP, 'the revive restores full health');
  assert.equal(game.qrSelfRevives, 0, 'the self-revive spends its charge');
  assert.ok(game.calls.includes('banner REVIVED') && game.calls.includes('net revive_self') && sounds.includes('revive'),
    'the self-revive shows the banner, tells the peers and plays the revive sound');

  p.damage(9999, game);
  assert.ok(p.down && !p.selfReviveAvailable, 'without Quick Revive there is no self-revive');
  run(p, game, Math.ceil(CFG.BLEEDOUT_TIME * 60) + 2);
  assert.ok(p.dead && !p.down && game.calls.at(-1) === 'dead', 'the bleedout kills the player');
  assert.equal(p._stashedWeapons, null, 'death drops the stashed loadout');
  const hp = p.hp;
  p.damage(50, game);
  assert.equal(p.hp, hp, 'a dead player takes no damage');
}

// ---------------------------------------------------------------------------
// Points, the loadout, perks, regen, the magazine clamp and serialize().
// ---------------------------------------------------------------------------
{
  const game = makeGame();
  const p = makePlayer();
  assert.equal(p.points, CFG.START_POINTS);
  assert.equal(p.addPoints(50, true), 100, 'Double Points doubles a reward');
  assert.equal(p.addPoints(-30, true), -30, 'Double Points does not double a cost');
  assert.equal(p.spend(10_000), false, 'a purchase the player cannot afford fails');
  assert.equal(p.spend(70), true);
  assert.equal(p.points, CFG.START_POINTS + 100 - 30 - 70);

  assert.equal(p.giveWeapon('kar98').id, 'kar98');
  assert.deepEqual([p.weapons.length, p.cur], [2, 1], 'the second weapon takes the empty slot');
  p.giveWeapon('mg42', true);
  assert.deepEqual(p.weapons.map((w) => w.id), ['m1911', 'mg42'], 'a third weapon replaces the one in hand');
  assert.equal(p.weapon.mag, getStats('mg42', true).mag, 'a new weapon comes full');

  p.weapon.mag = 999;
  run(p, game, 1);
  assert.equal(p.weapon.mag, getStats('mg42', true).mag, 'a magazine is clamped to its variant before firing');
  p.weapons[0].reserve = 0;
  p.grenades = 0;
  p.ownsMonkeys = true;
  p.refillAmmo();
  assert.deepEqual([p.weapons[0].reserve, p.grenades, p.monkeys], [getStats('m1911').reserve, 4, 2], 'Max Ammo refills reserves, grenades and monkeys');

  p.perks.add('jug');
  p.perks.add('speed');
  p.perks.add('dtap');
  assert.deepEqual([p.maxHpNow, p.reloadMult, p.rpmMult], [CFG.JUG_HP, 0.5, 1.33], 'perks change health, reload and fire rate');

  game.godMode = true;
  p.damage(100, game);
  assert.equal(p.hp, CFG.BASE_HP, 'god mode ignores damage');
  game.godMode = false;
  sounds.length = 0;
  p.damage(100, game);
  assert.ok(p.hp === CFG.BASE_HP - 100 && sounds.includes('hurt'), 'damage hurts');
  run(p, game, Math.ceil(CFG.REGEN_DELAY * 60) - 5);
  assert.equal(p.hp, CFG.BASE_HP - 100, 'health waits out the regen delay');
  run(p, game, 10 * 60);
  assert.equal(p.hp, CFG.JUG_HP, 'health regenerates up to the perked maximum');

  assert.equal(p.canFire(game), true);
  game.weaponRig.isReloading = true;
  assert.equal(p.canFire(game), false, 'a reload blocks firing');
  game.weaponRig.isReloading = false;

  const s = p.serialize();
  assert.deepEqual([s.id, s.name, s.w, s.pap, s.hp, s.down, s.dead, s.crouch], ['local', 'Test', 'mg42', 1, CFG.JUG_HP, 0, 0, 0]);
  assert.deepEqual(s.perks.sort(), ['dtap', 'jug', 'speed']);
  assert.ok(Math.abs(s.x - p.x) <= 0.005 && Math.abs(s.z - p.z) <= 0.005, 'serialize() rounds position to the centimetre');
}

console.log('local player OK: speeds, slide, stances, jump and mantle, wall collisions, down/self-revive/bleedout, points, loadout, perks, regen and serialize');
