# Geometry (shapes, Measure panel, Decompose, Lego) — code knowledge

What the area does: names every polygon live (`classifyPolygon`), measures what is selected (the
**Measure** panel), writes each shape's area/perimeter formulas with the numbers put in (the shape
card, `polygonReport`), splits a composite shape into simple ones (**Decompose**), cuts it into
pieces a student slides, turns and fuses (**Break apart** / **Fuse**, "Geometry Lego"), and compares
two triangles (**Congruence**).

## File map
| File | One line |
|---|---|
| `src/renderer/src/math/shapes.ts` | `classifyPolygon` (names), `cleanPolygon` (drops repeated and in-line corners), `interiorAngles`, freehand stroke recognition. |
| `src/renderer/src/math/geometry.ts` | Pure geometry: line/circle meets, `polygonArea` (3-D, Newell), `polygonPlane` (a shape's own plane and its corners laid flat), equations as text. |
| `src/renderer/src/math/shapeFormulas.ts` | `polygonReport` / `circleReport`: the shape card's formula rows (general form, values put in, value). |
| `src/renderer/src/math/decompose.ts` | `decompose` (best split into simple shapes; "Other way" cycles), `partLabel` (I, II, … for any count). |
| `src/renderer/src/math/lego.ts` | `outlineOf`/`tiling` (what pieces make together), `piecesOverlap`, `fuseResult`, `legoParts`, `simpleCut`. |
| `src/renderer/src/math/congruence.ts` | `compareTriangles`: congruent or not, with the reasons a proof would carry. |
| `src/renderer/src/panels/Measurements.tsx` | The Measure panel: `rowsFor` (one object), `pairRows` (two), typed-into boxes (`EditableValue`, `typedValue`, `boxDisplay`). |
| `src/renderer/src/panels/ShapeInfo.tsx` | The shape card: formulas, Decompose parts, Break apart / Fuse buttons. |
| `src/renderer/src/panels/Congruence.tsx` | The congruence card and "Draw a triangle from its sides" (`sidesInWorld`). |
| `src/renderer/src/render/ObjectViews.tsx` (`DecomposedParts`) | Draws Decompose's parts, cut lines and numerals. |
| `src/renderer/src/core/store.ts` (`breakApart`, `fusePieces`) | The scene side of Lego; one undo step each. |
| `src/renderer/src/core/legoScene.ts` | The helpers those actions use: `makePolygon` (a piece or fused shape with its corners and sides), `consumeShapes` (what goes with a broken or fused shape), `movedPieces`, `dropPieceCorners`, `restoreCornerNames` (a shape fused back keeps its letters). |
| `src/renderer/src/render/areaLabelPlacement.ts` | `areaLabelPlacement`: where a flat shape's name-and-area chip stands, searched in pixels clear of the angle badges (`cornerBadge`, which ObjectViews draws the badges with too). |
| `src/renderer/src/core/doomed.ts` | `sidesOf` (a shape's own sides) and `doomedBy` (what a delete takes); the store re-exports both. |

## Invariants
- **Shapes off the page are measured in their own plane.** `polygonPlane` gives the plane (Newell
  normal), axes u, v and the corners laid flat (`flat`, anticlockwise). Names, angles, the shoelace
  row and Decompose all work on `flat`; a shape whose corners are all at one height keeps the old
  x–y code bit for bit.
- **Not every polygon is a shape.** `classifyPolygon` returns kind `skew` (corners in no one plane),
  `crossed` (two sides cross — a bow-tie) or `degenerate` (corners in a line), each with
  `notAShape`, one sentence. Callers show that sentence instead of an area or angles (Measure
  panel, `polygonReport`, ShapeInfo's Decompose). `decompose` never counts these as simple parts.
- **A crossed polygon shows no inside**: `sidesCross` (the one test) turns off its fill, parts, angle marks and area
  label on the canvas (`PolygonView`, `Labels.tsx`), and `canDecompose` (`math/shapes.ts`) keeps the Decompose button off
  its card; the card shows the "sides cross" sentence instead.
- **The shape's label is placed in pixels, never in drawing units.** The angle badges stand 42 px from their corners, so
  `areaLabelPlacement` searches the screen and hands back drawing units at the end: the same picture at any zoom puts the
  label in the same place against it. A fixed offset in drawing units was 3000 px at the default zoom, off the screen.
  Only a flat shape in an orthographic view is placed; any other keeps its centre.
- **Fuse back into the original keeps every letter.** Break apart saves each corner's position and letter in the
  pieces' `lego.originalCorners`; `restoreCornerNames` matches the fused outline's corners to them by position within a
  millionth of the shape's size (the outline is rounded to nine decimals, so a corner at 1/3 never equals what was saved).
  A corner another object is built on is never deleted by Fuse: `consumeShapes` decides, and the new corner is made
  beside it.
- **Decompose** splits a shape on the page exactly as it always did; a level shape above the page
  at its own height; a tilted or upright one in its plane, with the parts put back there (`lift`,
  which snaps a carried point onto the shape's own corner so letters match in 3-D).
- **Break apart** works only on a shape with every corner at z = 0; anything else is refused in
  words with no undo step (pieces are flat shapes on the page).
- **Congruent** means all six matched parts agree within one yardstick (0.5 % of the longest side,
  0.01 rad); the SSS/SAS/… rule is then the reason cited. Reason lines show each triangle's own value.
- **Measure rows** read a vector in its own unit (`Row.unit`), raise powers of ten
  (`superscriptPowers`), and say "undefined — a zero vector has no direction" where a direction is
  asked of a zero vector.

## Traps met (P-GEO, 2026-10)
- An upright square read "Isosceles triangle": `cleanPolygon` read only the z part of the cross
  product, which is 0 for every corner of an upright shape. It now reads the whole length, plus a
  relative THIN veto so a tiny square keeps its corners.
- Lines and circles were 2-D underneath: `lineLineIntersection` divided by the x–y cross (upright
  lines "parallel"), `lineCircleIntersection` met the circle as a sphere, the perpendicular bisector
  of an upright segment had direction 0, and a climbing line's Equation row was its shadow's.
- A typed-into box committed on Escape and on a plain focus-then-leave (writing 4.4721 back): the
  seed text is compared before anything is set.
- `outlineOf` returned one null for a gap and for an overlap; Fuse read both as a gap. `tiling` now
  says which. A corner near the end of a long side was skipped because a fraction was compared with
  a length.
- Source-pinned tests read Measurements.tsx and ShapeInfo.tsx (drawClick, congruencePieces): change
  the pin with the code.

## Known limits
- The whole polygon's own fill (`PolygonView`, outside this area's grant) is still drawn in x–y at
  the first corner's height; a tilted polygon's fill is its shadow lifted. Decompose's parts are
  drawn in the plane.
- `PLANAR_TOL` is 1/1000 of the shape's size: a small tilted shape typed to two decimals can read
  "skew", because its typed corners really are off one plane.

## The 10⁻¹² floors in geometry and graphs (CLEANUP-PLAN.md CW9-N2)
- **The z a line or a circle writes** (lineEquation3DText, circleEquation3DText) asks the writer's `DISPLAY_FLOOR`
  (math/format.ts), keeping its `>`: at exactly 10⁻¹² no z is written, one step over it is.
- **shapes.ts rdp** keeps its own 10⁻¹²: a closed loop's chord is exactly 0, and vec.ts's NO_DIRECTION is parked to
  become exactly 0 (CW9-N3-2), which would break shape recognition for every freehand loop.
- **Floors with a fixed scale, kept with their reason in place:** a triangle's area in grid squares (triangleInfo
  degenerate), a line's inclination in radians (lineEquation), a size floor and two division guards in a sketch
  (shapes.ts near, recognizeStroke — a guard that never acts —, meanDistanceToPolygon), a Lego total of 0 (lego.ts
  fuseResult), the orientation of a shape's corners (questions/legoPart.ts).
- **Relative floors (10⁻¹² of the sizes)** in polygonPlane, perpendicularBisector, sidesCross, graphs.ts settledAt and
  the edge limit, calc/roots.ts and lab/fit.ts pmText wait for the owner's one number (CW9-N2-1, with CW9-N3-1).
- **Parked:** core/evaluate.ts perpendicular takes a direction with both level parts under 10⁻¹² for a line along z, and
  a typed vector reaches it: the perpendicular to <3e-19, 4e-19> is level (CW9-N2-3). graphs.ts keyPoints adds an absolute 10⁻¹² to its jump-is-not-a-root check, so exp(1/x) − 2 scaled by
  10⁻¹³ gains a false root at x ≈ 0 (CW9-N2-2).
- Guarded by tests/noiseFloors.test.ts (the CW9-N2 blocks) and the geometry, roots, presets and lab sweeps.
