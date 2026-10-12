# The Giac adapter (part G1) — code knowledge

Giac answers PhysLab's algebra jobs through the engine socket (`math/engine/`, see cas.md). The
adapter spells each request for Giac, runs it in a Web Worker that holds the vendored runtime
(giac.md), and reads Giac's printed answer back into PhysLab's spelling — or refuses in a sentence.

Status on 2026-10-12: registered in `ENGINES` (math/engine/index.ts), but `ENGINE_FOR` sends it no
job. Moving a job to Giac is part G4, after the scoreboard (G3b). Nothing on screen uses it yet.

## Files

| File | What it does |
|---|---|
| `src/renderer/src/math/engine/giac/spelling.ts` | PhysLab ↔ Giac, through a tree: `readPhysLab`, `readEquation`, `giacOf`, `toGiac`, `readGiac`, `fromGiac`, `physlabText`; the refusal sentences `CANT_READ` and `CANT_SHOW`. |
| `src/renderer/src/math/engine/giac/adapter.ts` | `giacEngine(run)`: one function per job, the checks on Giac's answers, `REFUSALS`, `GIAC_JOBS`. |
| `src/renderer/src/math/engine/giac/worker.ts` | The worker's client: `giacClient` (load, setup, queue, timeout, recycling, cancel), `GIAC_SETUP`, `SENTENCES`, the app's own client (`giacRun`, `warmupGiac`, `warmupGiacWhenIdle`, `cancelGiac`, `useGiacStatus`). |
| `src/renderer/src/math/engine/giac/stages.ts` | The load's stages in a student's words (`STAGE_WORDS`). |
| `src/renderer/src/workers/giac.worker.ts` | The worker: loads `giacwasm.js` once with `importScripts` (a classic worker), runs the setup, evaluates runs of commands, reports its heap. Evaluates only; decides nothing. |
| `tests/engine/giacHeadless.ts` | The same worker file run in a Node worker thread behind a stand-in worker scope: `headlessGiacClient`, `headlessGiacEngine` (for the tests and the scoreboard). |

## Data flow

1. A job's request (PhysLab spelling) is read into a tree by `readPhysLab`; anything it cannot read is
   refused with `CANT_READ` before Giac sees it. Only the functions and names the spelling knows can
   reach Giac, so a typed word never becomes a Giac command (`while(1)` is a product of letters).
2. `giacOf` writes the tree as Giac input, every operand bracketed, every letter as `v_<name>`.
3. The adapter wraps it in the job's command (table below) and sends a run (a list of commands) through
   the client. One run at a time goes to the worker; the worker answers `{ id, outs, heapMb }`.
4. Each printed answer is read by `readGiac` (only `v_` letters, known functions and constants), tidied
   (`exp(1)` is e, an odd-bottom power is the real root), checked, and written as PhysLab's text and LaTeX.
5. The number beside an answer is Giac's own `evalf(re(…), 30)` and `evalf(im(…), 30)`, read by
   `giacNumber`: a value a double cannot hold (10^400, 2^-2000) has no number, never ∞ or 0.

## The spelling map

| PhysLab request | Giac | PhysLab answer |
|---|---|---|
| a letter `x`, `theta`, `x1` | `v_x`, `v_theta`, `v_x1` (no Giac name can clash: Giac reads epsilon as a number, Pi as π, Gamma and Psi as functions) | `x`, `theta`, `x1` |
| `ln(u)` | `ln(u)` | `ln(u)` |
| `log(u)` (base 10) | `log10(u)` | Giac prints `ln(u)/ln(10)` |
| `log(a, b)` (base a of b) | `logb(b, a)` | `log(a, b)` |
| `sqrt(u)`, `√u` | `sqrt(u)` | `sqrt(u)` |
| `u^(p/q)`, q odd; `cbrt(u)`, `∛u`, `nthRoot(u, q)` | `surd(u, q)^p`; `1/surd(u, q)^|p|` for p < 0 | `cbrt(u)` or `nthRoot(u, q)` (the real root to every reader) |
| `|u|`, `mag(u)`, `Abs(u)` | `abs(u)` | `abs(u)` (LaTeX `\left|u\right|`) |
| `sgn(u)`, `sign(u)` | `sign(u)` | `sign(u)` |
| `e`, `E`, `pi`, `π`, `i` | `exp(1)`, `pi`, `i` | `e`, `pi`, `i` |
| `∞`, `Infinity`, `oo`, `inf` | `(+infinity)` | `+infinity` → `Infinity`; Giac's unsigned `infinity` and `undef` are refused |
| a decimal `0.15`, `1e-19` | exactly: `15/10^2`, `1/10^19` | exact |
| `30°`, `30 deg` | radians `30*pi/180`; in degree mode the number itself | — |
| trig in degree mode `sin(u)` | `sin(pi/180*u)` (Giac stays in radians) | radians text, as the other engine's |
| inverse trig in degree mode `asin(u)` | `180/pi*asin(u)` | degrees |
| `2x`, `x y`, `x(x+1)`, `te^t`, `xsin(x)` | explicit products (`t*e^t`, `x*sin(x)`) | — |
| `n!`, `nCr`, `nPr` | `factorial`, `comb`, `perm` | `factorial`, `combinations`, `permutations` |
| an equation `l = r` | `l=r`; a system `[l1=r1, …]` | — |

Refused when reading: a function name with no bracket (`sin x`), a run of letters with a function's name
inside (`sinx`, `cost`), `<`, `≤`, `≠`, `==`, lists and braces, `piecewise`, an unknown character.
Refused when writing back (`CANT_SHOW`): any other Giac name (rootof, LambertW, Si, Ei, Gamma, Zeta,
order_size, bounded_function, an unevaluated integrate …), a negative number under an odd root (Giac's
complex principal value), an answer longer than 20,000 characters.

## The jobs

| Job | Giac command | Checks |
|---|---|---|
| eval, simplify | `simplify(E)`; with trig also `simplify(tcollect(E))` and `normal(E)` | an answer that brings in tan, cot, sec or csc the question did not have is passed over: Giac wrote cos²x − sin²x as (1 − tan²x)/(1 + tan²x), which has no value at π/2 |
| expand, factor, factorComplex | `expand`, `factor` (over ℚ: `with_sqrt(0)`), `cfactor` | — |
| apart | `partfrac(E, x)` | one letter only (two are refused, as the other engine refuses them) |
| diff | `simplify(diff(E, x, n))`; at a point `subst` | the function must have a real value at the point (d/dx ln x is −1 at x = −1, where ln x has none); with abs, sign, floor or ceil the slope is checked from both sides and the function must be continuous there (Giac's derivative of sign x is 0, true except at 0) |
| integrate | `integrate(E, x)`; definite `simplify(integrate(E, x, a, b))` | see below |
| limit | `limit(E, x, a)`, one side `…, 1` or `…, -1` | a side where the function has no real value has no limit (√x from the left; Giac's complex answer is 0), sampled as a graph is drawn; a two-sided limit also asks both sides and they must agree (G00) |
| series | `convert(series(E, x, a, n - 1), polynom)` | n terms as the other engine counts them |
| solve | one polynomial equation in its unknown: `csolve(…)`, every root; any other equation or a system: `solve(…)`, and `csolve(…)` when it finds no real root | every row is put back into every equation with `simplify(subst(…))` and must give 0; a letter equal to itself (y = y) is left out; a row with nothing left is "Every value of x makes that true."; one unknown's roots come back in `orderRoots`' order (real ones smallest first, then each pair a + bi, a − bi) |

**The real domain.** A complex answer is shown only for factorComplex, for a request that itself
writes i, for every root of a polynomial equation (G00 §6.3, the owner's G3b-1), and as solve's fallback
when any other equation has no real root. Any other answer with an i is refused:
"That has no real value." when its number says so (eval √−4, ln(−1), asin 2), and `CANT_SHOW` when
it has letters or Giac gives no number. An i that cancels (a real number Giac wrote with i) leaves an
imaginary part that is round-off beside the value, and is dropped.

**Definite integrals.** Giac answers with the principal value across a pole: ∫₋₁¹ dx/x = 0 and
∫₀^π tan x dx = 0. So the adapter asks `singular(E, x)`, cuts the interval at every real point inside,
and integrates each piece: one infinite piece gives ±∞, opposite infinities or an `undef` give
"This integral has no value: it does not converge." `singular` lists a periodic function's points once
(tan's ±π/2, not 5π/2), so each piece is also sampled the way a graph is drawn (`compileScalar`,
20,000 points): a sign change between two neighbouring samples that are both over 100 times the
integrand's median size is a pole, and the integral is refused ("This one cannot be worked out
exactly.") — a continuous function cannot do that between points so close, and an integrable
singularity such as x^(−1/3) grows too slowly to do it. Infinite bounds are not sampled.

## The worker's life (worker.ts)

- **Setup, proved at every start.** `GIAC_SETUP`: `complex_mode:=0` (the real domain), `complex_variables:=0`
  (letters are real), `angle_radian:=1` (radians; degrees are written into the request),
  `with_sqrt(0)` (factor over ℚ), `all_trig_solutions:=0` (principal solutions), `approx_mode:=0`
  (exact). Each must answer its value or the load fails. tests/engine/giac.engine.test.ts proves
  each by the answer that changes when it is flipped. Real odd roots are not a Giac setting: Giac's
  `(-8)^(1/3)` is complex, so every odd root is sent as `surd`.
- **Load.** The worker reports stage 1 (loading the algebra library) and 2 (getting it ready), then
  ready. The load has its own 120 s limit (`BOOT_TIMEOUT_MS`). The runtime needs `UI.add_evalf = 0`
  (or every exact answer ends "=1.414…"), `UI.Datestart` (simplify reads it as a clock and threw
  "UI is not defined") and `Module.worker` (or it reads window.navigator).
- **Timeout.** `RUN_TIMEOUT_MS` = 20 s per run, counted only while the ready worker runs it. Giac
  cannot be interrupted, so the worker is terminated and a fresh one started at once; the run answers
  "This took too long, so it was stopped. …" and the runs queued behind it go to the fresh worker.
  A job is one to four runs.
- **Crash.** A run that fills the heap (`expand((x+y+z+w)^200)`) aborts the runtime, and
  `factorial(10^9)` throws an exception the build cannot catch: either way the worker is replaced and
  the run answers "That is too big to work out. Try a simpler expression."
- **Recycling.** After `RECYCLE_AFTER_RUNS` = 500 runs (about 300 jobs), or once a run leaves more
  than `RECYCLE_ABOVE_MB` = 64 MB of the fixed 256 MB heap taken, between runs, with the fresh
  worker loading at once.
- **Cancel** answers every waiting run "Cancelled."; the next run starts a fresh worker.
- **Warm-up.** `warmupGiacWhenIdle` loads Giac when the app is idle. Not called while every job is
  on the other engine: G4 wires it, with `useGiacStatus` and `cancelGiac`, when a job moves.

## Numbers measured (2026-10-12, owner's PC)

- Cold start, packaged app (`node scripts/giac-smoke.mjs`, 03:09): load 499 ms, first job (load and
  answer) 542 ms, the next two jobs 51 ms; offline web: load 1,254 ms, first job 2,748 ms, next two 76 ms.
  G0 measured 390–884 ms for the bare runtime.
- Cold start headless (Node worker thread, 02:50, 8 starts): 1,018–1,371 ms in the worker,
  1,104–1,605 ms to the first answer.
- 1,500 ordinary jobs (2,464 runs) headless: median 1.0 ms a job, 95th percentile 3.8 ms; the heap
  went from 10.1 MB to 11.6 MB.
- Heavy jobs: factorial(10^5) 2.8 s, heap 16 MB; expand((x+y+z)^60) 0.14 s; expand((x+y+z+w)^40)
  0.7 s, heap 28 MB, and its 509 KB answer is refused; expand((x+y+z+w)^200) fills the heap in 3 s.
- `factorial(10^7)` runs past 40 s: the tests use it as the never-ending input the timeout must stop.

## Known gaps, with their reasons

- **exact** is not a Giac job: Giac has no closed-form recogniser, and `exact(1.4142135623730951)`
  is 1607521/1136689. Answering would be a guess. The conformance suite skips it.
- **integralSteps, diffSteps**: Giac returns no rule tree. The working is PhysLab's own methods (S1).
- **Every root of a polynomial equation** (the owner, G3b-1, 12 Oct 2026). A polynomial equation in
  one unknown (sums, products and whole powers of it; any coefficients) is solved with `csolve`, so
  x³ = 1 answers 1 and −1/2 ± (√3/2)i, as the other engine always has. An equation that is not
  polynomial (e^x = 2, √x = x − 2, 2^x = 8) and a system keep the real domain, with the complex
  solutions only when there is no real one. A repeated root comes back once, as from the other
  engine. `EngineRequest` still has no Complex-mode flag.
- **What a result cannot carry**: a cancelled factor's restriction (x ≠ 1) and a root's multiplicity
  are the checkers' (G2); `EngineResult` has no field for them.
- **Periodic poles** beyond `singular`'s list are found only by sampling, on finite bounds.
- `I` is a letter here, as in PhysLab's own reader; the other engine read it as i. `E` is e in both.
- An answer Giac can only give as a decimal (x = cos x, x⁵ − x + 1 = 0, ∫₀¹ e^(x²) dx) is refused
  "This one cannot be worked out exactly."; a form PhysLab cannot show yet is refused `CANT_SHOW`.

## The first draft

Jules drafted the spelling with regular expressions (session 14735186637694874983). Run before it was
replaced, it rewrote "zoom" to "z+infinitym", turned sin(x)^(1/3) into "sinsurd((x), 3)", sent only
1/n powers as real roots, sent π as a letter, read log(2, 8) as log10(2, 8), ignored degrees, left
implicit products and decimals as typed, and let LambertW, order_size, undef and list[…] through to
the screen. tests/engine/giac-spelling.test.ts keeps each of those as a case.

## Tests

- `tests/engine/giac-spelling.test.ts`: the spelling as pure functions — the draft's faults, the
  reading rules, the names, Giac's recorded answers, 150 round trips (`giacCases.ts`), the adversarial
  list, every LaTeX through KaTeX.
- `tests/engine/giac.conformance.test.ts`: `engineConformance('giac (headless)', …)` against the real runtime.
- `tests/engine/giac.engine.test.ts`: each setting proved, real odd roots, every G00 adversarial item,
  the refusals, no Giac name on screen, the 150 round trips through the engine itself.
- `tests/engine/giac.worker.test.ts`: timeout and recovery, the queue behind a hung run, heap and
  exception crashes, recycling by runs and by heap, the load and its stages, a failed setup, Cancel,
  the clock counting only the run, the app's own client.
- `scripts/giac-smoke.mjs`: both builds' own worker chunk answers factor, (−8)^(1/3) and x² + 1 = 0
  through the adapter.
