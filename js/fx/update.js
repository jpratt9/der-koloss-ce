// The frame: every pool, ring and drop the constructor built, advanced once.
// Nothing else in js/fx/ runs per frame.
// FxUpdate's methods are copied onto FX.prototype by js/fx.js.
import { clamp, rand } from '../utils.js';
import { audio } from '../audio.js';

export class FxUpdate {
  // =========================================================================
  // update
  // =========================================================================
  update(dt, camera, time) {
    for (const pool of this.pools) pool.update(dt);

    // tracers: keep the quad facing the camera so it never edges out
    for (const t of this.tracers) {
      if (t.t <= 0) continue;
      t.t -= dt;
      const k = Math.max(0, t.t / t.dur);
      t.mesh.material.opacity = k * k;
      if (camera && t.a) {
        // Re-orient: long axis along the beam, flat face toward the eye.
        const m = t.mesh;
        const dx = t.b.x - t.a.x, dy = t.b.y - t.a.y, dz = t.b.z - t.a.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        this._v.set(dx / len, dy / len, dz / len);
        const ex = m.position.x - camera.position.x;
        const ey = m.position.y - camera.position.y;
        const ez = m.position.z - camera.position.z;
        // right = dir x eye, up = right x dir
        let rx = this._v.y * ez - this._v.z * ey;
        let ry = this._v.z * ex - this._v.x * ez;
        let rz = this._v.x * ey - this._v.y * ex;
        const rl = Math.hypot(rx, ry, rz) || 1;
        rx /= rl; ry /= rl; rz /= rl;
        const ux = ry * this._v.z - rz * this._v.y;
        const uy = rz * this._v.x - rx * this._v.z;
        const uz = rx * this._v.y - ry * this._v.x;
        this._bx.set(rx, ry, rz);
        this._bz.set(ux, uy, uz);
        m.matrix.makeBasis(this._bx, this._v, this._bz);
        m.matrix.scale(this._scaleV.set(0.055, len, 1));
        m.matrix.setPosition(m.position);
        m.matrixAutoUpdate = false;
        m.matrixWorldNeedsUpdate = true;
        m.matrixWorld.copy(m.matrix);
      }
      if (t.t <= 0) { t.mesh.visible = false; t.mesh.matrixAutoUpdate = true; }
    }

    // shells
    for (const s of this.shells) {
      if (s.t <= 0) continue;
      s.t -= dt;
      s.vy -= 11 * dt;
      const m = s.mesh;
      m.position.x += s.vx * dt; m.position.y += s.vy * dt; m.position.z += s.vz * dt;
      m.rotation.x += s.rx * dt; m.rotation.y += s.ry * dt; m.rotation.z += s.rz * dt;
      if (m.position.y < 0.008) {
        m.position.y = 0.008;
        if (s.vy < -0.7 && s.bounced < 3) {
          s.bounced++;
          s.vy = -s.vy * 0.36;
          s.vx *= 0.55; s.vz *= 0.55;
          s.rx *= 0.5; s.ry *= 0.5; s.rz *= 0.5;
          if (s.bounced === 1) audio.play('ui', { pos: { x: m.position.x, y: 0, z: m.position.z }, vol: 0.09, rate: rand(1.6, 2.2) });
        } else { s.vy = 0; s.vx *= 0.82; s.vz *= 0.82; s.rx *= 0.7; s.ry *= 0.7; s.rz *= 0.7; }
      }
      if (s.t <= 0) m.visible = false;
    }

    // decals fade out over the last fifth of their life
    for (const d of this.decals) {
      if (d.t <= 0) continue;
      d.t -= dt;
      const fade = d.dur * 0.2;
      if (d.t < fade) d.mesh.material.opacity = Math.max(0, d.t / fade) * 0.92;
      if (d.t <= 0) d.mesh.visible = false;
    }

    // lights
    for (const b of this.boomLights) {
      if (b.t <= 0) continue;
      b.t -= dt;
      const k = Math.max(0, b.t / b.dur);
      // Fast, non-linear decay: a blast is a spike, not a fade.
      b.light.intensity = b.peak * k * k;
      if (b.t <= 0) { b.light.intensity = 0; b.light.color.setHex(0xffa050); }
    }
    if (this.muzzleT > 0) {
      this.muzzleT -= dt;
      const k = Math.max(0, this.muzzleT / 0.055);
      this.muzzleLight.intensity = this.muzzlePeak * k * k;
    }

    for (const b of this.bolts) {
      if (b.t <= 0) continue;
      b.t -= dt;
      b.line.material.opacity = Math.max(0, b.t / 0.28);
      if (b.t <= 0) { b.t = 0; b.line.material.opacity = 0; b.line.visible = false; }
    }

    for (const p of this.popups) {
      if (p.t <= 0) continue;
      p.t -= dt;
      p.sprite.position.y += p.vy * dt;
      p.vy *= 1 - dt * 1.6;
      p.sprite.material.opacity = clamp(p.t / 0.4, 0, 1);
    }

    for (let i = 0; i < this.drops.length;) {
      const d = this.drops[i];
      d.t -= dt;
      d.core.rotation.y += dt * 2.4;
      d.core.rotation.x += dt * 1.1;
      const bob = Math.sin(time * 2 + d.x) * 0.08;
      d.core.position.y = 0.8 + bob;
      d.halo.position.y = 0.8 + bob;
      d.halo.scale.setScalar(1 + Math.sin(time * 4 + d.x) * 0.09);
      d.light.intensity = 18 + Math.sin(time * 5 + d.x) * 6;
      if (d.t < 4) d.group.visible = Math.sin(time * 10) > -0.2;
      if (d.t <= 0) this.removeDrop(d);
      else i++;
    }

    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.shakeT += dt * 30;
  }

  setViewportHeight(h) { for (const pool of this.pools) pool.setViewportScale(h); }

  getShakeOffset() {
    const s = this.trauma * this.trauma;
    const out = this._shakeOffset || (this._shakeOffset = { yaw: 0, pitch: 0, roll: 0 });
    // Three detuned frequencies per axis so the shake never reads as a loop.
    out.yaw = (Math.sin(this.shakeT * 1.3) * 0.6 + Math.sin(this.shakeT * 3.7) * 0.4) * 0.038 * s;
    out.pitch = (Math.cos(this.shakeT * 1.7) * 0.6 + Math.cos(this.shakeT * 4.3) * 0.4) * 0.032 * s;
    out.roll = (Math.sin(this.shakeT * 2.3) * 0.6 + Math.sin(this.shakeT * 5.1) * 0.4) * 0.024 * s;
    return out;
  }
}
