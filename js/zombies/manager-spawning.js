// ZombieManager's spawning: how big each wave is, where its bodies come in (a
// boarded window first, the floor only now and then), and the rise spots that
// also rescue a body wedged out of reach.
// Methods of ZombieManager: js/zombies/manager.js copies them onto ZombieManager.prototype.
import { roundZombieCount, roundZombieHealth, roundSpawnDelay, nextDogRound, dogCount } from '../config.js';
import { clamp, rand, choice, resolveCircleBox } from '../utils.js';
import { elevationAwareRiseCandidate, roomDepthsToPlayers } from '../map-layout.js';
import { prewarmHellhounds } from '../render/HellhoundModel.js';
import { ZSTATES } from './states.js';
import { createZombieModel, createZombieVisual, enforceEnemyVisualIdentity } from './models.js';

// Share of a wave that may rise out of the ground instead of climbing in
// through a boarded window. Windows are the rule; a rise is an occasional
// punctuation, not a fallback for "all the windows are busy".
const RISER_SHARE = 0.06;
// Last-resort escape hatch. Only reachable if every window somehow stays
// occupied forever, which occupancy release on kill and on climb-through
// should already prevent. Exists so a round can never hard-stall.
const SPAWN_QUEUE_PATIENCE = 60;

// The Teleporter C catwalk is a destination, never a spawn surface. Enemies
// must enter from the factory floor and use the physical west stair flight.
export function isZombieSpawnRoomAllowed(room) {
  return room !== 'catwalk';
}

export class ZombieManagerSpawning {
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
}
