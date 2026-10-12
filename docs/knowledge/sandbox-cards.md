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
