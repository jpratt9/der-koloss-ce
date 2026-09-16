// How the damage is sized against the rig, and how many builds there are.
// Read by the variant builder and by the attachment in js/render/ZombieDetail.js.

/** How many distinct damage builds exist. Enough that a horde never twins. */
export const VARIANTS = 8;

/**
 * Hips-to-head distance, in world units, of the rig every piece in
 * js/render/ZombieDetail/ was authored against (a calibrated in-game corpse standing 1.78 m tall).
 *
 * Sizes here are expressed relative to THIS rather than in absolute metres
 * because attachment happens before ZombieVisual calibrates: at attach time
 * the rig is still at its authored scale and only later gets multiplied up to
 * the target height. Anything measured in absolute metres therefore came out
 * ~1.6x too big, which is what put the tunic down around the knees.
 *
 * Measuring a ratio sidesteps the ordering entirely — both the measurement and
 * the bone scale get multiplied by the same factor, so they cancel.
 */
export const REFERENCE_SPAN = 0.71;

// How far cloth stands off the skin it is fitted to, at the top and at the hem
// of each garment, in the same reference units. Enough to ride over the chest
// and belly as the spine bends and the proportion presets rescale the bones
// under it; a hem hangs looser than a collar.
export const TUNIC_CLEAR = [0.035, 0.045];
export const SKIRT_CLEAR = [0.018, 0.035];
export const RAG_CLEAR = 0.012;
// Width, in reference units, of the head the skull damage was authored for.
export const HEAD_WIDTH = 0.45;
