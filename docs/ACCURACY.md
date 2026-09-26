# PhysLab's accuracy policy

One page, so every future tolerance argument has an answer to point at. This is the "one written
rule" Idea 12 (§5.10, FIG. 3) asks for, and the "2 % by default" marking tolerance PROGRAM-0.9.md
§5 approved for the whole app. It binds new tests the way AGENTS.md's other rules bind new code —
follow it, and if a test needs to disagree with it, say why in the test itself.

## How each kind of number is compared

| Kind of number | How it is compared | Example |
|---|---|---|
| Exact (Pure Math) — fractions of big integers | Equal to the last digit. No tolerance at all. `math/pure/rat.ts` is bigint over bigint for exactly this reason. | `3/20 + 1/4 = 2/5`, never `0.4000000001`. |
| Floating-point formula — vectors, geometry, graphs | `\|a − b\| ≤ max(10⁻¹² × \|b\|, 10⁻¹⁵)` — a relative tolerance with a tiny absolute floor, so a result near zero is not held to a relative standard that can never be met. | A vector's length, a triangle's angle. |
| Calculator display — 10 significant figures | Agrees with mpmath at 50 digits, in every figure the calculator shows. (The oracle tests that do this are a `full`-level hook, §5.3 below — not built yet.) | `ln 2 = 0.6931471806`. |
| Physics run — the Sandbox, apparatus | A stated percentage, with the reason for that number written next to it (step size, an engine limit, a measurement's own precision) — never a bare tolerance nobody can explain. | Bounce height within 1 % at 1/600 s; the error must shrink again at a smaller step, or the check has caught a real integration mistake, not just noise. |
| Marking a student's answer | **One rule for the whole app: `\|a − b\| ≤ 0.02 × \|b\|` — 2 % relative to the expected answer `b`, nothing more.** An expected answer of exactly 0 has no relative scale, so that question states its own absolute tolerance. Tested with an answer just inside the tolerance and one just outside. (`questions/parts.ts`'s `toAbsoluteTol` already marks this way.) | On an expected `50`: `49.0` and `51.0` are accepted; `48.99` and `51.01` are refused. |
| What is shown on screen | The student's chosen precision (Rule 4, `math/format.ts`); an uncertainty carries exactly one significant figure (Idea 2's GUM budget). | `0.84 ± 0.01 s`. |

### The one marking tolerance — closed in 0.9 (INT-Wave1)

PROGRAM-0.9.md §5 (Idea 12 decision 5.1) settles on **one tolerance, 2 %,** for the whole app, so
a practice problem and a bundled question mark an answer the same way. `questions/numbas.ts`
defaults to `{ kind: 'relative', value: 0.02 }` (2 %) wherever a Numbas source leaves the
tolerance to guess. `math/problems.ts`'s `tolOf` used to mark practice problems at 1 % with a
floor of 0.05 in the answer's own units — the gap Idea 12's own research found (§2, "Weak spots
found while reading"); on a small answer such as 0.0024 A the floor accepted anything within
±0.05 A. It is now plain 2 % relative, and a problem whose answer can be exactly 0 (a component,
a dot or cross product, the work done at 90°) states its own absolute tolerance of 0.05.
`isCorrect` counts only a `right` verdict: `close` (four tolerances out) still names the likely
slip, but is not ticked. `tests/practiceTolerance.test.ts` runs this section's example for
Practice and for the question bank.

### What "exact" means

"Exact" is a claim about the *representation*, not about rounding to look tidy. `3/20` is exact;
`0.15` printed from a float that is actually `0.1499999999999999944…` is not, even though it
displays as `0.15`. Pure Math's fractions, and anything built only from the 2019 SI redefinition's
seven exact constants (see `calc/constants.ts`'s header comment), are the only things this app
ever calls exact. Everything else — including every physics answer, every calculator result, and
every constant CODATA reports with an uncertainty — is a *measured or computed approximation*,
however many figures it is shown to.

### Reference answers ("oracles")

The repository already ships SymPy 1.14.0 and mpmath 1.4.1 (`src/renderer/public/pyodide`) as an
independent judge of "right": a test can run real SymPy inside Node, offline, no Python install,
no network (Idea 12 §5.3). Comparing the exact engine against SymPy, and the calculator against
mpmath at 50 digits, is a `full`-level gate hook (`scripts/gate-core.mjs`'s `oracle-tests` step) —
designed here, not built yet; Wave 8 wires it up.

### The flaky-test rule

A test that fails only under load and passes alone (the whole file, on its own) is **flaky, not
wrong**. It goes on this list with its cause, and on `KNOWN_FLAKY_FILES` in
`scripts/gate-core.mjs`. When a gate test run fails and *every* failing file is on that list, the
gate re-runs just those files alone; if they pass, the tests step is reported amber (`!`, status
`flaky`, with the file names), not green and not red. A red run from any *other* file, a crash
that names no file, or a run with an unhandled error (vitest's "Unhandled Errors" section) even
beside known-flaky failures is never retried and never waved through (AGENTS.md). A flaky test
must be fixed within the next version — usually by importing the slow thing once in `beforeAll`,
or by giving that one test a longer limit, never by loosening what it actually checks.

Known as of this track (PROGRAM-0.9.md §3, matching Idea 12 §2's own measurement):
- `tests/contracts.test.ts` › a huge discriminant — slow under load, passes alone.
- `tests/grid.test.ts` › the axes switch round-trips through `setSettings` and starts on — hits
  Vitest's 5 s limit under load (31 of 31 in 2.3 s alone); it is the first file to import the
  whole scene store.

## The gate

`npm run gate -- <level>` (`quick`, `thorough`, `full` or `deep` — Idea 12 FIG. 1; `merge`,
`release` and `monthly` are accepted as the same four levels, since Idea 12 §5.1's prose names
them differently from its own FIG. 1) is what actually runs these checks and writes a dated report
outside the repository (`C:\my_projects\PhysLab-backups\gate\`). See `scripts/gate-core.mjs` for
the level list and `scripts/gate.mjs` for what each level runs today; a step this policy describes
but the gate does not run yet is listed there as a `pending` hook, and always reports amber, never
red, so it can never block a release by accident before it exists. `npm run dist` refuses to build
unless the `full` level is green (its `predist` script).

A commit is checked by the gate too, once `npm run hooks:install` points git at `.githooks/` (not
run automatically for this track — see PROGRESS.md): the `quick` level on a working branch, and
`thorough` on `main`, so a change that breaks either build never reaches main. The hook caps
vitest at 3 workers (`GATE_MAX_WORKERS`) since several agents share one PC. A commit message starting
`WIP(` is skipped, since a sub-item's mid-point commit is expected to be incomplete; so is any
commit made with `PHYSLAB_SKIP_GATE=1` in the environment, for the rare case a check itself is
broken and blocking every commit.
