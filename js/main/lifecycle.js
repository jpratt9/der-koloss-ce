// Moving between the menu, the lobby and a match: the lobby's network hooks,
// the menu music, loading the assets, and starting, leaving, pausing and
// resuming a game.
import { lockPointer, unlockPointer, clearPressed, resetInputState } from '../input.js';
import { audio } from '../audio.js';
import { Game } from '../game.js';
import { assets } from '../assets.js';
import { getMenuMusicOffset, keepMenuMusicClock } from '../site-audio.js?v=6';
import { shouldRefreshLobbyUi } from '../multiplayer-contracts.js';
import { $, DEBUG, debugExpose, getName, app, canvas, showScreen, toast } from './app.js';
import { options, mpMasterOverride, setMpMasterOverride, applyOptions } from './options.js';
import { cheats, syncCheatsUI } from './cheats.js';
import { enableLobbyVoice, stopLobbyVoiceLoop, stopLobbyCountdown, refreshLobbyUI } from './lobby.js';

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

export { wireNetLobby, startMenuMusic, rememberMenuMusicPosition, ensureAssets, startGame, exitToMenu, pauseGame, resumeGame };
