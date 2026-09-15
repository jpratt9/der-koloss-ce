// Auto-exposure: measure the frame's luminance, then adapt to it.
import { COMMON } from './common.js';

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
