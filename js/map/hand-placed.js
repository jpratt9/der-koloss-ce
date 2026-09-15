// The map's hand-placed props, room by room: crates, barrels, sandbags,
// machines, cages, vats, the courtyard generator and tree, the car wreck, the
// factory catwalk and its stairs, telephone poles and wires, and old blood.
// js/map-props.js dresses the rest from its seeded stream.
// buildMap() in js/map.js calls this in build order, with the names in its parameter list.
import * as THREE from 'three';
import { rand, choice } from '../utils.js';
import { splatTexture } from '../render/Particles.js';
import { BLOOD_DECAL_COLOR } from '../fx.js';
import { FACTORY_CATWALK } from '../map-layout.js';

export function placeProps({
  group, colliders, fires, solidGeos, pushBox, pbr, matMetal, matPlate, matDark, matWood, encloseStairFlight, H, HH,
}) {
  // ---------- props ----------
  function crate(x, z, s = 1) {
    pushBox(solidGeos.wood, x, s / 2, z, s, s, s, rand(-0.2, 0.2));
    colliders.push({ minX: x - s / 2, maxX: x + s / 2, minZ: z - s / 2, maxZ: z + s / 2, y0: 0, h: s, prop: true });
  }
  function barrel(x, z, fire = false) {
    pushBox(solidGeos.metal, x, 0.55, z, 0.7, 1.1, 0.7);
    colliders.push({ minX: x - 0.35, maxX: x + 0.35, minZ: z - 0.35, maxZ: z + 0.35, y0: 0, h: 1.1, prop: true });
    if (fire) fires.push({ x, y: 1.15, z, light: null, t: rand(10) });
  }
  function sandbags(x, z, w, ry = 0) {
    pushBox(solidGeos.dark, x, 0.35, z, w, 0.7, 0.9, ry);
    pushBox(solidGeos.dark, x, 0.85, z, w * 0.8, 0.35, 0.7, ry);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - 0.5, maxZ: z + 0.5, y0: 0, h: 1.0, prop: true });
  }
  function machine(x, z, ry = 0) {
    pushBox(solidGeos.metal, x, 0.7, z, 2.2, 1.4, 1.1, ry);
    pushBox(solidGeos.metal, x, 1.55, z, 1.4, 0.35, 0.7, ry);
    colliders.push({ minX: x - 1.1, maxX: x + 1.1, minZ: z - 0.6, maxZ: z + 0.6, y0: 0, h: 1.7, prop: true });
  }
  // animal cage (steel frame + bars)
  function cage(x, z, ry = 0) {
    const frame = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.7 });
    const cg = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.8), frame); top.position.y = 0.88;
    const bot = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.8), frame); bot.position.y = 0.08;
    cg.add(top, bot);
    for (let i = 0; i < 7; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.8, 4), frame);
      bar.position.set(-0.5 + i * 0.167, 0.48, 0.38);
      const bar2 = bar.clone(); bar2.position.z = -0.38;
      cg.add(bar, bar2);
    }
    for (const sx of [-0.52, 0.52]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.84, 0.05), frame);
      post.position.set(sx, 0.48, 0.37);
      const post2 = post.clone(); post2.position.z = -0.37;
      cg.add(post, post2);
    }
    cg.position.set(x, 0, z); cg.rotation.y = ry;
    group.add(cg);
    colliders.push({ minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.45, maxZ: z + 0.45, y0: 0, h: 0.95, prop: true });
  }
  // big chemical vat with glowing sight-glass
  function chemVat(x, z, baseY = 0) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 2.6, 16), matMetal.clone());
    body.position.set(x, baseY + 1.3, z); body.castShadow = true;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.1, 0.5, 16), matMetal.clone());
    lid.position.set(x, baseY + 2.85, z);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x0a1a10, emissive: 0x2aff70, emissiveIntensity: 0.9, roughness: 0.2 }));
    glass.position.set(x + 1.15, baseY + 1.3, z);
    group.add(body, lid, glass);
    colliders.push({ minX: x - 1.2, maxX: x + 1.2, minZ: z - 1.2, maxZ: z + 1.2, y0: baseY, h: 2.9, prop: true });
  }
  // the courtyard generator (power switch hides on its far side)
  function bigGenerator(x, z) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.7, 1.8), matMetal.clone());
    base.position.set(x, 0.85, z); base.castShadow = true;
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.3, 18), matPlate.clone());
    wheel.rotation.z = Math.PI / 2; wheel.position.set(x - 1.9, 1.0, z);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.2, 10), matMetal.clone());
    stack.position.set(x + 1.2, 2.6, z);
    const hum = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.9), matDark);
    hum.position.set(x + 0.6, 1.95, z);
    group.add(base, wheel, stack, hum);
    colliders.push({ minX: x - 1.8, maxX: x + 1.8, minZ: z - 1.0, maxZ: z + 1.0, y0: 0, h: 2.2, prop: true });
  }

  // Mainframe courtyard: keep Pack-a-Punch and both 750-point approaches
  // unobstructed. The paired boxes at (8,24)/(8.7,24) and the barrel directly
  // behind d_mainR were removed; none communicated gameplay and all narrowed
  // this primary route.
  sandbags(-5, 15.2, 3);
  {
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x1c140d, roughness: 1 });
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 3.6, 7), treeMat);
    trunk.position.y = 1.8; trunk.rotation.z = 0.08; trunk.castShadow = true;
    tree.add(trunk);
    const branch = (x, y, z, len, rz, rx, r = 0.06) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r, len, 5), treeMat);
      b.position.set(x, y, z); b.rotation.set(rx, 0, rz); b.castShadow = true;
      tree.add(b);
    };
    branch(0.5, 3.6, 0, 1.6, -0.9, 0.2);
    branch(-0.55, 3.4, 0.1, 1.4, 0.85, -0.3);
    branch(0.15, 4.1, -0.3, 1.2, -0.25, 0.8, 0.05);
    branch(1.1, 4.3, 0.25, 0.9, -1.3, 0.4, 0.035);
    branch(-1.1, 4.0, 0.2, 0.8, 1.25, -0.5, 0.035);
    tree.position.set(7.4, 0, 20.5);
    group.add(tree);
    colliders.push({ minX: 7.1, maxX: 7.7, minZ: 20.2, maxZ: 20.8, y0: 0, h: 2.5, prop: true });
  }
  // rubble in the courtyard corners
  for (const [rx, rz] of [[-14.5, -24], [8, -40.5], [-13, -40]]) {
    for (let i = 0; i < 5; i++) {
      pushBox(solidGeos.concrete, rx + rand(-0.7, 0.7), rand(0.06, 0.22), rz + rand(-0.7, 0.7), rand(0.25, 0.7), rand(0.12, 0.45), rand(0.25, 0.7), rand(0, 3));
    }
  }
  // left corridor: pipes + junk
  machine(-12.5, 6, Math.PI / 2); barrel(-7, 12.5); crate(-12.8, -4, 0.9);
  // garage entrance: tires + crates
  {
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
    // The old (12.6, 12.4) stack occupied Speed Cola's only approach lane.
    for (const [tx, tz, n] of [[7.4, -5.2, 2]]) {
      for (let i = 0; i < n; i++) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.14, 8, 16), tireMat);
        t.position.set(tx + rand(-0.1, 0.1), 0.16 + i * 0.3, tz + rand(-0.1, 0.1));
        t.rotation.x = Math.PI / 2;
        group.add(t);
      }
      colliders.push({ minX: tx - 0.45, maxX: tx + 0.45, minZ: tz - 0.45, maxZ: tz + 0.45, y0: 0, h: 0.9, prop: true });
    }
  }
  crate(7.4, 12.6, 1); barrel(12.8, -5.4);
  // animal testing lab: cages, table, shelves
  cage(-28, -8.2, 0.1); cage(-26.4, -8.4, -0.12); cage(-27.2, -9.6, 0.05); cage(-18, -18.8, Math.PI / 2);
  {
    const tableMat = matMetal.clone();
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.9), tableMat);
    top.position.set(-22, 0.82, -13); top.castShadow = true;
    const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.8), tableMat); l1.position.set(-22.9, 0.4, -13);
    const l2 = l1.clone(); l2.position.x = -21.1;
    group.add(top, l1, l2);
    colliders.push({ minX: -23, maxX: -21, minZ: -13.5, maxZ: -12.5, y0: 0, h: 0.85, prop: true });
  }
  crate(-30.5, -18.5, 1); barrel(-15.2, -7.2);
  // generator room: generators + teleporter A
  machine(-41.5, -8.5); machine(-41.5, -17.5); barrel(-33.2, -18.8);
  // auto garage: car wreck + furnace
  {
    const carMat = pbr('rust', 1.2, 1.2, { metalness: 0.35 });
    const carBody = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.0, 1.9), carMat);
    carBody.position.set(23, 0.55, -10.5); carBody.rotation.y = 0.18; carBody.rotation.z = 0.03;
    const carCab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.75, 1.7), carMat);
    carCab.position.set(22.6, 1.4, -10.5); carCab.rotation.y = 0.18;
    group.add(carBody, carCab);
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 });
    for (const [wx, wz] of [[21.5, -11.4], [21.5, -9.5], [24.5, -11.4], [24.5, -9.5]]) {
      const wh = new THREE.Mesh(wheelGeo, wheelMat);
      wh.position.set(wx, 0.42, wz); wh.rotation.x = Math.PI / 2; wh.rotation.y = 0.18;
      group.add(wh);
    }
    colliders.push({ minX: 20.7, maxX: 25.3, minZ: -11.6, maxZ: -9.4, y0: 0, h: 1.6, prop: true });
  }
  pushBox(solidGeos.brick, 29, 1.6, -18.6, 3.4, 3.2, 1.8);
  pushBox(solidGeos.brick, 29, 3.9, -19.1, 1.2, 2.2, 1.0);
  colliders.push({ minX: 27.3, maxX: 30.7, minZ: -19.5, maxZ: -17.7, y0: 0, h: 3.2, prop: true });
  {
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshStandardMaterial({ color: 0x1a0c06, emissive: 0xff5511, emissiveIntensity: 1.5 }));
    mouth.position.set(29, 0.95, -17.68);
    group.add(mouth);
    fires.push({ x: 29, y: 1.0, z: -17.6, light: null, t: 3 });
  }
  machine(16.5, -18, 0); crate(30.5, -7.5, 0.9);
  // balconies: military clutter. The old right-side sandbag stack at
  // (8, -20.8) sat directly in the Double Tap courtyard-door approach and
  // looked like a second blockade after the paid route was added.
  // Three props used to stand in the corridor at the foot of the balcony
  // stairs: crate(12.8, -9.6) against the east wall in the run-up to the garage
  // flight, and machine(7, -9.4) / crate(-7, -9.5) directly across the hallway
  // from each stair mouth. Together they pinched both corridors to a chicane at
  // the one point you most want to be running. The band across each corridor in
  // front of its flight is now a declared traversal zone (labStairsMouth,
  // garageStairsMouth), so nothing can be put back there.
  sandbags(-8, -20.8, 2.6); barrel(-13, -20.8);
  // chem testing: vats + desks
  const chemFloorY = 2.9;
  chemVat(14, -34.5, chemFloorY); chemVat(20, -34.5, chemFloorY);
  {
    const deskMat = matWood.clone();
    for (const [dx, dz, ry] of [[13, -24, 0.1], [21, -24.2, -0.15]]) {
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.9), deskMat);
      top.position.set(dx, chemFloorY + 0.78, dz); top.rotation.y = ry;
      const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.85), deskMat);
      l1.position.set(dx - 0.8, chemFloorY + 0.38, dz); l1.rotation.y = ry;
      const l2 = l1.clone(); l2.position.x = dx + 0.8;
      group.add(top, l1, l2);
      colliders.push({ minX: dx - 0.9, maxX: dx + 0.9, minZ: dz - 0.5, maxZ: dz + 0.5, y0: chemFloorY, h: 0.8, prop: true });
    }
  }
  // courtyard: generator + switch, fire barrel, sandbags
  // Offset laterally from the power switch at (-4, -27.6) rather than sitting
  // squarely in front of it. The switch is meant to read as belonging to this
  // generator, but at dead centre the 2.2m hull hid the knife blades and the
  // enamel plate completely from the courtyard approach — you walked up to a
  // machine you could not see.
  bigGenerator(-7.2, -26);
  barrel(7.5, -39.5, true);
  sandbags(-14, -34, 3, Math.PI / 2);
  // factory: machines, crates, catwalk, chains, pipes
  machine(-10, -46); machine(10, -46); machine(0, -58, Math.PI / 2); machine(-6, -54, 0.3);
  crate(-12, -43.5, 1.1); crate(11.5, -60.5, 1); barrel(-12.5, -60.5, true); sandbags(6, -43.4, 3);
  {
    // catwalk across the hall (visual landmark, like the original bridge)
    const cwY = FACTORY_CATWALK.y, cwZ = (FACTORY_CATWALK.minZ + FACTORY_CATWALK.maxZ) / 2;
    const cwWidth = FACTORY_CATWALK.maxX - FACTORY_CATWALK.minX;
    const cwCenterX = (FACTORY_CATWALK.minX + FACTORY_CATWALK.maxX) / 2;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(cwWidth, 0.12, FACTORY_CATWALK.maxZ - FACTORY_CATWALK.minZ), matPlate);
    deck.position.set(cwCenterX, cwY, cwZ); deck.castShadow = true; deck.receiveShadow = true;
    group.add(deck);
    // The long edges are a KNEE-HIGH trip rail, not a handrail. A jump clears
    // CFG.JUMP_VEL^2 / 2*GRAVITY = 0.78m of feet travel, so at the old
    // chest-high 1.05m the rail read as a wall you were being asked to hop —
    // the vault colliders below let you through, but nothing you could see
    // said you were allowed to. RAIL_TOP sits comfortably under the apex so
    // the geometry itself tells you the sides are an exit.
    const RAIL_TOP = 0.6;
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(cwWidth, 0.05, 0.05), matMetal.clone());
      rail.position.set(cwCenterX, cwY + RAIL_TOP, cwZ + side * 1.05);
      const railMid = rail.clone(); railMid.position.y = cwY + 0.26;
      group.add(rail, railMid);
      for (let i = FACTORY_CATWALK.minX + 0.4; i <= FACTORY_CATWALK.maxX - 0.4; i += 2.4) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, RAIL_TOP, 0.05), matMetal.clone());
        post.position.set(i, cwY + RAIL_TOP / 2, cwZ + side * 1.05);
        group.add(post);
      }
    }
    // Support columns. The westmost used to stand at x=-8, which is only 0.4m
    // past the stair landing: its collider top is the deck height, so it went
    // inert only once your feet were already above 3.1m, and the last 12cm of
    // the ramp (x -8.55..-8.43) is still below that. Walking up the middle of
    // the flight you hit an invisible post one step from the top and had to
    // jump to finish the climb. Keep the columns clear of the stair approach.
    for (const px of [-7, 0, 8]) {
      const col2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, cwY, 0.35), matMetal.clone());
      col2.position.set(px, cwY / 2, cwZ);
      group.add(col2);
      // The columns holding the catwalk up are real posts on the factory
      // floor, not scenery to walk through. The collider stops just under the
      // deck so standing on the deck can never re-activate it on a rounding
      // error — the mesh still meets the underside.
      colliders.push({
        minX: px - 0.2, maxX: px + 0.2,
        minZ: cwZ - 0.2, maxZ: cwZ + 0.2,
        y0: 0, h: cwY - 0.06, prop: true,
      });
    }
    // stair flight up to the catwalk (west end) — wide, clear runway
    // Treads span the catwalkStairs ramp exactly: 9 steps from x -12.6 to -8.4
    // (4.2m) rising 3.1m. Keep these in step with the ramp in map-layout.js —
    // the ramp is what the player actually walks on, these are what they see.
    const STEP_N = 9, STEP_W = 4.2 / STEP_N, STEP_H = 3.1 / STEP_N;
    for (let i = 0; i < STEP_N; i++) {
      pushBox(solidGeos.plate, -12.6 + STEP_W * (i + 0.5), STEP_H * (i + 0.5), cwZ, STEP_W, STEP_H, 2.6);
    }
    // Close the flight's two long sides. The steps themselves are only visual
    // geometry — height comes from the `catwalkStairs` ramp in floorY, and that
    // ramp accepts anyone standing within 1.6m of the tread. So without these,
    // walking at the STAIRCASE SIDE from the factory floor silently lifted you
    // up to three metres onto the middle of the flight, straight through the
    // stringer. No high-end wall: this flight tops out onto the catwalk deck,
    // and the floor under that deck is real factory floor you walk through.
    encloseStairFlight({
      xLow: -12.6, xHigh: -8.4, zMin: cwZ - 1.3, zMax: cwZ + 1.3,
      yTop: FACTORY_CATWALK.y, steps: STEP_N,
    });
    // Catwalk gates. The two long edges are vault colliders: solid to anyone
    // standing on the deck (and to zombies, which never check the flag — they
    // still have to take the stairs), inert the instant you leave the ground.
    // That is the whole escape route off this deck, so the sides carry NO
    // second always-on collider — one used to sit here alongside them and it
    // quietly made the rail unjumpable in both directions.
    //
    // The heights match the meshes above so the collision agrees with what the
    // player is looking at.
    colliders.push({ minX: FACTORY_CATWALK.minX, maxX: FACTORY_CATWALK.maxX, minZ: cwZ - 1.18, maxZ: cwZ - 1.02, y0: 3.1, h: RAIL_TOP, prop: true, vault: true, keepClearExempt: true });
    colliders.push({ minX: FACTORY_CATWALK.minX, maxX: FACTORY_CATWALK.maxX, minZ: cwZ + 1.02, maxZ: cwZ + 1.18, y0: 3.1, h: RAIL_TOP, prop: true, vault: true, keepClearExempt: true });
    // The east end is the opposite: a hard backstop. Past x=12 the deck simply
    // stops, with a two-metre drop to the factory floor before the east wall —
    // and this is the corner you retreat into when the box lands up here, so
    // backing into it while shooting must never dump you off the edge. No
    // `vault`, and tall enough (top 4.2m) that the collider is still active at
    // the 0.78m apex of a jump, so it cannot be cleared from the deck either.
    colliders.push({ minX: 11.9, maxX: 12.06, minZ: cwZ - 1.1, maxZ: cwZ + 1.1, y0: 3.1, h: 1.1, prop: true, keepClearExempt: true });
    {
      // …and it needs to be VISIBLE, or it is an invisible wall. A solid plate
      // panel, chest high — deliberately taller than the knee-high side rails,
      // so one look tells you which edges you may leave by and which you can
      // plant your back against.
      const gate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.06, 2.2), matPlate);
      gate.position.set(11.95, cwY + 0.53, cwZ);
      gate.castShadow = true; gate.receiveShadow = true;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 2.24), matMetal.clone());
      cap.position.set(11.95, cwY + 1.09, cwZ);
      group.add(gate, cap);
      for (const side of [-1, 1]) {
        const stile = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.12, 0.1), matMetal.clone());
        stile.position.set(11.95, cwY + 0.56, cwZ + side * 1.05);
        group.add(stile);
      }
    }
    // hanging chains + hooks
    const chainMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.8 });
    for (const [cx, cz, len] of [[-5, -48, 1.6], [4, -50, 2.2], [-2, -56, 1.2], [7, -58, 1.9], [-8, -55, 1.5]]) {
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 5), chainMat);
      chain.position.set(cx, HH - len / 2, cz);
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 10, Math.PI * 1.4), chainMat);
      hook.position.set(cx, HH - len - 0.08, cz);
      hook.rotation.z = Math.PI * 0.8;
      group.add(chain, hook);
    }
    // wall pipes + valves
    const pipeMat = matMetal.clone();
    for (const px of [-13.6, 13.6]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 16, 8), pipeMat);
      pipe.rotation.x = Math.PI / 2; pipe.position.set(px, 3.4, -52);
      group.add(pipe);
      for (const vz of [-48, -56]) {
        const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 8), pipeMat);
        drop.position.set(px, 2.1, vz);
        const valve = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 12), new THREE.MeshStandardMaterial({ color: 0x7a2020, roughness: 0.5, metalness: 0.4 }));
        valve.position.set(px + (px < 0 ? 0.14 : -0.14), 1.6, vz);
        valve.rotation.y = Math.PI / 2;
        group.add(drop, valve);
      }
    }
    // roof beams
    for (let i = 0; i < 4; i++) pushBox(solidGeos.metal, 0, HH - 0.5, -45 - i * 5, 27.5, 0.3, 0.5);
  }

  // ---------- telephone poles + sagging wires (exterior silhouettes) ----------
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x241a10, roughness: 1 });
  const wireMat = new THREE.LineBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.9 });
  const poleTops = [];
  // Keep utility silhouettes deeper in the map; the two poles immediately
  // behind the spawn platform were visual clutter in the player's first view.
  const poleDefs = [[-20, -3.5], [20, -3.5], [-19, -33], [13, -44.5]];
  for (const [px, pz] of poleDefs) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 7.5, 7), poleMat);
    pole.position.set(px, 3.75, pz);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.08), poleMat);
    cross.position.set(px, 6.9, pz);
    group.add(pole, cross);
    poleTops.push([px, 6.9, pz]);
  }
  for (const [a, b] of [[0, 1], [0, 2], [1, 3]]) {
    const [x1, y1, z1] = poleTops[a], [x2, y2, z2] = poleTops[b];
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector3(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t - Math.sin(t * Math.PI) * 0.9, z1 + (z2 - z1) * t));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
    const pts2 = pts.map((p) => new THREE.Vector3(p.x + 0.25, p.y - 0.15, p.z));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), wireMat));
  }
  // sagging wires across the mainframe courtyard
  for (const [wz, sag] of [[17, 0.7], [21, 0.9], [24.5, 0.6]]) {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      pts.push(new THREE.Vector3(-10 + 20 * t, H + 0.4 - Math.sin(t * Math.PI) * sag, wz + Math.sin(t * Math.PI) * 0.3));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
  }
  // wires across the factory courtyard
  for (const [wz, sag] of [[-26, 0.8], [-33, 0.65], [-39, 0.9]]) {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      pts.push(new THREE.Vector3(-16 + 26 * t, H + 1.2 - Math.sin(t * Math.PI) * sag, wz + Math.sin(t * Math.PI) * 0.4));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
  }

  // ---------- old blood on the floor ----------
  // Dried, not fresh: the same splat texture and the same near-black maroon the
  // FX pool stamps when something bleeds (js/fx.js `blood`), so the map's
  // standing blood and a kill from ten seconds ago are the same substance. The
  // CC0 Quaternius blood models used to sit here, but they were lit, glossy and
  // bright red, and read as a different fluid entirely from the fx decals
  // landing beside them.
  {
    const bloodSpots = [
      [0, 19, 1.4], [-6, 16, 1.0], [-10, 2, 1.5], [10, 5, 1.1],
      [-22, -13, 1.2], [17, -30, 1.6], [-4, -30, 1.0], [0, -50, 1.4],
      [22, -12, 1.2], [-38, -12, 1.0], [8, -14, 0.9],
    ];
    // A handful of shapes so eleven pools aren't eleven copies of one blot.
    const splats = [splatTexture(0), splatTexture(1), splatTexture(2), splatTexture(3)];
    const quad = new THREE.PlaneGeometry(1, 1);
    for (const [bx, bz, bs] of bloodSpots) {
      const m = new THREE.Mesh(quad, new THREE.MeshBasicMaterial({
        map: choice(splats), color: BLOOD_DECAL_COLOR, transparent: true, opacity: 0.92,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      }));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rand(Math.PI * 2);
      m.position.set(bx, 0.018, bz);
      m.scale.setScalar(bs);
      m.renderOrder = 1;
      group.add(m);
    }
  }
}
