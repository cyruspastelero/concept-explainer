# Explainer types

Every explainer uses the same format. `meta.type` says what it explains, and the type sets the default chapters, the objects the validator requires, and the truth rules. A file without `meta.type` (every schema v1 file) is a `repo`.

The rules live in `scripts/lib/schema.mjs` (`TYPE_RULES`) and the starters in `presets/types/<type>.json`. Keep this page in sync with both.

| Type | Explains | Start with | Default chapters | Required | Cites code |
|---|---|---|---|---|---|
| `repo` | A whole codebase | `ce scan`, `ce init <repo>` | map, flows, changes, tree, data, concepts, quiz, glossary, run | `nodes` (flows expected) | yes |
| `pr` | One PR or MR | `ce init <url> --type pr`, `ce diff` | context, diff, map, flows, risks, rollout, quiz | `context`, `diff` | yes |
| `change` | One commit or a short range | `ce init <sha> --type change`, `ce diff` | context, diff, flows, risks, quiz | `context`, `diff` | yes |
| `proposal` | An RFC, design doc or idea not built yet | `ce init <doc> --type proposal` | context, options, map, flows, risks, rollout, quiz | `context`, `options` | no |
| `migration` | An upgrade, re-platform or library swap | `ce init <doc> --type migration` | context, options, map, flows, rollout, risks, quiz | `context`, `options` | yes |
| `incident` | A post-mortem | `ce init <notes> --type incident` | context, timeline, flows, risks, rollout, quiz | `context`, `timeline` | no |
| `concept` | An idea not tied to one repo | `ce init <url> --type concept` | concepts, map, flows, glossary, quiz | `concepts` | no |

Every type may add the optional `code` chapter (`walkthroughs[]`, `references/code-walkthrough.md`): never required, added only when a few lines of code carry the root of the idea, as `optionalChapters` in each preset says. Add `visuals` to `meta.chapters` when you use `diagrams[]`, and `code` when you use `walkthroughs[]`. "Cites code" decides whether `--repo` checks files and whether nodes and steps are asked for file citations.

## repo

- **Must cover:** the main request end to end, the data model, recent changes and why, where to change common things.
- **Truth:** every node lists `files`, every step cites `path:line`, and `--repo` passes.
- **Visuals:** the map and flows carry most of it. Use `layers` for a stack, `state` for an entity with a lifecycle.

## pr and change

- **Must cover:** why the change exists (from the PR description or commit), the 2 to 4 files a reviewer must read (`key: true`), which parts move (node `status`), how a request flows after, what could break and how it rolls out (pr).
- **Truth:** `ce diff` drafts the files, line counts and node statuses from git. Every `summary` comes from the code and the PR text. A `pr` can show the old and new path as a flow pair (`variant: "before"` and `"after"`, same `pair`).
- **Audience:** most readers are experts. Skip basics.

## proposal

- **Must cover:** the problem and goals in the author's words, every option weighed with pros and cons, the chosen one only if decided, what the system looks like after, risks and rollout.
- **Truth:** never present proposed parts as built. New parts get `status: "added"`. `meta.status` is honest: `draft` or `proposed` means no option is `chosen`; `accepted`, `done` or `merged` means exactly one is. Rollout steps stay `done: false`.
- **Visuals:** `compare` for options against criteria, `quadrant` for effort against impact, `beforeAfter` for what moves.

## migration

- **Must cover:** why move and why now, the options and the choice, before and after (flow pair or `beforeAfter`), the steps to get there and how to go back, risks during the move.
- **Truth:** cite the current code; mark target parts `added` or `changed` until they exist.

## incident

- **Must cover:** the timeline from the record, how the failure flowed through the system, every contributing cause, follow ups with owners (`risks[].owner`, `rollout`).
- **Truth:** times come from the record only (alerts, logs, the incident doc). List every contributing cause; "five whys" tends to find one of many.
- **Visuals:** `timeline` (with `kind`: detect, act, fix, learn) and a `state` diagram of the system's modes during the outage.

## concept

- **Must cover:** the idea in one sentence, the 2 to 6 parts it breaks into, a picture for each big idea, where it is used and where it is not, sources by URL.
- **Truth:** cite sources in `meta.source` (`kind: "url"`) or on a concept. Say where a claim is contested.
- **Visuals:** mostly `concepts[].parts` and `concepts[].visual`, plus `diagrams[]`. A small map and one flow make the mechanism concrete.

## Statuses

`meta.status`: `draft`, `proposed`, `accepted`, `rejected`, `in-progress`, `merged`, `done`. Used by pr, proposal and migration, and shown on the hub card.

Node `status`: `added`, `changed`, `removed`, `unchanged`. Drawn as a small marker with a legend, never a fill.
