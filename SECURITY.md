# Security policy

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
- `diff` and `estimate --base` refuse git refs that start with `-`, so a ref can never become a git option.
- Library slugs are limited to `[a-z0-9-]`, so a repo name cannot point a write outside `<home>/explainers/`. Library files are written to a temp file and renamed.
- The library hub only links into its own `explainers/` folder; any other href renders as text.
- `install` never deletes: a real folder or an edited rule is refused, or with `--force` moved aside as a backup.
