// Depth of field.
import { COMMON } from './common.js';

// ---------------------------------------------------------------------------
// Depth of field — near/far CoC with a hexagonal-ish bokeh scatter. Used for
// ADS (world softens behind the sight) and for cinematics.
// ---------------------------------------------------------------------------
export const DOF_FRAG = COMMON + /* glsl */`
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform vec2 uTexel;
uniform float uNear, uFar;
uniform float uFocusDist;
uniform float uFocusRange;
uniform float uMaxBlur;
uniform float uFrame;

#define DOF_TAPS 16

void main() {
  float d = rawDepth(uDepth, vUv);
  float z = -linearizeDepth(d, uNear, uFar);
  float coc = clamp((z - uFocusDist) / max(0.001, uFocusRange), -1.0, 1.0);
  float radius = abs(coc) * uMaxBlur;
  if (radius < 0.6) { gl_FragColor = texture2D(uColor, vUv); return; }

  float ang = ign(gl_FragCoord.xy + uFrame * 2.71) * TAU;
  vec3 sum = texture2D(uColor, vUv).rgb;
  float wsum = 1.0;
  for (int i = 0; i < DOF_TAPS; i++) {
    float a = ang + float(i) * (TAU / float(DOF_TAPS)) * 2.399963;
    float rr = sqrt((float(i) + 0.5) / float(DOF_TAPS)) * radius;
    vec2 uv = vUv + vec2(cos(a), sin(a)) * rr * uTexel;
    float dz = -linearizeDepth(rawDepth(uDepth, uv), uNear, uFar);
    // Only pull in samples that are themselves at least as out of focus.
    float w = (dz > z - 0.3) ? 1.0 : 0.25;
    sum += texture2D(uColor, uv).rgb * w;
    wsum += w;
  }
  gl_FragColor = vec4(sum / wsum, 1.0);
}
`;
