// Procedural PBR material library for first-person weapon view-models.
//
// Everything here is generated once on a canvas and shared across every gun:
// there is only ever one visible view-model, but the pick-up box, the cinematic
// director and the Pack-a-Punch output all build weapons too, so per-weapon
// texture copies would be pure waste.
//
// Design notes
//  - The renderer runs NoToneMapping into an HDR buffer with an AgX post stack
//    and a PMREM night-sky environment. Metals therefore want metalness 1.0 and
//    a real roughness MAP so the sky IBL breaks up across the surface instead of
//    producing one flat specular wash.
//  - View-models are camera-attached, so world-space triplanar detail (the
//    shared Materials.js helper) is wrong here — these are UV-space maps.
import { buildLibrary } from './WeaponMaterials/library.js';

let _lib = null;

/** Lazy, shared material library. `WM.blued`, `WM.wood`, ... */
export const WM = new Proxy({}, {
  get: (_, k) => (_lib || (_lib = buildLibrary()))[k],
  has: (_, k) => k in (_lib || (_lib = buildLibrary())),
  ownKeys: () => Reflect.ownKeys(_lib || (_lib = buildLibrary())),
  getOwnPropertyDescriptor: (_, k) => ({
    configurable: true, enumerable: true, value: (_lib || (_lib = buildLibrary()))[k],
  }),
});

/**
 * Per-weapon material slots. `pap` swaps the ferrous set for the anodised
 * Pack-a-Punch finish while leaving the non-metals (wood, leather) recognisable
 * so the silhouette still reads as the same gun.
 */
export function matSet(pap) {
  const m = WM;
  if (!pap) {
    return {
      body: m.blued, dark: m.ironDark, bright: m.machined, matte: m.phosphate,
      sheet: m.stamped, polish: m.polished, wood: m.wood, woodDark: m.woodDark,
      woodLight: m.woodLight, checker: m.woodChecker, grip: m.bakelite,
      poly: m.polymer, brass: m.brass, accent: m.machined, glow: m.rayGlow,
    };
  }
  return {
    body: m.papBody, dark: m.papEtch, bright: m.papChrome, matte: m.papDark,
    sheet: m.papDark, polish: m.papChrome, wood: m.papEtch, woodDark: m.papBody,
    woodLight: m.papDark, checker: m.papBody, grip: m.papBody,
    poly: m.papBody, brass: m.papChrome, accent: m.papGlow, glow: m.papCore,
  };
}
