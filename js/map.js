// Map: night-time factory complex. Layout & landmarks inspired by classic
// wave-survival factory maps; all textures CC0, all geometry built in code.
// buildMap() builds it from the sections in js/map/, in order, then runs it.
import * as THREE from 'three';
import { concreteTexture, brickTexture, metalTexture, woodTexture, textTexture, makeBox, rand } from './utils.js';
import { Sky } from './render/Sky.js';
import { SunShadow } from './render/SunShadow.js';
import { decorateMap } from './map-props.js';
import { attachShotCover } from './shot-cover.js';
import { buildPerkMachine } from './props/perkMachine.js';
import { buildMysteryBox } from './props/mysteryBox.js';
import { buildPackAPunch, buildPapSignFrame } from './props/packAPunch.js';
import { signTexture as papSignTexture } from './props/materials.js';
import { buildTeleporter } from './props/teleporter.js';
import { buildPowerSwitch } from './props/powerSwitch.js';
import { buildWallBuy } from './props/wallbuy.js';
import { WEAPONS } from './weapons.js';
import { CFG } from './config.js';
import { buildDoorLeaf, buildDoorFrame, buildDoorLamp } from './props/door.js';
import { navInvalidate } from './navmesh.js';
import {
  MAP_DOOR_DEFS, MAP_RAMPS, MAP_NAV_LINKS,
  MAP_WALLBUYS, MAP_PERKS, MAP_TELEPORTERS, MAINFRAME_PLATFORM, MAINFRAME_STEPS,
  MAINFRAME_EAST_ENTRY_KEEP_CLEAR, MAP_TRAVERSAL_ZONES, FACTORY_CATWALK, PAP_ENERGY_VISUAL,
  INITIAL_MYSTERY_BOX, stairFlightColliders, auditInteractableApproaches, auditKeepClearZone,
  auditMapEgress,
} from './map-layout.js';
import { buildSurfaces, mergeSolidGeometry } from './map/surfaces.js';
import { buildShell } from './map/shell.js';
import { placeProps } from './map/hand-placed.js';

// ---------------------------------------------------------------------------
// Art direction. One place to tune the whole look: the post stack reads this
// verbatim, so grading, fog and bloom stay consistent with the map's lighting.
// Moonlit industrial: cold cyan shadow, warm sodium practicals, heavy haze.
// ---------------------------------------------------------------------------
// Moon placement is shared by the sky shader, the key light and the post
// stack's in-scatter direction; one constant keeps all three in agreement.
export const MOON_DIR = new THREE.Vector3(0.46, 0.60, -0.65).normalize();

export const GRADE = {
  exposure: 2.45,
  bloomStrength: 0.55,
  bloomThreshold: 1.15,
  saturation: 1.10,
  contrast: 1.075,
  // Blacks are lifted, not crushed. AgX rolls the bottom end off hard, and
  // with the power off the factory interior went genuinely unnavigable — you
  // could not see a wall until it hit you. This keeps the night reading as
  // night while leaving enough separation to move through a dark room.
  lift: new THREE.Vector3(0.030, 0.040, 0.062),
  gamma: new THREE.Vector3(1.0, 1.0, 1.0),
  gain: new THREE.Vector3(1.045, 1.0, 0.955),     // sodium-warm highlights
  volDensity: 0.0125,
  volHeightFalloff: 0.14,
  volFogBase: -0.5,
  volAnisotropy: 0.76,
  volAmbient: 0.16,
  volAmbientColor: new THREE.Color(0x24344f),
};

export function buildMap(scene, opts = {}) {
  const group = new THREE.Group();
  const colliders = [];   // {minX,maxX,minZ,maxZ,y0,h,window?,shootOk?}
  // Assigned at the end of this builder. openDoor() and moveBox() run long after
  // that, and both need the map object itself to invalidate enemy navigation.
  let api;
  const barriers = [];
  const risers = [];
  const doors = [];
  const interact = [];
  const flickerLights = [];
  const fires = [];

  const {
    pbr, matFloor, matWall, matBrick, matMetal, matPlate, matWood, matDirt, matDark, matConcrete, matCeiling,
    solidGeos, shotPieces, pushBox,
  } = buildSurfaces();
  const { rooms, roomAt, H, HH } = buildShell({ group, colliders, barriers, solidGeos, pushBox, matWood, matDirt, matFloor });

  // ---------- elevation: floor zones + ramps ----------
  const floorZones = [
    MAINFRAME_PLATFORM,                                         // mainframe platform (clear of both 750 doors at x=±8)
    ...MAINFRAME_STEPS,                                         // individually walkable/jumpable spawn steps
    { minX: -14, maxX: -6, minZ: -22, maxZ: -8, y: 2.9, holes: [{ minX: -13.2, maxX: -8.8, minZ: -13.2, maxZ: -10.8 }] },      // lab balcony (stairwell hole)
    { minX: 6, maxX: 14, minZ: -22, maxZ: -8, y: 2.9, holes: [{ minX: 8.8, maxX: 13.2, minZ: -13.2, maxZ: -10.8 }] },        // garage balcony (stairwell hole)
    { minX: 10, maxX: 24, minZ: -38, maxZ: -22, y: 2.9 },      // chem testing
    { minX: -6, maxX: 6, minZ: -13, maxZ: -11, y: 2.9 },       // bridge
    FACTORY_CATWALK,                                            // factory catwalk begins at the stair landing
  ];
  const ramps = MAP_RAMPS;
  function floorY(x, z, curY = 0, tol = 1.6) {
    let y = 0;
    for (const r of ramps) {
      if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
      const tt = r.axis === 'x' ? (r.dir > 0 ? (x - r.minX) / (r.maxX - r.minX) : (r.maxX - x) / (r.maxX - r.minX))
                                : (r.dir > 0 ? (z - r.minZ) / (r.maxZ - r.minZ) : (r.maxZ - z) / (r.maxZ - r.minZ));
      const ry = r.y0 + (r.y1 - r.y0) * Math.min(1, Math.max(0, tt));
      if (ry > y && curY >= ry - tol) y = ry;
    }
    for (const zn of floorZones) {
      if (x < zn.minX || x > zn.maxX || z < zn.minZ || z > zn.maxZ) continue;
      if (zn.holes) {
        let inHole = false;
        for (const h of zn.holes) if (x >= h.minX && x <= h.maxX && z >= h.minZ && z <= h.maxZ) { inHole = true; break; }
        if (inHole) continue;
      }
      if (zn.y > y && curY >= zn.y - tol) y = zn.y;
    }
    return y;
  }

  // ---------- elevated floors: balcony slabs (stairwell holes), chem, bridge ----
  const slabHole = (x0, x1, z0, z1, hx0, hx1, hz0, hz1, y) => {
    pushBox(solidGeos.plate, (x0 + hx0) / 2, y, (z0 + z1) / 2, hx0 - x0, 0.25, z1 - z0);
    pushBox(solidGeos.plate, (hx1 + x1) / 2, y, (z0 + z1) / 2, x1 - hx1, 0.25, z1 - z0);
    pushBox(solidGeos.plate, (hx0 + hx1) / 2, y, (z0 + hz0) / 2, hx1 - hx0, 0.25, hz0 - z0);
    pushBox(solidGeos.plate, (hx0 + hx1) / 2, y, (hz1 + z1) / 2, hx1 - hx0, 0.25, z1 - hz1);
  };
  slabHole(-14, -6, -22, -8, -13.2, -8.8, -13.2, -10.8, 2.775);   // lab balcony
  slabHole(6, 14, -22, -8, 8.8, 13.2, -13.2, -10.8, 2.775);       // garage balcony
  pushBox(solidGeos.plate, 17, 2.775, -30, 14, 0.25, 16);          // chem testing floor
  pushBox(solidGeos.plate, 0, 2.775, -12, 12, 0.25, 2.2);          // bridge deck
  colliders.push({ minX: -6, maxX: 6, minZ: -13, maxZ: -11, y0: 2.65, h: 0.25, prop: true }); // bridge underside
  // The bridge is now a true upper connector. Continuous rails close the old
  // fall-through mouths into the purposeless underbridge pocket; players enter
  // through the two deliberate balcony doors at its east and west ends.
  {
    const railMat = matMetal.clone();
    for (const rz of [-12.95, -11.05]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(12, 0.05, 0.05), railMat);
      rail.position.set(0, 3.85, rz);
      const railMid = rail.clone(); railMid.position.y = 3.4;
      group.add(rail, railMid);
      colliders.push({
        minX: -6, maxX: 6,
        minZ: rz - 0.08, maxZ: rz + 0.08,
        y0: 2.9, h: 1.1, prop: true,
      });
      for (const x of [-5.8, -3.7, -1.25, 1.25, 3.7, 5.8]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.95, 0.05), railMat);
        post.position.set(x, 3.4, rz);
        group.add(post);
      }
    }
  }
  // mainframe platform steps (visual) + the actual raised platform deck
  // (narrower than the wall span: the two 750 doorways at x=±8 stay at ground level)
  pushBox(solidGeos.concrete, 0, 0.45, 16.25, 12, 0.9, 4.5);    // the spawn platform (visible!)
  pushBox(solidGeos.concrete, 0, 0.3, 19.2, 12, 0.6, 1.1);
  pushBox(solidGeos.concrete, 0, 0.15, 20.4, 12, 0.3, 1.1);
  // Step nosings. Each riser faces south, away from the moon, so it renders at
  // roughly half the luminance of the treads either side of it (measured 31 vs
  // 65). Three of those, each spanning the full 12m and perfectly straight,
  // stack up into what reads as black bars painted across the screen rather
  // than as steps — this is the first thing every player sees at spawn.
  //
  // A nosing lip fixes it the way real architecture does: the lip's top face
  // is UPWARD, so it catches the sky and draws a bright line along each step
  // edge, breaking the dark band and giving the eye the cue that this is a
  // stair. Purely visual — the colliders and floorY ramp are untouched.
  //
  // The lip stands 4mm PROUD of the tread. Flush with it, its top face and the
  // concrete's top face were the same plane over 12m x 0.16m, and the depth
  // buffer picked a winner per pixel per frame — so the nosing meant to break
  // up the dark band drew its own hard line across all three steps instead. A
  // real nosing stands proud anyway.
  for (const [ny, nz] of [[0.9, 18.55], [0.6, 18.68], [0.3, 19.79]]) {
    pushBox(solidGeos.plate, 0, ny - 0.021, nz, 12, 0.05, 0.16);
  }
  // The platform sides are intentionally open. floorY() drops a player cleanly
  // to the surrounding courtyard when they run or jump over an edge. One-way
  // fascia colliders still stop a ground-level player walking through the slab.
  // Match each fascia collider to the actual deck/step height. Previously the
  // full stair run inherited the 0.9m deck wall, so only the top stair could
  // be jumped off. Each step now remains solid from ground level while its own
  // ledge can be deliberately jumped or vaulted in either direction.
  for (const [ex0, ez0, ex1, ez1, h, deckTop] of [
    // Tall player-only side volumes keep a lower-tier jump from clearing the
    // collision test at its apex; oneWayDeckTop still releases outward travel
    // for players who actually launched from the 0.9m deck.
    [-6.12, 14, -6, 18.5, 2.2, MAINFRAME_PLATFORM.y],
    [6, 14, 6.12, 18.5, 2.2, MAINFRAME_PLATFORM.y],
    [-6.12, 18.5, -6, 19.75, 0.65],
    [6, 18.5, 6.12, 19.75, 0.65],
  ]) colliders.push({
    minX: ex0, maxX: ex1, minZ: ez0, maxZ: ez1,
    y0: 0, h, playerOnly: true, oneWayPlatformSide: true,
    ...(Number.isFinite(deckTop) ? { oneWayDeckTop: deckTop } : {}),
  });
  // The lowest 0.3m step is deliberately a true step: it has no vertical side
  // collider, so players can run onto it from the front, sides, or diagonals.

  // Close in a stair flight that climbs along X. The geometry itself lives in
  // map-layout.js (Three-free) so scripts/validate-movement-feel.mjs can walk a
  // real player circle up a real flight instead of asserting on source text.
  const encloseStairFlight = (flight) => colliders.push(
    ...stairFlightColliders({ ...flight, playerRadius: CFG.PLAYER_RADIUS }),
  );

  // Balcony flight treads. The movement scaffolding around them is `bulletPass`
  // (see stairFlightColliders) precisely because it is invisible, so the treads
  // have to carry the flight's bullet collision themselves: without this a shot
  // would pass through the visible plates as well as the open air around them.
  // `shootOk` is the bullet-only tier — players, zombies and the navmesh all
  // ignore it, which is right, because the plates are drawn geometry the
  // scaffolding already handles physically.
  const stairTread = (cx, cy) => colliders.push({
    minX: cx - 0.275, maxX: cx + 0.275, minZ: -13.1, maxZ: -10.9,
    y0: cy - 0.18, h: 0.36, shootOk: true,
  });
  for (let i = 0; i < 8; i++) {
    pushBox(solidGeos.plate, -12.9 + i * 0.55, 0.18 + i * 0.35, -12, 0.55, 0.36, 2.2);
    stairTread(-12.9 + i * 0.55, 0.18 + i * 0.35);
  }
  for (let i = 0; i < 8; i++) {
    pushBox(solidGeos.plate, 12.9 - i * 0.55, 0.18 + i * 0.35, -12, 0.55, 0.36, 2.2);
    stairTread(12.9 - i * 0.55, 0.18 + i * 0.35);
  }
  // Both balcony flights sit in a hole in the slab and had no colliders at
  // all: you could walk in from either side or from under the landing and end
  // up inside the staircase. Their treads span x -13.175..-8.775 (mirrored for
  // the garage) and z -13.1..-10.9, climbing 2.9m in 8 steps.
  encloseStairFlight({ xLow: -13.175, xHigh: -8.775, zMin: -13.1, zMax: -10.9, yTop: 2.9, steps: 8, closeHighEnd: true });
  encloseStairFlight({ xLow: 13.175, xHigh: 8.775, zMin: -13.1, zMax: -10.9, yTop: 2.9, steps: 8, closeHighEnd: true });
  // balcony drop ledge trims (reads as an opening you can drop from)
  pushBox(solidGeos.plate, -10, 2.95, -22, 2.2, 0.1, 0.5);
  pushBox(solidGeos.plate, 8, 2.95, -22, 2.2, 0.1, 0.5);
  pushBox(solidGeos.plate, 10, 2.95, -30, 0.5, 0.1, 2.4); // Chemical Testing -> courtyard escape

  // ---------- doors ----------
  const doorDefs = MAP_DOOR_DEFS;
  for (const dd of doorDefs) {
    const w = dd.w || 1.9;
    const dy = dd.y || 0; // elevated doors sit on their floor, not at ground level
    const isHoriz = !dd.vert;
    // Riveted steel blast door in a channel-iron jamb (js/props/door.js): a
    // chained, padlocked leaf with a barred vision slit and an enamel cost
    // plate on both faces. Deliberately non-neon so the factory stays a factory.
    const mesh = buildDoorLeaf(w, dd.cost);
    if (!isHoriz) mesh.rotation.y = Math.PI / 2;
    mesh.position.set(dd.x, dy + 1.5, dd.z);
    const frame = buildDoorFrame(w, isHoriz);
    frame.position.set(dd.x, dy, dd.z);
    group.add(frame);
    const doorLamp = buildDoorLamp();
    doorLamp.group.position.set(dd.x, dy + 2.80, dd.z);
    if (!isHoriz) doorLamp.group.rotation.y = Math.PI / 2;
    group.add(doorLamp.group);
    const practical = new THREE.PointLight(0xe0ae67, 0.42, 4.2, 2);
    practical.position.set(dd.x, dy + 2.74, dd.z);
    group.add(practical);
    group.add(mesh);
    const col = { minX: dd.x - (isHoriz ? w / 2 : 0.12), maxX: dd.x + (isHoriz ? w / 2 : 0.12), minZ: dd.z - (isHoriz ? 0.12 : w / 2), maxZ: dd.z + (isHoriz ? 0.12 : w / 2), y0: dy, h: 3, door: dd.id };
    const door = { ...dd, open: false, mesh, collider: col, animT: 0, baseY: dy + 1.5 };
    if (dd.preOpen) {
      door.open = true; door.animT = 1; mesh.visible = false; // open balcony drops
    } else {
      colliders.push(col);
      if (dd.auto) {
        // power-sealed door: hazard bolt marker, opens with the power switch
        const hzTex = textTexture('⚡', { w: 128, h: 64, bg: '#171412', fg: '#ffd24a', font: 'bold 40px Georgia, serif' });
        for (const s of [0, Math.PI]) {
          const hz = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: hzTex, transparent: true }));
          hz.position.set(dd.x + (isHoriz ? 0 : 0.11), dy + 3.3, dd.z + (isHoriz ? 0.11 : 0));
          hz.rotation.y = s + (isHoriz ? 0 : Math.PI / 2);
          group.add(hz);
        }
      } else {
        interact.push({ id: dd.id, kind: 'door', pos: { x: dd.x, y: dy + 1.4, z: dd.z }, radius: 2.4, door });
      }
    }
    doors.push(door);
  }

  // ---------- navigation (doors + stair/drop nav links) ----------
  // stair links work both ways; drop links are one-way (ledge drops)
  const navLinks = MAP_NAV_LINKS;
  const egressAudit = auditMapEgress({ rooms, doors: doorDefs, navLinks, ramps });
  if (!egressAudit.ok) throw new Error(`Map egress invariant failed: ${egressAudit.issues.join('; ')}`);
  function findPath(fromRoom, toRoom) {
    if (fromRoom === toRoom) return [];
    const edges = [];
    for (const d of doors) {
      if (!d.open) continue;
      edges.push({ a: d.rooms[0], b: d.rooms[1], x: d.x, z: d.z });
      edges.push({ a: d.rooms[1], b: d.rooms[0], x: d.x, z: d.z });
    }
    for (const l of navLinks) edges.push({ a: l.from, b: l.to, x: l.x, z: l.z });
    const prev = new Map([[fromRoom, null]]);
    const q = [fromRoom];
    while (q.length) {
      const cur = q.shift();
      if (cur === toRoom) break;
      for (const e of edges) {
        if (e.a !== cur) continue;
        if (!prev.has(e.b)) { prev.set(e.b, e); q.push(e.b); }
      }
    }
    if (!prev.has(toRoom)) return null;
    const path = [];
    let cur = toRoom;
    while (cur !== fromRoom) {
      const e = prev.get(cur);
      path.unshift({ x: e.x, z: e.z, door: e.door });
      cur = e.a;
    }
    return path;
  }

  placeProps({ group, colliders, fires, solidGeos, pushBox, pbr, matMetal, matPlate, matDark, matWood, encloseStairFlight, H, HH });

  // ---------- wall buys (authentic placements & prices) ----------
  const wallbuys = [];
  function wallbuy(x, y, z, nx, nz, weapon, price) {
    // Chalked straight onto the brick, on a lit surface (js/props/wallbuy.js) —
    // it takes the sodium light and dies with the power instead of floating.
    // Label from the weapon's REAL display name, not its internal id. The id is
    // an abbreviation ("kar98", "trench", "dbshotgun") and uppercasing it chalked
    // "KAR98" on the wall for a Kar98k, and "TRENCH" for an M1897 Trench Gun.
    const m = buildWallBuy(weapon, price, (WEAPONS[weapon]?.name || weapon).toUpperCase());
    m.position.set(x + nx * 0.05, y + 1.55, z + nz * 0.05);
    m.lookAt(x + nx * 3, y + 1.55, z + nz * 3);
    group.add(m);
    const wb = { id: 'wb_' + weapon, weapon, price, pos: { x, y: y + 1.4, z } };
    wallbuys.push(wb);
    interact.push({ id: wb.id, kind: 'wallbuy', pos: wb.pos, radius: 2.2, wb });
  }
  for (const wb of MAP_WALLBUYS) wallbuy(wb.x, wb.y || 0, wb.z, wb.nx, wb.nz, wb.weapon, wb.price);

  // ---------- perk machines ----------
  // Period enamelled-steel dispensers (js/props/perkMachine.js): chipped paint,
  // a backlit marquee, real bottles behind a dirty pane, coin mech and tray.
  const perks = [];
  const perkDefs = MAP_PERKS;
  for (const pd of perkDefs) {
    // Solo Quick Revive is charged at 500 (game.js), so the cabinet has to say
    // 500 too — otherwise the marquee argues with the prompt in front of it.
    const displayPrice = (pd.id === 'qr' && opts.mode === 'solo') ? 500 : pd.price;
    const machine = buildPerkMachine(pd, { displayPrice });
    const g = machine.group;
    const lamp = machine.lamp;
    g.position.set(pd.x, 0, pd.z);
    g.rotation.y = pd.ry;
    group.add(g);
    const perk = { ...pd, group: g, lamp, panel: machine.panel, machine, jingleId: 'jingle_' + pd.id };
    perks.push(perk);
    colliders.push({ minX: pd.x - 0.6, maxX: pd.x + 0.6, minZ: pd.z - 0.5, maxZ: pd.z + 0.5, y0: 0, h: 2.4, prop: true });
    interact.push({ id: 'perk_' + pd.id, kind: 'perk', pos: { x: pd.x, y: 1.2, z: pd.z }, radius: 2.2, perk });
  }

  // ---------- power switch (behind the courtyard generator) ----------
  // Open-blade knife switch on a slate panel (js/props/powerSwitch.js). The
  // blade assembly keeps the old lever's pivot, so the reach target and the
  // cinematic throw animation are unchanged.
  const powerProp = buildPowerSwitch();
  const powerGroup = powerProp.group;
  const lever = powerProp.lever;
  powerGroup.position.set(-4, 0, -27.6);
  group.add(powerGroup);
  const power = { pos: { x: -4, y: 1.4, z: -27.6 }, on: false, lever, group: powerGroup };
  interact.push({ id: 'power', kind: 'power', pos: power.pos, radius: 2.6, power });

  // ---------- teleporters ----------
  const teleporters = [];
  for (const td of MAP_TELEPORTERS) {
    // Electromagnetic apparatus (js/props/teleporter.js): bolted collar with
    // hazard striping, a grated deck, coil-wound I-beam columns and cabling.
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x223344, emissive: 0x3366aa, emissiveIntensity: 0.15, roughness: 0.4, metalness: 0.6 });
    const g = buildTeleporter(td, ringMat).group;
    g.position.set(td.x, td.y, td.z);
    group.add(g);
    const tele = {
      ...td, group: g, ringMat, linked: false, charging: false, cooldown: 0,
      pos: { x: td.x, y: td.y + 1, z: td.z },
    };
    teleporters.push(tele);
    interact.push({ id: td.id, kind: 'tele', pos: tele.pos, radius: 1.9, tele });
  }
  // Mainframe teleport destination. Keep only the unmistakable destination
  // pad: the former blocky green machine bank looked like an unexplained box
  // and needlessly occupied the spawn platform.
  const mf = new THREE.Group();
  const mfPad = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.1, 24), matMetal.clone());
  mfPad.position.set(0, 0.95, 17.5);
  mf.add(mfPad);
  group.add(mf);
  const mainframe = { x: 0, z: 17.5 };

  // ---------- pack-a-punch (at the mainframe, like the original) ----------
  const papG = new THREE.Group();
  // Cast-iron cabinet, riveted columns, brass gear, vacuum tubes and a caged
  // intake collar (js/props/packAPunch.js). The collar projects forward of the
  // face so the containment field lives inside a mouth behind bars.
  const papMachine = buildPackAPunch();
  const papBody = papMachine.group;
  // Containment haze filling the intake collar around the field. Its emissive
  // is the machine's state read-out, driven by the tick below.
  const papSlot = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.56, 0.22), new THREE.MeshStandardMaterial({
    color: 0x09060e, emissive: 0x6644aa, emissiveIntensity: 0.5,
    transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide,
  }));
  papSlot.position.set(0, 1.0, 0.5);
  // Lightweight dark-matter/electric field: low-poly meshes and static line
  // buffers animated in the existing map tick (no post-processing or shaders).
  const papEnergy = new THREE.Group();
  papEnergy.position.set(0, PAP_ENERGY_VISUAL.centerY, PAP_ENERGY_VISUAL.centerZ);
  const papCoreMat = new THREE.MeshStandardMaterial({ color: 0x07030d, emissive: 0x6e22aa, emissiveIntensity: 1.35, roughness: 0.18, metalness: 0.5 });
  const papCore = new THREE.Mesh(new THREE.SphereGeometry(PAP_ENERGY_VISUAL.coreRadius, 12, 8), papCoreMat);
  papCore.position.z = PAP_ENERGY_VISUAL.coreOffsetZ;
  papEnergy.add(papCore);
  const papRingMat = new THREE.MeshBasicMaterial({ color: 0xb76cff, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 2; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(PAP_ENERGY_VISUAL.ringRadii[i], PAP_ENERGY_VISUAL.ringTube, PAP_ENERGY_VISUAL.tubeSegments, PAP_ENERGY_VISUAL.ringSegments), papRingMat.clone());
    ring.rotation.set(i ? Math.PI / 2 : 0.35, i ? 0.4 : Math.PI / 2, 0);
    papEnergy.add(ring);
  }
  const papArcMat = new THREE.LineBasicMaterial({ color: 0x82c8ff, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let arc = 0; arc < PAP_ENERGY_VISUAL.arcCount; arc++) {
    const points = [];
    for (let i = 0; i < PAP_ENERGY_VISUAL.arcPoints; i++) {
      const t = i / (PAP_ENERGY_VISUAL.arcPoints - 1);
      points.push(new THREE.Vector3(
        -PAP_ENERGY_VISUAL.boltHalfWidth + t * PAP_ENERGY_VISUAL.boltHalfWidth * 2,
        Math.sin((t + arc * 0.17) * Math.PI * 3) * 0.04,
        PAP_ENERGY_VISUAL.boltDepth + (i % 2 ? 0.018 : -0.018) + arc * 0.006,
      ));
    }
    const bolt = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), papArcMat.clone());
    bolt.rotation.z = arc * Math.PI / PAP_ENERGY_VISUAL.arcCount;
    papEnergy.add(bolt);
  }
  // Enamel wall plate in a bracketed steel housing, not a floating decal.
  const papSignTex = papSignTexture('PACK-A-PUNCH');
  const papSignMat = new THREE.MeshStandardMaterial({
    map: papSignTex, emissiveMap: papSignTex, emissive: 0xffffff, emissiveIntensity: 0.42,
    color: 0x0d0c10, roughness: 0.46, metalness: 0.0,
  });
  const papSign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.4), papSignMat);
  papSign.position.set(0, 2.1, 0.5);
  const papSignFrame = buildPapSignFrame(2.2, 0.4);
  papSignFrame.position.set(0, 2.1, 0.49);
  // Field spill out of the intake mouth. It sits inside the collar so the light
  // reads as coming from the containment, not from a lamp bolted to the front.
  const papLamp = new THREE.PointLight(0x8a5cff, 18, 5.5, 2);
  papLamp.position.set(0, 1.0, 0.62);
  papG.add(papBody, papSlot, papEnergy, papSign, papSignFrame, papLamp);
  papG.position.set(4, 0.9, 14.7);
  group.add(papG);
  colliders.push({ minX: 3.1, maxX: 4.9, minZ: 14.25, maxZ: 15.15, y0: 0.9, h: 1.7, prop: true });
  const pap = {
    pos: { x: 4, y: 2.1, z: 14.7 }, slot: papSlot,
    energy: papEnergy, coreMat: papCoreMat, lamp: papLamp, machine: papMachine,
    busy: false, processing: false, ready: false,
  };
  interact.push({ id: 'pap', kind: 'pap', pos: pap.pos, radius: 2.6, pap });

  // ---------- mystery box (initial spawn: courtyard, in front of the generator) ----------
  const boxLocations = [
    { ...INITIAL_MYSTERY_BOX },    // courtyard (initial)
    { x: 28, z: -8 },             // automobile garage, near the furnace
    { x: 20.5, z: -25, y: 2.9 },  // chemical testing
    { x: -19, z: -18.7 },         // animal lab, across from the trench gun
    { x: -10, z: -19, y: 2.9 },   // lab balcony
    { x: 11, z: -52, y: 3.1 },    // main factory, end of the catwalk
  ];
  // Banded shipping crate + volumetric beacon (js/props/mysteryBox.js). The lid
  // pivots on its real hinge line at the back top edge.
  const boxProp = buildMysteryBox();
  const boxG = boxProp.group;
  const boxLid = boxProp.lid;
  boxG.position.set(boxLocations[0].x, boxLocations[0].y || 0, boxLocations[0].z);
  group.add(boxG);
  // baseYaw is set from the room below, once roomAt/rooms exist (see boxYawAt).
  const box = { group: boxG, lid: boxLid, locations: boxLocations, locIdx: 0, baseYaw: 0, pos: { x: boxLocations[0].x, y: 0.9 + (boxLocations[0].y || 0), z: boxLocations[0].z }, state: 'idle', uses: 0, currentWeapon: null, spinT: 0, takeT: 0 };
  interact.push({ id: 'box', kind: 'box', pos: box.pos, radius: 2.2, box });
  colliders.push({
    minX: boxLocations[0].x - 0.75, maxX: boxLocations[0].x + 0.75,
    minZ: boxLocations[0].z - 0.45, maxZ: boxLocations[0].z + 0.45,
    y0: boxLocations[0].y || 0, h: 0.9, prop: true, boxCollider: true,
  });

  // ---------- traps (electro-shock defenses at the debris chokepoints) ----------
  const traps = [];
  for (const [tx, tz, px] of [[-14, -12, -12.6], [14, -12, 15.4]]) {
    const post1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.6, 0.25), matMetal.clone());
    post1.position.set(tx, 1.3, tz - 1.1);
    const post2 = post1.clone(); post2.position.z = tz + 1.1;
    group.add(post1, post2);
    const zone = { minX: tx - 1.4, maxX: tx + 1.4, minZ: tz - 1.2, maxZ: tz + 1.2 };
    const trap = { id: 'trap' + tx, zone, x: tx, z: tz, active: false, t: 0, cd: 0, panel: { x: px, y: 1.3, z: tz + 2.5 } };
    traps.push(trap);
    interact.push({ id: trap.id, kind: 'trap', pos: trap.panel, radius: 2.2, trap });
  }

  // ---------- gramophone switch (Beauty of Annihilation easter egg) ----------
  {
    const gg = new THREE.Group();
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.4), matWood.clone());
    stand.position.y = 0.55;
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.28, 0.45, 14), new THREE.MeshStandardMaterial({ color: 0xc8a038, metalness: 0.85, roughness: 0.3 }));
    horn.position.set(0, 1.35, 0); horn.rotation.x = -0.6;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 18), new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.4 }));
    disc.position.y = 1.12;
    const glow = new THREE.PointLight(0xffb050, 7, 5, 1.8);
    glow.position.set(0, 1.5, 0.2);
    gg.add(stand, horn, disc, glow);
    gg.position.set(-6.5, 0, -41.2);
    group.add(gg);
    const songSwitch = { pos: { x: -6.5, y: 1.2, z: -41.2 }, glow, disc };
    interact.push({ id: 'song', kind: 'song', pos: songSwitch.pos, radius: 2.2, songSwitch });
    colliders.push({ minX: -6.8, maxX: -6.2, minZ: -41.5, maxZ: -40.9, y0: 0, h: 1.2, prop: true });
  }

  // ---------- radio (music easter egg) ----------
  const radioMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.25), matWood.clone());
  // Wall-mount it on a clear solid panel. It previously occupied the same
  // footprint as the stacked spawn crates at (8,24).
  radioMesh.position.set(-7.5, 1.05, 25.72);
  group.add(radioMesh);
  interact.push({ id: 'radio', kind: 'radio', pos: { x: -7.5, y: 1.1, z: 25.72 }, radius: 2.0 });

  // ---------- environment art: trim, clutter, practical lighting ----------
  // Solid props (crates, drums, machines, benches, sandbags) register real
  // colliders, so this must run BEFORE the clearance audits below — those are
  // what guarantee the dressing never walls off an interactable or a route.
  // Everything a player must reach or pass through is listed as keep-clear.
  const props = decorateMap(group, {
    materials: {
      metal: matMetal, wood: matWood, plate: matPlate,
      concrete: matConcrete, dark: matDark, brick: matBrick,
    },
    colliders,
    shotPieces,
    // Snapshot of the STRUCTURAL colliders only (walls, doors, platform edges)
    // taken before any prop registers its own. Dressing must prove it is
    // actually against one of these before it is placed, so nothing ends up
    // standing in an open doorway or a corridor mouth.
    wallColliders: colliders.filter((c) => !c.prop && !c.shootOk && (c.h === undefined || c.h > 1.2)).map((c) => ({
      minX: c.minX, maxX: c.maxX, minZ: c.minZ, maxZ: c.maxZ,
    })),
    keepClear: [
      // interactables need a standing approach on every side
      ...interact.map((i) => ({ x: i.pos.x, z: i.pos.z, r: (i.radius || 2) + 1.6 })),
      // doorways must stay walkable
      ...doors.map((d) => ({ x: d.x, z: d.z, r: 3.2 })),
      // window barriers are where zombies enter and players rebuild
      ...barriers.map((b) => ({ x: b.x, z: b.z, r: 2.8 })),
      // ground-spawn risers must stay open
      ...risers.map((r) => ({ x: r.x, z: r.z, r: 2.6 })),
      // wall-buys, perk machines, teleporters and the box need frontage
      ...wallbuys.map((w) => ({ x: w.x, z: w.z, r: 3.0 })),
      ...perks.map((k) => ({ x: k.x, z: k.z, r: 3.2 })),
      ...teleporters.map((t) => ({ x: t.x, z: t.z, r: 3.6 })),
      ...box.locations.map((l) => ({ x: l.x, z: l.z, r: 3.2 })),
      { x: mainframe.x, z: mainframe.z, r: 4.5 },
      { x: pap.x, z: pap.z, r: 4.0 },
      // player spawns
      { x: 0, z: 16, r: 4.5 },
    ],
  });

  // Build-time fail-fast audit over the actual generated colliders and every
  // current interaction position. This catches props that visually exist but
  // leave no legal standing point inside the gameplay use radius.
  const interactionApproachAudit = auditInteractableApproaches({ interactables: interact, colliders, roomAt, floorY });
  if (!interactionApproachAudit.ok) {
    throw new Error(`Interactable clearance invariant failed: ${interactionApproachAudit.issues.join('; ')}`);
  }
  const mainEntranceAudit = auditKeepClearZone(MAINFRAME_EAST_ENTRY_KEEP_CLEAR, colliders);
  if (!mainEntranceAudit.ok) {
    throw new Error(`Mainframe east entrance obstructed by ${mainEntranceAudit.blockers.length} prop collider(s)`);
  }
  // Stairs, their aprons, and the wall openings that are routes. Dressing avoids
  // these at placement time; this is what catches a hand-placed prop, since
  // those never went through the placer's clearance tests at all.
  const blockedRoutes = MAP_TRAVERSAL_ZONES
    .map((zone) => ({ zone, audit: auditKeepClearZone(zone, colliders) }))
    .filter(({ audit }) => !audit.ok);
  if (blockedRoutes.length) {
    throw new Error(`Traversal route obstructed: ${blockedRoutes
      .map(({ zone, audit }) => `${zone.id} (${audit.blockers.length} prop collider(s))`).join('; ')}`);
  }

  // ---------- risers (outdoor ground spawns) ----------
  function riser(x, z, room) {
    // A ground spawn is a broken slab, not a brown sticker. The old unlit
    // MeshBasicMaterial disc ignored every light in the scene and read as a
    // flat decal; this is lit geometry that sits in the world.
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#1b1610'; g.fillRect(0, 0, 256, 256);
    // Radial cracks running out from the centre of the breach.
    g.strokeStyle = '#0a0806'; g.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const a = rand(Math.PI * 2);
      g.lineWidth = rand(1.5, 5);
      g.beginPath(); g.moveTo(128, 128);
      let px = 128, py = 128, ang = a;
      for (let seg = 0; seg < 5; seg++) {
        ang += rand(-0.5, 0.5);
        px += Math.cos(ang) * rand(12, 30); py += Math.sin(ang) * rand(12, 30);
        g.lineTo(px, py);
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(9,7,5,0.85)';
    for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(rand(20, 236), rand(20, 236), rand(3, 16), 0, 7); g.fill(); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;   // a ground decal is always seen at a glancing angle
    const riserMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.98, metalness: 0.0, color: 0x8a8a8a });
    const m = new THREE.Mesh(new THREE.CircleGeometry(1.35, 24), riserMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.022, z);
    m.receiveShadow = true;
    group.add(m);
    // Displaced slab fragments around the rim so it reads in silhouette.
    const chunkMat = matConcrete;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rand(-0.25, 0.25);
      const d = rand(1.0, 1.45);
      const s = rand(0.16, 0.4);
      const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), chunkMat);
      chunk.position.set(x + Math.cos(a) * d, rand(0.03, 0.12), z + Math.sin(a) * d);
      chunk.rotation.set(rand(Math.PI), rand(Math.PI), rand(Math.PI));
      chunk.scale.y = rand(0.35, 0.7);
      chunk.castShadow = true; chunk.receiveShadow = true;
      group.add(chunk);
    }
    risers.push({ x, z, room });
  }
  riser(-3.5, 18, 'mainframe'); riser(3.5, 17.5, 'mainframe');
  riser(-10, -26, 'courtyard'); riser(5, -28, 'courtyard'); riser(-6, -36, 'courtyard'); riser(3, -40, 'courtyard');
  riser(-6, -50, 'factory'); riser(6, -54, 'factory');

  // ---------- atmosphere: drifting ground fog + skylight dust ----------
  const fogPlaneTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(180,195,220,0.045)');
    grad.addColorStop(0.6, 'rgba(160,175,205,0.022)');
    grad.addColorStop(1, 'rgba(150,165,195,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    return t;
  })();
  const fogMat = new THREE.MeshBasicMaterial({ map: fogPlaneTex, transparent: true, depthWrite: false, fog: true });
  const fogPatches = [];
  // Raymarched volumetric fog in the post stack now carries the atmosphere.
  // These alpha planes remain only as a faint near-ground wisp layer.
  const fogSpots = [
    [0, 20, 16, 10], [-6, 16, 12, 8], [7, 23, 12, 8],           // mainframe courtyard
    [-8, -28, 16, 10], [4, -34, 16, 10], [-4, -40, 14, 9],      // factory courtyard
    [0, -52, 18, 10],                                            // factory floor
  ];
  // Intentionally not instantiated: the raymarched volumetric pass in the post
  // stack replaces these, and layering both produced visible banded planes.
  void fogSpots; void fogMat;
  // dust motes falling through the factory skylight
  const dustGeo = new THREE.BufferGeometry();
  const dustN = 90, dustPos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) {
    dustPos[i * 3] = rand(-8, 8); dustPos[i * 3 + 1] = rand(0.2, 6.8); dustPos[i * 3 + 2] = rand(-56, -48);
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x9db4dd, size: 0.02, transparent: true, opacity: 0.55, sizeAttenuation: true }));
  group.add(dust);

  // ---------- sky ----------
  // Shader atmosphere: moon disc with limb darkening and halo, drifting
  // stratus, procedural stars, horizon haze. Also the source of the IBL bake.
  const sky = new Sky({
    moonDir: MOON_DIR.clone(),
    moonColor: 0xd6e4ff,
    moonSize: 0.0026,
    zenith: 0x040711,
    horizon: 0x1a2740,
    ground: 0x04060a,
    starDensity: 0.022,
    cloud: 0.5,
    skyExposure: 1.15,
  });
  group.add(sky.mesh);

  // ---------- lights (physical units: r160) ----------
  // Sky IBL replaces most of the old flat hemisphere fill; what remains is a
  // small bounce term so pure-shadow interiors never go fully black.
  // Sky IBL supplies the directional ambient; this is the bounce floor that
  // stops unlit interiors going to pure black with the power off.
  // The ground half of the hemisphere is BOUNCE, and it has to look like the
  // surface actually doing the bouncing. It was 0x171512 — near-black brown —
  // while every floor in the level is pale concrete, so any surface facing away
  // from the sky received almost nothing. On the spawn platform's steps that
  // turned each riser into a hard black band between two lit treads: measured
  // 16 luminance on the risers against 48 on the treads, which reads as
  // horizontal black lines painted across the screen rather than as steps.
  //
  // A neutral concrete bounce lifts exactly those crushed vertical and
  // downward faces and barely touches sky-facing surfaces, so overall exposure
  // is essentially unchanged.
  const hemi = new THREE.HemisphereLight(0x36496e, 0x3a3b3d, 3.6);
  group.add(hemi);
  const moonLight = new THREE.DirectionalLight(0xa8c0f0, 2.6);
  moonLight.position.copy(MOON_DIR).multiplyScalar(90);
  moonLight.castShadow = true;
  group.add(moonLight, moonLight.target);
  moonLight.target.position.set(0, 0, -20);
  const sunShadow = new SunShadow(moonLight, { extent: 32, distance: 70, resolution: 2048 });

  // Room lamps (dim until power). Sodium practicals are the only warm source in
  // the map, so they carry the color contrast against the blue moonlight.
  const lamps = [];
  const lampDefs = [
    [-10, 3, 0xffb765], [10, 3, 0xffb765],           // corridors
    [-23, -13, 0xffb765], [23, -13, 0xffb765],       // labs / garage
    [-10, -15, 0xffb765, 5.4], [10, -15, 0xffb765, 5.4], // balconies (elevated)
    [-38, -13, 0x9dc4ff], [17, -30, 0x9dc4ff, 5.4],  // generator / chemical (cool)
    [-7, -52, 0xffb765], [7, -52, 0xffb765],         // factory (high)
  ];
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0x2a2723, roughness: 0.62, metalness: 0.55, side: THREE.DoubleSide });
  for (const [lx, lz, lc, ly0] of lampDefs) {
    const isHall = lz === -52;
    const ly = ly0 || (isHall ? 6.2 : 3.9);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), new THREE.MeshStandardMaterial({ color: 0x201c16, emissive: lc, emissiveIntensity: 0.4, roughness: 0.25 }));
    bulb.position.set(lx, ly, lz);
    // Conical enamel shade: gives the pool of light a hard top edge and reads
    // as a real fixture in silhouette instead of a floating dot.
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.26, 14, 1, true), shadeMat);
    shade.position.set(lx, ly + 0.14, lz);
    shade.castShadow = false;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.8), matDark);
    cord.position.set(lx, ly + 0.62, lz);
    const pl = new THREE.PointLight(lc, 5, 22, 2);
    pl.position.set(lx, ly - 0.08, lz);
    group.add(bulb, shade, cord, pl);
    lamps.push({ pl, bulb, shade, base: lc, flicker: Math.random() < 0.35, t: rand(10) });
  }
  // fire lights
  for (const f of fires) {
    f.light = new THREE.PointLight(0xff7028, 52, 13, 2);
    f.light.position.set(f.x, f.y + 0.4, f.z);
    group.add(f.light);
  }

  // ---------- painted factory signage (weathered stencil, original art) ----------
  function wallSign(text, x, y, z, w, ry = 0, opts = {}) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 128;
    const g2 = c.getContext('2d');
    g2.clearRect(0, 0, 1024, 128);
    const fontSize = opts.fontSize || 84;
    g2.font = `bold ${fontSize}px "Arial Narrow", Arial, sans-serif`;
    g2.textAlign = 'center'; g2.textBaseline = 'middle';
    // Always reserve paint margin. Canvas fillText otherwise clips long copy at
    // the texture edge, which was cutting the final S from DER KOLOSS.
    const maxTextWidth = 920;
    const measured = g2.measureText(text).width;
    if (measured > maxTextWidth) {
      g2.font = `bold ${Math.floor(fontSize * maxTextWidth / measured)}px "Arial Narrow", Arial, sans-serif`;
    }
    // weathered paint: stamp the text many times at low alpha, then erase scratches
    for (let i = 0; i < (opts.stamps || 7); i++) {
      const paint = opts.paint || '214,208,190';
      const paintAlpha = opts.paintAlpha || 0.05;
      g2.fillStyle = `rgba(${paint},${paintAlpha + Math.random() * paintAlpha})`;
      g2.fillText(text, 512 + rand(-2, 2), 66 + rand(-2, 2), maxTextWidth);
    }
    g2.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < (opts.scratches ?? 260); i++) {
      g2.fillStyle = `rgba(0,0,0,${rand(0.2, 0.7)})`;
      g2.fillRect(rand(0, 1024), rand(20, 110), rand(1, 6), rand(1, 3));
    }
    g2.globalCompositeOperation = 'source-over';
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    // Signage is painted along a wall, so it is read edge-on more often than
    // face-on. Without anisotropy the stencil dissolves into a shimmering band
    // the moment you walk past it.
    tex.anisotropy = 16;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 8), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: opts.opacity ?? 0.85 }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    group.add(m);
  }
  wallSign('WAFFENFABRIK  DER  KOLOSS', -1, 5.6, -41.78, 16);
  wallSign('CREATED BY VESPER.INC', -1, 4.35, -41.775, 5.2, 0, {
    fontSize: 54, opacity: 0.9, scratches: 120, stamps: 7,
    paint: '255,255,255', paintAlpha: 0.11,
  });
  wallSign('SEKTOR  A', -13.78, 3.4, 20, 7, Math.PI / 2);
  wallSign('HALLE  3', 13.78, 3.6, -52, 8, -Math.PI / 2);
  wallSign('LABOR', -31.78, 3.2, -13, 5, Math.PI / 2);
  wallSign('HALLE  1', -13.78, 3.2, 6, 6, Math.PI / 2);
  wallSign('HALLE  2', 13.78, 3.2, 6, 6, -Math.PI / 2);
  wallSign('KRAFTWERK', -15.78, 3.4, -26, 7, Math.PI / 2);
  wallSign('COURTYARD  EXIT', 10.22, 5.35, -30, 4.2, Math.PI / 2);
  // Eye-level wayfinding on the Double Tap side, directly over the 1000-point
  // door at x=8. This is intentionally readable before the player reaches it.
  wallSign('COURTYARD  GATE   1000', 7.7, 3.72, -21.78, 5.4, 0);
  // The neighboring upper door is not a duplicate courtyard entrance: it is
  // the paid garage-balcony route into Chemical Testing and Teleporter B.
  wallSign('TELEPORTER  B   750', 12, 5.55, -21.78, 4.6, 0);

  mergeSolidGeometry({ group, solidGeos, shotPieces, matWall, matBrick, matMetal, matWood, matDark, matPlate, matConcrete, matCeiling });

  scene.add(group);

  // The props built as their own meshes (cages, vats, the car, the generator)
  // join the merged pieces, then every prop collider takes the geometry drawn
  // for it. Left out: effects that stop nothing (glows, light cones), instanced
  // details too small to matter, and anything that moves or vanishes after the
  // build — doors, window boards, the mystery box — which would leave cover
  // hanging in the air where it used to be.
  const moving = new Set();
  for (const root of [...doors.map((d) => d.mesh), ...barriers.map((b) => b.boardsMesh), boxG]) {
    root?.traverse((o) => moving.add(o));
  }
  group.updateMatrixWorld(true);
  group.traverseVisible((o) => {
    if (!o.isMesh || o.isInstancedMesh || moving.has(o) || /^(solid|props)_/.test(o.name)) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.transparent || m.depthWrite === false || m.blending !== THREE.NormalBlending) return;
    shotPieces.push({ geometry: o.geometry, matrix: o.matrixWorld.elements });
  });
  attachShotCover(colliders, shotPieces);
  shotPieces.length = 0;

  // ---------- runtime update ----------
  let time = 0;
  function update(dt, powerOn, focus = null) {
    time += dt;
    sky.update(time);
    props.update(dt, time, powerOn);
    // Keep the tight shadow box on the player; snapping happens inside.
    if (focus) sunShadow.update(focus);
    for (const l of lamps) {
      l.t += dt;
      let target = powerOn ? 70 : 34;
      // A failing tube is unsteady, not a strobe. The dip used to be assigned
      // instantly and only the recovery was damped, so a flickering lamp cut to
      // 20% in a single frame and crawled back — across ten lamps that reads as
      // the whole map convulsing every time the mains come up. Both directions
      // now go through the same damped approach, so the gate never fully
      // resolves before it lifts and the lamp wavers instead of banging.
      if (l.flicker && Math.sin(l.t * 23) + Math.sin(l.t * 7.3) > 1.2) target *= 0.2;
      l.pl.intensity += (target - l.pl.intensity) * Math.min(1, dt * 9);
      l.bulb.material.emissiveIntensity = l.pl.intensity / 5 + 0.3;
    }
    for (const f of fires) {
      f.t += dt;
      f.light.intensity = 52 + Math.sin(f.t * 11) * 14 + Math.sin(f.t * 27.7) * 9;
    }
    // Machine emissives follow their own practical, so a marquee, its bottle
    // backlight and the glow it throws on the wall all die with the power.
    for (const k of perks) k.machine?.update(dt, time);
    papMachine.update(powerOn ? 1 : 0, dt);
    powerProp.update(power.on, dt);
    for (const t of teleporters) {
      t.cooldown = Math.max(0, t.cooldown - dt);
      const target = powerOn ? (t.charging ? 2.4 : (t.linked ? 1.6 : 0.7)) : 0.12;
      t.ringMat.emissiveIntensity += (target - t.ringMat.emissiveIntensity) * Math.min(1, dt * 3);
      t.ringMat.emissive.setHex(t.linked ? 0x55aaff : 0x3366aa);
    }
    // Game state drives the existing low-cost PaP energy. Dormant/ready states
    // remain subtle; only the eight-second processing cycle blooms and spins.
    const papProcessing = pap.processing;
    const papReady = pap.ready;
    papEnergy.rotation.z = time * (papProcessing ? 2.15 : 0.16);
    papEnergy.rotation.y = Math.sin(time * (papProcessing ? 2.1 : 0.52)) * (papProcessing ? 0.42 : 0.1);
    const papPulse = papProcessing
      ? 1.12 + Math.sin(time * 7.2) * 0.13
      : (papReady ? 0.82 + Math.sin(time * 2.2) * 0.025 : 0.68 + Math.sin(time * 1.4) * 0.018);
    papCore.scale.setScalar(papPulse);
    papCoreMat.emissiveIntensity = papProcessing
      ? 2.2 + Math.sin(time * 8.3) * 0.65
      : (papReady ? 0.42 : 0.2);
    papSlot.material.emissiveIntensity = papProcessing
      ? 1.15 + Math.sin(time * 7.5) * 0.42
      : (papReady ? 0.72 : 0.24);
    for (let i = 1; i < papEnergy.children.length; i++) {
      const energyPart = papEnergy.children[i];
      energyPart.rotation.z += dt * (papProcessing ? (i % 2 ? 2.4 : -1.9) : (i % 2 ? 0.24 : -0.18));
      if (energyPart.material?.opacity !== undefined) {
        energyPart.material.opacity = papProcessing
          ? 0.72 + Math.sin(time * 8.1 + i) * 0.22
          : (papReady ? 0.2 : 0.09);
      }
    }
    // doors anim
    for (const d of doors) {
      if (d.open && d.animT < 1) {
        d.animT = Math.min(1, d.animT + dt / 0.9);
        d.mesh.position.y = (d.baseY ?? 1.5) - 3.05 * d.animT;
        if (d.animT >= 1) d.mesh.visible = false;
      }
    }
    // box float/glow. The sway ADDS to the placement yaw — it used to assign
    // it outright, which pinned the crate to a single +Z facing at all six
    // locations and left it showing its hinged back wherever the player
    // approaches from the other side.
    boxG.rotation.y = box.baseYaw + Math.sin(time * 0.4) * 0.03;
    boxProp.update(dt, time);
    // ground fog drift
    for (const f of fogPatches) {
      f.t += dt;
      f.m.position.x = f.x0 + Math.sin(f.t * 0.11) * f.r;
      f.m.position.z = f.z0 + Math.cos(f.t * 0.073) * f.r * 0.7;
      f.m.material.opacity = 0.75 + Math.sin(f.t * 0.21) * 0.25;
    }
    // skylight dust fall
    {
      const arr = dust.geometry.attributes.position.array;
      for (let i = 0; i < dustN; i++) {
        arr[i * 3 + 1] -= dt * 0.14;
        arr[i * 3] += Math.sin(time * 0.4 + i) * dt * 0.05;
        if (arr[i * 3 + 1] < 0.15) arr[i * 3 + 1] = 6.8;
      }
      dust.geometry.attributes.position.needsUpdate = true;
    }
  }

  function openDoor(door) {
    if (door.open) return;
    door.open = true;
    const idx = colliders.indexOf(door.collider);
    if (idx >= 0) colliders.splice(idx, 1);
    // Enemy navigation is derived from these colliders, so a doorway that has
    // just become passable must be re-derived. Without this the horde keeps
    // routing around a wall that no longer exists — and the routes it would take
    // instead are the long way round, or nothing at all.
    const dc = door.collider;
    if (dc) navInvalidate(api, dc.minX, dc.minZ, dc.maxX, dc.maxZ);
    // The wide Courtyard gate is a readable open passage, not a sinking brick
    // panel players can walk through. Remove its leaf in the same tick that its
    // collider is removed so visual and physical state always agree.
    if (door.openingStyle === 'wide-passage') {
      door.animT = 1;
      door.mesh.visible = false;
    }
  }

  /**
   * Face the crate's front (its local +Z, where the hasp is and where the lid
   * opens toward) at the open middle of whatever room it landed in, so players
   * always meet the front rather than the hinges. Hand-authoring a yaw per
   * location would drift the moment a location moved; deriving it from the room
   * rect cannot.
   */
  function boxYawAt(l) {
    const room = rooms.find((r) => r.id === roomAt(l.x, l.z, (l.y || 0) + 0.5));
    if (!room) return 0;
    const cx = (room.rect.minX + room.rect.maxX) / 2;
    const cz = (room.rect.minZ + room.rect.maxZ) / 2;
    const dx = cx - l.x, dz = cz - l.z;
    if (Math.abs(dx) < 0.05 && Math.abs(dz) < 0.05) return 0;
    return Math.atan2(dx, dz);          // yaw that points local +Z at (cx, cz)
  }

  function moveBox(locIdx) {
    // Bail BEFORE mutating. This used to assign box.locIdx and then dereference
    // box.locations[locIdx], so an out-of-range index threw with the crate's
    // index already pointing at nothing while its mesh, collider and navmesh
    // stayed where they were. It is reachable from the wire (`box_move`).
    // Normalised, not just range-checked. `locations['2']` resolves fine by
    // array-index coercion, so a string index used to be stored verbatim — and
    // the "pick a different spot" filter compares with !==, so '2' !== 2 left
    // the current location in the candidate list and the crate could move to
    // where it already was.
    const idx = Math.trunc(Number(locIdx));
    const l = Number.isInteger(idx) ? box.locations[idx] : undefined;
    if (!l) return;
    box.locIdx = idx;
    boxG.position.set(l.x, l.y || 0, l.z);
    box.baseYaw = boxYawAt(l);
    box.pos.x = l.x; box.pos.z = l.z; box.pos.y = 0.9 + (l.y || 0);
    const bc = colliders.find(c => c.boxCollider);
    if (bc) {
      // Both ends have to be re-derived: the crate stops blocking where it was
      // and starts blocking where it landed, and the navigation grid is built
      // from these rectangles.
      const was = { minX: bc.minX, minZ: bc.minZ, maxX: bc.maxX, maxZ: bc.maxZ };
      bc.minX = l.x - 0.75; bc.maxX = l.x + 0.75;
      bc.minZ = l.z - 0.45; bc.maxZ = l.z + 0.45;
      bc.y0 = l.y || 0;
      navInvalidate(api, was.minX, was.minZ, was.maxX, was.maxZ);
      navInvalidate(api, bc.minX, bc.minZ, bc.maxX, bc.maxZ);
    }
  }

  // Face the crate correctly at its STARTING location too, not only after it
  // teleports. boxYawAt needs `rooms` and `roomAt`, so this runs here rather
  // than at construction.
  box.baseYaw = boxYawAt(box.locations[0]);
  boxG.rotation.y = box.baseYaw;

  // Named, because openDoor() and moveBox() have to hand this exact object to
  // navInvalidate() — the navigation grid is keyed on the map instance.
  api = {
    group, colliders, barriers, risers, rooms, doors, interact,
    wallbuys, perks, power, teleporters, mainframe, pap, box, traps,
    playerSpawns: [{ x: -2, z: 16.4 }, { x: 2, z: 16.4 }, { x: -2, z: 15.4 }, { x: 2, z: 15.4 }],
    roomAt, floorY, floorZones, ramps, navLinks, findPath, update, openDoor, moveBox,
    moonLight, sunShadow, sky, props, grade: GRADE, lamps, fires,
    // Coarse emergency clamp around the actual building shell. Fine-grained
    // containment is enforced by roomAt() in the local player controller.
    bounds: { minX: -44, maxX: 32, minZ: -62, maxZ: 26 },
  };
  return api;
}
