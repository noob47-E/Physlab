# Pure Maths (Working panel) — code knowledge

What the area does: the **Working** panel's Pure Maths tools (Factorise, Expand, Divide, Partial
Fractions, HCF/LCM of numbers and of algebra, complex numbers, trig identities, normal-distribution
questions, and the step-by-step calculus that the CAS worker answers) turn one typed line into
textbook working: a title, numbered moves (KaTeX), the answers, and a check. Everything algebraic is
worked out on **exact bigint fractions**, never on JavaScript numbers, and nothing is shown until it
has been checked.

## File map (all under `src/renderer/src/math/pure/`)
| File | One line |
|---|---|
| `run.ts` | One way in to every tool: `JOBS` (the panel draws its buttons from it) and `runPure(job, text)`. Owned by the calculator part while it runs. |
| `work.ts` | The `Working` shape every tool returns (title, input, moves, answers, checked, error). |
| `rat.ts` | Exact fractions on bigint (`Rat`, `rFromNumber`, `rAdd`…). Hub: every tool uses it. |
| `mono.ts` | Expressions as sums of monomials (`Expr`/`Term`): the parser (`parseExpr`, `writeTimes`, `fromNode`), `ePow`, `commonFactor`, `exprTex`/`varTex`. Hub: every algebra tool uses it. |
| `poly.ts` | One-variable polynomials over `Rat`, smallest power first; what long division and root search use. |
| `limits.ts` | `MAX_TRIAL` and `TOO_BIG_TO_SEARCH`: the ceiling on any search that grows with a number's size. |
| `integers.ts` | Prime factorisation (division ladder), HCF and LCM of whole numbers. |
| `algebraHcf.ts` | HCF and LCM of algebraic expressions (factorise, then common factors). |
| `factor.ts` | Factorise step by step, methods in the order taught (common factor, difference of squares, quadratics, substitution, factor theorem); `factorAll`. |
| `cxpoly.ts` | Exact surd + i arithmetic for factorising over the complex numbers. |
| `complex.ts` | Complex-number working (`i` parsed as a letter, i² replaced after expanding). Owned by the calculator part while it runs. |
| `divide.ts` | Algebraic long division with the running commentary. |
| `partial.ts` | Partial fractions (cover-up and comparing coefficients). |
| `latexCheck.ts` | Reads a displayed answer back (`splitDisplayedSum`) so the check looks at what is shown. |
| `calculusSteps.ts` | Turns the CAS worker's `integral_steps`/`diff_steps` rule trees into working; rule chips; `definiteAnswers`. |
| `trigIdentity.ts` | Trig-identity proofs by a two-ended search over allowed rewrites. |
| `normal.ts` | Φ(z), its tail and inverse. |
| `table.ts` | The printed four-place Φ table as a student reads it (`toPlaces`, cell values). |
| `zscore.ts` | Normal-distribution questions worked with the table. |
| `zscoreDistractors.ts` | Wrong answers for choice questions, one misconception each (follows the questions part). |
| `store.ts` | Working-panel state and history; `casRequestFor`/`stepsRequest` build the CAS worker payloads. |
| `reveal.ts` | Panel decisions kept testable without a browser. |

## Data flow
1. Typed line → `preprocess` (math/expr.ts: θ → `theta`, π → `pi`, − → -) → `writeTimes`
   (side-by-side letters → products; `x(` → `x*(`) → mathjs tree → `fromNode` → `Expr` on `Rat`.
2. The tool works on `Expr`/`poly`, writing moves as it goes; every number goes through `Rat` or
   `math/format.ts`, never `toFixed`.
3. The answer is shown only after a check (expand back, multiply back, or `latexCheck` reading the
   displayed sum); a failed check says so in words.
4. Calculus goes through the CAS worker: `stepsRequest` (store.ts) → worker → rule tree →
   `calculusSteps.ts`.

## Invariants
- Exact: no float ever enters an `Expr`. mathjs reads every typed number as a double, so
  `readNode` refuses a number with more than 15 significant digits (its digits are already gone),
  and `rFromNumber` reads what is left exactly, e-notation included (U2).
- Answers are mandatory: every route ends with an answer or a sentence (`error`), never neither (U14).
- A search that scales with a number carries `MAX_TRIAL` and reports `tooBig`; a `tooBig` result
  is never presented as a confident answer (U1).
- A power above `MAX_POWER` (1000, mono.ts), or one whose expansion passes `MAX_TERMS` (2000), is
  refused in words: powers are multiplied out on the renderer's thread (H1).
- Pure Math variables are single letters; a Greek letter's name (`theta`, …) counts as one letter,
  and `varTex` prints a multi-letter name as `\name`.

## Traps (each guarded by a test)
- `ab` was one variable named "ab" — `writeTimes` now splits letter runs, but keeps mathjs names
  (sin, sqrt, pi, e, Infinity) and Greek names whole, also `theta` inside a run (2aθ → 2·a·θ).
  `tests/af-ub.test.ts`, `tests/commands.test.ts` (θ² = 4).
- ∞ from the Maths field is the mathjs word `Infinity`; the worker only knows `oo`/`inf`, and split
  it into I·n·f·i·n·i·t·y. `stepsRequest` sends `oo`, but never inside `forSymPy`, because
  `calculusVariable` would read `oo` as the letter o. `tests/af-ue.test.ts` (U16).
- `commonFactor` is a hub (Factorise, grouping, Partial Fractions): changing its sign rule put a
  false line "x-1(x + 1)" in Factorise working. Partial Fractions moves a single-term factor's
  number (−x, −2x) into its constant itself instead (U11). `tests/af-ub.test.ts` U11 follow-up.
- Chip letters come from `chipLetter`/`sumPair`/`chainChip` in calculusSteps.ts, never written in
  literally (U15). `tests/af-ue.test.ts`, `af-ue2.test.ts`.
- Long division used to stop at 65 terms and call the rest a remainder (U4). `tests/af-uc.test.ts`.
- `latexCheck` must split a displayed answer exactly as the producer wrote it (`\dfrac` pieces,
  `\frac` coefficients inside the whole part) or a correct answer is marked suspicious (U10).
  `tests/af-ud.test.ts`.
- Rule chips must not use the student's own variable as their constant letter (U15).
- Table rounding goes through `roundHalfAway` (math/format.ts), never `Math.round(v·10ⁿ)/10ⁿ` (U18).

## Tests
`tests/pure.test.ts`, `pureWorking`, `pureRender`, `pureStore`, `complexFactor`, `stepTruth`,
`calculusSteps`, `calculusWired`, `trigSteps`, `zscore`, `contracts`, and the batch files `af-ua` … `af-uf`, `af-ue2`.
After any change to `rat.ts` or `mono.ts`, run all of them.
