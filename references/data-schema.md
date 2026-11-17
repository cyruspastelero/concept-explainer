# Data schema (`explainer.json`)

One JSON file drives the whole page. The enforced contract is `scripts/lib/schema.mjs` and the `scripts/lib/validate*.mjs` modules; this page explains it. Complete examples live in `examples/`: `taskflow` (repo), `pr-cursor-paging` (pr), `proposal-live-updates` (proposal) and `concept-idempotency-keys` (concept).

**Schema v2** adds `meta.type` and the chapters for PRs, changes, proposals, migrations, incidents and concepts. Set `"schemaVersion": 2` at the top. A file without `meta.type` (every v1 file) is read as a `repo` and keeps its old rules. Types are described in `references/types.md`; the visual kinds in `references/visuals.md`.

Every string is rendered as **plain text**: markup is rejected, and newlines only matter inside `code`.

## `meta` (required)

| Field | Type | Notes |
|---|---|---|
| `type` | string, **required from v2** | `repo`, `pr`, `change`, `proposal`, `migration`, `incident` or `concept`. Sets the required objects. |
| `title` | string, **required** | `"<Thing>, explained"` reads well. |
| `summary` | string, **required** | Two plain sentences: what it does and for whom. |
| `repo` | string | `owner/name`. |
| `stack` | string[] | ≤ 8 chips, e.g. `"Next.js 15"`. |
| `preset` | string | The preset id you used. |
| `source` | object | `{ kind, ref, url? }`. `kind` is `repo`, `pr`, `commit`, `doc`, `issue`, `url` or `notes`. `url` must be http or https. |
| `status` | string | `draft`, `proposed`, `accepted`, `rejected`, `in-progress`, `merged` or `done`. For pr, proposal and migration. |
| `tags` | string[] | Up to 8 free text tags. The library filters by them. |
| `chapters` | string[] | The order of chapters, from `map, flows, changes, tree, data, concepts, quiz, glossary, run, context, diff, options, risks, rollout, timeline, visuals, code`. Chapters with no data are skipped automatically. Each chapter may appear once. |
| `generatedAt` | ISO date | Shown in the footer. |
| `commit` | string | The SHA the explainer describes. |

`intros` (optional) overrides a chapter's heading or lead: `{ "flows": { "title": "…", "lead": "…" } }`.

## `layers` (required for repo, 1 to 8)

Other types may leave out the map. A map that is there needs layers and nodes.


`{ id, label, color }`. Layers become the map's columns, from left to right in array order, so order them by distance from the user. `color` is one of `green, blue, navy, midnight, yellow, pink`.

## `nodes` (required)

`{ id, label, layer, kind, tech?, summary, files[] }`

- `kind` is one of `user, ui, mobile, api, service, db, queue, cache, external, job, cli, auth, storage, library`, and picks the icon (see the gallery).
- `files` holds paths or folders that exist (`--repo` checks this). Folders end in `/`.
- Keep `label` to 3 words or fewer and `summary` to one sentence.
- `status` (optional, v2): `added`, `changed`, `removed` or `unchanged`. Shows what a pr, change, proposal or migration moves. `concept-explainer diff` fills it for pr and change.
- `files` is asked for only in types that cite code (repo, pr, change, migration).

## `edges`

`{ from, to, label?, kind? }`. `kind`: `sync` (default, solid), `async` (dashed) or `data`. Selecting a node animates only its own edges, so a dense graph stays readable.

## `flows`: the core chapter

`{ id, title, trigger, summary, steps[] }`, with 4–12 steps and at most 7 distinct actors.

Each step is `{ from, to, label, kind, detail?, why?, file, code?, lang? }`:

| Field | Notes |
|---|---|
| `from`, `to` | Node ids. When they are the same, the step is drawn as a self-loop (internal work). |
| `kind` | `request`, `response` (dashed), `async` (dashed), `data` or `internal`. |
| `label` | ≤ 6 words, an action: "Checks the session". |
| `detail` | ≤ 2 sentences: what happens. |
| `why` | Optional. The design reason, shown under "Why it works this way". Use it sparingly, where a reader would ask "why like this?" |
| `file` | `path:line`. Required in practice: it is a warning without it, and an error under `--strict`. |
| `code` | Optional. ≤ 8 lines of the real code at that line, trimmed. |

A flow may set `variant: "before"` or `"after"` with a shared `pair` id. The two flows of a pair show side by side. A flow with `variant` needs `pair`.

## `changes`: what changed and why

`{ id, title, date, author, authorType, ref, url?, kind, what, why, risk?, nodes[], files[] }`

- Draft these with `concept-explainer changes`. It fills `authorType` (`agent` / `human`, detected from author names and `Co-Authored-By` trailers), `kind` (from conventional-commit prefixes), `files`, and `nodes` (mapped through each node's `files`).
- **You** fill in `why` from the PR description, linked issue or commit body. If there is none, write "No reason recorded".
- `risk` is optional: what could break, or what to watch.

## `tree`

`{ path, note, key? }`. Indentation comes from path depth. Mark the 2–4 folders where most changes happen with `key: true`.

## `dataModel`

`{ name, summary?, fields: [{ name, type, note?, ref? }], relations: [{ to, kind }] }`, where `to` is another model's `name`.

- The chapter draws an ER diagram from `relations`. Use `kind` values `has many`, `has one`, `belongs to` or `many to many`, so the lines get 1 / N cardinality. List each pair once; the mirror relation is merged.
- `id` is marked PK. A field is marked FK when it is named `<model>Id` or `<model>_id`, or when you set `ref` to the model name (e.g. `assigneeId` with `ref: "User"`). Ids of outside systems, like `stripeCustomerId`, are not FKs.

## `concepts` (3 to 6)

`{ title, body, analogy?, parts?, visual?, url?, file?, code?, lang? }`. One idea each.

- `parts` (v2): 2 to 6 `{ label, detail? }`, each load bearing, named by what it does. The reader clicks through them.
- `visual` (v2): one visual of the nine kinds, `{ kind, ...shape }` (see `references/visuals.md`).
- `analogy` (v2): two sentences, the mapping and where it breaks. `validate` warns on one sentence.

## `quiz` (3–5)

`{ question, options[], answer, explain }`, where `answer` is the zero-based index. Ask "where would you change X?" or "why does Y happen?".

## `glossary`, `runbook`

- `glossary`: `{ term, definition }`.
- `runbook`: `{ label, command, note? }`. Commands get a Copy button.

In v2 files, each quiz `explain` has two sentences: why the answer is right, and why the most tempting wrong option is wrong.

## v2 chapter objects

All optional; the type decides which are required (`references/types.md`).

### `context`

`{ problem, goals[], nonGoals[], background? }`. `problem` is required and comes first on the page: "Without X, Y breaks because Z." Up to 5 goals and 5 non goals.

### `diff`

`[{ path, status, summary, from?, nodes[]?, lines?, key? }]`, up to 40 files.

| Field | Notes |
|---|---|
| `status` | `added`, `modified`, `removed` or `renamed`. |
| `summary` | What changed in this file and why, from the code and the PR. |
| `from` | The old path of a renamed file. |
| `nodes` | Node ids this file belongs to. |
| `lines` | `"+12 -3"`. |
| `key` | `true` on the 2 to 4 files a reviewer must read. |

`concept-explainer diff <repo> --base <ref>` drafts all of it except `summary` and `key`. With `--repo`, every file that was not removed must exist.

### `options`

`[{ title, summary, pros[], cons[], chosen?, why?, url? }]`, 2 to 5 options, up to 5 pros and 5 cons each. When `meta.status` is `accepted`, `done` or `merged`, exactly one option is `chosen: true`. When it is `draft` or `proposed`, none is. `why` on the chosen option names the constraint and the cost of the alternatives.

### `risks`

`[{ risk, impact, mitigation, owner? }]`, up to 8. `impact` is `low`, `medium` or `high`.

### `rollout`

`[{ label, detail?, done?, command? }]`, up to 12 ordered steps. `done` is true or false; never true for something not done.

### `timeline`

`[{ at, label, detail?, kind? }]`, up to 20 events. `at` is the time from the record, as written there. `kind` is `detect`, `act`, `fix` or `learn`.

### `walkthroughs` (optional, every type)

`[{ id, title, file, lang?, why, code, steps[], takeaway, illustrative? }]`, chapter key `code`. One real snippet (5 to 40 lines) with its important lines annotated in reading order: `steps[]` are `{ lines: "N" | "N-M" (file line numbers), note, why?, kind?, refs? }`. Paste `code` from `concept-explainer snippet <repo> <path:start-end>`; `--repo` checks it equals the file. Never required. Full rules: `references/code-walkthrough.md`.

### `diagrams`

`[{ id, kind, title, caption, ...shape }]`, up to 8. The nine kinds and their shapes are in `references/visuals.md`. `caption` states the takeaway as a sentence; `validate` warns on a label.

## Links

Every field named `url`, anywhere in the file, must start with `http://` or `https://`. The page drops anything else.

## Deep links

| Hash | Opens |
|---|---|
| `#overview` | Overview |
| `#<chapter>` | That chapter |
| `#map/<nodeId>`, `#flows/<flowId>/<n>`, `#changes/<id>`, `#data/<entity>`, `#concepts/<i>`, `#glossary/<term>`, `#tree/<path>` | That item (v1 chapters) |
| `#context`, `#diff/<path>`, `#options/<i>`, `#risks/<i>`, `#rollout/<i>`, `#timeline/<i>` | That item (v2 chapters, indexes from 0) |
| `#visuals/<diagramId>/<part>` | That diagram, and a part from 0 |
| `#code/<id>`, `#code/<id>/<n>`, `#code/<id>/done` | A code walkthrough, a step from 1, or its takeaway |
| `#quiz/<n>`, `#quiz/done` | One quiz question, from 1, or the result |

Each id is one segment, encoded with `encodeURIComponent`.
