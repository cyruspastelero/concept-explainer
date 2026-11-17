# UX principles

Why the page is shaped like a guided dashboard rather than a wiki.

1. **Guide, then let them explore.** A sandbox of boxes and arrows is not an explanation, because readers need to be led to the interesting part. The Overview names the next chapter to open, and every chapter opens with one sentence telling the reader what to do. The flow player walks the request one hop at a time; the map is there to explore afterwards. *(After Bret Victor's "Explorable Explanations" and Red Blob Games' critique of sandbox widgets.)*
2. **Readable without interacting.** All content is visible as normal text. Interaction adds focus but never hides the only copy of a fact.
3. **Start broad, zoom on demand.** The map is the C4 "container" level. Selecting a node zooms to its files, neighbours and the flows it appears in. Flows go down to `file:line`. *(After the C4 model's context → container → component levels.)*
4. **One idea per screen.** Each step shows one hop, one sentence of what happens, and an optional "why". Concepts are a carousel, one card at a time. *(After Brilliant's lesson pacing.)*
5. **Immediate, kind feedback.** The quiz is one question at a time: pick, then Check. A first wrong try says "Not yet" and lets you try again; a second miss shows the answer and the reason. Status is ink text with a small marker, never a red chip or a strike-through. The score names what to revisit and links to the chapter that teaches it. Finishing a flow says so and offers the next flow. The sidebar counts chapters viewed (this browser only).
6. **Never trap the scroll.** Diagrams scroll sideways only, so the page always moves with the wheel. Sticky actor heads and the sticky step card keep context without inner vertical scroll areas; the step card stops sticking when it is taller than the screen. On narrow screens the step card comes first, so Continue stays under your thumb.
7. **Change is a first-class chapter.** When humans and agents land dozens of merges a day, "what is this system?" is only half the question. The other half is "what moved since I last looked, and why?". Each change is tied to the map ("Show on map") so readers update their mental model rather than reading a log.
8. **One view at a time, and every view has an address.** Views are hash-routed (`#flows/create-task/3`), so a link can open a node, a step, a change or a term. Back and forward move between views; moving inside a view (a step, a node) updates the address without adding history. Opening a view moves focus to its heading and starts at the top.
9. **Never hide that something is cut.** Long names break at word joints first (camelCase humps, path slashes), and anything that still has to be cut shows a small "?" with the full text. Paths keep their file name and line, cut in the middle instead.
10. **Reading is the reader's choice.** Settings holds theme, style, motion, text size and density for this browser, applied before the first paint, and the explainer defaults the skill uses next. Sharing exports data only, never page code or local paths.
11. **Calm motion.** Motion only shows change: an arrow draws in, a dot travels once, a card slides in from the direction you moved. No loops except the selected-edge flow, which shows direction. Reduced-motion users get none of it.

Pacing credit: the one-idea-per-step lesson format follows Brilliant.

## Sources

- Bret Victor, *Explorable Explanations*: https://worrydream.com/ExplorableExplanations/
- Red Blob Games, notes on interactive explanations: https://redblobgames.com/x/2306-educ432
- C4 model overview: https://codesee.io/learning-center/c4-diagram
- Explorable explanation (overview): https://en.wikipedia.org/wiki/Explorable_explanation
