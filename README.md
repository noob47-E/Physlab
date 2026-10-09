<img src="Images/icon.png" width="72" align="left" />

# PhysLab

**Maths and physics you can see.** A free, open-source maths and physics lab for students and teachers.
Work a problem step by step, draw it, then test it in a physics sandbox, all on your own computer and fully
offline.

[**⬇ Download PhysLab for Windows (latest release)**](https://github.com/noob47-E/Physlab/releases/latest)

![Start here: six missions that teach PhysLab by doing](docs/screenshots/start-here.png)

## Why PhysLab

Many schools have no science lab, and many students learn maths and physics by memorising the answers in a
guide book. PhysLab puts the working, the picture and the experiment side by side, so you can see *why*
an answer is right:

- **Free, with no hidden cost.** No subscription, no account and no adverts.
- **Fully offline.** No internet is needed, ever.
- **No AI inside the app.** Every answer is worked out by maths, so students use their own thinking.
- **For every learner**, from a first look at shapes to university physics, and for teachers too.

## What you can do

### Calculator: the working, not just the answer
Type maths the way it looks in a book. Press **Work it out** to see every step with the rule that allowed it:
factorising, long division, partial fractions, surds, complex numbers, calculus and more. Try it yourself
first with **Let me try first**, then check one step at a time.

![Solving x² + 4x + 13 = 0 step by step, with complex roots](docs/screenshots/calculator-steps.png)

### Graphing
Functions, circles, inequalities, polar and 3D surfaces, edited in an **Expressions list**. **Visualize** in
the Calculator opens the graph right beside your working.

![Four graphs at once: a parabola, a sine wave, a circle and a shaded inequality](docs/screenshots/graphing.png)

### Vectors
Type vectors as `3i + 4j` or `10 ∠ 30°`, or draw them. Every operation shows its working the textbook way,
and **Draw on graph** draws exactly what the working found.

![Resolving a 10-unit vector at 30° into components, step by step](docs/screenshots/vectors.png)

### Geometry
Sketch a rough shape and it snaps to a perfect one, with its area worked out from a formula. **Decompose**
splits a shape into rectangles and triangles. **Geometry Lego** breaks shapes into pieces you can turn, flip
and fuse back. It can also prove two triangles congruent and name the rule.

![A pentagon with its area by the shoelace formula, its perimeter and every side](docs/screenshots/geometry.png)

### Sandbox: a physics lab on your computer
Real objects that collide, swing and roll. Start from one of **29 experiments** (pendulum, Newton's cradle,
Atwood machine, projectiles…) or build your own with ropes, springs, rods and pulleys. Change gravity to the
Moon or Jupiter, watch energy and momentum live, record readings and send them to **Lab Data** to fit a
graph.

![Newton's cradle running, with live energy and a height-against-time recording](docs/screenshots/sandbox.png)

### Problem Sets
Practice with fresh numbers every time. **Hint** gives one step, not the answer, and **Check my answer** marks
what *you* worked out and names the mistake. Teachers can load their own question sets, including Numbas
`.exam` files.

![A practice question on the components of a force](docs/screenshots/problem-sets.png)

### And more
**Lab Data** (your practical notebook: tables, plots and best-fit lines with ±), **GPU Lab** (millions of
charged particles in electric and magnetic fields), four themes, and **Start here**: six short missions that
teach the app by doing.

## Install

1. Download `PhysLab Setup 0.9.0-preview.4.exe` from the [latest release](https://github.com/noob47-E/Physlab/releases/latest).
2. Run it. Windows may warn you because the installer isn't signed yet: choose **More info → Run anyway**.
3. Updating? Just run the new installer. It replaces your older PhysLab and keeps your settings and saved work.
   Files saved in 0.9 use a new format that older versions cannot open.

This is a **preview**: it works, but you may still find bugs. Please report them in
[Issues](https://github.com/noob47-E/Physlab/issues).

Known limits: Windows only for now (a phone version is planned), and the algebra engine takes a few seconds
to start the first time you use it.

## Coming next

- **Live formulas in the Sandbox:** watch *v = u + gt* fill in with real numbers as the ball falls, with
  **record and rewind** to any moment.
- **A new, more accurate maths engine** built on Rubi and Giac.
- Astrophysics, 3D shapes, more experiments, and a phone version.

## Who makes it

PhysLab is led by a first-year FSc student at Forman Christian College, Lahore, who decides what gets built
and tests it. The code is written by Claude (Anthropic's Claude Opus 5 and Opus 5.5 models) under the student's
direction. The app itself contains no AI.

The team: Taha Kayani (media), Umer Farooq (support), Elis Talya (research with IB and IGCSE students) and
Umme Habiba (testing).

## Support PhysLab

PhysLab is free and will stay free. If it helps you, you can support it on
[Patreon](https://www.patreon.com/cw/Noob47E), or simply share it with a student or a teacher.

## For developers

Electron + React + TypeScript, three.js (WebGPU with a WebGL2 fallback), Jolt physics in WebAssembly, mathjs,
MathLive, and Pyodide/SymPy in a worker.

| What | Command |
| --- | --- |
| Developer mode (live reload) | `npm run dev` |
| Web preview | `npm run web` |
| Unit tests, types and lint | `npm test`, `npm run typecheck`, `npm run lint` |
| Build the installer | `npm run dist` |

Read [AGENTS.md](AGENTS.md) before changing anything: it holds the rules, the architecture and the traps.
[HISTORY.md](HISTORY.md) records every version, and [docs/knowledge](docs/knowledge) explains each mode.
Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[GPL-3.0](LICENSE). See [NOTICE](NOTICE) for the third-party parts.
