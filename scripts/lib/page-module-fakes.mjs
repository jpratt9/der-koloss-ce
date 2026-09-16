// Minimal DOM/event fakes for page-module unit tests; no network or browser APIs.
export class Element {
  constructor(classes = '') {
    this.listeners = new Map(); this.attributes = {}; this.dataset = {};
    this.children = []; this.textContent = ''; this.nodeType = 1;
    this.className = classes; this.style = { setProperty(k, v) { this[k] = v; } };
    this.classList = {
      contains: (c) => this.className.split(/\s+/).includes(c),
      add: (c) => { if (!this.classList.contains(c)) this.className += ` ${c}`; },
      remove: (c) => { this.className = this.className.split(/\s+/).filter(x => x !== c).join(' '); },
      toggle: (c, on = !this.classList.contains(c)) => { this.classList[on ? 'add' : 'remove'](c); return on; },
    };
  }
  addEventListener(type, fn, options) {
    const entries = this.listeners.get(type) || [];
    entries.push({ fn, once: options?.once }); this.listeners.set(type, entries);
  }
  async emit(type, event = {}) {
    for (const entry of [...(this.listeners.get(type) || [])]) {
      if (entry.once) this.listeners.set(type, this.listeners.get(type).filter(x => x !== entry));
      await entry.fn(event);
    }
  }
  setAttribute(k, v) { this.attributes[k] = v; }
  appendChild(el) { el.parentNode = this; this.children.push(el); return el; }
  insertBefore(el, before) { el.parentNode = this; this.children.splice(Math.max(0, this.children.indexOf(before)), 0, el); }
  remove() { this.parentNode.children = this.parentNode.children.filter(x => x !== this); }
  querySelectorAll(selector) {
    const classes = selector.replace(':scope > ', '').split('.').filter(Boolean);
    return this.children.filter(el => classes.every(c => el.classList.contains(c)));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
export function fakePage() {
  const elements = new Map(), observers = new Map(), timers = new Map(); let timerId = 0;
  const document = new Element(); document.body = new Element();
  document.getElementById = id => elements.get(id) || null;
  document.createElement = () => new Element();
  const globals = {
    document,
    MutationObserver: class {
      constructor(fn) { this.fn = fn; }
      observe(el) { const callbacks = observers.get(el) || []; callbacks.push(this.fn); observers.set(el, callbacks); }
    },
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  };
  return { elements, document, globals, timers,
    add(id, classes) { const el = new Element(classes); elements.set(id, el); return el; },
    notify(el, records = []) { for (const fn of observers.get(el) || []) fn(records); },
  };
}
