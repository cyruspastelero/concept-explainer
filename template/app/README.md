# App files

Served by `library serve` at fixed paths, for the installable app (spec section 8).

| File | Served at | Status |
|---|---|---|
| `manifest.webmanifest` | `/manifest.webmanifest` | Final (values from the spec). |
| `sw.js` | `/sw.js` | Final: network first (3 s) for same-origin GETs except `/api/*`, the hub, kit, manifest and icons on install, every listed page after each hub load (200 pages, 100 MB), one cache per `updatedAt`. Tests: `test/sw.test.mjs`. |

Icons come from `assets/app/` and are served at `/app/icon-192.png`, `/app/icon-512.png`, `/app/maskable-512.png` and `/app/icon.svg`.
