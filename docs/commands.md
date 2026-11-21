# Commands

The CLI needs Node 18.3 or newer and has no dependencies. Run it with `npx`, or as `concept-explainer` after [installing the skill](../README.md#quick-start).

[Back to the README](../README.md)

## A typical run

```sh
npx github:Cyvid7-Darus10/concept-explainer estimate ./my-repo
npx github:Cyvid7-Darus10/concept-explainer init ./my-repo
npx github:Cyvid7-Darus10/concept-explainer init https://github.com/o/r/pull/7 --type pr --out pr.json
npx github:Cyvid7-Darus10/concept-explainer diff ./my-repo --base main --data pr.json --write
npx github:Cyvid7-Darus10/concept-explainer build pr.json --repo ./my-repo --strict --open
```

The output is one HTML file you can commit, attach to a PR or host anywhere, plus a copy in your [library](library.md).

## All commands

| Command | What it does |
|---|---|
| `estimate [input] [--type t]` | Time and cost per model before you start (`--base`, `--source`, `--json`). See [cost](cost.md) |
| `scan <repo>` | Stack, entry points, route handlers with `file:line`, data files, env var names (never values), scripts, a suggested preset |
| `init <repo> [--preset id]` | A starter repo explainer with `TODO`s to fill |
| `init [input] --type <type>` | A starter for pr, change, proposal, migration, incident or concept |
| `diff <repo> --base <ref>` | Draft `diff[]` and node statuses from git; summaries stay TODO |
| `snippet <repo> <path:start-end>` | Exact lines for a code walkthrough, as JSON |
| `changes <repo> [--data f --write]` | Draft change entries from git: human or agent, type, PR link, parts touched |
| `validate <file> [--repo dir] [--strict]` | Check references, shapes, lesson limits, writing style, and that cited files exist |
| `build <file> [--out f] [--repo dir] [--style s]` | Validate, render the page, file it in the library (`--no-library` skips that) |
| `library [list\|path\|add\|remove\|rebuild\|open\|style\|serve]` | Work with the [library](library.md) |
| `export [slug...] [--type t] [--tag t] [--out f]` | Share explainers as a data-only bundle |
| `import <file> [--dry-run] [--on-conflict mode]` | Add a bundle to your library |
| `config [get\|set\|reset] [--json]` | The explainer defaults the skill reads first |
| `install [--force] [--launcher] [--pwa]` | Link the skill and the library rule into `~/.claude`; `--launcher` adds the [app launcher](library.md#an-app-on-your-dock) |
| `uninstall --launcher` | Remove the app launcher |
| `presets` | One preset per type, and stack presets for repos |
| `patterns [id]` | Reusable flow shapes: auth, webhook, async job, cache, and more |
| `gallery` | The kit page |
| `assets` | Logo and icon SVGs |

## What `install` does

`install` links the skill into `~/.claude/skills/concept-explainer` and writes [`rules/concept-explainer.md`](../rules/concept-explainer.md) to `~/.claude/rules/` (both under `$CLAUDE_CONFIG_DIR` when set), so every session builds explainers the same way and files them in your library.

It is safe to run again. It never replaces a real folder or a rule you edited unless you pass `--force`, which keeps a backup in `~/.claude/backups/`.

## The data

Agents only write data: one `explainer.json` per explainer, checked on every build. The contract is in [`references/data-schema.md`](../references/data-schema.md), with one section per type in [`references/types.md`](../references/types.md).
