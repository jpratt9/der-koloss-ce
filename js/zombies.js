// Zombies: animated CC0 models (Quaternius, CC0) driven by the AI state machine,
// classic round structure with health scaling, hellhounds, crawlers.
import * as THREE from 'three';
import { CFG, roundZombieCount, roundZombieHealth, roundSpawnDelay, nextDogRound, dogCount } from './config.js';
import { clamp, lerp, rand, choice, resolveCircleBox, installMixins } from './utils.js';
import { elevationAwareRiseCandidate, roomDepthsToPlayers } from './map-layout.js';
import { getNavGrid } from './navmesh.js';
import { setZombieDetailVisible } from './render/ZombieDetail.js';
import { setHellhoundLOD, prewarmHellhounds } from './render/HellhoundModel.js';
import { ZSTATES } from './zombies/states.js';
import { zombiePoseForState, applyHellhoundPose } from './zombies/poses.js';
import { createZombieModel, createZombieVisual, enforceEnemyVisualIdentity } from './zombies/models.js';
import { ZombieManagerMovement } from './zombies/manager-movement.js';
import { ZombieManagerAi } from './zombies/manager-ai.js';

export { ZSTATES } from './zombies/states.js';
export { measureNeutralBounds, measureStandingBounds } from './zombies/bounds.js';
export { rayHitZombieBody, zombieAimPoint } from './zombies/hit-volumes.js';
export { zombiePoseForState, applyHellhoundPose } from './zombies/poses.js';
export { ZombieVisual } from './zombies/visual.js';
export { createZombieModel, createZombieVisual } from './zombies/models.js';

// Share of a wave that may rise out of the ground instead of climbing in
// through a boarded window. Windows are the rule; a rise is an occasional
// punctuation, not a fallback for "all the windows are busy".
const RISER_SHARE = 0.06;
// Last-resort escape hatch. Only reachable if every window somehow stays
// occupied forever, which occupancy release on kill and on climb-through
// should already prevent. Exists so a round can never hard-stall.
const SPAWN_QUEUE_PATIENCE = 60;
// Whole paths any single frame may compute. Close-quarters routes cost ~0.03ms,
// but a body on the far side of the map planning its way to the mainframe costs
// a few, and a whole wave doing that on the frame a round starts is a visible
// hitch. Two per frame clears a 24-strong wave in about a fifth of a second, and
// the ones still waiting keep walking the route they already have — which is why
// deferring costs nothing the player can see.
const PATHS_PER_FRAME = 2;

// The Teleporter C catwalk is a destination, never a spawn surface. Enemies
// must enter from the factory floor and use the physical west stair flight.
export function isZombieSpawnRoomAllowed(room) {
  return room !== 'catwalk';
}

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

  startRound(round, playerCount) {
    this.round = round;
    // anchor the hound cadence to the round this game STARTED on, so a
    // startRound cheat past round 5 still gets real dog rounds (3-5 rounds in)
    if (this.anchorRound === undefined) this.anchorRound = round;
    if (this.nextDogRound == null) this.nextDogRound = nextDogRound(this.lastDogRound, this.anchorRound);
    this.dogRound = round >= this.nextDogRound;
    if (this.dogRound) {
      this.lastDogRound = round;
      this.nextDogRound = nextDogRound(this.lastDogRound, this.anchorRound);
      this.toSpawn = dogCount(round, playerCount);
      this.spawnDelay = 2.2;
      // Build the shared hound geometry during the round transition rather
      // than on the frame the first hound erupts out of the floor.
      prewarmHellhounds();
      this.cb.onDogRound?.();
    } else {
      this.toSpawn = roundZombieCount(round, playerCount);
      this.spawnDelay = roundSpawnDelay(round);
    }
    this.spawnTimer = 1.5;
    // Per-wave allowance for ground risers. Everything else comes in through
    // a boarded window.
    // floor(), not max(1,...): the early rounds should be pure windows.
    this._riserBudget = Math.floor(this.toSpawn * RISER_SHARE);
    this._blockedSpawns = 0;
  }

  activeSpawnRooms(players) {
    return new Set(this.activeSpawnRoomDepths(players).keys());
  }

  /** Reachable spawn rooms, keyed by how many rooms away the nearest player is. */
  activeSpawnRoomDepths(players) {
    const playerRooms = players.map((p) => this.map.roomAt(p.x, p.z, p.y)).filter(Boolean);
    return roomDepthsToPlayers(
      playerRooms,
      this.map.doors.filter((door) => door.open),
      this.map.navLinks || [],
    );
  }

  spawnOne(players) {
    // Release windows whose claimant no longer exists. Occupancy is normally
    // cleared by kill() and by climbing through, but a zombie can also leave
    // the map by a route that does not run either — the co-op sync prune and
    // clear() both delete straight out of the map. A single leaked claim locks
    // that window for the rest of the session, and once every window is locked
    // the whole wave falls back to rising out of the floor, which is exactly
    // the failure this spawn rework exists to prevent. Self-heal instead of
    // trusting every future caller to remember.
    for (const b of this.map.barriers) {
      if (b.occupant != null && !this.zombies.has(b.occupant)) b.occupant = null;
    }
    const depth = this.activeSpawnRoomDepths(players);
    // Boarded windows are the RULE and rising out of the ground is the
    // exception, exactly as in the games this is a tribute to. These used to
    // be pooled together with equal weight, so roughly half of every wave
    // erupted from the floor in the middle of a room, which reads as enemies
    // materialising rather than breaking in.
    //
    // Strict preference order, first non-empty tier wins:
    //   1. windows in a room a player is standing in
    //   2. windows one room away, then two, then three... (see below)
    //   3. ground risers in a player's room
    //   4. ground risers anywhere reachable, nearest ring first
    //   5. a rise near a player (failsafe only)
    //
    // "Elsewhere" is RINGED by hop count rather than pooled flat. Flat, tier 2
    // was one unranked bag of every window on the map picked uniformly, so the
    // tail of a wave was regularly born at the opposite shell: a player in the
    // Factory on round one drew a spawn from a Mainframe window 76m away, 80s of
    // walking at shambler speed, and spent the round unable to find the last
    // zombie. Ringing costs nothing and holds the overflow next door.
    //
    // Round 1 in Mainframe, where every game starts, measured 62s with a 52s
    // straggler flat, against 37s with a 27s straggler ringed.
    const barrierRings = [];
    const riserRings = [];
    // Hounds do not tear/climb window boards. Spawning one in a barrier alcove
    // puts it outside a collider it can never legally cross, so dedicated dog
    // rounds use only in-room risers (or the clear near-player fallback below).
    if (!this.dogRound) {
      for (const b of this.map.barriers) {
        const d = depth.get(b.room);
        if (d === undefined || !isZombieSpawnRoomAllowed(b.room) || b.occupant) continue;
        (barrierRings[d] ||= []).push({ type: 'barrier', b });
      }
    }
    for (const r of this.map.risers) {
      const d = depth.get(r.room);
      if (d === undefined || !isZombieSpawnRoomAllowed(r.room)) continue;
      (riserRings[d] ||= []).push({ type: 'riser', r });
    }
    // Sparse arrays: find() skips holes, so the nearest non-empty ring wins.
    let tier = barrierRings.find((t) => t && t.length);
    if (!tier) {
      // Every reachable window is already busy. The horde QUEUES at the
      // windows rather than giving up and erupting from the floor — that
      // queueing is what makes waves arrive as a stream through the breaches
      // instead of appearing behind you. Ground risers are held back until
      // waiting has clearly stalled the round.
      const windowsExist = !this.dogRound && this.map.barriers.some(
        (b) => depth.has(b.room) && isZombieSpawnRoomAllowed(b.room));
      // Spend from this wave's small riser quota; once it is gone, WAIT for a
      // window rather than falling back to the floor. A counter that only
      // resets on success inevitably trips over a long round, which is how the
      // floor ended up supplying 40% of the wave.
      const quotaLeft = (this._riserBudget || 0) > 0;
      if (windowsExist && !quotaLeft
          && (this._blockedSpawns = (this._blockedSpawns || 0) + 1) < SPAWN_QUEUE_PATIENCE) {
        return false;                      // try again on the next spawn tick
      }
      tier = riserRings.find((t) => t && t.length);
      if (tier) this._riserBudget = (this._riserBudget || 0) - 1;
    }
    this._blockedSpawns = 0;
    if (!tier) {
      // Failsafe: every window is occupied and no riser is reachable (players
      // camping a windowless room). Classic games never let a round stall.
      const p = choice(players.filter((pl) => !pl.dead));
      if (!p) return false;
      const spot = this.riseSpotNear(p);
      if (!spot) return false;
      tier = [{ type: 'riser', r: { ...spot, exact: true } }];
    }
    const pick = choice(tier);
    // Hellhounds belong only to scheduled hellhound rounds. Keeping this tied to
    // one round-level flag prevents stray dogs from leaking into normal waves.
    const makeDog = this.dogRound;
    const hp = makeDog ? Math.min(100 + this.round * 15, 500) : roundZombieHealth(this.round);
    const z = {
      id: this.nextId++, dog: makeDog,
      x: 0, z: 0, y: 0, yaw: 0,
      hp, maxHp: hp,
      state: ZSTATES.RISE, stateT: 0, riseT: 0, riseDur: 0, riseLurchX: 0, riseLurchZ: 0, riseYaw: 0,
      speed: 0, targetId: null, retarget: 0,
      navPath: null, navIdx: 0, navGoalX: undefined, navGoalZ: undefined, repath: 0, slideSide: 0,
      attackT: 0, hitApplied: false,
      anim: rand(10), barrier: null, deadT: 0,
      model: null, crawler: false,
      stepT: 0, lastX: 0, lastZ: 0, repoT: 0, stuckT: 0, age: 0, nearT: 0, lastD: 1e9, groanT: rand(4, 14),
      riseFloor: 0,
    };
    if (makeDog) {
      z.speed = rand(6.0, 6.8);
    } else {
      // classic pacing: rounds 1-2 are all slow shamblers; runners join from round 3
      const runChance = clamp((this.round - 3) * 0.09, 0, 0.65);
      if (this.round <= 2) z.speed = rand(0.85, 1.35);
      else z.speed = Math.random() < runChance ? rand(3.4, 4.4) : rand(1.1, 2.3);
    }
    if (pick.type === 'barrier' && !makeDog) {
      const b = pick.b;
      b.occupant = z.id;
      z.barrier = b;
      z.x = b.alcove.x; z.z = b.alcove.z;
      z.room = b.room;
      z.state = ZSTATES.APPROACH;
      z.stateT = 0;
    } else {
      const r = pick.r || pick.b && { x: pick.b.alcove.x, z: pick.b.alcove.z, room: pick.b.room };
      const jitter = r.exact ? 0 : 0.8;
      z.x = r.x + rand(-jitter, jitter); z.z = r.z + rand(-jitter, jitter);
      z.riseFloor = Number.isFinite(r.y) ? r.y : this.map.floorY(z.x, z.z, 0);
      z.y = z.riseFloor - 1.5;
      z.room = r.room || this.map.roomAt(z.x, z.z, z.riseFloor);
      z.state = ZSTATES.RISE;
    }
    z.room ||= this.map.roomAt(z.x, z.z, z.riseFloor) || (z.barrier ? z.barrier.room : null);
    if (z.dog) {
      z.model = createZombieModel(true, { directorRig: true }); // real IK legs for the hellhounds
      z.visual = null;
    } else {
      z.visual = createZombieVisual();
      z.model = z.visual ? z.visual.group : createZombieModel(false);
    }
    enforceEnemyVisualIdentity(z);
    z.model.position.set(z.x, z.y, z.z);
    this.group.add(z.model);
    this.zombies.set(z.id, z);
    this.toSpawn--;
    this.cb.onSpawned?.(z);
    return true;
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

  // Find a clear spawn/respawn spot. Upper rooms normally keep their elevation,
  // but Teleporter C's catwalk is deliberately destination-only: enemies rise
  // on the factory floor and navigate up the declared catwalk stairs.
  riseSpotNear(target) {
    const targetY = Number.isFinite(Number(target?.y)) ? Number(target.y) : 0;
    const targetRoom = this.map.roomAt(target.x, target.z, targetY);
    const riseTarget = targetRoom === 'catwalk'
      ? { x: target.x, y: 0, z: target.z }
      : target;
    // The height a body emerging here would actually stand at.
    const riseY = Number.isFinite(Number(riseTarget?.y)) ? Number(riseTarget.y) : 0;
    const candidates = [];
    const addCandidate = (x, z) => {
      let nx = x, nz = z;
      for (const c of this.map.colliders) {
        if (c.window || c.shootOk || c.playerOnly) continue;
        // Height is not optional here, and leaving it out was a softlock.
        //
        // The Bridge DECK is a collider (y0 2.65, h 0.25) and so is its railing
        // (y0 2.9, h 1.1). Flattened to 2D they cover the whole bridge, so every
        // probe was shoved off the very surface it was meant to land on:
        // elevationAwareRiseCandidate then found nothing in the player's room and
        // riseSpotNear returned null for anyone standing there — 200/200 probes,
        // against 200/200 successes in all twelve other rooms.
        //
        // That made respawnNear a silent no-op, which disables ALL THREE
        // guarantees that a round ends: the 25s no-progress watchdog, the
        // stuckT > 9 last resort, and the spawner's near-player failsafe. One
        // zombie wedged on a doorway jamb — jittering just enough that stuckT
        // never reached 9 — then held the wave open indefinitely. Measured 181.7s
        // average for round 1 on the bridge against 60-70s elsewhere, and runs
        // still going at the 400s cap; 60.5s on the same seed once filtered.
        //
        // Same band _colliders() and navmesh.blocksEnemy() already use.
        if (c.y0 !== undefined && (c.y0 > riseY + 1.1 || c.y0 + c.h < riseY + 0.25)) continue;
        [nx, nz] = resolveCircleBox(nx, nz, 0.32, c);
      }
      candidates.push({ x: nx, z: nz });
    };
    // Deterministic same-axis probes guarantee a candidate on narrow upper
    // connectors such as the two-metre bridge and catwalk. Random rings alone
    // could miss those strips and stall a wave even after dozens of samples.
    for (const [dx, dz] of [[3.2, 0], [-3.2, 0], [4.2, 0], [-4.2, 0], [0, 3.2], [0, -3.2]]) {
      addCandidate(riseTarget.x + dx, riseTarget.z + dz);
    }
    for (let i = 0; i < 48; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(3.0, 5.0);
      addCandidate(riseTarget.x + Math.sin(a) * r, riseTarget.z + Math.cos(a) * r);
    }
    const spot = elevationAwareRiseCandidate({
      target: riseTarget, candidates,
      roomAt: (x, z, y) => this.map.roomAt(x, z, y),
      floorY: (x, z, y) => this.map.floorY(x, z, y),
    });
    return spot && isZombieSpawnRoomAllowed(spot.room) ? spot : null;
  }

  // classic failsafe: a wedged zombie rises out of the ground near its target
  // (guarantees every zombie can always reach a player, so rounds always end)
  respawnNear(z, target) {
    if (!target) return;
    const spot = this.riseSpotNear(target);
    if (!spot) return;
    // Hand the window back. A relocated body re-enters the chase and never
    // touches its barrier again, so the claim would sit on a LIVE zombie —
    // which spawnOne's self-heal cannot reclaim, since that only releases
    // claims held by claimants who no longer exist. The window would stay out
    // of the spawn pool for the rest of the round.
    if (z.barrier) {
      if (z.barrier.occupant === z.id) z.barrier.occupant = null;
      z.barrier = null;
    }
    z.x = spot.x; z.z = spot.z;
    z.riseFloor = spot.y;
    z.y = spot.y - 1.2;
    z.state = ZSTATES.RISE; z.stateT = 0;
    z.room = spot.room;
    z.navPath = null; z.navGoalX = undefined; z.navGoalZ = undefined; z.repath = 0; z.retarget = 0;
    z.stuckT = 0; z.repoT = 0; z.lastX = z.x; z.lastZ = z.z; z.lastY = z.y; z.nearT = 0; z.lastD = 1e9; z.bestD = undefined;
    this.cb.onSpawned?.(z);
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

// ZombieManager's movement and its state machine are in js/zombies/manager-*.js.
// Each file is a class whose methods are copied onto ZombieManager.prototype
// here, as Game's and WeaponRig's are; a name defined twice fails at load.
installMixins(ZombieManager, [ZombieManagerMovement, ZombieManagerAi]);
