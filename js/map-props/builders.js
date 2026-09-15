// The dressing's prop builders: what a crate, a drum, a pipe run or a wall lamp
// looks like, built into the geometry buckets. decorateMap() in js/map-props.js
// calls makePropBuilders once per build, passing the names in its parameter
// list, and hands the builders to the code that places the props.
import * as THREE from 'three';

export function makePropBuilders({ place, G, buckets, R, rnd, pick, group, lights, animated, footprintFree, claimFootprint }) {
  // =========================================================================
  // prop builders
  // =========================================================================

  /** Slatted wooden crate with corner braces. */
  function crate(x, y, z, s = 0.8, ry = 0) {
    const h = s * R(0.85, 1.05);
    place('wood', G.box, x, y + h / 2, z, 0, ry, 0, s, h, s);
    // corner posts + rails read as construction rather than a painted cube
    const t = s * 0.08;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      place('wood', G.box, x + sx * (s / 2 - t / 2) * Math.cos(ry) - sz * (s / 2 - t / 2) * Math.sin(ry),
        y + h / 2, z + sx * (s / 2 - t / 2) * Math.sin(ry) + sz * (s / 2 - t / 2) * Math.cos(ry),
        0, ry, 0, t * 1.2, h * 1.01, t * 1.2);
    }
    // One rail per height. The rail is a square band — it is scaled equally in
    // x and z — so a copy of it turned 90° is the SAME box in the same place,
    // not a second pair of sides. Placing both left every crate in the map with
    // two perfectly coincident rails, and coincident faces have no depth-buffer
    // winner: the pixels pick between two sets of UVs per frame. That was the
    // single largest source of the "the map flickers while I stand still"
    // report — 150m² of it, because crates are scattered through every room.
    for (const hy of [h * 0.22, h * 0.78]) {
      place('wood', G.box, x, y + hy, z, 0, ry, 0, s * 1.02, t, s * 1.02);
    }
    if (rnd() < 0.25) { // stencilled band
      place('dark', G.box, x, y + h * 0.5, z, 0, ry, 0, s * 1.03, t * 0.8, s * 1.03);
    }
  }

  /** 200 litre steel drum with rolling hoops and a bung. */
  const DRUM_R = 0.29;
  const DRUM_HOOP_R = DRUM_R * 1.045;   // the hoops stand proud of the barrel
  function drum(x, y, z, ry = 0, tipped = false) {
    const r = DRUM_R, h = 0.88;
    if (tipped) {
      place('metal', G.cyl16, x, y + r, z, Math.PI / 2, ry, 0, r * 2, h, r * 2);
      for (const o of [-0.22, 0.22]) {
        place('metal', G.cyl16, x + Math.cos(ry) * o, y + r, z + Math.sin(ry) * o, Math.PI / 2, ry, 0, r * 2.09, 0.05, r * 2.09);
      }
      return;
    }
    place('metal', G.cyl16, x, y + h / 2, z, 0, ry, 0, r * 2, h, r * 2);
    for (const o of [-0.2, 0.2]) place('metal', G.cyl16, x, y + h / 2 + o, z, 0, ry, 0, r * 2.09, 0.055, r * 2.09);
    place('metal', G.cyl12, x, y + h + 0.012, z, 0, ry, 0, r * 2.02, 0.03, r * 2.02);
    place('dark', G.cyl8, x + r * 0.45, y + h + 0.03, z, 0, 0, 0, 0.07, 0.035, 0.07);
  }

  /** Shipping pallet — visible slat gaps are what make it read. */
  function pallet(x, y, z, ry = 0) {
    const w = 1.1, d = 0.85;
    // Half the diagonal, so the test is independent of `ry`. Returns false when
    // the spot is taken so `alongWalls` retries elsewhere rather than laying a
    // second deck in the first one's plane.
    const FOOT = Math.hypot(w, d) / 2;
    if (!footprintFree(x, z, y, FOOT)) return false;
    claimFootprint(x, z, y, FOOT);
    // Deck boards are spread ACROSS the pallet's depth, on the same axis the
    // stringers below them are spread on. They were being stepped along the
    // pallet's LENGTH instead — the axis each board already spans — so all five
    // 1.1m boards piled up in one 0.12m strip, every one of them coplanar with
    // the other four top and bottom. That is what the deck gap is for, and it
    // was also the largest single z-fight left in the map: 9m² of it, on the
    // floor, in every room that dresses with pallets.
    const across = (o) => [x - Math.sin(ry) * o, z + Math.cos(ry) * o];
    for (let i = 0; i < 5; i++) {
      const [px, pz] = across(-d / 2 + (i / 4) * d);
      place('wood', G.box, px, y + 0.135, pz, 0, ry, 0, w, 0.028, d * 0.14);
    }
    for (const o of [-d / 2 + 0.08, 0, d / 2 - 0.08]) {
      const [px, pz] = across(o);
      place('wood', G.box, px, y + 0.065, pz, 0, ry, 0, w, 0.09, 0.1);
    }
    return true;
  }

  /** Sandbag wall — staggered courses with slightly squashed bags. */
  function sandbags(x, y, z, len, ry, rows = 3) {
    const bagW = 0.42;
    const n = Math.max(2, Math.round(len / bagW));
    for (let r0 = 0; r0 < rows; r0++) {
      const off = (r0 % 2) * bagW * 0.5;
      for (let i = 0; i < n - (r0 % 2); i++) {
        const t = -len / 2 + off + i * bagW + bagW / 2;
        place('canvas', G.sphere,
          x + Math.cos(ry) * t, y + 0.11 + r0 * 0.19, z + Math.sin(ry) * t,
          R(-0.08, 0.08), ry + R(-0.15, 0.15), R(-0.06, 0.06),
          bagW * 1.02, 0.2, 0.34);
      }
    }
  }

  /** Rubble pile: chunks of broken concrete with rebar spurs. */
  function rubble(x, y, z, radius = 1.1, count = 10) {
    for (let i = 0; i < count; i++) {
      const a = R(Math.PI * 2), d = Math.sqrt(rnd()) * radius;
      const s = R(0.1, 0.36);
      place('concrete', pick([G.rock, G.rock1]),
        x + Math.cos(a) * d, y + s * R(0.25, 0.5), z + Math.sin(a) * d,
        R(Math.PI), R(Math.PI), R(Math.PI), s, s * R(0.5, 0.9), s);
    }
    for (let i = 0; i < Math.max(1, count / 5); i++) {
      const a = R(Math.PI * 2), d = R(radius * 0.7);
      place('metal', G.cyl8, x + Math.cos(a) * d, y + 0.18, z + Math.sin(a) * d,
        R(-0.7, 0.7), R(Math.PI), R(-0.7, 0.7), 0.018, R(0.3, 0.7), 0.018);
    }
  }

  /** Horizontal pipe run with brackets, elbows and the odd valve wheel. */
  function pipeRun(x1, y, z1, x2, z2, radius = 0.07, mat = 'metal') {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) return;
    const ry = Math.atan2(dx, dz);
    place(mat, G.cyl12, (x1 + x2) / 2, y, (z1 + z2) / 2, Math.PI / 2, ry, 0, radius * 2, len, radius * 2);
    // flanges
    place(mat, G.cyl12, x1, y, z1, Math.PI / 2, ry, 0, radius * 2.6, 0.06, radius * 2.6);
    place(mat, G.cyl12, x2, y, z2, Math.PI / 2, ry, 0, radius * 2.6, 0.06, radius * 2.6);
    // brackets every ~2.2m
    const n = Math.max(1, Math.floor(len / 2.2));
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      const bx = x1 + dx * t, bz = z1 + dz * t;
      place('dark', G.box, bx, y + radius + 0.05, bz, 0, ry, 0, radius * 3.2, 0.1, 0.05);
      if (rnd() < 0.22) {
        // valve wheel
        place('metal', G.torus, bx, y + radius * 1.1, bz, 0, ry, Math.PI / 2, 0.3, 0.3, 0.3);
        place('metal', G.cyl8, bx, y + radius * 0.6, bz, 0, 0, 0, 0.05, 0.16, 0.05);
      }
    }
  }

  /** Drooping cable between two points (catenary, segmented). */
  function cable(x1, y1, z1, x2, y2, z2, sag = 0.35, segs = 8, radius = 0.016) {
    let px = x1, py = y1, pz = z1;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const cx = x1 + (x2 - x1) * t;
      const cz = z1 + (z2 - z1) * t;
      const cy = y1 + (y2 - y1) * t - Math.sin(t * Math.PI) * sag;
      const dx = cx - px, dy = cy - py, dz = cz - pz;
      const len = Math.hypot(dx, dy, dz);
      const g = new THREE.CylinderGeometry(radius, radius, len, 5);
      const m = new THREE.Matrix4();
      const up = new THREE.Vector3(0, 1, 0);
      const dir = new THREE.Vector3(dx, dy, dz).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
      m.compose(new THREE.Vector3((px + cx) / 2, (py + cy) / 2, (pz + cz) / 2), q, new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(m);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      buckets.dark.push(g);
      px = cx; py = cy; pz = cz;
    }
  }

  /** Hanging chain with a hook. */
  function chain(x, yTop, z, len) {
    const links = Math.max(2, Math.round(len / 0.13));
    for (let i = 0; i < links; i++) {
      place('metal', G.torus, x, yTop - i * 0.13 - 0.065, z, Math.PI / 2, (i % 2) * Math.PI / 2, 0, 0.12, 0.12, 0.12);
    }
    place('metal', G.torus, x, yTop - len - 0.07, z, Math.PI / 2, 0, 0, 0.2, 0.2, 0.2);
  }

  /** Structural I-beam. */
  function ibeam(x, y, z, len, ry = 0, w = 0.26, h = 0.34) {
    place('plate', G.box, x, y + h / 2, z, 0, ry, 0, len, 0.05, w);
    place('plate', G.box, x, y - h / 2, z, 0, ry, 0, len, 0.05, w);
    place('plate', G.box, x, y, z, 0, ry, 0, len, h, 0.045);
    // gusset plates + rivets
    const n = Math.max(1, Math.floor(len / 3));
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + (i / n) * len;
      place('plate', G.box, x + Math.cos(ry) * t, y, z + Math.sin(ry) * t, 0, ry, 0, 0.06, h * 0.94, w * 0.92);
    }
  }

  /** Ventilation duct with joint bands. */
  function duct(x, y, z, len, ry = 0, size = 0.5) {
    place('plate', G.box, x, y, z, 0, ry, 0, len, size, size);
    const n = Math.max(1, Math.floor(len / 2.4));
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + (i / n) * len;
      place('plate', G.box, x + Math.cos(ry) * t, y, z + Math.sin(ry) * t, 0, ry, 0, 0.07, size * 1.13, size * 1.13);
    }
    // hangers up to the ceiling
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + (i / n) * len;
      place('dark', G.box, x + Math.cos(ry) * t, y + size * 0.5 + 0.28, z + Math.sin(ry) * t, 0, ry, 0, 0.03, 0.56, 0.03);
    }
  }

  /** Caged work lamp on a wall bracket. Adds a real PointLight. */
  function wallLamp(x, y, z, ry, color = 0xffb765, opts = {}) {
    const dx = -Math.sin(ry), dz = -Math.cos(ry);   // outward from the wall
    // bracket
    place('dark', G.box, x + dx * 0.09, y, z + dz * 0.09, 0, ry, 0, 0.1, 0.12, 0.18);
    place('dark', G.cyl8, x + dx * 0.22, y + 0.02, z + dz * 0.22, Math.PI / 2, ry, 0, 0.035, 0.3, 0.035);
    // conical shade
    place('metal', G.cone, x + dx * 0.38, y + 0.06, z + dz * 0.38, Math.PI * 0.14, ry, 0, 0.34, 0.26, 0.34);
    // cage bars
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      place('dark', G.cyl8,
        x + dx * 0.38 + Math.cos(a) * 0.14 * Math.cos(ry), y - 0.06, z + dz * 0.38 + Math.cos(a) * 0.14 * Math.sin(ry),
        0.2, ry, 0, 0.014, 0.22, 0.014);
    }
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0x1a1610, emissive: new THREE.Color(color), emissiveIntensity: 1.4, roughness: 0.3, toneMapped: false,
    });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), bulbMat);
    bulb.position.set(x + dx * 0.38, y - 0.05, z + dz * 0.38);
    group.add(bulb);

    const light = new THREE.PointLight(color, 0, opts.distance ?? 13, 2);
    light.position.set(x + dx * 0.5, y - 0.1, z + dz * 0.5);
    group.add(light);
    lights.push({
      light, bulb, mat: bulbMat, base: color,
      on: opts.on ?? 55, off: opts.off ?? 0,
      flicker: opts.flicker ?? (rnd() < 0.22),
      broken: opts.broken ?? false,
      t: R(20),
    });
  }

  /** Emergency dome light — red, on even without main power. */
  function emergencyLight(x, y, z, ry) {
    const dx = -Math.sin(ry), dz = -Math.cos(ry);
    place('dark', G.box, x + dx * 0.06, y, z + dz * 0.06, 0, ry, 0, 0.26, 0.16, 0.12);
    const domeMat = new THREE.MeshStandardMaterial({
      color: 0x2a0604, emissive: new THREE.Color(0xff2a12), emissiveIntensity: 2.2, roughness: 0.25, toneMapped: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), domeMat);
    dome.rotation.z = Math.PI / 2;
    dome.rotation.y = ry;
    dome.position.set(x + dx * 0.17, y, z + dz * 0.17);
    group.add(dome);
    const light = new THREE.PointLight(0xff2a12, 6, 9, 2);
    light.position.set(x + dx * 0.35, y, z + dz * 0.35);
    group.add(light);
    lights.push({ light, bulb: dome, mat: domeMat, base: 0xff2a12, on: 4, off: 11, flicker: false, emergency: true, t: R(20) });
  }

  /** Fluorescent tube fixture (labs). Flickers hard when about to fail. */
  function fluorescent(x, y, z, ry, len = 1.5, color = 0xd6e6ff) {
    place('plate', G.box, x, y + 0.06, z, 0, ry, 0, len, 0.07, 0.16);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0x0d1014, emissive: new THREE.Color(color), emissiveIntensity: 1.6, roughness: 0.2, toneMapped: false,
    });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len * 0.92, 8), tubeMat);
    tube.rotation.set(0, ry, Math.PI / 2);
    tube.position.set(x, y, z);
    group.add(tube);
    const light = new THREE.PointLight(color, 0, 11, 2);
    light.position.set(x, y - 0.12, z);
    group.add(light);
    lights.push({ light, bulb: tube, mat: tubeMat, base: color, on: 26, off: 0, flicker: rnd() < 0.45, fluoro: true, t: R(20) });
  }

  /** Heavy factory machine: base, housing, motor, pipes, gauge panel. */
  function machine(x, y, z, ry, w = 1.6, h = 1.5, d = 1.1) {
    place('plate', G.box, x, y + 0.09, z, 0, ry, 0, w * 1.1, 0.18, d * 1.1);
    place('metal', G.box, x, y + 0.18 + h / 2, z, 0, ry, 0, w, h, d);
    // motor housing on top
    place('metal', G.cyl12, x - Math.cos(ry) * w * 0.24, y + 0.18 + h + 0.16, z - Math.sin(ry) * w * 0.24,
      0, ry, Math.PI / 2, 0.32, 0.5, 0.32);
    // exhaust stack
    place('metal', G.cyl8, x + Math.cos(ry) * w * 0.3, y + 0.18 + h + 0.4, z + Math.sin(ry) * w * 0.3, 0, 0, 0, 0.11, 0.8, 0.11);
    // access hatch + bolts
    place('dark', G.box, x - Math.sin(ry) * (d / 2 + 0.01), y + 0.18 + h * 0.55, z - Math.cos(ry) * (d / 2 + 0.01),
      0, ry, 0, w * 0.5, h * 0.42, 0.03);
    // gauge panel — small emissive dials the bloom pass will catch
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x0a0d10, emissive: 0x2fbf6a, emissiveIntensity: 0.9, roughness: 0.35, toneMapped: false,
    });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.03), panelMat);
    panel.position.set(x - Math.sin(ry) * (d / 2 + 0.03), y + 0.18 + h * 0.82, z - Math.cos(ry) * (d / 2 + 0.03));
    panel.rotation.y = ry;
    group.add(panel);
    animated.push({ kind: 'gauge', mat: panelMat, t: R(10) });
    // feed pipes into the floor
    for (const o of [-w * 0.32, w * 0.32]) {
      place('metal', G.cyl8, x + Math.cos(ry) * o, y + 0.6, z + Math.sin(ry) * o, 0, 0, 0, 0.08, 1.2, 0.08);
    }
  }

  /** Workbench with a vice and scattered tools. */
  function workbench(x, y, z, ry, len = 1.8) {
    place('wood', G.box, x, y + 0.86, z, 0, ry, 0, len, 0.07, 0.62);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      place('dark', G.box,
        x + Math.cos(ry) * sx * (len / 2 - 0.09) - Math.sin(ry) * sz * 0.24,
        y + 0.43,
        z + Math.sin(ry) * sx * (len / 2 - 0.09) + Math.cos(ry) * sz * 0.24,
        0, ry, 0, 0.06, 0.86, 0.06);
    }
    place('metal', G.box, x + Math.cos(ry) * (len * 0.3), y + 0.96, z + Math.sin(ry) * (len * 0.3), 0, ry, 0, 0.18, 0.14, 0.12);
    for (let i = 0; i < 3; i++) {
      place('metal', G.box, x + Math.cos(ry) * R(-len / 2 + 0.2, len / 2 - 0.2), y + 0.91,
        z + Math.sin(ry) * R(-len / 2 + 0.2, len / 2 - 0.2), 0, R(Math.PI), 0, R(0.05, 0.24), 0.03, 0.035);
    }
  }

  /** Cable spool on its side or upright. */
  function spool(x, y, z, ry) {
    const r = 0.46;
    for (const o of [-0.24, 0.24]) {
      place('wood', G.cyl16, x, y + r, z + o, Math.PI / 2, ry, 0, r * 2, 0.06, r * 2);
    }
    place('dark', G.cyl12, x, y + r, z, Math.PI / 2, ry, 0, r * 1.2, 0.42, r * 1.2);
  }

  /** Hanging torn tarpaulin. */
  function tarp(x, y, z, w, h, ry) {
    place('canvas', G.plane, x, y - h / 2, z, 0, ry, 0, w, h, 1);
    place('dark', G.cyl8, x, y, z, Math.PI / 2, ry, 0, 0.025, w, 0.025);
  }

  /** Floor drain grate. */
  function drain(x, y, z) {
    place('dark', G.box, x, y + 0.01, z, 0, 0, 0, 0.52, 0.03, 0.52);
    for (let i = 0; i < 6; i++) {
      place('metal', G.box, x - 0.2 + i * 0.08, y + 0.025, z, 0, 0, 0, 0.045, 0.02, 0.46);
    }
  }

  return {
    crate, DRUM_HOOP_R, drum, pallet, sandbags, rubble, pipeRun, cable, chain, ibeam, duct,
    wallLamp, emergencyLight, fluorescent, machine, workbench, spool, drain,
  };
}
