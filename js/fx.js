// Juice: GPU particles, tracers, shells, impacts, explosions, lightning,
// decals, screen shake, world popups, power-up drops.
//
// Everything is pooled — a frame allocates nothing. Particles run on the
// ParticlePool shader (per-particle size/rotation/colour ramps) rather than
// the old PointsMaterial, which could only draw one fixed dot size.
import * as THREE from 'three';
import { clamp, installMixins, rand } from './utils.js';
import { ParticlePool, puffTexture, sparkTexture, splatTexture } from './render/Particles.js';
import { tracerTexture, holeTexture } from './fx/textures.js';
import { BLOOD_DECAL_COLOR, IMPACTS } from './fx/surfaces.js';
import { FxDecals } from './fx/decals.js';
import { FxScreen } from './fx/screen.js';
import { FxDrops } from './fx/drops.js';
import { FxUpdate } from './fx/update.js';

// js/map/hand-placed.js stamps the level's old blood with this, and imports it
// from here, as it did before the split.
export { BLOOD_DECAL_COLOR } from './fx/surfaces.js';

const MAX_DECALS = 64;

export class FX {
  constructor(scene) {
    this.scene = scene;

    // ---------- particle pools ----------
    // Two pools so smoke can alpha-blend while sparks and fire add.
    this.smoke = new ParticlePool(scene, { max: 900, texture: puffTexture(), blending: THREE.NormalBlending, renderOrder: 2 });
    this.sparks = new ParticlePool(scene, { max: 900, texture: sparkTexture(), blending: THREE.AdditiveBlending, renderOrder: 3 });
    this.gore = new ParticlePool(scene, { max: 500, texture: splatTexture(), blending: THREE.NormalBlending, renderOrder: 2 });
    this.pools = [this.smoke, this.sparks, this.gore];

    // ---------- tracers ----------
    // Camera-facing stretched quads with a hot core, not opaque boxes.
    this.tracers = [];
    {
      const geo = new THREE.PlaneGeometry(1, 1);
      const tex = tracerTexture();
      for (let i = 0; i < 28; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          map: tex, color: 0xffe9b0, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
        }));
        m.visible = false; m.frustumCulled = false;
        scene.add(m);
        this.tracers.push({ mesh: m, t: 0, dur: 0.075 });
      }
    }

    // ---------- shells ----------
    this.shells = [];
    {
      // A tapered case with a rim reads as brass even at 3cm across.
      const geo = new THREE.CylinderGeometry(0.0045, 0.0052, 0.026, 7);
      const mat = new THREE.MeshStandardMaterial({ color: 0xd8a63c, metalness: 1.0, roughness: 0.28 });
      for (let i = 0; i < 26; i++) {
        const m = new THREE.Mesh(geo, mat);
        m.visible = false;
        m.castShadow = false;
        scene.add(m);
        this.shells.push({ mesh: m, t: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, bounced: 0 });
      }
      this.shellHead = 0;
    }

    // ---------- decals (bullet holes + blood) ----------
    // Oriented to the surface normal instead of always lying flat, so holes on
    // a wall actually sit on the wall.
    this.decals = [];
    {
      const geo = new THREE.PlaneGeometry(1, 1);
      const holeTex = holeTexture();
      const bloodTex = splatTexture();
      for (let i = 0; i < MAX_DECALS; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          map: holeTex, transparent: true, opacity: 0, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
        }));
        m.visible = false;
        scene.add(m);
        this.decals.push({ mesh: m, t: 0, dur: 1, holeTex, bloodTex });
      }
      this.decalHead = 0;
    }

    // ---------- lights ----------
    this.boomLights = [];
    for (let i = 0; i < 5; i++) {
      const l = new THREE.PointLight(0xffa050, 0, 18, 2);
      l.layers.enableAll();
      scene.add(l);
      this.boomLights.push({ light: l, t: 0, dur: 0.35, peak: 130 });
    }
    this.muzzleLight = new THREE.PointLight(0xffc070, 0, 11, 2);
    this.muzzleLight.layers.enableAll();
    scene.add(this.muzzleLight);
    this.muzzleT = 0;
    this.muzzlePeak = 0;

    // ---------- lightning ----------
    this.bolts = [];
    for (let i = 0; i < 14; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({
        color: 0x9fd0ff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
      line.visible = false; line.frustumCulled = false;
      scene.add(line);
      this.bolts.push({ line, t: 0 });
    }

    // ---------- popups ----------
    this.popups = [];
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthTest: false, toneMapped: false }));
      s.scale.set(0.8, 0.2, 1);
      s.renderOrder = 10;
      scene.add(s);
      this.popups.push({ sprite: s, t: 0, vy: 0 });
    }
    this.popupHead = 0;

    // ---------- shake ----------
    this.trauma = 0;
    this.shakeT = 0;
    this.drops = [];

    this.vignette = document.getElementById('dmg-vignette');
    this.flashEl = document.getElementById('screen-flash');
    this.postActive = false;

    // Scratch objects for the per-frame tracer basis. Allocating a Vector3
    // per tracer per frame is exactly the kind of churn the perf invariants
    // exist to prevent.
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
    this._bx = new THREE.Vector3();
    this._bz = new THREE.Vector3();
    this._scaleV = new THREE.Vector3();
    this._decalFwd = new THREE.Vector3(0, 0, 1);
  }

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

// FX's methods are split by effect across js/fx/. Each file is a class whose
// methods are copied onto FX.prototype here: one `this`, one set of pools for
// every caller. A name defined twice is a split mistake, so it fails at load.
installMixins(FX, [FxDecals, FxScreen, FxDrops, FxUpdate]);
