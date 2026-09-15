// What firing a weapon throws into the world: the tracer, the ejected case,
// and the muzzle flash with its light.
// FxShots' methods are copied onto FX.prototype by js/fx.js.
import { rand } from '../utils.js';

export class FxShots {
  // =========================================================================
  // tracers / shells / muzzle
  // =========================================================================
  tracer(x0, y0, z0, x1, y1, z1, color = 0xffe9b0) {
    const tr = this.tracers.find((t) => t.t <= 0) || this.tracers[0];
    const m = tr.mesh;
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.25) return;
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.lookAt(x1, y1, z1);
    // Plane's local +Y runs along the beam once rotated onto the direction.
    m.rotateX(Math.PI / 2);
    m.scale.set(0.055, len, 1);
    m.material.color.setHex(color);
    m.material.opacity = 1.0;
    m.visible = true;
    tr.t = tr.dur;
    tr.billboard = true;
    tr.a = { x: x0, y: y0, z: z0 };
    tr.b = { x: x1, y: y1, z: z1 };
  }

  shell(x, y, z, rightX, rightZ) {
    const s = this.shells[this.shellHead];
    this.shellHead = (this.shellHead + 1) % this.shells.length;
    s.mesh.position.set(x, y, z);
    s.mesh.rotation.set(rand(Math.PI), rand(Math.PI), rand(Math.PI));
    s.mesh.visible = true;
    s.vx = rightX * rand(1.4, 2.4) + rand(-0.4, 0.4);
    s.vz = rightZ * rand(1.4, 2.4) + rand(-0.4, 0.4);
    s.vy = rand(1.8, 3.0);
    s.rx = rand(-22, 22); s.ry = rand(-14, 14); s.rz = rand(-22, 22);
    s.bounced = 0;
    s.t = 2.2;
  }

  /**
   * Muzzle flash: an expanding hot core, a cone of burning gas, a smoke puff
   * and a single-frame light. Fired weapons now light the room.
   */
  muzzleFlash(x, y, z, dirX = 0, dirY = 0, dirZ = -1, scale = 1) {
    this.muzzleLight.position.set(x, y, z);
    this.muzzlePeak = 55 * scale;
    this.muzzleLight.intensity = this.muzzlePeak;
    this.muzzleT = 0.055;

    // hot core
    this.sparks.emit({
      x, y, z, vx: dirX * 1.2, vy: dirY * 1.2, vz: dirZ * 1.2,
      grav: 0, drag: 9, life: 0.045,
      size0: 0.26 * scale, size1: 0.05 * scale,
      color0: [5.0, 3.6, 1.9], color1: [2.0, 0.9, 0.3],
      alpha0: 1, alpha1: 0, rot: rand(Math.PI * 2),
    });
    // burning gas / unburnt powder thrown forward
    for (let i = 0; i < 4; i++) {
      const sp = rand(3, 11) * scale;
      this.sparks.emit({
        x, y, z,
        vx: dirX * sp + rand(-1.4, 1.4), vy: dirY * sp + rand(-1.0, 1.4), vz: dirZ * sp + rand(-1.4, 1.4),
        grav: 6, drag: 4.5, life: rand(0.07, 0.24),
        size0: rand(0.03, 0.075) * scale, size1: 0.008,
        color0: [4.0, 2.2, 0.8], color1: [1.2, 0.3, 0.05],
        alpha0: 1, alpha1: 0, rotV: rand(-6, 6),
      });
    }
    // smoke — one small wisp per shot; sustained fire builds it up naturally
    for (let i = 0; i < 1; i++) {
      this.smoke.emit({
        x, y, z,
        vx: dirX * rand(0.6, 2.0) + rand(-0.3, 0.3),
        vy: dirY * rand(0.6, 2.0) + rand(0.1, 0.6),
        vz: dirZ * rand(0.6, 2.0) + rand(-0.3, 0.3),
        grav: -0.6, drag: 2.6, life: rand(0.5, 1.1),
        size0: rand(0.03, 0.06) * scale, size1: rand(0.16, 0.3) * scale,
        color0: [0.36, 0.34, 0.32], color1: [0.18, 0.18, 0.18],
        alpha0: 0.17, alpha1: 0, rotV: rand(-1.6, 1.6),
      });
    }
  }
}
