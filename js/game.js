// Game orchestrator: rendering, loop, shooting, economy, rounds, interactions,
import * as THREE from 'three';

import { CFG } from './config.js';
import { clamp, lerp, rand, dist2D } from './utils.js';
import { input, lockPointer, endFrame, isAimDown } from './input.js';
import { audio } from './audio.js';
import { assets } from './assets.js';
import { lineFor, variantCount } from './personas.js';
import { buildMap } from './map.js';
import {
  getStats, WEAPONS, buildMonkey,
} from './weapons.js';
import { WeaponRig } from './weapons.js';
import { ZombieManager, ZSTATES, zombieAimPoint } from './zombies.js';
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

// Scratch for the remote muzzle lookup, so a firefight allocates nothing.
const _shotMuzzle = new THREE.Vector3();
// Scratch for the host's claim target, likewise.
const _claimTarget = new THREE.Vector3();
import {
  acceptPendingCredit,
  boundedPelletDirectionAllowed,
  consumeCreditClaim,
  killCreditPresentation,
  remoteShotTargetAllowed,
  remoteSwapSource,
  remoteWeaponClaimAllowed,
  SYNCED_PERK_IDS,
} from './multiplayer-contracts.js';
import {
  isPerkId,
  PERK_DRINK_TIMELINE,
} from './gameplay-rules.js';
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
} from './combat-rules.js';

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

  beginLocalPerkDrink(perk) {
    if (!perk || !isPerkId(perk.id) || this.localPerkDrink || !this.weaponRig.startPerkDrink(perk.id)) return false;
    this.localPerkDrink = { id: perk.id, elapsed: 0, granted: false, broke: false, belched: false };
    audio.play('drink');
    this.sendPerkDrinkAnimation(perk.id);
    return true;
  }

  updatePerkDrinks(dt) {
    const drink = this.localPerkDrink;
    if (!drink) return;
    const p = this.player;
    drink.elapsed += dt;
    if ((p.down || p.dead) && !drink.granted) {
      if (this.weaponRig.perkBottle) this.weaponRig.perkBottle.visible = false;
      this.weaponRig.perkDrinkT = 0;
      this.localPerkDrink = null;
      return;
    }
    if (!drink.granted && drink.elapsed >= PERK_DRINK_TIMELINE.grantAt) {
      drink.granted = true;
      p.perks.add(drink.id);
      if (drink.id === 'jug') p.hp = CFG.JUG_HP;
      this.hud.setPerks(p.perks);
      // No screen flash here. The grant lands at 1.56s, mid-gulp, so a white
      // full-screen blowout read as a random glitch rather than as feedback —
      // and the post path drives uFlash, which has no colour to tint toward the
      // perk. The HUD chip, the belch and the bottle smash carry the beat.
      this.netSend({ t: 'perk', id: drink.id });
    }
    if (!drink.broke && drink.elapsed >= PERK_DRINK_TIMELINE.breakAt) {
      drink.broke = true;
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      const x = p.x + fx * 1.2 - rx * 0.65, z = p.z + fz * 1.2 - rz * 0.65;
      const y = Math.max(0.08, this.map.floorY(x, z, p.y + 1) + 0.08);
      audio.play('bottle_break', { pos: { x, y, z } });
      this.fx.spawnParticles(x, y, z, { count: 18, color: [0.65, 0.88, 0.75], speed: 2.2, spread: 0.8, life: 0.55, grav: 8, size: 0.85 });
    }
    if (!drink.belched && drink.elapsed >= PERK_DRINK_TIMELINE.belchAt) {
      drink.belched = true;
      audio.play('belch', { pos: { x: p.x, y: p.y + 1.55, z: p.z } });
    }
    if (drink.elapsed >= PERK_DRINK_TIMELINE.duration) this.localPerkDrink = null;
  }

  sendPerkDrinkAnimation(perkId) {
    if (!this.net || !SYNCED_PERK_IDS.includes(perkId)) return false;
    // Host-originated events are already authoritative; guest identity is added
    // by Net from the authenticated connection, never from this payload.
    this.netSend(this.isAuthority
      ? { t: 'perk_anim', pid: this.player.id, id: perkId }
      : { t: 'perk_anim', id: perkId });
    return true;
  }

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

  startRemotePerkDrink(pid, perkId) {
    if (pid === this.player.id || !SYNCED_PERK_IDS.includes(perkId)) return false;
    const remote = this.remotePlayers.get(pid);
    if (!remote) return false;
    // RemotePlayer.startPerkDrink(perkId) is the actor-animation integration
    // point. The callback also lets a future cosmetic system observe the event.
    if (typeof remote.startPerkDrink === 'function') remote.startPerkDrink(perkId);
    this.onRemotePerkDrink?.(remote, perkId);
    return true;
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

  // ---------------- persona voice barks ----------------
  bark(event, { force = false, chance = 1 } = {}) {
    if (this.over || this.disposed) return;
    if (this.barkCd > 0 && !force) return;
    if (!force && Math.random() > chance) return;
    const n = variantCount(this.personaIdx, event);
    if (!n) return;
    const v = Math.floor(Math.random() * n);
    this.barkCd = force ? 5 : 16;
    this.playBark(this.personaIdx, event, v);
    this.netSend({ t: 'bark', p: this.personaIdx, e: event, v, pid: this.player.id });
  }

  playBark(pIdx, event, variant, pos = null) {
    const line = lineFor(pIdx, event, variant);
    if (!line) return;
    const buf = assets.sound(line.file);
    if (buf) {
      // character speech rides the SFX bus at full presence — a spoken line is
      // ALWAYS heard (never gated by the zombie-voices slider); teammates positional
      audio.playBuffer(buf, 'vox', { bus: 'sfx', vol: 1.8, pos, refDist: 10, maxDist: 70 });
      if (!pos) this.barkCd = Math.max(this.barkCd, buf.duration + 4); // only my own lines throttle me
    }
    this.hud.voxSub(`${line.persona.label}: ${line.text}`);
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

  // ---------------- zombie->player damage ----------------
  onZombieDamagePlayer(pid, dmg, x, z) {
    if (pid === this.player.id) {
      this.player.damage(dmg, this);
      return;
    }
    const bot = this.bots?.find((b) => b.id === pid);
    if (bot && !bot.down && !bot.dead) {
      bot.hp -= dmg;
      audio.play('hurt');
      if (bot.hp <= 0) {
        bot.hp = 0; bot.down = true; bot.downs++;
        bot.bleedout = CFG.BLEEDOUT_TIME;
        this.botBark(bot, 'down', 0.9);
        this.netSend({ t: 'down', pid: bot.id });
      }
      return;
    }
    this.netSend({ t: 'pdmg', pid, dmg, x, z });
  }

  onPlayerDown(player) {
    this.netSend({ t: 'down', pid: player.id });
    if (player === this.player) {
      this._beingRevived = null; // fresh down — nobody is coming for you yet
      this.bark('down', { force: true });
    }
    if (this.mode === 'solo' && !player.selfReviveAvailable) {
      // solo without quick revive = instant death
      setTimeout(() => { if (player.down && !this.disposed) player.die(this); }, 1200);
    }
  }

  onPlayerDead(player) {
    this.netSend({ t: 'dead', pid: player.id });
    if (player === this.player) this._beingRevived = null;
    if (this.mode !== 'solo') this.pickSpectate();
  }

  respawnSelf() {
    // back from the dead at the new round: full hp, starting pistol, perks gone
    const p = this.player;
    p.dead = false; p.down = false;
    p.bleedout = 0;
    p.weapons = [{ id: 'm1911', pap: false, mag: 8, reserve: 80 }];
    p.cur = 0;
    p.perks.clear();
    p.hp = p.maxHpNow; // after the perk wipe — plain 100, no leftover Jug health
    p.grenades = 2; p.monkeys = 0; p.ownsMonkeys = false;
    p.adsT = 0; p.recoilPitch = 0; p.spreadBloom = 0; p.sprinting = false;
    p.downEase = 0; // stand up instantly here — the teleport hides the cut
    this._deathCamHeld = false; // release the frozen death pose
    this._beingRevived = null;
    this.spectateTarget = null;
    this.syncSpectateView();
    const spawnBase = this.map.playerSpawns[0];
    p.x = spawnBase.x + rand(-1, 1); p.z = spawnBase.z + rand(-1, 1);
    p.y = this.map.floorY(p.x, p.z, 2); // settle onto the platform surface
    p.yaw = 0;
    this.weaponRig.papHide = false;
    this.weaponRig.equip('m1911', false);
    this.camera.fov = clamp(Number(this.options.fov) || 90, 70, 110);
    this.onResize();
    this.hud.downUI(false);
    this.hud.setPerks(p.perks);
    this.hud.setGrenades(p.grenades, p.monkeys);
    this.hud.banner('BACK IN THE FIGHT', '#7ee38a', 'Make it count this time');
    audio.play('revive');
    this.netSend({ t: 'respawn', pid: p.id });
  }

  applyRevive(pid, byPid) {
    const bot = this.bots?.find((b) => b.id === pid);
    if (bot) { bot.down = false; bot.hp = bot.maxHp; return; }
    if (pid === this.player.id) {
      this.player.revive(true, this);
      this._beingRevived = null;
      this.hud.downUI(false);
      this.hud.reviveUI(false);
      this.spectateTarget = null;
      this.syncSpectateView();
    }
    const rp = this.remotePlayers.get(pid);
    if (rp) {
      rp.down = false;
      // hand the real loadout back to the authoritative record
      if (rp._downStash) { rp.authorizeWeapon(rp._downStash.id, rp._downStash.pap, false); rp._downStash = null; }
    }
    if (byPid === this.player.id) {
      this.player.revives++; this.bark('revive', { force: true });
      this.awardPoints(0);
    }
  }

  perkCount(id) { return this.player.perks.has(id) ? 1 : 0; }

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

  _playerEvent(msg, from) {
    const p = this.player;
    switch (msg.t) {
      case 'bark': {
        const rp = msg.pid ? this.remotePlayers.get(msg.pid) : null;
        if (msg.pid && !rp) break; // unknown source — never a full-volume phantom line
        const pos = rp ? { x: rp.x, y: rp.y + 1.5, z: rp.z } : null;
        this.playBark(msg.p ?? 0, msg.e, msg.v ?? 0, pos);
        break;
      }
      case 'perk_anim': {
        // Sanitized host relay. The purchaser already started its first-person
        // animation locally, so ignore the echoed event for that same player.
        if (typeof msg.pid === 'string' && msg.pid !== p.id) this.startRemotePerkDrink(msg.pid, msg.id);
        break;
      }
      case 'perk': break; // legacy perk ownership cosmetic; animation uses perk_anim
      case 'pdmg': {
        if (msg.pid === p.id) p.damage(msg.dmg, this);
        break;
      }
      case 'down': {
        const rp = this.remotePlayers.get(msg.pid);
        if (rp) {
          rp.down = true; rp.perks = [];
          // A downed player fights with the starting sidearm only. Record that
          // here rather than trusting a swap packet: the host validates shot
          // claims against this, so without it a player who had traded the
          // M1911 away would fire a pistol locally and do nothing in co-op.
          rp._downStash = { id: rp.weaponId, pap: rp.weaponPap };
          rp.authorizeWeapon('m1911', false, false);
        }
        if (msg.pid !== p.id) this.hud.banner(`${(this.remotePlayers.get(msg.pid)?.name || 'TEAMMATE').toUpperCase()} IS DOWN`, '#ff9944');
        break;
      }
      case 'dead': {
        const rp = this.remotePlayers.get(msg.pid);
        if (rp) { rp.dead = true; rp.down = false; rp._downStash = null; }
        if (msg.pid === p.id) this._beingRevived = null;
        break;
      }
      case 'revive_start': {
        // Cosmetic-only state, but still worth a sanity check so a peer cannot
        // paint a phantom rescue on someone who is not even down.
        const target = msg.pid === p.id ? p : this.remotePlayers.get(msg.pid);
        if (!target?.down || target.dead) break;
        if (msg.pid === p.id) {
          const known = this.remotePlayers.get(msg.by)?.name;
          this._beingRevived = {
            by: known || 'A TEAMMATE',
            at: this.time,
            need: clamp(Number(msg.need) || CFG.REVIVE_TIME, 0.5, 10),
          };
          audio.play('ui');
        }
        if (this.isAuthority) this.netSend(msg); // relay to the rest of the squad
        break;
      }
      case 'revive_stop': {
        if (msg.pid === p.id) this._beingRevived = null;
        if (this.isAuthority) this.netSend(msg);
        break;
      }
      case 'respawn': {
        const rp = this.remotePlayers.get(msg.pid);
        if (rp) {
          rp.dead = false; rp.down = false;
          if (this.isAuthority) {
            rp.setAuthoritativeLoadout([{ id: 'm1911', pap: false }]);
            rp.spawnWeaponAllowance = new Map([['m1911', false]]);
            rp.bowie = false;
          }
        }
        // A client announces its own respawn to the host; the host must relay
        // that authoritative identity to every other client as well.
        if (this.isAuthority) this.netSend(msg);
        break;
      }
      case 'revive_done': {
        this.applyRevive(msg.pid, msg.by);
        if (this.isAuthority) this.netSend(msg); // relay to others
        break;
      }
      case 'revive_req': {
        if (!this.isAuthority || msg.pid === from) break;
        const reviver = this.remotePlayers.get(from);
        const target = msg.pid === p.id ? p : this.remotePlayers.get(msg.pid);
        if (!reviver || reviver.down || reviver.dead || !target?.down || target.dead
            || !this._remoteNearVisible(from, target, 2.8)) break;
        this.applyRevive(msg.pid, from);
        this.netSend({ t: 'revive_done', pid: msg.pid, by: from });
        break;
      }
      case 'revive_self': {
        const rp = this.remotePlayers.get(msg.pid);
        if (rp) rp.down = false;
        break;
      }
    }
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
  GameMachines,
]) {
  for (const key of Object.getOwnPropertyNames(part.prototype)) {
    if (key === 'constructor') continue;
    if (Object.getOwnPropertyDescriptor(Game.prototype, key)) throw new Error(`Game.${key} is defined twice`);
    Object.defineProperty(Game.prototype, key, Object.getOwnPropertyDescriptor(part.prototype, key));
  }
}
