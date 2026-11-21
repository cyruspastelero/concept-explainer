# How every page stays consistent

Agents only write data. The design, components, diagrams, icons and motion are fixed and tested, so every explainer looks the same and readers learn it once.

[Back to the README](../README.md)

- **One data contract**, checked on every build. See [`references/data-schema.md`](../references/data-schema.md), [`references/types.md`](../references/types.md) and [`references/visuals.md`](../references/visuals.md).
- **Presets per type** and **flow patterns**, so agents start from a proven shape (`concept-explainer presets`, `concept-explainer patterns`).
- **Explaining rules:** root card first, diagrams picked by the question they answer, captions that state the takeaway, analogies that say where they break. Some are enforced as warnings. See [`references/explaining.md`](../references/explaining.md).
- **Writing rules:** gist first, short sentences, no filler.
- **Design guardrail tests** fail CI on blurred shadows, gradients, colors outside the tokens, stray radii, other fonts or `innerHTML`. The look is documented in [`references/design-system.md`](../references/design-system.md).
- **Truthfulness:** code claims cite real files and `--repo` checks they exist. Proposals never show planned parts as built, incident times come from the record, and reasons come from PRs, commits and docs, never made up.
