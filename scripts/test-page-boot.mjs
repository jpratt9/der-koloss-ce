import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { Element, fakePage } from './lib/page-module-fakes.mjs';

if (!vm.SourceTextModule) {
  execFileSync(process.execPath, ['--experimental-vm-modules', fileURLToPath(import.meta.url)], { stdio: 'inherit' });
} else {
  const source = readFileSync(new URL('../js/page/boot.js', import.meta.url), 'utf8');
  for (const mobile of [false, true]) {
    const p = fakePage(); let mainStarts = 0, syncs = 0, plays = 0, failPlay = true;
    const gate = p.add('device-gate', 'hidden'), button = p.add('gate-audio');
    const soundtrack = p.add('gate-soundtrack'); soundtrack.paused = true;
    soundtrack.play = () => { plays++; if (failPlay) return Promise.reject(new Error('mock autoplay denial')); soundtrack.paused = false; return Promise.resolve(); };
    soundtrack.pause = () => { soundtrack.paused = true; };
    const link = new Element(); link.href = '/assets'; link.matches = s => s === 'a';
    gate.querySelectorAll = () => [button, link];
    const context = vm.createContext({ ...p.globals, location: { href: '/' },
      Audio: class { play() { return Promise.reject(new Error('mock UI denial')); } },
    });
    const modules = new Map();
    async function dependency(specifier) {
      if (modules.has(specifier)) return modules.get(specifier);
      const exports = specifier === '../device-gate.js' ? { isMobileOrTablet: () => mobile }
        : specifier === '../site-audio.js?v=6' ? { syncMenuMusicElement: el => { assert.equal(el, soundtrack); syncs++; } }
        : specifier === '../main.js?v=6' ? {} : assert.fail(`Unexpected import ${specifier}`);
      const mod = new vm.SyntheticModule(Object.keys(exports), function () {
        if (specifier === '../main.js?v=6') mainStarts++;
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
      modules.set(specifier, mod); await mod.link(() => assert.fail('Nested mock import')); await mod.evaluate(); return mod;
    }
    const mod = new vm.SourceTextModule(source, { context, importModuleDynamically: dependency });
    await mod.link(dependency); await mod.evaluate(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(mainStarts, mobile ? 0 : 1);
    assert.equal(gate.classList.contains('hidden'), !mobile);
    assert.equal(syncs, mobile ? 1 : 0);
    if (!mobile) continue;
    assert.equal(p.document.body.classList.contains('touch-device-gated'), true);
    assert.equal(soundtrack.volume, 0.42);
    failPlay = false; await button.emit('click');
    assert.equal(button.attributes['aria-pressed'], 'true');
    await button.emit('click'); assert.equal(button.attributes['aria-pressed'], 'false');
    const previousPlays = plays; await p.document.emit('pointerdown'); await p.document.emit('pointerdown');
    assert.equal(plays, previousPlays + 1, 'autoplay retry runs only once');
    for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) {
      await link.emit('click', { button: 0, [modifier]: true, preventDefault() { assert.fail('Modified link was intercepted'); } });
    }
    await link.emit('click', { button: 1, preventDefault() { assert.fail('Middle click was intercepted'); } });
    assert.equal(p.timers.size, 0);
    let prevented = false;
    await link.emit('click', { button: 0, preventDefault() { prevented = true; } });
    assert.equal(prevented, true); assert.equal(context.location.href, '/');
    assert.equal(p.timers.size, 1);
    const timer = [...p.timers.values()][0]; assert.equal(timer.delay, 75); timer.fn();
    assert.equal(context.location.href, '/assets');
  }
  console.log('Page boot OK: isolated desktop import, mobile gate, mocked media failures/retry/toggle and navigation modifiers.');
}
