// Game's co-op combat: guest hit claims judged by the host, hit and kill
// credits, relayed shots, and loadout swaps.
// Methods of Game: js/game.js copies them onto Game.prototype.
import * as THREE from 'three';
import { CFG } from '../config.js';
import { clamp, lerp, dist2D } from '../utils.js';
import { audio } from '../audio.js';
import { getStats, WEAPONS } from '../weapons.js';
import { ZSTATES, zombieAimPoint } from '../zombies.js';
import {
  acceptPendingCredit,
  boundedPelletDirectionAllowed,
  consumeCreditClaim,
  killCreditPresentation,
  remoteShotTargetAllowed,
  remoteSwapSource,
  remoteWeaponClaimAllowed,
} from '../multiplayer-contracts.js';
import {
  chainArcTargetAllowed,
  floorArcTargetAllowed,
  dogHitZones,
  explosionDamage,
  FRAG_BLAST,
  hitscanDamage,
  meleeDamage,
  penetrationProfile,
  rayHitZones,
  shotClaimBudget,
} from '../combat-rules.js';

// Scratch for the remote muzzle lookup, so a firefight allocates nothing.
const _shotMuzzle = new THREE.Vector3();
// Scratch for the host's claim target, likewise.
const _claimTarget = new THREE.Vector3();

export class GameRemoteCombat {
  _newHitClaim() {
    let cid = this._nextCreditId++;
    if (this._nextCreditId > 0x7fffffff) this._nextCreditId = 1;
    while (this._pendingHitClaims.has(cid)) {
      cid = this._nextCreditId++;
      if (this._nextCreditId > 0x7fffffff) this._nextCreditId = 1;
    }
    const now = performance.now();
    this._pendingHitClaims.set(cid, { at: now, hit: false, kill: false });
    for (const [id, claim] of this._pendingHitClaims) {
      if (now - claim.at > 8000 || this._pendingHitClaims.size > 512) this._pendingHitClaims.delete(id);
    }
    return cid;
  }

  _acceptLocalCredit(cid, kind) {
    return acceptPendingCredit(this._pendingHitClaims, cid, kind, performance.now());
  }

  _consumeRemoteCredit(from, cid) {
    let ledger = this._remoteCreditClaims.get(from);
    if (!ledger) { ledger = new Set(); this._remoteCreditClaims.set(from, ledger); }
    return consumeCreditClaim(ledger, cid);
  }

  _remoteActionReady(from, action, cooldownMs) {
    const key = `${from}:${action}`;
    const now = performance.now();
    const last = this._remoteActionAt.get(key) || 0;
    if (now - last < cooldownMs) return false;
    this._remoteActionAt.set(key, now);
    return true;
  }

  _remoteShotTargetAllowed(claim, zombie, head, claimedRay = null) {
    if (!claim || !zombie) return false;
    // Aim at the body this host has posed — the boxes the guest's own ray was
    // tested against — or a guest's headshot on a crawler, whose skull lies a
    // metre in front of its feet, is refused as a miss at close range.
    const target = zombieAimPoint(zombie, !!head, _claimTarget) || {
      x: zombie.x,
      y: zombie.y + (head ? (zombie.dog ? 1.02 : zombie.crawler ? 0.45 : 1.5) : (zombie.dog ? 0.72 : zombie.crawler ? 0.28 : 1.0)),
      z: zombie.z,
    };
    if (claim.s.fire === 'arc') {
      if (claim.accepted.includes(zombie)) return false;
      if (claim.accepted.length) {
        const previous = claim.accepted[claim.accepted.length - 1];
        const fromPoint = this._arcTargetPoint(previous);
        return chainArcTargetAllowed({
          from: fromPoint, target, radius: claim.s.chainRadius || 8,
          visible: this._arcHasLineOfSight(fromPoint, target),
        });
      }
      const directDelta = new THREE.Vector3(
        target.x - claim.origin.x, target.y - claim.origin.y, target.z - claim.origin.z,
      );
      const directDistance = directDelta.length();
      const directWall = directDistance ? this.wallDist(claim.origin, directDelta.normalize(), directDistance + 1.2) : 0;
      if (remoteShotTargetAllowed({
        origin: claim.origin, dir: claim.dir, target,
        baseSpread: Math.max(claim.s.spreadHip || 0, claim.s.spreadAds || 0, 0.01),
        wallDistance: directWall,
      })) return true;
      return floorArcTargetAllowed({
        impact: claim.floorImpact, target,
        visible: !!claim.floorImpact && this._arcHasLineOfSight(claim.floorImpact, target),
      });
    }
    let validationDir = claim.dir;
    if (claim.s.pellets) {
      if (!claimedRay || !boundedPelletDirectionAllowed(claim.dir, claimedRay,
        Math.max(claim.s.spreadHip || 0, claim.s.spreadAds || 0) + 0.035)) return false;
      validationDir = claimedRay;
    }
    if (zombie.dog) {
      // Validate against the same pose-aware anatomy as the guest rendered.
      // A small bounded allowance covers one snapshot/interpolation interval;
      // head claims still require the skull zone specifically.
      const hit = rayHitZones({
        origin: claim.origin,
        dir: validationDir,
        zones: dogHitZones(zombie, { interpolationAllowance: 0.16 }),
        maxDistance: 125,
        head: !!head,
      });
      if (!hit) return false;
      const wall = this.wallDist(claim.origin, validationDir, hit.distance + 0.5);
      return wall >= hit.distance - 0.25;
    }
    const vx = target.x - claim.origin.x, vy = target.y - claim.origin.y, vz = target.z - claim.origin.z;
    const distance = Math.hypot(vx, vy, vz);
    const wall = distance
      ? this.wallDist(claim.origin, new THREE.Vector3(vx, vy, vz).normalize(), distance + 1.2)
      : 0;
    return remoteShotTargetAllowed({
      origin: claim.origin,
      dir: validationDir,
      target,
      baseSpread: Math.max(claim.s.spreadHip || 0, claim.s.spreadAds || 0, 0.01),
      pellet: !!claim.s.pellets,
      wallDistance: wall,
    });
  }

  _combatEvent(msg, from) {
    const p = this.player;
    switch (msg.t) {
      case 'shoot': {
        if (!WEAPONS[msg.w]) break;
        if (![msg.x, msg.y, msg.z, msg.dx, msg.dy, msg.dz]
          .every((n) => Number.isFinite(n) && Math.abs(n) <= 500)) break;
        // WHO FIRED. On the host `from` is the sender's peer id and that is the
        // shooter. On a guest every reliable message arrives labelled 'host',
        // so `from` identifies the relay and not the shooter — which is why a
        // guest used to see no muzzle flash at all, from anybody. The host
        // stamps `pid` (its own id on its own shots, the sender's id on a
        // relay) and that is the field both sides resolve.
        const shooterId = msg.pid || from;
        if (shooterId === p.id) break;               // our own shot, relayed back
        const rp = this.remotePlayers.get(shooterId);
        if (!rp || Math.hypot(msg.x - rp.x, msg.y - (rp.y + 1.5), msg.z - rp.z) > 4) break;
        if (!remoteWeaponClaimAllowed(rp, msg.w, msg.pap)) break;
        const s = getStats(msg.w, !!msg.pap);
        if (!this._remoteActionReady(shooterId, 'shoot', Math.max(30, (60000 / Math.max(1, s.rpm)) * 0.72))) break;
        const dir = new THREE.Vector3(msg.dx, msg.dy, msg.dz);
        if (dir.lengthSq() < 0.5) break;
        dir.normalize();
        const origin = new THREE.Vector3(msg.x, msg.y, msg.z);
        // Damage arbitration is the authority's job alone. A guest running it
        // would build claim ledgers nobody ever redeems.
        if (this.isAuthority) {
          const now = performance.now();
          let remoteClaims = this._remoteShots.get(shooterId);
          if (!remoteClaims) { remoteClaims = []; this._remoteShots.set(shooterId, remoteClaims); }
          for (let i = remoteClaims.length - 1; i >= 0; i--) {
            if (now - remoteClaims[i].at >= 5000) remoteClaims.splice(i, 1);
          }
          remoteClaims.push({
            at: now, origin, dir, s,
            wid: msg.w, pap: !!msg.pap,
            remaining: s.fire === 'arc' ? (s.chain || 10) : s.fire === 'hitscan' ? shotClaimBudget(s) : 32,
            accepted: [], usedSplash: false,
            floorImpact: s.fire === 'arc'
              ? this._dg2FloorImpact(origin, dir, 60)
              : null,
          });
          while (remoteClaims.length > 8) remoteClaims.shift();
        }
        // Everything below is cosmetic and runs identically on host and guest.
        // Fire it from the barrel of the weapon he is actually holding rather
        // than from half a metre in front of his chest — on a PTRS-41 or a
        // Panzerschreck that guess was most of a metre short of the muzzle.
        const flash = rp.muzzleWorld(_shotMuzzle);
        const ox = flash ? flash.x : msg.x + msg.dx * 0.5;
        const oy = flash ? flash.y : msg.y + msg.dy * 0.5;
        const oz = flash ? flash.z : msg.z + msg.dz * 0.5;
        audio.play(s.sfx || 'shot_rifle', { pos: { x: msg.x, y: msg.y, z: msg.z } });
        this.fx.muzzleFlash(ox, oy, oz, dir.x, dir.y, dir.z);
        if (s.fire === 'hitscan') {
          const wd = this.wallDist(origin, dir, 120);
          const hits = this.zombieHitTest(origin, dir, wd);
          const maxTargets = penetrationProfile(s).maxTargets;
          const endD = hits.length ? hits[Math.min(hits.length, maxTargets) - 1].dist : wd;
          this.fx.tracer(ox, oy, oz,
            msg.x + dir.x * endD, msg.y + dir.y * endD, msg.z + dir.z * endD);
        }
        break;
      }
      case 'grenade': {
        if (!this.isAuthority || !this._remoteNear(from, msg, 4) || !this._remoteActionReady(from, 'grenade', 600)) break;
        this._remoteGrenades.set(from, { at: performance.now(), x: msg.x, y: msg.y, z: msg.z, used: false });
        break;
      }
      case 'zhit': {
        if (!this.isAuthority) break;
        if (!this._consumeRemoteCredit(from, msg.cid)) break;
        const zombie = this.zombies.zombies.get(msg.z);
        if (!zombie || zombie.state === ZSTATES.DIE) break;
        let s = null, damage = 0, head = false;
        if (msg.knife) {
          const rp = this.remotePlayers.get(from);
          if (!rp || dist2D(rp.x, rp.z, zombie.x, zombie.z) > 2.8 || !this._remoteActionReady(from, 'knife', 380)) break;
          damage = meleeDamage(rp.bowie);
        } else {
          let claimedRay = null;
          if (Array.isArray(msg.ray) && msg.ray.length === 3 && msg.ray.every(Number.isFinite)) {
            claimedRay = new THREE.Vector3(msg.ray[0], msg.ray[1], msg.ray[2]);
            if (claimedRay.lengthSq() < 0.5 || claimedRay.lengthSq() > 1.7) break;
            claimedRay.normalize();
          }
          const claims = this._remoteShots.get(from) || [];
          const claimNow = performance.now();
          let claim = null;
          for (let i = claims.length - 1; i >= 0; i--) {
            const candidate = claims[i];
            if (claimNow - candidate.at <= 650 && candidate.wid === msg.wid
              && candidate.pap === !!msg.pap && candidate.remaining > 0
              && (candidate.s.pellets || !candidate.accepted.includes(zombie))
              && candidate.s.fire !== 'projectile'
              && this._remoteShotTargetAllowed(candidate, zombie, !!msg.head, claimedRay)) {
              claim = candidate;
              break;
            }
          }
          if (!claim) break;
          const penetrationIndex = claim.s.fire === 'hitscan' && !claim.s.pellets ? claim.accepted.length : 0;
          const distance = Math.hypot(
            zombie.x - claim.origin.x,
            zombie.y + 1 - claim.origin.y,
            zombie.z - claim.origin.z,
          );
          claim.remaining--;
          claim.accepted.push(zombie);
          s = claim.s;
          damage = s.fire === 'hitscan'
            ? hitscanDamage(s, distance, penetrationIndex)
            : Number(s.dmg) || 0;
          head = !!msg.head;
        }
        if (damage <= 0) break;
        const res = this.zombies.damage(msg.z, damage, { head, by: from, explosive: false, weapon: msg.knife ? { headMult: 1 } : s });
        if (res.ok) {
          this.netSend({
            t: 'hitcredit', pid: from, cid: msg.cid, head, killed: !!res.killed,
            x: zombie.x, y: zombie.y, z: zombie.z,
          });
          if (res.killed) {
            this.netSend({
              t: 'killcredit', pid: from, cid: msg.cid, head, knife: !!msg.knife,
              x: zombie.x, y: zombie.y, z: zombie.z,
            });
          }
        }
        break;
      }
      case 'zsplash': {
        if (!this.isAuthority) break;
        if (!Array.isArray(msg.ids) || msg.ids.length > 32 || [msg.x, msg.y, msg.z].some((n) => !Number.isFinite(n))) break;
        const now = performance.now();
        const grenade = msg.gren ? this._remoteGrenades.get(from) : null;
        const claim = msg.gren ? null : (this._remoteShots.get(from) || []).find((candidate) => {
          if (candidate.s.fire !== 'projectile' || candidate.wid !== msg.wid || candidate.pap !== !!msg.pap || candidate.usedSplash) return false;
          const elapsed = (now - candidate.at) / 1000;
          return elapsed >= 0 && elapsed <= 4.6
            && Math.hypot(msg.x - candidate.origin.x, msg.y - candidate.origin.y, msg.z - candidate.origin.z)
              <= candidate.s.projSpeed * elapsed + 6;
        });
        let radius = 0, directDamage = 0, splashDamage = 0;
        if (grenade) {
          const elapsed = now - grenade.at;
          if (elapsed < 2400 || elapsed > 6500 || grenade.used || Math.hypot(msg.x - grenade.x, msg.y - grenade.y, msg.z - grenade.z) > 60) break;
          grenade.used = true;
          radius = FRAG_BLAST.radius;
          directDamage = FRAG_BLAST.maxDamage;
          splashDamage = FRAG_BLAST.maxDamage;
        } else {
          if (!claim || claim.s.fire !== 'projectile' || claim.wid !== msg.wid || claim.pap !== !!msg.pap || claim.usedSplash) break;
          const elapsed = (now - claim.at) / 1000;
          if (elapsed < 0 || elapsed > 4.6) break;
          claim.usedSplash = true;
          radius = claim.s.splash?.radius || 2;
          directDamage = Number(claim.s.dmg) || 0;
          splashDamage = Number(claim.s.splash?.dmg) || directDamage * 0.5;
        }
        for (const hit of msg.ids) {
          if (!Array.isArray(hit) || hit.length !== 3) continue;
          const [zid, , cid] = hit;
          if (!this._consumeRemoteCredit(from, cid)) continue;
          const zombie = this.zombies.zombies.get(zid);
          if (!zombie || zombie.state === ZSTATES.DIE) continue;
          const distance = Math.hypot(
            zombie.x - msg.x,
            zombie.y + (zombie.dog ? 0.45 : 0.55) - msg.y,
            zombie.z - msg.z,
          );
          if (distance > radius + 0.8) continue;
          const dmg = msg.gren
            ? explosionDamage(distance, FRAG_BLAST)
            : distance < 0.8
              ? directDamage
              : Math.round(lerp(splashDamage, splashDamage * 0.3, clamp(distance / radius, 0, 1)));
          if (dmg <= 0) continue;
          const res = this.zombies.damage(zid, dmg, { head: false, by: from, explosive: true, weapon: { headMult: 1 } });
          if (res.ok) {
            this.netSend({
              t: 'hitcredit', pid: from, cid, head: false, killed: !!res.killed,
              x: zombie.x, y: zombie.y, z: zombie.z,
            });
            if (res.killed) {
              this.netSend({
                t: 'killcredit', pid: from, cid, head: false,
                x: zombie.x, y: zombie.y, z: zombie.z,
              });
            }
          }
        }
        break;
      }
      case 'hitcredit': {
        if (msg.pid !== p.id || !this._acceptLocalCredit(msg.cid, 'hit')) break;
        this.awardPoints(CFG.POINTS_HIT);
        const pos = [msg.x, msg.y, msg.z].every(Number.isFinite)
          ? { x: msg.x, y: msg.y, z: msg.z }
          : { x: p.x, y: p.y, z: p.z };
        if (!msg.killed) {
          this.hud.hitmarker(false, !!msg.head);
          audio.play('hitmarker');
          if (msg.head) audio.play('headshot', { pos });
        }
        break;
      }
      case 'killcredit': {
        if (msg.pid === p.id && this._acceptLocalCredit(msg.cid, 'kill')) {
          const reward = killCreditPresentation({
            head: !!msg.head,
            knife: !!msg.knife,
            doubleActive: this.doubleT > 0,
          });
          p.kills++;
          if (msg.head) p.headshots++;
          this.awardPoints(reward.basePoints);
          this.hud.hitmarker(true, msg.head);
          audio.play('hitmarker_kill');
          const pos = [msg.x, msg.y, msg.z].every(Number.isFinite)
            ? { x: msg.x, y: msg.y, z: msg.z }
            : { x: p.x, y: p.y, z: p.z };
          if (msg.head) audio.play('headshot', { pos });
          this.fx.popup(pos.x, pos.y + 1.6, pos.z, `+${reward.displayedPoints}`, reward.color);
        }
        break;
      }
      case 'zkill': {
        // visual only (authority already handled locally)
        if (!this.isAuthority) {
          if (msg.dog) {
            this.fx.explosion(msg.x, msg.y + 0.4, msg.zz, 1.5);
            audio.play('dog_death', { pos: { x: msg.x, y: msg.y, z: msg.zz }, vol: 0.9 });
            audio.play('explosion', { pos: { x: msg.x, y: msg.y, z: msg.zz } });
          } else {
            audio.play('zombie_hit', { pos: { x: msg.x, y: msg.y, z: msg.zz } });
            this.fx.blood(msg.x, msg.y + (msg.head ? 1.5 : 1), msg.zz, true);
          }
        }
        break;
      }
      case 'monkey': {
        if (!this.isAuthority) this.zombies.monkey = null; // host owns monkey logic
        break;
      }
      case 'swap': {
        if (!this.isAuthority || !WEAPONS[msg.w]) break;
        const remote = this.remotePlayers.get(from);
        if (!remote) break;
        const wallbuy = this.map.wallbuys.find((wb) => wb.weapon === msg.w && this._remoteNearVisible(from, wb.pos, 3));
        const source = remoteSwapSource({
          weaponId: msg.w,
          claimedPap: msg.pap,
          ownedWeapons: remote.ownedWeapons,
          spawnWeaponAllowance: remote.spawnWeaponAllowance,
          nearMatchingWallbuy: !!wallbuy,
          readyBoxWeapon: this.boxState.state === 'ready' && this._remoteNearVisible(from, this.map.box.pos, 3)
            ? this.boxState.weapon : null,
        });
        if (source === 'owned') {
          // PaP is read from host-owned inventory, never from msg.pap.
          remote.equipAuthorizedWeapon(msg.w);
          break;
        }
        const spawnPap = remote.spawnWeaponAllowance?.get(msg.w);
        if (source === 'spawn') {
          remote.authorizeWeapon(msg.w, spawnPap, false);
          break;
        }
        if (source === 'wallbuy') {
          remote.authorizeWeapon(msg.w, false, true);
          break;
        }
        if (source === 'box') {
          remote.authorizeWeapon(msg.w, false, true);
        }
        break;
      }
    }
  }
}
