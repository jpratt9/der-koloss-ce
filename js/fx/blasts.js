// Explosions and lightning, and the pooled point light both of them — and a
// spark-throwing impact — flash for a few frames.
// FxBlasts' methods are copied onto FX.prototype by js/fx.js.
import { clamp, rand } from '../utils.js';

export class FxBlasts {
  // =========================================================================
  // explosions / lightning
  // =========================================================================
  explosion(x, y, z, radius = 4) {
    const k = clamp(radius / 4, 0.5, 2.2);
    // fireball
    for (let i = 0; i < Math.round(26 * k); i++) {
      const a = rand(Math.PI * 2), e = rand(-0.35, 1);
      const sp = rand(3, 13) * k;
      this.sparks.emit({
        x, y: y + 0.3, z,
        vx: Math.cos(a) * sp, vy: e * sp * 0.9 + 1.5, vz: Math.sin(a) * sp,
        grav: 5, drag: 3.4, life: rand(0.2, 0.55),
        size0: rand(0.3, 0.85) * k, size1: rand(0.05, 0.2) * k,
        color0: [6.0, 3.0, 0.9], color1: [1.6, 0.35, 0.05],
        alpha0: 1, alpha1: 0, rotV: rand(-4, 4),
      });
    }
    // ember shrapnel
    for (let i = 0; i < Math.round(22 * k); i++) {
      const a = rand(Math.PI * 2), e = rand(-0.2, 1.1);
      const sp = rand(6, 20) * k;
      this.sparks.emit({
        x, y: y + 0.3, z,
        vx: Math.cos(a) * sp, vy: e * sp, vz: Math.sin(a) * sp,
        grav: 13, drag: 0.7, life: rand(0.5, 1.5),
        size0: rand(0.03, 0.075), size1: 0.008,
        color0: [4.5, 2.0, 0.5], color1: [1.0, 0.15, 0.02],
        alpha0: 1, alpha1: 0, rotV: rand(-8, 8),
        floorY: 0.03, bounce: 0.35,
      });
    }
    // rolling smoke column
    for (let i = 0; i < Math.round(20 * k); i++) {
      const a = rand(Math.PI * 2);
      this.smoke.emit({
        x, y: y + 0.4, z,
        vx: Math.cos(a) * rand(0.4, 3.4) * k, vy: rand(0.6, 3.4), vz: Math.sin(a) * rand(0.4, 3.4) * k,
        grav: -1.1, drag: 1.5, life: rand(1.1, 2.6),
        size0: rand(0.3, 0.8) * k, size1: rand(1.6, 3.4) * k,
        color0: [0.30, 0.27, 0.25], color1: [0.09, 0.085, 0.08],
        alpha0: 0.65, alpha1: 0, rotV: rand(-1.1, 1.1),
      });
    }
    // ground dust ring
    for (let i = 0; i < Math.round(16 * k); i++) {
      const a = rand(Math.PI * 2);
      this.smoke.emit({
        x, y: y + 0.1, z,
        vx: Math.cos(a) * rand(4, 12) * k, vy: rand(0.05, 0.7), vz: Math.sin(a) * rand(4, 12) * k,
        grav: 0.6, drag: 3.6, life: rand(0.7, 1.6),
        size0: rand(0.2, 0.5) * k, size1: rand(1.2, 2.6) * k,
        color0: [0.5, 0.47, 0.43], color1: [0.2, 0.19, 0.18],
        alpha0: 0.5, alpha1: 0, rotV: rand(-1.4, 1.4),
      });
    }
    this._flashLight(x, y + 0.8, z, 0xffa050, 220 * k, 0.42);
    this.shake(0.5 * Math.min(1.4, k));
  }

  lightning(points) {
    for (let i = 0; i < points.length - 1; i++) {
      const b = this.bolts.find((b2) => b2.t <= 0);
      if (!b) break;
      const pos = b.line.geometry.attributes.position.array;
      const a = points[i], c = points[i + 1];
      const N = 24;
      for (let s = 0; s < N; s++) {
        const t = s / (N - 1);
        const end = s === 0 || s === N - 1;
        // Displacement peaks mid-span so the arc bows instead of jittering
        // uniformly — much closer to a real discharge.
        const amp = end ? 0 : Math.sin(t * Math.PI) * 0.5;
        pos[s * 3] = a.x + (c.x - a.x) * t + rand(-amp, amp);
        pos[s * 3 + 1] = a.y + (c.y - a.y) * t + rand(-amp, amp);
        pos[s * 3 + 2] = a.z + (c.z - a.z) * t + rand(-amp, amp);
      }
      b.line.geometry.attributes.position.needsUpdate = true;
      b.line.material.opacity = 1;
      b.line.visible = true;
      b.t = 0.28;
    }
    const mid = points[Math.floor(points.length / 2)];
    this._flashLight(mid.x, mid.y + 0.5, mid.z, 0x86b8ff, 150, 0.3);
    for (let i = 0; i < 10; i++) {
      this.sparks.emit({
        x: mid.x, y: mid.y + 0.5, z: mid.z,
        vx: rand(-4, 4), vy: rand(-2, 5), vz: rand(-4, 4),
        grav: 9, drag: 1.5, life: rand(0.15, 0.5),
        size0: rand(0.025, 0.06), size1: 0.006,
        color0: [1.4, 2.6, 5.0], color1: [0.3, 0.6, 1.4],
        alpha0: 1, alpha1: 0, rotV: rand(-8, 8),
      });
    }
  }

  _flashLight(x, y, z, hex, peak, dur) {
    const bl = this.boomLights.find((b) => b.t <= 0)
      || this.boomLights.reduce((a, b) => (a.t < b.t ? a : b));
    bl.light.color.setHex(hex);
    bl.light.position.set(x, y, z);
    bl.light.intensity = peak;
    bl.peak = peak;
    bl.dur = dur;
    bl.t = dur;
  }
}
