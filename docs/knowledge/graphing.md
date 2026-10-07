# The command bar's graph routes and graph drawing

How a line typed in the command bar becomes a graph, and how a graph is drawn, marked and labelled. Written by polish
part P-GRAPH (0.9). The rule this area keeps above all: **nothing is announced as created, drawn or shaded unless it
will really appear** — a refusal is a plain sentence and leaves nothing behind.

## File map
- `lang/commands.ts` — `runCommand` tries Pure Math, the CAS, `tryGraph`, assignments, geometry, the vector solvers,
  then plain evaluation. In `tryGraph`:
  - `relationsIn` / `withoutQuotedText` count the relation signs of a line (quoted text and `<a, b>` vectors excepted);
    two or more are refused before any route runs; ≤ ≥ are read as <= >=;
  - the routes: `y =`, `f(x) =` (never a mathjs function name: `sin(x) = 2` is an equation), `z =` surface,
    `r =` polar in θ, `curve`, `piecewise`, `between`, `tangent`, inequality, implicit, and `equationInX` for an
    equation with no y;
  - `mustDraw` asks `drawability` before anything is made; `friendlyError` turns parser text into plain English;
  - `refuseGraphLetterAsName`: x, y and z are kept for graphs; a point or vector named so is refused with a free letter.
  - `resolveTimes` turns `×` and `·` into a cross/dot product or a plain product once both sides are known, so
    `2·A` is a scaled vector like `2 × A`; the polar route reads θ after `preprocess`, so `r = aθ` is a times θ;
    `angle(<1, 0>, <0, 1>)` goes to the vector solver, not the geometry Angle command; the "≈" tail after an exact
    answer is written in the student's precision.
  - `tryGeometryCommand` / `trySolverCommand`: a missing, blank or extra input gives the command's own "Wrong inputs
    for …" sentence (`MOST_INPUTS`, `MOST_SOLVER_INPUTS`).
- `core/visualize.ts` — the bridge to the scene:
  - `drawability(spec, scope, digits, graphs?)`: pure; compiles, checks names and calls, samples a ladder of windows
    from ±0.1 to ±10⁶ (then a coarse far look to 10¹²), probes sliders, has a 600 ms budget, and returns either
    "drawable" (maybe with a note) or the sentence that says why not;
  - `solutionsInX` / `inXAlone`: an x-only equation — exact roots of a polynomial (square-free part, `polyRoots`;
    a quadratic through `realPairOfQuadratic`'s exact discriminant, so two very close roots are never called complex),
    a closed form for a lone high power, otherwise a numeric scan;
  - `visualizeGraph`, `visualizeBetween`, `visualizeTangentAt`, `visualizePiecewise` build the objects.
- `math/graphs.ts` — pure sampling and key points: `sampleExplicit` (curves; breaks at poles, subdivides a step that
  bends hard), `keyPoints` (roots, turning points, y-intercept), `shownKeyPoints`, `keyPointLabel`, `spreadLabels`,
  `placeLabels`, `verticalLineXs` (sign changes, touching roots, roots at or just inside a domain edge, plus any
  `known` solutions in the window), `solvedLineXs`, `implicitSegments` (marching squares), `inequalityMesh`,
  `sampleParametric`, `samplePiecewise`, `betweenMesh`, `betweenArea`, `slopeAt`, `curveBox`, `surfaceGeometry`.
- `render/GraphView.tsx` — draws one graph object; an implicit graph without y is drawn as vertical lines at
  `verticalLineXs`, seeded through `solvedLineXs` with the solutions the bar's own `solutionsInX` finds for the
  current slider values (recomputed per formula and evaluator version, nothing saved), so the lines stand where the
  sentence said even for x^200 = 0; key-point dots and labels only while the graph is selected or hovered.
- `lang/graphEdit.ts` — `replaceGraphEquation`: the Properties Equation field runs the new line through the bar's own
  checks and swaps the graph in place (name, colour, width and ticks kept; a refused line keeps the old graph; one undo
  step). Before, the panel removed the graph first and a refused line lost it.
- Tests: `tests/commands.test.ts` (typed line → log entry + scene objects; runs every HELP example),
  `tests/graphs.test.ts` (the pure functions) and `tests/graphEdit.test.ts`. Run only them:
  `npx vitest run tests/commands.test.ts tests/graphs.test.ts tests/graphEdit.test.ts`.

## Data flow
`y = x^2 - 4`: `tryGraph` → the `y =` route → `graphIfFunctionOfX` → `mustDraw` (`drawability` says yes) →
`visualizeGraph` makes an explicit graph and lands in Graphing → `GraphView` samples it with `sampleExplicit` over the
view, finds `keyPoints` over the same window, filters them with `shownKeyPoints`, writes each with `keyPointLabel` in
the student's precision and places them with `spreadLabels` + `placeLabels`.

`x^2 = 4`: `tryGraph` → the implicit route sees no y → `equationInX` → `solutionsInX` finds −2 and 2 → one implicit
graph with the student's own formula (a slider in it still moves the lines) → "The solutions are x = −2 and x = 2 —
each drawn as a vertical line." → `GraphView` draws the lines at `verticalLineXs`. With no real solution the line is
refused: "No real x makes this true — it has no points on the graph." and, for a polynomial, "In complex numbers:
x = −2 ± 3i" (the Calculator's own `polyRoots` and `calcNum`).

## Invariants
- Nothing is added to the scene, and the mode is not switched, before `drawability` has said yes.
- `drawability` mirrors the renderer: |y| > 10⁷ is never drawn; surfaces use the ±6 square; it judges by values and sign
  changes, never by what a sampler happens to return.
- One label per spot: coincident key points of any kind merge into one (`kinds`, most important first); a turning point
  touching the axis is also a root; a pole or a jump is never a turning point; a removable hole (sin x / x) takes its
  limit.
- Labels use the student's precision (decimal places or significant figures) through `fmtLabel` — never a raw `^`,
  NaN, Infinity or "undefined" — and stay inside the view without overlapping.
- A run of exact-zero samples is a stretch lying on the axis, not hundreds of roots.
- `sampleExplicit` never joins the two branches of a pole and never drops a steep smooth curve.

## Traps met in 0.9 (and the test block that guards each)
- A run-together line of several equations was taken as one inequality and "Shaded region created." printed for
  nothing → commands › "a line that holds several relations is refused, never shaded (polish P1)"; a label with its
  own = signs must still be made → "a label may hold equals signs of its own (polish P1, round 2)".
- "created" printed for formulas that draw nothing → "every graph route checks it has something to draw before it says
  so (polish DRAW)"; far-out curves → "(polish H10)"; tangents/regions off screen → "(polish H6)" and "two curves are
  the same only where they agree away from the grid … (polish H6, round 2)" (a 401-point grid aliased sin(100πx) to 0).
- x² + 4x + 13 = 0 said "Implicit curve created." → "an equation in x alone is solved, not plotted as a curve (polish
  P4)"; huge powers (x^1e9) never answered → "(polish P4, round 2)"; a root where the formula ends (√x = 0) →
  "(polish H13)".
- The bottom of y = x² − 4 had two labels reading "0^-8, −4)": golden-section search walks to the right edge of a flat
  floor → graphs › "keyPoints", "keyPointLabel", "shownKeyPoints", "spreadLabels", "placeLabels … (polish H14)".
- y = 0 drew 1201 root dots → graphs › "keyPoints" (stretch on the axis).
- 1/x = y drew a false vertical line along the pole → graphs › "implicitSegments".
- y = 10000x drew nothing, then e^(100(x − 3)) stopped short → graphs › "sampleExplicit" and "sampleExplicit: a steep
  smooth curve rises through the view, a pole is still a break (polish H3, round 2)".
- `Square(P)` showed "Cannot read properties of undefined" → commands › "a command missing an argument says so in
  words"; extra inputs, `Centroid(P)` leftovers → "small leftovers of the command bar (polish H7)".
- `y = (1, 2)` got a false reason → "(polish H8)"; a piecewise curve with one empty piece was refused whole → "(polish
  H11)"; calling a named graph (`y = g(x)*2`) → "(polish H12)", "(polish H12, round 2)", "(polish H12, round 3)" and
  "(polish H12w)".
- A root just inside the end of a domain: √x = 0.001 read "x = 0" and x^(1/4) = 0.001 "No real x" (the edge loop never
  bisected between the edge and the first finite sample, and its tolerance grew with the window) → graphs ›
  "keyPoints and verticalLineXs: a root just inside the end of a domain (polish H25)"; slow approach to 0 at the edge →
  "(polish H13, round 3)".
- Vertical lines drawn from a fresh numeric scan missed what the sentence named (x^200 = 0) → graphs › "solvedLineXs:
  an equation in x alone is drawn at the solutions the bar names (polish P4known)".
- Under load the draw check's time budget changed the answer (a false "move k" note) → commands › "the draw check does
  not say what it has not found, however busy the PC is (polish H18)".
- A power of ten in a sentence or label was written with a caret → "(polish H17)" (through `fmtLabel`); `2·A` printed a
  bare array → "(polish H9)"; `r = aθ` drew nothing → "(polish H22)"; `angle(<1, 0>, <0, 1>)` went to geometry →
  "(polish H23)"; raw parser text → "(polish H24)"; a degree slider stopped at 120 → "(polish H20)"; a near-double
  root was called complex → "(polish H26)"; `y'' = -y` left an object behind → "(polish H15)".
- Editing a graph's equation in Properties deleted the graph → `tests/graphEdit.test.ts`.
- Round 2 (P-GRAPH2, `tests/graph2.test.ts`):
  - **The end of a domain is judged against the curve beside it, not a far sample**: 10⁶√x + 0.01 tends to 0.01 (H27),
    and the bar's scan trusts a finer window over a coarser one where both cover an x.
  - **A quadratic's real pair comes from its exact discriminant**, never polyRoots (1 ± 10⁻¹⁰; H29); solutions near 0
    are told apart by their own size (±10⁻¹⁰; H30).
  - **A root is small beside both ends of its bracket**: a pole's jump (exp(1/x) − 2 at 0) is never one (H33).
  - **slopeAt keeps its step within a thousandth of the distance to 0** near 0 (H31).
  - **· between numbers is a product** on a graph (compileScalar `dot`); beside a written vector it is refused (H32).
  - **An x-only equation's lines are solved only when its formula or a value it reads changes** (P4perf: 18.5 ms a
    solve of sin(x) = a ran on every drag frame).

## Known limits (not bugs to chase blindly)
- A curve with a cancellation-noise extremum, e.g. (1 − cos x)/x² at 0, gets no turning point there.
- Step functions with a jump smaller than 1.5 view heights are drawn with a riser.
- `x^14 + 1 = 0` gets no "In complex numbers" line: the exact route stops at degree 12.
- A curve 10¹² times steeper than its offset at a domain's end (10¹²√x + 0.01) on a window a million wide is still
  marked with a root there: every point the edge check reaches is ~10⁶, and its 0.01 is within an edge's rounding.
- Since P-PARSE (0.9) a letter against a bracket is a product and phi is the golden ratio, so `y = x(x + 1)` and
  `y = phi*x` are drawn, and `splitArgs` keeps `<…>` whole (`cross(A, <1, 0>)` works).
