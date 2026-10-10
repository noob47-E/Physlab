# The app shell: names, menus, shortcuts and panels

How object names are renamed, how the top bar's settings boxes, Ctrl+K, tool keys, Backspace and the window
shortcuts decide what to do, and how the Graphs, slider and timeline panels keep their state. Written by polish
part P-FIX-SHELL (0.9) and brought up to date by CW8c (shell tools and the top bar). Modes and the hidden-mode
switch are in `modes.md`; number formatting in `numbers.md`.

## File map (under `src/renderer/src/`)
- `core/naming.ts` — `isValidName` (the name character class: letters, Greek, digits, `_`, `'` and the primes ′ ″ ‴ ⁗),
  RESERVED words.
- `core/rename.ts` — `renameInObjects`: renames an object and every formula that uses its name.
- `core/evaluate.ts` — evaluates the scene by name (a hub: run the full suite after any change).
- `app/layout.ts` — `enterMode`: tool shelf, view, space, panels; resets the tool on every mode change.
- `app/toolKeys.ts` — `toolForKey`: which tool a letter key picks in the current mode.
- `app/shortcuts.ts` — the window's keydown handler, `shortcutKeyDown(e)` (exported, module level), and
  `useShortcuts`, which only adds and removes that handler on the window and keeps its own key-up (Space plays or
  pauses) and blur (resets Space) listeners.
- `render/tools.ts` — the drawing tools' picks: `undoLastPick` (Backspace step back), `cancelTool` (Esc),
  `finishTool` (Enter), `dropUnusedPicks` (deletes only the points the drawing itself made and nothing uses).
- `render/pointerMath.ts` — `collectFreePoints`: the one walk from an object to the free points (and free arrow
  tails) a drag moves. `canDrag` and the Move tool's drag in `render/Interaction.tsx` both use it.
- `app/contextActions.ts` — the right-click rows for each kind of object.
- `app/topBarInputs.ts` — `clampPrecision` (per d.p./s.f. mode) and `scaleFromText` (grid-scale box).
- `app/TopBar.tsx` — the precision and grid-scale boxes, menus, mode tabs.
- `app/SearchPalette.tsx` — Ctrl+K rows, `score`, `modeForTool` (which mode a palette tool opens).
- `panels/shellLogic.ts` — pure rules for the panels: `keepBefore` (Graphs), `sliderPlayClick` and `sliderLabel`
  (SliderDock), `nextTimelineMax` (Timeline).
- `panels/Graphs.tsx`, `panels/SliderDock.tsx`, `panels/Timeline.tsx` — the components that call those rules.

## Data flow: a key press
1. `shortcutKeyDown` handles Ctrl+K, S, O and N first, even while the student types in a field.
2. Any other key typed in a field is left alone. Then Ctrl+Z/Y (the history of the mode in front) and Ctrl+A act, and
   any other Ctrl combination is ignored. Arrow keys turn a 3-D drawing; Tab is never taken.
3. In the Sandbox, Delete and Backspace remove the selected body, and Esc clears the selection.
4. Otherwise Esc, Delete, Backspace, the 2D/3D key, Home, Space and Enter/`/` each act as listed below.
5. Any other letter goes to `toolForKey` with the open mode's shelf, and picks that tool.

Backspace calls `undoLastPick()` first. If that returns false (no drawing in progress), it deletes the selection.
The Undo button in `render/Viewport.tsx` calls the same `undoLastPick`, so both routes behave alike.

## Invariants
- A rename changes only a whole name as the parser reads it: numbers are read first, so `2A` is 2 × A, while `B2A`,
  `a1`, `A′`, `Aα` and `tan` are other names. rename.ts keeps a copy of naming.ts's character class; change both together.
- A mode change drops every tool's half-made picks, even when the new mode has the same tool.
- A letter key picks only a tool the current mode's shelf (`MODES[...].tools`, the same list the top bar draws) shows.
- Backspace and Esc remove only what the drawing made (`created`): a point placed before the drawing began is never
  deleted by them, used or not.
- Precision 0 is allowed in d.p. mode only; s.f. mode is at least 1. Precision is at most 12. `clampPrecision` is the
  only place the top bar's box is limited.
- The grid-scale box keeps what the student types; only a positive finite number is committed, and the box shows the
  stored scale again on blur or when the scale changes elsewhere.
- Ctrl+K: every word of a query must appear in the row's title or hint. Palette tools never open a mode with a centre
  panel (the Calculator) over the drawing; `modeForTool` returns null to stay in the current mode.
- "Move tail to the origin" is offered only for free vectors (the same `isFree` rule as "Move to the origin").
- Graphs: scrubbing back keeps the samples before the new time. The slider Play button resumes a paused sweep. The
  timeline's max only grows during a run (no jump under a drag across 10 s) and returns to 10 s at t = 0. The slider
  label uses the student's precision through `math/format.ts` (at least the step's decimals in d.p. mode).
- vitest has no DOM: each of these decisions lives in a pure function the component calls, and the test calls it too.

## Traps and the tests that guard them
- Name boundaries with `\w` miss Greek and primes → `tests/rename.test.ts`.
- `Number(text) || 1` on a typed box resets partial input → `tests/topBarInputs.test.ts` › grid-scale box.
- Precision `min={0}` ignored s.f. mode → `tests/topBarInputs.test.ts` › precision box.
- Palette tool picking the first ready mode (the Calculator) → `tests/topBarInputs.test.ts` › Ctrl+K palette.
- A `.phys` file saved with 0 s.f. opens with 0 s.f. and is then written at 1 s.f. → `tests/precisionLoad.test.ts`
  (see Open).
- Backspace after a finished drawing must not reach the earlier selection → `tests/shortcutKeys.test.ts` › CW8c-1 (see Open).
- Keys that switch mode: `tests/hiddenModes.test.ts` reads `app/shortcuts.ts` as text and fails on `enterMode(` or
  `.setMode(` there. It also reads SearchPalette.tsx with a regex: update it when that line changes.
- Window shortcuts (Delete, Backspace, Esc, Ctrl+A, letter keys, the Sandbox's own Backspace) → `tests/shortcutKeys.test.ts`.
- Tool state surviving `enterMode`; letter keys ignoring the shelf; a context row that cannot act →
  `tests/shellModeKeys.test.ts`. Segment Backspace and the drawing's own points → `tests/toolStepBack.test.ts`.
- Panel state rules (rewind, play, timeline max, label precision) → `tests/shellLogic.test.ts`.
- Golden sweeps for this area: `shell` (`tests/golden/shell.golden.test.ts`) and `pointer`
  (`tests/golden/pointer.golden.test.ts`). A refactor must leave both byte-identical.
- A drag's free points come from `collectFreePoints` in `render/pointerMath.ts` only. `render/tools.ts` has no copy;
  its `dropUnusedPicks` walks parents for another job (which picks something else uses), so do not merge the two.

## Open
- CW8c-1 (`tests/shortcutKeys.test.ts`, `it.fails`): after the Backspace that ends a drawing, a second Backspace deletes
  the selection made before the drawing began. Proved, not fixed; waits for the owner.
- CW8c-2 (`tests/precisionLoad.test.ts`, `it.fails`): a `.phys` file saved with 0 s.f. still opens with 0 s.f., and
  numbers are then written at 1 s.f. while the top bar says "0 s.f.". The open path does not range-check settings.
  Proved, not fixed; the fix belongs to the settings check at the door (CW5, `core/migrate.ts` / `core/store.ts` loadScene).
- C2/C3 (object names shadowing maths functions; stale values) wait for P-PARSE's `setSceneNames` so there is one
  naming rule.
