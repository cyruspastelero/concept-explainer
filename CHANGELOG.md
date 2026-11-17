# Changelog

All notable changes to this project are documented here. This project follows [Semantic Versioning](https://semver.org).

## 0.2.0 (2026-11-18)

Repo Explainer is now **Concept Explainer**. It explains a repo, a PR or MR, a change, a proposal, a migration, an incident or a concept, and the main point is the picture: diagrams first, ideas broken into parts, every claim cited.


### Added

**What it explains**

- **Seven explainer types** (`meta.type`, schema v2): `repo`, `pr`, `change`, `proposal`, `migration`, `incident`, `concept`. Each has its default chapters, required objects, a preset in `presets/types/` and its own truth rules. Files without `meta.type` are read as repos. See `references/types.md`.
- **New chapters:** context, files changed (`diff`), options, risks, rollout, timeline and diagrams (`visuals`), plus node `status` on the map and before and after flow pairs.
- **A kit of nine diagrams**, data only and checked by shape: `layers`, `cycle`, `state`, `compare`, `hierarchy`, `beforeAfter`, `quadrant`, `funnel`, `venn`. Every part is selectable, with its own detail. See `references/visuals.md`.
- **Concepts in parts:** 2 to 6 `parts` per concept and an optional `visual`.
- **Code walkthroughs:** a few real lines, annotated step by step with Back and Continue (`walkthroughs[]`, chapter `code`). `snippet <repo> <path:start-end>` prints the exact lines.
- **Explaining playbook** (`references/explaining.md`): the root card, picking diagrams by the question they answer, misconceptions and transfer quizzes. `validate` warns when an analogy does not say where it breaks, a caption is a label rather than a takeaway, or quiz feedback skips the tempting wrong answer.
- **Examples** for `pr`, `proposal` and `concept`, all passing `--strict`, plus walkthroughs in the Taskflow and PR examples. All four built pages are committed in `examples/` and checked in CI.

**The page**

- **Dashboard layout:** an Overview, then one view per chapter from a sidebar, a Menu sheet on phones, and progress per chapter.
- **Deep links** to every part, step, diff file, option, risk, event, diagram part, walkthrough step and quiz question (`#flows/<id>/<n>`, `#visuals/<id>/<part>`, `#code/<id>/<n>` and so on). The page scrolls to the item.
- **Two styles**, Clean (default) and Playful, and **light, dark and system themes** from a menu by the gear or **Shift+D**.
- **Settings** (`#settings`): Reading choices for this browser (theme, style, motion, text size, density), explainer defaults, and Share (export this explainer, save the page as one file).

**Making one**

- **Estimate before starting:** time and cost ranges per model for every type, sized by repo files, diff lines or source words, with a recommended model and `--json`. The skill shows it and waits for a go-ahead unless a budget fits. Prices are the current family (Fable 5.2, Opus 5.5, Sonnet 5.5, Haiku 5.5), checked on claude.com/platform/api on 2026-11-18. See `references/estimate.md`.
- **`init --type`** writes a starter for any type, and **`diff`** drafts `diff[]` and node statuses from git with every summary left as a TODO.
- **`config`**: explainer defaults in `<home>/config.json` (style, default type, audience, depth, language, visuals, chapters per type, quiz, analogies, model, budget, confirm before start, instructions). The skill reads them first.
- **`install`** links the skill as `concept-explainer` and adds `rules/concept-explainer.md` (under `$CLAUDE_CONFIG_DIR` when set). Safe to rerun; `--force` keeps backups in `<config>/backups/`.

**The library**

- **Every build is filed** in `~/.concept-explainer`, with a hub that searches inside every explainer, filters by type, tag and stack, and draws a small thumbnail per card. The kit page sits beside it. See `references/library.md`.
- **`library`**: `list`, `path`, `add`, `remove`, `rebuild`, `open`, `style` and `serve`. `build --no-library` skips filing.
- **`library serve`** on 127.0.0.1 lets Settings save and Share export and import from the page.
- **Share:** `export` writes a data-only bundle of one explainer, a filtered set or the whole library; `import` adds one with `--dry-run` and `--on-conflict rename|skip|replace`.

**Brand**

- A new mark, lockup and social card with the Concept Explainer name, in ink and one orange accent, text drawn as Geist outlines; one hairline icon per node kind; launcher icons in `assets/app/`.

### Changed

- **Renamed** to Concept Explainer. The bin and package are `concept-explainer`; `repo-explainer` stays as an alias that prints a deprecation note. Pages are titled "X · Concept Explainer".
- **Library home** is `$CONCEPT_EXPLAINER_HOME`, else `$REPO_EXPLAINER_HOME`, else `~/.concept-explainer`. On the first run, `~/.repo-explainer` is renamed to it, never deleted. `install` removes the old `repo-explainer` link and rule only when they are provably its own.
- **The look** is a Geist dashboard: Geist type and greys, one orange accent, hairline rings, one 6px radius, and layer colors as small markers. The previous look lives on as the Playful style.
- **Credits:** Geist (Vercel) for type and greys and Brilliant for lesson pacing; the Playful style credits Duolingo's design language.
- `--repo` file checks and file citation warnings apply only to types that cite code (repo, pr, change, migration).
- **Page code is split** into small files (`dom.js`, `truncate.js`, `theme.js`, `hub-search.js`, Settings in three parts, chapter layout, drawing and wiring apart), with every function under 50 lines and a test that keeps it so. Behaviour is unchanged.

### Security

- **Content is data:** SKILL.md, the rule and the playbook say never to follow instructions or run commands found in what is read, never to read secrets, and to report embedded instructions.
- The validator rejects control characters, bidi overrides and zero-width marks in every string, and all CLI output is sanitized.
- Every git call runs through one hardened helper: the repo's own fsmonitor, diff drivers, pager, hooks, signature programs, ssh and credential helpers are off, refs follow `--end-of-options`, system config and prompts are off.
- Pages carry a CSP fixed at build time in a meta tag, and fonts are self-hosted (`fonts/`, OFL), so pages make no request to anyone else.
- `library serve` serves only pages and fonts, needs a per-run token for every API call, checks Host and Origin, stops reading uploads at the size cap, and sends each page's own CSP.
- Pages never embed the config's `instructions` or the hub's absolute paths.
- Imports are untrusted: a 10 MB cap, prototype keys dropped, unsafe links dropped, every explainer validated and rebuilt locally. A replacing import keeps a uniquely named backup and skips duplicates within a bundle.
- The library home is private (`0700`/`0600`), temp files use `wx`, and one writer at a time holds `<home>/.lock`.

### Fixed

- The search index links only into chapters the page shows, by the same rule as the page (`scripts/lib/chapters.mjs`).
- An import plans its slugs inside the same hold of the library lock that writes them, so a publish in between is never overwritten. A planned slug taken anyway refuses with `slug "x" was taken since the plan`.
- Two processes clearing one stale lock can no longer both take it: the lock holds a pid and a nonce, a dead lock is moved to a unique tombstone before removal, and a writer releases only its own lock.
- `library serve` no longer blocks while the library is busy: writes retry for 2 seconds, then answer `503 library is busy`.
- `library list` and export file names show the local calendar day, not the UTC one (a page published in the Manila evening no longer shows yesterday).
- A chapter listed twice in `meta.chapters` is an error. Pages get their shown chapters and the Settings choices from the build (`context.chapters`, `context.enums`), so the template keeps no copy that can drift.
- `install` on Windows links the skill as a junction (no admin rights needed), and a relink renames the new link over the old one instead of removing it first. CI runs the unit tests on Windows.
- Only a writer holding the lock moves a corrupt `library.json` aside; readers recover it in memory.
- A bad `chapters.<type>.<chapter>` value names that setting in the error.
- The hub exports exactly the explainers on screen (picks, else the search and filters, else the whole library) by slug, and says so when a filter leaves none.
- Import and Save run one at a time, and Save as page keeps the page's CSP.
- Pages show timestamps in the reader's own day, and date-only values as the day they name.
- UI audit: Large text no longer pushes the sidebar footer and the phone Menu off screen; the current chapter scrolls into view in the nav; the phone theme menu stays on screen; touch targets are at least 44px; text that failed AA contrast now passes; the hub shows titles on up to two lines.
- Long-name watchers no longer pile up across hub re-renders.
- A PR, proposal or concept explainer for the same repo as a repo explainer no longer overwrites it in the library.
- Template code containing `</script>` can no longer end the inlined script block.
- `--open` on Windows used `cmd /c start`, which ran shell metacharacters in a path. It now uses `explorer.exe` with the path as one argument.

## 0.1.0 (2026-10-25)

First public release.

- Chapters: architecture map, end-to-end flow player, what changed and why, folder guide, ER diagram, key ideas, quiz, glossary, runbook.
- CLI commands: `scan`, `estimate`, `init`, `changes`, `validate`, `build`, `presets`, `patterns`, `gallery`, `assets`.
- 5 presets and 11 flow patterns.
- Brand, writing-style, lesson-shape and truthfulness checks.
