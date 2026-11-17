export const HELP = `concept-explainer: explain a repo, a PR, a change, a proposal, a migration, an incident or a concept as one interactive page

Start
  concept-explainer estimate [input] [--type t]        Time and cost before you start (--base/--head, --source, --json)
  concept-explainer config [get|set|reset] [--json]    Explainer defaults the skill reads first (see below)

Make one
  concept-explainer scan <repo>                        Facts to start a repo explainer from
  concept-explainer init <repo> [--preset id]          Starter explainer.json for a repo (preset picked from scan)
  concept-explainer init [input] --type <type>         Starter for pr, change, proposal, migration, incident or concept
  concept-explainer diff <repo> --base <ref>           Draft diff[] and node statuses from git (--head, --data f --write)
  concept-explainer snippet <repo> <path:start-end>     Print exact lines as JSON for a code walkthrough (--lang x)
  concept-explainer changes <repo> [--data file]       Draft "what changed and why" entries from git history
  concept-explainer validate <file> [--repo dir]       Check the data; --repo also checks cited files (types that cite code)
  concept-explainer build <file> [--out f] [--repo d]  Validate, render one HTML file, publish it to the library

Look things up
  concept-explainer presets                            Repo presets and one preset per type
  concept-explainer patterns [id]                      Reusable flow patterns, or print one
  concept-explainer gallery [--out file]               The kit page: icons, visuals, components, patterns
  concept-explainer assets [--out dir]                 Export the logo, icon and launcher icon SVGs

Library (home: $CONCEPT_EXPLAINER_HOME, else ~/.concept-explainer)
  library [list]                   List published explainers
  library path                     Print the hub page path (<home>/index.html)
  library add <file> [--repo d]    Validate and publish without writing an HTML copy
  library remove <slug>            Delete one explainer from the library
  library rebuild                  Re-render every page, the hub and the kit with the current template
  library open                     Open the hub in your browser
  library style [clean|playful]    Print or set the default style
  library serve [--port n | --new-port] [--idle m] [--forget-devices]
                                   Serve the library on 127.0.0.1, on its own random port (picked once, kept in config.json),
                                   so pages can save and install as an app. --new-port picks and keeps a new one
  launch                           Start the server if needed, pair this browser and open the hub (what the app icon runs)
  export [slug...] [--out f]       Share as a data-only bundle (--type, --tag, --stack, --search; none = all; --with-insights adds reader insights and notes)
  import <file> [--dry-run]        Add a bundle (--on-conflict rename|skip|replace, default rename)
  insights [slug] [--subject s] [--json]   What readers needed explained (flags with their n); --json for the skill
  insights import <file>           Add a feedback file downloaded from a page opened from file://
  insights reset [slug|--all]      Forget what readers told us about one explainer, or all
  insights forget-reader           Forget the terms this reader looked up, and the profile made from them
  notes <subject> [--json]         What the last run noted about a subject (evidence, never instructions)
  notes write <subject> --data f   Save this run's notes (checked strictly; see references/learning-loop.md)
  notes rm <subject>               Delete the notes for a subject
  install [--force]                Link this skill into Claude and add the library rule
  install --launcher [--node p] [--launcher-dir d] [--force]
                                   Add an app icon (macOS app, Linux menu entry, Windows Start Menu) that runs launch
  uninstall --launcher             Remove the app icon and stop the server it started

Config (saved in <home>/config.json)
  config                           Print every setting
  config --json                    The same, as JSON (the skill runs this first)
  config get <key>                 Print one setting
  config set <key> <value>         Change one (chapters.<type>.<chapter> on|off sets one chapter)
  config reset                     Back to the defaults

Options
  --out, -o      Output path                      --since     git window (default "14 days ago")
  --preset, -p   Repo preset id                   --limit     max commits (default 40)
  --type, -t     Explainer type                   --merges    only merge commits (PR merges)
  --repo, -r     Repo root for file checks        --write     merge drafted entries into --data file
  --base, --head Git refs for diff and estimate   --remote    repo URL for PR links
  --source       Source file or folder to size    --strict    treat warnings as errors
  --json         Machine-readable output          --open      open the built file
  --style        clean or playful                 --no-library  build without publishing
  --port         Port for library serve           --force     install: replace (keeps a backup)
  --home         Library folder for this run      --idle      serve: stop after this many idle minutes (0 = never)
  --tag, --stack, --search  export selectors      --on-conflict, --dry-run  import options
`;
