// Game's local combat: firing, reloading, switching weapons, melee, hitscan
// damage, kills and points.
// Methods of Game: js/game.js copies them onto Game.prototype.
import * as THREE from 'three';
import { CFG } from '../config.js';
import { lerp, rand, choice } from '../utils.js';
import { input } from '../input.js';
import { audio } from '../audio.js';
import { assets } from '../assets.js';
import { getStats } from '../weapons.js';
import { killCreditPresentation } from '../multiplayer-contracts.js';
import { hitscanDamage, meleeDamage, penetrationProfile, shouldSpawnDogRoundReward } from '../combat-rules.js';
import { dropId } from './rounds.js';

// How much of a shot's view disturbance a full cheek weld takes off. Vertical
// climb is the half of recoil the player reads and answers, so it is trimmed
// rather than removed — an aimed burst still has to be walked down. The lateral
// half has no direction to read: it flips sign every round, and under a
// narrowed ADS field it is indistinguishable from the screen shaking. See the
// note in fireWeapon(), and ADS_KICK_* in weapons.js for the viewmodel's half
// of the same bargain.
const ADS_RECOIL_CLIMB = 0.4;
const ADS_RECOIL_SCATTER = 0.85;

export class GameCombat {
  // ================= combat input =================
  handleCombatInput(dt) {
    const p = this.player;
    const s = p.stats;
    if (!s) return;
    if (this.localPerkDrink) {
      this._mouseClicked = false;
      this._burstLeft = 0;
      return;
    }
    // fire
    const wantFire = s.auto ? input.mouseDown : input.pressed && this._mouseClicked;
    if (input.mouseDown && !this._wasMouseDown) this._mouseClicked = true;
    this._wasMouseDown = input.mouseDown;
    const firePressed = s.auto ? input.mouseDown : this._mouseClicked;
    if (firePressed && p.canFire(this)) {
      this.fireWeapon();
      // burst weapons: schedule the rest of the burst
      if (s.burst && p.weapon.mag > 0) {
        this._burstLeft = s.burst - 1;
        this._burstT = 60 / s.rpm;
      }
    }
    if (this._burstLeft > 0) {
      this._burstT -= dt;
      if (this._burstT <= 0 && p.canFire(this) && p.weapon.mag > 0) {
        this.fireWeapon();
        this._burstLeft--;
        this._burstT = 60 / s.rpm;
        if (p.weapon.mag <= 0) this._burstLeft = 0;
      }
      if (this._burstT < -0.5) this._burstLeft = 0;
    }
    this._mouseClicked = false;
    // auto-reload the moment the mag runs dry (if there's reserve to draw from)
    // Reloading is allowed while down — the down pistol carries the spawn
    // reserve, and eight rounds with no way to top up would be a formality.
    if (p.weapon.mag === 0 && p.weapon.reserve > 0 && !this.weaponRig.isReloading && !p.dead) this.startReload();
    // reload
    if (input.pressed['KeyR'] && !this.weaponRig.isReloading && p.weapon.mag < s.mag && p.weapon.reserve > 0 && !p.dead) {
      this.startReload();
    }
    // weapon switch — never while down; goDown() leaves exactly one slot, and
    // this guard keeps that true if a stash ever restores early.
    if ((input.pressed['Digit1'] || input.pressed['Digit2']) && p.weapons.length > 1 && !p.down) {
      const idx = input.pressed['Digit1'] ? 0 : 1;
      if (idx !== p.cur) this.switchWeapon(idx);
    }
    if (input.pressed['KeyQ'] && p.weapons.length > 1 && !p.down) this.switchWeapon(1 - p.cur);
    // melee
    if (input.pressed['KeyV'] && p.meleeCooldown <= 0 && !p.down) this.melee();
    // inspect weapon (I) — per-class handling foley
    if (input.pressed['KeyI'] && !this.weaponRig.isReloading && this.weaponRig.inspectT <= 0 && !p.down && !p.dead) {
      this.weaponRig.startInspect();
      const cls = p.stats?.cls;
      if (cls && cls !== 'melee' && cls !== 'tactical') audio.play(`inspect_${cls}`);
    }
    // grenade (G) / monkey bomb (X) — separate throws, you can hold both
    if (input.pressed['KeyG'] && p.grenadeCooldown <= 0 && !p.down) this.throwGrenade();
    if (input.pressed['KeyX'] && p.grenadeCooldown <= 0 && !p.down) this.throwMonkey();
    // flashlight toggle (T)
    if (input.pressed['KeyT'] && !p.down && !p.dead) {
      this.flashlight.intensity = this.flashlight.intensity > 0 ? 0 : 26;
      audio.play('ui');
    }
  }

  switchWeapon(idx) {
    const p = this.player;
    if (!p.weapons[idx] || this.weaponRig.knuckleT > 0) return;
    if (p.weapons[idx].upgrading) { audio.play('deny'); return; } // it's inside the Pack-a-Punch
    // Cancel every delayed reload stage/completion owned by the old slot.
    this._reloadToken = (this._reloadToken || 0) + 1;
    p.cur = idx;
    p.switchCooldown = 0.4;
    this.weaponRig.papHide = false;
    this.weaponRig.swapTo(p.weapon.id, p.weapon.pap);
    if (p.weapon.gold && !p.weapon.pap) this.weaponRig.applyGoldCamo(true);
    audio.play('swap');
    this.netSend({ t: 'swap', w: p.weapon.id, pap: !!p.weapon.pap });
  }

  startReload() {
    const p = this.player, s = p.stats;
    const weapon = p.weapon;
    const token = this._reloadToken = (this._reloadToken || 0) + 1;
    const dur = s.reload * p.reloadMult;
    this.weaponRig.startReload(dur);
    this.bark('reload', { chance: 0.12 });
    // per-gun staged reload foley — each stage synced to the rig's sub-animation
    for (const [st, name] of (s.reloadStages || [[0.1, 'rel_magin']])) {
      setTimeout(() => {
        if (this.disposed || p.down || p.dead || token !== this._reloadToken
            || p.weapon !== weapon || !this.weaponRig.isReloading) return;
        audio.play(name, { rate: s.relRate || 1 });
      }, st * dur * 1000);
    }
    setTimeout(() => {
      if (this.disposed || p.down || p.dead || token !== this._reloadToken || p.weapon !== weapon) return;
      const cap = getStats(weapon.id, weapon.pap).mag;
      const need = Math.max(0, cap - weapon.mag);
      const take = Math.min(need, weapon.reserve);
      weapon.mag += take;
      weapon.reserve -= take;
    }, dur * 1000 - 120);
  }

  fireWeapon() {
    const p = this.player, s = p.stats;
    const w = p.weapon;
    if (this.weaponRig.knuckleT > 0 || this.weaponRig.papHide) return; // hands busy (PaP ritual)
    if (w.mag <= 0) {
      audio.play('dry');
      if (w.reserve > 0 && !this.weaponRig.isReloading) this.startReload();
      p.fireCooldown = 0.25;
      return;
    }
    w.mag--;
    // Lets the audio engine give the last round in a magazine its own
    // treatment (pitched down, with the bright bolt-lock ping).
    audio.setAmmoState(w.mag, s.mag);
    p.fireCooldown = 60 / (s.rpm * p.rpmMult);
    // recoil & bloom
    //
    // Aiming buys recoil discipline, and it buys it unevenly on purpose. What a
    // shouldered weapon gives you is not less kick so much as more READABLE
    // kick: the muzzle still climbs, so a burst still has to be walked back
    // down, but the part of recoil that has no direction — the sideways scatter
    // that flips sign every round — is what a cheek weld actually removes.
    // Leaving it in was why aimed automatic fire read as the screen convulsing
    // instead of as the gun climbing, and it got worse the tighter the zoom,
    // since a narrower field magnifies every one of those degrees.
    const aim = p.adsT;
    const climb = 1 - aim * ADS_RECOIL_CLIMB;    // vertical: trimmed
    const scatter = 1 - aim * ADS_RECOIL_SCATTER; // lateral: nearly gone
    p.recoilPitch += s.kick * rand(0.8, 1.2) * climb; // recoil climbs UP, damps back
    p.yaw += rand(-0.3, 0.3) * s.kick * 0.5 * scatter;
    p.spreadBloom = Math.min(0.03, p.spreadBloom + (s.bloomKick ?? s.kick) * 0.35);
    // Visual kick is a separate spring from the aim recoil above: it snaps the
    // whole view and settles back, so the sight picture jolts on every round
    // without permanently moving where the player is actually aiming.
    const heavy = s.cls === 'shotgun' || s.cls === 'sniper' || s.cls === 'launcher';
    const kickScale = (heavy ? 2.2 : 1) * climb;
    const lateralScale = (heavy ? 2.2 : 1) * scatter;
    this.cameraRig?.addRecoil(
      s.kick * 26 * kickScale * rand(0.85, 1.2),
      rand(-1, 1) * s.kick * 16 * lateralScale,
      rand(-1, 1) * s.kick * 22 * lateralScale,
    );
    this.weaponRig.fire();
    // Muzzle trauma is suppressed while down so it cannot pile up during a
    // crawl and discharge into the camera the frame you are revived.
    //
    // Trauma is noise, not motion — three detuned sines per axis, sampled at
    // 30Hz, which is above the frame rate and therefore aliases. That reads as
    // grit behind a hip-fired burst and as flicker behind an aimed one, so
    // aiming takes most of it off.
    if (!p.down) this.fx.shake((heavy ? 0.22 : 0.08) * scatter);
    // A frame of extra exposure sells the flash lighting up the room.
    this._postFlash = Math.min(3, (this._postFlash || 0) + (heavy ? 0.16 : 0.07));
    // PaP weapons sound upgraded: pap-variant file if present, else base (slower) + energy zap layer
    if (w.pap) {
      const papSfx = s.sfx + '_pap';
      if (assets.sound(papSfx)) {
        audio.play(papSfx, { pos: { x: p.x, y: p.y + 1.5, z: p.z } });
      } else {
        audio.play(s.sfx, { pos: { x: p.x, y: p.y + 1.5, z: p.z }, rate: 0.9 });
        audio.play('pap_zap', { pos: { x: p.x, y: p.y + 1.5, z: p.z }, vol: 0.5 });
      }
    } else {
      audio.play(s.sfx, { pos: { x: p.x, y: p.y + 1.5, z: p.z } });
    }
    const mw = this.weaponRig.muzzleWorld;
    {
      // Point the flash down the barrel so gas and powder throw forward.
      const fwdX = -Math.sin(p.yaw) * Math.cos(p.pitch);
      const fwdY = Math.sin(p.pitch);
      const fwdZ = -Math.cos(p.yaw) * Math.cos(p.pitch);
      const scale = s.cls === 'shotgun' || s.cls === 'launcher' ? 1.7
        : s.cls === 'sniper' || s.cls === 'lmg' ? 1.3
        : s.cls === 'pistol' ? 0.8 : 1;
      this.fx.muzzleFlash(mw.x, mw.y, mw.z, fwdX, fwdY, fwdZ, scale);
    }
    if (s.cls !== 'wonder') this.fx.shell(mw.x, mw.y, mw.z, Math.cos(p.yaw), -Math.sin(p.yaw));
    // bolt-action rifles: work the bolt between shots (unique foley per rifle)
    if (s.bolt) {
      setTimeout(() => { if (!this.disposed && !p.down) audio.play(`bolt_${w.id}_out`); }, 190);
      setTimeout(() => { if (!this.disposed && !p.down) audio.play(`bolt_${w.id}_in`); }, 500);
    }

    const dir = this.getAimDir(s);
    const origin = new THREE.Vector3(p.x, p.y + p.eyeHeight, p.z);
    // `pid` names the shooter. The host stamps guests' relays with the
    // sender's id; it has to stamp its own here, because a guest receiving a
    // reliable message only ever learns that it came from 'host'.
    this.netSend({ t: 'shoot', pid: p.id, x: p.x, y: p.y + 1.5, z: p.z, dx: dir.x, dy: dir.y, dz: dir.z, w: w.id, pap: w.pap, sfx: s.sfx });

    if (s.fire === 'hitscan') {
      const pellets = s.pellets || 1;
      for (let i = 0; i < pellets; i++) {
        const d = pellets > 1 ? this.getAimDir(s, true) : dir;
        this.hitscan(origin, d, s, w, mw);
      }
    } else if (s.fire === 'projectile') {
      this.spawnProjectile(mw, dir, s, w);
    } else if (s.fire === 'arc') {
      // Reuse the exact direction sent to the host. Rolling spread again here
      // made valid guest DG-2 hits disagree with host validation.
      this.fireArc(mw, s, w, dir);
    }
    if (w.mag === 0 && w.reserve > 0) setTimeout(() => { if (!this.weaponRig.isReloading && !this.disposed) this.startReload(); }, 220);
  }

  getAimDir(s, pellet = false) {
    const p = this.player;
    const spread = lerp(s.spreadHip + p.spreadBloom, s.spreadAds, p.adsT) * (pellet ? 1 : (p.sprinting ? 1.7 : 1));
    this._aimEuler.set(
      p.pitch + rand(-spread, spread),
      p.yaw + rand(-spread, spread), 0, 'YXZ',
    );
    return this._aimDir.set(0, 0, -1).applyEuler(this._aimEuler);
  }

  hitscan(origin, dir, s, w, muzzleWorld) {
    const maxDist = 120;
    const wDist = this.wallDist(origin, dir, maxDist);
    const hits = this.zombieHitTest(origin, dir, wDist);
    const pen = penetrationProfile(s).maxTargets;
    const endDist = hits.length ? hits[Math.min(hits.length, pen) - 1].dist : wDist;
    this.fx.tracer(muzzleWorld.x, muzzleWorld.y, muzzleWorld.z,
      origin.x + dir.x * Math.min(endDist, wDist), origin.y + dir.y * Math.min(endDist, wDist), origin.z + dir.z * Math.min(endDist, wDist));
    let anyHit = false;
    for (let i = 0; i < Math.min(hits.length, pen); i++) {
      const { z, dist, head } = hits[i];
      const dmg = hitscanDamage(s, dist, i);
      anyHit = true;
      // Bleed where the round went in, not at a fixed height over the feet —
      // that put a crawler's headshot spray a metre and a half in the air.
      const hx = origin.x + dir.x * dist;
      const hy = origin.y + dir.y * dist;
      const hz = origin.z + dir.z * dist;
      this.hitFX(z, hx, hy, hz, head);
      this.applyZombieDamage(z, dmg, head, w, s, false, dir);
    }
    if (!anyHit && wDist < maxDist) {
      const h = this.wallHit(origin, dir, maxDist);
      const ix = origin.x + dir.x * h.dist, iy = origin.y + dir.y * h.dist, iz = origin.z + dir.z * h.dist;
      this.fx.impact(ix, iy, iz, h.nx, h.ny, h.nz, h.surface);
      audio.bulletImpact({ x: ix, y: iy, z: iz }, h.surface);
    }
  }

  /**
   * Impact feedback on a hit. Hounds burn rather than bleed — they get embers
   * and ash, never a spray or a pool, so nothing of them is left on the floor.
   */
  hitFX(z, x, y, zz, big) {
    if (z.dog) this.houndFX?.houndHit(x, y, zz, big);
    else this.fx.blood(x, y, zz, big);
  }

  applyZombieDamage(z, dmg, head, w, s, explosive, claimDir = null) {
    if (this.isAuthority) {
      const res = this.zombies.damage(z.id, dmg, { head, by: this.player.id, explosive, weapon: s });
      if (res.ok) {
        this.awardPoints(CFG.POINTS_HIT, z);
        this.hud.hitmarker(res.killed, head);
        audio.play(res.killed ? 'hitmarker_kill' : 'hitmarker');
        if (head && !res.killed) audio.play('headshot', { pos: z });
        if (res.killed) this.onKillConfirm(z, head);
      }
    } else {
      // Blood/tracers remain responsive, but scoring and hit-confirm feedback
      // arrive only after the host accepts this single-use claim.
      const cid = this._newHitClaim();
      this.netSend({
        t: 'zhit', cid, z: z.id, dmg, head, wid: w.id, pap: w.pap,
        exp: explosive ? 1 : 0,
        ray: claimDir ? [claimDir.x, claimDir.y, claimDir.z] : undefined,
      });
    }
  }

  onKillConfirm(z, head, knife = false) {
    const p = this.player;
    p.kills++; this.bark('kill', { chance: 0.07 });
    if (head) p.headshots++;
    const reward = killCreditPresentation({ head, knife, doubleActive: this.doubleT > 0 });
    this.awardPoints(reward.basePoints, z);
    this.fx.popup(z.x, z.y + 1.6, z.z, `+${reward.displayedPoints}`, reward.color);
  }

  onZombieKilled(z, info) {
    // authority side: death audio/fx + drops + broadcast
    if (z.dog) {
      // hellhounds go out with a yelp + a fireball — never a zombie death moan
      audio.play('dog_death', { pos: z, vol: 0.9 });
      this.houndFX?.houndDeath(z.x, z.y, z.z);
      audio.play('explosion', { pos: z, vol: 0.7 });
    } else {
      audio.play('zdeath', { pos: z, vol: 0.5 });
      const hy = z.y + (info.head ? 1.5 : 1);
      this.fx.blood(z.x, hy, z.z, true);
      // A kill should have direction and weight: spray carries along the shot,
      // a headshot pops rather than seeps, and the body kicks dust off the
      // floor as it goes down.
      const dir = info.dir || this._aimDir;
      if (info.head) {
        audio.play('headshot', { pos: z });
        this.fx.impact(z.x, hy, z.z, -(dir?.x || 0), 0.55, -(dir?.z || 0), 'concrete');
        this.fx.blood(z.x + rand(-0.2, 0.2), hy + 0.1, z.z + rand(-0.2, 0.2), true);
        this.fx.shake(0.09);
      }
      this.fx.spawnParticles(z.x, z.y + 0.06, z.z, {
        count: 9, color: [0.34, 0.30, 0.24], speed: 1.3, spread: 1,
        life: 0.9, grav: 1.2, size: 2.4, up: 0.35, additive: false,
      });
    }
    const dogReward = this._dogRoundReward;
    if (this.isAuthority && dogReward?.round === this.round && shouldSpawnDogRoundReward({
      dogRound: this.zombies.dogRound,
      victimDog: z.dog,
      remaining: this.zombies.dogRemaining,
      alreadySpawned: dogReward.spawned,
    })) {
      // Mark first so duplicate callbacks or simultaneous final-hit processing
      // cannot produce a second guaranteed drop.
      dogReward.spawned = true;
      const drop = this.fx.spawnDrop('maxammo', z.x, z.z);
      this.netSend({ t: 'drop', type: 'maxammo', x: z.x, z: z.z, id: dropId(drop) });
    }
    if (this.net) this.netSend({ t: 'zkill', z: z.id, by: info.by, head: info.head, x: z.x, y: z.y, zz: z.z, dog: z.dog ? 1 : 0 });
    // drops
    if (this.isAuthority && !z.dog && Math.random() < 0.032 && this.round >= 2) {
      const type = choice(['maxammo', 'maxammo', 'insta', 'double', 'double', 'nuke']);
      const drop = this.fx.spawnDrop(type, z.x, z.z);
      this.netSend({ t: 'drop', type, x: z.x, z: z.z, id: dropId(drop) });
    }
  }

  awardPoints(n, atPos = null) {
    const p = this.player;
    const gained = p.addPoints(n, this.doubleT > 0);
    this.hud.setPoints(p.points, true);
  }

  // ---------------- melee ----------------
  melee() {
    const p = this.player;
    p.meleeCooldown = 0.45;
    this.weaponRig.meleeT = 1;
    audio.play('melee');
    setTimeout(() => {
      if (this.disposed || p.down) return;
      const dir = this.getAimDir({ spreadHip: 0, spreadAds: 0 });
      const origin = new THREE.Vector3(p.x, p.y + p.eyeHeight, p.z);
      const hits = this.zombieHitTest(origin, dir, 2.0);
      if (hits.length) {
        const { z } = hits[0];
        audio.play('melee_hit', { pos: z });
        this.hitFX(z, z.x, z.y + 1.1, z.z, false);
        if (this.isAuthority) {
          const res = this.zombies.damage(z.id, meleeDamage(p.bowie), { head: false, by: p.id, weapon: { headMult: 1 } });
          if (res.ok) {
            this.awardPoints(CFG.POINTS_HIT, z);
            if (res.killed) this.onKillConfirm(z, false, true);
            this.hud.hitmarker(res.killed, false);
            audio.play(res.killed ? 'hitmarker_kill' : 'hitmarker');
          }
        } else {
          this.netSend({ t: 'zhit', cid: this._newHitClaim(), z: z.id, dmg: meleeDamage(p.bowie), head: 0, knife: 1 });
        }
      }
    }, 120);
  }
}
