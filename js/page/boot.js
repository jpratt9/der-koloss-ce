import { isMobileOrTablet } from '../device-gate.js';
import { syncMenuMusicElement } from '../site-audio.js?v=6';

if (isMobileOrTablet()) {
  const gate = document.getElementById('device-gate');
  const soundtrack = document.getElementById('gate-soundtrack');
  const audioButton = document.getElementById('gate-audio');
  const gateUi = new Audio('assets/audio/ui.mp3');
  gate.classList.remove('hidden');
  document.body.classList.add('touch-device-gated');

  const syncAudioButton = () => {
    const playing = !soundtrack.paused;
    audioButton.setAttribute('aria-pressed', String(playing));
    audioButton.textContent = playing ? '❚❚ PAUSE MENU TRANSMISSION' : '▶ PLAY MENU TRANSMISSION';
  };
  const tryPlay = () => soundtrack.play().then(syncAudioButton).catch(() => {});
  soundtrack.volume = 0.42;
  gateUi.volume = 0.5;
  syncMenuMusicElement(soundtrack);
  tryPlay();
  audioButton.addEventListener('click', () => {
    if (soundtrack.paused) tryPlay();
    else { soundtrack.pause(); syncAudioButton(); }
  });
  gate.querySelectorAll('a, button').forEach((control) => control.addEventListener('click', (event) => {
    if (control === audioButton) return;
    gateUi.currentTime = 0;
    gateUi.play().catch(() => {});
    if (!control.matches('a') || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setTimeout(() => { location.href = control.href; }, 75);
  }));
  document.addEventListener('pointerdown', () => { if (soundtrack.paused) tryPlay(); }, { once: true });
} else {
  import('../main.js?v=6');
}
