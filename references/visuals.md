# Visuals kit (data side)

Nine fixed kinds. Data only: no SVG, no images, no HTML. The template draws each one, makes every part selectable with a detail panel, and keyboard reachable. Which kind to pick for which idea: `references/explaining.md`, section 2.

Where they go:
- `diagrams[]`: the **visuals** chapter. Each diagram is `{ id, kind, title, caption, ...shape }`. `id` is unique, `caption` is one sentence stating the takeaway. At most 8 diagrams.
- `concepts[].visual`: one visual inside a concept, `{ kind, ...shape }`. `title` and `caption` are optional there.

The checks live in `scripts/lib/validate-visuals.mjs` and the limits in `LIMITS.visualItems` in `scripts/lib/schema.mjs`.

## Shapes

| kind | Shape | Limits | Parts (what a reader selects) |
|---|---|---|---|
| `layers` | `items: [{ label, detail? }]`, top to bottom | 2 to 8 items | `items[i]` |
| `cycle` | `items: [{ label, detail? }]`, in loop order | 3 to 8 items | `items[i]` |
| `funnel` | `items: [{ label, value?, detail? }]`, widest first | 2 to 6 items; `value` a number of 0 or more; values should not grow | `items[i]` |
| `state` | `states: [{ id, label }]`, `transitions: [{ from, to, label? }]` | 2 to 10 states, up to 16 transitions; `from` and `to` are state ids | `states[i]` |
| `compare` | `columns: [text]`, `rows: [{ label, values: [] }]` | 2 to 5 columns, 1 to 10 rows; one value per column: `true`, `false`, a number or short text such as `"partial"` | `rows[i]` |
| `hierarchy` | `nodes: [{ id, label, parent? }]` | 2 to 20 nodes; one root (no parent); parents are node ids; no loops | `nodes[i]` |
| `beforeAfter` | `before: { items }`, `after: { items }`, `notes?: [text]` | 1 to 8 items per side, each text or `{ label, detail? }`; up to 5 notes | `before.items` then `after.items`, counted as one list |
| `quadrant` | `axes: { x, y }`, `points: [{ label, x, y }]` | `x` and `y` from 0 to 1 (0 is low, left and bottom); 1 to 12 points | `points[i]` |
| `venn` | `sets: [{ id, label }]`, `items: [{ label, in: [setId] }]` | 2 or 3 sets; up to 12 items; each item in at least one set | `items[i]` |

Counts outside the limits are errors when the drawing would break (too few states, four venn sets), and warnings otherwise (too many transitions).

## Deep links

`#visuals/<diagramId>` opens the visuals chapter on that diagram, and `#visuals/<diagramId>/<partIndex>` selects a part (0 based, in the order of the Parts column). Each id is one URI encoded segment.

## Example

```json
{
  "id": "key-lifecycle",
  "kind": "state",
  "title": "One key's life",
  "caption": "A key is claimed once, then every retry gets the stored answer until it expires.",
  "states": [
    { "id": "new", "label": "Unseen" },
    { "id": "running", "label": "In progress" },
    { "id": "done", "label": "Stored response" }
  ],
  "transitions": [
    { "from": "new", "to": "running", "label": "first request" },
    { "from": "running", "to": "done", "label": "work finishes" }
  ]
}
```

More in `examples/concept-idempotency-keys.explainer.json` and `examples/proposal-live-updates.explainer.json`.
