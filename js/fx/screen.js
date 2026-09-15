// What an effect does to the screen rather than to the world: camera shake,
// the damage vignette, the full-screen flash, world-space popups, and the
// teardown that empties every transient pool.
// FxScreen's methods are copied onto FX.prototype by js/fx.js.
import { textTexture } from '../utils.js';

export class FxScreen {
  // =========================================================================
  // screen
  // =========================================================================
  shake(amount) { this.trauma = Math.min(1, this.trauma + amount); }

  damageFlash(amount = 1) {
    this.onDamageFlash?.(amount);
    if (this.postActive) return;
    if (this.vignette) {
      this.vignette.style.opacity = '1';
      clearTimeout(this._vt);
      this._vt = setTimeout(() => { this.vignette.style.opacity = '0'; }, 180);
    }
  }

  screenFlash(color = '#fff', ms = 120, opacity = 0.55) {
    this.onScreenFlash?.(color, ms, opacity);
    if (this.postActive) return;
    if (!this.flashEl) return;
    this.flashEl.style.background = color;
    this.flashEl.style.opacity = String(opacity);
    clearTimeout(this._ft);
    this._ft = setTimeout(() => { this.flashEl.style.opacity = '0'; }, ms);
  }

  popup(x, y, z, text, color = '#ffd980') {
    const p = this.popups[this.popupHead];
    this.popupHead = (this.popupHead + 1) % this.popups.length;
    p.sprite.material.map?.dispose();
    p.sprite.material.map = textTexture(text, { w: 256, h: 64, bg: 'rgba(0,0,0,0)', fg: color, font: 'bold 44px Arial' });
    p.sprite.material.needsUpdate = true;
    p.sprite.position.set(x, y, z);
    p.sprite.material.opacity = 1;
    p.t = 0.9;
    p.vy = 1.1;
  }

  clearTransientEffects() {
    for (const pool of this.pools) pool.clear();
    for (const t of this.tracers) { t.t = 0; t.mesh.visible = false; t.mesh.material.opacity = 0; }
    for (const s of this.shells) { s.t = 0; s.mesh.visible = false; }
    for (const b of this.bolts) { b.t = 0; b.line.visible = false; b.line.material.opacity = 0; }
    for (const b of this.boomLights) { b.t = 0; b.light.intensity = 0; b.light.color.setHex(0xffa050); }
    this.muzzleT = 0;
    this.muzzleLight.intensity = 0;
  }
}
