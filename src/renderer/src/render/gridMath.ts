// The decisions the grid makes every frame, kept pure so they can be tested without a canvas.
// They exist because of a real bug: a frame drawn before the canvas had been measured built a grid
// of zero-length lines, cached it as done, and left the viewport black until something else asked
// for a new frame.

import type { ViewSize } from './cameraUtils'

export interface GridArea {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

/** Is the canvas big enough to build anything from? */
export const usableSize = (s: ViewSize): boolean =>
  Number.isFinite(s.width) && Number.isFinite(s.height) && s.width >= 2 && s.height >= 2

/** A camera or a canvas that is not ready yet can hand back NaNs or an empty rectangle. */
export const finiteArea = (a: GridArea): boolean =>
  Number.isFinite(a.xMin) && Number.isFinite(a.xMax) && Number.isFinite(a.yMin) && Number.isFinite(a.yMax) && a.xMax > a.xMin && a.yMax > a.yMin

/** Rebuild when the spacing changed, or when the view has moved outside what was built. */
export function needsGridRebuild(prev: GridArea & { key: string }, view: GridArea, key: string): boolean {
  if (key !== prev.key) return true
  return view.xMin < prev.xMin || view.xMax > prev.xMax || view.yMin < prev.yMin || view.yMax > prev.yMax
}

/** What was built is remembered under this key; the size is part of it because a panel that grew needs more grid. */
export const gridKey = (majorStep: number, size: ViewSize): string => `${majorStep}|${size.width}x${size.height}`
