// ZombieManager's state machine: what each body does every frame on the host,
// from clawing out of the floor to the dormant horde at game over.
// Methods of ZombieManager: js/zombies/manager.js copies them onto ZombieManager.prototype.
import { CFG } from '../config.js';
import { rand, dist2D, moveCircleWithColliders } from '../utils.js';
import { NAV_RADIUS } from '../navmesh.js';
import { ZSTATES } from './states.js';

// How far below the floor a zombie starts. Deep enough that the torso is
// genuinely hidden until it heaves clear, not just the feet.
const RISE_DEPTH = 2.05;
// How long a zombie keeps drifting after the horde goes dormant. Cutting the
// root to zero on the same frame the run blends into an idle reads as a pause
// button; half a second of decaying drift reads as a body losing interest.
const DORMANT_SETTLE = 0.5;
// How close a body has to get to a navigation waypoint before it commits to the
// next one. Slightly wider than a grid cell, so a fast hound taking a shallow
// corner does not orbit a waypoint it has already effectively passed.
const WAYPOINT_R = 0.7;
// ...and how far below or above it the body may be and still count as there.
// Generous enough to absorb a ramp's slope between two cells, tight enough that
// a waypoint one deck up is never satisfied from the floor underneath it.
const WAYPOINT_Y = 1.0;

export class ZombieManagerAi {
  // Everyone is down or dead. Stop the AI — no spawns, no pathing, no swings —
  // but leave the bodies in the world so the death cam still looks at a horde
  // rather than a freeze-frame. Clients call this off the 'gameover' message,
  // so remote hordes settle the same way the host's does.
  setDormant(on = true) {
    const next = !!on;
    if (this.dormant === next) return;
    this.dormant = next;
    if (!next) return;
    for (const z of this.zombies.values()) {
      if (z.state === ZSTATES.DIE) continue;
      // A half-played swing would land its damage on a corpse; drop back to the
      // neutral state and let the coast-down carry the momentum off.
      if (z.state === ZSTATES.ATTACK) { z.state = ZSTATES.CHASE; z.stateT = 0; z.hitApplied = true; }
      z.settleT = DORMANT_SETTLE;
    }
  }

  // ---------- helpers ----------
  nearestPlayer(z, players) {
    let best = null, bd = 1e9;
    for (const p of players) {
      if (p.down) continue;
      // strongly prefer same-elevation targets (catwalk vs factory floor etc.)
      const d = dist2D(z.x, z.z, p.x, p.z) + Math.abs((p.y || 0) - z.y) * 6;
      if (d < bd) { bd = d; best = p; }
    }
    const result = this._nearestResult || (this._nearestResult = { p: null, d: 1e9 });
    result.p = best;
    result.d = bd;
    return result;
  }

  stepZombie(z, dt, players) {
    const dormant = this.dormant && z.state !== ZSTATES.DIE;
    z.stateT += dt;
    // Idle sway, not a gait: the procedural rigs read z.anim as their stride
    // phase, so the same slowdown that stops the legs also slows the head.
    z.anim += dt * (dormant ? 0.9 : (z.dog ? 11 : (z.speed > 3 ? 8 : z.speed > 2 ? 5 : 3)));
    if (!this.authority) return;

    // Dormant: no targeting, no barriers, no watchdog respawns. Risers are the
    // one exception — they finish hauling themselves out and then stand.
    if (dormant && z.state !== ZSTATES.RISE) {
      if (z.settleT > 0) {
        z.settleT = Math.max(0, z.settleT - dt);
        const k = z.settleT / DORMANT_SETTLE;
        this.moveZombie(z, Math.sin(z.yaw), Math.cos(z.yaw), dt * k * k);
      }
      return;
    }

    // global watchdog (ANY state): a zombie that can never get near a player must
    // not hold the round hostage — classic games teleport stragglers to you.
    if (z.state !== ZSTATES.DIE && z.state !== ZSTATES.RISE) {
      z.age += dt;
      const { p: np, d: nd } = this.nearestPlayer(z, players);
      // Progress, not proximity.
      //
      // This timer only ever reset when a body got within 3.5m of somebody, so a
      // round-one shambler at 1.1 m/s walking the length of the map — a
      // legitimate forty-second journey — was teleported at twenty-five seconds
      // every single time, whether or not anything was ever in its way. That
      // masked the real navigation failure for a long time: the horde appeared
      // to arrive, so nothing looked broken, and the bodies that were genuinely
      // wedged were rescued by the same cheat as the ones simply walking.
      //
      // Closing the gap on its own best-ever approach is proof a body is working,
      // and that is what keeps it alive now. `bestD` is a CHECKPOINT, not a
      // running minimum — updating it every frame would make the gain since the
      // last frame the thing being measured, which is a few centimetres and
      // never clears the bar. A body that keeps beating its record walks as long
      // as it needs to; one whose record stops improving for twenty-five seconds
      // is either wedged or being kited, and both of those are what this failsafe
      // is for.
      const best = z.bestD ?? Infinity;
      if (nd < 3.5 || nd < best - 0.5) { z.nearT = 0; z.bestD = Math.min(best, nd); }
      else z.nearT += dt;
      if (z.age > 10 && z.nearT > 25 && np) this.respawnNear(z, np);
    }

    switch (z.state) {
      case ZSTATES.RISE: {
        const fb = this.map.floorY(z.x, z.z, z.riseFloor ?? 0);
        z.riseFloor = fb;
        const dur = z.riseDur || (z.riseDur = rand(1.9, 2.5));
        const t = Math.min(1, z.stateT / dur);
        z.riseT = t;

        // A corpse hauling itself out of the ground does not glide up at a
        // constant rate, which is exactly what the old linear lerp looked
        // like. This is a four-beat struggle: an arm punches clear, it hangs
        // there scrabbling for purchase, heaves the torso out, then drags the
        // legs free. The curve is piecewise so each beat has a distinct
        // velocity, and the sub-beat easing keeps it from looking stepped.
        let h;                                     // 0..1 height out of the ground
        if (t < 0.18) {                            // burst: hand and forearm
          const k = t / 0.18;
          h = 0.26 * (1 - (1 - k) * (1 - k));
        } else if (t < 0.42) {                     // stall: clawing, sinks a little
          const k = (t - 0.18) / 0.24;
          h = 0.26 - 0.04 * Math.sin(k * Math.PI);
        } else if (t < 0.74) {                     // heave: torso clears
          const k = (t - 0.42) / 0.32;
          h = 0.22 + 0.58 * k * k * (3 - 2 * k);
        } else {                                   // drag the legs out and stand
          const k = (t - 0.74) / 0.26;
          h = 0.80 + 0.20 * (1 - (1 - k) * (1 - k) * (1 - k));
        }
        z.y = fb - RISE_DEPTH * (1 - h);

        // Lurch: the body twists and rocks as it fights the ground. Amplitude
        // decays as it gets free so it settles rather than stopping dead.
        const struggle = (1 - t) * (1 - t);
        z.riseLurchX = Math.sin(z.stateT * 11.3 + z.id) * 0.10 * struggle;
        z.riseLurchZ = Math.cos(z.stateT * 8.7 + z.id * 1.7) * 0.075 * struggle;
        z.yaw = (z.riseYaw ?? z.yaw) + Math.sin(z.stateT * 6.1 + z.id) * 0.22 * struggle;

        // Dirt keeps coming while it fights, heaviest on the two heaves.
        const burst = (t < 0.2) || (t > 0.44 && t < 0.62);
        z.riseFxAcc = (z.riseFxAcc || 0) + dt * (burst ? 34 : 9);
        while (z.riseFxAcc >= 1) {
          z.riseFxAcc -= 1;
          this.cb.onRiseDirt?.(z, fb, t);
        }

        if (t >= 1) {
          z.state = ZSTATES.CHASE;
          z.y = fb;
          z.riseLurchX = 0; z.riseLurchZ = 0; z.riseT = 1;
          z.room = this.map.roomAt(z.x, z.z, z.y);
          this.cb.onRiseDone?.(z, fb);
        }
        break;
      }
      case ZSTATES.APPROACH: {
        const b = z.barrier;
        if (!b) { z.state = ZSTATES.CHASE; break; }
        const dx = b.x - z.x, dz = b.z - z.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.35) {
          this.moveZombie(z, dx / d, dz / d, dt);
          z.yaw = Math.atan2(dx, dz);
        } else { z.state = ZSTATES.TEAR; z.stateT = 0; z.tearAcc = 0; }
        break;
      }
      case ZSTATES.TEAR: {
        const b = z.barrier;
        if (!b) { z.state = ZSTATES.CHASE; break; }
        z.yaw = Math.atan2(b.x - z.x, b.z - z.z) || z.yaw;
        z.tearAcc += dt;
        if (z.tearAcc >= 1.35) {
          z.tearAcc = 0;
          if (b.boards > 0) {
            b.boards--;
            this.cb.onBoardTorn?.(b);
          }
          if (b.boards <= 0) { z.state = ZSTATES.CLIMB; z.stateT = 0; }
        }
        break;
      }
      case ZSTATES.CLIMB: {
        const b = z.barrier;
        if (!b) { z.state = ZSTATES.CHASE; break; }
        const t = Math.min(1, z.stateT / 0.9);
        z.x = b.x - b.nx * 0.6 * (1 - t) + b.nx * 0.7 * t;
        z.z = b.z - b.nz * 0.6 * (1 - t) + b.nz * 0.7 * t;
        z.y = Math.sin(t * Math.PI) * 0.85;
        z.yaw = Math.atan2(b.nx, b.nz);
        if (t >= 1) {
          z.y = 0;
          if (b.occupant === z.id) b.occupant = null;
          z.barrier = null;
          z.room = this.map.roomAt(z.x, z.z);
          z.state = ZSTATES.CHASE;
        }
        break;
      }
      case ZSTATES.CHASE: {
        // elevation: track floors, fall off ledges, haul up through high windows
        {
          const fy = this.map.floorY(z.x, z.z, z.y);
          if (z.y > fy + 0.05) { z.velY = (z.velY || 0) - 18 * dt; z.y = Math.max(fy, z.y + z.velY * dt); }
          else if (fy - z.y > 0.3) { z.y = Math.min(fy, z.y + 3.2 * dt); } // hauling up a high window
          else { z.y = fy; z.velY = 0; }
        }
        z.retarget -= dt;
        if (z.retarget <= 0) {
          z.retarget = 1.2;
          const { p } = this.monkey ? { p: this.monkey } : this.nearestPlayer(z, players);
          const newId = p ? (p.id ?? 'monkey') : null;
          if (newId !== z.targetId) z.navPath = null; // keep the current route if the target didn't change
          z.targetId = newId;
        }
        const target = this.monkey || players.find((p) => p.id === z.targetId && !p.down) || this.nearestPlayer(z, players).p;
        if (!target) break;
        z.room = this.map.roomAt(z.x, z.z, z.y) || z.room;
        const ty = target.y || 0;
        const directD = dist2D(z.x, z.z, target.x, target.z);
        const dyT = Math.abs(ty - z.y);

        // ---- navigation ----
        // Routes now come from the collider-derived grid (js/navmesh.js), and
        // crucially they come from it INSIDE a single room too. The old code only
        // pathed when the target stood in a different room, so anything between
        // an enemy and a player in the same space was never routed around: a
        // crate, a generator, the mystery box — or the balcony stair flight,
        // which to an enemy is a solid 4.4m block standing in an 8m corridor.
        // Straight-line steering walked into it and stayed there.
        const nav = this.nav;
        z.repath -= dt;
        if (nav) {
          const drift = z.navGoalX === undefined
            ? Infinity : dist2D(z.navGoalX, z.navGoalZ, target.x, target.z);
          if (z.repath <= 0 || drift > 2.5) {
            if (this._pathBudget > 0) {
              this._pathBudget--;
              z.repath = rand(0.55, 0.9);          // staggered; never a whole-wave spike
              z.navGoalX = target.x; z.navGoalZ = target.z;
              // A clear run on the same deck needs no route at all. Going
              // straight at the prey is cheaper and reads better than tracking a
              // lattice, so the grid is only consulted when something is in the way.
              z.navPath = (dyT < 0.4 && directD < 26 && nav.losClear(z.x, z.z, target.x, target.z, z.y))
                ? null
                : nav.findPath(z.x, z.y, z.z, target.x, ty, target.z);
              z.navIdx = 0;
            } else {
              z.repath = 0.12;                     // frame is full; come back shortly
            }
          }
        }

        let gx = target.x, gz = target.z;
        if (z.navPath && z.navPath.length) {
          // Reaching a waypoint means reaching it in THREE dimensions.
          //
          // Testing only x/z is wrong wherever the map stacks surfaces, and it
          // fails worst on exactly the routes that need a route: a body on the
          // factory floor underneath the catwalk stairs sits within a waypoint
          // radius, horizontally, of every step of the flight above it. It would
          // swallow the entire climb in one frame without gaining a centimetre,
          // decide it had arrived, walk back toward the target, re-plan, and
          // oscillate at the foot of the stairs forever. Same story under any
          // balcony. The height test is what makes a climb a climb.
          while (z.navIdx < z.navPath.length) {
            const wp = z.navPath[z.navIdx];
            if (dist2D(z.x, z.z, wp.x, wp.z) >= WAYPOINT_R
                || Math.abs(z.y - wp.y) >= WAYPOINT_Y) break;
            z.navIdx++;
          }
          if (z.navIdx < z.navPath.length) { const wp = z.navPath[z.navIdx]; gx = wp.x; gz = wp.z; }
          else z.navPath = null;                   // route walked out; close on the prey
        }
        const dx = gx - z.x, dz = gz - z.z;
        const d = Math.hypot(dx, dz);
        z.goalX = gx; z.goalZ = gz;                // what deflection steering aims at
        const attackRange = z.dog ? 1.5 : 1.35;
        // A target on the deck above used to force a repath every 0.2s, back when
        // the only route information was "which room" and standing underneath
        // someone genuinely told the AI nothing. Against the grid it is actively
        // harmful: the route to the catwalk stairs leads AWAY from the player, so
        // re-planning five times a second restarted the body at waypoint zero
        // before it had walked far enough to leave the pool of bodies milling
        // underneath — and with a per-frame path budget shared across the wave, a
        // dozen enemies doing that starve each other of searches. The normal
        // cadence already re-plans often enough to follow someone moving around
        // up there.
        if (!this.monkey && directD < attackRange && dyT < 1.7 && !target.down) {
          z.state = ZSTATES.ATTACK; z.stateT = 0; z.hitApplied = false;
          this.cb.onSnarl?.(z);
        } else if (d > 0.05) {
          this.moveZombie(z, dx / d, dz / d, dt);
          this.separate(z, dt);
          z.yaw = Math.atan2(dx, dz);
          z.stepT -= dt;
          if (z.stepT <= 0) { z.stepT = z.dog ? 0.28 : (z.speed > 3 ? 0.34 : 0.55); this.cb.onStep?.(z); }
        }

        // ---- stuck escalation ----
        // Progress means MOVEMENT, not closing distance. The old test also tripped
        // whenever `closing < 0.05`, which is true of every enemy correctly taking
        // the long way around an obstacle — so the failsafe fired hardest on
        // exactly the bodies that were doing the right thing, and the answer it
        // gave them was a teleport.
        z.repoT += dt;
        if (z.repoT >= 0.5) {
          const travelled = Math.hypot(z.x - z.lastX, z.z - z.lastZ, (z.y - (z.lastY ?? z.y)) * 1.6);
          if (travelled < z.speed * z.repoT * 0.22 && directD > 1.5) z.stuckT += z.repoT;
          else z.stuckT = 0;
          z.lastX = z.x; z.lastZ = z.z; z.lastY = z.y; z.repoT = 0; z.lastD = directD;
        }
        // 1. Re-route from wherever the body has actually ended up.
        if (z.stuckT > 0.6 && z.repath > 0.1) z.repath = 0;
        // 2. Genuinely wedged inside geometry — crowded into a wall, caught by a
        //    door closing, or spawned into a pocket. Walk it back onto the nearest
        //    cell the grid says is standable. Bounded to the body's own
        //    neighbourhood, so this frees an enemy under its own power instead of
        //    relocating it somewhere it never walked to.
        if (z.stuckT > 1.6 && nav) {
          const node = nav.nearestNode(z.x, z.z, z.y);
          if (node >= 0) {
            const nx = nav.nodeX(node), nz = nav.nodeZ(node);
            const back = dist2D(z.x, z.z, nx, nz);
            if (back > 0.05 && back < 2.5) {
              const k = Math.min(1, dt * 3.5);
              // Through the collision resolver, never straight onto x/z. The
              // nearest standable cell can be on the far side of a wall from a
              // body pressed against it, and a raw assignment would walk it
              // through the brick — trading a stuck enemy for one that phases
              // through geometry, which is a worse bug than the one being fixed.
              [z.x, z.z] = moveCircleWithColliders(
                z.x, z.z, (nx - z.x) * k, (nz - z.z) * k, NAV_RADIUS, this._colliders(z));
            }
          }
        }
        // 3. Last resort, and now genuinely last.
        //
        //    Gated on real distance, because most bodies that stop moving are not
        //    stuck at all: they are at the back of the crowd already pressed
        //    around a stationary player, and there is physically nowhere for them
        //    to go. Relocating one of those achieves nothing — it is already next
        //    to its target — while costing it its route and its footing. The
        //    failsafe exists so a ROUND can never stall, and a corpse two metres
        //    from the player is not stalling anything; the player just has to
        //    shoot it. Steps 1 and 2 still run at any distance, so a body genuinely
        //    wedged close in still frees itself.
        if (z.stuckT > 9 && directD > 5) this.respawnNear(z, target);
        break;
      }
      case ZSTATES.ATTACK: {
        const target = players.find((p) => p.id === z.targetId) || this.nearestPlayer(z, players).p;
        if (target) z.yaw = Math.atan2(target.x - z.x, target.z - z.z);
        if (!z.hitApplied && z.stateT > 0.38) {
          z.hitApplied = true;
          // no phantom hits through floors/catwalks — must actually be on their level
          if (target && !target.down && dist2D(z.x, z.z, target.x, target.z) < 1.9 && Math.abs((target.y || 0) - z.y) < 1.7) {
            this.cb.onPlayerDamaged?.(target.id, z.dog ? 45 : CFG.ZOMBIE_DMG, z.x, z.z, z);
          }
        }
        if (z.stateT > CFG.ZOMBIE_ATK_CD) { z.state = ZSTATES.CHASE; z.stateT = 0; z.retarget = 0; }
        break;
      }
      case ZSTATES.DIE: {
        z.deadT += dt;
        break;
      }
    }
  }
}
