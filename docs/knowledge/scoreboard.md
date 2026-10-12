# The engine scoreboard

**Why it exists** (the engine stage, part G3a): a job class may move from one algebra engine to another only when the new
engine scores at least 92 % with **0 WRONG** on questions whose answers come from neither engine. "Wrong" is a shown
answer that is false; "can't" (no answer) is not wrong, but it lowers the score. Switch decisions use the GATING
corpus, which nothing is tuned on.

## Files (all under tests/engine/scoreboard/)
- `exact.ts` — the builder's exact arithmetic: rationals on BigInt (`Q`), polynomials over them (`Poly`), the seeded
  generator (`Rng`, mulberry32) and the extreme sizes (`EXTREME`: 6×10²⁴, 10²⁴, −3×10²⁴, 10⁻¹⁹, 5×10⁻¹⁹, −2×10⁻¹⁹).
  No float touches a key: a double loses 6×10²⁴ + 1.
- `buildCorpora.ts` — the generators, built BACKWARDS so each answer is known by construction; `buildCorpus(seed,
  perClass, prefix, avoid)`. `npx tsx tests/engine/scoreboard/buildCorpora.ts` rewrites both JSON files (the same on
  every machine). The gating corpus is built with a different seed and skips every question the generator corpus has.
- `generator.json` (300 per class, 2,100 items) and `gating.json` (200 per class, 1,400 items):
  `{id, class, stratum, question, answer, notes}`.
- `corpora.test.ts` — re-derives every key by a SECOND path written apart from the builder (its own BigInt rationals over
  mathjs parse trees): exact identity at 15 rational points (expand, factor, partial fractions, rational
  simplification); exact polynomial division by every listed root's factor to its multiplicity, with the degrees adding
  up (equations); exact ranks and substitution (linear systems); 60-digit difference quotients (derivatives). Each
  factor of a factor key must be linear or an irreducible quadratic; each excluded point must zero the question's
  denominator and not the answer's. The FORM is checked too: an expand key has no bracket around x and each power once; a factor key is primitive integer factors with positive leading coefficients (only a numeric content bare); an equation key lists reduced roots in order; a partial-fractions key is one fraction per linear or irreducible quadratic block, top of lower degree; a rational key lists every cancelled zero and cannot cancel further; a system key names exactly its unknowns. A planted wrong key per class, and a right key in the wrong form, must be caught.
- `run.ts` — `npx tsx tests/engine/scoreboard/run.ts --engine sympy|giac --class <class>|all --corpus gating|generator|all`.
  It asks the engine headless: SymPy in Pyodide, as tests/engine/conformance.ts does, and Giac in a Node worker thread
  through `tests/engine/giacHeadless.ts`. It marks each answer through `judge.ts` and reports, per class, right, WRONG
  (each listed with why), can't (no answer), unverified (no checker could decide) and the time per item. With
  `--class all --corpus all` it writes `results/<engine>.json`, which also holds the first five unverified answers per
  class. It exits 1 when anything is WRONG.
- `judge.ts` — the one door to the checkers of G2 (`math/check/`). It marks an answer against the QUESTION, never by
  comparing text with the key:
  - **right** is a proof; **wrong** is a proof or a clear numeric witness; anything the checkers cannot decide is
    **unverified**, counted apart and never as right.
  - A right answer must also have the job's form: written out (expand), every factor irreducible over ℚ (factor), one
    fraction in lowest terms (simplify), standard partial fractions.
  - After a right, the key must agree too. If it does not, the checker or the key is wrong, and the item is marked
    WRONG for a person to look at.
  - A whole number of more than 15 digits is rewritten as an exact sum of 15-digit pieces before any checker reads it.
    The shared reader refuses the long spelling, because a double would change it.
  - A factorisation's numeric content is taken off both sides, however it is written: a leading minus, a number in
    front, or the product over a number.
  - Solve is judged as the set of distinct roots, against the squarefree polynomial, since engines list a repeated root
    once.
  - `judge.test.ts` holds real SymPy and Giac answers from the gating corpus, a planted wrong answer per class, and
    answers no checker can prove.

## The domain of solve (G3b)
SymPy's solve lists every root of a polynomial, complex ones too. Giac's lists only the real roots, and complex ones only
when there is no real root (the engine semantics contract, §6.3). Both engines are judged on the REAL roots: the real
roots they give must be exactly the distinct real roots. Any complex roots an engine gives must then be right as well,
checked in Complex mode. A switch of solve to Giac changes what a student sees for x³ = 1, so it waits for the owner
(OWNER-APPROVALS.md, G3b-1); `EngineRequest` has no Complex-mode flag yet.

## Results (G3b, 12 Oct 2026; phase-0.9 at a8ae8baa; results/sympy.json and results/giac.json)
% right on the GATING corpus (200 per class), with WRONG / can't / unverified:

| Class | SymPy | Giac |
|---|---|---|
| expand | 100.0 % (0 / 0 / 0) | 100.0 % (0 / 0 / 0) |
| factor over Q | 100.0 % (0 / 0 / 0) | 100.0 % (0 / 0 / 0) |
| polynomial equations (real roots) | 100.0 % (0 / 0 / 0) | 100.0 % (0 / 0 / 0) |
| linear systems | 100.0 % (0 / 0 / 0) | 100.0 % (0 / 0 / 0) |
| rational simplification | 99.5 % (0 / 0 / 1) | 100.0 % (0 / 0 / 0) |
| derivatives | 51.0 % (0 / 0 / 98) | 51.0 % (0 / 1 / 97) |
| partial fractions | 100.0 % (0 / 0 / 0) | 100.0 % (0 / 0 / 0) |

The GENERATOR corpus (300 per class) gives the same picture:
- 100 % for both engines in every class except two;
- rational simplification: SymPy 99.3 % (2 unverified), Giac 100 %;
- derivatives: 50.0 % for both (SymPy 150 unverified; Giac 149 unverified and 1 can't).

G3c's external holdout (`tests/engine/scoreboard/external/`) has not merged, so it is not scored yet. G4's rule asks
for it too.

**Every WRONG.** The final runs have none. The first run had 55 per engine, all in factor over Q's extreme-content
stratum, and they were the judge's error, not the engines'. Both engines wrote the key's factorisation with its
content as a division or behind a minus: −(2x + 3)(3x − 1)/5000000000000000000, or −3000000000000000000000000·(x − 9)(2x − 5).
The judge took a content off only when it was a number in front. Proof that the engines were right: each answer agreed
with its key, and once the judge took the content off however it is written (`judge.test.ts` pins those forms, right
and wrong), all 55 were proved right.

A later run, after the review added the primitive-factor form check, had 41 per engine (24 generator, 17 gating). All
were in the content stratum, and the judge's error again: the form check read a lone bracket left after the content,
6·(4x + 7), as the sum it holds (pure/mono's `parseSummands` sees through an outer bracket). Each engine answer was the
key itself, and with the bracket read as one factor (`judge.test.ts` pins it) all were right.

**What is not right is unverified or can't, never wrong:**
- **Derivatives**: every answer with sin, cos or exp is unverified for both engines (G2's rule: numbers never prove
  equal; docs/knowledge/check.md). The polynomial and quotient strata are all proved right. Giac also writes some
  answers in an odd form, the product rule in tan half-angle form; that is right, but unpleasant to read.
- **Giac can't**: two compositions, exp(cos(−4x² − 3x + 6)) and exp(sin(−5x − 3)), hit its time limit.
- **SymPy unverified**: rational simplification answers written as a sum, −6x + 1 − 6/x, which is not one fraction. They
  are proved equal, but "lowest terms" does not apply to a sum.
- **Excluded points**: neither engine reports them with a simplification (G00-1 is still the owner's), so the judge
  does not ask for them.

G4's rule is ≥ 92 % right and 0 WRONG on the gating corpus AND on the external holdout, and only the gating half can be
scored today. On it, Giac meets the rule in expand, factor over Q, polynomial equations, linear systems, rational
simplification and partial fractions. The external holdout is still owed (G3c), and polynomial equations also waits
for G3b-1. Derivatives does not meet the rule: 51 %, for want of a checker that can prove a trigonometric answer.

**Not judged.** Solve is judged as a set of distinct roots: both engines list a repeated root once, and the set is the
true solution set. Whether the app should show a multiplicity is a question for G4, not for this judge.

## Classes, strata and answer forms
| Class | Strata | Answer |
|---|---|---|
| expand | small-degree, big-degree (to 6), three-factors, power, fractional-coef, extreme-coef | the expanded polynomial |
| factor over Q | linear, repeated, irreducible-quad, content (as 6x² − 6), big-degree, extreme-content | `content * (f1)^m1 * (f2)` — primitive integer factors, leading coefficient positive |
| polynomial equations | rational, surds (a ± √b), complex (a ± bi), double, big-degree (4–6, mixed), extreme-coef | `x = r, x = s (multiplicity 2)` — every root, sorted by real then imaginary part |
| linear systems | 2x2-unique, 3x3-unique, fraction-solution, dependent, inconsistent, extreme-coef | `x = 1, y = -2`, or `infinitely many`, or `none` |
| rational simplification | linear-cancel, quad-cancel, repeated-cancel, big-degree, extreme-coef | `(num)/(den) ; excluded: x = a, x = b` |
| derivatives | polynomial, product, quotient, composition (nested too), power, extreme-coef | mathjs's derivative, unsimplified (exact numbers) |
| partial fractions | distinct-linear, repeated-linear, irreducible-quad, mixed, fraction-coef, extreme-coef | the decomposition, one fraction per term |

Numbers are written so every engine reads them exactly: `7`, `-3/4`, `6*10^24`, `5*10^(-19)`, `1/(2*10^18)`. ln and √
in derivatives always take an inside that is positive for every real x.

## Traps met
- Floats in the first draft made wrong keys (3.5999999999999997e+25 for 36×10²⁴) and unreduced roots (8/-4): hence
  exact.ts.
- `1/2*10^18` reads as (1/2)·10¹⁸: a denominator written with * is bracketed.
- A "dependent" system whose unknown never appears is, as written, a system with a unique solution in the others:
  every unknown must appear.
- mathjs's `smaller` calls numbers within its tolerance equal (0 < 10⁻²⁰ is false): compare BigNumbers with `lte`.
- A double's difference quotient of 6×10²⁴·cos(…) is noise of 10¹³: the derivative check runs at 60 digits.
