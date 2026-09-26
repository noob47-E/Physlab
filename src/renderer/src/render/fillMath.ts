// How a polygon's fill is laid out, as plain decisions the view draws from (render/ObjectViews.tsx
// PolygonView and DecomposedParts). Kept out of the component so a test can hold them.

import type { V3 } from '../math/vec'

/**
 * Is the shape filled whole, in its own colour, rather than as coloured parts I, II, …? A shape
 * that is not decomposed is, and so is one whose decomposition has a single part — a rectangle
 * or a triangle is "already a simple shape". 0.7.0 drew that single part in the first series
 * colour, so a purple rectangle turned blue the moment it was decomposed, and came back blue
 * from a Fuse (Fix 18).
 */
export function fillsWhole(decomposed: boolean | undefined, parts: number): boolean {
  return !decomposed || parts < 2
}

/**
 * The outline a part's fill is cut to: its own corners, exactly. 0.7.0 pulled every corner 4 px
 * towards the part's centre, so each fill stopped short of its sides and of the cut, leaving the
 * unshaded strip the owner called rough (Fix 20). The cut is shown by its dashed line; two parts
 * sharing a side now meet on it, with nothing between them at any zoom.
 */
export function fillOutline(pts: V3[]): [number, number][] {
  return pts.map((p) => [p[0], p[1]])
}
