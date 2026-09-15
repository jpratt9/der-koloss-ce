// Camera motion blur.
import { COMMON } from './common.js';

// ---------------------------------------------------------------------------
// Camera motion blur reconstructed from depth + the previous view-projection.
// ---------------------------------------------------------------------------
export const MOTION_BLUR_FRAG = COMMON + /* glsl */`
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform mat4 uProjInv;
uniform mat4 uViewInv;
uniform mat4 uPrevViewProj;
uniform vec2 uResolution;
uniform float uStrength;
uniform float uMaxRadius;   // in pixels
uniform float uFrame;

#ifndef MB_SAMPLES
#define MB_SAMPLES 10
#endif

void main() {
  float d = rawDepth(uDepth, vUv);
  vec3 viewP = viewPosFromDepth(vUv, d, uProjInv);
  vec4 worldP = uViewInv * vec4(viewP, 1.0);

  vec4 prevClip = uPrevViewProj * worldP;
  vec2 prevUv = (prevClip.xy / prevClip.w) * 0.5 + 0.5;
  vec2 velocity = (vUv - prevUv) * uStrength;

  // Clamp so a fast whip-turn smears instead of sampling the whole screen.
  vec2 px = velocity * uResolution;
  float len = length(px);
  if (len < 0.6) { gl_FragColor = texture2D(uColor, vUv); return; }
  if (len > uMaxRadius) velocity *= uMaxRadius / len;

  float jitter = ign(gl_FragCoord.xy + uFrame * 3.917);
  vec3 sum = texture2D(uColor, vUv).rgb;
  float wsum = 1.0;
  for (int i = 0; i < MB_SAMPLES; i++) {
    float t = (float(i) + jitter) / float(MB_SAMPLES) - 0.5;
    vec2 uv = vUv + velocity * t;
    // Reject taps that leave the frame. The colour target is clamp-to-edge, so
    // an out-of-range tap returns the border pixel over and over — which is
    // exactly what smeared dark streaks along the bottom of the screen while
    // running, where the near ground has the largest velocity.
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;
    // Reject taps on geometry substantially NEARER than this pixel. Those
    // belong to a different surface, and dragging them outward is what turned
    // the lit floor edge into a comb of bright streaks over the dark ground
    // while running. Smoothstep rather than step: a binary cutoff just moves
    // the artifact to wherever the threshold lands.
    float dz = rawDepth(uDepth, uv);
    float w = 1.0 - smoothstep(0.0002, 0.0022, d - dz);
    sum += texture2D(uColor, uv).rgb * w;
    wsum += w;
  }
  gl_FragColor = vec4(sum / max(1e-4, wsum), 1.0);
}
`;
