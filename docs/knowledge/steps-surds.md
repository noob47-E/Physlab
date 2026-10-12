# Surd and complex roots in the steps (S1b)

**What it does.** The quadratic methods (formula, completing the square) show their working when the roots are surds
(√2, 3√7 over 4) or a complex pair (a ± bi), in the real or complex domain. Each line is checked by G2 (docs/knowledge/
check.md): the roots are read exactly in ℚ(√d, i), and a line is valid only when G2 says 'equal' (or the exact check
below does). The numbers never decide a line.

## The swap point (check-adapter.ts)
- `checkSolutionSetEq` takes the domain. A degree-2 polynomial goes to `checkRootSetG2`, which calls G2's
  `polyRootsCheck` with each proposed root (text read by `readSurd`) and its multiplicity.
- `checkExprEq` ends in `expressionEqualG2`, which asks `rationalEqual` first. `expressionEqual` says 'equal' for a
  cancelled denominator without its excluded points (x(x − 1)/(x − 1) against x), so `rationalEqual` decides: 'equal'
  with no excluded point is valid; with an excluded point, or a list G2 cannot complete, it is 'unknown'.
- `checkEquationOp` sends the ± square-root step with a surd root to `checkSurdSquareRootPm`: the root squared must be
  rational, and the factored form must be exactly the one `surdFactoredTex` writes.
- `checkQuadraticSolutionSet` and `checkSurdZeroProduct` check the displayed roots: each must be the exact root and
  must be written in the simplest form (the page's display key must equal the canonical LaTeX of the exact value).
- `checkRootSetG2` lists each root once: two entries with the same exact value are invalid. A double root is one entry
  with multiplicity 2 (`x = 3`), so "x = 3 or x = 3" is refused.
- The domain: `validateWorking(working, adapter, problemDomain)` takes the problem's domain, and a working whose own
  `domain` differs from it is refused. A step that states a domain other than the problem's is invalid; a step that
  states none is not a mismatch (linear workings in complex mode). The router (both its primary and its Another way)
  and `renderWorkingToDoc` pass the problem's domain, so the page path refuses a working rewritten in both its own
  `domain` and a step's `data.domain`: it shows nothing, and the router does not choose it (planted.test.ts, the round-3
  case). Without a problem (validator called alone), the working's own `domain` stands in for it.
  `validateStep` on a lone step has no working and trusts the step's data; no page path validates a step alone.
- A surd zero-product step (the square method's ± step) is valid only when its `data.solutions` are the same two roots
  as its `zeroProduct` shift and root: the sentence is built from that data, so the data is checked, not only the line.

## The reading layer (what G2 receives)
- G2 reads plain maths only. `plainForG2` refuses any text with a backslash or a brace, so LaTeX is never read and such a
  text is 'unknown'.
- The values the framework gives G2 are its own plain forms, written by `plainOfAlg`: `2*sqrt(3)`, `(-3 + 3*sqrt(7))/4`,
  `(5 + 2*i*sqrt(2))/2`, `i`. The page shows `texOfAlg` (`2\sqrt{3}`, `\frac{-3+3\sqrt{7}}{4}`) and the sentences show
  `prettyOfAlg`. `readSurd(plainOfAlg(x))` is exactly x, for every root the methods write (checked for the training set).
- A letter touching a digit (`x2`, `2x2`, `e5`) is refused by `plainForG2` too: G2 reads `x2` as one name, a different
  expression from `2*x` or `x^2`, so it would be 'invalid' (a wrong verdict on a correct line); refused, it is 'unknown'.
  `2x` (a digit before a letter) is still a product and is read so. A number in exponent notation (`1e5`) is one
  literal and is read: its e is taken out before the test.
- G2's reading of glued text (`xsqrt(2)`) and of commuted products (`2*sqrt(3)*x` against `2*x*sqrt(3)`) is not decided:
  the result is 'unknown', never 'different'. The framework never writes such a glued form for a surd.
- Names G2 reads as constants or functions (`e`, `E`, `pi`, `PI`, `i` as a letter, `gamma`) are not variables for G2:
  `checkRootSetG2('e^2 - 2*e - 1 = 0', …)` is 'unknown'. Safe (never a wrong verdict), but such a problem is not checked.
- Numbers never give 'equal': `sqrt(12)` against `2*sqrt(3)` is 'unknown' from the expression checker, because it reads
  only rational-coefficient expressions exactly, so a surd coefficient is decided by numbers alone there (the surd
  equality itself is decided exactly in `readSurd` and `algEq`, and the roots are checked that way). `sqrt(12)` against
  `3*sqrt(2)` is 'invalid': the numbers differ far beyond rounding, and the numeric path may show a difference (never an
  equality).

## Simplest surd form
A root is written with the square-free radicand (√12 is written 2√3), with the common denominator reduced. The check
compares the displayed text's key with the canonical form of the exact root, so √12 for 2√3 is refused even though the
two have the same value.

## Counts (the latest run; tests/steps/surd/)
- S1-gen TRAINING quadratics (1,000 items, surd and complex strata included): 1,000 passed, 0 declined, 0 failed. Every
  answer equals its key root by root, and every step validates.
- G3a "polynomial equations" (300 items): 145 passed, 155 declined, 0 failed. The declines, with their reasons:
  - 55 cubic, 15 quartic, 19 quintic, 16 sextic: "degree N, not a quadratic" (the quadratic methods never claim these).
  - 50 quadratics whose coefficients are written as a power of ten (`10^24`-style): "a coefficient written as a power of
    ten: not read exactly". The S1a reader does not read these exactly, so they are declined rather than guessed. **Not
    closed**: reading a power of ten exactly is a reader change, outside S1b.
- Planted wrong steps (tests/steps/surd/planted.test.ts): 650 base workings (formula and square, real surds and complex
  pairs), 3,772 planted wrong workings in seven kinds (wrong surd 1,050, sign slip 836, domain flipped 1,068, mislabel
  418, conjugate swapped 232, unsimplified root 98, wrong simplification 70). **0 accepted; all 3,772 hidden on the
  rendered page.** A control checks that every unplanted base is accepted and shown, so "hidden" comes from the planted
  change. Five explicit cases sit beside them: the complex pair on the real problem x² + 2x + 5 = 0 (refused whatever the
  step's domain says); a working rewritten in both domain copies (valid alone, refused against the real domain); the same
  rewritten working hidden on the page and not chosen by the router (round 3); a double root written twice (refused);
  and a zero-product step whose data names other roots (refused).
  - Reordering a conjugate pair is not planted: the set of roots does not change, so it is not a wrong step.
- Reading layer (tests/steps/surd/reading.test.ts): 18 tests, all pass.

## Declines by design
- A complex domain square (completing the square of a negative discriminant) is declined; the formula carries the
  complex pair.
- Degree above 2 is never a quadratic working; the methods do not claim it.

## Files
- `src/renderer/src/math/steps/check-adapter.ts` — the swap point and the surd display (readSurd, texOfAlg, plainOfAlg,
  prettyOfAlg, quadraticRootsOf, surdFactoredTex, expressionEqualG2, checkRootSetG2, and the checks above).
- `src/renderer/src/math/steps/validate.ts` — routes SolutionSetEq and the answer's value check through them, and checks
  a step's domain against the problem's.
- `src/renderer/src/math/steps/router.ts`, `render.ts` — pass the problem's domain to `validateWorking` (page and router).
- `src/renderer/src/math/steps/types.ts` — `Working.domain`, the problem's domain on the working.
- `src/renderer/src/math/steps/sentences.ts` — the surd sentences ("The solutions are x = … or x = ….").
- `src/renderer/src/math/steps/methods/quadraticFormula.ts`, `quadraticSquare.ts` — the surd and complex workings.
- `tests/steps/surd/` — corpus.test.ts (TRAINING and G3a), planted.test.ts, reading.test.ts.
