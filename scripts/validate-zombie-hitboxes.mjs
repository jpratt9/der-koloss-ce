#!/usr/bin/env node
// Zombies must be hit where they are drawn.
//
// Regression this exists for: zombieHitTest was three fixed spheres above a
// zombie's feet — the head at 1.5m with r 0.23, a crawler's head at 0.45m
// straight over its feet — and the rendered corpse was almost never inside
// them. Aiming at the bottom of a standing zombie's head scored a body shot,
// the top, left and right of the head were clean misses, and a crawler, whose
// skull lies a metre in front of its feet, had to be shot in the back to take
// a headshot.
//
// So this loads the real models, poses every proportion preset through every
// clip a live zombie plays, and fires the real Game.zombieHitTest at the
// skinned vertices themselves — from the front, the side and behind.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { THREE, loadGameModule, repoRoot } from './lib/headless-three.mjs';
import { seedRandom } from './lib/headless-map.mjs';
import { loadZombieModels } from './lib/headless-zombies.mjs';

seedRandom(0x2b7e1516);
await loadZombieModels();
const { ZombieVisual, ZombieManager, ZSTATES, createZombieModel, rayHitZombieBody, zombieAimPoint } = await loadGameModule('zombies.js');
const { attachZombieDetail } = await loadGameModule('render', 'ZombieDetail.js');
const { Game } = await loadGameModule('game.js');
const { CFG } = await loadGameModule('config.js');

const EYE = CFG.EYE_HEIGHT;
// Every clip zombiePoseForState hands a zombie that can still be shot.
const CLIPS = ['Idle', 'Walk', 'Run', 'Run_Arms', 'Idle_Attack', 'Punch', 'Jump', 'Jump_Land', 'Crawl'];
const PHASES = [0.2, 0.7];
const VARIANTS = [[0, 'Basic'], [1, 'Chubby']];

// The presets are picked at random per corpse; collect every one of them.
const presets = [];
for (let i = 0; i < 60; i++) {
  const { prop } = new ZombieVisual(i % 2);
  if (!presets.includes(prop)) presets.push(prop);
}
assert.ok(presets.length >= 3, `expected every proportion preset to be exercised (found ${presets.length})`);

function makeZombie(variant, prop, tongueOut) {
  const visual = new ZombieVisual(variant);
  visual.prop = prop;
  visual.hunch = prop.hunch;
  visual.tongueOut = tongueOut ? visual.bones.Tongue1 || false : false;
  visual.detail = attachZombieDetail(visual); // as createZombieVisual does
  visual.play('Walk');
  visual.update(0); // the first animated frame calibrates height, as in a match
  return { id: 1, x: 0, y: 0, z: 0, yaw: 0, state: ZSTATES.CHASE, dog: false, crawler: false, model: visual.group, visual };
}

function pose(z, clip, phase) {
  const v = z.visual;
  v.mixer.stopAllAction();
  v.current = null;
  v.play(clip, { loop: true, fade: 0, timeScale: 1 });
  v.update(v.actions[clip].getClip().duration * phase);
  z.crawler = clip === 'Crawl';
  z.poseSerial = (z.poseSerial || 0) + 1; // as ZombieManager.animate() does on every pose write
  z.model.updateMatrixWorld(true);
}

// Every skinned vertex, tagged by whether it is head: skin that moves mostly
// with the skull or anything riding it (jaw, eyelids, tongue). The Chubby has
// no neck, and the ring where its head meets its shoulders is weighted 46% head
// and 54% shoulder, belly and arm — that ring rides the body, and is body here.
function skinVertices(visual) {
  const out = [];
  visual.inner.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const { skinIndex, skinWeight } = o.geometry.attributes;
    const underHead = o.skeleton.bones.map((b) => {
      for (let p = b; p?.isBone; p = p.parent) if (p.name === 'Head') return true;
      return false;
    });
    for (let i = 0; i < skinIndex.count; i++) {
      let headWeight = 0;
      for (let k = 0; k < 4; k++) if (underHead[skinIndex.getComponent(i, k)]) headWeight += skinWeight.getComponent(i, k);
      out.push({ mesh: o, i, head: headWeight > 0.5 });
    }
  });
  return out;
}
const worldVertex = (v, out) => v.mesh.getVertexPosition(v.i, out).applyMatrix4(v.mesh.matrixWorld);

const game = Object.create(Game.prototype);
const _dir = new THREE.Vector3();
function fire(z, from, to) {
  game.zombies = { zombies: new Map([[z.id, z]]) };
  _dir.subVectors(to, from).normalize();
  return game.zombieHitTest(from, _dir, 200)[0] || null;
}
const eyeAt = (azimuth, distance) => new THREE.Vector3(Math.sin(azimuth) * distance, EYE, Math.cos(azimuth) * distance);
// The zombie faces +Z: front, side, three-quarter behind.
const VIEWS = [['front', eyeAt(0, 3)], ['front far', eyeAt(0, 9)], ['side', eyeAt(Math.PI / 2, 3.5)], ['behind', eyeAt(Math.PI * 1.2, 4)]];

// Seam allowance. The chin running into the chest and a neckless skull running
// into the shoulders are skinned partly to the body, so those few vertices
// drift a centimetre or three off the skull's rigid hull as the body moves
// under it. A shot there must score once nudged this far toward the skull;
// anything that needs more is a hole in the head, not a seam.
const SEAM = 0.04;
const p = new THREE.Vector3(), skull = new THREE.Vector3(), nudged = new THREE.Vector3();
const headMisses = [];
let headRays = 0, headSeams = 0, bodyRays = 0, bodyMisses = 0;
const bodyMissExamples = [];
for (const [variant, variantName] of VARIANTS) {
  presets.forEach((prop, presetIndex) => {
    // Both tongue states: a lolling tongue is part of the head too.
    const z = makeZombie(variant, prop, presetIndex !== 1);
    const verts = skinVertices(z.visual);
    const head = verts.filter((v) => v.head);
    const body = verts.filter((v) => !v.head);
    for (const clip of CLIPS) {
      for (const phase of PHASES) {
        pose(z, clip, phase);
        zombieAimPoint(z, true, skull);
        for (const [view, eye] of VIEWS) {
          // ---- every drawn point of the head is a headshot -------------------
          for (let k = 0; k < head.length; k += 9) {
            worldVertex(head[k], p);
            headRays++;
            const hit = fire(z, eye, p);
            if (hit?.head) continue;
            nudged.subVectors(skull, p).setLength(SEAM).add(p);
            if (fire(z, eye, nudged)?.head) { headSeams++; continue; }
            headMisses.push(`${variantName} preset ${presetIndex} ${clip}@${phase} ${view}: head vertex (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) ${hit ? 'scored as body' : 'missed'}`);
          }
          // ---- and every drawn point of the body is at least a hit -----------
          for (let k = 0; k < body.length; k += 29) {
            worldVertex(body[k], p);
            const hit = fire(z, eye, p);
            bodyRays++;
            if (!hit) {
              bodyMisses++;
              if (bodyMissExamples.length < 8) bodyMissExamples.push(`${variantName} preset ${presetIndex} ${clip}@${phase} ${view} (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`);
            }
          }
        }
      }
    }
  });
}
assert.equal(headMisses.length, 0,
  `${headMisses.length} of ${headRays} shots at a drawn head did not score a headshot, e.g.\n  ${headMisses.slice(0, 8).join('\n  ')}`);
assert.ok(headSeams / headRays < 0.001,
  `${headSeams} of ${headRays} shots at a drawn head only scored nudged ${SEAM * 100}cm toward the skull — that is a gap, not a seam`);
// A vertex blended across a fully bent joint may sit a hair outside its box;
// a real hole in the body would miss far more than this.
assert.ok(bodyMisses / bodyRays < 0.005,
  `${bodyMisses} of ${bodyRays} shots at the drawn body missed, e.g.\n  ${bodyMissExamples.join('\n  ')}`);

// ---- ...but the head is no bigger than it is drawn -------------------------
// A shot 10cm clear of the skull's silhouette — left, right, above or below —
// is not a headshot, from the front at mid range.
{
  const right = new THREE.Vector3(), up = new THREE.Vector3(), fwd = new THREE.Vector3(), rel = new THREE.Vector3();
  let checked = 0;
  for (const [variant, variantName] of VARIANTS) {
    presets.forEach((prop, presetIndex) => {
      const z = makeZombie(variant, prop, false);
      const head = skinVertices(z.visual).filter((v) => v.head);
      for (const clip of ['Idle', 'Walk', 'Run', 'Idle_Attack']) {
        pose(z, clip, 0.5);
        const eye = eyeAt(0, 5);
        const centre = new THREE.Vector3();
        for (const v of head) centre.add(worldVertex(v, p));
        centre.divideScalar(head.length);
        fwd.subVectors(centre, eye).normalize();
        right.crossVectors(fwd, THREE.Object3D.DEFAULT_UP).normalize();
        up.crossVectors(right, fwd);
        // Silhouette extremes as slopes off the line of sight to the skull.
        let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity;
        for (const v of head) {
          rel.subVectors(worldVertex(v, p), eye);
          const depth = rel.dot(fwd);
          minR = Math.min(minR, rel.dot(right) / depth); maxR = Math.max(maxR, rel.dot(right) / depth);
          minU = Math.min(minU, rel.dot(up) / depth); maxU = Math.max(maxU, rel.dot(up) / depth);
        }
        const margin = 0.1 / centre.distanceTo(eye);
        const midR = (minR + maxR) / 2, midU = (minU + maxU) / 2;
        for (const [side, sr, su] of [['left', minR - margin, midU], ['right', maxR + margin, midU], ['above', midR, maxU + margin], ['below', midR, minU - margin]]) {
          const aim = eye.clone().add(fwd).addScaledVector(right, sr).addScaledVector(up, su);
          const hit = fire(z, eye, aim);
          checked++;
          assert.ok(!hit?.head, `${variantName} preset ${presetIndex} ${clip}: a shot 10cm ${side} of the skull scored a headshot`);
        }
      }
    });
  }
  assert.ok(checked > 0);
}

// ---- crawlers: the old head sphere is on the crawler's back ----------------
// Where a crawler used to take headshots — 0.45m straight over its feet — is
// its back now, and a shot there is a body shot or nothing, never a headshot.
{
  for (const [variant, variantName] of VARIANTS) {
    presets.forEach((prop, presetIndex) => {
      const z = makeZombie(variant, prop, false);
      for (const phase of PHASES) {
        pose(z, 'Crawl', phase);
        for (const eye of [eyeAt(0, 2.5), eyeAt(Math.PI / 2, 3)]) {
          const hit = fire(z, eye, new THREE.Vector3(0, 0.45, 0));
          assert.ok(!hit?.head, `${variantName} preset ${presetIndex}: a crawler still takes a headshot through its back`);
        }
        const skull = zombieAimPoint(z, true, new THREE.Vector3());
        assert.ok(skull.z > 0.5, `${variantName} preset ${presetIndex}: a crawler's skull must be found out in front of its feet (z ${skull.z.toFixed(2)})`);
      }
    });
  }
}

// ---- the host judges a guest's shot against the same posed body -------------
// A guest now aims at a crawler's real skull. The host's claim check must look
// there too, or close-range headshots on crawlers are refused.
{
  const z = makeZombie(1, presets[0], false);
  pose(z, 'Crawl', 0.5);
  const host = Object.create(Game.prototype);
  host.wallDist = () => 1000;
  const eye = eyeAt(0, 2.2);
  const s = { fire: 'hitscan', spreadHip: 0.02, spreadAds: 0.005 };
  const skull = zombieAimPoint(z, true, new THREE.Vector3());
  const claim = { s, origin: eye, dir: skull.clone().sub(eye).normalize(), accepted: [] };
  assert.equal(host._remoteShotTargetAllowed(claim, z, true), true,
    'a guest headshot aimed at a close crawler\'s drawn skull must be accepted');
  const hips = zombieAimPoint(z, false, new THREE.Vector3());
  assert.equal(host._remoteShotTargetAllowed({ ...claim, dir: hips.clone().sub(eye).normalize() }, z, false), true,
    'a guest body shot aimed at a close crawler\'s body must be accepted');
  const wide = new THREE.Vector3(skull.x + 1.6, skull.y, skull.z).sub(eye).normalize();
  assert.equal(host._remoteShotTargetAllowed({ ...claim, dir: wide }, z, true), false,
    'a claimed headshot aimed well wide of the skull must still be refused');
}

// ---- the pose is re-derived once per animation step, not once per pellet ----
// ...and never kept past one: the real animate() moving a zombie moves its hulls.
{
  const z = makeZombie(0, presets[0], false);
  pose(z, 'Walk', 0.5);
  let refreshes = 0;
  const updateMatrixWorld = z.model.updateMatrixWorld;
  z.model.updateMatrixWorld = function (force) { refreshes++; return updateMatrixWorld.call(this, force); };
  const eye = eyeAt(0, 4);
  const skull = zombieAimPoint(z, true, new THREE.Vector3());
  for (let i = 0; i < 8; i++) assert.ok(fire(z, eye, skull)?.head, 'a pellet at the skull is a headshot');
  assert.equal(refreshes, 1, `eight pellets at one pose must walk the skeleton once (walked it ${refreshes} times)`);

  z.x = 1.2;
  ZombieManager.prototype.animate.call({ dormant: false }, z, 1 / 60);
  assert.ok(!fire(z, eye, skull)?.head, 'a zombie that has stepped aside must not still be headshot where it stood');
  const moved = zombieAimPoint(z, true, new THREE.Vector3());
  assert.ok(Math.abs(moved.x - skull.x - 1.2) < 0.15, `the skull must travel with the body (moved ${(moved.x - skull.x).toFixed(2)}m of 1.2m)`);
  assert.ok(fire(z, eye, moved)?.head, 'and it is headshot where it now stands');
  assert.equal(refreshes, 2, 'one animation step, one more walk of the skeleton');
}

// ---- a zombie whose model failed to load is hit on the boxes it is drawn as ----
{
  const model = createZombieModel(false);
  const z = { id: 1, x: 0, y: 0, z: 0, yaw: 0, anim: 0, state: ZSTATES.CHASE, dog: false, crawler: false, model, visual: null };
  ZombieManager.prototype.animate.call({ dormant: false }, z, 1 / 60);
  model.updateMatrixWorld(true);
  const eye = eyeAt(0, 5);
  const headBox = new THREE.Box3().setFromObject(model.userData.head);
  const torsoBox = new THREE.Box3().setFromObject(model.userData.torso);
  assert.equal(fire(z, eye, headBox.getCenter(new THREE.Vector3()))?.head, true, 'the fallback head box must take a headshot');
  const crown = headBox.getCenter(new THREE.Vector3()).setY(headBox.max.y - 0.03);
  assert.equal(fire(z, eye, crown)?.head, true, 'the top edge of the fallback head box must take a headshot');
  assert.equal(fire(z, eye, torsoBox.getCenter(new THREE.Vector3()))?.head, false, 'the fallback torso box must take a body shot');
  const over = headBox.getCenter(new THREE.Vector3()).setY(headBox.max.y + 0.08);
  assert.equal(fire(z, eye, over), null, 'a shot clear over the fallback head must miss');
}

// ---- hounds keep their own anatomy ------------------------------------------
assert.equal(rayHitZombieBody({ dog: true, model: new THREE.Group() }, eyeAt(0, 3), new THREE.Vector3(0, 0, -1), 50, {}), null,
  'a hound is tested against dogHitZones, never against zombie hulls');

// ---- dressing is hit like skin, and dressing hidden by LOD is not -----------
// Stand-in pieces parked well clear of the body, so only their own hulls can
// take the shot.
{
  const z = makeZombie(0, presets[0], false);
  pose(z, 'Idle', 0.5);
  const { Hips, Head } = z.visual.bones;
  const dress = (bone, world) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2));
    mesh.position.copy(bone.worldToLocal(world));
    bone.add(mesh);
    z.visual.detail.push(mesh);
    return mesh;
  };
  const hips = Hips.getWorldPosition(new THREE.Vector3());
  const skullTop = Head.getWorldPosition(new THREE.Vector3());
  const sash = dress(Hips, new THREE.Vector3(hips.x + 1.3, hips.y, hips.z));
  const crest = dress(Head, new THREE.Vector3(skullTop.x, skullTop.y + 0.9, skullTop.z));
  z.poseSerial++;
  z.model.updateMatrixWorld(true);
  const eye = eyeAt(0, 5);
  const at = (mesh) => mesh.getWorldPosition(new THREE.Vector3());
  assert.equal(fire(z, eye, at(sash))?.head, false, 'dressing riding the hips must take a body shot');
  assert.equal(fire(z, eye, at(crest))?.head, true, 'dressing riding the head must take a headshot');
  sash.visible = false;
  assert.equal(fire(z, eye, at(sash)), null, 'dressing hidden by LOD must not take a shot');
}

// ---- a hit bleeds where the round went in -----------------------------------
// It bled at a fixed 1.5m over the feet, so a crawler's headshot sprayed in
// mid-air above its back.
{
  const z = makeZombie(1, presets[0], false);
  pose(z, 'Crawl', 0.5);
  const g = Object.create(Game.prototype);
  g.zombies = { zombies: new Map([[z.id, z]]) };
  g.wallDist = () => 120;
  g.fx = { tracer() {} };
  const wounds = [];
  g.hitFX = (target, x, y, zz, head) => wounds.push({ x, y, z: zz, head });
  g.applyZombieDamage = () => {};
  const eye = eyeAt(0, 3);
  const skull = zombieAimPoint(z, true, new THREE.Vector3());
  g.hitscan(eye, skull.clone().sub(eye).normalize(), { dmg: 100 }, { id: 'kar98k' }, eye);
  assert.equal(wounds.length, 1, 'one zombie in the line of fire, one wound');
  assert.equal(wounds[0].head, true, 'a round at a crawler\'s skull is a headshot');
  const off = Math.hypot(wounds[0].x - skull.x, wounds[0].y - skull.y, wounds[0].z - skull.z);
  assert.ok(off < 0.4, `a crawler's headshot must bleed at its skull, not ${off.toFixed(2)}m away`);
}

// ---- the per-ray path allocates nothing ------------------------------------
{
  const zombies = await readFile(join(repoRoot, 'js/zombies.js'), 'utf8');
  for (const name of ['export function rayHitZombieBody(', 'function refreshHitPose(', 'function rayCrossesBounds(', 'function rayHullEntry(']) {
    const start = zombies.indexOf(name);
    assert.ok(start > -1, `${name} must exist`);
    const body = zombies.slice(start, zombies.indexOf('\n}\n', start));
    assert.doesNotMatch(body, /new [A-Z]|\{ *\.\.\.|\[\]/, `${name} runs per pellet per zombie and must not allocate`);
  }
}

console.log(`zombie hit boxes OK (${headRays} head shots, ${headSeams} on a seam; ${bodyRays} body shots, ${bodyMisses} grazed)`);
