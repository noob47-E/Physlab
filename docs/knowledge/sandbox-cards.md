# Sandbox formula cards — code knowledge

What the area does: a **formula card** shows a law of the scene with the run's values put in, live
(Idea #39 §4.4, FIG. 4): `KE = ½mv²`, `= ½ × 2 kg × (3.132 m/s)²`, `= 9.81 J`. A card is DATA — a
formula, the quantity each symbol stands for, and a result — so a scene's cards are rows in a list,
not code. The engine (SB4) is pure: no React, no Jolt. The dock that draws cards (SB18), the theory
under them (SB15) and the graphs (SB19) add their own sections here.

## File map
| File | One line |
|---|---|
| `src/renderer/src/sim/cards/types.ts` | The I-7 shapes: `CardSpec`, `SymbolSpec`, `Source`, `Reading`, `CardView`, `QKey` and `Q_TOKEN` (a quantity's I-10 colour token). |
| `src/renderer/src/sim/cards/catalogue.ts` | `CORE_CARDS`: the fifteen core cards (energy, momentum, weight, the drop formulas, projectile, periods). |
| `src/renderer/src/sim/cards/sceneCards.ts` | `SCENE_CARDS`: cards for particular experiments (SB40 fills it). |
| `src/renderer/src/sim/cards/index.ts` | The door: `CARDS` (both lists, `mergeCards` refuses a duplicate id), `cardById`, `evaluateCard`, `readingOf`. |
| `src/renderer/src/sim/cards/reading.ts` | `readingOf` (a Reading by role), `sourceValue` (each Source kind), `isConstantSource`, `stepRateOf`. |
| `src/renderer/src/sim/cards/evaluate.ts` | `evaluateSpec` → the three lines (LaTeX and plain); `cardNumbers` (the numbers behind them); `plainOf`. |
| `src/renderer/src/sim/cards/digits.ts` | Rounding honesty: `honestDigits`, `isGivenValue`, `GIVEN_FIGURES`. |
| `src/renderer/src/sim/cards/units.ts` | The units check by scaling: `unitsCheck`, `unitFactor`, `naturalUnit`; units for KaTeX and sentences. |

## Writing a card
- `formulaTex` is the right-hand side in LaTeX, with `@{key}` for a symbol and `*` for a
  multiplication (`\tfrac{1}{2}*@{m}*@{v}^2`). In the formula `*` is a thin space; once numbers stand
  there it is ×. A symbol right before `^` is bracketed with its unit, `(3.132 m/s)²`, and a negative
  value is bracketed anywhere but the start of a group. Write `\sin(2*@{th})`, not `\sin 2@{th}`.
- Every symbol has exactly one `from` (a Source), a unit as a student writes it (`'m/s²'`, `'N/m'`,
  `'°'`, `''`) and a `q` (heights 'pos', speeds 'vel', momentum 'mom', springs 'spring' …; masses,
  angles, g and t null). `compute` is the same formula in code; angles arrive in degrees.
- Roles are body NAMES (`loadPreset` mints fresh ids). A link role names a body on the link (the
  first link touching it) or both ends, "Pivot – Bob". 'A', 'B' and 'S' are the core cards' roles.
- Beyond I-7 (optional, nothing breaks): `sign: -1` reads a quantity the other way (the drop
  formulas take down as positive, so `u` is −vy); the `startLink` Source (a pendulum's θ₀); a link
  entry's `ends`/`startEnds` (its angle); `Reading.rho` (a drag card).

## Invariants
- **The result is the true value at the student's precision**, never rebuilt from rounded pieces.
- **The shown sum checks** (F45): the measured inputs gain one digit at a time, through
  `stepPrecision` (up to `STEP_GUARD_MAX` more), until the formula done on the values AS WRITTEN gives
  the result as written; when no number of digits can (a result on a rounding boundary) line 3 says
  ≈ and `sumChecks` is false. Over 500 seeded readings × 15 cards × 7 precisions none needed ≈.
- **A typed given keeps its typed form**: a value from a source fixed through the run (a mass, k,
  g, the start) that is exact in `GIVEN_FIGURES` figures or fewer is written in the fewest figures
  that show it exactly (`revealPrecision` at tolerance 0): 2 kg, 50 N/m, 9.81 m/s². A worked-out mass
  (110.98003481 kg from a density) is rounded like a measurement.
- **Never a made-up number.** A role that is not in the reading: the card is not shown (null). A
  value the reading cannot give (an acceleration before the tape has one, a box's radius, a spring
  card on a string): "—" in its place, NaN value, `sumChecks` false.
- **The units check is a property of the card**, not of a reading: random factors for kg, m, s and K
  scale every input by its unit, and the result must scale by its own (10⁻⁹ relative); a symbol's
  unit must also be its Source's (`naturalUnit`). A planted ½mv fails it.
- **A title says where its formula holds**, because a card shows its formula's value whatever the
  scene: ½mv² leaves out spin ("not spinning"), the spring card leaves out a hanging spring's height
  energy ("level spring"), the projectile cards land at the launch height, the drop cards hold only
  while falling freely, and 2π√(L/g) is for small swings. A scene outside that case gets a scene
  card (the large swing, a rolling ball) or the 'energy' and spring cards side by side.
- KE as a Source (`get: 'KE'`) is `energyOf`'s kinetic, so a rolling ball's spin counts; the `ke`
  card's own formula is ½mv² of the speed. Heights are above the floor's top (`groundTopOf`), from
  the centre; `bottom` is the underside (`halfHeight`).
- Plain lines have no caret, backslash, brace or e-notation (powers of ten through
  `superscriptPowers`); every LaTeX line renders in KaTeX with `throwOnError`, trust limited to
  `\htmlData`, which carries only `q=<quantity>`.

## Traps met
- A string's stiffness field is unused: `get: 'k'` on a link that is not a spring is "no such role",
  so a spring card on a pendulum is never shown with a meaningless k.

## Tests
`tests/cardsEngine.test.ts` (the owner's 3.132 m/s → 9.81 J case, digits, units, every Source kind,
readingOf roles, "—", the sign, plainOf, duplicate ids); `tests/cardsCatalogue.test.ts` (the fifteen
cards' structure, known answers, the shown-sum property with its planted wrong rounding, KaTeX on
every line).

## Graphs (SB19)

`src/renderer/src/render/sandbox/GraphDock.tsx` is the graph on the Sandbox drawing (top right, under where the cards
go): Energy, Position or Velocity against time, from the recording. The pure part is in `src/renderer/src/sim/graphSeries.ts`
(`GRAPH_CHOICES`, `graphLines`, `sampleSteps`, `nearestStep`, `graphBody`); tests in `tests/graphDock.test.ts`.

- **Energy** is the ledger at each drawn step (`ledgerAt`, SB10): kinetic `--q-vel` (spin included), height `--q-pos`,
  spring `--q-spring`, their total `--text-strong`, heat `--q-heat`; the graph and the Energy card agree. **Position** is
  x (solid) and y (dashed) in `--q-pos`, **Velocity** vₓ and vᵧ in `--q-vel`, of the selected body when it moves, else
  the first that moves. At most 600 points, evenly spread, always ending at the tape's last step.
- The playhead line (`--tape-head`) is drawn by a uPlot draw hook from a ref: moving it is a redraw, never a rebuild.
  Live it sits at the tape's end; in replay and fine replay at the playhead. A click or a drag on the plot seeks there
  (`useTape.scrubTo(nearestStep(...))`, which enters replay).
- The lines are memoised on the tape's change signals (the panel's live values while live, the store's revision
  otherwise), the choice, the body and the scene; never on the theme (the Graphs trap in AGENTS.md). A theme switch
  rebuilds the plot from the same data. The box keeps its height (Fix 22): before the first step it says "Press Play and
  the graph draws itself". Open or folded, and the choice, are remembered (`physlab.graphDock`, per viewer).
- Until SB16 starts the recorder in the app there is no tape, so the dock shows its hint; a browser check starts the
  recorder by hand (`startRecorder(window.__sim)`).
## Theory (SB15)

`src/renderer/src/sim/theory.ts` (I-8): `theoryFor(presetId)` gives a demo experiment's default `cards`, its `roles` (role →
body name), `predict(built)`, `measure(tape, built, step?)` and `tolerance(rate)`; `gapOf(prediction, measured, rate,
built)` gives `{ percent, reason, within }`. The store's `presetId` (set by `loadBuilt`, which `loadPreset` calls; null
after any other scene change) says which experiment is on screen. Tests: `tests/theory.test.ts`, `tests/loadedPreset.test.ts`.

- **Predictions come from the build**, through `sim/predict.ts`: masses (`SimWorld.massOf`), sizes, start speeds, links,
  g and the floor's top. Nothing is copied from the preset's sentence; a test changes a mass, a speed, a stiffness and g.
- **Measurements come from the tape.** A landing is found from the engine's own hit (the first contact closing faster
  than 5 cm/s) and carried from the last free record to the touching height under gravity, so the stepped path's error
  stays in and only the contact's handling is left out. Periods use `periodic`, stops `stopDistance`, bounce tops `peaks`
  and contacts `bounces` (sim/measure.ts). The cliff is timed from the step the ball starts to fall, not from the edge:
  the engine lets go a little before the centre passes it.
- **The reason** is the limits the quantity meets (`limitsFor` on facts worked out from the build: air, sliding, bounces,
  a rope, a swing over 5°, rolling), with a number when there is one ("a 15° swing is not small: … = 2.849 s"); with no
  limit, the step's own error from `sim/stepError.ts` with its number ("it lands v₀ₓδ = 5.1 cm short", "δ = 2.1 ms early",
  "the top is (v_y − gΔt/2)²/2g = 2.492 m", "½at²(1 + Δt/t), 0.83 % more").
- **Within** = inside `tolerance(rate)` of the formula, or of the formula with the step's error worked in (`stepped`), or
  no further off than the step can make it (`allowance`: a bounce top up to v Δt high).

| Scene | Predicted | Measured 240 | Measured 600 |
|---|---|---|---|
| fall | 1.0096 s, 9.905 m/s | −0.21 % (2.1 ms early) | −0.08 % |
| projectile | 17.303 m, 2.497 m, 1.427 s | range −0.29 %, top −0.58 % (= stepped top) | −0.12 %, −0.23 % (= stepped), −0.12 % |
| cliff | 0.903 s, 2.709 m | −0.23 % | −0.09 % |
| drop | 1.106 s both | −0.19 % | −0.08 % |
| moon | 2.4845 s | −0.08 % | −0.03 % |
| terminal | v_t 19.64 m/s; floor 18.62 m/s (94.8 % of v_t) | +0.02 % | 0.00 % |
| ramp | 4.556 m/s | −1.75 % (rolling) | −1.76 % |
| friction | 4.587 m | −0.28 % | −0.11 % |
| atwood | 3.27 m/s², 0.409 m in 0.5 s | +0.83 % (= Δt/t) | +0.33 % |
| lift | 1.401 m/s², 33.63 N | +0.84 %, +0.10 % | +0.34 %, +0.04 % |
| crane | 29.43 N | 0 % | 0 % |
| bounce | tops 1.920, 1.229, 0.786 m; hits 0.782, 2.033, 3.034 s | tops +0.25/+0.75/+1.5 % (≤ vΔt), hits −0.1 % | +0.23/+0.51/+0.69 %, −0.1 % |
| collision | −2.125, +2.375 m/s | 0 % | 0 % |
| sticky | 1.000 m/s | 0 % | 0 % |
| recoil | ∓25 kg m/s | gun +0.26 % | +0.10 % |
| cradle (600) | 1.921 m/s | — | −0.05 % |
| pendulum | 2.837 s small, 2.849 s at 15° | +0.42 % / −0.01 % | +0.42 % / −0.01 % |
| spring | 0.6283 s | −0.04 % | −0.02 % |
| springice | 1.2566 s | 0.00 % | 0.00 % |

Traps: the terminal-velocity preset's sentence says "95 % of that by the floor"; for 45 m the formula and the run both give
94.8 %. The projectile's top cannot come within 0.15 % at 600: the step lowers it by exactly the stepped formula's 0.23 %.
