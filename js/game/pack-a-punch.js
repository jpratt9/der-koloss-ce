// Game's Pack-a-Punch: buying an upgrade, the host-clocked cycle, the weapon
// on the machine, and taking it.
// Methods of Game: js/game.js copies them onto Game.prototype.
import { dist2D } from '../utils.js';
import { input } from '../input.js';
import { audio } from '../audio.js';
import { getStats, WEAPONS, buildPapDisplayWeapon, updatePapDisplayWeapon, disposePapDisplayWeapon } from '../weapons.js';
import { remoteWeaponClaimAllowed } from '../multiplayer-contracts.js';
import { papEventMatches, papLifecyclePhase, PAP_PROCESS_SECONDS, PAP_READY_TIMEOUT_SECONDS } from '../gameplay-rules.js';

export class GamePackAPunch {
  // ---------------- pack-a-punch ----------------
  papUse() {
    const p = this.player;
    if (this.teleLinks < 3 || this.papState.busy) return;
    if (p.weapon.pap) { audio.play('deny'); return; }
    if (!p.spend(5000)) { audio.play('deny'); return; }
    audio.play('buy');
    this.hud.setPoints(p.points);
    if (this.isAuthority) {
      this.papStart(p.id, p.weapon.id);
      this.netSend({ t: 'pap_start', pid: p.id, w: p.weapon.id });
    } else {
      this.netSend({ t: 'pap_req', w: p.weapon.id });
      this.papState = { busy: true, t: PAP_PROCESS_SECONDS, ready: false, weapon: p.weapon.id, owner: p.id, mine: true };
    }
    // hand the gun to the machine — hands come up EMPTY for the knuckle crack,
    // THEN you reach for your other weapon (never fists + gun at once)
    this.papState.slot = p.weapon; // exact slot, so a duplicate pull cannot shadow it
    p.weapon.upgrading = true;
    this.weaponRig.papHide = true; // hides the view-model entirely
    this._papSwapPending = true;   // swap fires the moment the ritual actually ends
    audio.play('pap_insert');
    // the ritual: slow, smooth, high-class knuckle crack while it starts cooking
    this.weaponRig.knuckleCrack();
    setTimeout(() => { if (!this.disposed) audio.play('knuckles'); }, 620);
    setTimeout(() => { if (!this.disposed) audio.play('knuckles', { rate: 0.94 }); }, 1180);
  }

  papStart(pid, wid) {
    this.papState = { busy: true, t: PAP_PROCESS_SECONDS, ready: false, weapon: wid, owner: pid };
  }

  updatePap(dt) {
    const ps = this.papState;
    if (ps.busy && !ps.ready) {
      ps.t -= dt;
      // pap.mp3 decodes to exactly 4.000s = PAP_PROCESS_SECONDS. Start it once at
      // the top of the cycle and its last sample lands on the frame pap_done rings.
      // The old 2.4s retrigger stacked a second whirr over the first instead.
      if (!this._papWhirrStarted) {
        this._papWhirrStarted = true;
        this._papWhirr = audio.play('pap_whirr', { pos: this.map.pap.pos }) || null;
      }
      // Clients never complete a cycle on their own clock. Only the authority
      // emits pap_ready, preventing divergent ready weapons under latency.
      if (ps.t <= 0 && this.isAuthority) {
        ps.t = 0;
        ps.ready = true;
        audio.play('pap_done', { pos: this.map.pap.pos });
        this.netSend({ t: 'pap_ready', pid: ps.owner, w: ps.weapon });
        if (ps.owner === this.player.id || ps.mine) this.hud.papNotice('Your weapon is ready');
      }
    } else if (ps.busy) {
      // owner takes on proximity + F; authority auto-grants after the ready timeout
      ps.t -= dt;
      const ownerIsMe = ps.owner === this.player.id || ps.mine;
      if (ownerIsMe) {
        const d = dist2D(this.player.x, this.player.z, this.map.pap.pos.x, this.map.pap.pos.z);
        if (d < 2.6 && input.pressed['KeyF']) {
          this.papTake();
          this._syncPapPresentation(dt);
          return;
        }
      }
      if (ps.t < -PAP_READY_TIMEOUT_SECONDS) { // timeout: grant to owner automatically
        if (ownerIsMe) this.papTake();
        else if (this.isAuthority) {
          const remote = this.remotePlayers.get(ps.owner);
          if (remote?.ownedWeapons.has(ps.weapon)) {
            remote.ownedWeapons.set(ps.weapon, true);
            remote.weaponId = ps.weapon;
            remote.weaponPap = true;
          }
          this.netSend({ t: 'pap_take', pid: ps.owner, w: ps.weapon });
          this._resetPapState();
        } else if (ps.t < -(PAP_READY_TIMEOUT_SECONDS + 10)) {
          // Neither the owner nor the authority: this client can only be
          // released by the host's `pap_take`. If that never arrives — dropped
          // message, or an owner who disconnected before the host noticed — the
          // branch above re-evaluates every frame forever and the machine is
          // dead for this client. Ten seconds past the grant deadline, let go.
          this._resetPapState();
        }
      }
    }
    this._syncPapPresentation(dt);
  }

  _showPapOutputWeapon(id) {
    if (!WEAPONS[id] || this._papOutput?.id === id) return;
    this._clearPapOutputWeapon();
    const group = buildPapDisplayWeapon(id);
    const slot = this.map.pap.slot;
    const baseY = slot.position.y + 0.03;
    // Standoff from the machine face. The furthest the cabinet reaches forward
    // across the band of Y the prize floats in is the brass mouth ring and its
    // rivets, at local z = 0.69 (js/props/packAPunch.js) — not the z = 0.62
    // mouth plane. The weapon spins about Y, so it sweeps its own half-length
    // in Z; at PAP_DISPLAY_LEN the widest of them (the ray gun) still passes
    // ~0.10 clear of that ring, so it reads as just-handed-out without ever
    // grazing the collar. It cannot be offset in the builder instead: a baked
    // Z offset would make the weapon orbit the machine rather than sit in
    // front of it.
    group.position.set(slot.position.x, baseY, slot.position.z + 0.60);
    group.rotation.set(0.05, Math.PI / 2, -0.05);
    slot.parent.add(group);
    this._papOutput = { id, group, baseY };
  }

  _clearPapOutputWeapon() {
    if (!this._papOutput) return;
    disposePapDisplayWeapon(this._papOutput.group);
    this._papOutput = null;
  }

  _syncPapPresentation(dt) {
    if (!this.map?.pap) return;
    const phase = papLifecyclePhase(this.papState);
    this.map.pap.busy = phase !== 'idle';
    this.map.pap.processing = phase === 'processing';
    this.map.pap.ready = phase === 'ready';
    if (phase !== 'ready') {
      this._clearPapOutputWeapon();
      return;
    }
    this._showPapOutputWeapon(this.papState.weapon);
    const output = this._papOutput;
    if (!output) return;
    output.group.position.y = output.baseY + Math.sin(this.time * 2.4) * 0.035;
    output.group.rotation.y += dt * 0.42;
    updatePapDisplayWeapon(output.group, dt);
  }

  // The whirr is a one-shot the length of a whole cycle, so a cycle that ends
  // early (reject/refund, host takeover) has to cut it — otherwise the machine
  // keeps grinding over an idle table.
  // A gun acquired while your only other gun is inside the machine still has to
  // appear in your hands. papHide is cleared by switchWeapon(), which giveWeapon()
  // bypasses — without this the purchase stays invisible AND fireWeapon() refuses
  // to shoot it until the cycle completes.
  _revealAcquiredWeapon() {
    if (this.player.weapon?.upgrading) return;
    this._papSwapPending = false;
    this.weaponRig.papHide = false;
  }

  _stopPapWhirr() {
    if (this._papWhirr) { try { this._papWhirr.stop(); } catch (e) {} }
    this._papWhirr = null;
    this._papWhirrStarted = false;
  }

  // The weapon in the machine is tracked by slot reference, not by id: the box
  // can hand you a second copy of the same gun mid-cycle, and an id lookup would
  // then upgrade the fresh copy and leave the real one flagged `upgrading`
  // forever — a slot switchWeapon() refuses for the rest of the game.
  _papSlot() {
    const slot = this.papState.slot;
    if (slot && this.player.weapons.includes(slot)) return slot;
    return this.player.weapons.find((entry) => entry.id === this.papState.weapon) || null;
  }

  _resetPapState() {
    this.papState.busy = false;
    this.papState.ready = false;
    this.papState.mine = false;
    this.papState.t = 0;
    this.papState.weapon = null;
    this.papState.owner = null;
    this.papState.slot = null;
    this._stopPapWhirr();
    this._clearPapOutputWeapon();
  }

  _cancelLocalPapAttempt(refund = false) {
    if (!this.papState.mine) return;
    // Same trap as papTake: the recorded slot may have been moved out of
    // p.weapons by goDown, and leaving `upgrading` set makes that slot
    // permanently unselectable.
    const weapon = this._papSlot() || this.papState.slot;
    if (weapon) weapon.upgrading = false;
    if (refund) {
      this.player.points += 5000;
      this.hud.setPoints(this.player.points);
    }
    this._papSwapPending = false;
    this.weaponRig.papHide = false;
    this._resetPapState();
  }

  papTake(notifyAuthority = true) {
    const wonder = ['raygun', 'dg2'].includes(this.papState.weapon);
    this.bark(wonder ? 'take_wonder' : 'take', { force: true });
    const p = this.player;
    // NO `|| p.weapon` fallback. _papSlot() returning null means the gun that
    // went into the machine is not in the player's hands any more — going down
    // moves the whole loadout into _stashedWeapons and hands you a fresh m1911
    // (see Player.goDown) — and substituting whatever you happen to be holding
    // upgraded the DOWN PISTOL, which is discarded on revive. The paid-for
    // weapon stayed in the stash with `upgrading` still true, and switchWeapon
    // refuses to select an upgrading slot, so the gun was unreachable for the
    // rest of the run and the 5000 points were gone. Clear the flag on the slot
    // we actually recorded, wherever it now lives.
    const w = this._papSlot();
    if (!w) {
      // The machine finished its cycle and you paid for it, so the upgrade still
      // lands — on the stashed slot, wherever goDown put it. Applied in full
      // (pap + refilled magazines) rather than merely unlocked, so the gun you
      // bought is waiting, upgraded, when you are back on your feet. Nothing
      // touches the rig or the ammo HUD here: this weapon is not in your hands.
      const stashed = this.papState.slot;
      if (stashed) {
        const s = getStats(stashed.id, true);
        stashed.pap = true;
        stashed.upgrading = false;
        stashed.mag = s.mag;
        stashed.reserve = s.reserve;
      }
      this.weaponRig.papHide = false;
      this._resetPapState();
      this.hud.papNotice(null);
      return;
    }
    w.pap = true;
    w.upgrading = false;
    const wi = p.weapons.indexOf(w);
    if (wi >= 0) p.cur = wi; // HUD + hands show the gun you just took
    const s = getStats(w.id, true);
    w.mag = s.mag; w.reserve = s.reserve;
    // After the upgrade, not before it: the HUD used to be handed the old mag and
    // the new name, and nothing refreshes ammo again until you fire, so an
    // upgraded gun spent its first moments claiming its old capacity.
    this.hud.setAmmo(w.mag, w.reserve, s.displayName);
    this._resetPapState();
    if (w.gold || this.cheats.goldguns) this.weaponRig.diamondNext = true; // PaP a gold gun -> DIAMOND
    this.weaponRig.papHide = false;
    // equip() poses the new model at the bottom of its raise on this very frame,
    // so it comes up out of the holster like any other draw. Visibility is left to
    // the rig's own gate — forcing it here also forced the view-model into the
    // sniper scope picture on the frame you took a scoped gun out of the machine.
    this.weaponRig.equip(w.id, true);
    this.weaponRig.startInspect();
    this.hud.papNotice(null);
    // No screen flash on collection.
    //
    // This used to call fx.screenFlash('#c9a2ff', 420, 0.1) to read as the
    // machine's glow washing out. It cannot: the post path drives uFlash, which
    // is COLOURLESS, so the purple never arrives and what actually renders is a
    // white blink. The 420ms duration is not honoured either -- onScreenFlash
    // just adds opacity * 1.6 to _postFlash, which then decays at 7/s, so 0.1
    // becomes 0.16 and is gone in about one and a half frames.
    //
    // A sub-two-frame colourless lift, on the exact frame a new view-model is
    // being built, is indistinguishable from a rendering glitch -- and that is
    // precisely how it was reported: "something flashes right when you take the
    // finished upgraded gun out of the machine". Earlier passes tuned the
    // strength down rather than removing it, which made it subtler without
    // making it read as anything.
    //
    // The event already has feedback that works: the pap_done cue below, the
    // upgraded camo on the weapon, and the draw animation. Note this is separate
    // from the one-frame dark unposed-model frame fixed by priming
    // advancePapLivingFinish in equip() -- that was a DARK frame, this is the
    // bright one.
    audio.play('pap_done', { pos: this.map.pap.pos });
    if (notifyAuthority) this.netSend({ t: 'pap_take', pid: p.id, w: w.id });
  }

  _papEvent(msg, from) {
    const p = this.player;
    switch (msg.t) {
      case 'pap_req': {
        const remote = this.remotePlayers.get(from);
        const accepted = this.isAuthority && !this.papState.busy && WEAPONS[msg.w]
            && remoteWeaponClaimAllowed(remote, msg.w, false)
            && this.teleLinks >= 3 && this._remoteNearVisible(from, this.map.pap.pos, 3);
        if (accepted) {
          this.papStart(from, msg.w);
          this.netSend({ t: 'pap_start', pid: from, w: msg.w });
        } else if (this.isAuthority) {
          this.netSend({ t: 'pap_reject', pid: from, w: msg.w });
        }
        break;
      }
      case 'pap_start': {
        if (!this.isAuthority && WEAPONS[msg.w]) {
          // The authority echoes our own request back. That echo must not re-ring
          // the insert a round-trip later, and it must carry the slot forward.
          const echoOfMine = this.papState.mine && msg.pid === p.id && this.papState.weapon === msg.w;
          const slot = echoOfMine ? this.papState.slot : null;
          if (this.papState.mine && !echoOfMine) this._cancelLocalPapAttempt(true);
          this.papState = {
            busy: true, t: PAP_PROCESS_SECONDS, ready: false,
            weapon: msg.w, owner: msg.pid, mine: msg.pid === p.id, slot,
          };
          if (!echoOfMine) audio.play('pap_insert', { pos: this.map.pap.pos });
        }
        break;
      }
      case 'pap_reject': {
        if (!this.isAuthority && msg.pid === p.id
            && this.papState.mine && this.papState.weapon === msg.w) {
          this._cancelLocalPapAttempt(true);
          this.hud.banner('PACK-A-PUNCH BUSY', '#ff9944', 'Your points were refunded');
        }
        break;
      }
      case 'pap_ready': {
        if (!this.isAuthority && papEventMatches(this.papState, msg.pid, msg.w)) {
          this.papState.ready = true;
          this.papState.t = 0;
          audio.play('pap_done', { pos: this.map.pap.pos });
          if (msg.pid === p.id) this.hud.papNotice('Your weapon is ready');
        }
        break;
      }
      case 'pap_take': {
        if (this.isAuthority) {
          if (this.papState.owner === from && this.papState.ready && this._remoteNearVisible(from, this.map.pap.pos, 3)) {
            const remote = this.remotePlayers.get(from);
            if (remote?.ownedWeapons.has(this.papState.weapon)) {
              remote.ownedWeapons.set(this.papState.weapon, true);
              remote.weaponId = this.papState.weapon;
              remote.weaponPap = true;
              const weapon = this.papState.weapon;
              this._resetPapState();
              this.netSend({ t: 'pap_take', pid: from, w: weapon });
            }
          }
        } else if (papEventMatches(this.papState, msg.pid, msg.w)) {
          if (msg.pid === p.id) this.papTake(false);
          else this._resetPapState();
        }
        break;
      }
      case 'pap_door': {
        this.hud.banner('PACK-A-PUNCH AVAILABLE', '#c9a2ff', 'All three teleporters are linked');
        audio.play('pap_done');
        this.teleLinks = 3;
        break;
      }
    }
  }
}
