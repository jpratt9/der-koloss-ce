// Archive tests run real ES modules with isolated DOM, media, clock and renderer fakes.
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../vendor/three.module.js';
import { Element } from './page-module-fakes.mjs';

export async function moduleTest(run) {
  if (!vm.SourceTextModule) {
    execFileSync(process.execPath, ['--experimental-vm-modules', process.argv[1]], { stdio: 'inherit' });
  } else await run();
}
const root = new URL('../../', import.meta.url);
export const weaponData = {
  m1911: { name: 'Pistol', cls: 'pistol', sfx: 'shot_pistol', mag: 2, reserve: 6, rpm: 600, reload: 0.1, dmg: 10, auto: false, pap: { name: 'Upgraded pistol' }, reloadStages: [[0.5, 'rel_magin']] },
  mp40: { name: 'MP40', cls: 'smg', sfx: 'shot_smg', mag: 2, reserve: 6, rpm: 600, reload: 0.1, dmg: 10, auto: true, pap: { name: 'Upgraded SMG' }, reloadStages: [[0.5, 'rel_magin']] },
};
export function archiveHarness() {
  const ids = new Map(), roots = [], media = [], log = [], timers = new Map(), frames = [], renders = [], rigs = [];
  let now = 1000, nextTimer = 0, reduced = false;
  class Node extends Element {
    constructor(tag = 'div') { super(); this.tagName = tag; this.value = ''; }
    append(...els) { els.forEach(el => this.appendChild(el)); }
    replaceChildren(...els) { this.children.forEach(el => { el.parentNode = null; }); this.children = []; this.append(...els); }
    matches(selector) {
      return selector.split(',').some(part => {
        const s = part.trim();
        const cls = [...s.matchAll(/\.([\w-]+)/g)].map(m => m[1]);
        const data = [...s.matchAll(/\[data-([\w-]+)="([^"]+)"\]/g)];
        const tag = s.match(/^[a-z]+/)?.[0];
        return (!tag || this.tagName === tag) && cls.every(c => this.classList.contains(c))
          && data.every(m => this.dataset[m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())] === m[2]);
      });
    }
    querySelectorAll(selector) {
      const out = [];
      for (const child of this.children) { if (child.matches(selector)) out.push(child); out.push(...child.querySelectorAll(selector)); }
      return out;
    }
    setPointerCapture() {} releasePointerCapture() {} scrollIntoView() {}
    getBoundingClientRect() { return { width: 640, height: 400 }; }
    focus() { document.activeElement = this; }
    click() { return this.emit('click'); }
  }
  const document = new Node();
  document.getElementById = id => ids.get(id) || null;
  document.createElement = tag => new Node(tag);
  document.querySelectorAll = s => roots.flatMap(el => [...(el.matches(s) ? [el] : []), ...el.querySelectorAll(s)]);
  document.querySelector = s => document.querySelectorAll(s)[0] || null;
  const html = readFileSync(new URL('assets/index.html', root), 'utf8');
  for (const m of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const el = new Node(m[1]); el.className = m[2].match(/class="([^"]*)"/)?.[1] || ''; ids.set(m[3], el); roots.push(el);
  }
  for (const [kind, values] of [['variant', ['both', 'normal', 'pap']], ['finish', ['standard', 'pap', 'gold', 'diamond']]]) {
    for (const [i, value] of values.entries()) { const el = new Node('button'); el.className = `${kind}-button${i === 0 ? ' active' : ''}`; el.dataset[kind] = value; roots.push(el); }
  }
  class Media extends Node {
    constructor(src = '') { super('audio'); this.src = src; this.paused = true; this.currentTime = 0; this.duration = 100; media.push(this); }
    play() { log.push(['play', this.src]); if (this.rejectPlay) return Promise.reject(new Error('mock media denied')); this.paused = false; void this.emit('play'); return Promise.resolve(); }
    pause() { log.push(['pause', this.src]); const changed = !this.paused; this.paused = true; if (changed) void this.emit('pause'); }
  }
  class Rig {
    constructor() { this.hipPos = new THREE.Vector3(); this.equipT = 0; rigs.push(this); }
    equip(id, pap) {
      log.push(['equip', id, pap]); this.current = { id, group: new THREE.Group() }; this.diamondCamo = false;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1)); mesh.position.y = -10; this.current.group.add(mesh);
      const glove = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100)); glove.userData.isGlove = true; this.current.group.add(glove);
      const hidden = new THREE.Mesh(new THREE.BoxGeometry(200, 200, 200)); hidden.visible = false; this.current.group.add(hidden);
      this.current.group.add(new THREE.Sprite());
    }
    update(dt) { log.push(['update', dt]); if (this.current) this.current.group.children[0].position.y = 0; }
    fire() { log.push(['fire']); }
    startReload(duration) { log.push(['reload', duration]); }
    startInspect() { log.push(['inspect']); }
    applyGoldCamo() { log.push(['gold']); }
    applyDiamondCamo() { this.diamondCamo = true; log.push(['diamond']); }
  }
  class Renderer {
    setPixelRatio(ratio) { this.pixelRatio = ratio; }
    setSize(w, h) { log.push(['size', w, h]); }
    render(scene, camera) { renders.push({ scene, camera }); }
  }
  const siteAudio = { setDucked(value) { log.push(['duck', value]); } };
  const context = vm.createContext({ document, Audio: Media, CSS: { escape: x => x },
    devicePixelRatio: 3, innerWidth: 1200, performance: { now: () => now },
    matchMedia: () => ({ matches: reduced }),
    requestAnimationFrame(fn) { frames.push(fn); },
    ResizeObserver: class { observe() { log.push(['observe']); } },
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const mocks = new Map([
    ['three', { ...THREE, WebGLRenderer: Renderer }],
    [new URL('js/weapons.js', root).href, { WEAPONS: weaponData, WeaponRig: Rig, getStats: (id, pap) => ({ ...weaponData[id], mag: pap ? 4 : 2 }) }],
    [new URL('js/site-audio.js?v=6', root).href, { initSiteAudio: () => siteAudio }],
  ]);
  const modules = new Map();
  async function load(path, parent = root.href) {
    const key = path === 'three' ? path : new URL(path, parent).href;
    if (modules.has(key)) return modules.get(key);
    let mod;
    if (mocks.has(key)) {
      const values = mocks.get(key);
      mod = new vm.SyntheticModule(Object.keys(values), function () { for (const [k, v] of Object.entries(values)) this.setExport(k, v); }, { context });
    } else mod = new vm.SourceTextModule(readFileSync(fileURLToPath(key), 'utf8'), { context, identifier: key });
    modules.set(key, mod); await mod.link((specifier) => load(specifier, key)); return mod;
  }
  async function evaluate(path) { const mod = await load(path); await mod.evaluate(); return mod.namespace; }
  function advance(ms) {
    const end = now + ms; let steps = 0;
    while (true) {
      const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      if (++steps > 1000) throw new Error('Timer loop');
      now = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    now = end;
  }
  return { document, media, log, timers, frames, renders, rigs, siteAudio, mocks, evaluate, advance,
    element: id => ids.get(id), create: tag => new Node(tag),
    select: (kind, value) => document.querySelector(`.${kind}-button[data-${kind}="${value}"]`),
    frame(ms = 16) { now += ms; const fn = frames.shift(); if (!fn) throw new Error('No pending frame'); fn(now); },
    reduceMotion(value) { reduced = value; },
    mock(path, exports) { mocks.set(new URL(path, root).href, exports); },
  };
}
