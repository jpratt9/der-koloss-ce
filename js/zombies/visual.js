// The zombie corpse: the Quaternius GLB rig with its decayed atlas, glowing
// eyes and proportion presets, and the calibration that holds it to human height.
import * as THREE from 'three';
import { clone as skClone } from '../../vendor/SkeletonUtils.js';
import { clamp, rand, choice } from '../utils.js';
import { assets } from '../assets.js';
import { enhanceCreatureMaterial, randomCreatureLook } from '../render/CreatureShading.js';
import { measureNeutralBounds, measureStandingBounds } from './bounds.js';

// ---- proportion presets: longer limbs, slim torso, small head, hunch ----
// [sx, sy, sz] per bone name. Chained down the hierarchy, so limbs read longer.
const PROP_PRESETS = [
  { // "shambler" — average but de-cartooned
    hunch: 0.08,
    scale: {
      Head: [0.7, 0.7, 0.7], Neck: [0.9, 1.12, 0.9],
      Torso: [0.9, 1.03, 0.86], Abdomen: [0.88, 1.0, 0.85], Hips: [0.92, 1.0, 0.9],
      'Shoulder.L': [0.9, 0.95, 0.9], 'Shoulder.R': [0.9, 0.95, 0.9],
      'UpperArm.L': [0.8, 1.1, 0.8], 'UpperArm.R': [0.8, 1.1, 0.8],
      'LowerArm.L': [0.78, 1.12, 0.78], 'LowerArm.R': [0.78, 1.12, 0.78],
      'UpperLeg.L': [0.84, 1.05, 0.84], 'UpperLeg.R': [0.84, 1.05, 0.84],
      'LowerLeg.L': [0.84, 1.05, 0.84], 'LowerLeg.R': [0.84, 1.05, 0.84],
    },
  },
  { // "cadaver" — gaunt, long-armed, deep hunch
    hunch: 0.13,
    scale: {
      Head: [0.66, 0.66, 0.66], Neck: [0.85, 1.18, 0.85],
      Torso: [0.82, 1.05, 0.78], Abdomen: [0.8, 1.0, 0.76], Hips: [0.86, 1.0, 0.84],
      'Shoulder.L': [0.85, 0.9, 0.85], 'Shoulder.R': [0.85, 0.9, 0.85],
      'UpperArm.L': [0.72, 1.16, 0.72], 'UpperArm.R': [0.72, 1.16, 0.72],
      'LowerArm.L': [0.7, 1.18, 0.7], 'LowerArm.R': [0.7, 1.18, 0.7],
      'UpperLeg.L': [0.8, 1.07, 0.8], 'UpperLeg.R': [0.8, 1.07, 0.8],
      'LowerLeg.L': [0.8, 1.07, 0.8], 'LowerLeg.R': [0.8, 1.07, 0.8],
    },
  },
  { // "brute" — heavy shoulders/arms, forward lean
    hunch: 0.10,
    scale: {
      Head: [0.68, 0.68, 0.68], Neck: [0.95, 1.05, 0.95],
      Torso: [1.04, 1.02, 0.98], Abdomen: [0.95, 1.0, 0.9], Hips: [0.95, 1.0, 0.92],
      'Shoulder.L': [1.12, 1.05, 1.1], 'Shoulder.R': [1.12, 1.05, 1.1],
      'UpperArm.L': [0.95, 1.14, 0.95], 'UpperArm.R': [0.95, 1.14, 0.95],
      'LowerArm.L': [0.9, 1.14, 0.9], 'LowerArm.R': [0.9, 1.14, 0.9],
      'UpperLeg.L': [0.9, 1.04, 0.9], 'UpperLeg.R': [0.9, 1.04, 0.9],
      'LowerLeg.L': [0.9, 1.04, 0.9], 'LowerLeg.R': [0.9, 1.04, 0.9],
    },
  },
];

// ---------- GLB zombie visual wrapper ----------
// Recolor the shared atlas toward decayed corpse tones: the cartoony green
// skin becomes gray-green decay, clothes become field-gray rags. Cached once.
let _corpseAtlas = null;
function corpseAtlas() {
  if (_corpseAtlas) return _corpseAtlas;
  const src = assets.models.zombie1;
  const srcTex = src?.scene?.getObjectByProperty('isSkinnedMesh', true)?.material?.map;
  if (!srcTex?.image) return null;
  const img = srcTex.image;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  // Corpse palette. These used to be lifted well above life so zombies stayed
  // visible in a dark scene, which made them read as pale glowing dolls. Auto
  // exposure and the rim light now handle visibility, so the flesh can go back
  // to where it belongs: ashen, jaundiced and desaturated, with the uniform
  // nearly black. This is the Waffenfabrik corpse, not a ghost.
  const skin = new THREE.Color(0x6c6a55);  // ashen, slightly jaundiced
  const cloth = new THREE.Color(0x24272a); // near-black field grey
  const tmp = new THREE.Color();
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255, gg = px[i + 1] / 255, b = px[i + 2] / 255;
    const lum = 0.3 * r + 0.55 * gg + 0.15 * b;
    if (gg > r * 1.12 && gg > b * 1.12) {
      // Flesh: compress the range hard so highlights never approach white,
      // then push a little red into the mid-tones for bruising.
      const t = Math.min(1.0, lum * 1.6);
      tmp.copy(skin).multiplyScalar(0.45 + t * 0.55);
      tmp.r = Math.min(1, tmp.r * (1.0 + (1.0 - t) * 0.22));
      tmp.b *= 0.88;
    } else if (lum > 0.78) {
      tmp.setRGB(0.62, 0.60, 0.55);   // was pure white — bone/teeth, not paper
    } else {
      tmp.copy(cloth).multiplyScalar(0.5 + lum * 1.15);
    }
    px[i] = tmp.r * 255; px[i + 1] = tmp.g * 255; px[i + 2] = tmp.b * 255;
  }
  g.putImageData(d, 0, 0);
  // Dried blood and grime, stamped over the whole atlas. Uniform decay reads
  // as a paint job; irregular staining reads as something that has been dead
  // in a factory for a while.
  g.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * c.width, y = Math.random() * c.height;
    const r0 = c.width * (0.004 + Math.random() * 0.03);
    const grad = g.createRadialGradient(x, y, 0, x, y, r0);
    const blood = Math.random() < 0.45;
    grad.addColorStop(0, blood ? 'rgba(120,44,34,0.85)' : 'rgba(96,88,72,0.8)');
    grad.addColorStop(1, blood ? 'rgba(150,90,80,0)' : 'rgba(130,124,110,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r0, 0, 7); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  _corpseAtlas = new THREE.CanvasTexture(c);
  _corpseAtlas.colorSpace = THREE.SRGBColorSpace;
  _corpseAtlas.flipY = false;
  return _corpseAtlas;
}

const eyeGeo = new THREE.SphereGeometry(0.03, 6, 6);
// How far ahead of an eyelid bone the glow sits. The front of the eyeball the
// lid closes over is 0.066 ahead of the bone, so this stands a little over half
// the glow's radius out through it.
const EYE_LID_DEPTH = 0.054;
// Eyes are authored ABOVE the bloom threshold (~1.15 luminance) so they
// actually bloom in the HDR stack instead of sitting flat.
const eyeGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa830).multiplyScalar(1.9), toneMapped: false });
// Per-zombie tint. Kept below 0.62 luminance: anything brighter multiplied the
// atlas back up toward the pale doll look this palette exists to avoid.
const zombieTints = [0x9a9184, 0x8d8578, 0x847d72, 0x968c7c, 0x7d776d];

// ---- height contract -------------------------------------------------------
// A zombie is a man. Whatever the skinned measurement returns, the rendered
// corpse must stand between these bounds — a 2.8m zombie towering over the
// horde is a bug the player reads instantly, so it is clamped, not trusted.
const ZOMBIE_MIN_H = 1.60;
const ZOMBIE_MAX_H = 2.00;
// Sanity band for the RAW measurement, relative to the source model's own
// native standing height. Anything outside it is a broken sample (degenerate
// pose, skeleton not yet filled) and is discarded in favour of the cache.
const CAL_SANE_LO = 0.5;
const CAL_SANE_HI = 2.0;

// Native standing height per SOURCE model. Every clone of a model shares it,
// so this is measured once per GLTF and never per zombie — calibration stays
// O(1) per instance, which co-op cannot afford otherwise.
const _nativeStandingH = new WeakMap();
function nativeStandingHeight(src) {
  if (!src?.scene) return null;
  if (_nativeStandingH.has(src)) return _nativeStandingH.get(src);
  let h = null;
  try {
    const probe = skClone(src.scene);
    probe.position.set(0, 0, 0);
    probe.rotation.set(0, 0, 0);
    probe.scale.setScalar(1);
    const mixer = new THREE.AnimationMixer(probe);
    let idle = null, walk = null;
    for (const clip of src.animations || []) {
      if (clip.name === 'Idle') idle = mixer.clipAction(clip);
      else if (clip.name === 'Walk') walk = mixer.clipAction(clip);
    }
    const m = measureStandingBounds(probe, mixer, idle || walk);
    if (m && m.h > 0.1) h = m.h;
    mixer.uncacheRoot(probe);
  } catch (e) {
    h = null;
  }
  _nativeStandingH.set(src, h);
  return h;
}

export class ZombieVisual {
  constructor(variant) {
    const src = variant === 1 ? assets.models.zombie2 : assets.models.zombie1;
    this.src = src; // kept for the cached native-height fallback in calibrate()
    this.inner = skClone(src.scene);
    // rough initial scale — precisely calibrated on first animated frame
    this.inner.scale.setScalar(1.0);
    this.group = new THREE.Group();
    this.group.add(this.inner);
    this._calibrated = false;
    this._targetH = rand(1.72, 1.86); // human-sized
    this.mixer = new THREE.AnimationMixer(this.inner);
    this.actions = {};
    for (const clip of src.animations) {
      this.actions[clip.name] = this.mixer.clipAction(clip);
    }
    this.current = null;
    this.mats = [];
    const atlas = corpseAtlas();
    const tint = choice(zombieTints);
    // Rim is a hint of moonlight catching an edge, not a halo. The default in
    // randomCreatureLook is tuned for readability; corpses want it far lower.
    const look = randomCreatureLook();
    look.rimStrength = 0.42 + Math.random() * 0.16;
    look.rimPower = 3.6;
    look.wrap = 0.22;
    look.sssStrength = 0.13;
    look.fleshAmount = 0.62 + Math.random() * 0.22;
    look.grime = 0.42 + Math.random() * 0.32;
    look.wet = 0.10 + Math.random() * 0.14;
    look.tintA = 0x8e8676; look.tintB = 0x6f6a5e;
    this.inner.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true;
        o.frustumCulled = false; // skinned bounds are unreliable
        if (o.material) {
          o.material = o.material.clone();
          if (atlas) { o.material.map = atlas; o.material.color = new THREE.Color(tint); }
          o.material.roughness = 0.95;
          // Shading-only fidelity pass: moon-keyed rim light, wrapped diffuse,
          // triplanar necrotic detail and per-instance variation. Nothing here
          // touches the skeleton, so it cannot desync an animation.
          enhanceCreatureMaterial(o.material, look);
          this.mats.push(o.material);
        }
      }
    });
    // glowing eyes on the head bone
    this.headBone = null;
    this.inner.traverse((o) => { if (!this.headBone && o.isBone && /head/i.test(o.name)) this.headBone = o; });
    if (this.headBone) {
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(eyeGeo, eyeGlowMat);
        // The Basic model has eyelid bones, and they sit at the centre of its
        // eyeballs. The fixed offset below lands in the Chubby's sockets but
        // inside the Basic's head, down by its nose, where the eyes never
        // showed; so where there are lids the glow goes out through the front
        // of the eyeball between them.
        const lid = this.inner.getObjectByName(s < 0 ? 'EyelidR' : 'EyelidL');
        if (lid) {
          lid.getWorldPosition(e.position).z += EYE_LID_DEPTH;
          this.headBone.worldToLocal(e.position);
        } else {
          e.position.set(0.055 * s, 0.065, 0.115);
        }
        e.scale.setScalar(1.0);
        this.headBone.add(e);
      }
    }
    this.hitFlash = 0;
    // ---- de-cartoon surgery: per-zombie proportion preset + hunched posture ----
    // Rotation offsets must only ADD to bones the current clip actually writes —
    // on untracked bones they would accumulate forever (the "rolling head" bug).
    this.bones = {};
    this.restPose = {}; // bone name -> rest quaternion (captured at clone time)
    this.inner.traverse((o) => {
      if (o.isBone) { this.bones[o.name] = o; this.restPose[o.name] = o.quaternion.clone(); }
    });
    this._tracked = new Set(); // bone names written by the current action's clip
    this.prop = choice(PROP_PRESETS);
    this.tongueOut = Math.random() < 0.35 && this.bones.Tongue1;
    this.hunch = this.prop.hunch;
  }

  play(name, { loop = true, fade = 0.18, timeScale = 1 } = {}) {
    const a = this.actions[name];
    if (!a || this.current === name && loop) { if (this.current === name) { const act = this.actions[name]; act.timeScale = timeScale; } return; }
    const prev = this.current ? this.actions[this.current] : null;
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce);
    a.clampWhenFinished = !loop;
    a.timeScale = timeScale;
    if (prev && prev !== a) { a.crossFadeFrom(prev, fade, false); }
    a.play();
    this.current = name;
    // remember which bones THIS clip writes (rotation-offset safety)
    this._tracked.clear();
    for (const tr of a.getClip().tracks) {
      const boneName = tr.name.split('.')[0];
      if (this.bones[boneName]) this._tracked.add(boneName);
    }
  }

  flash() { this.hitFlash = 0.09; }

  // Measure skinned-pose bounds once and normalize height/grounding (in the
  // GROUP's own space) — never in world space.
  //
  // World space is what produced 2.8m zombies. animate() pitches a rising
  // corpse's group forward by up to 0.95rad (and rolls it) on the very frame
  // calibration runs, and the world bbox of a body pitched 54 degrees is far
  // shorter than the body, so targetH/h came out roughly double. Only ground
  // risers were affected — about 6% of a wave — which is exactly why it read
  // as "some zombies are huge".
  //
  // Three independent guards, because a wrong scale here is permanent:
  //   1. measure in parent space, so no group transform can distort it;
  //   2. reject a raw height outside a sane band around the model's cached
  //      native standing height;
  //   3. clamp the applied factor, then re-measure and assert the rig really
  //      lands inside the height contract, falling back to a deterministic
  //      scale derived from the cached native height if it does not.
  calibrate() {
    const idle = this.actions.Idle || this.actions.Walk;
    if (!idle) return;
    // force the standing pose on the skeleton right now
    this.mixer.stopAllAction();
    idle.reset();
    idle.setLoop(THREE.LoopOnce, 1);
    idle.clampWhenFinished = true;
    idle.play();
    idle.time = 0.35; // mid idle, feet planted
    this.mixer.update(0);
    // Unit-scale, transform-free bounds: comparable to the cached native height
    // and unchanged by anything animate() has done to the group this frame.
    const bb = measureNeutralBounds(this.inner, this.group);
    const measuredH = bb ? bb.max.y - bb.min.y : 0;
    const measuredMinY = bb ? bb.min.y : 0;
    // hand control back to the animator: clear pose + let animate() re-issue play()
    this.mixer.stopAllAction();
    this.current = null;

    const native = nativeStandingHeight(this.src);
    const sane = measuredH > 0.1 && (!native
      || (measuredH >= native * CAL_SANE_LO && measuredH <= native * CAL_SANE_HI));
    const h = sane ? measuredH : native;
    if (!(h > 0.1)) return;         // nothing trustworthy to fall back to — retry next frame

    const target = clamp(this._targetH, ZOMBIE_MIN_H, ZOMBIE_MAX_H);
    // The rendered height is exactly h * scale, so clamping the scale into this
    // window is what makes the contract unconditional. setScalar, never
    // multiplyScalar: a measurement taken at unit scale must not be compounded
    // with whatever scale the rig is already carrying.
    const scale = clamp(target / h, ZOMBIE_MIN_H / h, ZOMBIE_MAX_H / h);
    this.inner.scale.setScalar(scale);
    // Ground the feet at the group origin. Only re-derived from a measurement
    // we actually trusted.
    this.inner.position.y = sane ? -measuredMinY * scale : 0;

    // Hard post-condition: re-measure the posed rig and prove the height it
    // will render at lands inside the contract. Never assume it.
    const after = measureNeutralBounds(this.inner, this.group);
    const finalH = after ? (after.max.y - after.min.y) * this.inner.scale.x : 0;
    if (!(finalH >= ZOMBIE_MIN_H && finalH <= ZOMBIE_MAX_H)) {
      const safe = native > 0.1
        ? clamp(target / native, ZOMBIE_MIN_H / native, ZOMBIE_MAX_H / native)
        : 1;
      this.inner.scale.setScalar(safe);
      this.inner.position.y = 0;
      console.warn('[zombies] calibration post-condition failed; using cached native scale', { measuredH, finalH });
    }
    this._calibrated = true;
  }

  update(dt) {
    this.mixer.update(dt);
    // de-cartoon surgery, re-applied every frame. Scale is safe (clips don't
    // write scale here); rotation offsets: reset untracked bones to rest pose
    // FIRST so offsets never accumulate, then tilt via quaternion multiply.
    const B = this.bones, S = this.prop.scale;
    for (const name in S) { const b = B[name]; if (b) b.scale.set(S[name][0], S[name][1], S[name][2]); }
    // constant-set (never accumulates, never rolls — overrides clip pose deterministically)
    const setTilt = (name, dx) => {
      const b = B[name];
      if (!b || !dx) return;
      b.quaternion.copy(this.restPose[name]);
      b.rotateX(dx);
    };
    setTilt('Torso', this.hunch);
    setTilt('Neck', this.hunch * 0.7);
    setTilt('Head', -this.hunch * 0.85); // face stays up at the prey
    if (this.tongueOut) {
      for (let i = 1; i <= 5; i++) setTilt('Tongue' + i, 0.32);
    }
    if (!this._calibrated && this.current) this.calibrate();
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      const on = this.hitFlash > 0;
      for (const m of this.mats) m.emissive?.setHex(on ? 0x661111 : 0x000000);
    }
  }
}
