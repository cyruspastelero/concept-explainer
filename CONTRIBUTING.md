# Contributing

Thanks for helping. This project has two audiences, people and agents, and one rule that keeps them happy: **explainers change data, maintainers change the template.**

## Setup

```sh
git clone https://github.com/cyruspastelero/concept-explainer
cd concept-explainer
npm run check        # tests, validate and rebuild every example, rebuild the kit (never touches your library)
```

No dependencies to install. Node 18.3 or newer.

## Where things live

| Path | What |
|---|---|
| `SKILL.md` | Instructions agents follow. Keep it short and imperative. |
| `bin/concept-explainer.mjs` | The CLI entry. `bin/repo-explainer.mjs` is the old name, kept as an alias. |
| `scripts/lib/cli/` | The CLI commands, split by area. |
| `scripts/lib/` | Scan, validate (`validate*.mjs`), build, changes, diff, estimate, the library (`library.mjs`, `library-model.mjs`, `search-index.mjs`), config, serve, styles and `install`. Plain ES modules. |
| `template/` | The pages: `explainer.html`, the library hub `library.html`, the stylesheets in `styles/`, and `js/` modules (concatenated at build time). |
| `rules/` | The rule `concept-explainer install` copies into `~/.claude/rules/`. |
| `presets/`, `patterns/` | Stack presets for repos, one preset per type in `presets/types/`, and reusable flow shapes (JSON). |
| `references/` | Schema, playbook, design system, UX principles. |
| `test/` | `node:test` suites, including brand guardrails. |

## Pull requests

- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- One logical change per PR. In the description, explain **why**.
- Add or update tests for behaviour changes.
- **Visual changes:** include a before/after screenshot, and check that it still feels right at 375px wide with reduced motion on.
- **Design-system changes** (tokens, radii, colors, motion, either style) must update `references/design-system.md` and `test/brand.test.mjs` in the same PR.
- **Tests never touch your real folders.** Set `CONCEPT_EXPLAINER_HOME` and `CLAUDE_CONFIG_DIR` (and `HOME` for anything that could move the old library) to temp folders in any test that builds, publishes or installs.
- **Prices** in `scripts/lib/estimate.mjs` change only after checking https://claude.com/platform/api, with `checkedAt` moved in the same change.
- **Examples** in `examples/*.explainer.json` must pass `validate --strict`; `test/examples.test.mjs` checks it.
- **Deep links are a contract** between explainer pages and the library search. Change `references/library.md`, `scripts/lib/search-index.mjs` and the router together.
- **New presets or patterns** must pass `test/scan.test.mjs`, which checks they are internally consistent.

## Writing style

Docs and UI copy follow the same rules as explainers: gist first, short sentences, plain words, no dashes as punctuation, no filler.
