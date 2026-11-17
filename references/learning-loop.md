# The learning loop

Each run learns from readers and from the last run: what readers needed explained more, what was too basic, which quiz items tripped them, which terms they keep looking up, and what the last agent noted about the code. Everything stays on this machine, in the private library home. No identifiers, no network beyond `127.0.0.1`, and every number keeps its n.

Code: `scripts/lib/sections.mjs` (keys), `signals.mjs` (batches), `insights.mjs` (memory, flags, reader profile, summary), `notes.mjs` (agent notes), `validate-v2.mjs` (`changesSinceLast`), `serve.mjs` (`/api/signals`, `/api/insights`), `cli/learning-commands.mjs`. The page side (recorder, feedback control, Overview card, hub Insights view, the Settings toggle) belongs to the template.

Config `learning` (default `true`): off means `/api/signals` answers 403 "learning is off", nothing new is recorded, the hub shows no insights, and the skill neither reads nor writes notes.

## Section keys

A section is something a reader can react to. Its key is the page's own deep-link route: `location.hash` without `#`, each id one `encodeURIComponent` segment.

| Key | What |
|---|---|
| `map`, `flows`, `changes`, `tree`, `data`, `concepts`, `quiz`, `glossary`, `run`, `context`, `diff`, `options`, `risks`, `rollout`, `timeline`, `visuals`, `code` | A chapter view, when it has data |
| `flows/<flowId>` | One flow |
| `concepts/<i>` | One concept, from 0 |
| `visuals/<diagramId>` | One diagram |
| `diff/<path>` | One diff file (`src%2Fa.ts`) |
| `code/<walkthroughId>` | One code walkthrough |
| `quiz/<n>` | One quiz question, from 1 (as `#quiz/<n>`) |

Each key has a **fingerprint**: the first 8 hex of sha256 of the item's own text (title or label plus body; for a chapter, its data). A rewritten or reordered item gets a new fingerprint, so it never inherits old feedback.

### What every page carries

`build` puts these in the page's `#explainer-context`, standalone pages too:

```json
{ "sections": { "map": "1a2b3c4d", "concepts/1": "9f8e7d6c", "quiz/2": "0badf00d" }, "build": "<64 hex sha256 of the data>", "key": "acme-taskflow" }
```

`key` names the explainer in signals: its library slug, else `"<meta.repo>|<meta.title>"`. Library pages also carry `slug`.

## Reader signals (pages)

Recorded only on `file://` and `http://127.0.0.1:<port>`, never on hosted copies, and only while Settings > Reading > "Help improve future explainers" is on (`localStorage` `concept-explainer:learning`, default on). Kept in `concept-explainer:signals:<key>` (32 KB cap, oldest counters dropped) as pending deltas plus a random `batchId`.

### Batch

```json
{
  "format": "concept-explainer-signals",
  "version": 1,
  "batchId": "<16 to 64 hex, random per batch>",
  "date": "2026-11-18",
  "explainers": [{
    "key": "acme-taskflow",
    "slug": "acme-taskflow",
    "build": "<64 hex>",
    "sections": {
      "concepts/1": { "fp": "9f8e7d6c", "vote": { "from": null, "to": "more" }, "note": "Show the queue.", "views": 1, "finished": 1, "time": "2-10m" }
    },
    "quiz": { "2": { "fp": "0badf00d", "answers": 1, "firstWrong": 1, "misses": 2, "wrong": [0, 2] } },
    "lookups": { "glossary": { "Cursor": 2 }, "hints": { "Why a queue?": 1 } }
  }]
}
```

| Field | Rule |
|---|---|
| `vote` | `from` and `to` are `clear`, `more`, `basic` or `null`. A changed vote sends `from` (the old vote) and `to`, so it is counted once. |
| `note` | Only with a vote of `more` or `basic`. One line, up to 140 characters, no control, bidi or zero-width characters. The only free text. |
| `views`, `finished` | Whole numbers to add (deltas). |
| `time` | The largest bucket of the visits in this batch: `<30s`, `30s-2m`, `2-10m`, `>10m`. |
| `quiz` | Keyed by the question's number from 1. `answers`, `firstWrong` (at most `answers`), `misses` (0 to 9), `wrong` (option indexes picked, up to 9). |
| `lookups` | `glossary` terms opened and `"?"` hint labels opened, with counts. Terms must be in the page's glossary and labels must be text in the page, or they are dropped. |

At most 64 KB, 50 explainers, 500 sections and 50 quiz items each. Unknown fields are refused (no URLs, user agents or ids get in). Prototype keys are dropped. An unknown explainer, route or stale fingerprint is dropped and counted, not an error. A note that fails the shared text rules (`scripts/lib/untrusted-text.mjs`: over 140 characters, more than one line, hidden characters, text addressed to an agent, a command line, a non-http(s) link, markup, a code fence or backticks around anything but a path) is dropped and counted in `dropped.notes`; its vote still counts. The same rules filter imported insights, and run again on every note `insights --json`, the hub summary and `notes --json` hand out, so a file edited behind our back still gives nothing that fails them.

### Sending

- **Under serve:** `POST /api/signals` with `X-Concept-Explainer-Token` (per-run or device token), `Content-Type: application/json`, the batch as the body. Send on page hide (`fetch` with `keepalive`) and from Settings "Send now". `200 { ok, duplicate, merged: [slug], dropped: { explainers, sections, quiz, lookups, notes } }`: clear the pending deltas only now. A repeated `batchId` answers `duplicate: true` and changes nothing (the last 500 are kept). `400 { error: "signals: ..." }` bad batch, `403` token, origin or "learning is off", `413` over 64 KB, `415` not JSON, `503 { error: "library is busy" }` when another writer holds the library for more than 2 seconds: keep the deltas and send again later.
- **From file://:** Settings > Reading > "Send feedback to the library" shows exactly what goes, offers "Download feedback file" (`<key>.signals.json`, the same batch), and the command to copy: `concept-explainer insights import <file>`. Same checks and dedupe.

## Library memory

`<home>/insights/` (0700, files 0600, never served):

- `<slug>.json`: `subject` (`meta.repo`, else `meta.source.ref`, else the first tag), per section `{ fp, votes: { clear, more, basic }, notes: [{ date, vote, text }] (20 newest), views, finished, time: { bucket: n } }`, per quiz item `{ fp, answers, firstWrong, misses, wrong: { index: n } }`, `lookups`, `batches` (the last 50 `{ id, date }`), `flags`, and `origin: "imported"` when it came from a bundle.
- `_reader.json`: the reader profile (below). `_batches.json`: the last 500 batch ids.

A batch for a section whose fingerprint changed starts that section fresh.

### Flags

`{ id: "f-<12 hex>", route, fp, kind, evidence, state, addressedIn?, reason? }`. The id is a hash of slug, route, fingerprint and kind, so it is stable until the item changes.

| Kind | Raised when | Evidence |
|---|---|---|
| `more` | At least one "Explain more" vote (n = 1) | `{ n, notes }` (3 newest notes for that vote) |
| `basic` | At least one "Too basic" vote | `{ n, notes }` |
| `quiz` | At least 3 answers and half or more wrong on the first try | `{ n, firstWrong, mostPicked }` |
| `term` | The term is one of the reader's `struggles` and is in this glossary; route `glossary/<term>` | `{ n, explainers }` |

`state` is `open`, `addressed` (by a build, with `addressedIn` = its build hash) or `kept` (with the `reason` the build gave). An open flag whose evidence goes away (a vote moved back) disappears; addressed and kept flags stay as history.

### Reader profile

- `struggles`: terms looked up at least 3 times across at least 2 explainers, `{ term, n, explainers }`.
- `knows`: terms in the glossary of at least 3 explainers the reader viewed, and never opened.
- `depthHint`: with at least 6 "Explain more" and "Too basic" votes and a 2 to 1 lean, `{ suggest: "deep" | "overview", n, command }`. A suggestion only: it never edits config; it shows the `config set depth <x>` command to copy.

## Agent notes

What one run leaves for the next about one subject, in `<home>/notes/<subject>.json` and `<subject>.md` (0600; the file name is the subject slugified). The subject is one token: a repo `owner/name`, a source ref or a tag (letters, digits and `. / @ + - _`, up to 120). `readerFlags` items have exactly `flagId` and `response`; any other field is refused, and saved items are rebuilt from those two fields.

```json
{
  "subject": "acme/taskflow",
  "conventions": ["Routes are thin; rules live in `packages/core/src/tasks/service.ts`."],
  "whereThingsLive": ["Email jobs: `apps/worker/src/jobs/send-email.ts`."],
  "hardToFind": ["The plan limit check is in billing, not tasks."],
  "openQuestions": ["Why does the worker retry 3 times? See https://github.com/acme/taskflow/issues/12"],
  "readerFlags": [{ "flagId": "f-0123456789ab", "response": "Added a step on the cursor format." }],
  "changed": ["Split the create-task flow in two."]
}
```

Fixed sections only, up to 12 items each, each item one line of up to 200 characters, 8 KB in total. Because the next agent reads these, an item is **refused** when it has:

- a code fence (` ``` ` or `~~~`), markup, or a control, bidi or zero-width character;
- a link that is not http or https (`javascript:`, `file:`, `data:`, `ssh:`, `mailto:`, editor links);
- a line that looks like a command: starting with `$`, `>` or `#` prompts, or with `sudo`, `curl`, `wget`, `npm`, `npx`, `pnpm`, `yarn`, `bun`, `bash`, `sh`, `zsh`, `rm`, `git`, `node`, `python`, `pip`, `docker`, `powershell`, `pwsh`, `cmd`, `chmod`, `chown`, `eval` or `exec`;
- text addressed to an agent: "ignore / disregard / forget all / previous / the above", "you must / should / need to run", "system prompt", "new instructions", or a line starting `system:`, `assistant:`, `developer:` or `user:`;
- backticks around anything but a single repo path (`` `src/app.ts` ``), or unbalanced backticks.

`notes <subject> --json` returns `{ untrusted: true, note, notes, imported }`. Notes from a bundle are kept as `<subject>.imported.json`, never over local ones.

## changesSinceLast

In the explainer data, shown as an Overview card "Changed since last time":

```json
{
  "changesSinceLast": {
    "previousBuild": "<64 hex build hash of the last run>",
    "items": [{ "route": "concepts/1", "what": "Added a worked case for the queue.", "because": "readers", "addresses": ["f-0123456789ab"] }],
    "kept": [{ "flagId": "f-ba9876543210", "reason": "Most readers here are new to queues." }]
  }
}
```

Up to 8 items. `route`, when given, is a section of this explainer. `because` is `readers`, `source` or `notes`; `readers` must name the flags it addresses, and each must be a flag on this explainer. `validate` and `build` read the explainer's flags from the library: **each open flag neither addressed nor kept with a reason is a warning**, so `--strict` fails. After a build, addressed flags become `addressed` (with the build hash) and kept ones `kept` (with the reason).

## Hub summary

The hub embeds this at every rebuild (`insights` in its data; `null` when learning is off), and `GET /api/insights` (token) returns the same as `{ insights }`:

```json
{
  "updatedAt": "…",
  "explainMore": [{ "slug", "title", "flagId", "route", "href": "explainers/<slug>/index.html#<route>", "n", "notes": ["≤ 140 chars"], "updatedAt" }],
  "weakQuiz": [{ "slug", "title", "flagId", "route", "href", "n", "firstWrong", "mostPicked" }],
  "terms": [{ "term", "n", "explainers" }],
  "refreshes": [{ "slug", "title", "reasons": ["open flags", "older than 30 days"], "openFlags", "command": "concept-explainer insights <slug>", "prompt": "Refresh the … explainer …" }]
}
```

Never the raw reader profile, `knows`, the depth hint or notes files. Notes in it are reader notes, as text.

## Commands

| Command | What it does |
|---|---|
| `insights [slug] [--subject s] [--json]` | Open flags with their n and reader notes, decided flags, terms you keep looking up. `--json` for the skill: `{ untrusted: true, explainers: [{ slug, title, subject, flags, quiz, lookups }], reader }`. |
| `insights import <file>` | Merge a downloaded `.signals.json` (same checks as the API). |
| `insights reset [slug\|--all]` | Delete one explainer's insights, or all of them. |
| `insights forget-reader` | Delete the reader profile and every lookup that fed it. |
| `notes <subject> [--json]` | Show the notes (Markdown), or `{ untrusted: true, notes, imported }`. |
| `notes write <subject> --data notes.json` | Check and save this run's notes. |
| `notes rm <subject>` | Delete a subject's notes, local and imported. |
| `export --with-insights` | Add each exported explainer's insights (counts and notes, never flags or the profile) and the local notes for its subject. Import rebuilds them field by field and recomputes flags. |
| `config set learning on\|off` | The switch above. |

`library remove <slug>` deletes that explainer's insights too.
