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
| `src/renderer/src/sim/links.ts` | Link geometry: rope reach (`reachAlong`), pulley rims, hinge pivots in the body's frame, `makeLink`; a hull's centre of mass (`comOffset`, `localToCom`). |
| `src/renderer/src/sim/recording.ts` | Samples, the Lab Data table a recording becomes (`tableFrom`: t, x, y, v, KE, PE, p; five-figure texts). |
| `src/renderer/src/sim/inspector.ts` | Pure decisions for the panel: folds, size boxes (`sizeFields`), live vs typed values, what a drag rewrites, what a press on a body does (`grabAction`). |
| `src/renderer/src/sim/palette.ts` | The eight theme colours moving bodies are painted in (`paintBodies`, `nextPaletteColour`), and reading a stored colour (`drawnColour`, `pickerColour`, `colourNote`). |
| `src/renderer/src/sim/pendulum.ts` | The pendulum angle, pure (SB58): `pivotOf`, `anglesOf`, `placeAtAngle`, `planPullBack`, the dial, the lines under the controls, `tapePositionOf` for a replay. |
| `src/renderer/src/panels/sandbox/PendulumFold.tsx` | The Pendulum fold: the angle on every axis, a protractor, and Pull back like the Launcher. |
| `src/renderer/src/sim/presets.ts` | The experiments, each with a sentence whose numbers the run must produce. |
| `src/renderer/src/render/SandboxView.tsx` | The viewport: meshes, the frame loop, drag, labels, arrows, the connections (coil, bar, thread, rope, pin). |
| `src/renderer/src/render/sandboxLooks.ts` | Pure geometry of the looks (P28): the spring coil (`writeCoil`, `springLook`), rope pieces and beads, the pulley's rope arc, hinge pins, outlines (`edgeCage`), a ball's marking, the pulley wheel, a body's whole look (`bodyLook`). |
| `src/renderer/src/render/sandboxMeshes.ts` | The Three side: a body's plain surface (`surfaceOf`), its geometry (`bodyGeometry`), a coil's buffers. |
| `src/renderer/src/render/sandboxCamera.ts` | The opening views and Home's framing as numbers (`SANDBOX_START_VIEW`, `sandboxHomeView`), for CameraRig and the floor test. |
| `src/renderer/src/panels/Sandbox.tsx` | The panel, in two views (SB63): the simple one (`panels/sandbox/SimplePanel.tsx`) or the full one — transport (Play, Reset, Step), body list, inspector, energy readout, recording, world. |
| `src/renderer/src/sim/sandboxView.ts` | Which view the student sees (`useSandboxView`, Simple by default), remembered in localStorage (`readSandboxView`, `writeSandboxView`). |
| `src/renderer/src/sim/simpleHint.ts` | The one hint under the drawing in the simple view, chosen from the state (`hintMoment`, `simpleHint`). |

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
- **Nothing that must show is a line.** Under WebGPU a line is one device pixel at any zoom: every
  connection is a mesh, held to a few pixels across by `visibleRadius` (the floor grid and the
  trails are still lines).
- **A body stores its colour; the theme draws it.** Moving bodies store `var(--sim-cN)`; anything
  styled shows it as it is, Three reads it through `drawnColour`, the colour picker through
  `pickerColour`. Fixed bodies keep their material's colour. A material shows in the finish
  (`materialFinish`). Keys on Three materials carry the colour and the theme (WebGPU compiles a
  colour in).
- **The floor never moves on a grab** (owner, 2026-10-09): `grabAction` says none for it and
  `SimWorld.placeBody` refuses it; a typed position still moves it. It is DRAWN 10 km across with its
  top at 0, so every Home and opening view sees ground to the horizon (tests/sandboxFloor.test.ts); the
  ENGINE builds a floor that wide as an exact plane, not a 10 km box (sandbox-engine.md, "The floor").

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
- (P28) The spring coil folded through itself at both ends of a short spring: the thread left along
  the axis and swung out to the coil within millimetres. It now leaves across the axis; the tightest
  bend is about half the coil radius, and the wire is held to `MAX_WIRE` of it.
- (P28) A hinge pivot is pinned from the body's **centre of mass** (LocalToBodyCOM), and a hull's
  centre of mass is not its position: a cone's sits b/4 below its middle. The seesaw on a cone fulcrum
  measured from the middle sat 0.175 m low and yanked the plank down; the preset uses `localToCom`.
  `makeLink('hinge')` still assumes position = centre of mass, so a student's hinge onto a cone or a
  ramp starts out of place (left as found: a physics change outside P28).
- (P28) The old ramp mesh was wound inside out; `rampSurface` winds it outward from the same corners
  as the collision hull.

## The Pendulum fold (SB58, an owner item)
Shown only for a dynamic body joined by a string, a rod or a rope to a pivot (`pivotOf`): one fixed pivot, or one moving body
it starts below. A bob on two fixed pivots, two crates on a level rod and the floor give no fold.
- **The angles** (degrees, y up): θ = atan2(√(rₓ² + r_z²), −r_y); θ_xy = atan2(rₓ, −r_y), + toward +x; θ_zy = atan2(r_z, −r_y), + toward +z;
  φ = atan2(r_z, rₓ) from +x. A flat world (2D mode) reads only θ_xy. A bob above the pivot's level reads 180° in the plane that
  sees the arm end-on (straight up), by the formula. A sideways offset within the float's grain of the sizes is 0 (positions are 32-bit).
- **A rope's arm is centre to centre**: the rope's length plus the two reaches (`reachAlong`), which depend on the direction. A rope
  bows when it swings (0.97 of its length at 60°, 0.95 at 85°, measured), so it is called slack only a tenth short; a string a
  fiftieth. A slack rope shows its sentence instead of the angles; Set still works and pulls it taut.
- **Pull back (Set)** is `placeBody` (at rest, rope laid again) plus, while the clock is at 0, the definition's start (`dragSetsStart`);
  paused part-way only the body moves. The panel reads `live`, which the viewport publishes only while playing, so Set publishes the
  placed body itself and nudges `bodies` so the demand-driven canvas draws it. In a replay the controls are locked (`replayRefusal`)
  and the readout reads the tape at the playhead (`tapePositionOf`).
- Measured on the engine (240 steps a second, tests/pendulumAngle.test.ts): Set 30° swings to −29.95° on the other side, and the
  period is within 0.05 % of `pendulumExact`; at 60° it is 0.7 % short, at 89° 2.8 % (a string is no pendulum past 90°).

## The simple view (SB63, an owner item)
The owner (13 Oct 2026): "everything looks complex and a person using it the first time will get confused." The panel opens
SIMPLE for everyone, an old profile included: Play and Reset with the clock (`Transport` with `simple`), six picture tiles of
experiments (`panels/sandbox/ExperimentTiles.tsx`, inline SVG in theme tokens, the loaded one lit by `presetId`) and a quiet
"More experiments" that opens the full list (`PresetList` in `panels/sandbox/Presets.tsx`, the one list), three add buttons
(`SimpleAddRow`: Ball, Box, Ramp, each with its tool card), the selected object's name, Now box, mass row (`MassRow`, the
inspector's own) and Delete (`panels/sandbox/SimpleSelected.tsx`), the Energy bar and total line (`SimpleEnergy`), and
"All tools", which is the full panel with a "Simple view" button at its top.
- **One path to an experiment**: `loadExperiment` in `sim/transportActions.ts` pauses the run, then `loadPreset`. A tile, a
  list row, Start here and a question's "Show it" cannot drift apart.
- **One hint at a time** (`sim/simpleHint.ts`): fresh → "Pick an experiment, then press Play"; loaded or built → "Press Play to
  start"; running → "Click an object to see its speed"; paused → "Press Play to go on, or Reset to start again". All tools
  keeps today's four-part hint (`render/sandbox/Hint.tsx`).
- **Examples is lent, not removed**: `enterMode` (`app/layout.ts`) closes the side lessons when the Sandbox opens simple, on
  a real change of mode only (never a restored session or a repeat), and the next mode with lessons gets it back.
- **The tour** borrows All tools for the Connect step (`sandboxView` on the step, `app/tour/Tour.tsx`) and gives the choice back.
- The floor is never the "selected object" here: a press on it is a press on empty space, and a first-timer who deleted it
  would have no Floor button to put it back in the simple view.
- Guard: tests/simpleSandbox.test.ts (rendered with react-dom/server, the stores driven by hand).

## Known limits
- Jolt's soft spring loses energy (tests/energy.test.ts keeps the 1 % target as an expected fail).
- A rope's links have a small mass (≤ 10 % of the lightest load) that the readout leaves out: the
  readout follows the light-string model a student is taught (H16).
