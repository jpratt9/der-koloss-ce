// The page's shared pieces: the element lookup and debug hooks, the player's
// name and invite link, the app state, the screen switch and the toast. Every
// other module in js/main/ imports this one.
import { NAME_KEY } from '../config.js';
import { HUD } from '../hud.js';
import { shouldShowGameplayCanvas } from '../multiplayer-contracts.js';

const $ = (id) => document.getElementById(id);
const DEBUG = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  && new URLSearchParams(location.search).get('debug') === '1';
function debugExpose(name, value) { if (DEBUG) window[name] = value; }

function getName() {
  let n = localStorage.getItem(NAME_KEY);
  if (!n) {
    n = 'Soldier' + Math.floor(Math.random() * 900 + 100);
    localStorage.setItem(NAME_KEY, n);
  }
  return n;
}

const PUBLIC_SITE_URL = 'https://www.derkoloss.com';
function buildInviteLink(code, inviter = getName()) {
  const safeCode = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const safeInviter = String(inviter || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 14);
  return `${PUBLIC_SITE_URL}/invite/${encodeURIComponent(safeCode)}${safeInviter ? `?from=${encodeURIComponent(safeInviter)}` : ''}`;
}

// ---------------- app state ----------------
const app = {
  screen: 'menu', // menu | lobby | game
  game: null,
  net: null,
  hud: new HUD(),
  ready: false,
};
let canvas;
function setCanvas(el) { canvas = el; }

function showScreen(name) {
  for (const s of ['menu', 'lobby', 'options', 'pause', 'solo-fs-modal', 'join-modal', 'charselect', 'charpage', 'cheats']) $(s).classList.add('hidden');
  $('hud').classList.add('hidden');
  if (name === 'game') {
    $('hud').classList.remove('hidden');
    app.screen = 'game'; // was missing — broke every "am I in-game?" check (incl. click-to-relock)
    canvas?.classList.toggle('hidden', !shouldShowGameplayCanvas('game', !!app.game));
    canvas?.setAttribute('aria-hidden', String(!shouldShowGameplayCanvas('game', !!app.game)));
    return;
  }
  $(name).classList.remove('hidden');
  app.screen = name;
  const showCanvas = shouldShowGameplayCanvas(name, !!app.game);
  canvas?.classList.toggle('hidden', !showCanvas);
  canvas?.setAttribute('aria-hidden', String(!showCanvas));
}

// ---------------- toast ----------------
let toastT = null;
function toast(msg, ms = 3200) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.add('hidden'), ms);
}

export { $, DEBUG, debugExpose, getName, buildInviteLink, app, canvas, setCanvas, showScreen, toast };
