// Variant construction: the damage builds themselves, made once per model
// against its measured skin and shared by every corpse wearing them.
import * as THREE from 'three';
import { mergeGeometries } from '../../../vendor/utils/BufferGeometryUtils.js';
import {
  VARIANTS, REFERENCE_SPAN, TUNIC_CLEAR, SKIRT_CLEAR, RAG_CLEAR, HEAD_WIDTH,
} from './constants.js';
import { mulberry32 } from './materials.js';
import { stripGeo, garmentGeo, placed, oriented, mergeOne } from './primitives.js';
import {
  X_AXIS, Y_AXIS, measureSkin, farthestHit, centreOf, bodyProfile, reachAt, fitToBody,
} from './fitting.js';

function buildVariant(seed, body) {
  const rnd = mulberry32(seed);
  const { fit } = body;
  // How mauled this build is. Most are ragged; a few are wrecked.
  const damage = rnd() < 0.25 ? 0.85 + rnd() * 0.15 : 0.25 + rnd() * 0.5;
  const v = { hips: null, torso: null, shoulderL: null, shoulderR: null, head: null };

  // ---- hips: the torn-off skirt of a greatcoat ----------------------------
  {
    const S = body.skirt;
    const h = (S.y1 - S.y0) / fit;
    const parts = [];
    // The skirt itself, as one continuous piece of cloth with a shredded hem.
    // Doing this as a garment rather than as loose strips is what stops it
    // reading as a grass skirt. It is open down the front, as a greatcoat's
    // skirt is below the buttons, so a striding thigh comes out through the
    // opening instead of through the cloth.
    const opening = 1.4;
    parts.push(fitToBody(garmentGeo(h, opening / 2, Math.PI * 2 - opening, rnd), S, fit, SKIRT_CLEAR));
    // A few strips torn loose below the hem. Short and wide: long thin ones
    // read as sticks hanging off the model, not fabric.
    for (let i = 0, n = 3 + Math.floor(rnd() * 4); i < n; i++) {
      const a = opening / 2 + rnd() * (Math.PI * 2 - opening);
      const r = reachAt(S, a, S.y0) / fit + SKIRT_CLEAR[1] + rnd() * 0.03;
      parts.push(placed(
        stripGeo(0.13 + rnd() * 0.10, 0.10 + rnd() * 0.14, 0.5 + rnd() * 0.3, rnd),
        Math.sin(a) * r, -h * 0.5, Math.cos(a) * r,
        (rnd() - 0.5) * 0.25, a, (rnd() - 0.5) * 0.3,
      ));
    }
    // A thin surviving belt strap round the top, drawn in to the waist rather
    // than a hoop standing off it.
    const strap = new THREE.CylinderGeometry(1, 1, 0.028, 24, 1, true).translate(0, h * 0.5 - 0.02, 0);
    parts.push(fitToBody(strap, S, fit, [SKIRT_CLEAR[0] + 0.008, SKIRT_CLEAR[0] + 0.008]));
    v.hips = mergeOne(parts);
  }

  // ---- torso: exposed ribs, wound cavity, hanging flesh -------------------
  // One mesh, two material groups (bone then flesh), so a torn-open torso
  // costs a single draw call instead of two.
  {
    const T = body.tunic;
    const h = (T.y1 - T.y0) / fit;
    const skinAt = (bearing, y) => reachAt(T, bearing, (T.y0 + T.y1) / 2 + y * fit) / fit;
    const clothParts = [];
    const boneParts = [];
    const fleshParts = [];
    const side = rnd() < 0.5 ? 1 : -1;
    const ribs = damage > 0.6 ? 4 : damage > 0.35 ? 2 : 0;
    // Bearings run round from the front, so the mirror of one is its negative.
    // `PI - x` mirrored front to back instead and cut half the rips between the
    // shoulder blades, nowhere near the ribs they were meant to show.
    const gapCentre = side * 0.35;

    // A ripped tunic. The base model is bare-chested, which reads as an
    // unfinished character rather than a corpse; clothing it is the single
    // biggest step toward a WaW-era soldier silhouette. The rip is placed on
    // the same side as the ribs so the two damage features agree.
    {
      const gap = ribs ? 0.55 + damage * 0.55 : 0.16;
      // Torn less deep than the coat skirt: its hem tucks under the skirt, and a
      // deep tear there only opens a window onto bare belly.
      clothParts.push(fitToBody(garmentGeo(h, gapCentre + gap / 2, Math.PI * 2 - gap, rnd, 0.2), T, fit, TUNIC_CLEAR));
    }
    // Ribs arc round the chest in the rip, their crowns just proud of the skin.
    const q = new THREE.Quaternion();
    const flat = new THREE.Quaternion().setFromAxisAngle(X_AXIS, Math.PI / 2);
    for (let i = 0; i < ribs; i++) {
      const r = 0.085 - i * 0.006, arc = 1.5 + rnd() * 0.4, y = 0.12 - i * 0.045;
      const reach = skinAt(gapCentre, y) + 0.010 - r;
      q.setFromAxisAngle(Y_AXIS, gapCentre - Math.PI / 2 + arc / 2).multiply(flat);
      boneParts.push(oriented(new THREE.TorusGeometry(r, 0.009, 4, 8, arc), q,
        Math.sin(gapCentre) * reach, y, Math.cos(gapCentre) * reach));
    }
    if (ribs) {
      // A dark cavity behind the ribs, so they read as a hole rather than
      // as bones stuck onto an intact chest.
      const reach = skinAt(gapCentre, 0.06) + 0.004 - 0.085;
      q.setFromAxisAngle(Y_AXIS, gapCentre).multiply(flat);
      fleshParts.push(oriented(new THREE.SphereGeometry(0.085, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), q,
        Math.sin(gapCentre) * reach, 0.06, Math.cos(gapCentre) * reach));
    }
    for (let i = 0, n = Math.round(damage * 4); i < n; i++) {
      const a = gapCentre + (rnd() - 0.5) * 0.9, y = 0.02 - rnd() * 0.12;
      const reach = skinAt(a, y) + 0.008;
      fleshParts.push(placed(
        stripGeo(0.03 + rnd() * 0.025, 0.10 + rnd() * 0.14, 0.7, rnd),
        Math.sin(a) * reach, y, Math.cos(a) * reach,
        0.3 + rnd() * 0.4, a + (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.5,
      ));
    }
    // One mesh for the whole torso, with a material group per surface type, so
    // a clothed and torn-open chest still costs a single draw call.
    const layers = [
      ['cloth', mergeOne(clothParts)],
      ['bone', mergeOne(boneParts)],
      ['flesh', mergeOne(fleshParts)],
    ].filter(([, g]) => g);
    if (layers.length === 1) {
      v.torso = { geo: layers[0][1], mats: [layers[0][0]] };
    } else if (layers.length > 1) {
      const merged = mergeGeometries(layers.map(([, g]) => g), true);
      for (const [, g] of layers) g.dispose();
      if (merged) v.torso = { geo: merged, mats: layers.map(([k]) => k) };
    }
  }

  // ---- shoulders: torn sleeve tatters -------------------------------------
  // Hung round the top of the upper arm they were torn from, and carried by it
  // rather than by the collarbone, which the arm swings away from.
  for (const key of ['shoulderL', 'shoulderR']) {
    if (rnd() > 0.75) continue;                   // some sleeves survive intact
    const parts = [];
    for (let i = 0, n = 2 + Math.floor(rnd() * 3); i < n; i++) {
      // Short: they lie along the arm, and a zombie walks with its arms held
      // out, so anything long enough to hang reads as a flag.
      const strip = stripGeo(0.055 + rnd() * 0.04, 0.06 + rnd() * 0.08, 0.6, rnd);
      // down the arm from the shoulder joint, and round it from its outside
      parts.push(body[key].tatter(strip, 0.12 + rnd() * 0.25, (rnd() - 0.5) * 2.4, (rnd() - 0.5) * 0.5));
    }
    v[key] = mergeOne(parts.filter(Boolean));
  }

  // ---- head: jaw and skull damage ------------------------------------------
  if (damage > 0.55) {
    const parts = [];
    const side = rnd() < 0.5 ? 1 : -1;
    // Exposed cheekbone, low on the side of the face along the jaw.
    parts.push(body.head.stud(new THREE.SphereGeometry(0.032, 6, 5, 0, Math.PI * 1.1, 0, Math.PI * 0.6),
      new THREE.Vector3(side * 0.8, -0.35, 0.5), 0.016));
    if (rnd() < 0.6) {
      // A patch of bare skull above the ear, scalp gone.
      parts.push(body.head.stud(new THREE.SphereGeometry(0.047, 7, 5, 0, Math.PI * 0.9, 0, Math.PI * 0.45),
        new THREE.Vector3(side * 0.55, 0.75, -0.35), 0.020));
    }
    v.head = mergeOne(parts.filter(Boolean));
  }

  return v;
}

/** A sleeve's worth of frame: the upper arm's axis and the skin round it. */
function armFrame(skin, B, s, fit) {
  const origin = B['UpperArm' + s].getWorldPosition(new THREE.Vector3());
  const axis = B['LowerArm' + s].getWorldPosition(new THREE.Vector3()).sub(origin);
  const length = axis.length();
  axis.divideScalar(length);
  // The model faces +Z, so its left is +X: `outward` is away from the body.
  const outward = new THREE.Vector3(s === 'L' ? 1 : -1, 0, 0);
  outward.addScaledVector(axis, -outward.dot(axis)).normalize();
  const across = new THREE.Vector3().crossVectors(axis, outward);
  const tris = skin.tris['arm' + s];
  const base = new THREE.Vector3(), dir = new THREE.Vector3(), basis = new THREE.Matrix4(), twist = new THREE.Matrix4();
  return {
    bone: 'UpperArm' + s,
    origin,
    /**
     * Hang a strip off the arm's surface `t` of the way to the elbow, `around`
     * radians round from its outside, running down the arm.
     */
    tatter(geo, t, around, turn) {
      dir.copy(outward).multiplyScalar(Math.cos(around)).addScaledVector(across, Math.sin(around));
      base.copy(origin).addScaledVector(axis, t * length);
      const reach = farthestHit(tris, base, dir);
      if (reach < 0) { geo.dispose(); return null; }
      // A strip hangs down its own -Y: point that down the arm, and its face out.
      const up = axis.clone().negate();
      basis.makeBasis(new THREE.Vector3().crossVectors(up, dir), up, dir);
      basis.premultiply(twist.makeRotationAxis(dir, turn));
      basis.setPosition(base.addScaledVector(dir, reach + RAG_CLEAR * fit).sub(origin).divideScalar(fit));
      return geo.applyMatrix4(basis);
    },
  };
}

/** The skull the head damage is stood on. */
function headFrame(skin, B, fit) {
  const tris = skin.tris.head;
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 1; i < tris.length; i += 3) { y0 = Math.min(y0, tris[i]); y1 = Math.max(y1, tris[i]); }
  const { cx, cz } = centreOf(tris);
  const centre = new THREE.Vector3(cx, (y0 + y1) / 2, cz);
  const origin = B.Head.getWorldPosition(new THREE.Vector3());
  // Damage is sized to the skull it is on. Both heads are cartoon-large, the
  // Basic's twice the Chubby's for the same body, and a cheekbone authored
  // against a human skull was a speck on it.
  let x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < tris.length; i += 3) { x0 = Math.min(x0, tris[i]); x1 = Math.max(x1, tris[i]); }
  const size = (x1 - x0) / fit / HEAD_WIDTH;
  return {
    bone: 'Head',
    origin,
    /** Stand a spherical cap on the skin out along `dir`, its crown `proud` above it. */
    stud(geo, dir, proud) {
      dir.normalize();
      const reach = farthestHit(tris, centre, dir);
      if (reach < 0) { geo.dispose(); return null; }
      geo.scale(size, size, size);
      const sink = (geo.parameters.radius - proud) * size * fit;
      const at = centre.clone().addScaledVector(dir, reach - sink).sub(origin).divideScalar(fit);
      return oriented(geo, new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir), at.x, at.y, at.z);
    },
  };
}

// Source model -> its fitted variants and where they mount, or null if the rig
// is missing a bone they need. Built on first attach.
const _fitted = new WeakMap();

export function fittedFor(visual) {
  const key = visual.src || visual.inner;
  if (_fitted.has(key)) return _fitted.get(key);
  const B = visual.bones;
  let fitted = null;
  const needed = ['Hips', 'Torso', 'Head', 'UpperArmL', 'UpperArmR', 'LowerArmL', 'LowerArmR'];
  const skin = needed.every((n) => B[n]) ? measureSkin(visual) : null;
  if (skin && skin.beltTop > skin.legBottom && skin.trunkTop > skin.beltTop) {
    const fit = B.Head.getWorldPosition(new THREE.Vector3()).distanceTo(B.Hips.getWorldPosition(new THREE.Vector3())) / REFERENCE_SPAN;
    // The skirt runs from just over the belt most of the way down the shorts;
    // the tunic from below the belt, so its hem laps over the top of the skirt,
    // to the top of the shoulders. Both are fitted round the axis of the body
    // under them — not the Hips bone, which on these rigs is behind the pelvis.
    const around = [...skin.tris.pelvis, ...skin.tris.trunk];
    const pelvis = centreOf(skin.tris.pelvis);
    const skirt = bodyProfile(around, pelvis.cx, pelvis.cz,
      skin.legBottom + (skin.beltTop - skin.legBottom) * 0.2, skin.beltTop + 0.01 * fit);
    const trunk = centreOf(skin.tris.trunk);
    const tunic = bodyProfile(around, trunk.cx, trunk.cz, skin.beltTop - 0.10 * fit, skin.trunkTop - 0.05 * fit);
    const body = {
      fit, skirt, tunic,
      shoulderL: armFrame(skin, B, 'L', fit), shoulderR: armFrame(skin, B, 'R', fit), head: headFrame(skin, B, fit),
    };
    const middle = (p) => new THREE.Vector3(p.cx, (p.y0 + p.y1) / 2, p.cz);
    // Mount points are kept in their bone's own space, so they hold for every
    // clone of this model whatever it has been scaled to.
    const local = (bone, world) => B[bone].worldToLocal(world.clone());
    fitted = {
      variants: Array.from({ length: VARIANTS }, (_, i) => buildVariant(0x9e37 + i * 2654435761, body)),
      slots: {
        hips: { bone: 'Hips', at: local('Hips', middle(skirt)) },
        torso: { bone: 'Torso', at: local('Torso', middle(tunic)) },
        shoulderL: { bone: body.shoulderL.bone, at: local(body.shoulderL.bone, body.shoulderL.origin) },
        shoulderR: { bone: body.shoulderR.bone, at: local(body.shoulderR.bone, body.shoulderR.origin) },
        head: { bone: 'Head', at: local('Head', body.head.origin) },
      },
    };
  }
  _fitted.set(key, fitted);
  return fitted;
}
