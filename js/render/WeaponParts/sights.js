// Sights.
//
// Every sight below is authored against one number, `aimY`: the line of sight.
// Which FEATURE of a sight lands on that line is not a free choice — it is the
// thing the shooter aligns, and getting it wrong makes the sight unusable no
// matter how good the model looks in the hand.
//
//   front sight     the TOP of the post
//   open notch      the TOP OF THE SHOULDERS, with the notch cut below them
//   peep / aperture the CENTRE of the hole
//   optic           the axis of the glass
//
// The notch used to put its FLOOR on the line instead of its shoulders. Because
// the eye sits on that same line, the floor then projected to exactly the
// centre of the screen — and so did the top of the front post, which is the one
// thing you have to see. The post ended up precisely at the lower edge of the
// window, hidden behind the notch floor, on every open-sighted weapon in the
// game: aiming the Type 100, the M1911, the Kar98k or the Thompson showed a
// wall of rear sight across the middle of the screen and no front sight at all.
// Cutting the notch DOWN from the line is what opens a window for the post to
// stand in, which is what an open sight is.
import * as THREE from 'three';
import { WM } from '../WeaponMaterials.js';
import {
  mesh, bevelBoxGeo, cylGeo, sphereGeo, torusGeo, ringGeo, latheGeo,
} from './geometry.js';

// How far the notch floor sits below the line of sight. The front post has to
// fit inside this window, and the window is measured at the rear sight while
// the post is measured way out at the muzzle, so the post's own height has to
// be smaller than this by the ratio of those two distances. FRONT_POST_H is set
// against the tightest ratio on the roster (a pistol, whose short sight radius
// puts the front blade over half as far away again as the rear notch).
export const NOTCH_DEPTH = 0.009;
export const FRONT_POST_H = 0.013;

/**
 * Front sight.
 *
 * `mount` is the weapon-space Y of the surface the sight is fixed to — the top
 * of the barrel, shroud or gas block. A real front sight is brazed to a boss or
 * clamped in a band; it does not levitate above the barrel with a centimetre of
 * daylight under it, which is what every long-barrelled weapon in the game was
 * doing because the base was placed purely from the sight line and the barrel
 * happened to sit lower. Pass `band` (the barrel radius) as well to wrap a
 * proper split band around it.
 */
export function frontSight(mat, { aimY, z, ears = 'none', baseW = 0.026, baseH = 0.012, post = 'blade', bladeW = 0.005, mount = null, band = 0 } = {}) {
  const g = new THREE.Group();
  const postH = FRONT_POST_H;
  const topY = aimY;
  const baseY = topY - postH - baseH * 0.5;
  // A hood is 34mm across the ears; its base has to be at least as wide or the
  // two protector ears stand clear of it with daylight down both sides.
  const plateW = ears === 'hood' ? Math.max(baseW, 0.039) : baseW;
  g.add(mesh(bevelBoxGeo(plateW, baseH, 0.03, 0.0018), mat, 0, baseY, 0));
  const baseBottom = baseY - baseH / 2;
  if (mount !== null && mount < baseBottom - 0.0005) {
    const rise = baseBottom - mount;
    g.add(mesh(bevelBoxGeo(baseW * 0.60, rise + 0.002, 0.026, 0.0015), mat, 0, mount + rise / 2, 0));
    if (band > 0) {
      // Split band clamped round the barrel. A torus in the XY plane has its
      // axis along Z, which IS the bore axis, so it needs no rotation.
      g.add(mesh(torusGeo(band, 0.0032, 6, 18), mat, 0, mount - band, 0));
      g.add(mesh(bevelBoxGeo(0.010, 0.008, 0.012, 0.0012), mat, 0, mount - band * 2 - 0.002, 0));
    }
  }
  if (post === 'blade') {
    g.add(mesh(bevelBoxGeo(bladeW, postH, 0.012, 0.0012), mat, 0, topY - postH / 2, 0));
  } else { // round post
    g.add(mesh(cylGeo(bladeW * 0.7, bladeW * 0.55, postH, 10), mat, 0, topY - postH / 2, 0));
  }
  if (ears === 'wings') {
    for (const sx of [1, -1]) {
      g.add(mesh(bevelBoxGeo(0.004, postH + 0.008, 0.026, 0.0012), mat,
        sx * (baseW / 2 - 0.004), topY - postH / 2 + 0.002, 0));
    }
  } else if (ears === 'hood') {
    const hood = mesh(cylGeo(0.017, 0.017, 0.03, 14, true, Math.PI * 1.15, Math.PI * -0.075), mat,
      0, topY - postH * 0.55, 0, Math.PI / 2);
    g.add(hood);
    for (const sx of [1, -1]) {
      g.add(mesh(bevelBoxGeo(0.0035, 0.016, 0.03, 0.001), mat, sx * 0.0165, topY - postH * 0.55 - 0.008, 0));
    }
  } else if (ears === 'ring') {
    g.add(mesh(torusGeo(0.016, 0.0022, 5, 16), mat, 0, topY - postH * 0.55, 0));
  }
  g.position.z = z;
  return g;
}

/** Open notch rear sight — the TOP OF THE SHOULDERS lands exactly on aimY. */
export function rearNotch(mat, { aimY, z, w = 0.032, style = 'v', mount = null } = {}) {
  const g = new THREE.Group();
  const leafH = 0.013;
  const floorY = aimY - NOTCH_DEPTH;   // top of the notch floor
  // leaf body with the notch cut straight through it
  const half = w / 2;
  for (const sx of [1, -1]) {
    g.add(mesh(bevelBoxGeo(half - 0.005, leafH, 0.011, 0.0012), mat,
      sx * (half + 0.005) / 2 + sx * 0.0025, aimY - leafH / 2, 0));
  }
  // notch floor: a thin bridge a notch-depth below the shoulders
  g.add(mesh(bevelBoxGeo(0.012, 0.006, 0.011, 0.001), mat, 0, floorY - 0.003, 0));
  if (style === 'v') {
    // the walls of the V, flaring from the floor out to the shoulders
    for (const sx of [1, -1]) {
      g.add(mesh(bevelBoxGeo(0.008, 0.010, 0.011, 0.001), mat,
        sx * 0.010, floorY + 0.003, 0, 0, 0, sx * 0.5));
    }
  }
  // Base. It has to come UP to the underside of the leaves: at 9mm tall it
  // stopped 3.5mm short of them, and since the notch bridge between the leaves
  // is narrower than they are, both leaves were left standing in air.
  g.add(mesh(bevelBoxGeo(w + 0.01, 0.010, 0.026, 0.0018), mat, 0, aimY - leafH - 0.005, 0));
  // adjustment screw
  g.add(mesh(cylGeo(0.0035, 0.0035, 0.005, 8), mat, 0, aimY - leafH - 0.005, 0.014, Math.PI / 2));
  // `mount` is the weapon-space Y of the surface the sight is dovetailed into.
  const baseBottom = aimY - leafH - 0.010;
  if (mount !== null && mount < baseBottom - 0.0005) {
    const rise = baseBottom - mount;
    g.add(mesh(bevelBoxGeo(w * 0.7, rise + 0.002, 0.024, 0.0015), mat, 0, mount + rise / 2, 0));
  }
  g.position.z = z;
  return g;
}

/** Peep/aperture rear sight — the hole centre lands on aimY. */
export function rearAperture(mat, { aimY, z, r = 0.0086, protect = true } = {}) {
  const g = new THREE.Group();
  // The ring you actually look through. It is the whole point of a peep sight,
  // so it is built thick enough to read at view-model distance and backed by a
  // dark chamfer disc that makes the hole look like a hole rather than a gap
  // between two struts.
  g.add(mesh(torusGeo(r, 0.0034, 6, 22), mat, 0, aimY, 0));
  g.add(mesh(ringGeo(r - 0.0016, r + 0.0038, 22), WM.cavity, 0, aimY, 0.0032));
  g.add(mesh(bevelBoxGeo(0.014, 0.014, 0.012, 0.0015), mat, 0, aimY - r - 0.008, 0));
  g.add(mesh(bevelBoxGeo(0.03, 0.008, 0.03, 0.0018), mat, 0, aimY - r - 0.016, 0));
  if (protect) {
    for (const sx of [1, -1]) {
      g.add(mesh(bevelBoxGeo(0.004, 0.024, 0.014, 0.0012), mat, sx * (r + 0.006), aimY - 0.002, 0));
    }
    // windage/elevation knobs
    for (const sx of [1, -1]) {
      g.add(mesh(cylGeo(0.005, 0.005, 0.006, 10), mat, sx * (r + 0.011), aimY - 0.004, 0, 0, 0, Math.PI / 2));
    }
  }
  g.position.z = z;
  return g;
}

/**
 * Tangent / ladder rear sight (Kar98k, Mosin, PPSh). The notch is at the muzzle
 * end of the leaf; the ladder bed and the graduation slider have to stay under
 * its floor, because they are NEARER the eye than the notch is and anything
 * standing proud of the floor back there closes the window from below.
 */
export function rearTangent(mat, { aimY, z, w = 0.03, len = 0.07 } = {}) {
  const g = new THREE.Group();
  const floorY = aimY - NOTCH_DEPTH;
  g.add(mesh(bevelBoxGeo(w + 0.012, 0.012, len, 0.0018), mat, 0, aimY - 0.018, len * 0.18));
  g.add(mesh(bevelBoxGeo(w, 0.007, len * 0.55, 0.0012), mat, 0, floorY - 0.0045, len * 0.02, -0.06));
  for (const sx of [1, -1]) {
    g.add(mesh(bevelBoxGeo(0.005, 0.014, 0.010, 0.0012), mat, sx * w / 2, aimY - 0.007, -len * 0.24));
  }
  g.add(mesh(bevelBoxGeo(0.011, 0.005, 0.010, 0.001), mat, 0, floorY - 0.0025, -len * 0.24));
  // graduation slider
  g.add(mesh(bevelBoxGeo(w + 0.006, 0.008, 0.012, 0.0012), mat, 0, aimY - 0.016, len * 0.22));
  g.position.z = z;
  return g;
}

/** Modern flip-up iron on a rail: square notch, protected. */
export function railRearSight(mat, { aimY, z, w = 0.03 } = {}) {
  const g = new THREE.Group();
  const floorY = aimY - NOTCH_DEPTH;
  for (const sx of [1, -1]) {
    g.add(mesh(bevelBoxGeo(0.005, 0.02, 0.01, 0.0012), mat, sx * w / 2, aimY - 0.010, 0));
  }
  g.add(mesh(bevelBoxGeo(w, 0.006, 0.01, 0.001), mat, 0, floorY - 0.003, 0));
  g.add(mesh(bevelBoxGeo(w + 0.008, 0.008, 0.024, 0.0016), mat, 0, aimY - 0.020, 0.004));
  g.position.z = z;
  return g;
}

/**
 * Red dot / reflex optic.
 *
 * The eye is at +Z. Both elements have to be transparent or there is nothing to
 * aim through — the previous build put the opaque scope-lens material on the
 * rear element, which sat between the eye and the reticle and hid it
 * completely. The dot lives on the FRONT element, dead on the optic's axis, so
 * it lands exactly where the shot goes and stays welded to the glass.
 */
export function redDot(matBody, matGlass, matLens, matDot, { aimY = 0, z = 0, r = 0.019 } = {}) {
  const g = new THREE.Group();
  g.add(mesh(bevelBoxGeo(0.026, 0.016, 0.05, 0.002), matBody, 0, -r - 0.006, 0));
  g.add(mesh(bevelBoxGeo(0.034, 0.008, 0.018, 0.0015), matBody, 0, -r - 0.014, 0.008));
  g.add(mesh(cylGeo(r, r, 0.05, 16, true), matBody, 0, 0, 0, Math.PI / 2));
  g.add(mesh(torusGeo(r, 0.0022, 5, 16), matBody, 0, 0, -0.025));
  g.add(mesh(torusGeo(r, 0.0022, 5, 16), matBody, 0, 0, 0.025));
  // front (objective) element, canted like a real reflex lens
  const front = mesh(cylGeo(r * 0.94, r * 0.94, 0.0018, 18), matGlass, 0, 0, -0.020, Math.PI / 2 + 0.11);
  front.renderOrder = 2;
  g.add(front);
  // rear element the eye looks through — a coated wafer, not a solid disc
  const rear = mesh(cylGeo(r * 0.9, r * 0.9, 0.0016, 18), matGlass, 0, 0, 0.019, Math.PI / 2);
  rear.renderOrder = 2;
  g.add(rear);
  g.add(mesh(torusGeo(r * 0.92, 0.0016, 4, 18), matLens, 0, 0, 0.019)); // lens coating ring
  // the reticle: a hot core with a soft bloom halo, projected on the glass
  const halo = mesh(ringGeo(0, 0.0034, 14), WM.dotHalo, 0, 0, -0.0186);
  halo.renderOrder = 3;
  const core = mesh(ringGeo(0, 0.00115, 12), WM.dotCore, 0, 0, -0.0184);
  core.renderOrder = 4;
  g.add(halo, core);
  g.userData.reticle = core;
  g.userData.reticleHalo = halo;
  // The clear aperture, so a caller can work out how high the optic has to sit
  // for the whole window to see over the receiver it is bolted to.
  g.userData.opticR = r;
  g.userData.opticGlassZ = z - 0.020;
  // emitter housing under the front element (where the LED actually lives)
  g.add(mesh(bevelBoxGeo(0.008, 0.007, 0.010, 0.0015), matBody, 0, -r * 0.62, -0.018));
  g.add(mesh(sphereGeo(0.0022, 6, 5), matDot, 0, -r * 0.55, -0.018));
  // elevation turret
  g.add(mesh(cylGeo(0.006, 0.006, 0.008, 10), matBody, 0, r + 0.002, 0.006));
  g.position.set(0, aimY, z);
  return g;
}

/** Telescopic sight with mounts, eyepiece, objective bell and a lens glint. */
export function scope(matBody, matLens, { aimY = 0, z = 0, len = 0.26, r = 0.019, bell = 0.03 } = {}) {
  const g = new THREE.Group();
  // Open at both ends, a thin lip in front of each lens. Capped, the tube hid
  // its own glass: the lenses are seated inside it, and the caps were only ever
  // see-through because the profile used to be drawn inside-out.
  g.add(mesh(latheGeo('scp' + len + '_' + r + '_' + bell, [
    [r * 1.12, len / 2], [r * 1.25, len / 2], [r * 1.25, len * 0.4], [r, len * 0.34],
    [r, -len * 0.12], [bell, -len * 0.26], [bell, -len / 2], [bell * 0.9, -len / 2],
  ], 20), matBody));
  // Lenses seated IN the tube. At 0.9x/1.1x they sat ~3mm shy of the tube wall
  // and 2.5mm behind the end caps — a hairline ring of daylight round both ends
  // of every scope, which at display scale read as the glass floating.
  g.add(mesh(cylGeo(bell * 0.97, bell * 0.97, 0.004, 18), matLens, 0, 0, -len / 2 + 0.003, Math.PI / 2));
  g.add(mesh(cylGeo(r * 1.22, r * 1.22, 0.004, 18), matLens, 0, 0, len / 2 - 0.003, Math.PI / 2));
  // turrets
  g.add(mesh(cylGeo(0.008, 0.0075, 0.012, 12), matBody, 0, r + 0.004, len * 0.06));
  g.add(mesh(cylGeo(0.008, 0.0075, 0.012, 12), matBody, r + 0.004, 0, len * 0.06, 0, 0, Math.PI / 2));
  // rings + mounts
  for (const mz of [-len * 0.3, len * 0.24]) {
    g.add(mesh(torusGeo(r * 1.08, 0.004, 5, 16), matBody, 0, 0, mz));
    g.add(mesh(bevelBoxGeo(0.014, 0.024, 0.014, 0.0015), matBody, 0, -r - 0.010, mz));
  }
  g.position.set(0, aimY, z);
  return g;
}
