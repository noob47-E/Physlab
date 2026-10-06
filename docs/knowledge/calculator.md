# The PhysLab Calculator (Maths screen) and its working

The Maths screen: the calculator line (Numbers, Complex, Bases, Equations, Stats, Table, Matrix, Vectors, Units,
Spreadsheet), "Work it out" (the exact working), and the command bar's solve(). Written by polish part P-CALC (0.9).
Numbers in general are in `numbers.md`; algebra loading in `cas.md`; exact pure maths in `pure-maths.md`.

## File map
- `calc/engine.ts` — `evaluateComp` (one line), `casioToMath`, `integrate`/series with ONE work budget per line
  (`withOneBudget`), `formatComplex` (the one complex formatter), `polyRoots`, `exactForm`/`toFraction`, `refuseStoring`.
- `calc/evaluateInput.ts` — the screen's route: LaTeX → linear text → engine; `readValueBoxes` (with-values boxes and
  the Variables box), `tangentAt`, `answerStillUnder` (an answer is dropped after a DEG/RAD or base switch).
- `calc/format.ts` — `calcNum`, `calcEng`, `mathFormatOptions` (complex/matrix/unit numbers at 15 figures).
- `calc/roots.ts` — `quadraticRoots`, `orderRoots`, `polynomialRootRows`: THE root order. `calc/labels.ts` — x₁, θ₂ labels.
- `calc/angle.ts` — `withAngle`: every evaluation runs in the SCREEN's unit and puts the shared mode back.
- `calc/modeLines.ts` — Table, Matrix, Spreadsheet and Units lines (each inside `withAngle`); `calc/sheet.ts` (CIRC),
  `calc/stats.ts` (`predictY` through the curve's own compiler), `calc/units.ts`, `calc/keys.ts`, `calc/errors.ts`.
- `panels/Maths.tsx`, `panels/calcModes.tsx`, `panels/WorkingView.tsx` — the screen.
- `math/pure/run.ts` (job router, `suggestJob`), `math/pure/complex.ts` (complex numbers, surds, Solve,
  Factorise with i), `math/pure/store.ts` (Work it out; asks SymPy when this engine refuses), `math/latexToMath.ts`
  (granted regions: fnArg, sqrt, seq, the ×10ˣ mark).

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

## Traps met
- `mathjs` rounds a complex/matrix/unit number with no 15-figure cut (0.35×3 → "1.0"): `mathFormatOptions`.
- Units: `defineUnits` must restore every display system after `createUnit` (2 m × 2 m printed in acres).
- `scopeToObject` copied mathjs's scope wrapper, not its entries: Σ/∫ bodies could not see stored letters or Ans.
- A with-values box must be a NUMBER (true and "2" were stored as 1 and 2).
- The keypad's `\sum_{…}^{…} f = 5` swallows "= 5" into the sum body (latexToMath; P-PARSE).

## Guards
tests/calc.test.ts, latex.test.ts, keys.test.ts, maths.test.ts, pureWorking.test.ts, answerLabels.test.ts,
calcModes.test.ts, casFallback.test.ts, solveSentences.test.ts.
