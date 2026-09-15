# PhysLab

A general math and physics engine for students and teachers: vectors, shapes and geometry,
graphing, a natural textbook-math calculator, step-by-step solutions and GPU simulations.
Everything runs offline.

## Run it

| What | Command |
| --- | --- |
| Install once (installer with desktop shortcut) | `dist\PhysLab Setup 0.1.0.exe` |
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
| **Shapes & Geometry** | **Sketch** a rough shape and it snaps to a perfect square, rectangle, triangle, circle… Click corners or draw connected segments and closed loops are recognised too. The Measure tab shows the shape's name and its **area in algebraic form** (formula → values → answer with units). **Hover a formula** to shade the area; hover a symbol to highlight that side. **Decompose** splits composite shapes into simple parts with gap lines. |
| **Graphing** | `y = x^2 - 4`, `x^2 + y^2 = 9`, `y > x^2`, `r = 2cos(3θ)`, `z = sin(x)cos(y)`, sliders, roots and turning points. |
| **GPU Lab** | Millions of charged particles in E and B fields on the graphics card. |
| Coming next | Proofs, Mechanics, Instruments, Electricity & Electronics, Optics, Waves & Sound, Heat, Nuclear & Modern, Problem Sets. |

## Measurements

- Labels show an object's letter and value (`A 5 u ∠ 53.13°`, side lengths, areas, angles).
- **When labels show** (switch at the top-left of the viewport, or the settings menu):
  - **On hover** (default): a label appears when you point at or select an object and fades out when the cursor moves away. Pointing at a shape shows all its sides and its area.
  - **Always**: every label stays on.
  - **Hidden**: nothing on the drawing; the **Measure** panel lists every value at the side.
- **Pin** a label to keep it on whatever the setting: the pin button in the Measure list or Outliner, or *On drawing* in Properties (which can also hide one label for good).
- Point letters (A, B, C…) stay visible by default so formulas like `AB = 4` are readable; untick this in the settings menu.
- **Settings button** in the top bar: 1 grid square = 1 unit / mm / cm / m / km / in / ft, decimal places or significant figures, and what labels contain. Label choices are remembered.
- Snapping is magnetic: it only jumps to a point, grid crossing or axis when you are close. Hold **Alt** to switch snapping off, **Shift** to draw at 15° steps.

## Command bar examples

- `A = <3, 4>`, `F = 10 N ∠ 30°`, `R = A + B`, `A · B`, `A × B`, `|A|`
- `components(10, 30)`, `resultant(5, 5, 120)`, `equilibrium(A, B)`
- `Triangle((0,0), (4,0), (0,3))`, `Polygon((0,0), (6,0), (6,4), (3,7), (0,4))`, `Circle(P, 3)`
- `solve(x^2 - 5x + 6 = 0)`, `diff(x^3)`, `integrate(x^2, 0, 3)`
- `k = 2` makes a slider; use `t` in formulas and press Play to animate. Type `help` for more.

Shortcuts: `Ctrl+K` search · `Tab` 2D/3D · `Home` reset view · `Space` play/pause · `Ctrl+Z / Ctrl+Y` undo/redo · `Del` delete · `Esc` back to Move · `Ctrl+S` save a `.phys` project.

## Performance on any PC

- The viewport only redraws when something changes (near-zero CPU when idle).
- WebGPU when available, otherwise WebGL2; quality (Auto/Low/Medium/High, top right of the viewport) adjusts resolution, graph detail and particle counts.
- Test switches: `PHYSLAB_FORCE_WEBGL=1` (no WebGPU), `PHYSLAB_SWIFTSHADER=1` (software graphics), `PHYSLAB_BENCH=1000000` (particle benchmark), `PHYSLAB_LOG=1` (log to terminal).

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
  lang/           command-bar interpreter
  render/         viewport, grid, objects, labels, highlights, graphs, picking, tools, GPU particles
  panels/         Outliner, Examples, Vector Calculator, Measure (+ shape info), Properties, Solver,
                  Calculator, Console, Timeline, Graphs, GPU Lab
  ui/             MathInput (MathLive), KaTeX, fields, error boundary
  workers/        SymPy (Pyodide) algebra worker, loaded on first use
```

New modes plug in through `app/modes.ts`: a tool shelf and panel, object types in `core/types.ts`,
renderers in `render/`, and commands in `lang/commands.ts`.
