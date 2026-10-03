# The viewport: drawing tools, object views, grid and export

How the 2-D/3-D drawing turns pointer presses into objects, how objects and their marks are drawn, how the grid and
fat lines keep their GPU buffers, and how a drawing is exported. Written by polish part P-FIX-VIEW (0.9).
Numbers on screen follow `numbers.md`; modes and panels `modes.md`; the app shell `shell.md`.

## File map (under `src/renderer/src/`)
- `render/tools.ts` — the tool store: the current tool, its `picks`, the objects this drawing `created`, its `sides`
  (polyline), `finishTool`, `undoLastPick` (Backspace), `cancelTool`, `resetTool`, `dropUnusedPicks(picks, created)`.
- `render/Interaction.tsx` — pointer events: press, drag, release, hover, tips; calls the tool store and `pointerMath`.
- `render/pointerMath.ts` — pure Move-tool decisions: `canDrag`, `dragFrom` (the drag plane and start point),
  `selectionAfterClick`, `tipLength` / `tipAngle` / `tipNumber`, `collectFreePoints`.
- `render/ObjectViews.tsx` — one view per object kind (point, segment, circle, polygon, angle, vector…).
- `render/markGeometry.ts` — pure mark geometry: `cornerAngle`, `polygonCornerMark`, `arcBetween`, `tickNormal`,
  `tickLines`, `arcLines`.
- `render/Marks.tsx` — equal-side ticks and equal-angle arcs (Compare card) drawn from `markGeometry`.
- `render/Grid.tsx`, `render/gridLabels.ts`, `render/ticks.ts` — grid lines, the 3-D floor, axis numbers.
- `render/FatLine.tsx` — thick lines (LineSegments2), used by segments, outlines and the rubber band.
- `render/gpuBuffers.ts` — `fillGrid` / `writeLinePoints`: write into an existing buffer, grow by doubling.
- `render/exportImage.ts` — `exportPlan` (pixel ratio for a k× PNG), `exportPng`, `saveViewportImage`.
- `panels/GpuLab.tsx` — the GPU particle lab (W14/W15 deferred).

## Invariants
- **A drawing never touches what existed before it.** Finish, Backspace, Esc and a tool change drop only points this
  drawing made and nothing uses; an object built on a pick counts as using it. Backspace steps back one pick or one
  side and never calls the store's undo.
- Camera controls go off only for a press that can drag; every Move-tool release turns them back on.
- A drag starts on the same plane it moves on, so nothing jumps; a point that cannot move (crossing, midpoint,
  arrow-head point) is never dragged and makes no undo step.
- A plain click (no movement) on a member of a multi-selection leaves only that object selected.
- Fill and outline colours go through `shownColor`; a WebGPU material with a themed colour is keyed on theme + colour
  (WebGPU compiles the colour in).
- A polygon's corner arc sweeps the interior angle (270° at a reflex corner) and agrees with its label; ticks and arcs
  lie in their own shape's plane in 3-D; a 2-D side's tick is drawn exactly as before (horizontal stroke).
- Grid and fat lines update their buffers in place (`setDrawRange` / `instanceCount`); code that counts drawn points
  reads the draw range (`drawnVertices`), not `attribute.count`.
- Export renders at the target size (no upscaling) and refuses in plain English when the drawing is behind another tab.
- Any number on the drawing goes through `superscriptPowers` (raised powers, no-break spaces round ×), and a shown
  value reads back when typed or pasted.

## Traps and the tests that guard them
- Dropping "unused" picks without checking who made them deleted earlier points → `tests/toolStepBack.test.ts`.
- Backspace calling the store's undo removed an unrelated earlier action → `tests/toolStepBack.test.ts`.
- A drag start taken from the floor hit (z = 0) made 3-D drags jump → `tests/pointerMath.test.ts`.
- The short-way arc at a reflex corner showed the exterior angle → `tests/markGeometry.test.ts`.
- A tick taking its plane from a neighbouring triangle → `tests/markGeometry.test.ts` (VB round 2).
- A new buffer on every grid rebuild or line change leaked GPU memory → `tests/gpuBuffers.test.ts`.
- Export drawing at the screen's backing size and stretching it; a hidden canvas saving `data:,` →
  `tests/exportImage.test.ts`.
- Ordinary spaces round × let numbers wrap; carets on axes and tips → `tests/rawPowers.test.ts`.

## Known limits (deferred)
- A point the drawing made on an object stays after Backspace/Esc/finish (`dropUnusedPicks` needs `isFree`).
- A shape (not a point) off the floor in 3-D drifts slightly while dragged (its plane passes through z = 0).
- A zero-length side gives NaN marks; a straight 180° corner's semicircle can sit outside the polygon.
- On WebGL2 a grown buffer's old copy is not disposed (three cannot dispose one attribute); growth is by doubling,
  so only a few are left.
