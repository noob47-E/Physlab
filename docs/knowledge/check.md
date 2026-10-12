# The answer checkers

**Why they exist** (the engine stage, part G2): PhysLab is moving its algebra engine from SymPy to Giac, and the owner's
hard rule is that a wrong answer never reaches the screen. Every engine answer passes an independent checker first. A
checker returns `'equal'` (proved right), `'different'` (proved wrong) or `'unknown'` (not decided), and on
`'unknown'` the app says it can't solve that one yet. **A checker never says `'equal'` for a wrong answer**; it may say
`'unknown'` when unsure. The rules it follows are the engine semantics contract (docs/knowledge/engine-semantics.md):
the real line unless Complex mode is on, real odd roots ((−8)^(1/3) = −2), no real even root of a negative, and every
point where an answer is undefined recorded.

## Numbers never prove equal
Agreement at finitely many points is evidence, not proof (engine-semantics.md §6). So `'equal'` comes only from exact
arithmetic. The numeric fallback can show two answers DIFFERENT (a point where they disagree far beyond rounding, or
where one is defined and the other is not) and otherwise says `'unknown'`, with the number of points that agreed. This
is stricter than the G2 brief's item 7, which allowed a numeric `'equal'`; the wave head's order of 12 Oct 01:17 and the
semantics contract both forbid it. The cost: an answer with sin, e^x or ln of a non-square stays `'unknown'` (see the
end of this note).

## Files (all under src/renderer/src/math/check/)
- `verdict.ts` — the `Verdict` type, `NotExact`, and the time budget. `safely` gives every public call 1.5 s (a checker
  called by another shares its caller's), and every loop that can run long calls `tick`, which stops the call with
  `'unknown'` when the time is up. The adversarial review found calls that took minutes on the window's own thread.
- `parse.ts` — reads PhysLab's spelling (ln natural, log base 10, |x|, √, ∛, `nthRoot`) with `math/expr.ts`'s
  `preprocess` and `pure/mono.ts`'s `writeTimes`, the reader the app shares. Before it, `preRead` writes every |…| as
  abs(…) (ln|x| as ln(abs(x))) and gives a √ or ∛ after something it multiplies its ×; after it, `checkNames` refuses a
  function name without its bracket (sin 2x) and a run of letters holding one (xsin(x), arcsin(x), cosx). The shared
  reader read all of these wrongly (see "Shared reader flaws" below). A name mathjs gives a meaning (E, PI, gamma, a
  function) is never a variable, and text over 4000 characters is not read. `readMaths` reads "a = b" as a − b
  only where an equation is asked for (the roots of an equation, a system's equations); anywhere else an equation is
  `NotExact`, since x = 1 is not the answer x − 1. Every number mathjs read must be a decimal written in the text that
  the double holds exactly: a number with more than 15 significant figures, a hexadecimal or binary one
  (0x20000000000001 and 0x20000000000000 are one double), and one past a double's range (10⁻⁴⁰⁰ reads 0, a subnormal
  keeps four figures) are `NotExact`. `readExact` turns an answer into a quotient of polynomials over ℚ (`RF`, on
  `pure/mono.ts` expressions) and lists every denominator it met. |A| and √(A²) become one named atom, so √(x²) and |x|
  are the same thing. Anything else (π, sin, √2 as a coefficient, a root index above 64, a power that would build a
  degree above 256 or coefficients over 20 000 binary digits, such as ((2^1000)^1000)^60) throws `NotExact`. `readAlg`
  reads a root (3/2, 1 − √2, (−1 + i√3)/2, ∛−8) into `field.ts`'s exact form; `rootText` takes an "x =" off a root
  first, but only when x is the equation's own letter.
- `field.ts` — exact numbers (a + b√d) + (c + e√d)i over ℚ, with one d per number. `algOrbit` gives a number and its
  conjugates (√d ↦ −√d, i ↦ −i), and `orbitPolynomial` multiplies x − z over them into a polynomial with rational
  coefficients. `rationalRoot` takes exact real roots of rationals, with the odd-root rule. Two spellings of one surd
  (100003·√(2·100019) and √(2·100003²·100019)) arrive with different d; they unify when d₁d₂ is a square, and two
  roots that do not unify are independent, so they are never equal.
- `realroots.ts` — Sturm's theorem on polynomials over ℚ: `isolateRealRoots` puts each real root in its own box with
  rational ends, with no rounding at all. `realZeros` spells a zero exactly when it is rational or a quadratic surd
  (`−√2`, `1/2 + √5/2`), and otherwise gives its value to 18 digits. `piecePoints` gives a rational point inside each
  piece the roots cut the line into. Every remainder is kept whole and primitive, and signs are taken in whole numbers,
  because over ℚ the numbers grew until degree 40 took eleven seconds. `checkSize` refuses (`NotExact`) a polynomial of
  degree above `MAX_EXACT_DEGREE` (64), or whose degree times the binary digits of its largest coefficient is above
  20 000 (the Chebyshev polynomial T₆₄(8192x) is 57 600 and took two minutes). A root is named rational only while its
  leading coefficient has at most 256 binary digits; past that it is given by its value.
- `numeric.ts` — the fallback. It evaluates on the real line at 40 significant digits (mathjs's BigNumber, cloned
  at 40), and each value carries an estimate of its own rounding error. An argument within 1000 times its error of a
  boundary (√ of −10⁻⁴⁰) makes the point inconclusive, never "undefined". `numericEqual(a, b, vars)` samples 0, ±1, ±0.5,
  ±2, ±10, ±10⁻⁶ and ±10⁶; each real zero of a denominator, or of an argument of √, log, tan or a fractional power, and
  both sides of it at 10⁻⁶ and 10⁻³; and 12 seeded random points where both are defined. A difference is a disagreement
  beyond 10⁻²⁵ relative AND beyond 1000 times the rounding. If one answer is undefined where the other is defined, that
  is a difference too, unless the point is a zero of a denominator: then it is a removable point, listed in `excludedAt`.
  An answer with i, or a function it does not know, is `'unknown'`. exp, sinh and cosh past 2300, a fractional power
  past e^2300, and a sine past 10¹⁵ skip the point: the 40-digit arithmetic took 106 s for sinh(10⁶). `residualClearlyNonzero` tells whether p(r) is
  clearly not 0 for a root that is not exact.
- `linear.ts` — `linearSystemCheck`, by exact Gaussian elimination over ℚ.

Every denominator written counts, even one that cancels: 1/(1/(x − 1)) is undefined at 1. `polyEqual` says
`'unknown'` for it; `polyRootsCheck` takes every factor a denominator shares with the numerator out of the solution
polynomial (1/(1/(x − 1)) = 0 has no root, x/(1/(x − 2)) = 0 has only 0); `linearSystemCheck` leaves a solution point
out when a denominator is 0 there (1/(1/x) = 0 has none), and does not decide a family with such a hole; and a
partial-fraction term with a fraction inside it is not read.
- `checkers.ts` — the nine checkers and `expressionEqual`.

## The checkers
An answer that is an equation where an expression is asked for ("x + 1 = 0" against x + 1) is `'unknown'` in every
checker but `polyRootsCheck` and `linearSystemCheck`, whose questions are equations; their answers (a root, a value)
are never equations either.

1. **`polyEqual(a, b)`**: equality in ℚ[x, y, …] after expanding both answers. `'unknown'` when either has a variable
   denominator, an |…|, or anything not exact.
2. **`rationalEqual(a, b)`** → `{ verdict, excluded, excludedComplete }`. Proves equality by cross-multiplying
   (P₁Q₂ = P₂Q₁), and with |…| in one variable by cutting the line at the real zeros of every |…|'s argument. On each
   piece every |A| is ±A, so the two quotients are compared there. Equal on every piece, and continuous where defined,
   means equal wherever both are defined. `excluded` holds the real zeros of every denominator either answer met:
   x(x − 1)/(x − 1) vs x is `'equal'` with {1}, as the G2 contract and the cancelled-factor rule
   (engine-semantics.md §4) ask — `'equal'` here never means "the same domain", and a caller that shows a simplified
   answer must show `excluded` beside it. `expressionEqual` and `derivativeCheck` say `'equal'` in the same sense but
   return no points, so a simplification is checked with `rationalEqual`. `excludedComplete` is false when there are
   several letters, or a denominator holds an |…| or is past `checkSize`. Not exact: the numeric fallback.
3. **`factorCheck(expr, factored)`** → `{ verdict, irreducibleOverQ }`. The factors must multiply back to expr
   (`polyEqual`), and each written factor must be a non-constant polynomial over ℚ. A number, bare, bracketed
   ((2)(x + 1)) or raised to a whole power (2^3), is the content; any other constant factor ((1 + 1)(x + 1)) or a
   division is `'different'`. A whole power ((x + 1)^2, (x + 1)^(2)) counts its base's factors once.
   `'equal'` says the factorisation is a valid one, not that it is complete: x² − 4 against itself is
   `'equal'` with irreducibleOverQ [false]. Irreducible over ℚ is decided for degree 1 (yes), degree 2 (the
   discriminant is not a rational square) and degree 3 (no rational root, by the rational-root theorem). It is
   `'unknown'` for a higher degree, or a factor in several letters.
4. **`polyRootsCheck(poly, roots, domain = 'real')`**. The roots must be complete:
   - Real mode wants exactly the real roots, and Complex mode wants all n of them.
   - The multiplicities may not add up to more than the degree, nor to less in Complex mode.
   - Exact roots (rational, a + b√d, or complex with such parts) are merged where equal. Each must come with all its
     conjugates, at the same multiplicity, because p has rational coefficients.
   - Their orbit polynomials, raised to the multiplicities, must divide p exactly.
   - What is left must have no real root (Sturm) in Real mode, or be a constant in Complex mode.

   A non-real root in Real mode is `'different'`. A root that is not exact (∛2, a root finder's decimal) can only be
   shown wrong, by its residual; after that the verdict is `'unknown'`. Beside such a root, an exact root whose
   conjugate is missing must still be a root, but the missing conjugate may be the inexact one (√(3 + 2√2) is 1 + √2),
   so that is `'unknown'` too. A decimal is read as the exact fraction it spells, so 1.41421356237 is not √2. A root
   written "y = 1" for an equation in x is not read (`'unknown'`). An equation that is not a polynomial
   (x = √(x + 2)) is substituted root by root: −1 is shown wrong, but 2 alone stays `'unknown'`, since completeness
   cannot be proved there.
5. **`linearSystemCheck(equations, answer)`**, where `answer` is `{kind: 'unique', values}`, `{kind: 'infinite',
   values}` or `{kind: 'none'}`. The unknowns are every letter written in an equation, even one that cancels (in
   x + z − z = 1, z is free), and every letter the answer gives a value for. The ranks of the coefficients and of the
   augmented matrix decide the kind:
   - **unique** needs rank = the number of unknowns, and the values must satisfy every equation exactly.
   - **infinite** is each listed unknown in terms of parameters (new letters, or unknowns left unlisted, which are then
     free). It is read literally, as the equations u = f(…): x = y, y = −y says y = 0, not that y is free, while
     x = −y, y = y is the line x + y = 0. What those equations allow, in the unknowns, must lie in the solution set and
     have its dimension n − rank. So it is the whole solution set, not a line inside a plane.
   - **none** needs the augmented rank to be higher.

   `'unknown'` for a nonlinear equation or an inexact value.
6. **`derivativeCheck(f, x, claimed)`**. mathjs differentiates f on its own (PhysLab's ln and log are rewritten to
   mathjs's spelling first, and back after), then the two derivatives are compared like `expressionEqual`.
7. **`expressionEqual(a, b)`** and **`numericEqual(a, b, vars)`**: exact when both are quotients (with |…| and √(…²)),
   otherwise numbers, which only ever say `'different'` or `'unknown'`.
8. **`integralCheck(f, x, F)`**: `derivativeCheck(F, x, f)`. A constant of integration vanishes by itself, and the
   comparison is where both are defined, so between singularities.
9. **`partialFractionsCheck(original, decomposition)`**. The terms must add back up (`rationalEqual`), and each term must
   be a polynomial or N/(c·gᵏ), with g irreducible over ℚ (from 3) and deg N < deg g, N not 0, and at most one term for
   each gᵏ. That is the standard form, which is unique: x/(x+1)² is `'different'` and must be 1/(x+1) − 1/(x+1)², and
   1/(x+1) + 1/(x+1) is not the decomposition of 2/(x+1). A power whose term would be 0 is left out, so 1/(x+1)² is its
   own decomposition. `'unknown'` when g's degree is 4 or more.

## Tests (tests/check/)
Every checker gets right answers, planted wrong ones, and a seeded generator (`gen.ts`). The generator multiplies out
with its own BigInt code, not the checkers'. There are at least 40 cases per checker. `adversarial.test.ts` runs the G2
brief's list, and the 16 canonical cases of `ADVERSARIAL_CASES` (math/engine/semantics.ts) keyed by id, so a new case
fails until it has a check. `differential.test.ts` runs 150 seeded rounds of 17 near-miss plants through every checker:
- any `'equal'` on a planted wrong answer fails, and so does any `'unknown'` there (each plant is wrong by a margin
  the checkers can see);
- any `'different'` on a right one fails.

`attack.test.ts` holds the independent adversarial review of 12 Oct: each exact call of its eight MUSTs with the verdict
the case deserves, every slow case inside a 2.5 s limit, and its 310 hand-made wrong answers (`attack-hand.json`)
re-run: none may be `'equal'`. The review's own harness (35 240 cases, with its own exact arithmetic for the truth) is
kept outside the repo.

## What stays 'unknown' that one could wish decided
- Identities of sin, cos, tan, e^x and ln (sin² + cos² = 1, d/dx sin x = cos x): numbers agree, and nothing exact
  covers them yet. A later part could add exact rules for them, such as e^x and sin/cos as exponentials.
- ln(x²) vs 2 ln|x| (equal for x ≠ 0): logarithms are not exact here.
- Roots outside ℚ(√d, i), such as ∛2, or a root finder's decimal for a quintic.
- Two square roots in one answer (√2 + √3).
- Irreducibility of degree 4 and above, and in several letters; a partial-fraction denominator of degree ≥ 4.
- Real roots, excluded points and |…| pieces of a polynomial past `checkSize` (degree 65 and above, or huge numbers).
- An |…| in several letters, or inside another |…|.
- Complex mode for anything but polynomial roots (e^(iπ) = −1).
- A function name without its bracket (sin 2x, ln x), or glued to letters (xsin(x), arcsin(x)): PhysLab has no rule
  for them, and its shared reader reads them wrongly.
- A power past the size guard ((x + 1)^1000, ((2^1000)^1000)^60), a polynomial past `checkSize`, a linear family with
  a cancelled denominator in it, and anything whose call runs out of its 1.5 s.

## Shared reader flaws (for a separate part)
The checkers read text through the reader the app shares (`preprocess` in math/expr.ts, then `writeTimes` in
pure/mono.ts, then mathjs), and pure/mono.ts's own `readNode` reads Pure Math's input the same way. G2 may not change
that reader, since that changes answers students see, so parse.ts reads around these before and after it. What the
shared reader does today with each (preprocess → writeTimes → mathjs):
- A bar glued after a letter: `x|x|` → `xmag(x)` → `x*m*a*g*(x)`, the product of x, m, a, g and x. The same for
  `θ|θ|` (`theta*m*a*g*(theta)`), `x|2|`, `3x|x|`, and the third bar of `|x|y|z|` (`mag(x)y*m*a*g*(z)`).
- A function before a bar: `ln|x|` → `lnmag(x)` → `l*n*m*a*g*(x)`; `2 ln|x|` and `-ln|-x|` alike.
- A root sign glued after a letter: `x√2` → `xsqrt(2)` → `x*s*q*r*t*(2)`; `x√(x+1)` and `x√9` alike, and `x∛2` →
  `x*c*b*r*t*(2)`.
- A function name without its bracket: `sin 2x` is the product of a symbol `sin`, 2 and x (mathjs prints `sin (2) x`);
  `sin x`, `ln x`, `sec x`, `log 100`, `sqrt 4` and `sin x^2` alike, and `sin^2(x)` is `sin ^ 2 (x)`.
- A function name glued to letters: `xsin(x)` → `x*s*i*n*(x)`, `xabs(x)` and `xsqrt(x)` alike; `sinx` and `cosx` are
  letters; `arcsin(x)` → `a*r*c*s*i*n*(x)` (mathjs knows asin, not arcsin).
- A constant name with a digit: `SQRT2` → `S*Q*R*T*2`, letters, though mathjs has the constant SQRT2.
- Numbers (pure/mono.ts `readNode`, which has its own 15-figure guard but not the rest): `0x20000000000001` and
  `0x20000000000000` are one double, `1e-400` reads 0, and `1.23456789e-320` reads 1.2347e-320, so an exact Pure
  Math answer can be worked out from a number that is not the one typed.
