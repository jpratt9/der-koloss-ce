// Ambient occlusion: the SAO pass and its depth-aware blur.
import { COMMON } from './common.js';

// ---------------------------------------------------------------------------
// Ambient occlusion — McGuire's Scalable Ambient Obscurance with a spiral tap
// pattern. Half resolution, then bilaterally upsampled.
// ---------------------------------------------------------------------------
export const AO_FRAG = COMMON + /* glsl */`
uniform sampler2D uDepth;
uniform mat4 uProjInv;
uniform mat4 uProj;
uniform vec2 uResolution;   // AO buffer resolution
uniform float uNear, uFar;
uniform float uRadius;      // world-space sample radius
uniform float uIntensity;
uniform float uBias;
uniform float uFrame;

#ifndef AO_SAMPLES
#define AO_SAMPLES 12
#endif
#define SPIRAL_TURNS 7.0

void main() {
  vec2 texel = 1.0 / uResolution;
  float d = rawDepth(uDepth, vUv);
  if (d >= 0.9999) { gl_FragColor = vec4(1.0, d, 0.0, 1.0); return; }

  vec3 P = viewPosFromDepth(vUv, d, uProjInv);
  // Reconstruct the normal over a DOUBLE-WIDTH tap cross, not the 1-texel one.
  //
  // normalFromDepth picks the shorter of the two depth gradients per axis. On a
  // floor running away from the camera the two sides are nearly equal, so which
  // one wins is decided by the last bits of the depth difference — and that
  // flips back and forth in bands of constant depth. On a floor, constant depth
  // is a horizontal line, so the normal tilts one way for a few rows and the
  // other way for the next few, AO follows it, and the result is dark horizontal
  // lines ruled across the ground near the bottom of the screen. They move with
  // the player, which is what made them read as a post-process artifact; they
  // are not. No pass toggle changes them because the defect is upstream of every
  // pass, in the normal this one derives from depth.
  //
  // Doubling the baseline makes the real gradient large compared to the noise
  // deciding the tie, so the choice stops oscillating. The taps are still narrow
  // enough that a genuine silhouette wins the comparison outright, which is the
  // property min-difference was chosen for. Measured on the courtyard floor: the
  // three banded rows go from -7.7/-5.7/-5.1% below their neighbours to
  // -1.0/-0.7/-0.6%, i.e. to the same level as AO switched off entirely, while
  // total AO darkening is retained (mean luma 106.0 vs 104.7 baseline, 108.5 with
  // AO off). Widening further (x3, x4) starts erasing real contact occlusion.
  //
  // Scoped to this call: SSR's puddle mask (below) wants the tight cross, since
  // it is masking small flat pools and runs at full resolution.
  vec3 n = normalFromDepth(uDepth, vUv, texel * 2.0, uProjInv);

  // Screen-space radius of the world-space sphere at this depth.
  float projScale = 0.5 * uResolution.y * uProj[1][1];
  float screenRadius = projScale * uRadius / max(0.15, -P.z);
  screenRadius = min(screenRadius, uResolution.y * 0.14); // cap the search cost

  float phi = hash12(gl_FragCoord.xy + uFrame * 7.13) * TAU;
  float r2 = uRadius * uRadius;
  float sum = 0.0;

  for (int i = 0; i < AO_SAMPLES; i++) {
    float alpha = (float(i) + 0.5) / float(AO_SAMPLES);
    float h = screenRadius * alpha;
    float theta = alpha * SPIRAL_TURNS * TAU + phi;
    vec2 uv2 = vUv + vec2(cos(theta), sin(theta)) * h * texel;
    if (uv2.x < 0.0 || uv2.x > 1.0 || uv2.y < 0.0 || uv2.y > 1.0) continue;

    float d2 = rawDepth(uDepth, uv2);
    if (d2 >= 0.9999) continue;
    vec3 Q = viewPosFromDepth(uv2, d2, uProjInv);
    vec3 v = Q - P;
    float vv = dot(v, v);
    float vn = dot(v, n);
    float f = max(r2 - vv, 0.0);
    sum += f * f * f * max((vn - uBias) / (0.015 + vv), 0.0);
  }

  float ao = max(0.0, 1.0 - sum * (5.0 * uIntensity) / (float(AO_SAMPLES) * pow(uRadius, 6.0)));
  // Fade AO out at distance: contact shadows past ~40m are noise, not detail.
  ao = mix(ao, 1.0, smoothstep(28.0, 60.0, -P.z));
  gl_FragColor = vec4(ao, d, 0.0, 1.0);
}
`;

// Depth-aware separable blur. .r = AO, .g = raw depth (carried for the filter).
export const AO_BLUR_FRAG = COMMON + /* glsl */`
uniform sampler2D uAO;
uniform vec2 uTexel;
uniform vec2 uDir;
uniform float uNear, uFar;

void main() {
  vec2 c = texture2D(uAO, vUv).rg;
  float centerZ = linearizeDepth(c.g, uNear, uFar);
  float sum = c.r, wsum = 1.0;
  for (int i = 1; i <= 4; i++) {
    float w0 = exp(-float(i * i) / 8.0);
    for (int s = -1; s <= 1; s += 2) {
      vec2 uv = vUv + uDir * uTexel * float(i * s);
      vec2 t = texture2D(uAO, uv).rg;
      float z = linearizeDepth(t.g, uNear, uFar);
      float w = w0 * exp(-abs(z - centerZ) * 2.2);
      sum += t.r * w; wsum += w;
    }
  }
  gl_FragColor = vec4(sum / wsum, c.g, 0.0, 1.0);
}
`;
