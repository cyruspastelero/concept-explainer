# Cost and estimates

The agent does the costly part: reading and writing the explainer. The CLI itself is free.

[Back to the README](../README.md)

## Estimate before starting

Before any work, the agent shows how long a run will take and what it will cost, and waits for your go-ahead:

```
$ concept-explainer estimate --type pr
Estimate for a pr explainer: assumed 300 changed lines in 10 files (no --base given)

Model       Tokens in  Tokens out  Cost                Time
Fable 5.2   990K       12K         $0.89 to $1.79      8 to 18 min
Opus 5.5    990K       12K         $0.52 to $1.03      6 to 14 min
Sonnet 5.5  990K       12K         $0.26 to $0.52      4 to 10 min
Haiku 5.5   990K       12K         $0.016 to $0.033    2 to 6 min

Recommended: Sonnet 5.5. A good balance of care and cost for a job this size.
```

It sizes the input by type: source files for a repo, changed lines for a PR (`--base`), words for a doc (`--source`). Set `budgetUsd` in config and the agent skips the question whenever the estimate fits. How the numbers are made: [`references/estimate.md`](../references/estimate.md).

## Typical cost per run

From [Claude API prices](https://claude.com/platform/api) checked November 18, 2026.

| Run | Fable 5.2 | Opus 5.5 | Sonnet 5.5 | Haiku 5.5 |
|---|---|---|---|---|
| Small repo (under 300 source files) | $0.96 to $1.92 | $0.55 to $1.11 | $0.28 to $0.55 | $0.018 to $0.035 |
| Medium repo (300 to 2,000 files) | $2.19 to $4.38 | $1.36 to $2.73 | $0.68 to $1.36 | $0.24 to $0.48 |
| Large repo (over 2,000 files) | $5.70 to $11.40 | $3.75 to $7.50 | $1.88 to $3.75 | $0.69 to $1.39 |
| PR (300 changed lines, 10 files) | $0.89 to $1.79 | $0.52 to $1.03 | $0.26 to $0.52 | $0.016 to $0.033 |
| Concept (3,000 words of sources) | $0.62 to $1.24 | $0.33 to $0.66 | $0.17 to $0.33 | $0.009 to $0.018 |

- **Sonnet 5.5** is a good default. A medium repo takes it about 8 to 19 agent minutes.
- **Opus 5.5** pays off on large or unfamiliar systems.
- **Haiku 5.5** suits small changes and a daily "what changed" refresh.

These are estimates, not quotes. They assume most repeated context comes from the prompt cache. On a Claude subscription, usage counts against your plan instead.
