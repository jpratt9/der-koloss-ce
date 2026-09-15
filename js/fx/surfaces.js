// The names more than one file in js/fx/ reads: what each surface throws off
// when a bullet hits it, and the one colour every pool of blood in the game
// is. js/fx.js re-exports BLOOD_DECAL_COLOR, because js/map/hand-placed.js
// stamps the level's old blood with the same value.

// Every pool of blood in the game — sprayed here, or standing on the floor
// since before the player arrived (js/map.js) — is this one colour, so the
// level's old blood and a kill from ten seconds ago are the same substance.
// It looks too dark as a hex because a decal is unlit: it goes into the HDR
// buffer as a constant and the post chain's exposure multiplies it, so a
// literal dried-blood value comes out of the composite glowing vermillion.
// This is the value that lands as drying blood on the floor.
export const BLOOD_DECAL_COLOR = 0x2a0705;

// Surface response table. A bullet hitting concrete, steel, wood and flesh
// should look like four different events — this is the single biggest "AAA"
// tell in a shooter and the old code drew the same four beige dots for all of
// them.
// Tuned deliberately small and short. An earlier pass made every round throw a
// head-sized white cloud that hung in the air — impressive in a still frame,
// exhausting to actually play against. A bullet strike should be a tight, fast
// puff and a couple of chips; the thing that persists is the HOLE, not the dust.
export const IMPACTS = {
  concrete: {
    dust: { n: 5, color0: [0.50, 0.48, 0.45], color1: [0.26, 0.25, 0.24], size0: 0.045, size1: 0.20, life: [0.22, 0.45], speed: 1.1, grav: 1.6, drag: 4.2 },
    chips: { n: 4, color0: [0.42, 0.40, 0.38], size0: 0.028, size1: 0.012, life: [0.3, 0.6], speed: 3.4, grav: 13 },
    sparks: 0, decal: 0x2a2825, decalSize: [0.055, 0.10], flash: 0,
  },
  metal: {
    dust: { n: 2, color0: [0.34, 0.34, 0.36], color1: [0.18, 0.18, 0.2], size0: 0.03, size1: 0.12, life: [0.16, 0.3], speed: 0.9, grav: 0.8, drag: 5 },
    chips: { n: 2, color0: [0.45, 0.45, 0.47], size0: 0.02, size1: 0.01, life: [0.25, 0.5], speed: 3.0, grav: 13 },
    sparks: 9, decal: 0x1c1d20, decalSize: [0.035, 0.07], flash: 0.35,
  },
  wood: {
    dust: { n: 3, color0: [0.42, 0.34, 0.24], color1: [0.22, 0.18, 0.13], size0: 0.035, size1: 0.14, life: [0.2, 0.4], speed: 1.0, grav: 1.8, drag: 4.4 },
    chips: { n: 6, color0: [0.40, 0.30, 0.18], size0: 0.032, size1: 0.016, life: [0.35, 0.7], speed: 4.0, grav: 14 },
    sparks: 0, decal: 0x1a1208, decalSize: [0.05, 0.09], flash: 0,
  },
  dirt: {
    dust: { n: 6, color0: [0.36, 0.31, 0.24], color1: [0.19, 0.16, 0.13], size0: 0.06, size1: 0.26, life: [0.26, 0.5], speed: 1.2, grav: 1.4, drag: 3.8 },
    chips: { n: 4, color0: [0.26, 0.22, 0.16], size0: 0.026, size1: 0.012, life: [0.3, 0.55], speed: 3.2, grav: 14 },
    sparks: 0, decal: 0x181209, decalSize: [0.07, 0.13], flash: 0,
  },
  glass: {
    dust: { n: 2, color0: [0.6, 0.68, 0.72], color1: [0.4, 0.48, 0.55], size0: 0.028, size1: 0.10, life: [0.16, 0.32], speed: 1.1, grav: 1.2, drag: 5 },
    chips: { n: 8, color0: [0.7, 0.78, 0.86], size0: 0.024, size1: 0.012, life: [0.45, 0.85], speed: 4.4, grav: 14 },
    sparks: 3, decal: 0x22282c, decalSize: [0.04, 0.08], flash: 0.14,
  },
};
