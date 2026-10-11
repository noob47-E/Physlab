# The step framework: methods, typed steps and sound validation

PhysLab shows full step-by-step working for every mathematical solution, governed by a strict rule:
**a wrong step must never be shown**.

The step framework lives in `src/renderer/src/math/steps/`. It decouples problem methods from UI rendering,
chains sub-problems via a router, validates every step independently, and translates the verified working
into the working document format displayed on the Maths screen.

## Architecture

1. **`types.ts`**: The core contracts: `Problem`, `Step`, `EquationOp`, `Method`, `Working` and `StepRouter`.
2. **`check-adapter.ts`**: The single gateway through which all validators evaluate equivalence and truth.
   Contains the exact BigInt rational polynomial checker, the exact literal path used to compare states, and the
   swap point where part G2 checkers plug in.
3. **`sentences.ts`**: The one builder of every step's sentence and rule (`sentenceFor`, `ruleFor`, `finishStep`),
   and of every working's check line (`substitutionOf`). Built from typed data only.
4. **`validate.ts`**: The typed step validators, the working validator, and the in-working check of a
   subproblem reduction. Only steps that return `valid` are shown.
5. **`router.ts`**: Dispatches problems to applicable methods, manages depth and step budgets, validates
   generated steps, and handles alternative solutions ("Another way").
6. **`render.ts`**: A read-only bridge that converts a `Working` document into the format rendered by
   `panels/WorkingView.tsx`. The check line it shows is the one `sentences.ts` builds.
7. **`methods/`**: The first methods (S1a): linear equations, and quadratics three ways (see below).

## The six sound step kinds

Every step in a solution carries a `kind` (`StepKind`). Each kind has its own independent mathematical validator.

- **`ExprEq`**: Algebraic expression equality ($E_1 \equiv E_2$). Compares unsimplified ASTs without relying on
  an engine's auto-simplification. A discriminant step (`data.role === 'discriminant'`) must also start from the
  substituted expression $(b)^2 - 4 \cdot a \cdot (c)$ that its data names. Handled by `validateExprEq`.
- **`EquationEquiv`**: Equation equivalence with a declared move (`op`). Every move is checked SIDE BY SIDE, never
  only by the difference of the two sides. The old `same-difference` op is gone: it could not say which move was
  made. The ops (`EquationOp` in `types.ts`):
  - `add-both` / `subtract-both` `{ term }`: $L_2 \equiv L_1 \pm t$ and $R_2 \equiv R_1 \pm t$.
  - `multiply-both` `{ k }` / `divide-both` `{ k }`: $L_2 \equiv kL_1$ and $R_2 \equiv kR_1$ (k non-zero); divide is
    the converse.
  - `move-to-left`: $L_2 \equiv L_1 - R_1$ and $R_2 \equiv 0$.
  - `clear-decimals` `{ k }` / `clear-fractions` `{ k }`: as `multiply-both`, but `clear-decimals` needs k a power of ten
    (at least 10) and a decimal literal in the before, and `clear-fractions` needs k to be the LCD of the reduced
    denominators in the before (`\frac{p}{q}` and `p/q`). Two ops, two rules, two sentences.
  - `expand-sides`, `collect-like-terms`, `work-out-right`, `factorise`, `complete-square`, `already-solved`:
    $L_2 \equiv L_1$ and $R_2 \equiv R_1$, and each label's OWN structure (`checkEquationOp`, round 5): a label whose
    structure is absent is `invalid` even when the sides are equal.
    `already-solved`: the before and after are the same text, of the form `v = number`.
    `expand-sides`: the before has a bracket, and each side of the after is the term-by-term expansion of the same side
    of the before: the same monomials, as many times each, with NOTHING collected (2(x + x) gives 2x + 2x, not 4x).
    A step that expands and collects is two steps. A side that is not changed by the expansion is not an expansion.
    `collect-like-terms`: the before has no bracket and some side has like terms (or a zero summand beside others);
    the after has each monomial at most once per side.
    `work-out-right`: the right side of the before has no variable and is not already one number; the after's right
    side is that number; the left side is unchanged text.
    `factorise`: each side that changed is a product of factors in v now, and was not one before. A product needs two
    or more non-constant factors, or one factor times a constant that is not ±1 (so 1(x² + 1) is refused). Only the
    changed side is judged; an unchanged side keeps its text. The words never say "fully": no irreducibility is claimed.
    `complete-square`: the after's left side is `a(v + p)^2 + q` with exact a, p, q and a written bracket. A bare
    `x^2 + q` is not a completed square. With no x-term (b = 0) the square is already (x)^2 + k, so no step is written.
    Every rewrite op (expand-sides, collect-like-terms, work-out-right, factorise, complete-square, square-root-pm) is
    `invalid` when its after reads the same as its before (`already-solved` is the one op that may keep the text).
  - `square-root-pm` `{ shift, root }`: a rewrite whose left side is $(x - s - r)(x - s + r)$.
  - `swap`: $L_2 \equiv R_1$ and $R_2 \equiv L_1$.
  An `EquationEquiv` without `op` is `unknown` and is never shown. A move whose op does not match its arithmetic
  (a swap or a multiplication by −1 given as an add of 0) is `invalid`. Handled by `validateEquationEquiv`, which
  calls `checkEquationOp` in `check-adapter.ts`.
- **`Implication`**: Forward mathematical deduction ($A \implies B$). Used for operations like squaring both sides
  or multiplying by an expression that may be zero. Any extraneous roots are eliminated at the end. Handled by
  `validateImplication`.
- **`CaseSplitComplete`**: Complete domain partitioning. Two forms. In the inequality form, the cases cover the
  domain (e.g., $x \ge 0$ and $x < 0$). In the zero-product form (`data.form === 'zero-product'`, with `data.c`,
  `data.cases` and `data.variable`), `before` is $P = 0$ and the product of the cases $F_1 F_2 \cdots$ must equal
  $c \cdot P$ exactly, for a declared exact non-zero rational $c$ (decimals allowed, `0`, `0/5`, `1/0` and empty
  refused), and the product must have degree at least 1. The displayed result must list the roots of the
  (linear) cases, in order, once each. Every polynomial must use only the variable. Handled by
  `validateCaseSplitComplete`.
- **`SolutionSetEq`**: The solution set. An EMPTY set is valid only with an exact proof from the displayed `before`
  (`solutionProof`): a non-zero constant (linear, $0 = c$), or a real quadratic whose discriminant $b^2 - 4ac$ is
  below zero, computed exactly here and never taken from a method. The displayed `after` must then be the text the
  proof gives: `\text{no value of x works}` (linear), `\text{No real solution}` (quadratic), or
  `\text{every real number}` (the identity, flagged `allReals`). A non-empty set is a linear equation's one root,
  checked exactly, and the displayed line must list it. Any letter other than the variable makes the proof
  impossible (unknown). Handled by `validateSolutionSetEq`.
- **`SubproblemReduction`**: Sound reduction from sub-problems. It is never valid on its own: it is valid only
  inside its working, with the zero-product `CaseSplitComplete` immediately before it. Its sub-problems must be
  exactly that split's cases, in order; each has a validated sub-working whose input is the case and whose answer
  is the case's root; the sub-answers, the parent's answer and the displayed union are the same values in order.
  Handled by `validateSubproblemIn`, called from `validateWorking`.

## How validation works

When a method returns a `Working` document, the router runs `validateWorking`.
Every step is evaluated by `validateStep` (or `validateSubproblemIn` for a reduction), returning a `ValidationVerdict`:
- `'valid'`: Proved correct by sound mathematical rules.
- `'invalid'`: Definitively false or contradictory.
- `'unknown'`: Cannot be proved with current sound checkers.

**Rule 0.2**: Only `valid` steps are ever shown. If even one step in a method's solution returns `invalid`
or `unknown`, the entire step sequence is hidden, setting `noWorking: true` with the reason
`"I can't show the steps for this one yet"`. The checked answer alone may still be shown if its answer
checker is sound.

**Sentences and rules are built, not written (gpt MUST B).** A step's `sentence` and `rule` must equal what
`sentenceFor(step)` and `ruleFor(step)` give from the step's typed data (its op, its cases, its discriminant data,
its proved solution set). A method never types a sentence: it calls `finishStep`, which writes both. A sentence
that does not say what the move did is `invalid`, even when the arithmetic is right. The words are the builder's
and the builder reads only the typed fields and the displayed states.

**The check line is built, not written (gpt MUST C).** The check a page shows ("Put y = 2 back: both sides give 7.")
is built by `substitutionOf` from the validated answer substituted exactly into the problem as typed. A rational
answer that does not satisfy the problem makes the working `invalid`. A method's own `check` string is never shown:
if it is present and is not the built line, the working is `invalid`. The bridge shows no check when there is no
rational answer to substitute.

**Chains (P-FIX-S0SOUND).** `validateWorking` requires that the first step's `before` is the working's `input`
(the problem as typed), and that each step's `before` is the previous step's `after`. The comparison is of the
parsed expression on each side, so layout (`2x+3=11` against `2*x + 3 = 11`) does not matter, but a different
order of terms or a different number does. A break anywhere makes the working `invalid`. Sub-workings and the
Another way are validated too, each against its own input. The router tries the next applicable method when a
working is hidden, and never returns a hidden working as shown.

**Literals beyond the limits are refused before anything reads them (round 6).** `tryParsePoly` and the method's
`readEquation` return nothing for a state with a literal of more than 300 digits, or a power of ten beyond ±300, before
mathjs parses it and before any BigInt power of ten is taken (a million-digit decimal used to hang the parse).

**Negative written denominators (round 6).** `x/(−2)` and `\frac{x}{-2}` count by their absolute value: the LCD is 2.
A zero denominator is refused.

**Exact numbers (gpt SHOULD, Gemini SHOULD).** The chain compares states through a BigNumber mathjs instance at 400
digits, so every literal of up to 300 digits is read exactly (every digit written, leading zeros included, round 5):
`100000000000000000001` and
`100000000000000000002` are different states, and the identical literal is the same state. A literal with more
than 300 significant digits, or a power of ten beyond ±300 (decimal places counted), is refused: `sameState` is
false for it, so the working is hidden. Literals inside the polynomial checks are read through `parseExpr`, which
refuses more than 15 digits (the review of a982a6a4). Mathjs reads `1/2x` as $(1/2)\cdot x$, the way the app reads
it, so it is neither the state $1/(2x)$ nor $x/2y$, and a state that writes the parentheses differently is a
different state (refused, never accepted).

**Answers.** `validateWorking` checks `Working.answer` in every working, sub-working and Another way. Each answer's
label must be the problem's own variable (read from the input), and its `tex` (and `value`, if given) must equal
the next displayed result of the last validated step, as an exact string after fractions are written `a/b`. The
last step's display is either a solution list (`x = 2 or x = 3`, `x in {2, 3}` or `x \in \{2, 3\}`, split only on the
`\text{or}` token or the word `or` with spaces around it, so a variable named `r` or `θ` is read correctly) or a
solution-set ending (`\text{No real solution}`). A wrong value, label or sub-working answer is invalid, and the
bridge then shows no moves and no answer. A working whose `checked` is `'failed'` is invalid.

**Empty workings.** A working with no steps is `unknown` (hidden), unless it is the explicit can't-show
fallback: `noWorking` with the reason `CANT_SHOW_STEPS_REASON` and no answer. An already solved equation
(`x = 5`) is shown as one line, "The equation is already solved" (op `already-solved`), so it is never empty.
A problem with no variable (`0 = 0`) is not solved at all: no method applies, the router returns the can't-show
fallback, and nothing is shown.

**The identity ending.** `0 = 0` (any equation whose difference is the zero polynomial, such as `x − x = 0`) ends
with a `SolutionSetEq` whose data says `allReals: true` and whose displayed line is `\text{every real number}`. The
validator proves the identity from the displayed `before`, so the flag and the line must agree with the proof.

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
     Sub-problems can be delegated to `router.solve(...)`. Build every step with `finishStep` (never type its
     sentence or rule), and leave `check` unset: the validator builds it.
3. Register the method with the router using `createStepRouter` or `router.registerMethod`.

## The first methods (S1a)

Four methods live in `src/renderer/src/math/steps/methods/` and are listed in `S1A_METHODS`
(`methods/index.ts`): linear equations in one variable, and quadratics three ways. Nothing shows them in the
app yet; the Working panel wiring is a later part.

**Shared front.** `methods/equation.ts` reads an equation, expands brackets, collects like terms and clears
fractions or decimals (`equationStep` takes an op and returns a finished step). `methods/quadratic.ts` takes a
quadratic on to a·x² + b·x + c = 0 with whole numbers, a > 0 and no common factor, and works out the discriminant and
the rational roots. `methods/stepText.ts` writes every state twice: as the validators read it (`x^2`, `\frac{a}{b}`)
and as a student reads it (`x²`, `−`, `5/2`). The letter of the problem is used everywhere; `x` is never written in.

**Chain.** Each step starts from the text the previous step ended on, and the first starts from the input (the
shared front keeps a `text` for exactly this). `validateWorking` checks the chain (see *Chains* above), so a
line the method did not derive cannot appear between two valid lines.

**Writing the states.** A validator string needs a backslash to be converted by `latexToMath`. A power written
`x^{2}` with no backslash fails to parse, and the step comes back `unknown`, which hides the working. So states
use `x^2`.

**Which move, which op.**
- Expanding and collecting: `expand-sides`, `collect-like-terms`. Moving a term from one side to the other:
  `add-both` or `subtract-both` with the term's size (the sign picks which). The two constant lines of a cancelled
  equation: the subtraction on both sides, then `work-out-right` (`0 = 8 − 3`, then `0 = 5`), so `0 = 6` is rejected.
- Clearing: a decimal state is cleared first by its power of ten (`clear-decimals`, "Multiply both sides by 10 to clear
  the decimals"), then a state with fractions by their LCD (`clear-fractions`). Dividing both sides by A: `divide-both`. Quadratic normalising: `move-to-left`, then `multiply-both` by −1 or `divide-both` by a
  divisor (purpose `leading-positive` or `common-factor`).
- The factor form: `factorise`, the normalised equation to $(d_1x - n_1)(d_2x - n_2) = 0$.
- The zero product: `CaseSplitComplete` in zero-product form. The cases are the linear factors `x − 2 = 0` and
  `x − 3 = 0`; the product must equal the whole, and the displayed `x = 2 or x = 3` must list their roots. A
  double root has one displayed case (both entries of `cases` equal) and one sub-working.
- Completing the square: `complete-square` (the left side rewritten as $(x - s)^2 + k$). The ± square root:
  `square-root-pm` with the shift and the root, a rewrite to the difference of two squares. Its two cases are the
  zero-product `CaseSplitComplete`. A surd `r` is `unknown` until G2.
- The discriminant: its own sub-working (`input` is the substituted expression, one `ExprEq` with `role:
  'discriminant'` and its a, b, c). The parent's chain does not run through it.
- Endings: a linear `0 = K` with K ≠ 0 ends with a `SolutionSetEq` line ("no value of x works"). A quadratic
  with a negative discriminant in the real domain ends with a `SolutionSetEq` line ("No real solution"), proved
  exactly from the displayed equation. A linear `0 = 0` ends with the identity `SolutionSetEq` ("every real number").

**Which quadratic method is primary.** Factorising applies when the discriminant is a perfect square (the factor
form has d₁·d₂ = a by Gauss's lemma). Otherwise the formula is primary. The formula and completing the square are
"Another way" alternatives. The router tries the next method when the first working is hidden, so when the
formula is hidden for rational roots, completing the square is attached.

**Waiting for G2.** Any step with a surd (√ of a non-square) or i comes back `unknown`, so its working is hidden.
That covers the formula for irrational or complex roots, completing the square for an irrational root, and the
formula as "Another way" for rational roots. These are `it.todo` in `tests/steps/methods/`, each named "needs G2".

**Closed in P-FIX-S0SOUND and the reviews after it.**
- A homogeneous sign slip (`−3y = 0` written as `−4y = 0`, and similar): `EquationEquiv` needs a declared `op`,
  and the move is checked side by side, so none of these validates. Each is a planted test that must come back hidden.
- A `SubproblemReduction` whose displayed `after` disagreed with its data, or that stood without its case split:
  now valid only inside its working (see above).
- `validateWorking` ignored `anotherWay`: it now validates it, and every sub-working, recursively.
- No chain check: the first step must start from the input, and each step from the previous step's `after`.
- The router gave up when the first method was hidden: it now tries the next applicable method, and still never
  returns a hidden working as shown.
- The hard-coded `x` in sentences and rule labels: the letter of the problem is used throughout.
- An empty solution set asserted without proof (`x^2 − 4 = 0` "No real solution"): the proof is exact from the
  displayed before. An empty set for a zero-product with constant 0: refused.
- A sentence, a rule or a check line that said something the move did not do: the builder writes them, and the
  validator requires them to match (`sentences.ts`).
- The mislabelled move (a swap, or a multiplication by −1, claimed as a same-difference): refused, since the ops
  are checked side by side.
- A second letter in a single-variable proof (`x^2 + y = 0` as "no real solutions"): refused.

**Remaining limits (known, tested).**
- A zero-product split is displayed-checked only when its cases are linear in the variable. A case that is not
  linear is `unknown` rather than checked.
- The answer of every working, sub-working and Another way is checked by the validator against its last displayed
  result (see *Answers* above). A solution list shown in a different order from the answers is invalid: the
  displayed order must match the answers' order.
- Typographic minus signs (U+2212) in a displayed value are not read by the display check; the methods never
  write one there.
- Gemini's SHOULD 4 (an ordered rather than a set comparison of displayed solutions) is not done: the order rule
  above is the one in force.
- The explicit can't-show fallback (`noWorking` with the reason, no steps) may still carry an answer; the
  validator rejects an answer without steps, and the bridge shows the answer only through the explicit branch.
- The formula's "Another way" for rational roots still needs the √ checks (G2).

**Tests.** `tests/steps/methods/`: `linear.test.ts` (300 seeded equations built from a known answer, the endings,
the homogeneous cases, named planted mistakes, planted mutants), `quadratic.test.ts` (seeded rational-root
quadratics through all three methods, negative discriminants, irrational items, the endings, the homogeneous case,
the y and t versions, planted mistakes), `textbook.test.ts` (twenty problems with the working written out by hand,
repeated in y and t), `answers.test.ts` (the answer, sub-working and Another way plants), `seeded.ts` (the
generators, built backwards from the answer) and `planted.ts` (the mutants: bumped and signed lines, a divide by
zero, a chain break, a dropped or wrong case, a scale by zero, a scale by another factor, a removed op, a mislabelled
op, a wrong sentence, a wrong rule, a wrong check line; each judged by what the bridge renders). The framework tests
are in `tests/steps/framework/`: `soundness.test.ts` (chains, ops, the zero-product split, the router),
`splits.test.ts` (the reduction tied to its split, the empty-set proofs, the zero-product constant),
`review3.test.ts` (the builder's sentences and rules, the check line, the exact literal path, the extra-variable
guard, `\in`), `router.test.ts` (the genuine case-split chain through the router, and its false version, which
is hidden), and `exactness.test.ts`.

**Mutant counts (round 5).** Every planted mutant of every group is rejected and hidden: linear 634, rational
quadratics 7748, negative discriminants 1244 (0 accepted in each). The rewrite-label mislabels (each label on a step of
each other kind) are in `tests/steps/framework/review4.test.ts`.

**Round 5 (gpt-5.4 delta3).** Clearing decimals and clearing fractions are separate ops with their own rule and
sentence. Every rewrite label has its own structural check (see above). Any letter other than the solved variable
anywhere in the before, even one that cancels, means no proof (`unknown`). Within one kind of step, two different ops
never get the same sentence (checked for every `EquationEquiv` op in `review4.test.ts`); the sentences of different
kinds need not be distinct, so `Implication` and `EquationEquiv` may both say "Multiply both sides by 2".

**Round 6 (gpt-5.4 delta4).** `expand-sides` writes and checks the term-by-term expansion with nothing collected
(`distributeTerms` in `check-adapter.ts` is the one expansion, read by the method and the validator alike). A
no-op on a rewrite op is `invalid`. `factorise` needs a real product. `complete-square` needs its bracket. The
literal limits are checked before any parse or BigInt power. Mutant counts (round 6): linear 634, rational
quadratics 7741, negative discriminants 1230 (0 accepted in each). The round-6 cases are in
`tests/steps/framework/review6.test.ts`.

**Round 7 (gpt-5.4 and Gemini delta5).** A written denominator counts only when it is a plain integer literal,
optionally bracketed and signed: x/(-2)^2, x/2y and \frac{x}{2^2} are refused, so clear-fractions cannot write them.
expand-sides needs a real product (a bracket multiplied by something other than 1, a minus before it, a / after it, or
raised to a power of 2 or more); (x + 1) = 2 → x + 1 = 2 is refused. Removing redundant brackets is its own op,
remove-brackets, which the method writes when a side has brackets and none of them is a real product. Gemini's claim
that every complete-square step on x^2 + 2x - 3 = 0 is invalid is FALSE: the validator reads the state with \left and
\right removed, and both inputs validate (review7.test.ts pins it). Mutant counts (round 7): linear 634, rational
quadratics 7741, negative discriminants 1230 (0 accepted in each).
