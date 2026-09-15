// What players buy and use, and where it stands: the wall buys, the perk
// machines, the first mystery box, the teleporters and their prompt, and the
// Pack-a-Punch energy's size. No DOM and no Three.js, so CI can import it.

export const MAP_WALLBUYS = [
  // The starter rifles used to overlap the two mainframe side windows at z=20,
  // making them look like floating props. z=23 centers them on solid panels.
  { x: -9.78, z: 23, nx: 1, nz: 0, weapon: 'kar98', price: 200, wallId: 'mainframe_west' },
  { x: 9.78, z: 23, nx: -1, nz: 0, weapon: 'gewehr43', price: 600, wallId: 'mainframe_east' },
  { x: -13.78, z: 12, nx: 1, nz: 0, weapon: 'm1a1', price: 600, wallId: 'left_outer' },
  { x: 13.78, z: 6, nx: -1, nz: 0, weapon: 'dbshotgun', price: 1200, wallId: 'garage_outer' },
  { x: 31.78, z: -13, nx: -1, nz: 0, weapon: 'thompson', price: 1200, wallId: 'auto_east' },
  { x: -19.5, z: -19.78, nx: 0, nz: 1, weapon: 'trench', price: 1500, wallId: 'animal_south' },
  { x: -6.22, z: -14, nx: -1, nz: 0, weapon: 'mp40', price: 1000, wallId: 'left_alley_ground' },
  // Chemical Testing is elevated. Keeping this buy at ground level placed it
  // inside the sealed exterior undercroft after the perimeter fix.
  { x: 16, y: 2.9, z: -37.78, nx: 0, nz: 1, weapon: 'type100', price: 1000, wallId: 'chem_south_upper' },
  { x: 9.78, z: -36, nx: -1, nz: 0, weapon: 'fg42', price: 1500, wallId: 'courtyard_east_north' },
  { x: -13.78, z: -46, nx: 1, nz: 0, weapon: 'stg44', price: 1200, wallId: 'factory_west' },
];

// Keep gameplay props in pure layout data so windows can be audited for a
// clear survivor rebuild zone and an unobstructed zombie approach. Speed Cola
// formerly sat at (13.4, 10), directly in front of garage_outer's window.
export const MAP_PERKS = [
  { id: 'qr', name: 'Quick Revive', price: 1500, color: 0x7ec8e3, x: -13.3, z: -58, ry: Math.PI / 2 },
  { id: 'jug', name: 'Juggernog', price: 2500, color: 0xd23c2a, x: -13.4, z: -18, ry: Math.PI / 2 },
  { id: 'speed', name: 'Speed Cola', price: 3000, color: 0x3fae5a, x: 13.4, z: 12.5, ry: -Math.PI / 2 },
  { id: 'dtap', name: 'Double Tap', price: 2000, color: 0xe8a33d, x: 13.4, z: -21, ry: -Math.PI / 2 },
];

export const INITIAL_MYSTERY_BOX = { x: -4, z: -23.2 };

// Teleporters are topology, not decorative props. Keeping their floor and room
// declarations here lets CI catch the former Teleporter B regression where the
// machine was constructed at y=0 beneath Chemical Testing's 2.9m upper floor.
export const MAP_TELEPORTERS = [
  { id: 'teleA', label: 'A', room: 'genroom', x: -38, y: 0, z: -13, clearance: 1.9, frameHeight: 3.2 },
  // Chemical Testing has 3.1m of headroom above its upper floor. B uses a
  // compact 2.5m gantry so its frame and letter sit visibly below the ceiling.
  { id: 'teleB', label: 'B', room: 'chemtesting', x: 17, y: 2.9, z: -30.5, clearance: 1.9, frameHeight: 2.5 },
  { id: 'teleC', label: 'C', room: 'factory', x: 0, y: 0, z: -56, clearance: 1.9, frameHeight: 3.2 },
];

export const PAP_ENERGY_VISUAL = {
  ringSegments: 24,
  tubeSegments: 6,
  arcCount: 3,
  arcPoints: 7,
  centerY: 1,
  centerZ: 0.39,
  coreRadius: 0.08,
  coreOffsetZ: 0.1,
  ringRadii: [0.14, 0.19],
  ringTube: 0.008,
  boltHalfWidth: 0.18,
  boltDepth: 0.12,
  aperture: { halfWidth: 0.45, halfHeight: 0.25, frontZ: 0.6 },
};

export function papEnergyEnvelope(config = PAP_ENERGY_VISUAL) {
  const ringExtent = Math.max(...config.ringRadii) + config.ringTube;
  const coreFront = config.coreOffsetZ + config.coreRadius;
  const boltFront = config.boltDepth + 0.04;
  return {
    minX: -Math.max(ringExtent, config.boltHalfWidth),
    maxX: Math.max(ringExtent, config.boltHalfWidth),
    minY: config.centerY - ringExtent,
    maxY: config.centerY + ringExtent,
    maxZ: config.centerZ + Math.max(ringExtent, coreFront, boltFront),
  };
}

export function teleporterPromptState({ powerOn, charging = false, cooldown = 0 } = {}) {
  if (!powerOn) return 'no-power';
  if (charging) return 'charging';
  if (cooldown > 0) return 'recharging';
  return 'ready';
}
