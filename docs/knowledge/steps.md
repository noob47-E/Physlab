# The step framework: methods, typed steps and sound validation

PhysLab shows full step-by-step working for every mathematical solution, governed by a strict rule:
**a wrong step must never be shown**.

The step framework lives in `src/renderer/src/math/steps/`. It decouples problem methods from UI rendering,
chains sub-problems via a router, validates every step independently, and translates the verified working
into the working document format displayed on the Maths screen.

## Architecture

1. **`types.ts`**: The core contracts: `Problem`, `Step`, `Method`, `Working` and `StepRouter`.
2. **`check-adapter.ts`**: The single gateway through which all validators evaluate equivalence and truth.
   Contains the exact BigInt rational polynomial checker and the swap point where part G2 checkers plug in.
3. **`validate.ts`**: The six typed step validators. Only steps that return `valid` are shown.
4. **`router.ts`**: Dispatches problems to applicable methods, manages depth and step budgets, validates
   generated steps, and handles alternative solutions ("Another way").
5. **`render.ts`**: A read-only bridge that converts a `Working` document into the format rendered by
   `panels/WorkingView.tsx`.
6. **`methods/linearOneVar.ts`**: An example method demonstrating linear equation solving.

## The six sound step kinds

Every step in a solution carries a `kind` (`StepKind`). Each kind has its own independent mathematical validator:

- **`ExprEq`**: Algebraic expression equality ($E_1 \equiv E_2$). Compares unsimplified ASTs without relying on
  an engine's auto-simplification. Handled by `validateExprEq`.
- **`EquationEquiv`**: Equation equivalence ($L_1 = R_1 \iff L_2 = R_2$). Verifies that two equations have the
  exact same solution set, such as adding or subtracting terms from both sides or multiplying by a non-zero constant.
  Handled by `validateEquationEquiv`.
- **`Implication`**: Forward mathematical deduction ($A \implies B$). Used for operations like squaring both sides
  or multiplying by an expression that may be zero. Any extraneous roots are eliminated at the end. Handled by
  `validateImplication`.
- **`CaseSplitComplete`**: Complete domain partitioning. Verifies that the individual cases cover the entire domain
  (e.g., $x \ge 0$ and $x < 0$ covering the real numbers). Handled by `validateCaseSplitComplete`.
- **`SolutionSetEq`**: Solution set verification. Proves that every proposed solution satisfies the original
  equation and that the solution set is complete. Handled by `validateSolutionSetEq`.
- **`SubproblemReduction`**: Sound reduction from sub-problems. Verifies that the parent answer follows directly
  from the sub-answers (such as taking the union of roots or combining derivative rules). Handled by
  `validateSubproblemReduction`.

## How validation works

When a method returns a `Working` document, the router runs `validateWorking`.
Every step is evaluated by `validateStep`, returning a `ValidationVerdict`:
- `'valid'`: Proved correct by sound mathematical rules.
- `'invalid'`: Definitively false or contradictory.
- `'unknown'`: Cannot be proved with current sound checkers.

**Rule 0.2**: Only `valid` steps are ever shown. If even one step in a method's solution returns `invalid`
or `unknown`, the entire step sequence is hidden, setting `noWorking: true` with the reason
`"I can't show the steps for this one yet"`. The checked answer alone may still be shown if its answer
checker is sound.

## Where G2 plugs in

All validators access mathematical decision procedures exclusively through `check-adapter.ts`.
Until the G2 sound checkers (`math/check/`) merge, `check-adapter.ts` provides an exact arithmetic path
over BigInt rationals (`rat.ts` and `mono.ts`) for polynomial equality. Any non-polynomial or transcendental
operation safely returns `'unknown'`.

When G2 merges, the swap point in `src/renderer/src/math/steps/check-adapter.ts` is updated to delegate to the
comprehensive G2 checkers (rational functions with excluded poles, derivatives, linear systems, and numeric fallbacks).
No method or validator file needs to be modified.

## How to write a method

To add a new problem-solving method:

1. Create a module under `src/renderer/src/math/steps/methods/`.
2. Implement the `Method` interface:
   - `id`: A unique string identifier.
   - `name`: Human-readable title for the method.
   - `order`: Integer priority (lower numbers indicate primary/standard methods).
   - `isAlternative`: Set to `true` if this method represents an alternative approach ("Another way").
   - `appliesTo(problem)`: Returns `{ applies: true }` or `{ applies: false, why: string }`.
   - `solve(problem, router)`: Solves the problem, constructs `Step` objects, and returns a `Working`.
     Sub-problems can be delegated to `router.solve(...)`.
3. Register the method with the router using `createStepRouter` or `router.registerMethod`.
