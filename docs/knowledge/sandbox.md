# Sandbox (physics) — code knowledge

What the area does: the **Sandbox** mode is a 3-D physics bench on the Jolt engine (WASM). A student
loads an experiment (a preset) or builds one from bodies and links (string, rod, spring, rope, pulley,
hinge, weld), plays it, reads energy and momentum, records a run and sends it to Lab Data.

## File map
| File | One line |
|---|---|
| `src/renderer/src/sim/world.ts` | `SimWorld`: the Jolt world — bodies, links, fixed 1/60 s steps (`step`, `stepOnce`), readings on a 0.1 s grid, the drawn (blended) poses, drag, air drag. |
| `src/renderer/src/sim/store.ts` | `useSandbox`: bodies, links, world settings, undo/redo (bodies + links + pushes + world), recording, live values; `engine.world` is the running SimWorld. |
| `src/renderer/src/sim/stepping.ts` | `recordReadings` (engine readings → recording) and `stepOneFrame` (the Step button), shared with the frame loop. |
| `src/renderer/src/sim/energy.ts` | Energy and momentum per body (three principal moments for the spin), spring energy, the readout's arithmetic (`sceneEnergy`), the datum (`floorOf`, `groundTopOf`). |
| `src/renderer/src/sim/links.ts` | Link geometry: rope reach (`reachAlong`), pulley rims, hinge pivots in the body's frame, `makeLink`. |
| `src/renderer/src/sim/recording.ts` | Samples, the Lab Data table a recording becomes (`tableFrom`: t, x, y, v, KE, PE, p; five-figure texts). |
| `src/renderer/src/sim/inspector.ts` | Pure decisions for the panel: folds, size boxes (`sizeFields`), live vs typed values, what a drag rewrites. |
| `src/renderer/src/sim/presets.ts` | The experiments, each with a sentence whose numbers the run must produce. |
| `src/renderer/src/render/SandboxView.tsx` | The viewport: meshes, the frame loop, drag, labels, arrows, link lines. |
| `src/renderer/src/panels/Sandbox.tsx` | The panel: transport (Play, Reset, Step), body list, inspector, energy readout, recording, world. |

## Invariants
- **Time is the step count.** `time = steps / 60` exactly; a reading is taken every 6th step and the
  run's t = 0 once, at its first playing step. Never derive time from frame sums.
- **Draw the blend, compute with the engine.** Each frame draws the pose between the last two steps
  (`transforms`, `drawn(id)`); physics, readouts and recordings use `state(id)`. Anything drawn
  beside a body (labels, arrows, link lines) uses `drawn`, or it jumps in slow motion.
- **Step one frame is one fixed step** whatever the time scale, recorded and published like a frame.
- **A body's definition is its start.** The world never rewrites a body's definition (a placed body
  keeps `def`); a drag before the run sets the start, a drag paused part-way only places the body.
- **An edit part-way through a run never sends a moving body back** (H20, the owner's choice): a
  changed mass, size or material keeps its place and speed, and typed position or velocity change
  only where Reset goes (`updateBody` `startOnly`, `rebuild` with preserve; tests/sandbox.test.ts H20).
- **Undo restores bodies, links, pushes and the world settings together.**
- A preset's sentence and its run must agree (tests/presets.test.ts checks the quoted numbers).

## Traps met (P-SIM, 2026-10)
- Readings rode on the 10 Hz live publish (0.1167 s apart, no t = 0) — now taken inside the step loop.
- The Step button dropped what step() returned, and in slow motion stepped a tenth of a step.
- A rope tied to a turned body used a world direction as a body-local offset; a hinge pivot too.
- Rewriting a placed body's definition (to move a pulley's rim) sent it to its start on the next
  edit: read the wheel's live position instead.
- `Number(fmtPrecise(…))` is NaN for |v| < 10⁻⁶ (a raised power): a recording's numbers come from
  `toPrecision(5)`.
- A cone collided as a 4-sided pyramid; spin energy used one axial moment for every axis; air drag
  read the unturned faces.

## Known limits
- Jolt's soft spring loses energy (tests/energy.test.ts keeps the 1 % target as an expected fail).
- A rope's links have a small mass (≤ 10 % of the lightest load) that the readout leaves out: the
  readout follows the light-string model a student is taught (H16).
