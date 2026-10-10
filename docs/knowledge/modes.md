# Modes, panels and the hidden modes

How PhysLab's modes are listed, opened and remembered, how a mode is kept out of a build without deleting it, and how the shell reads and writes files. Written by polish part P-MODES (0.9) and brought up to date by clean-up part CW8a. Rule 5 of AGENTS.md: every feature is a mode, never a grade level.

## File map
- `app/modes.ts` — `ModeId` (stored in saved layouts and, through `spaceOf`, in every object of a file: never renamed),
  `MODES` (label, description, `ready`, tool shelf, `panel`, optional `centre`/`view`/`examples`), `modeById`,
  `isDrawingMode` (the one 2D/3D rule), `useApp` (current mode, search open, layout ready); and the hidden-mode switch
  with its helpers (below).
- `app/modeSwitch.ts` — `modeTabs`: how many mode tabs fit the bar; the rest go in More modes.
- `app/layout.ts` — `enterMode` (tool shelf, view, space, the mode's panel and centre), `buildLayout` (a mode's default
  dock), `restoreLayout` / `savedMode` / `watchLayout` / `resetLayout` (the saved layout `{ v, app, w, h, layout, mode }`
  in localStorage `physlab.layout`). `savedMode` turns away only a "coming soon" mode (null); any other saved id is
  handed on as it was saved.
- `app/layoutMath.ts` — pure layout decisions: `LAYOUT_VERSION`, `panelsForMode`, `panelHome`, `columns`,
  `needsLayoutRebuild`.
- `app/panels.ts` — `PANEL_TITLES` (every panel, hidden ones included), `PANEL_LIST` (what the View menu and Ctrl+K
  offer), `PANEL_GROUPS` (where a closed panel comes back), `showPanel` / `hidePanel` / `togglePanel`,
  `dropHiddenPanels`.
- `app/App.tsx` — `PANEL_VIEWS` (each panel's component, lazy for the heavy ones) and the start-up in `onReady`.
- `app/TopBar.tsx` — the mode tabs, More modes (overflow + "coming soon" rows) and the View menu's panel rows.
- `app/SearchPalette.tsx` — `buildItems`: the Ctrl+K rows (Modes, Tools, Panels, Examples, Commands, Calculator,
  Settings, Help, Edit). The Calculator rows are `CALC_MODES`, which is `Object.keys(MODE_LABELS)` from
  `calc/calcStore.ts`, in that file's order; each row's hint is `MODE_HINTS` from the same file.
- `app/files.ts` — File > Open (`openProject` → `loadProjectText`), Problem Sets' question-file picker
  (`openQuestionFile`, used by `panels/Practice.tsx`), Save (`saveProject`), `saveTextFile`, and `classResultsFileText`.
  See "Files and the desktop bridge" below.
- `app/download.ts` — the browser build's one file picker and one download helper.
- `core/visibility.ts` — `spaceOf` (which drawing a mode shows) and `modeOfSpace` (the Outliner's "go to" buttons).
- `app/tour/*` — the Welcome screen's four mode cards, the tour steps and the Start here missions, each naming a mode.

## Data flow
A tab, a More modes row, a Ctrl+K row or a button calls `enterMode(id)` → `useApp.setMode`, the space, the view, the
tool shelf, then `requestFocus(panel)` → App's focus effect → `showPanel`. The layout is saved 0.8 s after every dock
change and on unload.

At start-up, App's `onReady` reads the saved mode and opens `openableMode(savedMode() ?? 'vectors')`. So a session
reopens the mode it was left in (`savedMode`, then `openableMode`). A mode this build hides or does not have (Question
Author and Class Results, in an old save) opens Problem Sets. A "coming soon" mode opens Vectors. Then the dock is
restored (`dropHiddenPanels` after it), rebuilt when the saved one is stale or empty, and the mode is entered.

## Hidden modes
`HIDDEN_MODES` in `app/modes.ts` is the one switch, and it is empty today. Question Author (`author`) and Class Results
(`results`) were kept out of reach from 2026-10-01 (owner: not ready, and confusing at the exhibition) and taken out of the
app on 2026-10-08 (P-REMOVE-AUTHOR, 0448d3b). Their code is archived at the tag `archive/question-author-0.9`, and neither id is in `ModeId`
any more. The mechanism stays for the next mode that is not ready: put its id in the set and no entry point leads to it.
Nothing is deleted, and **emptying the set brings everything back everywhere at once**. Every entry point reads the switch
through a helper (each takes the set as its last parameter, so a test can pass an empty one):

| Entry point | How it is closed |
|---|---|
| Top-bar tabs, More modes overflow | `readyModes()` (ready and not hidden) |
| More modes "(coming soon)" rows | `comingSoonModes()` — a hidden mode is not announced either |
| View menu panel rows, Ctrl+K Panels rows | `PANEL_LIST = panelList()` leaves out `hiddenPanels()` |
| Any `showPanel` / `requestFocus` of a hidden panel | `showPanel` returns early (`isPanelHidden`) |
| Ctrl+K Modes and Tools rows | `readyModes()` |
| A saved layout in a hidden mode, or in one this build lacks | App `onReady`: `openableMode(savedMode() ?? 'vectors')` → Problem Sets |
| A saved dock still holding a hidden mode's panels | App `onReady`: `dropHiddenPanels()` after `restoreLayout`; an empty dock is rebuilt |
| Keyboard shortcuts, Welcome screen, tour, Start here missions, Examples, Outliner, command bar | never name a hidden mode (guarded by source tests) |

A `.phys` file that holds a Question Author set (formats 5–7, `questions`) still opens as a scene: `core/migrate.ts`
leaves the set out, and `loadScene` (`core/store.ts`) says so in one sentence (`QUESTION_SET_LEFT_OUT`). Problem Sets
plays bundled and teacher `.pqjson` / `.exam` sets.

## Invariants
1. A list of modes a student sees comes from `readyModes()` / `comingSoonModes()`, never from `MODES.filter` in a
   component.
2. A hidden mode keeps `ready: true`: `ready` means "built", `HIDDEN_MODES` means "kept out of this build".
3. `PANEL_TITLES` and `PANEL_GROUPS` stay complete, so the code behind a hidden mode still builds and its tests run.
4. `PANEL_LIST` is built once, when panels.ts loads; the switch is an edit to the source, so a rebuild picks it up
   everywhere. (Emptying the set from the browser console reopens the tabs at once, the View menu only after a reload.)
5. `enterMode` itself has no guard: the doors are closed where a student can knock. No code calls it with a hidden id
   (`tests/hiddenModes.test.ts` › "finds no place in the app that opens either mode or either panel by name").
6. Which saved mode opens is two steps, each kept once: `savedMode` turns away a "coming soon" mode, and `openableMode`
   turns a hidden mode, or one this build does not have, into Problem Sets. Do not add a second list of modes beside them.

## Files and the desktop bridge
- **The desktop bridge.** `window.physlab` is the preload's bridge (`PhysLabBridge`, from `src/preload/index.ts`). It is
  absent in the browser build. It is declared once, in `globals.d.ts`, from the preload's own type. Read it as
  `window.physlab?.…` and fall back to the browser path; never cast `window` to a private bridge type.
  `tests/filesBridge.test.ts` keeps a list of files that still cast (three today: `app/autosave.ts`, `app/theme.ts`,
  `app/TopBar.tsx`, each held by another clean-up part). The list only shrinks.
- **The browser build's one picker and one download.** `app/download.ts` holds `pickFile(accept)` (one file input; it
  resolves null on cancel or when no file is given), `downloadUrl(href, name)` and `saveBlob(blob, name)`. It reads no
  `window` or `document` until a function is called, so `render/exportImage.ts` can import it. It is a module of its own
  because `app/files.ts` reads `window` when it loads and `exportImage.ts` cannot import that file.
- **Who uses it.** `app/files.ts` (Open and Open a question file use `pickFile`; Save and `saveTextFile` use `saveBlob`),
  `panels/LabData.tsx` (Import a `.csv` uses `pickFile`) and `render/exportImage.ts` (the PNG uses `downloadUrl`). In the
  end state each of these takes its desktop branch from `window.physlab?.` and its browser branch from `download.ts`.
  Nothing else in `src/renderer` creates a file input or a download link.
- **The class-results check.** "Is this a class-results file" is one check: `isResultFileText(name, text)` in
  `questions/results.ts`. It is true for a name ending `.pqresult` (any letter case), or for both marks inside the text
  (`"app": "PhysLab"` and `"format": "pqresult"`). It never parses. `app/files.ts`'s `classResultsFileText` only words the
  refusal, "Class results are not part of PhysLab.", and nothing is loaded. Both File > Open (`loadProjectText`) and
  Problem Sets' Open a question file (`panels/Practice.tsx`) call it.

## Traps
- A layout saved while a mode could be opened still holds its panel after `restoreLayout`; filtering the mode alone left
  the panel in the dock. Guard: `tests/hiddenModes.test.ts` (M2).
- Setting `ready: false` would list a hidden mode as "(coming soon)" in More modes and move every tab-width expectation
  in `tests/modeSwitch.test.ts`. Guard: `tests/hiddenModes.test.ts` (M1).
- `app/files.ts` must not parse JSON itself. The plain sentences for a broken file live in `parseSceneFile`, and a parser
  message once reached the Console. Guard: `tests/persistence.test.ts` (no `JSON.parse` in files.ts).
- The result-file check reads a name or the text's two marks, never a parse, and a quote typed inside a label is escaped
  in JSON, so a project that merely mentions those words is never refused. Guard: `tests/filesBridge.test.ts`
  (`isResultFileText`, `classResultsFileText`).
- A new calculator mode gets its Ctrl+K row from `MODE_LABELS` alone. Its hint comes from `MODE_HINTS`, which is typed
  `Record<CalcMode, string>`, so the compiler asks for it: a second entry, but not a second list to keep in step.
  Guard: `tests/modesOpenable.test.ts` (the fifteen Calculator rows).

## Tests
`tests/hiddenModes.test.ts` (every entry point closed; the switch flipped back opens the modes again),
`tests/modesOpenable.test.ts` (which mode a saved session opens, for every kind of saved layout; the Calculator palette
rows), `tests/layout.test.ts`, `tests/modeSwitch.test.ts`, `tests/space.test.ts`, `tests/toolShelf.test.ts`,
`tests/filesBridge.test.ts` (the bridge declaration, the result-file check), `tests/download.test.ts` (`downloadUrl`,
`saveBlob`, `pickFile`, and the browser branches of `app/files.ts`), `tests/persistence.test.ts`.
Golden sweeps for the files, settings and shell parts: `tests/golden/files.golden.test.ts`,
`tests/golden/settings.golden.test.ts` (it reads `savedMode()` directly, so its values must not change) and
`tests/golden/shell.golden.test.ts`.
