// How the gear is sized against the rig: the head scale the helmets are
// authored to, the per-axis limb shaping, and the spine correction. Every
// one of these is read outside this folder too, by js/player/soldier-pose.js.

// The Head bone carries a deliberately oversized cartoon skull with ears that
// stand a long way off it. SoldierVisual reshapes it to human proportion every
// frame: down overall, and narrower still across X so the ears tuck in under
// the headgear instead of sticking out past it.
//
// HEAD_SCALE is the uniform part and HEAD_SHAPE the per-axis remainder. A
// helmet parented to the Head bone inherits both, so the mount in
// js/render/SoldierGear.js cancels the bone's world scale per axis before
// the gear is drawn.
export const HEAD_SCALE = 0.42;
// The size head gear was authored against. Change HEAD_SCALE and the helmets
// follow, instead of floating off a head that is no longer that size.
export const HEAD_REF = 0.64;
export const HEAD_SHAPE = [0.86, 1.0, 0.94];   // multiplies HEAD_SCALE, per axis

// Limb slimming. X/Z only: the joints sit along Y, so touching Y would move
// the knees and elbows away from the sculpted mesh and off the foot IK bones,
// which are parented to the root rather than to the shins.
// The shipped hands are cartoon-huge — a fist as wide as the skull. Scaling
// the finger ROOTS shrinks every joint below them, which brings the hand back
// to something that can plausibly hold a rifle grip. The palm rides on the
// forearm bone and is slimmed with it.
export const HAND_SCALE = 0.58;

// The sculpted feet are cartoon-huge too. They carry no child bones, so unlike
// the rest of the limbs they can be scaled outright without shearing anything
// below them.
export const FOOT_SCALE = 0.74;

export const LIMB_SHAPE = {
  // The shipped torso is a barrel — nearly as deep as it is wide, and half
  // again too broad for a 1.78 m man. Narrowing it across X and Z does shear
  // the arm chain slightly, because the shoulders are rotated children of the
  // chest, but at this little anisotropy it is invisible and the silhouette
  // gain is the difference between a soldier and a beer keg.
  Hips: [0.84, 1, 0.88], Abdomen: [0.82, 1, 0.86], Torso: [0.80, 1, 0.84],
  UpperArmL: [0.90, 1, 0.90], UpperArmR: [0.90, 1, 0.90],
  LowerArmL: [0.88, 1, 0.88], LowerArmR: [0.88, 1, 0.88],
  UpperLegL: [0.92, 1, 0.92], UpperLegR: [0.92, 1, 0.92],
  LowerLegL: [0.92, 1, 0.92], LowerLegR: [0.92, 1, 0.92],
};

// Corrective rotations applied to the spine every frame, in radians about each
// bone's own X axis (which is the world X axis at rest for all five).
//
// These are large on purpose. The shipped rig is a shambling corpse: measured
// at rest, its chest bone leans 70 degrees forward and its neck another 65, so
// the head hangs out in front of the knees. A soldier stands up. Undoing that
// swings the shoulders back with the chest, which is exactly why the rifle
// carry pose in player.js is solved by IK AFTER these are applied — the arms
// then reach for where the hands should be rather than for where the corpse
// happened to leave them.
export const SPINE_FIX = {
  Abdomen: -0.16,
  Torso: -1.00,
  Neck: -0.10,
  Head: 0.86,
};
