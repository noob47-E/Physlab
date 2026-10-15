# The Collision Lab (SB51)

Three experiments in the Sandbox's Momentum list that a student changes with sliders: **two carts on an air track** (lab1d),
**two pucks on an air table** (lab2d) and **Newton's cradle** (labcradle). The point: momentum is kept whatever the bounciness
e is, and the kinetic energy lost is exactly ½ μ (1 − e²)(u_A − u_B)².

## Files
- `src/renderer/src/sim/labScenes.ts` — `buildScene(id, params)`: every moving body frictionless and undamped, mass typed, e on
  both bodies, 600 steps a second, no sleep, a vacuum, the plane. `labPresets()` puts the three in the list (a function, not a
  constant: presets.ts and labScenes.ts import each other).
- `sim/labControls.ts` — the sliders' ranges, `clampLab` (a value past an end is brought to it and said; two carts meeting
  slower than 1.5 m/s are refused in words), `paramsFromBuild` (the panel shows the scene on the drawing), `LabWatch` (pause
  0.5 s after the last contact of the first meeting; 0.03 s on the cradle's strings).
- `sim/labTheory.ts` — predictions from the BUILT scene (the larger of the two e, as Jolt combines them), measurements off the
  tape after the first hit; spread into `sim/theory.ts`'s table.
- `render/sandbox/LabPanel.tsx` — the HUD panel under the clock, mounted in `SandboxHud.tsx`.

## What the engine does (checked in tests/collisionLabEngine.test.ts at 240 and 600)
- Carts: after-speeds within 0.5 % (600) / 1 % (240) of `collide1D` for e = 1, 0.75, 0.5, 0.25, 0; momentum to 0.1 %.
- Pucks: the engine finds the contact on the last step before the pucks touch and pushes along the line of centres there
  (5 mm short at 600 for 3 m/s): at 30° that line is about 0.5° flatter, and A leaves at (0.729, −1.287) instead of the
  formula's (0.75, −1.299). The angle between the paths stays 90° and the momentum is kept. The theory gives that "stepped"
  prediction and the sentence with its numbers; the gap row agrees with it.
- Below 1 m/s the engine does not bounce at all: such a hit is predicted with e = 0, and the prediction says so.
- A measured speed under 0.5 mm/s reads 0 (a cart that stopped dead keeps a few µm/s; against a formula of 0 that was 100 %).

## Leads (and the presets sweep)
- The presets golden sweep runs every preset twice; with the three lab scenes in the first pass, galileo, stack, trolleys and
  tug come out up to 0.002 different in the second: the engine carries something from one world into the next.
- The labs are left out of tests/golden/presets.golden.test.ts: their tiny engine noise would be new caret pieces there (tests/guards/noCaret.test.ts), and their checks against the formulas are exact in tests/collisionLabEngine.test.ts.
