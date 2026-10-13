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
- A new rate starts only on a tick its steps can reach the 0.1 s grid from (SB9, the wave head's decision a): asked
  for anywhere else (one step at 600, then 240: tick 2) it waits in `pendingRate` while the old rate takes the
  steps to the first such tick (tick 10, 1/120 s; never more than 1/60 s), then `takeUpRate` switches. `stepRate`
  is the rate in force. Reset starts a waiting rate at once; the panel resets anyway.
- Readings (`SimSample`) are taken on the step that reaches each next 0.1 s (every 120 ticks) plus the run's t = 0,
  always exactly on k/10 (before SB9, one step at 600 and then 240 read at 122/1200 s).

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

## The floor (SB3fix)
- The ground body is drawn from its own size (10 km by default, so the camera meets the horizon), but the engine
  does not build that box. `isPlaneFloor(def)` in `world.ts`: a **static** ground whose width and depth are both at
  least `PLANE_FLOOR_FROM` (1 km) becomes Jolt's `PlaneShape` — normal up, constant `−size[1]/2` in the body's own
  frame, so the top is exactly where the box's top face was; broad-phase half-extent `max(5 km, half the width)`.
  Everything else (a floor typed smaller, a file saved with the old 200 m floor, a kinematic or dynamic "ground") is
  still the box of the size it states, with its edge, exactly as before; `FILE_VERSION` did not change.
- Why: as a 10 km box every contact was worked out against corners 5 km away in 32-bit numbers. A ball dropped at
  x = −1 ended 1 cm sideways, the moon ball 2 mm, the foam ball had 0.012 m/s sideways, a landed ball sat 3 mm
  low. A plane's normal is exactly up and it has no corners: a ball dropped straight down moves 0 sideways.
- Even a 50 m box leaves 5·10⁻⁵ m of sideways drift in 10 s, a 200 m box 2·10⁻⁴ m (GJK tolerance); only the plane
  is exact. That is why the golden shows contact-noise numbers (×10⁻⁹) going to 0 and a few last digits moving.
- **A body far from the floor's origin still loses digits.** Jolt keeps positions in 32 bits (61 µm apart at
  1 km), so a ball rolling 1 km out ends up to 0.4 mm from where the same ball ends at the origin. The 10 km box was
  21 mm off. Do not promise 0.1 mm at a kilometre.
- **`new J.PlaneShape(plane, undefined, half)` drops `half`.** The binding reads an undefined argument as "use the
  defaults for the rest", so the floor was 1 km wide and a ball at x = 1000 fell through. Pass `null` for the material.
- The plane and the vector it was built from are tracked and released like any handle; the shape belongs to the body.

## The hook
`onAfterStep(fn)` → `fn(world, { step, time, dt, work, contacts, touches })` after every engine step; returns the
unsubscribe. A listener reads only; it must never move or change a body (a listened world steps exactly as an
unlistened one, tested). `SimWorld.create` drops old listeners (a new scene); Reset keeps them.

## Keyframes (SB9)
What the tape (SB12) needs: every step's record, and a way to put the world back EXACTLY (Branch from here, Fine replay).
- `recordLayout()`: the bodies in `order`, then each rope's links, rope by rope (`{ linkId, count }`, as the links
  were given). `readRecord(out)`: REC_FLOATS (13) float32 numbers per body — position, quaternion x y z w,
  velocity, angular velocity — read straight off Jolt, no allocation (the body list is cached per build); a buffer
  too short throws. The Crane is (3 + 13) × 13 floats.
- `saveKeyframe()` → `{ step, time, rebuild }` (frozen). Behind it, private: a tracked `StateRecorderImpl` filled by
  `physics.SaveState(rec, EStateRecorderState_All)` (bodies with their sleep state, the contact cache that
  warm-starts the next step, the joints' impulses, gravity, the last Δt), and PhysLab's own state: steps, ticks,
  the t = 0 reading flag, the rate and a waiting rate, the settings, `touching` (rolling resistance reads it),
  the hand, the last own forces, the pushes, the own springs in their order, and each body's definition.
- `restoreKeyframe(k)`: false (and nothing changes) when `k.rebuild !== rebuildSerial` or k was freed; else
  `Rewind`, `RestoreState`, all of the above back, the accumulator 0 and prevPose = curPose = the drawn pose = now,
  so nothing blends across the jump. Bounce, friction and damping are put back by hand: Jolt keeps them in the
  body but not in its saved state. The slow-motion setting stays the student's (it changes no step). A restore
  raises neither serial.
- `freeKeyframe(k)` releases the recorder; twice is harmless. A rebuild frees every keyframe (none can come back).
- `inputSerial` rises on every change from outside the run (grab, moveGrab, release_, placeBody, setVelocity,
  setPosition, setRotation, setAngularVelocity, an updateBody or setWorldSettings that changed something other
  than slow motion, setActuators, setLinks, wakeAll, addBody, removeBody). A drag raises it on every pointer move.
- `rebuildSerial` rises in rebuild and clear AND whenever an engine body or joint is made or removed: addBody,
  removeBody, setLinks (a rope's links are new bodies with new ids: Jolt's RestoreState would fail half-way), and
  a rate change that moves a spring between our force and Jolt's. It is also when `recordLayout()` can change,
  so a new tape goes with it. A rate change that moves no spring touches nothing (`redecideSprings` leaves a
  spring that stays as it was in its place).
- A keyframe may be saved from inside the after-step hook (the recorder does); a restore from there is refused.
- What a keyframe cannot see, it relies on: a push's force depends on t alone (a question's is compiled from its
  formula and its variant's numbers), and a `BodyDef` is never changed in place (the store makes a new one).
- For Fine replay (SB12): switching a 240 run to 600 at a keyframe on an odd tick (5, 15 … /1200 s) waits one
  240 step for 600's grid, and a scene with a spring that is Jolt's at 240 but ours at 600 (ω between 240 and
  600 rad/s) rebuilds a joint on the switch, which raises `rebuildSerial` and frees every keyframe: check it.
  After a branch, the Sandbox store must take the world's settings and definitions back (`getWorldSettings`).
- Measured: all six scenes (Bouncing ball, Spring on ice, swinging Crane, a crate under a push, Projectile with
  air, a grab) give every float of every step identical over 3 s after a restore, with `mDeterministicSimulation`
  on (Jolt's default, checked). Each piece of the saved state has a test that fails without it. 20 bodies: 5552
  bytes, save 0.07 ms, restore 0.10 ms (Node). Jolt is single precision: 1 + 10⁻⁹ reads back as 1.

## Joints free their settings (SB9)
A Jolt joint copies what it needs from its settings when it is created (Jolt's own samples build settings on the
stack), so `made()` frees each joint's settings and the vectors put into them at once; the rope's group filter is
left to Jolt's reference count (each link's collision group holds it; freeing it by hand as well would free it
twice). Before, every `setLinks` left 61 engine objects for one each of rod, string, hinge, weld, stiff spring,
pulley and an 8-link rope; the presets' goldens are byte-identical after the change.

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
`tests/simKeyframes.test.ts` (SB9: the six scenes bit for bit, keyframes from the hook, refusal, leaks, records
into a Tape, serials, the rate grid), `tests/sandboxPlaneFloor.test.ts` (the plane floor: no sideways drift, same motion 100 m and 1 km out, rest height,
reach to 4.9 km, tilt, typed position, a narrow floor keeps its edge, no leaked handles; the "box" cases must fail
on the old 10 km box), `tests/simHonest.test.ts` (free fall ½g²Δt, launch v₀ₓ(2v₀ᵧ/g − Δt), own spring band, no drift, period,
stability rule, push, drag, rod pendulum, contacts at 600, determinism, handle count, the Crane's rope, damper and
rolling work), `tests/simClockRates.test.ts` (`rateOf`, the clock at every rate, readings, clamp, rate change,
Reset, the hook, touches, `ownForces`), `tests/sandboxFile8.test.ts` (format 8), the Spring-on-ice block of
`tests/energy.test.ts` (within 1 % at 240), `tests/golden/presets.golden.test.ts` (1, 5 and 10 s at each preset's rate).
