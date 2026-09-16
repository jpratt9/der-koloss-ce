import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Element, fakePage } from './lib/page-module-fakes.mjs';

const source = readFileSync(new URL('../js/page/presentation.js', import.meta.url), 'utf8');
for (const reduced of [false, true]) {
  const p = fakePage(), storage = new Map(), clipboard = [];
  const brief = new Element(), roomy = new Element(); roomy.matches = true;
  const button = p.add('btn-controls');
  const pause = p.add('pause', 'hidden'), round = p.add('round'), points = p.add('points');
  const pauseRound = p.add('pause-round'), pausePoints = p.add('pause-points');
  const options = p.add('options', 'hidden'), range = new Element();
  Object.assign(range, { min: '0', max: '1', value: '0.3' });
  const lobby = p.add('lobby-players');
  const row = new Element('lobby-row'), name = new Element('lobby-name'); name.textContent = 'Alice 👑 (you)';
  const mute = new Element('lobby-mute'); row.appendChild(name); row.appendChild(mute); row.appendChild(new Element('lobby-ready yes')); lobby.appendChild(row);
  const cards = p.add('char-cards'), charName = p.add('lobby-char-name');
  const card = new Element('char-card'), label = new Element('cc-name'); label.textContent = 'Dempsey'; card.appendChild(label); cards.appendChild(card);
  const code = p.add('lobby-code'); code.textContent = '-----'; let rejectClipboard = false;
  const hint = p.add('lobby-hint'), parent = new Element(); parent.appendChild(hint);
  const ring = new Element(), num = new Element('cd-num'); ring.appendChild(num);
  p.document.createElement = () => new Element();
  // Only the countdown template requires innerHTML parsing in this fake DOM.
  const create = p.document.createElement;
  p.document.createElement = () => {
    const el = create(); Object.defineProperty(el, 'innerHTML', { set(html) {
      if (html.includes('cd-num')) { el.appendChild(num); Object.assign(ring, { element: el }); }
    } }); return el;
  };
  p.document.querySelector = s => s === '.menu-brief' ? brief : null;
  p.document.querySelectorAll = s => s === '.is-pressed' ? [button].filter(e => e.classList.contains('is-pressed')) : [range];
  vm.runInNewContext(source, { ...p.globals,
    matchMedia: query => query.includes('reduced-motion') ? { matches: reduced } : roomy,
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    navigator: { clipboard: { async writeText(text) { if (rejectClipboard) throw new Error('mock denied'); clipboard.push(text); } } },
  });
  assert.equal(brief.classList.contains('open'), true);
  await button.emit('click'); assert.equal(storage.get('der-koloss-controls-open'), '0');
  await roomy.emit('change'); assert.equal(brief.classList.contains('open'), false, 'saved preference wins over viewport');
  assert.equal(range.style['--fill'], '30%'); range.value = '2'; await range.emit('input'); assert.equal(range.style['--fill'], '100%');
  range.value = '0.6'; p.notify(options); assert.equal(range.style['--fill'], '100%', 'hidden options do not repaint');
  options.classList.remove('hidden'); p.notify(options); assert.equal(range.style['--fill'], '60%');
  range.max = range.min; await range.emit('input'); assert.equal(range.style['--fill'], '0%');
  round.textContent = '5'; points.textContent = '12500'; p.notify(pause); assert.equal(pauseRound.textContent, '');
  pause.classList.remove('hidden'); p.notify(pause); assert.equal(pauseRound.textContent, '5'); assert.equal(pausePoints.textContent, '12,500');
  assert.equal(lobby.children.length, 4); assert.equal(row.dataset.slot, '1');
  assert.equal(row.classList.contains('is-host'), true); assert.equal(row.classList.contains('is-you'), true);
  assert.equal(mute.attributes['aria-label'], 'Mute Alice  (you)');
  const empty = lobby.children[1]; p.notify(lobby, [{ addedNodes: [empty] }]); assert.equal(lobby.children[1], empty, 'own appends do not redecorate');
  for (let i = 0; i < 3; i++) p.notify(lobby, [{ addedNodes: [row] }]);
  assert.equal(lobby.children.length, 4); assert.equal(row.querySelectorAll('.lobby-avatar').length, 1);
  charName.textContent = 'DEMPSEY'; p.notify(charName); assert.equal(card.classList.contains('is-current'), true);
  charName.textContent = 'Takeo'; p.notify(charName); assert.equal(card.classList.contains('is-current'), false);
  await code.emit('click'); assert.deepEqual(clipboard, []);
  code.textContent = ' ABC12 '; await code.emit('click'); assert.deepEqual(clipboard, ['ABC12']); assert.equal(code.classList.contains('copied'), true);
  [...p.timers.values()][0].fn(); assert.equal(code.classList.contains('copied'), false);
  rejectClipboard = true; await code.emit('click'); assert.equal(code.classList.contains('copied'), false);
  hint.textContent = 'Starting in 3s'; p.notify(hint); assert.equal(num.textContent, '3');
  assert.equal(ring.element.classList.contains('hidden'), false); assert.equal(ring.element.classList.contains('tick'), !reduced);
  hint.textContent = 'Waiting for squad'; p.notify(hint); assert.equal(ring.element.classList.contains('hidden'), true);
  await p.document.emit('keydown', { key: 'Tab' }); assert.equal(p.document.body.classList.contains('kbd-nav'), true);
  await p.document.emit('pointerdown', { target: { closest: () => button } });
  assert.equal(p.document.body.classList.contains('kbd-nav'), false); assert.equal(button.classList.contains('is-pressed'), true);
  await p.document.emit('pointercancel'); assert.equal(button.classList.contains('is-pressed'), false);
}
console.log('Page presentation OK: lobby updates, preferences, pause, ranges, character, mocked clipboard, countdown and input feedback.');
