# Design system

> **Credit.** The **Clean** style takes its type (Geist and Geist Mono) and grey scale from **Geist**, the Vercel design system. The **Playful** style is inspired by **Duolingo**'s design language (palette, rounded type, pressable buttons); it is not affiliated with or endorsed by Duolingo. The one-idea-per-step lesson pacing with a Continue button is inspired by **Brilliant**. Concept Explainer ships none of their logos, mascots, illustrations or fonts: the icons and the mark are original, and the fonts are open source (Geist, Nunito, JetBrains Mono). The interface itself only ever says "Clean" and "Playful".

This page is **read-only context for agents**. The tokens live in `template/styles/*.css` (joined in `STYLE_ORDER` from `scripts/lib/build.mjs`: base, shell, views, diagrams, lessons, hub, kit, playful). Explainers never override them.

## Two styles, one layout

The style is a token skin: `data-style="clean|playful"` on `<html>`. Both styles share every layout and component; only colour, type, radius and the pressable edge change.

- The page default comes from the build: `context.style` in the `explainer-context` tag (`"clean"` or `"playful"`, anything else means clean).
- A reader's own choice (the Style switch in the sidebar, kept in `localStorage` under `concept-explainer:style`) wins over the default.
- Theme is separate: light, dark or system (`data-theme`, `concept-explainer:theme`). Each style has light and dark tokens.
- Both, plus Motion (system or reduced), Text size (default or large) and Density (comfortable or compact), are picked in **Settings** (`#settings`, the gear in the sidebar footer) and applied before first paint by a small inline script in the page head (`data-theme`, `data-style`, `data-motion`, `data-text`, `data-density` on `<html>`). Old `repo-explainer:*` keys are read once and moved.
- Icons and the mark carry both sets; CSS shows one, so switching needs no re-render. Exported SVG files (`concept-explainer assets`) are the Clean hairline set.

### Clean (default)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--canvas` / `--surface` | `#fafafa` / `#ffffff` | `#111111` / `#1a1a1a` | Page, then cards and sidebar |
| `--line` | `#ebebeb` | `#2c2c2c` | Hairline rings and dividers |
| `--ink` / `--body` | `#171717` / `#4d4d4d` | `#ededed` / `#c4c4c4` | Headings, body text |
| `--muted` / `--quiet` / `--faint` | `#666666` / `#8f8f8f` / `#c9c9c9` | `#a3a3a3` / `#8c8c8c` / `#4d4d4d` | Captions, comments, idle lines |
| `--accent` | `#fc5e32` | `#ff7043` | **Marks and lines only**: current item, rings, progress |
| `--accent-fill` / `--accent-hover` / `--accent-text` | `#d2430e` / `#b83a0b` / `#c2410c` | `#c8410e` / `#b83a0b` / `#ff8a5c` | Primary buttons under white text (4.62:1 light, 4.98:1 dark; hover 5.76:1); orange text (AA) |
| `--good` / `--bad` | `#297a3a` / `#cb2a2f` | `#62c073` / `#ff6166` | Quiz markers only |

Type: Geist 400 to 600, Geist Mono for labels, paths and code. Labels are mono, uppercase, 11 to 12px, tracking `0.071em`. Shape: 6px radius, 4px for tags and tooltips. Depth: 1px hairline rings. Orange means "where you are, what is done, the primary action".

### Playful

| Token | Light | Dark | Use |
|---|---|---|---|
| `--canvas` / `--surface` | `#ffffff` / `#ffffff` | `#131f24` / `#202f36` | Page, cards |
| `--line` | `#e5e5e5` | `#37464f` | 2px borders |
| `--heading` / `--ink` / `--body` | `#042c60` / `#3c3c3c` / `#4b4b4b` | `#f1f7fb` / `#f1f7fb` / `#dce6ec` | Headings, strong text, body |
| `--muted` | `#757575` | `#a7bac4` | Captions (AA) |
| `--accent` | `#58cc02` | `#93d333` | Brand green for marks, rings, progress and the done state, never under text |
| `--accent-fill` / `--accent-hover` / `--accent-edge` | `#3e8500` / `#367400` / `#2e6400` | `#93d333` / `#a5ed6e` / `#79b933` | Primary buttons, their hover and their 4px press edge. Light: white text at 4.61:1 (hover 5.75:1). Dark: `#131f24` text at 9.29:1 (hover 11.96:1) |
| `--display` | `#58a700` | `#93d333` | Page titles (large text, 3:1) |
| `--select` / `--select-wash` | `#1cb0f6` / `#ddf4ff` | `#49c0f8` / `#1a3a4a` | Where you are, selected answers |
| `--link` | `#1479b8` | `#49c0f8` | Links (AA) |
| `--good` / `--bad` | `#3c7d00` / `#cc3333` | `#93d333` / `#ff7878` | Quiz markers only (AA) |
| Code | `#000437` with `#e8ecff`, `#a5ed6e`, `#8a90c2`, `#ffd66b` | `#0b1418` | Code blocks |

Type: Nunito 500 to 900 and JetBrains Mono, headings weight 800, page titles 900. Shape: 12px radius, 8px for tags. Depth: a 2px border with a 4px bottom, drawn as unblurred rings, that collapses to 2px on press. Green means progress and the primary action; blue means where you are. There is no contrast exception: button text meets 4.5:1 on the fill and on its hover in both styles and both themes, and `test/brand.test.mjs` computes it from the tokens.

**Layer markers.** The six layer colours in the data contract render as a small square before the layer name and a thin bar on each box, never as fills. Clean: `#5b9a6e #5b86c4 #4a5d8a #76739a #c39a3d #c0689a`. Playful: the original `#58cc02 #1cb0f6 #042c60 #000437 #ffc800 #ff86d0`.

## Controls

- **Pickers** (`template/js/picker.js`) replace native selects, whose OS popups show raw values. Two to four choices are option cards or a segmented row (a radiogroup with arrow keys); longer lists are a listbox button with a popover of labels and short descriptions (Up/Down, Home/End, typeahead, Enter, Escape); free text with suggestions is a combobox. People always see labels ("Pull request"); the stored value stays the config value. The popover is a hairline-ringed panel, and on phones a bottom sheet.
- **Theme in reach.** Besides Settings, every page has a compact theme menu by the gear (and in the phone top bar), and Shift+D cycles light, dark and system with a spoken confirmation. Style stays in Settings, shown as two preview cards.

## Layout

- A 256px sticky sidebar from 1024px up (mark, the explainer title, chapter nav, viewed count, Library link, the Settings gear with the theme menu beside it, generated date and commit). Below 1024px a top bar with the theme menu and a Menu sheet holding the rest.
- One view at a time, routed by hash. Overview first, then one view per chapter: a label, a heading, one lead sentence, the component, then Previous and Next.
- The library hub uses the same shell.
- **Hub card thumbnails** are small drawings from the manifest's `thumb`: the map as layer columns with thin layer bars, or the first visual drawn as its shape (overlapping circles, a ring of dots, stacked bars, boxes with arcs, a small tree, a table, axes with dots, two panels). Hairlines only, no text, one accent mark.
- **Counts** always pair a number with the right noun (`plural` in dom.js; each chapter names its unit as a singular and plural pair): 1 walkthrough, 2 walkthroughs.
- **Where you are.** One helper (`setNavCurrent` in dom.js) marks the current item in every nav copy, and in a visible sidebar scrolls it into view inside the nav. The explainer, the hub and the kit all use it; Settings in the footer gets the same current look. When the nav has rows below its edge it shows a hairline at the bottom (`data-more="below"`), never a fade. Below 760px tall the generated stamp hides.
- **Large text** sets `--page-zoom: 1.125` and zooms the body. Every panel that is the height of the screen (the sidebar, the phone Menu sheet) divides its height by `--page-zoom`, so its footer stays on screen.
- **Touch.** Under `pointer: coarse`, every control is at least 44px high. Small marks (the "?" hint, step dots) get a 44px box with the same picture drawn inside. The phone theme menu stays a dropdown under its button, not a bottom sheet.

## Long names

Repos are full of `AbstractSingletonProxyFactoryBean` names and deep paths. Nothing may run past its box, and nothing is cut without saying so.

- **Soft breaks.** `softBreaks()` (dom.js) adds `<wbr>` to long tokens at camelCase humps, acronym edges (`HTTP|Server`), after `/ . _ - : @`, and between letters and digits, so titles break at word joints. `overflow-wrap: anywhere` is only the last resort.
- **Display titles** step down a size when their longest word is long (`fitClass()`).
- **Long tokens are shortened everywhere.** Any single token over 24 characters (counted in characters, so the result is the same on every screen) is shown cut in the middle, keeping both ends (`AbstractSingleton…Implementation`, `packages/…/handler.ts`, `@scope/…/end`), followed by the same "?" hint. The full token stays in the DOM for screen readers and copying; the short form is hidden from both. Code blocks and file:line citations keep their own handling.
- **Truncation says so.** Anything cut (sidebar title, slugs, tags, chips, card summaries, hub results, map labels) goes through `truncatable()`. A small round "?" hint appears only while the text is really cut; hover, focus or tap shows the full text in a tooltip above everything. Paths and slugs are cut in the middle, keeping the first folder and the file name with its line (`packages/…/handlers/refreshToken.ts:42`).

## Rules and their reasons

| Rule | Why |
|---|---|
| Rings, never blurred shadows | Depth from an edge reads crisp at every size and in both themes. Playful's pressable edge is an unblurred ring too. |
| No gradients | Flat colour keeps diagrams legible. |
| One meaning per accent | Clean: orange is where you are and what is done. Playful: green is progress, blue is where you are, red is a wrong answer only. |
| Status is text plus a marker | Right and wrong answers show ink text with a small coloured marker, never a saturated chip, a coloured headline or a strike-through. |
| Icons by `kind` only | One family per style: hairline strokes in `currentColor` for Clean, flat illustrations for Playful. |
| Motion is short (150 to 600ms), eases out, plays once | It explains change. The selected edges on the map flow to show direction. Everything respects `prefers-reduced-motion`. |
| Text is plain | It prevents XSS from repo content and stops one-off restyling. |
| No inner vertical scroll areas | Only the sidebar and the menu sheet scroll on their own. The map wraps its columns and flows stack when wide diagrams would not fit, so diagrams rarely scroll sideways. |

## Guardrail tests

`test/brand.test.mjs` fails the build if the styles or scripts gain a colour outside the token lists above, a `box-shadow` with a blur radius (custom properties such as `--ring` are resolved and checked too), a gradient, a radius outside 6px, 12px, 8px, 4px, `var(--radius)`, `var(--radius-sm)`, 9999px, 0, 50% (1px or 2px for tiny markers, and `var(--radius) var(--radius) 0 0` for the phone bottom sheet), Nunito or JetBrains Mono outside the Playful block, the word Duolingo in the UI scripts, `innerHTML` or `eval`, a link from data that skips `safeUrl`, a grid track that cannot shrink, an inner vertical scroll area, a style file missing from `STYLE_ORDER` or over 800 lines; or if it loses either style's light and dark blocks, the reduced-motion block or the context slot. Change the tests only together with this document.
