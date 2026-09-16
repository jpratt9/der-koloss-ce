// Bone-attached geometry detail for zombies.
//
// The shipped corpse is a clean low-poly humanoid. Shading alone got it a long
// way, but a remastered-WaW corpse needs actual silhouette damage: a shredded
// greatcoat, exposed ribs where the flesh is gone, hanging strips, torn
// sleeves, a wrecked jaw.
//
// CRITICAL CONSTRAINT: this parents plain meshes to EXISTING bones. It adds no
// clips, no additive layers, no head-look, no retargeting, and never writes a
// bone transform. Attachments inherit their bone's motion for free, so they
// cannot desync the skeleton — which is what produced the rolling heads when
// this was previously attempted through the animation system.
//
// Memory shape matters here. Zombies are spawned and thrown away every round
// and the spawn path never disposes geometry, so anything generated per corpse
// would leak GPU memory for the whole session. Instead a small fixed pool of
// damage variants is built once and every corpse gets cheap Meshes POINTING AT
// the shared geometry — nothing per-instance to free but the meshes themselves.
import * as THREE from 'three';
import { VARIANTS, REFERENCE_SPAN } from './ZombieDetail/constants.js';
import { materials } from './ZombieDetail/materials.js';
import { fittedFor } from './ZombieDetail/variant.js';

const _scratchScale = new THREE.Vector3();
const _scratchQuat = new THREE.Quaternion();
const _scratchCentre = new THREE.Vector3();

// ---------------------------------------------------------------------------
// attachment
// ---------------------------------------------------------------------------

/**
 * Attach damage detail to a zombie visual.
 *
 * Call it before the rig's first animated frame — as createZombieVisual does —
 * because the first attach per model measures the skin in its rest pose.
 *
 * @param {object} visual the ZombieVisual (needs `.bones`, `.inner`, `.src`)
 * @param {number} [variantIndex] which prebuilt damage build to use
 * @returns {THREE.Mesh[]} the attachments, for {@link detachZombieDetail}
 */
export function attachZombieDetail(visual, variantIndex = Math.floor(Math.random() * VARIANTS)) {
  const B = visual?.bones;
  if (!B || !visual.inner) return [];
  const fitted = fittedFor(visual);
  if (!fitted) return [];
  const M = materials();
  const v = fitted.variants[((variantIndex % VARIANTS) + VARIANTS) % VARIANTS];
  const out = [];

  // Measure this rig so every attachment is sized as a proportion of the body
  // rather than in absolute metres. See REFERENCE_SPAN.
  let fit = 1;
  B.Head.getWorldPosition(_scratchCentre);
  const span = _scratchCentre.distanceTo(B.Hips.getWorldPosition(_scratchScale));
  if (span > 1e-3) fit = span / REFERENCE_SPAN;

  /**
   * Parent to a bone, cancelling that bone's rest transform so the geometry
   * above can be authored in plain world-aligned metres.
   *
   * Both halves matter:
   *
   * - SCALE. The rig is scaled to hit a target height, so raw bone space is
   *   not metres. Divided out here, uniformly — a component-wise inverse does
   *   not commute with the rotation below and shears the mesh.
   *
   * - ROTATION. Bone axes are NOT world axes: the spine bones lean, so a
   *   local -Y offset travels down AND backwards. Without this the tunic and
   *   the coat hung roughly 0.2 m behind the body, floating clear of the back.
   *
   * Cancelling the rest rotation is not the same as pinning the mesh in world
   * space — the mesh still inherits every subsequent bone transform, so it
   * animates with the pose exactly as intended. It just starts from square.
   */
  const mount = (slot, geo, material) => {
    const bone = B[slot.bone];
    if (!bone || !geo) return;
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    bone.updateWorldMatrix(true, false);
    bone.getWorldScale(_scratchScale);
    bone.getWorldQuaternion(_scratchQuat);
    const s = (_scratchScale.x + _scratchScale.y + _scratchScale.z) / 3;
    mesh.quaternion.copy(_scratchQuat).invert();
    mesh.scale.setScalar(fit / Math.max(1e-4, s));
    mesh.position.copy(slot.at);
    bone.add(mesh);
    out.push(mesh);
  };

  mount(fitted.slots.hips, v.hips, M.cloth);
  mount(fitted.slots.shoulderL, v.shoulderL, M.cloth);
  mount(fitted.slots.shoulderR, v.shoulderR, M.cloth);
  mount(fitted.slots.head, v.head, M.bone);
  if (v.torso) {
    const mats = v.torso.mats.map((k) => M[k]);
    mount(fitted.slots.torso, v.torso.geo, mats.length === 1 ? mats[0] : mats);
  }
  return out;
}

/**
 * Unparent a corpse's detail meshes.
 *
 * Deliberately does NOT dispose geometry: it is shared by every zombie using
 * the same variant and lives for the process. Disposing here would blank the
 * detail on every other corpse in the horde.
 */
export function detachZombieDetail(list) {
  for (const m of list || []) m.parent?.remove(m);
}

/** Toggle detail for LOD, so distant corpses skip the extra draw calls. */
export function setZombieDetailVisible(list, visible) {
  for (const m of list || []) m.visible = visible;
}
