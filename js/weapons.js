// Weapon definitions (real WWII-era firearms + sci-fi wonder weapons),
// Pack-a-Punch variants, detailed procedural view-models with reload animations.
import * as THREE from 'three';
import { clamp, damp, lerp } from './utils.js';
import { PERK_DRINK_TIMELINE } from './gameplay-rules.js';
import { WM } from './render/WeaponMaterials.js';
import { bx, cyl } from './render/WeaponParts.js';
import { crackFist, knifeHand, setHandPose, resetHandPose } from './render/WeaponHands.js';
import { WEAPONS } from './weapons/catalog.js';
import { buildMonkey } from './weapons/monkey.js';
import { buildPerkBottle, posePerkBottle } from './weapons/perk-bottle.js';
import { buildViewmodel } from './weapons/viewmodel.js';
import {
  takesPbrFinish, wearsWeaponFinish, applyPapLivingFinish, advancePapLivingFinish, metalEnvTex,
  sparkleTex,
} from './weapons/finishes.js';
import { KNUCKLE_DUR, poseKnuckleCrack } from './weapons/knuckle-crack.js';

export { WEAPONS, getStats, BOX_POOL, CASING_BY_SFX } from './weapons/catalog.js';
export { buildMonkey } from './weapons/monkey.js';
export { buildPerkBottle } from './weapons/perk-bottle.js';
export { buildViewmodel } from './weapons/viewmodel.js';
export { KNUCKLE_DUR, poseKnuckleCrack } from './weapons/knuckle-crack.js';

// Shared, lazily-generated PBR library (see js/render/WeaponMaterials.js).
// `M` keeps its historical key names so the knife, fists and monkey prop below
// keep reading the way they always did.
const M = WM;

// ---------------------------------------------------------------------------
// World display presentation
//
// buildViewmodel() returns the FIRST-PERSON authoring frame and nothing else:
// origin at the camera-relative grip, no display transform. What it does NOT
// return is the gloves — those are built into a detached container that only
// WeaponRig.equip() re-attaches, so anything that puts a weapon in the world
// (the mystery box, Pack-a-Punch, the cinematic) gets the weapon ALONE without
// having to hunt hand meshes out of the tree.
//
// presentForDisplay() is the shared "make it hero-shot" step: pivot on the
// weapon's own centre so a spin does not swing it through the prop it is
// floating over, normalise the longest axis so a Colt and a Panzerschreck read
// at the same size, and sit it at a three-quarter angle.
const _dispBox = new THREE.Box3();
const _dispV = new THREE.Vector3();
const DISPLAY_LEN = 0.95;       // metres, tuned to the mystery-box crate width
// The PaP prize hangs in open air right off the machine face rather than inside
// a crate, so the crate-width figure read as an oversized prop bolted to the
// cabinet. This is a hair under the 0.66m aperture width: the reward still
// reads as the hero of the shot without dwarfing the mouth it came out of.
const PAP_DISPLAY_LEN = 0.62;

/**
 * @param inner  the node holding the weapon meshes
 * @param len    world length the longest axis is normalised to
 * @param yaw/pitch/roll  presentation angle, applied about the weapon's centre
 */
function presentForDisplay(inner, { len = DISPLAY_LEN, yaw = Math.PI / 2, pitch = 0.10, roll = 0.06 } = {}) {
  inner.position.set(0, 0, 0);
  inner.rotation.set(0, 0, 0);
  inner.scale.setScalar(1);
  _dispBox.setFromObject(inner);
  if (!isFinite(_dispBox.min.x) || _dispBox.isEmpty()) return;
  _dispBox.getSize(_dispV);
  const longest = Math.max(_dispV.x, _dispV.y, _dispV.z, 1e-3);
  inner.scale.setScalar(len / longest);
  // YXZ: the hero tilt is about the weapon's OWN lateral axis, applied before
  // the presentation yaw. With the default XYZ order the pitch happens in world
  // space after the yaw and shows up as an apparent roll.
  inner.rotation.order = 'YXZ';
  inner.rotation.set(pitch, yaw, roll);
  // Pivot on the weapon's own centre, so `rotation.y += dt` orbits nothing.
  _dispBox.setFromObject(inner);
  _dispBox.getCenter(_dispV);
  inner.position.set(-_dispV.x, -_dispV.y, -_dispV.z);
}

/**
 * A weapon built for DISPLAY IN THE WORLD — mystery box, Pack-a-Punch output,
 * any pedestal. No hands, no sleeve; normalised to `len` metres on its longest
 * axis and pivoting about its own centre, so the caller only has to place it
 * and spin it. Presented broadside with a slight display-rack tilt, which is
 * the readable angle from a standing player's eye line.
 */
export function buildDisplayWeapon(id, pap = false, len = DISPLAY_LEN) {
  const group = buildViewmodel(id, pap);
  group.userData.handsGroup = null;
  presentForDisplay(group.userData.viewNode, { len });
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = true;
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return group;
}

// Muzzle flash texture (canvas, original)
let _flashTex = null;
function flashTexture() {
  if (_flashTex) return _flashTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 60);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.3, 'rgba(255,180,80,0.85)');
  grad.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // spikes
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    g.save(); g.translate(64, 64); g.rotate((i / 6) * Math.PI * 2 + 0.3);
    const lg = g.createLinearGradient(0, 0, 60, 0);
    lg.addColorStop(0, 'rgba(255,220,150,0.9)');
    lg.addColorStop(1, 'rgba(255,150,50,0)');
    g.fillStyle = lg;
    g.beginPath(); g.moveTo(8, -5); g.lineTo(62, 0); g.lineTo(8, 5); g.closePath(); g.fill();
    g.restore();
  }
  _flashTex = new THREE.CanvasTexture(c);
  _flashTex.colorSpace = THREE.SRGBColorSpace;
  return _flashTex;
}

// A real upgraded weapon model for the PaP output aperture. This deliberately
// uses the same builder and living finish as the first-person weapon; only the
// viewmodel hands are hidden for the world presentation.
export function buildPapDisplayWeapon(id) {
  const group = buildViewmodel(id, true);
  // buildViewmodel() keeps the gloves out of the returned tree; drop the
  // detached container so nothing can re-attach them to a world prop, then run
  // the same hero presentation the mystery box uses. Unlike the box, this one
  // is placed at unit scale by game.js: PAP_DISPLAY_LEN is the final world
  // length, so there is no builder/placement scale factor to keep in sync.
  group.userData.handsGroup = null;
  presentForDisplay(group.userData.viewNode, { len: PAP_DISPLAY_LEN, yaw: 0, pitch: 0.06, roll: 0 });
  const parts = group.userData.parts || {};
  if (parts.hand_l) parts.hand_l.visible = false;
  if (parts.hand_r) parts.hand_r.visible = false;
  group.userData.papDisplayCamo = applyPapLivingFinish(group, id, 0, true);
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = true;
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return group;
}

export function updatePapDisplayWeapon(group, dt) {
  const camo = group?.userData?.papDisplayCamo;
  if (camo) advancePapLivingFinish(camo, dt);
}

export function disposePapDisplayWeapon(group) {
  if (!group) return;
  group.removeFromParent();
  group.userData?.papDisplayCamo?.ownedTexture?.dispose();
  // Geometries from the shared WeaponParts cache and materials from the shared
  // WeaponMaterials library are used by every other weapon in the game; only
  // the per-display clones this builder actually owns may be released.
  const free = (m) => { if (m && !m.userData?.wmShared) m.dispose(); };
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.geometry?.userData?.wpShared) o.geometry?.dispose();
    if (Array.isArray(o.material)) for (const m of o.material) free(m);
    else free(o.material);
  });
}

// ---- ADS depth ------------------------------------------------------------
// The authored ADS depth: how far out in front of the lens a weapon is held
// when it is HELD rather than shouldered. Right for a pistol at arm's length,
// where the frame really does end two hands away from your face.
const ADS_HELD_Z = -0.26;
// A cheek weld. Shouldering a weapon puts the thing you look through about this
// far from your eye — and puts the butt PAST your cheek, behind the lens, where
// the near plane hides it. Holding a rifle out at arm's length instead is what
// left the buttpad of every shouldered weapon in the middle of the screen with
// the stock filling the bottom third of the frame.
const ADS_EYE_RELIEF = 0.095;
// A weapon that reaches further than this behind the thing you look through has
// a stock on it, and goes to the shoulder. Measured rather than declared by
// class: the Wunderwaffe is a `wonder` and the Panzerschreck a `launcher`, and
// both are shouldered, while the Ray Gun of the same class is not.
const ADS_STOCK_REACH = 0.10;
// How close anything that CANNOT be tucked out of the way may come to the lens.
// The eye a real cheek weld puts 95mm behind a rear sight is not a 58-degree
// rectilinear camera: solved outright, the Gewehr 43's receiver lands 13mm off
// the lens — a millimetre outside the near plane, sliced open — and the
// Browning's carry handle covers a third of the screen. Each weapon closes as
// far as its own back end allows and no further, which is why the Type 100 gets
// most of a cheek weld while the AK-74u, with a receiver cover reaching almost
// to its own dot, keeps its distance.
const ADS_FACE_CLEAR = 0.05;
// Clearance behind the lens for a stock that has gone to the shoulder. The near
// plane does the hiding; this is just far enough past it to stay hidden through
// the bob and the recoil settle. See WeaponRig.tuckStock().
const ADS_BUTT_CLEAR = 0.02;

// ---- recoil authority while aiming ----------------------------------------
// Hip-fire can afford to throw the weapon around: nothing on it has to stay
// registered against anything. ADS cannot. Aiming puts the sight ON the optical
// axis, so every millimetre the viewmodel moves is a millimetre the sight
// picture moves, magnified by the narrower viewmodel lens.
//
// The pose used to apply the kick at full strength either way, and `kick` never
// decays between rounds of an automatic: at the FG42's 937rpm it swung
// 0.37..1.00 fifteen times a second, which is 5.8 degrees of muzzle flip and
// 5.7cm of travel toward a lens 26cm away. That is not a recoil animation, it
// is a vibration — and the travel is why an aimed weapon appeared to pulse in
// SIZE rather than to kick.
//
// So an aimed weapon keeps the recoil it can spend along the sight line and
// gives up the part that swings the sights off it:
//   ADS_KICK_PITCH   muzzle flip. Cut hardest: rotation is what walks the front
//                    post out of the aperture.
//   ADS_KICK_PUSH    straight back along the bore. Survives better because it
//                    runs along the aim line rather than across it, but it is
//                    also the term that changes apparent size, so it is not
//                    close to free either.
//   ADS_KICK_IMPULSE a shouldered weapon is braced — each round disturbs it
//   ADS_KICK_SETTLE  less, and it returns sooner. Together these keep the kick
//                    settling between rounds instead of riding its clamp for a
//                    whole burst, which is what turned per-shot kicks into one
//                    continuous buzz.
const ADS_KICK_PITCH = 0.15;
const ADS_KICK_PUSH = 0.32;
const ADS_KICK_IMPULSE = 0.30;
const ADS_KICK_SETTLE = 11;

// The arc a freshly equipped weapon comes up out of. At equipT 0 it hangs this
// far below the rest pose, pitched this far muzzle-down — below the frame, which
// is the whole point: the exchange itself is never on screen. Shared with the
// holster drop so a swap goes down and comes back up the same axis, and with
// equip() so the model is posed on the frame it is built.
const EQUIP_RAISE_DROP = 0.35;
const EQUIP_RAISE_PITCH = 0.7;

// Handles view-model positioning, sway, bob, recoil, per-class reload animation
export class WeaponRig {
  constructor(camera) {
    this.root = new THREE.Group();
    camera.add(this.root);
    this.hipPos = new THREE.Vector3(0.23, -0.205, -0.4);
    // The lens the viewmodel is filmed through, as told to us by setViewLens().
    // Identity until then, which is the right answer for anything that renders
    // the rig with the world camera.
    this.viewScale = 1;
    this.viewOffsetZ = 0;
    // Viewmodel fill. Pushed further out with a longer range and linear-ish
    // falloff: at the old 1.5m/decay-1.8 setting anything that came within
    // ~15cm of the lens (a glove, a cuff during a reload) hit the inverse-square
    // knee and blew to white. This keeps the weapon readable without a hotspot.
    this.fill = new THREE.PointLight(0xfff2e0, 0.9, 3.2, 1.15);
    this.fill.position.set(0.22, 0.06, -0.42);
    this.fill.layers.enableAll();
    camera.add(this.fill);
    this.current = null;
    this.kick = 0;
    this.reloadT = 0; this.reloadDur = 0;
    this.equipT = 1;
    // Holster phase of a weapon swap. equip() replaces the model instantly, so
    // without this the old gun VANISHES and the new one rises out of nothing —
    // read as a flicker rather than a swap. Lower first, then exchange, then
    // raise: the exchange happens while the frame is empty, so it is invisible.
    this.holsterT = 0;
    this.holsterDur = 0.13;
    this.pendingEquip = null;
    this.adsT = 0;
    this.bobPhase = 0;
    this.swayX = 0; this.swayY = 0;
    this.slideT = 0;          // 0..1 slide pose blend, damped in and out
    this.slideHit = 0;        // entry impulse, decays over the slide
    this.meleeT = 0;
    this.boltT = 0; // bolt/pump cycle after firing
    this.inspectT = 0; // weapon inspection (PaP take)
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flash.scale.setScalar(0.22);
    this.flashT = 0;
    // ---- trench knife (shown only during the melee slash) ----
    this.knifeGold = false;
    this.knife = new THREE.Group();
    {
      const grip = bx(0.034, 0.04, 0.15, M.woodDark, 0, 0, 0.02);
      const pommel = bx(0.04, 0.045, 0.025, M.steelDark, 0, 0, 0.105);
      const guard = bx(0.075, 0.05, 0.014, M.steelDark, 0, 0, -0.06);
      const bladeMat = M.steelLight.clone();
      const blade = bx(0.008, 0.046, 0.34, bladeMat, 0, 0.004, -0.24);
      const tip = cyl(0.023, 0.001, 0.07, bladeMat, 0, 0.004, -0.445, Math.PI / 2, 0, 0, 4);
      this.knifeBlade = blade; this.knifeTip = tip;
      tip.scale.x = 0.35;
      const fuller = bx(0.009, 0.009, 0.26, M.steelDark, 0, 0.013, -0.23);
      const knuckles = bx(0.078, 0.014, 0.014, M.brass, 0, 0.028, -0.06);
      // A real fist on the handle, not a cube: the knife is the one time the
      // hand is the largest thing on screen.
      const fist = knifeHand(1, { scale: 0.97 });
      fist.position.set(0.002, -0.004, 0.028);
      fist.rotation.set(0.16, 0.06, -0.10);
      const knurl1 = bx(0.036, 0.044, 0.012, M.wood, 0, 0, 0.0);
      const knurl2 = bx(0.036, 0.044, 0.012, M.wood, 0, 0, 0.05);
      this.knife.add(grip, pommel, guard, blade, tip, fuller, knuckles, fist, knurl1, knurl2);
      this.knife.visible = false;
      this.root.add(this.knife);
    }
    // ---- cymbal monkey (wind-up before the throw) ----
    this.monkeyProp = buildMonkey();
    this.monkeyProp.visible = false;
    this.monkeyProp.position.set(0.16, -0.12, -0.42);
    this.root.add(this.monkeyProp);
    this.monkeyT = 0;
    // ---- empty hands for the PaP knuckle crack ----
    // Real articulated hands, not blocks: this is the one moment in the game
    // where nothing else is on screen, so every finger joint is visible.
    this.fists = new THREE.Group();
    {
      this.fistL = crackFist(-1);
      this.fistR = crackFist(1);
      this.handL = this.fistL.userData.hand;
      this.handR = this.fistR.userData.hand;
      this.fists.add(this.fistL, this.fistR);
      this.fists.visible = false;
      this.root.add(this.fists);
    }
    this.knuckleT = 0;
    this.perkBottle = null;
    this.perkDrinkT = 0;
    this.perkDrinkId = null;
  }

  // WaW PaP ritual: gun goes in, empty hands come up, two sharp cracks
  knuckleCrack() { this.knuckleT = 0.0001; }

  monkeyWindup() { this.monkeyT = 1; }

  startInspect() { this.inspectT = 0.0001; }

  startPerkDrink(perkId) {
    if (this.perkDrinkT > 0) return false;
    if (this.perkBottle) this.root.remove(this.perkBottle);
    this.perkBottle = buildPerkBottle(perkId);
    this.perkBottle.visible = true;
    // Pose and swap on THIS frame, not the next update(). A drink starts from
    // updateInteract, which runs after the rig update, so anything left for the
    // next frame gets one rendered frame of an unposed bottle sitting on the
    // camera and of the gun still in hand.
    posePerkBottle(this.perkBottle, 0);
    if (this.current) this.current.group.visible = false;
    this.root.add(this.perkBottle);
    this.perkDrinkId = perkId;
    this.perkDrinkT = 0.0001;
    this.reloadT = 0;
    this.inspectT = 0;
    this.meleeT = 0;
    return true;
  }

  get isDrinkingPerk() { return this.perkDrinkT > 0; }

  applyGoldCamo(on) {
    // BO1 gold: deep polished metal, real env reflections, slow sheen sweep + occasional glint
    if (on && this.current) {
      const mats = [];
      this.current.group.traverse((o) => {
        if (wearsWeaponFinish(o)) {
          o.material = o.material.clone();
          o.material.color.set(0xd4af37);
          o.material.metalness = 1.0;
          o.material.roughness = 0.3;
          o.material.envMap = metalEnvTex();
          o.material.envMapIntensity = 1.7;
          o.material.emissive = new THREE.Color(0x3a2a00);
          o.material.emissiveIntensity = 0.08;
          mats.push(o.material);
        }
      });
      this.goldCamo = { mats, t: Math.random() * 9 };
    } else this.goldCamo = null;
  }

  applyDiamondCamo() {
    // BO6-style diamond: platinum-white metal, hard reflections, elegant twinkling facets
    if (!this.current) return;
    const mats = [];
    this.current.group.traverse((o) => {
      if (wearsWeaponFinish(o)) {
        o.material = o.material.clone();
        o.material.color.set(0xf4f6fa);
        o.material.metalness = 1.0;
        o.material.roughness = 0.06;
        o.material.envMap = metalEnvTex();
        o.material.envMapIntensity = 1.7;
        o.material.emissive = new THREE.Color(0xffffff);
        o.material.emissiveMap = sparkleTex();
        o.material.emissiveIntensity = 0.2;
        mats.push(o.material);
      }
    });
    this.diamondCamo = { mats, t: 0 };
    this.flash.material.color.set(0xd8ecff); // icy muzzle flash
  }

  /**
   * Tell the rig which lens the viewmodel is filmed through.
   *
   * game.js re-parents the rig under a node that scales it and pushes it out so
   * the narrow viewmodel FOV does not double the weapon's apparent size. The
   * ADS pose has to solve for distances measured from the EYE, so it needs that
   * transform: camera-space z of an authored z is `offsetZ + scale * z`.
   */
  setViewLens(scale, offsetZ) {
    this.viewScale = scale || 1;
    this.viewOffsetZ = offsetZ || 0;
    if (this.current) this.current.adsZ = undefined;   // re-solve on the next frame
  }

  /**
   * The ADS depth for the equipped weapon, in the authored frame.
   *
   * One hardcoded number used to serve all 31 weapons, and it held every one of
   * them out at arm's length. Nobody aims a rifle at arm's length: you bring it
   * to your shoulder, which puts the rear sight a hand's width from your eye and
   * the butt BEHIND your cheek. Held out in front instead, the sight ended up
   * half a metre away — too small to aim with — and the stock, which should have
   * been behind the lens entirely, filled the bottom third of the frame.
   *
   * So solve for the cheek weld: put whatever you look THROUGH an eye-relief in
   * front of the lens. Weapons with nothing behind their sights — the pistols,
   * the Ray Gun, the knife — have no shoulder to come back to and keep the pose
   * they were authored with.
   *
   * But BOUND how far that travels by what is left behind the sight, because the
   * eye a real cheek weld puts 95mm behind a rear sight is not a 58-degree
   * rectilinear camera. Solved outright, an AK-74u comes back far enough to put
   * its receiver cover 2cm off the lens: the dot is lovely and the whole bottom
   * half of the screen is a foreshortened chrome slab of the gun's own backside,
   * which is no more aimable than the buttpad it replaced. The butt is not what
   * has to move to fix that — see tuckStock() — so each weapon closes only as
   * far as its own back end allows, and a weapon whose back end is clear (the
   * Type 100, the MP40) gets the whole cheek weld.
   */
  adsDepth(entry) {
    const { aimZ, rearZ, faceZ } = entry.group.userData;
    // Camera-space z of an authored z is `viewOffsetZ + viewScale * z`; solve
    // that for the depth landing a given authored z a given distance out.
    const depthFor = (z, dist) => (-dist - this.viewOffsetZ) / this.viewScale - z;
    const shouldered = aimZ != null && rearZ != null && rearZ - aimZ > ADS_STOCK_REACH;
    const depth = shouldered ? depthFor(aimZ, ADS_EYE_RELIEF) : ADS_HELD_Z;
    if (faceZ == null) return depth;
    return Math.min(depth, depthFor(faceZ, ADS_FACE_CLEAR));
  }

  /**
   * Send the buttstock to the shoulder as the weapon comes up.
   *
   * A shouldered stock is behind your cheek, so nothing of it should be on
   * screen — but the rig has no head, and dragging the whole weapon back far
   * enough to hide the butt puts the receiver on the lens instead, which reads
   * as a foreshortened close-up of the gun's own backside and is no easier to
   * aim than the buttpad was. Moving only the stock costs nothing in the sight
   * picture and is what the eye expects to see anyway.
   *
   * It slides straight down the view axis, away from the eye, so on screen it
   * only recedes — and it does not start until the weapon is a third of the way
   * up, which keeps the hip pose exactly as authored.
   */
  tuckStock(g, depth, t) {
    const tuck = g.userData.adsTuck;
    if (!tuck?.length) return;
    const ramp = Math.max(0, Math.min(1, (t - 0.34) / 0.66));
    const clear = (ADS_BUTT_CLEAR - this.viewOffsetZ) / this.viewScale;
    for (const { node, baseZ, frontZ } of tuck) {
      node.position.z = baseZ + ramp * Math.max(0, clear - frontZ - depth);
    }
  }

  setKnifeGold(on) {
    // golden glowing Bowie finish
    if (!this.knifeBlade) return;
    this.knifeGold = on;
    const m = this.knifeBlade.material;
    if (!takesPbrFinish(m)) return; // see takesPbrFinish: `emissive` on an unlit material throws mid-render
    if (on) {
      m.color.set(0xd8b84a);
      m.metalness = 0.9; m.roughness = 0.22;
      m.emissive = new THREE.Color(0xa87c14);
      m.emissiveIntensity = 0.9;
    } else {
      m.color.set(0x78808d); m.emissive = new THREE.Color(0x000000); m.emissiveIntensity = 0;
    }
    this.knifeTip.material = m;
  }

  /**
   * Animated weapon change: lower what is in frame, exchange the model out of
   * sight, then let equipT raise the new one. Falls through to an immediate
   * equip when the hands are empty, so first spawn and pickups stay instant.
   */
  swapTo(id, pap) {
    if (!this.current) { this.equip(id, pap); return; }
    this.holsterT = this.holsterDur;
    this.pendingEquip = { id, pap };
  }

  equip(id, pap) {
    if (this.current) this.root.remove(this.current.group);
    const group = buildViewmodel(id, pap);
    // The builder hands back a world-display presentation (centred, levelled,
    // scaled to hover over the mystery box, no hands). First person wants the
    // raw authored frame plus the gloves.
    const vm = group.userData.viewNode;
    if (vm) { vm.position.set(0, 0, 0); vm.rotation.set(0, 0, 0); vm.scale.setScalar(1); }
    const hands = group.userData.handsGroup;
    if (hands) (vm || group).add(hands);
    this.root.add(group);
    this.current = { id, pap, group, parts: group.userData.parts, cls: group.userData.cls };
    // PaP living finish: clone materials, attach scrolling pattern + palette
    this.camo = null;
    this.goldCamo = null;
    this.diamondCamo = null;
    const wantDiamond = pap && (this.alwaysGold || this.diamondNext);
    this.diamondNext = false;
    if (wantDiamond) {
      this.applyDiamondCamo();
    } else if (pap) {
      this.camo = applyPapLivingFinish(group, id, Math.random() * 10);
      // Settle the finish onto the frame it is built. applyPapLivingFinish leaves
      // emissive BLACK and only advance() gives it a colour, so a PaP weapon
      // handed over by papTake() — which runs after the rig update — spent its
      // first rendered frame as an unlit grey gun that then lit up. Dimmer than
      // steady state rather than brighter, so it was never the white flash, but
      // it is the same defect: the frame that builds a model must also dress it.
      advancePapLivingFinish(this.camo, 0);
      this.flash.material.color.setHSL(this.camo.style.hues[0], 0.95, 0.62); // PaP muzzle flash tint
    } else {
      this.flash.material.color.set(0xffffff);
      if (this.alwaysGold) this.applyGoldCamo(true); // GOLD STANDARD cheat
    }
    // attach flash at muzzle
    this.flash.removeFromParent();
    group.userData.muzzle.add(this.flash);
    this.equipT = 0;
    this.reloadT = 0;
    this.kick = 0;
    this._handsPosed = false;
    // Pose it NOW, at the bottom of its own raise, rather than leaving it on the
    // identity transform for update() to find next frame. equip() is called from
    // interaction code that runs AFTER the rig update — papTake(), giveWeapon() —
    // so a model left unposed is rendered once with its authored origin ON the
    // lens: a screenful of out-of-focus receiver that reads as a flash, not as a
    // gun. One frame is plenty to see it, because the frame that builds a
    // view-model is also the frame its materials compile, so it is the longest
    // frame of the whole hand-over.
    this._poseRaiseStart(group);
  }

  /** Bottom of the equip raise: exactly what update() computes at equipT 0. */
  _poseRaiseStart(group) {
    group.position.copy(this.hipPos);
    group.position.y -= EQUIP_RAISE_DROP;
    group.rotation.set(-EQUIP_RAISE_PITCH, 0, 0);
  }

  startReload(dur) { this.reloadDur = dur; this.reloadT = 0.0001; }
  get isReloading() { return this.reloadT > 0; }
  cycleBolt() { this.boltT = 0.0001; }
  get muzzleWorld() {
    if (!this.current) return new THREE.Vector3();
    return this.current.group.userData.muzzle.getWorldPosition(new THREE.Vector3());
  }
  fire() {
    // Scaled by how far into the shoulder the weapon already is, not by whether
    // the aim key is down: a shot fired halfway into the raise should disturb
    // the weapon halfway as much, or the kick jumps the moment ADS completes.
    this.kick = Math.min(1, this.kick + lerp(0.7, ADS_KICK_IMPULSE, this.adsT));
    this.flashT = 0.045;
    this.flash.material.rotation = Math.random() * Math.PI * 2;
    this.flash.scale.setScalar(0.18 + Math.random() * 0.1);
    if (this.current && (WEAPONS[this.current.id].bolt || WEAPONS[this.current.id].pump)) this.cycleBolt();
  }

  /** Authored rest transform of an animated part, captured on first touch. */
  _rest(o) {
    return o.userData.__rest ?? (o.userData.__rest = {
      p: o.position.clone(), r: o.rotation.clone(),
    });
  }

  /** Put both gloves back exactly where the view-model authored them. */
  _restHands() {
    const cur = this.current;
    if (!cur || !this._handsPosed) return;
    for (const key of ['hand_l', 'hand_r']) {
      const w = cur.parts[key];
      if (!w?.userData?.__rest) continue;
      w.position.copy(w.userData.__rest.p);
      w.rotation.copy(w.userData.__rest.r);
      if (w.userData.hand) resetHandPose(w.userData.hand);
    }
    this._handsPosed = false;
  }

  /**
   * Move a support/trigger hand onto something it is supposed to be holding.
   *
   * `amt` 0 leaves it on its authored grip, 1 puts it fully on the target.
   * `grip` re-closes the fingers, which is what stops a hand from sliding
   * around a magazine like a decal instead of taking hold of it.
   */
  _handTo(w, amt, tx, ty, tz, { roll = 0, pitch = 0, yaw = 0, grip = null, spread = 1 } = {}) {
    if (!w) return;
    const r = this._rest(w);
    this._handsPosed = true;
    const k = clamp(amt, 0, 1);
    w.position.set(
      lerp(r.p.x, tx, k),
      lerp(r.p.y, ty, k),
      lerp(r.p.z, tz, k),
    );
    w.rotation.set(r.r.x + pitch * k, r.r.y + yaw * k, r.r.z + roll * k);
    const h = w.userData.hand;
    if (h && grip !== null) {
      setHandPose(h, { curl: lerp(h.userData.baseCurl, grip, k), spread: lerp(1, spread, k) });
    }
  }

  _reloadAnim(t) {
    // t: 0..1 normalized reload progress. Returns {dip, roll} and moves parts.
    const cur = this.current;
    if (!cur) return { dip: 0, roll: 0 };
    const p = cur.parts;
    const dip = Math.sin(Math.min(t * 1.12, 1) * Math.PI);
    const cls = WEAPONS[cur.id].cls;
    const phase = (a, b) => clamp((t - a) / (b - a), 0, 1);
    const bell = (a, b) => Math.sin(phase(a, b) * Math.PI);
    // mag swap window for mag-fed weapons
    let magY = 0;
    if (p.mag && !WEAPONS[cur.id].breakAction) {
      const out = phase(0.08, 0.3), inn = phase(0.45, 0.68);
      const off = out < 1 ? -0.16 * Math.sin(out * Math.PI * 0.5) : (inn < 1 ? -0.16 * Math.cos(inn * Math.PI * 0.5) : 0);
      p.mag.position.y = p.mag.userData.y0 ?? (p.mag.userData.y0 = p.mag.position.y);
      p.mag.position.y += off;
      magY = off;
    }

    // ---- support hand: it has to actually HOLD what it is moving ----------
    //
    // The magazine used to slide out of the weapon on its own while the left
    // glove stayed welded to the handguard. Now the hand leaves the handguard,
    // closes on the magazine, rides it out, goes off-frame for a fresh one,
    // brings it back, seats it, slaps the floorplate, and only then goes back
    // to holding the gun.
    const hl = p.hand_l, hr = p.hand_r;
    if (hl && p.mag && !WEAPONS[cur.id].breakAction) {
      const m = p.mag.position, m0 = p.mag.userData.y0 ?? m.y;
      const reach = phase(0.04, 0.20);        // travel down to the magwell
      const carry = phase(0.20, 0.34);        // ride the mag out
      const away = phase(0.34, 0.44);         // drop it, go off-frame
      const back = phase(0.44, 0.60);         // return with a fresh one
      const seat = phase(0.60, 0.70);         // push it home
      const slap = bell(0.70, 0.80);          // palm the floorplate
      const home = phase(0.82, 1.0);          // back on the handguard
      // where the hand needs to be to have hold of the magazine body
      const gx = m.x, gy = m0 + magY - 0.055, gz = m.z + 0.012;
      let amt = 0, tx = gx, ty = gy, tz = gz, grip = 1.0;
      if (home > 0) { amt = 1 - home; grip = 1.0; }
      else if (back > 0) { amt = 1; tx = gx - 0.10 * (1 - back); ty = gy - 0.30 * (1 - back); grip = 1.0; }
      else if (away > 0) { amt = 1; tx = gx - 0.10 * away; ty = gy - 0.30 * away; grip = 1.0; }
      else if (carry > 0) { amt = 1; grip = 1.0; }
      else { amt = reach; grip = lerp(0.45, 1.0, reach); }
      if (seat > 0 && back >= 1) ty = gy + 0.012 * seat;
      this._handTo(hl, amt, tx, ty + slap * 0.016, tz, {
        roll: 0.42, pitch: -0.28, grip, spread: 0.9,
      });
    } else if (hl && (p.pump || p.magtube)) {
      // Pump gun: shells go in off-frame, then the forend is racked.
      const feed = bell(0.10, 0.62), rack = bell(0.68, 0.96);
      const rest = this._rest(hl);
      if (rack > 0.01 && p.pump) {
        this._handTo(hl, 1, rest.p.x, rest.p.y, (p.pump.userData.z0 ?? p.pump.position.z) + rack * 0.09 + 0.02, {
          grip: 1.05, spread: 0.9,
        });
      } else if (feed > 0.01) {
        this._handTo(hl, feed, rest.p.x - 0.10, rest.p.y - 0.13, rest.p.z + 0.16, {
          roll: 0.5, pitch: -0.4, grip: 0.55, spread: 1.15,
        });
      } else {
        this._restHands();
      }
    } else if (hl && !p.mag) {
      // Stripper clips, en-blocs, break actions: the hand leaves the forend,
      // loads over the open action, then comes back down.
      const load = bell(0.14, 0.70);
      if (load > 0.01) {
        const rest = this._rest(hl);
        this._handTo(hl, load, rest.p.x - 0.03, rest.p.y + 0.10, rest.p.z + 0.20, {
          roll: 0.55, pitch: -0.5, grip: 0.5, spread: 1.2,
        });
      } else {
        this._restHands();
      }
    }
    // Charging handle / bolt: the same hand comes off the handguard, yanks it
    // back and lets it fly. Sold by the hand leading the part, not trailing it.
    const charger = p.charge || p.oprod_handle || p.bolt_h || p.bolt_knob;
    if (hl && charger && p.mag && cls !== 'pistol') {
      const yank = bell(0.80, 0.94);
      if (yank > 0.01) {
        const c = charger.position;
        this._handTo(hl, yank, c.x + 0.030, c.y + 0.010, c.z + 0.030 + yank * 0.055, {
          roll: -0.55, pitch: 0.22, grip: 1.05, spread: 0.85,
        });
      }
    }
    // Pistols: the support hand comes across, cups the slide and racks it.
    if (hl && cls === 'pistol' && p.slide) {
      const rack = bell(0.60, 0.88);
      if (rack > 0.01) {
        this._handTo(hl, rack, 0.028, 0.046, 0.030 + rack * 0.05, { roll: -0.9, pitch: 0.3, grip: 1.05 });
      }
    }
    // The trigger hand stays on the grip, but the wrist rolls the weapon over
    // to present the magwell — the reason a real reload looks like one motion.
    if (hr) {
      const r = this._rest(hr);
      this._handsPosed = true;
      hr.rotation.set(r.r.x + dip * 0.10, r.r.y, r.r.z + dip * 0.14);
      const trig = hr.userData.hand;
      if (trig) setHandPose(trig, { curls: [1 - dip * 0.55, 1, 1, 1] }); // finger off the trigger
    }
    // charging / bolt / slide action near the end
    if (cur.cls === 'pistol' && p.slide) {
      p.slide.position.z = p.slide.userData.z0 ?? (p.slide.userData.z0 = p.slide.position.z);
      p.slide.position.z += t > 0.62 && t < 0.85 ? Math.sin((t - 0.62) / 0.23 * Math.PI) * 0.05 : 0;
    }
    if ((cur.id === 'kar98') && p.bolt) {
      const c = phase(0.55, 0.95);
      p.bolt.position.z = (p.bolt.userData.z0 ?? (p.bolt.userData.z0 = p.bolt.position.z)) + Math.sin(c * Math.PI) * 0.07;
      p.bolt_knob.position.z = (p.bolt_knob.userData.z0 ?? (p.bolt_knob.userData.z0 = p.bolt_knob.position.z)) + Math.sin(c * Math.PI) * 0.07;
    }
    if (p.cover && (cur.id === 'mg42' || cur.id === 'browning')) {
      p.cover.rotation.x = t > 0.1 && t < 0.6 ? -0.5 * Math.sin(phase(0.1, 0.6) * Math.PI) : 0;
    }
    if (cur.id === 'mg42' && p.drum) {
      // drum drops out, fresh drum seats home (synced to the belt foley)
      const out = phase(0.14, 0.32), inn = phase(0.52, 0.74);
      const off = out < 1 ? -0.13 * Math.sin(out * Math.PI * 0.5) : (inn < 1 ? -0.13 * Math.cos(inn * Math.PI * 0.5) : 0);
      p.drum.position.y = (p.drum.userData.y0 ?? (p.drum.userData.y0 = p.drum.position.y)) + off;
      p.drum_cap.position.y = (p.drum_cap.userData.y0 ?? (p.drum_cap.userData.y0 = p.drum_cap.position.y)) + off;
      if (p.belt_link) p.belt_link.visible = t < 0.14 || t > 0.74;
    }
    if (cur.id === 'ptrs41' && p.clip) {
      // spent clip pops out the top; new one pressed down
      const out = phase(0.18, 0.36), inn = phase(0.5, 0.7);
      const off = out < 1 ? 0.12 * Math.sin(out * Math.PI * 0.5) : (inn < 1 ? 0.12 * Math.cos(inn * Math.PI * 0.5) : 0);
      p.clip.position.y = (p.clip.userData.y0 ?? (p.clip.userData.y0 = p.clip.position.y)) + off;
    }
    if (cur.id === 'dbshotgun' && p.barrels) {
      // break open then close
      const open = t < 0.55 ? phase(0.05, 0.3) - phase(0.35, 0.55) : 0;
      p.barrels.rotation.x = open * 0.55;
    }
    if (cur.id === 'panzerschreck' && p.rocket) {
      p.rocket.visible = t > 0.5;
    }
    return { dip, roll: dip * 0.30 };
  }

  _boltAnim(dt) {
    // bolt/pump cycle between shots
    if (this.boltT <= 0) return;
    this.boltT += dt;
    const cur = this.current;
    const DUR = 0.62;
    const t = Math.min(1, this.boltT / DUR);
    const p = cur.parts;
    const arc = Math.sin(t * Math.PI);
    if (cur.id === 'kar98' && p.bolt) {
      p.bolt.position.z = (p.bolt.userData.z0 ?? (p.bolt.userData.z0 = p.bolt.position.z)) + arc * 0.07;
      p.bolt_knob.position.z = (p.bolt_knob.userData.z0 ?? (p.bolt_knob.userData.z0 = p.bolt_knob.position.z)) + arc * 0.07;
      p.bolt_knob.rotation.y = arc * 0.7;
    }
    if ((cur.id === 'mosin' || cur.id === 'springfield') && p.bolt_h) {
      // handle rotates up, bolt draws back, then seats home again
      const pull = Math.sin(t * Math.PI);
      p.bolt_h.position.z = (p.bolt_h.userData.z0 ?? (p.bolt_h.userData.z0 = p.bolt_h.position.z)) + pull * 0.075;
      p.bolt_h.rotation.z = (cur.id === 'mosin' ? -0.9 : -0.4) - pull * 0.55;
      p.bolt_knob.position.z = (p.bolt_knob.userData.z0 ?? (p.bolt_knob.userData.z0 = p.bolt_knob.position.z)) + pull * 0.075;
      p.bolt_knob.position.y = (p.bolt_knob.userData.y0 ?? (p.bolt_knob.userData.y0 = p.bolt_knob.position.y)) + pull * 0.02;
    }
    if (cur.id === 'trench' && p.pump) {
      p.pump.position.z = (p.pump.userData.z0 ?? (p.pump.userData.z0 = p.pump.position.z)) + arc * 0.09;
      // the hand goes WITH the forend — it is the thing racking it
      if (p.hand_l) {
        const r = this._rest(p.hand_l);
        this._handsPosed = true;
        p.hand_l.position.set(r.p.x, r.p.y, r.p.z + arc * 0.09);
        p.hand_l.rotation.set(r.r.x, r.r.y, r.r.z - arc * 0.12);
      }
    }
    // Bolt guns: the firing hand leaves the grip, lifts the handle, draws the
    // bolt and returns. Nothing else about a bolt action reads as deliberate.
    if (p.hand_r && (cur.id === 'kar98' || cur.id === 'mosin' || cur.id === 'springfield')) {
      const knob = p.bolt_knob || p.bolt_h;
      if (knob) {
        const reach = Math.min(1, arc * 1.6);
        this._handTo(p.hand_r, reach, knob.position.x + 0.006, knob.position.y + 0.030, knob.position.z + 0.045, {
          roll: -0.75, pitch: 0.30, grip: 1.05, spread: 0.8,
        });
      }
    }
    if (t >= 1) this.boltT = 0;
  }

  update(dt, opts) {
    const { ads, moving, sprinting, sliding, mouseX, mouseY } = opts;
    this.adsT = damp(this.adsT, ads ? 1 : 0, 14, dt);
    // The camera banks into a slide (CameraRig.slideBank) but the viewmodel is
    // a child of the camera, so it inherits that roll and reads as bolt upright
    // while the world tilts behind it. The gun needs its own cant to look like
    // it belongs to a body going down. Slower in than the camera's 18 so the
    // weapon follows the head over rather than moving with it.
    this.slideT = damp(this.slideT, sliding ? 1 : 0, sliding ? 13 : 8, dt);
    if (sliding && !this._wasSliding) this.slideHit = 1;
    this._wasSliding = !!sliding;
    this.slideHit = damp(this.slideHit, 0, 4.2, dt);
    if (this.holsterT > 0) {
      this.holsterT = Math.max(0, this.holsterT - dt);
      if (this.holsterT === 0 && this.pendingEquip) {
        const { id, pap } = this.pendingEquip;
        this.pendingEquip = null;
        this.equip(id, pap);          // resets equipT, so the raise follows on
      }
    }
    this.equipT = Math.min(1, this.equipT + dt / 0.35);
    this.kick = damp(this.kick, 0, 10 + this.adsT * ADS_KICK_SETTLE, dt);
    this.meleeT = Math.max(0, this.meleeT - dt / 0.45);
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.material.opacity = Math.max(0, this.flashT / 0.045);
    }
    if (this.goldCamo) {
      const gc = this.goldCamo;
      gc.t += dt;
      // slow sheen breathing + a sharp glint sweeping past every ~3.5s
      const base = 0.08 + Math.sin(gc.t * 1.7) * 0.04;
      const cyc = (gc.t % 3.5) / 3.5;
      const glint = cyc < 0.12 ? Math.sin((cyc / 0.12) * Math.PI) * 0.55 : 0;
      for (const m of gc.mats) m.emissiveIntensity = base + glint;
    }
    if (this.diamondCamo) {
      const dc = this.diamondCamo;
      dc.t += dt;
      // elegant twinkle: sparse sharp sparkles, faint icy hue drift
      for (let i = 0; i < dc.mats.length; i++) {
        const m = dc.mats[i];
        const tw = Math.max(0, Math.sin(dc.t * 2.2 + i * 2.39)) ** 9;
        m.emissiveIntensity = 0.16 + tw * 1.5;
        m.emissive.setHSL(0.58 + Math.sin(dc.t * 0.4 + i) * 0.06, 0.25, 0.9);
      }
    }
    // PaP finish: scroll pattern + pulse palette while you play
    if (this.camo) {
      advancePapLivingFinish(this.camo, dt);
    }
    this._boltAnim(dt);
    if (this.perkDrinkT > 0 && this.perkBottle) {
      this.perkDrinkT += dt;
      const t = this.perkDrinkT;
      const b = this.perkBottle;
      posePerkBottle(b, t);
      if (t >= PERK_DRINK_TIMELINE.duration) {
        this.root.remove(b);
        this.perkBottle = null;
        this.perkDrinkT = 0;
        this.perkDrinkId = null;
      }
    }
    if (moving) this.bobPhase += dt * (sprinting ? 11 : 7);
    this.swayX = damp(this.swayX, clamp(-mouseX * 0.0006, -0.03, 0.03), 8, dt);
    this.swayY = damp(this.swayY, clamp(mouseY * 0.0006, -0.03, 0.03), 8, dt);
    if (this.reloadT > 0) {
      this.reloadT += dt;
      if (this.reloadT >= this.reloadDur) this.reloadT = 0;
    }
    // weapon inspection: raise toward eye, roll to admire both sides, settle
    // Held while a raise is still running. papTake() starts both on the same
    // frame, and an inspect lift added to an equip lift is two curves pulling the
    // weapon up the same axis at once — it arrives too high, too early, and drops
    // back. Waiting costs 0.35s and turns it into raise, THEN present.
    let inspect = null;
    if (this.inspectT > 0 && this.equipT >= 1) {
      this.inspectT += dt;
      const D = 2.4;
      if (this.inspectT >= D) this.inspectT = 0;
      else {
        const t01 = this.inspectT / D;
        const inn = Math.min(1, t01 / 0.18), out = Math.min(1, Math.max(0, (t01 - 0.78) / 0.22));
        const env = inn * (1 - out);
        const roll = Math.sin(Math.min(1, Math.max(0, (t01 - 0.2) / 0.5)) * Math.PI);
        inspect = { env, roll };
      }
    }
    if (!this.current) return;
    const g = this.current.group;
    const t = this.adsT;
    const bobA = (1 - t * 0.85) * (moving ? 0.011 : 0.003);
    const bx2 = Math.sin(this.bobPhase) * bobA;
    const by = -Math.abs(Math.cos(this.bobPhase)) * bobA * 0.8;
    // ADS raises the gun until the rear sight (or optic) sits on your eye line
    // and pulls it back until that sight sits an eye-relief away — you look
    // THROUGH the rear aperture onto the front post, like the real thing, with
    // the stock past your cheek rather than in front of your nose.
    const sightY = g.userData.sightY ?? 0.09;
    this.current.adsZ ??= this.adsDepth(this.current);
    this.tuckStock(g, this.current.adsZ, t);
    const adsP = this._adsP || (this._adsP = new THREE.Vector3());
    adsP.set(0, -(sightY + 0.006), this.current.adsZ);
    g.position.lerpVectors(this.hipPos, adsP, t);
    g.position.x += bx2 + this.swayX * (1 - t);
    g.position.y += by + this.swayY * (1 - t);
    // See ADS_KICK_* — the aimed weapon spends its recoil down the sight line
    // rather than across it, so the sight picture survives a burst.
    g.position.z += this.kick * 0.09 * lerp(1, ADS_KICK_PUSH, t);
    let rx = this.kick * 0.16 * lerp(1, ADS_KICK_PITCH, t), ry = 0, rz = 0;
    if (inspect) {
      // bring to center-eye, tilt to admire the finish, then return
      g.position.x = lerp(g.position.x, 0.02, inspect.env * 0.85);
      g.position.y += inspect.env * 0.09;
      g.position.z += inspect.env * 0.06;
      ry += inspect.roll * 0.9 * inspect.env;
      rz += inspect.env * 0.22 - inspect.roll * 0.35 * inspect.env;
      rx += inspect.env * 0.12;
    }
    if (sprinting && !ads) { ry = 0.62; rx = 0.34; g.position.y -= 0.07; g.position.x += 0.03; }
    // Slide: cant the weapon over to the left and tuck it in, hardest at entry.
    // Additive on top of whatever pose is already running (the sprint pose
    // releases the frame the slide starts, so this is what catches it). Scaled
    // out by ADS purely defensively — a slide ends the moment you aim.
    if (this.slideT > 0.001) {
      const sl = this.slideT * (1 - t);
      rz += sl * (0.11 + this.slideHit * 0.05);
      ry += sl * 0.09;                 // muzzle drifts across the body with the lean
      rx += sl * 0.05;                 // ...and rides a touch nose-up as you go down
      g.position.y -= sl * 0.030;
      g.position.x += sl * 0.012;
      g.position.z += sl * 0.018;      // tucked in toward the chest
    }
    // Eased out, not linear. A linear raise is still travelling at full speed on
    // the frame equipT reaches 1 and then simply stops, which is the part that
    // reads as a snap; squared, it leaves the holster just as briskly and settles
    // into the rest pose with the velocity already spent.
    const eq = (1 - this.equipT) ** 2;
    g.position.y -= eq * EQUIP_RAISE_DROP; rx -= eq * EQUIP_RAISE_PITCH;
    // Holster drops along the same axis the raise comes back up, so the two
    // halves of a swap read as one continuous motion. Left linear: it hands over
    // to the raise at the bottom, where the raise is at its fastest.
    if (this.holsterT > 0) {
      const h = 1 - (this.holsterT / this.holsterDur);   // 0 at start -> 1 down
      g.position.y -= h * EQUIP_RAISE_DROP; rx -= h * EQUIP_RAISE_PITCH;
    }
    if (this.reloadT > 0) {
      const anim = this._reloadAnim(this.reloadT / this.reloadDur);
      // The old motion DROPPED the weapon. At the current view-model presence
      // that put the magwell — the only thing a reload is about — a good ten
      // degrees below the bottom of the frame. A real reload comes UP and IN
      // toward the chest and cants the magazine well toward the eye, which is
      // both what people do and what puts the animation on screen.
      g.position.y += anim.dip * 0.120 * (1 - t);
      g.position.x -= anim.dip * 0.105 * (1 - t);
      g.position.z += anim.dip * 0.045;
      rz += anim.roll; rx -= anim.dip * 0.06;
    } else {
      if (this.current.parts.barrels && WEAPONS[this.current.id].breakAction) {
        this.current.parts.barrels.rotation.x = 0;
      }
      // Nothing is driving the gloves this frame, so put them back on the gun.
      if (this.boltT <= 0) this._restHands();
    }
    // cymbal monkey wind-up: raise, key spins, arms clash, then it's thrown
    if (this.monkeyT > 0) {
      this.monkeyT = Math.max(0, this.monkeyT - dt / 0.85);
      const mt = 1 - this.monkeyT;
      const mp = this.monkeyProp;
      mp.visible = true;
      const raise = Math.min(1, mt / 0.25);
      const settle = Math.min(1, Math.max(0, (mt - 0.6) / 0.4));
      mp.position.set(0.16 - settle * 0.05, -0.22 + raise * 0.14 + settle * 0.02, -0.42);
      mp.rotation.y = Math.sin(mt * 9) * 0.2;
      mp.userData.key.rotation.z += dt * 22;
      const clash = Math.sin(mt * 22) * 0.55;
      mp.userData.armL.rotation.z = -0.5 + clash;
      mp.userData.armR.rotation.z = 0.5 - clash;
      if (this.monkeyT <= 0) mp.visible = false;
    }
    // PaP knuckle crack — the one animation with nothing else on screen.
    // Beat sheet and pose math live in poseKnuckleCrack().
    if (this.knuckleT > 0) {
      this.knuckleT += dt;
      if (this.knuckleT >= KNUCKLE_DUR) { this.knuckleT = 0; this.fists.visible = false; }
      else {
        this.fists.visible = true;
        const k = poseKnuckleCrack(this.knuckleT / KNUCKLE_DUR, this);
        // gun glides down and stays away for the whole ritual
        g.position.y -= k.gunDrop;
        rx -= k.pitchDrop;
      }
    }
    if (this.meleeT > 0) {
      // trench-knife slash: windup -> diagonal sweep across the view -> recover
      if (this.current) this.current.group.visible = false;
      const k = this.knife;
      k.visible = true;
      const t = 1 - this.meleeT; // 0..1 over 0.45s
      const windup = clamp(t / 0.18, 0, 1);
      const slash = clamp((t - 0.18) / 0.34, 0, 1);
      const recover = clamp((t - 0.52) / 0.48, 0, 1);
      const se = slash * slash * (3 - 2 * slash); // smoothstep sweep
      const re = recover * recover * (3 - 2 * recover);
      // start: low right, edge up, pulled back. sweep: up-left across center.
      k.position.set(
        0.28 - se * 0.4 + re * 0.12 + windup * 0.02,
        -0.22 + windup * 0.06 + se * 0.2 - re * 0.18,
        -0.38 - se * 0.14 + re * 0.18
      );
      k.rotation.set(
        -0.3 - se * 0.9 + re * 1.1,
        0.25 - se * 0.5,
        -0.5 - se * 1.5 + re * 1.8
      );
      g.position.z -= 0; // weapon hidden; no gun lunge
    } else {
      this.knife.visible = false;
      if (this.current) this.current.group.visible = !this.rigHidden && !this.papHide && this.knuckleT <= 0 && this.perkDrinkT <= 0;
    }
    g.rotation.set(rx, ry, rz);
  }
}
