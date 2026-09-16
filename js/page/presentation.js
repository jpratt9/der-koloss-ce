const MAX_SLOTS = 4;
const lobbyPlayers = document.getElementById('lobby-players');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

/* ---- lobby: turn main.js' flat rows into four real squad slots ---- */
function decorateLobby() {
  if (!lobbyPlayers) return;
  const rows = [...lobbyPlayers.querySelectorAll(':scope > .lobby-row')];
  rows.forEach((row, i) => {
    row.dataset.slot = String(i + 1);
    row.classList.toggle('is-host', !!row.querySelector('.lobby-name')?.textContent.includes('👑'));
    row.classList.toggle('is-you', !!row.querySelector('.lobby-name')?.textContent.includes('(you)'));
    row.classList.toggle('is-ready', !!row.querySelector('.lobby-ready.yes'));
    const nameEl = row.querySelector('.lobby-name');
    if (nameEl && !row.querySelector('.lobby-avatar')) {
      const av = document.createElement('span');
      av.className = 'lobby-avatar';
      av.setAttribute('aria-hidden', 'true');
      av.style.setProperty('--slot-color', nameEl.style.color || '#e8e4d8');
      av.textContent = (nameEl.textContent.replace(/[^A-Za-z0-9]/g, '')[0] || '?').toUpperCase();
      row.insertBefore(av, row.firstChild);
    }
    const av = row.querySelector('.lobby-avatar');
    if (av && nameEl) av.style.setProperty('--slot-color', nameEl.style.color || '#e8e4d8');
    // icon-only controls main.js emits need accessible names
    const mute = row.querySelector('.lobby-mute');
    if (mute) {
      const who = (nameEl?.textContent || 'player').replace(/[👑]/g, '').trim();
      mute.setAttribute('aria-label', `${mute.classList.contains('muted') ? 'Unmute' : 'Mute'} ${who}`);
    }
    const spk = row.querySelector('.lobby-spk');
    if (spk) { spk.setAttribute('aria-hidden', 'true'); spk.setAttribute('title', 'voice activity'); }
    row.setAttribute('role', 'listitem');
  });
  lobbyPlayers.setAttribute('role', 'list');
  lobbyPlayers.setAttribute('aria-label', 'Squad slots');
  // trailing empty slots so the squad always reads as a four-seat squad
  [...lobbyPlayers.querySelectorAll(':scope > .lobby-slot-empty')].forEach((n) => n.remove());
  for (let i = rows.length; i < MAX_SLOTS; i++) {
    const slot = document.createElement('div');
    slot.className = 'lobby-slot-empty';
    slot.setAttribute('aria-hidden', 'true');
    slot.innerHTML = '<span class="slot-num">' + String(i + 1).padStart(2, '0')
      + '</span><span class="slot-text">OPEN SLOT</span><span class="slot-cta">SHARE THE CODE</span>';
    lobbyPlayers.appendChild(slot);
  }
}
if (lobbyPlayers) {
  decorateLobby();
  new MutationObserver((records) => {
    // ignore our own appends
    if (records.every((r) => [...r.addedNodes].every((n) => n.nodeType === 1 && n.classList.contains('lobby-slot-empty')))) return;
    decorateLobby();
  }).observe(lobbyPlayers, { childList: true });
}

/* ---- field manual: full legend is opt-in, and never resizes the page ---- */
const brief = document.querySelector('.menu-brief');
const briefToggle = document.getElementById('btn-controls');
if (brief && briefToggle) {
  const KEY = 'der-koloss-controls-open';
  const setOpen = (open, persist) => {
    brief.classList.toggle('open', open);
    briefToggle.setAttribute('aria-expanded', String(open));
    briefToggle.textContent = open ? 'ESSENTIALS' : 'ALL CONTROLS';
    if (persist) { try { localStorage.setItem(KEY, open ? '1' : '0'); } catch { /* private mode */ } }
  };
  const roomy = matchMedia('(min-height: 1000px) and (min-width: 1101px)');
  const stored = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  // Default open only where there is genuinely room; re-evaluate on resize
  // until the player expresses a preference, which then wins forever.
  const applyDefault = () => { if (stored() === null) setOpen(roomy.matches, false); };
  setOpen(stored() === null ? roomy.matches : stored() === '1', false);
  roomy.addEventListener('change', applyDefault);
  briefToggle.addEventListener('click', () => setOpen(!brief.classList.contains('open'), true));
}

/* ---- pause: mirror the live round / points so the state stays legible ---- */
const pauseScreen = document.getElementById('pause');
const pauseRound = document.getElementById('pause-round');
const pausePoints = document.getElementById('pause-points');
if (pauseScreen && pauseRound && pausePoints) {
  const syncPauseStats = () => {
    if (pauseScreen.classList.contains('hidden')) return;
    const r = (document.getElementById('round')?.textContent || '').trim();
    const p = (document.getElementById('points')?.textContent || '').trim();
    pauseRound.textContent = r || '—';
    pausePoints.textContent = p ? Number(p).toLocaleString('en-US') : '—';
  };
  new MutationObserver(syncPauseStats).observe(pauseScreen, { attributes: true, attributeFilter: ['class'] });
  syncPauseStats();
}

/* ---- character select: show which soldier is already yours ---- */
const charCards = document.getElementById('char-cards');
const charName = document.getElementById('lobby-char-name');
if (charCards && charName) {
  const markCurrent = () => {
    const mine = (charName.textContent || '').trim().toLowerCase();
    charCards.querySelectorAll('.char-card').forEach((card) => {
      const label = card.querySelector('.cc-name')?.textContent.trim().toLowerCase();
      card.classList.toggle('is-current', !!mine && label === mine);
    });
  };
  new MutationObserver(markCurrent).observe(charCards, { childList: true });
  new MutationObserver(markCurrent).observe(charName, { childList: true, characterData: true, subtree: true });
}

/* ---- the code itself is the fastest thing to share: make it copyable ---- */
const codeEl = document.getElementById('lobby-code');
if (codeEl) {
  codeEl.setAttribute('role', 'button');
  codeEl.setAttribute('tabindex', '0');
  codeEl.setAttribute('aria-label', 'Lobby code — activate to copy');
  let copyT = null;
  const copyCode = async () => {
    const code = (codeEl.textContent || '').trim();
    if (!code || code === '-----') return;
    try { await navigator.clipboard.writeText(code); } catch { return; }
    codeEl.classList.add('copied');
    clearTimeout(copyT);
    copyT = setTimeout(() => codeEl.classList.remove('copied'), 1600);
  };
  codeEl.addEventListener('click', copyCode);
  codeEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copyCode(); }
  });
}

/* ---- lobby countdown presence: mirror main.js' hint text into a ring ---- */
const hint = document.getElementById('lobby-hint');
if (hint) {
  const ring = document.createElement('div');
  ring.className = 'lobby-countdown hidden';
  ring.setAttribute('aria-hidden', 'true');
  ring.innerHTML = '<span class="cd-num"></span><span class="cd-lbl">STARTING</span>';
  hint.parentNode.insertBefore(ring, hint);
  const num = ring.querySelector('.cd-num');
  new MutationObserver(() => {
    const m = /Starting in (\d+)s/.exec(hint.textContent || '');
    ring.classList.toggle('hidden', !m);
    if (m && num.textContent !== m[1]) {
      num.textContent = m[1];
      if (!reduceMotion.matches) { ring.classList.remove('tick'); void ring.offsetWidth; ring.classList.add('tick'); }
    }
  }).observe(hint, { childList: true, characterData: true, subtree: true });
}

/* ---- sliders read as filled-to-value, not as a bare rail ---- */
const ranges = [...document.querySelectorAll('.opt-grid input[type="range"]')];
const paintRange = (el) => {
  const min = Number(el.min || 0), max = Number(el.max || 100);
  const pct = max > min ? ((Number(el.value) - min) / (max - min)) * 100 : 0;
  el.style.setProperty('--fill', Math.max(0, Math.min(100, pct)) + '%');
};
ranges.forEach((el) => {
  paintRange(el);
  el.addEventListener('input', () => paintRange(el));
});
// main.js can rewrite the master slider (co-op auto-volume); repaint on open
const optionsScreen = document.getElementById('options');
if (optionsScreen) {
  new MutationObserver(() => {
    if (!optionsScreen.classList.contains('hidden')) ranges.forEach(paintRange);
  }).observe(optionsScreen, { attributes: true, attributeFilter: ['class'] });
}

/* ---- press feedback on every menu/panel button (compositor-only) ---- */
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest?.('.mbtn, .char-card, .vline-btn, .wpn-item, .gate-action');
  if (b) b.classList.add('is-pressed');
}, true);
const clearPress = () => document.querySelectorAll('.is-pressed').forEach((b) => b.classList.remove('is-pressed'));
document.addEventListener('pointerup', clearPress, true);
document.addEventListener('pointercancel', clearPress, true);

/* ---- keyboard users get focus rings; mouse users do not ---- */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') document.body.classList.add('kbd-nav');
}, true);
document.addEventListener('pointerdown', () => document.body.classList.remove('kbd-nav'), true);
