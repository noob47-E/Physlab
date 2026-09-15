// Split a composite polygon into simple shapes (rectangles, triangles, trapeziums …) with cut lines.

import { cross, dist, sub, type V3 } from './vec'
import { polygonArea, signedArea2D } from './geometry'
import { classifyPolygon, cleanPolygon, type ShapeClass, type ShapeKind } from './shapes'

export interface Part {
  pts: V3[]
  cls: ShapeClass
  area: number
}

export interface Decomposition {
  parts: Part[]
  /** Shared edges between parts (drawn as dashed gap lines). */
  cuts: [V3, V3][]
}

const EPS = 1e-9

const PENALTY: Record<ShapeKind, number> = {
  square: 0,
  rectangle: 0,
  'right-isosceles-triangle': 1,
  'right-triangle': 1,
  'equilateral-triangle': 1.5,
  'isosceles-triangle': 2,
  'scalene-triangle': 2.5,
  parallelogram: 2,
  rhombus: 2,
  'isosceles-trapezium': 2.5,
  trapezium: 2.5,
  kite: 3,
  'regular-polygon': 3,
  polygon: 20
}

/** Shapes a student has a formula for. */
const SIMPLE = new Set<ShapeKind>(Object.keys(PENALTY).filter((k) => k !== 'polygon') as ShapeKind[])

const toCCW = (pts: V3[]) => (signedArea2D(pts) < 0 ? [...pts].reverse() : pts)

function makePart(pts: V3[]): Part {
  const clean = cleanPolygon(pts)
  return { pts: clean, cls: classifyPolygon(clean, 0.5, 0.005), area: polygonArea(clean) }
}

function segmentsCross(a: V3, b: V3, c: V3, d: V3): boolean {
  const o = (p: V3, q: V3, r: V3) => cross(sub(q, p), sub(r, p))[2]
  const d1 = o(c, d, a)
  const d2 = o(c, d, b)
  const d3 = o(a, b, c)
  const d4 = o(a, b, d)
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))
}

function pointInPolygon(p: V3, pts: V3[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

/** Is the diagonal i–j strictly inside the polygon? */
function validDiagonal(pts: V3[], i: number, j: number): boolean {
  const n = pts.length
  if (Math.abs(i - j) <= 1 || Math.abs(i - j) === n - 1) return false
  const a = pts[i]
  const b = pts[j]
  for (let k = 0; k < n; k++) {
    const c = pts[k]
    const d = pts[(k + 1) % n]
    if (k === i || k === j || (k + 1) % n === i || (k + 1) % n === j) continue
    if (segmentsCross(a, b, c, d)) return false
  }
  // Also reject diagonals that pass exactly through another vertex.
  for (let k = 0; k < n; k++) {
    if (k === i || k === j) continue
    const p = pts[k]
    if (Math.abs(cross(sub(b, a), sub(p, a))[2]) < EPS * Math.max(1, dist(a, b)) && dist(a, p) + dist(p, b) - dist(a, b) < 1e-9) return false
  }
  const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0]
  return pointInPolygon(mid, pts)
}

/** All triangulations of a simple polygon (vertex-index triples). Limited to small n. */
function triangulations(pts: V3[], limit = 2000): number[][][] {
  const n = pts.length
  const memo = new Map<string, number[][][]>()
  const ok = (i: number, j: number) => (j - i === 1 || (i === 0 && j === n - 1) ? true : validDiagonal(pts, i, j))
  const rec = (i: number, j: number): number[][][] => {
    if (j - i < 2) return [[]]
    const key = `${i},${j}`
    const hit = memo.get(key)
    if (hit) return hit
    const out: number[][][] = []
    for (let k = i + 1; k < j; k++) {
      if (!ok(i, k) || !ok(k, j)) continue
      const tri = [i, k, j]
      if (Math.abs(signedArea2D([pts[i], pts[k], pts[j]])) < EPS) continue
      for (const left of rec(i, k)) {
        for (const right of rec(k, j)) {
          out.push([...left, tri, ...right])
          if (out.length >= limit) break
        }
        if (out.length >= limit) break
      }
    }
    memo.set(key, out)
    return out
  }
  return rec(0, n - 1)
}

/** Merge two polygons (index lists into `pts`) that share exactly one edge. */
function mergeShared(a: number[], b: number[]): number[] | null {
  for (let i = 0; i < a.length; i++) {
    const p = a[i]
    const q = a[(i + 1) % a.length]
    const j = b.findIndex((v, k) => v === q && b[(k + 1) % b.length] === p)
    if (j < 0) continue
    // Walk a from q back round to p, then b from p (after q) round to q.
    const out: number[] = []
    for (let k = 0; k < a.length; k++) out.push(a[(i + 1 + k) % a.length])
    for (let k = 2; k < b.length; k++) out.push(b[(j + k) % b.length])
    return out
  }
  return null
}

function score(parts: Part[]): number {
  return parts.length * 10 + parts.reduce((s, p) => s + PENALTY[p.cls.kind], 0)
}

function greedyMerge(pts: V3[], tris: number[][]): number[][] {
  let polys = tris.map((t) => [...t])
  let improved = true
  while (improved) {
    improved = false
    let best: { i: number; j: number; merged: number[]; penalty: number } | null = null
    for (let i = 0; i < polys.length; i++) {
      for (let j = i + 1; j < polys.length; j++) {
        const merged = mergeShared(polys[i], polys[j])
        if (!merged) continue
        const part = makePart(merged.map((k) => pts[k]))
        if (!part.cls.convex || !SIMPLE.has(part.cls.kind)) continue
        const penalty = PENALTY[part.cls.kind]
        if (!best || penalty < best.penalty) best = { i, j, merged, penalty }
      }
    }
    if (best) {
      polys = polys.filter((_, k) => k !== best!.i && k !== best!.j)
      polys.push(best.merged)
      improved = true
    }
  }
  return polys
}

/** Rectilinear polygons: slice into horizontal (or vertical) slabs and merge equal neighbours. */
function rectilinear(pts: V3[], vertical: boolean): V3[][] {
  const P = vertical ? pts.map((p) => [p[1], p[0], 0] as V3) : pts
  const ys = [...new Set(P.map((p) => +p[1].toFixed(9)))].sort((a, b) => a - b)
  const rects: { x0: number; x1: number; y0: number; y1: number }[] = []
  for (let s = 0; s < ys.length - 1; s++) {
    const y = (ys[s] + ys[s + 1]) / 2
    const xs: number[] = []
    for (let i = 0; i < P.length; i++) {
      const a = P[i]
      const b = P[(i + 1) % P.length]
      if (a[1] > y !== b[1] > y) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]))
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const prev = rects.find((r) => Math.abs(r.x0 - xs[k]) < 1e-9 && Math.abs(r.x1 - xs[k + 1]) < 1e-9 && Math.abs(r.y1 - ys[s]) < 1e-9)
      if (prev) prev.y1 = ys[s + 1]
      else rects.push({ x0: xs[k], x1: xs[k + 1], y0: ys[s], y1: ys[s + 1] })
    }
  }
  return rects.map((r) => {
    const q: V3[] = [[r.x0, r.y0, 0], [r.x1, r.y0, 0], [r.x1, r.y1, 0], [r.x0, r.y1, 0]]
    return vertical ? q.map((p) => [p[1], p[0], 0] as V3).reverse() : q
  })
}

function sharedEdges(parts: V3[][]): [V3, V3][] {
  const cuts: [V3, V3][] = []
  const onSegment = (p: V3, a: V3, b: V3) => Math.abs(cross(sub(b, a), sub(p, a))[2]) < 1e-9 * Math.max(1, dist(a, b)) && dist(a, p) + dist(p, b) - dist(a, b) < 1e-9
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const A = parts[i]
      const B = parts[j]
      for (let e = 0; e < A.length; e++) {
        const a0 = A[e]
        const a1 = A[(e + 1) % A.length]
        for (let f = 0; f < B.length; f++) {
          const b0 = B[f]
          const b1 = B[(f + 1) % B.length]
          // Overlap of two collinear edges.
          const cand = [a0, a1, b0, b1].filter((p) => onSegment(p, a0, a1) && onSegment(p, b0, b1))
          const uniq = cand.filter((p, k) => cand.findIndex((q) => dist(p, q) < 1e-9) === k)
          if (uniq.length >= 2 && dist(uniq[0], uniq[1]) > 1e-9) cuts.push([uniq[0], uniq[1]])
        }
      }
    }
  }
  return cuts
}

/** Best decomposition of a simple polygon into shapes with known area formulas. */
export function decompose(input: V3[]): Decomposition {
  const pts = toCCW(cleanPolygon(input.map((p) => [p[0], p[1], 0] as V3)))
  const whole = makePart(pts)
  if (pts.length < 3) return { parts: [whole], cuts: [] }
  if (SIMPLE.has(whole.cls.kind) && pts.length <= 4) return { parts: [whole], cuts: [] }

  const candidates: V3[][][] = []
  if (whole.cls.rectilinear) {
    candidates.push(rectilinear(pts, false), rectilinear(pts, true))
  }
  if (pts.length <= 10) {
    for (const tri of triangulations(pts)) {
      candidates.push(greedyMerge(pts, tri).map((poly) => poly.map((k) => pts[k])))
    }
  } else {
    const tri = triangulations(pts, 1)[0]
    if (tri) candidates.push(greedyMerge(pts, tri).map((poly) => poly.map((k) => pts[k])))
  }
  if (!candidates.length) return { parts: [whole], cuts: [] }

  let best: Part[] = candidates[0].map(makePart)
  for (const c of candidates.slice(1)) {
    const parts = c.map(makePart)
    if (score(parts) < score(best)) best = parts
  }
  return { parts: best, cuts: sharedEdges(best.map((p) => p.pts)) }
}
