# Engine domain and answer-form contract

This document defines the domain and answer-form contract for all algebra engines
and checkers in PhysLab. It accompanies `src/renderer/src/math/engine/semantics.ts`
and `tests/engine/semantics.test.ts`.

Every engine adapter (G1), sound checker (G2), scoreboard runner (G3), and step validator (S0)
must adhere strictly to these semantics.

---

## 1. The default domain: REAL for school work

For school maths, the default evaluation domain across all features is strictly real (`DEFAULT_DOMAIN`).

1. **School work is real by default**: Variables $x, y, z, \dots$ represent real numbers unless
   explicitly declared in Complex mode.
2. **Complex mode**: Complex answers appear only when the user is explicitly in Complex mode
   (`COMPLEX_MODE` in calculator settings). One exception, the owner's (G3b-1, 12 Oct 2026): **a
   polynomial equation is answered with every root**, complex ones too, because every root is the
   correct answer (§6.3, `POLYNOMIAL_EQUATION_ROOTS`).
3. **No real solution fallback**: When solving an equation in the real domain that has no real
   roots, PhysLab does not report raw complex roots as ordinary answers. Instead, it follows today's
   canonical sentence:
   `"No real solution. In complex numbers: x = …"` (`COMPLEX_FALLBACK_PREFIX`).
   - Citing existing behaviour: `src/renderer/src/calc/roots.ts:319` (`beyondTheReals`) and
     `src/renderer/src/panels/Maths.tsx:243`.
   - Helper: `formatComplexFallback` produces this sentence from root strings.
   - For non-polynomial equations (such as $e^x = -1$ or $\sin(x) = 2$ on $\mathbb{R}$) with no
     real solution, the engine returns `"No real solution."` or the complex fallback if known (**[owner]**).

---

## 2. Real odd roots: (−8)^(1/3) = −2

The owner's rule since CW7a: an odd root of a negative real number is the real root everywhere:
$$(-8)^{1/3} = -2, \quad (-8)^{2/3} = ((-8)^{1/3})^2 = 4$$

1. **The rule in code**:
   - `src/renderer/src/calc/engine.ts:478` (`evaluateWithRealRoots`).
   - Tested in `tests/oddRoots.test.ts:58-75`.
   - Pure functions in `src/renderer/src/math/engine/semantics.ts`:
     `evaluateRealOddRoot`, `isOddInteger`, `parseRationalExponent`, and `hasRealOddRootInterpretation`.
2. **Even roots of negative numbers**:
   Even roots of negative real numbers (such as $(-4)^{1/2}$ or $(-16)^{1/4}$) have no real value and
   are not real on $\mathbb{R}$.
3. **Engine obligation**:
   When configuring or calling an engine in downstream stages, the real odd root branch must be enabled,
   and fractional powers with odd denominators evaluated on the real axis must not produce complex
   numbers (e.g. $1 + \sqrt{3}i$) on real inputs.

---

## 3. Principal values and branch cuts

For transcendental and multivalued functions on $\mathbb{R}$:

1. **Square root**:
   $\sqrt{x^2} = |x|$ for all real $x$. Simplifying $\sqrt{x^2} \to x$ is only valid when $x \ge 0$
   is explicitly known or assumed.
2. **Logarithms**:
   - Real natural logarithm $\ln(x)$ is defined only for $x > 0$.
   - $\ln(x^2) = 2\ln|x|$ for $x \ne 0$. Simplifying $\ln(x^2) \to 2\ln(x)$ is false for negative
     real numbers ($x < 0$).
3. **Inverse trigonometric functions**:
   - $\arcsin: [-1, 1] \to [-\pi/2, \pi/2]$ (or $[-90^\circ, 90^\circ]$ in degrees).
   - $\arccos: [-1, 1] \to [0, \pi]$ (or $[0^\circ, 180^\circ]$ in degrees).
   - $\arctan: \mathbb{R} \to (-\pi/2, \pi/2)$ (or $(-90^\circ, 90^\circ)$ in degrees).
   - Defined in `INVERSE_TRIG_BRANCHES` and validated via `isInPrincipalRange`.
4. **Assumptions per job**:
   - Engines must not silently assume $x > 0$ on general real expressions.
   - When an algebraic transformation requires an assumption (e.g. $x > 0$), it must be made
     explicit to the student using `formatAssumptionNotice`: `"Assuming x > 0"` (**[owner]**).

---

## 4. How domain restrictions are written

When an expression is simplified or manipulated, singularities and removable discontinuities must
be tracked and presented:

1. **Notation**:
   - Plain text: `"x ≠ 1"`, `"x > 0"` via `formatRestriction`.
   - LaTeX fragments: `x \ne 1`, `x > 0` via `formatRestrictionTex` (embedded in `$x \ne 1$` for display).
2. **Cancelled factor rule**:
   When simplifying a rational function $\frac{P(x)}{Q(x)}$ where a non-constant polynomial factor
   $D(x)$ cancels between numerator and denominator:
   $$\frac{x(x-1)}{x-1} = x, \quad x \ne 1$$
   The cancelled factor's zeros must be recorded and reported as domain restrictions via
   `formatCancelledFactorRestriction` (**[owner]**).
   - In Real mode, only real zeros of $D(x)$ (rational or irrational, such as $x \ne \pm\sqrt{2}$) require domain restrictions; factors with no real zeros (such as $x^2 + 1$) do not vanish on $\mathbb{R}$.
   - In Complex mode, complex zeros of $D(x)$ (such as $x(x^2+1)/(x^2+1) = x, x \ne \pm i$) are tracked and reported via `formatCancelledFactorRestriction('x', ['i', '-i'])` or complex `{ re, im }` entries.
3. **Equation solving**:
   Candidates arising from multiplying both sides by an expression or squaring must be checked
   against domain restrictions to eliminate extraneous roots.

---

## 5. Periodic solution form

Trigonometric equations on $\mathbb{R}$ with periodic solution sets must be reported in standard
form:

1. **Radians**:
   $$x = \text{base} + 2k\pi, \quad k \in \mathbb{Z}$$
   (or $k\pi$ for period $\pi$). Formatted via `formatPeriodicSolution`.
2. **Degrees**:
   $$x = \text{base}^\circ + 360^\circ k, \quad k \in \mathbb{Z}$$
   (or $180^\circ k$ for period $180^\circ$).
3. **Parameters**:
   - Default parameter variable is `k` (`k ∈ ℤ` / $k \in \mathbb{Z}$).
   - If `k` is already bound in the input equation, use `n` (`n ∈ ℤ`).
4. **Relationship to numeric solver**:
   The command bar's numeric graphing solver finds the nearest roots and reports
   `"The pattern repeats every 6.28."` (see `tests/commands.test.ts:1487`). Symbolic algebra
   engines produce the exact periodic form $x = \text{base} + 2k\pi, k \in \mathbb{Z}$ (**[owner]**).

---

## 6. Canonical comparison per job (for checkers)

Checkers (G2) must not rely on fragile string matching. They use exact algebraic canonical
comparisons specified in `ENGINE_SEMANTICS_JOBS`:

1. **Polynomials (`expand`, `factor`)**:
   Equality in the polynomial ring $\mathbb{Q}[x_1, \dots, x_n]$. Expand both candidate and reference
   to canonical sum of monomials with exact rational coefficients. The difference must be zero
   (`comparePolynomials`, also exported as `comparePolynomialsExact`).
2. **Rational functions (`simplify`, `apart`)**:
   Cross-multiplication check: $\frac{P_1}{Q_1} = \frac{P_2}{Q_2} \iff P_1 Q_2 - P_2 Q_1 = 0$ in
   $\mathbb{Q}[x_1, \dots, x_n]$, verified via `compareRationalFunctions` / `compareRationalFunctionsExact`, alongside checking that excluded points match symmetrically and that all cancelled denominator roots (where $Q_1(r) = 0$ while $Q_2(r) \ne 0$ or vice versa) are explicitly listed in the domain restrictions (supporting exact rationals, irrationals, and complex conjugate pairs).
3. **Equations (`solve`)**:
   Equality of the solution set with multiplicities:
   $S = \{ (r_i, m_i) \}$. Representation is normalized across engines (grouped vs ungrouped repeated roots).
   - **A polynomial equation shows every root** (the owner, G3b-1: "all roots, because all roots is the correct
     answer"; `POLYNOMIAL_EQUATION_ROOTS` is `'complex'`). Its answer is compared in Complex mode: complete by degree
     ($\sum m_i = n$, counted with algebraic multiplicity by the Fundamental Theorem of Algebra), in exact form.
     The roots are shown real ones first, smallest first, then each complex pair $a + bi$, $a - bi$ in order of its
     real part, then of the size of $b$ (`orderRoots` in calc/roots.ts, the one rule every route uses):
     $x^3 = 1$ gives $x = 1$, $x = -\frac{1}{2} + \frac{\sqrt{3}}{2}i$, $x = -\frac{1}{2} - \frac{\sqrt{3}}{2}i$. A repeated
     root is listed once, as both engines and the screen list it today ($(x - 2)^2 = 0$ shows $x = 2$); its
     multiplicity is counted by the checkers, and the engine's rows carry no field for it.
   - **When there is no real root at all**, the calculator's own solver keeps its sentence,
     `"No real solution. In complex numbers: x = …"` (`COMPLEX_FALLBACK_PREFIX`, §1.3).
   - **Any other equation** (trigonometric, exponential, with a root sign) keeps the real domain: its real solutions,
     and the complex ones only when there is no real one; the sum of real multiplicities $\le n$.
   - Both engines agree: SymPy has always listed every root of a polynomial; Giac's adapter asks `csolve` for one
     (docs/knowledge/giac-adapter.md). Verified via `compareSolutionSets` and, for the engines' answers, by the
     scoreboard's judge and G4's `verify.ts` (math/engine/verify.ts).
4. **Linear systems (`linearSystems`)**:
   Classified via `classifyLinearSystem` into:
   - `'unique'`: unique solution vector.
   - `'infinite'`: infinitely many solutions, reported in standard parametric vector form $x = c + t \cdot v, t \in \mathbb{R}$ via `formatParametricLinearSolution` (**[owner]** G00-5).
   - `'none'`: inconsistent system (no solution).
5. **Derivatives (`diff`)**:
   Canonical comparison requires exact algebraic equivalence on the common domain: difference between candidate and reference derivative must be identically zero ($F'(x) - f(x) \equiv 0$). For polynomials, this is evaluated exactly via `compareDerivativesExact`. For general non-polynomial functions, formal equivalence requires symbolic zero testing; finite numeric point sampling (`compareDerivativesOnDomain`) is a heuristic screening fallback, not the canonical equality proof.
6. **Integrals (`integrate`)**:
   Canonical comparison requires exact equality up to an additive constant on each connected component of the common domain: $(F_{\text{cand}}(x) - F_{\text{ref}}(x))' \equiv 0$. For polynomial antiderivatives, differentiation and exact comparison with the integrand in $\mathbb{Q}[x]$ via `compareIntegralByDifferentiationExact` provides the canonical proof. Finite numeric interval sampling (`compareIntegralsOnIntervals`) is a heuristic screening fallback, not the canonical equality proof.

---

## 7. The canonical adversarial list

Every checker (G2), scoreboard harness (G3), and step validator (S0) must pass against the 16
adversarial test cases defined in `ADVERSARIAL_CASES`:

1. `sqrt_x_sq`: $\sqrt{x^2}$ vs $x$ and $|x|$. Pitfall: simplifying to $x$ when $x < 0$.
2. `log_x_sq`: $\ln(x^2)$ vs $2\ln(x)$. Pitfall: simplifying to $2\ln(x)$ when $x < 0$.
3. `cancelled_factor`: $\frac{x(x-1)}{x-1}$. Pitfall: simplifying to $x$ without $x \ne 1$.
4. `pole_odd_inv_x`: $1/x$ near $0$. Pitfall: assuming two-sided limit exists ($-\infty \ne +\infty$).
5. `pole_even_inv_x_sq`: $1/x^2$ near $0$. Pitfall: division by zero or sign error.
6. `abs_val_diff`: $|x|$ at $x = 0$. Pitfall: claiming derivative exists at the corner.
7. `sign_func`: $\operatorname{sgn}(x)$ at $0$. Pitfall: treating jump discontinuity as continuous.
8. `piecewise`: Piecewise boundary transitions. Pitfall: differentiating across non-smooth seams.
9. `tan_pole`: $\tan(x)$ near $\pi/2$. Pitfall: vertical asymptote sign flips and overflow.
10. `double_root`: $(x-2)^2 = 0$. Pitfall: reporting root without multiplicity 2.
11. `missing_root`: $x^2 = x$. Pitfall: dividing by $x$ and losing root $x = 0$.
12. `extraneous_root_squaring`: $x = \sqrt{x+2}$. Pitfall: squaring yields $x = -1$, which is invalid.
13. `zero_times_inf`: $0 \cdot \infty$ indeterminate forms, e.g. $\lim_{x \to 0} x \cdot (1/x) = 1$.
14. `odd_root_neg`: $(-8)^{1/3} = -2$. Pitfall: returning principal complex value $1 + \sqrt{3}i$.
15. `euler_identity`: $e^{i\pi} = -1$. Pitfall: floating-point residual $-1 + \epsilon i$.
16. `extreme_coefficients`: $10^{-19}$ and $6 \times 10^{24}$. Pitfall: underflow to 0 or precision loss.

---

## 8. Summary of proposed owner approvals [owner]

All newly proposed semantics where the app had no existing rule are recorded in `OWNER-APPROVALS.md`
under "Engine semantics (G00)" (all 5 items):
- `G00-1`: Cancelled rational factor reporting in simplification ($x(x-1)/(x-1) = x, x \ne 1$).
- `G00-2`: Explicit assumption annotation when positive domain is assumed ("Assuming x > 0").
- `G00-3`: Symbolic periodic solution standard form ($x = \text{base} + 2k\pi, k \in \mathbb{Z}$ or $360^\circ k$).
- `G00-4`: General non-polynomial equations with no real roots ("No real solution.").
- `G00-5`: Linear system parametric form for infinite solution spaces.
