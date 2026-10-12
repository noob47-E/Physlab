# Simultaneous linear equations (S1d)

Two step methods for two or three linear equations in two or three letters, on the checked step framework:
**elimination** (the first method) and **substitution** (Another way). Both use exact rationals (BigInt), so
every number a student reads is exact.

## What a student sees

- The system as typed, then one move per step. Each step's sentence and rule come from `sentences.ts`
  (`systemSentence`, `systemRule`): "Multiply equation 2 by −2", "Subtract equation 1 from equation 2", "Put
  y = −7 from equation 2 into equation 1", "Divide both sides", and so on.
- Three endings. A solution: the answer lists each letter's value. No common solution: the last line is a
  contradictory row "0 = 5" and the answer is "the equations have no common solution". Infinitely many: the last
  line is "0 = 0" and the answer is "every pair of values on the line … works" (a triple for three letters, or
  "every set of values that satisfies …" when two lines give the solutions).

## Method (`methods/linearSystem.ts`)

- **Elimination**: clear the fractions (each equation scaled by the least common multiple of its denominators),
  then for each letter in turn make the other remaining equations free of it. For a pair of rows with coefficients
  `cp` (pivot) and `cq`: opposite coefficients are added; otherwise the pivot is scaled by `|cq|/g` and the row by
  `(cp/g)·sign(cq)` (g = gcd), and the row is subtracted. The rows left with no letters are read: `0 = c` (c not
  zero) ends the working as no solution; otherwise, with fewer pivots than letters, the working ends as infinitely
  many solutions. Otherwise the pivots are solved last-first: each row has the later letters put in, then is scaled
  to "letter = number".
- **Substitution** (Another way): for each letter, make a row its subject (`v = P`, choosing a unit coefficient
  first) and substitute it into the other rows; then solve back the same way.

## Ops (`types.ts`: `SystemOp`, step kind `SystemEq`)

Indices are positions in the system, counted from 0.

- `scale-equation {i, k}`: both sides times k (k not zero, not one).
- `add-equations {i, j}` / `subtract-equations {i, j}`: equation i becomes Eᵢ ± Eⱼ, side by side.
- `make-subject {i, v}`: equation i rearranged to v = P (v − P is the same equation divided by its coefficient of v).
- `substitute {i, j, v, expr}` / `back-substitute`: equation j with v put as P, the result with letters on the
  left and a number on the right. `expr` is the subject's text and is checked against it; back-substitute is the case
  where P is a number.
- `no-common-solution {i, row}`: row i reads `0 = c`, c not zero.
- `infinitely-many {rows, texts}`: the listed rows are independent, there are fewer of them than letters, and every
  other row reads `0 = 0`.

## Checks (`check-adapter.ts`, S1d section; `validate.ts`)

- `readSystem` reads a system exactly (`expandTerms` on each side: brackets, fractions, and tiny powers of ten such as
  `10^(-19)`). A side with a letter squared, or a letter in the number, is not read.
- `checkSystemOp` checks each op exactly, side by side, and refuses an op that changes nothing. Endings are checked
  by an exact rank proof from the displayed rows (`rankOf`).
- `validateSystemWorking` (called from `validateWorking` for any input of two or more equations): the first step must
  start from the system as typed (compared exactly, not as text); each step must start where the one before ends; an
  ending must be the last step; the answer must be the last line (a solution must state every letter alone, and must
  satisfy every equation as typed when the values are put in); and Another way must agree (the same values, or the
  same ending kind).

## Tests (`tests/steps/linear-systems/`)

- `linearSystem.test.ts`: the scoreboard's "linear systems" items (class `linear systems`; `gating.json` is never
  used); 300 seeded 2×2 and 300 seeded 3×3 systems built backwards (a nonsingular matrix and a solution; the right
  sides are the matrix times the solution); 20 textbook systems whose lines are written out by hand; and the
  agreement of the two methods.
- `linearSystemPlanted.test.ts`: planted wrong steps (wrong scale, arithmetic slip, add for subtract and back,
  wrong back-substitution, mislabel, wrong answer, wrong check). Each must fail its step, fail its working, and show
  nothing on the page.
- `harness.ts`: the seeded generator, the textbook systems, and the ending kind.

Run with `npx vitest run tests/steps/linear-systems`.

## Not covered

- Systems with a letter on the right side or a number on the left (not in the scoreboard; declined).
- More than three letters, or more than three equations.
- A parametric form of the infinite solutions (the sentence alone is given).
