// The bloom chain: prefilter, downsample, upsample.
import { COMMON } from './common.js';

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
