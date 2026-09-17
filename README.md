# PhysLab

A general math and physics engine for students and teachers: vectors, shapes and geometry,
graphing, a natural textbook-math calculator, step-by-step solutions and GPU simulations.
Everything runs offline.

## Run it

| What | Command |
| --- | --- |
| Install once (installer with desktop shortcut) | `dist\PhysLab Setup 0.2.0.exe` |
| Run without installing | `dist\win-unpacked\PhysLab.exe` |
| Developer mode (live reload) | `npm run dev` |
| Rebuild the installer | `npm run dist` |
| Unit tests | `npm test` |

## Modes

Features are grouped into modes, like a calculator. Pick one in the top bar, or press **Ctrl+K** to search everything.

| Mode | What it does |
| --- | --- |
| **Calculator** | Natural textbook math (fractions, roots, powers, ∫, Σ look like a book) with every fx-991EX mode: COMP, CMPLX, BASE-N, MATRIX, VECTOR, STAT, DIST, TABLE, EQN, INEQ, RATIO, SHEET, UNITS, CONST, MEASURE. **Visualize** draws the calculation (tangent line for d/dx, shaded area for ∫). |
| **Vectors** | **Vector Calculator** panel: type vectors as `3î + 4ĵ` or `size ∠ angle`, one-click operations (sum, difference, dot, cross, projection, equilibrium, torque, work, magnetic force, relative velocity), big answers, optional steps, **Draw on graph**. |
| **Shapes & Geometry** | **Sketch** a rough shape and it snaps to a perfect square, rectangle, triangle, circle… Click corners or draw connected segments and closed loops are recognised too. The Measure tab shows the shape's name and its **area in algebraic form** (formula → values → answer with units). **Hover a formula** to shade the area; hover a symbol to highlight that side. **Decompose** splits any shape into rectangles and triangles, adding the corner the cut needs, with **Other way** to see alternatives. |
| **Graphing** | `y = x^2 - 4`, `x^2 + y^2 = 9`, `y > x^2`, `r = 2cos(3θ)`, `z = sin(x)cos(y)`, sliders, roots and turning points. |
| **Sandbox** | Real objects that collide, powered by the Jolt physics engine. Add balls, crates, cylinders, ramps, planks and walls; set mass or density, material, size, position, velocity, bounciness and friction; pick things up with the mouse and throw them. World controls: gravity (Earth, Moon, Mars, Jupiter, none), air or vacuum, a true flat 2D mode, slow motion and an accuracy setting. |
| **GPU Lab** | Millions of charged particles in E and B fields on the graphics card. |
| **Problem Sets** | Practice with fresh numbers every time. **Hint** gives you one step, not the answer. **Check my answer** marks what *you* worked out on paper and names the mistake: wrong quadrant, sin instead of cos, forgotten cos θ, calculator left in radians, wrong power of ten. |
| Coming next | Proofs, Mechanics, Instruments, Electricity & Electronics, Optics, Waves & Sound, Heat, Nuclear & Modern. |

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
- `k = 2` makes a slider; use `t` in formulas and press Play to animate. Type `help` for more.

Shortcuts: `Ctrl+K` search · `Tab` 2D/3D · `Home` reset view · `Space` play/pause · `Ctrl+Z / Ctrl+Y` undo/redo · `Del` delete · `Esc` back to Move · `Ctrl+S` save a `.phys` project.

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
