// Boot + menus: main menu, options (sensitivity/FOV/volumes/quality),
// lobby (host/join with ready-up), pause, game lifecycle.
import { NAME_KEY } from './config.js';
import { initInput, input, lockPointer, unlockPointer, clearPressed, resetInputState } from './input.js';
import { audio } from './audio.js';
import { Net } from './net.js';
import { Game } from './game.js';
import { assets } from './assets.js';
import { PERSONAS } from './personas.js';
import { getMenuMusicOffset, keepMenuMusicClock } from './site-audio.js?v=6';
import { shouldRefreshLobbyUi } from './multiplayer-contracts.js';
import { $, DEBUG, debugExpose, getName, buildInviteLink, app, canvas, setCanvas, showScreen, toast } from './main/app.js';
import { options, saveOptions, mpMasterOverride, setMpMasterOverride, bindOptionsUI, setShowFps, applyOptions } from './main/options.js';
import { getPersona, setPersona, charReturnTo, openCharSelect, charPageId } from './main/characters.js';
import { cheats, cheatsReturnTo, openCheats, syncCheatsUI, bindCheatsUI } from './main/cheats.js';
import { enableLobbyVoice, updateLobbyVoiceUI, stopLobbyVoiceLoop, stopLobbyCountdown, refreshLobbyUI } from './main/lobby.js';

let lastTabT = 0; // last Tab press (scoreboard) — pointer-unlock guard
window.addEventListener('keydown', (e) => { if (e.code === 'Tab') lastTabT = performance.now(); }, { capture: true });

function wireNetLobby() {
  const net = app.net;
  debugExpose('__net', net);
  net.onLobby = () => {
    if (app.net !== net || !shouldRefreshLobbyUi(app.screen, !!app.game)) return;
    refreshLobbyUI();
    void enableLobbyVoice();
    if (!$('cheats').classList.contains('hidden')) syncCheatsUI();
  };
  net.onStart = (payload) => {
    if (app.net !== net || app.game) return;
    stopLobbyCountdown();
    const mode = net.isHost ? 'host' : 'client';
    startGame(mode, net, payload.players, payload.cheats);
  };
  net.onClosed = (reason) => {
    exitToMenu();
    toast(reason || 'Connection lost.');
  };
}

// ---------------- menu music ----------------
let menuMusic = null;
function startMenuMusic() {
  if (menuMusic || app.game) return;
  audio.init();
  if (assets.audioReady) {
    const track = assets.sound('menu_music');
    menuMusic = audio.loopFile('menu_music', 0.42, 'music', getMenuMusicOffset(track?.duration));
    debugExpose('__menuMusicHandle', menuMusic);
  }
}
function stopMenuMusic() {
  if (menuMusic) {
    rememberMenuMusicPosition();
    menuMusic.stop(); menuMusic = null;
    debugExpose('__menuMusicHandle', null);
  }
}
function rememberMenuMusicPosition() {
  if (!menuMusic) return;
  const elapsed = Math.max(0, audio.ctx.currentTime - menuMusic.startedAt);
  keepMenuMusicClock((menuMusic.offset + elapsed) % menuMusic.duration);
}

// ---------------- game lifecycle ----------------
let assetsLoading = null;
async function ensureAssets(show = true) {
  if (assets.ready && assets.audioReady) return;
  if (show) $('loading').classList.remove('hidden');
  const bar = $('load-bar');
  if (!assetsLoading) {
    assetsLoading = (async () => {
      await assets.load((f) => { bar.style.width = `${Math.round(f * 70)}%`; });
      audio.init();
      await assets.loadAudio(audio.ctx);
      bar.style.width = '100%';
    })();
  }
  await assetsLoading;
  if (show) $('loading').classList.add('hidden');
}

function startGame(mode, net, lobbyPlayers, netCheats = null) {
  app.ready = false;
  stopMenuMusic();
  stopLobbyCountdown();
  stopLobbyVoiceLoop();
  setMpMasterOverride(mode !== 'solo'); // co-op: quiet game, clear voices
  const bootlog = ['startGame:' + mode];
  debugExpose('__bootlog', bootlog);
  // co-op: the host's cheat codes + settings apply to EVERYONE
  const effCheats = (mode === 'client' && netCheats) ? { ...netCheats } : cheats;
  ensureAssets().then(() => {
    bootlog.push('assets-done');
    const game = new Game({
      mode, net: mode === 'solo' ? null : net,
      options, hud: app.hud, cheats: effCheats,
      myName: getName(),
      lobbyPlayers: lobbyPlayers || [{ id: 'local', name: getName(), color: 0 }],
      onExit: (destination, message) => destination === 'lobby' ? returnToLobby(message) : exitToMenu(),
    });
    bootlog.push('game-ctor');
    app.game = game;
    debugExpose('__game', game);
    resetInputState();
    showScreen('game');
    app.hud.show();
    bootlog.push('pre-init');
    game.init(canvas);
    bootlog.push('init-done');
    applyOptions();
    lockPointer(canvas);
    toast(mode === 'solo' ? 'Survive. Good luck.'
      : mpMasterOverride != null ? 'Game started — master volume lowered to 15% so you can hear your team (change it in Options).'
      : 'Game started — good luck!');
  }).catch((e) => {
    if (DEBUG) bootlog.push('ERROR: ' + (e.stack || e.message));
    console.error('startGame failed', e);
    // showScreen('game') already ran, so without this the player is left on a
    // black canvas with a live HUD over a half-built Game and no way back but
    // ESC. Put them back where they came from instead.
    if (app.game) { try { app.game.dispose(); } catch (_) {} app.game = null; }
    app.hud.hide();
    unlockPointer();
    showScreen(mode === 'solo' ? 'menu' : 'lobby');
    if (mode === 'solo') startMenuMusic();
    toast('Failed to start: ' + e.message);
    $('loading').classList.add('hidden');
  });
}

function exitToMenu() {
  stopLobbyVoiceLoop();
  if (app.game) { app.game.dispose(); app.game = null; }
  setMpMasterOverride(false);
  app.hud.hide();
  unlockPointer();
  if (app.net) { app.net.leave(); app.net = null; }
  app.ready = false;
  showScreen('menu');
  startMenuMusic();
}

function returnToLobby(message = '') {
  stopLobbyCountdown();
  stopLobbyVoiceLoop();
  if (!app.net) { exitToMenu(); return; }
  if (app.game) { app.game.dispose(); app.game = null; }
  setMpMasterOverride(false);
  app.hud.hide();
  unlockPointer();
  resetInputState();
  app.ready = false;
  if (app.net.isHost) app.net.resetLobbyReady();
  else app.net.setReady(false);
  showScreen('lobby');
  refreshLobbyUI();
  startMenuMusic();
  void enableLobbyVoice();
  if (message) toast(message, 4500);
}

function pauseGame() {
  if (!app.game) return;
  app.game.setPaused(true);
  unlockPointer();
  const pauseMic = $('btn-pause-mic');
  pauseMic.classList.toggle('hidden', app.game.mode === 'solo');
  const voiceDisabled = !!app.net && !app.net.lobbyVoiceEnabled;
  pauseMic.disabled = voiceDisabled;
  pauseMic.textContent = voiceDisabled ? 'VOICE: DISABLED' : `MIC: ${app.net?.micMuted ? 'OFF' : 'ON'}`;
  $('btn-quit').textContent = app.game.mode === 'host' ? 'END GAME TO LOBBY' : app.game.mode === 'client' ? 'LEAVE GAME' : 'QUIT TO MENU';
  showScreen('pause');
  $('hud').classList.remove('hidden');
}
function resumeGame() {
  if (!app.game) return;
  clearPressed();
  showScreen('game');
  app.game.setPaused(false);
  lockPointer(canvas);
}

// ---------------- boot ----------------
function boot() {
  setCanvas($('game-canvas'));
  debugExpose('__audio', audio);
  initInput(canvas);
  bindOptionsUI();
  bindCheatsUI();

  // audio unlock on first gesture + warm the asset cache for menu music (no overlay)
  const unlock = () => {
    audio.init();
    applyOptions();
    ensureAssets(false).then(() => startMenuMusic());
  };
  addEventListener('mousedown', unlock, { once: true });
  addEventListener('keydown', unlock, { once: true });
  // Attempt an immediate resume when arriving from another same-origin page.
  // Browsers that require a fresh gesture remain covered by the listeners above.
  unlock();

  // menu buttons
  document.querySelectorAll('.menu-link').forEach((link) => link.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    audio.play('ui');
    rememberMenuMusicPosition();
    setTimeout(() => { location.href = link.href; }, 75);
  }));
  $('btn-more').addEventListener('click', () => {
    audio.play('ui');
    const panel = $('menu-more-links');
    const open = panel.classList.toggle('hidden') === false;
    $('btn-more').setAttribute('aria-expanded', String(open));
  });
  const startSolo = () => startGame('solo', null, null);
  $('btn-solo').addEventListener('click', () => {
    audio.play('ui');
    if (document.fullscreenElement) startSolo();
    else { showScreen('solo-fs-modal'); syncSoloFsUI(); }
  });
  $('btn-solo-fs-start').addEventListener('click', () => { audio.play('ui'); startSolo(); });
  $('btn-solo-fs-back').addEventListener('click', () => { audio.play('ui'); showScreen('menu'); });
  $('btn-host').addEventListener('click', async () => {
    audio.play('ui');
    const btn = $('btn-host');
    btn.disabled = true; btn.textContent = 'CREATING…';
    try {
      app.net = new Net();
      wireNetLobby();
      await app.net.host(getName());
      app.net.setLobbyCheats(cheats);
      // This is a room policy, not a guest-local preference. It is published
      // before anyone receives an invite and controls whether guests are ever
      // asked for microphone permission.
      app.net.setLobbyVoiceEnabled(options.voiceChat !== false);
      app.net.setPersona(getPersona());
      app.ready = false;
      showScreen('lobby');
      refreshLobbyUI();
      void enableLobbyVoice();
      $('lobby-link').value = buildInviteLink(app.net.code);
    } catch (e) {
      toast(e.message);
      app.net = null;
    }
    btn.disabled = false; btn.textContent = 'HOST LOBBY';
  });
  $('btn-join').addEventListener('click', () => {
    audio.play('ui');
    $('join-code').value = '';
    showScreen('join-modal');
    $('join-code').focus();
  });
  $('btn-options').addEventListener('click', () => { audio.play('ui'); showScreen('options'); });
  $('btn-cheats').addEventListener('click', () => { audio.play('ui'); openCheats('menu'); });
  $('btn-lobby-cheats').addEventListener('click', () => { audio.play('ui'); openCheats('lobby'); });
  $('btn-cheats-back').addEventListener('click', () => {
    audio.play('ui');
    showScreen(cheatsReturnTo);
    if (cheatsReturnTo === 'lobby') refreshLobbyUI();
  });
  $('btn-char').addEventListener('click', () => { audio.play('ui'); openCharSelect('menu'); });
  $('btn-char-back').addEventListener('click', () => { audio.play('ui'); showScreen(charReturnTo); if (charReturnTo === 'lobby') refreshLobbyUI(); });
  $('btn-char-page-back').addEventListener('click', () => { audio.play('ui'); openCharSelect(charReturnTo); });
  $('btn-char-pick').addEventListener('click', () => {
    audio.play('buy');
    setPersona(charPageId);
    showScreen(charReturnTo);
    if (charReturnTo === 'lobby') refreshLobbyUI();
    const picked = PERSONAS.find((p) => p.id === charPageId);
    toast(`${picked?.label} selected`);
  });
  $('btn-lobby-char').addEventListener('click', () => { audio.play('ui'); openCharSelect('lobby'); });
  // easy in-lobby rename (persisted + broadcast to everyone)
  const lobbyNameEl = $('lobby-name');
  lobbyNameEl.value = getName();
  lobbyNameEl.addEventListener('change', () => {
    const v = lobbyNameEl.value.trim().slice(0, 14) || getName();
    lobbyNameEl.value = v;
    localStorage.setItem(NAME_KEY, v);
    app.net?.setName(v);
    if (app.net?.code) $('lobby-link').value = buildInviteLink(app.net.code, v);
    audio.play('ui');
  });
  setPersona(getPersona());
  $('btn-options-back').addEventListener('click', () => { audio.play('ui'); showScreen(app.game ? 'pause' : 'menu'); if (app.game) $('hud').classList.remove('hidden'); });

  // join modal
  $('btn-join-cancel').addEventListener('click', () => { audio.play('ui'); showScreen('menu'); });
  const doJoin = async () => {
    const code = $('join-code').value.trim().toUpperCase();
    if (code.length < 4) { toast('Enter the lobby code.'); return; }
    const btn = $('btn-join-go');
    btn.disabled = true; btn.textContent = 'JOINING…';
    try {
      app.net = new Net();
      wireNetLobby();
      await app.net.join(code, getName());
      app.net.setPersona(getPersona());
      app.ready = false;
      showScreen('lobby');
      refreshLobbyUI();
      // lobbyVoiceEnabled remains false until the authenticated host snapshot
      // arrives; enableLobbyVoice therefore cannot prompt prematurely.
      void enableLobbyVoice();
      $('lobby-link').value = buildInviteLink(app.net.code);
    } catch (e) {
      toast(e.message);
      if (app.net) { app.net.leave(); app.net = null; }
      showScreen('menu');
    }
    btn.disabled = false; btn.textContent = 'JOIN';
  };
  $('btn-join-go').addEventListener('click', doJoin);
  $('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

  // lobby
  $('btn-ready').addEventListener('click', () => {
    audio.play('ui');
    app.ready = !app.ready;
    app.net?.setReady(app.ready);
    refreshLobbyUI();
  });
  $('btn-start-game').addEventListener('click', () => {
    audio.play('ui');
    if (app.net?.isHost && app.net.majorityReady()) {
      stopLobbyCountdown();
      app.net.startGame({ cheats });
    }
  });
  $('btn-leave-lobby').addEventListener('click', () => { audio.play('ui'); exitToMenu(); });
  // lobby voice: mute self / retry mic, and per-player mute buttons (delegated)
  $('btn-lobby-mic').addEventListener('click', async () => {
    audio.play('ui');
    const net = app.net;
    if (!net) return;
    if (net.isHost) {
      const enabled = net.setLobbyVoiceEnabled(!net.lobbyVoiceEnabled);
      options.voiceChat = enabled;
      saveOptions(options);
      updateLobbyVoiceUI();
      if (enabled) await enableLobbyVoice();
      else toast('Voice chat disabled for this lobby — guests will not be prompted.');
      return;
    }
    if (!net.lobbyVoiceEnabled) { toast('Voice chat is disabled by the host.'); return; }
    if (!net.myStream) {
      net.voiceFailed = false; // retry after a denied permission
      updateLobbyVoiceUI();
      await net.enableVoice();
      updateLobbyVoiceUI();
      return;
    }
    net.setMicMuted(!net.micMuted);
    updateLobbyVoiceUI();
  });
  $('lobby-players').addEventListener('click', (e) => {
    const b = e.target.closest('.lobby-mute');
    if (!b || !app.net) return;
    audio.play('ui');
    const id = b.dataset.pid;
    const m = !app.net.mutedPeers.has(id);
    app.net.mutePeer(id, m);
    b.textContent = m ? '🔇' : '🔊';
    b.classList.toggle('muted', m);
    toast(m ? 'Player muted (this session)' : 'Player unmuted');
  });
  $('btn-copy-link').addEventListener('click', async () => {
    audio.play('ui');
    const link = $('lobby-link').value;
    try { await navigator.clipboard.writeText(link); toast('Invite link copied — send it to your friend!'); }
    catch (e) { $('lobby-link').select(); toast('Select and copy the link manually.'); }
  });

  // pause
  $('btn-resume').addEventListener('click', () => { audio.play('ui'); resumeGame(); });
  $('btn-pause-options').addEventListener('click', () => { audio.play('ui'); showScreen('options'); });
  $('btn-quit').addEventListener('click', () => {
    audio.play('ui');
    if (app.game?.mode === 'host' && app.game.endMatchToLobby()) return;
    exitToMenu();
  });

  // fullscreen
  const isFs = () => !!document.fullscreenElement;
  function syncFsUI() {
    const on = isFs();
    $('btn-pause-fs').textContent = `FULLSCREEN: ${on ? 'ON' : 'OFF'}`;
    const lobbyFs = $('btn-lobby-fs');
    lobbyFs.textContent = on ? 'EXIT FULL SCREEN' : 'FULL SCREEN';
    lobbyFs.classList.toggle('fullscreen-callout', !on);
    lobbyFs.setAttribute('aria-pressed', String(on));
    syncSoloFsUI();
  }
  function syncSoloFsUI() {
    const button = $('btn-solo-fs-toggle');
    const start = $('btn-solo-fs-start');
    if (!button || !start) return;
    const on = isFs();
    button.textContent = on ? 'EXIT FULL SCREEN' : 'ENTER FULL SCREEN';
    button.classList.toggle('fullscreen-callout', !on);
    button.setAttribute('aria-pressed', String(on));
    start.textContent = on ? 'START GAME' : 'START WITHOUT FULL SCREEN';
  }
  async function toggleFullscreen() {
    try {
      if (isFs()) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (e) { /* browser denied — ignore */ }
  }
  document.addEventListener('fullscreenchange', syncFsUI);
  $('btn-pause-fs').addEventListener('click', () => { audio.play('ui'); toggleFullscreen(); });
  $('btn-pause-fps').addEventListener('click', () => { audio.play('ui'); setShowFps(!options.showFps); });
  $('btn-lobby-fs').addEventListener('click', () => { audio.play('ui'); toggleFullscreen(); });
  $('btn-solo-fs-toggle').addEventListener('click', () => { audio.play('ui'); toggleFullscreen(); });
  syncFsUI();
  $('btn-pause-mic').addEventListener('click', () => {
    audio.play('ui');
    if (!app.game || !app.net?.lobbyVoiceEnabled) return;
    const m = !app.game.micMuted;
    app.game.setMicMuted(m);
    $('btn-pause-mic').textContent = `MIC: ${m ? 'OFF' : 'ON'}`;
  });

  // pointer lock loss => pause — EXCEPT when Tab (scoreboard) caused it: relock instantly
  input.onPointerUnlock = () => {
    const tabbing = input.keys['Tab'] || (lastTabT && performance.now() - lastTabT < 700);
    if (tabbing && app.game && app.screen === 'game') { lockPointer(canvas); return; }
    if (app.game && !app.game.over && app.screen === 'game') pauseGame();
  };

  // global keys
  input.onKey = (code) => {
    if (code === 'F11') { toggleFullscreen(); return; }
    if (code === 'Escape') {
      if (app.game && app.screen === 'game') {
        // not fullscreen (or browser already left lock): treat as pause
        if (document.pointerLockElement) unlockPointer();
        pauseGame();
      } else if (app.game && app.screen === 'pause') {
        resumeGame();
      } else if (app.screen === 'options' && app.game) {
        showScreen('pause');
        $('hud').classList.remove('hidden');
      }
    }
  };

  // canvas click re-locks pointer during play
  canvas.addEventListener('mousedown', () => {
    if (app.game && app.screen === 'game' && !input.locked) lockPointer(canvas);
  });
  // fallback: ANY click while in-game and unlocked re-locks (covers overlays swallowing canvas clicks)
  document.addEventListener('mousedown', (e) => {
    if (app.game && app.screen === 'game' && !app.game.paused && !app.game.over && !input.locked) {
      lockPointer(canvas);
    }
  });
  // Chrome can reject relock (ESC cooldown); keep hint visible until lock succeeds
  document.addEventListener('pointerlockerror', () => { syncLockHint(); });

  // "CLICK TO AIM" hint whenever we're in live gameplay without pointer lock
  const lockHint = $('lock-hint');
  function syncLockHint() {
    const need = !!(app.game && app.screen === 'game' && !app.game.paused && !app.game.over && !input.locked);
    lockHint.classList.toggle('hidden', !need);
  }
  document.addEventListener('pointerlockchange', syncLockHint);
  setInterval(syncLockHint, 400);

  // endFrame each rAF (clears edge-triggered keys)
  (function raf() { requestAnimationFrame(raf); })();

  // deep link: ?join=CODE
  const params = new URLSearchParams(location.search);
  const joinCode = params.get('join');
  const inviter = String(params.get('from') || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 14);
  if (joinCode) {
    showScreen('join-modal');
    $('join-code').value = joinCode.toUpperCase();
    $('btn-join-go').focus();
    toast(inviter ? `${inviter} invited you — press JOIN to drop in!` : 'Lobby invite detected — press JOIN to drop in!');
  } else {
    showScreen('menu');
  }
}

boot();
