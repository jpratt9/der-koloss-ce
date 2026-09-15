// The hellhound's body: the station table along the spine, the torso swept
// through it, and the ribs, embers and fur laid over its surface.
import * as THREE from 'three';
import { spike, ribbon, placed, pack } from './primitives.js';

// ---------------------------------------------------------------------------
// the body, as a table of elliptical stations along the spine
// ---------------------------------------------------------------------------
// [x, centreY, verticalHalf, lateralHalf]
//
// Read the third and fourth columns together: vertical half-height is always
// well over lateral half-width, which is what makes the animal slab-sided and
// deep-chested rather than tubular. The topline peaks at the withers (station
// 2) and falls away to the rump; the belly line plunges to the brisket at
// station 3 and then climbs 0.10 m into the tuck at station 6.
const BODY = [
  [0.560, 0.855, 0.098, 0.084],   // 0 base of the neck
  [0.430, 0.845, 0.148, 0.114],   // 1
  [0.300, 0.826, 0.190, 0.146],   // 2 withers / shoulder
  [0.160, 0.800, 0.212, 0.160],   // 3 deepest chest — brisket at 0.588
  [0.030, 0.796, 0.190, 0.147],   // 4 last true rib
  [-0.090, 0.802, 0.134, 0.107],  // 5 the tuck begins
  [-0.200, 0.798, 0.099, 0.092],  // 6 waist — belly at 0.699
  [-0.310, 0.762, 0.135, 0.126],  // 7 loin
  [-0.430, 0.706, 0.174, 0.164],  // 8 haunch
  [-0.560, 0.692, 0.148, 0.140],  // 9
  [-0.665, 0.706, 0.078, 0.073],  // 10 rump / tail root
];

/** Interpolate the station table at a continuous index. */
function bodyAt(u) {
  const t = Math.max(0, Math.min(BODY.length - 1, u));
  const i = Math.min(BODY.length - 2, Math.floor(t));
  const f = t - i;
  const a = BODY[i], b = BODY[i + 1];
  return {
    x: a[0] + (b[0] - a[0]) * f,
    y: a[1] + (b[1] - a[1]) * f,
    ry: a[2] + (b[2] - a[2]) * f,
    rz: a[3] + (b[3] - a[3]) * f,
  };
}

/**
 * A point on the body surface.
 * @param {number} u station index (see BODY)
 * @param {number} a angle: 0 = spine, PI = belly, PI/2 = the animal's left
 * @param {number} out how far proud of the hide, in metres
 */
function bodySurface(u, a, out = 0) {
  const s = bodyAt(u);
  // Squash the cross-section toward a rounded-off wedge: a real rib cage is
  // flatter on the flank and keeled underneath, not a clean ellipse.
  const ca = Math.cos(a), sa = Math.sin(a);
  const keel = 1 - 0.16 * Math.max(0, -ca);
  return new THREE.Vector3(
    s.x,
    s.y + ca * (s.ry + out) * keel,
    sa * (s.rz + out) * (1 + 0.12 * Math.max(0, ca)),
  );
}

/** Swept tube through the station table, capped at both ends. */
function bodyTube(sides = 12, u0 = 0, u1 = BODY.length - 1, steps = 22, jitter = null) {
  const pos = [], idx = [];
  const rings = steps + 1;
  for (let i = 0; i < rings; i++) {
    const u = u0 + (u1 - u0) * (i / steps);
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const p = bodySurface(u, a, jitter ? jitter(u, a) : 0);
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < sides; j++) {
      const j2 = (j + 1) % sides;
      const a = i * sides + j, b = i * sides + j2;
      const c = (i + 1) * sides + j, d = (i + 1) * sides + j2;
      idx.push(a, c, d, a, d, b);
    }
  }
  // Caps: a single fan to the axis point at each end.
  const capAt = (u, ring, flip) => {
    const s = bodyAt(u);
    const centre = pos.length / 3;
    pos.push(s.x, s.y, 0);
    for (let j = 0; j < sides; j++) {
      const j2 = (j + 1) % sides;
      if (flip) idx.push(centre, ring + j2, ring + j);
      else idx.push(centre, ring + j, ring + j2);
    }
  };
  capAt(u0, 0, true);
  capAt(u1, steps * sides, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// variant construction (once per process, shared by every hound)
// ---------------------------------------------------------------------------

/** The outward surface normal at a point on the body, near enough. */
function bodyNormal(u, a) {
  const p = bodySurface(u, a, 0), q = bodySurface(u, a, 0.01);
  return q.sub(p).normalize();
}

/** Ember fissures crawling over the hide, following the body's own surface. */
function emberFissures(bag, rnd, count) {
  for (let i = 0; i < count; i++) {
    const side = rnd() < 0.5 ? 1 : -1;
    // Keep them off the exact spine and exact belly: cracks run along the
    // flanks and around the shoulder/haunch masses where the hide is stretched.
    let a = side * (0.35 + rnd() * 1.9);
    let u = 0.6 + rnd() * 8.6;
    const steps = 2 + Math.floor(rnd() * 3);
    const du = (rnd() - 0.5) * 0.5 - 0.12;
    const da = (rnd() - 0.5) * 0.34;
    const pts = [], nrm = [];
    for (let s = 0; s <= steps; s++) {
      pts.push(bodySurface(u, a, 0.0025));
      nrm.push(bodyNormal(u, a));
      u = Math.max(0.15, Math.min(9.85, u + du));
      a += da + (rnd() - 0.5) * 0.14;
    }
    const g = ribbon(pts, 0.007 + rnd() * 0.008, null, nrm);
    if (g) bag.ember.push(g);
  }
}

/**
 * A raised mane of charred hackles.
 *
 * Each clump is a FLATTENED spike swept hard backwards. Round spikes standing
 * upright is what turned the first pass into a stegosaur; a wolf's raised
 * hackles are wide flat sheaves of hair lying along the neck.
 */
function hackles(bag, rnd, u0, u1, n, len0, len1) {
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const u = u0 + (u1 - u0) * t;
    const lean = 0.95 + t * 0.45 + rnd() * 0.25;
    for (const off of [-1, 0, 1]) {
      if (off !== 0 && rnd() < 0.3) continue;
      const a = off * (0.30 + rnd() * 0.16);
      const p = bodySurface(u, a, -0.012);
      const len = (len0 + (len1 - len0) * t) * (0.75 + rnd() * 0.5);
      const s = spike(len, 0.026 + rnd() * 0.010, 0.004, 4);
      s.scale(1, 1, 0.6);                  // a sheaf of hair, not a razor blade
      bag.hide.push(placed(s, p.x, p.y, p.z, a * 0.85, 0, lean));
    }
  }
}

/** Loose fur: short flat tufts breaking the silhouette along a run of the body. */
function fur(bag, rnd, u0, u1, aMin, aMax, n, len) {
  for (let i = 0; i < n; i++) {
    const u = u0 + (u1 - u0) * rnd();
    const a = (rnd() < 0.5 ? 1 : -1) * (aMin + rnd() * (aMax - aMin));
    const p = bodySurface(u, a, -0.014);
    const s = spike(len * (0.6 + rnd() * 0.8), 0.019 + rnd() * 0.010, 0.003, 4);
    s.scale(1, 1, 0.65);
    bag.hide.push(placed(s, p.x, p.y, p.z, a, 0, 1.5 + rnd() * 0.6));
  }
}

function buildTorso(rnd) {
  const bag = { hide: [], ember: [], bone: [] };
  // The animal itself.
  bag.hide.push(bodyTube(13, 0, BODY.length - 1, 24, (u, a) =>
    // Break the sweep so it does not read as a machined solid: a shallow
    // rib corrugation over the chest and a little noise everywhere else.
    (u > 1.4 && u < 4.6 ? Math.cos(u * 6.2) * 0.008 * Math.abs(Math.sin(a)) : 0)
    + Math.sin(u * 9.1 + a * 3.0) * 0.004));

  // ---- exposed spine: vertebral knobs along the topline --------------------
  // Small and irregular. Big regular ones read as a string of beads glued on.
  for (let i = 0; i <= 15; i++) {
    const u = 1.4 + (BODY.length - 2.2) * (i / 15);
    const p = bodySurface(u, 0, -0.014);
    const s = 0.011 + 0.009 * Math.sin((i / 15) * Math.PI) + rnd() * 0.003;
    bag.bone.push(placed(new THREE.BoxGeometry(0.026, s * 2.0, s * 1.5),
      p.x, p.y + s * 0.5, p.z, 0, 0, -0.12));
  }

  // ---- exposed ribs on one flank ------------------------------------------
  // The hide has burnt away over the rib cage on one side. Arcs are struck on
  // the body's own cross-section, so they hug the animal instead of hovering,
  // and a glowing gap is laid between each pair so they read as a hole rather
  // than as bones stuck onto intact skin.
  const ribSide = rnd() < 0.5 ? 1 : -1;
  const ribCount = 4 + Math.floor(rnd() * 2);
  const ribU0 = 1.7 + rnd() * 0.3;
  for (let r = 0; r < ribCount; r++) {
    const u = ribU0 + r * 0.58;
    const pts = [], nrm = [];
    for (let k = 0; k <= 8; k++) {
      const a = ribSide * (0.34 + (k / 8) * 2.05);
      pts.push(bodySurface(u, a, 0.012));
      nrm.push(bodyNormal(u, a));
    }
    const g = ribbon(pts, 0.013, null, nrm);
    if (g) bag.bone.push(g);
    if (r < ribCount - 1) {
      const gap = [], gn = [];
      for (let k = 0; k <= 6; k++) {
        const a = ribSide * (0.5 + (k / 6) * 1.7);
        gap.push(bodySurface(u + 0.29, a, 0.004));
        gn.push(bodyNormal(u + 0.29, a));
      }
      const e = ribbon(gap, 0.010, null, gn);
      if (e) bag.ember.push(e);
    }
  }

  emberFissures(bag, rnd, 30);
  // Mane: heavy over the neck and withers, thinning out by the mid-back.
  hackles(bag, rnd, 0.1, 4.4, 9, 0.15, 0.05);
  // Shoulder ruff and haunch feathering: the two places a wolf carries bulk.
  fur(bag, rnd, 0.3, 2.4, 0.7, 2.2, 13, 0.085);
  fur(bag, rnd, 7.2, 9.6, 0.6, 2.3, 11, 0.08);
  // A few tufts hanging off the belly line.
  fur(bag, rnd, 3.2, 6.2, 2.5, 3.05, 6, 0.06);
  return pack(bag);
}

export { buildTorso };
