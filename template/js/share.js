// Share: export bundles, import them, and save the page as one file.
// ---------- Share ----------
const BUNDLE_FORMAT = typeof PAGE_ENUMS.bundleFormat === 'string' && PAGE_ENUMS.bundleFormat ? PAGE_ENUMS.bundleFormat : 'concept-explainer-bundle';
const BUNDLE_MAX_BYTES = enumNumber('bundleMaxBytes', 10 * 1024 * 1024);
const BUNDLE_MAX_LABEL = `${Math.round(BUNDLE_MAX_BYTES / 1024 / 1024)} MB`;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LOCAL_PATH_KEYS = new Set(['sourcePath', 'repoPath']);

// The library slug when the page knows it. Otherwise the bundle leaves it
// empty and the importer derives one, so there is one slug rule.
function knownSlug(context) {
  return context && typeof context.slug === 'string' && SLUG_PATTERN.test(context.slug) ? context.slug : '';
}

// Data only, without local paths: the importer rebuilds pages itself.
function withoutLocalPaths(value) {
  if (Array.isArray(value)) return value.map(withoutLocalPaths);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !LOCAL_PATH_KEYS.has(key)).map(([key, v]) => [key, withoutLocalPaths(v)]));
}

function bundleOf(entries) {
  return { format: BUNDLE_FORMAT, version: 1, exportedAt: new Date().toISOString(), explainers: entries };
}

const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeAttr(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESC[ch]);
}

// The page as it was built, from parts that never change after load: head
// attributes, the style and script text, and the embedded data. The context
// keeps the style, chapters and choice lists, so a shared copy has no token or library link.
// The library's font rules point at its fonts/ folder, which a saved
// page does not have: they go, and the system fonts in each stack take over.
// Spelled in pieces: built pages are checked for these words in their source.
const FONT_FACE_BLOCK = new RegExp(`^(\\s*)(?:@${'font'}-face\\{[^}]*\\}\\n?)+`);
const CSP_NAME = ['Content', 'Security', 'Policy'].join('-');

function sha256Source(text) {
  const subtle = window.crypto && window.crypto.subtle;
  if (!subtle) return Promise.resolve(null);
  return subtle.digest('SHA-256', new TextEncoder().encode(text)).then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return `'sha256-${window.btoa(binary)}'`;
  }).catch(() => null);
}

// The page's own policy, verbatim: the scripts are copied unchanged, so their
// hashes still hold. Only the style hash follows the trimmed stylesheet.
function savedCsp(styleText, styleHash) {
  const tag = [...document.head.querySelectorAll('meta[http-equiv]')].find((m) => m.getAttribute('http-equiv') === CSP_NAME);
  const policy = tag ? tag.getAttribute('content') : '';
  if (!policy) return '';
  const next = styleHash ? policy.replace(/style-src [^;]*/, `style-src ${styleHash}`) : policy;
  // Quotes in the policy stay as they are, so it reads byte for byte the same.
  return `<meta http-equiv="${CSP_NAME}" content="${next.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`;
}

// Resolves to the page text. With no Web Crypto the stylesheet stays whole,
// so the policy's hash for it still matches.
function savedPage(style) {
  const full = (document.head.querySelector('style') || {}).textContent || '';
  const trimmed = full.replace(FONT_FACE_BLOCK, '$1');
  if (trimmed === full) return Promise.resolve(pageSnapshot(style, full, savedCsp(full, null)));
  return sha256Source(trimmed).then((hash) => (hash
    ? pageSnapshot(style, trimmed, savedCsp(trimmed, hash))
    : pageSnapshot(style, full, savedCsp(full, null))));
}

function pageSnapshot(style, styleText, cspTag) {
  const head = document.head;
  const meta = [...head.querySelectorAll('meta[name], meta[property], meta[charset]')].map((m) => {
    if (m.hasAttribute('charset')) return `<meta charset="${escapeAttr(m.getAttribute('charset'))}">`;
    const key = m.hasAttribute('name') ? 'name' : 'property';
    return `<meta ${key}="${escapeAttr(m.getAttribute(key))}" content="${escapeAttr(m.getAttribute('content'))}">`;
  });
  const links = [...head.querySelectorAll('link[rel]')].map((l) => {
    const cross = l.hasAttribute('crossorigin') ? ' crossorigin' : '';
    return `<link rel="${escapeAttr(l.getAttribute('rel'))}" href="${escapeAttr(l.getAttribute('href'))}"${cross}>`;
  });
  const prepaint = head.querySelector('script[data-prepaint]');
  const main = [...document.querySelectorAll('body > script:not([type])')].pop();
  const dataText = document.getElementById('explainer-data').textContent;
  // The build's chapter list and choice lists carry over; the token, slug and
  // library link do not.
  const built = readContext();
  const kept = { style, ...(Array.isArray(built.chapters) ? { chapters: built.chapters } : {}), ...(built.enums ? { enums: built.enums } : {}) };
  const contextText = JSON.stringify(kept).replace(/</g, '\\u003c');
  return [
    '<!doctype html>', '<html lang="en">', '<head>', ...meta.slice(0, 1), cspTag, ...meta.slice(1), `<title>${escapeAttr(document.querySelector('title') ? document.querySelector('title').textContent : 'Explainer')}</title>`,
    ...links, prepaint ? `<script data-prepaint>${prepaint.textContent}<\/script>` : '', `<style>${styleText}</style>`, '</head>', '<body>',
    '<a class="skip" href="#main">Skip to content</a>', '<div id="app" aria-busy="true"></div>',
    '<noscript><p class="noscript">This explainer needs JavaScript to draw its diagrams.</p></noscript>',
    `<script type="application/json" id="explainer-data">${dataText}<\/script>`,
    `<script type="application/json" id="explainer-context">${contextText}<\/script>`,
    `<script>${main ? main.textContent : ''}<\/script>`, '</body>', '</html>', '',
  ].join('\n');
}

function shareRow(title, body, actions) {
  return h('div', { class: 'setting-row is-wide share-row' },
    h('span', { class: 'setting-label' }, title), h('p', { class: 'setting-hint' }, body), h('div', { class: 'btn-row' }, actions));
}

// Explainer page: export this one, or save the page itself.
function explainerShareGroup(data, context) {
  const slug = knownSlug(context);
  const fileName = `${slug || 'explainer'}.explainers.json`;
  const status = h('p', { class: 'settings-status', role: 'status', 'aria-live': 'polite' });
  const exportButton = h('button', { class: 'btn', type: 'button' }, icon('download'), 'Export this explainer');
  exportButton.addEventListener('click', () => {
    downloadBlob(fileName, `${JSON.stringify(bundleOf([{ slug, data: withoutLocalPaths(data) }]), null, 2)}\n`);
    status.textContent = `Downloaded ${fileName}. Import it with ${CLI_NAME} import.`;
  });
  const pageButton = h('button', { class: 'btn', type: 'button' }, icon('download'), 'Save as page');
  pageButton.addEventListener('click', () => {
    const pageName = `${slug || 'explainer'}.html`;
    savedPage(storedStyle()).then((page) => {
      downloadBlob(pageName, page, 'text/html');
      status.textContent = `Downloaded ${pageName}. It opens on its own, with no library.`;
    }).catch((error) => { status.textContent = `Could not save the page: ${error.message}`; });
  });
  return h('section', { class: 'panel settings-group', 'aria-labelledby': 'settings-share-title' },
    h('div', { class: 'settings-legend' }, h('h2', { id: 'settings-share-title' }, 'Share'), h('span', { class: 'eyebrow quiet' }, 'Data only, no local paths')),
    shareRow('Export', 'A bundle someone else can import into their own library. It holds the explainer data, never the page code.', exportButton),
    shareRow('Page', 'One file that opens in any browser, offline.', pageButton),
    status);
}

// serve.api is { config, export, import }; a bare string is the config path.
function serveApi(context, name) {
  const api = context && context.serve && context.serve.api;
  if (api && typeof api === 'object' && typeof api[name] === 'string' && api[name].startsWith('/api/')) return api[name];
  if (name === 'config' && typeof api === 'string' && api.startsWith('/api/')) return api;
  return `/api/${name}`;
}

function serveFetch(context, url, options = {}) {
  return fetch(url, { ...options, headers: { ...(options.headers || {}), 'x-concept-explainer-token': context.serve.token } })
    .then((response) => response.text().then((body) => {
      let json = null;
      try {
        json = body ? JSON.parse(body) : null;
      } catch (error) {
        json = null;
      }
      if (!response.ok) throw new Error((json && (list(json.errors).join(' ') || json.error)) || `The server answered ${response.status}.`);
      return { json, body };
    }));
}

function commandBlock(lines) {
  return h('ul', { class: 'command-list' }, lines.map((line) => h('li', null, h('code', null, line), copyButton(() => line))));
}

const IMPORT_GROUPS = [['added', 'Added'], ['replaced', 'Replaced'], ['skipped', 'Skipped'], ['rejected', 'Rejected']];

function importSummary(result) {
  const rows = IMPORT_GROUPS.flatMap(([key, label]) => list(result && result[key]).map((item) => ({ label, item })));
  if (!rows.length) return h('p', { class: 'setting-hint' }, 'The bundle holds no explainers.');
  return h('table', { class: 'import-table' },
    h('caption', { class: 'sr-only' }, 'What the import would do'),
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Result'), h('th', { scope: 'col' }, 'Explainer'), h('th', { scope: 'col' }, 'Why'))),
    h('tbody', null, rows.map(({ label, item }) => h('tr', { class: `is-${label.toLowerCase()}` },
      h('td', null, h('span', { class: 'status-dot', 'aria-hidden': 'true' }), label),
      h('td', null, softBreaks(text(item.title, text(item.slug, Number.isInteger(item.index) ? `Item ${item.index + 1}` : 'Untitled')))),
      h('td', null, list(item.reasons).length ? list(item.reasons).join(' ') : text(item.reason, text(item.note, '')))))));
}

// Hub: export the picked explainers (or the filter), import a bundle.
function hubShareGroup(context, getSelection) {
  const served = Boolean(context && context.serve && context.serve.token);
  // Each action reports right above its own output.
  const status = h('p', { class: 'settings-status', role: 'status', 'aria-live': 'polite' });
  const importStatus = h('p', { class: 'settings-status', role: 'status', 'aria-live': 'polite' });
  const exportOut = h('div', { class: 'settings-commands' });
  const exportButton = h('button', { class: 'btn', type: 'button' }, icon('download'), 'Export');
  exportButton.addEventListener('click', () => {
    const { slugs, args, label, none } = getSelection();
    if (none) {
      status.textContent = 'No explainers match the filter, so there is nothing to export.';
      fill(exportOut);
      return;
    }
    if (served) {
      status.textContent = 'Preparing the bundle…';
      const query = slugs.length ? `?slugs=${slugs.map(encodeURIComponent).join(',')}` : '';
      serveFetch(context, `${serveApi(context, 'export')}${query}`)
        .then(({ body }) => {
          const many = `explainers-${new Date().toISOString().slice(0, 10)}.explainers.json`;
          downloadBlob(slugs.length === 1 ? `${slugs[0]}.explainers.json` : many, body);
          status.textContent = `Downloaded ${label}.`;
        })
        .catch((error) => { status.textContent = `Could not export: ${error.message}`; });
      return;
    }
    status.textContent = `This page cannot read the library files. Run this to export ${label}:`;
    fill(exportOut, commandBlock([`${CLI_NAME} export ${args}`.trim()]));
  });

  const importOut = h('div', { class: 'settings-commands' });
  const importRow = served ? importServed(context, importStatus, importOut) : [
    h('p', { class: 'setting-hint' }, 'This page cannot write to the library. Run this with the bundle you received:'),
    commandBlock([`${CLI_NAME} import <file.explainers.json> --dry-run`, `${CLI_NAME} import <file.explainers.json> --on-conflict rename`]),
  ];
  return h('section', { class: 'panel settings-group', 'aria-labelledby': 'settings-share-title' },
    h('div', { class: 'settings-legend' }, h('h2', { id: 'settings-share-title' }, 'Share'), h('span', { class: 'eyebrow quiet' }, 'Data only, no local paths')),
    h('div', { class: 'setting-row is-wide share-row' }, h('span', { class: 'setting-label' }, 'Export'),
      h('p', { class: 'setting-hint' }, 'Pick explainers with the boxes on their cards, or export every one the current filter shows.'),
      h('div', { class: 'btn-row' }, exportButton), status, exportOut),
    h('div', { class: 'setting-row is-wide share-row' }, h('span', { class: 'setting-label' }, 'Import'), importRow, importStatus, importOut));
}

function fileSize(bytes) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// The drop zone with its hidden file input and "choose a file" button.
function importDropZone() {
  const input = h('input', { class: 'sr-only', type: 'file', id: 'import-file', accept: '.json,application/json', tabindex: '-1', 'aria-hidden': 'true' });
  const choose = h('button', { class: 'link drop-choose', type: 'button', onclick: () => input.click() }, 'or choose a file');
  const picked = h('div', { class: 'drop-picked', hidden: true });
  const zone = h('div', { class: 'drop-zone', 'aria-describedby': 'import-file-hint' },
    icon('upload'), h('span', { class: 'drop-title' }, 'Drop a .explainers.json file'), choose, picked);
  return { input, choose, picked, zone };
}

function importConflictChoice(onChange) {
  return optionGroup({
    variant: 'cards', value: 'rename', labelledBy: 'import-conflict-label', describedBy: 'import-conflict-hint',
    options: [
      { value: 'rename', label: 'Keep both', desc: 'Renames the new one with a -2' },
      { value: 'skip', label: 'Skip', desc: 'Keeps the one you have' },
      { value: 'replace', label: 'Replace', desc: 'Only one from the same source' },
    ],
    onChange,
  });
}

// The server wraps the result in { summary }; accept the bare shape too.
function importResult(raw) {
  return raw && raw.summary && typeof raw.summary === 'object' ? raw.summary : raw;
}

// Files dropped on the zone or picked with the input go to take(file).
function wireDropZone({ input, zone }, take) {
  input.addEventListener('change', () => take(input.files && input.files[0]));
  zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('is-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('is-over');
    take(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
  });
}

function importPickedRow(file, onRemove) {
  return [h('span', { class: 'drop-file' }, softBreaks(file.name)), h('span', { class: 'drop-size' }, fileSize(file.size)),
    h('button', { class: 'link', type: 'button', onclick: onRemove }, 'Remove')];
}

// What the dry run found, with the Import button; or what the import did.
function importOutcome(out, json, { dryRun, apply }) {
  if (dryRun) {
    const button = h('button', { class: 'btn primary', type: 'button' }, 'Import');
    button.addEventListener('click', () => apply(button));
    fill(out, importSummary(json), h('div', { class: 'btn-row' }, button));
    return;
  }
  fill(out, importSummary(json), h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: () => window.location.reload() }, 'Reload')));
}

function resetDropZone(drop, out, status) {
  drop.picked.hidden = true;
  drop.zone.classList.remove('has-file');
  drop.input.value = '';
  fill(out);
  status.textContent = '';
  drop.choose.focus();
}

function importControls(drop, conflict) {
  return h('div', { class: 'import-controls' }, drop.input, drop.zone,
    h('p', { class: 'setting-hint', id: 'import-file-hint' }, `A bundle someone exported. Up to ${BUNDLE_MAX_LABEL}. Nothing changes until you press Import.`),
    h('div', { class: 'import-field' },
      h('span', { class: 'setting-label', id: 'import-conflict-label' }, 'If it is already in your library'),
      conflict.el,
      h('p', { class: 'setting-hint', id: 'import-conflict-hint' }, 'Applies to explainers with the same name.')));
}

// One unit in the control column: drop zone, conflict choice, dry-run
// summary, then the Import button. While an import runs nothing else
// starts, so a double press imports once.
function importServed(context, status, out) {
  const drop = importDropZone();
  let pending = null;
  let busy = false;
  let checkId = 0;
  const conflict = importConflictChoice(() => run(true));
  const clear = () => {
    if (busy) return;
    pending = null;
    resetDropZone(drop, out, status);
  };
  const settle = (job, applyButton, failed) => {
    busy = false;
    // Nothing was imported: the same file can be tried again.
    if (failed) { pending = job; if (applyButton) applyButton.disabled = false; }
  };
  function run(dryRun, applyButton) {
    if (!pending || busy) return;
    const job = pending;
    const id = ++checkId;
    if (!dryRun) { busy = true; pending = null; if (applyButton) applyButton.disabled = true; }
    status.textContent = dryRun ? 'Checking the bundle…' : 'Importing…';
    serveFetch(context, `${serveApi(context, 'import')}?onConflict=${conflict.read()}${dryRun ? '&dryRun=1' : ''}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: job.text,
    }).then(({ json }) => {
      // A newer check (the conflict choice changed) replaces this one.
      if (dryRun && (id !== checkId || pending !== job)) return;
      status.textContent = dryRun ? `Here is what importing ${job.name} would do. Nothing has changed yet.` : 'Imported. Reload the library to see the new explainers.';
      importOutcome(out, importResult(json), { dryRun, apply: (button) => run(false, button) });
      if (!dryRun) settle(job, applyButton, false);
    }).catch((error) => {
      if (!dryRun) settle(job, applyButton, true);
      status.textContent = `Could not import: ${error.message}`;
    });
  }
  wireDropZone(drop, (file) => {
    if (!file || busy) return;
    if (file.size > BUNDLE_MAX_BYTES) { status.textContent = `${file.name} is over ${BUNDLE_MAX_LABEL}. Bundles must be smaller.`; return; }
    file.text().then((body) => {
      pending = { name: file.name, text: body };
      drop.zone.classList.add('has-file');
      fill(drop.picked, ...importPickedRow(file, clear));
      drop.picked.hidden = false;
      run(true);
    }).catch(() => { status.textContent = `Could not read ${file.name}.`; });
  });
  return importControls(drop, conflict);
}
