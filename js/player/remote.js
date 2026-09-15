// A teammate as this machine draws them: snapshots interpolated onto a
// soldier, the loadout the host has authorised, and the perk drink.
import * as THREE from 'three';
import { CFG } from '../config.js';
import { clamp, lerp, damp, textTexture } from '../utils.js';
import { audio } from '../audio.js';
import { buildPerkBottle } from '../weapons.js';
import { PERK_DRINK_TIMELINE, perkDrinkPhase } from '../gameplay-rules.js';
import { assets } from '../assets.js';
import { SoldierVisual } from './soldier.js';

export class RemotePlayer {
  constructor(scene, info) {
    this.id = info.id;
    this.name = info.name;
    this.colorIdx = info.c || 0;
    this.personaIdx = (info.persona >= 0 ? info.persona : this.colorIdx);
    const g = new THREE.Group();
    this.visual = null;
    try {
      if (assets.models.zombie1) {
        this.visual = new SoldierVisual(this.personaIdx);
        if (this.visual.ok) g.add(this.visual.group);
        else this.visual = null;
      }
    } catch (e) { this.visual = null; }
    if (!this.visual) {
      // fallback: minimal capsule figure
      const mat = new THREE.MeshStandardMaterial({ color: 0x4a4438, roughness: 0.95 });
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 1.1, 0.26), mat); torso.position.y = 0.95;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), new THREE.MeshStandardMaterial({ color: 0xc9a486 })); head.position.y = 1.62;
      g.add(torso, head);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    }
    // name tag (small, subtle)
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(info.name, { w: 256, h: 64, bg: 'rgba(0,0,0,0)', fg: CFG.COLORS[this.colorIdx % 4], font: 'bold 34px Arial' }), transparent: true, depthTest: false, opacity: 0.85 }));
    tag.scale.set(1.15, 0.29, 1);
    tag.position.y = 2.1;
    g.add(tag);
    this.group = g;
    this.x = info.x || 0; this.z = info.z || 0; this.y = 0; this.yaw = 0; this.pitch = 0;
    this.prev = null; this.next = null;
    this.down = false; this.dead = false;
    this.anim = 0; this.speed = 0;
    this.hp = 100; this.points = 500; this.kills = 0; this.downs = 0; this.revives = 0;
    this.perks = []; this.weaponId = 'm1911'; this.weaponPap = false; this.bowie = false;
    // On the host this is the authoritative remote loadout. Unreliable player
    // snapshots may choose movement/cosmetics, but never add weapons or PaP.
    this.ownedWeapons = new Map([['m1911', false]]);
    this.bleed = 0; this.crouch = 0; this.sprint = 0;
    this.perkDrink = null;
    scene.add(g);
  }

  startPerkDrink(perkId) {
    if (this.perkDrink) return false;
    const bottle = buildPerkBottle(perkId);
    // Raise-start pose before the first render: an unposed bottle sits at the
    // actor's origin, so it pops from between their boots on frame one.
    bottle.position.set(0.34, 0.7, -0.1);
    bottle.rotation.set(0, 0, -0.25);
    this.group.add(bottle);
    this.perkDrink = { id: perkId, bottle, elapsed: 0, broke: false, belched: false };
    audio.play('drink', { pos: { x: this.x, y: this.y + 1.5, z: this.z } });
    return true;
  }

  setAuthoritativeLoadout(loadout) {
    const entries = Array.isArray(loadout) ? loadout.slice(0, 2) : [];
    this.ownedWeapons = new Map(entries
      .filter((weapon) => weapon && typeof weapon.id === 'string')
      .map((weapon) => [weapon.id, !!weapon.pap]));
    if (!this.ownedWeapons.size) this.ownedWeapons.set('m1911', false);
    const first = this.ownedWeapons.entries().next().value;
    this.weaponId = first[0];
    this.weaponPap = first[1];
  }

  authorizeWeapon(id, pap = false, replaceCurrent = true) {
    if (typeof id !== 'string') return false;
    if (!this.ownedWeapons.has(id) && this.ownedWeapons.size >= 2 && replaceCurrent) {
      this.ownedWeapons.delete(this.weaponId);
    }
    this.ownedWeapons.set(id, !!pap);
    this.weaponId = id;
    this.weaponPap = !!pap;
    return true;
  }

  equipAuthorizedWeapon(id) {
    if (!this.ownedWeapons.has(id)) return false;
    this.weaponId = id;
    this.weaponPap = !!this.ownedWeapons.get(id);
    return true;
  }

  updatePerkDrink(dt) {
    const drink = this.perkDrink;
    if (!drink) return;
    drink.elapsed += dt;
    const t = drink.elapsed, b = drink.bottle, phase = perkDrinkPhase(t);
    const ease = (v) => { const x = clamp(v, 0, 1); return x * x * (3 - 2 * x); };
    if (phase === 'raise') {
      const q = ease(t / PERK_DRINK_TIMELINE.raiseEnd);
      b.position.set(lerp(0.34, 0.12, q), lerp(0.7, 1.56, q), lerp(-0.1, 0.04, q));
      b.rotation.set(lerp(0, 1.15, q), 0, lerp(-0.25, 0.1, q));
    } else if (phase === 'drink') {
      const q = (t - PERK_DRINK_TIMELINE.raiseEnd) / (PERK_DRINK_TIMELINE.gulpEnd - PERK_DRINK_TIMELINE.raiseEnd);
      b.position.set(0.12, 1.56 + Math.sin(q * 14) * 0.015, 0.04);
      b.rotation.set(1.15 + Math.sin(q * Math.PI) * 0.18, 0, 0.1);
    } else if (phase === 'lower') {
      const q = ease((t - PERK_DRINK_TIMELINE.gulpEnd) / (PERK_DRINK_TIMELINE.throwAt - PERK_DRINK_TIMELINE.gulpEnd));
      b.position.set(lerp(0.12, 0.45, q), lerp(1.56, 1.05, q), lerp(0.04, 0.24, q));
      b.rotation.set(lerp(1.15, 0, q), 0, lerp(0.1, -0.4, q));
    } else if (phase === 'throw') {
      const q = (t - PERK_DRINK_TIMELINE.throwAt) / (PERK_DRINK_TIMELINE.breakAt - PERK_DRINK_TIMELINE.throwAt);
      b.position.set(0.45 + q * 0.8, 1.05 + q * 0.35 - q * q * 1.25, 0.24 + q * 0.65);
      b.rotation.set(q * 8, q * 5, -0.4 - q * 4);
    } else b.visible = false;
    if (!drink.broke && t >= PERK_DRINK_TIMELINE.breakAt) {
      drink.broke = true;
      const pos = b.getWorldPosition(new THREE.Vector3());
      audio.play('bottle_break', { pos });
    }
    if (!drink.belched && t >= PERK_DRINK_TIMELINE.belchAt) {
      drink.belched = true;
      audio.play('belch', { pos: { x: this.x, y: this.y + 1.55, z: this.z } });
    }
    if (t >= PERK_DRINK_TIMELINE.duration) {
      this.group.remove(b);
      this.perkDrink = null;
    }
  }

  applyState(s, now) {
    if (!this.next) {
      this.prev = { x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, t: now };
      this.next = { x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: s.pitch, t: now + (window.__snapInterval || 66) / 1000 };
    } else {
      const prev = this.prev;
      prev.x = this.next.x; prev.y = this.next.y; prev.z = this.next.z;
      prev.yaw = this.next.yaw; prev.pitch = this.next.pitch; prev.t = this.next.t;
      this.next.x = s.x; this.next.y = s.y; this.next.z = s.z;
      this.next.yaw = s.yaw; this.next.pitch = s.pitch;
      this.next.t = now + (window.__snapInterval || 66) / 1000;
    }
    this.down = !!s.down; this.dead = !!s.dead;
    this.hp = s.hp; this.points = s.points; this.kills = s.kills; this.downs = s.downs; this.revives = s.revives;
    this.perks = s.perks || []; this.weaponId = s.w; this.weaponPap = !!s.pap; this.bleed = s.bleed;
    this.crouch = s.crouch; this.sprint = s.sprint;
    this.name = s.name; this.colorIdx = s.c;
  }

  interpolate(now, dt, camera) {
    const step = dt || 0.016;
    if (this.prev && this.next) {
      const span = Math.max(1e-3, this.next.t - this.prev.t);
      const t = clamp((now - this.prev.t) / span, 0, 1);
      this.x = lerp(this.prev.x, this.next.x, t);
      this.y = lerp(this.prev.y, this.next.y, t);
      this.z = lerp(this.prev.z, this.next.z, t);
      let dy = this.next.yaw - this.prev.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw = this.prev.yaw + dy * t;
      this.pitch = lerp(this.prev.pitch, this.next.pitch, t);
      const moved = Math.hypot(this.next.x - this.prev.x, this.next.z - this.prev.z);
      this.speed = lerp(this.speed, clamp(moved / Math.max(1e-3, span), 0, 8), 0.3);
      if (moved > 0.002) this.anim += step * (this.sprint ? 10 : 6);
    }
    const g = this.group;
    g.position.set(this.x, this.y, this.z);
    g.rotation.y = this.yaw + Math.PI; // model faces +z; forward is -z at yaw 0
    this.updatePerkDrink(step);
    const stance = this.crouch | 0;
    if (!this.visual) {
      if (this.down || this.dead) {
        g.rotation.x = 0;
        g.position.y = this.y - 0.9;
        g.rotation.z = 1.4;
      } else {
        g.rotation.z = 0;
        g.position.y = this.y - (this.crouch ? 0.5 : 0);
      }
      return;
    }

    const v = this.visual;
    // Show what he is actually carrying. `w`/`pap` come straight off the wire,
    // so host and guest resolve the same weapon from the same field.
    v.setWeapon(this.weaponId, this.weaponPap);
    // Aim and stance are transmitted and were previously thrown away. Damped,
    // never snapped, because snapshots land at 15 Hz and the eye reads a jump
    // in a head or a barrel instantly.
    this._aim = damp(this._aim ?? 0, this.down || this.dead ? 0 : this.pitch, 12, step);
    this._crouchBlend = damp(this._crouchBlend ?? 0, this.down || this.dead ? 0 : (stance >= 1 ? 1 : 0), 8, step);
    v.setAim(this._aim);
    v.setCrouch(this._crouchBlend);
    if (camera) {
      v.setLOD(Math.hypot(camera.position.x - this.x, camera.position.y - this.y, camera.position.z - this.z));
    }

    if (this.dead) {
      v.play('Death', { loop: false, fade: 0.12 });
    } else if (this.down) {
      v.play('Crawl', { timeScale: 0.45 });
    } else if (stance === 2) {
      v.play('Crawl', { timeScale: clamp(this.speed / 1.2, 0.4, 1.4) });
    } else if (this.sprint && this.speed > 3.2) {
      // Sprinting drops the rifle out of the shoulder and swings the arms —
      // Run_Arms is the clip with the arm swing, and the carry pose stands
      // aside for it (see SoldierVisual.play).
      v.play('Run_Arms', { timeScale: clamp(this.speed / 6.4, 0.85, 1.45) });
    } else if (this.speed > 4.2) {
      v.play('Run', { timeScale: clamp(this.speed / 5.5, 0.9, 1.4) });
    } else if (this.speed > 0.4) {
      v.play('Walk', { timeScale: clamp(this.speed / 1.6, 0.7, 2) });
    } else {
      v.play('Idle', { timeScale: 1 });
    }
    v.update(step);
    // A crouched man is lower, but he is lower because his knees are bent —
    // the bend is in the pose, so only the residual hip drop belongs here.
    g.position.y = this.y - this._crouchBlend * 0.16;
  }

  /** World position of this player's weapon muzzle, or null if he has no rig. */
  muzzleWorld(out) {
    if (!this.visual?.ok) return null;
    this.group.updateMatrixWorld(true);
    return this.visual.muzzleWorld(out);
  }

  dispose(scene) {
    if (this.perkDrink?.bottle) this.group.remove(this.perkDrink.bottle);
    this.perkDrink = null;
    this.visual?.dispose?.();
    this.visual = null;
    scene.remove(this.group);
  }
}
