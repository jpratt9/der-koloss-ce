// Reusable procedural firearm sub-assemblies for the first-person view-models.
// The code is in js/render/WeaponParts/; this file re-exports the names callers
// import, so no caller has to know which module defines one.

export {
  geo, bevelBoxGeo, plateGeo, cylGeo, sphereGeo, torusGeo, ringGeo, latheGeo, mesh, bx, cyl,
} from './WeaponParts/geometry.js';

export {
  barrel, perfShroud, flashHider, compensator, muzzleCone, suppressor,
} from './WeaponParts/muzzles.js';

export {
  NOTCH_DEPTH, FRONT_POST_H, frontSight, rearNotch, rearAperture, rearTangent, railRearSight,
  redDot, scope,
} from './WeaponParts/sights.js';

export {
  ejectionPort, triggerGroup, magazine, rail, screw, slingLoop, chargingHandle, selector, bipod,
} from './WeaponParts/furniture.js';
