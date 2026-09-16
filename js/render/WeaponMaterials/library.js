// The material library itself: every surface the generators can make, bound
// into the MeshStandardMaterials the weapons are drawn with. Built once, on
// the first read through the WM proxy in js/render/WeaponMaterials.js.
import * as THREE from 'three';
import {
  steelSurface, woodSurface, leatherSurface, bakeliteSurface, checkerSurface, etchSurface,
} from './surfaces.js';

export function buildLibrary() {
  const machined = steelSurface(1337, 'machined', { rough: 0.34, scratches: 70, pits: 90, repeat: 3, strength: 1.2 });
  const blued = steelSurface(4242, 'brushed', { rough: 0.30, scratches: 120, pits: 70, repeat: 3, strength: 1.2 });
  const phos = steelSurface(9001, 'cast', { rough: 0.62, scratches: 60, pits: 200, repeat: 4, strength: 0.8 });
  const stamp = steelSurface(777, 'stamped', { rough: 0.44, scratches: 160, pits: 130, repeat: 3, strength: 1.2 });
  const polish = steelSurface(313, 'brushed', { rough: 0.16, scratches: 60, pits: 25, repeat: 3, strength: 1.1 });
  const walnut = woodSurface(21, 0x7a5c3c, 0x2f2317, { rings: 6, rough: 0.60, repeat: 3 });
  const walnutDark = woodSurface(52, 0x5c4632, 0x1d160f, { rings: 8, rough: 0.64, repeat: 3 });
  const beech = woodSurface(88, 0x8d7854, 0x463726, { rings: 5, rough: 0.56, repeat: 3 });
  const hide = leatherSurface(5150);
  // Finer, softer grain for plush and felt — same generator, different seed.
  const fuzz = leatherSurface(9317, { size: 256 });
  const resin = bakeliteSurface(606);
  const checker = checkerSurface(31, 15);
  const etch = etchSurface(1212);

  const std = (o) => new THREE.MeshStandardMaterial(o);

  const L = {
    // ---- ferrous ----------------------------------------------------------
    /** Deep blued receiver steel — the default WWII gun-metal. */
    blued: std({
      color: 0x4d545e, metalness: 1.0, roughness: 0.34, envMapIntensity: 1.15,
      ...blued,
    }),
    /** Machined bright parts: bolts, pins, charging handles, cylinder flutes. */
    machined: std({
      color: 0x7e8794, metalness: 1.0, roughness: 0.26, envMapIntensity: 1.3,
      ...machined,
    }),
    /** Parkerised / phosphate: matte, hungry, drinks the light. */
    phosphate: std({
      color: 0x51544e, metalness: 1.0, roughness: 0.66, envMapIntensity: 0.9,
      ...phos,
    }),
    /** Stamped sheet steel — MP40 housings, magazine bodies, shrouds. */
    stamped: std({
      color: 0x5a6069, metalness: 1.0, roughness: 0.44, envMapIntensity: 1.1,
      ...stamp,
    }),
    /** Polished, near-mirror steel — bolt faces, sight blades, knife blades. */
    polished: std({
      color: 0x99a2ad, metalness: 1.0, roughness: 0.17, envMapIntensity: 1.5,
      ...polish,
    }),
    /** Dark parkerised furniture-adjacent steel, sights and small hardware. */
    ironDark: std({
      color: 0x3a3e44, metalness: 1.0, roughness: 0.42, envMapIntensity: 1.0,
      normalMap: blued.normalMap, roughnessMap: phos.roughnessMap,
    }),
    /** Cartridge brass / bronze fittings. */
    brass: std({
      color: 0xb08b3e, metalness: 1.0, roughness: 0.31, envMapIntensity: 1.35,
      normalMap: machined.normalMap, roughnessMap: machined.roughnessMap,
    }),
    copper: std({
      color: 0xa9613a, metalness: 1.0, roughness: 0.36, envMapIntensity: 1.25,
      normalMap: machined.normalMap, roughnessMap: machined.roughnessMap,
    }),

    // ---- non-metals -------------------------------------------------------
    wood: std({ color: 0xffffff, metalness: 0.0, roughness: 0.62, envMapIntensity: 0.42, ...walnut }),
    woodDark: std({ color: 0xffffff, metalness: 0.0, roughness: 0.66, envMapIntensity: 0.38, ...walnutDark }),
    woodLight: std({ color: 0xffffff, metalness: 0.0, roughness: 0.58, envMapIntensity: 0.45, ...beech }),
    /** Checkered wood — grip panels, stock wrists. */
    woodChecker: std({
      color: 0x6c4726, metalness: 0.0, roughness: 0.68, envMapIntensity: 0.38,
      map: walnutDark.map, normalMap: checker.normalMap, roughnessMap: checker.roughnessMap,
      normalScale: new THREE.Vector2(0.32, 0.32),
    }),
    bakelite: std({
      color: 0x582a1a, metalness: 0.0, roughness: 0.44, envMapIntensity: 0.9, ...resin,
    }),
    /** Black polymer — modern furniture, pistol grips, rails. */
    polymer: std({
      color: 0x25272b, metalness: 0.0, roughness: 0.55, envMapIntensity: 0.7,
      normalMap: resin.normalMap, roughnessMap: phos.roughnessMap,
    }),
    polymerTan: std({
      color: 0x6d6248, metalness: 0.0, roughness: 0.6, envMapIntensity: 0.7,
      normalMap: resin.normalMap, roughnessMap: phos.roughnessMap,
    }),
    /** Stippled/checkered polymer grip surface. */
    grip: std({
      color: 0x1a1c1f, metalness: 0.0, roughness: 0.74, envMapIntensity: 0.5,
      normalMap: checker.normalMap, roughnessMap: checker.roughnessMap,
      normalScale: new THREE.Vector2(0.30, 0.30),
    }),
    rubber: std({ color: 0x17181a, metalness: 0.0, roughness: 0.86, envMapIntensity: 0.4, normalMap: hide.normalMap }),
    leather: std({
      color: 0x3a2e21, metalness: 0.0, roughness: 0.78, envMapIntensity: 0.6, ...hide,
    }),
    /** Combat glove — the hands. */
    glove: std({
      color: 0x211d19, metalness: 0.0, roughness: 0.82, envMapIntensity: 0.55, ...hide,
    }),
    gloveDark: std({
      color: 0x141311, metalness: 0.0, roughness: 0.86, envMapIntensity: 0.5, ...hide,
    }),
    canvasStrap: std({
      color: 0x2e2f26, metalness: 0.0, roughness: 0.9, envMapIntensity: 0.4,
      normalMap: hide.normalMap, roughnessMap: hide.roughnessMap,
    }),
    /** The inside of a barrel. Reads as a real hole. */
    bore: std({ color: 0x050506, metalness: 0.35, roughness: 0.85, envMapIntensity: 0.15 }),
    /** Recessed interiors: ejection ports, cooling holes, magwells. */
    cavity: std({ color: 0x0b0c0e, metalness: 0.6, roughness: 0.55, envMapIntensity: 0.35 }),
    glass: std({
      color: 0x0c1a26, metalness: 0.2, roughness: 0.06, envMapIntensity: 2.2,
      transparent: true, opacity: 0.55, depthWrite: false,
    }),
    lens: std({
      color: 0x0a1420, metalness: 0.8, roughness: 0.07, envMapIntensity: 2.4,
      emissive: 0x1d3f5c, emissiveIntensity: 0.35,
    }),

    // ---- emissives --------------------------------------------------------
    rayGlow: std({ color: 0x0b2417, emissive: 0x2aff7a, emissiveIntensity: 1.25, roughness: 0.35, metalness: 0.2 }),
    rayGlass: std({ color: 0x0a2016, emissive: 0x38ff8c, emissiveIntensity: 0.85, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.85 }),
    teslaGlow: std({ color: 0x081426, emissive: 0x49a5ff, emissiveIntensity: 1.5, roughness: 0.35, metalness: 0.2 }),
    teslaGlass: std({ color: 0x082430, emissive: 0x50d8f5, emissiveIntensity: 1.05, roughness: 0.1, metalness: 0.15, transparent: true, opacity: 0.8 }),
    dot: std({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 4.0, roughness: 0.4 }),

    // ---- Monkey Bomb ------------------------------------------------------
    // A 1940s wind-up toy strapped with demolition charges. Everything soft is
    // fully dielectric and rough with a fine grain; everything metal is
    // metalness 1.0 with a real roughness map, so the sky probe breaks across
    // the cymbals instead of leaving them a flat yellow disc.
    /** Worn plush, matted and grubby at the seams. */
    toyFur: std({ color: 0x6a4a2c, metalness: 0.0, roughness: 0.97, envMapIntensity: 0.45, ...fuzz }),
    /** Pale plush: face, muzzle, ears, palms. */
    toyFurPale: std({ color: 0xc9b189, metalness: 0.0, roughness: 0.95, envMapIntensity: 0.5, ...fuzz }),
    /** Red felt jacket and fez, faded and rubbed thin on the edges. */
    toyFelt: std({ color: 0x8e1a17, metalness: 0.0, roughness: 0.93, envMapIntensity: 0.5, ...fuzz }),
    toyFeltDark: std({ color: 0x4d0f0e, metalness: 0.0, roughness: 0.94, envMapIntensity: 0.45, ...fuzz }),
    /** Gold braid and buttons — tarnished, not chrome. */
    toyGold: std({
      color: 0xa8802f, metalness: 1.0, roughness: 0.38, envMapIntensity: 1.25,
      normalMap: machined.normalMap, roughnessMap: machined.roughnessMap,
    }),
    /** Struck brass. Deliberately the brightest thing on the toy. */
    toyCymbal: std({
      color: 0xc39a44, metalness: 1.0, roughness: 0.22, envMapIntensity: 1.7,
      normalMap: polish.normalMap, roughnessMap: polish.roughnessMap,
    }),
    /** Waxed-paper demolition charge. */
    toyCharge: std({ color: 0x6d6647, metalness: 0.0, roughness: 0.82, envMapIntensity: 0.5, normalMap: hide.normalMap }),
    /** Friction tape holding the charges on. */
    toyTape: std({ color: 0x14140f, metalness: 0.0, roughness: 0.72, envMapIntensity: 0.35, normalMap: hide.normalMap }),
    toyWireRed: std({ color: 0x8a1410, metalness: 0.0, roughness: 0.5, envMapIntensity: 0.6 }),
    toyWireBlue: std({ color: 0x1b3d6b, metalness: 0.0, roughness: 0.5, envMapIntensity: 0.6 }),
    /** Bakelite detonator housing. */
    toyDet: std({ color: 0x1d1a16, metalness: 0.0, roughness: 0.45, envMapIntensity: 0.7, ...resin }),
    /** The arming lamp. Bloom catches this. */
    toyLamp: std({ color: 0x2a0603, emissive: 0xff3a1a, emissiveIntensity: 2.6, roughness: 0.3, metalness: 0.1 }),
    toyEye: std({ color: 0xd8d2c6, metalness: 0.0, roughness: 0.24, envMapIntensity: 1.0 }),
    toyPupil: std({ color: 0x0b0906, metalness: 0.0, roughness: 0.18, envMapIntensity: 1.2 }),
    /**
     * The reticle itself. Unlit and untonemapped so the dot survives AgX at
     * any exposure, additive so it reads as light on the glass rather than a
     * painted spot, and depth-write-free so it never punches a hole in the
     * elements around it. Luminance is deliberately above the bloom threshold.
     */
    dotCore: new THREE.MeshBasicMaterial({
      color: 0xff5a3a, toneMapped: false, transparent: true, opacity: 1,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }),
    dotHalo: new THREE.MeshBasicMaterial({
      color: 0xff2a12, toneMapped: false, transparent: true, opacity: 0.26,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }),

    // ---- Pack-a-Punch -----------------------------------------------------
    /** Dark anodised alloy body. */
    papBody: std({
      color: 0x2b2434, metalness: 1.0, roughness: 0.22, envMapIntensity: 1.45,
      normalMap: blued.normalMap, roughnessMap: polish.roughnessMap,
    }),
    /** Etched panelling that glows in the engraving. */
    papEtch: std({
      color: 0x1f1b2b, metalness: 1.0, roughness: 0.26, envMapIntensity: 1.4,
      normalMap: etch.normalMap, emissiveMap: etch.emissiveMap,
      emissive: 0xa24bff, emissiveIntensity: 1.35,
    }),
    /** Polished chrome trim. */
    papChrome: std({
      color: 0xc6cfda, metalness: 1.0, roughness: 0.11, envMapIntensity: 1.8,
      normalMap: polish.normalMap, roughnessMap: polish.roughnessMap,
    }),
    papDark: std({
      color: 0x4a4356, metalness: 1.0, roughness: 0.28, envMapIntensity: 1.3,
      normalMap: blued.normalMap, roughnessMap: blued.roughnessMap,
    }),
    /** Hot accent strips — these bloom. */
    papGlow: std({ color: 0x1a0a2a, emissive: 0xb45cff, emissiveIntensity: 2.4, roughness: 0.3, metalness: 0.2 }),
    papCore: std({ color: 0x2a1040, emissive: 0xff7ae0, emissiveIntensity: 2.8, roughness: 0.25, metalness: 0.1 }),
  };

  // ---- legacy aliases kept so older call sites keep working ---------------
  L.steel = L.blued;
  L.steelDark = L.ironDark;
  L.steelLight = L.machined;

  // Shared library materials must survive disposePapDisplayWeapon().
  for (const k of Object.keys(L)) L[k].userData.wmShared = true;

  return L;
}
