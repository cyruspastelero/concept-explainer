# App files

Served by `library serve` at fixed paths, for the installable app (spec section 8).

| File | Served at | Status |
|---|---|---|
| `manifest.webmanifest` | `/manifest.webmanifest` | Final (values from the spec). |
| `sw.js` | `/sw.js` | **TODO(template agent):** placeholder that caches nothing. Replace with the real service worker; keep the contract in its header comment. |

Icons come from `assets/app/` and are served at `/app/icon-192.png`, `/app/icon-512.png`, `/app/maskable-512.png` and `/app/icon.svg`.
