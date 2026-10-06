# Numbas import and export

`src/renderer/src/questions/numbas.ts` reads a Numbas `.exam` (a one-line version comment, then exam JSON holding
question objects) into a PhysLab question file (`.pqjson`), and writes a PhysLab set back in the same shape. The
teacher's Open dialog in Problem Sets uses it, and so does the harvest of the public bank in
`C:\my_projects\PhysLab-content\numbas\` (scripts and README in its `scripts\`). A question PhysLab cannot use is
skipped whole, never half-imported, and the report says why in one plain sentence. Written by polish part P-NUMBAS (0.9).

## File map
- `tokenize`, `JmeParser`, `parseJme` — the JME tokenizer and recursive-descent parser; anything outside the accepted
  subset throws `JmeRefusal` (a sentence, never a stack trace).
- `jmeToMath`, `emit` / `emitBinary` / `emitCall`, `TrigMode` — JME → mathjs text: trig, log, rounding, `if`, and the
  function-name differences.
- `jmeToVariableDef` — a JME variable definition (`random(a..b#s)`, lists, `except`) → a `VariableDef` range, list or
  formula; ranges whose ends are other variables become `randomRange`.
- `htmlToLines`, `liftMaths` / `MATHS_START` / `restOfParagraph` / `closeOf`, `chipText` / `chipFor` / `chipLatex`,
  `spoken`, `ENTITIES` / `decodeEntities` — Numbas HTML → statement lines: maths spans are lifted FIRST, then
  `\var{…}` / plain-text `{…}` slots become chips, entities are decoded.
- `readParts` / `readOnePart`, `readNumberAnswer`, `readMatrixPart`, `readChoicePart`, `readSteps` — PQ parts and
  worked steps; the tolerance comes from the min/max bounds and the precision settings.
- `toExam`, `partToNumbas`, `numberEntry`, `gapfill`, `mathToJme` (with `dotsToProducts`), `textToHtml`, `jmeNumber` —
  PQ file → Numbas exam JSON.
- Tests: `tests/numbas.test.ts` (import, export, round trips) and `tests/numbas2.test.ts`.

## Data flow
- Import: exam JSON → licence gate → variables (`jmeToVariableDef`) → statement and prompts (`htmlToLines`) → parts →
  a `PQFile` plus a report of skipped questions with one-sentence reasons.
- Export: `PQFile` → exam JSON; `mathToJme` undoes the JME → mathjs translations, `numberEntry` writes the band into
  `minValue` / `maxValue`, a vector or roots part becomes a gapfill whose prompt ends "Give your answer in <unit>.",
  and a dollar sign in the words goes out as `\$`.

## Invariants
- A question the importer cannot read fully is skipped with one sentence (`\simplify`, `\var[options]{}`, scripting,
  unknown functions), never shown half-read or with raw LaTeX in the words.
- Maths is found the way Numbas and MathJax find it: `$$`, `$`, `\(`, `\[`, `\begin{env}`; never across a paragraph;
  `\$` is a dollar sign; a `$` inside a tag or attribute is not maths; a lone `$` is a dollar sign unless LaTeX follows
  it in the same paragraph (comments and line breaks there do not count).
- `{…}` inside maths is LaTeX grouping, never a value slot; an escaped `\{…\}` in words is a literal brace.
- JME's `log(x, b)` is the calculator's `log(b, x)` (`math/expr.ts` defines log(a, b) as log base a of b), so import
  swaps the arguments and export swaps back.
- JME trig is radians while PhysLab's own `sin(e)` is degrees: `TrigMode 'radians'` for numbers and variables; `'same'`
  for expression parts, where the student types in the convention the answer is checked in, so an author's own
  `* 180 / pi` stays.
- JME function names are case-insensitive (`Random`, `Sin`); variable names are kept as written.
- Equal `minValue` / `maxValue` mean EXACT: absolute 0 plus the app's relative noise floor (wave-head decision
  2026-10-03, as e3132c0 did for matrices). A dp / sig-fig precision gives a half-unit band; a precision the importer
  cannot read (a variable's name) falls back to 2 % with a note. Otherwise the midpoint and a constant gap or fraction
  are recovered, falling back to 2 % with a note.
- A matrix's relative band has no fixed-gap form: export writes tolerance 0 (a plain Numbas install checks exactly)
  plus a `[physlab:tolerance=relative:…]` marker in `precisionMessage`, which import reads back in preference to the 0.
- `·` with a number on either side exports as JME `*` (JME's `dot()` takes vectors only).

## Traps met (each guarded by a test in tests/numbas.test.ts)
- LaTeX groups inside `$…$` were read as `{…}` value slots and became made-up variables "shown1", "shown2" shown to
  students (half the bank writes `$…$`) — "fromExam: maths written between dollar signs". The pool still holds internal
  `shownN` names for REAL `{expr}` slots; that is fine — none reaches student text.
- A harvest built without `--from=<this worktree>` bundles the 09-merge importer: rebuild only with
  `bundleImporter.mjs --from=…` (README in the scripts folder).
- Equal bounds were ±2 % (101 right for an exact 100) — "a Numbas number box with equal bounds and no precision" and
  "an exact Numbas number box keeps the noise floor, its stated precision and its reveal".
- `2·A` went out as JME `dot(2, A)`, which Numbas and PhysLab's own importer refuse — "the · key on its way to Numbas".
- Expression parts lost an author's own angle factors on export — "an expression part on its way to Numbas keeps its
  own angle factors".
- `random([…] except …)` ignored the exclusion — "random() of a list with except".
- `Random(1..5)` / `Sin(x)` were refused — "JME function names in any case".
- `\{1, 2, 3\}` in words became a value slot — "an escaped brace in the words of a question".
- A lone `$` with a commented-out backslash later in its paragraph skipped the question — "a lone dollar sign followed
  by a comment".
- A vector or roots part's unit came back as prompt text and unit "none" — "a vector or roots part with a unit, out to
  .exam and back".
- Only the first display equation of a step survived — "the display maths of a Numbas step".
- `$$…$$` in a choice stayed raw — "display maths in a choice part".
- `&euro;`, `&uuml;` and 17 other names showed as raw text (the table held 27 names, now HTML 4's 252) — "named HTML
  entities in the words of a question".

## Tests
`npx vitest run tests/numbas.test.ts tests/numbas2.test.ts`. The harvest check (count, undrawable, KaTeX over every
stored and played span, marking gates, licence) is the part's re-runnable script recorded in its REPORT.
