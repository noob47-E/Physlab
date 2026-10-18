// Where two drawn objects cross. The evaluator uses this for an intersection point and the
// viewport uses it to snap the cursor onto a crossing before the point exists, so the two agree
// on which crossing is number 0 and which is number 1: a point placed by snapping must land on
// the same crossing when the scene is worked out again.

import { circleCircleIntersection, lineCircleIntersection, lineLineIntersection, type GCircle, type GLine } from './geometry'
import type { Computed, GraphObj } from '../core/types'
import type { V3 } from './vec'
import { curveIntersections, keyPoints } from './graphs'
import { isNoise, sameNumber } from './noise'

/** The straight part of a line, segment, ray or vector, or null for anything else. */
export function asGLine(c: Computed): GLine | null {
  if (c.type === 'line' || c.type === 'segment' || c.type === 'ray') return c.line
  if (c.type === 'vector') return { kind: 'segment', p: c.tail, d: c.comp }
  return null
}

const isCurveLike = (c: Computed): boolean => !!asGLine(c) || c.type === 'circle' || (c.type === 'graph' && !!c.f)

/** Can these two be intersected at all (a line-like, circle, or 2-D graph on each side)? */
export const canIntersect = (a: Computed, b: Computed): boolean => isCurveLike(a) && isCurveLike(b)

/**
 * Every crossing of a and b, in a fixed order: one point for two lines, up to two for a line and
 * a circle (along the line's direction) or two circles (either side of the line of centres),
 * or curve-to-curve / curve-to-line intersections in ascending x order.
 * Segment and ray ends are respected. Empty when they do not meet or cannot be intersected.
 */
export function intersectionsOf(a: Computed, b: Computed, bounds?: { xMin?: number; xMax?: number; approx?: V3 }): V3[] {
  const la = asGLine(a)
  const lb = asGLine(b)
  if (la && lb) {
    const p = lineLineIntersection(la, lb)
    return p ? [p] : []
  }
  if (la && b.type === 'circle') return lineCircleIntersection(la, b.circle)
  if (a.type === 'circle' && lb) return lineCircleIntersection(lb, a.circle)
  if (a.type === 'circle' && b.type === 'circle') return circleCircleIntersection(a.circle, b.circle)

  if (a.type === 'circle' && b.type === 'graph' && b.f) {
    return circleGraphIntersections(a.circle, b.f, bounds, b.graph)
  }
  if (a.type === 'graph' && a.f && b.type === 'circle') {
    return circleGraphIntersections(b.circle, a.f, bounds, a.graph)
  }

  if (a.type === 'graph' && a.f && b.type === 'graph' && b.f) {
    return graphGraphIntersections(a.f, b.f, bounds, a.graph, b.graph)
  }

  if (la && b.type === 'graph' && b.f) {
    return lineGraphIntersections(la, b.f, bounds, b.graph)
  }
  if (a.type === 'graph' && a.f && lb) {
    return lineGraphIntersections(lb, a.f, bounds, a.graph)
  }

  return []
}

function graphGraphIntersections(
  f: (x: number) => number,
  g: (x: number) => number,
  bounds?: { xMin?: number; xMax?: number; approx?: V3 },
  graphA?: GraphObj,
  graphB?: GraphObj
): V3[] {
  let domLow = -Infinity
  let domHigh = Infinity
  if (graphA?.tMin !== undefined) domLow = Math.max(domLow, graphA.tMin)
  if (graphB?.tMin !== undefined) domLow = Math.max(domLow, graphB.tMin)
  if (graphA?.tMax !== undefined) domHigh = Math.min(domHigh, graphA.tMax)
  if (graphB?.tMax !== undefined) domHigh = Math.min(domHigh, graphB.tMax)

  if (domLow > domHigh) return []

  const testSinglePoint = (x: number): V3[] => {
    const yf = f(x)
    const yg = g(x)
    if (Number.isFinite(yf) && Number.isFinite(yg) && Math.abs(yf - yg) <= 1e-9 * Math.max(1, Math.abs(yf), Math.abs(yg))) {
      return [[x, (yf + yg) / 2, 0]]
    }
    return []
  }

  if (sameNumber(domLow, domHigh)) {
    return testSinglePoint(domLow)
  }

  if (bounds?.xMin !== undefined && bounds?.xMax !== undefined) {
    const low = Math.max(domLow, bounds.xMin)
    const high = Math.min(domHigh, bounds.xMax)
    if (low > high) return []
    if (sameNumber(low, high)) return testSinglePoint(low)
    const span = high - low
    const n = Math.min(8000, Math.max(1200, Math.round(span * 2)))
    const keys = curveIntersections(f, g, low, high, n)
    return keys.map((k) => [k.x, k.y, 0] as V3)
  }

  // Collect all crossings across multiple search windows, return in x-order.
  const allKeys: { x: number; y: number }[] = []
  const xValues = new Set<number>()
  const addKeys = (keys: { x: number; y: number }[]) => {
    for (const k of keys) {
      const nearX = Math.round(k.x * 1e6) / 1e6 // deduplicate near-duplicates
      if (!xValues.has(nearX)) {
        xValues.add(nearX)
        allKeys.push(k)
      }
    }
  }

  // Without explicit viewport bounds, start search around approx seed if present.
  const center = bounds?.approx?.[0]
  let approxLow = Infinity
  let approxHigh = -Infinity
  if (center !== undefined) {
    approxLow = Math.max(domLow, center - 1000)
    approxHigh = Math.min(domHigh, center + 1000)
    if (approxLow <= approxHigh) {
      if (sameNumber(approxLow, approxHigh)) {
        const pts = testSinglePoint(approxLow)
        addKeys(pts.map((p) => ({ x: p[0], y: p[1] })))
      } else {
        const span = approxHigh - approxLow
        const n = Math.min(8000, Math.max(1200, Math.round(span * 2)))
        const keys = curveIntersections(f, g, approxLow, approxHigh, n)
        addKeys(keys)
      }
    }
  }

  // Standard view span [-1000, 1000], skip if already covered by approx window
  const low = Math.max(domLow, -1000)
  const high = Math.min(domHigh, 1000)
  if (low <= high && !(center !== undefined && approxLow <= low && high <= approxHigh)) {
    if (sameNumber(low, high)) {
      const pts = testSinglePoint(low)
      addKeys(pts.map((p) => ({ x: p[0], y: p[1] })))
    } else {
      const span = high - low
      const n = Math.min(8000, Math.max(2000, Math.round(span * 2)))
      const keys = curveIntersections(f, g, low, high, n)
      addKeys(keys)
    }
  }

  // If no crossings found, expand search to ±10000
  if (allKeys.length === 0) {
    let wideLow = domLow > -Infinity ? domLow : -10000
    let wideHigh = domHigh < Infinity ? domHigh : 10000
    if (center !== undefined) {
      wideLow = Math.min(wideLow, center - 10000)
      wideHigh = Math.max(wideHigh, center + 10000)
    }
    wideLow = Math.max(domLow, wideLow)
    wideHigh = Math.min(domHigh, wideHigh)
    if (wideLow < wideHigh) {
      const wideKeys = curveIntersections(f, g, wideLow, wideHigh, 4000)
      addKeys(wideKeys)
    }
  }

  allKeys.sort((a, b) => a.x - b.x)
  return allKeys.map((k) => [k.x, k.y, 0] as V3)
}

export function circleGraphIntersections(
  circle: GCircle,
  f: (x: number) => number,
  bounds?: { xMin?: number; xMax?: number; approx?: V3 },
  graph?: GraphObj
): V3[] {
  const r = circle.r
  if (r <= 0 || !Number.isFinite(r)) return []
  const cx = circle.c[0]
  const cy = circle.c[1]

  let low = cx - r
  let high = cx + r

  if (bounds?.xMin !== undefined) low = Math.max(low, bounds.xMin)
  if (bounds?.xMax !== undefined) high = Math.min(high, bounds.xMax)
  if (graph?.tMin !== undefined) low = Math.max(low, graph.tMin)
  if (graph?.tMax !== undefined) high = Math.min(high, graph.tMax)

  if (low > high) return []

  const r2 = r * r
  const h = (x: number) => {
    const y = f(x)
    if (!Number.isFinite(y)) return NaN
    const dx = x - cx
    const dy = y - cy
    return dx * dx + dy * dy - r2
  }

  const span = high - low
  const n = Math.min(4000, Math.max(1200, Math.round(span * 40)))
  const keys = keyPoints(h, low, high, n)
  const pts: V3[] = []
  for (const k of keys) {
    if (k.kinds.includes('root')) {
      let x = k.x
      const nearInt = Math.round(x)
      if (Math.abs(x - nearInt) < 1e-5 && Number.isFinite(f(nearInt))) {
        if (Math.abs(x - nearInt) < 1e-7) {
          const yInt = f(nearInt)
          if (Number.isFinite(yInt)) {
            const d2Int = (nearInt - cx) ** 2 + (yInt - cy) ** 2
            if (Math.abs(d2Int - r2) <= 1e-11 * Math.max(1, r2)) {
              x = nearInt
            }
          }
        }
      }
      const y = f(x)
      if (!Number.isFinite(y)) continue
      const d2 = (x - cx) ** 2 + (y - cy) ** 2
      if (Math.abs(d2 - r2) <= Math.max(1e-4, 1e-4 * r2)) {
        pts.push([x, y, 0])
      }
    }
  }
  return pts
}

function lineGraphIntersections(
  line: GLine,
  f: (x: number) => number,
  bounds?: { xMin?: number; xMax?: number; approx?: V3 },
  graph?: GraphObj
): V3[] {
  if (isNoise(line.d[0], line.p[0])) {
    const x = line.p[0]
    if (graph?.tMin !== undefined && x < graph.tMin) return []
    if (graph?.tMax !== undefined && x > graph.tMax) return []
    const y = f(x)
    if (!Number.isFinite(y)) return []
    const dd = line.d[1]
    if (isNoise(dd)) return []
    const t = (y - line.p[1]) / dd
    if (line.kind === 'segment' && (t < 0 || t > 1) && !isNoise(t, 1) && !isNoise(t - 1, 1)) return []
    if (line.kind === 'ray' && t < 0 && !isNoise(t, 1)) return []
    return [[x, y, 0]]
  }

  const slope = line.d[1] / line.d[0]
  const g = (x: number) => line.p[1] + slope * (x - line.p[0])

  let domLow = -Infinity
  let domHigh = Infinity

  if (line.kind === 'segment') {
    const x0 = line.p[0]
    const x1 = line.p[0] + line.d[0]
    domLow = Math.min(x0, x1)
    domHigh = Math.max(x0, x1)
  } else if (line.kind === 'ray') {
    if (line.d[0] > 0) domLow = line.p[0]
    else domHigh = line.p[0]
  }

  if (graph?.tMin !== undefined) domLow = Math.max(domLow, graph.tMin)
  if (graph?.tMax !== undefined) domHigh = Math.min(domHigh, graph.tMax)

  if (domLow > domHigh) return []

  const testSinglePoint = (x: number): V3[] => {
    const yf = f(x)
    const yg = g(x)
    if (Number.isFinite(yf) && Number.isFinite(yg) && Math.abs(yf - yg) <= 1e-9 * Math.max(1, Math.abs(yf), Math.abs(yg))) {
      return [[x, (yf + yg) / 2, 0]]
    }
    return []
  }

  if (sameNumber(domLow, domHigh)) {
    return testSinglePoint(domLow)
  }

  if (bounds?.xMin !== undefined && bounds?.xMax !== undefined) {
    const low = Math.max(domLow, bounds.xMin)
    const high = Math.min(domHigh, bounds.xMax)
    if (low > high) return []
    if (sameNumber(low, high)) return testSinglePoint(low)
    const span = high - low
    const n = Math.min(8000, Math.max(1200, Math.round(span * 2)))
    const keys = curveIntersections(f, g, low, high, n)
    return keys.map((k) => [k.x, k.y, 0] as V3)
  }

  // Collect all crossings across multiple search windows, return in x-order.
  const allKeys: { x: number; y: number }[] = []
  const xValues = new Set<number>()
  const addKeys = (keys: { x: number; y: number }[]) => {
    for (const k of keys) {
      const nearX = Math.round(k.x * 1e6) / 1e6 // deduplicate near-duplicates
      if (!xValues.has(nearX)) {
        xValues.add(nearX)
        allKeys.push(k)
      }
    }
  }

  // Without explicit viewport bounds, start search around approx seed if present.
  const center = bounds?.approx?.[0]
  let approxLow = Infinity
  let approxHigh = -Infinity
  if (center !== undefined) {
    approxLow = Math.max(domLow, center - 1000)
    approxHigh = Math.min(domHigh, center + 1000)
    if (approxLow <= approxHigh) {
      if (sameNumber(approxLow, approxHigh)) {
        const pts = testSinglePoint(approxLow)
        addKeys(pts.map((p) => ({ x: p[0], y: p[1] })))
      } else {
        const span = approxHigh - approxLow
        const n = Math.min(8000, Math.max(1200, Math.round(span * 2)))
        const keys = curveIntersections(f, g, approxLow, approxHigh, n)
        addKeys(keys)
      }
    }
  }

  // Standard view span [-1000, 1000], skip if already covered by approx window
  const low = Math.max(domLow, -1000)
  const high = Math.min(domHigh, 1000)
  if (low <= high && !(center !== undefined && approxLow <= low && high <= approxHigh)) {
    if (sameNumber(low, high)) {
      const pts = testSinglePoint(low)
      addKeys(pts.map((p) => ({ x: p[0], y: p[1] })))
    } else {
      const span = high - low
      const n = Math.min(8000, Math.max(1200, Math.round(span * 2)))
      const keys = curveIntersections(f, g, low, high, n)
      addKeys(keys)
    }
  }

  // If no crossings found, expand search to ±10000
  if (allKeys.length === 0) {
    let wideLow = domLow > -Infinity ? domLow : -10000
    let wideHigh = domHigh < Infinity ? domHigh : 10000
    if (center !== undefined) {
      wideLow = Math.min(wideLow, center - 10000)
      wideHigh = Math.max(wideHigh, center + 10000)
    }
    wideLow = Math.max(domLow, wideLow)
    wideHigh = Math.min(domHigh, wideHigh)
    if (wideLow < wideHigh) {
      const wideKeys = curveIntersections(f, g, wideLow, wideHigh, 4000)
      addKeys(wideKeys)
    }
  }

  allKeys.sort((a, b) => a.x - b.x)
  return allKeys.map((k) => [k.x, k.y, 0] as V3)
}

/** Whether two objects represent the exact same curve (e.g. y = x typed twice). */
export function isSameCurve(idA: string, idB: string, a: Computed, b: Computed): boolean {
  if (idA === idB) return true
  if (a.type === 'graph' && b.type === 'graph') {
    // If they have domain restrictions, check whether their domains overlap in more than an isolated point.
    // If they only meet at endpoints (e.g. [0, 1] and [1, 2]), they are distinct segments that can intersect at that point.
    const minA = a.graph?.tMin ?? -Infinity
    const maxA = a.graph?.tMax ?? Infinity
    const minB = b.graph?.tMin ?? -Infinity
    const maxB = b.graph?.tMax ?? Infinity
    const overlapMin = Math.max(minA, minB)
    const overlapMax = Math.min(maxA, maxB)
    if (overlapMin > overlapMax || sameNumber(overlapMin, overlapMax)) {
      // Overlap is at most a single point or disjoint — they are not the same curve.
      return false
    }

    if (a.graph && b.graph) {
      const sA = a.graph.exprs[0]?.trim()
      const sB = b.graph.exprs[0]?.trim()
      if (sA && sB && sA === sB) return true
    }
    if (a.f && b.f) {
      const testXs = [0, 1, -1, 0.5, 2.7, -3.2, 10]
      let agree = 0
      for (const x of testXs) {
        if (x < overlapMin || x > overlapMax) continue
        const yf = a.f(x)
        const yg = b.f(x)
        if (Number.isFinite(yf) && Number.isFinite(yg)) {
          if (Math.abs(yf - yg) > 1e-9 * Math.max(1, Math.abs(yf), Math.abs(yg))) return false
          agree++
        }
      }
      if (agree >= 3) return true
    }
  }
  return false
}
