# The algebra engine (CAS) — code knowledge

What the area does: exact algebra the calculator's own maths cannot do (solve systems, symbolic
d/dx and ∫, limits, series, factorise over ℂ, partial fractions, step trees for the Working panel)
runs in a **web worker** that loads Python (Pyodide) and SymPy from `public/pyodide`. Nothing is
online. The first load takes seconds, so the client shows where it is and never looks frozen.

## File map
| File | One line |
|---|---|
| `src/renderer/src/math/engine/index.ts` | **The socket.** `ENGINE_FOR` (which engine answers each job), `ask(job, req)`, `workSteps(job, req, ctx)`, `useEngineStatus`, `cancelEngine`, `warmupEngine(WhenIdle)`, the load-stage words. The only door to an engine. |
| `src/renderer/src/math/engine/types.ts` | `MathEngine`, the jobs (`ENGINE_JOBS`), `EngineRequest` (PhysLab spelling), `EngineResult` / `EngineValue` (PhysLab results), `StepsContext`, `EngineStatus`. |
| `src/renderer/src/math/engine/sympy/adapter.ts` | The SymPy adapter: job → worker op and payload (`sympyRequest`), replies → results (`text` in PhysLab spelling), rule trees → working (`stepsFromReply`), refusals in PhysLab's words. |
| `src/renderer/src/math/engine/sympy/worker.ts` | The worker client (was math/cas.ts): `cas(op, payload)` → Promise, the worker's life (boot, restart, `cancelCas`), timeouts, the request queue, `useCasStatus`, `warmupCas` / `warmupCasWhenIdle`. |
| `src/renderer/src/math/engine/sympy/spelling.ts`, `calculusSteps.ts`, `stages.ts` | SymPy's spelling both ways (`lamda`, `oo`; `**`, `E`, `I`, `log` → `ln`), the reader of its integral and derivative rule trees, its load-stage words. |
| `src/renderer/src/math/engine/dummy.ts` | A second engine (mathjs's derivative, one job): proof that an adapter plugs in with nothing else changing. Not used by the app. |
| `src/renderer/src/workers/cas.worker.ts` | The worker: the Python `PRELUDE` (`cas_run(op, payload)`, the name table `_names`, `_plain_error`, the step engines `integral_steps_op` / `diff_steps_op`) and the JS loader that boots Pyodide and posts load stages. |
| `src/renderer/src/ui/casStatus.ts` | Every sentence about the engine's state: `describeCasStatus` (the bar's dot and words), `casStartingSentence`, `casWaitNote`, `followCasStart` (keeps a waiting line in step with the stage). |
| `src/renderer/src/app/CommandBar.tsx` | The bar: input, suggestions, history, the engine status and Stop; keys decided by `app/commandBarKeys.ts` (`decideKey`, `recall`). |
| `src/renderer/src/lang/commands.ts` `tryCas` | Turns a typed `solve(…)`, `diff(…)`, `integrate(…)`… into an `EngineRequest` and `ask`s; the background `ask('exact')`. |
| `src/renderer/src/math/pure/store.ts` | The Working panel's engine requests (`engineRequestFor`, `stepsRequest`, `spelledOut`) and its waiting sentence. |
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

## The socket (CLEANUP-PLAN.md CW15)
- Nothing outside `math/engine/` (and the worker, and `public/`) names the engine or imports an
  adapter's files; `tests/guards/engineSocket.test.ts` fails if one does.
- A request is in PhysLab's spelling: `2*x`, `x^2`, `sqrt`, `ln` (natural) and `log` (base 10),
  ∞ or `Infinity`, Greek spelt out by `spelledOut`. An answer's `latex` is for the screen and its
  `text` is PhysLab spelling, readable by math/expr.ts. An `error` is always a student's sentence.
- Steps come back as a finished `Working`: the engine's rule trees never leave its adapter.
- **To add an engine (Giac, Rubi):** write `math/engine/<name>/adapter.ts` returning a `MathEngine`;
  add a `tests/engine/<name>.conformance.test.ts` calling `engineConformance` (declare any gap in
  `knownGaps`, with its reason); when it passes, add it to `ENGINES` in math/engine/index.ts and point its jobs at it in `ENGINE_FOR`. The `cas`
  and `steps` golden sweeps record what SymPy answers today, so a job moved to another engine shows
  every line that changes.

## Tests
`casBoot` (fake worker), `casWorker` (the real Python in bundled Pyodide), `casStatus`, `casSolve`,
`commandBarKeys`, `contracts`, the calculus suites (`calculusWired`, `glmfixSteps`), the engine
conformance suites (`tests/engine/`), the socket guard, and the `cas` and `steps` golden sweeps.
The SymPy-pinning tests read the adapter's contract through `tests/helpers/sympyRequests.ts`.
