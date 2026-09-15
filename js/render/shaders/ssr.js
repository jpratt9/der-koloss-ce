// Screen-space reflections on standing water.
import { COMMON } from './common.js';

// ---------------------------------------------------------------------------
// Screen-space reflections, restricted to standing water.
//
// A full SSR pass would need a roughness buffer this pipeline does not have.
// Instead it reproduces exactly the puddle mask the surface shader uses (same
// hash, same fbm, same thresholds in js/render/Materials.js) and only traces
// where that mask says there is water: up-facing, low in the world, inside a
// pool. That is cheap, and it is the only place a mirror-sharp reflection is
// physically justified anyway.
// ---------------------------------------------------------------------------
export const SSR_FRAG = COMMON + /* glsl */`
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform mat4 uProj;
uniform mat4 uProjInv;
uniform mat4 uViewInv;
uniform vec2 uResolution;
uniform float uNear, uFar;
uniform float uStrength;
uniform float uMaxDist;
uniform float uThickness;
uniform float uWetScale;
uniform float uWetHeight;
uniform float uFrame;

#ifndef SSR_STEPS
#define SSR_STEPS 20
#endif
#define SSR_REFINE 4

// --- must stay identical to the puddle mask in Materials.js ---
float sHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float sNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(sHash(i), sHash(i + vec3(1,0,0)), f.x), mix(sHash(i + vec3(0,1,0)), sHash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(sHash(i + vec3(0,0,1)), sHash(i + vec3(1,0,1)), f.x), mix(sHash(i + vec3(0,1,1)), sHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float sFbm(vec3 p) {
  return sNoise(p) * 0.55 + sNoise(p * 2.07) * 0.28 + sNoise(p * 4.11) * 0.17;
}

void main() {
  vec4 base = texture2D(uColor, vUv);
  float d = rawDepth(uDepth, vUv);
  if (d >= 0.9999) { gl_FragColor = base; return; }

  vec2 texel = 1.0 / uResolution;
  vec3 P = viewPosFromDepth(vUv, d, uProjInv);
  vec3 worldP = (uViewInv * vec4(P, 1.0)).xyz;

  // Cheapest rejections first. pool is up * low scaled by two factors that
  // never exceed 1, so a pixel failing either test can never reach the 0.02
  // cutoff below, and skipping the normal reconstruction and both fbm calls
  // for it changes nothing. This pass is full resolution, and it used to pay
  // for all of them on every wall, ceiling and raised deck on screen.
  float low = 1.0 - smoothstep(uWetHeight, uWetHeight + 1.4, worldP.y);
  if (low < 0.02) { gl_FragColor = base; return; }
  vec3 N = normalFromDepth(uDepth, vUv, texel, uProjInv);
  vec3 worldN = normalize((uViewInv * vec4(N, 0.0)).xyz);
  float up = smoothstep(0.62, 0.92, worldN.y);
  if (up * low < 0.02) { gl_FragColor = base; return; }
  float damp = smoothstep(0.42, 0.60, sFbm(worldP * uWetScale));
  float pool = smoothstep(0.52, 0.68, sFbm(worldP * uWetScale * 3.7 + 51.0)) * damp * up * low;
  if (pool < 0.02) { gl_FragColor = base; return; }

  vec3 viewDir = normalize(P);
  vec3 R = reflect(viewDir, N);
  if (R.z > 0.0) { gl_FragColor = base; return; }   // reflecting back at the eye

  // Fresnel for water (F0 ~ 0.02): almost nothing head-on, near-total at a
  // glancing angle. This is what makes a wet floor read as wet.
  float fres = 0.02 + 0.98 * pow(1.0 - max(0.0, dot(-viewDir, N)), 5.0);

  float stepLen = uMaxDist / float(SSR_STEPS);
  float jitter = ign(gl_FragCoord.xy + uFrame * 11.13);
  vec3 hitColor = vec3(0.0);
  float hit = 0.0;
  vec3 prev = P;

  for (int i = 1; i <= SSR_STEPS; i++) {
    vec3 sp = P + R * (float(i) + jitter) * stepLen;
    vec4 clip = uProj * vec4(sp, 1.0);
    if (clip.w <= 0.0) break;
    vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;

    float sceneD = rawDepth(uDepth, uv);
    if (sceneD >= 0.9999) { prev = sp; continue; }
    vec3 sceneP = viewPosFromDepth(uv, sceneD, uProjInv);
    float delta = sceneP.z - sp.z;   // >0 means the ray went behind geometry

    if (delta > 0.0 && delta < uThickness) {
      // Binary refine between the last miss and this hit for a crisp contact.
      vec3 a = prev, b = sp;
      for (int j = 0; j < SSR_REFINE; j++) {
        vec3 mid = (a + b) * 0.5;
        vec4 mc = uProj * vec4(mid, 1.0);
        vec2 muv = mc.xy / mc.w * 0.5 + 0.5;
        vec3 mp = viewPosFromDepth(muv, rawDepth(uDepth, muv), uProjInv);
        if (mp.z - mid.z > 0.0) b = mid; else a = mid;
      }
      vec4 fc = uProj * vec4(b, 1.0);
      vec2 fuv = fc.xy / fc.w * 0.5 + 0.5;
      hitColor = texture2D(uColor, fuv).rgb;
      // Fade at the screen edges — the information simply is not there.
      vec2 edge = smoothstep(vec2(0.0), vec2(0.12), fuv) * (1.0 - smoothstep(vec2(0.88), vec2(1.0), fuv));
      hit = edge.x * edge.y;
      break;
    }
    prev = sp;
  }

  float k = hit * fres * pool * uStrength;
  gl_FragColor = vec4(mix(base.rgb, hitColor, clamp(k, 0.0, 1.0)), base.a);
}
`;
