import assert from 'node:assert/strict';
import { archiveHarness, moduleTest } from './lib/assets-page-harness.mjs';

await moduleTest(async () => {
  const h = archiveHarness(), calls = []; let active = false;
  const { createAudioDock, soundUrl } = await h.evaluate('js/assets-page/audio-dock.js');
  assert.equal(h.media.length, 0, 'import has no playback side effects');
  const dock = createAudioDock({ siteAudio: h.siteAudio,
    cancelWeaponInteraction: message => calls.push(['cancel', message]),
    applyPreviewPap: pap => { assert.equal(h.element('dock-title').textContent, 'Glass'); calls.push(['preview', pap]); },
    isWeaponInteractionActive: () => active,
  });
  assert.equal(soundUrl('bottle_break'), '../assets/audio/bottle_break.mp3?v=perk-v4');
  assert.equal(soundUrl('belch'), '../assets/audio/belch.mp3?v=perk-v4');
  assert.equal(soundUrl('ui'), '../assets/audio/ui.mp3');
  const button = dock.makeSoundButton({ id: 'bottle_break', label: 'Glass', kind: 'Perks', modelPap: true });
  h.element('effect-groups').append(button);
  const audio = h.media[0];
  await button.click(); assert.deepEqual(calls.map(x => x[0]), ['cancel', 'preview']);
  assert.equal(audio.paused, false); assert.equal(button.classList.contains('playing'), true);
  assert.equal(h.element('dock-kind').textContent, 'PERKS');
  assert.equal(h.element('dock-toggle').attributes['aria-label'], 'Pause audio');
  await button.click(); assert.equal(audio.paused, true); assert.equal(calls.at(-1)[0], 'cancel');
  assert.equal(calls.filter(x => x[0] === 'preview').length, 1, 'same recording toggles without changing the model');
  assert.equal(button.classList.contains('playing'), false);
  audio.rejectPlay = true; await button.click(); await Promise.resolve();
  assert.deepEqual(h.log.at(-1), ['duck', false], 'play failure restores background audio');
  audio.rejectPlay = false;
  await button.click(); active = true; const start = h.log.length; audio.pause();
  assert.equal(h.log.slice(start).some(x => x[0] === 'duck' && x[1] === false), false, 'pause reads current weapon activity');
  await audio.play(); active = false; audio.pause(); assert.deepEqual(h.log.at(-1), ['duck', false]);
  audio.duration = 125; await audio.emit('loadedmetadata'); assert.equal(h.element('dock-duration').textContent, '2:05');
  audio.duration = Infinity; await audio.emit('loadedmetadata'); assert.equal(h.element('dock-duration').textContent, '0:00');
  audio.duration = 100; audio.currentTime = 25; await audio.emit('timeupdate');
  assert.equal(h.element('dock-current').textContent, '0:25'); assert.equal(h.element('dock-scrub').value, '25');
  await h.element('dock-scrub').emit('input', { target: { value: '60' } }); assert.equal(audio.currentTime, 60);
  await h.element('dock-toggle').click(); assert.equal(audio.paused, false);
  dock.pauseForWeapon(); assert.equal(audio.paused, true); assert.equal(button.classList.contains('playing'), false);
  await audio.play(); dock.syncPlayingButtons(); assert.equal(button.classList.contains('playing'), false, 'weapon pause cleared the active recording ID');
  dock.showLiveDock('Weapon', 'Handling');
  assert.equal(h.element('dock-toggle').disabled, true); assert.equal(h.element('dock-scrub').disabled, true);
  assert.equal(h.element('dock-current').textContent, 'LIVE'); assert.equal(h.element('dock-duration').textContent, '');
  await button.click(); assert.equal(h.element('dock-toggle').disabled, false); assert.equal(h.element('dock-scrub').disabled, false);
  await audio.emit('ended'); assert.equal(button.classList.contains('playing'), false); assert.deepEqual(h.log.at(-1), ['duck', false]);
  console.log('Asset audio dock OK: mocked recording/weapon transitions, callback order, failures, live ducking, scrub and revised URLs.');
});
