# The app shell: names, menus, shortcuts and panels

How object names are renamed, how the top bar's settings boxes, Ctrl+K, tool keys and the context menu decide what to
do, and how the Graphs, slider and timeline panels keep their state. Written by polish part P-FIX-SHELL (0.9).
Modes and the hidden-mode switch are in `modes.md`; number formatting in `numbers.md`.

## File map (under `src/renderer/src/`)
- `core/naming.ts` — `isValidName` (the name character class: letters, Greek, digits, `_`, `'` and the primes ′ ″ ‴ ⁗),
  RESERVED words.
- `core/rename.ts` — `renameInObjects`: renames an object and every formula that uses its name.
- `core/evaluate.ts` — evaluates the scene by name (a hub: run the full suite after any change).
- `app/layout.ts` — `enterMode`: tool shelf, view, space, panels; resets the tool on every mode change.
- `app/toolKeys.ts` — `toolForKey`: which tool a letter key picks in the current mode.
- `app/shortcuts.ts` — global key handling (calls `toolForKey`).
- `app/contextActions.ts` — the right-click rows for each kind of object.
- `app/topBarInputs.ts` — `clampPrecision` (per d.p./s.f. mode) and `scaleFromText` (grid-scale box).
- `app/TopBar.tsx` — the precision and grid-scale boxes, menus, mode tabs.
- `app/SearchPalette.tsx` — Ctrl+K rows, `score`, `modeForTool` (which mode a palette tool opens).
- `panels/shellLogic.ts` — pure rules for the panels: `keepBefore` (Graphs), `sliderPlayClick` and `sliderLabel`
  (SliderDock), `nextTimelineMax` (Timeline).
- `panels/Graphs.tsx`, `panels/SliderDock.tsx`, `panels/Timeline.tsx` — the components that call those rules.

## Invariants
- A rename changes only a whole name as the parser reads it: numbers are read first, so `2A` is 2 × A, while `B2A`,
  `a1`, `A′`, `Aα` and `tan` are other names. rename.ts keeps a copy of naming.ts's character class; change both together.
- A mode change drops every tool's half-made picks, even when the new mode has the same tool.
- A letter key picks only a tool the current mode's shelf (`MODES[...].tools`, the same list the top bar draws) shows.
- Precision 0 is allowed in d.p. mode only; s.f. mode is at least 1. Precision is at most 12.
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
- `tests/hiddenModes.test.ts` reads SearchPalette.tsx source with a regex: update it when that line changes.
- Tool state surviving `enterMode`; letter keys ignoring the shelf; a context row that cannot act →
  `tests/shellModeKeys.test.ts`.
- Panel state rules (rewind, play, timeline max, label precision) → `tests/shellLogic.test.ts`.

## Open
- C2/C3 (object names shadowing maths functions; stale values) wait for P-PARSE's `setSceneNames` so there is one
  naming rule.
