// The hellhound's tail and legs: the three tail links, and the hip, knee and
// paw that all four legs share.
import * as THREE from 'three';
import { spike, ribbon, placed, pack } from './primitives.js';

/** A tapered limb segment along -Y, origin at the joint. */
function limb(len, rTop, rBot, depthTop, depthBot, sides = 6) {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, sides, 1);
  g.scale(1, 1, 1);
  g.translate(0, -len / 2, 0);
  // Fore-aft depth: a thigh is a blade, not a dowel.
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (-p.getY(i)) / len;         // 0 at the joint, 1 at the far end
    const d = depthTop + (depthBot - depthTop) * Math.min(1, Math.max(0, t));
    p.setX(i, p.getX(i) * d);
  }
  g.computeVertexNormals();
  return g;
}

/** One tail segment. `i` selects taper; the last one carries the ember tip. */
function buildTailSeg(rnd, i, n, len) {
  const bag = { hide: [], ember: [] };
  const r0 = 0.048 - i * 0.012, r1 = 0.048 - (i + 1) * 0.012;
  const g = new THREE.CylinderGeometry(Math.max(0.009, r1), r0, len, 6, 1);
  g.rotateZ(Math.PI / 2);          // along +X, which the tail root flips to -X
  g.translate(len / 2, 0, 0);
  bag.hide.push(g);
  // Coarse brush along the tail, heaviest at the base — a wolf's tail is
  // mostly hair, and a bare rod reads as a rat's.
  for (let k = 0; k < 9; k++) {
    const t = rnd();
    const a = rnd() * Math.PI * 2;
    const r = (r0 + (r1 - r0) * t) * 0.8;
    const s = spike(0.075 + rnd() * 0.05 - i * 0.014, 0.022, 0.003, 4);
    s.scale(1, 1, 0.7);
    bag.hide.push(placed(s, len * t, Math.cos(a) * r, Math.sin(a) * r, a, 0, -1.9 - rnd() * 0.4));
  }
  if (i === n - 1) {
    // Only the tip burns, and only the tip carries the ember slot: a crack on
    // a tail link is not worth a second draw call on three meshes per hound.
    const tip = spike(0.085, 0.024, 0.002, 5);
    bag.ember.push(placed(tip, len * 0.9, 0, 0, 0, 0, -Math.PI / 2));
    const pts = [];
    for (let k = 0; k <= 3; k++) {
      const t = k / 3;
      const r = (r0 + (r1 - r0) * t) + 0.003;
      pts.push(new THREE.Vector3(len * t, Math.cos(0.6 + t) * r, Math.sin(0.6 + t) * r));
    }
    const rb = ribbon(pts, 0.006);
    if (rb) bag.ember.push(rb);
  }
  return pack(bag);
}

// ---- legs -----------------------------------------------------------------
// Long and rangy. Front and rear share geometry — the difference between them
// lives in the rig's rest angles and hip height, not in two sets of meshes.
const UPPER_LEN = 0.40;
const LOWER_LEN = 0.48;

function buildUpperLeg(rnd) {
  // Deliberately ONE slot. Every extra material slot on a leg costs four draw
  // calls per hound, and a thigh has nothing on it worth that at any distance
  // the player will ever see one from.
  const bag = { hide: [] };
  bag.hide.push(limb(UPPER_LEN, 0.082, 0.036, 1.55, 1.1, 6));
  // A little muscle belly on the front of the thigh.
  bag.hide.push(placed(new THREE.SphereGeometry(0.055, 6, 5), 0.02, -0.10, 0, 0, 0, 0, 1.15, 1.7, 0.8));
  // Feathering down the back of the leg.
  for (let i = 0; i < 5; i++) {
    const t = 0.15 + rnd() * 0.7;
    bag.hide.push(placed(spike(0.06 + rnd() * 0.04, 0.011, 0.001, 3),
      -0.03 - rnd() * 0.02, -UPPER_LEN * t, (rnd() - 0.5) * 0.05, 0, 0, 2.3 + rnd() * 0.6));
  }
  return pack(bag);
}

function buildLowerLeg(rnd) {
  const bag = { hide: [] };
  // Cannon bone: deliberately thin. The gap between a heavy thigh and a wire
  // shin is what makes an animal look fast.
  bag.hide.push(limb(LOWER_LEN * 0.86, 0.036, 0.023, 1.4, 1.05, 5));
  // Hock/pastern: the bare tendon running to the foot.
  bag.hide.push(placed(new THREE.CylinderGeometry(0.013, 0.016, LOWER_LEN * 0.30, 4),
    0.004, -LOWER_LEN * 0.86, 0, 0, 0, 0));
  for (let i = 0; i < 3; i++) {
    bag.hide.push(placed(spike(0.05 + rnd() * 0.03, 0.010, 0.001, 3),
      -0.022, -LOWER_LEN * (0.1 + rnd() * 0.4), (rnd() - 0.5) * 0.03, 0, 0, 2.4));
  }
  return pack(bag);
}

function buildPaw(rnd) {
  const bag = { hide: [], bone: [] };
  // Origin is the ground contact, so the rig's paw-plant clamp stays exact.
  bag.hide.push(placed(new THREE.SphereGeometry(0.052, 6, 5), 0.028, 0.038, 0, 0, 0, 0, 1.5, 0.7, 1.05));
  for (const off of [-0.038, 0, 0.038]) {
    const toe = off === 0 ? 0.075 : 0.062;
    bag.hide.push(placed(new THREE.SphereGeometry(0.024, 5, 4), 0.055 + toe * 0.3, 0.026, off, 0, 0, 0, 1.9, 0.85, 0.9));
    // Claws ride the HIDE slot: keratin is dark horn, and bone-white toes read
    // as socks at any distance. It also keeps a paw down to one draw call.
    bag.hide.push(placed(spike(0.038, 0.0085, 0.0, 4),
      0.055 + toe + 0.018, 0.020, off, 0, 0, -2.0 - rnd() * 0.2));
  }
  return pack(bag);
}

export { buildTailSeg, UPPER_LEN, LOWER_LEN, buildUpperLeg, buildLowerLeg, buildPaw };
