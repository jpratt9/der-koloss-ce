// Receiver furniture: the ejection port, the trigger group, the magazine and
// the small hardware that hangs off a receiver.
import * as THREE from 'three';
import { WM } from '../WeaponMaterials.js';
import { mesh, bevelBoxGeo, plateGeo, cylGeo, torusGeo } from './geometry.js';

/** Recessed ejection port with a raised lip and a dark cavity behind it. */
export function ejectionPort(matBody, matCavity, { w = 0.05, h = 0.028, x = 0.027, y = 0.02, z = -0.02, side = 1 } = {}) {
  const g = new THREE.Group();
  g.add(mesh(bevelBoxGeo(0.004, h, w, 0.001), matCavity, 0, 0, 0));
  // lip frame
  g.add(mesh(bevelBoxGeo(0.005, 0.0045, w + 0.012, 0.0012), matBody, 0.0016, h / 2 + 0.002, 0));
  g.add(mesh(bevelBoxGeo(0.005, 0.0045, w + 0.012, 0.0012), matBody, 0.0016, -h / 2 - 0.002, 0));
  g.add(mesh(bevelBoxGeo(0.005, h + 0.01, 0.006, 0.0012), matBody, 0.0016, 0, w / 2 + 0.003));
  g.add(mesh(bevelBoxGeo(0.005, h + 0.01, 0.006, 0.0012), matBody, 0.0016, 0, -w / 2 - 0.003));
  g.position.set(x * side, y, z);
  g.rotation.y = side > 0 ? 0 : Math.PI;
  return g;
}

/** Trigger + bow-shaped guard, extruded with a bevel so it catches light. */
export function triggerGroup(mat, { len = 0.075, drop = 0.042, thick = 0.011, y = -0.03, z = -0.02 } = {}) {
  const g = new THREE.Group();
  const hl = len / 2, r = drop;
  const outer = [];
  const inner = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = Math.PI * t;
    outer.push([-hl + len * t, -Math.sin(a) * r]);
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n, a = Math.PI * t;
    inner.push([(-hl + len * t) * 0.80, -Math.sin(a) * (r - 0.011)]);
  }
  const pts = [[-hl - 0.007, 0.010], ...outer, [hl + 0.007, 0.010], [hl * 0.80, 0.005], ...inner, [-hl * 0.80, 0.005]];
  g.add(mesh(plateGeo('tg' + len.toFixed(4) + drop.toFixed(4), pts, thick, 0.0018), mat, 0, 0, 0, 0, Math.PI / 2));
  // trigger blade
  const t = mesh(plateGeo('tb', [
    [0, 0], [0.006, 0], [0.008, -0.012], [0.004, -0.026], [-0.004, -0.028], [-0.006, -0.016], [-0.004, -0.004],
  ], 0.006, 0.0012), mat, 0, -0.004, -len * 0.09, 0, Math.PI / 2);
  g.add(t);
  g.position.set(0, y, z);
  g.userData.trigger = t;
  return g;
}

/**
 * Detachable box magazine: tapered body, spine ribs, floorplate and a witness
 * slot. `curve` bends it like an AK/STG banana mag.
 */
export function magazine(mat, matFloor, { w = 0.036, h = 0.14, d = 0.05, curve = 0, taper = 0.9, ribs = 3 } = {}) {
  const g = new THREE.Group();
  const segs = curve > 0.001 ? 5 : 1;
  const segH = h / segs;

  // A curved magazine is a CHAIN, not a stack of independently placed blocks:
  // each section hangs off the bottom seam of the one above it and is hinged by
  // the same small angle, so the body stays continuous however far it bananas.
  //
  // The previous build put every section in the magazine's STRAIGHT local space
  // and then slid it forward by `curve * t^2 * 0.5` — up to 120mm on an StG-44,
  // whose whole magazine is only 190mm long. The sections came apart into four
  // separate blocks trailing down and forward through the air, and the
  // floorplate and spine ribs, which were positioned in that same straight
  // space, ended up 30mm clear of any of them. On the asset-archive page it
  // read as a handful of loose blocks and thin slabs hanging under the
  // receiver. Every banana magazine in the game had it.
  const bend = curve * 1.6;                        // total sweep, radians
  const step = segs > 1 ? bend / (segs - 1) : 0;
  const width = (i) => w * (1 - (1 - taper) * (i / segs));
  const joints = [];
  let parent = g;
  for (let i = 0; i < segs; i++) {
    const joint = new THREE.Group();
    // Section 0 is centred ON the magazine origin so the mouth of the magazine
    // — the part that has to sit inside the magwell — never moves when `curve`
    // changes. Every later joint sits on the seam it shares with the section
    // above, which is exactly where a real magazine's curve is struck from.
    joint.position.y = i === 0 ? 0 : -(i === 1 ? segH / 2 : segH);
    joint.rotation.x = i === 0 ? 0 : step;
    parent.add(joint);
    parent = joint;
    joints.push(joint);
    // +0.002 of overlap at each seam: a bevelled box is slightly short of its
    // nominal size at the corners, and a hairline of daylight along a seam is
    // exactly what makes a one-piece magazine read as several.
    joint.add(mesh(bevelBoxGeo(width(i), segH + 0.002, d, 0.0022), mat,
      0, i === 0 ? 0 : -segH / 2, 0));
  }

  // Anything bolted to the body is parented to the SECTION it sits on, so it
  // rides the curve instead of being aimed at where a straight magazine would
  // have put it.
  const last = joints[segs - 1];
  const bottomY = segs === 1 ? -(segH + 0.002) / 2 : -segH;
  const fp = mesh(bevelBoxGeo(width(segs - 1) + 0.005, 0.009, d + 0.005, 0.0018), matFloor,
    0, bottomY - 0.003, 0);
  last.add(fp);
  // Spine ribs, spread down the body. `depth` is measured from the MOUTH of the
  // magazine — the top face of section 0, which sits half a section above the
  // origin. The old formula measured from the origin and ran to 0.70h, so on a
  // straight magazine (whose whole body is only ±h/2 about the origin) the
  // bottom rib always ended up hanging below the floorplate in clear air.
  for (let i = 0; i < ribs; i++) {
    const depth = h * ((i + 1) / (ribs + 1));
    const si = Math.min(segs - 1, Math.max(0, Math.floor(depth / segH)));
    const localY = si === 0 ? segH / 2 - depth : -(depth - si * segH);
    joints[si].add(mesh(bevelBoxGeo(width(si) + 0.002, 0.004, d * 0.86, 0.001), mat, 0, localY, 0));
  }
  g.userData.floorplate = fp;
  return g;
}

/** Picatinny-ish rail with individual slots. */
export function rail(mat, { len = 0.24, w = 0.022, h = 0.008, slots = 8 } = {}) {
  const g = new THREE.Group();
  g.add(mesh(bevelBoxGeo(w, h, len, 0.0012), mat, 0, 0, 0));
  const step = len / slots;
  for (let i = 0; i < slots; i++) {
    g.add(mesh(bevelBoxGeo(w + 0.001, h * 0.55, step * 0.34, 0.0006), WM.cavity,
      0, h * 0.12, -len / 2 + step * (i + 0.5)));
  }
  return g;
}

/** Slotted screw head. */
export function screw(mat, { r = 0.004, x = 0, y = 0, z = 0, axis = 'x' } = {}) {
  const g = new THREE.Group();
  g.add(mesh(cylGeo(r, r * 0.95, 0.0035, 10), mat, 0, 0, 0));
  g.add(mesh(bevelBoxGeo(r * 1.7, 0.0012, r * 0.42, 0.0003), WM.cavity, 0, 0.0018, 0));
  if (axis === 'x') g.rotation.z = Math.PI / 2;
  else if (axis === 'z') g.rotation.x = Math.PI / 2;
  g.position.set(x, y, z);
  return g;
}

/** Sling swivel loop. */
export function slingLoop(mat, { r = 0.011, tube = 0.0026, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
  const g = new THREE.Group();
  g.add(mesh(torusGeo(r, tube, 5, 14), mat, 0, 0, 0));
  g.add(mesh(bevelBoxGeo(0.009, 0.008, 0.008, 0.001), mat, 0, r + 0.004, 0));
  g.position.set(x, y, z);
  g.rotation.set(rx, ry, rz);
  return g;
}

/** Charging handle knob on a slotted track. */
export function chargingHandle(mat, matC, { x = 0.026, y = 0.022, z = 0, len = 0.05, knob = 0.011 } = {}) {
  const g = new THREE.Group();
  g.add(mesh(bevelBoxGeo(0.006, 0.011, len, 0.0012), mat, 0, 0, 0));
  g.add(mesh(cylGeo(knob, knob * 0.85, 0.014, 12), mat, 0.010, 0, -len * 0.28, 0, 0, Math.PI / 2));
  g.add(mesh(bevelBoxGeo(0.003, 0.007, len + 0.03, 0.0008), matC, -0.004, 0, 0.006));
  g.position.set(x, y, z);
  return g;
}

/** Selector / safety lever. */
export function selector(mat, { x = 0.026, y = 0, z = 0, rot = 0.5 } = {}) {
  const g = new THREE.Group();
  g.add(mesh(cylGeo(0.0075, 0.0075, 0.008, 12), mat, 0, 0, 0, 0, 0, Math.PI / 2));
  g.add(mesh(bevelBoxGeo(0.006, 0.008, 0.026, 0.0012), mat, 0.004, 0.004, -0.010, rot));
  g.position.set(x, y, z);
  return g;
}

/**
 * Bipod with folded/deployed legs.
 *
 * `mount` is the weapon-space Y of the surface the yoke clamps to — normally
 * the UNDERSIDE of the barrel or shroud — and `clamp` its radius. Without them
 * the yoke sits wherever `y` puts it and the whole bipod hangs off the gun in
 * mid-air, which is how every bipod in the game was mounted.
 */
export function bipod(mat, { y = -0.05, z = -0.4, spread = 0.42, len = 0.17, mount = null, clamp = 0 } = {}) {
  const g = new THREE.Group();
  g.add(mesh(bevelBoxGeo(0.026, 0.014, 0.03, 0.0018), mat, 0, 0.004, 0));
  if (mount !== null) {
    const top = mount - y;                  // the clamp surface, in local space
    const rise = top - 0.011;               // from the top of the yoke plate up
    if (rise > 0.0005) {
      g.add(mesh(bevelBoxGeo(0.018, rise + 0.002, 0.024, 0.0015), mat, 0, 0.011 + rise / 2, 0));
    }
    if (clamp > 0) {
      g.add(mesh(torusGeo(clamp, 0.0034, 6, 18), mat, 0, top + clamp, 0));
      g.add(mesh(bevelBoxGeo(0.012, 0.009, 0.014, 0.0012), mat, 0, top + clamp * 2 + 0.002, 0));
    }
  }
  const legs = [];
  for (const sx of [1, -1]) {
    const leg = new THREE.Group();
    leg.add(mesh(cylGeo(0.0042, 0.0035, len, 8), mat, 0, -len / 2, 0));
    leg.add(mesh(bevelBoxGeo(0.008, 0.006, 0.022, 0.001), mat, 0, -len, 0.004));
    leg.position.set(sx * 0.012, 0, 0);
    leg.rotation.z = -sx * spread;
    g.add(leg);
    legs.push(leg);
  }
  // Named, not indexed: callers used to fish the legs out as children[1] and
  // children[2], which silently pointed at the mount hardware the moment this
  // grew a clamp.
  g.userData.legs = legs;
  g.position.set(0, y, z);
  return g;
}
