// LocalPlayer's per-frame update: look, regen, bleedout, stance, the slide,
// momentum, jumps and mantles, and the collision tests they move through.
// Methods of LocalPlayer: js/player/local.js copies them onto LocalPlayer.prototype.
import { CFG } from '../config.js';
import { clamp, damp, moveCircleWithColliders } from '../utils.js';
import { input, consumeMouse, isAimDown } from '../input.js';
import { platformSideBlocksAtFeet } from '../map-layout.js';
import { getStats } from '../weapons.js';

export class LocalPlayerMovement {
  _activeMapColliders(game) {
    const feet = this.y + 0.02;
    const head = this.y + Math.max(0.5, CFG.PLAYER_HEIGHT * this.stanceY);
    const active = this._activeColliders || (this._activeColliders = []);
    active.length = 0;
    for (const c of game.map.colliders) {
      if (c.shootOk) continue;
      if (c.vault && !this.grounded) continue;
      if (c.y0 !== undefined && (c.y0 > head || c.y0 + c.h < feet)) continue;
      if (!platformSideBlocksAtFeet(c, feet, this._airOriginY ?? this.y)) continue;
      active.push(c);
    }
    return active;
  }

  _moveAndCollide(game, dx, dz) {
    [this.x, this.z] = moveCircleWithColliders(
      this.x, this.z, dx, dz, CFG.PLAYER_RADIUS, this._activeMapColliders(game),
    );
  }

  update(dt, game) {
    const opts = game.options;
    // Magazine capacity belongs to the exact base/PaP variant. Clamp before
    // input and firing so a stale asynchronous reload can never turn the base
    // three-shot DG-2 into its six-shot upgraded variant (or any other gun).
    if (this.weapon) {
      const cap = getStats(this.weapon.id, this.weapon.pap).mag;
      this.weapon.mag = clamp(Math.trunc(Number(this.weapon.mag) || 0), 0, cap);
    }
    // Collapse/stand-up ease. Runs before the down branch's early return so it
    // keeps settling while you are on the floor. Down is quicker than up: you
    // drop, then you have to push yourself back onto your feet.
    this.downEase = damp(this.downEase, this.down ? 1 : 0, this.down ? 11 : 7, dt);

    // --- look ---
    this.mdx = 0; this.mdy = 0;
    if (!this.down && !this.dead) {
      const [mdx, mdy] = consumeMouse();
      this.mdx = mdx; this.mdy = mdy;
      const sens = 0.0021 * opts.sensitivity * (this.adsT > 0.5 ? 0.7 : 1);
      this.yaw -= mdx * sens;
      this.pitch -= mdy * sens * (opts.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, -1.45, 1.45);
      // recoil recovery
      this.pitch += this.recoilPitch * Math.min(1, dt * 8);
      this.recoilPitch = damp(this.recoilPitch, 0, 8, dt);
    }

    // --- regen ---
    if (!this.down && this.hp < this.maxHpNow && game.time - this.lastDamageT > CFG.REGEN_DELAY) {
      this.hp = Math.min(this.maxHpNow, this.hp + CFG.REGEN_RATE * dt);
    }

    // --- down / bleedout ---
    if (this.down) {
      this.bleedout -= dt;
      if (game.mode === 'solo' && this.selfReviveAvailable && game.qrSelfRevives > 0) {
        this.selfReviveT += dt;
        if (this.selfReviveT >= 8) {
          game.qrSelfRevives--;
          this.revive(true, game);
          game.hud.banner('REVIVED', '#7ec8e3');
          game.netSend({ t: 'revive_self', pid: this.id });
        }
      }
      if (this.bleedout <= 0) this.die(game);
      return; // no movement while down
    }
    if (this.dead) return;

    // --- ADS state ---
    const wantAds = isAimDown() && !this.reloading(game) && this.switchCooldown <= 0;
    this.adsT = damp(this.adsT, wantAds ? 1 : 0, 14, dt);

    // --- mantle: plays out as a scripted arc, ignoring normal movement ---
    if (this.mantling) {
      const m = this.mantling;
      m.t += dt;
      const k = clamp(m.t / m.dur, 0, 1);
      // Ease out on the vertical, ease in on the horizontal: you rise onto the
      // ledge first and are carried forward over it second.
      const kv = 1 - (1 - k) * (1 - k);
      const kh = k * k * (3 - 2 * k);
      this.x = m.fromX + (m.toX - m.fromX) * kh;
      this.z = m.fromZ + (m.toZ - m.fromZ) * kh;
      this.y = m.fromY + (m.toY - m.fromY) * kv;
      this.velY = 0; this.vx = 0; this.vz = 0;
      this.grounded = false;
      this.moving = true;
      if (k >= 1) {
        this.mantling = null;
        this.grounded = true;
        this._wasGrounded = true;
        this._airOriginY = null;
      }
      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
      this.switchCooldown = Math.max(0, this.switchCooldown - dt);
      this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);
      this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);
      return;
    }

    // --- move ---
    let fx = 0, fz = 0;
    if (input.keys['KeyW']) fz += 1;
    if (input.keys['KeyS']) fz -= 1;
    if (input.keys['KeyA']) fx -= 1;
    if (input.keys['KeyD']) fx += 1;
    const inputting = fx !== 0 || fz !== 0;
    this.strafeInput = fx;

    // --- slide: press crouch while sprinting. Checked on the key DOWN edge,
    // before the stance machine, so the slide starts the instant the key is
    // hit rather than waiting for release, and the same press never also
    // toggles crouch.
    this.slideCooldown = Math.max(0, this.slideCooldown - dt);
    let slideStarted = false;
    if (input.pressed['KeyC'] && this.sprinting && this.grounded
      && this.slideCooldown <= 0 && this.speed2D > CFG.WALK_SPEED * 1.1) {
      this.sliding = true;
      this.slideT = 0;
      this.stance = 0;
      slideStarted = true;
      this._slideAtePress = true;
      const len = Math.hypot(this.vx, this.vz) || 1;
      this.slideDirX = this.vx / len; this.slideDirZ = this.vz / len;
      // Launch a little faster than the sprint that fed into it.
      const boost = CFG.SPRINT_SPEED * 1.28;
      this.vx = this.slideDirX * boost; this.vz = this.slideDirZ * boost;
      this.onSlideStart?.();
    }

    // Stance is LATCHED, the way it is in Call of Duty: tap crouch to toggle
    // crouch, hold it to drop prone, and stay prone until you deliberately get
    // up. Releasing the key must never stand you back up — the previous
    // behaviour popped you out of prone the instant you let go, which made
    // prone unusable as cover.
    //
    //   stand  --tap-->  crouch  --tap-->  stand
    //   any    --hold--> prone
    //   prone  --tap-->  crouch
    //   prone  --jump / sprint --> stand   (handled below)
    const stanceKey = !!input.keys['KeyC'];
    const stanceKeyHeld = stanceKey;   // read again when the slide ends, below
    const stanceTapped = !stanceKey && this._stanceKeyT > 0 && this._stanceKeyT <= 0.4;
    if (stanceKey) {
      this._stanceKeyT += dt;
      if (this._stanceKeyT > 0.4 && this.stance !== 2 && !this.sprinting && !this.sliding) {
        this.stance = 2;
        this._stanceKeyT = -999;   // consumed: the release must not also toggle
      }
    } else {
      if (stanceTapped && !this._slideAtePress) {
        this.stance = this.stance === 2 ? 1 : (this.stance === 0 ? 1 : 0);
      }
      this._stanceKeyT = 0;
      this._slideAtePress = false;
    }
    // Getting up: sprinting or jumping breaks prone, as it does in CoD.
    if (this.stance === 2 && (input.pressed['Space'] || (input.keys['ShiftLeft'] && fz > 0))) {
      this.stance = 0;
    }

    this.crouched = this.stance >= 1;
    this.stanceY = damp(this.stanceY, this.sliding ? 0.52 : this.stanceTargetY, 8, dt);
    const wantSprint = !!input.keys['ShiftLeft'] && fz > 0 && this.stance === 0 && this.adsT < 0.3 && !this.sliding;
    this.sprinting = wantSprint;
    const s = this.stats;
    let speed = this.sprinting ? CFG.SPRINT_SPEED : this.adsT > 0.5 ? CFG.ADS_SPEED : CFG.WALK_SPEED;
    speed *= s?.move ?? 1;
    if (this.stance === 1) speed *= 0.55;
    else if (this.stance === 2) speed *= 0.22;
    if (this.reloading(game) && this.sprinting) speed = CFG.WALK_SPEED; // can't sprint-reload

    if (this.sliding && !slideStarted) {
      this.slideT += dt;
      const stopped = Math.hypot(this.vx, this.vz) < CFG.WALK_SPEED * 0.55;
      if (this.slideT > 1.05 || stopped || !this.grounded || this.adsT > 0.5) {
        this.sliding = false;
        this.slideCooldown = 0.55;
        // Come out of it CROUCHED if the key is still down, standing if not.
        // A slide that always dumped you upright threw away the cover it just
        // bought you; one that always left you crouched fought the player.
        // Holding the key through the slide is the natural way to say which.
        if (stanceKeyHeld && this.stance === 0) {
          this.stance = 1;
          // Mark the hold as already spent. Without this the same uninterrupted
          // press keeps feeding the hold-to-prone timer and you slide straight
          // through crouch onto your face — you have to release and press again
          // to go prone, which is what the stance machine means everywhere else.
          this._stanceKeyT = -999;
        }
        this.onSlideEnd?.(this.stance === 1);
      }
    }

    // --- acceleration model ---
    // Ground: strong accel toward the wish velocity plus friction when idle.
    // Air: much weaker control, so a jump commits you to your trajectory.
    let wishX = 0, wishZ = 0;
    if (inputting && !this.sliding) {
      const len = Math.hypot(fx, fz);
      const nx = fx / len, nz = fz / len;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      wishX = (nx * cos - nz * sin) * speed;
      wishZ = (-nx * sin - nz * cos) * speed;
    }
    const accel = this.sliding ? 0 : (this.grounded ? 62 : 9);
    // Slide friction RAMPS. A flat 4.6 scrubbed 8.3 m/s down to walking pace in
    // a quarter of a second, so the slide was over before it read as one — the
    // camera dipped and you were already standing. Starting low and building
    // gives the launch its glide and still lands a definite scrubbing stop,
    // which is the shape of the move in the games this is imitating. Tuned so
    // a slide runs a little under a second and covers roughly five metres.
    const slideFriction = 0.5 + this.slideT * 0.9;
    const friction = this.sliding ? slideFriction : (this.grounded ? (inputting ? 0 : 15) : 0.35);
    if (accel > 0) {
      this.vx += (wishX - this.vx) * Math.min(1, accel * dt);
      this.vz += (wishZ - this.vz) * Math.min(1, accel * dt);
    } else if (this.sliding && inputting) {
      // A little steering authority. A slide with none is a rail you regret
      // committing to; full control makes it a free speed boost. This bends
      // the path without adding speed: the steer is applied perpendicular to
      // travel only, so you can curve around a corner but never accelerate.
      const len = Math.hypot(fx, fz);
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      const wx = ((fx / len) * cos - (fz / len) * sin);
      const wz = (-(fx / len) * sin - (fz / len) * cos);
      const sp = Math.hypot(this.vx, this.vz) || 1;
      const dx = this.vx / sp, dz = this.vz / sp;
      const perpX = -dz, perpZ = dx;                     // left of travel
      const steer = (wx * perpX + wz * perpZ) * 5.2 * dt;
      this.vx += perpX * steer * sp;
      this.vz += perpZ * steer * sp;
      // Renormalise so curving never changes how fast the slide is going.
      const after = Math.hypot(this.vx, this.vz) || 1;
      this.vx *= sp / after; this.vz *= sp / after;
    }
    if (friction > 0) {
      const f = Math.max(0, 1 - friction * dt);
      this.vx *= f; this.vz *= f;
    }
    if (Math.abs(this.vx) < 0.01) this.vx = 0;
    if (Math.abs(this.vz) < 0.01) this.vz = 0;

    this.speed2D = Math.hypot(this.vx, this.vz);
    this.maxSpeed = Math.max(0.1, speed);
    this.moving = this.speed2D > 0.35;

    if (this.speed2D > 0) {
      // Swept/sub-stepped movement prevents sprinting through any thin wall,
      // closed paid door, or player-blocking window aperture between frames.
      const beforeX = this.x, beforeZ = this.z;
      this._moveAndCollide(game, this.vx * dt, this.vz * dt);
      // Colliders resolve the move; fold the correction back into velocity so
      // running into a wall bleeds momentum instead of pressing through it.
      if (dt > 1e-5) {
        this.vx = (this.x - beforeX) / dt;
        this.vz = (this.z - beforeZ) / dt;
        this.speed2D = Math.hypot(this.vx, this.vz);
      }
    }
    // Footsteps are driven by the camera rig's stride phase (see game.js), so
    // they land exactly on the visual footfall instead of on a separate timer.

    // jump & gravity (elevation-aware: floors, ramps, ledges)
    // tight 0.55 snap-up tolerance: you must actually step/jump onto platforms
    const fl = game.map.floorY(this.x, this.z, this.y, 0.55);
    this._coyote = this.grounded ? 0.12 : Math.max(0, this._coyote - dt);
    this._jumpBuffer = input.pressed['Space'] ? 0.16 : Math.max(0, this._jumpBuffer - dt);
    if (this._jumpBuffer > 0 && !this.crouched && !this.sliding) {
      const mantle = this._findMantle(game);
      if (mantle) {
        this._jumpBuffer = 0;
        this.mantling = mantle;
        this.onMantle?.();
      } else if (this._coyote > 0) {
        this._jumpBuffer = 0; this._coyote = 0;
        this._airOriginY = this.y;
        this.velY = CFG.JUMP_VEL;
        this.grounded = false;
      }
    }
    this.velY -= CFG.GRAVITY * dt;
    // stick to ground on stairs/ramps, but falls feel like falls (no moon-float)
    if (this._wasGrounded && this.velY < 0) this.velY = Math.max(this.velY, -9);
    this.fallSpeed = Math.max(this.fallSpeed, -this.velY);
    this.y += this.velY * dt;
    if (this.y <= fl + 0.001 && this.velY <= 0) {
      if (!this._wasGrounded) this.landImpact = this.fallSpeed;
      this.fallSpeed = 0;
      this.y = fl; this.velY = 0; this.grounded = true; this._airOriginY = null;
    } else {
      if (this._wasGrounded && this._airOriginY == null) this._airOriginY = this.y;
      this.grounded = false;
    }
    this._wasGrounded = this.grounded;

    // Preserve a known-good location before resolving movement. Geometry is
    // the primary boundary, while this room-union guard is the map-wide safety
    // net: a missed wall segment can never become an explorable exterior void.
    const safeX = game.map.roomAt(this.x, this.z, this.y) ? this.x : (this._safeMapX ?? this.x);
    const safeZ = game.map.roomAt(this.x, this.z, this.y) ? this.z : (this._safeMapZ ?? this.z);

    // Re-resolve after vertical movement because landing/crouching can activate
    // a collider that was outside the player's vertical span before gravity.
    this._moveAndCollide(game, 0, 0);
    const b = game.map.bounds;
    this.x = clamp(this.x, b.minX, b.maxX);
    this.z = clamp(this.z, b.minZ, b.maxZ);
    if (!game.map.roomAt(this.x, this.z, this.y)) {
      this.x = safeX;
      this.z = safeZ;
    }
    this._safeMapX = this.x;
    this._safeMapZ = this.z;

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.switchCooldown = Math.max(0, this.switchCooldown - dt);
    this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);
    this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);
    this.spreadBloom = damp(this.spreadBloom, 0, 6, dt);
  }

  /**
   * Is there room for the player's whole body to stand at (x, z) with its feet
   * at `top`? Tested as the 0.35m circle the player actually is, against every
   * collider that spans the space they would occupy.
   */
  _standingClear(game, x, z, top, headroom) {
    for (const c of game.map.colliders) {
      if (c.shootOk) continue;
      const cx = clamp(x, c.minX, c.maxX);
      const cz = clamp(z, c.minZ, c.maxZ);
      if (Math.hypot(x - cx, z - cz) >= CFG.PLAYER_RADIUS) continue;
      // A collider with no vertical span is solid at every height.
      if (c.y0 === undefined) return false;
      // Below the feet is the surface being climbed onto, not an obstruction.
      if (c.y0 + c.h <= top + 0.12 || c.y0 >= top + headroom) continue;
      return false;
    }
    return true;
  }

  /**
   * Ledge detection for mantling. Looks a short step ahead for a surface
   * between shin and chest height that has standing room above it, and
   * returns a scripted arc onto it. Returns null when there is nothing to
   * climb, in which case the jump behaves normally.
   */
  _findMantle(game) {
    if (!this.grounded && this.velY < -1.5) return null;   // no mid-fall grabs
    const fwdX = -Math.sin(this.yaw), fwdZ = -Math.cos(this.yaw);
    const feet = this.y;
    const MIN_RISE = 0.55;      // below this the step-up handles it
    const MAX_RISE = 1.7;       // above this it is a wall, not a ledge
    const HEADROOM = 1.35;

    // Probe outward: the near probe finds the ledge face, the far probe
    // confirms there is actually a landing surface to stand on.
    for (const reach of [CFG.PLAYER_RADIUS + 0.45, CFG.PLAYER_RADIUS + 0.95]) {
      const tx = this.x + fwdX * reach;
      const tz = this.z + fwdZ * reach;
      // Ask for the floor as if we were already up there.
      const top = game.map.floorY(tx, tz, feet + MAX_RISE + 0.5, MAX_RISE + 0.6);
      const rise = top - feet;
      if (rise < MIN_RISE || rise > MAX_RISE) continue;

      if (!game.map.roomAt(tx, tz, top)) continue;

      // The mantle arc is scripted: it ignores collision for its whole
      // duration, so wherever it ends is wherever the player ends up. That
      // makes both checks below load-bearing.
      //
      // They used to be one point test at the PROBE, while the player was
      // actually set down 0.35m further along the same heading. A crate or
      // drum standing against a wall — which is exactly where the room dresser
      // puts them — gave a legal probe whose landing was 0.35m deeper, i.e.
      // inside 0.4m of brick, and the arc walked you straight into it. That is
      // the Generator Room wall by Teleporter A, and it moved between sessions
      // because the props that set it up are placed at random.
      //
      // A point test was also wrong on its own terms: the player is a 0.35m
      // circle, so a sample that threads between two colliders clears a gap the
      // body does not fit through.
      const landX = this.x + fwdX * (reach + 0.35);
      const landZ = this.z + fwdZ * (reach + 0.35);
      if (!game.map.roomAt(landX, landZ, top)) continue;
      if (!this._standingClear(game, tx, tz, top, HEADROOM)) continue;
      if (!this._standingClear(game, landX, landZ, top, HEADROOM)) continue;
      return {
        t: 0,
        dur: 0.34 + rise * 0.11,
        fromX: this.x, fromY: this.y, fromZ: this.z,
        toX: landX, toY: top, toZ: landZ,
      };
    }
    return null;
  }
}
