# Numbers, rounding, marking floors and typed maths

How PhysLab writes a number, reveals a known answer, marks a typed one and reads typed maths. Written by polish part
P-NUM (0.9). Every number a student sees goes through `math/format.ts`; never call `toFixed`/`toPrecision`/
`toExponential` on a shown number (AGENTS.md rule 4).

## File map
- `math/format.ts` — the writers and the rounding rule:
  - `fmt`/`tex` (decimal places), `fmtPrecise`/`texPrecise` (the student's d.p. or s.f.), `fmtSci`/`texSci` (scientific form, no noise floor), `formatMeasure`/`texMeasure` (with units), `measureNumber` / `texMeasure(…, false)` (the same number without its unit — never cut the unit off with a regex), `fmtIJK`/`texIJK` (vectors), `toDMS`;
  - `roundSig` (n significant figures, raised powers: the Calculator's sig-fig card) and `sciNotation` (the Measure card's scientific form, the typed number's own figures);
  - `roundHalfAway`, `toFixedHalfAway`, `toPrecisionHalfAway`, `toExponentialHalfAway` — THE rounding rule;
  - `fmtLabel`/`superscriptPowers` — the label form;
  - `revealPrecision`, `noiseFloor`, `stepPrecision`, `shownValue` (reads a shown number back).
- `calc/format.ts` — the Calculator's number, a layer over math/format.ts: `calcNum`, `calcEng`, `exponentForm`, and the one complex-number writer `formatComplex` / `formatImaginary` (2i, −i, −2 + 3i; moved from calc/engine.ts in CW3 — math/format.ts cannot hold it, since it would import `calcNum` back).
  - `mathFormatOptions` hands complex numbers, matrices and units to mathjs, which rounds the shortest string without the 15-figure cut (its callers are P-CALC's).
- `math/checkAnswer.ts` — `near` (the one right/wrong comparison of a typed number) and `expectedText` (Practice's reveal).
- `questions/answerKinds.ts`:
  - the vector, roots and matrix markers and their floors;
  - `format2AnswerTex` (reveal of vector, roots and matrix answers);
  - `statedAnswerTex` (the "value ± u" form).
- `questions/ecf.ts` — `earlierIsRight` (error carried forward) uses the same floor.
- `questions/answerText.ts` — the readers of typed vector, matrix and set answers; a private `readPlainNumber` reads a number exactly.
- `questions/units.ts` — `formatQuantity` and `revealSettings`, for number parts.
- `math/expr.ts` — `preprocess`, `infixToCall` and the operand scanners, `dot`, `timesOrCross`: every typed line (bar, answer boxes, Lab Data, vector calculator) passes through here before mathjs.

## The rules (invariants)
1. **Rounding.** Step 1: the decimal the student typed or saw is `String(v)` (the shortest decimal that is the double), cut to 15 significant figures half away from zero — a calculator holds 15, and this only strips binary noise (0.35×3 = 1.0499999999999998 is 1.05; sin 30° is 0.5). Step 2: round that decimal half away from zero in digit arithmetic, with carries. A result that rounds to zero is never signed. Every writer keeps its output form; `fmt`, `tex`, `fmtPrecise` write |v| < 10⁻¹² as 0 (a dragged point), `fmtSci` has no floor (a known 1.6×10⁻¹⁹ is never 0).
   Speed: `toFixedHalfAway`/`toPrecisionHalfAway` take the built-in result only when the scaled value is provably away from a halfway point (the margin proof sits above `scaledAwayFromTie`); everything else goes the exact way. The two must never differ by a character.
2. **Plain or scientific.** `fmtPrecise` and the upper threshold of `fmt`/`tex` decide on the ROUNDED value (999 999 999.996 at 2 d.p. is 1×10^9); the lower threshold of `fmt` stays on the raw value so small values keep their figures.
3. **Marking floor.** `noiseFloor(v, largest = v)` = 10⁻⁹ × max(|v|, 10⁻⁶ × |largest|), added to the stated half-width. It is relative, never absolute: a 1.6×10⁻¹⁹ C answer at 2 % never accepts 0, while 0.1 + 0.2 accepts "0.3". For several numbers (vector, roots, matrix) `largest` is the answer's largest |value|, so a computed zero among O(1) numbers is accepted; 10⁻⁶ keeps roots 2 and 10⁹ apart. An answer that is not a finite number marks nothing right. An answer of exactly 0 needs the author's own tolerance (docs/ACCURACY.md).
4. **Reveal.** `revealPrecision(v, tol, s, show)`:
   - with a band (tol > 0): the student's precision if its rounding stays within tol/2, else 3, 4 … up to 15 s.f.;
   - marked exactly (tol ≤ 0): the student's precision if it reads back as v at 15 figures, else the FEWEST s.f. that do (an exact 12 is "12", never "12.0" or "10");
   - vector, roots and matrix answers reveal each component this way; binary noise beside the largest value shows as 0, and a zero vector keeps its unit;
   - typing the revealed text back is marked right.
5. **The ± form** rounds the uncertainty to 1 s.f. (2 when it starts with 1) and the value to that same place, also tens or hundreds (889.3 ± 220 is 900 ± 200).
6. **Typed maths** (`preprocess`):
   - ^ binds before ×, · and /, and those three group left to right: 2×3^2 = 18, 1/2×3 = 1.5, ½mv² typed as 1/2×m×v^2 works.
   - A number literal is read whole, e-notation included (2×1.6e-19 = 3.2e-19), but "rate-2" is not an exponent.
   - a×10ⁿ written with ×, · or ⋅ is ONE number, as a scientific calculator's ×10ˣ (standard form) key enters it, and as PhysLab prints numbers: 12.5×10^3 = 12500 and 1/2×10^3 = 0.0005. With `*` it is plain multiplication: 1/2*10^3 = 500.
   - Superscript runs are exponents (2⁴, 10⁻³).
   - % always means percent, ÷100 (50% + 2 = 2.5); modulo is written "mod".
   - `dot` multiplies two numbers and scales a vector; `timesOrCross` multiplies complex scalars; vector cross and dot are unchanged.
7. **Readers.** `readPlainNumber` reads plain, e-notation and ×10 forms (×, x or *, caret or superscript exponent) exactly ("<m>e<n>", never m × 10ⁿ), so the reveal's own text reads back. A matrix cell still refuses general expressions.
8. **Label form.** `fmtLabel(v, p)` writes what `fmt`/`fmtPrecise` write, but a power of ten as " × 10" with superscript digits (8.89 × 10¹⁹), never "^". `superscriptPowers(text)` does the same to an already formatted string. `fmt`/`fmtPrecise`/`fmtSci` keep the caret form, because `shownValue`, `sciExponent` and `toTex` parse it back.

## Traps met, and the test that guards each
- `toFixed`/`toPrecision`/`toExponential` round the binary double: 2.675 → 2.67, 25.37 ÷ 20 → 1.268 at 4 s.f. Guarded by tests/format.test.ts › "P6 — …" and the 46-case table recomputed by two crew models.
- Dividing by 10^e before rounding adds binary error (`exponentForm`, `calcEng`, `statedAnswerTex`'s first figure). Guarded by format.test.ts P6.
- The exact path alone is ~4× slower than the built-in; a 1.6-million-call Sandbox clock test timed out under load. Guarded by format.test.ts › "P6 speed — …" (320 000 seeded values against the exact rule) and glmfixRender.test.ts #8.
- A carry decided on a raw double: `toDMS` 59.995″ read 59.99″. Guarded by format.test.ts (toDMS).
- An absolute floor of 10⁻⁹ swamps tiny SI answers. Guarded by checkAnswer, answerKinds and ecf tests › "P21b …".
- `noiseFloor(∞)` was ∞, so an infinite answer marked every number right. Guarded by checkAnswer.test.ts › "P21d …".
- Tolerance 0 revealed at the student's precision: 12 was shown as "10" and then marked wrong. Guarded by questionReveal.test.ts › "P21 …".
- The ×10 rule:
  - took one mantissa digit, so 12.5×10^3 read 2500;
  - ran after the ²/³/⁻¹ rewrites, so 1.6×10⁻¹² read 0.0256.
  Guarded by tests/exprPrecedence.test.ts.
- × bound tighter than ^ and /: 2×3^2 = 36, and 1/2×4×3^2 = 0.0017. Guarded by exprPrecedence.test.ts.
- The e of a number literal was scanned as a name: 2×1.6e-19 = −10.3. Guarded by exprPrecedence.test.ts.
- `texPrecise`/`texSci` passed "undefined"/"∞" into LaTeX. Guarded by format.test.ts › H2.
- `fmt` chose its form before rounding. Guarded by format.test.ts › H3.
- A vector component that rounds to 0 kept its sign ("1i − 0j"). Guarded by format.test.ts › H4.

## Tests
tests/format.test.ts · questionReveal · checkAnswer · answerKinds · ecf · content · practiceTolerance · exprPrecedence.

## The one writer (CLEANUP-PLAN.md CW3)
Every number a student sees goes through math/format.ts (or calc/format.ts, built on it). A `toFixed`,
`toPrecision` or `toExponential` anywhere else fails lint (the files on the fence's interim list in eslint.config.js
excepted until their part moves them), unless the line says why it is not for display
(`// eslint-disable-next-line no-restricted-syntax -- …`: CSS lengths, keys, log lines, tidying a double before
it is used as a number). Which to call: a measure with its unit → `formatMeasure`/`texMeasure`; its number alone →
`measureNumber` / `texMeasure(…, false)`; a plain number in the student's precision → `fmtPrecise`/`texPrecise`;
a Calculator number → `calcNum`; a complex number → `formatComplex`; a label → `fmtLabel`.

Traps met in CW3: the old way to get a number without its unit cut the last word off a written measure — a
unit of two words would lose only its last (the bar keeps only the first word of `10 N m` today:
tests/cw3-found/vectorTwoWordUnit.test.ts); and TeX cut out of `answerTex` kept the space after `\approx`,
harmless to KaTeX but not to a string comparison.

## Not yet on the rule
- the Calculator panel's keypad converter, which turns any "×10" into a power (calc/engine.ts:14; P-CALC)
- a vector's full label still cuts the unit off its components' amounts (render/Labels.tsx): safe while units are
  one word (see the trap above).
- Parsing typed maths: [parsing.md](parsing.md).
