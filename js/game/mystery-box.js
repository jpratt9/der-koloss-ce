// Game's mystery box: buying a spin, the reel, the teddy, and the prize on display.
// Methods of Game: js/game.js copies them onto Game.prototype.
import * as THREE from 'three';
import { clamp, lerp, damp, choice } from '../utils.js';
import { audio } from '../audio.js';
import { WEAPONS, BOX_POOL, buildViewmodel } from '../weapons.js';
import { mysteryBoxTeddyChance } from '../gameplay-rules.js';

// Where the mystery box floats its prize. Open, the lid stands as a panel
// from y 0.86 to 1.76, so the prize hangs level with the MIDDLE of that panel
// and reads against the boards — not hovering in the sky above the crate.
// Two numbers buy that height, because the display yaws a full turn and sweeps
// a 0.95 m weapon about its own centre:
//   BOX_LID_OPEN — 1.5 rad stands the lid up rather than leaning it 21 degrees
//     out over the crate mouth, which is what used to occupy this airspace.
//   BOX_DISPLAY_Z — a nudge toward the player, so the far end of that sweep
//     stops in front of the lid boards instead of passing through them.
// Verified end-on (worst case): prize spans z -0.27..0.68, lid front face
// sits at -0.31. Do not raise Y or drop Z without re-checking that gap.
const BOX_LID_OPEN = 1.5;        // radians at the hinge, fully open
const BOX_DISPLAY_Y = 1.32;
const BOX_DISPLAY_Z = 0.20;
// The prize comes UP OUT OF the crate: it starts down inside, below the rim,
// and rises to BOX_DISPLAY_Y as the lid finishes opening. The rise waits on
// the lid because the swinging panel sweeps the airspace above the mouth —
// by 0.5 open the lid can no longer reach the display plane, so that is when
// the prize is free to climb. Cycling weapons are broadside (see below), so
// down inside the crate they clear the boards on every side.
const BOX_DISPLAY_Y_LOW = 0.55;
const BOX_LID_RISE = 0.5;        // fraction open at which the prize starts up
// The cycling weapons are presented dead level and parallel to the crate's
// long axis — same pose for every one, so the reel reads as one rack of guns
// rather than a jumble of angles. Only the FINAL weapon takes the display
// tilt and the slow turn.
const BOX_CYCLE_PITCH = 0;
const BOX_DISPLAY_PITCH = 0.10;
const BOX_DISPLAY_ROLL = 0.06;

export class GameMysteryBox {
  // ---------------- box ----------------
  boxUse() {
    const bs = this.boxState;
    const p = this.player;
    if (bs.state === 'idle') {
      if (!p.spend(950)) { audio.play('deny'); return; }
      audio.play('buy');
      this.hud.setPoints(p.points);
      const owned = p.weapons.map((w) => w.id);
      if (this.isAuthority) {
        this.boxStartSpin(owned);
      } else {
        this.netSend({ t: 'box_spin_req', owned });
      }
    } else if (bs.state === 'ready') {
      // take weapon
      const wid = bs.weapon;
      if (wid === 'bowie') {
        p.bowie = true;
        this.weaponRig.setKnifeGold(true);
        this.hud.banner('BOWIE KNIFE', '#ffd24a', 'One slash, one kill');
      } else if (wid === 'monkey') {
        p.ownsMonkeys = true;
        p.monkeys = Math.min(2, p.monkeys + 2);
        this.hud.setGrenades(p.grenades, p.monkeys);
        this.hud.banner('MONKEY BOMB', '#ffd24a', 'Press X to throw — zombies chase it, then BOOM');
      } else {
        // rare golden finish straight out of the box
        const goldLucky = Math.random() < 0.08;
        p.giveWeapon(wid, false);
        if (goldLucky && p.weapon) { p.weapon.gold = true; this.hud.banner('GOLDEN GUN', '#ffd24a', 'A rare finish! Pack-a-Punch it for DIAMOND'); }
      }
      if (wid === 'monkey') { /* handled below via giveMonkey path */ }
      this.weaponRig.equip(p.weapon.id, p.weapon.pap);
      this._revealAcquiredWeapon();
      if (p.weapon?.gold && !p.weapon.pap) this.weaponRig.applyGoldCamo(true); // equip() resets camos — reapply
      audio.play('buy');
      this.netSend({ t: 'swap', w: p.weapon.id, pap: !!p.weapon.pap });
      if (this.isAuthority) this.boxSetIdle();
      else this.netSend({ t: 'box_take', w: wid });
      bs.state = 'idle';
      this.map.box.state = 'idle';
      this.hud.setPoints(p.points);
    }
  }

  boxStartSpin(ownedIds = []) {
    const bs = this.boxState;
    bs.state = 'spin';
    bs.t = 4;
    this.map.box.state = 'spin';
    this.map.box.uses++;
    // never give a gun the spinner already owns (unless they own the whole pool)
    const avail = BOX_POOL.filter((id) => !ownedIds.includes(id));
    bs.pool = avail.length ? avail : [...BOX_POOL];
    bs.cycleT = 0;
    audio.play('box_spin', { pos: this.map.box.pos });
    this.netSend({ t: 'box_state', state: 'spin' });
  }

  boxSetIdle() {
    this.boxState.state = 'idle';
    this.map.box.state = 'idle';
    this.netSend({ t: 'box_state', state: 'idle' });
  }

  updateBox(dt) {
    const bs = this.boxState;
    const box = this.map.box;
    // lid anim
    // Full open the moment it is bought: a half-open lid leans out over the
    // crate mouth, right through where the prize is presented.
    const openAmt = bs.state === 'idle' ? 0 : 1;
    box.lid.rotation.x = damp(box.lid.rotation.x, -openAmt * BOX_LID_OPEN, 8, dt);
    // Prize height follows the lid: down in the crate while the panel is still
    // swinging through the airspace above the mouth, then up into view.
    const lidOpen = clamp(-box.lid.rotation.x / BOX_LID_OPEN, 0, 1);
    const risen = THREE.MathUtils.smoothstep(lidOpen, BOX_LID_RISE, 1);
    const displayY = lerp(BOX_DISPLAY_Y_LOW, BOX_DISPLAY_Y, risen);
    if (this.isAuthority) {
      if (bs.state === 'spin') {
        bs.t -= dt;
        if (bs.t <= 0) {
          // teddy?
          const teddyChance = mysteryBoxTeddyChance(bs.completedWeaponSpins);
          if (Math.random() < teddyChance) {
            bs.state = 'teddy'; bs.t = 1.6;
            audio.play('teddy', { pos: this.map.box.pos });
            this.netSend({ t: 'box_state', state: 'teddy' });
          } else {
            // Count resolved weapon results, not paid uses. This survives box
            // moves and guarantees two real weapons before Teddy is eligible.
            bs.completedWeaponSpins++;
            bs.state = 'ready'; bs.t = 11;
            bs.weapon = choice(bs.pool || BOX_POOL);
            audio.play('box_ready', { pos: this.map.box.pos });
            this.netSend({ t: 'box_state', state: 'ready', w: bs.weapon });
          }
        }
      } else if (bs.state === 'ready') {
        bs.t -= dt;
        if (bs.t <= 0) { this.boxSetIdle(); }
      } else if (bs.state === 'teddy') {
        bs.t -= dt;
        if (bs.t <= 0) {
          const others = box.locations.map((_, i) => i).filter((i) => i !== box.locIdx);
          const idx = choice(others);
          this.map.moveBox(idx);
          this.boxSetIdle();
          this.netSend({ t: 'box_move', idx });
          this.hud.banner('THE BOX HAS MOVED', '#ffd24a');
        }
      }
    }
    // spin: cycle through pool weapons rapidly above the box (all clients)
    if (bs.state === 'spin') {
      bs.cycleT = (bs.cycleT ?? 0) - dt;
      if (bs.cycleT <= 0) {
        bs.cycleT = 0.12;
        this._boxCycleShow(choice(bs.pool || BOX_POOL));
      }
      if (this._boxGun) this._boxGun.position.set(0, displayY, BOX_DISPLAY_Z);
    }
    // teddy: rises and spins into the sky — and ONLY a teddy, no gun
    if (bs.state === 'teddy') {
      if (this._boxGun) { this.map.box.group.remove(this._boxGun); this._boxGun = null; this._boxGunW = null; }
      if (!this._boxTeddy) this._boxTeddy = this._makeTeddy();
      if (!this._boxTeddy.parent) this.map.box.group.add(this._boxTeddy);
      const tt = 1 - Math.max(0, bs.t) / 1.6;
      this._boxTeddy.position.y = 1.1 + tt * tt * 26;
      this._boxTeddy.rotation.y += dt * 7;
      this._boxTeddy.rotation.z = Math.sin(this.time * 9) * 0.2;
    } else if (this._boxTeddy && this._boxTeddy.parent) {
      this.map.box.group.remove(this._boxTeddy);
    }
    // floating weapon above box when ready
    if (bs.state === 'ready' && bs.weapon) {
      if (!this._boxGun || this._boxGunW !== bs.weapon) {
        if (this._boxGun) this.map.box.group.remove(this._boxGun);
        this._boxGun = this._buildDisplayWeapon(bs.weapon, false);
        this._boxGun.position.set(0, displayY, BOX_DISPLAY_Z);
        this._boxGunW = bs.weapon;
        this.map.box.group.add(this._boxGun);
      }
      // The won weapon is the only one that turns; it also takes the display
      // tilt back, which the flat cycling pose above clears off the mesh.
      this._boxGun.rotation.x = BOX_DISPLAY_PITCH;
      this._boxGun.rotation.z = BOX_DISPLAY_ROLL;
      this._boxGun.rotation.y += dt * 1.6;
      this._boxGun.position.set(0, displayY + Math.sin(this.time * 2.2) * 0.05, BOX_DISPLAY_Z);
    } else if (this._boxGun && bs.state === 'idle') {
      // cleanup only once the box has gone idle — never during spin/teddy
      this.map.box.group.remove(this._boxGun);
      this._boxGun = null; this._boxGunW = null;
    }
  }

  /**
   * Build a weapon for DISPLAY IN THE WORLD (mystery box, Pack-a-Punch).
   *
   * `buildViewmodel` returns the FIRST-PERSON model — which includes gloved
   * hands, forearms and a sleeve, because in the player's view those are the
   * hands holding it. Presenting that above the crate floated a pair of
   * disembodied hands next to the gun. It was also scaled 1.6x and centred on
   * the crate, so long weapons speared straight through the lid.
   *
   * This strips the hands, measures what is left, and returns a group that is
   * normalised to a fixed presentation length and pivots about its own centre
   * — so a pistol and a Panzerschreck both hover cleanly, broadside to the
   * player, at the same readable size, clear of the box.
   */
  _buildDisplayWeapon(wid, pap = false) {
    const src = buildViewmodel(wid, pap);
    // The gloves already live outside the returned tree (userData.handsGroup);
    // dropping the container is all that is needed, and it cannot take weapon
    // parts with it. Never strip by name here — `handguard` and `handle` are
    // wood and steel, not flesh.
    src.userData.handsGroup = null;
    const strip = [];
    src.traverse((o) => { if (o.userData?.isGlove) strip.push(o); });
    for (const o of strip) o.parent?.remove(o);

    // Normalise: longest axis becomes DISPLAY_LEN, recentred on its own bounds.
    const holder = new THREE.Group();
    const box = new THREE.Box3().setFromObject(src);
    if (box.isEmpty()) { holder.add(src); return holder; }
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z, 1e-4);
    const DISPLAY_LEN = 0.95;                 // metres, tuned to the crate width
    // Cap the enlargement. Normalising the longest axis suits guns, which are
    // all roughly a metre, but the pool also holds a 0.36 m Monkey Bomb and a
    // 0.3 m Bowie knife — blowing those up to 0.95 m made them read as absurd
    // giant props rather than as the small items they are.
    const MAX_DISPLAY_UPSCALE = 1.7;
    const k = Math.min(DISPLAY_LEN / longest, MAX_DISPLAY_UPSCALE);
    src.position.sub(centre);                 // pivot about the weapon's centre
    src.scale.multiplyScalar(k);
    src.position.multiplyScalar(k);
    // Present broadside: the viewmodel points down -Z, so yaw it side-on and
    // give it a slight nose-down tilt the way a display rack would.
    holder.rotation.set(0.10, Math.PI / 2, 0.06);
    holder.add(src);
    holder.userData.displayHeight = size.y * k;
    return holder;
  }

  _boxCycleShow(wid) {
    if (this._boxGunW === wid && this._boxGun) { this._boxGun.visible = true; return; }
    if (this._boxGun) { this._boxGun.visible = false; }
    this._boxCycle = this._boxCycle || new Map();
    let m = this._boxCycle.get(wid);
    if (!m) {
      m = this._buildDisplayWeapon(wid, false);
      m.position.set(0, BOX_DISPLAY_Y, BOX_DISPLAY_Z);
      this.map.box.group.add(m);
      this._boxCycle.set(wid, m);
    }
    // Re-parent a cached mesh. Going idle REMOVES the current prize from the
    // crate group but leaves it in this cache, so the next spin that landed on
    // the same weapon found it, made it visible, and presented nothing at all —
    // "take Thompson" over an empty crate, spreading to more weapons as the run
    // went on.
    if (!m.parent) this.map.box.group.add(m);
    m.visible = true;
    this._boxGun = m;
    this._boxGunW = wid;
  }

  _makeTeddy() {
    const fur = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.9 });
    const fur2 = new THREE.MeshStandardMaterial({ color: 0x8a6438, roughness: 0.9 });
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), fur);
    body.scale.y = 1.25; body.position.y = 0.16;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), fur);
    head.position.y = 0.42;
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), fur2);
    snout.position.set(0, 0.4, 0.1);
    const earL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), fur); earL.position.set(0.09, 0.52, 0);
    const earR = earL.clone(); earR.position.x = -0.09;
    const armL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), fur); armL.scale.y = 1.8; armL.position.set(0.18, 0.2, 0); armL.rotation.z = -0.4;
    const armR = armL.clone(); armR.position.x = -0.18; armR.rotation.z = 0.4;
    const legL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), fur); legL.scale.y = 1.5; legL.position.set(0.09, 0.0, 0.02);
    const legR = legL.clone(); legR.position.x = -0.09;
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), eyeMat); eyeL.position.set(0.045, 0.44, 0.105);
    const eyeR = eyeL.clone(); eyeR.position.x = -0.045;
    g.add(body, head, snout, earL, earR, armL, armR, legL, legR, eyeL, eyeR);
    g.scale.setScalar(1.4);
    return g;
  }

  _boxEvent(msg, from) {
    switch (msg.t) {
      case 'box_spin_req': if (this.isAuthority && this.boxState.state === 'idle' && this._remoteNearVisible(from, this.map.box.pos, 3)) this.boxStartSpin(Array.isArray(msg.owned) ? msg.owned.filter((id) => WEAPONS[id]).slice(0, 2) : []); break;
      case 'box_take': {
        if (!this.isAuthority || this.boxState.state !== 'ready' || msg.w !== this.boxState.weapon
            || !this._remoteNearVisible(from, this.map.box.pos, 3)) break;
        if (msg.w === 'bowie') {
          const remote = this.remotePlayers.get(from);
          if (remote) remote.bowie = true;
        }
        this.boxSetIdle();
        break;
      }
      case 'box_state': {
        if (this.isAuthority) break;
        this.boxState.state = msg.state;
        if (msg.state === 'ready') { this.boxState.weapon = msg.w; audio.play('box_ready', { pos: this.map.box.pos }); }
        if (msg.state === 'spin') audio.play('box_spin', { pos: this.map.box.pos });
        if (msg.state === 'teddy') audio.play('teddy', { pos: this.map.box.pos });
        break;
      }
      case 'box_move': {
        // The only index in this switch that reached the map unvalidated. The
        // generic payload validator bounds magnitude, not range.
        const boxIdx = Number(msg.idx);
        if (!Number.isInteger(boxIdx) || boxIdx < 0 || boxIdx >= this.map.box.locations.length) break;
        this.map.moveBox(boxIdx);
        if (!this.isAuthority) { this.boxState.state = 'idle'; this.hud.banner('THE BOX HAS MOVED', '#ffd24a'); }
        break;
      }
    }
  }
}
