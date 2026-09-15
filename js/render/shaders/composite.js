// The final composite: exposure, tone mapping, grading and film effects.
import { COMMON } from './common.js';

// ---------------------------------------------------------------------------
// Final composite: bloom + lens dirt, exposure, AgX tonemap, grade, CA,
// vignette, grain, and contrast-adaptive sharpening.
// ---------------------------------------------------------------------------
export const COMPOSITE_FRAG = COMMON + /* glsl */`
uniform sampler2D uColor;
uniform sampler2D uBloom;
uniform sampler2D uDepth;
uniform sampler2D uAdaptedLum;
uniform vec2 uResolution;
uniform float uTime;
uniform float uExposure;
uniform float uAutoExposure;   // 0 = fixed, 1 = fully automatic
uniform float uKeyValue;       // target middle grey
uniform float uBloomStrength;
uniform float uChromatic;
uniform float uVignette;
uniform float uGrain;
uniform float uSharpen;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform float uDamage;        // red flash from taking a hit
uniform float uNear, uFar;
uniform float uDofStrength;
uniform float uFlash;

// ---- AgX (Troy Sobotka / Blender) ----------------------------------------
// Highlights desaturate toward white instead of clipping to a hue, which is
// what makes muzzle flashes and lamps read like film rather than like clipping.
const mat3 AgXInset = mat3(
  0.8567603, 0.0985376, 0.0447021,
  0.1373235, 0.7612162, 0.1010603,
  0.0058968, 0.1402462, 0.8542472
);
const mat3 AgXOutset = mat3(
   1.1271005, -0.1413297, -0.0141419,
  -0.1413297,  1.1578237, -0.1500961,
  -0.0141419, -0.0164928,  1.1642579
);

vec3 agxDefaultContrastApprox(vec3 x) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return + 15.5     * x4 * x2
         - 40.14    * x4 * x
         + 31.96    * x4
         - 6.868    * x2 * x
         + 0.4298   * x2
         + 0.1191   * x
         - 0.00232;
}

vec3 agx(vec3 col) {
  const float minEv = -12.47393;
  const float maxEv = 4.026069;
  col = AgXInset * max(col, vec3(0.0));
  col = clamp(log2(max(col, 1e-10)), minEv, maxEv);
  col = (col - minEv) / (maxEv - minEv);
  col = agxDefaultContrastApprox(col);
  col = AgXOutset * col;
  return pow(max(col, vec3(0.0)), vec3(2.2)); // back to linear for grading
}

vec3 grade(vec3 c) {
  c = c * uGain + uLift * (1.0 - c);
  c = pow(max(c, vec3(1e-5)), 1.0 / max(uGamma, vec3(1e-3)));
  float l = luma(c);
  c = mix(vec3(l), c, uSaturation);
  c = (c - 0.5) * uContrast + 0.5;
  return c;
}

void main() {
  vec2 uv = vUv;
  vec2 fromCenter = uv - 0.5;
  float r2 = dot(fromCenter, fromCenter);

  // ---- chromatic aberration (radial, stronger at the frame edge) ----
  float ca = uChromatic * (0.35 + r2 * 2.6);
  vec2 caOff = fromCenter * ca * 0.01;
  vec3 col;
  col.r = texture2D(uColor, uv + caOff).r;
  col.g = texture2D(uColor, uv).g;
  col.b = texture2D(uColor, uv - caOff).b;
  // Contain a bad pixel to itself: without this the sharpen and bloom taps
  // below spread a single NaN across a whole neighbourhood.
  col = safeRGB(col);

  // ---- RCAS-style sharpening in HDR ---------------------------------------
  // This used to be a raw unsharp mask:
  //     sharp = col * (1 + 4k) - (n + s + e + w) * k,   k = uSharpen * amp
  // with k per channel and the result only clamped at zero. Three consequences,
  // all of them visible in game and all of them fixed here:
  //
  //  1. UNBOUNDED UNDERSHOOT. On the dark side of a high-contrast edge the
  //     expression goes negative and max(.,0) pinned it to black. Measured at
  //     the factory wall's top edge against the moonlit sky: the row directly
  //     under the silhouette came out (7,21,57) with neighbours (30,57,77) above
  //     and (0,29,61) below — a one-pixel line darker than anything around it.
  //     That is the "horizontal black lines" that show up along wall tops,
  //     stair risers and catwalk lips, and slide around the frame as the camera
  //     moves because they follow whatever hard horizontal edge is on screen.
  //  2. PER-CHANNEL WEIGHTS. amp was a vec3, so on a blue-lit night edge green
  //     and blue undershot much harder than red and the halo was not grey, it
  //     was ORANGE. Measured on the same edge at the bright end: (123,74,97)
  //     between a sky of (129,153,171) and a wall of (70,95,118) — red above
  //     green and blue, i.e. a full-width orange line where none exists in the
  //     scene. The weight is now a single achromatic scalar, so sharpening can
  //     change local contrast but can never change hue.
  //  3. HDR-BLIND AMPLITUDE. min(mn, 2.0 - mx) collapses to zero the moment any
  //     channel passes 2.0, which in an HDR buffer is most of the moonlit sky,
  //     so the amplitude term was effectively random across the frame. It is
  //     now measured on a tone-mapped proxy that behaves the same at every
  //     exposure.
  //
  // The kernel is also normalised (÷ 1 - 4k) so a flat region is returned
  // exactly unchanged instead of being scaled, and the result is limited to the
  // 5-tap neighbourhood — the anti-ringing clamp AMD's RCAS uses. Sharpening
  // may steepen an edge, but it can no longer invent a pixel darker or brighter
  // than everything touching it, which is precisely what a halo line is.
  if (uSharpen > 0.001) {
    vec2 t = 1.0 / uResolution;
    vec3 cn = safeRGB(texture2D(uColor, uv + vec2(0.0, t.y)).rgb);
    vec3 cs = safeRGB(texture2D(uColor, uv - vec2(0.0, t.y)).rgb);
    vec3 ce = safeRGB(texture2D(uColor, uv + vec2(t.x, 0.0)).rgb);
    vec3 cw = safeRGB(texture2D(uColor, uv - vec2(t.x, 0.0)).rgb);
    vec3 mn = max(min(col, min(min(cn, cs), min(ce, cw))), vec3(0.0));
    vec3 mx = max(col, max(max(cn, cs), max(ce, cw)));
    float lmn = luma(mn), lmx = luma(mx);
    lmn = lmn / (1.0 + lmn);
    lmx = lmx / (1.0 + lmx);
    float amp = sqrt(clamp(min(lmn, 1.0 - lmx) / max(lmx, 1e-4), 0.0, 1.0));
    float k = amp * mix(0.125, 0.2, clamp(uSharpen, 0.0, 1.0));
    vec3 sharp = (col - k * (cn + cs + ce + cw)) / max(1.0 - 4.0 * k, 1e-3);
    col = clamp(sharp, mn, mx);
  }

  // ---- bloom + lens dirt ----
  vec3 bloom = texture2D(uBloom, uv).rgb;
  float dirt = 0.6 + 0.9 * hash12(floor(uv * 26.0)) * smoothstep(0.02, 0.35, r2);
  col += bloom * uBloomStrength * dirt;

  // ---- exposure, tonemap, grade ----
  // Auto-exposure scales the authored baseline rather than replacing it, so
  // the art direction still sets the look and adaptation only compensates for
  // how much light the player is actually standing in.
  float autoScale = 1.0;
  if (uAutoExposure > 0.001) {
    float adapted = safeVal(texture2D(uAdaptedLum, vec2(0.5)).r, 1e-4, 64.0);
    // Ceiling deliberately modest: adaptation should rescue a dark room, not
    // turn an unlit factory into daylight.
    autoScale = mix(1.0, clamp(uKeyValue / adapted, 0.6, 2.1), uAutoExposure);
  }
  col *= uExposure * autoScale;
  col += uFlash;
  col = agx(col);
  col = grade(col);

  // ---- damage / vignette ----
  col = mix(col, col * vec3(1.25, 0.22, 0.18), uDamage * smoothstep(0.02, 0.28, r2));
  float vig = 1.0 - uVignette * smoothstep(0.05, 0.75, r2);
  col *= vig;

  // ---- film grain (luminance-weighted, quieter in the highlights) ----
  float g = hash13(vec3(gl_FragCoord.xy, fract(uTime) * 1000.0)) - 0.5;
  col += g * uGrain * (0.25 + 0.75 * (1.0 - smoothstep(0.0, 0.85, luma(col))));

  gl_FragColor = vec4(linearToSRGB(max(col, vec3(0.0))), 1.0);
}
`;
