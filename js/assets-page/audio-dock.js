// ElevenLabs-generated perk bottle shatter and deep soda belch.
const AUDIO_REVISIONS = Object.freeze({ bottle_break: 'perk-v4', belch: 'perk-v4' });
export function soundUrl(id) { return `../assets/audio/${id}.mp3${AUDIO_REVISIONS[id] ? `?v=${AUDIO_REVISIONS[id]}` : ''}`; }

export function createAudioDock({ siteAudio, cancelWeaponInteraction, applyPreviewPap, isWeaponInteractionActive }) {
  const $ = (id) => document.getElementById(id);
  const audio = new Audio();
  audio.preload = 'metadata';
  let activeSoundId = '';

  function formatTime(value) {
    if (!Number.isFinite(value)) return '0:00';
    const minutes = Math.floor(value / 60);
    return `${minutes}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  }
  function clearPlayingButtons() {
    document.querySelectorAll('.sound-button.playing').forEach((button) => button.classList.remove('playing'));
  }
  function syncPlayingButtons() {
    clearPlayingButtons();
    if (audio.paused || !activeSoundId) return;
    document.querySelectorAll(`.sound-button[data-sound="${CSS.escape(activeSoundId)}"]`).forEach((button) => button.classList.add('playing'));
  }
  function playSound(id, title, kind = 'Archive audio', modelPap = null) {
    cancelWeaponInteraction('READY // SELECT A FIRE CONTROL');
    if (activeSoundId === id && !audio.paused) {
      audio.pause();
      return;
    }
    activeSoundId = id;
    audio.src = soundUrl(id);
    $('dock-title').textContent = title;
    $('dock-kind').textContent = kind.toUpperCase();
    $('audio-dock').classList.add('visible');
    $('dock-toggle').disabled = false;
    $('dock-scrub').disabled = false;
    if (modelPap !== null) {
      applyPreviewPap(modelPap);
    }
    siteAudio.setDucked(true);
    audio.play().catch(() => siteAudio.setDucked(false));
  }

  audio.addEventListener('play', () => {
    siteAudio.setDucked(true);
    $('dock-toggle').textContent = '❚❚';
    $('dock-toggle').setAttribute('aria-label', 'Pause audio');
    syncPlayingButtons();
  });
  audio.addEventListener('pause', () => {
    if (!isWeaponInteractionActive()) siteAudio.setDucked(false);
    $('dock-toggle').textContent = '▶';
    $('dock-toggle').setAttribute('aria-label', 'Play audio');
    syncPlayingButtons();
  });
  audio.addEventListener('ended', () => { siteAudio.setDucked(false); clearPlayingButtons(); });
  audio.addEventListener('loadedmetadata', () => { $('dock-duration').textContent = formatTime(audio.duration); });
  audio.addEventListener('timeupdate', () => {
    $('dock-current').textContent = formatTime(audio.currentTime);
    $('dock-scrub').value = audio.duration ? String((audio.currentTime / audio.duration) * 100) : '0';
  });
  $('dock-toggle').addEventListener('click', () => { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); });
  $('dock-scrub').addEventListener('input', (event) => {
    if (audio.duration) audio.currentTime = (Number(event.target.value) / 100) * audio.duration;
  });

  function makeSoundButton({ id, label, kind, modelPap = null }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sound-button';
    button.dataset.sound = id;
    button.dataset.uiSound = 'off';
    button.textContent = label;
    button.addEventListener('click', () => playSound(id, label, kind, modelPap));
    return button;
  }

  function showLiveDock(title, kind) {
    $('audio-dock').classList.add('visible');
    $('dock-title').textContent = title;
    $('dock-kind').textContent = kind.toUpperCase();
    $('dock-toggle').textContent = '•';
    $('dock-toggle').disabled = true;
    $('dock-scrub').disabled = true;
    $('dock-current').textContent = 'LIVE';
    $('dock-duration').textContent = '';
    $('dock-scrub').value = '0';
  }
  function pauseForWeapon() {
    audio.pause();
    activeSoundId = '';
    clearPlayingButtons();
  }
  return { makeSoundButton, syncPlayingButtons, showLiveDock, pauseForWeapon };
}
