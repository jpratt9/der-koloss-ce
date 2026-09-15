// The chosen marine, and the character select and character page screens.
import { audio } from '../audio.js';
import { assets } from '../assets.js';
import { PERSONAS, drawPortrait } from '../personas.js';
import { $, app, showScreen, toast } from './app.js';
import { applyOptions } from './options.js';

// ---------------- persona (character) ----------------
const PERSONA_KEY = 'der-riese-persona';
function getPersona() {
  const id = localStorage.getItem(PERSONA_KEY) || 'dempsey';
  return PERSONAS.some((p) => p.id === id) ? id : 'dempsey';
}
function setPersona(id) {
  localStorage.setItem(PERSONA_KEY, id);
  app.net?.setPersona(id);
  $('lobby-char-name').textContent = PERSONAS.find((p) => p.id === id)?.label || '';
}
let charReturnTo = 'menu';
function openCharSelect(from) {
  charReturnTo = from;
  buildCharCards();
  showScreen('charselect');
}
function takenPersonas() {
  return new Set((app.net?.lobbyPlayers || []).filter((l) => l.id !== app.net?.myId).map((l) => l.persona));
}
function freePersona() {
  const taken = takenPersonas();
  const mine = getPersona();
  if (!taken.has(mine)) return mine;
  return (PERSONAS.find((p) => !taken.has(p.id)) || PERSONAS[0]).id;
}
function buildCharCards() {
  const taken = takenPersonas();
  const wrap = $('char-cards');
  wrap.innerHTML = '';
  for (const p of PERSONAS) {
    const isTaken = taken.has(p.id);
    const card = document.createElement('div');
    card.className = 'char-card' + (isTaken ? ' taken' : '');
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    drawPortrait(cv, p.id);
    const nm = document.createElement('div');
    nm.className = 'cc-name'; nm.textContent = p.label;
    const rl = document.createElement('div');
    rl.className = 'cc-role'; rl.textContent = isTaken ? 'TAKEN' : p.role;
    card.append(cv, nm, rl);
    if (!isTaken) card.addEventListener('click', () => { audio.play('ui'); openCharPage(p.id); });
    wrap.appendChild(card);
  }
}
let charPageId = 'dempsey';
function openCharPage(id) {
  charPageId = id;
  const p = PERSONAS.find((x) => x.id === id);
  if (!p) return;
  $('char-name').textContent = p.label;
  $('char-role').textContent = p.role;
  $('char-bio').textContent = p.bio;
  $('char-traits').innerHTML = p.traits.map((x) => `<li>${x}</li>`).join('');
  $('char-quotes').innerHTML = p.quotes.map((q) => `<div>“${q}”</div>`).join('');
  const cv = $('char-portrait');
  cv.width = 96; cv.height = 96;
  drawPortrait(cv, id);
  // SELECT blocked if someone in the lobby already claimed this marine
  const taken = takenPersonas();
  const pickBtn = $('btn-char-pick');
  if (taken.has(id)) { pickBtn.disabled = true; pickBtn.textContent = 'TAKEN'; }
  else { pickBtn.disabled = false; pickBtn.textContent = 'SELECT'; }
  // voice line preview buttons (a few signature lines per character)
  const vwrap = $('char-voice-lines');
  vwrap.innerHTML = '';
  const previews = [['start1', 'Battle cry'], ['round1', 'New wave'], ['kill1', 'Kill'], ['power1', 'Power on']];
  for (const [ev, lbl] of previews) {
    const b = document.createElement('button');
    b.className = 'vline-btn';
    b.textContent = '▸ ' + lbl;
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        audio.init(); // AudioContext needs the click gesture; buffers may not be loaded on the menu yet
        applyOptions();
        if (!assets.audioReady) await assets.loadAudio(audio.ctx);
        const buf = assets.sound(`vox_${id}_${ev}`);
        if (buf) audio.playBuffer(buf, 'vox', { bus: 'sfx', vol: 1.8 });
        else toast('Voice line not found.');
      } finally { b.disabled = false; }
    });
    vwrap.appendChild(b);
  }
  showScreen('charpage');
}

export { getPersona, setPersona, charReturnTo, openCharSelect, charPageId };
