# Modes, panels and the hidden modes

How PhysLab's modes are listed, opened and remembered, and how a mode is kept out of a build without deleting it.
Written by polish part P-MODES (0.9). Rule 5 of AGENTS.md: every feature is a mode, never a grade level.

## File map
- `app/modes.ts` — `ModeId` (stored in saved layouts and, through `spaceOf`, in every object of a file: never renamed),
  `MODES` (label, description, `ready`, tool shelf, `panel`, optional `centre`/`view`/`examples`), `modeById`,
  `isDrawingMode` (the one 2D/3D rule), `useApp` (current mode, search open, layout ready); and the hidden-mode switch
  with its helpers (below).
- `app/modeSwitch.ts` — `modeTabs`: how many mode tabs fit the bar; the rest go in More modes.
- `app/layout.ts` — `enterMode` (tool shelf, view, space, the mode's panel and centre), `buildLayout` (a mode's default
  dock), `restoreLayout` / `savedMode` / `watchLayout` / `resetLayout` (the saved layout `{ v, app, w, h, layout, mode }`
  in localStorage `physlab.layout`).
- `app/layoutMath.ts` — pure layout decisions: `LAYOUT_VERSION`, `panelsForMode`, `panelHome`, `columns`,
  `needsLayoutRebuild`.
- `app/panels.ts` — `PANEL_TITLES` (every panel, hidden ones included), `PANEL_LIST` (what the View menu and Ctrl+K
  offer), `PANEL_GROUPS` (where a closed panel comes back), `showPanel` / `hidePanel` / `togglePanel`,
  `dropHiddenPanels`.
- `app/App.tsx` — `PANEL_VIEWS` (each panel's component, lazy for the heavy ones) and the start-up in `onReady`.
- `app/TopBar.tsx` — the mode tabs, More modes (overflow + "coming soon" rows) and the View menu's panel rows.
- `app/SearchPalette.tsx` — `buildItems`: the Ctrl+K rows (Modes, Tools, Panels, Examples, Commands, Calculator,
  Settings, Help, Edit).
- `app/files.ts` — File > Open (`openProject` → `loadProjectText`), Problem Sets' question-file picker
  (`openQuestionFile`), `hiddenModeFileText`.
- `core/visibility.ts` — `spaceOf` (which drawing a mode shows) and `modeOfSpace` (the Outliner's "go to" buttons).
- `app/tour/*` — the Welcome screen's four mode cards, the tour steps and the practice tasks, each naming a mode.

## Data flow
A tab, a More modes row, a Ctrl+K row or a button calls `enterMode(id)` → `useApp.setMode`, the space, the view, the
tool shelf, then `requestFocus(panel)` → App's focus effect → `showPanel`. The layout is saved 0.8 s after every dock
change and on unload; at start-up `onReady` reads the saved mode, restores the dock, rebuilds it when the saved one is
stale or empty, and enters the mode.

## Hidden modes
`HIDDEN_MODES` in `app/modes.ts` is the one switch. Question Author (`author`, panel `author`) and Class Results
(`results`, panel `classresults`) are in it for 0.9 (owner, 2026-10-01: not ready, and confusing at the exhibition).
Nothing is deleted — the panels, their stores, file formats and tests stay — and **emptying the set brings both back
everywhere at once**. Every entry point reads the switch through a helper (each takes the set as its last parameter,
so a test can pass an empty one):

| Entry point | How it is closed |
|---|---|
| Top-bar tabs, More modes overflow | `readyModes()` (ready and not hidden) |
| More modes "(coming soon)" rows | `comingSoonModes()` — a hidden mode is not announced either |
| View menu panel rows, Ctrl+K Panels rows | `PANEL_LIST = panelList()` leaves out `hiddenPanels()` |
| Any `showPanel` / `requestFocus` of a hidden panel | `showPanel` returns early (`isPanelHidden`) |
| Ctrl+K Modes and Tools rows | `readyModes()` |
| A saved layout in `author`/`results` | App `onReady`: `openableMode(savedMode() ?? 'vectors')` → Problem Sets |
| A saved dock still holding the hidden panels | App `onReady`: `dropHiddenPanels()` after `restoreLayout`; an empty dock is rebuilt |
| Problem Sets' "Save my results for my teacher" card | shown only while `resultFilesOffered()` |
| File > Open of a `.pqresult` (by name, or by what is inside) | `loadProjectText` asks `hiddenModeFileText` first → "Class results are not in this version of PhysLab.", nothing loaded |
| Problem Sets' "Open a question file" of a `.pqresult` | Practice `openFile` asks `hiddenModeFileText` before `loadTeacherFile` → the same sentence |
| Keyboard shortcuts, Welcome screen, tour, practice tasks, Examples, Outliner, command bar | never name a hidden mode (guarded by source tests) |

Still reachable on purpose: a `.phys` file that holds Question Author's questions (format 5 `questions`) opens as a
scene and keeps those questions when saved again; Problem Sets plays bundled and teacher `.pqjson` / `.exam` sets.

## Invariants
1. A list of modes a student sees comes from `readyModes()` / `comingSoonModes()`, never from `MODES.filter` in a
   component.
2. Both hidden entries keep `ready: true`: `ready` means "built", `HIDDEN_MODES` means "kept out of this build".
3. `PANEL_TITLES` and `PANEL_GROUPS` stay complete, so the code behind a hidden mode still builds and its tests run.
4. No `LAYOUT_VERSION` bump was needed: `dropHiddenPanels` cleans a stale layout without resetting everyone's.
5. `PANEL_LIST` is built once, when panels.ts loads; the switch is an edit to the source, so a rebuild picks it up
   everywhere. (Emptying the set from the browser console reopens the tabs and the results card at once, the View
   menu only after a reload.)
6. `enterMode` itself has no guard: the doors are closed where a student can knock. No code calls it with a hidden id
   (`tests/hiddenModes.test.ts` › "finds no place in the app that opens either mode or either panel by name").

## Traps
- A layout saved while a hidden mode could be opened still holds its panel after `restoreLayout`; filtering the mode
  alone left the Class Results tab in the dock. Guard: `tests/hiddenModes.test.ts` (M2).
- Setting `ready: false` would have listed both modes as "(coming soon)" in More modes and moved every tab-width
  expectation in `tests/modeSwitch.test.ts`. Guard: `tests/hiddenModes.test.ts` (M1).
- `app/files.ts` must not parse JSON itself (`tests/persistence.test.ts` checks there is no `JSON.parse` in it: the
  plain sentences for a broken file live in `parseSceneFile`, and a parser message once reached the Console), so `hiddenModeFileText` recognises a result file by two key patterns in its text
  (`"app": "PhysLab"` and `"format": "pqresult"`, any spacing). A quote typed inside a label is escaped in JSON, so a
  project that merely mentions those words is never refused.

## Tests
`tests/hiddenModes.test.ts` (every entry point closed; the switch flipped back opens both), `tests/layout.test.ts`,
`tests/modeSwitch.test.ts`, `tests/space.test.ts`, `tests/toolShelf.test.ts`; the hidden modes' own logic keeps
`tests/author*.test.ts`, `tests/classResults.test.ts`, `tests/results.test.ts`.
