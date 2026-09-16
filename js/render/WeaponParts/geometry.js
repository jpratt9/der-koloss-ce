// Cached geometry primitives and mesh sugar, shared by every firearm part.
//
// Every geometry produced here goes through `geo()`, a module-level cache keyed
// on the exact construction parameters. Thirty weapons share one bevelled 40mm
// receiver box, one 16-segment barrel profile, one trigger-guard extrusion and
// so on, which keeps both build cost and GPU memory flat no matter how often
// buildViewmodel() runs (the mystery box rebuilds a gun every spin).
//
// Cached geometries are tagged `userData.wpShared` so the Pack-a-Punch display
// teardown knows not to dispose them out from under every other weapon.
import * as THREE from 'three';

const _geo = new Map();
const key = (name, args) => name + '|' + args.map((v) => (typeof v === 'number' ? v.toFixed(5) : v)).join(',');

/** Cache + tag a geometry. */
export function geo(name, args, make) {
  const k = key(name, args);
  let g = _geo.get(k);
  if (!g) {
    g = make();
    g.userData.wpShared = true;
    _geo.set(k, g);
  }
  return g;
}

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

/** Rounded rectangle path used as the profile for chamfered extrusions. */
function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const hw = w / 2, hh = h / 2;
  r = Math.min(r, hw * 0.98, hh * 0.98);
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh); s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r); s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh); s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r); s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return s;
}

/**
 * Chamfered box. Real gun parts have broken edges; a hard 90° corner is the
 * single biggest "programmer art" tell at view-model distance because it never
 * catches a specular highlight.
 */
export function bevelBoxGeo(w, h, d, b = 0.004, corner = 0) {
  return geo('bbox', [w, h, d, b, corner], () => {
    const bb = Math.min(b, w * 0.4, h * 0.4, d * 0.4);
    const r = Math.max(bb * 1.2, corner);
    const shape = roundedRect(Math.max(1e-4, w - 2 * bb), Math.max(1e-4, h - 2 * bb), r);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(1e-4, d - 2 * bb), bevelEnabled: true,
      bevelThickness: bb, bevelSize: bb, bevelSegments: 1, curveSegments: 2,
    });
    g.translate(0, 0, -(d - 2 * bb) / 2);
    g.computeVertexNormals();
    return g;
  });
}

/**
 * Extruded plate from an arbitrary point list (receiver side profiles, stock
 * combs, trigger guards). Points are in the XY plane; thickness runs along Z.
 */
export function plateGeo(id, pts, thick, bevel = 0.0025, holes = null) {
  return geo('plate', [id, thick, bevel], () => {
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
    shape.closePath();
    if (holes) {
      for (const hp of holes) {
        const p = new THREE.Path();
        p.moveTo(hp[0][0], hp[0][1]);
        for (let i = 1; i < hp.length; i++) p.lineTo(hp[i][0], hp[i][1]);
        p.closePath();
        shape.holes.push(p);
      }
    }
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(1e-4, thick - 2 * bevel), bevelEnabled: bevel > 0,
      bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 3,
    });
    g.translate(0, 0, -(thick - 2 * bevel) / 2);
    g.computeVertexNormals();
    return g;
  });
}

export function cylGeo(r0, r1, len, seg = 16, open = false, thetaLen = Math.PI * 2, thetaStart = 0) {
  return geo('cyl', [r0, r1, len, seg, open ? 1 : 0, thetaLen, thetaStart], () =>
    new THREE.CylinderGeometry(r0, r1, len, seg, 1, open, thetaStart, thetaLen));
}

export function sphereGeo(r, w = 10, h = 8) {
  return geo('sph', [r, w, h], () => new THREE.SphereGeometry(r, w, h));
}

export function torusGeo(r, tube, rs = 6, ts = 18, arc = Math.PI * 2) {
  return geo('tor', [r, tube, rs, ts, arc], () => new THREE.TorusGeometry(r, tube, rs, ts, arc));
}

export function ringGeo(ri, ro, seg = 20) {
  return geo('ring', [ri, ro, seg], () => new THREE.RingGeometry(ri, ro, seg));
}

/**
 * Lathe a profile given as [radius, axialPosition] pairs, axis along +Z.
 *
 * The direction a profile is written in decides which way every face points:
 * three only winds a lathe outward when the outline, closed along the axis,
 * runs counter-clockwise in (radius, axial). Every weapon material is
 * single-sided, so a profile written the other way round was drawn
 * inside-out — its near wall culled, the eye looking straight through it at
 * whatever was inside. That is how the Panzerschreck's warhead showed through
 * its tube wall and the MP40's receiver rings hung round it like loose hoops,
 * and 21 lathes across 13 weapons were written that way. The winding is fixed
 * here once rather than trusted to the order every outline was typed in.
 */
export function latheGeo(id, pts, seg = 20) {
  return geo('lathe', [id, seg], () => {
    let area = 0;   // shoelace, with the outline closed along the axis
    const loop = [[0, pts[0][1]], ...pts, [0, pts[pts.length - 1][1]]];
    for (let i = 0; i < loop.length; i++) {
      const [r0, z0] = loop[i], [r1, z1] = loop[(i + 1) % loop.length];
      area += r0 * z1 - r1 * z0;
    }
    const v = (area < 0 ? [...pts].reverse() : pts).map(([r, z]) => new THREE.Vector2(Math.max(1e-5, r), z));
    const g = new THREE.LatheGeometry(v, seg);
    g.rotateX(Math.PI / 2);   // Y-axis lathe -> Z-forward part
    g.computeVertexNormals();
    return g;
  });
}

// ---------------------------------------------------------------------------
// mesh sugar
// ---------------------------------------------------------------------------
export function mesh(g, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

/** Chamfered box mesh. */
export function bx(w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, b = 0.0035) {
  return mesh(bevelBoxGeo(w, h, d, b), mat, x, y, z, rx, ry, rz);
}

/** Z-forward cylinder mesh (rotated so the default axis points down -Z/+Z). */
export function cyl(r0, r1, len, mat, x = 0, y = 0, z = 0, rx = Math.PI / 2, ry = 0, rz = 0, seg = 16) {
  return mesh(cylGeo(r0, r1, len, seg), mat, x, y, z, rx, ry, rz);
}
