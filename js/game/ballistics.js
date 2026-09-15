// Game's ray tests: what a shot, an arc or a sound meets on its way — walls,
// drawn prop cover, floors and posed zombie bodies.
// Methods of Game: js/game.js copies them onto Game.prototype.
import * as THREE from 'three';
import { segmentHitsBox } from '../utils.js';
import { audio } from '../audio.js';
import { ZSTATES, rayHitZombieBody } from '../zombies.js';
import { coverRayDistance } from '../shot-cover.js';
import { dogHitZones, rayHitZones } from '../combat-rules.js';

// Scratch for the posed-body ray test, so a firefight allocates nothing.
const _bodyHit = { dist: 0, head: false };

// Scratch for the face a shot struck on a prop's drawn cover: the latest test's,
// and the nearest one kept so far.
const _coverNormal = { x: 0, y: 1, z: 0 };
const _coverStruck = { x: 0, y: 1, z: 0 };

// Hit spheres above a zombie's feet, head first — only for a zombie with no
// model to test against; anything drawn is hit through its posed bones (see
// rayHitZombieBody). Shared: zombieHitTest runs per pellet against every live
// zombie, and it used to rebuild these as fresh objects for each one — a
// shotgun blast into a full horde was ~800 of them.
const ZOMBIE_HIT_SPHERES = Object.freeze([
  Object.freeze({ dy: 1.5, r: 0.23, head: true }),
  Object.freeze({ dy: 1.05, r: 0.36, head: false }),
  Object.freeze({ dy: 0.5, r: 0.33, head: false }),
]);
const CRAWLER_HIT_SPHERES = Object.freeze([
  Object.freeze({ dy: 0.45, r: 0.22, head: true }),
  Object.freeze({ dy: 0.28, r: 0.36, head: false }),
]);

export class GameBallistics {
  // Real occlusion: reuse the same swept-box test the weapons use, so a
  // closed paid door or a stack of crates muffles what is behind it. The
  // audio engine throttles and caches these calls itself.
  _installAudioOcclusion() {
    audio.setOcclusionTest((ex, ey, ez, lx, ly, lz) => {
      const dx = lx - ex, dy = ly - ey, dz = lz - ez;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 0.25) return 0;
      let blocked = 0;
      for (const c of this.map.colliders) {
        if (c.noRaycast || c.shootOk || c.bulletPass) continue;
        const t = segmentHitsBox(ex, ez, lx, lz, c);
        if (t < 0) continue;
        const yAt = ey + (ly - ey) * t;
        const y0 = c.y0 || 0;
        if (yAt < y0 || yAt > y0 + (c.h || 3)) continue;
        blocked += c.prop ? 0.35 : 1;
        if (blocked >= 1) return 1;
      }
      return Math.min(1, blocked);
    });
  }

  wallDist(origin, dir, maxDist = 120) {
    const x1 = origin.x + dir.x * maxDist, z1 = origin.z + dir.z * maxDist;
    const y1 = origin.y + dir.y * maxDist;
    let best = maxDist;
    for (const c of this.map.colliders) {
      // Window aperture guards keep players from jumping through a boarded
      // opening, but they are not physical cover: bullets still pass through.
      // `bulletPass` is the same idea for the reverse case — scaffolding that
      // holds bodies but that the player cannot see, so it must not stop a shot.
      if (c.noRaycast || c.bulletPass) continue;
      // A prop stops a shot only on the triangles drawn for it, not anywhere
      // in the box bodies collide with (see js/shot-cover.js).
      if (c.cover) {
        const d = coverRayDistance(c.cover, origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, best);
        if (d >= 0) best = d;
        continue;
      }
      const t = segmentHitsBox(origin.x, origin.z, x1, z1, c);
      if (t < 0) continue;
      const yAt = origin.y + (y1 - origin.y) * t;
      const y0 = c.y0 || 0;
      if (yAt >= y0 && yAt <= y0 + (c.h || 3)) {
        const d = t * maxDist;
        if (d < best) best = d;
      }
    }
    if (y1 < 0) { // floor
      const t = -origin.y / (y1 - origin.y);
      if (t * maxDist < best) best = t * maxDist;
    }
    return best;
  }

  /**
   * Like wallDist, but also reports which face was struck and what it is made
   * of, so impacts can spawn the right debris. Colliders carry no material, so
   * the surface is inferred from the collider's gameplay role — good enough to
   * make concrete, wood and steel read as three different hits.
   */
  wallHit(origin, dir, maxDist = 120) {
    const x1 = origin.x + dir.x * maxDist, z1 = origin.z + dir.z * maxDist;
    const y1 = origin.y + dir.y * maxDist;
    const out = this._wallHitOut || (this._wallHitOut = { dist: 0, nx: 0, ny: 1, nz: 0, surface: 'concrete', hit: false });
    out.dist = maxDist; out.hit = false;
    out.nx = -dir.x; out.ny = -dir.y; out.nz = -dir.z; out.surface = 'concrete';
    let bestCollider = null;
    for (const c of this.map.colliders) {
      if (c.noRaycast || c.bulletPass) continue;
      if (c.cover) {
        const d = coverRayDistance(c.cover, origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, out.dist, _coverNormal);
        if (d < 0) continue;
        out.dist = d; bestCollider = c;
        _coverStruck.x = _coverNormal.x; _coverStruck.y = _coverNormal.y; _coverStruck.z = _coverNormal.z;
        continue;
      }
      const t = segmentHitsBox(origin.x, origin.z, x1, z1, c);
      if (t < 0) continue;
      const yAt = origin.y + (y1 - origin.y) * t;
      const y0 = c.y0 || 0;
      if (yAt < y0 || yAt > y0 + (c.h || 3)) continue;
      const d = t * maxDist;
      if (d >= out.dist) continue;
      out.dist = d; bestCollider = c;
    }
    if (y1 < 0) {
      const t = -origin.y / (y1 - origin.y);
      if (t * maxDist < out.dist) {
        out.dist = t * maxDist; bestCollider = null;
        out.nx = 0; out.ny = 1; out.nz = 0; out.hit = true;
        const hx = origin.x + dir.x * out.dist, hz = origin.z + dir.z * out.dist;
        out.surface = this.map.roomAt(hx, hz, 0)?.outdoor ? 'dirt' : 'concrete';
        return out;
      }
    }
    if (bestCollider) {
      out.hit = true;
      const c = bestCollider;
      if (c.cover) {
        // The face of the drawn triangle that was struck.
        out.nx = _coverStruck.x; out.ny = _coverStruck.y; out.nz = _coverStruck.z;
      } else {
        const hx = origin.x + dir.x * out.dist, hz = origin.z + dir.z * out.dist;
        // Nearest face wins: the smallest distance to a slab plane is the one
        // the ray came through.
        const dxMin = Math.abs(hx - c.minX), dxMax = Math.abs(hx - c.maxX);
        const dzMin = Math.abs(hz - c.minZ), dzMax = Math.abs(hz - c.maxZ);
        const m = Math.min(dxMin, dxMax, dzMin, dzMax);
        out.nx = 0; out.ny = 0; out.nz = 0;
        if (m === dxMin) out.nx = -1;
        else if (m === dxMax) out.nx = 1;
        else if (m === dzMin) out.nz = -1;
        else out.nz = 1;
      }
      out.surface = c.window || c.board ? 'wood'
        : c.boxCollider ? 'wood'
        : c.prop ? 'metal'
        : 'concrete';
    }
    return out;
  }

  _arcTargetPoint(zombie) {
    return {
      x: zombie.x,
      y: zombie.y + (zombie.dog ? 0.76 : zombie.crawler ? 0.42 : 0.9),
      z: zombie.z,
    };
  }

  _arcHasLineOfSight(from, to) {
    if (!from || !to) return false;
    const origin = new THREE.Vector3(from.x, from.y + 0.22, from.z);
    const delta = new THREE.Vector3(to.x - origin.x, to.y - origin.y, to.z - origin.z);
    const distance = delta.length();
    if (distance < 0.05) return true;
    const wall = this.wallDist(origin, delta.normalize(), distance + 0.15);
    return wall >= distance - 0.25;
  }

  _dg2FloorImpact(origin, dir, maxDist = 60) {
    // Ray-march against map.floorY so ground, catwalks and raised rooms are all
    // valid surfaces. A wall collider shortens the scan before selection.
    if (!origin || !dir || dir.y >= -0.035) return null;
    const limit = this.wallDist(origin, dir, maxDist);
    const step = 0.12;
    for (let d = step; d <= limit + step; d += step) {
      const distance = Math.min(d, limit);
      const point = {
        x: origin.x + dir.x * distance,
        y: origin.y + dir.y * distance,
        z: origin.z + dir.z * distance,
      };
      const floor = this.map.floorY(point.x, point.z, point.y + 0.8, 2);
      if (point.y <= floor + 0.1) return { x: point.x, y: floor, z: point.z, distance };
      if (distance >= limit) break;
    }
    return null;
  }

  zombieHitTest(origin, dir, maxDist) {
    // returns array of {z, dist, head} sorted by dist
    const hits = [];
    for (const [, z] of this.zombies.zombies) {
      if (z.state === ZSTATES.DIE) continue;
      if (z.dog) {
        const hit = rayHitZones({ origin, dir, zones: dogHitZones(z), maxDistance: maxDist });
        if (hit) hits.push({ z, dist: hit.centerDistance, head: hit.head });
        continue;
      }
      const posed = rayHitZombieBody(z, origin, dir, maxDist, _bodyHit);
      if (posed !== null) {
        if (posed) hits.push({ z, dist: _bodyHit.dist, head: _bodyHit.head });
        continue;
      }
      const spheres = z.crawler ? CRAWLER_HIT_SPHERES : ZOMBIE_HIT_SPHERES;
      for (let k = 0; k < spheres.length; k++) {
        const sp = spheres[k];
        const ox = z.x - origin.x, oy = z.y + sp.dy - origin.y, oz = z.z - origin.z;
        const tca = ox * dir.x + oy * dir.y + oz * dir.z;
        if (tca < 0 || tca > maxDist) continue;
        const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
        if (d2 < sp.r * sp.r) {
          hits.push({ z, dist: tca, head: sp.head });
          break; // one hit per zombie per ray
        }
      }
    }
    hits.sort((a, b) => a.dist - b.dist);
    return hits;
  }
}
