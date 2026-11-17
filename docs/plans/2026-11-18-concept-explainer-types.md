# Concept Explainer: rename + explainer types (2026-11-18)

Owner request: rename Repo Explainer to **Concept Explainer**, because it should explain more than a
repo: a PR/MR, a single change, a proposal, a tech change, and so on. The skill first identifies what it
is explaining, then fills the **same object format**, so the library can categorise and filter by type.

## 0. The point: show it, don't tell it

Owner: "the main purpose is the visualization, and concept breakdown using diagrams, graphics and so on".
So every chapter is a picture first and text second. Rules:
- **Every new chapter object renders as a diagram, not a list.** `options` = side-by-side comparison
  matrix with the chosen column marked; `risks` = impact grid (low/medium/high rows) with mitigation on
  select; `rollout` = a stepped track with done/next markers; `timeline` = a horizontal time axis with
  typed event markers; `diff` = a file bar chart (+/− lines, status markers) linked to map nodes that
  glow with their `status`; `context` = a problem → goals → non-goals visual, not paragraphs.
- **Concept breakdown.** `concepts[]` may carry `parts[]` (`{ label, detail? }`, 2 to 6) and a
  `visual` (`{ kind, ... }` below), so one big idea is broken into drawn pieces you click through.
- **A generic `diagrams[]` chapter** (key `visuals`) for anything the fixed chapters do not cover, from a
  fixed kit (no free-form SVG, no images from data, data only):
  | kind | Data | Draws |
  |---|---|---|
  | `layers` | `items[{label, detail?}]` top to bottom | a stack (OSI, app layers) |
  | `cycle` | `items[]` | a loop (event loop, TDD, OAuth refresh) |
  | `state` | `states[{id,label}]`, `transitions[{from,to,label}]` | a state machine |
  | `compare` | `columns[]`, `rows[{label, values[]}]` | a comparison table drawn as a grid of marks |
  | `hierarchy` | `nodes[{id,label,parent?}]` | a tree / org of parts |
  | `beforeAfter` | `before{items[]}`, `after{items[]}`, `notes[]` | two panels with what moved |
  | `quadrant` | `axes{x,y}`, `points[{label,x,y}]` (0 to 1) | a 2x2 |
  | `funnel` | `items[{label, value?}]` | narrowing stages |
  | `venn` | `sets[{id,label}]` (2 or 3), `items[{label, in[]}]` | overlap of 2 to 3 groups |
  Each diagram has `title`, `caption` (one sentence), and is selectable part by part with a detail
  panel, keyboard reachable, with the same one-shot motion and reduced-motion rules. Deep link
  `#visuals/<diagramId>/<partIndex>`.
- Explainer types lean on these: `concept` is mostly `concepts` with `parts` + `visuals`; `proposal`
  and `migration` use `beforeAfter`/`compare`; `incident` uses `timeline` + `state`.
- The hub card for each explainer shows a small, generated thumbnail of its main diagram (the map, or
  the first visual) drawn by the same code, so the library reads visually too.

## 1. One schema, a `type` per explainer

`meta.type` (required from schema v2; v1 files without it are read as `repo`):

| type | Explains | Typical source | Default chapters (in order) |
|---|---|---|---|
| `repo` | A whole codebase | a repo path | map, flows, changes, tree, data, concepts, quiz, glossary, run |
| `pr` | One PR / MR | PR/MR url or branch diff | context, diff, map, flows, risks, rollout, quiz |
| `change` | One commit or a small range | SHA / range | context, diff, flows, risks, quiz |
| `proposal` | An RFC, design doc or idea not built yet | doc, issue, notes | context, options, map, flows, risks, rollout, quiz |
| `migration` | A tech change: upgrade, re-platform, swap a library | plan + code | context, options, map, flows, rollout, risks, quiz |
| `incident` | A post-mortem | incident notes, logs | context, timeline, flows, risks, rollout, quiz |
| `concept` | A technical idea not tied to one repo (OAuth, CRDTs) | docs, specs | concepts, map, flows, glossary, quiz |

Every type uses the same top-level objects. A type only changes which chapters are expected, the
default chapter order, the lead copy, and what the validator requires (`repo` needs `nodes` + `flows`;
`pr`/`change` need `context` + `diff`; `proposal`/`migration` need `context` + `options`;
`incident` needs `context` + `timeline`; `concept` needs `concepts`). `--repo` file checks apply only
when the type cites code.

### New optional `meta` fields
- `type` (above), `source`: `{ kind: "repo"|"pr"|"commit"|"doc"|"issue"|"url"|"notes", ref, url? }`
  (url through the http(s) allowlist), `status` for proposal/migration/pr:
  `draft|proposed|accepted|rejected|in-progress|merged|done`, `tags[]` (≤ 8, free text, used for filters).

### New chapter objects (all optional, used by the types above)
- `context`: `{ problem, goals[], nonGoals[], background? }` (plain text, short).
- `diff`: `[{ path, status: added|modified|removed|renamed, summary, nodes[]?, lines?: "+12 -3" }]`
  A file-by-file walkthrough; `key: true` on the 2-4 files a reviewer must read.
- `options`: `[{ title, summary, pros[], cons[], chosen?: true, why? }]` (exactly one `chosen` when the
  decision is made; none while `status` is draft/proposed).
- `risks`: `[{ risk, impact: low|medium|high, mitigation, owner? }]`.
- `rollout`: `[{ label, detail?, done?: boolean, command? }]` ordered steps / checklist.
- `timeline`: `[{ at, label, detail?, kind?: detect|act|fix|learn }]` for incidents.
- Node `status`: `added|changed|removed|unchanged` on `nodes[]` so `pr`, `change`, `proposal` and
  `migration` maps highlight what moves (a small marker + legend, never a big fill).
- Flows may set `variant: "before"|"after"` with a shared `pair` id to show before/after side by side.

`CHAPTER_KEYS` grows to include `context, diff, options, risks, rollout, timeline`. Deep links follow the
existing contract: `#context`, `#diff/<path>`, `#options/<index>`, `#risks/<index>`, `#rollout/<index>`,
`#timeline/<index>`. Search index gets matching types: `diff`, `option`, `risk`, `rollout`, `event`.

## 2. Presets become per type

`presets/` keeps the stack presets for `repo` and adds one preset per other type (`pr`, `change`,
`proposal`, `migration`, `incident`, `concept`) carrying `type`, `chapters`, `mustCover` questions and
starter objects. `init` takes `--type` (and `--preset` for repo stacks). `scan` is still repo-only; a
new `pr` helper (`concept-explainer diff <repo> --base <ref> [--head <ref>]`) drafts `diff[]` and node
statuses from `git diff --numstat` + node `files` mapping, never inventing summaries (TODO markers).

## 3. Skill: identify first

SKILL.md gains step 0 "Identify what you are explaining" with a decision table (input looks like X =>
type Y), asking the user only when it is genuinely ambiguous. Then the type picks the preset, the
chapters and the truth rules (PR: cite diff lines; proposal: never present proposed parts as built,
status must be honest; incident: times from the record only; concept: cite sources by url).

### Estimate before starting (owner request)

Right after identifying the type, the skill must run `concept-explainer estimate <input> --type <type>`
and show the user **how long it will take and what it will cost** before any investigation starts, then
wait for a go-ahead (one short question; skip the wait only if the user already said "just do it" or
gave a budget the estimate fits).
- Input size per type: `repo` = files/lines read (existing estimate logic), `pr`/`change` = diff size
  (`--base/--head` or a SHA range) plus touched files, `proposal`/`incident`/`concept` = source doc
  length (`--source <file|dir>`, words), `migration` = both.
- Output: a small table per model (current Claude models, prices kept in `scripts/lib/estimate.mjs`
  with a "prices as of" date) with tokens in/out, cost range (low to high), and wall-clock time range
  (agent minutes, from a tokens-per-minute assumption documented next to the prices), plus the
  recommended model. Ranges, never false precision; state the assumptions in one line.
- `--json` for agents. Tests cover every type.
- After the build, the hand-off reports the estimate next to what actually happened if known.

## 4. Rename

- Product name **Concept Explainer** everywhere in UI, docs, credits, titles (`<title>: X · Concept Explainer`).
- Skill name `concept-explainer`; CLI bin `concept-explainer` with `repo-explainer` kept as an alias bin
  that prints a one-line deprecation note to stderr.
- Library home `$CONCEPT_EXPLAINER_HOME` else `~/.concept-explainer`; `REPO_EXPLAINER_HOME` still read
  as a fallback. On first run, if `~/.repo-explainer` exists and the new home does not, move it
  (rename) and print what happened; never delete data.
- `install` links the skill as `concept-explainer`, writes `rules/concept-explainer.md`, and removes the
  old `repo-explainer` symlink/rule only if they are ours (symlink pointing into this repo / identical
  file).
- package name `concept-explainer`; repository URLs updated once the GitHub repo is renamed
  (owner approval needed for the GitHub rename; GitHub redirects the old URL).

## 5. Hub

- Type is a first-class filter: a type segmented filter / sidebar group ("Repos", "PRs", "Changes",
  "Proposals", "Migrations", "Incidents", "Concepts") with counts, plus tag and stack filters.
- Cards show a mono type tag and `status` when present. Search results show the type.
- Deep link `#type/<type>`.

## 6. Settings (owner request)

Theme controls move out of the sidebar footer into a **Settings** view (sidebar footer keeps one
"Settings" item with a gear icon; deep link `#settings`), in the hub and in every explainer page.
Two groups, clearly labelled:

**Reading (this browser only, localStorage in try/catch):** theme (light/dark/system), style
(clean/playful), motion (system/reduced), text size (default/large), density (comfortable/compact).

**Explainer defaults (the skill reads these, stored in `<home>/config.json`):**
| key | values | used by |
|---|---|---|
| `style` | clean, playful | build default |
| `defaultType` | auto, repo, pr, change, proposal, migration, incident, concept | skill step 0 (auto = identify) |
| `audience` | newcomer, engineer, expert | tone, depth, glossary size |
| `depth` | overview, standard, deep | flows/steps/parts counts |
| `language` | BCP 47 tag, default `en` | all prose |
| `visuals` | preferred visual kinds (multi) | skill picks these first |
| `chapters` | per type: on/off list | which chapters the skill fills |
| `quiz`, `analogies` | on/off | |
| `model` | recommended model id for estimates | estimate default |
| `budgetUsd` | number or null | skip the go-ahead wait when the estimate fits |
| `confirmBeforeStart` | true/false (default true) | estimate step |
| `instructions` | free text, at most 2,000 chars | appended guidance for the skill (house style, terms) |

- CLI: `concept-explainer config` (print), `config get <key>`, `config set <key> <value>`,
  `config reset`, `config --json` (the skill runs this first). Validated with clear errors; unknown
  keys rejected; `instructions` is plain text, never executed, shown back to the user before use.
- Saving from the page: a page opened from file:// cannot write files, so Settings shows the
  current values (embedded at build/rebuild time) and, on change, gives a ready `config set` command
  to copy plus "Download config.json". When opened through `concept-explainer library serve`
  (binds 127.0.0.1 only, random port, a random per-run token required on every write via header,
  Origin/Host checked, JSON body validated with the same schema, no other write endpoints, no
  directory listing outside the library), Settings saves directly and the hub regenerates.
- SKILL.md: step 0 runs `config --json` and applies it; `instructions` never override truth rules or
  the never-edit-template rules.

## 7. Export and import (owner request)

Share one explainer, a topic (filter), or the whole library with someone else, who imports it into
their own library.

- **Bundle format** (`*.explainers.json`): `{ format: "concept-explainer-bundle", version: 1,
  exportedAt, exportedBy?: null, explainers: [{ slug, data }] }` where `data` is the explainer JSON.
  Data only: no HTML, no scripts, no config, no local paths (`sourcePath`/`repoPath` are dropped). The
  importer rebuilds pages with its own template, so a bundle can never inject markup or code.
- **CLI:** `concept-explainer export [<slug>...] [--type <t>] [--tag <tag>] [--stack <s>] [--search <q>]
  [--out <file>]` (no selector = whole library; prints what went in). `concept-explainer import <file>
  [--on-conflict skip|replace|rename] [--dry-run]` (default rename: `-2` suffix; replace only for an
  entry with the same source). Import treats the file as untrusted: size cap (10 MB), JSON parse
  errors named, format/version checked, every explainer validated (errors reject that explainer,
  warnings allowed), slugs re-derived and sanitised, ids/URLs go through the same allowlists, a
  summary of added / replaced / skipped / rejected with reasons.
- **Settings > Share** (hub and explainer pages):
  - Explainer page: "Export this explainer" downloads a one-explainer bundle from its embedded data
    (works from file://), and "Save as page" downloads the self-contained HTML.
  - Hub: pick explainers (checkboxes on cards or the current filter: type, tag, stack, search) and
    export. From file:// the hub has no full data, so it shows the matching `concept-explainer export`
    command to copy; under `library serve` it downloads the bundle via `GET /api/export?slugs=...`.
  - Import: under `library serve`, a file picker / drop zone uploads to `POST /api/import` (token +
    origin checks, size cap, same validation), shows the dry-run summary first, then "Import". From
    file://, it shows `concept-explainer import <file>` to copy.
- Tests: round trip (export then import into an empty home gives equal data), conflict modes,
  malicious bundles (markup in strings stays text, `javascript:` URLs dropped, `../` slugs
  sanitised, oversize, wrong format, prototype pollution keys like `__proto__` ignored).

## 8. App launcher (owner request, 2026-11-18)

No Electron or Tauri. HTML stays the core: every explainer is one self-contained file that works from
file:// and can be shared. The launcher only makes the library feel like an app. Ships on a stacked
branch `feat/app-launcher` as 0.3.0 unless it passes review before the 0.2.0 release.

### 8.1 `library serve` as an installable PWA
- **Stable origin.** An installed PWA is tied to scheme, host and port, so a random port breaks it.
  Default port **4747** (`--port`, config `servePort`, 1024 to 65535; `--port 0` = random for tests).
  URLs always use `127.0.0.1`; Host `localhost:<port>` gets a 308 to `127.0.0.1`.
- **Port busy.** If 4747 answers `GET /api/health` with our fingerprint, reuse it. If something else
  holds it, use the first free port in 4748 to 4757 and say the installed app will not work there.
  Never take over a foreign process.
- **Fixed app routes** from the package (a fixed map, never built from the request path):
  `/manifest.webmanifest`, `/sw.js`, `/app/icon-192.png`, `/app/icon-512.png`, `/app/maskable-512.png`,
  `/app/icon.svg`. Library files still come only from the home folder with traversal and symlink checks.
- **Manifest.** `id "/"`, `start_url "/index.html"`, `scope "/"`, `display "standalone"`,
  name "Concept Explainer", short name "Explainers", background and theme `#fafafa`, Clean orange icons.
- **Pages stay standalone.** `template/js/pwa.js` adds the manifest link and registers `/sw.js` only on
  `http://127.0.0.1`. On file:// it does nothing. Save-as-page and bundles never carry manifest, SW or tokens.
- **Service worker:** GET, same origin, status 200 only; **never `/api/*`** (tested). Pages network first
  with a 3 s timeout then cache. Install caches hub, kit, manifest, icons; after each hub load it caches
  every `explainers/<slug>/index.html` from `/library.json` (cap 200 pages / 100 MB) and drops removed
  ones. Cache name carries the manifest `updatedAt`; old caches deleted on activate. Offline: a quiet
  banner "Reading offline. Start Concept Explainer to save settings or import." and writes disabled.

### 8.2 Pairing (how a page gets the right to write)
1. `library serve`, `launch` or the launcher writes a one-time code to `<home>/.serve/pair/<id>.json`
   (folder 0700, file 0600, sha256 of the code, 120 s expiry) and opens `index.html#pair=<code>`.
2. The page sends `POST /api/pair` with the code, header `X-Concept-Explainer-Pair: 1`, Origin, Host and
   `Sec-Fetch-Site: same-origin` checked. The code is used once and deleted; the server returns a 32 byte
   device token and stores only its sha256 in `<home>/.serve/devices.json` (0600).
3. The page keeps it in localStorage (`concept-explainer:device`, try/catch), clears the fragment with
   `history.replaceState`, then starts the router. The installed PWA shares that storage.
4. Every write (`/api/config`, `/api/import`) needs `X-Concept-Explainer-Token` (per-run or device token),
   right Origin and Host, JSON body. OPTIONS gets 405 with no CORS headers.
5. `library serve --forget-devices` revokes all devices. Without a token a page behaves as on file://.
Known limit: while the server runs, other local accounts can read pages on 127.0.0.1; they cannot write.

### 8.3 `launch` and the idle stop
- `concept-explainer launch` reads `<home>/.serve/server.json` (`{ pid, port, instance, version,
  startedAt }`); running only if the pid is alive and `GET /api/health` returns the same instance.
- Otherwise it takes `<home>/.serve/start.lock` (atomic mkdir, stale if its pid is gone), starts a
  detached `library serve --idle 30` logging to `<home>/.serve/serve.log` (1 MB cap, one rotation), waits
  up to 5 s for health, writes a pairing code and opens the hub. Concurrent clicks start one server.
- `--idle <minutes>` (config `serveIdleMinutes`, 0 to 1440; launcher 30, manual serve 0 = never).

### 8.4 `install --launcher` / `uninstall --launcher`
- Store `realpath(process.execPath)` (Node >= 18.3) and this package's absolute bin path at install
  time, since GUI apps do not get shell PATH and mise/nvm shims move. Warn when node lives in a
  mise/nvm/fnm/volta versions folder; offer `--node <path>`. At launch, check both paths and show a
  native alert (osascript / notify-send / log) telling the user to reinstall the launcher.
  `CONCEPT_EXPLAINER_HOME`, when set, is baked in.
- **macOS:** `~/Applications/Concept Explainer.app` with Info.plist (bundle id
  `io.github.cyvid7-darus10.concept-explainer`, `LSUIElement` true), a 0755 `/bin/sh` executable that
  execs node `launch` with every path single-quoted and escaped, and `AppIcon.icns` made with sips +
  iconutil from `assets/app/icon-1024.png` (warning, no icon, on failure). No notarization needed.
- **Linux:** `~/.local/share/applications/concept-explainer.desktop` (Exec quoted per spec) and a 512 px
  hicolor icon; `update-desktop-database` when present.
- **Windows:** a Start Menu `.lnk` via PowerShell `WScript.Shell`, paths passed as arguments or env vars
  (never interpolated), minimized; icon in `%LOCALAPPDATA%\concept-explainer\icon.ico`; fall back to a
  `.cmd`.
- Every written path and its sha256 go to `<home>/.serve/launcher.json`. Idempotent; never overwrite a
  path we did not write without `--force` (keeps a `.bak`). `uninstall --launcher` stops a launcher-started
  server and removes only recorded paths whose hash still matches (and the .app only with our bundle id).

### 8.5 Tests
Serve app routes and types; localhost redirect; pairing once-only, expiry, wrong Origin, missing header,
cross-site Sec-Fetch-Site, OPTIONS 405; device token accepted then revoked; port reuse vs fallback; idle
stop on an injected clock. `launch` single start under concurrency, stale lock, foreign server. Launcher
files per platform with paths containing spaces, `'`, `$`, `%`; valid plist; .desktop escaping;
PowerShell argument arrays; uninstall removes exactly recorded files. `sw.js` in `node:vm` with fake
caches/fetch: no `/api/*` or POST cached, offline fallback, old cache cleanup. Browser: Chrome install on
127.0.0.1:4747, offline reading after idle stop, pairing, Safari Add to Dock, a real macOS launcher click.

## 9. Code walkthrough (owner request, 2026-11-18)

Owner: "there should be a part where we break down the important code line by line so we understand
it". A walkthrough takes one real snippet and annotates its important lines in reading order, one
step at a time, the way the flow player steps through hops.

### 9.1 Purpose, and when it appears
- **Optional, always.** No type requires it and its absence is never a validator error or warning.
  It is a chapter the skill adds only when code carries the root of the idea (the root card in
  `references/explaining.md`: the mechanism or the invariant lives in a few lines a reader should
  see), or when the user asks for it.
- **2 to 5 snippets** per explainer, each 5 to 40 lines. More is a warning: a walkthrough of
  everything is a code listing, not an explanation.
- Config key `codeWalkthrough: "auto" | "always" | "never"` (default `auto`) in `<home>/config.json`,
  read by the skill in step 0. `auto` = add one when code carries the root; `always` = add at least
  one when the type cites code; `never` = skip. Presets list `code` under `optionalChapters`, never
  in `chapters`, so `init` never adds an empty walkthrough.
- **Hook for reader signals (planned separately).** When a future "Explain more" signal flags a flow
  step, a concept or a map node, the next run treats that as a reason to go deeper; if the flagged
  item has code (`step.file`/`step.code`, `concept.file`, `node.files`), adding a walkthrough of that
  code is one of the ways to go deeper, even under `auto`. A walkthrough's `refs` point back at the
  item it deepens, so the page can link both ways. Nothing in the data format depends on the signal.

### 9.2 Data: top-level `walkthroughs[]`
```json
{ "id": "create-task-route", "title": "Creating a task", "file": "apps/web/app/api/tasks/route.ts:12-31",
  "lang": "ts", "why": "Every write goes through this handler, so its order of checks is the contract.",
  "code": "<the exact lines 12 to 31>",
  "steps": [ { "lines": "14-15", "note": "Reads the session.", "why": "...", "kind": "input",
               "refs": { "node": "api", "flow": "create-task", "step": 2, "concept": 0, "glossary": "session" } } ],
  "takeaway": "The route only checks and hands over; the service owns the rules." }
```
- `id` unique, `title` short, `why` one sentence (why this code matters), `takeaway` one sentence.
- `file` is `path:start-end` (1-based, inclusive, file line numbers). `lang` optional, detected from
  the extension otherwise. `code` is the exact lines start..end joined by `\n`, 5 to 40 lines.
- **Steps** (2 to 12) cover the important lines in reading order, not every line; boilerplate may be
  one grouped step. `lines` is `"N"` or `"N-M"` in **file line numbers**, so what the reader sees in
  the gutter is what their editor shows. `note` ≤ 2 sentences in plain words (what the lines do);
  `why` optional design reason (choice, constraint, cost of the alternative, from a source);
  `kind` optional: `what`, `why`, `gotcha`, `input`, `output`. `refs` optional links: `node` id,
  `flow` id plus `step` (1-based, as flows count steps), `concept` index (0-based, as #concepts),
  `glossary` term.
- **Illustrative code** (`illustrative: true`, `file` omitted, lines counted from 1): pseudo-code for a
  concept not tied to a repo. Shown with the tag "Illustrative, not from a repo". Allowed for every
  type; a warning for types that cite code (repo, pr, change, migration), which should show real code.

### 9.3 Truth rules
- Code is never retyped from memory: `concept-explainer snippet <repo> <path:start-end> [--lang x]`
  prints `{ file, lang, start, end, code }` as JSON for the agent to paste.
- With `--repo`, the validator re-reads each cited file: `code` must equal lines start..end
  (trailing whitespace per line and a final newline ignored, CRLF read as LF). A mismatch is a
  warning, so it fails `--strict`; a range past the end of the file is an error.
- Every step's lines are inside the snippet's range (error), steps run in order and do not overlap
  (warnings).
- **Secrets.** `snippet` refuses `.env*` (except `.env.example`, `.env.sample`, `.env.template`),
  key and certificate files (`*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`,
  `.npmrc`, `.netrc`, `credentials*.json`) and any range with a line that looks like a credential
  (private key blocks, AWS access keys, GitHub, Slack, Stripe and OpenAI style tokens, and
  `password|secret|token|api_key = "<8+ chars>"`). The validator applies the same line patterns to
  every walkthrough's `code` (error), with or without `--repo`.
- Control characters: `snippet` refuses files with C0/C1 controls other than tab, bidi overrides or
  zero-width marks (Trojan Source); the validator's hidden-character check already covers `code`.
- Paths: no absolute paths, no `..` segments, no symlinks out of the repo (resolved with realpath).

### 9.4 Rendering (chapter key `code`)
Nav "Code walkthrough", title "The code, line by line", lead "The few lines that carry the idea,
one step at a time. Each step says what the lines do and why."
- A picker when there are several walkthroughs. A header with title, `why`, the file citation
  (middle-truncated path with its range), the language and, when illustrative, the tag.
- Code panel: one row per line with its file line number; the current step's lines get an orange
  left bar and a faint orange wash in Clean (Playful: the select blue), the other lines are dimmed;
  lines that some step covers have a clickable number that jumps to that step. Long lines wrap; no
  inner scroll in either direction. Syntax highlighting is a tiny dependency-free tokenizer
  (comments, strings, keywords for the C, Python, shell, SQL, Ruby and Go families) using the code
  tokens only: comments muted, keywords heavier ink, no rainbow.
- Annotation card beside the code (≥ 900px of chapter width), above it on phones so Back and
  Continue stay in place, as in the flow player: step count, kind tag, the line range, `note`,
  `why` ("Why it is written this way"), and links from `refs` (map node, flow step, key idea,
  glossary term). Segmented progress, Back / Continue, then a Takeaway screen with Replay and
  Next walkthrough.
- Keyboard: ArrowRight / `j` next, ArrowLeft / `k` back; Tab reaches line numbers and buttons.
- Deep links: `#code/<id>` (first step), `#code/<id>/<n>` with **steps counted from 1** (they are
  steps, like `#flows/<id>/<n>`; parts in visuals and indexes in options are counted from 0), and
  `#code/<id>/done` for the takeaway.
- Flow steps with `code` and concepts with `file` get "Walk through this code" when a walkthrough
  covers the same file and line (helper `chWalkthroughFor(data, fileRef)` returns the href).
- One-shot motion only (the card slides like the flow card), reduced motion respected.

### 9.5 Validation, search, library
- `scripts/lib/validate-code.mjs`: shape, limits (`LIMITS.walkthroughs`), refs resolve to real
  node, flow, flow step, concept and glossary entries, secret patterns, and with `--repo` the exact
  code match. Never required by `TYPE_RULES`.
- Search: type `code`, one entry per walkthrough (`#code/<id>`) and one per step (`#code/<id>/<n>`).
- Manifest counts gain `walkthroughs`.
- `CHAPTER_KEYS` gains `code`; `TYPE_RULES[type].optional` lists `code` for every type, and config
  `chapters.<type>.code` may switch it.

### 9.6 Skill
After "Find the root": if code carries the root (or the user asked, or config says `always`, or a
reader flagged the item "explain more"), pick 2 to 5 snippets, 5 to 40 lines each, that carry the
mechanism or the invariant; extract each with `concept-explainer snippet`; annotate the important
lines in reading order (what, then why, with the gotcha called out); link steps to nodes, flow steps,
concepts and terms; end with a one-sentence takeaway. Skip it when `codeWalkthrough` is `never`.

## 10. Learning loop (owner request, 2026-11-18)

"The more you work, the more the agent knows what needs to be explained more next time." Each run
learns from readers and from the last run. Everything stays on this machine in the 0700 home: no
identifiers, no network beyond 127.0.0.1, every number shown with its n. Ships on `feat/learning-loop`
stacked on `feat/app-launcher` (both touch serve.mjs, settings.js, library.mjs).

### 10.1 Reader signals (pages)
- Recorded only on `file://` and `http://127.0.0.1:<port>`; never on hosted copies (GitHub Pages).
  Off when Settings > Reading > "Help improve future explainers" is off (`concept-explainer:learning`,
  default on); turning it off offers "Delete what this browser recorded".
- Section keys: deep-link routes (`map`, `flows/<id>`, `concepts/<i>`, `visuals/<id>`, `diff/<path>`,
  `code/<id>`, `quiz/<i>`). `build` embeds `context.sections: { <route>: <fp> }` (fp = first 8 hex of
  sha256 of the item's title/label + body) and `context.build` (sha256 of the data), so a reordered or
  rewritten item never inherits old feedback. Explainer key = slug, else `meta.repo|meta.title`.
- Recorded (counts and buckets, date only): votes Clear / Explain more / Too basic at the end of each
  chapter view and on each flow, concept, visual and walkthrough, with an optional one-line note after
  Explain more / Too basic; quiz first-try wrong, misses (cap 9), wrong option indexes; "?" hints and
  glossary terms opened (keys must exist in the page data); chapters viewed and finished; time on view
  as `<30s | 30s-2m | 2-10m | >10m` (largest per visit).
- localStorage `concept-explainer:signals:<key>`, cap 32 KB (oldest counters dropped), pending deltas +
  a random `batchId`.
- Batch: `{ format: "concept-explainer-signals", version: 1, batchId, date, explainers: [{ key, slug?,
  build, sections: { <route>: { fp, vote?: {from,to}, note?, views, finished, time } }, quiz: { <i>:
  { fp, firstWrong, misses, wrong: [i] } }, lookups: { glossary: {term: n}, hints: {label: n} } }] }`.
  Note ≤ 140 chars, one line; C0/C1 controls and bidi overrides rejected.
- Serve: `POST /api/signals` (token or device token, Origin, Host, CSP rules, ≤ 64 KB), sent on page
  hide (`fetch` keepalive) and via Settings "Send now"; pending cleared after 200; repeated batchId
  acknowledged and ignored (server keeps the last 500).
- file://: Settings > Reading > "Send feedback to the library" shows exactly what goes, offers
  "Download feedback file" (`<key>.signals.json`) and copies `concept-explainer insights import <file>`
  (same validation and dedupe).

### 10.2 Library memory
- `<home>/insights/<slug>.json`: `subject` (`meta.repo`, else `meta.source.ref`, else first tag); per
  route+fp votes, ≤ 20 latest notes, views, finished, time buckets; per quiz item answers, first-try
  wrong, wrong picks; lookups; `batches[]`; `flags[]` `{ id: "f-<hash>", route, fp, kind:
  more|basic|quiz|term, evidence, state: open|addressed|kept, addressedIn? }`.
- `<home>/insights/_reader.json`: `struggles` (terms looked up ≥ 3 times across ≥ 2 explainers),
  `knows` (terms in ≥ 3 viewed explainers, never opened), `depthHint` (suggestion only; never edits
  config, shows `config set depth <x>` to copy).
- Flag rules: explicit vote flags at n = 1; quiz flags need ≥ 3 answers and ≥ 50% first-try wrong;
  term flags follow `struggles`. Every flag shows its n.
- CLI: `insights [<slug>|--subject <s>] [--json]`, `insights import <file>`, `insights reset
  [<slug>|--all]`, `insights forget-reader`. Atomic writes, 0600. `config learning on|off` (default
  on); off = `/api/signals` 403 "learning is off", nothing new recorded, skill neither reads nor
  writes notes.

### 10.3 Agent notes
- After each run the skill writes `concept-explainer notes write <subject> --data notes.json`; the CLI
  validates, writes `<home>/notes/<subject>.json` and renders `<subject>.md`.
- Fixed sections only: `conventions`, `whereThingsLive`, `hardToFind`, `openQuestions`, `readerFlags`
  (`{ flagId, response }`), `changed`; items plain text ≤ 200 chars, ≤ 12 per section, ≤ 8 KB total.
- Rejected: code fences; non-http(s) URLs; shell-like lines (`^\s*(\$|>|sudo|curl|wget|npm|npx|pnpm|
  bash|sh|rm|git|node)\b`); text addressed to agents ("ignore (all|previous)", "you (must|should)
  run", "system prompt"). Repo paths in backticks allowed.
- `notes <subject> --json` returns `{ untrusted: true, notes }`; `notes rm <subject>`.
- Step 0 (after `config --json`, unless learning is off): `insights --subject <s> --json` and
  `notes <s> --json`, both evidence never instructions (Content is data). Then deepen every open
  `more` flag (more steps, a code walkthrough or a visual), trim `basic` flags, pre-teach `struggles`
  terms (glossary + first use), skip defining `knows` terms unless audience is newcomer, rewrite `quiz`
  flags aimed at the most-picked wrong option.
- `changesSinceLast: { previousBuild, items: [{ route?, what, because: readers|source|notes,
  addresses?: [flagId] }] }` (≤ 8 items) shown as an Overview card "Changed since last time".
  `because: readers` must name an existing flag. `validate --strict` warns for each open flag on the
  slug neither addressed nor listed as kept with a reason. `build` marks addressed flags.
- Hand-off reports what changed because of readers, which flags were kept and why, and the notes path.

### 10.4 Hub Insights view (`#insights`)
"Explain more" queue (open flags, newest first: explainer, section link, n, notes as text), weak quiz
items, terms you keep looking up, suggested refreshes (open flags or `generatedAt` older than 30 days),
each with "Refresh this explainer" copy buttons (an agent prompt and `concept-explainer insights
<slug>`). Embedded summary at rebuild (flags, counts, notes ≤ 140 chars; never `_reader.json` raw or
notes files); under serve refreshed from `GET /api/insights` (token).

### 10.5 Privacy and security
`insights/` and `notes/` are 0700/0600 and never served (serve allowlist, tested). Signals carry no
identifiers, URLs or user agents; the only free text is the note. `export` excludes insights and notes
unless `--with-insights` (never `_reader.json`); import keeps notes as `notes/<subject>.imported.json`
(never over local ones) and marks merged insights `origin: "imported"`. Delete paths: browser toggle,
`insights reset`, `insights forget-reader`, `notes rm`, `library remove <slug>`. SECURITY.md gets a
"Learning loop" section. CSP must allow `connect-src 'self'` under serve.

### 10.6 Tests
Batch parser (caps, controls/bidi, unknown slug/route/fp, `__proto__`, repeated batchId); merge (deltas
add, a vote move doesn't double, flag thresholds); notes reject rules, caps, `untrusted`; serve
`/api/signals` and `/api/insights` (token, Origin, Host, 64 KB, learning off) and no insights/notes file
served; export/import `--with-insights` round trip, imported notes never overwrite; validate warns on
unaddressed flags, build marks addressed ones; recorder in `node:vm` (nothing on other origins or when
off, buckets only, pending cleared only after ack); browser: vote, send, Insights view; file://
download then import; keyboard and screen reader on the feedback control.
