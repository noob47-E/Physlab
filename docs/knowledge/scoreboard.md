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

## The domain of solve (the owner's G3b-1, 12 Oct 2026: every root)
A polynomial equation is answered with EVERY root, complex ones too, "because all roots is the correct answer" (the
engine semantics contract §6.3, `POLYNOMIAL_EQUATION_ROOTS`). Both engines are judged so (`verify.ts`, the same code G4
uses before a Giac answer is shown): the roots given must be exactly the distinct roots over ℂ of the squarefree
polynomial, in exact form. The real roots alone, when there are complex ones too, are WRONG: x³ = 1 answered x = 1 is
wrong (`judge.test.ts` pins it). SymPy has always listed every root; Giac's adapter answered only the real ones until
P-FIX-ALLROOTS, and now asks `csolve`. Under this judge, the old Giac answers would have been WRONG on the mixed items of
the big-degree stratum (19 in gating, 38 in the generator corpus).

Before G3b-1 both engines were judged on the real roots only, with any complex roots they gave checked as well.

## Results (G3b, 12 Oct 2026; phase-0.9 at a8ae8baa; polynomial equations re-run on every root by P-FIX-ALLROOTS, 12 Oct 2026 08:45; results/sympy.json and results/giac.json)
% right on the GATING corpus (200 per class), with WRONG / can't / unverified:

| Class | SymPy | Giac |
|---|---|---|
| expand | 100.0 % (0 / 0 / 0) | 100.0 % (0 / 0 / 0) |
| factor over Q | 100.0 % (0 / 0 / 0) | 100.0 % (0 / 0 / 0) |
| polynomial equations (every root) | 100.0 % (0 / 0 / 0) | 100.0 % (0 / 0 / 0) |
| linear systems | 100.0 % (0 / 0 / 0) | 100.0 % (0 / 0 / 0) |
| rational simplification | 99.5 % (0 / 0 / 1) | 100.0 % (0 / 0 / 0) |
| derivatives (G2B's exact atoms; G4b re-run) | 100.0 % (0 / 0 / 0) | 93.5 % (0 / 1 / 12) |
| partial fractions | 100.0 % (0 / 0 / 0) | 100.0 % (0 / 0 / 0) |

The GENERATOR corpus (300 per class) gives the same picture:
- 100 % for both engines in every class except two;
- rational simplification: SymPy 99.3 % (2 unverified), Giac 100 %;
- derivatives (G2B, G4b re-run): SymPy 100 %, Giac 90.3 % (28 unverified, 1 can't).

**The external holdout (G4b, 12 Oct 2026; G3c's OpenStax items; results/giac-external.json and results/sympy-external.json).**
G3c is partial: it has items in four classes only. Both engines score the same, with 0 WRONG:

| Class | Items | Giac | SymPy |
|---|---|---|---|
| expand | 33 | 100.0 % | 100.0 % |
| factor over Q | 31 | 93.5 % (2 unverified) | 93.5 % (2 unverified) |
| partial fractions | 36 | 100.0 % | 100.0 % |
| rational simplification | 16 | 81.3 % (3 unverified) | 81.3 % (3 unverified) |

Every unverified item has several letters (x(b² − a) + 6(b² − a), 144b² − 25c², (x/y − y/x)/y). The checkers
decide irreducibility and lowest terms in one letter only. Both engines' answers there are right, and the switch never
sends a request in several letters to Giac. Polynomial equations, linear systems and derivatives have no external
items yet.

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
- **Derivatives**: until G2B, every answer with sin, cos or exp was unverified (numbers never prove equal;
  docs/knowledge/check.md). G2B's exact atoms now prove them: SymPy's are all proved. Giac's unverified ones are in tan
  half-angle form (the product rule as (4x/2·tan(x/2 − 2) + …)/(tan(x/2 − 2)² + 1)), which is right but unpleasant to read.
- **Giac can't**: two compositions, exp(cos(−4x² − 3x + 6)) and exp(sin(−5x − 3)), hit its time limit.
- **SymPy unverified**: rational simplification answers written as a sum, −6x + 1 − 6/x, which is not one fraction. They
  are proved equal, but "lowest terms" does not apply to a sum.
- **Excluded points**: neither engine reports them with a simplification (G00-1 is still the owner's), so the judge
  does not ask for them.

G4's rule is ≥ 92 % right and 0 WRONG on the gating corpus AND on the external holdout. With both halves scored, Giac
meets it in expand, factor over Q and partial fractions, and those three moved to Giac (G4b). Rational simplification
meets it on gating but not on the external half as written (81.3 %, every miss in several letters); it stays on SymPy,
and the question is the wave head's. Polynomial equations and linear systems meet it on gating and wait for external
items. Derivatives: since G2B's exact atoms, Giac scores 93.5 % on gating (90.3 % generator, 0 WRONG; its unverified
answers are in tan half-angle form), and it waits for external items too. SymPy now proves every derivative (100 % on both
corpora).

**Not judged.** Solve is judged as the set of distinct roots: both engines list a repeated root once, as the screen shows
it, and the set is the true solution set; the multiplicity is the checkers' to count (§6.3), not a row of the answer.

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

## The switch (G4)
`math/engine/switch.ts` gives each scoreboard class its engine (`ENGINE_FOR_CLASS`), and `ask` (math/engine/index.ts)
routes through it:
- `classOf(job, req)` says which class a request is, or none. A class means one letter and rational coefficients
  (linear systems: several letters, every equation linear); simplify and apart need a quotient, expand and factor a
  polynomial, diff a first derivative with no point. A request outside every class goes where `ENGINE_FOR` sends its
  job.
- A class given to Giac is asked of Giac. The answer is shown only when `verify.ts` proves it, the same code as the
  scoreboard's judge. An answer short of a proof, an error, a throw or a stopped worker falls back to SymPy, so a wrong
  answer from Giac never reaches the screen.
- `tests/engine/switch.test.ts` refuses any class set to Giac unless `results/giac.json` (gating) and
  the external holdout's Giac results (G3c; the file switch.test.ts reads next to giac.json) both show ≥ 92 % right and 0 WRONG.

**Status (G4b, 12 Oct 2026): expand, factor over Q and partial fractions are on Giac**, each proved by `verify.ts`
before it is shown, with SymPy behind it. Every other class stays on SymPy, with its reason beside it in switch.ts.

When a class gets external items:
1. score both engines: `run.ts --engine giac --class all --corpus external` writes results/giac-external.json;
2. set the passing classes to `'giac'`;
3. run the golden comparison `npx tsx scripts/engine-switch-compare.ts "<class>"`, which puts the class's golden CAS
   inputs through the routed ask and prints the lines shown differently.

Each flipped class gets its own `[answer may change]` commit, listing those lines before → after. At G4b, expand (2
inputs) and factor (3 inputs) showed nothing different. Partial fractions showed the same terms in another order on all
3 of its inputs. Polynomial equations no longer waits for the owner: G3b-1 is decided (every root), and both engines
answer so.
