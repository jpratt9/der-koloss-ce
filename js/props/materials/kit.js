// The shared kit every prop generator draws through: the seeded PRNG, a
// canvas, the CanvasTexture finish that sets the map-matching filtering, the
// box blur and Sobel that turn a height field into a normal map, the BLUR
// table of per-generator radii, and the value-noise blotches.
import * as THREE from 'three';

export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mkCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function finish(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  // Trilinear (three's default minFilter for a mipmapped texture) plus the
  // same anisotropy the map's surfaces get in map.js and assets.js. A door
  // jamb, a machine flank and a crate side are all long surfaces you walk
  // past, so they are almost always minified far harder along one axis than
  // the other; at low anisotropy the sampler has to pick one mip for both and
  // the cast-iron grain smears into a moire ladder as you move. three clamps
  // this to the device maximum, so 16 is a request, not a requirement.
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 16;
  return t;
}

/** Separable box blur of a canvas's red channel, wrapping at the edges. */
function boxBlur(data, S, H, radius) {
  const src = new Float32Array(S * H);
  for (let i = 0; i < S * H; i++) src[i] = data[i * 4];
  const tmp = new Float32Array(S * H);
  const n = radius * 2 + 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < S; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += src[y * S + ((x + k + S) % S)];
      tmp[y * S + x] = s / n;
    }
  }
  for (let x = 0; x < S; x++) {
    for (let y = 0; y < H; y++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += tmp[(((y + k + H) % H) * S) + x];
      src[y * S + x] = s / n;
    }
  }
  return src;
}

// Blur radius in texels, applied to a height field before its Sobel. Every
// generator gets its OWN, and every generator must pass one explicitly.
//
// The height field is blurred for the same reason the map's brick is (see
// makeBrickMaps in map.js): these generators draw their detail as one- and
// two-pixel rectangles — 14000 grains of sand-cast speckle, 2600 dots of orange
// peel, 220 casting pits — so a raw Sobel across them produces a normal that
// swings most of a right angle between adjacent texels. No amount of mip
// filtering or anisotropy can band-limit a signal like that: the mip chain
// averages the NORMALS and three renormalises whatever it reads back, so the
// surface's response to the sodium lamps flips direction with every sub-pixel
// step of the camera. That is the crawling flicker on the door-jamb rivets and
// flanges.
//
// But the radius CANNOT be shared. A box blur of radius r is a kernel
// n = 2r + 1 texels wide: it leaves anything wider than n essentially intact
// and crushes a feature of width w to roughly w/n. So the radius has to be read
// off the SMALLEST FEATURE THAT GENERATOR ACTUALLY DRAWS. Pick it from the
// micro-speckle and the plank generator loses its woodgrain; pick it from the
// authored relief and the cast-iron speckle goes on aliasing. One number cannot
// serve a generator stamping 1-texel grains and one drawing 100-texel planks.
//
// For scale: at the props' UV density (1.1 tiles/m on a 512px map) one texel is
// about 1.8mm of real surface.
export const BLUR = {
  // Smallest authored feature: a casting pit at the bottom of its size range,
  // `arc(rad = 1.5..6)` — 3 texels across. Everything else in the height field
  // is 14000 one-to-three-texel grains at +/-50 levels, which is 21% of the map
  // by area and by far the densest micro-speckle in the library; the jamb is
  // built from this and it led the flicker table. n = 5 holds a 3-texel pit and
  // takes the 1-texel grain to a fifth. This is the same radius the brick picked
  // for its 3-texel mortar joint, for the same reason.
  castIron: 2,
  // Smallest authored feature: a paint chip at the bottom of its size range,
  // a 5-8 sided polygon at `rad = 2 * (0.55..1.3)` — about 2 texels across.
  // That is the floor, and it is a *smaller* floor than the iron's, so enamel
  // gets LESS blur, not more. Its aliasing load is a fifth of the iron's too:
  // 2600 orange-peel dots at +/-13 levels is 4% coverage against the iron's 21%
  // at +/-50. The 1-texel scuffs do get flattened here, deliberately — they are
  // drawn a texel wide, which is exactly the unresolvable case, and the same
  // scratch is carried at full contrast by the colour map, which is untouched.
  enamel: 1,
  // No authored feature at all: the entire height field is 900 rectangles one
  // texel wide, and the turned streaks and tarnish that make brass read as brass
  // live in the colour and roughness maps. There is nothing here to preserve, so
  // the radius is set by the content alone — 1 texel wide, so n = 5 to put it
  // well under the sampler. What survives is the faint mottle a polished casting
  // should have. (Small lever: at +/-11 levels and 0.9 relief a brass texel step
  // is 2.5 degrees of normal, so this was never the loud one.)
  brass: 2,
  // The tight one, and the reason a shared radius had to go. Plank draws BOTH
  // the coarsest steps in the library — a 4-texel gap between boards, 138 levels
  // deep at 2.4 relief — and the finest authored detail: grain strokes at
  // `lineWidth = 0.6..2.4`, mean 1.5 texels. That woodgrain IS the surface, and
  // n = 5 would take it to 30% and turn the 4-texel board gap into a rounded
  // groove with its two edges merged. n = 3 is the ceiling here: it holds the
  // gap at full depth and leaves the grain readable. Raising this to match the
  // iron would buy a better oscillation number by sanding the crates smooth,
  // which is not a trade this project makes.
  plank: 1,
};

// Sobel height -> tangent-space normal. `strength` is the slope multiplier,
// `blur` the band-limiting radius from BLUR above — pass one, always.
//
// The blur costs no visible detail at the radii chosen above. A one-texel grain
// on a 512px map wrapped around a 2m machine is under two millimetres of relief
// with an amplitude of a fifth of a level: you cannot see it, you can only see
// it alias.
export function normalFromHeight(hCanvas, strength, blur) {
  // Loud rather than silent: `undefined > 0` is false, so a forgotten radius
  // would quietly ship a raw Sobel and put the crawl straight back.
  if (!(blur >= 0)) throw new Error('normalFromHeight: pass a BLUR radius for this generator');
  const S = hCanvas.width, H = hCanvas.height;
  const raw = hCanvas.getContext('2d').getImageData(0, 0, S, H).data;
  const src = blur > 0 ? boxBlur(raw, S, H, blur) : null;
  const out = mkCanvas(S, H);
  const og = out.getContext('2d');
  const img = og.createImageData(S, H);
  const at = src
    ? (x, y) => src[(((y % H) + H) % H) * S + (((x % S) + S) % S)] / 255
    : (x, y) => raw[((((y % H) + H) % H) * S + (((x % S) + S) % S)) * 4] / 255;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * S + x) * 4;
      img.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      img.data[i + 2] = inv * 255;
      img.data[i + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}

/** Fill a canvas with value-noise blotches. Used for grime, tarnish and rust. */
export function blotches(g, S, count, radius, colorFn, R, H = S) {
  for (let i = 0; i < count; i++) {
    const x = R() * S, y = R() * H, r = radius[0] + R() * (radius[1] - radius[0]);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const [c0, c1] = colorFn(R);
    grad.addColorStop(0, c0); grad.addColorStop(1, c1);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

export function hexRGB(hex) {
  const c = new THREE.Color(hex);
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
}
