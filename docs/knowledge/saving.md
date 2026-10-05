# Saving, opening and crash recovery — code knowledge

What the area does: a student's work is kept three ways. **Save / Open** write and read `.phys`
files (desktop dialogs, or a download and a file picker in the browser). **Autosave** copies
unsaved work aside every minute and on close. **Recovery** offers those copies back at the next
start, on the strip under the top bar ("PhysLab closed with unsaved work… Restore it / Discard").

## File map
| File | One line |
|---|---|
| `src/renderer/src/app/autosave.ts` | The autosave slot: `startAutosave` (timer, close hook, startup read), the waiting copies (`useRecovery`), `restoreRecovery`, `discardRecovery`, `hasWork`, `describeWork`. |
| `src/renderer/src/app/RecoveryBar.tsx` | The strip. Draws `useRecovery`'s shown copy and calls `restoreRecovery` / `discardRecovery`; decides nothing itself. |
| `src/renderer/src/app/files.ts` | Save, Save As, Open, `saveTextFile` (CSV and other text exports), file-open routing by kind. |
| `src/renderer/src/core/fileErrors.ts` | The plain-English sentences for files that cannot be opened. |
| `src/renderer/src/core/migrate.ts` | Brings an older `.phys` up to `FILE_VERSION`; one step per version, an old step is never edited. |
| `src/renderer/src/core/store.ts` | `serialize`, `loadScene`, `dirty` (not owned here). |
| `src/main/index.ts` ~371–410 | The desktop slot: `userData/autosave/latest.phys`, written beside and renamed over (`autosave:write`, `autosave:writeSync` on close, `autosave:read`, `autosave:clear`). |

## The slot
One text value (desktop file, or `localStorage['physlab.autosave']` in the browser):
`{ found, waiting, latest }`. `found` is the copy on the strip, `waiting` the copies after it,
`latest` this session's unsaved work. An older build wrote a bare snapshot `{ savedAt, path, file }`;
it is still read.

## Data flow
1. Start-up: `startAutosave` reads the slot. Every copy in it (`found`, `waiting`, and the last
   session's `latest`) is migrated; those with work are offered newest first, at most `MAX_COPIES`.
   Until that read has finished the slot is never written or cleared (`looked`).
2. Every minute and on close: `{ found, waiting, latest }` is written; nothing is written when there
   is neither unsaved work nor a waiting copy.
3. Restore: the shown copy is loaded and marked unsaved; work done since start-up is not thrown away
   but becomes the next copy on the strip (`setAside`). Discard drops the shown copy; the next one
   comes forward. When nothing is waiting and nothing is unsaved, the slot is cleared.
4. A real save clears the slot, unless copies are still waiting, which are kept.

## Invariants
- A copy on the strip is never overwritten or dropped until the student restores or discards it.
- "Restore it" never throws away work: it swaps it to the strip.
- `hasWork` compares with File ▸ New block by block (ids ignored), so a future panel's work counts.
- The strip never names a hidden mode (`HIDDEN_MODES`).

## Traps (each guarded by a test in `tests/af-sv.test.ts`)
- The minute autosave used to replace the one crash copy the strip was offering (S1).
- A second close with the strip still ignored dropped one of the two copies (S1 follow-up).
- "Restore it" replaced the work done since start-up without asking (R1).
- A write before the startup read finished would replace the crash copy (S3).
- `URL.revokeObjectURL` right after `a.click()` can cancel a browser download; it is revoked a tick later.

## Tests
`tests/af-sv.test.ts` (the slot, both the localStorage and the desktop-bridge paths),
`tests/persistence.test.ts` (files, migrate, `hasWork`).
