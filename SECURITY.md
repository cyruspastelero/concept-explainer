# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through [GitHub security advisories](https://github.com/cyruspastelero/concept-explainer/security/advisories/new). Do not open a public issue. You should get a reply within 5 working days.

## Scope

These are in scope:

- Script injection through explainer data (the page must render all data as text)
- The scanner reading or emitting secret values
- Path traversal or command injection in the CLI
- Writing outside the library folder or the Claude config folder
- `library serve`: reading files outside the library, or writing without the token, from another origin or another host

## Learning loop

- Reader signals are counts, buckets and dates. They carry no identifiers, URLs or user agents; the only free text is a one-line note of up to 140 characters with no control, bidi or zero-width characters. Pages record only on `file://` and `127.0.0.1`, and only while the reader's toggle is on.
- `POST /api/signals` needs the per-run or a device token, the right Origin and Host, JSON and at most 64 KB; batches are parsed strictly (unknown fields refused, prototype keys dropped) and a repeated batch id changes nothing. `GET /api/insights` needs a token and returns counts, flags and short notes only.
- `<home>/insights/` and `<home>/notes/` are 0700 with 0600 files and are never served. The hub embeds only the summary, never the reader profile or notes files.
- Agent notes are what the next agent reads, so they are the prompt-injection surface: items are short single lines, and code fences, markup, hidden characters, non-http(s) links, command-like lines and text addressed to an agent are refused. The skill and the CLI hand notes and insights back marked `untrusted`, and the skill treats them as evidence, never instructions.
- `export` leaves insights and notes out unless `--with-insights`, and never sends the reader profile. Import rebuilds insights field by field (flags recomputed, local insights never overwritten) and keeps notes as `.imported.json` after the same checks.
- To delete: the reader toggle in a browser, `insights reset`, `insights forget-reader`, `notes rm`, `library remove <slug>`, and `config set learning off` to stop recording.

## Design notes

- Rendering uses `textContent` / `setAttribute` only. A test bans `innerHTML`, `eval` and `new Function`.
- Embedded JSON escapes `<`, `>`, `&`, U+2028 and U+2029.
- The scanner skips symlinks and only reads env var *names* from `.env.example`-style files.
- Git runs only through `scripts/lib/git.mjs`, with an argument array and never a shell. Every call turns off the repo's own fsmonitor, external diff, textconv, pager, hooks, signature checks (gpg, ssh, x509), ssh command, credential helpers and network protocols, ignores system config and never prompts. Refs come after `--end-of-options`.
- The validator rejects control characters, bidi overrides and isolates, and zero-width marks in every string, and everything the CLI prints is sanitized, so explainer text cannot drive a terminal or hide a command.
- Pages carry a Content Security Policy fixed at build time (their own inline blocks by hash, no remote sources), load self-hosted fonts and embed no private config (`instructions`) and no local paths.
- The library is private (`0700` folders, `0600` files) and has one writer at a time (`<home>/.lock`).
- Opening a file uses `open`, `xdg-open` or `explorer.exe` with the path as one argument, never `cmd /c start`, so shell metacharacters in a path do nothing.
- `library serve` binds to 127.0.0.1, checks the Host header on every request (DNS rebinding) and the Origin on writes, needs a random per-run token in a header for every API call, validates bodies with the same rules as the CLI, stops reading at the size cap, and serves only the hub, the kit, explainer pages and fonts: never `library.json`, `config.json` or any explainer data. The token travels in the URL fragment, so it never reaches logs or Referer headers.
- The app launcher pairs a browser with a one-time code (sha256 only, 120 s, burned on a wrong guess) traded for a device token stored only as a hash in `<home>/.serve`, which is never served. The code reaches the browser through a 0600 redirect file, never a command line (other accounts can read argv with `ps`), and is never printed. Device tokens expire after `deviceTokenDays` unused (default 30) and `library serve --forget-devices` revokes them all. A running server is reused only after it proves, by HMAC of a fresh nonce with the secret in `server.json` (0600), that it is this library's own; a program squatting the port gets no code. Launcher files are written without a shell (PowerShell gets every path through the environment) and uninstall removes only files whose hash still matches.
- `diff` and `estimate --base` refuse git refs that start with `-`, so a ref can never become a git option.
- Library slugs are limited to `[a-z0-9-]`, so a repo name cannot point a write outside `<home>/explainers/`. Library files are written to a temp file and renamed.
- The library hub only links into its own `explainers/` folder; any other href renders as text.
- `install` never deletes: a real folder or an edited rule is refused, or with `--force` moved aside as a backup.

- The launcher's origin is `127.0.0.1` on a random per-user port (20000 to 60999) kept in the `0700` home, so another local program cannot predict it, take it while the server is stopped and plant a service worker there. `launch` refuses a port held by anything that cannot prove it is this library's server; it never quietly moves the installed app. Malware running as the same user is out of scope: it can read the home anyway.
