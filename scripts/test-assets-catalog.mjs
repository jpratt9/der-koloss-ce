import assert from 'node:assert/strict';
import { PERSONAS, LINES } from '../js/personas.js';
import { archiveHarness, moduleTest } from './lib/assets-page-harness.mjs';

await moduleTest(async () => {
  const h = archiveHarness(), sounds = [];
  const { renderArchiveCatalog } = await h.evaluate('js/assets-page/catalog.js');
  assert.equal(h.element('voice-groups').children.length, 0, 'import does not construct the catalog');
  renderArchiveCatalog({ makeSoundButton(sound) { sounds.push(sound); const button = h.create('button'); button.textContent = sound.label; return button; } });
  assert.equal(h.element('voice-groups').children.length, PERSONAS.length);
  assert.equal(h.element('effect-groups').children.length, 6);
  for (const persona of PERSONAS) {
    for (const [event, lines] of Object.entries(LINES[persona.id])) {
      for (const [index, line] of lines.entries()) {
        const matches = sounds.filter(s => s.id === `vox_${persona.id}_${event}${index + 1}`);
        assert.equal(matches.length, 1); assert.equal(matches[0].kind, persona.label);
        assert.ok(matches[0].label.endsWith(` ${index + 1} // “${line}”`));
      }
    }
  }
  for (const id of ['bottle_break', 'belch', 'drink', 'perk_jug', 'perk_speed', 'perk_dtap', 'perk_qr']) {
    assert.equal(sounds.filter(s => s.id === id && s.kind === 'Perk Machines').length, 1);
  }
  assert.equal(sounds.find(s => s.id === 'perk_jug').label, 'Perk Juggernog');
  assert.equal(sounds.filter(s => /^groan\d+$/.test(s.id)).length, 10);
  assert.equal(sounds.filter(s => /^snarl\d+$/.test(s.id)).length, 4);
  assert.equal(sounds.filter(s => /^zdeath\d+$/.test(s.id)).length, 4);
  const original = sounds.filter(s => s.id === 'beauty-of-annihilation');
  assert.equal(original.length, 1); assert.equal(original[0].kind, 'World at War // Der Riese');
  assert.equal(original[0].label, 'Beauty of Annihilation // Play World at War recording');
  assert.equal(h.element('original-music-control').children.length, 1);
  assert.equal(h.media.length, 0, 'catalog rendering never initiates media playback');
  console.log('Asset catalog OK: persona IDs/labels, effect groups, perk recordings and original music.');
});
