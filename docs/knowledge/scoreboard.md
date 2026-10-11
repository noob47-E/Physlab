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
- `run.ts` — `npx tsx tests/engine/scoreboard/run.ts --engine sympy|giac --class <class>|all --corpus gating|generator`:
  asks the engine headless (as tests/engine/conformance.ts does), judges each answer through `judge.ts`, and reports %,
  right, WRONG (each listed), can't, unjudged and the time per item; it exits non-zero when anything is WRONG. An unjudged run (the stub judge) exits 0 but says plainly that nothing was marked;
  `--engine giac` exits 2 until part G1 plugs Giac in.
- `judge.ts` — the one door to the checkers of G2 (`math/check/`); a stub until G2 merges, so every answer is reported
  "unjudged".

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
