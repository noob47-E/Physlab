# Lab Data — code knowledge

What the area does: **Lab Data** is the practical notebook. A student types or pastes readings
into tables (columns with a name, a unit, an optional formula or ± uncertainty), draws one column
against another, fits a shape through the points (line, parabola, exponential, power, inverse,
log) with r² and a gradient ± from error bars, and exports CSV. A Sandbox run can be captured
into a new table.

## File map (under `src/renderer/src/`)
| File | One line |
|---|---|
| `lab/types.ts` | `LabTable` (columns, rows, optional `reads` — the text each typed cell was recorded with — and plot) and `LabColumn` (formula-safe `name`, optional display `label`, unit, formula, uncertaintyFor). |
| `lab/labStore.ts` | The store (`useLab`: tables, undo `past` and redo `future`) and every table edit as a pure function: addRow, removeRow, setCell, addColumn, removeColumn, setColumn, setRows, pasteRows, tidyReads. Every edit keeps `reads` in step with `rows`. |
| `lab/values.ts` | Works out every cell (`resolveValues`), `readTyped` (what a typed cell means), `recordedText` (the safety net: a text is shown only when it reads back as exactly its cell's number), `formulaName`, `typedColumnName`, headers. |
| `lab/csv.ts` | `parseTable` (tabs > semicolons > commas; quotes; BOM; decimal commas), `toCsv`, `applyPaste` / `pasteTarget` (where a paste goes). |
| `lab/fit.ts` | `fitOf`, `rankFits`, `fitAdvice` / `adviceText` (which shape to suggest, in words), `gradientRange` (max/min gradient from error bars), `pmText`. |
| `lab/chartData.ts` | What the chart draws (points, bars, the fitted curve). |
| `panels/LabData.tsx` | The table panel: cells, name/unit boxes, paste, the paste banner, fit advice with Use it. |
| `panels/LabChart.tsx` | The chart. |
| `app/undoRoute.ts` | `routeHistory(mode, key or menu)`: which history Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y and Edit ▸ Undo/Redo reach (lab, sandbox, author, drawing). |
| `sim/recording.ts` | A Sandbox run → a table (shared with the Sandbox part). |

## Data flow
1. Typing a cell: `readTyped` → a number and, for a plain number, its text ("0.200") → `setCell`.
   A typed sum keeps the number only. One reading with a decimal comma ("1,2") is 1.2; exactly
   three digits after the comma ("12,000") is left unread (a thousands separator just as often).
2. Paste: `pasteTarget` decides — a one-line value into an edited cell is plain text; a block
   lands at the focused cell (`pasteRows`, growing the table); only a paste onto the table itself
   or into an empty table replaces every reading.
3. Display and CSV: `recordedText(cell)` or the number; worked-out columns through math/format.ts.
4. Undo: one lab history with redo; a new edit clears redo; opening a project clears both.
5. Fit: `rankFits` → `fitAdvice` → `adviceText`; r² shown to 2 places, half away.
6. Files: tables save inside the `.phys`; format 7 added `reads` and `label` (both optional; a
   format-6 table shows exactly as before).

## Invariants
- A reading's text is never shown or exported unless it reads back as that cell's number.
- `reads` has the shape of `rows` after every edit.
- One undo in Lab mode, reached the same way by keys and menu; Ctrl+Z inside a text box stays the box's own.
- A Sandbox capture appends a table (`appendTable`), never replaces them (`setTables`).
- Formulas use the formula-safe name; the label is only for reading.

## Traps (each guarded by a test)
- Texts left behind after removing a row showed another row's reading — `labPrecision`.
- Ctrl+Shift+Z undid again; Ctrl+Y redid the drawing behind the table — `labUndo`.
- Pasting "1,2" into a cell replaced the whole table — `labUndo`.
- A straight line kept on curved data with only "try another shape" — `labFit`.
- The gradient ± for a falling line with sideways bars was a third of its true size — `labFit`.
- r² read 1 for tiny readings, and for readings with a large offset — `lab` (its `af-lb` block), `labFollowups`.
- A CSV caption with escaped quotes lost characters — `labFollowups`.
- A NaN or ±∞ reading gave a fit with r² NaN (rankFits sorted on NaN) and a gradient range of NaN; both are
  refused. The slope error used an absolute sxx > 1e-12 and vanished for x near 10⁻⁷ (now relative to the x
  readings' size), and `pmText` dropped a real ± under 1e-9 of the value (now 1e-12) — `fb2-lab-fit`.

## Tests
`lab`, `labPrecision`, `labUndo`, `labNames`, `labFit`, `labFollowups`, `chartData`, `persistence`, `fb2-lab-fit`.
