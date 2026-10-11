# Steps Corpus

Known-answer problem sets for the first step-by-step methods: linear equations, quadratics and derivatives. Each item is
built backwards from its answer, and then read back and re-checked by code that does not share the generator's
arithmetic: the linear and quadratic checks use exact BigInt rationals, and the derivative checks use 40-digit BigNumber
arithmetic against central differences.

## Files (tests/steps/corpus/)

- `types.ts`: the item type, the FNV-1a hash of an id, the mulberry32 generator and the text normalisation.
- `exact.ts`: BigInt rationals, polynomials over them, and numbers p + q·√d and p + q·i, all exact.
- `parse.ts`: a strict reader for the corpus's maths text. It throws on any text it does not understand.
- `keys.ts`: the de-duplication key, the domain of a derivative and the rule names it uses.
- `linear.ts`, `quadratic.ts`, `derivative.ts`: the generators. Each item is a function of its id.
- `build.ts`: fills every stratum to its quota, removes duplicates and counts discards by reason.
- `data.ts`: builds TRAINING and GATING once, when imported.
- `check.ts`: the checkers, one per family.
- `corpus.test.ts`: the tests.

## Seeding and sets

An attempt has the id `set|family|stratum|attempt`, where attempts are numbered from zero. The item is generated from
`mulberry32(fnv1a32(id))`, so every item, and therefore every set, is a pure function of its id.

- TRAINING (set `train`): 1000 items per family.
- GATING (set `gate`): 300 items per family, drawn after TRAINING and skipping every key TRAINING used.

Quotas split the set size evenly over the strata, the first (size mod strata) strata getting one more. An attempt is
discarded, and counted by reason, if it cannot be built or if its key is already used.

## De-duplication

The key is computed from the question text, not from the generator's internals:

- linear: the exact coefficients of left minus right, sign-normalised but not divided by a common factor (so
  2x + 4 = 0 and x + 2 = 0 are different questions). Equations with no x-term share one coefficient pair, so they are
  keyed on their normalised text (whitespace, `*` and case removed).
- quadratic: the exact coefficients A, B, C of left minus right, sign-normalised.
- derivative: the function's values at 0.31, 0.77, 1.13, 1.59 and 2.07, to ten significant digits.

The test also checks that no normalised question repeats within a set, and that GATING shares no key and no normalised
question with TRAINING.

## Linear equations

`left = right`, built from pieces: x-terms, constants, brackets k(sx + u) and fractions (sx + u)/d. Forms:
`integer` (no brackets or fractions), `brackets`, `fraction` (divisions by 2 to 6) and `decimal` (terminating decimal
coefficients, and a decimal answer). The specials are `no-solution` (it reduces to 0 = B with B nonzero) and `identity`
(0 = 0). Each side keeps an x, and the answer is -B/A for the chosen root.

Key lines: `expanded` (both sides with the brackets removed; a fraction coefficient may appear as (p/q)x), `collected`
(A x = -B, or 0 = -B for the specials) and `divided` (the answer). The answer is in lowest terms and never written over 1.
A decimal answer is written as a decimal when it terminates.

## Quadratic equations

The roots are chosen first, and then the coefficients:

- `rational`: two distinct rational roots P1/R1 and P2/R2, factorised form k(R1x - P1)(R2x - P2).
- `double`: one repeated root P/R, factorised form k(Rx - P)^2, the answer listed once.
- `surd`: roots (P ± Q√D)/R with D squarefree and above one, so every radical is simplified.
- `complex`: roots (P ± Q·i√D)/R with a negative discriminant; D = 1 gives a ± bi.

Each polynomial is written in one of four arrangements (for example `x^2 = 5x - 6`). Key lines: `discriminant`,
`completed-square` (A(x + p)^2 + q) and, for `rational` and `double` only, `factorised`.

Each root has one canonical text: a rational in lowest terms; a surd with `sqrt(D)`, written (P ± Q*sqrt(D))/R, or
P ± Q*sqrt(D) when R = 1; a complex root with `i`; the root with the positive radical coefficient first. The checker
rebuilds that text from the parsed value, so a non-simplified radical (sqrt(12)), a fraction that is not in lowest terms
or a repeated root is a failure.

## Derivatives

Grammar: the leaves c·x^n, x ± c and x^n; sums, products, quotients and compositions of sin, cos, tan, exp, log (the
natural logarithm) and sqrt, nested to depth 1 to 3. The strata are `easy` (depth 1), `medium` (depth 2), `hard`
(depth 3), and `chain`, `product`, `quotient` (depth 2, with that operation on top).

- The answer is mathjs `derivative` with `simplify: false`.
- product: `left`, `right`, `dleft`, `dright`. quotient: `numerator`, `denominator`, `dnumerator`, `ddenominator`.
  chain: `inner`, `dinner`, `outer`, where `outer` is the derivative of f(t) at t = inner, from mathjs.
- `domain` lists each square-root and logarithm argument that must be positive, for example
  `x such that 2 * x ^ 2 + 3 > 0`; it reads "all real x" when there is none. The function sqrt(u) is defined at u = 0, but
  its derivative is not, so the domain of the derivative is u > 0; the same holds for log(u).
- `samplePoints` are the first five points of the grid -2.4, -1.9, ..., 3.4 at which every sub-expression of the
  question, of the answer and of each key is finite, real and no larger than 1e6 in magnitude (`MAGNITUDE_LIMIT`).
  Fewer than five such points is a discard.
- A candidate whose derivative is constant over the defined grid is discarded (`derivative does not depend on x`).

## What the test checks

Every item is re-checked by `check.ts`, and a checker's problems fail the test:

- Linear: the equation is read back and its A and B computed exactly; the answer is the root, in its canonical text;
  the `expanded` and `collected` lines expand to the same two sides; the stratum's promised features are present (a
  fraction has a `/`, a decimal has a decimal point and no `/`, brackets have a bracket and no `/`, an integer has none
  of them); x appears on both sides.
- Quadratic: the discriminant is exact and matches the stratum; each root is read exactly in Q(√d)(i); each radicand is
  squarefree and above one; each root satisfies the equation exactly; the sum and product of the roots are -B/A and C/A
  exactly; the answer has its canonical text. The completed square must have the shape A(x + p)^2 + q with p = B/(2A)
  and q = (4AC - B^2)/(4A), and the factorised form must have the shape k(R1x - P1)(R2x - P2) or k(Rx - P)^2; a text
  that merely expands to the right quadratic is not accepted in either place.
- Derivative: at each of the five points, every sub-expression of the question, the answer and each key is finite and
  within 1e6, the answer agrees with the
  central difference, each key agrees with the central difference of its own expression, and outer times dinner equals
  the answer. For a chain, `outer` is also checked directly: it must equal the derivative of the outer function at the
  inner expression, taken as a central difference in t. The sample points are the first five defined grid points, the derivative is not constant over the defined
  grid, and the domain and rules are recomputed from the question and compared.

Nothing in the checks catches an exception. A text that does not parse, or a value that is not finite at a point, throws
and fails the test. An answer that is not in its canonical text fails it too.

## Why the derivative tolerance is 1e-12

The central difference uses a step of h = 1e-20 at 40 significant digits. Its truncation error is about h^2·f'''/6, which
is at most 1e-40 times f''' and so negligible for every item here. Its rounding error is about 1e-40·|f|/(2h) = 5e-21·|f|,
and |f| is at most 1e6 at every point the checks use, so the rounding error is at most 5e-15 in absolute terms. The
tolerance is 1e-12 relative to max(1, |f'|), roughly two hundred times that rounding error. A wrong derivative (a dropped
factor, a sign, a missing chain term) differs from the true value by an amount of order one, far above 1e-12. The limit
of 1e6 is what makes this bound hold; a larger limit would weaken the check.

## Counts

The counts are measured from one build of both sets. Attempts include the discarded candidates, and every discard is
listed by reason.

### TRAINING
| family | stratum | items | attempts | discards (by reason) |
|---|---|---:|---:|---|
| linear | integer/easy | 72 | 81 | duplicate 5; one side has no x 4 |
| linear | integer/medium | 72 | 83 | duplicate 6; one side has no x 5 |
| linear | integer/hard | 72 | 76 | duplicate 3; one side has no x 1 |
| linear | brackets/easy | 72 | 93 | duplicate 16; one side has no x 5 |
| linear | brackets/medium | 72 | 90 | duplicate 15; one side has no x 3 |
| linear | brackets/hard | 72 | 80 | duplicate 7; one side has no x 1 |
| linear | fraction/easy | 71 | 131 | duplicate 39; fraction denominator above 6 17; one side has no x 4 |
| linear | fraction/medium | 71 | 163 | fraction denominator above 6 59; duplicate 28; one side has no x 5 |
| linear | fraction/hard | 71 | 144 | fraction denominator above 6 59; duplicate 14 |
| linear | decimal/easy | 71 | 74 | duplicate 2; one side has no x 1 |
| linear | decimal/medium | 71 | 72 | duplicate 1 |
| linear | decimal/hard | 71 | 72 | duplicate 1 |
| linear | no-solution | 71 | 79 | fraction denominator above 6 7; one side has no x 1 |
| linear | identity | 71 | 78 | fraction denominator above 6 6; one side has no x 1 |
| **linear total** | | 1000 | | |
| quadratic | rational/easy | 84 | 87 | equal roots 3 |
| quadratic | rational/medium | 84 | 89 | duplicate 3; equal roots 2 |
| quadratic | rational/hard | 84 | 85 | equal roots 1 |
| quadratic | double/easy | 84 | 134 | duplicate 50 |
| quadratic | double/medium | 83 | 118 | duplicate 35 |
| quadratic | double/hard | 83 | 100 | duplicate 17 |
| quadratic | surd/easy | 83 | 83 | – |
| quadratic | surd/medium | 83 | 84 | duplicate 1 |
| quadratic | surd/hard | 83 | 84 | duplicate 1 |
| quadratic | complex/easy | 83 | 87 | duplicate 4 |
| quadratic | complex/medium | 83 | 85 | duplicate 2 |
| quadratic | complex/hard | 83 | 83 | – |
| **quadratic total** | | 1000 | | |
| derivative | easy | 167 | 236 | duplicate 44; derivative does not depend on x 22; undefined at too few sample points 3 |
| derivative | medium | 167 | 187 | undefined at too few sample points 9; duplicate 8; derivative does not depend on x 3 |
| derivative | hard | 167 | 221 | undefined at too few sample points 32; duplicate 13; derivative does not depend on x 4; the derivative disagrees with its central difference 4; a sub-derivative disagrees with its central difference 1 |
| derivative | chain | 167 | 232 | duplicate 38; undefined at too few sample points 14; derivative does not depend on x 10; the derivative disagrees with its central difference 3 |
| derivative | product | 166 | 196 | undefined at too few sample points 21; derivative does not depend on x 7; duplicate 2 |
| derivative | quotient | 166 | 188 | undefined at too few sample points 13; duplicate 5; derivative does not depend on x 4 |
| **derivative total** | | 1000 | | |
### GATING
| family | stratum | items | attempts | discards (by reason) |
|---|---|---:|---:|---|
| linear | integer/easy | 22 | 49 | duplicate 25; one side has no x 2 |
| linear | integer/medium | 22 | 36 | duplicate 14 |
| linear | integer/hard | 22 | 26 | duplicate 3; one side has no x 1 |
| linear | brackets/easy | 22 | 43 | duplicate 19; one side has no x 2 |
| linear | brackets/medium | 22 | 35 | duplicate 12; one side has no x 1 |
| linear | brackets/hard | 22 | 34 | duplicate 11; one side has no x 1 |
| linear | fraction/easy | 21 | 62 | duplicate 29; fraction denominator above 6 11; one side has no x 1 |
| linear | fraction/medium | 21 | 66 | fraction denominator above 6 32; duplicate 12; one side has no x 1 |
| linear | fraction/hard | 21 | 40 | fraction denominator above 6 15; duplicate 4 |
| linear | decimal/easy | 21 | 25 | duplicate 3; one side has no x 1 |
| linear | decimal/medium | 21 | 23 | duplicate 2 |
| linear | decimal/hard | 21 | 22 | duplicate 1 |
| linear | no-solution | 21 | 24 | fraction denominator above 6 3 |
| linear | identity | 21 | 25 | fraction denominator above 6 3; one side has no x 1 |
| **linear total** | | 300 | | |
| quadratic | rational/easy | 25 | 28 | duplicate 3 |
| quadratic | rational/medium | 25 | 27 | duplicate 1; equal roots 1 |
| quadratic | rational/hard | 25 | 25 | – |
| quadratic | double/easy | 25 | 112 | duplicate 87 |
| quadratic | double/medium | 25 | 94 | duplicate 69 |
| quadratic | double/hard | 25 | 38 | duplicate 13 |
| quadratic | surd/easy | 25 | 29 | duplicate 4 |
| quadratic | surd/medium | 25 | 25 | – |
| quadratic | surd/hard | 25 | 25 | – |
| quadratic | complex/easy | 25 | 25 | – |
| quadratic | complex/medium | 25 | 27 | duplicate 2 |
| quadratic | complex/hard | 25 | 26 | duplicate 1 |
| **quadratic total** | | 300 | | |
| derivative | easy | 50 | 102 | duplicate 42; derivative does not depend on x 7; undefined at too few sample points 3 |
| derivative | medium | 50 | 61 | duplicate 7; derivative does not depend on x 2; undefined at too few sample points 2 |
| derivative | hard | 50 | 61 | undefined at too few sample points 6; duplicate 3; the derivative disagrees with its central difference 2 |
| derivative | chain | 50 | 73 | duplicate 11; undefined at too few sample points 8; derivative does not depend on x 4 |
| derivative | product | 50 | 57 | duplicate 3; undefined at too few sample points 2; derivative does not depend on x 2 |
| derivative | quotient | 50 | 51 | undefined at too few sample points 1 |
| **derivative total** | | 300 | | |

## Known limits

- Some derivative sums cancel x (for example `x + 5 - x + 4`). They are valid, differentiable functions and are checked
  like any other item, but they are weak teaching examples.
- `log` is the natural logarithm, written as mathjs writes it.
- The duplicate counts are high for the families with few distinct forms (double roots, and linear fractions at easy
  size). They are reported above, not hidden.

## Regenerating and checking

The sets are built in memory when `tests/steps/corpus/data.ts` is imported. Nothing is saved to disk. The commands are:

```bash
npx tsc --noEmit -p tsconfig.json
npm run lint
npx vitest run tests/steps/corpus
```

The corpus test takes about twenty seconds. To prove the checks catch a bad item, plant one wrong item in `data.ts`
(for example, change an answer) and run the test: each family's TRAINING test then fails with the reason. The plant was
run once for each family while this file was written (a wrong linear answer, a wrong quadratic root pair and a derivative
whose answer is its own question) and each was reported; the plant was then removed. `corpus.test.ts` also keeps a
permanent planted-error test for each family.

