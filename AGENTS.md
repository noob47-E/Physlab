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
the viewport (Calculator mode uses it for `working`). `enterMode` (in `app/layout.ts`) sets
`centre` with `showPanel` rather than `requestFocus`, because `requestFocus` holds one panel at a
time and asking for two in a row would silently lose the first. A panel added after a user's
layout was saved still appears: `showPanel` puts it back beside whichever `PANEL_GROUPS`
neighbour is open.

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
- **Never hardcode a colour.** All four themes must work. Use CSS variables and `themeColor()`.
  Several bugs came from literal hex values that were invisible in the light theme — menus,
  popups, measurement labels, the focused tab. `tests/colours.test.ts` scans the renderer for hex,
  palette utilities and pixel text sizes; its allow-lists are empty and must stay empty, and
  three.js code reads its colours through `themeColor()`. `panels/LabChart.tsx` shows the right
  way; the token utilities (`text-ink`, `bg-surface-1`, `text-body`, `font-math`, ...) are defined
  at the top of
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
- **A shape's sides are not its `dependentsOf`.** The Triangle and Polygon tools draw a shape as a
  polygon plus one segment per side; each side depends on its two corner points, not on the
  polygon, so `dependentsOf(polygonId)` never reaches them. Deleting a shape has to walk its real
  dependents *and* its sides (`sidesOf` + `doomedBy` in `core/store.ts`) together in one pass — a
  snapshot of "what to delete" taken before that walk starts misses a second shape doomed along
  the way (a point on one triangle's side that is also another triangle's corner). This was the
  0.6.1 "deleted shape leaves its sides on screen" bug.
- **A substring match on a search index is not a word match.** `panels/Sandbox.tsx`'s experiment
  search used to treat "moments" as matching every preset whose tag merely *starts with* "moment"
  (the nine momentum experiments), burying the seesaw preset actually tagged "moments". A whole
  word beats a word it only begins; a search that matches nothing by whole word still falls back
  to prefix matching, so a half-typed word keeps working.
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
- **Every `.phys` file enters through `parseSceneFile` in `core/migrate.ts`**, and nothing else
  decides whether a file is old. It checks the shape one level down (a lab table with no columns
  and a body with no position used to crash the next render, after the old scene was already
  gone), refuses a bad or newer file with a sentence, and steps the format up one version at a
  time. `loadScene` calls it before touching any store. Bump `FILE_VERSION` when the file's shape
  changes and add a step; every build through 0.3.10 wrote version 1 while adding lab tables, the
  sandbox and `space` without a bump, which is why the v1 → v2 step has to work out from the file
  itself whether a missing `space` was deliberate. `hasWork` in `app/autosave.ts` compares a
  session with `blankSceneFile()` block by block, not "has objects" — a future panel's work would
  otherwise be thrown away without a word.
- **Renaming goes through `scene().renameObject`**, and `renameInObjects` rewrites a formula only
  when the renamed object is the one that name resolves to: renaming the shadowed `a` used to turn
  `b = a + 1` into `b = c + 1`. The Properties panel kept a private copy of the rename, so the fix
  never ran in the app until `tests/sceneStore.test.ts` was made to read the panel.
- **A LaTeX string in a template literal needs double backslashes.** Every string in
  `math/vectorSolver.ts` had single ones, so `\theta` was a tab followed by "heta" and nobody saw
  it until a student did. `tests/vectorSolver.test.ts` renders every step through KaTeX with
  `throwOnError`; keep new solvers in its list. KaTeX also refuses an underscore inside `\text{}`
  (`\text{x_1}` painted every `solve` answer red): symbols go in maths, words in text.
- **Every Pure Math generator sets `Working.checked`.** The panel draws the tick from it and
  nothing else; a generator that forgets shows a grey answer with no verdict. A complex
  multiply-back check multiplies each conjugate pair straight into its real quadratic
  x² − 2·Re(p)·x + |p|², because multiplying the pair term by term forms √2·√6, which a surd
  cannot hold, and the throw read as a failed check on a correct answer.
- **`latexToMath` is called inside the store (`runLatex`), never during render.** A converter
  refusal (a ± it cannot use) is a sentence in the panel from there and a crash from a component.
  `runSeq` in `math/pure/store.ts` is what stops a slow SymPy answer for an earlier question from
  landing on a later one; keep it on any new async route.
- **`warmupCas` posts a message with no id.** A real request through `cas()` showed "Working…"
  and a Stop button for the whole SymPy load, and on a slow first launch hit the 30-second timer
  and killed the half-loaded worker. Every real `cas()` call takes its degree flag from
  `casInDegrees` in `calc/angle.ts`; the Working panel's fallback once sent none, so in DEG mode
  `solve(sin(x) = 0.5)` answered 30 from the bar and π/6 from the panel.
- **`×` is parsed as `timesOrCross`**, and the command bar resolves it to a cross product or a
  plain product only once it knows what stands on either side; the evaluator's `timesOrCross`
  scales a vector by a number. Still open: `splitArgs` does not group `<…>` (so
  `cross(A, <1, 0>)` errors), `3 N × A` takes `N` alone as the left operand, and `inferKind` does
  not know that × of two vectors is a vector. Helper vectors the bar makes for a drawing get
  names a student never types — the hidden tail helper once took the name C and the help's own
  next line replaced it.
- **`fmtPrecise` writes anything below 10⁻¹² as 0.** That is a noise floor for a dragged point,
  and it revealed an electron-scale 1.6×10⁻¹⁹ N practice answer as "0 N". A *known* answer goes
  through `fmtSci`, which has no floor and rounds before it splits mantissa from exponent —
  splitting first is how 9.99999×10⁻²⁰ read "10×10⁻¹⁹".
- **A pulley constraint bakes the rim into its fixed points when the link is made**, so
  `updateBody` in `sim/world.ts` lays the links again when a body a link touches is moved or
  turned in place; without that a wheel dragged while paused was drawn with the rope over its new
  rim while both masses hung from the old one. `pulleyRim` takes the rim from the level direction
  across the wheel's *axle*, not the wheel's own x axis, which spins with it: rotation [90, 0, 90]
  used to send the rope out of the top and bottom.
- **A preset that says "dropped from 5 m" puts the ball's underside at 5 m**, not its centre; a
  25 cm ball lands 3 % early otherwise and the clock contradicts the text beside it.
- **`isDrawingMode` in `app/modes.ts` is the one rule for the 2D/3D switch.** The viewport, the 3
  key and the View menu all follow it; a brushed 3 key used to drop the GPU Lab into a flat view
  with no button on screen to bring 3D back.
- **A WebGPU material with a themed colour is keyed on the theme** (`key={colors.theme}`), because
  a new colour without a new material is never compiled in. `tests/themeTokens.test.ts` checks
  that every token the renderer asks for is declared in every one of the four theme blocks
  (Moonlight, Moonlight Gold, Dark, Light) — `themeColor()` returns a grey stand-in for a misspelt
  or half-declared one, which is invisible until someone toggles the theme with objects on screen.
  Read the colours once per theme in a memo, not per frame.
- **A button that focuses itself on mount steals the keyboard on every remount.** "Let me try
  first" in the Working panel takes the focus only when `go()` asks for it, once, for the answer
  it belongs to (`invitesTry` in `math/pure/reveal.ts`); a focused button also has to hand editing
  keys back to the field, or Backspace reaches the window shortcuts and deletes the selection.
- **Graphs resets its recorded data only when the tracked expressions change.** The plot used to
  rebuild on a theme switch with the same effect, so toggling Dark/Light mid-experiment lost
  everything the timeline had recorded.
- **`color-scheme` only ever accepts `light` or `dark`.** Moonlight and Moonlight Gold are both
  *dark* themes for this CSS property — each block sets `color-scheme: dark` like the ordinary
  Dark theme, never a Moonlight-specific value the browser would not understand, or the native
  scrollbars and form controls default back to light.
- **Panel ids that appear in a saved layout need a `LAYOUT_VERSION` bump.** `layoutMath.ts` rebuilds
  the per-mode default layout whenever `v` does not match, so a renamed or removed panel id (the
  Maths screen replacing the old Calculator panel in 0.6.0 is why `LAYOUT_VERSION` is 3) does not
  leave a saved layout pointing at a panel that no longer exists.
- **An intersection point's stored `index` is only meaningful against `intersectionsOf`'s own
  order.** `core/evaluate.ts` reads `intersectionsOf(a, b)[d.index]` and `render/Interaction.tsx`
  numbers the click targets by walking the same call in the same order; change what
  `intersectionsOf` returns or the order it returns them in, and every point already placed on a
  crossing jumps to the other one.
- **`useLab.setTables` replaces every table in the file; `appendTable` adds one.** A live capture
  (Sandbox's Send to Lab Data) must call `appendTable`, never `setTables` — `setTables` is for
  loading a `.phys` file wholesale, and using it for a capture would silently throw away every
  table the student already had.
- **A `THREE.Points` vertex is one device pixel on WebGPU** — `PointsMaterial.size` is read on
  WebGL2 but ignored on the WebGPU backend. A point that must read as a visible dot at any zoom
  has to be drawn as a sized quad or an instanced sprite, not a raw `Points` vertex.
- **A rope's length is a hidden cap, not the gap it is drawn across.** `addRope` in `sim/world.ts`
  lays the chain to `link.length`, sagging or pulling taut as needed — a rope stretched across a
  shorter gap than it was drawn on used to lie straight across it regardless of the typed length.
  A rope also weighs a tenth of its load (capped at 5 kg, floored at a twentieth of the load) in
  `ropeLinkMass` (`sim/links.ts`), which makes a rope pendulum swing about 4% quick; use a string,
  not a rope, for a period demonstration.
- **Jolt combines a contact's friction as `sqrt(mu1 * mu2)` and its restitution as `max(e1, e2)`,
  never either surface's own value alone.** A preset that quotes a coefficient of friction for a
  ball must set the floor's material too, or the combined value the ball actually feels will not
  match the number in the preset's own text.
- **Touching bodies in a contact chain settle as one lump, not as separate collisions.** A
  Newton's-cradle style chain needs real separation and several sub-steps to resolve ball by ball
  — 6 mm gaps with `collisionSteps: 8` is what the Galileo/cradle presets use; balls placed
  touching, or resolved in one step, transfer momentum through the whole chain at once instead of
  ball to ball.
- **A convex-hull ramp's bottom edge sits exactly at floor level unless it is buried.** That edge
  is a real collision feature a rolling ball can catch on; sinking the ramp a few centimetres into
  the floor keeps a ball rolling off the bottom smoothly instead of catching on the seam.

## How to check your work

```bash
npm test          # vitest, 1200 tests in 51 files, pure logic, no DOM
npm run typecheck # tsc --noEmit, must be clean
npm run lint      # eslint, 0 errors; a suppression carries its reason after `--`
npm run dev       # Electron with hot reload
npm run dist      # builds dist/PhysLab Setup <version>.exe
```

The test suite covers the maths, not the UI: put any decision worth trusting into a pure function in
`math/`, `lab/` or `render/gridMath.ts` and test that, rather than testing through React. The
second rule, since 0.5.0, is that a test should cross a boundary — a file into a store, a typed
line into an answer, a generated string into KaTeX — because that is where every bug that shipped
had been hiding.

- `vitest.config.ts` limits the run to `tests/**/*.test.ts`; without it the runner walked into
  `node_modules`, `out/`, `dist/` and any sibling worktree and found "tests" there too.
- `tests/helpers/repo.ts` (`readSource`, `repoPath`, `RENDERER_SRC`) is how a test reads a source
  file as text; a cwd-relative path works from the repo root and nowhere else.
- `tests/helpers/globals.ts` — call `resetGlobals()` from a `beforeEach` in any file that touches
  the notation or the angle mode, or the file only passes in one order.
- `tests/colours.test.ts` scans every renderer `.tsx` for a hex colour, a palette utility, a
  pixel or rem text size and a colour in a style object; `COLOUR_ALLOW` and `SIZE_ALLOW` are
  empty and must stay empty (an entry that is clean or names a missing file fails the test too).
  `tests/themeTokens.test.ts` checks every token asked for is declared in every one of the four
  theme blocks.
- `tests/commands.test.ts` runs every example in the command bar's `HELP` text; a new command
  goes into the help and is thereby tested. `tests/contracts.test.ts` and
  `tests/sceneStore.test.ts` read the Python worker and the Properties panel as text to check the
  joins.
- `npm run lint` must report 0 errors. A suppression carries its reason after `--`, and a
  suppression whose rule no longer fires is itself an error (`eslint.config.js` says which rules
  are warnings and why).

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
