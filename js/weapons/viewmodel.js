// View-model construction — detailed per-weapon silhouettes. buildViewmodel()
// builds any weapon in its first-person authoring frame, lifts the sight line
// clear of it and measures where the eye goes; the parts come from the class
// files in js/weapons/models/.
import * as THREE from 'three';
import { matSet } from '../render/WeaponMaterials.js';
import { mesh, bevelBoxGeo, FRONT_POST_H } from '../render/WeaponParts.js';
import { getStats } from './catalog.js';
import { PISTOLS } from './models/pistols.js';
import { SMGS } from './models/smgs.js';
import { RIFLES } from './models/rifles.js';
import { MODERN_RIFLES } from './models/modern-rifles.js';
import { SNIPERS } from './models/snipers.js';
import { LMGS } from './models/lmgs.js';
import { SHOTGUNS } from './models/shotguns.js';
import { SPECIALS } from './models/specials.js';

// Returns group; animatable parts registered in group.userData.parts.
//
// AIM[id] is the AUTHORED local Y of the weapon's sight line. Every front post
// tip, rear notch floor, aperture centre and red-dot reticle below is placed on
// that one number, which is what makes the sight picture line up instead of
// merely looking close. WeaponRig drives ADS with
//   group.position.y = -(userData.sightY + 0.006)
// so whatever lands on the sight line lands on the camera's optical axis when
// fully aimed.
//
// It is the authored value and not the final one because the clearance pass at
// the end of buildViewmodel() lifts the whole sighting arrangement when the line
// does not clear the receiver it runs over — several of these were set below
// their own receiver tops. `userData.sightY` is the number that survived.
const AIM = {
  m1911: 0.077, magnum: 0.079, kar98: 0.064, gewehr43: 0.068, m1a1: 0.063, m1garand: 0.070,
  type100: 0.063, mp40: 0.059, thompson: 0.064, stg44: 0.082, fg42: 0.073, bar: 0.079,
  mg42: 0.096, browning: 0.100, ppsh: 0.063, trench: 0.066, dbshotgun: 0.060,
  ump45: 0.080, acr: 0.086, famas: 0.106, ak74u: 0.066, galil: 0.070, commando: 0.104,
  raygun: 0.082, dg2: 0.088, ptrs41: 0.084, mosin: 0.088, springfield: 0.088, panzerschreck: 0.130,
  bowie: 0.06, monkey: 0.06,
};

const _aimBox = new THREE.Box3();
const _aimVec = new THREE.Vector3();
// The channel around the sight line that counts as "in your face" when aiming.
// Sized to the MIDDLE HALF of the ADS frame at ADS_FACE_CLEAR — the part of the
// screen you aim with. Something grazing the bottom edge of the frame is the
// gun you are looking over and always will be; something in the middle of it at
// the same distance is a wall. That distinction is the whole test: it lets a
// Kar98k's comb pass the lens at 3cm while stopping the Browning's carry handle
// and the Gewehr 43's receiver, which arrive at the same distance dead centre.
const ADS_FACE_HALF_H = 0.020;
const ADS_FACE_HALF_W = 0.047;

// One builder per weapon id, from the class files in js/weapons/models/.
const VIEWMODEL_BUILDERS = {
  ...PISTOLS, ...SMGS, ...RIFLES, ...MODERN_RIFLES, ...SNIPERS, ...LMGS, ...SHOTGUNS, ...SPECIALS,
};

export function buildViewmodel(id, pap) {
  const s = getStats(id, pap);
  // getStats resolves an unknown id to the starting pistol, and the builder
  // table only has entries for known ids, so the lookup below has to use the
  // RESOLVED id. Left on the raw id, the per-weapon switch this replaced fell
  // through every case and returned a group with no muzzle, which equip() then
  // dereferenced.
  id = s.id;
  const g = new THREE.Group();
  // Gloved hands live in a container that is NOT part of the returned tree.
  // Only WeaponRig.equip() re-attaches them; the mystery box and the
  // Pack-a-Punch display get the weapon alone, which is the whole point.
  const handsG = new THREE.Group();
  const T = matSet(pap);
  const ST = T.body;        // receivers, slides, frames
  const STD = T.dark;       // sights, small hardware, dark furniture
  const STL = T.bright;     // bolts, pins, machined bright parts
  const STM = T.matte;      // parkerised / phosphate
  const SH = T.sheet;       // stamped sheet steel
  const W = T.wood;
  const WD = T.woodDark;
  const CK = T.checker;     // checkered wood / stippled panels
  const GR = T.grip;        // bakelite & polymer grips
  const BR = T.brass;
  const A = AIM[id] ?? 0.08;
  let aimY = AIM[id] ?? 0.08;   // the sight line, after the clearance lift below
  const parts = {};
  const P = (name, mesh) => {
    parts[name] = mesh;
    (name === 'hand_r' || name === 'hand_l' ? handsG : g).add(mesh);
    return mesh;
  };
  // The weapon's own parts, from its class file in js/weapons/models/: the
  // builder adds them through P and returns where the muzzle sits.
  const muzzleZ = VIEWMODEL_BUILDERS[id]({
    id, pap, g, parts, P, T, ST, STD, STL, STM, SH, W, WD, CK, GR, BR, A,
  });
  // An optic and a rear iron sight cannot both stand in the eye's path. The
  // iron sits BEHIND the glass, so its protective ears rise into the middle of
  // the window — on the AK-74u they covered the bottom half of the dot, which
  // is the whole reason you could not see the reticle. A real optic install
  // strips or folds the rear leaf and whatever base it stood on, so do that.
  // The front post stays: it is forward of the reticle, and seeing it low in
  // the glass is what looking through a red dot actually looks like.
  if (parts.reddot?.visible) {
    for (const k of ['sight_r', 'sight_base']) if (parts[k]) parts[k].visible = false;
  }
  // A sight line has to clear the weapon it runs over. These were placed from a
  // table of aim heights rather than from the receivers they sit on, and a lot of
  // them ended up BELOW their own receiver top: the Gewehr 43's by 8mm, the
  // Garand's by 10mm, the AK-74u's red dot by 17mm — which is exactly the raised
  // part in front of the dot you could not aim past. Aiming those put your eye
  // inside the gun. So measure the tallest thing standing in the eye's path and
  // lift the whole sighting arrangement until the channel you look down is clear.
  //
  // Front and rear move together, because a sight line only means anything if
  // both ends are on it, and anything left hanging gets a boss down to whatever
  // it is supposed to be bolted to.
  {
    const rd = parts.reddot?.visible ? parts.reddot : null;
    const sights = ['sight', 'sight_f', 'sight_r', 'sight_base', 'reddot', 'scope']
      .map((k) => parts[k]).filter(Boolean);
    // The channel: an optic's whole glass has to be see-through, and an iron
    // sight needs the whole FRONT POST, not just the line through its tip.
    // Clearing only the line itself, which is what this used to ask for, let gas
    // tubes and barrel bands stand a millimetre under it — and since those sit
    // out at the muzzle alongside the post, a millimetre there hides the post's
    // whole length. The post is the tallest thing that has to stay in view, so
    // it sets the clearance.
    const width = rd ? (rd.userData.opticR ?? 0.019) * 0.9 : 0.010;
    const rise = rd ? width + 0.001 : FRONT_POST_H + 0.002;
    // Obstructions count up to the near face of the sight. What lies beyond it
    // you are looking THROUGH, which is what a sight picture is.
    g.updateMatrixWorld(true);
    const boxOf = (node) => (_aimBox.setFromObject(node), _aimBox.isEmpty() ? null : _aimBox.clone());
    const front = rd ? null : (parts.sight_f && boxOf(parts.sight_f));
    const fromZ = rd ? (rd.userData.opticGlassZ ?? rd.position.z) : front?.min.z;
    const inPath = (b) => b.min.x < width && b.max.x > -width && b.max.z > fromZ;
    const others = [];
    g.traverse((o) => {
      if (!o.isMesh) return;
      for (let p = o; p; p = p.parent) if (!p.visible || sights.includes(p)) return;
      others.push({ o, b: boxOf(o) });
    });
    let top = -Infinity;
    if (fromZ != null) for (const { b } of others) if (b && inPath(b)) top = Math.max(top, b.max.y);
    // Capped, because past a couple of centimetres the answer is not a taller
    // sight boss but a part that should not be on the centreline at all. Anything
    // that needs more than this is a modelling bug, and the validator says so.
    const lift = top > -Infinity ? Math.min(0.020, Math.max(0, top + rise - A)) : 0;
    if (lift > 0) {
      for (const s of sights) {
        const b = boxOf(s);
        s.position.y += lift;
        if (!b || !s.visible) continue;
        // The lift leaves a hole exactly `lift` tall under the sight. Fill THAT,
        // rather than hunting for whatever is underneath: the vacated volume is
        // by definition still touching whatever the sight was bolted to, so a
        // boss occupying it cannot leave the sight hanging.
        // Narrow, and sunk well past where the sight used to sit: a front sight
        // stands on a ROUND barrel, so a wide flat-bottomed boss only touches at
        // its corners and a shallow one clears the crown entirely.
        const w = Math.min(0.014, (b.max.x - b.min.x) * 0.5);
        const d = Math.min(0.028, (b.max.z - b.min.z) * 0.8);
        const drop = 0.008;
        s.add(mesh(bevelBoxGeo(w, lift + drop + 0.002, d, 0.0015), STD,
          (b.min.x + b.max.x) / 2 - s.position.x,
          b.min.y + (lift - drop) / 2 - s.position.y,
          (b.min.z + b.max.z) / 2 - s.position.z));
      }
    }
    // ADS aligns the eye with the sight you are actually looking through, so it
    // is the optic's axis when one is fitted and the lifted iron line otherwise.
    aimY = rd ? rd.position.y : A + lift;
  }
  // muzzle anchor
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, muzzleZ);
  g.add(muzzle);
  const strip = (o) => { o.frustumCulled = false; if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } };
  g.traverse(strip);
  handsG.traverse(strip);
  // The returned root carries the display transform on `g`; the rig resets it.
  const root = new THREE.Group();
  root.add(g);
  root.userData.muzzle = muzzle;
  root.userData.parts = parts;
  root.userData.cls = s.cls;
  // For true sight-picture ADS alignment: the optic's axis when one is fitted,
  // otherwise the iron sight line this weapon was authored around.
  root.userData.sightY = aimY - 0.006;
  // Where the eye goes when aiming, both in the authored view frame and before
  // any display transform. WeaponRig.adsDepth() solves the pose from these.
  //
  //   aimZ   the eye-side face of whatever you look THROUGH — optic tube, peep
  //          ring, notch leaf, scope eyepiece. A cheek weld puts the eye an
  //          eye-relief behind this, and everything else follows from that.
  //   rearZ  the back of the weapon. How far it reaches behind aimZ is what
  //          says whether there is a stock to bring to your shoulder at all.
  g.updateMatrixWorld(true);
  const eyeFaceZ = (node) => {
    if (!node?.visible) return null;
    _aimBox.setFromObject(node);
    return _aimBox.isEmpty() ? null : _aimBox.max.z;
  };
  // Rear elements only. A cheek weld needs something to weld TO — an optic tube,
  // a peep ring, a notch leaf — and a bead at the muzzle is not it. Solving the
  // weld off the front sight is how the double-barrel ended up with its own bead
  // 12cm from the eye, filling the middle of the screen with the hood that is
  // supposed to frame it, and how the Panzerschreck's ladder — which sits a foot
  // out along the tube, not against your cheek — pulled a 21cm blast shield to
  // within 12cm of the lens.
  root.userData.aimZ = [parts.reddot, parts.scope, parts.sight_r, parts.sight_base]
    .reduce((acc, p) => acc ?? eyeFaceZ(p), null);
  // Shouldering a weapon puts its butt behind your cheek, not in front of your
  // nose. The rig has no head to tuck it behind — and it cannot just drag the
  // whole weapon back, because that lands the receiver ON the lens and turns the
  // sight picture into a foreshortened close-up of the gun's own backside, which
  // is exactly as unaimable as the buttpad was. So the parts that live ENTIRELY
  // behind the sight — which is what a buttstock IS — ride back past the lens as
  // you aim, and the rest of the weapon stays where it reads.
  const tuck = [];
  if (root.userData.aimZ != null) {
    for (const node of Object.values(parts)) {
      if (!node?.parent || node.parent !== g) continue;
      _aimBox.setFromObject(node);
      if (_aimBox.isEmpty() || _aimBox.min.z < root.userData.aimZ + 0.02) continue;
      tuck.push({ node, baseZ: node.position.z, frontZ: _aimBox.min.z });
    }
  }
  root.userData.adsTuck = tuck;
  // The back of the WHOLE weapon, tuck or no tuck. This is the "is there a stock
  // to bring to a shoulder at all" question, and a stock that is about to slide
  // out of frame is still a stock.
  _aimBox.setFromObject(g);
  root.userData.rearZ = _aimBox.isEmpty() ? null : _aimBox.max.z;
  // The nearest thing to the eye that will still be ON SCREEN once the weapon is
  // shouldered — and so the thing that says how far in the cheek weld may go.
  // A one-piece stock runs forward under the barrel and cannot be tucked away on
  // its own; a receiver cover, a carry handle or a bolt cannot be tucked at all.
  // Put the eye an eye-relief behind the sight regardless and the Gewehr 43's
  // receiver lands 13mm off the lens, inside the near plane, sliced open.
  //
  // Only the channel around the sight line counts. At the clearance below, the
  // frame is about this tall and this wide, so anything outside it is off screen
  // however close it gets — which is exactly what lets a buttpad slide past your
  // cheek while a receiver cover may not.
  const tucked = new Set(tuck.map((t) => t.node));
  let faceZ = -Infinity;
  for (const child of g.children) {
    if (tucked.has(child)) continue;
    child.traverse((o) => {
      if (!o.isMesh || !o.geometry?.getAttribute('position')) return;
      for (let p = o; p && p !== g; p = p.parent) if (!p.visible) return;
      const pos = o.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        _aimVec.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        if (_aimVec.z <= faceZ) continue;
        if (Math.abs(_aimVec.y - aimY) > ADS_FACE_HALF_H) continue;
        if (Math.abs(_aimVec.x) > ADS_FACE_HALF_W) continue;
        faceZ = _aimVec.z;
      }
    });
  }
  root.userData.faceZ = faceZ > -Infinity ? faceZ : null;
  root.userData.viewNode = g;
  root.userData.handsGroup = handsG;
  root.frustumCulled = false;
  return root;
}
