// The GLSL every pass but FXAA starts with: depth, noise, NaN hygiene and colour.

export const COMMON = /* glsl */`
precision highp float;
precision highp sampler2D;
varying vec2 vUv;

#define PI  3.14159265359
#define TAU 6.28318530718

// ---- depth ----------------------------------------------------------------
// uDepth stores window-space depth in [0,1]; uProjInv undoes the projection.
float rawDepth(sampler2D d, vec2 uv) { return texture2D(d, uv).x; }

float linearizeDepth(float d, float near, float far) {
  // Returns view-space Z (negative in front of the camera).
  return (near * far) / ((far - near) * d - far);
}

vec3 viewPosFromDepth(vec2 uv, float d, mat4 projInv) {
  vec4 clip = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 v = projInv * clip;
  return v.xyz / v.w;
}

// Min-difference normal reconstruction: picks the shorter of the two depth
// gradients on each axis so silhouettes do not smear a fake bevel.
vec3 normalFromDepth(sampler2D dTex, vec2 uv, vec2 texel, mat4 projInv) {
  float c  = rawDepth(dTex, uv);
  vec3  P  = viewPosFromDepth(uv, c, projInv);
  vec2 dx = vec2(texel.x, 0.0), dy = vec2(0.0, texel.y);
  vec3 pL = viewPosFromDepth(uv - dx, rawDepth(dTex, uv - dx), projInv);
  vec3 pR = viewPosFromDepth(uv + dx, rawDepth(dTex, uv + dx), projInv);
  vec3 pD = viewPosFromDepth(uv - dy, rawDepth(dTex, uv - dy), projInv);
  vec3 pU = viewPosFromDepth(uv + dy, rawDepth(dTex, uv + dy), projInv);
  vec3 hDeriv = abs(pR.z - P.z) < abs(P.z - pL.z) ? (pR - P) : (P - pL);
  vec3 vDeriv = abs(pU.z - P.z) < abs(P.z - pD.z) ? (pU - P) : (P - pD);
  vec3 n = normalize(cross(hDeriv, vDeriv));
  return n.z < 0.0 ? -n : n;
}

// ---- noise ----------------------------------------------------------------
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
// Interleaved gradient noise — the standard cheap dither for temporal passes.
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

// ---- NaN hygiene ----------------------------------------------------------
// clamp() and max() do NOT reject NaN: every comparison against NaN is false,
// so min(max(NaN, lo), hi) hands the NaN straight back. That is normally a
// cosmetic single-pixel problem, but auto-exposure feeds a 1x1 target back
// into itself every frame, so one NaN anywhere in the HDR buffer latches the
// adapted luminance to NaN forever and the whole screen goes black with no way
// out but a reload. Written as a ternary on "x > lo" so NaN falls through to
// the lo branch. (No backticks in this file: the GLSL lives in a JS template
// literal, so a stray backtick here ends the string and breaks the module.)
float safeVal(float x, float lo, float hi) {
  return (x > lo) ? ((x < hi) ? x : hi) : lo;
}
vec3 safeRGB(vec3 c) {
  const float HDR_MAX = 65504.0;   // largest finite half-float
  return vec3(safeVal(c.r, 0.0, HDR_MAX), safeVal(c.g, 0.0, HDR_MAX), safeVal(c.b, 0.0, HDR_MAX));
}

// ---- color ----------------------------------------------------------------
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 linearToSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
`;
