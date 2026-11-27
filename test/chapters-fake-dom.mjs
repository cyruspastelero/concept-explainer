// A small fake DOM, enough to run template/js/dom.js and the chapter modules
// in node:vm. It records every element created, so tests can check that data
// never becomes markup. Layout is not simulated: widths are what callers pass.
import { DOM_LAYER } from '../scripts/lib/build.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class FakeNode {
  constructor() { this.parentNode = null; }

  remove() {
    if (this.parentNode) this.parentNode.childNodes = this.parentNode.childNodes.filter((c) => c !== this);
    this.parentNode = null;
  }

  replaceWith(other) {
    const parent = this.parentNode;
    if (!parent) return;
    const at = parent.childNodes.indexOf(this);
    other.remove();
    other.parentNode = parent;
    parent.childNodes.splice(at, 1, other);
    this.parentNode = null;
  }
}

class FakeText extends FakeNode {
  constructor(value) { super(); this.data = String(value); this.nodeType = 3; }

  get textContent() { return this.data; }
}

class FakeClassList {
  constructor(el) { this.el = el; }

  get set() { return new Set((this.el.getAttribute('class') || '').split(/\s+/).filter(Boolean)); }

  write(set) { this.el.setAttribute('class', [...set].join(' ')); }

  add(...names) { const set = this.set; names.forEach((n) => set.add(n)); this.write(set); }

  remove(...names) { const set = this.set; names.forEach((n) => set.delete(n)); this.write(set); }

  contains(name) { return this.set.has(name); }

  toggle(name, force) {
    const on = force === undefined ? !this.contains(name) : Boolean(force);
    if (on) this.add(name); else this.remove(name);
    return on;
  }
}

function makeDocument(created) {
  class FakeElement extends FakeNode {
    constructor(tag, ns) {
      super();
      this.tagName = tag.toUpperCase();
      this.localName = tag;
      this.namespaceURI = ns || 'http://www.w3.org/1999/xhtml';
      this.nodeType = 1;
      this.attributes = new Map();
      this.childNodes = [];
      this.listeners = {};
      this.classList = new FakeClassList(this);
      const el = this;
      this.dataset = new Proxy({}, {
        get: (_, key) => el.getAttribute(`data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`) ?? undefined,
        set: (_, key, value) => { el.setAttribute(`data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, value); return true; },
        deleteProperty: (_, key) => { el.removeAttribute(`data-${String(key)}`); return true; },
      });
      const props = {};
      this.style = { setProperty: (k, v) => { props[k] = v; }, getPropertyValue: (k) => props[k] || '', removeProperty: (k) => { delete props[k]; } };
      created.push(this);
    }

    setAttribute(name, value) { this.attributes.set(name, String(value)); }

    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }

    hasAttribute(name) { return this.attributes.has(name); }

    removeAttribute(name) { this.attributes.delete(name); }

    get tabIndex() { return Number(this.getAttribute('tabindex') ?? -1); }

    set tabIndex(value) { this.setAttribute('tabindex', value); }

    get hidden() { return this.hasAttribute('hidden'); }

    set hidden(value) { if (value) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }

    get className() { return this.getAttribute('class') || ''; }

    get children() { return this.childNodes.filter((c) => c.nodeType === 1); }

    get firstElementChild() { return this.children[0] || null; }

    get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }

    set textContent(value) { this.replaceChildren(); this.append(String(value)); }

    get isConnected() {
      let at = this;
      while (at.parentNode) at = at.parentNode;
      return at === doc.documentElement;
    }

    get clientWidth() { return 0; }

    append(...nodes) {
      nodes.forEach((node) => {
        const child = node instanceof FakeNode ? node : new FakeText(node);
        child.remove();
        child.parentNode = this;
        this.childNodes.push(child);
      });
    }

    prepend(...nodes) {
      const rest = this.childNodes;
      this.childNodes = [];
      this.append(...nodes);
      rest.forEach((c) => { c.parentNode = this; this.childNodes.push(c); });
    }

    replaceChildren(...nodes) {
      this.childNodes.forEach((c) => { c.parentNode = null; });
      this.childNodes = [];
      this.append(...nodes);
    }

    contains(node) {
      for (let at = node; at; at = at.parentNode) if (at === this) return true;
      return false;
    }

    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }

    // Bubbles up the parents, like a real event.
    dispatch(type, init = {}) {
      const event = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...init };
      for (let at = this; at; at = at.parentNode) (at.listeners[type] || []).forEach((fn) => fn(event));
      return event;
    }

    click() { return this.dispatch('click'); }

    focus() { doc.activeElement = this; }

    blur() { if (doc.activeElement === this) doc.activeElement = null; }

    // Only [attr] and .class selectors, which is all the modules use.
    matchesSimple(selector) {
      const attr = selector.match(/^\[([\w-]+)\]$/);
      if (attr) return this.hasAttribute(attr[1]);
      const cls = selector.match(/^\.([\w-]+)$/);
      if (cls) return this.classList.contains(cls[1]);
      return this.localName === selector;
    }

    matches(selector) { return selector.split(',').some((part) => this.matchesSimple(part.trim())); }

    closest(selector) {
      for (let at = this; at && at.nodeType === 1; at = at.parentNode) if (at.matches(selector)) return at;
      return null;
    }

    querySelectorAll(selector) {
      const out = [];
      const walk = (el) => el.children.forEach((c) => { if (c.matches(selector)) out.push(c); walk(c); });
      walk(this);
      return out;
    }

    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

    getClientRects() { return []; }

    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }

    scrollIntoView() {}
  }

  const doc = {
    activeElement: null,
    createElement: (tag) => new FakeElement(tag),
    createElementNS: (ns, tag) => new FakeElement(tag, ns),
    createTextNode: (value) => new FakeText(value),
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    getElementById: () => null,
  };
  doc.documentElement = new FakeElement('html');
  doc.body = new FakeElement('body');
  doc.documentElement.append(doc.body);
  return { doc, FakeElement };
}

const ORDER = ['kit', 'viz-core', 'viz-linear', 'viz-graph', 'viz-grid', 'visuals', 'context', 'diff', 'options', 'risks', 'rollout', 'timeline', 'code', 'hooks'];

/**
 * Load the shared DOM layer (DOM_LAYER) and every chapter module into a fresh vm context.
 * @returns {{ ctx: object, created: object[], document: object, window: object }}
 */
export function loadChapters() {
  const created = [];
  const { doc, FakeElement } = makeDocument(created);
  const location = { hash: '' };
  const window = {
    location,
    history: { state: null, replaceState: (_, __, url) => { location.hash = url; } },
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    requestAnimationFrame: (fn) => fn(),
    addEventListener() {},
    innerWidth: 1024,
    innerHeight: 800,
  };
  const ctx = vm.createContext({
    window, document: doc, Node: FakeNode, navigator: {}, CSS: { escape: (v) => v }, console,
  });
  const dir = new URL('../template/js/', import.meta.url);
  const source = [...DOM_LAYER.map((f) => readFileSync(new URL(f, dir), 'utf8')),
    ...ORDER.map((f) => readFileSync(new URL(`chapters/${f}.js`, dir), 'utf8'))].join('\n;\n');
  // Function declarations become properties of the context's global object.
  vm.runInContext(source, ctx, { filename: 'chapters-bundle.js' });
  return { ctx, created, document: doc, window, FakeElement };
}

export const CHAPTER_FILES = ORDER;

/** Every element below root, root included. */
export function walk(root) {
  const out = [root];
  (root.children || []).forEach((c) => out.push(...walk(c)));
  return out;
}
