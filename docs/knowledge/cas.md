# The algebra engine (CAS) — code knowledge

What the area does: exact algebra the calculator's own maths cannot do (solve systems, symbolic
d/dx and ∫, limits, series, factorise over ℂ, partial fractions, step trees for the Working panel)
runs in a **web worker** that loads Python (Pyodide) and SymPy from `public/pyodide`. Nothing is
online. The first load takes seconds, so the client shows where it is and never looks frozen.

## File map
| File | One line |
|---|---|
| `src/renderer/src/math/cas.ts` | The client: `cas(op, payload)` → Promise, the worker's life (boot, restart, `cancelCas`), timeouts, the request queue, `useCasStatus` (status, stage, busy, message), `warmupCas` / `warmupCasWhenIdle`. |
| `src/renderer/src/workers/cas.worker.ts` | The worker: the Python `PRELUDE` (`cas_run(op, payload)`, the name table `_names`, `_plain_error`, the step engines `integral_steps_op` / `diff_steps_op`) and the JS loader that boots Pyodide and posts load stages. |
| `src/renderer/src/ui/casStatus.ts` | Every sentence about the engine's state: `describeCasStatus` (the bar's dot and words), `casStartingSentence`, `casWaitNote`, `followCasStart` (keeps a waiting line in step with the stage). |
| `src/renderer/src/app/CommandBar.tsx` | The bar: input, suggestions, history, the engine status and Stop; keys decided by `app/commandBarKeys.ts` (`decideKey`, `recall`). |
| `src/renderer/src/lang/commands.ts` `tryCas` (~990–1060) | Turns a typed `solve(…)`, `diff(…)`, `integrate(…)`… into a payload; the background `cas('exact')` (~1150). |
| `src/renderer/src/math/pure/store.ts` | The Working panel's CAS requests (`casRequestFor`, `stepsRequest`, `boundForSymPy`) and its waiting sentence. |
| `src/renderer/src/panels/Maths.tsx` (~1020–1035) | The Maths screen's engine status. |

## Data flow
1. Warm-up: the command bar (on screen in every mode) starts the engine once the app has painted
   and gone idle; the Calculator also warms it on entry. A second warm-up never makes a second worker.
2. Boot: the worker posts stage 1 (Python), 2 (the algebra library), 3 (setup), then ready; each
   reaches `useCasStatus.stage` and every waiting line ("Starting the algebra engine (2 of 3…)").
   Boot has its own 120 s limit; a failed boot ends the worker and the next command starts a new one.
3. A request made during boot waits in the queue and is answered once ready. Its 30 s limit starts
   only when it is the request the ready engine is running.
4. The worker answers `{ id, result }`; a Python exception becomes a plain sentence in `error` (raw
   text only in `detail`, never shown).

## Invariants
- Every request is answered: a result, a plain sentence, or "Cancelled.". Never "Working…" forever.
- A timer only ever kills the worker for the request it belongs to, while that request runs.
- Degree mode (`casInDegrees`) reaches every call and every point, bound and limit inside it; the
  step engines work in radians by design and say so (`deg_ignored`).
- `log(a, b)` is log base a of b everywhere (expr.ts, the field's log_a b, the worker).
- No sentence a student reads contains Python's text; none of the worker's failure sentences starts
  "The algebra engine" (the Working panel passes those through as engine trouble).
- The command bar never throws away a typed line that was not run (`recall` keeps it as a draft).

## Traps (each guarded by a test)
- The 30 s timeout counted boot and queue time and killed a half-loaded worker — `tests/casBoot.test.ts`.
- A recovered worker error left the status on "error" — `tests/casBoot.test.ts`.
- Python's "invalid syntax (<string>, line 1)" reached the bar — `tests/casWorker.test.ts`.
- A trig function inside a bound was read in radians in degree mode — `tests/casWorker.test.ts`.
- `solve({…}, {x, y})`: `splitArgs` does not count braces — `tests/casSolve.test.ts`.
- Enter / arrows / Tab in the bar — `tests/commandBarKeys.test.ts`.

## Tests
`casBoot` (fake worker), `casWorker` (the real Python in bundled Pyodide), `casStatus`, `casSolve`,
`commandBarKeys`, `contracts`, and the calculus suites (`calculusWired`, `glmfixSteps`).
