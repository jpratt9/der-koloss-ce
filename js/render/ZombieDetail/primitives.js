// Primitive builders — all in metres, all merged before they reach the scene.
import * as THREE from 'three';
import { mergeGeometries } from '../../../vendor/utils/BufferGeometryUtils.js';

/** A ragged hanging strip: a cloth tatter or a strand of flesh. */
export function stripGeo(w, len, taper, rnd) {
  const g = new THREE.PlaneGeometry(w, len, 1, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = 0.5 - p.getY(i) / len;              // 0 at the root, 1 at the tip
    p.setX(i, p.getX(i) * (1 - t * taper) + (rnd() - 0.5) * w * 0.25 * t);
    // Curl it so it does not read as a flat rectangle.
    p.setZ(i, p.getZ(i) + Math.sin(t * 3.1) * len * 0.10 * (rnd() - 0.5) * 2);
  }
  g.translate(0, -len / 2, 0);                    // hang from the origin
  g.computeVertexNormals();
  return g;
}

/**
 * An open tube with a torn-off hem, used for the tunic and the coat.
 *
 * `thetaLength` below a full turn leaves a vertical gap — that is the rip the
 * ribs show through, so the exposed bone reads as a wound in clothing rather
 * than as bones stuck onto bare skin.
 *
 * Built at unit radius: fitToBody() gives it the corpse's own outline, and the
 * slack and the flared hem carry over as proportions of that.
 */
export function garmentGeo(h, thetaStart, thetaLength, rnd, tear = 0.34) {
  const segs = Math.max(8, Math.round((thetaLength / (Math.PI * 2)) * 24));
  const g = new THREE.CylinderGeometry(1, 1, h, segs, 6, true, thetaStart, thetaLength);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < -h * 0.49) {
      // Bottom ring: tear it upward by a random amount so the hem is ragged
      // instead of a machine-cut circle.
      p.setY(i, y + h * tear * rnd());
      p.setX(i, x * (1 + rnd() * 0.10));
      p.setZ(i, z * (1 + rnd() * 0.10));
    } else {
      // Everywhere else: a little slack so the cloth is not a perfect cylinder.
      const slack = 1 + (rnd() - 0.5) * 0.07;
      p.setX(i, x * slack);
      p.setZ(i, z * slack);
    }
  }
  return g;
}

export function placed(geo, x, y, z, rx, ry, rz) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1),
  );
  geo.applyMatrix4(m);
  return geo;
}

/** Turn by `q`, then move to (x, y, z). */
export function oriented(geo, q, x, y, z) {
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)));
  return geo;
}

export function mergeOne(list) {
  if (!list.length) return null;
  const merged = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  return merged || null;
}
