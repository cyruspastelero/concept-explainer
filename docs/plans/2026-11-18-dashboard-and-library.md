# Dashboard redesign + explainer library (2026-11-18)

Owner request: make the explainer UI a dashboard in the same design system as
agentos-recipes.site and pastelero.ph (structured differently), and make every
explainer, wherever it is generated, land in one library folder whose local
`index.html` lets you search, browse and open all of them in one place.

## 1. Design system (replaces the Duolingo palette)

Source of truth for the look:
- `~/side-project/airwallex/agentos-hands-on-2026-11-13/guide-site/assets/guide.css` (`:root` tokens, lines 12-45),
  `assets/theme.css` (dark theme + 3-way theme switch), `assets/dashboard.css` (sidebar shell, nav, cards).
- `~/side-project/blog-pastelero/PRODUCT.md`, `styles/tokens.css` (Geist tokens, orange is the only accent).

Rules (enforced by `test/brand.test.mjs`, documented in `references/design-system.md`):
- Tokens: `--canvas #fafafa`, `--surface #fff`, `--line #ebebeb`, `--ink #171717`, `--body #4d4d4d`,
  `--muted #666`, `--quiet #8f8f8f`, `--faint #c9c9c9`, `--accent #fc5e32` (marks, lines only),
  `--accent-fill #d2430e` (fills under white text, AA), `--accent-text #c2410c` (accent text, AA),
  dark theme values from theme.css (`#111111` canvas, `#1a1a1a` surface, `#2c2c2c` line, `#ededed` ink, ...).
- Type: Geist + Geist Mono (Google Fonts link, system fallback). Body 15-16px, mono labels 11-12px uppercase,
  letter-spacing ~0.07em. No serif, no Nunito.
- Shape: one radius 6px (`--radius`), 4px for tooltips/kbd, 9999px only for pills/dots/progress.
- Depth: hairline rings only, `box-shadow: 0 0 0 1px var(--line)` / inset variants. **No blurred shadows**
  (any box-shadow with a blur radius > 0 fails the test), no gradients.
- Colour meaning: orange = where you are / what is done / primary action. Layer colours stay in the data
  contract (`green, blue, navy, midnight, yellow, pink`) but render as small markers, strokes or thin
  bars from a muted Geist scale, never big fills. Quiz right/wrong use Geist green/red text + marker,
  restrained (no saturated chips).
- Icons: same `kind` names (schema unchanged), redrawn as monochrome hairline stroke icons
  (`currentColor`, ~1.5 stroke) so they sit in the Geist look.
- Light, dark and system theme with a 3-option switch in the sidebar footer (`data-theme` on `<html>`,
  choice remembered in localStorage inside try/catch).
- Keep every existing guarantee: plain text rendering (no innerHTML), `safeUrl` for links, keyboard
  support, focus rings (`outline: 2px solid var(--ink)` style), `prefers-reduced-motion`, no inner
  vertical scroll areas, no `scrollIntoView` from scroll observers, phone width works (16px gutter,
  no horizontal page scroll).
- Credit: Brilliant for lesson pacing (the step-through flow), Geist (Vercel) for type and greys.
  The Duolingo palette is no longer used, so its credit line goes.

## 2. Explainer page layout (dashboard)

- Shell: 256px sticky sidebar on >= 1024px (brand mark + "Repo Explainer", repo title, nav of
  chapters with a small orange square marker on the current one, a mono "n / N viewed" progress line;
  footer: "Library" link when in library mode, theme switch, generated date + commit).
  Below 1024px: a top bar with a Menu button that opens a sheet with the same nav.
- Views are hash-routed (one view at a time, like agentos-recipes). The default view is **Overview**:
  summary, stack chips, stat tiles (layers, components, flows, changes, files), a card per chapter with
  a one-line lead, and the latest 3 changes.
- Each chapter (map, flows, changes, tree, data, concepts, quiz, glossary, run) is a view with a title
  block (mono eyebrow, heading, lead) and the existing interactive component restyled.
- Flows view: list of flows on the left/top, the step-through stepper (Continue button, one idea per
  step) for the chosen flow.

### Deep-link contract (the library search depends on this; do not change without updating both sides)

| Hash | Opens |
|---|---|
| `#overview` (or empty) | Overview |
| `#<chapterKey>` | that chapter view |
| `#map/<nodeId>` | map view with that node selected |
| `#flows/<flowId>` | flows view, that flow at step 1 |
| `#flows/<flowId>/<n>` | that flow at step n (1-based) |
| `#changes/<changeId>` | changes view, that entry highlighted |
| `#data/<entityName>` | data view, that entity highlighted |
| `#concepts/<index>` | concepts view, that concept (0-based) |
| `#glossary/<term>` | glossary view, that term (URI-encoded) |
| `#tree/<path>` | tree view, that path highlighted (URI-encoded) |
| `#quiz/<n>`, `#quiz/done` | one quiz question (1-based), or the result (as built; see references/data-schema.md) |
| `#quiz`, `#run` | those views |

Unknown ids fall back to the chapter view; an unknown chapter falls back to Overview. Back/forward work.

### Library context

`template/explainer.html` carries `<script type="application/json" id="explainer-context">__CONTEXT__</script>`.
`build.mjs` fills it with `{}` for standalone builds and `{"libraryHref":"../../index.html","slug":"<slug>"}`
for library builds. When `libraryHref` is set, the sidebar shows a "Library" link (and the top bar on phones).

## 3. Library

- Home: `$REPO_EXPLAINER_HOME`, else `~/.repo-explainer`.
- Layout:
  ```
  <home>/
    index.html                  hub page (self-contained: manifest + search index embedded, works from file://)
    library.json                manifest
    explainers/<slug>/
      explainer.json            copy of the source data
      index.html                the built explainer (library context set)
  ```
- Slug: from `meta.repo` (`owner/name` -> `owner-name`), else the `--repo` folder name, else the data file's
  folder name; lowercase kebab, `[a-z0-9-]`, max 64. If the slug exists for a different source
  (`repo` remote/path differs), suffix `-2`, `-3`.
- Manifest entry: `{ slug, title, summary, repo, sourcePath, repoPath, stack, preset, commit, generatedAt,
  publishedAt, counts: { layers, nodes, flows, changes, concepts, files, quiz }, layers: [{label,color}] }`.
- Search index (embedded in the hub only): flat array of
  `{ slug, type, title, text, href }` with `type` in `explainer | node | flow | step | change | entity |
  concept | glossary | file | run`, `href` relative to the hub using the deep-link contract,
  e.g. `explainers/taskflow/index.html#flows/create-task/3`.
- `build` publishes to the library by default after a successful build (prints the library path).
  `--no-library` skips it. Tests always set `REPO_EXPLAINER_HOME` to a temp dir.
- CLI: `library` (list), `library path`, `library add <explainer.json> [--repo <dir>]`,
  `library remove <slug>`, `library rebuild` (re-render every page + hub from stored JSON with the current
  template), `library open`. `install` symlinks this skill into `~/.claude/skills/repo-explainer`
  and writes the rule file to `~/.claude/rules/repo-explainer.md` (respect `CLAUDE_CONFIG_DIR`; never
  overwrite a non-symlink skill folder without `--force`).
- Writes are atomic (write temp file, rename). The manifest is read/validated before update; a corrupt
  manifest is backed up and rebuilt from `explainers/*/explainer.json`.

### Hub page (same shell as the explainer)

Sidebar: brand, nav (All explainers, Recent changes, Kit), list of repos, theme switch, "n explainers,
updated <date>". Main: search box (focus with `/` or Cmd/Ctrl+K) with instant results grouped by
explainer and typed by kind (mono tag), keyboard navigable; filters by stack chip and preset; grid
of explainer cards (title, summary, stack, counts, layer colour markers, generated date, commit);
"Recent changes" view that merges `changes[]` across every explainer, newest first. Empty state
explains how to add one (`repo-explainer build <file>`). Deep links `#search/<query>`, `#changes`.

## 4. Skill and rule

- `SKILL.md`: publishing to the library is part of the workflow; the agent always reports the library
  hub path; `.explainer/explainer.json` stays in the repo as source.
- `rules/repo-explainer.md`: an installable rule: wherever Claude runs, explainers are built with the CLI and
  land in the library; never hand-write explainer HTML elsewhere; open the hub at `<home>/index.html`.
- `references/library.md`: layout, manifest, search index, commands.
- README: library section and the new screenshots.
