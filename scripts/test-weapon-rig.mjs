// WeaponRig's finishes (js/weapons/rig-finish.js) and its reload and bolt
// animation (js/weapons/rig-reload.js), driven through the real rig.
// validate-weapon-finishes covers which materials a finish may touch, and
// validate-ads-sight-picture covers the ADS solve. This covers the rest:
//
// - equip() picks the finish: none for a stock gun, the living camo once
//   Pack-a-Punched, gold under GOLD STANDARD, and diamond for a Pack-a-Punched
//   gun under GOLD STANDARD or once when diamondNext asks for it. Re-equipping
//   drops the old finish, the camo is lit on the frame the weapon is built,
//   and the muzzle flash takes the finish's tint.
// - update() animates whichever finish is on, every frame.
// - The gold knife is gilded, and restored.
// - A reload and a bolt cycle move the parts and gloves they are about, then
//   put every one of them back exactly where the view-model authored it.
// - The action and the ADS stock tuck both move a part along the bore, and
//   neither undoes the other: a tucked bolt still cycles, stays tucked while
//   aimed, and is worked from its authored spot however it was first touched.
import assert from 'node:assert/strict';
import { THREE, loadGameModule } from './lib/headless-three.mjs';

const { WEAPONS, WeaponRig, getStats } = await loadGameModule('weapons.js');
const dt = 1 / 60;
const idle = { ads: false, moving: false, sprinting: false, sliding: false, mouseX: 0, mouseY: 0 };
const rig = new WeaponRig(new THREE.PerspectiveCamera(60, 16 / 9, 0.01, 10));
const frames = (n) => { for (let i = 0; i < n; i++) rig.update(dt, idle); };
const finish = () => ({ camo: !!rig.camo, gold: !!rig.goldCamo, diamond: !!rig.diamondCamo });
const flash = () => rig.flash.material.color.getHexString();
const NONE = { camo: false, gold: false, diamond: false };

// ---------------------------------------------------------------------------
// The finish equip() puts on a weapon
// ---------------------------------------------------------------------------
rig.equip('mp40', false);
assert.deepEqual(finish(), NONE, 'a stock weapon wears no finish');
assert.equal(flash(), 'ffffff', 'a stock weapon fires a white muzzle flash');

rig.equip('mp40', true);
assert.deepEqual(finish(), { ...NONE, camo: true }, 'a Pack-a-Punched weapon wears the living camo');
assert.ok(rig.camo.mats.length && rig.camo.mats.every((m) => m.emissive.getHex() !== 0),
  'the living camo must be lit on the frame the weapon is built, not a frame later');
assert.notEqual(flash(), 'ffffff', 'a Pack-a-Punched weapon tints its muzzle flash to the camo');

rig.equip('mp40', false);
assert.deepEqual(finish(), NONE, "re-equipping must drop the last weapon's finish");
assert.equal(flash(), 'ffffff', 're-equipping a stock weapon must take the tint off the flash');

rig.alwaysGold = true;
rig.equip('mp40', false);
assert.deepEqual(finish(), { ...NONE, gold: true }, 'GOLD STANDARD gilds a stock weapon');
rig.equip('mp40', true);
assert.deepEqual(finish(), { ...NONE, diamond: true }, 'Pack-a-Punching under GOLD STANDARD turns the weapon diamond');
assert.equal(flash(), 'd8ecff', 'a diamond weapon fires an icy muzzle flash');

rig.alwaysGold = false;
rig.diamondNext = true;
rig.equip('thompson', true);
assert.deepEqual(finish(), { ...NONE, diamond: true }, 'diamondNext turns the next Pack-a-Punched weapon diamond');
assert.equal(rig.diamondNext, false, 'diamondNext is spent by the equip that uses it');
rig.equip('thompson', true);
assert.deepEqual(finish(), { ...NONE, camo: true }, 'with diamondNext spent, Pack-a-Punch gives the living camo again');

rig.equip('thompson', false);
rig.applyGoldCamo(true);
assert.deepEqual(finish(), { ...NONE, gold: true }, 'applyGoldCamo(true) gilds the weapon in hand, as for a gold gun from the box');
rig.applyGoldCamo(false);
assert.deepEqual(finish(), NONE, 'applyGoldCamo(false) drops the gold sheen');

// ---------------------------------------------------------------------------
// update() animates the finish, every frame
// ---------------------------------------------------------------------------
rig.equip('mp40', true);
{
  const { camo } = rig;
  const glow = camo.mats.map((m) => m.emissive.getHex());
  const t0 = camo.t;
  frames(1);
  assert.equal(camo.t, t0 + dt * camo.style.speed, 'each frame advances the living camo at its palette speed');
  frames(30);
  assert.ok(camo.mats.some((m, i) => m.emissive.getHex() !== glow[i]), 'the living camo must shift colour as it plays');
}

rig.alwaysGold = true;
rig.equip('mp40', false);
{
  const gc = rig.goldCamo;
  const levels = new Set();
  let peak = 0;
  for (let i = 0; i < 240; i++) {        // four seconds, so at least one glint
    const t0 = gc.t;
    frames(1);
    assert.equal(gc.t, t0 + dt, 'each frame advances the gold sheen by dt');
    const level = gc.mats[0].emissiveIntensity;
    assert.ok(gc.mats.every((m) => m.emissiveIntensity === level), 'the sheen lights every gilded material alike');
    levels.add(level.toFixed(4));
    peak = Math.max(peak, level);
  }
  assert.ok(levels.size > 100, 'the gold sheen must breathe, not sit still');
  assert.ok(peak > 0.3, `the gold finish must glint within 3.5 seconds (peak emissive ${peak.toFixed(3)})`);
}

rig.equip('mp40', true);
{
  const dc = rig.diamondCamo;
  let peak = 0;
  for (let i = 0; i < 180; i++) {
    const t0 = dc.t;
    frames(1);
    assert.equal(dc.t, t0 + dt, 'each frame advances the diamond twinkle by dt');
    for (const m of dc.mats) peak = Math.max(peak, m.emissiveIntensity);
  }
  assert.ok(peak > 0.8, `diamond facets must twinkle (peak emissive ${peak.toFixed(3)})`);
}
rig.alwaysGold = false;

// ---------------------------------------------------------------------------
// The gold knife
// ---------------------------------------------------------------------------
rig.setKnifeGold(true);
assert.equal(rig.knifeGold, true);
assert.equal(rig.knifeBlade.material.color.getHexString(), 'd8b84a', 'the gold knife blade must be gold');
assert.ok(rig.knifeBlade.material.emissiveIntensity > 0, 'and glow');
assert.equal(rig.knifeTip.material, rig.knifeBlade.material, 'the tip must wear the blade finish');
rig.setKnifeGold(false);
assert.equal(rig.knifeGold, false);
assert.equal(rig.knifeBlade.material.color.getHexString(), '78808d', 'setKnifeGold(false) must put the steel back');
assert.equal(rig.knifeBlade.material.emissiveIntensity, 0, 'and stop the glow');

// ---------------------------------------------------------------------------
// Reloads and bolt cycles move their parts, then put every one back
// ---------------------------------------------------------------------------
/** Local transform and visibility of every part and everything under it, fingers included. */
function pose() {
  const out = [];
  for (const [name, part] of Object.entries(rig.current.parts)) {
    part.traverse((o) => out.push({ name, p: o.position.clone(), q: o.quaternion.clone(), visible: o.visible }));
  }
  return out;
}
/** Names of the parts that are not where `before` had them. */
function displaced(before) {
  const now = pose();
  assert.equal(now.length, before.length);
  return [...new Set(now.filter((n, i) => {
    const b = before[i];
    return n.p.distanceTo(b.p) > 1e-9 || 1 - Math.abs(n.q.dot(b.q)) > 1e-12 || n.visible !== b.visible;
  }).map((n) => n.name))];
}
/** Frames to run for `share` of a reload of the weapon in hand. */
const into = (share) => Math.round(share * getStats(rig.current.id, rig.current.pap).reload / dt);

let cycles = 0;
for (const id of Object.keys(WEAPONS)) {
  for (const pap of [false, true]) {
    const label = `${id}${pap ? ' (PaP)' : ''}`;
    rig.equip(id, pap);
    frames(25);
    const authored = pose();
    rig.startReload(getStats(id, pap).reload);
    for (let guard = 0; rig.isReloading; guard++) {
      assert.ok(guard < 600, `${label}: the reload never finished`);
      frames(1);
    }
    frames(1);
    assert.deepEqual(displaced(authored), [], `${label}: a reload must put every part and glove back where it was authored`);
    rig.cycleBolt();
    frames(Math.ceil(0.62 / dt) + 2);
    assert.deepEqual(displaced(authored), [], `${label}: a bolt cycle must put every part and glove back where it was authored`);
    cycles += 2;
  }
}

// ...and in between, the animation actually happens. Each check starts from an
// idle rig: equip() cuts a reload short but lets a bolt cycle run on into the
// next weapon, so the last check's animation is left to finish first.
const equipIdle = (id) => {
  frames(45);
  rig.equip(id, false);
  frames(25);
};
equipIdle('mp40');
{
  const hand = rig.current.parts.hand_l;
  const from = hand.position.clone();
  rig.startReload(getStats('mp40', false).reload);
  frames(into(0.3));
  assert.ok(hand.position.distanceTo(from) > 0.02, 'mid-reload the support glove must go to the magazine');
}
equipIdle('mg42');
{
  const drum = rig.current.parts.drum;
  const y = drum.position.y;
  rig.startReload(getStats('mg42', false).reload);
  frames(into(0.3));
  assert.ok(y - drum.position.y > 0.05, 'mid-reload the MG42 drum must drop out');
}
equipIdle('dbshotgun');
rig.startReload(getStats('dbshotgun', false).reload);
frames(into(0.3));
assert.ok(rig.current.parts.barrels.rotation.x > 0.3, 'mid-reload the double-barrel must break open');
equipIdle('kar98');
{
  const bolt = rig.current.parts.bolt;
  const z = bolt.position.z;
  rig.cycleBolt();
  frames(Math.round(0.31 / dt));
  assert.ok(bolt.position.z - z > 0.05, 'mid-cycle the Kar98k bolt must be drawn back');
}
equipIdle('mosin');
{
  const { bolt_h: handle, bolt_knob: knob } = rig.current.parts;
  const handleZ = handle.position.z;
  const knobZ = knob.position.z;
  rig.cycleBolt();
  frames(Math.round(0.31 / dt));
  assert.ok(handle.position.z - handleZ > 0.05, 'mid-cycle the Mosin bolt handle must be drawn back');
  assert.ok(knob.position.z - knobZ > 0.05, 'and its knob must go with it, not stay behind on the receiver');
}
equipIdle('trench');
{
  const { pump, hand_l: hand } = rig.current.parts;
  const z = pump.position.z;
  const handZ = hand.position.z;
  rig.cycleBolt();
  frames(Math.round(0.31 / dt));
  assert.ok(pump.position.z - z > 0.05, 'mid-cycle the Trench Gun pump must rack back');
  assert.ok(hand.position.z - handZ > 0.05, 'and the hand on it must go with it');
}

// The Kar98k's bolt sits wholly behind its sight, so aiming tucks it back past
// the lens with the stock. The action and the tuck both move it along the bore,
// and neither may undo the other: the tuck used to reset the bolt every frame,
// so it never cycled, and the first aimed shot taught the rig the tucked spot as
// the bolt's home, so the next reload worked it from behind the camera.
equipIdle('kar98');
{
  const aimed = { ...idle, ads: true };
  const bolt = rig.current.parts.bolt;
  const authored = bolt.position.z;
  for (let i = 0; i < 60; i++) rig.update(dt, aimed);
  const tucked = bolt.position.z;
  assert.ok(tucked - authored > 0.05, 'aimed, the Kar98k bolt must tuck back with the stock');
  rig.cycleBolt();
  for (let i = 0; i < Math.round(0.31 / dt); i++) rig.update(dt, aimed);
  assert.ok(bolt.position.z - tucked > 0.05, 'an aimed bolt cycle must draw the bolt back on top of the tuck');
  for (let i = 0; i < 40; i++) rig.update(dt, aimed);
  assert.ok(Math.abs(bolt.position.z - tucked) < 1e-4, 'and leave it tucked when the cycle ends');
  frames(60);
  assert.ok(Math.abs(bolt.position.z - authored) < 1e-9, 'lowered, the bolt must be back where it was authored');
  rig.startReload(getStats('kar98', false).reload);
  frames(into(0.75));
  assert.ok(Math.abs(bolt.position.z - (authored + 0.07)) < 0.005,
    'a reload after an aimed shot must work the bolt from where it was authored, not from its tucked spot');
  rig.startPerkDrink('jug');
  frames(1);
  assert.ok(Math.abs(bolt.position.z - authored) < 1e-9, 'a reload cut short by a perk drink must not leave the bolt drawn back');
}

console.log(`WeaponRig OK: finishes picked, dropped and animated, the gold knife, and ${cycles} reloads and bolt cycles `
  + `across ${Object.keys(WEAPONS).length} weapons that put every part and glove back.`);
