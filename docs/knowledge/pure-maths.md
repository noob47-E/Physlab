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
| `limits.ts` | `MAX_TRIAL` and `TOO_BIG_TO_SEARCH`: the ceiling on any search that grows with a number's size. (Not the calculus limit: that is `limitWorking.ts`.) |
| `limitWorking.ts` | The limit job (lim(f, x, a[, side]), the Calculator's "=" and Work it out): the answer and its working, with each answer checked against the function's values next to the point. Reads through `math/limitCall.ts` and checks with `math/limitSamples.ts`. |
| `integers.ts` | Prime factorisation (division ladder), HCF and LCM of whole numbers. |
| `algebraHcf.ts` | HCF and LCM of algebraic expressions (factorise, then common factors). |
| `factor.ts` | Factorise step by step, methods in the order taught (common factor, difference of squares, quadratics, substitution, factor theorem); `factorAll`. |
| `cxpoly.ts` | Exact surd + i arithmetic for factorising over the complex numbers. |
| `complex.ts` | The Complex job (`i` parsed as a letter, i² replaced after expanding), and the door to `complex/`: it re-exports the other jobs and the decimal check, so importers use `./complex` as before. A part never imports it. |
| `complex/numbers.ts` | Exact complex numbers and their TeX, powers of i, numbers with square roots and i (`IPoly`, `Frac`), and the check against a decimal (`agreesNumerically`). |
| `complex/parse.ts` | Reading a typed line exactly (`readFrac`, `readLine`, `scan`, rounded literals), and the sentences for what it cannot read (`CannotHold`). |
| `complex/write.ts` | Writing: the decimal answer (`finishComplex`), a surd and a typed line in TeX (`typedTex`), the pieces of a real surd, and the steps that writing needs (`rootsMove`, `rationalise`). |
| `complex/surds.ts` | The Complex job's working for a line with square roots (`surdComplexWorking`), and Simplify surds' entry for a line with no i (`isSurdLine`, `surdWorking`). |
| `complex/real.ts` | Simplify surds for a line with no i: the `Pencil` that works it out step by step, and `realSteps`. |
| `complex/solve.ts` | Solve (a linear or quadratic equation) and Factorise with i (`solveQuadraticWorking`, `factoriseComplexWorking`). |
| `divide.ts` | Algebraic long division with the running commentary. |
| `partial.ts` | Partial fractions (cover-up and comparing coefficients). |
| `latexCheck.ts` | Reads a displayed answer back (`splitDisplayedSum`) so the check looks at what is shown. |
| `trigIdentity.ts` | Trig-identity proofs by a two-ended search over allowed rewrites. |
| `trig/canonical.ts`, `trig/write.ts`, `trig/read.ts`, `trig/rules.ts`, `trig/search.ts` | Its parts (CW10d): the canonical form and its arithmetic, printing, reading the student's text, the allowed rewrites, the search. `trigIdentity.ts` keeps the Working and re-exports what the tests use. |
| `normal.ts` | Φ(z), its tail and inverse. |
| `table.ts` | The printed four-place Φ table as a student reads it (`toPlaces`, cell values). |
| `zscore.ts` | Normal-distribution questions worked with the table. |
| `zscoreDistractors.ts` | Wrong answers for choice questions, one misconception each (follows the questions part). |
| `store.ts` | Working-panel state and history; `engineRequestFor`/`stepsRequest` build the algebra engine's requests (math/engine). The rule-tree reader for Integrate and Differentiate lives with the SymPy adapter (math/engine/sympy/calculusSteps.ts). |
| `reveal.ts` | Panel decisions kept testable without a browser. |

## Data flow
1. Typed line → `preprocess` (math/expr.ts: θ → `theta`, π → `pi`, − → -) → `writeTimes`
   (side-by-side letters → products; `x(` → `x*(`) → mathjs tree → `fromNode` → `Expr` on `Rat`.
2. The tool works on `Expr`/`poly`, writing moves as it goes; every number goes through `Rat` or
   `math/format.ts`, never `toFixed`.
3. The answer is shown only after a check (expand back, multiply back, or `latexCheck` reading the
   displayed sum); a failed check says so in words.
4. Calculus goes through the algebra engine: `stepsRequest` (store.ts) → `workSteps` (math/engine)
   → the SymPy adapter → worker → rule tree → `math/engine/sympy/calculusSteps.ts` → working.

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
- Pure Maths' and the answer labels' Greek letters come from one list, `math/names.ts`
  (`GREEK_LETTERS`: 24 spelt names with their letters; `CONSTANT_NAMES`: e, E, pi, i, Infinity). Each
  place that uses it says which letters it reads:
  - `writeTimes` (mono.ts) keeps all 24 whole.
  - The calculus route (store.ts `spelledOut`, `calculusVariable`) spells and keeps only the twelve
    it was built with (θ α β γ φ ω λ μ τ σ ρ ψ).
  - The answer labels (calc/labels.ts) know 22 (not pi, a number, and not omicron, which is parked
    as CW6c-2).
  - Widening a subset changes what a student sees, so it is an [answer may change] item.
- Copies outside this area that do not read the list yet:
  - the bar's 22 names (lang/commands/solve.ts `PURE_WORDS`);
  - the LaTeX readers' command maps (math/latexToMath.ts:128 and questions/speak.ts:28), which
    disagree on `\vartheta`: θ in one, ϑ in the other;
  - the HTML entities of the Numbas importer (questions/numbas.ts:609);
  - the engine's own spellings (lamda, `SYMPY_GREEK`, math/engine/sympy/calculusSteps.ts).

## Traps (each guarded by a test)
- `ab` was one variable named "ab" — `writeTimes` now splits letter runs, but keeps mathjs names
  (sin, sqrt, pi, e, Infinity) and Greek names whole, also `theta` inside a run (2aθ → 2·a·θ).
  `tests/pureWorking.test.ts` (af-ub block), `tests/commands.test.ts` (θ² = 4).
- ∞ from the Maths field is the mathjs word `Infinity`; SymPy split it into I·n·f·i·n·i·t·y. The
  request keeps ∞ / `Infinity` (PhysLab spelling) and the SymPy adapter spells it `oo`, never
  `spelledOut`, because `calculusVariable` would read `oo` as the letter o. `tests/calculusSteps.test.ts` (af-ue block, U16).
- `commonFactor` is a hub (Factorise, grouping, Partial Fractions): changing its sign rule put a
  false line "x-1(x + 1)" in Factorise working. Partial Fractions moves a single-term factor's
  number (−x, −2x) into its constant itself instead (U11). `tests/pureWorking.test.ts` (af-ub block) U11 follow-up.
- Chip letters come from `chipLetter`/`sumPair`/`chainChip` in math/engine/sympy/calculusSteps.ts, never written in
  literally (U15). `tests/calculusSteps.test.ts` (af-ue and af-ue2 blocks).
- Long division used to stop at 65 terms and call the rest a remainder (U4). `tests/pure.test.ts` (af-uc block).
- `latexCheck` must split a displayed answer exactly as the producer wrote it (`\dfrac` pieces,
  `\frac` coefficients inside the whole part) or a correct answer is marked suspicious (U10).
  `tests/pureWorking.test.ts` (af-ud block).
- Rule chips must not use the student's own variable as their constant letter (U15).
- Table rounding goes through `roundHalfAway` (math/format.ts), never `Math.round(v·10ⁿ)/10ⁿ` (U18).

## Tests
`tests/pure.test.ts`, `pureWorking`, `pureRender`, `pureStore`, `complexFactor`, `stepTruth`,
`calculusSteps`, `calculusWired`, `trigSteps`, `zscore`, `contracts`, `nameList` (every name and Greek
reader pinned over one corpus; the parked CW6c items as it.fails); the old batch files `af-ua` … `af-uf` and `af-ue2` now sit in these suites as blocks named after them.
After any change to `rat.ts` or `mono.ts`, run all of them.
