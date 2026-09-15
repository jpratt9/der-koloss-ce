// GLSL library for the deferred post stack.
// Every pass reads the scene depth buffer, so the reconstruction helpers live
// in one place and are string-concatenated into each fragment shader.

import { COMMON } from './shaders/common.js';
export { COMMON };
export { AO_FRAG, AO_BLUR_FRAG } from './shaders/ao.js';
export { VOLUMETRIC_FRAG, VOL_UPSAMPLE_FRAG } from './shaders/volumetric.js';
export { SSR_FRAG } from './shaders/ssr.js';
export { MOTION_BLUR_FRAG } from './shaders/motion-blur.js';

// ---------------------------------------------------------------------------
// Bloom — threshold + dual filter down/up chain (Call of Duty: AW style).
// ---------------------------------------------------------------------------
export const BLOOM_PREFILTER_FRAG = COMMON + /* glsl */`
uniform sampler2D uColor;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uSoftKnee;
uniform float uClamp;

vec3 karis(vec3 c) { return c / (1.0 + luma(c)); }

void main() {
  // 4-tap box with Karis average kills single-pixel fireflies before they bloom.
  // safeRGB on entry: the bloom chain is a cascade of blurs, so an unfiltered
  // NaN here would smear over a large part of the frame by the last mip.
  vec3 a = safeRGB(texture2D(uColor, vUv + uTexel * vec2(-1.0, -1.0)).rgb);
  vec3 b = safeRGB(texture2D(uColor, vUv + uTexel * vec2( 1.0, -1.0)).rgb);
  vec3 c = safeRGB(texture2D(uColor, vUv + uTexel * vec2(-1.0,  1.0)).rgb);
  vec3 e = safeRGB(texture2D(uColor, vUv + uTexel * vec2( 1.0,  1.0)).rgb);
  vec3 col = (karis(a) + karis(b) + karis(c) + karis(e)) * 0.25;
  col = min(col, vec3(uClamp));

  float br = max(col.r, max(col.g, col.b));
  float knee = uThreshold * uSoftKnee + 1e-5;
  float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-5);
  gl_FragColor = vec4(col * contrib, 1.0);
}
`;

export const BLOOM_DOWN_FRAG = COMMON + /* glsl */`
uniform sampler2D uColor;
uniform vec2 uTexel;
void main() {
  // 13-tap partial Karis downsample (Jimenez, SIGGRAPH 2014).
  vec3 a = texture2D(uColor, vUv + uTexel * vec2(-2.0,  2.0)).rgb;
  vec3 b = texture2D(uColor, vUv + uTexel * vec2( 0.0,  2.0)).rgb;
  vec3 c = texture2D(uColor, vUv + uTexel * vec2( 2.0,  2.0)).rgb;
  vec3 d = texture2D(uColor, vUv + uTexel * vec2(-2.0,  0.0)).rgb;
  vec3 e = texture2D(uColor, vUv).rgb;
  vec3 f = texture2D(uColor, vUv + uTexel * vec2( 2.0,  0.0)).rgb;
  vec3 g = texture2D(uColor, vUv + uTexel * vec2(-2.0, -2.0)).rgb;
  vec3 h = texture2D(uColor, vUv + uTexel * vec2( 0.0, -2.0)).rgb;
  vec3 i = texture2D(uColor, vUv + uTexel * vec2( 2.0, -2.0)).rgb;
  vec3 j = texture2D(uColor, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  vec3 k = texture2D(uColor, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  vec3 l = texture2D(uColor, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  vec3 m = texture2D(uColor, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  vec3 col = e * 0.125;
  col += (a + c + g + i) * 0.03125;
  col += (b + d + f + h) * 0.0625;
  col += (j + k + l + m) * 0.125;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const BLOOM_UP_FRAG = COMMON + /* glsl */`
uniform sampler2D uColor;   // the smaller mip being upsampled
uniform sampler2D uPrev;    // the larger mip it is added onto
uniform vec2 uTexel;
uniform float uRadius;
void main() {
  vec2 r = uTexel * uRadius;
  vec3 a = texture2D(uColor, vUv + vec2(-r.x,  r.y)).rgb;
  vec3 b = texture2D(uColor, vUv + vec2( 0.0,  r.y)).rgb;
  vec3 c = texture2D(uColor, vUv + vec2( r.x,  r.y)).rgb;
  vec3 d = texture2D(uColor, vUv + vec2(-r.x,  0.0)).rgb;
  vec3 e = texture2D(uColor, vUv).rgb;
  vec3 f = texture2D(uColor, vUv + vec2( r.x,  0.0)).rgb;
  vec3 g = texture2D(uColor, vUv + vec2(-r.x, -r.y)).rgb;
  vec3 h = texture2D(uColor, vUv + vec2( 0.0, -r.y)).rgb;
  vec3 i = texture2D(uColor, vUv + vec2( r.x, -r.y)).rgb;
  vec3 tent = (e * 4.0 + (b + d + f + h) * 2.0 + (a + c + g + i)) / 16.0;
  gl_FragColor = vec4(texture2D(uPrev, vUv).rgb + tent, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Auto-exposure.
//
// A fixed exposure cannot serve both a moonlit courtyard and an unpowered
// factory interior: tuned for the courtyard the interior is unnavigable, and
// tuned for the interior the courtyard blows out. These three passes measure
// the frame's average luminance on the GPU and adapt toward it over time, the
// way an eye does walking indoors.
//
// Everything stays on the GPU — a CPU readback of even one pixel would stall
// the pipeline every frame.
// ---------------------------------------------------------------------------

/** Pass 1: log-luminance, downsampled 4x in one step. */
export const LUM_DOWN_FRAG = COMMON + /* glsl */`
uniform sampler2D uColor;
uniform vec2 uTexel;
uniform float uIsFirst;
void main() {
  float sum = 0.0;
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      vec2 uv = vUv + (vec2(float(x), float(y)) - 1.5) * uTexel;
      vec3 c = texture2D(uColor, uv).rgb;
      // Average in log space: the geometric mean is far less swayed by a
      // single muzzle flash or lamp than the arithmetic mean.
      // safeVal, not max: this is the gate that keeps a NaN in the HDR buffer
      // out of the exposure feedback loop.
      sum += uIsFirst > 0.5
        ? log(safeVal(luma(c), 1e-4, 65504.0))
        : safeVal(c.r, -12.0, 12.0);   // later passes carry log values
    }
  }
  gl_FragColor = vec4(vec3(sum / 16.0), 1.0);
}
`;

/** Pass 2: 1x1 running adaptation, ping-ponged against the previous frame. */
export const LUM_ADAPT_FRAG = COMMON + /* glsl */`
uniform sampler2D uCurrent;    // 1x1 log-average of this frame
uniform sampler2D uPrevious;   // 1x1 adapted value from last frame
uniform float uDt;
uniform float uSpeedUp;        // adaptation rate when getting brighter
uniform float uSpeedDown;      // ...and when getting darker
uniform float uMinLum;
uniform float uMaxLum;
void main() {
  float target = safeVal(exp(safeVal(texture2D(uCurrent, vec2(0.5)).r, -12.0, 12.0)), uMinLum, uMaxLum);
  float prev = texture2D(uPrevious, vec2(0.5)).r;
  // safeVal both ends: this target is written back into itself next frame, so
  // anything that slips through here is permanent for the life of the page.
  if (!(prev > 0.0)) prev = target;           // first frame, or a poisoned prev
  prev = safeVal(prev, uMinLum, uMaxLum);
  // Adapting down (into the dark) is deliberately slower than adapting up,
  // which is both how eyes work and how it avoids a pumping look when a
  // muzzle flash briefly floods the frame.
  float speed = target > prev ? uSpeedUp : uSpeedDown;
  float adapted = prev + (target - prev) * (1.0 - exp(-uDt * speed));
  gl_FragColor = vec4(vec3(safeVal(adapted, uMinLum, uMaxLum)), 1.0);
}
`;

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

// ---------------------------------------------------------------------------
// FXAA 3.11 (quality preset, trimmed). Runs last, on sRGB output.
// ---------------------------------------------------------------------------
export const FXAA_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uColor;
uniform vec2 uTexel;

#define EDGE_THRESHOLD_MIN 0.0312
#define EDGE_THRESHOLD_MAX 0.125
#define ITERATIONS 12
#define SUBPIXEL_QUALITY 0.75

float rgb2luma(vec3 rgb) { return sqrt(dot(rgb, vec3(0.299, 0.587, 0.114))); }
float quality(int i) {
  if (i < 5) return 1.0;
  if (i == 5) return 1.5;
  if (i < 10) return 2.0;
  if (i == 10) return 4.0;
  return 8.0;
}

void main() {
  vec3 colorCenter = texture2D(uColor, vUv).rgb;
  float lumaCenter = rgb2luma(colorCenter);
  float lumaDown  = rgb2luma(texture2D(uColor, vUv + vec2(0.0, -uTexel.y)).rgb);
  float lumaUp    = rgb2luma(texture2D(uColor, vUv + vec2(0.0,  uTexel.y)).rgb);
  float lumaLeft  = rgb2luma(texture2D(uColor, vUv + vec2(-uTexel.x, 0.0)).rgb);
  float lumaRight = rgb2luma(texture2D(uColor, vUv + vec2( uTexel.x, 0.0)).rgb);

  float lumaMin = min(lumaCenter, min(min(lumaDown, lumaUp), min(lumaLeft, lumaRight)));
  float lumaMax = max(lumaCenter, max(max(lumaDown, lumaUp), max(lumaLeft, lumaRight)));
  float lumaRange = lumaMax - lumaMin;

  if (lumaRange < max(EDGE_THRESHOLD_MIN, lumaMax * EDGE_THRESHOLD_MAX)) {
    gl_FragColor = vec4(colorCenter, 1.0);
    return;
  }

  float lumaDownLeft  = rgb2luma(texture2D(uColor, vUv + vec2(-uTexel.x, -uTexel.y)).rgb);
  float lumaUpRight   = rgb2luma(texture2D(uColor, vUv + vec2( uTexel.x,  uTexel.y)).rgb);
  float lumaUpLeft    = rgb2luma(texture2D(uColor, vUv + vec2(-uTexel.x,  uTexel.y)).rgb);
  float lumaDownRight = rgb2luma(texture2D(uColor, vUv + vec2( uTexel.x, -uTexel.y)).rgb);

  float lumaDownUp = lumaDown + lumaUp;
  float lumaLeftRight = lumaLeft + lumaRight;
  float lumaLeftCorners = lumaDownLeft + lumaUpLeft;
  float lumaDownCorners = lumaDownLeft + lumaDownRight;
  float lumaRightCorners = lumaDownRight + lumaUpRight;
  float lumaUpCorners = lumaUpRight + lumaUpLeft;

  float edgeHorizontal = abs(-2.0 * lumaLeft + lumaLeftCorners) + abs(-2.0 * lumaCenter + lumaDownUp) * 2.0 + abs(-2.0 * lumaRight + lumaRightCorners);
  float edgeVertical   = abs(-2.0 * lumaUp + lumaUpCorners) + abs(-2.0 * lumaCenter + lumaLeftRight) * 2.0 + abs(-2.0 * lumaDown + lumaDownCorners);
  bool isHorizontal = (edgeHorizontal >= edgeVertical);

  float luma1 = isHorizontal ? lumaDown : lumaLeft;
  float luma2 = isHorizontal ? lumaUp : lumaRight;
  float gradient1 = luma1 - lumaCenter;
  float gradient2 = luma2 - lumaCenter;
  bool is1Steepest = abs(gradient1) >= abs(gradient2);
  float gradientScaled = 0.25 * max(abs(gradient1), abs(gradient2));

  float stepLength = isHorizontal ? uTexel.y : uTexel.x;
  float lumaLocalAverage = 0.0;
  if (is1Steepest) { stepLength = -stepLength; lumaLocalAverage = 0.5 * (luma1 + lumaCenter); }
  else { lumaLocalAverage = 0.5 * (luma2 + lumaCenter); }

  vec2 currentUv = vUv;
  if (isHorizontal) currentUv.y += stepLength * 0.5;
  else currentUv.x += stepLength * 0.5;

  vec2 offset = isHorizontal ? vec2(uTexel.x, 0.0) : vec2(0.0, uTexel.y);
  vec2 uv1 = currentUv - offset;
  vec2 uv2 = currentUv + offset;

  float lumaEnd1 = rgb2luma(texture2D(uColor, uv1).rgb) - lumaLocalAverage;
  float lumaEnd2 = rgb2luma(texture2D(uColor, uv2).rgb) - lumaLocalAverage;
  bool reached1 = abs(lumaEnd1) >= gradientScaled;
  bool reached2 = abs(lumaEnd2) >= gradientScaled;
  bool reachedBoth = reached1 && reached2;
  if (!reached1) uv1 -= offset;
  if (!reached2) uv2 += offset;

  if (!reachedBoth) {
    for (int i = 2; i < ITERATIONS; i++) {
      if (!reached1) { lumaEnd1 = rgb2luma(texture2D(uColor, uv1).rgb) - lumaLocalAverage; reached1 = abs(lumaEnd1) >= gradientScaled; }
      if (!reached2) { lumaEnd2 = rgb2luma(texture2D(uColor, uv2).rgb) - lumaLocalAverage; reached2 = abs(lumaEnd2) >= gradientScaled; }
      if (!reached1) uv1 -= offset * quality(i);
      if (!reached2) uv2 += offset * quality(i);
      if (reached1 && reached2) break;
    }
  }

  float distance1 = isHorizontal ? (vUv.x - uv1.x) : (vUv.y - uv1.y);
  float distance2 = isHorizontal ? (uv2.x - vUv.x) : (uv2.y - vUv.y);
  bool isDirection1 = distance1 < distance2;
  float distanceFinal = min(distance1, distance2);
  float edgeThickness = (distance1 + distance2);
  float pixelOffset = -distanceFinal / edgeThickness + 0.5;

  bool isLumaCenterSmaller = lumaCenter < lumaLocalAverage;
  bool correctVariation = ((isDirection1 ? lumaEnd1 : lumaEnd2) < 0.0) != isLumaCenterSmaller;
  float finalOffset = correctVariation ? pixelOffset : 0.0;

  float lumaAverage = (1.0 / 12.0) * (2.0 * (lumaDownUp + lumaLeftRight) + lumaLeftCorners + lumaRightCorners);
  float subPixelOffset1 = clamp(abs(lumaAverage - lumaCenter) / lumaRange, 0.0, 1.0);
  float subPixelOffset2 = (-2.0 * subPixelOffset1 + 3.0) * subPixelOffset1 * subPixelOffset1;
  float subPixelOffsetFinal = subPixelOffset2 * subPixelOffset2 * SUBPIXEL_QUALITY;
  finalOffset = max(finalOffset, subPixelOffsetFinal);

  vec2 finalUv = vUv;
  if (isHorizontal) finalUv.y += finalOffset * stepLength;
  else finalUv.x += finalOffset * stepLength;
  gl_FragColor = vec4(texture2D(uColor, finalUv).rgb, 1.0);
}
`;

export { DOF_FRAG } from './shaders/dof.js';
