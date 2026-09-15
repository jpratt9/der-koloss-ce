// The Pack-a-Punch knuckle crack: the pose math for the two empty fists.
import { clamp } from '../utils.js';
import { setHandPose } from '../render/WeaponHands.js';

export const KNUCKLE_DUR = 2.3;

/**
 * Pose the two Pack-a-Punch fists for the knuckle crack.
 *
 * Split out of the rig update so `__fists-lab.html` can scrub the same math
 * frame by frame — this is the one animation with nothing else on screen, so
 * it gets looked at hard.
 *
 * Beat sheet (KNUCKLE_DUR = 2.3s; the two audio cracks land at 0.62s and
 * 1.18s, i.e. t = 0.27 and t = 0.51, which is what the presses are built
 * around):
 *   0.00-0.20  hands rise into frame, fingers still loose
 *   0.20-0.34  RIGHT hand crosses over the LEFT and presses — CRACK, recoil
 *   0.34-0.44  release, both hands back upright, roles swap
 *   0.44-0.58  LEFT crosses over the RIGHT — CRACK
 *   0.58-0.74  shake out: fingers splay wide open, wrists roll, re-close
 *   0.74-1.00  drop out of frame
 *
 * @param {number} t 0..1 through the ritual
 * @param {object} r { fistL, fistR, handL, handR } — the wraps from crackFist()
 * @returns {{gunDrop:number, pitchDrop:number}}
 */
export function poseKnuckleCrack(t, r) {
  const ease = (x) => x * x * (3 - 2 * x); // smoothstep
  const seg = (a, b) => clamp((t - a) / (b - a), 0, 1);
  const inn = ease(seg(0, 0.20)), out = ease(seg(0.74, 1));
  const env = inn * (1 - out);

  // A press: a slow squeeze that gives way in one frame, then rebounds.
  // The asymmetry is the whole trick — a symmetric sine reads as a wave,
  // not a joint letting go.
  const press = (a) => {
    const load = seg(a, a + 0.085);          // build pressure
    const rel = seg(a + 0.085, a + 0.115);   // it gives
    const settle = seg(a + 0.115, a + 0.20); // rebound
    return { load: ease(load) * (1 - rel), pop: rel * (1 - ease(settle)) };
  };
  const p1 = press(0.185);  // crack lands at t = 0.27
  const p2 = press(0.425);  // crack lands at t = 0.51
  const shake = Math.sin(seg(0.58, 0.74) * Math.PI);

  // Hands rise, and one leans across the other for each press.
  const lean1 = p1.load + p1.pop * 0.6;   // press 1: the RIGHT hand works
  const lean2 = p2.load + p2.pop * 0.6;   // press 2: the LEFT hand works
  const rise = env * 0.185;
  const draw = env * 0.018;               // idle drift together, never overlapping

  // Lay out one hand. `s` is +1 for the right hand, -1 for the left; `w` is how
  // much this hand is doing the pressing, `b` how much it is the one being
  // pressed. The two are never both non-zero, and that asymmetry is the fix:
  // the hands used to converge as mirror images at a single depth, so on every
  // press they slid through each other and read as one lump of glove. Now the
  // working hand crosses a full hand-thickness NEARER the eye (+z) and cants
  // over at the wrist, so its fingers come down ACROSS the other hand's
  // knuckles and cleanly occlude it; the hand being worked barely moves,
  // dipping under the pressure. Nothing has to pass through anything.
  const place = (fist, s, w, b, popOwn, popOther) => {
    fist.position.set(
      s * (0.082 - draw - w * 0.056 + b * 0.004 + shake * 0.012),
      -0.235 + rise + w * 0.036 - b * 0.016 - popOwn * 0.014 + popOther * 0.006,
      -0.265 - env * 0.040 + w * 0.062 - b * 0.012,
    );
    // Most of the cant is WRIST, not arm. Rolling the whole wrap far enough to
    // lay the working hand across the other one swings a horizontal tube of
    // sleeve through the middle of the shot; the elbow does not do that, the
    // wrist does.
    fist.rotation.set(
      -0.26 * env + w * 0.14 - b * 0.10 - shake * 0.22,
      -s * (0.24 * env + w * 0.10),
      s * (0.12 * env + 0.20 * w + 0.12 * b),
    );
    // Optional on purpose. This function and crackFist() live in different
    // modules, so a browser holding a stale copy of one of them would other-
    // wise throw here on EVERY frame of the ritual. The frame loop queues its
    // next rAF before calling tick(), so such a throw does not stop the loop —
    // it just skips the render, and the screen sits frozen on the last good
    // frame for exactly as long as the ritual lasts and then carries on. A
    // cosmetic wrist bend must never be able to do that.
    fist.userData.wrist?.rotation.set(w * 0.26, 0, s * (0.62 * w - 0.10 * b));
  };
  place(r.fistR, 1, lean1, lean2, p1.pop, p2.pop);
  place(r.fistL, -1, lean2, lean1, p2.pop, p1.pop);

  // Fingers. The hand being cracked is forced past a fist; the hand doing
  // the work closes over it. On the pop the joints snap open a hair —
  // that recoil is what sells a knuckle actually going off.
  const open = shake * 0.75;                       // splay during shake-out
  const worked = (p) => 0.55 + p.load * 0.72 - p.pop * 0.30;
  // The worker stops short of a closed fist: its fingers have the other hand's
  // knuckles inside them, so they fold OVER something rather than into a ball.
  const worker = (p) => 0.52 + p.load * 0.40 - p.pop * 0.12;
  const restC = 0.42 + env * 0.16 - open * 0.40;
  const curlL = Math.max(restC, worked(p1), worker(p2));
  const curlR = Math.max(restC, worker(p1), worked(p2));
  // Fingers do not all release together: stagger index -> little.
  const stagger = (c, p) => [
    c + p.pop * 0.10, c + p.pop * 0.02, c - p.pop * 0.06, c - p.pop * 0.14,
  ];
  setHandPose(r.handL, {
    curls: stagger(curlL, p1),
    spread: 1 + open * 1.5 + p1.pop * 0.5,
    thumb: clamp(0.85 - open * 0.7 + p1.load * 0.2, 0, 1),
  });
  setHandPose(r.handR, {
    curls: stagger(curlR, p2),
    spread: 1 + open * 1.5 + p2.pop * 0.5,
    thumb: clamp(0.85 - open * 0.7 + p2.load * 0.2, 0, 1),
  });
  return { gunDrop: env * 0.3, pitchDrop: env * 0.5 };
}
