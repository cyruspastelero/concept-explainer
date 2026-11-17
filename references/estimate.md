# Estimating time and cost

`concept-explainer estimate` runs before any investigation, so the user sees how long a run takes and what it costs, and says go. Code: `scripts/lib/estimate.mjs` (prices), `scripts/lib/estimate-types.mjs` (usage, time, recommendation), `scripts/lib/estimate-input.mjs` (measuring).

```sh
concept-explainer estimate ./repo                          # repo: sized by source files
concept-explainer estimate ./repo --type pr --base main    # pr, change: sized by the diff
concept-explainer estimate --type concept --source notes/  # proposal, incident, concept: sized by words
concept-explainer estimate ./repo --type migration --source plan.md
concept-explainer estimate --type pr --json                # for agents
```

Without a measured input it assumes a typical one (a medium repo, a 300 line PR, an 80 line change, 3,000 words of source) and says so.

## What is measured

| Type | Input size |
|---|---|
| `repo` | Source files from `scan`: small under 300, medium to 2,000, large above |
| `pr`, `change` | Changed lines and files from `git diff --numstat <base>...<head>` |
| `proposal`, `incident`, `concept` | Words in `--source` (a file, or every text file under a folder, skipping `node_modules` and `.git`) |
| `migration` | Both: the repo size and the source words |

## Prices

USD per million tokens, from https://claude.com/platform/api, checked 2026-11-18.

| Model | Input | Output | Cache read |
|---|---|---|---|
| Fable 5.2 | $8 | $40 | $0.20 |
| Opus 5.5 | $4 | $20 | $0.20 |
| Sonnet 5.5 | $2 | $10 | $0.10 |
| Haiku 5.5, prompts up to 100K | $0.10 | $0.50 | $0.01 |
| Haiku 5.5, prompts above 100K | $0.50 | $2.50 | $0.05 |

Never change a price without checking that page, and move `checkedAt` with it.

## Assumptions

- **Tokens.** Each type has a usage profile: fresh input (files and docs read once), cached re-reads (most of the volume, cheap), and output (the JSON and builds). Re-read context is assumed to come from the prompt cache.
- **Time** counts agent minutes only, not your review: output tokens divided by a writing speed, plus one tool turn per 5,000 tokens read. Speeds per model are in `SPEED` in `estimate-types.mjs` (Fable 1,800, Opus 2,400, Sonnet 3,600, Haiku 6,000 output tokens a minute; 12, 10, 7 and 4 seconds a turn). These are planning assumptions, not measurements.
- **Ranges.** Cost is shown from 0.75x to 1.5x the profile, time from 0.7x to 1.6x. Real runs vary with how much the agent reads and how many flows you ask for.
- **Recommendation.** Opus for a large repo or a large migration, Haiku for a small change or a repo update, Sonnet otherwise. `config set model <id>` pins a model instead.

## JSON shape

```json
{
  "type": "pr",
  "input": "312 changed lines in 9 files",
  "usage": { "fresh": 0.07, "cacheRead": 0.98, "output": 0.012, "peakContext": 75000 },
  "rows": [{ "model": "sonnet-5.5", "label": "Sonnet 5.5", "tokensIn": 1050000, "tokensOut": 12000, "cost": { "low": 0.27, "high": 0.54 }, "minutes": { "low": 4, "high": 10 } }],
  "recommended": { "model": "sonnet-5.5", "reason": "..." },
  "budget": { "usd": 2, "fits": true },
  "confirmBeforeStart": true,
  "assumptions": "...",
  "prices": { "source": "https://claude.com/platform/api", "checkedAt": "2026-11-18" }
}
```

`budget` is `null` when `budgetUsd` is not set. `fits` compares the recommended model's high end with the budget.
