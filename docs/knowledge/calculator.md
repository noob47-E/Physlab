# The PhysLab Calculator (Maths screen) and its working

The Maths screen: the calculator line (Numbers, Complex, Bases, Equations, Stats, Table, Matrix, Vectors, Units,
Spreadsheet), "Work it out" (the exact working), and the command bar's solve(). Written by polish part P-CALC (0.9).
Numbers in general are in `numbers.md`; algebra loading in `cas.md`; exact pure maths in `pure-maths.md`.

## File map
- `calc/engine.ts` — `evaluateComp` (one line), `keypadToMath`, `integrate`/series with ONE work budget per line
  (`withOneBudget`), `formatComplex` (the one complex formatter), `polyRoots`, `exactForm`/`toFraction`, `refuseStoring`.
- `calc/evaluateInput.ts` — the screen's route: LaTeX → linear text → engine; `readValueBoxes` (with-values boxes and
  the Variables box), `tangentAt`, `answerStillUnder` (an answer is dropped after a DEG/RAD or base switch).
- `calc/format.ts` — `calcNum`, `calcEng`, `mathFormatOptions` (complex/matrix/unit numbers at 15 figures).
- `calc/roots.ts` — `quadraticRoots`, `orderRoots`, `polynomialRootRows`: THE root order. `calc/labels.ts` — x₁, θ₂ labels.
- `calc/exactComplex.ts` — the complex pair of a quadratic with whole-number or simple-fraction coefficients, written as
  a textbook does (1 ± √7 i, −1/2 ± (√3/2)i) on the = card (`exactQuadratic`), the command bar's equation in x
  (`exactPairFor`, lang/commands/graph.ts) and the Numbers screen's boxes (`exactQuadraticOf`, panels/calcModes.tsx).
  It is exact from the typed text, and said only when it agrees with the search's numbers; anything else keeps the
  decimal pair. Guard: tests/cardExactComplex.test.ts.
- `calc/angle.ts` — `withAngle`: every evaluation runs in the SCREEN's unit and puts the shared mode back.
- `calc/modeLines.ts` — Table, Matrix, Spreadsheet and Units lines (each inside `withAngle`); `calc/sheet.ts` (CIRC),
  `calc/stats.ts` (`predictY` through the curve's own compiler), `calc/units.ts` (unit conversion errors `unitRefusal` and `TYPE_INSTEAD` shared with the bar), `calc/keys.ts`,
  `calc/errors.ts` (one table for unknown functions, unknown names, and engine loading sentences across the bar, calculator and pure math).
- `panels/Maths.tsx`, `panels/calcModes.tsx`, `panels/WorkingView.tsx` — the screen.
- `math/pure/run.ts` (job router, `suggestJob`), `math/pure/complex.ts` (complex numbers, surds, Solve,
  Factorise with i), `math/pure/matrix.ts` (the determinant and inverse of a typed 2 × 2 or 3 × 3 matrix, step by step;
  asked first by `runPure`, so every job gives the same working for a matrix line), `math/pure/store.ts` (Work it out;
  asks SymPy when this engine refuses), `math/latexToMath.ts` (granted regions: fnArg, sqrt, seq, the ×10ˣ mark).

## The rules (invariants)
1. **Root order** (the PhysLab Calculator's): a quadratic's x₁ is the formula's +√ root, real or complex; cubics and
   higher list real roots ascending, then conjugate pairs + first; a repeated root once. Every route (bar, Equations,
   Solve job) agrees.
2. **× only multiplies.** Only the ×10ˣ key's `\mathord{\times}` mark makes one standard-form number (1 ÷ 2×10ˣ3 =
   0.0005); it reaches every route as a plain e-number.
3. **Angle unit.** Every evaluation runs inside `withAngle(screen unit)`; nothing leaves the shared mode changed.
4. **Budgets.** ∫, Σ, Π and x = ? spend ONE budget per line; a line too big is refused in the words of what it is
   built on (no hangs: Σ to 10¹², ∫ of a NaN body).
5. **Exact forms** only when far better than chance (no invented 9968039/4263 for 1350√3).
6. **Answers are mandatory.** Work it out refuses a power past the limit at once (no minute on SymPy), and when SymPy
   cannot answer either the refusal ends "I tried another way as well, and it could not work this out either."
7. **Greek unknowns** read θ in sentences and `\theta` in maths (Solve, Factorise with i); answer labels keep the
   engine's spelling ("theta_1 =") because the command bar reads them.
8. **Sentences raise a power of ten** ("x = 1 × 10⁻⁸", with no-break spaces) — solve() answers in exact LaTeX.
9. **A result belongs to its settings**: the Matrix result and the screen answer are left off after a DEG/RAD switch.
10. **"=" and the working agree on an indefinite integral as antiderivatives** (`calc/working.ts` `antiderivativeAgreement`, then
    `calc/formula.ts` `sameAntiderivative`): the two answers agree when their slopes agree, so a different + C or another form that
    is real on the same stretch is the same answer. A definite integral is still compared as a number, and a derivative keeps its
    exact comparison. The card's engine \log is read as the natural log (the engine's log is ln). Greek letters and subscripts the
    converter glued are split first (ωt is ω·t, a1x is a1·x). Each slope is judged against its own size and its own rounding, never a
    fixed floor, so an integrand of 10⁻⁹ is checked as well as one of 1; a slope smaller than its rounding is left out, and when too few
    points are left the answer is unchecked. The integration letter is read the way the answers' TeX is read (θ is theta, α stays α,
    μ is u, as the converter reads them), and a letter neither answer contains is unknown, never agreed. The points cover each
    stretch a form is real on (x > 2 for 1/(x² − 4)), and six must agree. A name the reader still cannot split is left unchecked,
    never called a disagreement. Tests: tests/integralAgreement.test.ts (the tiny-scale sweep, the Greek letters, the engine's
    \log and \operatorname shapes); the engine's recorded reply is tests/fixtures/engineReplies, not tests/fixtures/calculus.
11. **An integral's differential may carry a Greek letter, and the engine's `\operatorname` name is a function**
    (`math/latexToMath.ts`): ∫ sinθ dθ is an integral in θ (a Latin differential, a Greek command or a Greek glyph),
    where it used to reach the engine as integrate(sin(θ)·d·θ, x) and answer θ·d·x·sin θ — ticked, because the working
    made the same misreading. A name in front of `\operatorname{atan}` gets the same `*` a name in front of `\sin`
    gets, so x·arctan x is read and checked instead of becoming the one name xatan. Tests: tests/latex.test.ts
    (P-PARSE PL: the differential, \operatorname after a name), tests/integralAgreement.test.ts.

## Traps met
- `mathjs` rounds a complex/matrix/unit number with no 15-figure cut (0.35×3 → "1.0"): `mathFormatOptions`.
- Units: `defineUnits` must restore every display system after `createUnit` (2 m × 2 m printed in acres).
- `scopeToObject` copied mathjs's scope wrapper, not its entries: Σ/∫ bodies could not see stored letters or Ans.
- A with-values box must be a NUMBER (true and "2" were stored as 1 and 2).
- The keypad's `\sum_{…}^{…} f = 5` swallows "= 5" into the sum body (latexToMath; P-PARSE).

## Guards
tests/calc.test.ts, latex.test.ts, keys.test.ts, maths.test.ts, pureWorking.test.ts, answerLabels.test.ts,
calcModes.test.ts, casFallback.test.ts, solveSentences.test.ts, matrixWorking.test.ts (the matrix workings).
calcModes.test.ts, casFallback.test.ts, solveSentences.test.ts, integralAgreement.test.ts.
