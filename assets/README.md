# Brand assets

Exported from code, in the Clean (Geist) look. Do not edit these files by hand: change `scripts/lib/brand-art.mjs` (logos, social card, launcher icons) or `template/js/icons.js` (icons), then regenerate. `test/assets.test.mjs` fails when a file here is stale.

| Path | What | Notes |
|---|---|---|
| `icons/<kind>.svg` | One hairline icon per node `kind` (the names agents can set) | 24 x 24, `stroke="#171717"` (ink) on transparent, 1.5 stroke, no fill. Scale freely; recolor by changing `stroke`. |
| `logo/mark.svg` | The mark: an orange tile with three linked nodes | 128 x 128 |
| `logo/lockup.svg` | Mark and "Concept Explainer" | Text is drawn as Geist outlines, so it needs no font |
| `logo/social-card.svg` | GitHub social preview, 1280 x 640 | Rendered to `docs/media/social-card.png` |
| `app/icon.svg` | Launcher icon, rounded tile | Rendered to `icon-192.png`, `icon-512.png`, `icon-1024.png` and `icon.ico` (16, 32, 48, 256) |
| `app/maskable.svg` | Maskable launcher icon, full bleed | The graph stays inside the 80% safe circle. Rendered to `maskable-512.png` |

Colors are the design tokens only: ink `#171717`, greys, white, and one accent, orange `#fc5e32` (`#d2430e` under white text). No gradients, no shadows, no fonts.

## Regenerate

```sh
node bin/concept-explainer.mjs assets --out assets          # the SVGs only, no dependencies
PLAYWRIGHT_FROM=<folder with node_modules/playwright> node scripts/dev/render-assets.mjs   # SVGs, PNGs and the ICO
```

The PNG step needs Playwright, which is not a dependency of this project; point `PLAYWRIGHT_FROM` at any folder that has it. Text outlines come from `scripts/lib/brand-glyphs.json`, made from Geist and Geist Mono (SIL Open Font License 1.1) by `scripts/dev/brand-glyphs.mjs`.
