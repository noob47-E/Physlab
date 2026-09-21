# PhysLab

A general math and physics engine for students and teachers: vectors, shapes and geometry,
graphing, a natural textbook-math calculator, step-by-step solutions and GPU simulations.
Everything runs offline.

[HISTORY.md](HISTORY.md) is the full record of how it was built — every version, what each one
added, and the bugs that were worth remembering.

## Run it

| What | Command |
| --- | --- |
| Install, or update an older version | `dist\PhysLab Setup 0.5.0.exe` |
| Run without installing | `dist\win-unpacked\PhysLab.exe` |
| Developer mode (live reload) | `npm run dev` |
| Rebuild the installer | `npm run dist` |
| Unit tests, types and lint | `npm test`, `npm run typecheck`, `npm run lint` |

**The window.** It fits a laptop screen and remembers its size and your text zoom (Ctrl+= / Ctrl+− / Ctrl+0). On a narrow window the top bar folds: the mode tabs become a **Mode** menu and the tool shelf shows icons only. Each mode opens just the panels it needs — the drawing, its own panel and Examples — not every panel at once.

**Panels.** Closing a panel is not a dead end: **View** lists every panel with open/closed beside it, click one to bring it back. Ctrl+K finds them too, and entering a mode reopens the panel that mode uses. **View ▸ Reset the panel layout** puts everything back the way the mode starts.

**Updating.** Run the new setup: it swaps itself over the build you already have, keeps your
settings, your layout and your autosaved work, and starts the new version. Nothing to uninstall
first. Windows asks for permission once, because PhysLab lives in `C:\Program Files\PhysLab` for
every user of the PC. **Help ▸ PhysLab x.y.z** tells you which build is running.

## Modes

Features are grouped into modes, like a calculator. Pick one in the top bar, or press **Ctrl+K** to search everything.

| Mode | What it does |
| --- | --- |
| **Calculator** | Natural textbook math (fractions, roots, powers, ∫, Σ look like a book) with every fx-991EX mode: COMP, CMPLX, BASE-N, MATRIX, VECTOR, STAT, DIST, TABLE, EQN, INEQ, RATIO, SHEET, UNITS, CONST, MEASURE. **Visualize** draws the calculation (tangent line for d/dx, shaded area for ∫). Every number shown follows your precision setting (decimal places or significant figures). Beside the keypad is the **Working** area — see Pure Math below. |
| **Vectors** | **Vector Calculator** panel: type vectors as `3î + 4ĵ`, `size ∠ angle` or a column, or paste them straight from a book (î ĵ k̂ and x² are read as written). The answer sits right under the vector cards; the six everyday operations are one click and the rest (projection, equilibrium, torque, work, magnetic force, relative velocity…) wait behind **More**. Every operation can show its steps the way the book does — components, the cosine law for a sum, the angle between — in your precision and angle unit, and **Draw on graph** draws exactly the vectors the working found, with the triangle or parallelogram to prove it. Your cards are remembered between sessions. |
| **Geometry** | **Sketch** a rough shape and it snaps to a perfect square, rectangle, triangle, circle… Click corners or draw connected segments and closed loops are recognised too. The Measure tab shows the shape's name and its **area in algebraic form** (formula → values → answer with units). **Hover a formula** to shade the area; hover a symbol to highlight that side. **Decompose** splits any shape into rectangles and triangles, adding the corner the cut needs, with **Other way** to see alternatives. **Congruent triangles**: Shift-click two triangles and the Measure panel says whether they are the same triangle and by which rule (SSS, SAS, ASA, AAS, RHS), with every equal side and angle written out and marked on the drawing; or type three sides and have the triangle drawn. Each mode keeps its own drawing: what you draw in Geometry stays in Geometry. |
| **Graphing** | `y = x^2 - 4`, `x^2 + y^2 = 9`, `y > x^2`, `r = 2cos(3θ)`, `z = sin(x)cos(y)`, sliders, roots and turning points. |
| **Sandbox** | Real objects that collide, on the Jolt physics engine. Paused, drag anything — a ball, a wall, the floor — to arrange it; playing, drag to push or lift it and let go to throw. Reset puts everything back and the clock to zero; an object that falls off the edge is put back and says so. Press **Start here** for one ball and one floor, start from an experiment — projectile, collision, recoil, pendulum, mass on a spring — or build your own from balls, crates, cylinders, capsules, cones, ramps, planks and walls. Press **Connect two objects**, click one, click the other and pick how they are joined — a **rod, string, spring, real rope, hinge or weld**, or a rope **over a pulley** (the wheel sits above both) for an Atwood machine; each choice is a card that says in one line what it does, and Shift+click on the second object is the quick way. Lengthen a rope in Connections and it sags; shorten it and it lifts. Twenty-nine experiments to start from, grouped by topic and tagged with what they join things with, each saying what to measure and what the book says the answer is, so you can compare the clock with the formula. New objects weigh what a student could lift (a 1 kg ball, a 2 kg crate). The panel shows the five things you usually want about an object — name, material, mass, position, velocity — and folds the rest away; Play, Reset and Step sit at its top. The whole sandbox is saved in the `.phys` file and protected by the autosave. Live **energy and momentum**, trajectory trails, metre lines on the floor, a launcher that works out v cos θ and v sin θ for you, and **Send to Lab Data** to turn a run into readings you can fit a line through. |
| **GPU Lab** | Millions of charged particles in E and B fields on the graphics card. |
| **Lab Data** | The table from your practical notebook: type or paste your readings, work a column out from the others (`t^2`), plot one against another and fit a line through them. Gives you the equation, r², and the gradient with its unit, its meaning and its ±. |
| **Problem Sets** | Practice with fresh numbers every time. **Hint** gives you one step, not the answer. **Check my answer** marks what *you* worked out on paper and names the mistake: wrong quadrant, sin instead of cos, forgotten cos θ, calculator left in radians, wrong power of ten. |
| Coming next | Proofs, Mechanics, Instruments, Electricity & Electronics, Optics, Waves & Sound, Heat, Nuclear & Modern. |

## Pure Math: the working, not just the answer

Open **Calculator** and the big area in the middle becomes **Working**. Type a question, press
**Work it out**, and the whole method appears — every step with a plain-English line saying what
just happened, and the formula that allowed it printed beside the step.

| Tool | Example | What you get |
| --- | --- | --- |
| **Factorise** | `6x^2 + 7x - 3` | Splitting the middle term, grouping, and the pair of brackets |
| **Expand** | `(2x + 3)(3x - 1)` | The each-times-each table, the products in a line, then collected with the highest power first |
| **Divide** | `(x^3 - 6x^2 + 11x - 6)/(x - 1)` | Long division written out as the full staircase, quotient and remainder |
| **Partial fractions** | `(3x + 5)/((x + 1)(x + 2))` | The A/(x+1) + B/(x+2) form, by the cover-up rule or by equating coefficients |
| **HCF / LCM** | `12, 18, 30` or `x^2 - 1, x^2 + 2x + 1` | The prime-factor table, or the common brackets — numbers and algebra both |
| **Prime factors** | `360` | The division ladder, the index form, and how many divisors the number has |
| **Complex** | `(2 + 3i)/(1 - i)` | Multiplying by the conjugate, i² = −1 applied where you can see it, plus modulus, argument and conjugate |
| **Solve** | `3x + 5 = 11` or `x^2 + 4x + 13 = 0` | A linear equation collected, moved across and checked by substitution; or the quadratic formula step by step, where a negative discriminant becomes i and the roots come out as a conjugate pair |
| **Factorise with i** | `x^2 + 4` | Factors that do not exist over the real numbers: (x + 2i)(x − 2i). When a real factorisation stops at a quadratic with no real roots, **Allow i** carries on. |

Three things make this different from a calculator that just prints an answer:

- **It is exact.** Everything is worked out in whole numbers and fractions, never in decimals that
  drift. `1/3` stays `1/3`, and a third multiplied by three is exactly one.
- **It checks itself.** Before any answer is shown, PhysLab multiplies the factors back out, or adds
  the partial fractions back over a common denominator, and compares the result with your question.
  The tick at the bottom of the answer is that check, not a promise.
- **It lets you try first.** A new answer arrives with its steps hidden and only the answer
  showing. Press **Show a step** for one step at a time, or **Show all steps** for the whole
  method; "Always show all steps" in the panel turns the hiding off for good. **Treat as** picks
  the job (Auto guesses it from what you typed).

Everything is offline and instant. If a question is past the methods PhysLab can write out by hand,
it still gives you the answer and says plainly that there are no steps for that one. A `.phys`
file from any earlier PhysLab still opens, and a damaged one is refused with a sentence rather than
replacing what you had open.

You can also run these from the calculator keypad — **Work it out**, **Factorise**, **Expand**,
**Solve**, **Partial fr.** sit under the keys and send whatever you have typed across — or from the
command bar: `factorise(6x^2 + 7x - 3)`, `hcf(84, 132, 210)`, `partial((3x+5)/((x+1)(x+2)))`,
`primes(360)`, `complex((2+3i)/(1-i))`.

Everything you work out is kept in **History** down the side, and it is still there next time you
open PhysLab. The calculator's own history is remembered now too.

## Drawing, finishing and the right-click menu

- While you draw: **right-click, Enter or double-click** finishes the shape, **Backspace** removes the last point, **Esc** cancels. The same three buttons appear next to the hint at the bottom of the drawing.
- **Right-click** any object for what you can do with it: show components, resolve with steps, midpoint, perpendicular bisector, decompose, show angles, pin its label, rename, delete. Right-clicking empty space gives view, grid, snapping and label options. The same menu works in the Outliner and the Measure list.
- A point clicked **on a side or a circle** sticks to it and slides along it when dragged.

## Practice and hints

- **Problem Sets** mode: choose your topics (components, resultant, dot and cross product, equilibrium, work, torque, projection…), choose 3, 5 or 10 questions, and PhysLab makes new numbers every time.
- Work the question out on paper, type what you got, and press **Check my answer**. A right answer is a right answer even if you rounded: anything within 1% is correct, and a slightly rounded one is marked right with a note.
- A wrong answer is told *why* it is wrong whenever PhysLab can recognise the mistake — "That is F sin θ. The x-component uses cos", "Right reference angle, wrong quadrant", "That is the resultant R; the balancing force is equal and opposite", "That is the answer in radians".
- **Hint** shows the first step of the worked solution. Press it again for the next step. The answer only appears when you ask for it.
- The same **Give me a hint** button is in the Solver panel, so any solved problem can be revealed one step at a time.
- **Show in scene** draws the problem with its vectors and components, so you can see what the numbers mean.

## Lab data: readings from your own experiment

**Lab Data** mode is the table you fill in during a practical, with the graph and the write-up
attached to it.

- **Type or paste the readings.** Copy a block out of a spreadsheet and paste it straight onto the
  table — tabs, commas or semicolons, and a decimal comma if that is how your machine writes
  numbers. **Import** reads a `.csv`, **Export** writes one. Anything pasted or imported can be
  **undone** with one click.
- **A column can be worked out from the others.** Press **Σ** on a column and write `t^2` or `d/t`.
  It fills itself in for every row and updates when you change a reading.
- **Headers carry the unit** (`t / s`), so the graph axes and the gradient's unit come from the
  table itself: metres over seconds is quoted as m/s without being told.
- **The fit is your choice, and PhysLab says when another shape matches better** — "curve fits your
  readings better — r² 0.998 against 0.874" — with one button to switch, so you can justify the
  shape you chose.
- **The gradient comes with what it means**: distance against time is a speed, velocity against
  time is an acceleration, d against t² gives g = 2 × gradient, T² against length gives
  g = 4π²/gradient, force against extension is the spring constant.
- **Uncertainties, only when you ask.** Press **±** on a column and it gains a ± column beside it.
  The readings then carry error bars, and the gradient is quoted the way a practical is marked:
  from the steepest and shallowest lines that still pass through the bars, with the value rounded
  to the place the uncertainty supports — `4.92 ± 0.04 m/s²`, never more digits than you measured.
  Without bars the ± comes from how much the readings scatter about the line.
- **Residuals** (reading minus line), off by default, show the pattern a good r² can hide.
- **Show on the drawing** puts the points and the fitted line into the main viewport, where they
  can be measured, zoomed and exported as a picture like anything else.
- Tables are saved inside the `.phys` project, so an experiment reopens with the drawing.

Examples ▸ **Free fall: find g from d and t** sets the whole thing up in one click.

## Help for new users

- On the first run a welcome card offers a **two-minute tour** and four starting points.
- **Help ▸ Practice tasks** lists small tasks ("Draw a vector", "Sketch a shape", "Split a shape into simple parts") that tick themselves off as you do them.
- **Help ▸ Keyboard and mouse** lists every shortcut. Everything is also in **Ctrl+K**.

## Measurements

- Labels show an object's letter and value (`A 5 u ∠ 53.13°`, side lengths, areas, angles).
- **When labels show** (switch at the top-left of the viewport, or the settings menu):
  - **On hover** (default): a label appears when you point at or select an object and fades out when the cursor moves away. Pointing at a shape shows all its sides and its area.
  - **Always**: every label stays on.
  - **Hidden**: nothing on the drawing; the **Measure** panel lists every value at the side.
- **Pin** a label to keep it on whatever the setting: the pin button in the Measure list or Outliner, or *On drawing* in Properties (which can also hide one label for good).
- Point letters (A, B, C…) stay visible by default so formulas like `AB = 4` are readable; untick this in the settings menu.
- **Settings button** in the top bar: 1 grid square = 1 unit / mm / cm / m / km / in / ft, decimal places or significant figures, and what labels contain. Label choices are remembered.
- **Notation** (same menu), so PhysLab matches whatever book is in front of you: vectors as A⃗, **A** or A̲; components as 3î + 4ĵ, (3, 4), a column or size ∠ angle; directions from the +x axis or as compass bearings (N 30° E).
- Snapping is magnetic: it only jumps to a point, grid crossing or axis when you are close. Hold **Alt** to switch snapping off, **Shift** to draw at 15° steps.

## Command bar examples

- `A = <3, 4>`, `F = 10 N ∠ 30°`, `R = A + B`, `A · B`, `A × B`, `|A|`
- `components(10, 30)`, `resultant(5, 5, 120)`, `equilibrium(A, B)`
- `Triangle((0,0), (4,0), (0,3))`, `Polygon((0,0), (6,0), (6,4), (3,7), (0,4))`, `Circle(P, 3)`
- `solve(x^2 - 5x + 6 = 0)`, `diff(x^3)`, `integrate(x^2, 0, 3)`
- `factorise(6x^2 + 7x - 3)`, `hcf(84, 132, 210)`, `lcm(12, 18)`, `primes(360)`, `divide((x^3-1)/(x-1))`, `partial((3x+5)/((x+1)(x+2)))`, `complex((2+3i)/(1-i))` — each writes out its working in the Working panel
- `k = 2` makes a slider; use `t` in formulas and press Play to animate. Type `help` for more.

Shortcuts: `Ctrl+K` search · `3` 2D/3D · `Tab` moves between the controls · `Home` reset view · `Space` play/pause · `Ctrl+Z / Ctrl+Y` undo/redo · `Del` delete · `Esc` back to Move · `Ctrl+S` save a `.phys` project · `Ctrl+=` / `Ctrl+−` / `Ctrl+0` bigger, smaller, normal text.

## Teachers and classrooms

- **Light theme** for bright rooms and projectors (View ▸ Light theme); dark stays the default.
- **Export the drawing** as a PNG at 1× or 2×, labels and axis numbers included (camera button on the drawing, or File ▸ Export).
- **Auto-save**: unsaved work is copied aside every minute, and offered back if the app closes unexpectedly.
- The panel arrangement and the mode you were in are remembered (View ▸ Reset the panel layout puts them back).
- Lessons are grouped by topic with **Basic / Intermediate / Advanced** tags and a search box — no chapter numbers, so any syllabus fits.

## Performance on any PC

- The viewport only redraws when something changes (near-zero CPU when idle).
- WebGPU when available, otherwise WebGL2; quality (Auto/Low/Medium/High, top right of the viewport) adjusts resolution, graph detail and particle counts.
- Test switches: `PHYSLAB_FORCE_WEBGL=1` (no WebGPU), `PHYSLAB_SWIFTSHADER=1` (software graphics), `PHYSLAB_BENCH=1000000` (particle benchmark), `PHYSLAB_SANDBOX=1` (open the sandbox and report what the physics is doing), `PHYSLAB_LOG=1` (log to terminal).

## Is the physics real?

The sandbox uses [Jolt](https://github.com/jrouwe/JoltPhysics) (MIT), the engine behind several big games, and `npm test` checks it against the formulas rather than trusting it: free fall covering ½gt², equal masses swapping velocities in an elastic hit, momentum kept and energy lost in an inelastic one, a bounce to e² of the height, a block that holds on a 10° slope and slides on a 35° one with μ = 0.3, and terminal velocity matching √(2mg/ρC_dA) within 3%.

## Layout of the code

```
src/main          Electron window, app:// protocol, file dialogs, test switches
src/preload       safe bridge for open/save
src/renderer/src
  app/            top bar, modes, search, tool shelf, command bar, dock layout, shortcuts
  core/           scene store, dependency evaluation, object factory, visualize bridge
  math/           vectors, geometry, shapes & decomposition, area formulas, LaTeX conversion,
                  expression language, step solvers, graphs, CAS client
  calc/           calculator engine, constants, calculator state
  sim/            physics sandbox: Jolt bridge, bodies, materials, air drag, world settings
  lang/           command-bar interpreter
  render/         viewport, grid, objects, labels, highlights, graphs, picking, tools, GPU particles
  panels/         Outliner, Examples, Vector Calculator, Measure (+ shape info), Properties, Solver,
                  Calculator, Console, Timeline, Graphs, GPU Lab
  ui/             MathInput (MathLive), KaTeX, fields, error boundary
  workers/        SymPy (Pyodide) algebra worker, loaded on first use
```

New modes plug in through `app/modes.ts`: a tool shelf and panel, object types in `core/types.ts`,
renderers in `render/`, and commands in `lang/commands.ts`.

## Licence and contributing

PhysLab is free software under the **GNU General Public License v3.0** — see [LICENSE](LICENSE).

You may use it, study it, share it and change it. If you distribute a changed version you must
publish your source under the same licence, so that it stays free for the next student who needs
it. That is the whole point of the choice.

[CONTRIBUTING.md](CONTRIBUTING.md) explains what is most useful to send, and the five rules that do
not bend. The most valuable contribution is not code: it is telling us what broke while you were
using it.

Copyright © 2026 the PhysLab contributors.
