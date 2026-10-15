# 3D-3 PART B — Geometry in 3D: the tools and the look (the Pro, Thu 15 Oct)

Branch phase-09-3D3B from phase-0.9 bee8fb84, with phase-09-3D3A (math/geometry3d.ts), phase-09-SOLIDS3D (math/solids3d.ts,
math/theorems3d.ts) and phase-09-3D2 (the 3-D view's black canvas fix, planes typed as equations) merged in.

## What is there today
- Geometry ('shapes' mode) has one 20-button 2-D tool row (app/modes.ts `tools`, app/TopBar.tsx `ToolShelf`). Its 3-D view only
  tilts the flat drawing: the Point, Segment and Line tools already work on the floor (z = 0) in 3-D, and a free point drags
  across a level plane at its height (render/pointerMath.ts `dragFrom`), so nothing can be lifted off the floor.
- Objects (core/types.ts) are points, vectors, segments, rays, lines, circles, polygons, angles, numbers, graphs, texts. A point
  and a line are already 3-D (V3). A plane exists only as a typed graph `2x + y − z = 4` (3D-2, GraphKind 'plane').

## What I add
1. **Objects.** `solid` (`kind`: cube, cuboid, prism, pyramid, sphere, cylinder, cone, and the gallery's tetrahedron,
   octahedron, dodecahedron, icosahedron, frustum, hemisphere; `at`: the centre of its base; `size`: each measure as an
   expression, so a typed `4`, a slider `r` or a handle all write it) and `plane` (`threePoints` A, B, C). Evaluated in
   core/evaluate.ts like every object (the solid's corners and faces from math/solids3d.ts, centred on `at`; the plane's
   normal and d), so they follow their points and sliders, are saved in the file, undo, delete and list in the Outliner.
2. **Typed.** `P(1, 2, 3)` is a point (as `P = (1, 2, 3)`); `Plane(A, B, C)`; `Cube(4)`, `Cuboid(5, 3, 4)`, `Prism(4, 6)`,
   `Pyramid(4, 6)`, `Sphere(3)`, `Cylinder(2.5, 5)`, `Cone(3, 4)`. A plane from an equation stays 3D-2's typed plane.
3. **The 3-D tool row** (Geometry, 3-D view only; ModeDef `tools3d`): Move, Point, Segment, Line, Plane, 3D shapes, Measure,
   Angle, Delete, each with its tool card. Point clicks the floor; a selected free point shows a lift handle (an arrow up) that
   drags it straight up or down. Plane takes three points. 3D shapes opens a row of seven picture tiles under the tool row
   (cube ... cone); a tile puts that solid on the floor, selected. Measure and Angle pick objects (each click adds one; a
   click on nothing clears) and the Measure panel works the answer out. The 2-D row is unchanged.
4. **The look.** Solids drawn at about 30 % fill, depth-write off, with their edges as constant-pixel lines, a dashed height
   line for a pyramid, cone and cylinder; theme tokens (--solid-fill, --solid-edge). Selected: an orange size handle on the
   base and a cyan height handle on top, which drag the size and the height (snapped to 0.1). One summary on hover
   ("Pyramid · V = 32 u³"), never every edge's label. Planes as the 3D-2 plane patch.
5. **Measure (the panel's 3-D card), from the selection, with worked steps** built on math/geometry3d.ts's values: a point (x, y,
   z boxes); a segment (its length); two points (the distance); two lines or segments (the angle between them); a line and a
   plane (the angle); two planes (the angle); a point and a plane (the shortest distance); a solid (its typed sizes, then
   Volume | Surface area tabs: the formula, the numbers put in, the result, in the app's number format). Under it a short list
   of the 3-D objects with their key number.
6. **Shapes and Theorems tiles** (two 2-column folds in the same card): Shapes = every solid of math/solids3d.ts (the seven,
   the five Platonic solids... the four not in the seven, the frustum, the hemisphere); Theorems = the ten of
   math/theorems3d.ts, each setting up its solids or planes and a slider (its range and default from the data, a short name),
   its live numbers (the data's quantities at the slider's value) and its 'aha' sentence. The next theorem replaces the last.
7. **Words.** The 3-D hint: "Click 3D shapes to put a cube, pyramid or sphere on the floor, or type P(1, 2, 3)."

## Tests first
tests/solidsScene.test.ts (objects, sizes, evaluation, files), tests/measure3d.test.ts (every measurement against hand values:
cube side 2 V 8 A 24; planes x = 0 and y = 0 at 90°; (0,0,0) to x + y + z = 3 is √3; a line along (1,1,0) and z = 0 at 0°,
(0,0,1) at 90°; a pyramid 4, 6: V 32), tests/geometry3dCommands.test.ts (the typed forms), tests/geometry3dTools.test.ts
(the 3-D row, the picks, the lift and size handles' arithmetic), tests/theoremTiles.test.ts (each tile's scene and numbers).

## Pictures and checks
sb8-tools capture, 1366x768, a visible window, Light and Moonlight: a pyramid with its volume steps; a plane and a line with
their angle; the tiles. Review gpt-5.4 + Argon. tools\fullcheck.ps1 last. READY 3D3B.
