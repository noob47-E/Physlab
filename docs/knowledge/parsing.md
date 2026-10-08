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

## Traps
- The bar's relation count (lang/commands.ts relationsIn) must mask a vector literal the way rule 6 reads it, or
  `B = k<1, 2>` is "several equations".
- Overriding a mathjs function in `math.import` replaces it for every dependent function: keep its arity (add is n-ary).
- `solve({…}, {x, y})`: splitArgs keeps braces whole, so the caller splits each braced list itself.

## Guards
tests/parseImplicit.test.ts, parseLeads.test.ts (held batches skipped with a note), parseSpaces.test.ts,
parseNumberPlusVector.test.ts, expr.test.ts, exprPrecedence.test.ts.

## Held for the next round
Done in P-PARSE2 (2026-10-08): B5 (R4.8, H5 — juxtaposed factors join the operand left of ×; a space before a call's
bracket is skipped), B7 (H3 — a graph's mod is the floor mod mathjs uses), the latexToMath leads (A00/A01: sin x², subscripts,
^-2, ⟨ ⟩, a Σ's "= 5" left outside it, d/dθ, d/dx before a function name).
Done in P-HELD (2026-10-08): B6 — the size before ∠ or "at" (`SIZE_AT_ANGLE`) is a number, a name, a bracket or a
power of ten, then any unit words (r ∠ 30°, (3+2) ∠ 30°, 10^(-5) ∠ 45°, 10 kg m/s ∠ 30°); it never starts against a
name or a closing bracket, so sin(30) ∠ 30° is still refused; the Vectors panel's sizeBeforeAngle workaround is gone.
W1 — the algebra worker reads ∞ and Infinity as oo on every route (tests/casWorker.test.ts). Nothing is held now.
