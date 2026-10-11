# How to add the common things

Five recipes, each the files to touch in order and the test that proves it. Read AGENTS.md's rules first (every
feature is a mode, a refactor leaves the golden sweeps byte-identical, one reader / one writer / one noise rule).
Written by clean-up part CW13. Each recipe was tried by a fresh session given only this note, which built a sample
(a bar line, a panel, a part type, an engine job); what it had to guess is written in below.

**Paths:** the app's files below are under `src/renderer/src/` (`lang/commands/route.ts` is
`src/renderer/src/lang/commands/route.ts`); `tests/` is at the repo root. TypeScript lists every switch a new kind
must join: after the first step, `npm run typecheck` names the rest (exhaustive switches fail with TS2366).
A golden sweep run plainly may skip its heavy half: run it with `PHYSLAB_GOLDEN_FULL=1` (tests/golden/harness.ts).

## A command in the bar
The bar's code is in `lang/commands/` (`lang/commands.ts` is only the door that re-exports it).
1. Decide which job the line is: a graph (`graph.ts`, `tryGraph`), a solver or an algebra-engine line (`solve.ts`:
   `trySolverCommand`, `tryCas`, `tryPureMath`), a name = something or a geometry command (`route.ts`:
   `tryAssignment`, `tryGeometryCommand`), or a plain expression (`solve.ts`, `evaluatePlain`).
2. Add a `tryYourThing(input: string): boolean` in that file (true when the line was yours, whatever the outcome;
   false to let the next route try) — or `async` returning `Promise<boolean>` when it waits for the algebra engine,
   as `tryCas` does; `runCommand` awaits it. Shared helpers (`parseNode`, `evaluateNode`, `kindOfName`, `logError`) are in
   `common.ts`, which must not import the other parts. A number for the student is written by `fmtPrecise`
   (math/format.ts) at `scene().settings`, never by `toFixed`.
3. Put it in `runCommand`'s order in `route.ts` (Pure Maths, the engine, graphs, assignments, geometry, the vector
   solver, then plain evaluation), before any route that would take the line first, and import it there by name
   (`import { … } from './solve'`).
4. Answer through the log: `scene().pushLog({ input, kind: 'result', text, tex })` — a plain value reads
   `text: '= 5'` — or `logError(input, sentence)`: one plain sentence, from calc/errors.ts when one fits.
5. Offer it: a row in `CATALOG` (app/CommandBar.tsx, the suggestions; its groups are Create, Vectors, Geometry,
   Graphing, Algebra, App) and, if it is a new kind of line, a line in `HELP` (solve.ts).
6. Test: a case in tests/commands.test.ts — the file already mocks the engine worker and the theme, and has
   `fresh()`, `run(...lines)` (returns the last log entry) and `errors()` — and the line at the end of `BAR_COMMANDS`
   (tests/golden/inputs/bar.ts). Regenerate with `PHYSLAB_GOLDEN_UPDATE=1 npx vitest run tests/golden/bar.golden.test.ts`
   and check that the diff is your one new line.

## A mode or a panel
modes.md has the whole picture; the steps:
1. A panel: its component in `panels/`; its title in `PANEL_TITLES` (app/panels.ts — `PANEL_LIST` is made from it);
   a row in `PANEL_GROUPS` there (where a closed panel comes back); its view in `PANEL_VIEWS` (app/App.tsx — a plain
   import for a light panel, `lazy` for anything heavy); and where it docks, `panelHome` (app/layoutMath.ts — the
   right-hand side unless it says otherwise).
2. A mode: an entry in `MODES` (app/modes.ts: id, label, description, `ready`, tools, `panel`, optional
   `centre` / `view` / `examples`). A `ModeId` is stored in saved layouts and files: never rename one. Which drawing
   it shows is `spaceOf` (core/visibility.ts); a mode with no drawing returns null. A mode opens ONE panel of its own
   (`panel`); a second one beside it needs `panelsForMode` (app/layoutMath.ts) and `enterMode` (app/layout.ts) taught
   about it — a code change to discuss, not a setting.
3. Changing what a mode's default dock holds: bump `LAYOUT_VERSION` (app/layoutMath.ts), or saved layouts keep the old
   dock; tests/gcalcLayout.test.ts pins the number, and tests/gcalcReview.test.ts pins Graphing's panels.
4. Not ready yet: `ready: false` shows it under "coming soon"; a mode kept out of a build goes in `HIDDEN_MODES`.
5. Test: `enterMode` with a fake dock (`getPanel`, `addPanel`, `panels`) handed to `setDockApi` — tests/showBeside.test.ts
   shows the pattern (tests/hiddenModes.test.ts mocks `enterMode`, so it cannot); run the `shell` and `settings`
   golden sweeps.

## A question part type
questions.md explains the player; a new kind of answer box touches, in order:
1. The type: a member of the `PQPart` union in questions/pqjson.ts, and its door check in `checkPart` there (a file
   that does not fit is refused with one sentence, never half-read). A type outside `FORMAT1_PART_TYPES` makes the
   file format 2 on its own; no version to edit.
2. Marking: questions/answerKinds.ts `checkFormat2Part` (with `valueOf`, `WRONG` and `CANNOT_MARK` in that file) and
   `format2AnswerTex` for the revealed answer. Read typed numbers with `readNumber` (questions/answerText.ts, with
   the box's named rules) and judge a number part's closeness by its band (`toAbsoluteTol`, questions/parts.ts),
   never a hand-picked floor; an exact kind (a whole number) has no band. The player (`checkPlayedPart`,
   questions/player.ts) and the reveal reach your part through these two without a change.
3. The box: panels/QuestionParts.tsx — its hint (`hintFor`); a typed answer needs no new input.
4. Numbas: `partToNumbas` (questions/numbas/export.ts) — or `null` when the kind does not travel to .exam — and
   `partNotes` there, which tells the teacher what was left out; the importer in questions/numbas/import.ts if it
   can come back.
5. Test: copy the harness of tests/answerKinds.test.ts (its theme mock, `resetGlobals`, `playQuestion`,
   `checkPlayedPart`): a small .pqjson read by `parsePQFile`, marked right and wrong, written back by
   `serializePQFile`; the `questions` golden sweep (with `PHYSLAB_GOLDEN_FULL=1`) stays identical.

## An algebra-engine job
cas.md has the socket; a new job (say `degree`):
1. Its name in `ENGINE_JOBS` (math/engine/types.ts; say in the comment there which request keys it reads) and any new
   request fields in `EngineRequest`, in PhysLab's own spelling (`ln` natural log, ∞, Greek letters spelt out).
2. Which engine answers it: `ENGINE_FOR` (math/engine/index.ts).
3. The SymPy adapter: the job's worker op in `OP` (math/engine/sympy/adapter.ts) and in `CAS_OPS`
   (math/engine/sympy/worker.ts). `sympyRequest` already copies the request's fields into the payload, and the reply
   comes back with no per-job code when it is a value. The op itself is a branch `if op == '…':` in `cas_run`, the
   Python inside workers/cas.worker.ts, before its final "unknown operation": read the expression with
   `P(p['expr'], deg)` and answer `json.dumps(_out(result))` (a value as `{latex, text, numeric}`).
4. `dummyEngine` (math/engine/dummy.ts) refuses any job outside its `jobs` set by itself; answer it there too if the
   conformance case should run without Pyodide.
5. Callers ask through `ask(job, request)` from math/engine (never `cas` directly: tests/guards/engineSocket.test.ts).
6. Test: a case in tests/engine/conformance.ts, in the pattern of its neighbours (skip when `!engine.jobs.has(job)`,
   `engine.ask`, `checkValidResult`, then the value), run by tests/engine/dummy.conformance.test.ts and
   tests/engine/sympy.conformance.test.ts (Pyodide loads in the test); the `cas` golden sweep stays identical.

## A Sandbox body
The Sandbox is to be rebuilt (owner, 2026-10-11): do not add to it in the clean-up, and check with the owner before
building on it. Its code is in `sim/` and panels/Sandbox.tsx, and sandbox.md describes it as it is today.
