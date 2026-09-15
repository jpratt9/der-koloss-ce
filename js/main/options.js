// The options: their defaults and saved copy, co-op auto-volume, the options
// screen, and applying them to the audio, the HUD and a running game.
import { STORE_KEY, NAME_KEY } from '../config.js';
import { audio } from '../audio.js';
import { $, getName, app } from './app.js';

// ---------------- options ----------------
const DEFAULTS = {
  sensitivity: 1.0, fov: 110, master: 0.8, sfx: 1.0, music: 0.7, voice: 0.55,
  quality: 'high', invertY: false, brightness: 1.0, brightnessCalibration: 2, masterTouched: false,
  motionBlur: 1.0, showFps: false, settingsSchema: 2,
};
function loadOptions() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    let saved = raw ? (JSON.parse(raw) || {}) : {};
    // Calibration v2 makes the old 180% exposure the new readable 100%.
    // Older builds persisted the default 1.0 even when the player never touched
    // the slider, so reset all v1 values once to guarantee returning players get
    // the new readable baseline instead of remaining stuck on the old darkness.
    if (raw && saved.brightnessCalibration !== 2) {
      saved.brightness = 1;
      saved.brightnessCalibration = 2;
      localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    }
    // v1 and v2 ship to the same origin under the same STORE_KEY, so a player
    // returning from v1 arrives carrying a v1 options blob — and `saved` wins
    // over DEFAULTS below. Every one of those values was tuned against the old
    // forward renderer, and `quality` is the worst of them: 'low' switches off
    // shadowMap, the sun's castShadow and the whole post stack (see
    // applyQuality in js/game.js), so a returning player sees v2 rendered like
    // v1 and reasonably concludes the deploy is broken.
    //
    // So a pre-v2 blob is discarded wholesale rather than patched field by
    // field: v2 is a different renderer and a different audio mix, and the
    // defaults below are the tuned baseline we actually want everyone to land
    // on. This runs once — settingsSchema pins it — so anything the player
    // changes afterwards persists normally.
    if (raw && saved.settingsSchema !== 2) {
      saved = { ...DEFAULTS };
      localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    }
    return { ...DEFAULTS, ...saved };
  }
  catch (e) { return { ...DEFAULTS }; }
}
function saveOptions(o) { localStorage.setItem(STORE_KEY, JSON.stringify(o)); }
const options = loadOptions();

// ---------------- multiplayer auto-volume ----------------
// In co-op, drop master volume to 15% by default so voice chat stays clearly
// audible. As soon as the player moves the master slider themselves, their
// choice wins (persisted via options.masterTouched) and we never override again.
const MP_MASTER = 0.15;
let mpMasterOverride = null; // runtime-only; never written to localStorage
function effectiveMaster() { return mpMasterOverride ?? options.master; }
function syncMasterUI() {
  const el = $('opt-master');
  if (!el) return;
  el.value = effectiveMaster();
  $('opt-master-val').textContent = Math.round(effectiveMaster() * 100) + '%';
}
function setMpMasterOverride(on) {
  mpMasterOverride = (on && !options.masterTouched) ? MP_MASTER : null;
  syncMasterUI();
  audio.setVolume('master', effectiveMaster());
}

// ---------------- options UI ----------------
function bindOptionsUI() {
  const bind = (id, key, fmt = (v) => v) => {
    const el = $(id);
    el.value = options[key];
    $(id + '-val').textContent = fmt(options[key]);
    el.addEventListener('input', () => {
      options[key] = parseFloat(el.value);
      if (key === 'master') { options.masterTouched = true; mpMasterOverride = null; }
      $(id + '-val').textContent = fmt(options[key]);
      saveOptions(options);
      applyOptions();
    });
  };
  bind('opt-sens', 'sensitivity', (v) => v.toFixed(2));
  bind('opt-fov', 'fov', (v) => Math.round(v));
  bind('opt-brightness', 'brightness', (v) => Math.round(v * 100) + '%');
  bind('opt-motionblur', 'motionBlur', (v) => (v <= 0.001 ? 'Off' : Math.round(v * 100) + '%'));
  bind('opt-master', 'master', (v) => Math.round(v * 100) + '%');
  bind('opt-sfx', 'sfx', (v) => Math.round(v * 100) + '%');
  bind('opt-music', 'music', (v) => Math.round(v * 100) + '%');
  bind('opt-voice', 'voice', (v) => Math.round(v * 100) + '%');
  const q = $('opt-quality');
  q.value = options.quality;
  q.addEventListener('change', () => { options.quality = q.value; saveOptions(options); applyOptions(); });
  const vc = $('opt-voicechat');
  vc.checked = options.voiceChat !== false;
  vc.addEventListener('change', () => { options.voiceChat = vc.checked; saveOptions(options); });
  const inv = $('opt-invert');
  inv.checked = options.invertY;
  inv.addEventListener('change', () => { options.invertY = inv.checked; saveOptions(options); });
  // Not through applyOptions(): that re-applies quality, which rebuilds the
  // post stack — a hitch the Options screen can cause mid-match.
  $('opt-fps').addEventListener('change', (e) => setShowFps(e.target.checked));
  syncFpsControls();
  const nameEl = $('opt-name');
  nameEl.value = getName();
  nameEl.addEventListener('change', () => {
    const v = nameEl.value.trim().slice(0, 14) || getName();
    nameEl.value = v;
    localStorage.setItem(NAME_KEY, v);
  });
}

// One setting, two controls: the Options toggle and the pause-menu button.
function setShowFps(on) {
  options.showFps = !!on;
  saveOptions(options);
  app.hud.showFps(options.showFps);
  syncFpsControls();
}
function syncFpsControls() {
  $('opt-fps').checked = !!options.showFps;
  $('btn-pause-fps').textContent = `FPS COUNTER: ${options.showFps ? 'ON' : 'OFF'}`;
}

function applyOptions() {
  app.hud.showFps(!!options.showFps);
  audio.setVolume('master', effectiveMaster());
  audio.setVolume('sfx', options.sfx);
  audio.setVolume('music', options.music);
  audio.setVolume('voice', options.voice);
  app.net?.setVoiceVolume(options.voice);
  if (app.game) {
    app.game.applyQuality();
    // Exposure lives in the post composite now; Game.render() reads
    // options.brightness every frame, so nothing to push here.
    if (app.game.player && !app.game.player.adsT) {
      app.game.camera.fov = options.fov;
      app.game.camera.updateProjectionMatrix();
    }
  }
}

export { options, saveOptions, mpMasterOverride, setMpMasterOverride, bindOptionsUI, setShowFps, applyOptions };
