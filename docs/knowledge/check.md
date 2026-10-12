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
semantics contract both forbid it. Answers with sin, e^x, ln and roots are proved exactly since G2B, by atoms (see
"Atoms" below); what needs an identity between functions (sin² + cos² = 1) stays `'unknown'`.

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
- `atoms.ts` (G2B) — answers with elementary functions as quotients of polynomials in their letters and in atoms, an
  exact differentiator over that form, and the domain conditions met while reading (see "Atoms" below).

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
   (P₁Q₂ = P₂Q₁), and with |…| in one variable by cutting the line at the real zeros of every |…|'s argument. Answers
   with functions go to the atoms (G2B), whose points are listed and complete only when no other condition (x ≥ 0,
   cos x ≠ 0) is needed, so a step of working that cannot show a condition never takes it as plain equality. On each
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
   mathjs's spelling first, and back after), then the two derivatives are compared exactly as quotients. When that
   cannot be read, `atomDerivative` differentiates f itself, over atoms, and proves claimed ≡ f′ (see "Atoms");
   otherwise numbers. Since G2B an `'equal'` of either kind also needs the claimed answer to have no hole where f′
   can exist: 2x(x − 1)/(x − 1) is not d/dx x² (it was `'equal'` where both are defined).
7. **`expressionEqual(a, b)`** and **`numericEqual(a, b, vars)`**: exact when both are quotients (with |…| and √(…²)),
   then by atoms, otherwise numbers, which only ever say `'different'` or `'unknown'`.
   **`elementaryEqual(a, b)`** → `{ verdict, excluded, conditions }`: the atom path alone, with what its `'equal'`
   carries — the real points where either is undefined (a condition f ≠ 0 in the one letter) and every other condition
   as text ("cos(x) ≠ 0", "x > 0", "-x^2 + 1 ≥ 0").
8. **`integralCheck(f, x, F)`**: F′ = f, by the quotient path on mathjs's F′ first, then `atomAntiderivative`; either
   way F must be defined wherever f is, inside f's domain. A constant of integration vanishes by itself (a different
   one on each piece of the domain too, as the contract allows).
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
kept outside the repo. The atom tests are listed under "Atoms" below.

## What stays 'unknown' that one could wish decided
- Identities between functions (sin² + cos² = 1, sin 2x = 2 sin x cos x, so d/dx tan x = sec² x and every answer
  Giac writes in tan half-angle form; ln 4 = 2 ln 2; √2·√3 = √6): atoms are independent symbols. A later part could
  reduce sin² to 1 − cos² for one argument, or write sin and cos as exponentials.
- ln(x²) vs 2 ln|x| (equal for x ≠ 0), ln(e^x) vs x: ln of a product or a power is not rewritten.
- An answer equal to the right one but for points where a condition with a function in it fails (1/tan x as d/dx
  ln sin x, undefined where cos x = 0): such a set of points is not listed, so it is not allowed.
- A derivative with a hole where f may have no derivative: d/dx |x| = |x|/x, d/dx ∛x = 1/(3∛x²). Whether f has a
  derivative at such a point depends on f (x·|x| has one at 0), and nothing here decides it, so the hole is not
  allowed.
- π, acot, asec, acsc, a^x for a number a ≠ e, and log(a, b) (see "Atoms").
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

## Atoms (G2B)
**Why**: G3b's derivatives scored 51 % for both engines, because every answer with sin, cos, e^x or ln could only be
judged by numbers, which never say `'equal'`. `atoms.ts` proves such answers exactly.

**The form.** An answer is read (through `readMaths`, so `preRead`, `checkNames` and the number checks still apply) into
a quotient of polynomials with rational coefficients in its letters and in atoms: sin u, cos u, e^u, ln u, the q-th
root of u, |u|, and asin, acos, atan, asinh, acosh and atanh of u, where u is itself read the same way. Atoms are
matched by kind and by an argument of the same form, so equal atoms have one name. Two answers whose forms are identical
(the cross product a.num·b.den − b.num·a.den reduces to 0) are equal wherever both are defined: an identity of
rational functions in independent symbols holds for every value of the symbols. It is sound, not complete.

**Rewrites made while reading**, each an identity on the whole domain and each proved by a case in
`tests/check/atoms.test.ts` ("every exact rewrite, proved"):
- powers reduce: (ᵠ√u)^q = u (the argument's condition stays recorded), |u|² = u², e^a·e^b = e^(a+b), (e^a)^n = e^(na),
  (e^a)^b = e^(ab), e^0 = 1, and e is e^1;
- roots: a constant scale comes out (√(k²u) = k√u, √8 = 2√2, ∛(−8x) = −2∛x); a perfect power is exact (√(x²) = |x|,
  √(e^(2x)) = e^x); √(±t^p) = (±t)^((p−1)/2)·√(±t) for one letter or atom t and odd p; an odd root of a polynomial in
  one letter splits into its square-free parts (∛((x² + 1)²) = (∛(x² + 1))²), but an even root does not, since
  √(x²(x − 1)) is defined at 0 and |x|·√(x − 1) is not; ᵠ√(N/D) = ᵠ√(N·D^(q−1))/D (|D| for an even q);
- |c·m·P| = |c|·|m|·|P|, with |t|^even = t^even, and |t| = t when t ≥ 0 (e^u, an even root, |u|) or P ≥ 0 everywhere;
- tan, sec, csc and cot as sin/cos, with cos u ≠ 0 (or sin u ≠ 0) recorded: the domain of tan u itself;
- odd and even: sin(−u) = −sin u, cos(−u) = cos u, and asin, atan, asinh and atanh are odd (the sign of u is the sign
  of lc(num)/lc(den) in a monomial order, an invariant of the form); sin 0 = 0, cos 0 = 1, ln 1 = 0 and so on;
- sinh, cosh, tanh, sech, csch and coth as exponentials, so cosh² − sinh² = 1 is proved;
- log is base 10: log u = ln u / ln 10, and log2 likewise. log(a, b) is not read: `numeric.ts` and `toMathjsLogs` take
  it as ln a / ln b, PhysLab's own `log` (math/expr.ts) as log base a of b, ln b / ln a. That disagreement is G2's,
  left for a part of its own.

Nothing else: no ln of a product or a power, no ln(e^u) = u, no branch identity, and π is not read (cos(π/2) = 0 would
hide a pole).

**Domains (G00).** Every condition met while reading is recorded beside the form: a denominator ≠ 0, factor by factor
as written ((1 + sin x)² ≠ 0 is 1 + sin x ≠ 0) and simplified (√u ≠ 0 is u ≠ 0, ln u ≠ 0 is u ≠ 1, e^u is never 0,
c·e^a ≠ c·e^b is a ≠ b); ln u needs u > 0; an even root's argument ≥ 0; 1 − u² ≥ 0 for asin and acos, u ≥ 1 for
acosh, 1 − u² > 0 for atanh. A condition that holds everywhere (a sum of positive terms, or a polynomial in one letter
whose sign Sturm's theorem fixes, or a divisor > 0 by its written shape, such as 1 + (x³ + atan x)², `shapeSign`) is
not recorded. Then:
- `atomExpressionEqual` (expressions): the forms are identical, every > and ≥ condition of one is a condition of the
  other, and every ≠ condition with an atom in it is shared. A ≠ condition in letters only has isolated zeros, the
  cancelled-factor points of G00 §4, and is allowed: x·ln x/x is ln x with 0 excluded, but (1 + sin x)/(1 + sin x) is
  not proved to be 1, since a condition with a function in it can fail on a whole interval (|x| − x ≠ 0,
  sin²x + cos²x − 1 ≠ 0). Domains that differ otherwise are not `'equal'`; the numbers then decide what they can
  (ln x against ln|x| is `'different'` at x = −1, as G2's numbers always said for a domain difference).
- `atomDerivative` → `{ same, covered }`: f′ can exist only on the inside of f's domain (`interior` makes every ≥
  there a > as well). The claimed answer must be defined there everywhere, not even a point less (review G2B round 1:
  x/√(x² + 1)·(x² − 2)/(x² − 2) is not d/dx √(x² + 1) at ±√2, and the numbers never land on ±√2), and may be defined
  on more: 1/x is d/dx ln x, 1/(2x) is d/dx ln √x. A letter-only f ≠ 0 of the claim is allowed only when each of its
  real zeros is a zero of f's own conditions, or (when rational) breaks one of f's > or ≥ conditions (`zerosShared`,
  exact: a gcd and Sturm). Where the rules exclude u = 0 for |u| or a root of u (`extrasHold`), the form is not
  proved at that point, but f′ may exist there (x·|x| at 0): such a point gives the claim no licence for a hole, and
  if it is isolated in x whatever the other letters are (a condition in x alone), a claim defined there is right
  there by the mean value theorem. Any other (a ≠ 0 from |a·x|, sin x ≠ 0 from |sin x|) must follow from f's own
  conditions.
- `atomAntiderivative` → `{ same, covered }`: F′ ≡ f, and F is defined wherever f is, inside f's domain (at an end, √x
  at 0, only one side counts), not even a point less: ln|sin x| is ∫ cot x, ln(sin x) is not, nor x²/2·(x − 1)/(x − 1)
  ∫ x. An isolated point where F's form has no derivative (x|x|/2 at 0) is fine by the mean value theorem: F is
  continuous there and f is too.
- `derivativeCheck` and `integralCheck` ask the same `covered` of an `'equal'` from the quotient path.

Each implication is a formal match (the same form up to sign, or a power of it), or the exact zero test above; anything
else is not implied. A condition f > 0 also records what f ≠ 0 means (ln(ln x) > 0 gives x ≠ 1).

**Numbers confirm, never prove.** An atom proof is kept only when `numericEqual` shows no point where the two differ
and at least one where both are defined and agree (`confirmed`): an answer defined nowhere is never `'equal'`, and a
fault in the exact reading would show. For a derivative the numbers look only where mathjs's f′ is defined, for an
antiderivative only where f is, and with several letters only where both are (`within`: cand + 0·ref is undefined
wherever ref is), since the numbers tell a removable point from a difference in one letter only. A proof the numbers
contradict is `'unknown'`, not the numbers' `'different'`. `numeric.ts` now evaluates sech, csch, coth, asinh, acosh
and atanh for this.

**Limits.** At most `MAX_ATOMS` (48) atoms in one comparison, nested `MAX_DEPTH` (6) deep, a term of total degree
`MAX_DEGREE` (96), whole powers and root indices up to 64, coefficients of `MAX_BITS` (20 000) binary digits, and
mono's own term limits; past them an answer is not read here. Every loop calls `tick()`, so a public call still stops
at 1.5 s with `'unknown'`. The exact part of a school derivative takes a few milliseconds; the confirming numbers take
most of the rest.

**Reviews (12 Oct).** gpt-5.4 round 1: one MUST, the hole above, for derivatives and antiderivatives (and the quotient
path had it too); fixed test first, and closed in round 2 with no new 'equal' found. Gemini: no MUST in round 1; in
round 2 it called (x² + 1)/(x² + 1) as d/dx x a wrong 'equal', but x² + 1 has no real zero, so it is 1 on the real
line (pinned in atoms.test.ts).

**Tests.** `tests/check/atoms.test.ts`: right derivatives in many written forms (the engines' own among them) are
`'equal'`; hand-made wrong ones (a dropped chain factor, a sign flip, cos for sin, a coefficient ± 1, a missing term,
u/u′ for u′/u, a domain trick) never are; identities that need more than atoms stay `'unknown'`; the domain cases;
every rewrite; the limits. `atomsDifferential.test.ts` and `atomsDifferential2.test.ts`: 2,000 seeded random
expressions (`elementaryGen.ts`, whose differentiator and double-precision values share no code with `atoms.ts`), each
derivative right and perturbed: a right one is never `'different'`, and a perturbation that doubles show clearly wrong
on f's domain is never `'equal'`; then 300 antiderivatives the same way.

**Scoreboard (G3b's runner, derivatives class, 12 Oct 2026).** SymPy 100 % on both corpora (it was 50 % and 51 %),
Giac 90.3 % on the generator corpus and 93.5 % on the gating one (it was 50 % and 51 %), 0 WRONG for both. Every Giac
answer left unverified is in tan half-angle form (an identity between functions); the rest are its own time-outs.
