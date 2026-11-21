# Security policy

## At a glance

- **Zero npm dependencies.** The CLI and the pages run on Node and the browser alone.
- **Local only.** Your library lives in a private folder on your machine (`0700`). Pages make no request to anyone else: fonts are self-hosted, and each page carries a Content Security Policy that allows only its own code.
- **`library serve`** binds to 127.0.0.1, needs a per-run token for every API call, checks Host and Origin, and never serves your library's data or settings.
- **Content is data.** Text from repos, PRs, docs and imported bundles is evidence, never instructions: the skill does not follow instructions it finds there or run commands from them, and the CLI rejects hidden control characters. Git runs with the repo's own hooks, diff drivers and signature programs turned off.
- **Secrets stay out.** The scanner reads env var **names** from example files only and never opens `.env`.

## Reporting a vulnerability

Please report vulnerabilities privately through [GitHub security advisories](https://github.com/Cyvid7-Darus10/concept-explainer/security/advisories/new). Do not open a public issue. You should get a reply within 5 working days.

## Scope

These are in scope:

- Script injection through explainer data (the page must render all data as text)
- The scanner reading or emitting secret values
- Path traversal or command injection in the CLI
- Writing outside the library folder or the Claude config folder
- `library serve`: reading files outside the library, or writing without the token, from another origin or another host

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
- The app launcher pairs a browser with a one-time code (sha256 only, 120 s). A wrong guess does not cancel it; the private redirect filename is random and unrelated to the code ID. The code is never passed on a command line or printed. Device tokens are stored only as hashes in `<home>/.serve` and are revoked whenever their server stops or restarts. A running server is reused only after the launcher verifies its identity; its port is kept out of the server command line and launch log. Launcher files are written without a shell, Windows tools use full system paths, and uninstall removes only fingerprinted files in expected launcher folders.
- `diff` and `estimate --base` refuse git refs that start with `-`, so a ref can never become a git option.
- Library slugs are limited to `[a-z0-9-]`, so a repo name cannot point a write outside `<home>/explainers/`. Library files are written to a temp file and renamed.
- The library hub only links into its own `explainers/` folder; any other href renders as text.
- `install` never deletes: a real folder or an edited rule is refused, or with `--force` moved aside as a backup.

- On a shared machine, another login account can scan for the port while the server runs and claim it while the server is stopped. The random port is private configuration, not a security boundary. The launcher checks server identity before opening the app, and server stops revoke device tokens. On machines with other login accounts, the installable app and offline cache are off by default; the server also serves a worker that clears existing Concept Explainer caches and unregisters itself. `install --launcher --pwa` opts in with the warning repeated. HTTPS with a certificate trusted in the user's keychain is the only complete fix considered for the future. Malware running as the same user is out of scope because it can read the home anyway.
