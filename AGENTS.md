# Working on PhysLab

Read this before changing anything. It is written for whoever — or whatever — picks this project up
next, and it records the things that are expensive to rediscover.

## What this is

[HISTORY.md](HISTORY.md) records how the project got here, version by version, including the bugs
that produced the rules below.

A maths and physics engine **for anyone learning maths and physics** — any student, any teacher,
any level. It is not built for one syllabus, board or country, and nothing in it should assume one.
It began with one 11th-class student and is shaped by what real use turns up, but that is where it
started, not who it is for. (Rule 5 below says the same thing from the inside: features are modes,
never grade levels — and never syllabus gates either.)

Electron + React + TypeScript, three.js (WebGPU with a WebGL2 fallback), Jolt physics in
WebAssembly, mathjs, MathLive, and Pyodide/SymPy in a worker.

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
`MODES` entry with `panel`, optional `centre` and `examples`), `app/panels.ts` (`PANEL_TITLES`,
`PANEL_GROUPS`), `app/App.tsx` (lazy import, `PANEL_VIEWS`), and the panel component itself.
`buildLayout` in `app/layout.ts` needs nothing: it reads the `MODES` entry through `panelsForMode`
(`app/layoutMath.ts`). Copy how `lab` or `problems` was done.

A mode's `panel` is its side panel; its optional `centre` takes over the big middle area instead of
the viewport (Calculator mode uses it for `working`). `enterMode` (in `app/layout.ts`, re-exported
from `TopBar`) sets `centre` with `showPanel` rather than `requestFocus`, because `requestFocus`
holds one panel at a time and asking for two in a row would silently lose the first. A panel added
after a user's layout was saved still appears: `showPanel` puts it back beside whichever
`PANEL_GROUPS` neighbour is open.

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
  measurement labels, the focused tab. `tests/colours.test.ts` scans the renderer for hex, palette
  utilities and pixel text sizes; its allow-lists are empty and must stay empty, and three.js code
  reads its colours through `themeColor()`. `panels/LabChart.tsx` shows the right way; the token
  utilities (`text-ink`, `bg-surface-1`, `text-body`, `font-math`, ...) are defined at the top of
  `styles.css`.
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
- **Sandbox Reset is a counter, not a comparison.** `useSandbox.runNonce` is what makes the viewport
  rebuild the engine. Handing the reconciliation effect a fresh array of the same `BodyDef` objects
  does nothing: it compares object identity and finds nothing changed. That was why Reset "worked
  sometimes" — only when something else had forced a rebuild.
- **The grab spring only acts inside `beforeStep`, which only runs while playing.** Paused, a drag
  has to *place* the body (`placeBody`) and the demand-driven canvas has to be `invalidate()`d by
  hand, or nothing moves and nothing repaints. A sleeping body must be woken before the force
  block can reach it.
- **Meshes in the sandbox group are matched to the engine by `userData.bodyId`.** The velocity
  arrows are meshes in the same group; they must be filtered out of picking and never counted by
  index against the transform buffer.
- **The engine outlives the view.** `engine.world` in `sim/store.ts` is created once; leaving the
  Sandbox and coming back must not call `SimWorld.create` again, which clears it.
- **A rope is a chain of bodies, and the solver loses the fight when the mass ratio is large.** Ropes
  weigh a tenth of the lightest load, capped at 5 kg but never below a twentieth of it
  (`ropeLinkMass` in `sim/links.ts`), use 20 cm links and ten position steps; at a twentieth with
  12 cm links a 2 kg bob stretched a 2.2 m rope by nearly a metre, and a flat 5 kg cap under a heavy
  load stretched it anyway. Rope links live in `ropes`, not `order`, with user data 0, so contacts,
  transforms and the panel never see them.
- **A pulley's fixed points are always world space**, whatever `mSpace` says; the body points are
  local. A hinge stores its pivot as local offsets (`pivotA`/`pivotB`) because `setLinks` re-runs
  mid-run and world-space points would re-pin the bodies where they were when the link was made.
- **Every scene object carries the `space` it was drawn in** (`core/visibility.ts`), stamped by
  `Builder.base()` from `scene().activeSpace`, which `enterMode` sets. Rendering, labels, picking,
  the Outliner, Measure, sliders, Select-all and camera framing filter on it; evaluation, naming,
  undo, save and `dependentsOf` never do. An object with no space (made where no drawing is active,
  or from a format-1 file where nothing said where it belongs) shows everywhere.
- **A hover highlight names its `owner`**, and `ShapeInfo` clears the highlight when it unmounts.
  A mouse-leave never fires on an element that has just been removed, which is how a shaded area
  used to outlive the shape it belonged to.
- **Custom CSS must live inside `@layer components`** or Tailwind's width/height utilities stop
  working. `.topbar` must never get `overflow: hidden`: its menus are absolutely positioned and hang
  below it.
- **The saved layout is `{ v, app, w, h, layout, mode }`** and is rebuilt (per-mode default) when
  `v` or the window class changes, never squeezed. "Reset the panel layout" reloads on purpose, and
  depends on the `resetting` flag in `app/layout.ts` skipping the `beforeunload` save — without it
  the save on the way out put the old layout straight back.
- **Chromium remembers the window zoom per host.** Never keep a second copy in the renderer; a
  second owner is why Ctrl+= and the settings popover used to disagree after a restart.
- **The 2D/3D switch is `VIEW_KEY` ('3') in `app/shortcuts.ts`**, because V is the Move tool and
  Tab must reach the controls.
- **MathLive options must wait for the `mount` event.** Line2 geometry needs positions before the
  first render. The async R3F renderer needs a manual `setSize` sync.
- **Circular imports bite.** `App.tsx` imports the top bar and the search palette, so those two must
  not import `App`. Shared things live in their own module — that is why `app/panels.ts` exists.
- **A dev-only global needs `typeof window !== 'undefined'`**, or the test runner fails on import.

## How to check your work

```bash
npm test          # vitest, ~460 tests, pure logic, no DOM
npm run typecheck # tsc --noEmit, must be clean
npm run lint      # eslint, 0 errors; a suppression carries its reason after `--`
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
