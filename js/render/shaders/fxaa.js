// FXAA, the last pass, on the sRGB image. It doesn't use COMMON.

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
