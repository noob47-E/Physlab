# The tutorial: Start here, the spotlight tour and the Welcome screen

How a new student is shown round: the Welcome screen, the six self-ticking "Start here" missions (the owner's pick,
Option B of polish\tour\TOUR-OPTIONS.md), the older 10-step spotlight tour and the shortcut list. Written by polish part
P-TOUR (0.9), from the crew's draft and the hunters' notes, checked against the code.

## File map (under `src/renderer/src/`)
- `app/tour/steps.ts` — `MISSIONS` (id, label, hint, mode, anchor, `done()`), `MISSION_STORES` (the stores whose changes
  re-check the missions), `TOUR` (the spotlight steps), `WELCOME_JOB` / `WELCOME_PROMISE`, `SHORTCUTS`.
- `app/tour/Tour.tsx` — `useTour` (progress, chip, spotlight), `StartHereChip` (top bar), `Missions` (the card),
  `MissionSpotlight` (Show me), `Spotlight` (the tour), `Welcome`, `Shortcuts`, `formatMissionHint` (touch words).
- `panels/practiceMission.ts` — `usePracticeMission`: set when Problem Sets marks an answer (or shows a proof-only
  question's model proof).
- `app/TopBar.tsx` — Help ▸ Take the tour, Start here, Keyboard and mouse; the chip; the tool shelf (`data-tour="tools"`, each tool `tool-<id>`).
- The anchors: `work-it-out` (panels/Maths.tsx), `command` (app/CommandBar.tsx), `tool-sketch` (app/TopBar.tsx `ToolButton`), `play`
  (panels/Sandbox.tsx), `start-practice` (panels/Practice.tsx); the tour's own: `modes`, `search`, `viewport`,
  `labels`, `measure`, `connect`.
- `tests/tour.test.ts` — the "no errors" check; its af-tb1 and af-tb2 blocks — the crew's tests.

## The missions
Every mission ticks only for something the student DID after the missions started counting:
`resetMissionBaseline()` (steps.ts) snapshots the counts when the Tour mounts and on Start over. The counts live in
`core/actionSignals.ts` (`useActionSignals`) and are bumped where the action happens: app/CommandBar.tsx (a line that
made a graph), render/Interaction.tsx (`pressAction`: a Move-tool click on a polygon or circle; a drag by a vector's
head) and sim/store.ts `resetRun` (Reset). `runAsPhysLab(run)` keeps the Welcome tile's worked example from
ticking mission 1: the starting point moves out of reach BEFORE the run, because `usePure.run()`'s own `set()` calls the
mission watcher (`watchMissions`, Tour.tsx) before the next line — moving it after the run ticked mission 1 (B2B-FALSE-01).

| # | Mode | Ticks when | Read |
|---|---|---|---|
| 1 Show your working | calculator | a Pure Maths run after the snapshot gives a working with steps or answers (not a refusal, not the algebra engine's "Working it out…" placeholder) | `usePure` (`runSeq`, `working`) |
| 2 Draw a graph | graphing | the command bar made a graph since the snapshot (not a file, the recovery strip or an Examples lesson) | `typedGraphs` |
| 3 Draw a vector and drag it | vectors | a vector was dragged by its head with the Move tool (typing or retyping one does not count) | `headDrags` |
| 4 Find the area of a shape | shapes | a click or tap on a shape with the Move tool, and a shape is selected (the Sketch tool's own selection is not a click; a tap on the shape already selected is) | `shapeClicks`, the selection |
| 5 Run an experiment | sandbox | the run played in this session, then Reset (`resetRun`, not a preset or file load) and the clock is 0 | `useSandbox`, `resets` |
| 6 Answer a question | problems | an answer was marked, or a proof-only question's model proof shown | `usePracticeMission` |

## Invariants
- Every mission's anchor lives in the file of the screen its mode shows; tests/tour.test.ts fails if one goes missing
  (a missing anchor would silently centre the card). Mission 4 points at the Sketch tool's own button
  (`data-tour="tool-sketch"`, from `ToolButton` in app/TopBar.tsx), not the whole shelf.
- A mission's `done()` may read only stores listed in `MISSION_STORES` (useActionSignals is one); otherwise it ticks late.
- A mission counts what the student does, never what is on screen alone: the screen cannot tell a typed graph from a
  loaded one, a drag from a retyped vector, Reset from a preset load, or show a tap on a shape that was already selected.
- `done()` runs on every change of those stores, many times a second while the Sandbox plays: it must be cheap and must
  not write storage. Nothing about a mission is stored except the ticks themselves.
- Progress is kept under `physlab.startHereDone`, not the key the old Practice tasks used: the old ids calc,
  graph and vector meant other tasks.
- The command bar is at the **top** of the window (App.tsx: TopBar, RecoveryBar, ToolShelf, CommandBar, then the dock).
- Hints are written for a mouse; `formatMissionHint(hint, true)` turns "Press Esc, then click" into "Tap the Move tool,
  then tap", "drag" into "slide your finger" and "click" into "tap". Touch is `(pointer: coarse)` (`isCoarse`), so a
  touchscreen laptop used with a mouse keeps the mouse words. A new hint with another mouse word needs a rule and a test.
- Every "Help ▸ …" a step names is a real Help menu line (tested). The old "Practice tasks" line is gone everywhere
  (Help menu, Ctrl+K, README).
- Nothing in the tutorial names a mode that `readyModes()` does not list.
- The card never blocks: Hide, the X, Esc (only while focus is in the card — mission 4 itself asks for Esc); the chip
  hides itself when all six are done or when hidden; Help ▸ Start here and Ctrl+K "Start here" bring both back; Start
  over clears the ticks and takes a new snapshot. On a touch screen every button is at least 44 px.

## Traps
- The tool shelf is drawn hidden only for a mode whose only tool is Move (layoutMath `shelfMode`); a narrow window shows
  icons only, which is why mission 4 lights up the Sketch button itself.
- Show me lands on a centred card when its button is not on screen: mission 6 during a practice set (Start practice is
  on the setup screen only), mission 1 on a list screen of the Calculator (matrices, statistics) or in BASE-N.
- The Sandbox panel has its own "Start here: …" button (one ball and one floor). Same words, another thing: the owner
  may want one of them renamed.
