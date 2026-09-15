// The co-op soldier, built and animated from the shipped rig.
//
// SoldierVisual is js/player/soldier.js, with its pose layer and held weapon in
// soldier-pose.js and soldier-weapon.js and its skin in atlas.js. No other
// validator builds one: validate-remote-avatar reads the text. A name one of
// those modules forgot to import would throw on the first teammate a match
// draws. This builds every persona and drives it:
// - each persona builds to the same uniform scale, with legs measured, arms
//   solved onto the rifle, fists closed and the tongue retracted; without gear
//   it skips the arm pose and the uniform
// - the pose layer restores the clip before the mixer runs, so a frame's
//   corrections never stack onto the last frame's
// - aim pitches the head and the weapon, crouch bends the body instead of
//   squashing it, and the arms let go for a death and come back for a walk
// - a held weapon is flattened to one mesh per material, sits in the right
//   fist, is cached per id and PaP, and hides with distance
// - the atlas recolours the corpse texture into skin and paints an eye into the
//   patch SoldierFace.js maps the sockets to, once per persona
import assert from 'node:assert/strict';
import { THREE, loadGameModule } from './lib/headless-three.mjs';
import { seedRandom } from './lib/headless-map.mjs';
import { loadZombieModels } from './lib/headless-zombies.mjs';

const assets = await loadZombieModels();
const { SoldierVisual } = await loadGameModule('player.js');
const { soldierAtlas } = await loadGameModule('player', 'atlas.js');
const { EYE_PATCH } = await loadGameModule('render', 'SoldierFace.js');
seedRandom(0x501d1e5);

const DT = 1 / 60;
const worldPos = (o) => o.getWorldPosition(new THREE.Vector3());
const worldQuat = (o) => o.getWorldQuaternion(new THREE.Quaternion());

/** A soldier that has played `clip` for `frames` frames, with `setup` applied first. */
function animated(variant, clip, frames, setup) {
  const v = new SoldierVisual(variant);
  v.play(clip);
  setup?.(v);
  for (let i = 0; i < frames; i++) v.update(DT);
  v.group.updateMatrixWorld(true);
  return v;
}

// ---------------------------------------------------------------------------
// Every persona builds to the same calibrated scale, fitted and posed.
// ---------------------------------------------------------------------------
const scales = [];
for (const variant of [0, 1, 2, 3]) {
  const v = new SoldierVisual(variant);
  assert.ok(v.ok, `persona ${variant} must build`);
  const { x, y, z } = v.inner.scale;
  assert.ok(x === y && y === z && y > 0 && Number.isFinite(y), `persona ${variant} must be scaled uniformly, got ${x}, ${y}, ${z}`);
  scales.push(y);
  assert.ok(v.legLengths?.length === 2 && v.legLengths.every((l) => l > 0 && Number.isFinite(l)), 'the leg IK needs both segment lengths');
  assert.deepEqual(Object.keys(v.armPose).sort(), ['LowerArmL', 'LowerArmR', 'UpperArmL', 'UpperArmR'], 'both arms are solved onto the rifle');
  assert.equal(Object.keys(v.handPose).length, 22, 'every finger joint of both fists is closed');
  assert.equal(v.bones.Tongue1.scale.x, 0.001, 'the tongue chain is retracted');
  assert.ok(v.gear && v.weaponAnchor && v.weaponPitch?.parent === v.weaponAnchor, 'the uniform and the weapon mount are attached');
}
assert.equal(new Set(scales).size, 1, `every marine is authored to one height, so all four must calibrate alike: ${scales.join(', ')}`);
{
  const v = new SoldierVisual(1, { gear: false });
  assert.ok(v.ok && v.armPose === null && v.gear === null && v.handPose === undefined, 'a gearless soldier skips the arm pose and the uniform');
  assert.ok(v.weaponAnchor, 'a gearless soldier still has a weapon mount');
}

// ---------------------------------------------------------------------------
// The pose layer never stacks. update() puts the clip pose back before the
// mixer runs, so re-applying the same frame must land on the same pose.
// ---------------------------------------------------------------------------
{
  const v = animated(0, 'Idle', 120);
  v.update(0);
  // Compared component by component: the solved arm quaternions are not unit
  // length, and angleTo() reads that as a rotation.
  const first = Object.values(v.bones).map((b) => b.quaternion.toArray());
  for (let i = 0; i < 300; i++) v.update(0);
  const drift = Math.max(...Object.values(v.bones).flatMap((b, i) => b.quaternion.toArray().map((c, k) => Math.abs(c - first[i][k]))));
  assert.ok(drift < 1e-6, `re-applying one frame 300 times moved a bone quaternion by ${drift}: the corrections are stacking`);
}

// ---------------------------------------------------------------------------
// Aim, crouch and the arms.
// ---------------------------------------------------------------------------
{
  const facing = (v) => new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuat(v.bones.Head)).y;
  const up = animated(0, 'Idle', 30, (v) => v.setAim(1));
  const down = animated(0, 'Idle', 30, (v) => v.setAim(-1));
  assert.ok(facing(up) > 0.5 && facing(down) < -0.5, 'aiming up and down must pitch the head with it');
  assert.ok(Math.abs(up.weaponPitch.rotation.x - 0.3 * up.armWeight) < 1e-9, 'the weapon leads the aim the spine did not take');

  const standing = animated(0, 'Idle', 30);
  const crouched = animated(0, 'Idle', 30, (v) => v.setCrouch(1));
  assert.ok(worldPos(crouched.bones.Head).y < worldPos(standing.bones.Head).y, 'a crouch must lower the head');
  assert.ok(crouched.inner.scale.equals(standing.inner.scale), 'a crouch bends the body, it never squashes the model');

  const v = new SoldierVisual(3);
  v.setAim(9);
  v.setCrouch(-3);
  assert.deepEqual([v.aimPitch, v.crouch], [1.3, 0], 'aim and crouch are clamped');
  v.setAim(undefined);
  assert.equal(v.aimPitch, 0);

  v.play('Death', { loop: false });
  for (let i = 0; i < 60; i++) v.update(DT);
  assert.ok(v.current === 'Death' && v.armWeight < 0.01, `a dying soldier drops the carry pose, armWeight ${v.armWeight}`);
  v.play('Walk');
  for (let i = 0; i < 60; i++) v.update(DT);
  assert.ok(v.armWeight > 0.99, `walking brings the rifle back up, armWeight ${v.armWeight}`);
  v.play('NoSuchClip');
  assert.equal(v.current, 'Walk', 'a clip the rig does not have changes nothing');
}

// ---------------------------------------------------------------------------
// The held weapon.
// ---------------------------------------------------------------------------
{
  const v = animated(2, 'Idle', 10);
  v.setWeapon('m1911');
  const pistol = v.weaponGroup;
  assert.ok(pistol.parent === v.weaponPitch && pistol.userData.cls === 'pistol', 'the pistol hangs off the aim node');
  const materials = pistol.children.filter((o) => o.isMesh).map((o) => o.material);
  assert.equal(new Set(materials).size, materials.length, 'a held weapon is flattened to one mesh per material');
  v.group.updateMatrixWorld(true);
  const reach = v.muzzleWorld().distanceTo(worldPos(v.bones.Middle1R));
  assert.ok(reach > 0.05 && reach < 0.6, `the muzzle must sit just past the right fist, found it ${reach.toFixed(3)} m away`);
  assert.deepEqual(pistol.position.toArray(), [0, -0.005, 0], 'a pistol sits in the fist');

  v.setWeapon('kar98');
  const rifle = v.weaponGroup;
  assert.deepEqual([rifle.userData.cls, ...rifle.position.toArray()], ['rifle', 0, -0.02, 0.15], 'a long gun is pulled back into the body');
  assert.equal(pistol.parent, null, 'the previous weapon is taken out of the hand');
  v.setWeapon('m1911');
  assert.equal(v.weaponGroup, pistol, 'switching back reuses the cached build');
  v.setWeapon('kar98', true);
  assert.ok(v.weaponGroup !== rifle && v.weaponPap === true, 'the PaP variant is cached separately');

  v.setLOD(10);
  assert.equal(v.lod, 0);
  v.setLOD(20);
  assert.equal(v.lod, 1);
  v.setLOD(40);
  assert.ok(v.lod === 2 && v.weaponGroup.visible === false, 'a distant soldier hides his weapon');
  v.setLOD(10);
  assert.equal(v.weaponGroup.visible, true);

  v.setWeapon(null);
  assert.ok(v.weaponGroup === null && v.weaponId === null && v.muzzle === null, 'no weapon means no held group');
  assert.ok(v.muzzleWorld().distanceTo(worldPos(v.bones.Middle1R)) < 0.3, 'with no weapon the muzzle falls back to the fist');
  v.dispose();
  assert.ok(v.gear === null && v._weaponCache === null && v.weaponGroup === null, 'dispose drops the gear and the weapon cache');
}

// ---------------------------------------------------------------------------
// The skin atlas.
// ---------------------------------------------------------------------------
{
  assert.equal(soldierAtlas(0), null, 'with no texture on the rig there is nothing to recolour');

  // A texture for the rig, and a canvas whose pixels are corpse green,
  // highlights, shadow and cloth.
  const skin = assets.models.zombie1.scene.getObjectByProperty('isSkinnedMesh', true);
  skin.material.map = Object.assign(new THREE.Texture(), { image: { width: 64, height: 64 } });
  const isGreen = (d, i) => d[i + 1] > d[i] * 1.12 && d[i + 1] > d[i + 2] * 1.12;
  const log = { canvases: 0, greenIn: 0, greenOut: -1, eyeArcs: 0 };
  const baseCreate = document.createElement;
  document.createElement = (tag) => {
    if (tag !== 'canvas') return baseCreate(tag);
    log.canvases++;
    const canvas = { width: 0, height: 0 };
    const gradient = () => ({ addColorStop() {} });
    const noop = () => {};
    const ctx = {
      canvas, drawImage: noop, save: noop, restore: noop, beginPath: noop, closePath: noop, rect: noop, clip: noop,
      fill: noop, stroke: noop, moveTo: noop, quadraticCurveTo: noop, fillRect: noop,
      createRadialGradient: gradient, createLinearGradient: gradient,
      getImageData: (x, y, w, h) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < w * h; i++) {
          const o = i * 4, k = i % 8;
          data.set(k < 4 ? [60, 118, 52, 255] : k < 5 ? [240, 238, 232, 255] : k < 6 ? [20, 18, 16, 255] : [124, 104, 96, 255], o);
          if (isGreen(data, o)) log.greenIn++;
        }
        return { width: w, height: h, data };
      },
      // Only the texels that were corpse green: the undershirt is allowed to come out olive.
      putImageData: (d) => { log.greenOut = 0; for (let i = 0; i * 4 < d.data.length; i += 1) if (i % 8 < 4 && isGreen(d.data, i * 4)) log.greenOut++; },
      arc: (x, y) => {
        const u = x / canvas.width, v = y / canvas.height;
        if (u >= EYE_PATCH.u0 && u <= EYE_PATCH.u1 && v >= EYE_PATCH.v0 && v <= EYE_PATCH.v1) log.eyeArcs++;
      },
    };
    canvas.getContext = () => ctx;
    return canvas;
  };
  try {
    const tex = soldierAtlas(0);
    assert.ok(tex?.isCanvasTexture && tex.colorSpace === THREE.SRGBColorSpace && tex.flipY === false, 'the atlas is an sRGB canvas texture in GLTF orientation');
    assert.ok(log.greenIn > 0 && log.greenOut === 0, `the recolour must turn every corpse-green texel into skin, ${log.greenOut} left`);
    assert.ok(log.eyeArcs >= 2, 'an iris and a pupil must be painted inside the eye patch');
    assert.equal(soldierAtlas(4), tex, 'a variant past the fourth wraps to the same persona, from the cache');
    assert.notEqual(soldierAtlas(1), tex, 'each persona gets its own atlas');
    assert.equal(log.canvases, 2, 'the atlas is painted once per persona');
    const v = new SoldierVisual(1);
    const maps = [];
    v.inner.traverse((o) => { if (o.isSkinnedMesh) maps.push(o.material.map); });
    assert.ok(maps.length && maps.every((m) => m === soldierAtlas(1)), 'a soldier wears his persona\'s atlas');
  } finally {
    document.createElement = baseCreate;
  }
}

console.log('soldier visual OK: four personas calibrated alike, a pose layer that never stacks, aim, crouch and arms, flattened cached weapons with LOD, and the per-persona skin atlas');
