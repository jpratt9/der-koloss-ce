// The cheat codes: the saved codes and the host's copy guests see, the custom
// loadout catalog, and the cheat code screen.
import { audio } from '../audio.js';
import { WEAPONS } from '../weapons.js';
import { $, app, showScreen, toast } from './app.js';

// ---------------- cheat codes ----------------
const CHEATS_KEY = 'der-riese-cheats';
function loadCheats() {
  // `|| {}` alone still lets a primitive through — JSON.parse('7') is 7, and
  // modules are strict mode, so the first `cheats[id] = ...` on a number throws.
  try {
    const v = JSON.parse(localStorage.getItem(CHEATS_KEY));
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  } catch (e) { return {}; }
}
const cheats = loadCheats();

function saveCheats() {
  localStorage.setItem(CHEATS_KEY, JSON.stringify(cheats));
  if (app?.net?.isHost) app.net.setLobbyCheats(cheats);
}
const CHEAT_IDS = ['papguns', 'wunder', 'perkaholic', 'goldguns', 'opensesame', 'zero', 'warbond', 'god', 'power', 'tele'];
const cheatsReadOnly = () => !!(app.net && !app.net.isHost);
const visibleCheats = () => cheatsReadOnly() ? (app.net?.lobbyCheats || {}) : cheats;
// ---- custom loadout catalog: era -> type -> A-Z ----
const WPN_ERA = {
  m1911: 0, magnum: 0, kar98: 0, gewehr43: 0, m1a1: 0, m1garand: 0, thompson: 0, mp40: 0,
  type100: 0, ppsh: 0, trench: 0, dbshotgun: 0, bar: 0, fg42: 0, mg42: 0, browning: 0,
  ptrs41: 0, mosin: 0, springfield: 0, panzerschreck: 0, stg44: 0, raygun: 0, dg2: 0,
  ump45: 1, acr: 1, famas: 1, ak74u: 1, galil: 1, commando: 1,
};
const ERA_LBL = ['WORLD AT WAR', 'BLACK OPS ERA'];
const CLS_ORDER = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'lmg', 'launcher', 'wonder'];
const CLS_LBL = { pistol: 'PISTOLS', smg: 'SMGs', shotgun: 'SHOTGUNS', rifle: 'RIFLES', sniper: 'SNIPERS', lmg: 'LMGs', launcher: 'LAUNCHERS', wonder: 'WONDER WEAPONS' };
const LOADOUT_GUNS = Object.keys(WPN_ERA)
  .map((id) => ({ id, name: WEAPONS[id]?.name || id, cls: WEAPONS[id]?.cls || 'rifle', era: WPN_ERA[id] }))
  .filter((w) => CLS_ORDER.includes(w.cls))
  .sort((a, b) => a.era - b.era || CLS_ORDER.indexOf(a.cls) - CLS_ORDER.indexOf(b.cls) || a.name.localeCompare(b.name));
function buildWeaponPickers() {
  for (const wrap of document.querySelectorAll('.wpn-pick')) {
    const slot = wrap.dataset.slot;
    const list = wrap.querySelector('.wpn-list');
    const search = wrap.querySelector('.wpn-search');
    const render = (filter = '') => {
      list.innerHTML = '';
      let lastGroup = null;
      for (const w of LOADOUT_GUNS) {
        if (filter && !w.name.toLowerCase().includes(filter)) continue;
        const group = `${ERA_LBL[w.era]} · ${CLS_LBL[w.cls]}`;
        if (group !== lastGroup) {
          lastGroup = group;
          const gh = document.createElement('div');
          gh.className = 'wpn-group'; gh.textContent = group;
          list.appendChild(gh);
        }
        const b = document.createElement('button');
        b.className = 'wpn-item' + (visibleCheats().loadout?.[slot] === w.id ? ' sel' : '');
        b.disabled = cheatsReadOnly();
        b.innerHTML = `${w.name}<span class="cls">${w.cls.toUpperCase()}</span>`;
        b.addEventListener('click', () => {
          if (cheatsReadOnly()) return;
          audio.play('ui');
          cheats.loadout = cheats.loadout || {};
          cheats.loadout[slot] = cheats.loadout[slot] === w.id ? null : w.id; // click again to clear
          // custom loadout is exclusive with the random/spawn-weapon codes
          if (cheats.loadout[slot]) {
            for (const id of ['papguns', 'wunder']) { cheats[id] = false; const el = $('cheat-' + id); if (el) el.checked = false; }
          }
          saveCheats();
          render(search.value.trim().toLowerCase());
        });
        list.appendChild(b);
      }
      if (!list.children.length) list.innerHTML = '<div class="wpn-group">no guns match</div>';
    };
    search.addEventListener('input', () => render(search.value.trim().toLowerCase()));
    wrap._render = render;
    render();
  }
}
let cheatsReturnTo = 'menu';
function openCheats(from) {
  cheatsReturnTo = from;
  syncCheatsUI();
  showScreen('cheats');
}
function syncCheatsUI() {
  const guest = cheatsReadOnly();
  const shown = visibleCheats();
  for (const id of CHEAT_IDS) {
    const el = $('cheat-' + id);
    if (el) { el.checked = !!shown[id]; el.disabled = guest; }
  }
  $('cheat-round').value = shown.startRound || 1;
  $('cheat-round').disabled = guest;
  $('cheat-area').value = shown.startArea || 'mainframe';
  $('cheat-area').disabled = guest;
  $('cheats-panel').classList.toggle('read-only', guest);
  for (const wrap of document.querySelectorAll('.wpn-pick')) wrap._render?.(wrap.querySelector('.wpn-search').value.trim().toLowerCase());
  // Guests see the host's current snapshot, but cannot mutate any setting.
  $('cheats-note').textContent = guest
    ? 'VIEW ONLY — only the host can change cheats. The settings shown here are the host’s and apply to everyone.'
    : 'Solo & hosted lobbies — in co-op your codes apply to everyone.';
  $('btn-cheats-all').style.display = guest ? 'none' : '';
  $('btn-cheats-none').style.display = guest ? 'none' : '';
  $('btn-titan').style.display = guest ? 'none' : '';
}
function bindCheatsUI() {
  for (const id of CHEAT_IDS) {
    const el = $('cheat-' + id);
    if (!el) continue;
    el.checked = !!cheats[id];
    el.addEventListener('change', () => {
      if (cheatsReadOnly()) { syncCheatsUI(); return; }
      audio.play('ui');
      cheats[id] = el.checked;
      // ARMED TO THE TEETH / WUNDERWAFFEN / custom loadout: pick ONE source of spawn guns
      if (el.checked && (id === 'papguns' || id === 'wunder')) {
        const other = id === 'papguns' ? 'wunder' : 'papguns';
        cheats[other] = false; $('cheat-' + other).checked = false;
        cheats.loadout = {};
        for (const wrap of document.querySelectorAll('.wpn-pick')) wrap._render?.();
      }
      saveCheats();
    });
  }
  buildWeaponPickers();
  $('btn-titan').addEventListener('click', () => {
    if (cheatsReadOnly()) return;
    Object.assign(cheats, {
      wunder: true, perkaholic: true, opensesame: true, warbond: true,
      god: true, power: true, tele: true,
      papguns: false, goldguns: false, zero: false, loadout: {},
    });
    saveCheats(); syncCheatsUI();
    audio.play('count_go');
    toast('TITAN MODE armed — God + Wunderwaffen + perks + 50k + power on + doors open + teleporters linked (no gold, no ghost town)');
  });
  const setAll = (v) => {
    if (cheatsReadOnly()) return;
    for (const id of CHEAT_IDS) { cheats[id] = v; const el = $('cheat-' + id); if (el) el.checked = v; }
    // ARMED TO THE TEETH and WUNDERWAFFEN are mutually exclusive — the checkbox
    // handler above enforces it, and applyCheats assumes it. Ticking both made
    // the spawn build a full set of view-models and then throw them away for a
    // second set on the most expensive frame of the session.
    if (v) { cheats.wunder = false; const w = $('cheat-wunder'); if (w) w.checked = false; }
    if (!v) cheats.loadout = {};
    else { cheats.loadout = {}; } // select-all never picks specific guns
    for (const wrap of document.querySelectorAll('.wpn-pick')) wrap._render?.();
    saveCheats(); audio.play('buy');
    // GHOST TOWN is in the set, so "everything on" means no zombies. Say so —
    // otherwise an empty factory reads as the game being broken.
    if (v) toast('Every code armed — including GHOST TOWN, so no zombies will spawn. Untick it for a normal run.');
  };
  $('btn-cheats-all').addEventListener('click', () => setAll(true));
  $('btn-cheats-none').addEventListener('click', () => setAll(false));
  const rEl = $('cheat-round');
  rEl.addEventListener('change', () => {
    if (cheatsReadOnly()) { syncCheatsUI(); return; }
    cheats.startRound = Math.max(1, Math.min(40, parseInt(rEl.value) || 1));
    rEl.value = cheats.startRound; saveCheats(); audio.play('ui');
  });
  const aEl = $('cheat-area');
  aEl.addEventListener('change', () => {
    if (cheatsReadOnly()) { syncCheatsUI(); return; }
    cheats.startArea = aEl.value; saveCheats(); audio.play('ui');
  });
}

export { cheats, cheatsReturnTo, openCheats, syncCheatsUI, bindCheatsUI };
