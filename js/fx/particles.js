// Particles: the generic burst, surface-aware bullet impacts, and blood.
// FxParticles' methods are copied onto FX.prototype by js/fx.js.
import { rand } from '../utils.js';
import { BLOOD_DECAL_COLOR, IMPACTS } from './surfaces.js';

export class FxParticles {
  // =========================================================================
  // particles
  // =========================================================================
  /**
   * Back-compatible generic burst. Kept because a dozen call sites across the
   * game use it for ad-hoc puffs; new effects should use the richer helpers.
   */
  spawnParticles(x, y, z, { count = 8, color = [1, 0.3, 0.1], speed = 3, spread = 1, life = 0.6, grav = 6, size = 1, up = 1, additive = null } = {}) {
    const safeLife = Number.isFinite(life) ? Math.max(0.05, life) : 0.6;
    // Warm/bright colours look right additive; dull ones look right alpha.
    const hot = additive ?? (color[0] + color[1] + color[2] > 1.9 || color[0] > 0.9);
    const pool = hot ? this.sparks : this.smoke;
    for (let i = 0; i < count; i++) {
      const a = rand(Math.PI * 2), r = rand(0.2, 1) * spread;
      pool.emit({
        x, y, z,
        vx: Math.cos(a) * r * speed,
        vz: Math.sin(a) * r * speed,
        vy: rand(0.3, 1) * speed * up,
        grav, drag: hot ? 1.2 : 2.0,
        life: safeLife * rand(0.7, 1.3),
        size0: size * 0.075 * rand(0.8, 1.3),
        size1: size * (hot ? 0.02 : 0.16),
        color0: color,
        color1: hot ? [color[0] * 0.4, color[1] * 0.25, color[2] * 0.15] : [color[0] * 0.55, color[1] * 0.55, color[2] * 0.55],
        alpha0: hot ? 1 : 0.75,
        alpha1: 0,
        rotV: rand(-4, 4),
      });
    }
  }

  /**
   * Surface-aware bullet impact: dust plume, ejected chips, sparks on metal,
   * an oriented hole decal, and a one-frame light for the spark flash.
   * @param {number[]} n surface normal, pointing back toward the shooter.
   */
  impact(x, y, z, nx = 0, ny = 1, nz = 0, surface = 'concrete') {
    const s = IMPACTS[surface] || IMPACTS.concrete;
    // Build a basis around the normal so ejecta actually spray outward.
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const tx = Math.abs(ny) > 0.9 ? 1 : 0, ty = Math.abs(ny) > 0.9 ? 0 : 1;
    let ax = ny * 0 - nz * ty, ay = nz * tx - nx * 0, az = nx * ty - ny * tx;
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;
    const bx = ny * az - nz * ay, by = nz * ax - nx * az, bz = nx * ay - ny * ax;

    const d = s.dust;
    for (let i = 0; i < d.n; i++) {
      const a = rand(Math.PI * 2), r = rand(0, 1);
      const sp = d.speed * rand(0.4, 1.2);
      this.smoke.emit({
        x: x + nx * 0.03, y: y + ny * 0.03, z: z + nz * 0.03,
        vx: (nx + (ax * Math.cos(a) + bx * Math.sin(a)) * r * 1.5) * sp,
        vy: (ny + (ay * Math.cos(a) + by * Math.sin(a)) * r * 1.5) * sp,
        vz: (nz + (az * Math.cos(a) + bz * Math.sin(a)) * r * 1.5) * sp,
        grav: d.grav, drag: d.drag,
        life: rand(d.life[0], d.life[1]),
        size0: d.size0 * rand(0.7, 1.4), size1: d.size1 * rand(0.8, 1.3),
        color0: d.color0, color1: d.color1 || d.color0,
        alpha0: 0.34, alpha1: 0, rotV: rand(-3, 3),
      });
    }
    const c = s.chips;
    for (let i = 0; i < c.n; i++) {
      const a = rand(Math.PI * 2), r = rand(0.3, 1);
      const sp = c.speed * rand(0.5, 1.3);
      this.smoke.emit({
        x, y, z,
        vx: (nx + (ax * Math.cos(a) + bx * Math.sin(a)) * r) * sp,
        vy: (ny + (ay * Math.cos(a) + by * Math.sin(a)) * r) * sp + 0.8,
        vz: (nz + (az * Math.cos(a) + bz * Math.sin(a)) * r) * sp,
        grav: c.grav, drag: 0.4,
        life: rand(c.life[0], c.life[1]),
        size0: c.size0, size1: c.size1,
        color0: c.color0, color1: c.color0,
        alpha0: 1, alpha1: 0.4, rotV: rand(-14, 14),
      });
    }
    for (let i = 0; i < s.sparks; i++) {
      const a = rand(Math.PI * 2), r = rand(0.2, 1);
      const sp = rand(3, 9);
      this.sparks.emit({
        x, y, z,
        vx: (nx * 1.4 + (ax * Math.cos(a) + bx * Math.sin(a)) * r * 2) * sp * 0.4,
        vy: (ny * 1.4 + (ay * Math.cos(a) + by * Math.sin(a)) * r * 2) * sp * 0.4 + 0.5,
        vz: (nz * 1.4 + (az * Math.cos(a) + bz * Math.sin(a)) * r * 2) * sp * 0.4,
        grav: 11, drag: 1.1,
        life: rand(0.18, 0.55),
        size0: rand(0.028, 0.05), size1: 0.006,
        color0: [3.2, 2.1, 0.9], color1: [1.4, 0.35, 0.06],
        alpha0: 1, alpha1: 0,
        rot: Math.atan2(ny, nx) + rand(-1, 1), rotV: rand(-2, 2),
      });
    }
    if (s.flash > 0) this._flashLight(x + nx * 0.1, y + ny * 0.1, z + nz * 0.1, 0xffb060, 26 * s.flash, 0.06);
    // Holes stay ~40s and then fade over the last fifth of their life. Long
    // enough that a firefight leaves a readable record on the wall, short
    // enough that the 64-slot ring never fills with ancient hits.
    this._decal(x, y, z, nx, ny, nz, {
      tex: 'hole', color: s.decal,
      size: rand(s.decalSize[0], s.decalSize[1]),
      life: 40,
    });
  }

  /** Blood: arterial spray along the shot direction plus a ground pool. */
  blood(x, y, z, big = false) {
    const n = big ? 26 : 14;
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 2), r = rand(0.1, 1);
      const sp = rand(1.2, big ? 5.5 : 3.2);
      this.gore.emit({
        x, y, z,
        vx: Math.cos(a) * r * sp, vz: Math.sin(a) * r * sp,
        vy: rand(0.2, 1.4) * sp * 0.5,
        grav: 11, drag: 0.9,
        life: rand(0.35, big ? 0.9 : 0.65),
        size0: rand(0.04, big ? 0.13 : 0.08), size1: rand(0.02, 0.05),
        color0: [0.52, 0.05, 0.03], color1: [0.20, 0.02, 0.01],
        alpha0: 1, alpha1: 0, rotV: rand(-8, 8),
        floorY: 0.02, bounce: 0,
      });
    }
    // fine mist hangs for a beat — reads as impact energy
    for (let i = 0; i < (big ? 10 : 5); i++) {
      const a = rand(Math.PI * 2);
      this.smoke.emit({
        x, y, z,
        vx: Math.cos(a) * rand(0.3, 1.4), vz: Math.sin(a) * rand(0.3, 1.4), vy: rand(0.1, 0.7),
        grav: 1.4, drag: 3.2,
        life: rand(0.4, 0.85),
        size0: rand(0.09, 0.2), size1: rand(0.3, 0.55),
        color0: [0.38, 0.06, 0.05], color1: [0.16, 0.03, 0.03],
        alpha0: 0.42, alpha1: 0, rotV: rand(-2, 2),
      });
    }
    this._decal(x, 0.018, z, 0, 1, 0, {
      tex: 'blood', color: BLOOD_DECAL_COLOR,
      size: rand(0.5, big ? 1.7 : 1.0), life: 16, rot: rand(Math.PI * 2),
      jitter: 0.25,
    });
  }
}
