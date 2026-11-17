// Boot a built page (the real inline script, as `build` writes it) in node:vm
// on the fake DOM from chapters-fake-dom.mjs, then drive its router the way a
// browser would: set location.hash and fire hashchange. Only what booting the
// page needs is added here; layout is not simulated.
import vm from 'node:vm';
import { loadChapters, walk } from './chapters-fake-dom.mjs';

const tagContent = (html, id) => {
  const match = html.match(new RegExp(`id="${id}">([\\s\\S]*?)</script>`));
  if (!match) throw new Error(`page harness: no #${id} in the page`);
  return match[1];
};

// The page's main script: the last inline script without a type.
const mainScript = (html) => {
  const scripts = [...html.matchAll(/<script(?![^>]*\b(?:src|type)=)(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  return scripts.at(-1);
};

function extendElements(FakeElement, doc) {
  const P = FakeElement.prototype;
  const insertAt = (parent, at, nodes) => nodes.forEach((n) => {
    const child = typeof n === 'string' ? doc.createTextNode(n) : n;
    if (child.remove) child.remove();
    child.parentNode = parent;
    parent.childNodes.splice(at, 0, child);
    at += 1;
  });
  P.after = function after(...nodes) { if (this.parentNode) insertAt(this.parentNode, this.parentNode.childNodes.indexOf(this) + 1, nodes); };
  P.before = function before(...nodes) { if (this.parentNode) insertAt(this.parentNode, this.parentNode.childNodes.indexOf(this), nodes); };
  P.insertBefore = function insertBefore(node, ref) { if (ref) ref.before(node); else this.append(node); return node; };
  P.appendChild = function appendChild(node) { this.append(node); return node; };
  P.removeChild = function removeChild(node) { node.remove(); return node; };
  P.removeEventListener = function removeEventListener() {};
  P.setPointerCapture = function setPointerCapture() {};
  P.releasePointerCapture = function releasePointerCapture() {};
  P.animate = function animate() { return { finished: Promise.resolve(), cancel() {} }; };
  Object.defineProperty(P, 'value', { get() { return this.fakeValue ?? this.getAttribute('value') ?? ''; }, set(v) { this.fakeValue = String(v); }, configurable: true });
  Object.defineProperty(P, 'checked', { get() { return Boolean(this.fakeChecked ?? this.hasAttribute('checked')); }, set(v) { this.fakeChecked = Boolean(v); }, configurable: true });
  Object.defineProperty(P, 'disabled', {
    get() { return this.hasAttribute('disabled'); },
    set(v) { if (v) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); },
    configurable: true,
  });
}

// What a reader would see change: element names, state attributes and text.
const STATE_ATTRS = ['class', 'aria-pressed', 'aria-selected', 'aria-current', 'aria-expanded', 'hidden', 'data-state', 'data-selected'];
export function snapshot(el) {
  return walk(el).map((node) => {
    const attrs = STATE_ATTRS.map((a) => (node.hasAttribute && node.hasAttribute(a) ? `${a}=${node.getAttribute(a)}` : '')).filter(Boolean).join(' ');
    const own = (node.childNodes || []).filter((c) => c.nodeType === 3).map((c) => c.data).join('');
    return `${node.localName}[${attrs}]${own}`;
  }).join('|');
}

/**
 * @param {string} html a page from buildExplainer, buildLibrary or buildGallery
 * @returns {{ route: (hash: string) => { view: string|null, section: object|null, scrolled: object[] }, views: () => string[], document: object, window: object }}
 */
export function bootPage(html) {
  const { document: doc, window: win, FakeElement } = loadChapters();
  extendElements(FakeElement, doc);
  const byId = {};
  ['explainer-data', 'explainer-context'].forEach((id) => {
    const el = doc.createElement('script');
    el.setAttribute('id', id);
    el.append(tagContent(html, id));
    byId[id] = el;
  });
  const app = doc.createElement('div');
  app.setAttribute('id', 'app');
  doc.body.append(app);
  byId.app = app;
  doc.getElementById = (id) => byId[id] || doc.documentElement.querySelector(`#${id}`) || null;
  doc.querySelector = (selector) => doc.documentElement.querySelector(selector);
  doc.querySelectorAll = (selector) => doc.documentElement.querySelectorAll(selector);
  doc.title = '';
  const listeners = {};
  win.addEventListener = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
  win.scrollTo = () => {};
  const scrolled = [];
  FakeElement.prototype.scrollIntoView = function scrollIntoView() { scrolled.push(this); };
  const ctx = vm.createContext({
    window: win, document: doc, location: win.location, history: win.history, localStorage: win.localStorage,
    sessionStorage: win.localStorage, navigator: {}, console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: (fn) => fn(), CSS: { escape: (v) => v }, Node: Object, matchMedia: win.matchMedia,
    getComputedStyle: () => ({ getPropertyValue: () => '' }), ResizeObserver: class { observe() {} disconnect() {} },
  });
  vm.runInContext(mainScript(html), ctx, { filename: 'page.js' });

  const sections = () => doc.body.querySelectorAll('[data-view]');
  return {
    document: doc,
    window: win,
    views: () => sections().map((s) => s.getAttribute('data-view')),
    route(hash) {
      scrolled.length = 0;
      win.location.hash = hash ? `#${hash}` : '';
      (listeners.hashchange || []).forEach((fn) => fn());
      const section = sections().find((s) => !s.hidden) || null;
      return { view: section ? section.getAttribute('data-view') : null, section, scrolled: [...scrolled] };
    },
  };
}
