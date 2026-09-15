// Pure map topology shared by the runtime and deterministic route checks.
// Keep this module free of DOM/Three.js dependencies so CI can import it.
import { MAP_ROOMS, MAP_DOOR_DEFS, MAP_WALL_RUNS } from './map-layout/shell.js';
import { MAP_WALLBUYS, MAP_PERKS } from './map-layout/interactables.js';
import { MAP_RAMPS, MAP_NAV_LINKS } from './map-layout/traversal.js';
export { MAP_ROOMS, DOOR_FIT, cappedWallRuns, MAP_DOOR_DEFS, MAP_WALL_RUNS } from './map-layout/shell.js';
export {
  MAP_WALLBUYS, MAP_PERKS, INITIAL_MYSTERY_BOX, MAP_TELEPORTERS, PAP_ENERGY_VISUAL, papEnergyEnvelope,
  teleporterPromptState,
} from './map-layout/interactables.js';
export {
  MAINFRAME_PLATFORM, MAINFRAME_STEPS, MAINFRAME_EAST_ENTRY_KEEP_CLEAR, FACTORY_CATWALK,
  stairFlightColliders, platformSideBlocksAtFeet, MAP_RAMPS, MAP_WALKWAYS, MAP_OPEN_EXITS, MAP_STAIR_MOUTHS,
  MAP_TRAVERSAL_ZONES, MAP_NAV_LINKS, roomDepthsToPlayers, roomsThatCanReachPlayers, elevationAwareRiseCandidate,
} from './map-layout/traversal.js';

export function auditInteractableApproaches({ interactables = [], colliders = [], roomAt, floorY } = {}) {
  const issues = [];
  const playerRadius = 0.34;
  const overlaps = (x, z, y, collider) => {
    if (collider.shootOk || collider.noRaycast) return false;
    if (collider.y0 !== undefined && (collider.y0 > y + 1.7 || collider.y0 + collider.h < y + 0.02)) return false;
    const nearestX = Math.max(collider.minX, Math.min(x, collider.maxX));
    const nearestZ = Math.max(collider.minZ, Math.min(z, collider.maxZ));
    return Math.hypot(x - nearestX, z - nearestZ) < playerRadius;
  };

  for (const item of interactables) {
    if (!item?.id || !item.pos || !Number.isFinite(item.radius)) {
      issues.push(`${item?.id || '(unknown)'} has incomplete interaction geometry`);
      continue;
    }
    const referenceY = Math.max(0, (item.pos.y || 1.2) - 1.2);
    const outer = Math.max(0.72, item.radius - 0.42);
    const radii = [outer, Math.max(0.72, outer * 0.72)];
    let clearSamples = 0;
    for (const radius of radii) {
      for (let i = 0; i < 24; i++) {
        const angle = i * Math.PI * 2 / 24;
        const x = item.pos.x + Math.cos(angle) * radius;
        const z = item.pos.z + Math.sin(angle) * radius;
        const y = typeof floorY === 'function' ? floorY(x, z, referenceY + 0.25) : referenceY;
        if (typeof roomAt === 'function' && !roomAt(x, z, y)) continue;
        if (Math.abs((y + 1.2) - (item.pos.y || 1.2)) > 2.4) continue;
        if (colliders.some((collider) => overlaps(x, z, y, collider))) continue;
        clearSamples++;
      }
    }
    // Two distinct samples prevent a single numerical seam from satisfying the
    // audit while still permitting wall-mounted controls and narrow door faces.
    if (clearSamples < 2) issues.push(`${item.id} has no clear player approach inside its use radius`);
  }
  return { ok: issues.length === 0, issues, checked: interactables.length };
}

export function auditKeepClearZone(zone, colliders = []) {
  // A zone that names the floor it belongs to is only obstructed by props on
  // THAT level. One room's floor is the room below's ceiling, so the machine
  // standing under the garage balcony shares its footprint with the stair
  // landing 2.9m above it and is no obstacle to anyone walking up there.
  const floorY = Number.isFinite(zone.floorY) ? zone.floorY : null;
  const blockers = colliders.filter((collider) => {
    if (!collider?.prop || collider.keepClearExempt) return false;
    if (floorY !== null && collider.y0 !== undefined
      && (collider.y0 + collider.h <= floorY + 0.12 || collider.y0 >= floorY + 2.0)) return false;
    return collider.maxX > zone.minX && collider.minX < zone.maxX
      && collider.maxZ > zone.minZ && collider.minZ < zone.maxZ;
  });
  return { ok: blockers.length === 0, blockers };
}

export function auditMapStructure({
  rooms = MAP_ROOMS,
  doors = MAP_DOOR_DEFS,
  walls = MAP_WALL_RUNS,
  wallbuys = MAP_WALLBUYS,
  perks = MAP_PERKS,
} = {}) {
  const issues = [];
  const roomIds = new Set(rooms.map((room) => room.id));
  const doorById = new Map(doors.map((door) => [door.id, door]));
  const wallById = new Map(walls.map((wall) => [wall.id, wall]));
  const seenWallIds = new Set();
  const doorOpenings = new Map();
  let windowCount = 0;
  let solidSegments = 0;

  const axisInfo = (wall) => {
    const horizontal = Math.abs(wall.z2 - wall.z1) < 0.001;
    const vertical = Math.abs(wall.x2 - wall.x1) < 0.001;
    const len = horizontal ? wall.x2 - wall.x1 : wall.z2 - wall.z1;
    return { horizontal, vertical, len };
  };
  const gapWorld = (wall, gap) => {
    const { horizontal } = axisInfo(wall);
    return horizontal
      ? { x: wall.x1 + gap.at, z: wall.z1, vert: false }
      : { x: wall.x1, z: wall.z1 + gap.at, vert: true };
  };
  const groundRoomAt = (x, z) => rooms.find((room) => (
    room.yMin === undefined
    && x >= room.rect.minX && x <= room.rect.maxX
    && z >= room.rect.minZ && z <= room.rect.maxZ
  ))?.id || null;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const gameplayProps = [
    ...wallbuys.map((item) => ({ ...item, label: `wallbuy ${item.weapon}`, clearance: 0.9 })),
    ...perks.map((item) => ({ ...item, label: `perk ${item.id}`, clearance: 1.05 })),
    ...doors.map((item) => ({ ...item, label: `door ${item.id}`, clearance: (item.w || 1.9) / 2 })),
  ];
  // Ground-level wall collider footprints, excluding their declared gaps.
  // These let CI validate both sides of every barricade without constructing a
  // Three.js scene.
  const solidFootprints = [];
  for (const wall of walls) {
    const { horizontal, vertical, len } = axisInfo(wall);
    if (horizontal === vertical || len <= 0 || (wall.y0 || 0) > 1.8) continue;
    const gaps = [...(wall.gaps || [])].sort((a, b) => a.at - b.at);
    let cursor = 0;
    const addSolid = (start, end) => {
      if (end - start < 0.01) return;
      solidFootprints.push(horizontal
        ? { minX: wall.x1 + start, maxX: wall.x1 + end, minZ: wall.z1 - 0.2, maxZ: wall.z1 + 0.2, wallId: wall.id }
        : { minX: wall.x1 - 0.2, maxX: wall.x1 + 0.2, minZ: wall.z1 + start, maxZ: wall.z1 + end, wallId: wall.id });
    };
    for (const gap of gaps) {
      addSolid(cursor, gap.at - gap.w / 2);
      cursor = gap.at + gap.w / 2;
    }
    addSolid(cursor, len);
  }
  const clearOfWallColliders = (point, radius = 0.42) => solidFootprints.every((box) => {
    const nearestX = Math.max(box.minX, Math.min(point.x, box.maxX));
    const nearestZ = Math.max(box.minZ, Math.min(point.z, box.maxZ));
    return Math.hypot(point.x - nearestX, point.z - nearestZ) >= radius;
  });

  for (const wall of walls) {
    if (!wall.id || seenWallIds.has(wall.id)) issues.push(`wall id ${wall.id || '(missing)'} must be unique`);
    seenWallIds.add(wall.id);
    const { horizontal, vertical, len } = axisInfo(wall);
    if (horizontal === vertical || len <= 0) {
      issues.push(`wall ${wall.id} must be a positive axis-aligned run`);
      continue;
    }
    const gaps = [...(wall.gaps || [])].sort((a, b) => a.at - b.at);
    let cursor = 0;
    for (const gap of gaps) {
      const start = gap.at - gap.w / 2;
      const end = gap.at + gap.w / 2;
      if (start < -1e-6 || end > len + 1e-6) issues.push(`gap on ${wall.id} extends beyond its wall`);
      if (start < cursor - 1e-6) issues.push(`gaps overlap on ${wall.id}`);
      if (start > cursor + 0.01) solidSegments++;
      cursor = end;
      if (gap.kind === 'window') {
        windowCount++;
        if (!roomIds.has(gap.room)) issues.push(`window on ${wall.id} references unknown room ${gap.room}`);
        if (gap.in !== -1 && gap.in !== 1) issues.push(`window on ${wall.id} needs an explicit ±1 inward normal`);
        if ((wall.y0 || 0) !== 0) issues.push(`window on ${wall.id} is elevated; zombie barrier logic is ground-level only`);
        const world = gapWorld(wall, gap);
        const inward = axisInfo(wall).horizontal ? { x: 0, z: gap.in } : { x: gap.in, z: 0 };
        const rebuild = { x: world.x + inward.x * 1.25, z: world.z + inward.z * 1.25 };
        const approach = { x: world.x - inward.x * 1.5, z: world.z - inward.z * 1.5 };
        if (groundRoomAt(rebuild.x, rebuild.z) !== gap.room) {
          issues.push(`window on ${wall.id} has no unobstructed rebuild zone inside ${gap.room}`);
        }
        if (!clearOfWallColliders(rebuild)) {
          issues.push(`window on ${wall.id} rebuild zone overlaps a wall collider`);
        }
        if (!clearOfWallColliders(approach)) {
          issues.push(`window on ${wall.id} zombie approach overlaps a wall collider`);
        }
        if (distance(world, approach) < 1.4 || gap.w < 1.4) {
          issues.push(`window on ${wall.id} has no visible zombie approach opening`);
        }
        for (const prop of gameplayProps) {
          if (distance(world, prop) < prop.clearance + gap.w / 2 + 0.2) {
            issues.push(`window on ${wall.id} overlaps ${prop.label}`);
          }
          if (distance(rebuild, prop) < prop.clearance + 0.55) {
            issues.push(`window on ${wall.id} rebuild zone is obstructed by ${prop.label}`);
          }
          if (distance(approach, prop) < prop.clearance + 0.55) {
            issues.push(`window on ${wall.id} zombie approach is obstructed by ${prop.label}`);
          }
        }
      } else if (gap.kind === 'door') {
        if (!doorById.has(gap.doorId)) issues.push(`door gap on ${wall.id} references unknown ${gap.doorId}`);
        if (!doorOpenings.has(gap.doorId)) doorOpenings.set(gap.doorId, []);
        doorOpenings.get(gap.doorId).push({ wall, gap, world: gapWorld(wall, gap) });
      } else if (gap.kind !== 'passage') {
        issues.push(`gap on ${wall.id} has unsupported kind ${gap.kind}`);
      }
    }
    if (cursor < len - 0.01) solidSegments++;
  }

  for (const door of doors) {
    const openings = doorOpenings.get(door.id) || [];
    if (openings.length !== 1) {
      issues.push(`door ${door.id} must occupy exactly one wall opening; found ${openings.length}`);
      continue;
    }
    const { wall, gap, world } = openings[0];
    if (Math.abs(world.x - door.x) > 0.01 || Math.abs(world.z - door.z) > 0.01) {
      issues.push(`door ${door.id} does not align with its wall opening`);
    }
    if (Boolean(door.vert) !== world.vert) issues.push(`door ${door.id} orientation does not match ${wall.id}`);
    if (Math.abs((door.y || 0) - (wall.y0 || 0)) > 0.01) issues.push(`door ${door.id} elevation does not match ${wall.id}`);
    if (Math.abs((door.w || 1.9) - gap.w) > 0.01) issues.push(`door ${door.id} width does not match ${wall.id}`);
    if (!Number.isFinite(door.cost) || door.cost < 0) issues.push(`door ${door.id} must have a direct finite interaction cost`);
    if (door.visibilityTreatment !== 'framed-lit-cost') {
      issues.push(`door ${door.id} must use the framed-lit-cost visibility treatment`);
    }
  }

  for (const wb of wallbuys) {
    const wall = wallById.get(wb.wallId);
    if (!wall) { issues.push(`wallbuy ${wb.weapon} references unknown wall ${wb.wallId}`); continue; }
    const { horizontal, len } = axisInfo(wall);
    const wallCoord = horizontal ? wall.z1 : wall.x1;
    const buyCoord = horizontal ? wb.z : wb.x;
    const along = horizontal ? wb.x - wall.x1 : wb.z - wall.z1;
    if (Math.abs(wallCoord - buyCoord) > 0.3 || along < 0 || along > len) {
      issues.push(`wallbuy ${wb.weapon} is not mounted on ${wall.id}`);
      continue;
    }
    if (Math.abs((wb.y || 0) - (wall.y0 || 0)) > 0.01) {
      issues.push(`wallbuy ${wb.weapon} elevation does not match ${wall.id}`);
    }
    const overlappingGap = (wall.gaps || []).find((gap) => Math.abs(gap.at - along) < gap.w / 2 + 0.76);
    if (overlappingGap) issues.push(`wallbuy ${wb.weapon} overlaps a ${overlappingGap.kind} on ${wall.id}`);
  }

  return {
    ok: issues.length === 0,
    issues,
    wallsChecked: walls.length,
    doorsChecked: doors.length,
    windowsChecked: windowCount,
    solidSegments,
  };
}

export function auditMapEgress({ rooms = MAP_ROOMS, doors = MAP_DOOR_DEFS, navLinks = MAP_NAV_LINKS, ramps = MAP_RAMPS } = {}) {
  const issues = [];
  const roomIds = new Set(rooms.map((room) => room.id));
  const rampIds = new Set(ramps.map((ramp) => ramp.id));
  const outgoing = new Map([...roomIds].map((id) => [id, []]));
  const incoming = new Map([...roomIds].map((id) => [id, []]));

  const addEdge = (from, to, edge) => {
    if (!roomIds.has(from) || !roomIds.has(to)) {
      issues.push(`route ${edge.id || edge.route || `${from}->${to}`} references an unknown room`);
      return;
    }
    outgoing.get(from).push({ to, ...edge });
    incoming.get(to).push({ from, ...edge });
  };

  for (const door of doors) {
    if (!door.rooms || door.rooms.length !== 2) {
      issues.push(`door ${door.id} must join exactly two rooms`);
      continue;
    }
    addEdge(door.rooms[0], door.rooms[1], { id: door.id, kind: 'door' });
    addEdge(door.rooms[1], door.rooms[0], { id: door.id, kind: 'door' });
  }
  for (const link of navLinks) {
    addEdge(link.from, link.to, { ...link, kind: link.drop ? 'drop' : 'route' });
    if (link.stair && (!link.route || !rampIds.has(link.route))) {
      issues.push(`stair ${link.from}->${link.to} has no matching physical ramp`);
    }
  }

  for (const room of rooms) {
    const outs = outgoing.get(room.id) || [];
    const ins = incoming.get(room.id) || [];
    if (!outs.length) issues.push(`${room.id} has no exit`);
    if (!ins.length) issues.push(`${room.id} has no entrance`);
    if (room.minExits) {
      const distinct = new Set(outs.map((edge) => edge.route || edge.id || edge.to));
      if (distinct.size < room.minExits) issues.push(`${room.id} needs ${room.minExits} independent exits; found ${distinct.size}`);
    }
  }

  // With progression doors open, every playable room must be able to return to
  // Mainframe. This catches one-way drops and isolated additions before runtime.
  for (const start of roomIds) {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const current = queue.shift();
      for (const edge of outgoing.get(current) || []) {
        if (!seen.has(edge.to)) { seen.add(edge.to); queue.push(edge.to); }
      }
    }
    if (!seen.has('mainframe')) issues.push(`${start} cannot return to mainframe`);
  }

  // Every stair is physically bidirectional; require matching route data too.
  for (const link of navLinks.filter((entry) => entry.stair)) {
    const reverse = navLinks.some((entry) => entry.stair && entry.from === link.to && entry.to === link.from && entry.route === link.route);
    if (!reverse) issues.push(`stair ${link.route} is missing ${link.to}->${link.from}`);
  }

  return { ok: issues.length === 0, issues, roomsChecked: rooms.length };
}
