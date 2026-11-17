# Explaining for root understanding

How to turn what you found into data that makes a reader grasp *why* a thing works, not just *what* it is.
Read this before you write `concepts`, `visuals`, `flows`, `why`, `analogy`, `glossary` or `quiz`.

Evidence tags on each rule:
- **[strong]**: replicated experiments or a meta-analysis.
- **[moderate]**: real experiments, but few, narrow (often one domain) or not tested in classrooms.
- **[practitioner]**: craft from expert explainers. Sensible, not tested as a whole.

## 1. Find the root before you write

Do this in your notes first. If you cannot fill a line, you do not understand the concept yet. Go back to the sources.

1. **Problem.** Finish the sentence "Without X, Y breaks because Z." An explanation answers a *why* question; find it first. [practitioner] ([Diataxis](https://diataxis.fr/explanation/), [Evans: "what" without "why"](https://jvns.ca/blog/confusing-explanations/))
2. **Mechanism.** Write the smallest causal chain that produces the behavior, as 3 to 7 "A causes B" links. Causal chains are what readers carry to new cases; surface facts are not. [moderate] ([Gentner 1983, systematicity](https://groups.psych.northwestern.edu/gentner/papers/Gentner83.2b.pdf))
3. **Invariant.** Name the one thing that is always true (for example "the access token never reaches the browser"). Most other facts follow from it.
4. **Without it.** Describe the world where the concept is missing. This is your "compared with what?". [practitioner] (Tufte, *Beautiful Evidence*, 2006, principles of analytical design)
5. **Misconception.** Write the wrong idea a smart newcomer would form. Search sources for "common mistake", "not to be confused with", "X is not Y".
6. **Threshold.** Pick the one idea that, once it clicks, reorganizes the rest. It is usually counterintuitive and links parts that looked separate. Spend the most steps here. [practitioner] ([Meyer and Land, threshold concepts](https://taylorinstitute.ucalgary.ca/sites/default/files/TI%20Guides/Threshold_Concepts_Guide.pdf))
7. **Plain words test.** Explain the root to yourself in plain words. Any term you cannot define plainly is a gap: read more, then retry. [practitioner] (the "Feynman technique" is folk; its working part is self explanation, which is [moderate]: [Chi et al. 1994](https://education.asu.edu/lcl/publications/chi-m-t-h-de-leeuw-n-chiu-m-h-lavancher-c-1994-eliciting-self-explanations))
8. **Causes, plural.** For incidents and "why did this happen", ask "why" until you hit a mechanism or a constraint, but branch: list every contributing cause. "Five whys" tends to find one cause of many, has no stopping rule, and different people reach different answers. [moderate] ([Card 2017, BMJ Qual Saf](https://psnet.ahrq.gov/issue/problem-5-whys))

The result is a six line **root card**. Every line lands in a field:

| Root card line | Lands in |
|---|---|
| Problem | first sentence of the first `concepts[].body`; `context.problem` for pr, proposal, migration, incident |
| Mechanism | a `flows[]` entry, or a `cycle` / `state` visual |
| Invariant | one concept `body`, and one quiz question that breaks it |
| Without it | a `beforeAfter` visual, or a flow pair with `variant: "before"` / `"after"` |
| Misconception | a quiz distractor, a concept `body` opener, or a step `detail` |
| Threshold | the concept with `parts[]` and a `visual`, placed before anything that depends on it |

## 2. Pick the visual by the shape of the idea

Rule: the structure of the drawing must match the structure of the idea. [moderate] ([Tversky et al. 2002, congruence principle](https://faculty.washington.edu/aragon/classes/hcde411/w13/readings/Tversky_AnimationFacilitate_IJHCS02.pdf))
A diagram beats text when it puts things used together in one place, so the reader does not search. Same facts, less work. [moderate] ([Larkin and Simon 1987](https://mechanism.ucsd.edu/bill/teaching/F12/cs200/Readings/larkin.whyadiagramissometimesworth.1987.pdf))

| The idea is... | The reader asks | Use | Not |
|---|---|---|---|
| Parts calling each other in order | "Who calls whom, then what?" | `flows[]` | `cycle` (a flow ends) |
| One thing with modes that change on events | "What can happen next from here?" | `state` | `flows[]` (hides illegal moves) |
| A loop that feeds itself | "What comes back around?" | `cycle` | `funnel` |
| Each level uses only the one below | "What sits on what?" | `layers` | `hierarchy` |
| A whole made of parts, or kinds of a thing | "What is it made of?" | `hierarchy` | `layers` (implies dependency) |
| Components and their connections | "What talks to what?" | map `nodes` / `edges` | `hierarchy` |
| 2 to 4 choices on the same criteria | "Which, and why?" | `compare`, or `options` for a decision | `venn` |
| A change | "What moved?" | `beforeAfter`; `diff` for code | two unrelated flows |
| A trade off on two axes | "Where does each one sit?" | `quadrant` | `compare` with 2 rows |
| Stages that lose volume | "Where do things drop out?" | `funnel` (only with real numbers or a real order) | `layers` |
| Groups with real shared members | "What is shared?" | `venn` | `venn` with an empty middle |
| Events in time | "What happened when?" | `timeline` | `flows[]` |

Rules for every visual:
- **One visual, one question.** Write the question the visual answers before you pick the kind. If it answers two, make two. [practitioner]
- **The `caption` is the takeaway**, not a label. "Each refresh issues a new token and kills the old one", not "Token lifecycle". Captions and titles that cue the key idea help. [strong] (signaling, d = 0.46: [Mayer 2017](https://doi.org/10.1111/jcal.12197))
- **No decorative visuals.** A diagram with no question to answer is extra load. Leaving out interesting but irrelevant material helps learning. [strong] (coherence, d = 0.70: [Mayer 2017](https://doi.org/10.1111/jcal.12197); [Evans: fun illustrations on dry explanations](https://jvns.ca/blog/confusing-explanations/))
- **Steps beat motion.** People think of continuous processes as discrete steps, and animation is often too fast to read. Stepping under the reader's control works. Each step is one state change. [moderate] ([Tversky et al. 2002](https://faculty.washington.edu/aragon/classes/hcde411/w13/readings/Tversky_AnimationFacilitate_IJHCS02.pdf))
- **Words sit next to the picture.** Put the explanation in the part's `detail`, which shows beside the selected part, not in a far paragraph. Refer to parts by their label. [strong] (spatial contiguity, d = 0.79: [Mayer 2017](https://doi.org/10.1111/jcal.12197))

## 3. Break a concept into parts

- **2 to 6 parts, each one load bearing.** Test each: remove the part, does the mechanism break? If not, it is a detail. Put it in a `detail`, not in `parts`.
- **Name parts by what they do** ("Signs the token"), not by what they look like. Relations transfer; surface features do not. [moderate] ([Gentner 1983](https://groups.psych.northwestern.edu/gentner/papers/Gentner83.2b.pdf))
- **Parts do not overlap.** If two parts share a sentence of `detail`, merge them or split the concept.
- **Teach parts alone, then together.** Name each part and its job before the flow that combines them. [strong] (pre-training: "people learn better when they know names and characteristics of the main concepts", d = 0.46 in [Mayer 2017](https://doi.org/10.1111/jcal.12197)); [practitioner] ([Case: teach each mechanic in isolation, then combine](https://blog.ncase.me/explorable-explanations/))
- **Order parts by cause** (what happens first), or top to bottom for `layers`.

## 4. Order chapters and steps

- **Concrete, then named, then general.** Open with one real case (a real request, a real value), name the pattern after, generalize last. [moderate] (concreteness fading, evidence mostly from maths: [Fyfe et al. 2014](https://doi.org/10.1007/s10648-013-9249-3)); [practitioner] ([3Blue1Brown: "Give examples before general frameworks." "Never start with definitions."](https://www.3blue1brown.com/faq/); [Evans: starting out abstract](https://jvns.ca/blog/confusing-explanations/))
- **Climb down after you climb up.** After a general idea, return to one concrete instance to show *why* the pattern holds. [practitioner] ([Victor, Ladder of Abstraction](http://worrydream.com/LadderOfAbstraction/))
- **Teaching order is not logical order.** Lead with the hook a newcomer can follow, not the first layer of the stack. [practitioner] ([3Blue1Brown FAQ](https://www.3blue1brown.com/faq/), [Case](https://blog.ncase.me/explorable-explanations/))
- **A worked example early.** For a newcomer audience, the first flow traces one concrete case end to end before any abstract concept. [strong] ([worked example effect, Sweller and Cooper 1985](https://en.wikipedia.org/wiki/Worked-example_effect))
  For an expert audience (most `pr` and `change` readers) skip basics: worked examples help novices and can hurt experts. [strong] (expertise reversal, Kalyuga et al. 2003, same source)
- **One idea per step, reader paced.** The Continue button is the segmenting principle; keep each step to one change. [strong] (segmenting, d = 0.70: [Mayer 2017](https://doi.org/10.1111/jcal.12197); meta-analysis in [Cavanagh and Kiersch 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9762622))
- **Glossary is pre-training.** Every term a flow or visual uses is in `glossary` or defined at first use. At most two new terms per step. [strong] (pre-training, above); [practitioner] ([Evans: too many concepts at once; jargon that means nothing](https://jvns.ca/blog/confusing-explanations/))
- **End with something that only makes sense after the rest** (the threshold concept applied, or the quiz). [practitioner] ([Case](https://blog.ncase.me/explorable-explanations/))

## 5. Write `why`

- **Shape:** the choice, the constraint behind it, and the cost of the obvious alternative. "Refresh tokens rotate on every use, so a stolen one works only once; a long lived token would work until it expires."
- **Answer the question a reader would ask at that step.** Asking "why is this true?" deepens understanding; you supply the answer where the reader would stall. [moderate] (elaborative interrogation and self explanation rate moderate utility in [Dunlosky et al. 2013](https://doi.org/10.1177/1529100612453266))
- **Say "compared with what".** A `why` with no alternative is a description. [practitioner] (Tufte, *Beautiful Evidence*)
- **Use `why` sparingly**: on choices, not on mechanics. One per 2 to 4 steps is typical.
- **Never invent it.** A `why` comes from a source (doc, PR, spec, commit). Otherwise write "No reason recorded".

## 6. Analogies

- **Map relations, not looks.** A good analogy shares the causal structure (who holds what, what happens when it fails). "A token is like a ticket" is weak; "a token is like a coat check ticket: whoever holds it gets the coat, and the desk never checks your face" maps the relation that matters. [moderate] ([Gentner 1983](https://groups.psych.northwestern.edu/gentner/papers/Gentner83.2b.pdf))
- **Always state where it breaks**, in the same `analogy` field, as the second sentence: "Unlike a coat ticket, a token can be copied." One analogy, used alone, causes its own misconceptions; naming the limit (or giving a second analogy) is the antidote. [moderate] ([Spiro et al. 1989](https://core.ac.uk/download/4826397.pdf))
- **Drop it if it is strained.** If decoding the analogy takes longer than the real thing, cut it. [practitioner] ([Evans: strained analogies](https://jvns.ca/blog/confusing-explanations/))
- **Check before keeping:** (1) the source domain is everyday, (2) at least two relations map, (3) the break point is written, (4) it is shorter than the plain explanation.

## 7. Surface misconceptions

- **Name the wrong idea, show why it fails, then give the right one.** In Muller's physics study, a video that voiced and corrected a misconception taught more than a clear, polished one, though viewers called it confusing. [moderate] (one thesis, one domain: [Scientific American on Muller 2008](https://www.scientificamerican.com/article/how-youtube-star-derek-muller-of-veritasium-is-challenging-scientific/))
- **Where to put it:**
  - a concept `body` that opens "You might expect X. In fact Y, because Z." (at most once per concept);
  - a `beforeAfter` visual with "what people assume" against "what happens";
  - a `state` visual where the transition people expect is absent, with a `detail` saying so;
  - a quiz distractor (section 8).
- **Label wrong ways as wrong.** Never show a mistaken approach as one valid option among others. [practitioner] ([Evans: explaining the "wrong" way without saying it is wrong](https://jvns.ca/blog/confusing-explanations/))
- **Smooth is not the goal.** A page that feels effortless may teach less. Keep the correction even if it adds a step.

## 8. Quiz questions that test transfer

Testing is a learning tool, not only a check. On delayed tests, students who took a test remembered far more than those who restudied, even though restudy felt better. [strong] ([Roediger and Karpicke 2006](https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf); practice testing rated high utility in [Dunlosky et al. 2013](https://doi.org/10.1177/1529100612453266))
Testing also helps transfer to new questions, not just recall. [moderate] ([Butler 2010](https://doi.org/10.1037/a0019902))

- **Ask about a new case.** Use a scenario the page did not show. If the answer is a sentence on the page, it tests recall.
- **Use these four shapes:**
  - *Predict:* "The refresh token expired mid-request. What does the user see?"
  - *Diagnose:* "Logins fail only after one hour. Which part is wrong?"
  - *Locate:* "You need to add rate limiting. Which part changes?"
  - *Counterfactual:* "What breaks if the invariant is dropped?"
- **Every distractor is a real misconception**, plausible to someone who half understood. Competitive wrong options make readers retrieve why each one is wrong, which also improves recall of the related facts. [moderate] ([Little and Bjork 2014](https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2017/01/LittleBjorkMC2014.pdf))
  No joke options, no "all of the above", no option that is wrong only on wording.
- **`explain` covers two things:** why the answer is right, and why the most tempting wrong option is wrong. Feedback is what makes the test teach.
- **Cover the root card:** at least one question each on the mechanism, the invariant and the misconception.

## 9. Pre-publish checklist

Run this on your draft before `build --strict`. Fix the data until every line is yes.

1. Can you state the problem in one sentence ("Without X, Y breaks because Z") and is it the first thing the reader meets?
2. Is the mechanism drawn (a flow, cycle or state), not only written?
3. Does every visual answer one question, and does its `caption` state the answer?
4. Does each visual kind match the shape of the idea (section 2 table)?
5. Does each concept have 2 to 6 `parts`, each one load bearing and named by what it does?
6. Does the page open with a concrete case before any definition or general rule?
7. Is every term in a flow or visual either in `glossary` or defined at first use, with at most two new terms per step?
8. Does each step change one thing?
9. Does every `why` name the alternative and its cost, and come from a source?
10. Does every `analogy` map a relation and state where it breaks?
11. Is the main misconception named and corrected somewhere visible?
12. Is the threshold concept placed before what depends on it, with the most steps?
13. Does every quiz question use a new scenario, with plausible distractors and an `explain` that covers the tempting wrong answer?
14. Did you remove every decorative visual, aside, and "fun fact" that does not serve the root?
15. Does the copy follow the house rules: plain short sentences, no em dashes, en dashes or spaced hyphens, no filler?

## Evidence notes

- Mayer effect sizes are from the 2017 review abstract (JCAL 33(5)); later reviews report different values, and a meta-analysis of his corpus found a smaller overall effect (g = 0.37). Treat them as direction, not precise size.
- Most multimedia principles are stronger for low prior knowledge readers. For expert audiences, cut basics first.
- Concreteness fading evidence is mostly maths; Muller's misconception result is one physics thesis; Feynman technique and five whys have no direct support as named methods.
