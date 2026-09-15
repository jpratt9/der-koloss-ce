// ZombieManager's movement: the colliders that can stop a body, and the
// collision-resolved step and crowd push that every body moves by.
// Methods of ZombieManager: js/zombies.js copies them onto ZombieManager.prototype.
import { moveCircleWithColliders } from '../utils.js';
import { NAV_RADIUS } from '../navmesh.js';
import { ZSTATES } from './states.js';

// Headings, in degrees off the desired one, tried when a straight step is
// blocked. This is what walks a body around the corner of a crate or a stair
// stringer instead of grinding into it. Both signs of each are probed.
const DEFLECT = [28, 55, 82, 110];

export class ZombieManagerMovement {
  /**
   * Colliders that can stop THIS body at its current height, taken from the
   * navigation grid's spatial hash.
   *
   * The old loop tested all ~310 map colliders, twice, for every enemy every
   * frame. Bucketed lookup makes it about ten, which is what pays for the
   * deflection probing below.
   *
   * Returns a SHARED buffer — consume it before the next call.
   */
  _colliders(z) {
    const out = this._colBuf;
    if (this.nav) this.nav.activeColliders(z.x, z.z, z.y, out);
    else {
      out.length = 0;
      for (const c of this.map.colliders) {
        if (c.shootOk || c.playerOnly) continue;
        if (c.y0 !== undefined && (c.y0 > z.y + 1.1 || c.y0 + c.h < z.y + 0.25)) continue;
        out.push(c);
      }
    }
    // A zombie working a boarded window is legitimately inside the frame it is
    // tearing apart, so the window panel cannot be solid to it in those states.
    if (z.state === ZSTATES.CLIMB || z.state === ZSTATES.TEAR || z.state === ZSTATES.APPROACH) {
      let w = 0;
      for (let i = 0; i < out.length; i++) if (!out[i].window) out[w++] = out[i];
      out.length = w;
    }
    return out;
  }

  /**
   * Step a body along (dirX, dirZ) and return how far it actually got.
   *
   * Two things changed here, and between them they are most of this bug.
   *
   * First, the move is resolved with `moveCircleWithColliders` — the same
   * sub-stepped, four-iteration, entry-side-honouring routine the player uses —
   * instead of a bare two-pass depenetration. A hound covers 6.8 m/s; at a long
   * frame the old single shove could jump it clean through a stringer or wedge
   * it inside a corner that then took several frames to settle out of.
   *
   * Second, the failed-move recovery is real. The old code tried ONE
   * perpendicular direction and only took it if a 1m probe was clear of every
   * collider — which in a corner, beside a stair flight, or between two crates
   * is essentially never, so the body simply stopped and ground its run cycle
   * against the geometry. That is the "stuck on nothing" the player sees. Now a
   * blocked body fans out through progressively wider deflections and takes the
   * one that makes the most real progress toward its goal, which is how a body
   * walks around the corner of an obstacle rather than into it.
   */
  moveZombie(z, dirX, dirZ, dt) {
    if (z.state === ZSTATES.ATTACK) return 0;
    const step = z.speed * dt;
    if (!(step > 1e-6)) return 0;
    const cols = this._colliders(z);
    const ox = z.x, oz = z.z;
    [z.x, z.z] = moveCircleWithColliders(ox, oz, dirX * step, dirZ * step, NAV_RADIUS, cols);
    const moved = Math.hypot(z.x - ox, z.z - oz);
    if (moved >= step * 0.55) { z.slideSide = 0; return moved; }

    // Blocked. Probe deflected headings from the ORIGINAL position — never from
    // the half-resolved one, which is already pressed into the obstacle.
    const gx = z.goalX !== undefined ? z.goalX : ox + dirX * 8;
    const gz = z.goalZ !== undefined ? z.goalZ : oz + dirZ * 8;
    let bestX = z.x, bestZ = z.z, bestScore = -Infinity;
    let bestSide = 0;
    for (const deg of DEFLECT) {
      for (const s of [1, -1]) {
        const a = deg * s * (Math.PI / 180);
        const ca = Math.cos(a), sa = Math.sin(a);
        const dx = dirX * ca - dirZ * sa, dz = dirX * sa + dirZ * ca;
        const [nx, nz] = moveCircleWithColliders(ox, oz, dx * step, dz * step, NAV_RADIUS, cols);
        const adv = Math.hypot(nx - ox, nz - oz);
        if (adv < step * 0.3) continue;
        // Closing on the goal is what counts, but commit to whichever way round
        // the obstacle this body already chose — without that hysteresis it
        // reverses every frame at the obstacle's centre line and stands still.
        let score = adv * 0.5 - Math.hypot(gx - nx, gz - nz);
        if (s === z.slideSide) score += 0.35;
        if (score > bestScore) { bestScore = score; bestX = nx; bestZ = nz; bestSide = s; }
      }
      if (bestScore > -Infinity) break;   // shallowest deflection that works wins
    }
    z.x = bestX; z.z = bestZ;
    if (bestSide) z.slideSide = bestSide;
    return Math.hypot(z.x - ox, z.z - oz);
  }

  /**
   * Crowd separation, resolved against the world.
   *
   * The push used to be written straight onto x/z with no collision pass, so a
   * dense knot of bodies at a doorway or against a wall shoved its neighbours
   * INTO the geometry. Once inside, depenetration and the crowd push fought each
   * other and the body stayed wedged — one of the ways an enemy ended up stuck
   * with nothing visibly in front of it. Routing the push through the same
   * resolver as ordinary movement means crowding can never place a body
   * somewhere it is not allowed to stand.
   */
  separate(z, dt) {
    let px = 0, pz = 0;
    for (const o of this.zombies.values()) {
      if (o === z || o.state === ZSTATES.DIE) continue;
      const dx = z.x - o.x, dz = z.z - o.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.45 * 0.45 && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (0.45 - d) * 2.2 * dt;
        px += (dx / d) * push; pz += (dz / d) * push;
      }
    }
    if (px === 0 && pz === 0) return;
    [z.x, z.z] = moveCircleWithColliders(z.x, z.z, px, pz, NAV_RADIUS, this._colliders(z));
  }
}
