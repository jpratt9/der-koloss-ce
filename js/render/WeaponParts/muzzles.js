// Barrels and muzzle devices, each built around a genuinely hollow bore.
import * as THREE from 'three';
import { WM } from '../WeaponMaterials.js';
import { geo, mesh, cylGeo, ringGeo, bevelBoxGeo, torusGeo, latheGeo } from './geometry.js';

/**
 * A barrel with a genuinely hollow muzzle: open-ended tube, a machined crown
 * annulus at the front face and a dark bore sunk into it. The dark bore is the
 * single highest-value detail on a view-model — it is the difference between
 * "a gun" and "a grey cylinder".
 *
 * The returned group is centred on the barrel length; +Z is toward the shooter,
 * so the muzzle sits at local z = -len/2.
 */
export function barrel(mat, {
  r = 0.014, rMuzzle = null, bore = null, len = 0.4, seg = 18,
  boreDepth = 0.055, breechCap = true,
} = {}) {
  const g = new THREE.Group();
  const r1 = rMuzzle ?? r;
  const rb = bore ?? Math.max(0.0035, r1 * 0.5);
  g.add(mesh(cylGeo(r1, r, len, seg, true), mat, 0, 0, 0, Math.PI / 2));
  // machined crown ring at the muzzle face
  const crown = mesh(ringGeo(rb, r1, seg), mat, 0, 0, -len / 2);
  crown.rotation.y = Math.PI;
  g.add(crown);
  // rifled bore: dark tube seen from the front, plus a blind end
  const boreTube = mesh(cylGeo(rb, rb * 0.86, Math.min(boreDepth, len * 0.9), Math.max(10, seg - 4), true),
    WM.bore, 0, 0, -len / 2 + Math.min(boreDepth, len * 0.9) / 2, Math.PI / 2);
  g.add(boreTube);
  g.add(mesh(cylGeo(rb * 0.86, rb * 0.86, 0.002, 10), WM.bore, 0, 0, -len / 2 + Math.min(boreDepth, len * 0.9), Math.PI / 2));
  if (breechCap) g.add(mesh(cylGeo(r, r, 0.002, seg), mat, 0, 0, len / 2 - 0.001, Math.PI / 2));
  return g;
}

/**
 * Bake a list of {geometry, matrix} pairs into one BufferGeometry.
 *
 * three's BufferGeometryUtils lives in `three/addons`, which this project's
 * import map does not expose, so this is a deliberately minimal stand-in: it
 * only handles position/normal/uv, which is all any geometry built here has.
 */
function bake(parts) {
  let vCount = 0, iCount = 0;
  for (const { geometry: G } of parts) {
    vCount += G.attributes.position.count;
    iCount += G.index ? G.index.count : G.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nrm = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  let vo = 0, io = 0;
  for (const { geometry: G, matrix } of parts) {
    nm.getNormalMatrix(matrix);
    const p = G.attributes.position, n = G.attributes.normal, t = G.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix).toArray(pos, (vo + i) * 3);
      if (n) v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize().toArray(nrm, (vo + i) * 3);
      if (t) { uv[(vo + i) * 2] = t.getX(i); uv[(vo + i) * 2 + 1] = t.getY(i); }
    }
    if (G.index) for (let i = 0; i < G.index.count; i++) idx[io + i] = G.index.getX(i) + vo;
    else for (let i = 0; i < p.count; i++) idx[io + i] = i + vo;
    io += G.index ? G.index.count : p.count;
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/**
 * Perforated barrel shroud with REAL holes: solid bands are full cylinders and
 * each hole row is built from arc segments with genuine gaps between them.
 *
 * A seven-row MG42 shroud is forty-odd primitives, so the whole thing is baked
 * down to one cached geometry — it is static decoration and every weapon that
 * asks for the same dimensions reuses it.
 */
export function perfShroud(mat, {
  r = 0.03, len = 0.4, rows = 4, holes = 8, holeW = 0.42, band = 0.4, seg = 4,
} = {}) {
  const g = geo('shroud', [r, len, rows, holes, holeW, band, seg], () => {
    const parts = [];
    const push = (G, z, arcStart) => {
      const m = new THREE.Matrix4()
        .makeRotationX(Math.PI / 2)
        .premultiply(new THREE.Matrix4().makeTranslation(0, 0, z));
      void arcStart;
      parts.push({ geometry: G, matrix: m });
    };
    const cell = len / rows;
    const bandLen = cell * band, slotLen = cell - bandLen;
    const step = (Math.PI * 2) / holes;
    const arc = step * (1 - holeW);
    for (let i = 0; i < rows; i++) {
      const z0 = -len / 2 + i * cell;
      push(cylGeo(r, r, bandLen, 20, true), z0 + bandLen / 2);
      for (let h = 0; h < holes; h++) {
        push(cylGeo(r, r, slotLen, seg, true, arc, h * step), z0 + bandLen + slotLen / 2);
      }
    }
    push(cylGeo(r, r, bandLen, 20, true), len / 2 - bandLen / 2);
    return bake(parts);
  });
  const out = new THREE.Group();
  out.add(new THREE.Mesh(g, mat));
  return out;
}

/** Prong-type flash hider. */
export function flashHider(mat, { r = 0.016, len = 0.055, prongs = 3, bore = 0.007 } = {}) {
  const g = new THREE.Group();
  g.add(mesh(latheGeo('fh' + r.toFixed(4) + len.toFixed(4), [
    [bore, -len * 0.5], [r * 0.95, -len * 0.5], [r * 1.05, -len * 0.28],
    [r * 1.05, len * 0.1], [r * 0.86, len * 0.3], [r * 0.86, len * 0.5], [bore, len * 0.5],
  ], 18), mat));
  for (let i = 0; i < prongs; i++) {
    const a = (i / prongs) * Math.PI * 2 + Math.PI / 2;
    g.add(mesh(bevelBoxGeo(r * 0.5, r * 0.42, len * 0.5, 0.0012), mat,
      Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, -len * 0.68, 0, 0, -a));
  }
  g.add(mesh(cylGeo(bore, bore, len * 1.1, 12, true), WM.bore, 0, 0, 0, Math.PI / 2));
  g.add(mesh(cylGeo(bore, bore, 0.002, 12), WM.bore, 0, 0, len * 0.3, Math.PI / 2));
  return g;
}

/** Slotted muzzle brake / compensator. */
export function compensator(mat, { r = 0.018, len = 0.06, ports = 3, bore = 0.008 } = {}) {
  const g = new THREE.Group();
  g.add(mesh(cylGeo(r, r * 1.06, len, 18, true), mat, 0, 0, 0, Math.PI / 2));
  g.add(mesh(ringGeo(bore, r, 18), mat, 0, 0, -len / 2, 0, Math.PI, 0));
  g.add(mesh(cylGeo(bore, bore * 0.9, len * 0.9, 12, true), WM.bore, 0, 0, -len / 2 + len * 0.45, Math.PI / 2));
  g.add(mesh(cylGeo(bore * 0.9, bore * 0.9, 0.002, 12), WM.bore, 0, 0, -len / 2 + len * 0.9, Math.PI / 2));
  for (let i = 0; i < ports; i++) {
    const z = -len / 2 + len * (0.22 + i * 0.26);
    for (const sx of [1, -1]) {
      g.add(mesh(bevelBoxGeo(r * 0.5, r * 0.34, len * 0.13, 0.0008), WM.cavity, sx * r * 0.86, r * 0.42, z));
    }
    g.add(mesh(bevelBoxGeo(r * 0.9, r * 0.3, len * 0.13, 0.0008), WM.cavity, 0, r * 0.95, z));
  }
  g.add(mesh(cylGeo(r * 1.1, r * 1.1, 0.006, 18), mat, 0, 0, len / 2 - 0.003, Math.PI / 2));
  return g;
}

/** Cone-type flash cone (Thompson / PPSh style) or a plain crowned step. */
export function muzzleCone(mat, { r = 0.016, r2 = 0.026, len = 0.05, bore = 0.008 } = {}) {
  const g = new THREE.Group();
  g.add(mesh(latheGeo('mc' + r + '_' + r2 + '_' + len, [
    [bore, -len / 2], [r2, -len / 2], [r2 * 0.94, -len * 0.34], [r, len * 0.2], [r, len / 2], [bore, len / 2],
  ], 18), mat));
  g.add(mesh(cylGeo(bore, bore * 0.85, len, 12, true), WM.bore, 0, 0, 0, Math.PI / 2));
  g.add(mesh(cylGeo(bore * 0.85, bore * 0.85, 0.002, 12), WM.bore, 0, 0, len * 0.45, Math.PI / 2));
  return g;
}

/** Cylindrical suppressor / jacket with end caps and a hollow exit. */
export function suppressor(mat, { r = 0.024, len = 0.16, bore = 0.008, rings = 5 } = {}) {
  const g = new THREE.Group();
  g.add(mesh(latheGeo('sup' + r + '_' + len, [
    [bore, -len / 2], [r * 0.9, -len / 2], [r, -len / 2 + 0.008],
    [r, len / 2 - 0.008], [r * 0.9, len / 2], [bore, len / 2],
  ], 20), mat));
  for (let i = 0; i < rings; i++) {
    g.add(mesh(torusGeo(r * 1.02, r * 0.06, 5, 18), mat,
      0, 0, -len / 2 + len * ((i + 0.7) / (rings + 0.4))));
  }
  g.add(mesh(cylGeo(bore, bore, len, 12, true), WM.bore, 0, 0, 0, Math.PI / 2));
  g.add(mesh(cylGeo(bore, bore, 0.002, 12), WM.bore, 0, 0, len * 0.4, Math.PI / 2));
  return g;
}
