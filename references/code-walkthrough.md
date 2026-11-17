# Code walkthrough (`walkthroughs[]`, chapter `code`)

A walkthrough takes one real snippet and explains its important lines in reading order, one step at a time. It is **optional for every type**: no type requires it, and leaving it out is never an error or a warning. The checks live in `scripts/lib/validate-code.mjs`, the snippet reader in `scripts/lib/snippet.mjs`, the page in `template/js/chapters/code.js`.

## When to add one

Add a walkthrough only when a few lines of code carry the root of the idea: the mechanism or the invariant from your root card (`references/explaining.md`, section 1) lives in 5 to 40 lines a reader should see. Typical: the handler that enforces a rule, the query that makes paging stable, the function that signs a token. Do not walk through boilerplate, config or a whole file.

| `codeWalkthrough` in config | What the skill does |
|---|---|
| `auto` (default) | Adds one when code carries the root, or when the user asks |
| `always` | Adds at least one when the type cites code (repo, pr, change, migration) |
| `never` | Skips the chapter |

A reader's "Explain more" signal on a flow step, a concept or a map node that has code is also a reason to add one (planned separately; nothing in the data depends on it). Point the walkthrough's step `refs` back at the flagged item so the page links both ways.

Aim for **2 to 5 walkthroughs** per explainer (more warns), each **5 to 40 lines** (outside warns; over 80 is an error), with **2 to 12 steps**.

## Shape

```json
{
  "id": "keyset-query",
  "title": "The keyset query",
  "file": "packages/core/src/tasks/service.ts:50-68",
  "lang": "ts",
  "why": "This query is why pages no longer repeat or skip tasks.",
  "code": "<exact lines 50 to 68, from concept-explainer snippet>",
  "steps": [
    { "lines": "55-60", "note": "Asks only for tasks strictly after the bookmark.", "why": "Rows added above it cannot shift what comes after.", "kind": "what",
      "refs": { "glossary": "Keyset query", "flow": "next-page-after", "step": 4 } }
  ],
  "takeaway": "Paging by position, not by count, keeps the list stable while it changes."
}
```

| Field | Notes |
|---|---|
| `id` | Unique. Used in `#code/<id>`. |
| `title`, `why`, `takeaway` | Required. `why` and `takeaway` are one sentence each. |
| `file` | `path:start-end`, file line numbers from 1, inclusive. Relative to the repo; no `..`. |
| `lang` | Optional; `snippet` detects it from the extension. |
| `code` | The exact lines `start..end`, joined by `\n`. Paste it from `concept-explainer snippet`; never retype it. |
| `steps[].lines` | `"N"` or `"N-M"` in **file line numbers** (what the gutter shows), inside the snippet's range. Reading order, no overlaps. |
| `steps[].note` | At most 2 sentences, plain words: what these lines do. |
| `steps[].why` | Optional. The choice, the constraint and the cost of the alternative, from a source. |
| `steps[].kind` | Optional: `what`, `why`, `gotcha`, `input`, `output`. |
| `steps[].refs` | Optional: `node` (id), `flow` (id) with `step` (from 1), `concept` (index from 0), `glossary` (term). Each must exist. |
| `illustrative` | `true` for pseudo-code with no `file` (lines count from 1). Shown as "Illustrative, not from a repo". Meant for `concept`; types that cite code get a warning. |

Steps cover the important lines, not every line. Group boilerplate into one step or leave it unannotated.

## Truth rules

- **Never retype code.** Run `concept-explainer snippet <repo> <path:start-end> [--lang x]`. It prints `{ file, path, start, end, lang, code }` as JSON.
- **`--repo` checks it.** `validate --repo` and `build --repo` re-read each cited file. `code` must equal the lines (trailing spaces, CRLF and a final newline aside). A mismatch warns, so `--strict` fails; a range past the end of the file is an error.
- **No secrets, ever.** `snippet` refuses `.env*` (except `.env.example`, `.env.sample`, `.env.template`), keys and certificates (`*.pem`, `*.key`, `*.p12`, `id_rsa*`, `.npmrc`, `.netrc`, `credentials*.json`) and any range with a line that looks like a credential (private key blocks, AWS, GitHub, Slack, Stripe and `sk-` keys, `password|secret|token|api_key = "<8+ chars>"`, URLs with a password). The validator applies the same line checks to every `code`, with or without `--repo`.
- **No hidden characters.** `snippet` refuses lines with control characters (tab is fine), bidi overrides or zero-width marks, and paths that leave the repo, symlinks included.

## On the page

- A picker when there are several walkthroughs, then the title, `why`, the file citation and the language.
- The code with its file line numbers. The current step's lines are marked (an orange bar and a faint wash in Clean, the select blue in Playful); the rest dims. A line number that a step covers jumps to that step. Long lines wrap.
- The step card: step count, kind, the line range, `note`, `why`, and links from `refs`. Back and Continue (or the arrow keys, `j` and `k`), then the takeaway.
- Deep links: `#code/<id>`, `#code/<id>/<n>` with **steps counted from 1** (like `#flows/<id>/<n>`), and `#code/<id>/done` for the takeaway.
- A flow step with `code`, or a concept with `file`, links "Walk through this code" when a walkthrough covers that file and line.
