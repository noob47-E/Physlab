# Parsing typed maths (math/expr.ts preprocess)

How PhysLab reads a typed line — the bar, a formula field, a graph, an answer box — into mathjs. Written by polish part
P-PARSE (0.9). Numbers, ×10 literals and rounding are in `numbers.md`; LaTeX from the Maths field in `calculator.md`.

## File map
- `math/expr.ts`:
  - `preprocess(src, names?)` — typed text → mathjs text, in this order: spaces, signs, π/θ, √/∛, X10 literals,
    trig superscripts (`trigSuperscripts`), superscript powers, ∠ sizes, `°`, vectors (`vectorCalls`), bars
    (`magnitudeBars`), products against brackets (`bracketProducts`), pairs (`tuplesToPoints`), %, ×, ·;
  - `splitArgs`, `hasTopLevelComma` — argument lists that keep `<…>`, `(…)`, `[…]`, `{…}` whole;
  - `compileScalar(expr, vars, scope, names?)` — a formula as a fast scalar function for graphs;
  - `sceneNames()`/`setSceneNames()` — what the scene's names stand for (core/evaluate.ts records them);
  - `speltName(name)` — the spelling a formula reads for a name (θ → theta);
  - the math instance's own functions (`math.import`): degree trig, log conventions, vec/pt/polarVec, `timesOrCross`,
    `dot`, `mag`, and `add`/`subtract`, which refuse a number with a vector.

## The rules (invariants)
1. **A letter written against a bracket is a product** (x(x + 1), 2a(b + c), k(x) for a slider k), as on paper; a
   real function (sin, sqrt), a scene graph (f(2)) and a definition's own name (f(x) = …) are calls. A route that reads
   the scene's lines passes `sceneNames()`; without names, f, g, h, p, q are taken as functions (FUNCTION_LETTER).
2. **π and θ are one letter each**: πr², 2πr, rθ multiply. A slider named θ is published as theta too.
3. **sin⁻¹ is asin, sin² is the square of the call**; a superscript on a number or bracket is a power.
4. **Bars nest**: ||x| − 1|; a bar opens at the start or after an operator, and closes after a value.
5. **√ and ∛ take a whole number**, e-notation included (√1e-3, ∛-8).
6. **`<…>` is a vector where an operand cannot stand before it**, and also after a value when what follows its `>`
   ends an operand (2<1, 2> = <2, 4>); otherwise `<`/`>` compare (x < 3, x > 1).
7. **Every space is a space**: no-break, narrow and thin spaces (PhysLab writes U+00A0 round ×).
8. **Complex numbers are scalars** to `·`, `|…|`, sec/csc/cot and log(a, b).
9. **A number and a vector are never added**: 3 + <4, 0> is refused in words; a matrix plus a number still broadcasts.

## One reader (CLEANUP-PLAN.md CW6a)
- **preprocess is the one reader of typed maths.** latexToMath is the LaTeX-to-text step: it leaves π, °, ∠, |…|,
  <…> and (in vector mode) × and · to preprocess. It still writes \div as / and \le \ge \ne as <= >= != itself,
  because some callers read its text without preprocess: Pure Maths' job finder and algebra-engine route
  (math/pure/store.ts) and the Maths screen's "is there an = yet?" test (panels/Maths.tsx).
- **The vector rule has two copies in the bar**: lang/commands.ts `VECTOR_LITERAL`, used by `relationsIn` (counting
  relation signs) and `splitInputs` (a command's inputs). They are regex copies of preprocess's `angleVectors`, not
  calls to it, and they differ on some lines. B = k<1, 2> + <3, 4> is one assignment to preprocess and "several
  equations" to relationsIn; angle(x < 3, y > 1) is two arguments to splitArgs and one input to splitInputs (the bar
  refuses that line before it splits it today, as two inequalities). Joining
  them changes what the bar says, so it is parked for the owner (OWNER-APPROVALS CW6a-2).
- **Arguments split by splitArgs everywhere in the bar**; `tryCas` takes the braces off solve's lists and splits each
  list with splitArgs again.
- tests/golden/reader.golden.test.ts writes what every bar and calc sweep input becomes once read, before a route
  splits it, on each route: the bar's preprocess; the Calculator's latexToMath + keypadToMath; the Vectors panel's
  latexToMath + preprocess; and latexToMath alone (what Pure Maths and the Maths screen read). Bases mode is left out:
  it never reaches either reader.

## Traps
- The bar's relation count (lang/commands.ts relationsIn) masks a vector literal with its own copy of rule 6 (see
  "One reader"): without the mask `B = k<1, 2>` is "several equations", and where the copy differs from preprocess a
  vector line still is (CW6a-2).
- A raw error text from the reader reaches the bar: "Expected a vector or point" (math/expr.ts toV3) after
  distance(3, 4) or unit(5); the Vectors panel words it, the bar does not (CW6a-1).
- Overriding a mathjs function in `math.import` replaces it for every dependent function: keep its arity (add is n-ary).
- `solve({…}, {x, y})`: splitArgs keeps braces whole, so the caller splits each braced list itself — and its strip is
  not paired: solve({a, b} * {c, d} = 1, a) sends "b} * {c" as an equation (CW6a-4).
- math/expr.ts `pt` and `vec` keep three numbers and drop a fourth without a word: |<1, 2, 3, 4>| answers 3.74, the
  size of <1, 2, 3> (CW6a-3).

## Guards
tests/parseImplicit.test.ts, parseLeads.test.ts (held batches skipped with a note), parseSpaces.test.ts,
parseNumberPlusVector.test.ts, expr.test.ts, exprPrecedence.test.ts, readerRules.test.ts (the vector rule's copies,
with it.fails for CW6a-1 … CW6a-4), golden/reader.golden.test.ts.

## Left for later (found in CW6a, not in its files)
- More argument splitters that do not call splitArgs: math/pure/run.ts `commaOutsideBrackets`, panels/Maths.tsx
  `args` (round brackets only), questions/answerText.ts `splitTop`, questions/steps.ts (a plain split at commas).
- ∞ for the engine: math/engine/sympy/spelling.ts is the rule (math/pure/store.ts `infinityForSymPy` is gone);
  workers/cas.worker.ts `P()` still turns a literal ∞ into oo itself, and its name table reads Infinity and inf.
- Pure Maths' algebra-engine route reads latexToMath's text without preprocess (math/pure/store.ts).
- latexToMath's size and shape (the audit's rows; the file is CW6a's, but this is a split, not a change of reader):
  one 465-line function, and its FUNCS / ARC / UNICODE_ALIASES lists written into it — for the split of the big files
  (CW10) and the how-to notes (CW13).

## Held for the next round
Done in P-PARSE2 (2026-10-08): B5 (R4.8, H5 — juxtaposed factors join the operand left of ×; a space before a call's
bracket is skipped), B7 (H3 — a graph's mod is the floor mod mathjs uses), the latexToMath leads (A00/A01: sin x², subscripts,
^-2, ⟨ ⟩, a Σ's "= 5" left outside it, d/dθ, d/dx before a function name).
Done in P-HELD (2026-10-08): B6 — the size before ∠ or "at" (`SIZE_AT_ANGLE`) is a number, a name, a bracket or a
power of ten, then any unit words (r ∠ 30°, (3+2) ∠ 30°, 10^(-5) ∠ 45°, 10 kg m/s ∠ 30°); it never starts against a
name or a closing bracket, so sin(30) ∠ 30° is still refused; the Vectors panel's sizeBeforeAngle workaround is gone.
W1 — the algebra worker reads ∞ and Infinity as oo on every route (tests/casWorker.test.ts). Nothing is held now.
