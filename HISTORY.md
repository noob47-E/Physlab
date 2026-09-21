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
| Current version | 0.6.1 (2026-09-22) |
| Releases built | 17 |
| Commits | 133 |
| Source | 36,462 lines of TypeScript/TSX across 194 files, plus 1,562 lines of CSS |
| Tests | 1200, across 51 files, all pure logic with no browser |
| Modes | 16 defined, 8 working, 8 reserved for later |
| Dock panels | 15 |
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

The version the student described as *"the thing no other free software has."*

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

### 0.3.7 — Pure Math shows its working for every tool · 2026-09-21

- **Factorising with i reads like a textbook, and is really checked.** It prints (x − 2i)(x + 2i)
  and (x + 1 − 2i)(x + 1 + 2i) instead of (x − [2i])(x − [−2i]); x⁴ + 4, x⁴ + 1, x⁴ − 16 and
  x⁴ + 5x² + 4 factorise; an input that already has i in it is refused with a sentence, not a
  throw. A new exact surd-and-complex layer (`math/pure/cxpoly.ts`) multiplies every complex
  factorisation back and compares it with the question — and the check itself had a bug worth
  recording: a conjugate pair whose parts sat under different roots (x⁴ + 2x² + 4 has roots
  ½√2 ± ½√6·i) formed √2·√6 when multiplied term by term, which a surd cannot hold, and the throw
  was reported as a *failed check* on a correct answer. Each pair is now multiplied straight into
  its real quadratic x² − 2·Re(p)·x + |p|², which only ever squares a part against itself.
- **Every tool sets its verdict.** `Working.checked` replaces the panel's search for the word
  "suspicion". Partial fractions, division, primes, HCF, LCM and Complex had quietly lost their
  tick; each now makes a real comparison (divisor × quotient + remainder against the dividend, the
  primes multiplied back, the table's HCF against Euclid's). The real Factorise offers **Allow i**
  when an irreducible quadratic is left over.
- **Expand shows the distribution table** — the each-times-each grid, the products in a line, then
  the like terms collected — and checks by substitution. (x + 2)² − (x − 2)² and x(x + 1), which
  mathjs had read as a function call, both work. **Solve** does linear equations step by step and
  checks by substitution.
- **Steps are hidden until asked.** The answer is pinned at the top; **Show a step** reveals one,
  **Show all steps** the lot, and "Always show all steps" is remembered. Retrieval beats reading.
  One **Treat as** dropdown, with Auto guessing from the shape of the typing, replaces ten job
  buttons.
- **The calculator rounds the way you asked.** Every number goes through the scene precision
  setting (2 dp by default) instead of a private ten-figure formatter with thirty hand-picked digit
  counts; exact answers are not padded with zeros. **BASE-N is a real integer parser**: 7/2×2 = 6,
  division per operator, multiplication wraps exactly, and no `Function()` is run over typed text.
- A slow SymPy answer for an earlier question can no longer overwrite a later one (each run has an
  id in the store), and a converter refusal reaches the student as a sentence rather than a crash
  in the middle of a render.

`tests/complexFactor.test.ts` pins the exact strings for x² + 4, x² + 1, 4x² + 9, x² + 2x + 5,
2x² + 8, x³ + x, x⁴ − 16 and x⁴ + 4, and multiplies each back over ℂ.

### 0.3.8 — vectors, resolved and added with the drawing to prove it · 2026-09-21

- **The LaTeX bug.** Every LaTeX string in `math/vectorSolver.ts` was a template literal with
  single backslashes, so `\theta` was a tab followed by "heta", and the law-of-cosines and drawing
  steps printed garbage. Every string is double-escaped now, and `tests/vectorSolver.test.ts`
  renders every step of every solver through KaTeX with `throwOnError`, which would have caught it
  on the first day.
- **The cosine-law angle used arcsine**: A = 1 at 0° plus B = 5 at 120° came out at 70.89°
  instead of 109.11°. **A 3-D vector was resolved at its planar heading**: 3î + 4ĵ + 5k̂ reported
  components 4.24 and 5.66. Both are read correctly now; torque has a unit, and angles follow the
  precision and angle settings instead of a locked 4 d.p. in degrees.
- **The calm panel.** The answer card sits straight under the vector cards; six everyday
  operations are visible and nine wait behind **More**; k and q appear only beside the operations
  that use them; a card cannot be called i, j, k or the same as another; and the cards are
  remembered between sessions.
- **Drawings from real components.** Every vector the solver draws is built from its own
  components — the parallelogram style used to draw A + B for a subtraction. A force drawn to a
  stand-in length is a helper with its true value written at its head, so a 1.6×10⁻¹⁹ N magnetic
  force is never reported as |F| = 1 u. The layout of a solution's drawing is pure data
  (`planDrawing()`), and tested.
- The converter reads pasted unicode (î ĵ k̂, −, x², ½), reads pmatrix, bmatrix and vmatrix, and
  refuses ± with a plain sentence instead of silently choosing +. Practice grades in degrees
  whatever the calculator was left in.

### 0.3.9 — the Sandbox is calmer, and pulleys and ropes pull the way real ones do · 2026-09-21

- **Five things about an object, the rest folded.** The inspector shows Name, Material, Mass,
  Position and Velocity; the other twenty controls sit under Appearance, Physics and Advanced
  folds that remember whether they were open, and the panel draws its rows from one table so a
  control cannot go missing. Shift-click chooses a second body as the partner for a join; the
  floor is never a partner.
- **Classroom masses.** A new ball weighs 1 kg and a crate 2 kg instead of steel-by-volume at
  514 kg; every preset's moving parts weigh 0.5–10 kg. **Start here** loads one ball and one floor
  at the top of the list — twenty-five experiments now.
- **One transport.** The Sandbox panel's sticky bar has Play, Reset and Step; the Timeline in
  Sandbox mode is only the clock. Space still plays and pauses.
- **Ropes hold and pulleys turn.** A rope's links weigh a tenth of the lightest load and never
  less than a twentieth (`ropeLinkMass`): a two-tonne bob used to sag a metre and a half. The rim
  points of a pulley follow the wheel's rotation (`sim/rotate.ts`, shared with the engine), so a
  wheel turned to face another way hands the rope its rim, not its face.

`tests/sandboxStore.test.ts` drives the store under fake timers — add, select, link, snapshot,
load, reset — and `tests/links.test.ts` gains the rotated pulley, the rope-mass rule and the
preset masses.

### 0.3.10 — one look for the whole app, in plain words · 2026-09-21

- **The window fits a laptop.** It is sized to the work area with a 960×600 minimum (1100 used to
  force it wider than a 1366×768 screen at 125 % scaling); it remembers its size and its zoom, and
  Chromium alone owns that zoom — a second copy in the renderer is why Ctrl+0 used to be undone at
  the next launch. An application menu owns reload (asks first), F11, F12 and Ctrl+= / Ctrl+− /
  Ctrl+0.
- **The top bar folds.** It measures itself: under 1500 px the mode tabs become a Mode menu,
  under 1150 px Search and settings are icons only; the tool shelf goes icon-only when its labels
  will not fit. Escape closes a menu and nothing else; 2D/3D moved from Tab to **3** so Tab
  reaches the controls again.
- **A mode opens three panels, not sixteen** — the drawing, the mode's own panel and Examples
  where it has lessons — with columns as fractions of the window. The saved layout is versioned
  and rebuilt when the schema or the window class changes, never squeezed, and **Reset the panel
  layout really resets**: it used to be undone by the save on the way out.
- **Plain words.** The command bar greets a student with one line instead of a wall of syntax;
  the CAS badge is a quiet dot that speaks only when it has something to say; the Outliner's empty
  state is a short list in words; an Example names itself when it asks about unsaved work; the
  grid numbers its axes in the drawing's unit and scale.
- **One type scale and one set of colours.** A 13 px base with six named text steps (fine to
  display) replaces the ad-hoc pixel sizes; `--font-ui` and `--font-math` replace the inline
  Cambria styles; the grey and white utilities and the hex values in the panels, the grid and the highlights
  become tokens that resolve through the theme. Hover states that were white on light grey —
  invisible in the light theme — read in both. `tests/colours.test.ts` arrived here, scanning
  every renderer file for a hex colour, a palette utility or a pixel size, with an allow-list of
  the files the other phases were still cleaning; toggling the theme no longer wipes a graph's
  recorded data.

`tests/layout.test.ts` pins the pure layout decisions; `tests/casStatus.test.ts` the exact words
of the badge; `tests/quickExamples.test.ts` that the starter lines work in the order they are
offered.

### 0.5.0 — tests as boundaries · 2026-09-21

The 0.3.3 lesson, applied to the whole app: every bug that had shipped lived on a boundary the
tests never crossed. This release crosses them — files, the command bar, the stores, the colours —
and fixes what the crossing turned up.

- **Every saved file goes through one door.** `core/migrate.ts` owns the `.phys` format. It checks
  the shape one level down (a lab table with no columns, a body with no position and links that
  were a word used to get into the stores and crash the next render, after the old scene was
  already gone), refuses a bad or newer file with a sentence, and steps a format-1 file up to
  format 2 by stamping each object with the drawing it belongs to. `loadScene` calls it before
  touching any store, so a failed open leaves everything as it was. File ▸ Open says "This file
  cannot be read…" for a half-copied file instead of "SyntaxError: Unexpected end of JSON input";
  a failed save, which used to be silent, says "Could not save: … try Save As to another folder".
  The autosave compares a session with what File ▸ New gives, block by block, so work in any
  panel is protected, and the recovery strip names only what differs. `tests/persistence.test.ts`
  round-trips objects, lab and sandbox, migrates each format, and feeds in fourteen bad files that
  must leave every store untouched.
- **The command bar is tested line by line against its own help.** Every example in the help text
  runs through `runCommand` with KaTeX over the answer. It found: `A × B` printed a bare array
  with no steps and `C = A × B` refused with "not a number"; `R = A + B` never had a Show steps
  button; every Pure Math `solve` line rendered red (its x₁ label sat inside `\text{}`);
  `divide(x^3-1, x-1)` answered *I don't know "x"*; the hidden helper took the name C, so the
  help's own next line silently replaced it. Then, from the review: the evaluator's × refused
  number × vector, so `2 × A` failed in the Properties field. It scales the vector now, and a
  definition is stored exactly as typed. The bar answers in the student's precision.
- **The eight untested number-makers.** Points along and around a shape, decomposition, energy,
  volume and frontal area, chart series, the answer checker and the number formatter got textbook
  tests. Writing them found: a point collapsed onto its vertex when both arms stood along z; a
  cone's moment of inertia used its base width as its radius (four times too much spin energy) and
  a pulley got the box formula; a capsule's frontal area left off its two ends; a huge negative
  number wore a hyphen while everything else wears a minus; a third-quadrant answer written as
  216.87° fell through to "Not quite"; 3 s.f. of 2.5×10⁻⁷ lost its zero; a 1.6×10⁻¹⁹ N answer
  was revealed as "0 N"; "0,500" read as 500 and was told it had the wrong power of ten.
- **The store and the evaluator have tests.** Undo restores the dependency graph and the order;
  renaming reaches every formula — but not through a shadowed name: renaming the shadowed "a"
  used to turn b = a + 1 into b = c + 1 and change b's value. The Properties panel kept a private
  copy of the rename, so the fix never ran in the app until the panel was made to rename through
  the store; a test now reads the panel to keep it that way. A self-referencing formula says
  "a needs itself".
- **The colour guard is empty.** `tests/colours.test.ts` scans every renderer file with no
  allow-list at all. The three.js views' last hex values — the selection halo, the graph's key
  points, the wireframe, the fill light, the tool previews — are tokens read through
  `themeColor()`, and `tests/themeTokens.test.ts` checks that every token the renderer asks for is
  declared in *both* theme blocks. The block at the end of `styles.css` that re-coloured the light
  theme had nothing left to remap, so the light theme runs without overrides.
- **Lint.** ESLint (typescript-eslint and react-hooks) with `npm run lint` at 0 errors; every
  suppression carries its reason after `--`, and a suppression whose rule no longer fires is what
  fails. It found two real omissions: the graph resampler ignored the view height, and the
  calculator's CMPLX hint never appeared after switching mode.
- **The Sandbox, once more.** The pulley rim follows the axle — rotation [90, 0, 90] on a
  default pulley sent the rope out of the top and bottom and pulled both Atwood masses towards the
  vertical; a wheel dragged while paused re-lays its rope, because the constraint bakes the rim in
  when the link is made; the viewport strip no longer carries a second Play and Reset; "Drop a
  ball" starts the ball's *underside* at the quoted height, so the clock reads 1.01 s as promised
  (the centre used to, and the ball landed 3 % early); the seesaw plank is long enough to drag the
  ball out to the 3 m the text asks for.
- Smaller, each from a review: opening the Calculator no longer sends the algebra engine a real
  request to warm it up (the strip read "Working…" with a Stop button for the whole load, and a
  slow first launch hit the 30-second timer and killed the half-loaded worker); one rule decides
  which modes have a 2D/3D switch, so the 3 key leaves the GPU Lab alone; every algebra call
  takes its degree flag from one decision — in DEG mode `solve(sin(x) = 0.5)` answered 30 from
  the bar and π/6 from the Working panel; Lab Data and Practice answer in the student's precision;
  x⁴ − 6x² + 1 factorises (the biquadratic split tried one sign only); x⁴ + 1 gets its Allow i;
  "Let me try first" takes the focus only when asked for and hands editing keys back to the
  field; 9.99999×10⁻²⁰ N no longer reads "10×10⁻¹⁹ N"; τ keeps its name on the drawing; v₁ − v₂
  renders; a projection onto the zero vector is said plainly.

784 tests across 39 files. `vitest.config.ts` keeps the run to `tests/**` (the runner used to walk
into `node_modules`, the packaged build and any sibling worktree), `tests/helpers/repo.ts` reads
source files from the repository root wherever the tests were started, and
`tests/helpers/globals.ts` puts the notation and angle mode back before each test that touches
them.

**Still open**, verified against the code at this release: the command bar's argument splitter does
not group `<…>`, so `cross(A, <1, 0>)` errors and `3 N × A` takes `N` alone as the left side of
the ×; kind inference does not know that × of two vectors is a vector; the first-run lab table is
called "Free fall" while a blank file's is "Experiment", so an untouched first session with a
dirty flag still counts as work; `vitest.config.ts` is outside `npm run typecheck`; `app/TopBar.tsx`
keeps a dead re-export of `enterMode` that nothing imports; a reviewer saw Geometry's point
letters stay visible over the Sandbox after an autosave was restored, not yet traced; `fmtPrecise` writes anything below 10⁻¹²
as 0 on purpose (a noise floor for dragged points — known answers go through `fmtSci`, which has
none); and there is no preview port for a worktree, where vite refuses the KaTeX and MathLive
fonts outside its allowed folders.

### 0.6.0 — Moonlight, one Maths screen, a viewport that behaves, and a Sandbox worth trusting · 2026-09-21

Five phases in parallel worktrees (theme, the calculator, the viewport, the Sandbox, hover cards),
merged in order and then given a five-area review of their own. 26 files touched in the version
commit alone; the whole run is 125 files, +8,309/−1,760 across the phase and review-fix commits.

- **Moonlight, a third theme, on by default for a fresh install.** It sits beside Dark and Light —
  same cycle, same Settings list, same `THEMES` order — and a fresh install now opens in it rather
  than Dark. `color-scheme` still only ever says `light` or `dark`; Moonlight's block says `dark`,
  same as the ordinary Dark theme, so native scrollbars and controls behave. The View menu's grid
  rows and the Settings segment both carry a tick (`sc`) for whichever grid or theme is actually
  showing, which they did not before.
- **One Maths screen replaces the handheld-style calculator.** The buttons-and-tiny-LCD, Casio-101
  look is gone: a single natural-maths field with a popup keypad that opens under the field and
  stays open for the next click, physical typing answers exactly like the keypad, and the field
  keeps up with the student rather than the other way round. `MathLive` no longer sits in the
  start-up bundle for a layout with no maths field open — `app/contextActions.ts` was found to
  still import `panels/VectorCalc.tsx` eagerly, pulling it back in for a Sandbox-only layout, and
  was fixed to import `addVectorFromScene` from `panels/vectorCalcStore` instead. A plain
  arithmetic sum is refused in one sentence naming a real job a calculator app already does,
  rather than working it out.
  - **Render work per keystroke, React Profiler `actualDuration` over 15 inserted characters of
    `2+3*4+5-6/7+8*9`, same dev build:** before, 15 commits / 211.96 ms total = 14.1 ms per
    keystroke, re-rendering the whole Calculator panel (`ScientificMode` + 3 keypads +
    `PureMathRow` + `MathInput` + history, 50 `.key` buttons). After, 16 commits / 4.76 ms total =
    0.30 ms per keystroke, re-rendering 2 components (`Expression` + `MathInput`) — about 47×
    less render work.
  - **`evaluateInput` timing in the browser (20-run average, 2 d.p.):** `\sqrt{2}+\frac{1}{3}` →
    0.19 ms (answers `1.75`); `\int_0^1 x^2 dx` → 0.28 ms (answers `0.33`).
  - **`solveNumeric`'s new cap (vitest, 5-run averages, before = main's engine):** a
    no-root `x^2 + 1 = 0` went from 19.6 ms to 5.8 ms; a far root (`x^3 = 125000000000`, root
    5000) from 15.1 ms to 6.1 ms, still finding the root; `cos(x) = x` unchanged at 0.2 ms
    (Newton's method never runs the capped search); `integral(x^2, 0, 1)` from 0.5 ms to 0.3 ms;
    a bare `solveNumeric(x²+1)` from 0.5 ms to 0.1 ms. In the browser, `x^{2}=-1` now answers "No
    solution I can find near 0" in 7 ms end to end, instead of searching forever.
- **The viewport behaves the way its own menus and tools say it does.** A point can be dropped on
  the crossing of two lines and follows them if they move — `intersectionsOf`'s own order is what
  both the click target and the stored point's `index` read, so they now agree. Angle marks can be
  hidden. The grid comes as lines, dots (drawn as sized quads so WebGPU shows them), fine, or
  paper. A box drag selects several objects at once, and one command clears the whole drawing —
  refusing without a word if there is nothing to clear. A right-drag pans the view instead of
  opening the context menu; the Move tool card, the tour and the shortcuts list all teach
  Space+drag (or right-drag) to pan, not the old left-drag-empty-space. Point letters read against
  the Light theme now too.
- **The Sandbox is worth trusting.** Send to Lab Data lands the capture on a new table with
  `appendTable`, not `setTables` — the earlier version would have replaced every table the student
  already had. A guided Connect flow joins any two objects the student has already picked, with
  link-kind cards that speak to that specific pair rather than a generic list. Experiments are
  grouped, and every preset's sentence was audited against what the engine actually produces:
  four new presets were added, and the audit's numbers are below. A paused drag on a pulley now
  moves its partner the other way, matching the wheel; the Energy section reports the whole
  system's momentum, not one body's; Galileo's presets quote the height the panel itself shows.
  - **Rope length in the engine (2 kg bob, beam at y = 5, exact against `5 − 0.075 − L − 0.18`):**
    L = 2.245 hangs at 2.500 (before: 2.468); L = 1.5 at 3.245 (before: 2.467); L = 3.5 at 1.245
    (before: 1.074).
  - **Ramp max speed:** 4.46 m/s against a formula of 4.59 — 2.4% lost rolling over 5 m plus 6.6%
    at the floor corner (same with `collisionSteps: 4`).
  - **Friction stop distance:** 4.56 m against a formula of 4.59, after the floor's own `mu` was
    fixed to match the preset's text (was 3.22 m before the fix).
  - **Collision after-speeds:** −2.125 / 2.375 m/s against a formula of −2.125 / 2.375; the sticky
    case settles at 1.000 / 1.000.
  - **Newton's cradle, ball 5 against ball 1:** 0.39 touching; 0.36 at a 2 mm gap; 0.34 at 1 cm;
    0.43 at 3 mm with `collisionSteps: 4`; 0.96 at 6 mm with `collisionSteps: 8` — the setting the
    preset uses.
  - **Pendulum period:** 2.850 s at 15° against a formula of 2.838 s; 3.0 s at 53°.
  - **Swingbridge period:** ropes run 2.72–2.75 s, strings 2.85–2.87 s, against a formula of
    2.84 s — kept as "Bob on two strings" rather than the plan's rope version.
  - **Spring period:** 0.617–0.633 s against a formula of 0.628 s; the ice-floor spring preset
    runs 1.25–1.267 s after its own post-launch fix (formula 1.257 s; it was 1.33–1.5 s before).
  - **Galileo's ramp:** the original climbs 0.66 m of 2.2 m (30%); steel ramps with rolling reach
    64–77%; with the Up ramp sunk 3 cm into the floor it reaches about 0.95 of 1.1 m (85%).
  - **Terminal velocity:** 17.3 m/s from a 30 m drop (88% of 19.6 m/s); 18.6 m/s from 45 m (95%).
  - **Tug of war at 1 s:** the crate at 2.51 m/s, the puller at 1.65 m/s, `2·v_crate + 4·v_puller`
    = 11.6 kg·m/s (a rope dragging on ice leaks about 0.3 N).
  - **Seesaw:** balanced with a light ball at 3 m, max tilt 0.00° over 3 s; unbalanced, it tips to
    12° in 1 s.
- **Every tool, shape and link teaches itself.** Resting the pointer on a tool, shape or link
  button for 500 ms opens a card beside it with a looping picture and one sentence naming the
  gesture; the loop runs every 2.5 s, the card is 15rem wide and sits under any open menu
  (`z-index: 40` against menus' 50). The registry holds 36 cards (20 tools, 9 add-shape buttons, 7
  link kinds); 34 are placeholders today and 2 are drawn for real.

`npm test`: 46 files, 1101 tests passed (baseline going into this phase set was 39 files / 789).
`npm run typecheck`: clean. `npm run lint`: 0 errors, 29 warnings, none of them new.

**Still open**, verified against the code at this release: Visualize of an x-expression typed in
Calculator mode brings the Viewport tab forward but
draws nothing, because `core/visibility.ts` tags Calculator's own space `'vectors'` while the
Builder stamps graphs `'graphing'` (pre-existing since 0.3.6; vectors, points and complex numbers
still show); pressing ▶ from a filled lower limit of an integral, sum or product visits the body
before the upper limit, because MathLive's own placeholder order visits superscript before
subscript (unchanged since 0.5.0); the keypad's tabs deliberately keep digits pinned to the left of
the popover rather than following the plan's own tab order; a `THREE.Points` vertex is one device
pixel on WebGPU, so a later feature that needs a sized point must draw a quad or sprite instead;
marquee selection is 2D-only, because OrbitControls claims the left mouse button in the 3D view; and
the Settings theme list reads Moonlight / Dark / Light, matching the View menu and the cycle order,
rather than the plan's literal Dark / Light / Moonlight ordering (pinned by a cycle-order test).

### 0.6.1 — 2026-09-22

Five small tracks, each on its own files, one review pass per track plus a themes-focused review
across all four themes.

- **The Vector panel opens empty and follows what a student draws.** It no longer starts with a
  fixed A/B pair nobody asked for: one entry style plus an "Add vector" button, and a vector drawn
  on the graph is auto-selected in the panel instead of leaving the student to find it in a list.
  A blank, untouched card shows a dim hint rather than turning red on sight — it only turns red
  once an operation actually tries to read it.
- **Flat 2-D arrows with an Oklab resultant.** The old `ConeGeometry` head is gone; arrows now
  carry a zoom-invariant flat triangle head (12 px, 25°) on the same world-per-pixel maths, in
  calmer colours, and a resultant vector is coloured as the Oklab mix of its parents (chroma
  ×1.15) rather than a plain arithmetic average — a new `render/colourMix.ts` does the sRGB↔Oklab
  conversion, fed by `themeColor()` at run time so no hex literal sneaks in (`tests/colours.test.ts`
  stays empty). Geometry points are smaller, with their letters placed clear of the point and of
  each other.
- **The axes toggle lives everywhere it should.** "Hide axes" used to be buried; it now sits in
  the grid picker, the right-click context menu and the search palette, all reading the same
  `settings.showAxes`.
- **Bug: deleting a shape used to leave its sides (and anything built on them) behind.** The
  Triangle and Polygon tools draw a shape as a polygon plus one segment per side, and a side
  depends on its corner points, not on the polygon — so `dependentsOf` never walked from the
  shape to its own sides, and deleting a triangle left its three sides on screen, indistinguishable
  from the triangle just deleted. A new `doomedBy` (`core/store.ts`) walks named objects, their
  real dependents and a doomed polygon's sides together, catching a second shape doomed along the
  way (a point on side BC that is also a corner of another triangle) rather than working from a
  snapshot taken before the loop started. The corner points themselves stay, matching GeoGebra's
  convention.
- **Sandbox experiments are searchable by tag.** Typing a word like "gravity" or "rope pulley"
  narrows the picker to matching presets instead of leaving the student to scroll all of them; a
  whole-word match wins over a word it merely begins ("moments" finds the seesaw alone, not the
  nine momentum experiments too), and a half-typed word still falls back to whatever it is heading
  toward.
- **Calculator steps say what a stage is for before showing how it is done.** Every generator's
  heading is now a plain-words subgoal sentence with its own line, not a LaTeX fragment doing
  double duty — a two-digit power in a substitution heading now reads x¹⁰ rather than x¹0, a
  fractional quotient term is spoken as (1/2)x² rather than 1/2x², and the remainder-theorem check
  sits under its own heading instead of inside "Set out the long division".
- **Moonlight Gold, a fourth theme.** A second night theme beside the navy Moonlight: warm
  charcoal backgrounds, a gold accent, cream ink, amber warn, gold-tinted grid axes and labels.
  Every piece of text on it clears 4.5:1 against the surface it sits on; `--on-accent` is dark ink
  because the accent itself is light. Moonlight stays the default on a fresh install.
  `tests/themeTokens.test.ts` now checks all four theme blocks declare the same tokens, not two.

`npm test`: 51 files, 1200 tests passed (baseline going into this phase set was 46 files / 1101).
`npm run typecheck`: clean. `npm run lint`: 0 errors, 29 warnings, none of them new.

**Still open**, honestly:
- Point-label boxes wider than one letter (a selected point shows "C(13, −8)") can still straddle
  the point, as in 0.6.0 — `pickLabelOffset` sizes for the nominal one-letter chip; a real fix
  needs `render/Labels.tsx` to anchor by the label's corner.
- No screenshots of the themes for the vector/point work — every check was done through the DOM
  and R3F state, because the shared browser pane never composited for this session.
- The arrow palette itself is still eight hex literals in `PALETTE.vector`
  (`src/renderer/src/core/naming.ts:83`), stored on the object and saved in the `.phys` file; on
  Light the palette arrows sit near 2.1–2.4:1 against the canvas. A themed fix means `--vec-1`
  through `--vec-8` in every theme block, `nextColor()` through `themeColor()`, and a file-format
  change to store a token rather than a colour — left for a dedicated pass.
- Deleting a shape takes its sides but leaves its corner points, matching GeoGebra's convention;
  if "remove a whole object" should take the points too, `doomedBy` in `core/store.ts` is the one
  place to extend (mirroring `dropUnusedPicks` in `render/tools.ts`).
- A plot typed in the command bar from Vectors mode is invisible, because `core/factory.ts:46`
  stamps every graph with space `'graphing'` and nothing switches the app there — a curve typed
  from Vectors or Geometry now switches the app to Graphing and says so, rather than drawing where
  nobody is looking, but the underlying space-stamping stays as it was.
- The viewport row shows two toggle styles side by side (the Axes badge vs. the grid/snap
  icon-button toggles) — a one-line change to render Axes as an icon-button with an `on` state,
  not done this round.
- `hovered` in `core/store.ts` can keep a deleted object's id with no visual effect, and
  `GraphView` never deletes its `labelAnchors` entry on unmount — a small leak, not visible to a
  student.
- A pre-existing contrast shortfall, pinned by expiring exemptions in `tests/contrast.test.ts`:
  Dark `--on-accent` #ffffff on `--accent` #4f8cff (3.22:1); Dark `--text-dim` #9a9ea8 on `--bg-4`
  #35363c (4.49:1); Light `--warn` #b26a00 on `bg-0..bg-3` (3.65/3.95/4.24/3.52); Light `--good`
  #1f8a4c on `bg-0..bg-3` (3.77/4.08/4.38/3.63). Each exemption fails the day its token is fixed.
- The Moonlight Gold selection glow stays gold rather than palette-aware, a declined fix: drawn
  objects take `PALETTE` colours (blue first), and a gold halo beats ice blue against every
  palette colour but the fourth.
- The Electron window opening in Moonlight Gold after a restart (the main-process `theme.json`
  path) was not verified live — `src/main/index.ts` accepts any `#rrggbb` and the path was
  re-read, but this run could not launch Electron itself to confirm.
- texToPlain still writes a fractional coefficient as "1/2x²" in a divide head — a texToPlain
  limitation shared by every generator, not fixed this round.
- One pre-existing flaky test: `tests/maths.test.ts` "loads the maths panels lazily…" timed out
  once under machine contention during this work; it passes in isolation and passed on every merge
  run.

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
src/main/                Electron main process: window, app:// protocol, dialogs, autosave   384 lines
src/preload/             The only bridge to the renderer                                      32 lines
src/renderer/src/
  app/                   Shell: top bar, command bar, modes, panels, shortcuts, theme, tour  3,007
  core/                  Scene state, the dependency evaluator, object factory, types        1,808
  lang/                  The command bar language                                            1,021
  math/                  Vectors, geometry, shapes, graphs, formatting, CAS client, solvers  4,711
  math/pure/             Exact fractions, polynomials, the step-by-step working engine       4,480
  calc/                  The scientific calculator engine and its store                      1,135
  lab/                   Lab Data: tables, fitting, chart data, CSV                            715
  sim/                   Jolt physics bridge for the Sandbox                                 2,483
  render/                three.js: viewport, grid, labels, tools, picking, export             4,486
  panels/                One file per dock panel                                              7,145
  ui/                    Shared widgets                                                         565
  workers/               Pyodide + SymPy in a worker                                            162
```

**Adding a mode touches exactly four files** — the mode registry, the panel registry, the app shell,
and the panel component itself. That constraint has held since 0.1 and is why later modes took a day
rather than a week.

**The dependency evaluator** in `core/evaluate.ts` is the heart of the geometry side: a multi-pass
resolver that recomputes the whole scene on every change, retries objects whose parents are not
ready yet, and explains a circular reference in plain English rather than throwing.

---

## How it is tested

784 tests, 39 files, no browser. The rule is that anything worth trusting becomes a pure function
and the function is tested, rather than testing through React. Since 0.5.0 the second rule is
that a test should cross a *boundary* — a file into a store, a typed line into an answer, a
generated string into KaTeX, a source file into the colour guard — because that is where every
bug that shipped had been hiding.

| File | Tests | What it covers |
| --- | --- | --- |
| `commands.test.ts` | 79 | Every line of the command bar's own help, run and rendered |
| `vectorSolver.test.ts` | 61 | Textbook values, and every step of every solver through KaTeX |
| `pureWorking.test.ts` | 54 | Every Pure Math step generator |
| `persistence.test.ts` | 52 | File round trips, migration per format, fourteen bad files that must change nothing |
| `lab.test.ts` | 40 | Readings, computed columns, fitting, uncertainty, CSV parsing |
| `sim.test.ts` | 37 | The physics engine checked against the formulas it should obey |
| `calc.test.ts` | 34 | The calculator engine, its modes and its precision |
| `complexFactor.test.ts` | 32 | Exact complex and surd factorisations, multiplied back over ℂ |
| `layout.test.ts` | 30 | The window, the top bar's folding and the per-mode layout decisions |
| `pure.test.ts` | 29 | Exact fractions, monomials, polynomials, factorisation |
| `checkAnswer.test.ts` | 23 | The mistake-naming answer checker, quadrant by quadrant |
| `contracts.test.ts` | 22 | TypeScript against the Python worker's source, and other joins read as text |
| `format.test.ts` | 22 | Precision, significant figures, scientific form, minus signs |
| `sandbox.test.ts` | 20 | The engine with the app's own defaults: lifting, grabbing, placing, rebuilding |
| `evaluate.test.ts` | 19 | Dependency ordering, loops, failures that say why |
| `shapes.test.ts` | 17 | Classification, stroke recognition |
| `materials.test.ts` | 16 | Shape volumes and frontal areas, sign-flip invariant |
| `setMeasure.test.ts` | 16 | Points placed at a length or an angle |
| `grid.test.ts` | 15 | Grid maths — written *because* of the black-viewport bug — and tick labels |
| `decompose.test.ts` | 13 | A real tiling check: every part inside the shape, outside every other |
| `energy.test.ts` | 13 | Kinetic, potential and rotational energy per shape |
| `links.test.ts` | 13 | Atwood, hanging rope, hinge, weld, rotated pulley, every preset for a second |
| `sceneStore.test.ts` | 13 | Undo restores the dependency graph; rename reaches every formula |
| `space.test.ts` | 13 | An object shows in the drawing it was made in, an untagged one everywhere |
| `chartData.test.ts` | 12 | Chart series and a hand-worked least-squares line |
| `practice.test.ts` | 12 | Problem generation and grading |
| `sandboxStore.test.ts` | 12 | The Sandbox store under fake timers |
| `themeSweep.test.ts` | 9 | The type scale, and when the Working panel invites the student to try first |
| `colours.test.ts` | 8 | No hex, palette utility or pixel size anywhere in the renderer; allow-lists empty |
| `expr.test.ts` | 7 | Expression preprocessing |
| `formulas.test.ts` | 7 | Shape formula reports |
| `engine.test.ts` | 6 | Numeric solving, roots, exact forms |
| `casStatus.test.ts` | 5 | The exact words of the algebra badge |
| `congruence.test.ts` | 5 | SSS, SAS, a mirrored right triangle, similar with its ratio |
| `themeTokens.test.ts` | 5 | Every token asked for is declared, in both themes |
| `latex.test.ts` | 4 | LaTeX to linear syntax, including pasted unicode and matrices |
| `pureRender.test.ts` | 3 | Runs the real KaTeX over every string the generators produce |
| `pureStore.test.ts` | 3 | The store's guard against a generator or converter that throws |
| `quickExamples.test.ts` | 3 | The starter lines work in the order they are offered |

Several of these exist specifically because of bugs that shipped. `sim.test.ts` checks the sandbox
against free fall, elastic and inelastic collisions, and conservation laws — not against itself.
`pureRender.test.ts` and the KaTeX pass in `vectorSolver.test.ts` exist because an unbalanced brace
or a lost backslash in generated LaTeX is invisible until it renders red in the running app.
`persistence.test.ts` exists because a damaged file used to get into the stores after the old scene
was already gone. `colours.test.ts` and `themeTokens.test.ts` exist because the light theme was
broken more than once by a hardcoded colour.

`npm run lint` (ESLint with typescript-eslint and react-hooks) must report 0 errors, and every
suppression in the code carries its reason.

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

**What is true:** fifteen installers in eight days of concentrated work, 784 passing tests that cross
the boundaries the earlier bugs hid on, a lint that runs clean, a packaged one-click installer that
updates over the previous version and keeps the user's settings, and eight working modes covering a
real slice of school maths and physics.

**What is not yet true:** there are no users yet. It is Windows-only. The installer is unsigned, so
Windows shows a warning on first run. The target audience — students in Pakistan — are phone-first,
and there is no Android build.

That last gap is known and the order was chosen deliberately: finish the desktop version properly,
then port. The core maths, calculator and command-bar code is deliberately kept free of
Electron-only dependencies so that port stays possible.

---

## What comes next

Agreed, in order:

1. **A UI/UX redesign**, after the talk. (Moonlight, which headed this list, shipped in 0.6.0,
   alongside the Maths screen, the viewport work and the Sandbox trust work it was bundled with.)
2. **Graph plotting with a sound toggle** — hear a curve as it is traced.
3. **A formula library** for maths, browsable and searchable.
4. **3D shapes** — solids with their volume and surface-area formulas, and a 2D shape upgrading
   into its 3D version with a build animation that can be turned off.

Further out: the remaining eight modes, and an Android app with heavy simulations running on a PC
and controlled from the phone.

The long-term goal has not changed since the first day: **one free, offline, no-ads app that does
the whole of school maths and physics, and costs nothing to anyone who uses it.**
