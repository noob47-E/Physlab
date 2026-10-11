// Visualizing shaded areas, definite integrals, probability density regions, discrete dots, and number lines.
// Pure moves from core/visualize.ts (CW10f).

import { Builder } from '../factory'
import { scene } from '../store'
import { betweenArea } from '../../math/graphs'
import { fmtLabel } from '../../math/format'
import { POINT_PX } from '../../render/viewMath'
import { seriesColor, themeColor } from '../../app/theme'
import type { SceneObject } from '../types'
import { clearTagged, curveOf, frameAround, inGraphing, precision, remember, stretchOf } from './curves'


/**
 * The region between y = upper and y = lower for x from a to b: both curves in full, the region
 * shaded between them, and its area written in the middle of it in the student's precision.
 * Returns the area so the caller can say it in words too. `hideArea` leaves the "area =" label
 * off, for a question that asks for exactly that area and has not been answered yet.
 */
export function visualizeBetween(upper: string, lower: string, a: number, bnd: number, label?: string, hideArea = false): number {
  const lo = Math.min(a, bnd)
  const hi = Math.max(a, bnd)
  const s = precision()
  if (lo === hi) throw new Error(`The region needs a stretch of x: from and to are the same x, ${fmtLabel(lo, s)}.`)
  const u = curveOf(upper)
  const l = curveOf(lower)
  const area = betweenArea(u, l, lo, hi)
  if (!Number.isFinite(area)) throw new Error(`A curve runs off to infinity between x = ${fmtLabel(lo, s)} and ${fmtLabel(hi, s)}, so the region has no area.`)
  clearTagged('calculus')
  const b = new Builder()
  b.graph({ kind: 'explicit', source: `y = ${upper}`, exprs: [upper], showRoots: false, showExtrema: false })
  b.graph({ kind: 'explicit', source: `y = ${lower}`, exprs: [lower], showRoots: false, showExtrema: false })
  // The source is the bar's own spelling, so editing it in Properties re-runs it; a caption the
  // caller wants (a question's own words) is the label, never the source.
  const region = b.graph(
    { kind: 'between', source: `between(${upper}, ${lower}, ${String(lo)}, ${String(hi)})`, exprs: [upper, lower], tMin: lo, tMax: hi },
    { color: themeColor('--accent', '#4f8cff'), name: 'region' }
  )
  if (label) region.label = label
  // The label sits at the middle of the region's width, halfway between the curves there; where a
  // curve has no value in the middle it sits on the axis rather than nowhere.
  const xm = (lo + hi) / 2
  const um = u(xm)
  const lm = l(xm)
  const ym = Number.isFinite(um) && Number.isFinite(lm) ? (um + lm) / 2 : 0
  if (!hideArea) {
    const areaText = b.text([xm, ym, 0], `area = ${fmtLabel(area, s)}`, { name: 'areaText' })
    areaText.owner = region.id
    inGraphing(areaText)
  }
  b.commit()
  remember('calculus', b)
  scene().setViewMode('2d')
  return area
}

/** f(x) with the area between the curve and the x-axis from a to b shaded (integral visualisation). */
export function visualizeArea(expr: string, a: number, bnd: number, label: string): void {
  clearTagged('calculus')
  const b = new Builder()
  b.graph({ kind: 'explicit', source: `y = ${expr}`, exprs: [expr], showRoots: false, showExtrema: false })
  b.graph({ kind: 'area', source: label, exprs: [expr], tMin: Math.min(a, bnd), tMax: Math.max(a, bnd) }, { color: themeColor('--accent', '#4f8cff'), name: 'area' })
  b.commit()
  remember('calculus', b)
  scene().setViewMode('2d')
}


/** The standard normal density: every normal picture is drawn on the z scale, where it is this curve. */
const NORMAL_PDF = 'exp(-x^2 / 2) / sqrt(2 * pi)'

/**
 * How many times taller than the density the bell is drawn. On the z scale the density peaks at
 * 0.4 over a bell 8 wide, and at one zoom for both axes that is a line lying along the axis (it
 * read as a flat blue stripe in the browser check); five times taller it peaks at 2 and has the
 * textbook shape. The probability is still the shaded part as a fraction of the whole bell, and
 * the note and the label say the probability itself.
 */
export const NORMAL_STRETCH = 5

/**
 * How far out an open tail counts, in standard deviations. The area past 6σ is below 10⁻⁹, so
 * P(X < 65) worked out from 6σ below the mean is the probability to every digit a student is shown.
 */
const NORMAL_TAIL = 6

/** The drawn bell runs this far each side; past 4σ it is flat against the axis anyway, and the shading stops there too. */
const NORMAL_SPAN = 4

const standardPdf = (z: number): number => Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI)

/**
 * A normal distribution with mean and sd, with the region from `from` to `to` shaded (an end left
 * out is that whole tail). Drawn on the z scale — z = (x − mean) ÷ sd — because the density of
 * N(50, 10²) peaks at 0.04 beside its own 60-wide axis; on the z scale, drawn NORMAL_STRETCH times
 * taller, it is the textbook bell. The returned area is the probability itself, worked out on the
 * density, never on the stretched drawing. The mean and the ends are labelled under the axis in
 * the question's own numbers. `hideArea` leaves the probability label off for a question that asks
 * for exactly that probability.
 */
export function visualizeNormal(mean: number, sd: number, from?: number, to?: number, hideArea = false): { area: number; zFrom: number; zTo: number } {
  if (!(sd > 0) || !Number.isFinite(mean)) throw new Error('A normal curve needs a mean and a standard deviation above 0.')
  const s = precision()
  const z = (x: number | undefined, tail: number): number => (x === undefined ? tail : Math.max(-NORMAL_TAIL, Math.min(NORMAL_TAIL, (x - mean) / sd)))
  if (from !== undefined && to !== undefined && !(from < to)) throw new Error('The shaded region needs its start below its end.')
  const zFrom = z(from, -NORMAL_TAIL)
  const zTo = z(to, NORMAL_TAIL)
  // Both ends past 6σ on one side (P(X > 120) for N(50, 10²)) leave nothing to shade: the
  // probability is below 10⁻⁹, 0 at any precision shown. The bell is drawn with no region; this
  // used to throw a sentence about the drawing for a question that is perfectly valid.
  const area = zTo > zFrom ? betweenArea(standardPdf, () => 0, zFrom, zTo, 4000) : 0
  const bell = `${NORMAL_STRETCH} * ${NORMAL_PDF}`
  const height = (zz: number): number => NORMAL_STRETCH * standardPdf(zz)
  // The shading is drawn over the bell's own stretch; past 4σ it would be a hairline on the axis
  // that only widens the framing.
  const lo = Math.max(zFrom, -NORMAL_SPAN)
  const hi = Math.min(zTo, NORMAL_SPAN)
  clearTagged('calculus')
  const b = new Builder()
  b.graph(stretchOf(bell, -NORMAL_SPAN, NORMAL_SPAN), { name: 'normal' })
  const region =
    hi > lo
      ? b.graph({ kind: 'between', source: `between(${bell}, 0, ${String(lo)}, ${String(hi)})`, exprs: [bell, '0'], tMin: lo, tMax: hi }, { color: themeColor('--accent', '#4f8cff'), name: 'region' })
      : undefined
  const owned = <T extends SceneObject>(o: T): T => {
    if (region) (o as SceneObject & { owner?: string }).owner = region.id
    return inGraphing(o)
  }
  // Labels sit just under the axis, at the mean and at each end the question names.
  const under = -0.12 * height(0)
  owned(b.text([0, under, 0], `mean ${fmtLabel(mean, s)}`, { name: 'meanText', auxiliary: true }))
  for (const x of [from, to]) {
    if (x === undefined) continue
    const at = z(x, 0)
    if (Math.abs(at) < 1e-9) continue
    // Level with the mean's label unless it would print over it; two rows down fell below the
    // framed drawing in the browser check and was cut off.
    const row = Math.abs(at) < 1 ? under * 2 : under
    owned(b.text([Math.max(-NORMAL_SPAN, Math.min(NORMAL_SPAN, at)), row, 0], fmtLabel(x, s), { name: 'endText', auxiliary: true }))
  }
  if (!hideArea && region) {
    const zm = (lo + hi) / 2
    owned(b.text([zm, height(zm) / 2, 0], `probability = ${fmtLabel(area, s)}`, { name: 'areaText' }))
  }
  b.commit()
  remember('calculus', b)
  scene().setViewMode('2d')
  return { area, zFrom, zTo }
}


/**
 * `count` dots in rows of `perRow`, one unit apart, left to right and row by row: something to
 * count, as a first-look question asks. The dots carry no labels — a label would count them.
 * Every dot sits in the middle of a grid square (x and y at 0.5, 1.5, 2.5 …), off both axes and
 * off every grid crossing: a dot on x = 0 or y = 0 would sit on a numbered tick, and a learner
 * reading that tick's label would count the dots one short; a dot on a crossing, over a whole-number
 * tick, lets the axis number be read instead of the dots counted. Each dot is drawn twice the size of
 * an ordinary point, so it cannot pass for a grid intersection.
 */
export function visualizeDots(count: number, perRow: number): void {
  clearTagged('dots')
  const b = new Builder()
  const color = themeColor('--series-1', '#4dabf7')
  const at: [number, number][] = []
  for (let k = 0; k < count; k++) {
    const p: [number, number] = [0.5 + (k % perRow), 0.5 + Math.floor(k / perRow)]
    at.push(p)
    const dot = b.point([p[0], p[1], 0], { name: 'dot', color, showLabel: false })
    dot.size = 2 * POINT_PX.free
    inGraphing(dot)
  }
  b.commit(false)
  remember('dots', b)
  scene().setViewMode('2d')
  if (at.length) frameAround(at)
}


/**
 * The given quantities as marks on one number line that runs through 0 (the axis labels it), each labelled with its name,
 * value and unit. Labels alternate between two heights so two close values do not print over each
 * other. The line is a segment between two hidden points, not a graph, so it stops at the marks.
 */
export function visualizeNumberLine(items: { label: string; value: number }[]): void {
  if (!items.length) throw new Error('This question gives no numbers PhysLab could put on a number line.')
  clearTagged('numberline')
  const values = items.map((it) => it.value)
  const lo = Math.min(0, ...values)
  const hi = Math.max(0, ...values)
  const span = hi - lo || Math.max(1, Math.abs(hi))
  // A label is centred on its mark, so the end marks need room for half a label each side:
  // at 8 % the two end labels ran off the framed drawing in the browser check.
  const pad = span * 0.15
  const b = new Builder()
  const faint = themeColor('--text-faint', '#6c707a')
  const ends = [lo - pad, hi + pad].map((x) => inGraphing(b.point([x, 0, 0], { auxiliary: true, visible: false })).id)
  inGraphing(b.segment(ends[0], ends[1], { name: 'numberLine', color: faint, auxiliary: true }))
  const lift = span * 0.05
  const sorted = items.map((it, i) => ({ ...it, i })).sort((p, q) => p.value - q.value)
  sorted.forEach((it, k) => {
    inGraphing(b.point([it.value, 0, 0], { name: 'mark', color: seriesColor(it.i), showLabel: false }))
    inGraphing(b.text([it.value, lift * (1 + (k % 2)), 0], it.label, { name: 'markText', auxiliary: true }))
  })
  b.commit(false)
  remember('numberline', b)
  scene().setViewMode('2d')
  frameAround([[lo - pad, -lift], [hi + pad, lift * 3]])
}

