// The first-person weapon rig. WeaponRig carries the view-model on the camera
// and poses it every frame; its ADS solve, its finishes, and its reload and bolt
// animation are in rig-ads.js, rig-finish.js and rig-reload.js.
import * as THREE from 'three';
import { clamp, damp, lerp, installMixins } from '../utils.js';
import { PERK_DRINK_TIMELINE } from '../gameplay-rules.js';
import { WM } from '../render/WeaponMaterials.js';
import { bx, cyl } from '../render/WeaponParts.js';
import { crackFist, knifeHand } from '../render/WeaponHands.js';
import { WEAPONS } from './catalog.js';
import { buildMonkey } from './monkey.js';
import { buildPerkBottle, posePerkBottle } from './perk-bottle.js';
import { buildViewmodel } from './viewmodel.js';
import { KNUCKLE_DUR, poseKnuckleCrack } from './knuckle-crack.js';
import { WeaponRigAds } from './rig-ads.js';
import { WeaponRigFinish } from './rig-finish.js';
import { WeaponRigReload } from './rig-reload.js';

// Shared, lazily-generated PBR library (see js/render/WeaponMaterials.js).
// `M` keeps its historical key names so the knife, fists and monkey prop below
// keep reading the way they always did.
const M = WM;

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
    this._dressFinish(group, id, pap);
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
    this._animateFinish(dt);
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

// WeaponRig's ADS solve, its finishes, and its reload and bolt animation are
// in js/weapons/rig-*.js. Each file is a class whose methods are copied onto
// WeaponRig.prototype here, as Game's are; a name defined twice fails at load.
installMixins(WeaponRig, [WeaponRigAds, WeaponRigFinish, WeaponRigReload]);
