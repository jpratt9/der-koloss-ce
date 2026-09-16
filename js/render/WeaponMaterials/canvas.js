// Canvas helpers: the seeded PRNG every generator draws through, a 2D
// context, a CanvasTexture wrapper, and the Sobel that turns a height field
// into a tangent-space normal map.
import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas2d(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, g: c.getContext('2d', { willReadFrequently: true }) };
}

export function texture(c, { srgb = false, repeat = 1, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.repeat.set(repeat, repeat);
  t.needsUpdate = true;
  return t;
}

// Sobel height -> tangent-space normal.
//
// NO BAND-LIMITING BLUR, DELIBERATELY — the one height-field path in the project
// without one. map.js box-blurs the brick; props/materials.js carries a
// per-generator BLUR table and throws without a radius; Materials.js's
// detailNormalTexture is exempt because it is band-limited by construction. This
// one is exempt for a different reason, and it was measured rather than assumed.
//
// A pre-blur only band-limits the BASE level, so it is the right tool exactly
// when a surface is read at around one texel per pixel — that is where the
// sampler has no mip to fall back on. The props live there: ~556 texels/m read
// from 1.5 m is 1.9 texels/pixel, and radius 2 takes castIron's per-texel normal
// swing from 4.13 deg to 0.88 at mip 0 and 4.79 to 1.39 at mip 1. That is the
// whole reason that table exists.
//
// Weapon surfaces are never there. Measured on the shipped 110/75-degree cameras
// at a 1920x1080 render target, p50 texels per pixel:
//   viewmodel, hip   ironDark 0.60, machined 0.85, phosphate 1.03, blued 1.05,
//                    glove 1.07, woodChecker 2.57 — magnified, not minified.
//   viewmodel, ADS   ~22% lower again. renderViewmodel() narrows the viewmodel
//                    lens to 58.5 deg, so aiming MAGNIFIES the receiver and the
//                    rear sight further. ADS is the safe end, not the risky one.
//   world display    the mystery-box prize, the Pack-a-Punch output and the
//                    rifle on a teammate's back are this same library at
//                    authored metres: >=2.9 texels/px at 1 m, >=5.7 at 2 m, >=14
//                    at 5 m, and past 1.5 m no part of the weapon is left in the
//                    1-3 band at all.
//   wall buys        do not use these maps — weaponSilhouette.js rasterises the
//                    geometry into flat line art instead.
// So the viewmodel sits below the window and the world weapons sit well above
// it. On `machined`, radius 2 removes 66% of the tangential amplitude at mip 0
// and 7% at mip 4 — and the world weapons read mip 2.5 and up.
//
// The raw per-texel swing looks alarming (machined 4.83 deg, hide 4.84, checker
// 12.5, against castIron's pre-fix 4.13) but it is not aliasing. With the game
// loop stopped — a still frame differences to exactly zero, and restoring the
// textures returns to exactly zero — stepping 1/3 of a pixel and scoring the
// excess total variation over three frames:
//   viewmodel (40108 px on screen, 13361 of them moving) the normal maps are 54%
//   of the oscillation and radius 2 would remove 42% of it; under 4x
//   supersampling that share is still 53%. Aliasing falls when you raise the
//   sampling rate. This does not move. The absolute figure does fall, 15707 ->
//   9820, which is silhouette aliasing being resolved — the metric can see
//   aliasing, there simply is none here. What radius 2 would delete is 42% of
//   the machining lines and scratches, about one screen pixel wide each, on the
//   one object the player looks at all game.
//   world weapon the maps are 14% of the oscillation at 1 m, 10% at 2 m, 5% at
//   3 m and nothing by 5 m — and that share refuses to fall under supersampling
//   too (14% -> 26%, and up in absolute terms). Mipmaps plus anisotropy 8 are
//   already carrying it; the remainder is silhouette, which no texture filter
//   reaches.
//
// Both halves matter, because there is ONE shared library: a radius chosen for
// the world weapons is charged in full to the viewmodel, and the bill would be
// 42% of its relief to fix an aliasing defect that exists on neither path.
// Blurring a magnified texture is not band-limiting, it is shipping a fifth of
// the resolution.
//
// If this is ever revisited, the two numbers that decide it are texels per pixel
// on the surface in question and whether the oscillation falls under
// supersampling. An A/B here is clean: every generator is seeded through
// `rng(seed)`, there is no Math.random in js/render/WeaponMaterials/, and each
// map hashes bit-identical across page loads — unlike detailNormalTexture
// and the brick speckle, which rebuild differently every load.
/** Sobel a luminance canvas into a tangent-space normal map canvas. */
export function normalFromHeight(src, size, strength) {
  const sg = src.getContext('2d', { willReadFrequently: true });
  const h = sg.getImageData(0, 0, size, size).data;
  const { c, g } = canvas2d(size);
  const out = g.createImageData(size, size);
  const at = (x, y) => h[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      let nx = -dx, ny = -dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      out.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  return c;
}

