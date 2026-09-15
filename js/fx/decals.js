// The decal ring: the single writer of the 64 oriented quads that bullet
// holes and blood pools are stamped onto.
// FxDecals' methods are copied onto FX.prototype by js/fx.js.
import { rand } from '../utils.js';

export class FxDecals {
  // =========================================================================
  // decals
  // =========================================================================
  _decal(x, y, z, nx, ny, nz, { tex = 'hole', color = 0x222222, size = 0.12, life = 20, rot = null, jitter = 0 } = {}) {
    const d = this.decals[this.decalHead];
    this.decalHead = (this.decalHead + 1) % this.decals.length;
    const m = d.mesh;
    // No needsUpdate: both maps are non-null, so swapping between them is a
    // texture rebind, not a new shader. Flagging it made three re-resolve the
    // decal's program on every bullet hole and blood splat.
    m.material.map = tex === 'blood' ? d.bloodTex : d.holeTex;
    m.material.color.setHex(color);
    // Offset along the normal so the quad never z-fights the surface.
    m.position.set(
      x + nx * 0.012 + (jitter ? rand(-jitter, jitter) : 0),
      y + ny * 0.012 + (jitter ? rand(-jitter * 0.02, jitter * 0.02) : 0),
      z + nz * 0.012 + (jitter ? rand(-jitter, jitter) : 0),
    );
    this._v.set(nx, ny, nz);
    this._q.setFromUnitVectors(this._decalFwd, this._v);
    m.quaternion.copy(this._q);
    m.rotateZ(rot ?? rand(Math.PI * 2));
    m.scale.set(size, size, 1);
    m.material.opacity = 0.92;
    m.visible = true;
    d.t = life;
    d.dur = life;
  }
}
