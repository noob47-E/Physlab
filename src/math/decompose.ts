// Split a composite polygon into simple shapes with cut lines.
//
// Two goals:
//   'basic'   — rectangles, squares and triangles only (the formulas a student meets first).
//   'formula' — also trapeziums, parallelograms, kites … (fewer pieces, harder formulas).
//
// Cuts may add new corners: a right trapezium only becomes a rectangle plus a right triangle
// if a new point is dropped on one of its sides.

import { cross, dist, sub, type V3 } from './vec'
import { polygonArea, signedArea2D } from './geometry'
import { classifyPolygon, cleanPolygon, type ShapeClass, type ShapeKind } from './shapes'

export interface Part {
  pts: V3[]
  cls: ShapeClass
  area: number
}

export type DecomposeGoal = 'basic' | 'formula'

export interface Decomposition {
  parts: Part[]
  /** Shared edges between parts (drawn as dashed gap lines). */
  cuts: [V3, V3][]
  /** Corners that are not vertices of the original shape, so they need new letters. */
  newPoints: V3[]
  /** How many different splits were found; the caller can cycle through them. */
  alternatives: number
}

const EPS = 1e-9
const SNAP = 1e-7

/** Cost of each shape when anything with an area formula is allowed. */
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

/** Cost when only rectangles, squares and triangles count. */
const BASIC: Partial<Record<ShapeKind, number>> = {
  square: 0,
  rectangle: 0,
  'right-isosceles-triangle': 0.8,
  'right-triangle': 1,
  'equilateral-triangle': 1.4,
  'isosceles-triangle': 1.6,
  // A scalene triangle needs a constructed height or Heron's formula, so prefer a rectangle.
  'scalene-triangle': 7
}

/** Shapes a student has a formula for. */
const SIMPLE = new Set<ShapeKind>(Object.keys(PENALTY).filter((k) => k !== 'polygon') as ShapeKind[])

const accepts = (kind: ShapeKind, goal: DecomposeGoal) => (goal === 'basic' ? kind in BASIC : SIMPLE.has(kind))
const penaltyOf = (kind: ShapeKind, goal: DecomposeGoal) => (goal === 'basic' ? BASIC[kind] ?? 20 : PENALTY[kind])

const toCCW = (pts: V3[]) => (signedArea2D(pts) < 0 ? [...pts].reverse() : pts)
const round9 = (v: number) => Math.round(v * 1e9) / 1e9

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

/** Merge two polygons (index lists into a shared vertex array) that share exactly one edge. */
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

// ---------------------------------------------------------------------------
// Slab cutting — the only way to get a rectangle + triangle out of a trapezium
// ---------------------------------------------------------------------------

/** Rotate so a direction with cos = c, sin = s lands on the +x axis (and back). */
const rot = (p: V3, c: number, s: number): V3 => [p[0] * c + p[1] * s, -p[0] * s + p[1] * c, 0]
const unrot = (p: V3, c: number, s: number): V3 => [p[0] * c - p[1] * s, p[0] * s + p[1] * c, 0]

/**
 * A slab with no vertex inside it is a trapezoid with two vertical sides: take the widest
 * rectangle inside it, plus the right triangle left over below and above.
 */
function trapezoidPieces(x0: number, x1: number, yb0: number, yb1: number, yt0: number, yt1: number): V3[][] {
  const out: V3[][] = []
  const lo = Math.max(yb0, yb1)
  const hi = Math.min(yt0, yt1)
  const at = (x: number, y: number): V3 => [x, y, 0]
  if (hi - lo > SNAP) out.push([at(x0, lo), at(x1, lo), at(x1, hi), at(x0, hi)])
  if (Math.abs(yb1 - yb0) > SNAP) {
    out.push(yb0 < yb1 ? [at(x0, yb0), at(x1, yb1), at(x0, yb1)] : [at(x0, yb0), at(x1, yb1), at(x1, yb0)])
  }
  if (Math.abs(yt1 - yt0) > SNAP) {
    out.push(yt0 > yt1 ? [at(x0, yt0), at(x1, yt1), at(x0, yt1)] : [at(x0, yt0), at(x1, yt1), at(x1, yt0)])
  }
  return out
}

/** Cut the polygon with lines perpendicular to `dir` through every vertex, then split each slab. */
function slabPieces(pts: V3[], dir: V3): V3[][] | null {
  const l = Math.hypot(dir[0], dir[1])
  if (l < SNAP) return null
  const c = dir[0] / l
  const s = dir[1] / l
  const P = pts.map((p) => rot(p, c, s))
  const xs = [...new Set(P.map((p) => round9(p[0])))].sort((a, b) => a - b)
  const out: V3[][] = []
  for (let k = 0; k + 1 < xs.length; k++) {
    const x0 = xs[k]
    const x1 = xs[k + 1]
    if (x1 - x0 < 1e-6) continue
    const xm = (x0 + x1) / 2
    const hits: { a: V3; b: V3; y: number }[] = []
    for (let i = 0; i < P.length; i++) {
      const a = P[i]
      const b = P[(i + 1) % P.length]
      if (a[0] > xm === b[0] > xm) continue
      hits.push({ a, b, y: a[1] + ((xm - a[0]) * (b[1] - a[1])) / (b[0] - a[0]) })
    }
    if (hits.length < 2 || hits.length % 2 !== 0) return null
    hits.sort((p, q) => p.y - q.y)
    const yAt = (e: { a: V3; b: V3 }, x: number) => e.a[1] + ((x - e.a[0]) * (e.b[1] - e.a[1])) / (e.b[0] - e.a[0])
    for (let h = 0; h + 1 < hits.length; h += 2) {
      const bottom = hits[h]
      const top = hits[h + 1]
      for (const piece of trapezoidPieces(x0, x1, yAt(bottom, x0), yAt(bottom, x1), yAt(top, x0), yAt(top, x1))) {
        out.push(piece.map((p) => unrot(p, c, s)))
      }
    }
  }
  return out.length ? out : null
}

/** Directions worth slicing along: the axes plus every edge direction and its perpendicular. */
function cutDirections(pts: V3[]): V3[] {
  const dirs: V3[] = [
    [1, 0, 0],
    [0, 1, 0]
  ]
  for (let i = 0; i < pts.length; i++) {
    const d = sub(pts[(i + 1) % pts.length], pts[i])
    const l = Math.hypot(d[0], d[1])
    if (l < SNAP) continue
    const u: V3 = [d[0] / l, d[1] / l, 0]
    const v: V3 = [-u[1], u[0], 0]
    for (const w of [u, v]) {
      if (!dirs.some((e) => Math.abs(e[0] * w[1] - e[1] * w[0]) < 1e-6)) dirs.push(w)
    }
  }
  return dirs
}

// ---------------------------------------------------------------------------
// Merging the pieces back into as few simple shapes as possible
// ---------------------------------------------------------------------------

function mergePieces(pieces: V3[][], goal: DecomposeGoal): Part[] {
  const verts: V3[] = []
  const idx = (p: V3): number => {
    const i = verts.findIndex((q) => dist(p, q) < SNAP)
    if (i >= 0) return i
    verts.push([round9(p[0]), round9(p[1]), 0])
    return verts.length - 1
  }
  let polys = pieces
    .map((pc) => cleanPolygon(pc))
    .filter((pc) => pc.length >= 3 && Math.abs(signedArea2D(pc)) > 1e-9)
    .map((pc) => toCCW(pc).map(idx))

  let improved = true
  while (improved) {
    improved = false
    let best: { i: number; j: number; merged: number[]; penalty: number } | null = null
    for (let i = 0; i < polys.length; i++) {
      for (let j = i + 1; j < polys.length; j++) {
        const merged = mergeShared(polys[i], polys[j])
        if (!merged) continue
        const part = makePart(merged.map((k) => verts[k]))
        if (!part.cls.convex || !accepts(part.cls.kind, goal)) continue
        const penalty = penaltyOf(part.cls.kind, goal)
        if (!best || penalty < best.penalty) best = { i, j, merged, penalty }
      }
    }
    if (best) {
      polys = polys.filter((_, k) => k !== best!.i && k !== best!.j)
      polys.push(best.merged)
      improved = true
    }
  }
  return polys.map((p) => makePart(p.map((k) => verts[k])))
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

function score(parts: Part[], goal: DecomposeGoal, newPoints: number): number {
  return parts.length * 10 + parts.reduce((s, p) => s + penaltyOf(p.cls.kind, goal), 0) + newPoints * 0.5
}

/** Corners of the parts that are not corners of the original shape. */
function extraPoints(parts: Part[], original: V3[]): V3[] {
  const out: V3[] = []
  for (const part of parts) {
    for (const p of part.pts) {
      if (original.some((q) => dist(p, q) < SNAP)) continue
      if (out.some((q) => dist(p, q) < SNAP)) continue
      out.push(p)
    }
  }
  return out
}

/** Every way of splitting the shape, best first (fewest and simplest pieces). */
function allWays(pts: V3[], goal: DecomposeGoal): { parts: Part[]; newPoints: V3[] }[] {
  const candidates: V3[][][] = []
  for (const dir of cutDirections(pts)) {
    const pieces = slabPieces(pts, dir)
    if (pieces) candidates.push(pieces)
  }
  for (const tri of triangulations(pts, pts.length <= 10 ? 2000 : 1)) {
    candidates.push(tri.map((t) => t.map((k) => pts[k])))
  }

  const target = polygonArea(pts)
  const seen = new Set<string>()
  const ways: { parts: Part[]; newPoints: V3[]; cost: number }[] = []
  for (const pieces of candidates) {
    const parts = mergePieces(pieces, goal)
    if (!parts.length || parts.some((p) => p.area < 1e-9)) continue
    const total = parts.reduce((s, p) => s + p.area, 0)
    if (Math.abs(total - target) > 1e-6 * Math.max(1, target)) continue
    const newPoints = extraPoints(parts, pts)
    const key = parts
      .map((p) => `${p.cls.kind}:${p.area.toFixed(6)}`)
      .sort()
      .join('|')
    if (seen.has(key)) continue
    seen.add(key)
    ways.push({ parts, newPoints, cost: score(parts, goal, newPoints.length) })
  }
  ways.sort((a, b) => a.cost - b.cost)
  return ways.map(({ parts, newPoints }) => ({ parts, newPoints }))
}

/**
 * Best split of a simple polygon into shapes with known area formulas.
 * `index` picks another way of splitting it (the "Other way" button).
 */
export function decompose(input: V3[], goal: DecomposeGoal = 'basic', index = 0): Decomposition {
  const pts = toCCW(cleanPolygon(input.map((p) => [p[0], p[1], 0] as V3)))
  const whole = makePart(pts)
  const single: Decomposition = { parts: [whole], cuts: [], newPoints: [], alternatives: 1 }
  if (pts.length < 3) return single
  // Already one of the wanted shapes: nothing to split.
  if (accepts(whole.cls.kind, goal) && pts.length <= 4) return single

  const ways = allWays(pts, goal)
  if (!ways.length) return single
  const pick = ways[((index % ways.length) + ways.length) % ways.length]
  return {
    parts: pick.parts,
    cuts: sharedEdges(pick.parts.map((p) => p.pts)),
    newPoints: pick.newPoints,
    alternatives: ways.length
  }
}
