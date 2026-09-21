// The decisions the grid makes every frame, kept pure so they can be tested without a canvas.
// They exist because of a real bug: a frame drawn before the canvas had been measured built a grid
// of zero-length lines, cached it as done, and left the viewport black until something else asked
// for a new frame.

import type { GridStyle } from '../core/types'
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

/**
 * What was built is remembered under this key. The size is part of it because a panel that grew
 * needs more grid, and the zoom is part of it because the very first frame uses a stand-in camera
 * whose zoom is 1 — a grid built for that must not be mistaken for the real one.
 */
export const gridKey = (majorStep: number, size: ViewSize, zoom = 1, style: GridStyle = 'lines'): string =>
  `${majorStep}|${size.width}x${size.height}|${zoom}|${style}`

/** The styles in the order every picker lists them, with the word a student sees. "Off" is `showGrid: false`, not a style. */
export const GRID_STYLES: { id: GridStyle; label: string; hint: string }[] = [
  { id: 'lines', label: 'Lines', hint: 'Squared, with a heavier line every few squares' },
  { id: 'dots', label: 'Dots', hint: 'A dot at each crossing and nothing else, so the drawing stands out' },
  { id: 'fine', label: 'Fine', hint: 'Squares half the size, for detailed work' },
  { id: 'paper', label: 'Paper', hint: 'Squared paper: lines on a tinted page' }
]

/** Flat xyz triples: line ends for `minor` and `major` (two per line), one point per dot. */
export interface GridVertices {
  minor: number[]
  major: number[]
  dots: number[]
}

/**
 * The grid for one style over one area, as vertex lists. Lines: a minor line every `minor`, a
 * major line every `major`. Dots: nothing but a dot at every minor crossing, so the drawing shows
 * through. Fine: the minor step halved, for a drawing that needs finer squares than the zoom
 * gives. Paper: the same lines as 'lines' — the paper tint is the canvas colour, not a vertex.
 */
export function gridVertices(style: GridStyle, area: GridArea, major: number, minor: number, z = 0): GridVertices {
  const out: GridVertices = { minor: [], major: [], dots: [] }
  const step = style === 'fine' ? minor / 2 : minor
  const x0 = Math.ceil(area.xMin / step)
  const x1 = Math.floor(area.xMax / step)
  const y0 = Math.ceil(area.yMin / step)
  const y1 = Math.floor(area.yMax / step)
  if (style === 'dots') {
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) out.dots.push(i * step, j * step, z)
    return out
  }
  for (let i = x0; i <= x1; i++) out.minor.push(i * step, area.yMin, z, i * step, area.yMax, z)
  for (let j = y0; j <= y1; j++) out.minor.push(area.xMin, j * step, z, area.xMax, j * step, z)
  for (let i = Math.ceil(area.xMin / major); i <= Math.floor(area.xMax / major); i++) out.major.push(i * major, area.yMin, z, i * major, area.yMax, z)
  for (let j = Math.ceil(area.yMin / major); j <= Math.floor(area.yMax / major); j++) out.major.push(area.xMin, j * major, z, area.xMax, j * major, z)
  return out
}
