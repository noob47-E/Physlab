// Turning readings and a fit into the three arrays uPlot wants.
//
// uPlot draws every series against one shared x axis, so the readings and the fitted curve have to
// share it. The readings sit at the x values that were measured; the curve needs many more x values
// than that to look like a curve rather than a few joined-up straight bits. The shared axis is both
// sets of x values merged in order, with the series that has nothing at a given x holding null.

import type { Fit } from './fit'

export interface ChartSeries {
  /** The shared x axis, in order. */
  x: number[]
  /** The measured points; null where this x belongs to the curve only. */
  points: (number | null)[]
  /** The fitted curve; empty when there is no fit. */
  curve: (number | null)[]
}

const SMOOTH_STEPS = 120

export function chartSeries(xs: number[], ys: number[], fit: Fit | null): ChartSeries {
  const measured = xs.map((x, i) => ({ x, y: ys[i] })).sort((a, b) => a.x - b.x)
  if (!fit || measured.length === 0) {
    return { x: measured.map((p) => p.x), points: measured.map((p) => p.y), curve: [] }
  }

  const lo = measured[0].x
  const hi = measured[measured.length - 1].x
  const span = hi - lo
  const dense: number[] = []
  if (span > 0) {
    for (let i = 0; i <= SMOOTH_STEPS; i++) dense.push(lo + (span * i) / SMOOTH_STEPS)
  }

  // Merge the two sorted lists, keeping a measured x whenever one exists at that position.
  const entries: { x: number; y: number | null }[] = []
  let mi = 0
  let di = 0
  while (mi < measured.length || di < dense.length) {
    const nextM = mi < measured.length ? measured[mi].x : Infinity
    const nextD = di < dense.length ? dense[di] : Infinity
    // A dense point at the same place would only repeat this x — and floating point can put it
    // one ulp on either side of the reading, so the test is relative and decided before the
    // branch: 3e-9 used to get a curve point at 2.9999999999999996e-9 right beside it.
    const same = mi < measured.length && di < dense.length && Math.abs(nextD - nextM) <= 1e-9 * Math.max(Math.abs(nextM), Number.MIN_VALUE)
    if (same || nextM < nextD) {
      entries.push({ x: nextM, y: measured[mi].y })
      mi++
      if (same) di++
    } else {
      entries.push({ x: nextD, y: null })
      di++
    }
  }

  return {
    x: entries.map((e) => e.x),
    points: entries.map((e) => e.y),
    curve: entries.map((e) => {
      const v = fit.predict(e.x)
      return Number.isFinite(v) ? v : null
    })
  }
}

/** The residual at each measured x, for the strip under the graph. */
export function residualSeries(xs: number[], fit: Fit | null): { x: number[]; e: number[] } {
  if (!fit) return { x: [], e: [] }
  const pairs = xs.map((x, i) => ({ x, e: fit.residuals[i] })).sort((a, b) => a.x - b.x)
  return { x: pairs.map((p) => p.x), e: pairs.map((p) => p.e) }
}
