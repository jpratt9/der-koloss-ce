// SoldierVisual's held weapon: the mount on the right forearm, the display gun
// flattened to one mesh per material and cached per id and PaP, and its muzzle.
// Methods of SoldierVisual: js/player/soldier.js copies them onto SoldierVisual.prototype.
import * as THREE from 'three';
import { buildDisplayWeapon } from '../weapons.js';
import { mergeGeometries } from '../../vendor/utils/BufferGeometryUtils.js';

const _wm = new THREE.Matrix4();

/**
 * Collapse a built weapon into one mesh per material.
 *
 * The viewmodels are assembled from sixty-odd individually placed parts, which
 * is exactly right in the player's own hands — the rig animates the bolt, the
 * magazine, the charging handle. On a teammate across the room none of that
 * moves and none of it is legible, so it is sixty-odd draw calls for nothing:
 * three armed teammates cost more than the entire rest of the frame. Flattened
 * once at build time and cached, a held weapon costs a handful of calls.
 *
 * The muzzle anchor is re-created afterwards, because remote fire effects are
 * placed on it and it must survive the flatten.
 */
function flattenWeapon(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const muzzle = group.userData.muzzle;
  let muzzleLocal = null;
  if (muzzle) {
    muzzle.updateWorldMatrix(true, false);
    muzzleLocal = new THREE.Vector3().setFromMatrixPosition(muzzle.matrixWorld).applyMatrix4(inv);
  }
  const byMaterial = new Map();
  const keep = [];
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (Array.isArray(o.material)) { keep.push(o); return; }   // rare; leave alone
    const geo = o.geometry.clone();
    geo.applyMatrix4(_wm.multiplyMatrices(inv, o.matrixWorld));
    let list = byMaterial.get(o.material);
    if (!list) { list = []; byMaterial.set(o.material, list); }
    list.push(geo);
  });
  const out = new THREE.Group();
  out.userData = { ...group.userData };
  for (const [material, list] of byMaterial) {
    // mergeGeometries refuses a set whose attributes differ, so reduce every
    // member to the attributes they all share before merging.
    let common = null;
    for (const g of list) {
      const names = new Set(Object.keys(g.attributes));
      common = common ? new Set([...common].filter((n) => names.has(n))) : names;
    }
    for (const g of list) {
      for (const name of Object.keys(g.attributes)) if (!common.has(name)) g.deleteAttribute(name);
      if (g.index && !list.every((x) => x.index)) g.setIndex(null);
    }
    const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (list.length > 1) for (const g of list) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    out.add(mesh);
  }
  for (const o of keep) out.add(o);
  if (muzzleLocal) {
    const anchor = new THREE.Object3D();
    anchor.position.copy(muzzleLocal);
    out.add(anchor);
    out.userData.muzzle = anchor;
  }
  return out;
}

export class SoldierVisualWeapon {
  _buildWeaponMount() {
    const fore = this.bones?.LowerArmR;
    const hand = this.bones?.Middle1R;
    if (!fore || !hand) return;
    const anchor = new THREE.Object3D();
    anchor.position.copy(hand.position);       // the hand joint, in forearm space
    fore.updateWorldMatrix(true, false);
    // The viewmodels are authored with the bore down -Z; the avatar faces +Z.
    const want = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    anchor.quaternion.copy(fore.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(want);
    fore.add(anchor);
    // A separate node carries aim pitch, so the weapon can lead the spine
    // without the spine correction having to fight it.
    const pitchNode = new THREE.Object3D();
    anchor.add(pitchNode);
    this.weaponAnchor = anchor;
    this.weaponPitch = pitchNode;
    this.weaponGroup = null;
    this.weaponId = null;
    this.weaponPap = null;
    this.muzzle = null;
  }

  /**
   * Show the weapon the player is actually carrying.
   *
   * Uses buildDisplayWeapon, which is the hands-free build — a viewmodel would
   * drag first-person gloves into the world and put a second pair of hands on
   * every teammate. Cached per id+PaP so swapping back and forth is free.
   */
  setWeapon(id, pap = false) {
    if (!this.weaponPitch) return;
    if (this.weaponId === id && this.weaponPap === !!pap) return;
    if (this.weaponGroup) this.weaponPitch.remove(this.weaponGroup);
    this.weaponId = id;
    this.weaponPap = !!pap;
    this.muzzle = null;
    this.weaponGroup = null;
    if (!id) return;
    this._weaponCache = this._weaponCache || new Map();
    const key = id + (pap ? '+' : '');
    let g = this._weaponCache.get(key);
    if (!g) {
      try { g = buildDisplayWeapon(id, !!pap); } catch (e) { g = null; }
      if (!g) return;
      // buildDisplayWeapon presents the gun broadside on a rack. Undo that:
      // held weapons want their own authored metres and their own axes.
      const view = g.userData.viewNode;
      if (view) { view.position.set(0, 0, 0); view.rotation.set(0, 0, 0); view.scale.setScalar(1); }
      g = flattenWeapon(g);
      // Sit the grip in the fist. Authored viewmodels put the trigger group
      // near the origin, so the offset is small and the same for every class;
      // the long guns only need dropping a little to clear the forearm.
      // The anchor's +Z runs backwards in world (the weapon's bore is -Z and
      // the avatar faces +Z), so a positive `back` pulls the gun in toward the
      // body. Long guns need more of it than a pistol to keep the receiver in
      // the fist rather than out past the fingertips.
      const cls = g.userData.cls || 'rifle';
      const drop = cls === 'pistol' ? -0.005 : -0.02;
      const back = cls === 'pistol' ? 0.0 : 0.15;
      g.position.set(0, drop, back);
      this._weaponCache.set(key, g);
    }
    if (g.parent) g.parent.remove(g);
    this.weaponPitch.add(g);
    this.weaponGroup = g;
    this.muzzle = g.userData?.muzzle || null;
  }

  /** World position of the equipped weapon's muzzle, for remote fire effects. */
  muzzleWorld(out = new THREE.Vector3()) {
    if (this.muzzle) {
      this.muzzle.updateWorldMatrix(true, false);
      return out.setFromMatrixPosition(this.muzzle.matrixWorld);
    }
    if (this.weaponAnchor) {
      this.weaponAnchor.updateWorldMatrix(true, false);
      return out.setFromMatrixPosition(this.weaponAnchor.matrixWorld);
    }
    return out.set(0, 0, 0);
  }
}
