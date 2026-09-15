// Pose grammar shared by live zombies and the cinematic director: which clip a
// zombie plays in each state, and the procedural hellhound's gait.
import * as THREE from 'three';
import { clamp } from '../utils.js';
import { ZSTATES } from './states.js';

// Pure, capture-safe pose selection shared by the live zombie manager and the
// isolated cinematic director. `deterministic` is deliberately opt-in: normal
// gameplay keeps its existing run-clip variation, while frame-addressed trailer
// capture never depends on seek order or Math.random().
export function zombiePoseForState({
  state,
  speed = 0,
  crawler = false,
  current = null,
  deterministic = false,
  variant = 0,
  riseT = 0,
  dormant = false,
} = {}) {
  if (state === ZSTATES.DIE) return { action: 'Death', loop: false, fade: 0.08, timeScale: 1 };
  // Nobody left to hunt (game over): the horde has no prey and no reason to
  // sprint, and a run cycle with the root frozen is just running on the spot.
  // Stand and breathe instead — slightly off-tempo per body so the crowd never
  // idles in lockstep. Risers keep their staged climb-out below; a corpse left
  // half in the floor reads far worse than one standing over you.
  if (dormant && state !== ZSTATES.RISE) {
    if (crawler) return { action: 'Crawl', loop: true, fade: 0.5, timeScale: 0.22 };
    return { action: 'Idle', loop: true, fade: 0.5, timeScale: 0.55 + (variant % 7) * 0.04 };
  }
  if (crawler) return { action: 'Crawl', loop: true, fade: 0.18, timeScale: 0.6 };
  if (state === ZSTATES.TEAR) return { action: 'Idle_Attack', loop: true, fade: 0.18, timeScale: 1.15 };
  if (state === ZSTATES.ATTACK) {
    const action = current === 'Idle_Attack' ? 'Idle_Attack' : 'Punch';
    return { action, loop: false, fade: 0.08, timeScale: 1.3 };
  }
  if (state === ZSTATES.CLIMB) return { action: 'Jump', loop: false, fade: 0.1, timeScale: 1 };
  if (state === ZSTATES.RISE) {
    // The whole rise used to play Crawl — a PRONE, on-the-stomach clip — while
    // the body translated straight up out of the ground. That is why risers
    // read as floating out of the floor lying down: the pose never changed
    // from prone to standing at any point.
    //
    // Staged instead, using only clip selection and playback rate. Both are
    // safe: neither touches the skeleton, retargets, or blends anything the
    // mixer does not already do for an ordinary clip change.
    const t = clamp(riseT, 0, 1);
    if (t < 0.42) {
      // Clawing at the ground, chest barely clear. Fast punch out, then a
      // near-stall while it fights for purchase.
      return { action: 'Crawl', loop: true, fade: 0.14, timeScale: t < 0.22 ? 1.5 : 0.35 };
    }
    if (t < 0.72) {
      // Heaving the torso out. Jump_Land is the rig's crouched recovery pose,
      // which is exactly the shape of a body getting its knees under it.
      return { action: 'Jump_Land', loop: false, fade: 0.24, timeScale: 0.55 };
    }
    return { action: 'Idle', loop: true, fade: 0.3, timeScale: 0.9 };
  }
  if (state === ZSTATES.APPROACH) return { action: 'Walk', loop: true, fade: 0.18, timeScale: clamp(speed, 0.8, 1.4) };
  if (speed > 3) {
    const arms = current === 'Run_Arms' || (deterministic ? (variant & 1) === 1 : Math.random() < 0.5);
    return { action: arms ? 'Run_Arms' : 'Run', loop: true, fade: 0.18, timeScale: clamp(speed / 3.4, 0.9, 1.4) };
  }
  return { action: 'Walk', loop: true, fade: 0.18, timeScale: clamp(speed / 1.1, 0.9, 2.0) };
}

// The procedural hound rig has no AnimationMixer. Keeping its deterministic
// pose calculation here lets gameplay and the director use the exact same leg,
// spine, head, jaw and tail grammar without instantiating zombie AI.
export function applyHellhoundPose(model, {
  state = ZSTATES.CHASE,
  phase = 0,
  stateT = 0,
  deadT = 0,
  headshotDeath = false,
  groundY = model?.position?.y || 0,
  dormant = false,
} = {}) {
  if (!model?.userData?.dog) return;
  const u = model.userData;
  model.rotation.x = 0;
  model.rotation.z = 0;
  model.position.y = groundY;
  if (state === ZSTATES.DIE) {
    const t = Math.min(1, deadT / 0.45);
    model.rotation.x = headshotDeath ? -t * 1.5 : t * 1.5;
    model.position.y = groundY - Math.max(0, deadT - 1.6) * 0.4;
    return;
  }
  const attacking = !dormant && state === ZSTATES.ATTACK;
  const rising = !dormant && state === ZSTATES.RISE;
  // Dormant is a standing hound, not a stalled one: the gait stops, but the
  // ribcage still rises and falls and the head still drifts.
  const amp = dormant ? 0.05 : attacking ? 0.35 : 0.62;
  const rootBob = dormant ? Math.abs(Math.sin(phase * 0.5)) * 0.02
    : attacking ? 0.06 : Math.abs(Math.sin(phase * 0.5)) * (u.directorRig ? 0.018 : 0.12);
  model.position.y = groundY + rootBob;
  if (u.directorRig && u.legChains?.length) {
    for (const chain of u.legChains) {
      const cycle = ((((phase + chain.phase) / (Math.PI * 2)) % 1) + 1) % 1;
      // A deterministic two-link gait: during stance the endpoint travels
      // backward in model space at nearly the same rate the root advances,
      // then recovers forward with a lifted swing. This is true planted-paw
      // motion on the real hip -> knee -> paw hierarchy, not visual scissoring.
      const stance = dormant || (!attacking && cycle >= 0.5);
      const strideHalf = 0.37;
      let gaitT, targetX, lift = 0;
      if (dormant) {
        // Squared up under its own hips: planted, no stride to travel through.
        targetX = 0;
      } else if (stance) {
        gaitT = (cycle - 0.5) * 2;
        targetX = THREE.MathUtils.lerp(strideHalf, -strideHalf, gaitT);
      } else {
        gaitT = cycle * 2;
        const recover = THREE.MathUtils.smoothstep(gaitT, 0, 1);
        targetX = THREE.MathUtils.lerp(-strideHalf, strideHalf, recover);
        lift = Math.sin(gaitT * Math.PI) * 0.18;
      }
      // Root bob is already applied, so the planted endpoint compensates it
      // instead of inheriting a visible 12 cm vertical float above the floor.
      const targetY = -chain.hip.position.y - rootBob + lift;
      const l1 = chain.upperLen, l2 = chain.lowerLen;
      const rawD = Math.hypot(targetX, targetY);
      const d = THREE.MathUtils.clamp(rawD, Math.abs(l1 - l2) + 0.001, l1 + l2 - 0.001);
      const x = targetX * d / Math.max(rawD, 0.001), y = targetY * d / Math.max(rawD, 0.001);
      const bend = chain.front ? -1 : 1;
      const cosKnee = THREE.MathUtils.clamp((d * d - l1 * l1 - l2 * l2) / (2 * l1 * l2), -1, 1);
      const kneeAngle = bend * Math.acos(cosKnee);
      const firstAngle = Math.atan2(y, x) - Math.atan2(l2 * Math.sin(kneeAngle), l1 + l2 * Math.cos(kneeAngle));
      chain.hip.rotation.z = firstAngle + Math.PI * 0.5;
      chain.knee.rotation.z = kneeAngle;
      chain.paw.rotation.z = -(chain.hip.rotation.z + chain.knee.rotation.z) * 0.72;
      chain.paw.userData.directorStance = stance;
    }
  } else {
    for (const l of u.legs || []) l.mesh.rotation.z = l.base + Math.sin(phase + l.phase) * amp;
  }
  model.rotation.z = dormant ? Math.sin(phase * 0.5) * 0.02
    : u.directorRig && !attacking ? 0 : attacking
    ? -0.22 + Math.sin(Math.min(1, stateT / 0.38) * Math.PI) * 0.3
    : rising ? Math.sin(stateT * 22) * 0.08 * (1 - stateT / 1.6)
    : Math.sin(phase * 0.5) * 0.07;
  // The neck carries most of the head motion and the skull counter-rotates a
  // little, which is how a running dog keeps its eyes level on its target.
  // Attacking, the whole thing drives forward and down into the bite.
  if (u.neck) {
    const sway = Math.sin(phase * 0.23) * 0.16;
    u.neck.rotation.y = attacking ? 0 : sway;
    u.neck.rotation.z = attacking
      ? -0.30 + Math.sin(Math.min(1, stateT / 0.34) * Math.PI) * 0.22
      : -0.05 + Math.sin(phase * 0.5) * 0.045;
  }
  if (u.head) {
    u.head.rotation.y = attacking ? 0 : Math.sin(phase * 0.23) * 0.2 - (u.neck ? Math.sin(phase * 0.23) * 0.08 : 0);
    u.head.rotation.z = attacking ? 0.10 : 0.04 - Math.sin(phase * 0.5) * 0.03;
    u.head.rotation.x = attacking ? 0 : Math.sin(phase * 0.19 + 1.1) * 0.06;
  }
  if (u.jaw) {
    const bite = attacking ? Math.abs(Math.sin(stateT * 14)) : (Math.sin(phase * 0.5) * 0.5 + 0.5) * 0.25;
    // The jaw is hinged to the skull now, so this is a pure rotation about the
    // condyle. Writing an absolute world height here is what used to leave the
    // lower jaw hanging in mid-air a third of a metre below the muzzle.
    u.jaw.rotation.z = -bite * 0.55;
    if (u.jawRestY != null) u.jaw.position.y = u.jawRestY - bite * 0.008;
  }
  if (u.tailSegs?.length) {
    // A whip, not a plank: each link lags the one before it, so the tail
    // trails the body instead of swinging as one rigid stick.
    const raise = attacking ? 0.55 : 0.0;
    for (let i = 0; i < u.tailSegs.length; i++) {
      const seg = u.tailSegs[i];
      const lag = phase * 0.31 - i * 0.85;
      seg.rotation.z = seg.userData.baseZ + raise * (i === 0 ? 1 : 0.3)
        + Math.sin(lag) * (0.09 + i * 0.055);
      seg.rotation.y = (seg.userData.baseY || 0)
        + (attacking ? 0 : Math.sin(phase * 0.24 - i * 0.7) * (0.07 + i * 0.06));
    }
  } else if (u.tail) u.tail.rotation.z = attacking ? 1.15 : 0.7 + Math.sin(phase * 0.31) * 0.15;
  if (u.directorRig && u.legChains?.length) {
    // Keep the procedural hierarchy physically above its authored floor after
    // all body bob and roll have been applied. The former disconnected boxes
    // could pass through the slab unnoticed; the opt-in director rig raises
    // the body only by the amount its lowest real paw endpoint requires.
    model.updateMatrixWorld(true);
    const pawPoint = new THREE.Vector3();
    let minPawY = Infinity;
    for (const chain of u.legChains) {
      chain.paw.getWorldPosition(pawPoint);
      minPawY = Math.min(minPawY, pawPoint.y);
    }
    if (Number.isFinite(minPawY) && minPawY < groundY + 0.01) {
      model.position.y += groundY + 0.01 - minPawY;
      model.updateMatrixWorld(true);
    }
  }
}
