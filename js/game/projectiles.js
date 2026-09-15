// Game's projectiles and throwables: rockets and ray gun bolts, the DG-2's
// chain lightning, frag grenades and monkey bombs.
// Methods of Game: js/game.js copies them onto Game.prototype.
import * as THREE from 'three';
import { CFG } from '../config.js';
import { lerp, dist2D } from '../utils.js';
import { audio } from '../audio.js';
import { buildMonkey } from '../weapons.js';
import { ZSTATES } from '../zombies.js';
import { chainArcTargetAllowed, floorArcTargetAllowed, explosionDamage, FRAG_BLAST } from '../combat-rules.js';

export class GameProjectiles {
  // ---------------- projectiles (rocket / raygun) ----------------
  spawnProjectile(origin, dir, s, w) {
    const proj = {
      x: origin.x, y: origin.y, z: origin.z,
      vx: dir.x * s.projSpeed, vy: dir.y * s.projSpeed, vz: dir.z * s.projSpeed,
      life: 4, s, w, mine: true,
    };
    this.projectiles.push(proj);
  }

  updateProjectiles(dt) {
    for (let projectileIndex = 0; projectileIndex < this.projectiles.length;) {
      const pr = this.projectiles[projectileIndex];
      const steps = 2;
      let hit = false;
      for (let i = 0; i < steps && !hit; i++) {
        const nx = pr.x + pr.vx * dt / steps, ny = pr.y + pr.vy * dt / steps, nz = pr.z + pr.vz * dt / steps;
        // wall check
        const wd = this.wallDist(
          this._projectileOrigin.set(pr.x, pr.y, pr.z),
          this._projectileDir.set(pr.vx, pr.vy, pr.vz).normalize(),
          0.6,
        );
        // zombie proximity
        let zHit = null;
        for (const [, z] of this.zombies.zombies) {
          if (z.state === ZSTATES.DIE) continue;
          const rr = z.dog ? 0.5 : 0.55;
          const cy = z.y + (z.dog ? 0.68 : z.crawler ? 0.35 : 1.0);
          if ((z.x - nx) ** 2 + (cy - ny) ** 2 + (z.z - nz) ** 2 < rr * rr) { zHit = z; break; }
        }
        if (zHit || wd < 0.5 || ny <= 0.03) {
          this.explodeProjectile(pr, nx, Math.max(0.05, ny), nz, zHit);
          hit = true;
        } else {
          pr.x = nx; pr.y = ny; pr.z = nz;
          if (pr.s.tracerColor) {
            this.fx.tracer(pr.x - pr.vx * 0.012, pr.y - pr.vy * 0.012, pr.z - pr.vz * 0.012, pr.x, pr.y, pr.z, pr.s.tracerColor);
          } else {
            this.fx.spawnParticles(pr.x, pr.y, pr.z, { count: 1, color: [0.6, 0.55, 0.5], speed: 0.2, life: 0.5, grav: -0.5, size: 1.6 });
          }
        }
      }
      pr.life -= dt;
      if (hit || pr.life <= 0) this.projectiles.splice(projectileIndex, 1);
      else projectileIndex++;
    }
  }

  explodeProjectile(pr, x, y, z, directZombie) {
    const s = pr.s;
    const splash = s.splash || { radius: 2, dmg: s.dmg * 0.5 };
    this.fx.explosion(x, y, z, splash.radius);
    audio.play('explosion', { pos: { x, y, z }, blastRadius: splash.radius });
    const ids = [];
    let anyHit = false, anyKill = false;
    for (const [, zb] of this.zombies.zombies) {
      if (zb.state === ZSTATES.DIE) continue;
      const d = Math.hypot(zb.x - x, zb.y + 1 - y, zb.z - z);
      if (zb === directZombie || d < splash.radius) {
        const dmg = zb === directZombie ? s.dmg : Math.round(lerp(splash.dmg, splash.dmg * 0.3, d / splash.radius));
        if (this.isAuthority) {
          const res = this.zombies.damage(zb.id, dmg, { head: false, by: this.player.id, explosive: true, weapon: s });
          if (res.ok) { anyHit = true; anyKill = anyKill || res.killed; this.awardPoints(CFG.POINTS_HIT, zb); if (res.killed) this.onKillConfirm(zb, false); }
        } else {
          ids.push([zb.id, dmg, this._newHitClaim()]);
          this.hitFX(zb, zb.x, zb.y + 1, zb.z, true);
          anyHit = true;
        }
      }
    }
    if (!this.isAuthority && ids.length) this.netSend({ t: 'zsplash', ids, wid: pr.w.id, pap: pr.w.pap, x, y, z });
    // hitmarker ONLY when the blast actually connected (was firing on every shot)
    if (anyHit && this.isAuthority) { this.hud.hitmarker(anyKill, false); audio.play(anyKill ? 'hitmarker_kill' : 'hitmarker'); }
    // self damage
    const pd = Math.hypot(this.player.x - x, this.player.y + 1 - y, this.player.z - z);
    if (pd < splash.radius * 0.9) this.player.damage(Math.round(lerp(70, 15, pd / splash.radius)), this);
  }

  // ---------------- DG2 chain lightning ----------------
  fireArc(muzzleWorld, s, w, shotDir = null) {
    const p = this.player;
    const origin = new THREE.Vector3(p.x, p.y + p.eyeHeight, p.z);
    const dir = shotDir || this.getAimDir(s);
    const wDist = this.wallDist(origin, dir, 60);
    const direct = this.zombieHitTest(origin, dir, wDist)[0];
    const floorImpact = direct ? null : this._dg2FloorImpact(origin, dir, 60);
    let firstZombie = direct?.z || null;
    if (!firstZombie && floorImpact) {
      let nearest = Infinity;
      for (const [, zombie] of this.zombies.zombies) {
        if (zombie.state === ZSTATES.DIE) continue;
        const target = this._arcTargetPoint(zombie);
        if (!floorArcTargetAllowed({
          impact: floorImpact, target,
          visible: this._arcHasLineOfSight(floorImpact, target),
        })) continue;
        const distance = dist2D(floorImpact.x, floorImpact.z, zombie.x, zombie.z);
        if (distance < nearest) { nearest = distance; firstZombie = zombie; }
      }
    }
    const chainPts = [{ x: muzzleWorld.x, y: muzzleWorld.y, z: muzzleWorld.z }];
    if (floorImpact && firstZombie) chainPts.push({ x: floorImpact.x, y: floorImpact.y + 0.06, z: floorImpact.z });
    if (firstZombie) {
      const chain = [firstZombie];
      let cur = firstZombie;
      for (let i = 1; i < (s.chain || 10); i++) {
        let best = null, bd = s.chainRadius || 8;
        for (const [, zb] of this.zombies.zombies) {
          if (zb.state === ZSTATES.DIE || chain.includes(zb)) continue;
          const d = dist2D(cur.x, cur.z, zb.x, zb.z);
          if (d >= bd) continue;
          const fromPoint = this._arcTargetPoint(cur);
          const target = this._arcTargetPoint(zb);
          if (!chainArcTargetAllowed({
            from: fromPoint, target, radius: s.chainRadius || 8,
            visible: this._arcHasLineOfSight(fromPoint, target),
          })) continue;
          bd = d; best = zb;
        }
        if (!best) break;
        chain.push(best);
        cur = best;
      }
      for (const zb of chain) {
        chainPts.push({ x: zb.x, y: zb.y + (zb.dog ? 0.78 : 1.1), z: zb.z });
        if (this.isAuthority) {
          const res = this.zombies.damage(zb.id, s.dmg, { head: false, by: p.id, weapon: s });
          if (res.ok) {
            this.awardPoints(CFG.POINTS_HIT, zb);
            if (res.killed) this.onKillConfirm(zb, false);
          }
        } else {
          this.netSend({ t: 'zhit', cid: this._newHitClaim(), z: zb.id, dmg: s.dmg, head: 0, wid: w.id, pap: w.pap });
        }
        this.fx.spawnParticles(zb.x, zb.y + 1, zb.z, { count: 8, color: [0.5, 0.75, 1], speed: 2, life: 0.4, size: 1.4 });
      }
      if (this.isAuthority) { this.hud.hitmarker(true, false); audio.play('hitmarker'); }
    } else {
      chainPts.push(floorImpact
        ? { x: floorImpact.x, y: floorImpact.y + 0.06, z: floorImpact.z }
        : { x: origin.x + dir.x * Math.min(wDist, 25), y: origin.y + dir.y * Math.min(wDist, 25), z: origin.z + dir.z * Math.min(wDist, 25) });
    }
    this.fx.lightning(chainPts);
    this.fx.shake(0.3);
  }

  // ---------------- grenades & monkey ----------------
  throwGrenade() {
    const p = this.player;
    if (p.grenades <= 0) { audio.play('deny'); return; }
    p.grenades--;
    p.grenadeCooldown = 0.7;
    this.hud.setGrenades(p.grenades, p.monkeys);
    this.throwEntity('frag');
  }

  throwMonkey() {
    const p = this.player;
    if (p.monkeys <= 0) { audio.play('deny'); return; }
    p.monkeys--;
    p.grenadeCooldown = 1.0;
    this.hud.setGrenades(p.grenades, p.monkeys);
    // wind up the monkey, then throw it
    this.weaponRig.monkeyWindup();
    audio.play('monkey_windup');
    setTimeout(() => { if (!this.disposed && !p.down) this.throwEntity('monkey'); }, 780);
  }

  throwEntity(kind) {
    const p = this.player;
    const dir = this.getAimDir({ spreadHip: 0, spreadAds: 0 });
    const e = {
      kind, x: p.x, y: p.y + p.eyeHeight - 0.1, z: p.z,
      vx: dir.x * 11, vy: dir.y * 11 + 3.2, vz: dir.z * 11,
      fuse: kind === 'frag' ? 3.6 : 8, mesh: null, by: p.id,
    };
    if (kind === 'frag') {
      e.mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8), new THREE.MeshStandardMaterial({ color: 0x4a3b22, roughness: 0.7 }));
    } else {
      e.mesh = buildMonkey();
      e.mesh.scale.setScalar(1.15);
      e.clashT = 0;
    }
    e.mesh.position.set(e.x, e.y, e.z);
    this.scene.add(e.mesh);
    this.grenades.push(e);
    audio.play('swap');
    if (kind === 'frag' && !this.isAuthority) this.netSend({ t: 'grenade', x: e.x, y: e.y, z: e.z });
    if (kind === 'monkey') this.netSend({ t: 'monkey', x: e.x, z: e.z, dur: e.fuse });
  }

  updateGrenades(dt) {
    for (let grenadeIndex = 0; grenadeIndex < this.grenades.length;) {
      const g = this.grenades[grenadeIndex];
      let grenadeRemoved = false;
      g.vy -= 12 * dt;
      let nx = g.x + g.vx * dt, ny = g.y + g.vy * dt, nz = g.z + g.vz * dt;
      if (ny < 0.08) { ny = 0.08; g.vy *= -0.42; g.vx *= 0.7; g.vz *= 0.7; }
      for (const c of this.map.colliders) {
        if (c.shootOk || (c.y0 || 0) > 1.2) continue;
        if (nx > c.minX - 0.08 && nx < c.maxX + 0.08 && nz > c.minZ - 0.08 && nz < c.maxZ + 0.08 && ny < (c.h || 3)) {
          // reflect on smallest axis
          const dxl = Math.abs(nx - (c.minX - 0.08)), dxr = Math.abs((c.maxX + 0.08) - nx);
          const dzl = Math.abs(nz - (c.minZ - 0.08)), dzr = Math.abs((c.maxZ + 0.08) - nz);
          const m = Math.min(dxl, dxr, dzl, dzr);
          if (m === dxl || m === dxr) { g.vx *= -0.5; nx = g.x; } else { g.vz *= -0.5; nz = g.z; }
        }
      }
      g.x = nx; g.y = ny; g.z = nz;
      g.mesh.position.set(nx, ny, nz);
      g.fuse -= dt;
      if (g.kind === 'monkey') {
        const landed = ny <= 0.1 && Math.abs(g.vy) < 0.6;
        if (!landed) {
          g.mesh.rotation.x += dt * 6; g.mesh.rotation.z += dt * 4;
        } else {
          // sit upright, bang the cymbals, wind-up key spins
          g.mesh.rotation.set(0, g.mesh.rotation.y + dt * 0.5, 0);
          g.clashT += dt * 7;
          const clash = Math.sin(g.clashT) * 0.55;
          g.mesh.userData.armL.rotation.z = -0.5 + clash;
          g.mesh.userData.armR.rotation.z = 0.5 - clash;
          g.mesh.userData.key.rotation.z += dt * 14;
          g.cymT = (g.cymT || 0) - dt;
          if (g.cymT <= 0) { g.cymT = 0.78; audio.play('monkey_cymbal', { pos: g }); }
        }
        if (Math.random() < dt * 8) this.fx.spawnParticles(g.x, g.y + 0.2, g.z, { count: 2, color: [1, 0.8, 0.3], speed: 1, life: 0.25, size: 0.8 });
      } else {
        g.mesh.rotation.x += dt * 6; g.mesh.rotation.z += dt * 4;
      }
      if (g.fuse <= 0) {
        this.scene.remove(g.mesh);
        this.grenades.splice(grenadeIndex, 1);
        grenadeRemoved = true;
        if (g.kind === 'monkey' && !this.isAuthority) continue; // host applies monkey damage
        const blast = g.kind === 'monkey'
          ? { radius: 4, maxDamage: 400, minDamage: 40 }
          : FRAG_BLAST;
        const radius = blast.radius;
        this.fx.explosion(g.x, g.y, g.z, radius);
        audio.play('explosion', { pos: g, blastRadius: radius });
        const ids = [];
        let localBlastHit = false, localBlastKill = false;
        for (const [, zb] of this.zombies.zombies) {
          if (zb.state === ZSTATES.DIE) continue;
          // Measure toward the lower torso rather than an arbitrary y=1 point;
          // this keeps a floor grenade effective while still respecting floors.
          const d = Math.hypot(zb.x - g.x, zb.y + (zb.dog ? 0.45 : 0.55) - g.y, zb.z - g.z);
          const dmg = explosionDamage(d, blast);
          if (dmg > 0) {
            if (this.isAuthority) {
              const res = this.zombies.damage(zb.id, dmg, { head: false, by: g.by, explosive: true, weapon: { headMult: 1 } });
              if (res.ok && g.by === this.player.id) {
                localBlastHit = true;
                localBlastKill = localBlastKill || res.killed;
                this.awardPoints(CFG.POINTS_HIT, zb);
                if (res.killed) this.onKillConfirm(zb, false);
              }
            } else ids.push([zb.id, dmg, this._newHitClaim()]);
          }
        }
        if (!this.isAuthority && ids.length) this.netSend({ t: 'zsplash', ids, gren: 1, x: g.x, y: g.y, z: g.z });
        if (localBlastHit) {
          this.hud.hitmarker(localBlastKill, false);
          audio.play(localBlastKill ? 'hitmarker_kill' : 'hitmarker');
        }
        const pd = Math.hypot(this.player.x - g.x, this.player.z - g.z);
        if (pd < radius * 0.8) this.player.damage(Math.round(lerp(75, 10, pd / radius)), this);
        if (g.kind === 'monkey' && this.isAuthority) this.netSend({ t: 'monkey_end' });
      }
      if (!grenadeRemoved) grenadeIndex++;
    }
  }

  updateMonkeyHost(dt) {
    // host: zombies target monkey entities
    const active = this.grenades.find((g) => g.kind === 'monkey');
    this.zombies.monkey = active ? { x: active.x, z: active.z, t: active.fuse, id: 'monkey' } : null;
  }
}
