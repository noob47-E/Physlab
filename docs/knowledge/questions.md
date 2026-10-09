# Questions: reading, marking, revealing and playing a question

How a question set (.pqjson, or a Numbas .exam through `questions/numbas.ts`) is read, drawn, played, marked and
revealed. Written by polish part P-FIX-QUESTIONS (0.9). Numbers and floors are in `numbers.md`; the importer in
`numbas.md`.

## File map
- `questions/pqjson.ts` — the file format: `parsePQFile` checks every field a teacher's file may hold (choices, traps,
  steps, picture, Sandbox, motion, ECF) and refuses a damaged one in words; `bandOf` reads a tolerance.
- `questions/variables.ts` — `drawVariables` (ranges, lists, formulas, conditions), seeded; `conditionHolds`.
- `questions/player.ts` — `playQuestion` makes a played question (prompts, fields, picture, Sandbox plan, motion);
  `checkPlayedPart` marks one part.
- `questions/parts.ts` — number and expression parts (`checkNumberPart`, `checkExpressionPart`, `toAbsoluteTol`).
- `questions/answerKinds.ts` — vector, roots, matrix and stated (± u, Eₙ) parts, and `format2AnswerTex`, their reveal.
- `questions/answerText.ts` — the readers of typed vector, set, matrix and stated answers; `evalNumber`, `xAsTimes`.
- `math/checkAnswer.ts` — `parseAnswer` and `checkAnswer` (number answers, traps, the power-of-ten hint).
- `questions/ecf.ts` — error carried forward (`markWithECF`, `earlierIsRight`).
- `questions/steps.ts` — worked steps into the Working panel (`stepsToWorking`), the revealed answers (`answerFor`),
  the plain label of a prompt (`spokenOf`), `texText`.
- `questions/autoVisual.ts` — the automatic picture of a question (SUVAT, projectile, free body, normal regions, curves).
- `questions/units.ts` — units in answers (`unitFromTail`, `revealSettings`, `texQuantity`).
- `panels/Practice.tsx` — Problem Sets; `panels/solverState.ts` — the vector solver's and Practice's pure decisions.

## The rules (invariants)
1. **Degrees.** Every question is set in degrees, whatever the calculator was last left in: answers, conditions,
   expression parts (`inDegrees`). A degree sign in an expression answer is a unit, never a stray letter.
2. **A damaged file is refused in words** at open (`parsePQFile`), never a crash later in the player.
3. **Marking floors are relative** (`math/format.ts noiseFloor`). A zero worked out with trig (F + F cos 120° +
   F cos 240°) is a zero in the reveal because each component's noise is measured against the TERMS ITS OWN FORMULA
   ADDS (`addedScale`), never against the largest input: the force qE on an electron (1.6×10⁻¹⁵ N, E = 10⁴) is
   the answer, not "0 N".
4. **A stated answer of 0** against a reference of 0 is judged by Eₙ; a stated uncertainty more than 1/max times
   the reference's own is refused, naming the uncertainty. Against a non-zero reference "0 ± u" is refused.
5. **ECF** compares and carries the earlier answer in the variable's unit; an earlier answer right within ITS OWN
   band (number, roots or vector part) is not carried, so no note and no penalty.
6. **Typed numbers**: thousands commas, Unicode minus, an x for × only in the shape `3x10^8` / `6.63x10⁻³⁴`
   (`xAsTimes`), and the no-break spaces PhysLab itself writes round × (JS `\s` covers U+00A0 and U+202F) all read.
7. **Hints**: "Right digits, wrong power of ten" only when the shifted answer and its band are finite numbers.
8. **Variables**: a range lists the values left when a hundred draws all hit excluded ones; only an empty list is the
   author's problem. A condition fails on NaN and on ±∞.
9. **Reveal in KaTeX**: a choice is set in `\text{}`; the symbols KaTeX draws only in maths (∑ ∏ ∫ ≠ ∉ ∌) are set as
   maths inside it (`texText`).
10. **Plain labels**: a prompt's maths is spoken by the importer's reader (`numbas.ts speakTex`) — `texToPlain`
    deletes unknown commands and lost ∩, ⊆, ∈ and escaped braces.
11. **Show it** in Practice brings the tab it switched to forward (Sandbox, Lab Data: `panelToFront`).

## Traps
- `texToPlain` (math/pure/work.ts) is for PhysLab's own generated text; foreign LaTeX goes through `speakTex`.
- The bundled school-maths bank and the external Question Pack (`PhysLab-content\PhysLab Question Pack.pqjson`)
  must hold the same questions exactly (tests/content.test.ts): edit both, back the pack up first.
- vitest has no DOM: a panel decision worth testing goes into a pure function (`solverState.ts`), plus a browser check.
- An expression part's sampled check took anything under an absolute 10⁻¹² as zero, so "0" was right for 10⁻¹⁴·x.
  A side that is exactly 0 is now held to noise RELATIVE to the terms that cancelled and the formulas' size across
  the sample (`termScale`, `noiseFloor`) — tests/fb2-marking.test.ts.
- Shown text raises its powers: `formatQuantity`, `expectedText`, the ODE sentences and `plainFormula` (every whole
  power; `preprocess` reads them back). `revealSettings` tests the CARET form (`quantityNumber`), because
  `shownValue` reads that form — tests/fb2-carets.test.ts (guard sweep) and tests/rawPowers.test.ts.
- A reveal says what the marker accepts: a repeated root once unless `multiplicity`; a Lego part "the target
  shape"; a choice part with no right option "none of the choices is right." (`NO_RIGHT_CHOICE`) —
  tests/fb2-reveal.test.ts, tests/fb2-lego-reveal.test.ts.
- Answer readers (`answerText.ts`) take "+ -" with spaces as ±, one bracket pair round a set, "- 1/2", the zero
  vector "0", units on both halves of a stated value (two different ones refused in words) and "(a ± b)e-19" —
  tests/fb2-answer-reading.test.ts.

## Guards
tests/zeroAnswers.test.ts, tests/vectorAnswerReading.test.ts, tests/playerGuards.test.ts, tests/answerTimesSign.test.ts,
tests/ecfUnits.test.ts, tests/questionSteps.test.ts, tests/solverState.test.ts, tests/content.test.ts, tests/fb2-*.test.ts.
