// Game's view of the match: the camera (spectating and the death cam included)
// and what the HUD is fed each frame.
// Methods of Game: js/game.js copies them onto Game.prototype.
import { CFG } from '../config.js';
import { clamp, lerp, damp } from '../utils.js';
import { input } from '../input.js';
import { audio } from '../audio.js';
import { PERSONAS } from '../personas.js';

// Frozen zero-shake, shared so the down/dead camera path allocates nothing.
const NO_SHAKE = Object.freeze({ yaw: 0, pitch: 0, roll: 0 });

export class GameCameraHud {
  updateCamera(dt) {
    const p = this.player;
    // Down or dead is not a moment for the camera to editorialise. Trauma keeps
    // decaying in fx so nothing accumulates and slams you on revive — it just
    // stops being applied. Gated here rather than in fx.getShakeOffset() because
    // fx has no player-state knowledge and validate-performance-invariants
    // asserts the offset-reuse shape of that method.
    const sh = (p.down || p.dead) ? NO_SHAKE : this.fx.getShakeOffset();
    if (this.spectateTarget) {
      const rp = this.remotePlayers.get(this.spectateTarget);
      if (rp && !rp.dead && !rp.down) {
        // true first-person of the teammate: their eye height, their aim
        this.camera.position.set(rp.x, rp.y + 1.62, rp.z);
        this.camera.rotation.set(rp.pitch, rp.yaw, 0);
        if (Math.abs(this.camera.fov - this.options.fov) > 0.1) {
          this.camera.fov = damp(this.camera.fov, this.options.fov, 12, dt);
          this.camera.updateProjectionMatrix();
        }
        return;
      }
      this.pickSpectate(); // they went down too — ride with someone else
      if (!this.spectateTarget) {
        this.camera.position.set(p.x, p.y + 0.8, p.z);
        this.camera.rotation.set(-0.4, p.yaw, 0);
      }
      return;
    }
    // Dead and not riding with a teammate (solo, or nobody left to spectate):
    // hold the last pose. The rig would otherwise keep breathing — and it
    // breathes harder the lower your health, so a corpse would sway more than
    // a healthy player.
    if (p.dead) {
      if (!this._deathCamHeld) {
        this._deathCamHeld = true;
        this.camera.position.set(p.x, p.y + 0.45, p.z);
        this.camera.rotation.set(-0.35, p.yaw, 0);
      }
      return;
    }
    // ---- procedural camera layer: bob, sway, roll, landing, recoil ----
    const rig = this.cameraRig;
    if (p.landImpact > 0) {
      const k = rig.addLanding(p.landImpact);
      if (k > 0.12) {
        this.fx.shake(k * 0.35);
        audio.play('step', { vol: 0.6 + k * 0.9 });
      }
      p.landImpact = 0;
    }
    const rigState = this._camState || (this._camState = {});
    rigState.speed = p.speed2D || 0;
    rigState.maxSpeed = p.maxSpeed || CFG.WALK_SPEED;
    rigState.sprinting = !!p.sprinting;
    rigState.grounded = !!p.grounded;
    rigState.crouching = !!p.crouched;
    rigState.sliding = !!p.sliding;
    rigState.ads = p.adsT;
    rigState.strafe = p.strafeInput || 0;
    rigState.mdx = p.mdx || 0;
    rigState.mdy = p.mdy || 0;
    // While down the health term would sit at zero and drive the breathing to
    // its deepest, which reads as camera shake — exactly what we just removed.
    // The down overlay already communicates the state; keep the camera still.
    rigState.health01 = p.down ? 1 : clamp(p.hp / Math.max(1, p.maxHpNow), 0, 1);
    rig.update(dt, rigState);

    // Eye height is smoothed so stairs and ramps glide instead of stepping.
    const eyeY = rig.smoothEye(p.y + p.eyeHeight, dt, p.grounded);

    // Bob/lean are authored in the camera's own frame, so rotate them into
    // world space along the current view basis before applying.
    const yaw = p.yaw + sh.yaw + rig.yaw;
    const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
    this.camera.position.set(
      p.x + rightX * rig.offsetX,
      eyeY + rig.offsetY,
      p.z + rightZ * rig.offsetX,
    );
    this.camera.rotation.set(
      p.pitch + sh.pitch + rig.pitch,
      yaw,
      sh.roll + rig.roll,
    );

    // fov: base * ads zoom * sprint/slide stretch
    const s = p.stats;
    const zoom = s ? lerp(1, s.zoom, p.adsT) : 1;
    const targetFov = this.options.fov * zoom + rig.fovAdd;
    if (Math.abs(this.camera.fov - targetFov) > 0.02) {
      // ADS must snap; sprint stretch can breathe.
      this.camera.fov = damp(this.camera.fov, targetFov, p.adsT > 0.02 ? 20 : 11, dt);
      this.camera.updateProjectionMatrix();
    }

    // Post reacts to the state of the body: motion blur eases off when aiming
    // (you want a readable sight picture), and ADS racks focus onto the target.
    const fxp = this.postfx;
    if (fxp) {
      fxp.motionBlurStrength = this._mbUserStrength * (1.0 - p.adsT * 0.55);
      // Focus racks onto the sight line when aiming, but gently: this is a
      // wave shooter, and blurring an enemy at five metres to look cinematic
      // would cost the player the shot.
      fxp.dofMaxBlur = p.adsT > 0.45 ? lerp(0, 5.5, (p.adsT - 0.45) / 0.55) : 0;
      fxp.dofFocus = 14;
      fxp.dofRange = 30;
      // Sprinting narrows the tunnel a little; low health closes it further.
      const hurt = 1 - rigState.health01;
      fxp.vignette = 0.34 + rig.sprintT * 0.12 + hurt * 0.3;
      fxp.chromatic = 0.11 + rig.sprintT * 0.05 + hurt * 0.16;
      fxp.saturation = (this.map?.grade?.saturation ?? 1.1) * (1 - hurt * 0.35);
    }
  }

  pickSpectate() {
    this.spectateTarget = null;
    for (const [id, rp] of this.remotePlayers) {
      if (!rp.dead && !rp.down) { this.spectateTarget = id; break; }
    }
    this.syncSpectateView();
  }

  syncSpectateView() {
    // hide the model of whoever we're riding with — you're looking THROUGH
    // their eyes, not through the inside of their skull
    for (const [id, rp] of this.remotePlayers) {
      const hide = id === this.spectateTarget;
      if (rp.group) rp.group.visible = !hide;
    }
    const rp = this.spectateTarget ? this.remotePlayers.get(this.spectateTarget) : null;
    this.hud.papNotice(rp ? `SPECTATING — ${rp.name.toUpperCase()}` : null);
  }

  // ---------------- HUD ----------------
  updateHUD(dt) {
    const p = this.player;
    const s = p.stats;
    this.hud.setAmmo(p.weapon ? p.weapon.mag : 0, p.weapon ? p.weapon.reserve : 0, s ? s.displayName : '');
    this._dropTimerState.insta = this.instaT;
    this._dropTimerState.double = this.doubleT;
    this.hud.setDropTimers(this._dropTimerState);
    this.hud.healthPulse(p.hp / p.maxHpNow);
    const spreadPx = s ? (lerp(s.spreadHip + p.spreadBloom, s.spreadAds, p.adsT) * 900) : 10;
    // crosshair only for hip fire — ADS means you're on the sights/optic/scope
    // The crosshair stays up while down — you can still shoot, so firing blind
    // would just be a bug wearing a costume.
    this.hud.setCrosshair(spreadPx, input.locked && p.adsT < 0.5 && !p.dead && !this.over && !this._scoped, p.adsT);
    const showScores = !!input.keys['Tab'];
    this.hud.scoreboard(showScores, showScores ? this.scoreRows() : null);
    const speaking = this._computeSpeaking();
    this.hud.micIndicator(speaking);
    // The always-visible co-op strip is intentionally fed from the same
    // synchronized player state as the Tab scoreboard. Keep it at 10Hz so
    // voice/points feel immediate without rebuilding presentation data every
    // render frame; HUD performs a second signature-based DOM no-op check.
    this._rosterT = (this._rosterT || 0) - dt;
    if (this._rosterT <= 0) {
      this._rosterT = 0.1;
      this.hud.multiplayerRoster(this.mode !== 'solo', this.multiplayerRosterRows());
    }
    // minimap at 10Hz (canvas ops every frame are wasteful in 4-player lobbies)
    this._mmT = (this._mmT || 0) - dt;
    if (this._mmT <= 0) { this._mmT = 0.1; this.hud.drawMinimap(this); }
    if (p.down && this.mode !== 'solo') {
      const br = this.beingRevivedState();
      this.hud.downUI(true, p.bleedout / CFG.BLEEDOUT_TIME,
        br ? `BEING REVIVED BY ${br.by.toUpperCase()}` : false, false);
    }
    if (this.phase === 'intermission') {
      this.hud.waveProgress(true, `Next round in ${Math.ceil(this.phaseT)}`);
    } else if (this.zombies.dogRound && this.phase === 'active') {
      this.hud.waveProgress(true, `HOUNDS REMAINING: ${this.zombies.dogRemaining}`);
    } else this.hud.waveProgress(false);
    this.barkCd = Math.max(0, this.barkCd - dt);
    // Perk lamps striking one after another as the power comes up.
    if (this._perkLampRamp) {
      const r = this._perkLampRamp;
      r.t += dt;
      let done = true;
      for (let i = 0; i < r.lamps.length; i++) {
        const k = Math.min(1, Math.max(0, (r.t - r.delays[i]) / 0.45));
        r.lamps[i].intensity = 9 * (k * k * (3 - 2 * k));
        if (k < 1) done = false;
      }
      if (done) this._perkLampRamp = null;
    }
    // gramophone song + radio music box follow your ears
    if (audio.songPlaying) audio.updateSongSpatial();
    audio.updateMusicBoxSpatial();
    // fog for dog rounds
    const dog = this.zombies.dogRound && this.phase === 'active';
    const fogT = dog ? this.fogDog : this.fogNormal;
    this.scene.fog.color.lerp(fogT.color, dt * 1.5);
    this.scene.fog.density = damp(this.scene.fog.density, fogT.d, 1.5, dt);
    // The sky closes onto the fog colour at the horizon so the two sides of the
    // skyline meet at one value; that only holds if it follows the fog when the
    // fog moves.
    this.map.sky?.setFogColor?.(this.scene.fog.color);
  }

  minimapPlayers() {
    const out = [{ x: this.player.x, z: this.player.z, yaw: this.player.yaw, me: true, color: '#fff', down: false }];
    for (const [, rp] of this.remotePlayers) {
      // A dead teammate's last transform stops being updated, so leaving the
      // blip up pins a stale marker on the map for the rest of the round.
      if (rp.dead) continue;
      out.push({ x: rp.x, z: rp.z, yaw: rp.yaw || 0, me: false, color: CFG.COLORS[(rp.colorIdx ?? 0) % 4], down: !!rp.down });
    }
    return out;
  }

  _computeSpeaking() {
    // up to 4 speaker names (Xbox 360 lobby style); net owns streams + ducking
    const names = this._speakingNames;
    names.length = 0;
    if (!this.net) return names;
    this.net.updateVoiceSpeaking();
    for (const [id, vs] of this.net.voiceStreams) {
      if (vs.speaking && !this.net.mutedPeers.has(id) && names.length < 4) names.push(this.remotePlayers.get(id)?.name || 'TEAMMATE');
    }
    return names;
  }

  multiplayerRosterRows() {
    const roster = [];
    const myId = this.player?.id || this.net?.myId || 'local';
    const localLobby = this.lobbyPlayers.find((entry) => entry.id === myId);
    roster.push({
      id: myId,
      name: this.player?.name || this.myName,
      persona: localLobby?.persona || PERSONAS[this.personaIdx]?.id || 'dempsey',
      c: this.myColor,
      points: this.player?.points || 0,
      micEnabled: !!this.net?.myStream && !this.net?.micMuted,
      speaking: !!this.net?.mySpeaking,
    });
    for (const [id, rp] of this.remotePlayers) {
      const lobby = this.lobbyPlayers.find((entry) => entry.id === id);
      const voice = this.net?.voiceStreams?.get(id);
      roster.push({
        id,
        name: rp.name || lobby?.name || 'Player',
        persona: lobby?.persona || PERSONAS[rp.personaIdx]?.id || 'dempsey',
        c: rp.colorIdx ?? lobby?.color ?? 0,
        points: rp.points || 0,
        micEnabled: !!voice && !this.net?.mutedPeers?.has(id),
        speaking: !!voice?.speaking && !this.net?.mutedPeers?.has(id),
      });
    }
    return roster;
  }

  setMicMuted(m) {
    this.micMuted = m;
    this.net?.setMicMuted(m);
  }

  scoreRows() {
    const rows = [{ name: this.player.name, c: this.myColor, kills: this.player.kills, downs: this.player.downs, revives: this.player.revives, points: this.player.points, down: this.player.down, dead: this.player.dead }];
    for (const [, rp] of this.remotePlayers) rows.push({ name: rp.name, c: rp.colorIdx, kills: rp.kills, downs: rp.downs, revives: rp.revives, points: rp.points, down: rp.down, dead: rp.dead });
    return rows;
  }
}
