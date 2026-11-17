# The explainer library

Every explainer you build also lands in one local folder, the **library**. Its `index.html` (the hub) lists every explainer, filters them by type, status and tags, and searches inside all of them, so you find an explainer without remembering which repo or session made it.

The code: `scripts/lib/library.mjs` (fs), `scripts/lib/library-model.mjs` (slugs, manifest), `scripts/lib/search-index.mjs` (search entries), `scripts/lib/config.mjs` (settings), `scripts/lib/serve.mjs` (`library serve`), `template/library.html` and `template/js/library.js` (the hub page). Keep this page in sync with them.

## Where it lives

`$CONCEPT_EXPLAINER_HOME`, else `$REPO_EXPLAINER_HOME` (the old name, still read), else `~/.concept-explainer`.

**Moving from Repo Explainer.** On the first run of any command, when no home is set by env, `~/.repo-explainer` exists and `~/.concept-explainer` does not, the folder is renamed to `~/.concept-explainer` and the CLI prints what it did. Nothing is copied or deleted. If both exist, nothing moves.

```
<home>/
  index.html                  the hub: manifest, search index and config embedded, works from file://
  kit.html                    the kit page (icons, visuals, components, patterns), linked from the hub
  fonts/                      the self-hosted fonts library pages load (woff2) and OFL.txt
  .lock/                      present only while a write is in progress
  library.json                the manifest
  config.json                 explainer defaults (see Config)
  explainers/<slug>/
    explainer.json            a copy of the source data
    index.html                the built explainer, with the library context set
```

The source of truth stays where it was made, usually `<repo>/.explainer/explainer.json`. The library holds copies. Rebuild from the source, never edit the copies.

## Commands

| Command | What it does |
|---|---|
| `build <file> [--repo dir]` | Validates, writes the HTML next to the data, then publishes to the library and prints the hub path. |
| `build <file> --no-library` | Builds without publishing, and without embedding config. For tests and throwaway previews. |
| `library` or `library list` | Lists the explainers with their type, newest first. |
| `library path` | Prints the hub path, `<home>/index.html`. |
| `library add <file> [--repo dir]` | Validates and publishes, without writing an HTML copy next to the data. |
| `library remove <slug>` | Deletes that explainer's folder and entry, then refreshes the hub. |
| `library rebuild` | Re-renders every page, the hub and the kit from the stored data with the current template and config. Drops entries whose data is missing or broken, and adopts folders that have data but no entry. |
| `library open` | Opens the hub in the default browser (writes an empty hub first if there is none). |
| `library style [clean\|playful]` | Prints the default style, or sets it. |
| `library serve [--port n]` | Serves the library on 127.0.0.1 so Settings can save (see Serve). |
| `config [get\|set\|reset] [--json]` | Prints or changes the explainer defaults (see Config). |
| `export [slug...] [--type t] [--tag t] [--stack s] [--search q] [--out f]` | Writes a bundle of the matching explainers (no selector: the whole library) and prints what went in (see Share). |
| `import <file> [--on-conflict rename\|skip\|replace] [--dry-run]` | Adds a bundle to the library, and prints what was added, replaced, skipped or rejected and why. |
| `install [--force]` | Links this skill into `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/concept-explainer` and copies `rules/concept-explainer.md` into `${CLAUDE_CONFIG_DIR:-~/.claude}/rules/`. |

Every write in the library goes to a temp file in the same folder (created with `wx`, so an existing file is never reused) and is renamed into place, so a reader never sees half a file.

**Private.** The home is `0700` and its files `0600`; a home created with looser permissions is tightened on the next write.

**One writer at a time.** Every read-modify-write (publish, remove, rebuild, import, config, the hub) holds `<home>/.lock`, shared by the CLI and `library serve`. The folder holds an `owner` file, `<pid>:<random nonce>`, and is taken by renaming a ready-made folder into place. A lock whose process is gone is moved to a unique tombstone and removed only if the tombstone still names that dead owner, so two processes clearing one stale lock never both win. A writer releases the lock only while it still holds its own nonce. An import plans its slugs inside the same hold of the lock that writes them, so a publish in between can never be overwritten. The CLI waits up to 30 seconds, then fails with `library is busy: ... held by pid N`. `library serve` never blocks while it waits: it retries for 2 seconds, then answers `503 {"error":"library is busy"}`.

### `install`

- Safe to run again. A link that already points here and an identical rule are left alone.
- A link that points somewhere else is replaced.
- A real folder at the skill path, or a rule file you edited, is never replaced unless you pass `--force`. Even then it is moved aside to `<name>.backup-<time>`, not deleted.
- It checks both targets before it changes anything, so a refusal leaves nothing half done.
- It removes the old `skills/repo-explainer` link only when it points at this skill, and the old `rules/repo-explainer.md` only when its contents are byte for byte a rule this project shipped (checked by sha256). Anything else is reported and kept.

## Styles

Two styles: `clean` (the default) and `playful`. The template draws both; the data never changes.

- `--style clean|playful` works on `build`, `library add` and `library rebuild`. Any other value fails with `unknown style "<value>": use clean or playful`, before anything is written.
- Without the flag, the style is the `style` setting in `config.json`.
- The hub and the kit always use the config style. `library rebuild` restyles every page with the flag, else the config style.

## Config

`<home>/config.json` holds the explainer defaults. The skill reads them first (`config --json`), and the Settings view shows them. Nothing in it is secret.

| Key | Values | Default | Used by |
|---|---|---|---|
| `style` | `clean`, `playful` | `clean` | build default |
| `defaultType` | `auto` or a type | `auto` | skill step 0 (`auto` means identify it) |
| `audience` | `newcomer`, `engineer`, `expert` | `engineer` | tone, depth, glossary size |
| `depth` | `overview`, `standard`, `deep` | `standard` | how many flows, steps and parts |
| `language` | a language tag like `en` or `pt-BR` | `en` | all prose |
| `visuals` | list of visual kinds | `[]` | kinds the skill reaches for first |
| `chapters` | `{ <type>: { <chapter>: true\|false } }` | `{}` | chapters turned off per type (missing means on) |
| `quiz`, `analogies` | `true`, `false` | `true` | whether to write them |
| `codeWalkthrough` | `auto`, `always`, `never` | `auto` | when the skill adds a code walkthrough (`references/code-walkthrough.md`) |
| `model` | `auto` or a model id (`fable-5.2`, `opus-5.5`, `sonnet-5.5`, `haiku-5.5`) | `auto` | the model `estimate` recommends |
| `budgetUsd` | a number of 0 or more, or `null` | `null` | skip the go-ahead wait when the estimate fits |
| `confirmBeforeStart` | `true`, `false` | `true` | the estimate step |
| `instructions` | plain text, at most 2,000 characters | `""` | extra guidance for the skill (house style, terms) |

- `config set <key> <value>` checks the value and names the key on any error. Unknown keys are refused. `config set chapters.pr.risks off` sets one chapter. `config set visuals venn,cycle` sets a list. `config set budgetUsd none` clears the budget.
- Reading is tolerant: a broken file or a bad value falls back to the default, key by key. Saving is strict.
- `instructions` is plain text. It is never run, the skill shows it to the user before using it, and it never overrides the truth rules or the template rules.

## Slugs

A slug names an explainer's folder and appears in every link.

1. Take `meta.repo` (`owner/name` becomes `owner-name`). Without it, take the `--repo` folder name. Without that, take the data file's folder name (a `.explainer` folder stands for the folder above it).
2. Lowercase, keep `[a-z0-9]`, join the rest with single `-`, at most 64 characters. Accents are dropped. An empty result becomes `explainer`.
3. **Same source, same slug.** Publishing again updates the entry when the source matches: the same `meta.repo`, else the same repo folder, else the same data file.
4. **Different source, new slug.** If the slug is taken by a different source, add `-2`, `-3` and so on (still within 64 characters).

## Manifest (`library.json`)

```json
{
  "version": 1,
  "updatedAt": "2026-11-18T03:12:09.101Z",
  "explainers": [
    {
      "slug": "acme-taskflow",
      "type": "pr",
      "title": "PR 512: cursor paging for the task list, explained",
      "summary": "The task list used page numbers...",
      "repo": "acme/taskflow",
      "sourcePath": "/work/taskflow/.explainer/explainer.json",
      "repoPath": "/work/taskflow",
      "stack": ["Next.js 15", "TypeScript", "Postgres", "Prisma"],
      "preset": null,
      "status": "merged",
      "tags": ["pagination", "api", "performance"],
      "source": { "kind": "pr", "ref": "#512", "url": "https://github.com/acme/taskflow/pull/512" },
      "commit": "4be19c07d2",
      "generatedAt": "2026-11-18",
      "publishedAt": "2026-11-18T03:12:09.101Z",
      "counts": { "layers": 4, "nodes": 6, "flows": 2, "changes": 0, "concepts": 0, "files": 0, "quiz": 3, "diff": 6, "options": 0, "risks": 3, "rollout": 4, "timeline": 0, "diagrams": 0 },
      "layers": [{ "label": "Client", "color": "blue" }],
      "thumb": { "kind": "map", "layers": [{ "id": "client", "color": "blue" }], "nodes": [{ "id": "web", "layer": "client", "status": "changed" }], "edges": [["web", "api"]] }
    }
  ]
}
```

- Entries are sorted newest `publishedAt` first.
- `type` is always set (`repo` for files without `meta.type`). `repo`, `sourcePath`, `repoPath`, `preset`, `status`, `source`, `commit` and `generatedAt` are `null` when unknown. `stack`, `tags` and `layers` are always arrays; `counts` always has all fourteen keys (`walkthroughs` included).
- `counts.files` is the number of `tree` entries; `counts.diff` the number of diff files.
- `source.url` is present only when it is http or https.
- `origin: "import"` and `importedAt` mark entries that came from an import (kept through `library rebuild`); local builds have no `origin`. The hub can badge them.
- `thumb` is a small picture for the hub card (`scripts/lib/thumb.mjs`), or `null`:
  - **Map** for repo, pr, change, proposal and migration: `{ kind: "map", layers: [{ id, color }], nodes: [{ id, layer, status? }], edges: [[from, to]] }`, at most 40 nodes and 60 edges, edges only between kept nodes.
  - **Otherwise the first visual** (diagrams first, then concept visuals), trimmed to its shape: `layers`, `cycle`: `items: [{ label }]`; `funnel`: `items: [{ label, value? }]`; `state`: `states: [{ id, label }]`, `transitions: [[from, to]]`; `compare`: `columns`, `rows: [{ label, values }]`; `hierarchy`: `nodes: [{ id, label, parent? }]`; `beforeAfter`: `before.items`, `after.items` (labels, 4 each); `quadrant`: `axes: { x, y }`, `points: [{ x, y }]`; `venn`: `sets: [{ id, label }]`, `items: [{ in }]`. Up to 8 items, 10 states, 6 rows, 12 points; labels cut to 24 characters; details dropped.
  - A map-centric type with no nodes falls back to its first visual, and the other types fall back to the map.

**Reading it.** The manifest is checked on every read: `version` must be 1, `explainers` an array, and each `slug` must match `^[a-z0-9]+(-[a-z0-9]+)*$`. A file that fails to parse or fails the check is rebuilt from `explainers/*/explainer.json` (paths are unknown then, and `publishedAt` comes from the file time). Only a writer holding the lock saves that: the old file moves to `library.json.corrupt-<time>` and the rebuilt one takes its place. A reader without the lock (`library list`, export, a dry run) uses the rebuilt manifest in memory and leaves the file for the next writer.

## Page contract (hub, kit and explainer pages)

This is what the template reads. Every value is embedded with the same escaping as explainer data, so no string can close a script tag.

### Hub data

The hub reads one JSON object from `<script type="application/json" id="explainer-data">` and boots with `bootLibrary()`:

```json
{
  "style": "clean",
  "config": { "style": "clean", "defaultType": "auto", "audience": "engineer", "...": "every config key except instructions" },
  "kitHref": "kit.html",
  "manifest": { "version": 1, "updatedAt": "...", "explainers": [] },
  "index": []
}
```

Its `#explainer-context` tag holds `{ "style", "config", "enums" }`. The hub's `manifest.explainers` entries carry no `sourcePath` or `repoPath`; those absolute paths stay in `library.json`.

**`config` in a page never includes `instructions`**, which may hold private notes. A page opened through `library serve` reads the full config from `GET /api/config` with the token. From `file://`, Settings shows the embedded values and the `config set` commands to copy.

### Explainer and kit context

`<script type="application/json" id="explainer-context">` holds:

| Page | Context |
|---|---|
| Library explainer page | `{ "libraryHref": "../../index.html", "slug", "style", "config", "chapters", "enums" }` |
| Library kit page (`kit.html`) | `{ "libraryHref": "index.html", "style", "config", "enums" }` |
| Standalone build | `{ "style", "config", "chapters", "enums" }` |
| `build --no-library` | `{ "style", "chapters", "enums" }` (no config: the page uses defaults) |

Two fields are filled by the build on every page, so the template never keeps its own copy:

- **`chapters`** (explainer pages): the chapter keys the page shows, in order, from `shownChapters(data)` in `scripts/lib/chapters.mjs`. The search index uses the same rule, so every search link lands in a chapter that exists.
- **`enums`** (explainer, hub and kit): the choices Settings and import offer, from the constants the validators use: `{ models, visualKinds, types, styles, depth, audience, codeWalkthrough, bundleFormat, bundleMaxBytes, instructionsLimit, languagePattern }`. `models` includes `auto`; `types` is the seven explainer types (`defaultType` also takes `auto`); `languagePattern` is a regular expression source string.

### Fonts

Library pages (explainers, the hub, the kit) start their inline stylesheet with `@font-face` rules for Geist, Geist Mono, Nunito and JetBrains Mono (latin and latin-ext, `font-display: swap`), pointing at `fonts/` beside the hub with relative URLs (`../../fonts/` from an explainer page). The template's own styles follow. Standalone builds get no `@font-face` and fall back to system fonts. Nothing loads from Google.

### Content Security Policy

Every built page carries `<meta http-equiv="Content-Security-Policy">` right after `<meta charset>`, fixed at build time, so it holds from `file://` too:

```
default-src 'none'; script-src <hash of each inline script>; style-src <hash of each inline style>;
style-src-attr 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'
```

JSON data blocks are not scripts, so they need no hash. `style-src-attr 'unsafe-inline'` allows only the style attributes the page's own code sets (CSS variables, positions); it allows no style element and no script. A page that needs a new inline block gets it by rebuilding, never by editing the file.

When `libraryHref` is set, the page shows a Library link back to the hub.

### Search index

A flat array. One entry per searchable thing:

```json
{ "slug": "acme-taskflow", "type": "step", "title": "Seeks past the cursor", "text": "WHERE (createdAt, id) < (cursor) uses the new index...", "href": "explainers/acme-taskflow/index.html#flows/next-page-after/4" }
```

| `type` | One per | `title` | `text` | `href` hash |
|---|---|---|---|---|
| `explainer` | explainer | `meta.title` | summary, `context.problem`, stack | none (opens Overview) |
| `node` | node | `label` | `summary`, `tech` | `#map/<nodeId>` |
| `flow` | flow | `title` | `trigger`, `summary` | `#flows/<flowId>` |
| `step` | flow step | `label` | `detail`, `why` | `#flows/<flowId>/<n>`, n from 1 |
| `change` | change | `title` | `what`, `why` | `#changes/<changeId>` |
| `entity` | data model | `name` | `summary`, field names | `#data/<name>` |
| `concept` | concept | `title` | `body`, `analogy` | `#concepts/<index>`, from 0 |
| `glossary` | term | `term` | `definition` | `#glossary/<term>` |
| `file` | tree entry | `path` | `note` | `#tree/<path>` |
| `run` | runbook entry | `label` | `command`, `note` | `#run` |
| `diff` | diff file | `path` | `summary`, `status` | `#diff/<path>` |
| `option` | option | `title` | `summary`, `why` | `#options/<index>`, from 0 |
| `risk` | risk | `risk` | `mitigation`, impact | `#risks/<index>`, from 0 |
| `rollout` | rollout step | `label` | `detail`, `command` | `#rollout/<index>`, from 0 |
| `event` | timeline event | `label` | `at`, `detail` | `#timeline/<index>`, from 0 |
| `visual` | diagram | `title` | `caption` | `#visuals/<diagramId>` |
| `question` | quiz question | `question` | `explain` | `#quiz/<n>`, n from 1 |
| `code` | code walkthrough, and each of its steps | `title`; step: `<title>: lines <N-M>` | `why`, `takeaway`, `file`; step: `note`, `why` | `#code/<id>`, `#code/<id>/<n>`, n from 1 |

- `change` entries also carry `date`, `kind` and `authorType` when the data has them, so the hub can merge every explainer's changes into one timeline, newest first.
- `href` is relative to the hub. Each id after the chapter key is **one segment, encoded with `encodeURIComponent`**: `src/a b/x.js` becomes `#tree/src%2Fa%20b%2Fx.js`. A router splits the hash on `/` and decodes each segment.
- `text` has whitespace collapsed and is clipped to 240 characters (ending in `…`).
- Items without the id their link needs are skipped. Exact duplicates (same type, href and title) are dropped.

### Rules for the hub page

- Render every string as text. Never `innerHTML`.
- Only follow an `href` that matches `^explainers/<slug>/index.html(#...)?$`. Anything else renders as text.
- Deep links into the hub: `#search/<query>` (URI encoded), `#changes`, `#type/<type>`, `#settings`.
- Empty state: say how to add one, `concept-explainer build <explainer.json>`.

## Serve

A page opened from `file://` cannot write files, so Settings there shows the current values and, on a change, a ready `concept-explainer config set` command to copy and a "Download config.json" button.

`concept-explainer library serve [--port n]` serves the library so Settings can save directly:

- Binds to **127.0.0.1 only**, on a random port unless `--port` is given. Prints `http://127.0.0.1:<port>/index.html#token=<token>` and runs until Ctrl+C.
- A fresh random **token** per run (48 hex characters) travels to the page in the URL fragment, so it never reaches a server log or a Referer header.
- **Host** must be `127.0.0.1:<port>` on every request (blocks DNS rebinding); `localhost:<port>` gets a 308 to `127.0.0.1`, so there is one origin. The port is the library's own random one (`servePort`, picked once and kept); the installable app, pairing and `launch` are in `references/launcher.md`.
- **Files:** `GET` and `HEAD` only, and only these: `/` and `/index.html` (the hub), `/kit.html`, `/explainers/<slug>/` and `/explainers/<slug>/index.html`, and `/fonts/<name>.woff2` and `/fonts/OFL.txt`. Everything else is not found, with or without the token: `library.json`, `config.json`, every `explainer.json`, temp, backup and corrupt files, dotfiles and `.lock`. Symlinks that leave the library are refused. Responses carry `nosniff`, `no-store`, `no-referrer` and `DENY` framing headers.
- **Bodies:** nothing past the cap is kept; the answer is 413 with `Connection: close`, and the server then discards at most 1 MB or 1 s more of the upload before dropping the connection, so the client can read the 413 (closing with unread data resets the socket, and on Windows that loses the answer). Aborted uploads are dropped without an answer.
- **API:** every call needs the token in `X-Concept-Explainer-Token`; writes also need the Origin. `GET /api/config` needs it too, since `instructions` may be private.
- **CSP:** a page is served with the policy its build fixed (its meta tag), plus `frame-ancestors 'none'`, which works only as a header. The policy is never recomputed from the served file, so a page changed after its build gains nothing. A page without a meta tag gets `default-src 'none'`. Other files get `default-src 'none'; frame-ancestors 'none'`.

| Endpoint | Request | Response |
|---|---|---|
| `GET /api/config` | token | `{ "config": {...} }` |
| `POST /api/config` | token, Origin, JSON body of changed keys, 64 KB cap | `{ "config": {...} }` after saving and rebuilding |
| `GET /api/export` | token; optional `slugs=a,b`, `type`, `tag`, `stack`, `search` (none: the whole library) | the bundle JSON, as an attachment named `explainers-<date>.explainers.json` |
| `POST /api/import` | token, Origin, the bundle text as `application/json`, 10 MB cap; `dryRun=1` to plan only; `onConflict=rename\|skip\|replace` (default `rename`) | `{ "summary": { "dryRun", "added", "replaced", "skipped", "rejected" } }` |

Errors are `{ "error": "..." }` with 400 (bad input, named), 403 (token, origin or host), 405, 413 or 415.

### Page side of serve

Built pages are static files, so they do not carry the API paths. Use these defaults:

```json
{ "serve": { "api": { "config": "/api/config", "export": "/api/export", "import": "/api/import" } } }
```

How a page knows it is served, and how it saves:

1. **Detect.** `location.protocol` is `http:`, `location.hostname` is `127.0.0.1`, and the hash starts with `token=` on first load. Read the token, keep it in `sessionStorage` (inside try/catch) so other pages from the same origin have it, then replace the hash with the normal route (`history.replaceState`). Without a token, behave as on `file://`.
2. **Read.** `GET /api/config` for the live values (the embedded config can be older).
3. **Save.** Send the changed keys only:

```
POST /api/config
Content-Type: application/json
X-Concept-Explainer-Token: <token>

{ "audience": "expert", "chapters": { "pr": { "risks": false } } }
```

The browser adds `Origin`, which must be `http://127.0.0.1:<port>`. The body is at most 64 KB, a JSON object of config keys, checked with the same rules as `config set`. Changes merge into the saved config.

| Status | Body | Meaning |
|---|---|---|
| 200 | `{ "config": {...} }` | Saved; every page, the hub and the kit were rebuilt. Reload to see them. |
| 400 | `{ "error": "save config: audience: \"kids\" is not one of ..." }` | Bad JSON or a bad value; nothing saved. Show the message. |
| 403 | `{ "error": "wrong or missing token" }` or `wrong origin` or `wrong host` | Refused; nothing saved. |
| 405, 413, 415 | `{ "error": "..." }` | Wrong method, body too large, not JSON. |

## Share: export and import

A **bundle** (`*.explainers.json`) carries explainer data only:

```json
{
  "format": "concept-explainer-bundle",
  "version": 1,
  "exportedAt": "2026-11-18T09:00:00.000Z",
  "exportedBy": null,
  "explainers": [{ "slug": "acme-taskflow-pr-512", "data": { "schemaVersion": 2, "meta": { "type": "pr" } } }]
}
```

No HTML, no scripts, no config, no local paths. The importer rebuilds every page with its own template, so a bundle can never inject markup or code.

**Selectors** (CLI flags or `/api/export` params): slugs, `type`, `tag` (exact, any case), `stack` (contains, any case), `search` (any case, in titles, summaries, tags, stack and everything the search index covers). They combine with AND. No selector exports the whole library.

**Import treats the file as untrusted:**
- At most 10 MB and 500 explainers. JSON errors are named.
- `__proto__`, `constructor` and `prototype` keys are dropped while parsing, at every depth.
- `format` must be `concept-explainer-bundle` and `version` 1.
- Every `url` that is not http or https is dropped (and the summary says how many).
- Every explainer is validated. Errors reject that explainer, with the first reasons; warnings are allowed.
- Slugs are re-derived: the bundle's slug is only a hint and goes through `slugify`; without one the slug comes from the data. Imported entries have no `sourcePath` or `repoPath`.

**Conflicts** (`--on-conflict`, or `onConflict`):

| Mode | The slug is free | The slug holds the same source | The slug holds a different explainer |
|---|---|---|---|
| `rename` (default) | add | add as `<slug>-2` | add as `<slug>-2` |
| `skip` | add | skip | skip |
| `replace` | add | replace it, keeping the old data as `explainer.json.replaced-<time>-<random>` | add as `<slug>-2` (never overwrites a different explainer) |

Within one bundle, a later item aimed at a slug an earlier item already writes is **skipped** with the reason `duplicate in this bundle` (in `rename` mode, only when it is the same source). The first item wins, so a replace never backs up its own output. Backups are written with `wx` and a random suffix, so two can never overwrite each other. Imported entries are marked `origin: "import"`.

"Same source" means the same type and, for a repo, the same `meta.repo`; for other types, the same `meta.source` reference.

**The summary** (CLI output, or `summary` from the API):

```json
{
  "dryRun": true,
  "added": [{ "slug": "acme-taskflow-pr-512-2", "title": "...", "note": "renamed from acme-taskflow-pr-512; dropped 1 unsafe link" }],
  "replaced": [{ "slug": "...", "title": "...", "note": "", "overwrites": { "slug": "...", "title": "the local explainer's title" } }],
  "skipped": [{ "index": 0, "title": "...", "slug": "...", "reason": "already in the library" }],
  "rejected": [{ "index": 2, "title": "...", "reasons": ["concepts[0].body: contains HTML markup..."] }]
}
```

**One explainer from its own page** (works from `file://`): the page builds the bundle from what it already embeds, with no request:

```js
const data = JSON.parse(document.getElementById('explainer-data').textContent);
const context = JSON.parse(document.getElementById('explainer-context').textContent);
const bundle = {
  format: 'concept-explainer-bundle', version: 1, exportedAt: new Date().toISOString(), exportedBy: null,
  explainers: [{ slug: context.slug || '', data }],
};
// download JSON.stringify(bundle, null, 2) as <slug or title>.explainers.json
```

An empty `slug` is fine: the importer derives one from the data. "Save as page" downloads the page's own HTML.

**From the hub:** under `library serve`, `GET /api/export` with the picked slugs or the current filter, and for import `POST /api/import?dryRun=1`, show the summary, then the same body without `dryRun` to import. From `file://`, show the matching `concept-explainer export ...` or `concept-explainer import <file>` command to copy.
