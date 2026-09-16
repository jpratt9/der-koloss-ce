// Asset Archive interactions: model inspection, recordings, filters, and playback.
import { WEAPONS, getStats } from './weapons.js';
import { initSiteAudio } from './site-audio.js?v=6';
import { createWeaponViewer } from './assets-page/viewer.js';
import { renderArchiveCatalog } from './assets-page/catalog.js';
import { createAudioDock, soundUrl } from './assets-page/audio-dock.js';

const $ = (id) => document.getElementById(id);
const siteAudio = initSiteAudio();

const CLASS_NAMES = {
  pistol: 'Pistols', smg: 'Submachine Guns', rifle: 'Rifles', shotgun: 'Shotguns',
  lmg: 'Light Machine Guns', sniper: 'Sniper Rifles', launcher: 'Launchers', wonder: 'Wonder Weapons',
};
const CLASS_ORDER = ['pistol', 'smg', 'rifle', 'shotgun', 'lmg', 'sniper', 'launcher', 'wonder'];
const weaponEntries = Object.entries(WEAPONS).filter(([, weapon]) => CLASS_ORDER.includes(weapon.cls));

let selectedId = 'm1911';
let classFilter = 'all';
let variantFilter = 'both';
let searchTerm = '';
let previewPap = false;
let finishMode = 'standard';
let weaponInteractionActive = false;

const { makeSoundButton, syncPlayingButtons, showLiveDock, pauseForWeapon } = createAudioDock({
  siteAudio, cancelWeaponInteraction, applyPreviewPap,
  isWeaponInteractionActive: () => weaponInteractionActive,
});

function applyPreviewPap(modelPap) {
  previewPap = modelPap;
  finishMode = modelPap ? 'pap' : 'standard';
  document.querySelectorAll('.finish-button').forEach((candidate) => candidate.classList.toggle('active', candidate.dataset.finish === finishMode));
  renderSelectedWeapon();
}

// ---------------------------------------------------------------------------
// Interactive armory model
// ---------------------------------------------------------------------------
const { weaponRig, setModel, resetView } = createWeaponViewer({
  canvas: $('weapon-canvas'), canvasWrap: $('weapon-canvas-wrap'),
});

// ---------------------------------------------------------------------------
// Armory filters and selection
// ---------------------------------------------------------------------------
function renderClassFilters() {
  const host = $('class-filters');
  host.replaceChildren();
  [{ id: 'all', label: 'All' }, ...CLASS_ORDER.map((id) => ({ id, label: CLASS_NAMES[id] }))].forEach(({ id, label }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `filter-button${id === classFilter ? ' active' : ''}`;
    button.textContent = label;
    button.setAttribute('aria-pressed', String(id === classFilter));
    button.addEventListener('click', () => {
      classFilter = id;
      renderClassFilters();
      reconcileSelectedWeapon();
      renderWeaponGrid();
    });
    host.append(button);
  });
}

function visibleWeapons() {
  return weaponEntries.filter(([, weapon]) => {
    const classMatch = classFilter === 'all' || weapon.cls === classFilter;
    const haystack = `${weapon.name} ${weapon.pap?.name || ''} ${CLASS_NAMES[weapon.cls]}`.toLowerCase();
    return classMatch && haystack.includes(searchTerm);
  });
}
function reconcileSelectedWeapon() {
  const entries = visibleWeapons();
  if (!entries.length || entries.some(([id]) => id === selectedId)) return;
  cancelWeaponInteraction();
  selectedId = entries[0][0];
  previewPap = variantFilter === 'pap';
  renderSelectedWeapon();
}
function renderWeaponGrid() {
  const host = $('weapon-grid');
  host.replaceChildren();
  const entries = visibleWeapons();
  $('weapon-result-count').textContent = `${entries.length} ${entries.length === 1 ? 'WEAPON' : 'WEAPONS'}`;
  entries.forEach(([id, weapon]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `weapon-card${id === selectedId ? ' active' : ''}`;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(id === selectedId));
    button.dataset.weaponId = id;
    button.innerHTML = `<b>${weapon.name}</b><span>${CLASS_NAMES[weapon.cls]} · ${weapon.pap?.name || 'No upgrade record'}</span>`;
    button.addEventListener('click', () => {
      cancelWeaponInteraction();
      selectedId = id;
      previewPap = variantFilter === 'pap';
      renderWeaponGrid();
      renderSelectedWeapon();
      if (innerWidth < 801) $('weapon-canvas-wrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    host.append(button);
  });
  $('weapon-empty').classList.toggle('visible', entries.length === 0);
}
function statValue(value, suffix = '') { return value == null ? '—' : `${value}${suffix}`; }
function previewUsesPap() {
  return finishMode === 'pap' || finishMode === 'diamond'
    || (finishMode === 'standard' && (variantFilter === 'pap' || (variantFilter === 'both' && previewPap)));
}

const ammoByLoadout = new Map();
const shotPools = new Map();
let fireSession = null;
let reloadTimers = [];
let reloadCompleteTimer = null;
let reloadToken = 0;

function ammoState(id, pap) {
  const key = `${id}:${pap ? 'pap' : 'normal'}`;
  if (!ammoByLoadout.has(key)) {
    const stats = getStats(id, pap);
    ammoByLoadout.set(key, {
      magazine: Math.max(0, stats.mag || 0),
      capacity: Math.max(0, stats.mag || 0),
      reserve: Math.max(0, stats.reserve || 0),
    });
  }
  return ammoByLoadout.get(key);
}

function setWeaponStatus(message, state = '') {
  $('weapon-status').textContent = message;
  $('weapon-status').classList.toggle('firing', state === 'firing');
}

function updateWeaponStats(pap) {
  const stats = getStats(selectedId, pap);
  const ammo = ammoState(selectedId, pap);
  $('weapon-stats').innerHTML = [
    ['DAMAGE', statValue(stats.dmg)], ['RATE', statValue(stats.rpm, ' RPM')],
    ['MAGAZINE', `${ammo.magazine} / ${ammo.capacity}`], ['RESERVE', statValue(ammo.reserve)],
  ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('');
}

function updateWeaponPresentation(pap, resetModel = true) {
  const weapon = WEAPONS[selectedId];
  const stats = getStats(selectedId, pap);
  $('weapon-class').textContent = `${CLASS_NAMES[weapon.cls]} // ${pap ? 'Pack-a-Punch' : 'Standard issue'}`;
  $('weapon-name').textContent = pap ? weapon.pap?.name || weapon.name : weapon.name;
  $('pap-name').textContent = pap ? `Original designation: ${weapon.name}` : `Upgrade: ${weapon.pap?.name || 'No record'}`;
  updateWeaponStats(pap);
  $('fire-instruction').textContent = stats.auto
    ? `Press and hold to fire at ${stats.rpm} RPM. The weapon reloads automatically when empty.`
    : 'Press to fire one shot. Reload manually or when the magazine is empty.';
  if (resetModel) setModel(selectedId, pap, finishMode);
}

function activateFireVariant(pap) {
  previewPap = pap;
  finishMode = pap ? 'pap' : 'standard';
  document.querySelectorAll('.finish-button').forEach((button) => button.classList.toggle('active', button.dataset.finish === finishMode));
  updateWeaponPresentation(pap);
}

function pooledShot(soundId) {
  let pool = shotPools.get(soundId);
  if (!pool) {
    pool = { index: 0, sounds: Array.from({ length: 8 }, () => {
      const shot = new Audio(soundUrl(soundId));
      shot.preload = 'auto';
      shot.volume = 0.86;
      return shot;
    }) };
    shotPools.set(soundId, pool);
  }
  const shot = pool.sounds[pool.index++ % pool.sounds.length];
  shot.currentTime = 0;
  shot.play().catch(() => {});
}

function clearReloadTimers() {
  reloadTimers.forEach(clearTimeout);
  reloadTimers = [];
  clearTimeout(reloadCompleteTimer);
  reloadCompleteTimer = null;
  reloadToken += 1;
}

function finishFireSession(message = 'READY // RELEASED') {
  if (!fireSession) return;
  clearTimeout(fireSession.timer);
  fireSession.button?.classList.remove('firing');
  fireSession = null;
  weaponInteractionActive = false;
  siteAudio.setDucked(false);
  setWeaponStatus(message);
}

function cancelWeaponInteraction(message = 'READY // SELECT A FIRE CONTROL') {
  clearReloadTimers();
  if (fireSession) {
    clearTimeout(fireSession.timer);
    fireSession.button?.classList.remove('firing');
    fireSession = null;
  }
  weaponInteractionActive = false;
  siteAudio.setDucked(false);
  if ($('weapon-status')) setWeaponStatus(message);
}

function completeReload(id, pap) {
  const ammo = ammoState(id, pap);
  const needed = Math.max(0, ammo.capacity - ammo.magazine);
  const loaded = Math.min(needed, ammo.reserve);
  ammo.magazine += loaded;
  ammo.reserve -= loaded;
  if (id === selectedId) updateWeaponStats(pap);
  return loaded;
}

function playReloadSequence(id, pap = previewUsesPap(), onComplete = null) {
  clearReloadTimers();
  const token = reloadToken;
  pauseForWeapon();
  weaponInteractionActive = true;
  siteAudio.setDucked(true);
  const weapon = WEAPONS[id];
  const stats = getStats(id, pap);
  const duration = Math.max(0.1, stats.reload || weapon.reload || 0.1);
  weaponRig.startReload(duration);
  showLiveDock(`${pap ? weapon.pap?.name || weapon.name : weapon.name} // Reload sequence`, 'Weapon handling');
  setWeaponStatus(`RELOADING // ${duration.toFixed(1)} SECONDS`);
  (weapon.reloadStages || []).forEach(([fraction, soundId]) => {
    reloadTimers.push(setTimeout(() => {
      if (token !== reloadToken) return;
      const stageAudio = new Audio(soundUrl(soundId));
      stageAudio.volume = 0.9;
      stageAudio.play().catch(() => {});
    }, fraction * duration * 1000));
  });
  reloadCompleteTimer = setTimeout(() => {
    if (token !== reloadToken) return;
    const loaded = completeReload(id, pap);
    onComplete?.(loaded);
    if (!fireSession) {
      weaponInteractionActive = false;
      siteAudio.setDucked(false);
      const ammo = ammoState(id, pap);
      if (loaded) setWeaponStatus(`READY // ${loaded} ROUNDS LOADED`);
      else if (ammo.magazine >= ammo.capacity) setWeaponStatus('READY // RELOAD SEQUENCE COMPLETE');
      else setWeaponStatus('EMPTY // NO RESERVE AMMUNITION');
    }
  }, duration * 1000 + 40);
}

function fireNextRound() {
  const session = fireSession;
  if (!session || session.id !== selectedId || session.reloading) return;
  const weapon = WEAPONS[session.id];
  const stats = getStats(session.id, session.pap);
  const ammo = ammoState(session.id, session.pap);
  if (ammo.magazine <= 0) {
    if (ammo.reserve <= 0) {
      pooledShot('dry');
      finishFireSession('EMPTY // NO RESERVE AMMUNITION');
      return;
    }
    session.reloading = true;
    playReloadSequence(session.id, session.pap, (loaded) => {
      if (!fireSession || fireSession !== session) return;
      session.reloading = false;
      if (loaded > 0 && session.held) fireNextRound();
      else finishFireSession(loaded ? 'READY // RELOAD COMPLETE' : 'EMPTY // NO RESERVE AMMUNITION');
    });
    return;
  }

  weaponRig.fire();
  pooledShot(`${weapon.sfx}${session.pap ? '_pap' : ''}`);
  ammo.magazine -= 1;
  updateWeaponStats(session.pap);
  setWeaponStatus(`FIRING // ${ammo.magazine} OF ${ammo.capacity} ROUNDS`, 'firing');

  const delay = Math.max(45, 60000 / Math.max(1, stats.rpm || 60));
  if (stats.auto && session.held) {
    session.timer = setTimeout(fireNextRound, delay);
  } else if (ammo.magazine === 0 && ammo.reserve > 0) {
    session.timer = setTimeout(fireNextRound, delay);
  } else {
    session.timer = setTimeout(() => finishFireSession(`READY // ${ammo.magazine} ROUNDS REMAIN`), Math.min(240, delay));
  }
}

function startFiring(pap, button, held = true, preserveFinish = false) {
  cancelWeaponInteraction();
  if (!preserveFinish) activateFireVariant(pap);
  pauseForWeapon();
  weaponInteractionActive = true;
  siteAudio.setDucked(true);
  const weapon = WEAPONS[selectedId];
  const stats = getStats(selectedId, pap);
  fireSession = { id: selectedId, pap, held, button, timer: null, reloading: false };
  button.classList.add('firing');
  const finishLabel = preserveFinish && (finishMode === 'diamond' || finishMode === 'gold')
    ? `${finishMode} finish`
    : (pap ? 'Pack-a-Punch' : CLASS_NAMES[weapon.cls]);
  showLiveDock(`${pap ? weapon.pap?.name || weapon.name : weapon.name} // Live fire`, finishLabel);
  setWeaponStatus(stats.auto ? 'FIRING // HOLD TO CONTINUE' : 'FIRING // SINGLE SHOT', 'firing');
  fireNextRound();
}

function releaseFiring(button) {
  if (!fireSession || fireSession.button !== button) return;
  fireSession.held = false;
  clearTimeout(fireSession.timer);
  if (!fireSession.reloading) finishFireSession('READY // TRIGGER RELEASED');
}

function bindFireControl(button, pap, { preserveFinish = false } = {}) {
  let lastActivation = 0;
  button.dataset.uiSound = 'off';
  button.setAttribute('aria-label', `${button.textContent}. Press${WEAPONS[selectedId].auto ? ' and hold' : ''} to fire.`);
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    lastActivation = performance.now();
    button.setPointerCapture?.(event.pointerId);
    startFiring(pap, button, true, preserveFinish);
  });
  button.addEventListener('pointerup', () => releaseFiring(button));
  button.addEventListener('pointercancel', () => releaseFiring(button));
  button.addEventListener('lostpointercapture', () => releaseFiring(button));
  button.addEventListener('keydown', (event) => {
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
      event.preventDefault();
      lastActivation = performance.now();
      startFiring(pap, button, true, preserveFinish);
    }
  });
  button.addEventListener('keyup', (event) => {
    if (event.key === ' ' || event.key === 'Enter') releaseFiring(button);
  });
  button.addEventListener('click', () => {
    if (performance.now() - lastActivation > 350) startFiring(pap, button, false, preserveFinish);
  });
}

function makeWeaponFireButton(pap) {
  const weapon = WEAPONS[selectedId];
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sound-button weapon-fire-button';
  button.textContent = `${pap ? weapon.pap?.name || weapon.name : weapon.name} // ${pap ? 'Pack-a-Punch' : 'Normal'} fire`;
  bindFireControl(button, pap);
  return button;
}

function renderSelectedWeapon() {
  cancelWeaponInteraction();
  const pap = previewUsesPap();
  updateWeaponPresentation(pap);
  const soundHost = $('weapon-audio');
  soundHost.replaceChildren();
  if (variantFilter !== 'pap') soundHost.append(makeWeaponFireButton(false));
  if (variantFilter !== 'normal') soundHost.append(makeWeaponFireButton(true));
  const actions = document.createElement('div');
  actions.className = 'weapon-action-row';
  const shoot = document.createElement('button');
  shoot.type = 'button'; shoot.className = 'weapon-action'; shoot.textContent = 'Fire animation';
  bindFireControl(shoot, pap, { preserveFinish: true });
  const reload = document.createElement('button');
  reload.type = 'button'; reload.className = 'weapon-action'; reload.textContent = 'Reload sequence';
  reload.dataset.uiSound = 'off';
  reload.addEventListener('click', () => {
    cancelWeaponInteraction();
    const activePap = previewUsesPap();
    playReloadSequence(selectedId, activePap);
  });
  const inspect = document.createElement('button');
  inspect.type = 'button'; inspect.className = 'weapon-action'; inspect.textContent = 'Inspect finish';
  inspect.addEventListener('click', () => weaponRig.startInspect());
  const rotate = document.createElement('button');
  rotate.type = 'button'; rotate.className = 'weapon-action'; rotate.textContent = 'Reset view';
  rotate.addEventListener('click', resetView);
  actions.append(shoot, reload, inspect, rotate);
  soundHost.append(actions);
  syncPlayingButtons();
}

document.querySelectorAll('.finish-button').forEach((button) => {
  button.addEventListener('click', () => {
    cancelWeaponInteraction();
    finishMode = button.dataset.finish;
    previewPap = finishMode === 'pap' || finishMode === 'diamond';
    document.querySelectorAll('.finish-button').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
    renderSelectedWeapon();
  });
});

document.querySelectorAll('.variant-button').forEach((button) => {
  button.addEventListener('click', () => {
    cancelWeaponInteraction();
    variantFilter = button.dataset.variant;
    previewPap = variantFilter === 'pap';
    if (variantFilter === 'normal' && (finishMode === 'pap' || finishMode === 'diamond')) finishMode = 'standard';
    if (variantFilter === 'pap' && (finishMode === 'standard' || finishMode === 'gold')) finishMode = 'pap';
    document.querySelectorAll('.finish-button').forEach((candidate) => candidate.classList.toggle('active', candidate.dataset.finish === finishMode));
    document.querySelectorAll('.variant-button').forEach((candidate) => {
      const active = candidate === button;
      candidate.classList.toggle('active', active);
      candidate.setAttribute('aria-pressed', String(active));
    });
    renderSelectedWeapon();
  });
});
$('weapon-search').addEventListener('input', (event) => {
  searchTerm = event.target.value.trim().toLowerCase();
  reconcileSelectedWeapon();
  renderWeaponGrid();
});

$('weapon-grid').addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const buttons = [...$('weapon-grid').querySelectorAll('.weapon-card')];
  const current = buttons.indexOf(document.activeElement);
  if (current < 0) return;
  event.preventDefault();
  const next = event.key === 'ArrowDown' ? Math.min(buttons.length - 1, current + 1) : Math.max(0, current - 1);
  buttons[next]?.focus();
  buttons[next]?.click();
});

// ---------------------------------------------------------------------------
// Voice and effects catalog
// ---------------------------------------------------------------------------
renderArchiveCatalog({ makeSoundButton });

renderClassFilters();
renderWeaponGrid();
renderSelectedWeapon();
