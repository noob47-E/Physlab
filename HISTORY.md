# The story of PhysLab, version by version

This is the full record of what was built, when, and why — from the first version to the current
one. It is written for anyone who wants to understand how PhysLab got here: a contributor deciding
whether to help, a teacher deciding whether to trust it, or the next person who picks the project up.

`AGENTS.md` says how to work on the code. `README.md` says how to use the app. This file says how
it came to exist.

---

## What PhysLab is

A maths and physics engine for anyone learning maths and physics — any student, any teacher, any
level, anywhere. It is deliberately not tied to one syllabus, board or country.

It was written by an 11th-class student together with Claude, and the first person to use it in
anger was its author, which is why so much of what follows is driven by real complaints. That is
where it started; it is not who it is for.

It runs entirely offline as a Windows desktop application. There is no AI inside the product, no
API keys, no cloud calls, no accounts, no ads, and no cost to the user. That was a design rule from
the first day, not a marketing decision, and it means the app has no running costs and nothing that
can be taken away from it later.

---

## At a glance

| | |
| --- | --- |
| First work | 2026-09-14 |
| Current version | 0.3.6 (2026-09-20) |
| Releases built | 14 |
| Commits | 50 |
| Source | 25,481 lines of TypeScript/TSX across 114 files, plus 996 lines of CSS |
| Tests | 262, across 17 files, all pure logic with no browser |
| Modes | 16 defined, 8 working, 8 reserved for later |
| Dock panels | 16 |
| Licence | GPL-3.0 |
| Runtime cost | none — no servers, no API, no per-user cost |

---

## The rules that shaped every decision

These came from the student who started it, and they are repeated at the top of
`AGENTS.md` because almost every design argument was settled by one of them.

1. **No AI in the product.** Stated explicitly and repeatedly. Everything offline.
2. **It must feel like a calculator, not a programming language.** The user is afraid of code.
   Input is fx-991EX-shaped: natural maths, buttons, a command bar of one-liners. No syntax that
   looks like programming.
3. **Answers are mandatory; working is a bonus.** Every feature must produce the result. Steps,
   hints and pictures are welcome on top, never instead.
4. **Everything shown carries units and the user's chosen precision.**
5. **Features are modes, not grade levels.** There are no beginner/advanced gates.
6. **Anything solved should be visualisable.** If it computes something, there should be a way to
   see it.

Rule 3 is the one that keeps coming back. It is why the Pure Math engine falls back to SymPy when
it cannot show working, rather than refusing to answer.

---

## Version by version

### 0.1.0 — the first working app · 2026-09-14 to 2026-09-15

The starting point: a dockable workspace with a 2D/3D viewport and the first six modes.

- **Vectors** — draw them, measure them, add them.
- **Shapes & geometry** — points, segments, polygons, circles, constructions.
- **Graphing** — typed equations plotted in the viewport.
- **A calculator** in natural textbook maths, with the fx-991EX mode set.
- **Examples** and a **GPU Lab** (millions of charged particles in E and B fields on the graphics
  card).

**Phase A, the first big revision.** The student's complaints were specific and fair: the
calculator was clunky, the measurements were unclear, and drawing was awkward. What changed:

- Always-visible measurement chips, plus unit-scale and precision settings.
- A natural-maths calculator and a Vector Calculator, both built on MathLive with a hand-written
  LaTeX → linear-syntax translator (`math/latexToMath.ts`).
- Shape recognition: a Sketch tool that snaps a rough stroke to a perfect square, circle or
  triangle, and closed segment loops promoted to polygons automatically (`math/shapes.ts`).
- Algebraic area: the formula, then the substitution, then the answer — with hover-to-shade
  (`panels/ShapeInfo.tsx`, `math/shapeFormulas.ts`), and **Decompose** to split a composite shape
  into rectangles and triangles (`math/decompose.ts`).
- Magnetic snapping, demand rendering, quality tiers, lazy-loaded panels, error boundaries.

Then a correction that only a real user would give: **always-visible vector names cluttered the
drawing.** Labels moved to *on hover* by default, with Always and Hidden as options, remembered
between sessions, and a per-object pin for the ones you do want fixed.

### Plan v3 — the polish that made it usable · 2026-09-15

Seven of eight planned sections landed in one day. The theme was removing friction.

- **Decompose** learnt to cut slabs perpendicular to any edge, to add the corner a cut needs, and to
  offer alternative ways of splitting the same shape.
- **Drawing tools finish properly**: right-click, Enter or double-click to finish; Esc to cancel;
  Backspace to undo a point — with an on-screen bar saying so.
- **Right-click menus** everywhere (`app/contextActions.ts`, `ui/ContextMenu.tsx`), including in the
  Outliner and the Measure list.
- **The content became general**, not book-specific: chapter and example references were removed in
  favour of a topic library, so the app is not tied to one textbook.
- **A guided tour**, practice tasks and a shortcut list (`app/tour/`).
- Correctness: significant-figure zeros, an `acos` clamp, surface holes, a 30-second CAS timeout
  with restart and Cancel, atomic saves, evaluation depth limits, structural id remapping.
- Autosave and crash recovery, layout memory, a light theme built on CSS variables, and PNG export
  with labels included.

### 0.2.0 — Problem Sets · 2026-09-16

The first feature aimed at practice rather than exploration.

- Ten seeded topic generators (`math/problems.ts`) built on the same solvers that write the
  step-by-step solutions, so the answer a student is marked against is the answer PhysLab would
  work out itself.
- **Hints revealed one step at a time**, not all at once.
- **An answer checker that names the mistake** (`math/checkAnswer.ts`): sin/cos swapped, wrong
  quadrant, equilibrant instead of resultant, calculator left in radians, wrong power of ten, a
  sign error. It marks what the student worked out on paper, and anything within 1% is correct.

Also that day: four real bugs from a code review were fixed, including a `ConvexHullShapeSettings`
leak on every ramp and cone, and Enter/Space being stolen from focused buttons.

### 0.2.1 and 0.2.2 — the black viewport · 2026-09-16

The most instructive bug in the project's history, and it took two attempts.

**The symptom.** On first open in the installed build, the viewport was black except for the letters
`x`, `y` and `0`. Switching to GPU Lab and back fixed it.

**The first fix** addressed a real fault — `Grid2D` cached a grid built from a canvas that had not
been measured yet — but did not fully cure it.

**The actual root cause**, found with a frame-by-frame trace that is still in the code: React Three
Fiber draws **frame 1 with a stand-in camera at zoom 1**. The grid was therefore built for a
±562-unit world with 100-unit spacing. The real orthographic camera arrives a moment later at
zoom 50 and frame 2 is correct — but with `frameloop="demand"` nothing guaranteed a second frame,
so the wrong first picture simply stayed. Only the labels that do not depend on the camera survived,
which is exactly why `x`, `y` and `0` were the only things visible.

**The fix** was to watch the camera *object identity* in `Viewport.tsx`'s `Invalidator` — it changes
the instant the real camera replaces the stand-in, needing no frame — along with the canvas size and
renderer readiness, and to make the grid's rebuild key include the zoom. Watching the view store
alone does not work: it is only written from *inside* a frame, which is circular.

0.2.2 also fixed eleven other confirmed bugs and made the light theme genuinely usable — several
menus and labels had hardcoded dark colours that made them invisible on a light background. That is
where the rule *never hardcode a colour* comes from.

### 0.2.3 and 0.2.4 — small, real fixes · 2026-09-16

- **A closed panel could be opened again.** Closing a panel had been a one-way door; `showPanel`
  now puts it back beside the panels it used to live with.
- The focused panel tab was white on white in the light theme.
- Four more fixes from a third review, with the graph-label crash made testable and then tested.

### 0.2.5 — Lab Data · 2026-09-17

The practical-notebook feature: turn real experiment readings into a gradient with a meaning.

- A table of readings with computed columns (`t^2` from `t`), saved inside the `.phys` file.
- A uPlot scatter chart with a fitted line, r², and the gradient reported **with its unit and what
  it physically means**.
- **Uncertainties**: a ± button adds an uncertainty column beside its parent, keeping name and unit
  in step. Error bars are drawn in a uPlot draw hook, because uPlot has none, and the y scale is
  widened to fit them or they get clipped.
- A detail worth recording: **when error bars exist, the gradient's ± comes from the max/min line
  method**, and from the scatter standard error otherwise. Adding bars that changed nothing would
  have looked like a bug.
- CSV import and paste that copes with tabs, commas, semicolons, decimal commas, Unicode minus
  signs, and `t / s` or `t (s)` column captions. Both undoable in one click.
- **Send readings to the viewport**, and an example that finds *g* from distance and time.

### 0.3.0 — the Sandbox rebuild · 2026-09-18

Three separate reviews — two automated, one from the student — independently said the Sandbox was
the worst part of the app. The student's verdict: *"it should be the student's most favourite
feature."* So it was rebuilt.

**The three real bugs, and their causes:**

1. **Mass did not matter.** The grab spring used `k = 60·m`, so mass cancelled out of `a = F/m`
   entirely and a 2,000,000 kg block dragged like a marble. Fixed by capping the force at 800 N.
2. **Balls rolled forever.** Jolt has no rolling resistance at all. A μr·mg·r torque is now applied
   against the spin, as a material property, but only while the contact listener says the body is
   actually touching something.
3. **Every edit reset the scene.** Any change called a full rebuild, which put every object back at
   its starting position. Now `updateBody()` changes things in place, and only a structural change
   (shape, mass, motion type) triggers a rebuild.

**What was added:** energy and momentum readouts including rotational kinetic energy, eight preset
experiments, run recording that hands the data to Lab Data, constraints (rod, string, spring), axis
locks, a launcher that works out v cos θ and v sin θ, trajectory trails, a floor grid, and undo.

**Two Jolt traps that cost real time**, now permanent in `AGENTS.md`:

- **A constraint must attach in `LocalToBodyCOM` with `[0,0,0]` points, never in `WorldSpace`.**
  Handing a distance constraint the bodies' current world positions bakes those absolute points in
  and *pins* both bodies where they stood. A deliberately slack string held a ball motionless in
  mid-air, half a metre below its pivot; a rod between two dynamic bodies did nothing at all.
- **Jolt owns its objects by reference count.** A `ShapeSettings` holds the only reference to the
  shape it creates — free it early and the body's shape goes with it, silently. Constraint settings
  must likewise outlive `Create()`.

### 0.3.1 — gap closing and going properly free · 2026-09-18 to 2026-09-19

- The five gaps the plan still had open were closed.
- **Licensed GPL-3.0** and the repository prepared to publish: a contributing guide, a rewritten
  README, and a launch config that does not assume Windows.

### 0.3.2 — Pure Math · 2026-09-19

The current version, and the one the student described as *"the thing no other free software has."*

Calculator mode's big centre area becomes a **Working** panel that shows the entire method for a
question: each step with one plain-English line saying what just happened, and the formula that
allowed it printed beside the step.

**Ten tools**, all offline and instant:

| Tool | Methods it knows |
| --- | --- |
| Factorise | common factor, difference of two squares, perfect square, sum and difference of cubes, splitting the middle term, grouping, factor theorem — and it names the method it used |
| Expand | multiply out and collect, highest power first |
| Divide | polynomial long division, written as the full staircase, plus the remainder theorem shortcut |
| Partial fractions | proper and improper, repeated factors, irreducible quadratics; by cover-up or by equating coefficients |
| HCF and LCM | whole numbers *and* algebraic expressions |
| Prime factors | the division ladder, index form, and the divisor count |
| Complex | add, multiply, divide by the conjugate, with i² = −1 as its own visible step |
| Solve | the quadratic formula, including complex roots and exact surds |
| Factorise with i | factors that do not exist over the real numbers |

**Two design decisions shaped the whole thing:**

*It is exact.* Everything sits on a bigint fraction type (`math/pure/rat.ts`). A student reading a
factorisation must never meet `0.30000000000000004`, and a step that divides by 3 and multiplies
back has to land exactly where it started. Decimals are read the way they were *written* — `0.15`
becomes `3/20`, not the nineteen-digit fraction the double actually holds.

*It checks itself.* Nothing is shown until it has been verified: factors are multiplied back out,
partial fractions are recombined over a common denominator, and the result is compared with the
question. The tick under the answer is that check actually running.

**Why not just use SymPy?** SymPy was already in the project and gives correct answers, but it gives
no steps, and it takes seconds to wake up. Steps are the entire product here. So the step engine is
its own pure TypeScript layer — fractions, then monomials, then polynomials, then one generator per
method — and SymPy stays as the fallback that still produces an answer when the step engine cannot
show working. Rule 3, again.

Also in this release: a Pure Math row under the calculator keys, eight new command-bar one-liners,
persistent history for both the calculator and the Working panel, and `ModeDef.centre` so a mode can
claim the big middle area instead of the viewport.

---

### 0.3.3 — the repairs · 2026-09-19

Pure Math shipped with 209 passing tests and a panel that could not really be used. The student
using it reported three things within minutes, and all three were real.

**Backspace did nothing in any maths field.** `MathInput` called `stopPropagation()` on *every*
key, in the capture phase, on the `<math-field>` host. MathLive does its real keyboard work on an
element inside its own shadow root, also in the capture phase, so the event was killed before
MathLive ever saw it. Plain typing survived by accident, through a native fallback. Backspace,
Delete, the arrow keys, Home and End did not. Only a plain Enter is taken now.

This was **not a 0.3.2 regression** — it had been broken in the Calculator all along, hidden by its
on-screen `DEL` button, which calls `deleteBackward` directly and never touches the keyboard. The
Working panel has no such button, so it exposed a bug that was already there. The guided tour was
also quietly taking Enter and the arrow keys from whatever was being typed in.

**Pressing a job button corrupted the expression.** The panel wrote the *linear* form of the
question back into the field, and MathLive reads whatever it is handed as LaTeX, so `x^(2)` came
out as a stray bracket in the middle of the student's algebra. The store now keeps both forms and
only ever hands the field the LaTeX that was actually typed.

**Anything starting with a minus would not factorise.** A guard skipped pulling out a bare `−1`,
after which both the middle-term split and the root search gave up, so `−x² + 5x − 6` was reported
as not factorisable at all when it is plainly `−(x − 2)(x − 3)`.

**A typed power made an expression unreadable.** Converting natural maths to linear form turns `x²`
into `x^(2)`, and the exponent check demanded a bare number, so any expression typed with a power
was refused outright. This is most of what "it is super glitchy" meant.

**Partial fractions could display a wrong answer under a green tick.** Signs were patched with a
search-and-replace over the finished string, which negated a whole fraction while only removing the
minus from the first term of its numerator. `1/((x+1)(x²+1))` was shown as something that comes to
0 at x = 0 instead of 1. The self-check passed because it recombined the internal coefficients and
never looked at the string on screen.

Signs are now built as each piece is made. More importantly, the check reads the **displayed
LaTeX** back and evaluates it at several exact points — it verifies what the student actually sees,
which is the only version of that promise worth making.

Also repaired: the SymPy fallback for Solve never worked (it sent `equations` where the worker reads
`eqs`, so every non-quadratic silently produced nothing), partial fractions fell back to `simplify`
instead of `apart`, `hcf(x², x³)` returned 1, a fractional discriminant displayed `√(15/4)` as
`√15`, three searches had no iteration ceiling and could freeze the window, the complex argument
used raw `toFixed`, and a buggy `isPrime` was dead code and was deleted.

**Why nothing caught any of it.** Every one of these bugs lived on a **boundary** — TypeScript to
Python, a store to a web component, internal numbers to the displayed string. The suite tested each
side and never the join. The new tests are joins: nothing in linear syntax may reach a maths field,
the global shortcut must stand down for a `MATH-FIELD`, the TypeScript operation list is checked
against the Python worker's source *read as text*, every bounded search must finish inside a
timeout so a lost ceiling fails instead of hanging, and 400 generated products are factorised and
multiplied back — each one together with its negation.

238 tests. Verified in the running app rather than only in the suite: the keys, the field surviving
every button, both repaired answers correct with their ticks, no KaTeX errors, and the light theme.

### 0.3.4 — the Sandbox that works · 2026-09-20

The student's list began with the Sandbox: nothing could be grabbed or lifted, Reset "worked
sometimes", walls could not be placed, and objects fell off the floor for ever. An audit of the
whole app (eight readers, sixteen skeptics; about a fifth of what was reported was refuted against
the code) found the causes, and every one of them was a boundary the tests never crossed.

- **Reset never rebuilt the world.** It handed the viewport a new array of the *same* body objects,
  and the viewport compared the objects, found nothing changed, and did nothing. It appeared to
  work only when something else forced a rebuild. Reset is now a counter the viewport watches.
- **Dragging did nothing while paused**, because the grab is a spring applied inside the physics
  step, and paused there is no step. Paused, a drag now *arranges*: any object — a wall, the floor
  — goes where the cursor puts it and the definition follows, so Reset, undo and the file agree.
- **Nothing could be lifted.** The hand was capped at 800 N; the default steel ball weighs 514 kg
  and the wooden crate 151 kg, so neither could even be slid. The cap now scales with weight.
- **A body that had settled could never be grabbed again**: the sleep check sat above the grab.
- **Rotation and spin typed into the panel were silently ignored.** Applied in place now.
- **The floor was 40 m** and there was no edge and no way back. It is 200 m, and anything that
  falls ten metres below it is put back at rest where it started, with a line saying so.
- **The maths grid stood through the sandbox as a vertical wall**, and a stray tool key then a
  click drew maths points over the physics. The sandbox now draws only itself.
- Changing one object's mass no longer teleports every other object back to its start; the run
  survives switching modes; Home frames the objects instead of diving under the floor; Delete,
  Ctrl+Y and Edit ▸ Undo reach the sandbox; the Timeline panel shows the engine's clock; the
  velocity arrows no longer swallow clicks; a cone's mass was four times too big; new objects land
  beside the last one on the floor instead of inside each other; the floor can be added back.
- The panel: Play, Reset, undo and the clock pinned at the top; live values while playing; only
  the dimensions a shape has; the rarely used settings folded away; every number through the
  precision setting; collisions listed; "Send to Lab Data" adds a table instead of replacing them.

251 tests. `tests/sandbox.test.ts` runs the engine with the app's own defaults — air, sleeping, 2D —
which the old harness switched off, and checks lifting a 500 kg ball, grabbing a sleeping one,
placing a static floor, rotation edits, and a rebuild that preserves the untouched bodies.

### 0.3.5 — saved, tied, and twenty-four experiments · 2026-09-20

- **The Sandbox is saved.** Every `.phys` file now carries the bodies, connections, world settings
  and view; older files still open. The autosave protects any unsaved work (it used to skip a
  session with no drawing in it), finishes synchronously as the window closes, and the window asks
  before closing on unsaved work. Restored work stays protected until it is saved.
- **Ropes, pulleys, hinges and welds.** A rope is a chain of light links pinned end to end, tied to
  the surface of each body: it hangs, swings, goes slack and can lie on the floor. A pulley is a
  Pulley object plus Jolt's pulley constraint, so an Atwood machine accelerates at
  (m₂ − m₁)g/(m₁ + m₂) — checked in the tests. A hinge turns about the second object's centre; a
  weld glues two things as they stand.
- **Twenty-four experiments** grouped by topic, each with the number to check: off a cliff, on
  the Moon, terminal velocity, rolling against sliding, sliding to a stop, seesaw, Atwood machine,
  lifting with a pulley, bouncing ball, Galileo's ramps, sticky collision, into a wall, Newton's
  cradle, two trolleys and a rod, rope swing, spring on ice, and the eight from 0.3.0.
- Lab Data has an undo. "Send to Lab Data" adds a table instead of replacing them. An Example asks
  before replacing lab or sandbox work. The mode is called **Geometry** now.

257 tests. `tests/links.test.ts` checks the Atwood acceleration, a hanging rope's length, a hinged
plank tipping, a weld holding against gravity, and that every preset runs a second without anything
falling through the floor.

### 0.3.6 — Geometry: its own drawing, and congruent triangles · 2026-09-20

- **Each mode has its own drawing.** A triangle drawn in Geometry used to appear behind the vectors
  in Vectors mode, and the other way round. Every object now remembers the drawing it was made in
  (`space`) and is shown, listed, labelled and picked only there; the Outliner says how many things
  live in the other drawings and takes you to them. Older files, whose objects have no space, show
  everywhere as before. One file, one undo, nothing moved.
- **Congruent triangles.** Shift-click two triangles and the Measure panel says whether they are
  congruent and by which rule — SSS, SAS, ASA, AAS or RHS — with each equal side and angle written
  out as a numbered reason, the corners matched by name (△ABC ≅ △EFD), equal parts ticked and
  arced on the drawing, and "similar, 2× the size" when only the angles agree. The other way in:
  type three sides and the triangle is drawn.
- **The shaded area no longer outlives its shape.** Deleting a polygon while its area formula was
  being hovered left the hatching on screen for the rest of the session: the mouse-leave that
  cleared it never fires on an element that has just been unmounted. A highlight now names its
  owner and the card clears it on the way out.
- **Esc no longer deletes points you placed earlier.** Cancelling a half-drawn shape removed every
  unused point it had been clicked on, including ones drawn before; only the points the tool made
  go now. Restoring a session enters the saved mode properly (view, tools and drawing), instead of
  only naming it.

262 tests. `tests/congruence.test.ts` covers SSS in a different corner order, a side that differs,
a similar triangle with its ratio, a mirrored right triangle, and drawing from three sides.

## What is in it today

Eight working modes, eight reserved.

| Mode | State | What it does |
| --- | --- | --- |
| Calculator | working | Natural textbook maths, all fifteen fx-991EX modes, and the Pure Math working area |
| Vectors | working | Vector calculator, drawing with live measurements, step-by-step solutions |
| Geometry | working | Sketch recognition, algebraic area, decomposition, constructions |
| Graphing | working | Explicit, implicit, polar, parametric and 3D surfaces, with roots and turning points |
| Sandbox | working | Rigid-body physics on Jolt: collisions, constraints, energy, momentum, recording |
| GPU Lab | working | Millions of charged particles in E and B fields |
| Lab Data | working | Experiment readings, computed columns, curve fitting, uncertainties, CSV |
| Problem Sets | working | Generated practice, hints one step at a time, mistake-naming answer checks |
| Proofs, Mechanics, Instruments, Electricity, Optics, Waves, Heat, Nuclear | reserved | Declared in the mode registry, not yet built |

---

## How the code is arranged

```
src/main/                Electron main process: window, app:// protocol, dialogs, autosave   246 lines
src/preload/             The only bridge to the renderer                                      20 lines
src/renderer/src/
  app/                   Shell: top bar, command bar, modes, panels, shortcuts, theme, tour  1,761
  core/                  Scene state, the dependency evaluator, object factory, types        1,407
  lang/                  The command bar language                                              874
  math/                  Vectors, geometry, shapes, graphs, formatting, CAS client, solvers  3,796
  math/pure/             Exact fractions, polynomials, the step-by-step working engine       2,920
  calc/                  The scientific calculator engine and its store                        878
  lab/                   Lab Data: tables, fitting, chart data, CSV                            687
  sim/                   Jolt physics bridge for the Sandbox                                 1,529
  render/                three.js: viewport, grid, labels, tools, picking, export             3,990
  panels/                One file per dock panel                                              6,316
  ui/                    Shared widgets                                                         432
  workers/               Pyodide + SymPy in a worker                                            153
```

**Adding a mode touches exactly four files** — the mode registry, the panel registry, the app shell,
and the panel component itself. That constraint has held since 0.1 and is why later modes took a day
rather than a week.

**The dependency evaluator** in `core/evaluate.ts` is the heart of the geometry side: a multi-pass
resolver that recomputes the whole scene on every change, retries objects whose parents are not
ready yet, and explains a circular reference in plain English rather than throwing.

---

## How it is tested

209 tests, 13 files, no browser. The rule is that anything worth trusting becomes a pure function
and the function is tested, rather than testing through React.

| File | Tests | What it covers |
| --- | --- | --- |
| `lab.test.ts` | 39 | Readings, computed columns, fitting, uncertainty, CSV parsing |
| `sim.test.ts` | 36 | The physics engine checked against the formulas it should obey |
| `pureWorking.test.ts` | 29 | Every Pure Math step generator |
| `pure.test.ts` | 28 | Exact fractions, monomials, polynomials, factorisation |
| `shapes.test.ts` | 17 | Classification, stroke recognition, decomposition |
| `calc.test.ts` | 17 | The calculator engine |
| `practice.test.ts` | 11 | Problem generation and answer checking |
| `grid.test.ts` | 9 | Grid maths — written *because* of the black-viewport bug |
| `expr.test.ts` | 6 | Expression preprocessing |
| `engine.test.ts` | 6 | Numeric solving, roots, exact forms |
| `formulas.test.ts` | 6 | Shape formula reports |
| `pureRender.test.ts` | 3 | Runs the real KaTeX over every string the generators produce |
| `latex.test.ts` | 2 | LaTeX to linear syntax |

Two of these exist specifically because of bugs that shipped. `sim.test.ts` checks the sandbox
against free fall, elastic and inelastic collisions, and conservation laws — not against itself.
`pureRender.test.ts` exists because an unbalanced brace in generated LaTeX is invisible until it
renders red in the running app.

The packaged build is verified separately from the development build, because they behave
differently. `PHYSLAB_LOG=1` mirrors renderer warnings and a permanent diagnostic trace to the
terminal; `PHYSLAB_SANDBOX=1`, `PHYSLAB_BENCH=<n>`, `PHYSLAB_FORCE_WEBGL=1` and
`PHYSLAB_SWIFTSHADER=1` cover the rest.

---

## What it is built on

All MIT or similarly permissive, all bundled, nothing fetched at runtime.

| | |
| --- | --- |
| Shell | Electron, electron-vite, electron-builder |
| Interface | React, Tailwind, dockview, lucide, zustand, immer |
| Graphics | three.js (WebGPU with a WebGL2 fallback), React Three Fiber, drei |
| Physics | jolt-physics (WebAssembly) |
| Maths | mathjs, MathLive, KaTeX, Pyodide + SymPy in a worker |
| Charts | uPlot |
| Build and test | TypeScript, Vite, Vitest |

Pyodide and SymPy are shipped as local files — the wheels are in the repository — so the algebra
engine works with no network at all.

---

## A note on automated reviews

The project has been reviewed several times by AI tools. Roughly **one third of what they reported
was real**; the rest described code that no longer existed, or misread it. One suggested "fix" would
have crashed every ramp in the Sandbox. Another credited fixes to commits that never touched those
files.

This is recorded because it cost real time, and because the lesson generalises: **verify every
claim against the code before acting on it.** The reviews that did best were the ones that read the
current source rather than reasoning from a description of it.

---

## Where it stands, honestly

**What is true:** ten releases in under a week of concentrated work, 209 passing tests, a packaged
one-click installer that updates over the previous version and keeps the user's settings, and eight
working modes covering a real slice of an 11th-class syllabus.

**What is not yet true:** there are no users yet. It is Windows-only. The installer is unsigned, so
Windows shows a warning on first run. The target audience — students in Pakistan — are phone-first,
and there is no Android build.

That last gap is known and the order was chosen deliberately: finish the desktop version properly,
then port. The core maths, calculator and command-bar code is deliberately kept free of
Electron-only dependencies so that port stays possible.

---

## What comes next

Agreed, in order:

1. **Congruence and equality tools** — are two triangles, lines or angles equal, and by which
   theorem (SSS, SAS, ASA, AAS, RHS), with the reason written out. Two ways in: pick a shape
   already drawn and have its values read off automatically, or type the values and have it drawn.
2. **A third "moonlight" theme** beside dark and light.
3. **Graph plotting with a sound toggle** — hear a curve as it is traced.
4. **A formula library** for maths, browsable and searchable.
5. **3D shapes** — solids with their volume and surface-area formulas, and a 2D shape upgrading
   into its 3D version with a build animation that can be turned off.

Further out: the remaining eight modes, and an Android app with heavy simulations running on a PC
and controlled from the phone.

The long-term goal has not changed since the first day: **one free, offline, no-ads app that does
the whole of school maths and physics, and costs nothing to anyone who uses it.**
