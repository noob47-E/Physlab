# Vectors mode — code knowledge

What the area does: the **Vector Calculator** panel (Vectors mode) holds vector *cards* a student types
(3i + 4j, 10∠30°), picks off the graph, or builds from other cards (B = 2A). Operations (Add all,
Subtract, Dot, Cross, Size & angle, Components, and nine more behind "More") put one *result card*
under the cards, with an answer, steps (KaTeX) and **Draw on graph**, which lays the answer out with
the cards' own arrows (head-to-tail, parallelogram, from origin).

## File map
| File | One line |
|---|---|
| `src/renderer/src/panels/VectorCalc.tsx` | The panel: cards, operation buttons, result card, layout chips, expression box. Holds no state of its own beyond an error line. |
| `src/renderer/src/panels/vectorCalcStore.ts` | All panel state (`useVC`), the card ↔ arrow sync (`planSync`/`syncCards`), the result recipe, and Draw on graph (`drawAnswer`/`drawPicture`, `followAnswer`/`keepAnswerTrue`, `layOutAgain`, `switchLayout`, `takePictureOff`), the operations (`OPERATIONS`: the one table of vector operations — name, what it reads, its button's maths and help, its solver — which the Vector Calculator, the Vector Solver and the Calculator's VECTOR screen all work from; `solveOperation`, `runOperation`, `exprSolution`). A module of its own so the right-click menu can add a card without loading MathLive. |
| `src/renderer/src/panels/vectorLine.ts` | What a card holds (split out of the store in CW10c): reading a card's line into a vector or a sentence — `evaluateVectorLine`, `cardValues`/`cardValue`, `namesIn`, `unknownNames`, `droppedUnits`, `explainVectorError`, `PlainError`. The store re-exports what it exported before. |
| `src/renderer/src/panels/cardLine.ts` | What a card shows (CW10c): `cardLineTex` (its line under the boxes, in one number form), `tooBigToDraw`, `nextStepHint`. |
| `src/renderer/src/math/vectorSolver.ts` | Pure solvers: one `Solution` (title, steps, answers, optional `visual`) per operation. Every LaTeX string uses double backslashes; every number goes through `math/format.ts`. |
| `src/renderer/src/math/vec.ts` | Vector maths and `layoutVectors` (where each arrow of a picture goes). Not owned by the vectors part, read-only here. |
| `src/renderer/src/render/ObjectViews.tsx` (`VectorView`) | Draws an arrow; when `showComponents` (or selected) it also draws Ax along x, Ay along y, dashed guides and the "Ax = …" labels (`componentTexts`, core/naming.ts). |
| `src/renderer/src/render/Labels.tsx` | The label chips (name + size ∠ angle) for every object, vectors and points included. |
| `src/renderer/src/render/colourMix.ts` | `isResultArrow` and `showsComponents` — the two pure "how is this arrow drawn" decisions. |
| `src/renderer/src/render/tools.ts` (beside `SnapInfo`) + `render/Interaction.tsx` `snapAt`/`pointAt` | Every drawing tool snaps to a vector's HEAD right after an existing point (`headSnapTargets`, `pointOrHeadSnap`, `stillInDrag`); the point made is `{ kind: 'vectorHead' }` and follows the arrow. |
| `src/renderer/src/app/TopBar.tsx` ~305–320 | Settings ▸ Vector notation choices (arrow drawn as an inline SVG, bold, underline). |

## Data flow
1. A card's value: `cardValues(cards, ev)` works the cards out once each from the top (a card may
   use the cards above it by name). Typed → mathjs via `latexToMath`; size∠angle → `fromPolar`;
   graph card → the arrow's evaluated components.
2. Every readable card owns exactly one arrow (`card.sceneId`). `planSync` is the pure decision:
   a typed card moves its arrow, a dragged arrow rewrites its card, names follow each other, a card
   with no arrow gets one. `syncCards` applies it on every change of either store.
3. An operation (`runOperation` in the store; the panel only calls it) stores `result = { sol, label, from: Recipe }`. The recipe is
   the card ids + a `solve` closure (reading k and q when it runs), so the answer can be worked out again from the cards as they
   are now (`solveAgain`).
4. Draw on graph (`drawAnswer`) reuses the cards' arrows for the inputs (moving their tails; a copy
   stands in for an arrow that cannot move), adds only what is new (the answer, −B, a
   parallelogram's far sides) and remembers it all in the module-level `drawn` record.
   The shown answer is kept true to its cards whether drawn or not (`keepAnswerTrue`, values remembered in
   `workedFrom`): re-solved when a card, k or q changes; stale with a reason (removed / unreadable / unworkable)
   otherwise. A drawn picture is laid out again IN PLACE (same ids), redrawn silently when its shape changes
   (`drawPicture`/`drawAgain`), frozen while a card is half-typed, taken off only when a card is removed.
   A layout chip re-lays the same arrows (`switchLayout`, one undo step).

## Invariants
- The drawing and the panel show the same vectors: one arrow per readable card, and a result card
  never shows an answer for vectors the cards no longer hold.
- The drawing's undo history is the only history; the sync's own writes are not undo steps.
- A drawn answer adds nothing the cards already are (no A1 on top of A).
- Every step string renders in KaTeX without error (`tests/vectorSolver.test.ts`).

## Traps met (with the guarding test)
- An answer only re-solved when DRAWN went stale under a retyped card (owner's "Ax = 4 under 8i + 2j"); the follow logic
  runs for the shown answer whatever its picture — tests/vectorCalc.test.ts "an answer and its picture follow their cards".
- A half-typed card ("3i+") is unreadable for a keystroke: treating it like a removed card lost the picture for good.
  Unreadable freezes, removed takes off; a zero card's picture changes SHAPE and is redrawn silently — vectorCalc R2/R6.
- A regex word boundary (`\bB\b`) does not match "2B": an expression's cards come from the parse tree (`namesIn`) — vectorCalc R1.
- Helper arrows for components were themselves resolved when selected ("Axx = 4 cm"); 2D Components uses the card
  arrow's own `showComponents` (restored afterwards) and `showsComponents` never resolves an auxiliary helper — vectorCalc V4.
- A layout chip used to delete and re-create R, taking a student's points and angles on it — vectorSnap B.
- No snap target at a lone arrow tip made α = 60.15° (a point 1 px off the tip); a drag must not snap to targets that
  move with it, but a plain point at the start spot stays a target — vectorSnap A/F.
- A letter-only point label as a chip read as "⌈E" — vectorSnap C (`plainLetter`).
- fmtPrecise's 1e-12 floor wrote real tiny answers as 0 (k = 1.6×10⁻¹⁹, A·B of 1e-7 vectors, Components of 1.6×10⁻¹⁹);
  the solver uses its scientific writers and treats only noise RELATIVE to |A||B| as 0 (`isNoise`); cards zero noise
  relative to the line's own scale (`lineScale`), so 5∠30° + 5∠210° reads 0⃗ while 1.6×10⁻¹⁹ î stays — vectorSolver,
  vectorPolish H17.
- A scalar stand-in at |A| along A hid A; it is drawn at half of |A| — vectorSolver H4.
- mathjs broadcasts "8i + 2" to 10i + 2j + 2k: a vector plus a bare number is refused — vectorPolish H11.
- Fields filled with `toPrecision(12)` ("5.65685424949", "1e+21"): fields show the student's precision, the card keeps
  the exact vector until a field is edited (`Card.exact`) — vectorPolish V6/H8.
- A 1fr grid track cannot shrink below a MathLive field's content; use `minmax(0,1fr)`/`min-w-0` — vectorPolish V2.
- A caret power ("1.6×10^-19") is programming syntax: every plain-text number of the mode (solver titles, sentences,
  answer labels, stand-in notes, label chips via `measureText`, component and drag labels) goes through
  `superscriptPowers`; a tiny vector's chip is written in scientific form, a zero vector's chip says "no direction" —
  vectorPolish V6 labels, vectorSolver raised powers.
- Segoe UI has no glyph for U+20D7 (combining arrow above): the notation option draws its own SVG arrow — vectorPolish V7.

## Tests
- `tests/vectorCalc.test.ts` — cards, storage upgrade, selection → card, card ↔ arrow sync, Draw on graph.
- `tests/vectorSolver.test.ts` — every solver's steps through KaTeX, the numbers each line claims.
- `tests/vectorSnap.test.ts` — head snapping, layout chips keeping a student's points/angle, plain point letters.
- `tests/vectorPolish.test.ts` — the size limit, one number form, exact fields, k/q following, refusals, tiny numbers.
- `tests/glmfixVectors.test.ts` — GLM audit regressions (#3 cards survive File ▸ New/Open, #16 primed names, #17 binding by name, #18 stand-in copies, #19 graph-card prompts).

## Tiny and huge vectors (P-VEC2, 2026-10-06)
- No magnitude in `math/vectorSolver.ts` is compared with an absolute 1e-12 any more: a vector has
  zero length only when it is exactly 0; a cross product or a sum is zero only when it is noise
  beside its parts (`isNoise`, `sumOf`); then the "cancel" / "Rx = 0" lines test exact zeros.
  Forces of 1.6×10⁻¹⁷ N and 2×10⁻¹⁷ N at 60° give R = 3.1241×10⁻¹⁷ N, not "the forces cancel".
- `angleDeg` (in the solver) replaces vec.ts `angleBetween` there, which returns NaN under 1e-12.
- Tiny values in workings and answers go through `sci` / `sciIJK` / `part` (raised powers, never 0
  or e-notation); `part` uses powers of ten only when the whole vector is tiny, so a 3×10⁻¹⁶ noise
  part of 5∠90° still reads 0.
- Guarded by `tests/vectorTiny.test.ts` (10⁻¹⁹, 10⁻¹⁷, everyday snapshots, 10²⁰⁰, true cancels).

## Typed units are dropped, and said to be (P-VEC2)
- A card's text goes latexToMath → preprocess → mathjs; only the numbers are kept, so `<3 m, 4 m>`
  has size 5. `droppedUnits(text, cardNames)` (panels/vectorLine.ts) lists the units that were
  typed (not i/j/k, deg/rad or other cards' names) and the card and the expression box show one
  plain line under the value. Guarded by `tests/vectorUnits.test.ts`.
- The size before ∠ is read by the one reader since P-HELD (`SIZE_AT_ANGLE`, math/expr.ts); the panel's own
  workaround for it is gone (parsing.md).

## One angle, and a vector's direction (CLEANUP-PLAN.md CW9-N3)
- **`angleOf(a, b)`** (math/vec.ts) is the angle between two vectors: atan2 of |a×b| and a·b, NaN only for a vector of
  exactly zero length, so it does not depend on the vectors' size while their products fit a double (about 10⁻¹⁶²
  to 10¹⁵⁴). `angleBetween` (the bar's and the drawing's) and
  the solver's `angleDeg` both ask it; they gave the same number on 32,079 pairs and differ only where angleBetween
  stops first.
- **`NO_DIRECTION`** (math/vec.ts, an absolute 10⁻¹²): normalize, angleBetween and directionAngles give 0⃗ or NaN for
  a vector shorter than it (project has the same floor squared), so A = <3e-19, 4e-19> loses its direction on those
  routes — the bar's line for U = unitVec(A) reads U = 0⃗ while the solution worked beside it answers 0.6î + 0.8ĵ.
  The solver steps round it (angleOf; it divides by a size under the floor itself). A floor of exactly 0 is parked
  for the owner (CW9-N3-2).
- A drawn arrow is a stand-in when it differs from the vector by over 10⁻¹² (`standIn`). For vectors of about 10⁻¹²
  that misses one: 0.1 × <1e-12, 0, 0> is drawn at ½A (5×10⁻¹³), within 10⁻¹² of R (10⁻¹³), so R is labelled and
  selected at the stand-in length. Judging it by sameNumber is parked for the owner (CW9-N3-3).
- Guarded by tests/noiseFloors.test.ts (the CW9-N3 blocks).
