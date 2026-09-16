// Shared procedural surface library for the map's interactive machines.
//
// Everything here is drawn into a <canvas> at load time and uploaded once. The
// machines are hero props — the player stands a metre and a half from them and
// stares — so they get real colour/roughness/normal sets rather than a flat
// tint. Height maps are converted to tangent-space normals with a Sobel filter,
// which is what gives rivets, plank gaps and paint chips their relief under the
// sodium practicals.
//
// Every generator is seeded: a machine looks identical in every session.
import * as THREE from 'three';
import { applyNormalFilter } from '../render/Materials.js';
import { castIronMaps, brassMaps, plankMaps } from './materials/surfaces.js';
import { glassRoughness, hazardTexture } from './materials/textures.js';

export { mulberry32 } from './materials/kit.js';
export { enamelMaps, castIronMaps, brassMaps, plankMaps } from './materials/surfaces.js';
export {
  stencilTexture, hazardTexture, signTexture, glassRoughness,
} from './materials/textures.js';

// Normal-map LOD and geometric specular AA for the machines. Tuned looser than
// the map's merged surfaces: a hero prop is something the player stands a
// metre and a half from and stares at, so the LOD fade must not start eating
// relief at the distance it is actually read from, and the specular-AA cap is
// lower because the props are assembled from hundreds of abutting boxes and
// faceted rivet domes. Those seams are real geometry, three's own
// `geometryRoughness` already widens the lobe across them, and
// `subtractGeometric` keeps this filter from double-counting them — but the
// cap is the backstop that guarantees a modelling seam can never sand the
// shine off a whole machine.
export const PROP_NORMAL_FILTER = {
  normalLodStart: 0.003,
  normalLodEnd: 0.016,
  normalLodFloor: 0.30,
  specAA: 2.0,
  specAAMax: 0.16,
  subtractGeometric: true,
};

/**
 * A prop MeshStandardMaterial with the normal filtering already on it. Use
 * this instead of `new THREE.MeshStandardMaterial` for anything carrying a
 * normal map; without a normal map the filter is a no-op and skips itself.
 */
export function propMaterial(params, filter) {
  return applyNormalFilter(
    new THREE.MeshStandardMaterial(params),
    filter ? { ...PROP_NORMAL_FILTER, ...filter } : PROP_NORMAL_FILTER,
  );
}

// ---------------------------------------------------------------------------
// shared singletons — every machine pulls from the same few uploads
// ---------------------------------------------------------------------------

const cache = new Map();
function once(key, make) {
  let v = cache.get(key);
  if (!v) { v = make(); cache.set(key, v); }
  return v;
}

export const shared = {
  get iron() { return once('iron', () => castIronMaps(7)); },
  get ironDark() { return once('ironDark', () => castIronMaps(11, { base: '#5b5e63' })); },
  get brass() { return once('brass', () => brassMaps(13)); },
  get copper() { return once('copper', () => brassMaps(17, { base: '#8c5230' })); },
  get planks() { return once('planks', () => plankMaps(23)); },
  get planksFine() { return once('planksFine', () => plankMaps(29, { rows: 8 })); },
  get glassRough() { return once('glassRough', () => glassRoughness(71)); },
  get hazard() { return once('hazard', () => hazardTexture({})); },
};

/** Cast iron. Dark, matte, heavy — the structural material of every machine. */
export function ironMaterial(opts = {}) {
  const m = shared.iron;
  return propMaterial({
    map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap,
    color: opts.color ?? 0xffffff, metalness: opts.metalness ?? 0.45, roughness: opts.roughness ?? 0.7,
    normalScale: new THREE.Vector2(opts.normal ?? 1.1, opts.normal ?? 1.1),
    ...opts.extra,
  }, opts.filter);
}

export function brassMaterial(opts = {}) {
  const m = opts.copper ? shared.copper : shared.brass;
  return propMaterial({
    map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap,
    color: opts.color ?? 0xffffff, metalness: 1.0, roughness: opts.roughness ?? 0.46,
    normalScale: new THREE.Vector2(0.7, 0.7),
    ...opts.extra,
  }, opts.filter);
}

/** Set the world-space UV density of a geometry's box-projected UVs. */
export function scaleUV(geo, su, sv = su) {
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}
