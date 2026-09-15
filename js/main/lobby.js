// The lobby screen: voice chat's microphone prompt, speaking dots and mutes,
// the ready-up countdown, and the roster.
import { CFG } from '../config.js';
import { audio } from '../audio.js';
import { PERSONAS } from '../personas.js';
import { shouldRefreshLobbyUi } from '../multiplayer-contracts.js';
import { $, buildInviteLink, app, toast } from './app.js';
import { getPersona, setPersona } from './characters.js';
import { cheats } from './cheats.js';

// ---------------- lobby voice (mic permission + indicators + mutes) ----------------
let lobbyVoiceT = null;
async function enableLobbyVoice() {
  const net = app.net;
  if (!net) return;
  updateLobbyVoiceUI();
  if (net.lobbyVoiceEnabled) {
    audio.init();
    await net.enableVoice(); // prompt only after the host-enabled lobby policy arrives
  } else {
    net.disableVoice();
  }
  if (app.net !== net) return; // left while the prompt was open
  updateLobbyVoiceUI();
  startLobbyVoiceLoop();
}
function updateLobbyVoiceUI() {
  const net = app.net;
  const btn = $('btn-lobby-mic');
  const note = $('lobby-voice-note');
  if (!btn) return;
  if (!net) { btn.textContent = 'MIC: —'; if (note) note.textContent = ''; return; }
  btn.disabled = !net.isHost && !net.lobbyVoiceEnabled;
  if (!net.lobbyVoiceEnabled) {
    btn.textContent = 'VOICE: OFF';
    if (note) note.textContent = net.isHost ? 'host setting — guests will not be asked for microphone access' : 'disabled by host — no microphone permission needed';
    return;
  }
  if (net.voiceFailed && !net.myStream) { btn.textContent = 'MIC: BLOCKED'; if (note) note.textContent = 'click to retry (check browser permission)'; return; }
  btn.textContent = net.isHost ? 'VOICE: ON' : (net.micMuted ? 'MIC: MUTED' : 'MIC: ON');
  if (note) note.textContent = net.isHost
    ? 'host setting — guests are prompted only while voice is ON'
    : (net.myStream ? 'controlled by host · click to mute yourself' : 'requesting microphone…');
}
function startLobbyVoiceLoop() {
  stopLobbyVoiceLoop();
  lobbyVoiceT = setInterval(() => {
    const net = app.net;
    if (!net) { stopLobbyVoiceLoop(); return; }
    net.updateVoiceSpeaking();
    document.querySelectorAll('.lobby-spk[data-pid]').forEach((el) => {
      const id = el.dataset.pid;
      const on = id === net.myId ? net.mySpeaking
        : (net.voiceStreams.get(id)?.speaking && !net.mutedPeers.has(id));
      el.classList.toggle('on', !!on);
    });
  }, 200);
}
function stopLobbyVoiceLoop() { if (lobbyVoiceT) { clearInterval(lobbyVoiceT); lobbyVoiceT = null; } }

// ---------------- lobby countdown (CoD-style auto-start) ----------------
let countdownT = null;
let countdownLeft = 0;
function stopLobbyCountdown() {
  if (countdownT) { clearInterval(countdownT); countdownT = null; }
}
function syncLobbyCountdown() {
  const net = app.net;
  if (!shouldRefreshLobbyUi(app.screen, !!app.game)) { stopLobbyCountdown(); return; }
  if (!net || !net.lobbyPlayers.length) { stopLobbyCountdown(); return; }
  const n = net.lobbyPlayers.length;
  const ready = net.lobbyPlayers.filter((p) => p.ready).length;
  const majority = ready >= Math.floor(n / 2) + 1;
  if (majority && !countdownT) {
    const countdownNet = net;
    countdownLeft = 10;
    audio.play('count_tick');
    countdownT = setInterval(() => {
      if (app.net !== countdownNet || !shouldRefreshLobbyUi(app.screen, !!app.game)) {
        stopLobbyCountdown();
        return;
      }
      countdownLeft--;
      if (countdownLeft <= 0) {
        stopLobbyCountdown();
        if (app.net?.isHost && app.net.majorityReady()) {
          audio.play('count_go');
          app.net.startGame({ cheats });
        }
        return;
      }
      audio.play('count_tick');
      const hint = $('lobby-hint');
      if (hint) hint.textContent = `Starting in ${countdownLeft}s — unready to cancel.`;
    }, 1000);
  } else if (!majority && countdownT) {
    stopLobbyCountdown();
    refreshLobbyUI();
  }
}

// ---------------- lobby ----------------
function refreshLobbyUI() {
  const net = app.net;
  const players = net?.lobbyPlayers || [];
  // one-of-each marine: earliest claim wins; if mine collides, take a free one
  if (net) {
    const me = players.find((p) => p.id === net.myId);
    if (me) {
      const others = players.filter((p) => p.id !== net.myId);
      const taken = new Set(others.map((p) => p.persona));
      const mine = me.persona || getPersona();
      const earlierClaim = players.findIndex((p) => p.persona === mine) !== players.findIndex((p) => p.id === net.myId);
      if (earlierClaim) {
        const free = (PERSONAS.find((c) => !taken.has(c.id)) || PERSONAS[0]).id;
        setPersona(free);
        toast(`${PERSONAS.find((c) => c.id === mine)?.label} is taken — you're ${PERSONAS.find((c) => c.id === free)?.label} now`);
      }
    }
  }
  $('lobby-code').textContent = net?.code || '-----';
  if (net?.code) $('lobby-link').value = buildInviteLink(net.code);
  const rows = players.map((p) => {
    const col = CFG.COLORS[(p.color ?? 0) % 4];
    const self = p.id === net.myId;
    return `<div class="lobby-row">
      <span class="lobby-spk" data-pid="${escapeHtml(p.id)}" title="voice">●</span>
      <span class="lobby-name" style="color:${col}">${p.host ? '👑 ' : ''}${escapeHtml(p.name)}${self ? ' (you)' : ''}${p.persona ? ` · ${escapeHtml(PERSONAS.find((c) => c.id === p.persona)?.label || '')}` : ''}</span>
      ${self ? '' : `<button class="lobby-mute${net.mutedPeers.has(p.id) ? ' muted' : ''}" data-pid="${escapeHtml(p.id)}" title="Mute/unmute this player">${net.mutedPeers.has(p.id) ? '🔇' : '🔊'}</button>`}
      <span class="lobby-ready ${p.ready ? 'yes' : ''}">${p.ready ? 'READY' : 'NOT READY'}</span>
    </div>`;
  }).join('');
  $('lobby-players').innerHTML = rows;
  const isHost = net?.isHost;
  $('btn-start-game').classList.toggle('hidden', !isHost);
  $('btn-lobby-cheats').classList.remove('hidden');
  $('btn-lobby-cheats').textContent = isHost ? 'CHEAT CODES' : 'VIEW CHEAT CODES';
  if (isHost) {
    const can = net.majorityReady();
    $('btn-start-game').disabled = !can;
    $('lobby-hint').textContent = can
      ? 'Majority ready — starting soon (or start now).'
      : `Waiting for majority to ready up (${players.filter((p) => p.ready).length}/${players.length}, need ${Math.floor(players.length / 2) + 1})…`;
  } else {
    $('lobby-hint').textContent = countdownT ? $('lobby-hint').textContent : 'Waiting for the host to start…';
  }
  $('btn-ready').textContent = app.ready ? 'UNREADY' : 'READY UP';
  $('btn-ready').classList.toggle('ready', app.ready);
  updateLobbyVoiceUI();
  syncLobbyCountdown();
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export { enableLobbyVoice, updateLobbyVoiceUI, stopLobbyVoiceLoop, stopLobbyCountdown, refreshLobbyUI };
