// The map's doors: leaves, frames, lamps, colliders and prompts, then the room
// graph they open, checked by the egress audit and walked by findPath().
// buildMap() in js/map.js calls this in build order, with the names in its parameter list.
import * as THREE from 'three';
import { textTexture } from '../utils.js';
import { buildDoorLeaf, buildDoorFrame, buildDoorLamp } from '../props/door.js';
import { MAP_DOOR_DEFS, MAP_NAV_LINKS, auditMapEgress } from '../map-layout.js';

export function buildDoors({ group, colliders, interact, doors, rooms, ramps }) {
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
  return { navLinks, findPath };
}
