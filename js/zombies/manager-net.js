// ZombieManager's replication: the snapshot the host sends, and how a guest
// applies it and interpolates between snapshots.
// Methods of ZombieManager: js/zombies/manager.js copies them onto ZombieManager.prototype.
import { clamp, lerp, rand } from '../utils.js';
import { ZSTATES } from './states.js';
import { createZombieModel, createZombieVisual, enforceEnemyVisualIdentity } from './models.js';

export class ZombieManagerNet {
  // ---------- networking ----------
  serialize() {
    const arr = [];
    for (const z of this.zombies.values()) {
      arr.push([z.id, Math.round(z.x * 100), Math.round(z.z * 100), Math.round(z.y * 100), Math.round(z.yaw * 100), z.state, Math.round(z.hp), z.dog ? 1 : 0, z.crawler ? 1 : 0]);
    }
    return arr;
  }

  applySnapshot(arr, now) {
    const seen = this._snapshotSeen || (this._snapshotSeen = new Set());
    seen.clear();
    for (const [id, x, z2, y, yaw, state, hp, dog, crawler] of arr) {
      seen.add(id);
      let z = this.zombies.get(id);
      if (!z) {
        const visual = dog ? null : createZombieVisual();
        z = {
          id, dog: !!dog, crawler: !!crawler,
          x: x / 100, z: z2 / 100, y: y / 100, yaw: yaw / 100,
          hp, state, stateT: 0, anim: rand(10), deadT: 0,
          model: visual ? visual.group : createZombieModel(!!dog, { directorRig: !!dog }), visual,
          prev: null, next: null,
          speed: 2,
        };
        enforceEnemyVisualIdentity(z);
        z.model.position.set(z.x, z.y, z.z);
        this.group.add(z.model);
        this.zombies.set(id, z);
      }
      // interpolation buffer (objects reused — no per-snapshot allocation churn)
      if (!z.next) z.next = { x: z.x, z: z.z, y: z.y, yaw: z.yaw, t: now };
      if (!z.prev) z.prev = { x: z.x, z: z.z, y: z.y, yaw: z.yaw, t: now };
      else { z.prev.x = z.next.x; z.prev.z = z.next.z; z.prev.y = z.next.y; z.prev.yaw = z.next.yaw; z.prev.t = z.next.t; }
      z.next.x = x / 100; z.next.z = z2 / 100; z.next.y = y / 100; z.next.yaw = yaw / 100;
      z.next.t = now + (window.__snapInterval || 66) / 1000;
      const newState = state;
      if (z.state !== newState) { z.state = newState; z.stateT = 0; if (newState === ZSTATES.DIE) z.deadT = 0; }
      z.hp = hp;
      z.dog = !!dog;
      z.crawler = !!crawler; // crawler conversions must sync or they look like plain zombies elsewhere
    }
    for (const [id, z] of this.zombies) {
      if (!seen.has(id)) { this.group.remove(z.model); this.zombies.delete(id); }
    }
  }

  interpolate(now) {
    for (const z of this.zombies.values()) {
      if (!z.prev || !z.next) continue;
      const span = Math.max(1e-3, z.next.t - z.prev.t);
      const t = clamp((now - z.prev.t) / span, 0, 1.25);
      z.x = lerp(z.prev.x, z.next.x, Math.min(t, 1));
      z.z = lerp(z.prev.z, z.next.z, Math.min(t, 1));
      z.y = lerp(z.prev.y, z.next.y, Math.min(t, 1));
      let dy = z.next.yaw - z.prev.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      z.yaw = z.prev.yaw + dy * Math.min(t, 1);
      z.anim += 0.016 * (this.dormant && z.state !== ZSTATES.DIE ? 0.9 : z.state === ZSTATES.CHASE ? 5 : 3);
    }
  }
}
