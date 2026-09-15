// Game orchestrator: rendering, loop, shooting, economy, rounds, interactions,
import * as THREE from 'three';

import { clamp, rand, dist2D } from './utils.js';
import { input, lockPointer, endFrame, isAimDown } from './input.js';
import { audio } from './audio.js';
import { variantCount } from './personas.js';
import { buildMap } from './map.js';
import { buildMonkey } from './weapons.js';
import { WeaponRig } from './weapons.js';
import { ZombieManager } from './zombies.js';
import { LocalPlayer, RemotePlayer } from './player.js';
import { FX } from './fx.js';
import { CameraRig } from './render/CameraRig.js';
import { LightPool } from './render/LightPool.js';
import { HellhoundFX } from './render/HellhoundFX.js';
import { GameFramePacing } from './game/frame-pacing.js';
import { GameGraphics } from './game/graphics.js';
import { GameBallistics } from './game/ballistics.js';
import { GameRounds } from './game/rounds.js';
import { GameCombat } from './game/combat.js';
import { GameProjectiles } from './game/projectiles.js';
import { GameCameraHud } from './game/camera-hud.js';
import { GameNetcode } from './game/netcode.js';
import { GameCheats } from './game/cheats.js';
import { GameMysteryBox } from './game/mystery-box.js';
import { GamePackAPunch } from './game/pack-a-punch.js';
import { GameInteractions } from './game/interactions.js';
import { GameMachines } from './game/machines.js';
import { GamePlayers } from './game/players.js';
import { GameRemoteCombat } from './game/remote-combat.js';

export class Game {
  constructor({ mode, net, options, hud, myName, lobbyPlayers, onExit, cheats }) {
    this.mode = mode; // 'solo' | 'host' | 'client'
    this.net = net;
    this.options = options;
    this.cheats = cheats || {};
    this.godMode = false;
    this.hud = hud;
    this.onExit = onExit;
    this.myName = myName || 'Player';
    this.lobbyPlayers = lobbyPlayers || [{ id: 'local', name: this.myName, color: 0 }];
    this.time = 0;
    this.paused = false;
    this.over = false;
    this.round = 0;
    this.phase = 'pre'; // pre | active | intermission
    this.phaseT = 0;
    this.killsThisGame = 0;
    this.projectiles = [];
    this.grenades = [];
    this.monkeyEntities = [];
    this.doubleT = 0;
    this.instaT = 0;
    this.qrSelfRevives = this.mode === 'solo' ? 3 : 0;
    this.teleLinks = 0;
    this.papState = { busy: false, t: 0, ready: false, weapon: null, owner: null, slot: null };
    this._papWhirr = null;        // the one-shot cycle loop, held so it can be cut
    this._papWhirrStarted = false;
    this._papOutput = null;
    this.boxState = { state: 'idle', t: 0, weapon: null, completedWeaponSpins: 0 };
    this._dogRoundReward = null;
    this.holdF = 0;
    this.currentInteract = null;
    this.snapTimer = 0;
    this.inputTimer = 0;
    this.remotePlayers = new Map();
    this._remoteShots = new Map();
    this._remoteGrenades = new Map();
    this._remoteActionAt = new Map();
    this._remoteCreditClaims = new Map();
    this._pendingHitClaims = new Map();
    this._nextCreditId = 1;
    this._nextBoardCreditId = 1;
    this._seenBoardCredits = new Set();
    this._playerStateCache = [];
    this._playerStateById = new Map();
    this._snapshotPlayerIds = new Set();
    this._rigFrameState = { ads: false, moving: false, sprinting: false, sliding: false, mouseX: 0, mouseY: 0 };
    this._dropTimerState = { insta: 0, double: 0 };
    this._aimEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._aimDir = new THREE.Vector3(0, 0, -1);
    this._projectileOrigin = new THREE.Vector3();
    this._projectileDir = new THREE.Vector3();
    this._speakingNames = [];
    this.myColor = 0;
    this.personaIdx = 0;
    this.barkCd = 0;
    this.localPerkDrink = null;
    this.disposed = false;
  }

  get isAuthority() { return this.mode !== 'client'; }

  init(canvas) {
    this.canvas = canvas;
    this._initRendering(canvas);

    this.map = buildMap(this.scene, { mode: this.mode });
    // Prefilter the sky into a radiance probe. Every MeshStandardMaterial in
    // the map now gets directional ambient and a real specular horizon instead
    // of a flat hemisphere constant — this is most of the "PBR" look.
    this.scene.environment = this.map.sky.buildEnvironment(this.renderer, 256);
    this.scene.environmentIntensity = 1.0;
    this.applyQuality();

    // players
    const myIdx = Math.max(0, this.lobbyPlayers.findIndex((p) => p.id === (this.net?.myId ?? 'local')));
    this.myColor = this.lobbyPlayers[myIdx]?.color ?? myIdx;
    {
      const PIDS = ['dempsey', 'nikolai', 'takeo', 'richtofen'];
      const me = this.lobbyPlayers.find((l) => l.id === (this.net?.myId ?? 'local'));
      const pid = me?.persona || localStorage.getItem('der-riese-persona') || 'dempsey';
      this.personaIdx = Math.max(0, PIDS.indexOf(pid));
    }
    const spawnBase = this.map.playerSpawns[0];
    // co-op: everyone spawns together at the mainframe platform (small ring offsets,
    // radius keeps everyone clear of the mainframe machine collider)
    const ringOff = (i) => i === 0 ? { x: 0, z: 0 } : { x: Math.cos(i * 2.1) * 1.0, z: Math.sin(i * 2.1) * 1.0 };
    const myOff = ringOff(myIdx);
    const spawn = { x: spawnBase.x + myOff.x, z: spawnBase.z + myOff.z };
    this.player = new LocalPlayer(this.net?.myId ?? 'local', this.myName, this.myColor, spawn);
    this.player.y = this.map.floorY(spawn.x, spawn.z, 2); // stand ON the platform, not inside it
    this.player.yaw = 0; // -Z from the mainframe spawn faces the courtyard
    for (const lp of this.lobbyPlayers) {
      if (lp.id === this.player.id) continue;
      const rp = new RemotePlayer(this.scene, { id: lp.id, name: lp.name, c: lp.color, persona: Math.max(0, ['dempsey', 'nikolai', 'takeo', 'richtofen'].indexOf(lp.persona || 'dempsey')) });
      const o = ringOff(this.lobbyPlayers.indexOf(lp));
      rp.x = spawnBase.x + o.x; rp.z = spawnBase.z + o.z;
      rp.y = this.map.floorY(rp.x, rp.z, 2);
      this.remotePlayers.set(lp.id, rp);
    }

    this.bots = []; // CPU squad bots removed (never worked well enough)
    // Footsteps fire off the camera's stride phase so audio lands exactly on
    // the visual footfall, and slide/mantle get their own foley.
    this.cameraRig = new CameraRig();
    this.cameraRig.onFootstep = (strength) => {
      if (!this.player?.grounded || this.player.down || this.player.dead) return;
      audio.play('step', { vol: 0.55 * strength });
    };
    // The slide used to borrow a footstep at each end, which gave the motion a
    // beginning and an end but no middle. `slide` is one 1.05 s scrape built to
    // the same deceleration curve the player actually runs.
    this.player.onSlideStart = () => {
      this._slideSfx = audio.play('slide');
      this.fx.shake(0.12);
    };
    this.player.onSlideEnd = (intoCrouch) => {
      // A slide cut short — a wall, a ledge, aiming out of it — must not leave
      // the floor still scraping under a body that has stopped moving. A slide
      // that runs its full length has already finished, so this is a no-op.
      audio.fadeOut(this._slideSfx, 0.14);
      this._slideSfx = null;
      // Gear settling as you come up (or drop the rest of the way into cover).
      audio.play('foley_cloth', { vol: intoCrouch ? 0.5 : 0.36 });
    };
    this.player.onMantle = () => { audio.play('step', { vol: 0.8 }); };
    this.weaponRig = new WeaponRig(this.camera);
    this.weaponRig.equip('m1911', false);
    this._mountViewmodel();
    this.fx = new FX(this.scene);
    this.houndFX = new HellhoundFX(this.scene, this.fx);
    this.fx.postActive = !!this.postfx;
    this.fx.onDamageFlash = (amount) => { this._postDamage = Math.min(1, (this._postDamage || 0) + 0.75 * amount); };
    this.fx.onScreenFlash = (color, ms, opacity) => { this._postFlash = Math.min(3, (this._postFlash || 0) + opacity * 1.6); };
    this._syncPostFxScene();
    this.zombies = new ZombieManager(this.scene, this.map, {
      onKilled: (z, info) => this.onZombieKilled(z, info),
      onPlayerDamaged: (pid, dmg, x, z) => this.onZombieDamagePlayer(pid, dmg, x, z),
      onBoardTorn: (b) => this.onBoardTorn(b),
      onGroan: (z) => { if (!z.dog) audio.play('groan', { pos: z }); }, // hounds never moan like zombies
      onSnarl: (z) => { if (z.dog) audio.play('dog', { pos: z }); else audio.play('snarl', { pos: z, vol: 0.6 }); },
      onStep: (z) => {
        // zombies are SILENT (no groans, no shuffles) — hellhounds growl sparsely
        if (z.dog && Math.random() < 0.14) audio.play('dog', { pos: z, vol: 0.4 });
      },
      onSpawned: (z) => {
        // Ground spawns are an emergence, not an appearance. Hounds tear the
        // ground open with hellfire; zombies claw up through dirt and dust.
        if (!z) return;
        if (z.dog) this.houndFX?.houndSpawn(z.x, z.y, z.z);
        else {
          this.houndFX?.zombieRise(z.x, z.y, z.z);
          audio.play('board_tear', { pos: z, vol: 0.5, rate: rand(0.7, 0.85) });
        }
      },
      // Dirt keeps being thrown while the corpse fights its way out, heaviest
      // on the two heaves — see the RISE case in zombies.js.
      onRiseDirt: (z, floorY, t) => this.houndFX?.riseDirt(z.x, floorY, z.z, t),
      onRiseDone: (z, floorY) => {
        this.houndFX?.riseSettle(z.x, floorY, z.z);
        // Dog rounds skip the window barriers entirely, so every hound spawns
        // through a ground riser and finishes here — the moan that sells a
        // corpse hauling itself free must never come out of a hellhound.
        if (!z.dog) audio.play('groan', { pos: z, vol: 0.7 });
      },
      onDogRound: () => this.onDogRound(),
      onZombieHit: (z, info) => {},
      onCrawler: (z) => audio.play('snarl', { pos: z, vol: 0.5 }),
    }, this.isAuthority);

    this.phaseT = 4.5;
    this.hud.setPoints(this.player.points);
    this.hud.setGrenades(4, 0);
    this.hud.setPerks(this.player.perks);
    this.hud.setRound(null);
    this.applyCheats();
    this._configureRemoteSpawnLoadouts();
    this._resize = () => this.onResize();
    addEventListener('resize', this._resize);
    this._visualViewport = window.visualViewport || null;
    this._visualViewport?.addEventListener('resize', this._resize);
    this.onResize();
    // Pointer-lock/fullscreen browser chrome can change the visual viewport one
    // frame after the match appears. Re-measure after layout settles so the
    // first round cannot inherit a cropped or stretched canvas.
    requestAnimationFrame(() => { if (!this.disposed) this.onResize(); });

    if (this.net) {
      this.wireNet();
      // Reliable initial equip removes the race where the first shot arrives
      // before an unreliable snapshot, while the host still validates it
      // against the lobby's configured spawn-loadout allowance.
      if (!this.isAuthority && this.player.weapon) {
        this.netSend({ t: 'swap', w: this.player.weapon.id, pap: !!this.player.weapon.pap, spawn: 1 });
      }
    }
    // Lights must illuminate both the world pass and the viewmodel pass, so
    // they are the one object type that belongs to every layer.
    this.scene.traverse((o) => { if (o.isLight) o.layers.enableAll(); });

    // Forward rendering evaluates every enabled point light per pixel. The map
    // authors ~65 of them; a fixed-size pool mirrors only the ones that matter
    // from where the camera is, keeping NUM_POINT_LIGHTS constant so nothing
    // recompiles. See js/render/LightPool.js.
    this.lightPool = new LightPool(this.scene, this._lightBudget());
    this.lightPool.rescan();
    // After the pool: programs are keyed on the light count, and this is the
    // light state every frame will render with.
    this._prewarmShaders();

    this._installAudioOcclusion();

    audio.startAmbience();
    // voice chat: streams/analysers/mute live on net (shared with the lobby UI);
    // mic is normally already live from the lobby — this is just the fallback.
    this.micMuted = !!this.net?.micMuted;
    if (this.net?.lobbyVoiceEnabled) this.net.enableVoice();
    // mic level for own indicator
    this._micLevel = 0;
    this.clock = performance.now() / 1000;
    const frame = () => { if (this.disposed) return; this._raf = requestAnimationFrame(frame); this.tick(); };
    this._raf = requestAnimationFrame(frame);
    // keep simulation & netcode alive if the tab is backgrounded (rAF throttled)
    this._watchdog = setInterval(() => {
      if (this.disposed) return;
      if (performance.now() / 1000 - this.clock > 0.2) this.tick(false);
      this._healHiddenCanvas();
    }, 100);
  }

  // ================= main loop =================
  tick(shouldRender = true) {
    const now = performance.now() / 1000;
    let dt = Math.min(0.05, now - this.clock);
    this.clock = now;
    if (shouldRender && !document.hidden) this._tuneRenderScale(dt, now);
    // co-op pause rule: world halts only when EVERY player is paused
    const total = Math.max(1, this.lobbyPlayers.length);
    const pausedCount = (this.paused ? 1 : 0) + (this.remotePaused ? this.remotePaused.size : 0);
    const worldPaused = this.mode === 'solo' ? this.paused : pausedCount >= total;
    if (!worldPaused) {
      this.time += dt;
      // A throw out of update() used to take the rest of the frame with it, and
      // the frame loop queues its next rAF BEFORE calling tick(), so it threw
      // again forever. Two things made that a hang rather than a hiccup: render()
      // below never ran, so the picture froze on the last good frame; and
      // update()'s trailing endFrame() never ran, so edge-triggered keys stayed
      // latched and every held interaction — papTake() among them — re-fired on
      // every frame. Contain it: clear the input edges, report it once, and let
      // the frame finish drawing.
      try {
        this.update(dt);
      } catch (e) {
        endFrame();
        if (!this._updateFailed) { this._updateFailed = true; console.error('game update failed', e); }
      }
    }
    // Post overlays decay on wall-clock time so they still clear while paused.
    this._postDamage = Math.max(0, (this._postDamage || 0) - dt * 3.2);
    this._postFlash = Math.max(0, (this._postFlash || 0) - dt * 7);
    if (shouldRender) {
      this.render(dt);
      this._countFrame(now);
    }
  }

  update(dt) {
    const p = this.player;
    // In co-op the world keeps simulating while THIS player is paused,
    // but the paused player's own body/input/camera must freeze.
    if (!this.paused) {
      // timers
      this.doubleT = Math.max(0, this.doubleT - dt);
      this.instaT = Math.max(0, this.instaT - dt);
      this.zombies.instakill = this.instaT > 0;

      // player
      p.update(dt, this);
      this.updateCamera(dt);
      const scopedNow = !!(p.stats?.scope && this.player.adsT > 0.6 && !p.down && !p.dead);
      if (scopedNow !== this._scoped) { this._scoped = scopedNow; this.hud.scope(scopedNow); }
      // never let the view-model leak into the scope picture (rig re-shows it each frame otherwise)
      this.weaponRig.rigHidden = scopedNow;
      // PaP ritual finished -> pull the other weapon (never the one in the machine)
      if (this._papSwapPending && this.weaponRig.knuckleT <= 0) {
        this._papSwapPending = false;
        if (p.weapons.length > 1 && p.weapon.upgrading) {
          this.weaponRig.papHide = false;
          this.switchWeapon(1 - p.cur);
        } else {
          // With only one weapon there is nothing to draw while it is inside
          // the machine. Keep the viewmodel empty until papTake() equips the
          // upgraded output (or a rejected request restores the original).
          this.weaponRig.papHide = !!p.weapon?.upgrading;
        }
      }
      const rigState = this._rigFrameState;
      rigState.ads = isAimDown() && !p.down && !p.dead && !this.weaponRig.isReloading;
      rigState.moving = !!p.moving;
      rigState.sprinting = p.sprinting;
      rigState.sliding = !!p.sliding;
      rigState.mouseX = p.mdx || 0;
      rigState.mouseY = p.mdy || 0;
      this.weaponRig.update(dt, rigState);
      this.updatePerkDrinks(dt);

      // shooting inputs
      if (!this.over && input.locked) this.handleCombatInput(dt);

      // interactions
      this.updateInteract(dt);
    }

    // zombies
    // Nothing to chase means nothing to chase toward: stand and breathe rather
    // than sprint on the spot at a body. Re-evaluated every frame, so a revive
    // puts the horde straight back on the hunt.
    this.zombies.setDormant(!this.hordeHasPrey());
    if (this.isAuthority) {
      this.zombies.update(dt, this.allPlayerStates());
      this.updateRounds(dt);
      this.updateDrops(dt);
      this.updateTraps(dt);
      this.updateMonkeyHost(dt);
    } else {
      this.zombies.interpolate(this.time);
      // The host announces intermission once. Clients run the same visible
      // countdown locally; respawning is no longer coupled to the next round.
      if (this.phase === 'intermission') {
        this.phaseT = Math.max(0, this.phaseT - dt);
        if (this.player.dead) this.respawnSelf();
      }
      // animation LOD: nearby zombies animate every frame, far ones at reduced rate
      this._animFrame = ((this._animFrame || 0) + 1) | 0;
      const px = this.player.x, pz = this.player.z;
      for (const [, z] of this.zombies.zombies) {
        const d2 = (z.x - px) ** 2 + (z.z - pz) ** 2;
        const every = d2 < 625 ? 1 : d2 < 2025 ? 2 : 3;
        this.zombies.animate(z, dt, ((this._animFrame + z.id) % every) !== 0);
      }
    }

    // projectiles & grenades
    this.updateProjectiles(dt);
    this.updateGrenades(dt);

    // remote players
    for (const [, rp] of this.remotePlayers) rp.interpolate(this.time, dt, this.camera);

    // box / pap state machines (authority drives; clients mirror via events)
    this.updateBox(dt);
    this.updatePap(dt);

    // map & fx
    // The shadow box follows the player, biased forward so the visible half of
    // the frustum is the half they are actually looking into.
    this._shadowFocus = this._shadowFocus || new THREE.Vector3();
    this._shadowFocus.set(
      p.x - Math.sin(p.yaw) * 9,
      Math.max(0, p.y) + 1,
      p.z - Math.cos(p.yaw) * 9,
    );
    this.map.update(dt, this.map.power.on, this._shadowFocus);
    this.houndFX?.update(dt, this.zombies.zombies, this.camera.position);
    this.lightPool?.update(dt, this.camera.position);
    // After the pool, which is what refreshes each source's peak-held intensity.
    this._updateVolumetricLights(dt);
    this.fx.update(dt, this.camera, this.time);

    // How pressed the player is right now: closest enemy inside 12m, weighted
    // by how many are in that ring. Drives the mix's tension state.
    {
      let nearest = 1e9, crowd = 0;
      for (const [, z] of this.zombies.zombies) {
        if (z.dead) continue;
        const d2 = (z.x - p.x) ** 2 + (z.z - p.z) ** 2;
        if (d2 < 144) { crowd++; if (d2 < nearest) nearest = d2; }
      }
      const prox = nearest < 1e9 ? 1 - Math.sqrt(nearest) / 12 : 0;
      this._nearThreat = clamp(prox * 0.7 + Math.min(1, crowd / 8) * 0.3, 0, 1);
    }

    // audio listener + jingles
    audio.updateListener(p.x, p.y + 1.6, p.z, p.yaw);
    // Room drives reverb zone selection; health and nearby threat drive the
    // ducking/low-pass/heartbeat state of the mix.
    audio.setListenerRoom(this.map.roomAt(p.x, p.z, p.y)?.id || null);
    audio.setIntensity({
      health: clamp(p.hp / Math.max(1, p.maxHpNow), 0, 1),
      threat: clamp(this._nearThreat || 0, 0, 1),
    });
    for (const perk of this.map.perks) {
      const d = dist2D(p.x, p.z, perk.x, perk.z);
      if (d < 26) {
        audio.startJingle(perk.jingleId, perk.id);
        const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
        audio.setJingleProximity(perk.jingleId, d, ((perk.x - p.x) * rx + (perk.z - p.z) * rz) / Math.max(1, d));
      }
    }

    // net sync
    if (this.net) this.updateNet(dt);

    // HUD
    this.updateHUD(dt);
    endFrame(); // consume edge-triggered inputs at end of the frame
  }

  // ---------------- bot actions (authority) ----------------
  botFire(bot, z) {
    const s = bot.stats;
    if (!s || bot.weapon.mag <= 0) return;
    bot.weapon.mag--;
    audio.play(s.sfx, { pos: { x: bot.x, y: bot.y + 1.5, z: bot.z }, vol: 0.8 });
    const d = dist2D(bot.x, bot.z, z.x, z.z);
    const acc = clamp(0.9 - d * 0.011, 0.3, 0.9) * (this.zombies.instakill ? 1 : 1);
    if (Math.random() > acc) { this.fx.tracer(bot.x, bot.y + 1.45, bot.z, z.x + rand(-1, 1), z.y + 1.2, z.z + rand(-1, 1), 0xffd9a0); return; }
    const head = Math.random() < 0.22;
    const dmg = s.dmg * (head ? s.headMult : 1) * (this.zombies.instakill ? 100 : 1);
    this.fx.tracer(bot.x, bot.y + 1.45, bot.z, z.x, z.y + (head ? 1.5 : 1.0), z.z, 0xffd9a0);
    const res = this.zombies.damage(z.id, dmg, { head, by: bot.id, weapon: s, pap: bot.weapon.pap });
    if (res.ok && res.killed) { bot.kills++; bot.points += head ? 100 : 60; }
  }

  botMelee(bot, z) {
    if ((bot.meleeCd || 0) > this.time) return;
    bot.meleeCd = this.time + 0.7;
    audio.play('melee');
    const res = this.zombies.damage(z.id, bot.bowie ? 1000 : 150, { head: false, by: bot.id, weapon: { headMult: 1 } });
    if (res.ok && res.killed) { bot.kills++; bot.points += 130; }
  }

  botRevive(bot, target) {
    const pl = this.allPlayerStates().find((p) => p.id === target.id);
    if (!pl || !pl.down) return;
    if (target.id === this.player.id) {
      this.player.down = false; this.player.hp = this.player.maxHpNow;
    } else {
      const rp = this.remotePlayers.get(target.id);
      if (rp) { rp.down = false; }
      const b2 = this.bots.find((b) => b.id === target.id);
      if (b2) { b2.down = false; b2.hp = b2.maxHp; }
    }
    bot.revives++;
    audio.play('revive');
    this.netSend({ t: 'revive', pid: target.id });
  }

  botUsePower(bot) {
    if (this.map.power.on) return;
    this.setPower(true);
    this.netSend({ t: 'power' });
    this.botBark(bot, 'power', 0.9);
  }

  botUseBox(bot) {
    const bs = this.boxState;
    if (bs.state !== 'idle' || !bot.spend(950)) return;
    audio.play('buy');
    this.boxStartSpin(bot.weapons.map((w) => w.id));
    // bot takes whatever comes up when ready
    bot._takeBoxT = 4.6;
  }

  botLinkTele(bot, tele) {
    if (this.teleLinks >= 3) return;
    this.linkTeleporter(tele);
    this.botBark(bot, 'tele', 0.8);
  }

  botThrowMonkey(bot) {
    audio.play('monkey_windup');
    const dir = { x: Math.sin(bot.yaw), z: Math.cos(bot.yaw) };
    const e = {
      kind: 'monkey', x: bot.x, y: bot.y + 1.4, z: bot.z,
      vx: dir.x * 10, vy: 4, vz: dir.z * 10, fuse: 8, mesh: null, by: bot.id,
    };
    e.mesh = buildMonkey();
    e.mesh.scale.setScalar(1.15);
    e.clashT = 0;
    e.mesh.position.set(e.x, e.y, e.z);
    this.scene.add(e.mesh);
    this.grenades.push(e);
  }

  botDied(bot) {
    this.netSend({ t: 'dead', pid: bot.id });
  }

  botBark(bot, event, chance = 1) {
    if (Math.random() > chance) return;
    const n = variantCount(bot.personaIdx, event);
    if (!n) return;
    this.playBark(bot.personaIdx, event, Math.floor(Math.random() * n), { x: bot.x, y: bot.y + 1.5, z: bot.z });
    this.netSend({ t: 'bark', p: bot.personaIdx, e: event, v: Math.floor(Math.random() * n), pid: bot.id });
  }

  setPaused(v) {
    if (this.paused === v) return;
    this.paused = v;
    this.netSend({ t: 'pause', on: v ? 1 : 0, pid: this.player?.id });
  }

  endMatchToLobby() {
    if (this.mode !== 'host') return false;
    const reason = 'The host ended the match — everyone returned to the lobby.';
    this.netSend({ t: 'return_lobby', reason });
    this.exit('lobby', reason);
    return true;
  }

  exit(destination = 'menu', message = '') {
    this.dispose();
    this.onExit?.(destination, message);
  }

  dispose() {
    try { this.net?.disableVoice(); } catch (e) {} // stops mic + detaches every voice element
    if (this.disposed) return;
    this.disposed = true;
    if (this.net) {
      this.net.onEvent = null;
      this.net.onSnap = null;
      this.net.onPlayerState = null;
      this.net.onPeerLeave = null;
    }
    cancelAnimationFrame(this._raf);
    clearInterval(this._watchdog);
    removeEventListener('resize', this._resize);
    this._visualViewport?.removeEventListener('resize', this._resize);
    audio.stopAllJingles();
    audio.stopAmbience();
    audio.stopMusicBox();
    audio.stopSong(); // Beauty of Annihilation must not outlive the match
    this._clearPapOutputWeapon();
    this.hud?.multiplayerRoster(false, []);
    this.houndFX?.dispose();
    this.lightPool?.dispose();
    this.postfx?.dispose();
    this.renderer?.dispose();
  }
}

// Game's methods are split by domain across js/game/*.js. Each file is a class
// whose methods are copied onto Game.prototype here: one `this`, one Game to
// every caller. A name defined twice is a split mistake, so it fails at load.
for (const part of [
  GameFramePacing, GameGraphics, GameBallistics, GameRounds, GameCombat, GameProjectiles,
  GameCameraHud, GameNetcode, GameCheats, GameMysteryBox, GamePackAPunch, GameInteractions,
  GameMachines, GamePlayers, GameRemoteCombat,
]) {
  for (const key of Object.getOwnPropertyNames(part.prototype)) {
    if (key === 'constructor') continue;
    if (Object.getOwnPropertyDescriptor(Game.prototype, key)) throw new Error(`Game.${key} is defined twice`);
    Object.defineProperty(Game.prototype, key, Object.getOwnPropertyDescriptor(part.prototype, key));
  }
}
