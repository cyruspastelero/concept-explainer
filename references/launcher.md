# The app launcher

The library can feel like an app without Electron or Tauri. HTML stays the core: every explainer is still one file that works from `file://` and can be shared. The launcher adds three things: `library serve` as an installable web app on a fixed local origin, `launch` (start or reuse the server, pair the browser, open the hub), and an app icon per platform that runs `launch`.

Code: `scripts/lib/serve.mjs`, `serve-state.mjs` (server.json, health, ports), `pairing.mjs` (codes, device tokens), `app-routes.mjs` (manifest, worker, icons), `launch.mjs`, `launcher.mjs` (install and uninstall). The service worker and the page side (`template/js/pwa.js`, Settings) belong to the template; `template/app/sw.js` is a placeholder until then.

## Commands

| Command | What it does |
|---|---|
| `library serve [--port n \| --new-port] [--idle m] [--forget-devices]` | Serve on `127.0.0.1`, on the library's own port (`servePort`, picked at random on first use; `--port n` for an explicit one, `--port 0` picks one for this run). If something that cannot prove it is ours holds the library's port, a plain run serves on a random port for this run only and says so; an explicit `--port` is refused instead. `--new-port` picks and keeps a new random port (reinstall the installed app afterwards). `--idle` stops it after that many quiet minutes (default `serveIdleMinutes`, else never). `--forget-devices` revokes every paired device first. |
| `launch` | Reuse our running server, or start one detached that stops after 30 idle minutes, then open a private redirect file that sends the browser to `index.html#pair=<code>`. The code is never on a command line, printed or returned. |
| `install --launcher [--node p] [--launcher-dir d] [--force]` | Write the app icon for this platform. `--node` picks a stable node; `--launcher-dir` writes somewhere other than the default (tests use it). |
| `uninstall --launcher` | Remove what install wrote, if unchanged, and stop a server the launcher started. |
| `--home <dir>` | Any command: use that library for this run. The launcher bakes it in. |

Config: `servePort` (1024 to 65535, or `null`: picked at random from 20000 to 60999 the first time `install --launcher`, `launch` or `library serve` needs it, then kept), `serveIdleMinutes` (0 to 1440, or `null`: the launcher uses 30 and a manual `serve` never stops) and `deviceTokenDays` (1 to 365, default 30: a device token unused that long stops working).

## One origin

An installed web app is tied to scheme, host and port, so the address never changes: `http://127.0.0.1:<servePort>`. The port is random per user (20000 to 60999), picked once and kept in `<home>/config.json`. The home is `0700`, so other local accounts cannot read it, and a program that would take the port while our server is stopped has to guess it first (see Known limits).

- A request with Host `localhost:<port>` gets a **308** to the same path on `127.0.0.1`. Any other Host is refused. Writes accept only Origin `http://127.0.0.1:<port>`.
- **Port busy.** The server on the port is reused only when it **proves** it is this library's server (below). Anything else, even a program answering with our exact fingerprint, gets nothing. `launch` (the installed app) then stops and says so, in a dialog when there is no terminal: close that program, or run `concept-explainer library serve --new-port` and reinstall the installed app from the browser, since it is tied to the old address. It never moves the app to another port quietly. A plain `library serve` serves on a random port for that run only, with the same advice.

### Proving a server is ours

`library serve` writes `<home>/.serve/server.json` (0600, in a 0700 folder) while it runs:

```json
{ "pid": 4321, "port": 41873, "instance": "9f…", "secret": "64 hex", "version": "0.3.0", "startedAt": "…", "idleMinutes": 30, "launched": true }
```

To reuse it, `launch` and `serve` check that the pid lives, then send a fresh 16 byte nonce: `GET /api/health?nonce=<32 hex>`. The server answers with `proof = HMAC-SHA256(secret, nonce)`; the caller compares it with `timingSafeEqual` and checks the instance. Only a process that can read `server.json` can pass. The file is removed when the server stops.

## Page contract

### Paths

| Path | Method | Auth | Answer |
|---|---|---|---|
| `/manifest.webmanifest` | GET | none | `application/manifest+json`: `id "/"`, `start_url "/index.html"`, `scope "/"`, `display "standalone"`, name "Concept Explainer", short name "Explainers", `#fafafa` background and theme, icons below |
| `/sw.js` | GET | none | the service worker, `text/javascript`, its own CSP `default-src 'none'; connect-src 'self'` |
| `/app/icon-192.png`, `/app/icon-512.png`, `/app/maskable-512.png`, `/app/icon.svg` | GET | none | the launcher icons |
| `/api/health` | GET | none | `{ "app": "concept-explainer", "version", "instance" }`, plus `proof` with `?nonce=` |
| `/api/pages` | GET | none | `{ "updatedAt", "pages": ["explainers/<slug>/index.html", …] }`: what the service worker may keep for offline reading |
| `/api/pair` | POST | pair header | `{ "token": "<64 hex>" }` |
| `/api/config`, `/api/export`, `/api/import` | as before | token | as in `references/library.md` |
| anything | OPTIONS | | **405**, no CORS headers, ever |

These come from a fixed map in the package, never from the request path. Library files are still only the hub, the kit, explainer pages and fonts; `<home>/.serve/` is never served. Pages' CSP allows `worker-src 'self'` and `manifest-src 'self'`.

### How a page knows it is served, and pairs

1. **Served?** `location.protocol === 'http:'` and `location.hostname === '127.0.0.1'`. Only then add `<link rel="manifest" href="/manifest.webmanifest">` and register `/sw.js` (scope `/`). From `file://`, do nothing.
2. **Pair.** If the hash starts with `pair=`, take the code (`<16 hex>.<64 hex>`), replace the hash with the normal route (`history.replaceState`) before anything else reads it, then:

   ```
   POST /api/pair
   Content-Type: application/json
   X-Concept-Explainer-Pair: 1
   (the browser adds Origin and Sec-Fetch-Site: same-origin)

   { "code": "<code>" }
   ```

   `200 { "token" }`: keep it in `localStorage` under `concept-explainer:device` (inside try/catch). `403 { "error" }`: the code is unknown, used or expired (120 s), or a header is wrong; carry on as unpaired. A code works once, and a wrong guess burns it.
3. **Write.** Send `X-Concept-Explainer-Token: <device token>` on `/api/config`, `/api/export` and `/api/import`, as with the per-run token. The `#token=` hand-off from `library serve` still works. Without a token, behave as on `file://`.
4. **Revoked or expired.** A 403 on a request with a device token means it was revoked (`library serve --forget-devices`) or went unused for `deviceTokenDays`: drop it and show the copy-a-command fallback. Each accepted use pushes the expiry out again (saved at most once a day).

### Service worker rules

Cache GET, same origin, status 200 only, and **never `/api/*`** (fetching `/api/pages` is fine; caching it is not). Pages go network first with a 3 s timeout, then the cache. Install caches the hub, the kit, the manifest and the icons; after each hub load, cache every page in `/api/pages` (cap 200 pages / 100 MB) and drop pages no longer listed. Name the cache after `updatedAt`; delete old caches on activate. Offline: a quiet banner "Reading offline. Start Concept Explainer to save settings or import." with writes disabled. Save as page and bundles never carry the manifest, the worker or a token.

## Launch

1. Reuse the server in `server.json` if it proves itself.
2. Otherwise take `<home>/.serve/start.lock` (atomic mkdir; cleared when its pid is gone), check again, and start `library serve --port <port> --idle 30` detached, logging to `<home>/.serve/serve.log` (0600, rotated once at 1 MB). Wait up to 5 s for proof of health.
3. Write a one-time pairing code (`<home>/.serve/pair/<id>.json`, sha256 only, 120 s) and a redirect file `<home>/.serve/open-<id>.html` (0600, `wx`): a meta refresh and a hashed inline `location.replace` to `http://127.0.0.1:<port>/index.html#pair=<code>`, no referrer. Open that file. The browser's command line then shows only the file path, so other accounts cannot read the code with `ps`.
4. The redirect file is removed when its code is tried (`/api/pair`, right or wrong), by the server every 30 s once the code has expired or been used, by `--forget-devices`, and by the next `launch`.

Concurrent launches start one server. Only the redirect file is ever opened, by absolute path. `CONCEPT_EXPLAINER_OPENER`, if set, must be an absolute path to a program that receives that path as its one argument; tests use it in place of a browser.

## The app icon

The absolute paths of node (`realpath` of the running node, or `--node`) and of this package's CLI are baked in, because GUI apps get no shell PATH. A node inside a version manager folder (mise, nvm, fnm, volta, asdf, nodenv, n) gets a warning, since an upgrade there breaks the icon.

| Platform | Writes | Notes |
|---|---|---|
| macOS | `~/Applications/Concept Explainer.app`: `Contents/Info.plist` (bundle id `io.github.cyvid7-darus10.concept-explainer`, `LSUIElement`), `Contents/MacOS/concept-explainer` (0755 `/bin/sh`), `Contents/Resources/AppIcon.icns` | Every path single-quoted and escaped. If node or the CLI moved, it shows a native alert asking to reinstall. The icon comes from `sips` and `iconutil`; if they fail, the app works without it. |
| Linux | `~/.local/share/applications/concept-explainer.desktop` and a 512 px icon in `icons/hicolor` (under `$XDG_DATA_HOME` when set) | `Exec` quoted per the Desktop Entry spec (double quotes, `" \` $ \` escaped, `%` doubled, backslashes escaped again). Runs `update-desktop-database` when present. |
| Windows | `Concept Explainer.lnk` in the Start Menu, icon in `%LOCALAPPDATA%\concept-explainer\icon.ico` | Made by a constant PowerShell script (`WScript.Shell`); every path travels in an environment variable, never in the script. Minimized window. If PowerShell fails, install stops and reports it; there is no fallback. |

Every written path and its sha256 go to `<home>/.serve/launcher.json` (0600). Installing again is a no-op. A file we did not write is replaced only with `--force`, which keeps a `.bak`; an app bundle with another bundle id is refused. `uninstall --launcher` removes only recorded files whose hash still matches (changed ones are listed and kept), removes the emptied bundle folders, and stops the server only if it was started by `launch` and proves it is ours.

## Known limits

While the server runs, other accounts on the same machine can read pages on `127.0.0.1` (not data files, and they cannot write: writes need a token). Run `library serve` only on machines you trust with that.

**Why the port is random.** A service worker belongs to its origin. If the port were well known, another local program could take it while our server is stopped (it stops when idle), register a worker on our origin and leave. That worker would answer every later navigation there, including the launcher's `#pair=<code>`, before our server saw a request. We checked in Chrome (2026-11-18) that the server cannot remove such a worker afterwards. A `Clear-Site-Data` answer to a request from the launcher's `file://` page clears only a partitioned copy. The browser's update check for the worker script can be served from the squatter's long cache. So the defence is that the squatter never learns the origin. The port is random per user, kept in the `0700` home, and `launch` refuses rather than moving the installed app to a guessable port. A program would have to find the port by scanning 41,000 ports while the server runs, then win the race to take it once the server stops.

**Out of scope: malware running as you.** A program running under your own account can read your home, `config.json` and `server.json` (with its secret), so no local web app can defend against it. Device tokens expire after `deviceTokenDays` unused and `--forget-devices` revokes them all; the pairing code never appears on a command line (`ps`) or in a log.
