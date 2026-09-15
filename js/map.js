// Map: night-time factory complex. Layout & landmarks inspired by classic
// wave-survival factory maps; all textures CC0, all geometry built in code.
// buildMap() builds it from the sections in js/map/, in order, then runs it.
import * as THREE from 'three';
import { concreteTexture, brickTexture, metalTexture, woodTexture, makeBox } from './utils.js';
import { decorateMap } from './map-props.js';
import { attachShotCover } from './shot-cover.js';
import { navInvalidate } from './navmesh.js';
import {
  MAINFRAME_EAST_ENTRY_KEEP_CLEAR, MAP_TRAVERSAL_ZONES,
  auditInteractableApproaches, auditKeepClearZone,
} from './map-layout.js';
import { buildSurfaces, mergeSolidGeometry } from './map/surfaces.js';
import { buildShell } from './map/shell.js';
import { buildElevation } from './map/elevation.js';
import { buildDoors } from './map/doors.js';
import { placeProps } from './map/hand-placed.js';
import { buildInteractables } from './map/interactables.js';
import { placeRisers } from './map/risers.js';
import { GRADE, buildLighting } from './map/lighting.js';
import { paintSignage } from './map/signage.js';

export { MOON_DIR, GRADE } from './map/lighting.js';

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
  const { floorZones, ramps, floorY, encloseStairFlight } = buildElevation({ group, colliders, solidGeos, pushBox, matMetal });
  const { navLinks, findPath } = buildDoors({ group, colliders, interact, doors, rooms, ramps });
  placeProps({ group, colliders, fires, solidGeos, pushBox, pbr, matMetal, matPlate, matDark, matWood, encloseStairFlight, H, HH });
  const {
    wallbuys, perks, power, powerProp, teleporters, mainframe,
    pap, papMachine, papEnergy, papCore, papCoreMat, papSlot, box, boxG, boxProp, traps,
  } = buildInteractables({ opts, group, colliders, interact, matMetal, matWood });

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

  placeRisers({ group, risers, matConcrete });
  const { fogPatches, dust, dustN, sky, moonLight, sunShadow, lamps } = buildLighting({ group, fires, matDark });
  paintSignage({ group });
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
