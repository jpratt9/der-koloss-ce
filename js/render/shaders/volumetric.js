// Volumetric light shafts, and the upsample that puts them and the AO on the scene.
import { COMMON } from './common.js';

// ---------------------------------------------------------------------------
// Volumetric fog / light shafts. Raymarches the camera ray against the sun
// (moon) cascade shadow map, plus a height-falloff medium.
// ---------------------------------------------------------------------------
export const VOLUMETRIC_FRAG = COMMON + /* glsl */`
uniform sampler2D uDepth;
uniform sampler2D uShadow;
uniform mat4 uShadowMatrix;
uniform mat4 uProjInv;
uniform mat4 uViewInv;
uniform vec3 uCamPos;
uniform vec3 uSunDir;        // world-space direction TOWARD the light
uniform vec3 uSunColor;
uniform float uNear, uFar;
uniform float uDensity;
uniform float uHeightFalloff;
uniform float uFogBase;      // world Y where the medium is densest
uniform float uAnisotropy;
uniform float uFrame;
uniform float uMaxDist;
uniform float uAmbient;
uniform vec3 uAmbientColor;
uniform float uShadowRadius;
uniform float uShadowEdgeFade;   // must match SHADOW_EDGE_FADE

// Local practicals that also scatter into the medium. Four is enough: the game
// feeds the nearest active lamps each frame, and beyond that the contribution
// is below the dither floor anyway.
#ifndef VOL_LIGHTS
#define VOL_LIGHTS 4
#endif
uniform vec4 uPointPos[VOL_LIGHTS];    // xyz = world position, w = radius
uniform vec4 uPointColor[VOL_LIGHTS];  // rgb = colour, a = intensity

#ifndef VOL_STEPS
#define VOL_STEPS 28
#endif

const float PackUpscale = 256.0 / 255.0;
const float UnpackDownscale = 255.0 / 256.0;
const vec3 PackFactors = vec3(256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0);
const vec4 UnpackFactors = vec4(UnpackDownscale / PackFactors, UnpackDownscale);
float unpackDepth(vec4 v) { return dot(v, UnpackFactors); }

// The raymarch samples the sun's shadow map itself, so it needs the same edge
// ramp the surface shader gets from ShadowEdgeFade.js. Without it the shaft
// geometry stays hard-edged at the box boundary even once the floor under it
// fades smoothly, and the mismatch is more obvious than either alone.
//
// Takes a SHADOW-space position. The moon's shadow camera is orthographic, so
// its matrix is affine (w is always 1) and shadow-space position is linear
// along the ray: main() transforms the ray origin and direction once per pixel
// and steps in shadow space, rather than pushing every one of VOL_STEPS
// samples through a mat4 multiply and a divide.
float sunVisibility(vec3 s) {
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0 || s.z > 1.0) return 1.0;
  float d = unpackDepth(texture2D(uShadow, s.xy));
  float vis = step(s.z - 0.0016, d);
  vec2 e = abs(s.xy - 0.5) * 2.0;
  float fade = 1.0 - smoothstep(1.0 - uShadowEdgeFade, 1.0, max(e.x, e.y));
  return mix(1.0, vis, fade);
}

// Henyey-Greenstein phase function.
float phaseHG(float cosT, float g) {
  float g2 = g * g;
  // b^1.5 as b * sqrt(b): pow() is exp(log()) on most drivers, and this runs
  // once per practical per raymarch step.
  float b = max(1e-4, 1.0 + g2 - 2.0 * g * cosT);
  return (1.0 - g2) / (4.0 * PI * b * sqrt(b));
}

void main() {
  float d = rawDepth(uDepth, vUv);
  vec3 viewP = viewPosFromDepth(vUv, d, uProjInv);
  vec3 worldP = (uViewInv * vec4(viewP, 1.0)).xyz;
  vec3 ray = worldP - uCamPos;
  float dist = min(length(ray), uMaxDist);
  vec3 dir = normalize(ray);

  float cosT = dot(dir, uSunDir);
  float phase = phaseHG(cosT, uAnisotropy);

  float jitter = ign(gl_FragCoord.xy + uFrame * 5.588238);
  float stepLen = dist / float(VOL_STEPS);
  vec3 shadowOrigin = (uShadowMatrix * vec4(uCamPos, 1.0)).xyz;
  vec3 shadowDir = (uShadowMatrix * vec4(dir, 0.0)).xyz;

  vec3 scatter = vec3(0.0);
  float transmittance = 1.0;

  for (int i = 0; i < VOL_STEPS; i++) {
    float t = (float(i) + jitter) * stepLen;
    vec3 p = uCamPos + dir * t;
    // Exponential height fog: thick at the factory floor, thin overhead.
    float density = uDensity * exp(-max(0.0, p.y - uFogBase) * uHeightFalloff);
    if (density < 1e-5) continue;
    float sigma = density * stepLen;
    float vis = sunVisibility(shadowOrigin + shadowDir * t);
    vec3 inScatter = uSunColor * vis * phase * 4.0 + uAmbientColor * uAmbient;

    // Local practicals: unshadowed, but with the same phase function, so the
    // haze around a lamp brightens sharply when you look toward it. This is
    // what turns the hanging sodium bulbs into visible cones of light.
    for (int li = 0; li < VOL_LIGHTS; li++) {
      float intensity = uPointColor[li].a;
      if (intensity <= 0.0001) continue;
      vec3 toL = uPointPos[li].xyz - p;
      float d2 = dot(toL, toL);
      float radius = uPointPos[li].w;
      if (d2 > radius * radius) continue;
      float d = sqrt(max(d2, 1e-4));
      // Inverse-square with a windowed cutoff so a lamp's halo ends cleanly.
      float win = max(0.0, 1.0 - d2 / (radius * radius));
      float atten = win * win / (d2 + 0.25);
      float lPhase = phaseHG(dot(dir, toL / d), uAnisotropy * 0.55);
      inScatter += uPointColor[li].rgb * intensity * atten * lPhase * 5.0;
    }

    scatter += transmittance * inScatter * sigma;
    transmittance *= exp(-sigma);
    if (transmittance < 0.01) break;
  }

  gl_FragColor = vec4(scatter, transmittance);
}
`;

export const VOL_UPSAMPLE_FRAG = COMMON + /* glsl */`
uniform sampler2D uColor;      // full-res scene
uniform sampler2D uVolume;     // half-res scatter (rgb) + transmittance (a)
uniform sampler2D uAO;         // half-res AO in .r
uniform sampler2D uDepth;
uniform vec2 uTexelHalf;
uniform float uNear, uFar;
uniform float uAOStrength;

void main() {
  vec3 base = texture2D(uColor, vUv).rgb;
  float centerZ = linearizeDepth(rawDepth(uDepth, vUv), uNear, uFar);

  // Joint bilateral upsample, 3x3 over the half-res buffers.
  //
  // This does double duty: it upsamples AND denoises. The volumetric raymarch
  // is dithered per pixel, so a plain box upsample leaves a visible checkered
  // pattern, and a naive 1/|dz| weight collapses at a depth discontinuity —
  // when every tap sits on the far side of a near edge the weights are all
  // equally bad and the far-side scatter bleeds over the near surface as a
  // block of flicker. Weighting exponentially on RELATIVE depth error, and
  // falling back to the single closest-depth tap when nothing matches, keeps
  // silhouettes clean instead of blocky.
  vec4 vol = vec4(0.0);
  float ao = 0.0;
  float wsum = 0.0;
  vec4 bestVol = vec4(0.0, 0.0, 0.0, 1.0);
  float bestAO = 1.0;
  float bestErr = 1e20;

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 uv = vUv + vec2(float(x), float(y)) * uTexelHalf;
      vec2 aoTap = texture2D(uAO, uv).rg;
      vec4 volTap = texture2D(uVolume, uv);
      float z = linearizeDepth(aoTap.g, uNear, uFar);
      // Relative error: a 20cm gap matters at 2m and is noise at 50m.
      float err = abs(z - centerZ) / max(1.0, abs(centerZ));
      if (err < bestErr) { bestErr = err; bestVol = volTap; bestAO = aoTap.r; }
      float spatial = (x == 0 && y == 0) ? 1.0 : ((x == 0 || y == 0) ? 0.62 : 0.34);
      float w = spatial * exp(-err * 55.0);
      vol += volTap * w;
      ao += aoTap.r * w;
      wsum += w;
    }
  }

  if (wsum > 0.02) {
    vol /= wsum; ao /= wsum;
  } else {
    vol = bestVol; ao = bestAO;   // every tap crossed an edge — take the nearest
  }

  float occ = mix(1.0, ao, uAOStrength);
  vec3 col = base * occ;
  col = col * vol.a + vol.rgb;
  gl_FragColor = vec4(col, 1.0);
}
`;
