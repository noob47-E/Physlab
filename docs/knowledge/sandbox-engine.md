# Sandbox engine — the step, the clock, PhysLab's own forces (SB0)

What the area does: `SimWorld` in `src/renderer/src/sim/world.ts` steps the Jolt world (WASM) for the Sandbox.
Since SB0 it takes ONE Jolt step per PhysLab step at a chosen rate, works out PhysLab's own forces before every
one, runs springs as PhysLab's own Hooke force where that is stable, and tells a listener what each step did.
The overview of the whole Sandbox is `sandbox.md`; this note is the engine underneath it.

## Files
| File | One line |
|---|---|
| `src/renderer/src/sim/types.ts` | `StepRate` (60, 120, 240, 600), `STEP_RATES`, `DEFAULT_STEP_RATE` = 240 (owner decision D3), `rateOf`, `StepWork`, `ContactEvent`, `Touch`, `AfterStep`, `OwnForces`. |
| `src/renderer/src/sim/world.ts` | The loop (`step`, `stepOnce`, `advance`, `beforeStep`, `springForces`, `afterStep`), the clock, `onAfterStep`, `ownForces`, `springModel`, the contact listener. |
| `src/renderer/src/sim/stepping.ts` | The Step button (`stepOneFrame`): one engine step, recorded and published like a frame. |
| `src/renderer/src/core/migrate.ts` | File format 8: `v7ToV8` turns the old Accuracy figure into a step rate. |
| `src/renderer/src/core/schema.ts` | `checkSandbox` refuses a format-8 world asking for a rate PhysLab does not run. |

## The loop
- `step(realDt)` gathers `realDt × timeScale × rate` steps in `accumulator` (in steps, not seconds), clamped to
  0.05 s of simulated time (rate/20 steps). `advance` then takes whole steps; a step is taken when the gathered
  time is within a millionth of a step of it (`STEP_SLACK`), because sixty frames of 1/60 s add up to
  3.9999999999999996 steps at 240 as often as to 4.
- Each step: `beforeStep(1/rate)` (drag, rolling, pushes, the hand, then `springForces`), then
  `joltInterface.Step(1/rate, 1)` — ONE collision step, so nothing is held over sub-steps — then `afterStep`.
- `stepOnce()` is exactly one engine step whatever the time scale (the Step button).
- The drawn pose is still the P13 blend: `prevPose` is read before the last step of a call, and the blend is
  `accumulator` of the way to the next step.

## The clock
- `steps` (read as `stepIndex`) counts engine steps since Reset. The clock counts `ticks` of 1/1200 s, a whole
  number per step at every rate (20, 10, 5, 2 at 60, 120, 240, 600), and `time = ticks / 1200`: the nearest double
  to the true time (`time === 2` after `2·rate` steps, `=== 1/rate` after one). It is the I-2 clock
  startTime + (stepIndex − startStep)/rate, counted so that it stays exact across a change of rate.
- A change of rate part-way (`setWorldSettings({ stepRate })` → `applyRate`) changes only the ticks per step, so
  the clock carries on with no jump; the time gathered towards the next step is rescaled. Reset (`clear`) sets
  steps and ticks to 0; `rebuild(…, preserve)` keeps them.
- Readings (`SimSample`) are taken on the step that reaches each next 0.1 s (every 120 ticks) plus the run's t = 0:
  exactly on k/10 at one rate, and after a change of rate whenever the new steps can land on the grid (counted per
  step from the change instead, a change at t = 1/60 put them at 0.1167, 0.2167 …).

## PhysLab's own forces
- Worked out from where everything is at the START of each step and applied with `AddForce`; Jolt then moves
  v first and x second (semi-implicit Euler). Held over sub-steps (the old `Step(1/60, n)`) a stiff force pumped
  energy in: an own spring grew from 9.0 J to 33.1 J in ten swings (Idea #39 §2.3, finding 4).
- A push (actuator) is read at the middle of the step and acts while `from ≤ t + Δt/2 < until`: 3 N on 1 kg for
  1 s gives 3.000 m/s at every rate.

## Own springs and the stability rule
- `addSpring`: a `spring` link is PhysLab's own force F = (k(L − L₀) + c·v_rel) n̂, n̂ from A to B,
  v_rel = (v_B − v_A)·n̂, +F on A, −F on B; a fixed end gets nothing. k and L₀ have the readout's floors (0.01),
  so the ½kx² on screen (`springEnergyOf` in `energy.ts`) is the spring that acts.
- Stable only while ωΔt is small: ω = √(k/μ) with μ the reduced mass of the moving ends (a body on a fixed
  post: its own mass). If ω/rate ≥ 1 the link is built as Jolt's soft spring exactly as before and
  `springModel(id)` says 'engine' (it loses energy but cannot blow up). A rate change decides again
  (`redecideSprings`, which touches springs only: a full `setLinks` would lay every rope again mid-run).
- Energy of an own spring stays in a band of ±ωΔt/2 of the swinging energy (above AND below the start), with
  no drift; the period is 2π√(m/k) to a few parts in a million at 600.
- A sleeping end is woken when the other end is awake (it is being pulled); two ends at rest stay asleep.

## Work per step (`StepWork`)
- For each body PhysLab pushed: W = F·(x_after − x_before) for drag, push, hand and the spring's damper part;
  rolling is τ·ω_after·Δt. The Hooke part is conservative and not work (its energy is ½kx²).
- Drag, rolling and damper take energy out; a damper's single step at a turning point can read a hair above 0
  (force from the start-of-step speed, motion from the end-of-step speed), never over a swing.
- A push's work over a run is F·(the distance the step actually moved it): 2 N for 1 s is 2(1 + Δt) J, the
  same Δt the free fall loses — the ledger's "step" line, not physics.
- `ownForces(id)` is what PhysLab applied to that body in the last step (zeros for a body nothing pushed).

## Contacts
- `OnContactAdded` records each new contact with the speeds as the engine found it (`vBeforeA/B`), the pair's
  combined coefficients from the bodies' settings (`eUsed` = max(e₁, e₂), `muUsed` = √(μ₁μ₂)) and `step`, the
  step count at the end of the step it was found in, and `t`, the clock at that same instant (it used to be the
  start of the step, a whole step early); `afterStep` fills `vAfterA/B`.
- `vAfterA/B` are the speeds at the END of the step. Two hits on one body inside one step (bodies a hair apart)
  are solved together, so its `vAfter` holds both: at 240 steps a second the hits must be more than 4 ms apart to
  be told apart (the Newton's-cradle trap in AGENTS.md).
- `touches`: every contact of the step (new and continuing, Jolt's normal from a to b and first point), collected
  only while an after-step listener exists.

## The hook
`onAfterStep(fn)` → `fn(world, { step, time, dt, work, contacts, touches })` after every engine step; returns the
unsubscribe. A listener reads only; it must never move or change a body (a listened world steps exactly as an
unlistened one, tested). `SimWorld.create` drops old listeners (a new scene); Reset keeps them.

## File format 8
`sandbox.world.stepRate` replaces `collisionSteps`. A format-7 world gets `rateOf({ collisionSteps: n })`: n sub-steps
of 1/60 s are 60·n steps a second, rounded up to a rate PhysLab runs; no figure (the old default 2) and no world at
all open at 120, exactly as they ran. A format-8 world asking for another rate is refused: "This project asks for
<n> steps a second; PhysLab runs 60, 120, 240 or 600."

`rateOf` with both a `stepRate` and an old `collisionSteps` takes the finer: a preset still saying
`collisionSteps: 8` (Newton's cradle, until its rate is written as a stepRate) is spread over `DEFAULT_WORLD`,
which always carries a stepRate, and must still run at 600.

## Traps met
- **A Jolt getter hands back ONE shared vector per method.** `p1 = a.GetPosition(); p2 = b.GetPosition()` leaves
  both reading b's position; copy the numbers out first (`xyz`). Read the old way, a contact's two velocities were
  both the second body's, so every approach speed was 0 and the Collisions list never showed a hit. Under it
  the sign was wrong too: Jolt's normal points from body 1 into body 2, so the approach is +(v₁ − v₂)·n.
- **A rope must not collide with the bodies it ties.** Its end link's tip sits on the load's surface at the tie and
  a slack rope folds onto its load; the contact pushed them apart while the pins pulled them together, every step:
  a pump that lifted the Crane's crate up its shortened rope (to 4.1 m in 6 s at 600). The contact validator now
  refuses those pairs (`ropeTies`); the rope still meets everything else.
- A listener left subscribed by one scene fired in the next (tests share the one world): `create` clears them.
- A format-8 refusal quotes a number through the app's writer and never shows "null" or quotes for a rate that is not a number.

## Tests
`tests/simHonest.test.ts` (free fall ½g²Δt, launch v₀ₓ(2v₀ᵧ/g − Δt), own spring band, no drift, period,
stability rule, push, drag, rod pendulum, contacts at 600, determinism, handle count, the Crane's rope, damper and
rolling work), `tests/simClockRates.test.ts` (`rateOf`, the clock at every rate, readings, clamp, rate change,
Reset, the hook, touches, `ownForces`), `tests/sandboxFile8.test.ts` (format 8), the Spring-on-ice block of
`tests/energy.test.ts` (within 1 % at 240), `tests/golden/presets.golden.test.ts` (1, 5 and 10 s at each preset's rate).
