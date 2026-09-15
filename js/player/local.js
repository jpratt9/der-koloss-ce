// The local player: health, points and the loadout, and going down, being
// revived and dying. Its per-frame movement is in local-movement.js.
import { CFG } from '../config.js';
import { lerp, installMixins } from '../utils.js';
import { audio } from '../audio.js';
import { getStats } from '../weapons.js';
import { LocalPlayerMovement } from './local-movement.js';

export class LocalPlayer {
  constructor(id, name, colorIdx, spawn) {
    this.id = id;
    this.name = name;
    this.colorIdx = colorIdx;
    this.x = spawn.x; this.z = spawn.z; this.y = 0;
    this.velY = 0; this.grounded = true; this._airOriginY = null;
    // View and movement both define yaw 0 as -Z (toward the courtyard from
    // the mainframe spawn). Keep the constructor aligned with respawns/init.
    this.yaw = 0; this.pitch = 0;
    this.hp = CFG.BASE_HP;
    this.maxHp = CFG.BASE_HP;
    this.down = false; this.dead = false;
    this.downEase = 0;          // 0 on your feet, 1 collapsed — eases the eye down
    this.bleedout = 0; this.selfReviveT = 0;
    this.selfReviveAvailable = false;
    this._stashedWeapons = null; this._stashedCur = 0;
    this.points = CFG.START_POINTS;
    this.kills = 0; this.downs = 0; this.revives = 0; this.headshots = 0;
    this.weapons = [{ id: 'm1911', pap: false, mag: 8, reserve: 80 }];
    this.cur = 0;
    this.grenades = 4; this.monkeys = 0; this.ownsMonkeys = false;
    this.perks = new Set();
    this.crouched = false;
    this.sprinting = false;
    this.stance = 0; // 0 stand, 1 crouch, 2 prone
    this.stanceY = 1; // lerped stance factor (1 = full height)
    this._stanceKeyT = 0;
    this.lastDamageT = -99;
    this.stepAcc = 0;
    this.fireCooldown = 0;
    this.reloadEnd = 0;
    this.switchCooldown = 0;
    this.meleeCooldown = 0;
    this.grenadeCooldown = 0;
    this.adsT = 0;
    this.recoilPitch = 0;
    this.spreadBloom = 0;
    this.alive = true;

    // ---- momentum-based movement ----
    // Movement used to be `position += direction * speed * dt`, which starts and
    // stops instantly and feels weightless. These carry actual velocity so the
    // body accelerates, keeps momentum into a slide, and settles on release.
    this.vx = 0; this.vz = 0;
    this.speed2D = 0;
    this.sliding = false;
    this.slideT = 0;
    this.slideCooldown = 0;
    this.slideDirX = 0; this.slideDirZ = 0;
    this.mantling = null;       // {t, dur, fromX/Y/Z, toX/Y/Z}
    this.landImpact = 0;        // set on touchdown, consumed by the camera rig
    this.fallSpeed = 0;
    this._coyote = 0;           // grace window for jumping just after a ledge
    this._jumpBuffer = 0;       // grace window for pressing jump just before landing
    this.surface = 'concrete';
  }

  get weapon() { return this.weapons[this.cur]; }
  get stats() { const w = this.weapon; return w ? getStats(w.id, w.pap) : null; }
  get maxHpNow() { return this.perks.has('jug') ? CFG.JUG_HP : CFG.BASE_HP; }
  get reloadMult() { return this.perks.has('speed') ? 0.5 : 1; }
  get rpmMult() { return this.perks.has('dtap') ? 1.33 : 1; }
  get eyeHeight() {
    const stand = CFG.EYE_HEIGHT * this.stanceY;
    // Collapsing used to be a one-frame cut from eye height to the floor, and
    // getting up the same cut in reverse. Riding the ease makes it read as the
    // body going down rather than as the camera being re-parented.
    return this.downEase > 0.0005 ? lerp(stand, 0.5, this.downEase) : stand;
  }
  get stanceTargetY() { return [1, 0.66, 0.3][this.stance]; }

  addPoints(n, doubleActive) {
    if (n > 0 && doubleActive) n *= 2;
    this.points = Math.max(0, this.points + n);
    return n;
  }
  spend(n) {
    if (this.points < n) return false;
    this.points -= n;
    return true;
  }

  giveWeapon(id, pap = false) {
    const s = getStats(id, pap);
    const slot = { id, pap, mag: s.mag, reserve: s.reserve };
    let idx;
    if (this.weapons.length < 2) idx = this.weapons.length === 0 ? 0 : 1;
    else idx = this.cur;
    this.weapons[idx] = slot;
    this.cur = idx; // auto-switch to the new weapon
    return slot;
  }

  refillAmmo() {
    // A Max Ammo must not top up the down pistol — being downed is supposed to
    // cost you something. The real loadout is stashed and refills on revive.
    if (this.down) return;
    for (const w of this.weapons) { const s = getStats(w.id, w.pap); w.reserve = s.reserve; }
    this.grenades = 4;
    if (this.ownsMonkeys) this.monkeys = 2;
  }

  damage(dmg, game) {
    if (game.godMode) return; // GOD MODE cheat
    if (this.down || this.dead) return;
    this.hp -= dmg;
    this.lastDamageT = game.time;
    audio.play('hurt');
    game.fx.damageFlash();
    game.fx.shake(0.35);
    if (this.hp <= 0) {
      this.hp = 0;
      this.goDown(game);
    }
  }

  goDown(game) {
    // Perks are lost at the down transition regardless of whether the player
    // is later revived, bleeds out, or respawns. Preserve only the already-
    // earned solo Quick Revive charge as down-state—not as an active perk.
    this.selfReviveAvailable = game.mode === 'solo'
      && this.perks.has('qr') && game.qrSelfRevives > 0;
    this.perks.clear();
    game.hud.setPerks(this.perks);
    this.down = true;
    this.downs++;
    this.bleedout = CFG.BLEEDOUT_TIME;
    this.selfReviveT = 0;
    // Park the body. update() returns early for the whole time you are down, so
    // every motion field keeps whatever value it held the instant you fell — and
    // the camera rig and the viewmodel read them every frame regardless. Going
    // down mid-sprint left the view bobbing through a full stride and the gun
    // walking for the entire bleedout, which reads as camera shake coming from a
    // body that is lying still.
    this.vx = 0; this.vz = 0;
    this.speed2D = 0;
    this.moving = false;
    this.sprinting = false;
    this.strafeInput = 0;
    this.landImpact = 0;
    // A slide interrupted by going down never reached its own exit, so it would
    // hold the rig's slide dip and bank — and keep the floor scraping under you.
    if (this.sliding) {
      this.sliding = false;
      this.slideCooldown = 0.55;
      this.onSlideEnd?.(false);
    }
    // You keep fighting from the floor, but only with the sidearm you started
    // the match with — not the Ray Gun you were holding a second ago. The real
    // loadout is stashed whole (slot objects included, so a weapon sitting in
    // the Pack-a-Punch survives) and comes back on revive.
    this._stashedWeapons = this.weapons;
    this._stashedCur = this.cur;
    this.weapons = [{ id: 'm1911', pap: false, mag: 8, reserve: 80 }];
    this.cur = 0;
    if (game) {
      // cancel any reload still in flight for the slot we just swapped out
      game._reloadToken = (game._reloadToken || 0) + 1;
      if (game.weaponRig) {
        game.weaponRig.papHide = false;
        game.weaponRig.equip('m1911', false);
      }
    }
    audio.play('down');
    game.onPlayerDown?.(this);
  }

  revive(full = false, game = null) {
    this.down = false;
    this.hp = full ? this.maxHpNow : this.maxHpNow;
    this.selfReviveAvailable = false;
    if (this._stashedWeapons?.length) {
      this.weapons = this._stashedWeapons;
      this.cur = Math.min(this._stashedCur || 0, this.weapons.length - 1);
    }
    this._stashedWeapons = null; this._stashedCur = 0;
    if (game) {
      game._reloadToken = (game._reloadToken || 0) + 1;
      if (game.weaponRig && this.weapon) {
        game.weaponRig.papHide = false;
        game.weaponRig.equip(this.weapon.id, !!this.weapon.pap);
      }
    }
    audio.play('revive');
  }

  die(game) {
    this.dead = true;
    this.down = false;
    // respawnSelf() rebuilds the loadout from scratch; drop the stash so a
    // revive that races the death cannot resurrect it.
    this._stashedWeapons = null; this._stashedCur = 0;
    game.onPlayerDead?.(this);
  }

  reloading(game) {
    return game.weaponRig.isReloading;
  }

  canFire(game) {
    // Firing while down is allowed on purpose — goDown() has already swapped
    // the loadout for the starting sidearm, so this can only ever be a pistol.
    return this.fireCooldown <= 0 && !this.reloading(game) && this.switchCooldown <= 0 && this.meleeCooldown <= 0 && !this.dead;
  }

  serialize() {
    return {
      id: this.id, name: this.name, c: this.colorIdx,
      x: Math.round(this.x * 100) / 100, y: Math.round(this.y * 100) / 100, z: Math.round(this.z * 100) / 100,
      yaw: Math.round(this.yaw * 1000) / 1000, pitch: Math.round(this.pitch * 1000) / 1000,
      hp: Math.round(this.hp), down: this.down ? 1 : 0, dead: this.dead ? 1 : 0,
      points: this.points, kills: this.kills, downs: this.downs, revives: this.revives,
      w: this.weapon ? this.weapon.id : 'm1911', pap: this.weapon?.pap ? 1 : 0,
      perks: [...this.perks], crouch: this.stance, sprint: this.sprinting ? 1 : 0,
      bleed: Math.round(this.bleedout),
    };
  }
}

// LocalPlayer's per-frame movement is in js/player/local-movement.js, a class
// whose methods are copied onto LocalPlayer.prototype here, as ZombieManager's
// are; a name defined twice fails at load.
installMixins(LocalPlayer, [LocalPlayerMovement]);
