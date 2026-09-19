# Working on PhysLab

Read this before changing anything. It is written for whoever — or whatever — picks this project up
next, and it records the things that are expensive to rediscover.

## What this is

[HISTORY.md](HISTORY.md) records how the project got here, version by version, including the bugs
that produced the rules below.

A maths and physics engine for students and teachers, built for one 11th-class student (Punjab
Board) and shaped by what they asked for. Electron + React + TypeScript, three.js (WebGPU with a
WebGL2 fallback), Jolt physics in WebAssembly, mathjs, MathLive, and Pyodide/SymPy in a worker.

## Rules that are not negotiable

1. **No AI in the product.** No API keys, no cloud calls, no model of any kind. Everything runs
   offline. The user asked for this explicitly and repeatedly.
2. **It must feel like a calculator, not a programming language.** The user is afraid of code. Input
   is fx-991EX-shaped: natural maths, a command bar of one-liners, buttons. Never expose syntax that
   looks like programming.
3. **Answers are mandatory; working is a bonus.** Every feature must produce the result. Steps,
   hints and visualisation are welcome on top, never instead.
4. **Everything shown has units and the user's precision.** Format through `formatMeasure` /
   `fmtPrecise` (`src/renderer/src/math/format.ts`), never with raw `toFixed`.
5. **Features are modes, not grade levels.** A new capability becomes an entry in `MODES` with its
   own panel. There are no "beginner/advanced" gates.
6. **Anything solved should be visualisable.** If a feature computes something, there should be a
   path to see it in the viewport.

## The shape of the code

```
src/main/          Electron main process: window, app:// protocol, file dialogs, autosave
src/preload/       The only bridge to the renderer (window.physlab)
src/renderer/src/
  app/             Shell: TopBar, CommandBar, SearchPalette, modes, panels, shortcuts, theme, tour
  core/            Scene state (zustand), the dependency evaluator, object factory, types
  lang/            The command bar language (commands.ts)
  math/            Pure maths: vectors, geometry, shapes, graphs, formatting, CAS client, solvers
  math/pure/       Pure Math: exact fractions, polynomials, and the step-by-step working engine
  calc/            The scientific calculator engine and its store
  lab/             Lab Data: tables of readings, fitting, chart data
  sim/             Jolt physics bridge for the Sandbox
  render/          three.js: viewport, grid, labels, tools, picking, export
  panels/          One file per dock panel
  workers/         cas.worker.ts (Pyodide + SymPy)
tests/             vitest, no DOM — pure logic only
```

**Adding a mode and a panel** touches exactly four files: `app/modes.ts` (the `ModeId` union and a
`MODES` entry), `app/panels.ts` (`PANEL_TITLES`, `PANEL_GROUPS`), `app/App.tsx` (lazy import,
`PANEL_VIEWS`, `buildLayout`), and the panel component itself. Copy how `lab` or `problems` was done.

A mode's `panel` is its side panel; its optional `centre` takes over the big middle area instead of
the viewport (Calculator mode uses it for `working`). `enterMode` sets `centre` with `showPanel`
rather than `requestFocus`, because `requestFocus` holds one panel at a time and asking for two in
a row would silently lose the first. A panel added after a user's layout was saved still appears:
`showPanel` puts it back beside whichever `PANEL_GROUPS` neighbour is open.

## Traps that have already cost a day

- **Jolt owns its objects by reference count.** A `ShapeSettings` holds the only reference to the
  shape it creates: free the settings early and the body's shape goes with it, silently. Hull shapes
  (ramp, cone) are handed back with their settings and freed in `addBody()` once the body holds a
  reference. A returned `BodyID` is a temporary — keep the `Body`. Only one `JoltInterface` may exist.
- **Attach a constraint in `LocalToBodyCOM`, never `WorldSpace`.** Handing a distance constraint the
  bodies' current world positions as its attachment points bakes those absolute points in, and the
  constraint then pins both bodies where they stood: a *slack* string held a ball motionless in
  mid-air half a metre below its pivot, and a rod between two dynamic bodies did nothing at all.
  Points of `[0,0,0]` in each body's own frame join their centres and behave. The settings must also
  outlive `Create()` — same ownership rule as `ShapeSettings`.
- **Rolling resistance does not exist in Jolt.** A sphere on a level floor rolls until the scene is
  closed. `world.ts` applies a μr·mg·r torque against the spin, but only while `touching` says the
  body is in contact — the contact listener's `OnContactPersisted` is what fills that in.
- **The canvas renders on demand** (`frameloop="demand"`). Nothing is drawn unless something calls
  `invalidate()`. The first frame is drawn with React Three Fiber's **stand-in camera at zoom 1**, so
  anything derived from the camera on that frame is wrong; the real orthographic camera arrives a
  moment later. The `Invalidator` in `render/Viewport.tsx` therefore watches the camera object, the
  canvas size, the renderer readiness and the stores. Watching a store that is only written *inside*
  a frame is circular and does not work. This was the "black viewport" bug.
- **WebGPU compiles a material's colour in.** Changing `material.color` after the first render does
  nothing until `material.needsUpdate = true`. That is why a theme switch used to leave the old
  theme's grid on screen.
- **Never hardcode a colour.** Both themes must work. Use CSS variables and `themeColor()`. Several
  bugs came from literal hex values that were invisible in the light theme — menus, popups,
  measurement labels, the focused tab. `panels/Graphs.tsx` still has hardcoded chart colours; fix it
  if you touch that file. `panels/LabChart.tsx` shows the right way.
- **Pure Math works in exact fractions, never in doubles.** `math/pure/rat.ts` is bigint over
  bigint, and everything above it — polynomials, factorisation, partial fractions — is built on
  that. A student reading a factorisation must never meet `0.30000000000000004`, and a step that
  divides by 3 and multiplies back has to land exactly where it started. `rFromNumber` deliberately
  reads a decimal the way it was *written* (0.15 → 3/20), not the way the double stores it,
  because the alternative is a "simplified" fraction with a nineteen-digit denominator.
- **A step's `head` and `check` are spoken sentences, not display maths.** They are rendered as
  plain text, so LaTeX leaking into them shows up as literal `x^{2}` and `\left(`. `texToPlain` in
  `math/pure/work.ts` is applied by the panel to every heading, note and check line, which is why a
  generator may write "divide x^{3} by x" without thinking about it. Only `tex` and `rule` go
  through KaTeX. `tests/pureRender.test.ts` runs the real KaTeX over every generated string —
  an unbalanced brace is otherwise invisible until it renders red in the app.
- **Nothing is shown until it has been checked.** Every Pure Math tool reconstructs its own answer
  (multiply the factors back out, recombine the partial fractions) and compares it with the input
  before returning. If the check fails the working still appears, but says so.
- **Custom CSS must live inside `@layer components`** or Tailwind's width/height utilities stop
  working.
- **MathLive options must wait for the `mount` event.** Line2 geometry needs positions before the
  first render. The async R3F renderer needs a manual `setSize` sync.
- **Circular imports bite.** `App.tsx` imports the top bar and the search palette, so those two must
  not import `App`. Shared things live in their own module — that is why `app/panels.ts` exists.
- **A dev-only global needs `typeof window !== 'undefined'`**, or the test runner fails on import.

## How to check your work

```bash
npm test          # vitest, ~210 tests, pure logic, no DOM
npm run typecheck # tsc --noEmit, must be clean
npm run dev       # Electron with hot reload
npm run dist      # builds dist/PhysLab Setup <version>.exe
```

The test suite covers the maths, not the UI: put any decision worth trusting into a pure function in
`math/`, `lab/` or `render/gridMath.ts` and test that, rather than testing through React.

**Verifying the real app** matters, because the packaged build behaves differently from the dev one:

```bash
PHYSLAB_LOG=1 "dist/win-unpacked/PhysLab.exe"
```

`PHYSLAB_LOG=1` mirrors renderer warnings, errors and every `PHYSLAB_CHECK` line to the terminal.
Other switches: `PHYSLAB_SANDBOX=1` (opens the physics sandbox and logs positions and contacts each
second), `PHYSLAB_BENCH=<n>` (GPU particle benchmark, logs fps), `PHYSLAB_FORCE_WEBGL=1`,
`PHYSLAB_SWIFTSHADER=1`.

A browser-only preview runs on port 5199 (`npm run web`); `PORT` overrides it. Beware: when the
window is hidden or behind another, animation frames stop entirely — screenshots go stale and the
canvas never repaints, so **no rendering conclusion drawn from a hidden preview is trustworthy**.

## Environment quirks on this machine

- The shell PATH lacks Node and Git. Prefix commands with the machine + user PATH.
- Poppler for PDF pages lives under `WinGet\Packages\oschwartz10612.Poppler_…\poppler-25.07.0\Library\bin`.
- The app installs per-machine to `C:\Program Files\PhysLab`; settings and autosave live in
  `%APPDATA%\PhysLab` and must survive an update.
- Backups: a git bundle and a source zip in `C:\my_projects\PhysLab-backups`, refreshed each session.

## House style

- Comments explain **why**, never what. If a line looks odd, the comment says what goes wrong
  without it.
- Plain English in anything a student reads. "Right size, wrong sign", not "sign error detected".
- Match the surrounding code: no new dependencies without a reason, no reformatting unrelated lines.
- Commit messages say what changed and why it was wrong before.

## A warning about automated bug reports

This project has been reviewed several times by other AI tools. Roughly a third of what they report
is real; the rest describes code that no longer exists, or misreads it. One report's suggested
"fix" would have crashed every ramp in the Sandbox; another credited fixes to commits that never
touched those files. **Verify every claim against the code before acting on it**, and say plainly
which ones were wrong.
