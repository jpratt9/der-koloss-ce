import { NAV_RADIUS, BODY_LOW, BODY_HIGH } from './constants.js';

export function circleHitsBox(x, z, r, b) {
  const cx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x;
  const cz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
  const dx = x - cx, dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

// Does this collider stop an ENEMY whose feet are at `y`?
//
// `shootOk` panels sit above head height and exist only for bullets.
// `playerOnly` is the mainframe platform lip, which zombies are meant to clamber
// straight up — floorY already grants them the deck, so treating the lip as
// solid would wall off a route the game intends to be open.
export function blocksEnemy(c, y) {
  if (c.shootOk || c.playerOnly) return false;
  if (c.y0 === undefined) return true;
  return !(c.y0 > y + BODY_HIGH || c.y0 + c.h < y + BODY_LOW);
}

// ---------------------------------------------------------------------------
// Collider spatial hash.
//
// The map carries ~310 colliders. Testing all of them per cell during a build,
// and per enemy per frame at runtime, is the difference between this system
// being free and being the frame budget. Bucketed lookup makes both ~10 tests.
// ---------------------------------------------------------------------------
const BUCKET = 4;

export class ColliderHash {
  constructor(colliders, minX, minZ, maxX, maxZ) {
    this.minX = minX; this.minZ = minZ;
    this.cols = Math.max(1, Math.ceil((maxX - minX) / BUCKET));
    this.rows = Math.max(1, Math.ceil((maxZ - minZ) / BUCKET));
    this.cells = new Array(this.cols * this.rows);
    for (const c of colliders) this.insert(c);
  }

  insert(c) {
    const i0 = this._cx(c.minX - NAV_RADIUS), i1 = this._cx(c.maxX + NAV_RADIUS);
    const j0 = this._cz(c.minZ - NAV_RADIUS), j1 = this._cz(c.maxZ + NAV_RADIUS);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * this.cols + i;
        (this.cells[k] || (this.cells[k] = [])).push(c);
      }
    }
  }

  _cx(x) { return Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.minX) / BUCKET))); }
  _cz(z) { return Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.minZ) / BUCKET))); }

  at(x, z) { return this.cells[this._cz(z) * this.cols + this._cx(x)]; }

  /** Append every collider near (x,z) that stops an enemy standing at `y`. */
  gather(x, z, y, out) {
    const list = this.at(x, z);
    if (!list) return out;
    for (const c of list) if (blocksEnemy(c, y)) out.push(c);
    return out;
  }
}

