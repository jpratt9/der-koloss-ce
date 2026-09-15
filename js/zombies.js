// Zombies: animated CC0 models (Quaternius, CC0) driven by the AI state machine,
// classic round structure with health scaling, hellhounds, crawlers.
import * as THREE from 'three';
import { CFG } from './config.js';
import { rand, choice, installMixins } from './utils.js';
import { getNavGrid } from './navmesh.js';
import { setZombieDetailVisible } from './render/ZombieDetail.js';
import { setHellhoundLOD } from './render/HellhoundModel.js';
import { ZSTATES } from './zombies/states.js';
import { zombiePoseForState, applyHellhoundPose } from './zombies/poses.js';
import { ZombieManagerSpawning } from './zombies/manager-spawning.js';
import { ZombieManagerMovement } from './zombies/manager-movement.js';
import { ZombieManagerAi } from './zombies/manager-ai.js';
import { ZombieManagerNet } from './zombies/manager-net.js';

export { ZSTATES } from './zombies/states.js';
export { measureNeutralBounds, measureStandingBounds } from './zombies/bounds.js';
export { rayHitZombieBody, zombieAimPoint } from './zombies/hit-volumes.js';
export { zombiePoseForState, applyHellhoundPose } from './zombies/poses.js';
export { ZombieVisual } from './zombies/visual.js';
export { createZombieModel, createZombieVisual } from './zombies/models.js';
export { isZombieSpawnRoomAllowed } from './zombies/manager-spawning.js';

// Whole paths any single frame may compute. Close-quarters routes cost ~0.03ms,
// but a body on the far side of the map planning its way to the mainframe costs
// a few, and a whole wave doing that on the frame a round starts is a visible
// hitch. Two per frame clears a 24-strong wave in about a fifth of a second, and
// the ones still waiting keep walking the route they already have — which is why
// deferring costs nothing the player can see.
const PATHS_PER_FRAME = 2;

// ------------------------------------------------------------------
export class ZombieManager {
  constructor(scene, map, cbs, authority = true) {
    this.scene = scene;
    this.map = map;
    this.cb = cbs; // {onKilled, onPlayerDamaged, onBoardTorn, onSpawned, onRiseDirt, onRiseDone}
    this.authority = authority;
    this.zombies = new Map();
    this.nextId = 1;
    this.round = 0;
    this.time = 0;
    this.groanTimer = 0; // the first update() schedules the first ambient groan
    this.toSpawn = 0;
    this.spawnTimer = 0;
    this.spawnDelay = 2;
    this.dogRound = false;
    this.lastDogRound = 0;
    this.nextDogRound = null;
    this.instakill = false;
    this.monkey = null; // {x,z,t}
    this.dormant = false; // game over: the horde stops hunting and just stands
    this.group = new THREE.Group();
    scene.add(this.group);
    // Navigation grid over the map's real colliders (js/navmesh.js). Only the
    // authority runs AI, so a guest never pays for the build. If it ever throws
    // the horde must still function: every nav call site is guarded, and the
    // fallback is the old steer-at-the-target behaviour.
    this.nav = null;
    if (authority) {
      try {
        this.nav = getNavGrid(map);
      } catch (e) {
        console.error('[zombies] navigation grid unavailable; falling back to direct steering', e);
      }
    }
    this._colBuf = [];
  }

  get aliveCount() { let n = 0; for (const z of this.zombies.values()) if (z.state !== ZSTATES.DIE) n++; return n; }
  get roundInProgress() { return this.toSpawn > 0 || this.aliveCount > 0; }
  get dogRemaining() {
    let n = this.authority ? this.toSpawn : 0;
    for (const z of this.zombies.values()) if (z.dog && z.state !== ZSTATES.DIE) n++;
    return n;
  }

  // ---------- combat ----------
  damage(zid, dmg, { head = false, by = null, explosive = false, weapon = null } = {}) {
    const z = this.zombies.get(zid);
    if (!z || z.state === ZSTATES.DIE) return { ok: false };
    let real = dmg;
    if (this.instakill) real = 999999;
    if (head) real *= weapon?.headMult || 2;
    z.hp -= real;
    if (z.visual) z.visual.flash();
    this.cb.onZombieHit?.(z, { head, by, dmg: real });
    if (z.hp <= 0) {
      this.kill(z, { head, by, weapon });
      return { ok: true, killed: true, head };
    }
    // crawler conversion from explosives (rare — too many read as a visual bug)
    if (explosive && !z.dog && !z.crawler && z.hp < z.maxHp * 0.35 && Math.random() < 0.22) {
      z.crawler = true;
      z.state = ZSTATES.CHASE;
      z.speed = 0.6;
      if (z.visual) z.visual.play('Crawl', { timeScale: 0.6 }); // slow drag, not a glide
      this.cb.onCrawler?.(z);
    }
    return { ok: true, killed: false };
  }

  kill(z, { head = false, by = null, weapon = null, silent = false } = {}) {
    if (z.state === ZSTATES.DIE) return;
    z.state = ZSTATES.DIE;
    z.deadT = 0;
    z.headshotDeath = head;
    if (z.barrier) { const b = z.barrier; if (b.occupant === z.id) b.occupant = null; z.barrier = null; }
    if (!silent) this.cb.onKilled?.(z, { head, by, weapon });
  }

  nukeAll(by = null) {
    const list = [...this.zombies.values()].filter((z) => z.state !== ZSTATES.DIE);
    list.forEach((z, i) => setTimeout(() => this.kill(z, { by }), i * 90));
    return list.length;
  }

  // ---------- authority update ----------
  update(dt, players) {
    this.time += dt;
    // spawner
    if (this.authority && !this.dormant && this.toSpawn > 0 && this.aliveCount < CFG.MAX_ALIVE) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = this.spawnDelay * rand(0.7, 1.3);
        if (this.dogRound) this.spawnTimer *= 0.6;
        this.spawnOne(players.filter((p) => !p.dead));
      }
    }
    // tasteful ambient groans (WaW-style: sparse, quiet, never the same zombie twice in a row)
    this.groanTimer -= dt;
    if (this.groanTimer <= 0) {
      this.groanTimer = rand(9, 14);
      const cands = [...this.zombies.values()].filter((z) => z.state !== ZSTATES.DIE && !z.dog && (z.groanT || 0) < this.time);
      if (cands.length) {
        const z = choice(cands);
        z.groanT = this.time + rand(26, 42); // this zombie stays quiet for a while
        this.cb.onGroan?.(z);
      }
    }
    if (this.monkey) {
      this.monkey.t -= dt;
      if (this.monkey.t <= 0) this.monkey = null;
    }

    this._af = ((this._af || 0) + 1) | 0;
    this._pathBudget = PATHS_PER_FRAME;
    for (const z of this.zombies.values()) {
      this.stepZombie(z, dt, players);
      // animation LOD: distant zombies pose-update at reduced rate (MP perf)
      const np = players.length ? players[0] : null;
      const d2 = np ? (z.x - np.x) ** 2 + (z.z - np.z) ** 2 : 0;
      const every = d2 < 625 ? 1 : d2 < 2025 ? 2 : 3;
      // Damage detail is silhouette dressing — past ~45m it is a few pixels
      // wide and costs up to five draw calls per corpse, so drop it there.
      if (z.visual?.detail) {
        const want = d2 < 2025;
        if (z._detailVis !== want) { setZombieDetailVisible(z.visual.detail, want); z._detailVis = want; }
      } else if (z.dog && z.model) {
        // Hounds pay for their silhouette in the shadow pass, not the colour
        // pass. Distance tiers drop shadow casting long before they drop mass.
        setHellhoundLOD(z.model, d2);
      }
      this.animate(z, dt, ((this._af + z.id) % every) !== 0);
    }
    // cleanup dead
    for (const [id, z] of this.zombies) {
      if (z.state === ZSTATES.DIE && z.deadT > 2.6) {
        this.group.remove(z.model);
        this.zombies.delete(id);
      }
    }
  }

  // ---------- shared animation ----------
  animate(z, dt, lite = false) {
    const m = z.model;
    if (!m) return;
    // Everything below moves the body, so its hit hulls must be re-derived
    // before the next shot is tested against them (see refreshHitPose).
    z.poseSerial = (z.poseSerial || 0) + 1;
    m.position.set(z.x, z.y, z.z);
    // YXZ so pitch and roll are applied AFTER yaw, i.e. about the body's own
    // axes. Under the default XYZ order a rise pitch would tip the corpse
    // toward world north regardless of which way it is facing.
    m.rotation.order = 'YXZ';
    // The procedural hound is authored nose-first along local +X while the AI
    // yaw convention faces local +Z. Rotate it into the same forward axis used
    // by navigation and dogHitZones; otherwise the rendered dog is sideways to
    // its authoritative hit silhouette.
    m.rotation.y = z.yaw - (z.dog ? Math.PI / 2 : 0);
    m.rotation.x = 0;
    m.rotation.z = 0;
    if (!z.dog && z.state === ZSTATES.RISE) {
      // Rotate from near-prone to upright across the rise. Without this the
      // body stays bolt vertical the whole way, which is the other half of why
      // risers looked like they were floating up out of the floor.
      const t = Math.min(1, Math.max(0, z.riseT || 0));
      const upright = t <= 0.35 ? 0 : Math.min(1, (t - 0.35) / 0.5);
      const lean = 1 - upright * upright * (3 - 2 * upright);   // smoothstep out
      m.rotation.x = 0.95 * lean;
      // Rocking shoulder-to-shoulder while it fights, settling as it stands.
      m.rotation.z = Math.sin(z.stateT * 7.3 + z.id) * 0.17 * lean;
      m.position.x += z.riseLurchX || 0;
      m.position.z += z.riseLurchZ || 0;
    }
    if (lite) return; // LOD: position-only frame (skip mixer/pose work)
    const dormant = !!this.dormant && z.state !== ZSTATES.DIE;
    if (z.visual) {
      const v = z.visual;
      const pose = zombiePoseForState({
        state: z.state, speed: z.speed, crawler: z.crawler, current: v.current,
        riseT: z.riseT || 0, dormant, variant: z.id,
      });
      if (pose.loop || v.current !== pose.action) v.play(pose.action, pose);
      if (z.state === ZSTATES.DIE) {
        if (z.deadT > 1.7) m.position.y = z.y - (z.deadT - 1.7) * 1.2; // sink away
      } else if (z.crawler) {
        // dragging side-to-side roll so it reads as hauling itself, not sliding
        m.rotation.z = Math.sin(z.anim * 0.35) * 0.12;
      }
      v.update(dt);
      return;
    }
    // procedural fallback models
    const u = m.userData;
    if (u.dog) {
      applyHellhoundPose(m, { state: z.state, phase: z.anim, stateT: z.stateT, deadT: z.deadT, headshotDeath: z.headshotDeath, groundY: z.y, dormant });
      return;
    }
    if (u.fallbackZombie) {
      const stride = Math.sin(z.anim) * (dormant ? 0.06 : z.state === ZSTATES.CHASE ? 0.5 : 0.22);
      u.armL.rotation.x = -0.75 + stride;
      u.armR.rotation.x = -0.75 - stride;
      u.legL.rotation.x = stride;
      u.legR.rotation.x = -stride;
      u.torso.rotation.x = z.crawler ? -0.9 : 0.12;
      if (z.state === ZSTATES.DIE) {
        m.rotation.z = Math.min(Math.PI / 2, z.deadT * 1.8) * (z.headshotDeath ? -1 : 1);
        if (z.deadT > 1.7) m.position.y = z.y - (z.deadT - 1.7) * 1.2;
      }
      return;
    }
    m.rotation.z = 0;
  }

  clear() {
    for (const [, z] of this.zombies) this.group.remove(z.model);
    this.zombies.clear();
    this.dormant = false;
    // Hand every window back, or a restart inherits the old game's claims.
    for (const b of this.map.barriers) b.occupant = null;
    this.toSpawn = 0;
    this.round = 0;
    this.dogRound = false;
    this.lastDogRound = 0;
    this.nextDogRound = null;
    this.anchorRound = undefined;
  }
}

// ZombieManager's spawning, movement, state machine and replication are in
// js/zombies/manager-*.js. Each file is a class whose methods are copied onto
// ZombieManager.prototype here, as Game's and WeaponRig's are; a name defined
// twice fails at load.
installMixins(ZombieManager, [ZombieManagerSpawning, ZombieManagerMovement, ZombieManagerAi, ZombieManagerNet]);
