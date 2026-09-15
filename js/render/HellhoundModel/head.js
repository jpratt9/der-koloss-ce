// The hellhound's neck, head and jaw, with the muzzle and jaw profiles their
// teeth are struck off.
import * as THREE from 'three';
import { spike, ribbon, placed, pack } from './primitives.js';

function buildNeck(rnd) {
  const bag = { hide: [], ember: [], bone: [] };
  // Neck runs from the withers up and forward to the skull base. Thick at the
  // root, and deeper than it is wide, like the rest of the animal.
  const L = 0.34;
  const pos = [], idx = [];
  const sides = 10, steps = 6;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = t * 0.29, cy = t * 0.155;
    const ry = 0.125 - t * 0.048, rz = 0.098 - t * 0.036;
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      pos.push(cx - Math.cos(a) * ry * 0.30, cy + Math.cos(a) * ry, Math.sin(a) * rz);
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < sides; j++) {
      const j2 = (j + 1) % sides;
      idx.push(i * sides + j, (i + 1) * sides + j, (i + 1) * sides + j2);
      idx.push(i * sides + j, (i + 1) * sides + j2, i * sides + j2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  bag.hide.push(g);

  // Ruff: the heavy collar of fur a wolf carries at the throat and jaw line.
  // Flattened sheaves swept back, densest low on the throat.
  for (let i = 0; i < 18; i++) {
    const t = 0.12 + (i % 6) / 6 * 0.6;
    const a = (i / 18) * Math.PI * 2 + (rnd() - 0.5) * 0.35;
    const ry = 0.125 - t * 0.048, rz = 0.098 - t * 0.036;
    const x = t * 0.29 - Math.cos(a) * ry * 0.30, y = t * 0.155 + Math.cos(a) * ry, z = Math.sin(a) * rz;
    const s = spike(0.065 + rnd() * 0.05, 0.026, 0.004, 4);
    s.scale(1, 1, 0.6);
    bag.hide.push(placed(s, x, y, z, a * 0.8, 0, 1.75 + rnd() * 0.4));
  }
  // Two ember lines running up the throat toward the jaw.
  for (const sgn of [1, -1]) {
    const pts = [], nrm = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      const a = Math.PI + sgn * (0.4 + t * 0.35);
      const ry = 0.125 - t * 0.048, rz = 0.098 - t * 0.036;
      const at = (o) => new THREE.Vector3(
        t * 0.29 - Math.cos(a) * (ry + o) * 0.30,
        t * 0.155 + Math.cos(a) * (ry + o),
        Math.sin(a) * (rz + o),
      );
      pts.push(at(0.002));
      nrm.push(at(0.012).sub(at(0.002)).normalize());
    }
    const r = ribbon(pts, 0.007, null, nrm);
    if (r) bag.ember.push(r);
  }
  return pack(bag);
}

// Muzzle profile, shared by the skull and the teeth that hang off it so they
// can never drift apart. `t` runs 0 at the stop to 1 at the nose.
const MUZ_X0 = 0.045, MUZ_LEN = 0.205;
function muzzleAt(t) {
  return {
    x: MUZ_X0 + t * MUZ_LEN,
    y: 0.004 - t * 0.040,
    ry: 0.070 - t * 0.026,
    rz: 0.066 - t * 0.030,
  };
}

function buildHead(rnd) {
  const bag = { hide: [], bone: [], eye: [], ember: [], gullet: [] };
  // ---- braincase -----------------------------------------------------------
  // A heavy wedge: broad and tall at the back, narrowing hard into the muzzle,
  // with the sides drawn in above the cheeks so the skull has real planes.
  const skull = new THREE.BoxGeometry(0.19, 0.150, 0.172, 3, 3, 3);
  {
    const p = skull.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const t = (x + 0.095) / 0.19;                   // 0 at the back, 1 at the front
      const narrow = 1 - t * 0.36;
      p.setY(i, y * (1 - t * 0.26) - t * 0.014);
      // Taper the top of the skull inward — the cranium is a dome on a wedge.
      p.setZ(i, z * narrow * (y > 0.03 ? 0.74 : 1.0));
      p.setX(i, x - Math.abs(y) * 0.09 - Math.abs(z) * 0.10);
    }
    skull.computeVertexNormals();
  }
  bag.hide.push(placed(skull, -0.048, 0.006, 0));

  // Sagittal crest and occiput: the bony ridge a big dog's jaw muscles anchor
  // to, and the knob at the back of the head.
  bag.bone.push(placed(new THREE.BoxGeometry(0.10, 0.030, 0.022), -0.085, 0.078, 0, 0, 0, -0.08));
  bag.bone.push(placed(new THREE.SphereGeometry(0.030, 6, 5), -0.140, 0.045, 0, 0, 0, 0, 0.7, 1.1, 0.9));
  // Cheek / masseter masses, low and wide.
  for (const sgn of [1, -1]) {
    bag.hide.push(placed(new THREE.SphereGeometry(0.058, 6, 5),
      -0.052, -0.030, sgn * 0.058, 0, 0, 0.15, 1.2, 0.9, 0.62));
  }
  // ---- brow ridge ----------------------------------------------------------
  // The single most important feature on the head: it shades the eyes and gives
  // the skull the heavy, scowling read a hellhound needs.
  for (const sgn of [1, -1]) {
    bag.hide.push(placed(new THREE.SphereGeometry(0.040, 6, 5),
      0.014, 0.046, sgn * 0.050, 0, 0, -0.28, 1.5, 0.55, 0.9));
  }
  bag.hide.push(placed(new THREE.BoxGeometry(0.055, 0.024, 0.082), 0.008, 0.050, 0, 0, 0, -0.26));

  // ---- muzzle --------------------------------------------------------------
  {
    const pos = [], idx = [];
    const sides = 8, steps = 4;
    for (let i = 0; i <= steps; i++) {
      const m = muzzleAt(i / steps);
      for (let j = 0; j < sides; j++) {
        const a = (j / sides) * Math.PI * 2;
        const c = Math.cos(a);
        // Flatten the bridge and square off the sides: a dog's muzzle is a
        // box with rounded corners, not a cone.
        pos.push(m.x, m.y + c * m.ry * (c > 0 ? 0.72 : 1.0), Math.sin(a) * m.rz * (1 + 0.18 * Math.abs(Math.sin(a))));
      }
    }
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < sides; j++) {
        const j2 = (j + 1) % sides;
        idx.push(i * sides + j, (i + 1) * sides + j, (i + 1) * sides + j2);
        idx.push(i * sides + j, (i + 1) * sides + j2, i * sides + j2);
      }
    }
    const nose = muzzleAt(1);
    const c = pos.length / 3;
    pos.push(nose.x + 0.012, nose.y, 0);
    for (let j = 0; j < sides; j++) idx.push(c, steps * sides + j, steps * sides + (j + 1) % sides);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    bag.hide.push(g);
    // Nose leather, wide and blunt.
    bag.hide.push(placed(new THREE.SphereGeometry(0.030, 6, 5),
      nose.x + 0.004, nose.y + 0.006, 0, 0, 0, 0, 0.75, 0.95, 1.15));
  }

  // ---- eyes ----------------------------------------------------------------
  // Small, deep-set and hot. Size is what keeps them from reading as headlights:
  // two sparks under the brow, not two lamps. The orbit around them is scorched
  // rather than glowing, so the eye itself is the only bright thing.
  for (const sgn of [1, -1]) {
    bag.eye.push(placed(new THREE.SphereGeometry(0.0155, 6, 5),
      0.026, 0.018, sgn * 0.050, 0, 0, 0, 1.1, 0.78, 0.95));
    bag.ember.push(placed(new THREE.TorusGeometry(0.021, 0.0042, 4, 7),
      0.022, 0.018, sgn * 0.050, 0, Math.PI / 2, 0));
  }

  // ---- ears ----------------------------------------------------------------
  // Broad triangles pinned back along the skull, not horns: wide at the base,
  // flattened, and swept until they nearly lie on the neck. One is often torn.
  for (const sgn of [1, -1]) {
    const torn = rnd() < 0.45;
    const len = torn ? 0.075 : 0.115;
    const e = spike(len, 0.050, 0.008, 4);
    e.scale(1.1, 1, 0.5);
    bag.hide.push(placed(e, -0.082, 0.066, sgn * 0.050, sgn * 0.42, 0, -0.52 - rnd() * 0.14));
  }

  // ---- upper teeth ---------------------------------------------------------
  // Struck off the muzzle profile so they always sit on the gum line.
  for (const sgn of [1, -1]) {
    for (const [t, fl] of [[0.16, 0.038], [0.42, 0.020], [0.63, 0.016], [0.83, 0.013]]) {
      const m = muzzleAt(t);
      bag.bone.push(placed(spike(fl, 0.0095, 0.0, 4),
        m.x, m.y - m.ry * 0.88, sgn * m.rz * 0.72, 0, 0, Math.PI + sgn * 0.05));
    }
  }
  // ---- the furnace at the back of the throat -------------------------------
  // Attached to the SKULL, not the jaw, so opening the mouth reveals it. Kept
  // small and tucked behind the tooth line: a glow deep in the gullet, never a
  // lamp bolted to the side of the face.
  bag.gullet.push(placed(new THREE.SphereGeometry(0.024, 6, 5),
    0.030, -0.044, 0, 0, 0, 0.06, 2.0, 0.62, 0.85));

  // ---- charred detail ------------------------------------------------------
  for (let i = 0; i < 4; i++) {
    const sgn = i % 2 ? 1 : -1;
    const pts = [];
    let x = -0.10 + rnd() * 0.06, y = 0.02 + rnd() * 0.045, z = sgn * (0.045 + rnd() * 0.025);
    for (let k = 0; k < 4; k++) {
      pts.push(new THREE.Vector3(x, y, z));
      x += 0.030 + rnd() * 0.025; y -= 0.010 + rnd() * 0.016; z += sgn * (rnd() - 0.4) * 0.012;
    }
    const g = ribbon(pts, 0.0045 + rnd() * 0.003);
    if (g) bag.ember.push(g);
  }
  return pack(bag);
}

// The lower jaw, in the jaw group's own frame (hinged just behind the cheek).
const JAW_X0 = 0.032, JAW_LEN = 0.215;
function jawAt(t) {
  return {
    x: JAW_X0 + t * JAW_LEN,
    y: -0.008 - t * 0.026,
    ry: 0.034 - t * 0.015,
    rz: 0.054 - t * 0.028,
  };
}

function buildJaw(rnd) {
  const bag = { hide: [], bone: [] };
  // Lower jaw: a tapering trough hinged at the back of the skull, closing so
  // its tooth line meets the muzzle's.
  {
    const pos = [], idx = [];
    const sides = 6, steps = 4;
    for (let i = 0; i <= steps; i++) {
      const m = jawAt(i / steps);
      for (let j = 0; j < sides; j++) {
        const a = (j / sides) * Math.PI * 2;
        pos.push(m.x, m.y + Math.cos(a) * m.ry, Math.sin(a) * m.rz);
      }
    }
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < sides; j++) {
        const j2 = (j + 1) % sides;
        idx.push(i * sides + j, (i + 1) * sides + j, (i + 1) * sides + j2);
        idx.push(i * sides + j, (i + 1) * sides + j2, i * sides + j2);
      }
    }
    const tip = jawAt(1);
    const c0 = pos.length / 3;
    pos.push(tip.x + 0.010, tip.y, 0);
    for (let j = 0; j < sides; j++) idx.push(c0, steps * sides + j, steps * sides + (j + 1) % sides);
    const root = jawAt(0);
    const c1 = pos.length / 3;
    pos.push(root.x, root.y, 0);
    for (let j = 0; j < sides; j++) idx.push(c1, (j + 1) % sides, j);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    bag.hide.push(g);
  }
  // Ramus: the vertical plate of bone the jaw muscles pull on.
  bag.hide.push(placed(new THREE.BoxGeometry(0.052, 0.070, 0.036), 0.014, 0.014, 0, 0, 0, 0.35));
  // Lower teeth, pointing up into the gap.
  for (const sgn of [1, -1]) {
    for (const [t, fl] of [[0.14, 0.032], [0.40, 0.018], [0.62, 0.015], [0.84, 0.012]]) {
      const m = jawAt(t);
      bag.bone.push(placed(spike(fl, 0.0085, 0.0, 4),
        m.x, m.y + m.ry * 0.85, sgn * m.rz * 0.72, 0, 0, sgn * 0.04));
    }
  }
  // Beard tufts under the chin.
  for (let i = 0; i < 5; i++) {
    const t = rnd();
    const m = jawAt(t);
    const s = spike(0.026 + rnd() * 0.016, 0.014, 0.002, 4);
    s.scale(1, 1, 0.7);
    bag.hide.push(placed(s, m.x, m.y - m.ry * 0.85, (rnd() - 0.5) * m.rz, 0, 0, 2.6 + rnd() * 0.5));
  }
  return pack(bag);
}

export { buildNeck, buildHead, buildJaw };
