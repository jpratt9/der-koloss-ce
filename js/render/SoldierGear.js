// Uniform and field gear for the four playable marines, as seen by other
// players in co-op.
//
// WHAT THIS IS NOT: it is not a body. The shipped CC0 humanoid stays the body —
// its sculpted head, its face, its fingers, its skinned limbs. Nothing here
// replaces a limb, and nothing here is allowed to float. Every piece is a
// merged rigid shell parented to the bone it belongs to, so it inherits that
// bone's motion for free and cannot desync from the pose. That is the same
// contract as js/render/ZombieDetail.js, and for the same reason: the moment
// gear stops being a child of a bone it starts sliding off the body.
//
// The two traps that cost the most time, both inherited from ZombieDetail:
//
//  - BONE AXES ARE NOT WORLD AXES. This rig's spine leans a long way forward,
//    so a local -Y offset on the Torso travels down AND backwards. Every mount
//    below cancels its bone's rest world rotation, which lets the geometry be
//    authored in plain world-aligned metres against a standing figure.
//
//  - THE RIG IS RESCALED AROUND ATTACHMENT. SoldierVisual normalises height
//    before mounting and again after (once the oversized head has been brought
//    down to human proportion). Mounts cancel the bone's world SCALE at attach
//    time, uniformly — a component-wise inverse does not commute with the
//    rotation and shears the mesh — and the later uniform rescale then applies
//    to body and gear alike, which is exactly what should happen.
//
// Memory shape: the geometry pool is built once per persona for the whole
// process and every avatar gets cheap Meshes POINTING AT it. Four players can
// join, leave and rejoin all session without allocating a second helmet.
import * as THREE from 'three';
import { SOLDIER_LOOKS } from './SoldierGear/looks.js';
import { materials } from './SoldierGear/materials.js';
import { buildWardrobe } from './SoldierGear/wardrobe.js';

export {
  HEAD_SCALE, HEAD_SHAPE, HAND_SCALE, FOOT_SCALE, LIMB_SHAPE, SPINE_FIX,
} from './SoldierGear/constants.js';
export { SOLDIER_LOOKS } from './SoldierGear/looks.js';

// ---------------------------------------------------------------------------
// attachment
// ---------------------------------------------------------------------------

const _pool = new Map();          // persona id -> Map(bone -> {geo, mats})
const _scratchScale = new THREE.Vector3();
const _scratchQuat = new THREE.Quaternion();

/** Bones whose gear is dropped first when an avatar gets far away. */
const LIMB_BONES = new Set([
  'UpperArmL', 'UpperArmR', 'LowerArmL', 'LowerArmR',
  'UpperLegL', 'UpperLegR', 'LowerLegL', 'LowerLegR', 'FootL', 'FootR',
]);

/**
 * Dress a soldier.
 *
 * Must be called with the skeleton already holding the pose the gear is
 * authored against — SoldierVisual forces Idle and applies the spine
 * correction first — because every offset below is measured from live bone
 * positions at this instant.
 *
 * @param {object} visual   needs `.bones` (name -> Bone) and `.inner`
 * @param {number} personaIdx
 * @returns {{meshes: THREE.Mesh[], byBone: Map<string, THREE.Mesh>}}
 */
export function attachSoldierGear(visual, personaIdx) {
  const B = visual?.bones;
  if (!B) return { meshes: [], byBone: new Map() };
  const look = SOLDIER_LOOKS[((personaIdx | 0) % SOLDIER_LOOKS.length + SOLDIER_LOOKS.length) % SOLDIER_LOOKS.length];
  const M = materials(look);

  let wardrobe = _pool.get(look.id);
  if (!wardrobe) {
    // Measure this rig once and build the whole persona against it. Every
    // SoldierVisual is a clone of the same source at the same calibration, so
    // the measurement is valid for all of them and the pool is shared.
    const P = {};
    const read = (name, key = name) => {
      const bone = B[name];
      if (!bone) return;
      bone.updateWorldMatrix(true, false);
      P[key] = bone.getWorldPosition(new THREE.Vector3());
    };
    for (const n of ['Hips', 'Abdomen', 'Torso', 'Neck', 'Head']) read(n);
    for (const s of ['L', 'R']) {
      read('Shoulder' + s); read('UpperArm' + s); read('LowerArm' + s);
      read('UpperLeg' + s); read('LowerLeg' + s); read('Foot' + s);
      read('Middle1' + s, 'Hand' + s);
    }
    const needed = ['Hips', 'Torso', 'Neck', 'Head', 'UpperArmL', 'LowerArmL', 'HandL',
      'UpperLegL', 'LowerLegL', 'FootL'];
    if (!needed.every((k) => P[k])) return { meshes: [], byBone: new Map() };
    wardrobe = buildWardrobe(look, P);
    _pool.set(look.id, wardrobe);
  }

  const meshes = [];
  const byBone = new Map();
  for (const [boneName, build] of wardrobe) {
    const bone = B[boneName];
    if (!bone) continue;
    const mats = build.mats.map((k) => M[k]);
    const mesh = new THREE.Mesh(build.geo, mats.length === 1 ? mats[0] : mats);
    mesh.castShadow = true;
    mesh.userData.soldierGear = true;
    bone.updateWorldMatrix(true, false);
    bone.getWorldScale(_scratchScale);
    bone.getWorldQuaternion(_scratchQuat);
    // Undo the bone's rest rotation FIRST, so the mesh is back in world axes —
    // which is the space every offset in buildWardrobe was measured in.
    mesh.quaternion.copy(_scratchQuat).invert();
    // Now cancel the bone's world scale PER AXIS. Because the rotation is
    // already undone, an axis-aligned inverse reproduces world metres exactly
    // and cannot shear: it is the identity, not a squash of a rotated frame.
    //
    // A uniform mean CANNOT do that here, and getting it wrong is not subtle.
    // LIMB_SHAPE narrows Hips, Abdomen and Torso across X and Z only, and those
    // compound down the chain, so by the time you reach the Head bone the world
    // scale is roughly (0.26, 0.53, 0.32) — twice as tall as it is wide.
    // Cancelling the mean of that left head gear 1.4x too tall and 0.7x too
    // narrow, and the torso collar standing above the crown of the head. The
    // cap band, the hair and the beard closed over the face until every marine
    // read as a black block from the brow to the collarbone.
    mesh.scale.set(
      1 / Math.max(1e-4, Math.abs(_scratchScale.x)),
      1 / Math.max(1e-4, Math.abs(_scratchScale.y)),
      1 / Math.max(1e-4, Math.abs(_scratchScale.z)),
    );
    bone.add(mesh);
    meshes.push(mesh);
    byBone.set(boneName, mesh);
  }
  return { meshes, byBone };
}

/**
 * Level of detail. 0 dresses him fully, 1 drops the limb gear (sleeves,
 * trousers, boots — the pieces that read as texture rather than silhouette),
 * 2 strips everything. Called from the avatar's own distance check.
 */
export function setSoldierGearLOD(handle, level) {
  if (!handle) return;
  for (const [bone, mesh] of handle.byBone) {
    mesh.visible = level === 0 ? true : level === 1 ? !LIMB_BONES.has(bone) : false;
  }
}

/**
 * Unparent an avatar's gear. Deliberately does NOT dispose geometry or
 * materials: both are shared with every other avatar of the same persona and
 * live for the process, so disposing here would undress the whole squad.
 */
export function detachSoldierGear(handle) {
  for (const m of handle?.meshes || []) m.parent?.remove(m);
}
