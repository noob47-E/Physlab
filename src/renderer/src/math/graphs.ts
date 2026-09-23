// Numeric sampling for the graphing calculator: explicit, implicit, parametric, inequalities, surfaces.

import type { V3 } from './vec'

export type Fx = (x: number) => number
export type Fxy = (x: number, y: number) => number

/** Samples y = f(x); breaks the curve at NaN/∞ and near vertical asymptotes. */
export function sampleExplicit(f: Fx, xMin: number, xMax: number, n: number, viewH: number): V3[][] {
  const polylines: V3[][] = []
  let cur: V3[] = []
  const dx = (xMax - xMin) / n
  let prevY = NaN
  const push = (x: number, y: number) => {
    if (!Number.isFinite(y) || Math.abs(y) > 1e7) {
      if (cur.length > 1) polylines.push(cur)
      cur = []
      prevY = NaN
      return
    }
    if (Number.isFinite(prevY) && Math.abs(y - prevY) > viewH * 1.5) {
      // Probe the middle: a real jump (asymptote) stays large on both halves.
      const xm = x - dx / 2
      const ym = f(xm)
      if (!Number.isFinite(ym) || (Math.abs(ym - prevY) > viewH * 0.75 && Math.abs(y - ym) > viewH * 0.75) || Math.abs(ym) > Math.max(Math.abs(y), Math.abs(prevY))) {
        if (cur.length > 1) polylines.push(cur)
        cur = []
      }
    }
    cur.push([x, y, 0])
    prevY = y
  }
  for (let i = 0; i <= n; i++) {
    const x = xMin + i * dx
    const y = f(x)
    // Refine steep regions for smooth curves.
    if (i > 0 && Number.isFinite(y) && Number.isFinite(prevY) && Math.abs(y - prevY) > viewH / 40 && Math.abs(y - prevY) < viewH * 1.5) {
      const sub = Math.min(16, Math.ceil(Math.abs(y - prevY) / (viewH / 40)))
      for (let k = 1; k < sub; k++) {
        const xs = x - dx + (dx * k) / sub
        push(xs, f(xs))
      }
    }
    push(x, y)
  }
  if (cur.length > 1) polylines.push(cur)
  return polylines
}

export interface KeyPoint {
  x: number
  y: number
  kind: 'root' | 'max' | 'min' | 'yIntercept'
}

function bisect(f: Fx, a: number, b: number, iters = 60): number {
  let fa = f(a)
  for (let i = 0; i < iters; i++) {
    const m = (a + b) / 2
    const fm = f(m)
    if (Math.sign(fm) === Math.sign(fa)) {
      a = m
      fa = fm
    } else b = m
  }
  return (a + b) / 2
}

function goldenExtremum(f: Fx, a: number, b: number, max: boolean): number {
  const g = (Math.sqrt(5) - 1) / 2
  const h = (x: number) => (max ? -f(x) : f(x))
  let c = b - g * (b - a)
  let d = a + g * (b - a)
  for (let i = 0; i < 80; i++) {
    if (h(c) < h(d)) b = d
    else a = c
    c = b - g * (b - a)
    d = a + g * (b - a)
  }
  return (a + b) / 2
}

/** Roots, local maxima/minima and the y-intercept inside [xMin, xMax]. */
export function keyPoints(f: Fx, xMin: number, xMax: number, n = 800): KeyPoint[] {
  const out: KeyPoint[] = []
  const dx = (xMax - xMin) / n
  const ys = Array.from({ length: n + 1 }, (_, i) => f(xMin + i * dx))
  const span = Math.max(1e-9, ...ys.filter(Number.isFinite).map(Math.abs))
  for (let i = 0; i < n; i++) {
    const x0 = xMin + i * dx
    const y0 = ys[i]
    const y1 = ys[i + 1]
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue
    if (y0 === 0) out.push({ x: x0, y: 0, kind: 'root' })
    else if (Math.sign(y0) !== Math.sign(y1) && y1 !== 0) {
      const r = bisect(f, x0, x0 + dx)
      // Reject sign changes caused by poles (|f| blows up instead of passing through 0).
      if (Math.abs(f(r)) < span * 1e-6 + 1e-9) out.push({ x: r, y: 0, kind: 'root' })
    }
    if (i > 0) {
      const yp = ys[i - 1]
      if (Number.isFinite(yp) && ((y0 > yp && y0 > y1) || (y0 < yp && y0 < y1))) {
        const max = y0 > yp
        const x = goldenExtremum(f, x0 - dx, x0 + dx, max)
        const y = f(x)
        if (Number.isFinite(y)) out.push({ x, y, kind: max ? 'max' : 'min' })
      }
    }
  }
  // The loop compares pairs, so a root exactly on the last sample is only seen here.
  if (ys[n] === 0) out.push({ x: xMax, y: 0, kind: 'root' })
  if (xMin <= 0 && xMax >= 0) {
    const y = f(0)
    if (Number.isFinite(y)) out.push({ x: 0, y, kind: 'yIntercept' })
  }
  // Deduplicate close points.
  return out.filter((p, i) => out.findIndex((q) => q.kind === p.kind && Math.abs(q.x - p.x) < dx) === i)
}

/**
 * The points a graph's name can be anchored to: the first polyline, or the first segment pair of
 * an implicit curve. A curve with nothing to draw (x² + y² = −1) has an empty segment list, and
 * returning [undefined] from here used to crash the label projection on every frame.
 */
export function labelPoints(data: { polylines?: V3[][]; segments?: V3[] }): V3[] | undefined {
  if (data.polylines?.[0]?.length) return data.polylines[0]
  if (data.segments?.length) return [data.segments[0]]
  return undefined
}

/** Marching squares for F(x, y) = 0 → segment endpoint pairs. */
export function implicitSegments(F: Fxy, xMin: number, xMax: number, yMin: number, yMax: number, nx: number, ny: number): V3[] {
  const dx = (xMax - xMin) / nx
  const dy = (yMax - yMin) / ny
  const vals = new Float64Array((nx + 1) * (ny + 1))
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) vals[j * (nx + 1) + i] = F(xMin + i * dx, yMin + j * dy)
  }
  const out: V3[] = []
  const lerp = (a: number, b: number) => (Math.abs(a - b) < 1e-300 ? 0.5 : a / (a - b))
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v0 = vals[j * (nx + 1) + i]
      const v1 = vals[j * (nx + 1) + i + 1]
      const v2 = vals[(j + 1) * (nx + 1) + i + 1]
      const v3 = vals[(j + 1) * (nx + 1) + i]
      if (![v0, v1, v2, v3].every(Number.isFinite)) continue
      const x = xMin + i * dx
      const y = yMin + j * dy
      const edges: V3[] = []
      // edge crossings: bottom, right, top, left
      if (v0 > 0 !== v1 > 0) edges.push([x + lerp(v0, v1) * dx, y, 0])
      if (v1 > 0 !== v2 > 0) edges.push([x + dx, y + lerp(v1, v2) * dy, 0])
      if (v3 > 0 !== v2 > 0) edges.push([x + lerp(v3, v2) * dx, y + dy, 0])
      if (v0 > 0 !== v3 > 0) edges.push([x, y + lerp(v0, v3) * dy, 0])
      if (edges.length === 2) out.push(edges[0], edges[1])
      else if (edges.length === 4) {
        // Saddle: disambiguate with the centre value. Also reject sign flips across poles.
        const c = F(x + dx / 2, y + dy / 2)
        if (c > 0 === v0 > 0) out.push(edges[0], edges[1], edges[2], edges[3])
        else out.push(edges[0], edges[3], edges[1], edges[2])
      }
    }
  }
  // Remove segments across poles (e.g. 1/x = y): |F| large at both ends of the crossing cell.
  return out
}

/** Filled cells where F(x,y) op 0 holds, as triangle positions. */
export function inequalityMesh(F: Fxy, op: '<' | '<=' | '>' | '>=', xMin: number, xMax: number, yMin: number, yMax: number, nx: number, ny: number): Float32Array {
  const dx = (xMax - xMin) / nx
  const dy = (yMax - yMin) / ny
  const test = (v: number) => (op === '<' ? v < 0 : op === '<=' ? v <= 0 : op === '>' ? v > 0 : v >= 0)
  const tris: number[] = []
  for (let j = 0; j < ny; j++) {
    const y = yMin + (j + 0.5) * dy
    let runStart = -1
    for (let i = 0; i <= nx; i++) {
      const ok = i < nx && test(F(xMin + (i + 0.5) * dx, y))
      if (ok && runStart < 0) runStart = i
      if (!ok && runStart >= 0) {
        const x0 = xMin + runStart * dx
        const x1 = xMin + i * dx
        const y0 = yMin + j * dy
        const y1 = y0 + dy
        tris.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y0, 0, x1, y1, 0, x0, y1, 0)
        runStart = -1
      }
    }
  }
  return new Float32Array(tris)
}

export function sampleParametric(fx: (t: number) => number, fy: (t: number) => number, t0: number, t1: number, n: number, jump: number): V3[][] {
  const polylines: V3[][] = []
  let cur: V3[] = []
  let prev: V3 | null = null
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n
    const p: V3 = [fx(t), fy(t), 0]
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) > jump)) {
      if (cur.length > 1) polylines.push(cur)
      cur = []
    }
    if (Number.isFinite(p[0]) && Number.isFinite(p[1])) cur.push(p)
    prev = p
  }
  if (cur.length > 1) polylines.push(cur)
  return polylines
}

/** Height-coloured surface z = f(x, y) on an n×n grid. */
export function surfaceGeometry(f: Fxy, half: number, n: number) {
  const positions = new Float32Array((n + 1) * (n + 1) * 3)
  const colors = new Float32Array((n + 1) * (n + 1) * 3)
  const zs: number[] = []
  // Where f(x, y) has no value (a hole in the surface) the point is marked and no triangle uses it,
  // instead of being flattened onto z = 0, which would draw a sheet that is not there.
  const defined: boolean[] = []
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = -half + (2 * half * i) / n
      const y = -half + (2 * half * j) / n
      const z = f(x, y)
      const ok = Number.isFinite(z)
      const k = (j * (n + 1) + i) * 3
      positions[k] = x
      positions[k + 1] = y
      positions[k + 2] = ok ? Math.max(-half * 4, Math.min(half * 4, z)) : 0
      defined.push(ok)
      zs.push(ok ? positions[k + 2] : NaN)
    }
  }
  const real = zs.filter((z) => Number.isFinite(z))
  const zMin = real.length ? Math.min(...real) : 0
  const zMax = real.length ? Math.max(...real) : 0
  for (let idx = 0; idx < zs.length; idx++) {
    const t = zMax - zMin < 1e-9 || !defined[idx] ? 0.5 : (zs[idx] - zMin) / (zMax - zMin)
    const [r, g, b] = turbo(t)
    colors.set([r, g, b], idx * 3)
  }
  const indices: number[] = []
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i
      const b2 = a + 1
      const c = a + n + 1
      const d = c + 1
      if (defined[a] && defined[b2] && defined[d]) indices.push(a, b2, d)
      if (defined[a] && defined[d] && defined[c]) indices.push(a, d, c)
    }
  }
  return { positions, colors, indices, zMin, zMax }
}

/** Compact approximation of the Turbo colour map. */
export function turbo(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t))
  const r = 0.1357 + t * (4.5974 - t * (42.3277 - t * (130.5887 - t * (150.5666 - t * 58.1375))))
  const g = 0.0914 + t * (2.1856 + t * (4.8052 - t * (14.0195 - t * (4.2109 + t * 2.7747))))
  const b = 0.1067 + t * (12.5925 - t * (60.1097 - t * (109.0745 - t * (88.5066 - t * 26.8183))))
  return [Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b))]
}

// ---------------------------------------------------------------------------
// Question pictures: a curve in pieces, the region between two curves, a tangent's slope
// ---------------------------------------------------------------------------

/** One formula of a piecewise curve and the stretch of x it holds on. */
export interface Piece {
  f: Fx
  from: number
  to: number
}

/**
 * Samples a curve made of several formulas, each on its own stretch of x, `n` samples per piece.
 * Pieces that meet — the end of one is the start of the next, at the same height — are joined
 * into a single polyline with the shared point kept once, so the fat line runs through the join
 * with no cap, gap or zero-length segment where the two formulas hand over. A jump between two
 * pieces is a real break and stays one. Pieces are taken in order of x whatever order they came in.
 */
export function samplePiecewise(pieces: Piece[], n: number, viewH = Infinity): V3[][] {
  const ordered = pieces
    .map((p) => ({ f: p.f, from: Math.min(p.from, p.to), to: Math.max(p.from, p.to) }))
    .filter((p) => Number.isFinite(p.from) && Number.isFinite(p.to) && p.to > p.from)
    .sort((a, b) => a.from - b.from)
  const out: V3[][] = []
  for (const p of ordered) {
    const polys = sampleExplicit(p.f, p.from, p.to, Math.max(2, n), viewH)
    for (const poly of polys) {
      const last = out[out.length - 1]
      const end = last?.[last.length - 1]
      const start = poly[0]
      if (end && meets(end, start)) last.push(...poly.slice(1))
      else out.push(poly)
    }
  }
  return out
}

/** Whether two sample points are the same point of the plane, allowing for the rounding in `xMin + i·dx`. */
function meets(a: V3, b: V3): boolean {
  const scale = Math.max(1, Math.abs(a[0]), Math.abs(a[1]))
  return Math.abs(a[0] - b[0]) <= 1e-9 * scale && Math.abs(a[1] - b[1]) <= 1e-6 * scale
}

/**
 * The region between y = upper(x) and y = lower(x) for x in [a, b], as triangle positions to fill
 * and the polylines that outline it (the two curves over [a, b] and the vertical edges that close
 * the ends). Where the curves cross inside a column the column is split at the crossing, so the
 * fill has no bow-tie: a quad drawn straight across a crossing paints two triangles that meet at a
 * point and misses the region on either side of it. A column where either curve has no value is
 * left empty rather than pinned to y = 0.
 */
export function betweenMesh(upper: Fx, lower: Fx, a: number, b: number, n: number, viewH = Infinity): { fill: Float32Array; outline: V3[][] } {
  const x0 = Math.min(a, b)
  const x1 = Math.max(a, b)
  const steps = Math.max(1, n)
  const dx = (x1 - x0) / steps
  const tris: number[] = []
  const us: number[] = []
  const ls: number[] = []
  for (let i = 0; i <= steps; i++) {
    const x = i === steps ? x1 : x0 + i * dx
    us.push(upper(x))
    ls.push(lower(x))
  }
  // Each curve's outline breaks where it has no value and where it jumps by more than the view
  // (an asymptote), the way the curve itself is drawn: 1/x must not be joined straight through
  // the origin.
  const trace = (ys: number[]): V3[][] => {
    const polys: V3[][] = []
    let cur: V3[] = []
    for (let i = 0; i <= steps; i++) {
      const x = i === steps ? x1 : x0 + i * dx
      const y = ys[i]
      const prev = cur.length ? cur[cur.length - 1][1] : NaN
      if (!Number.isFinite(y) || (Number.isFinite(prev) && Math.abs(y - prev) > viewH * 1.5)) {
        if (cur.length > 1) polys.push(cur)
        cur = []
      }
      if (Number.isFinite(y)) cur.push([x, y, 0])
    }
    if (cur.length > 1) polys.push(cur)
    return polys
  }
  for (let i = 0; i < steps; i++) {
    const xa = i === 0 ? x0 : x0 + i * dx
    const xb = i + 1 === steps ? x1 : x0 + (i + 1) * dx
    const [ua, la, ub, lb] = [us[i], ls[i], us[i + 1], ls[i + 1]]
    if (![ua, la, ub, lb].every(Number.isFinite)) continue
    const da = ua - la
    const db = ub - lb
    if (da * db < 0) {
      const t = da / (da - db)
      const xc = xa + t * (xb - xa)
      const yc = la + t * (lb - la)
      tris.push(xa, la, 0, xc, yc, 0, xa, ua, 0)
      tris.push(xc, yc, 0, xb, lb, 0, xb, ub, 0)
    } else {
      tris.push(xa, la, 0, xb, lb, 0, xb, ub, 0)
      tris.push(xa, la, 0, xb, ub, 0, xa, ua, 0)
    }
  }
  const outline: V3[][] = [...trace(us), ...trace(ls)]
  const edge = (i: number, x: number) => {
    if (Number.isFinite(us[i]) && Number.isFinite(ls[i]) && us[i] !== ls[i]) outline.push([[x, ls[i], 0], [x, us[i], 0]])
  }
  edge(0, x0)
  edge(steps, x1)
  return { fill: new Float32Array(tris), outline }
}

/**
 * The area between y = upper(x) and y = lower(x) for x in [a, b]: the integral of |upper − lower|,
 * so the answer is the size of the shaded region whichever curve is on top, and a pair of curves
 * that swap over part way still gives the whole region, not the difference of two parts. Simpson's
 * rule over `n` columns, with a column the curves cross inside split at the crossing so the kink
 * in |upper − lower| does not sit inside a parabola. A column where a curve has no value (√x left
 * of 0) is left out, since there is no region there; but a sample where the gap between the curves
 * is infinite, or towers over the samples either side of it (1/x at 0), makes the whole area NaN,
 * because the integral diverges and a number for it would be a lie. A gap that is merely large is
 * not that: e^x on [0, 20] reaches 4.85 × 10⁸ and has a perfectly good area.
 */
export function betweenArea(upper: Fx, lower: Fx, a: number, b: number, n = 2000): number {
  const x0 = Math.min(a, b)
  const x1 = Math.max(a, b)
  const steps = Math.max(1, n)
  const dx = (x1 - x0) / steps
  const d = (x: number) => upper(x) - lower(x)
  const simpson = (p: number, q: number, dp: number, dq: number, m: number) => ((q - p) / 6) * (Math.abs(dp) + 4 * Math.abs(m) + Math.abs(dq))
  const xs = (i: number) => (i === 0 ? x0 : i === steps ? x1 : x0 + i * dx)
  // Every column's two ends and middle, in order along x: s[2i] at xs(i), s[2i + 1] half way on.
  const s: number[] = []
  for (let i = 0; i <= steps; i++) {
    s.push(d(xs(i)))
    if (i < steps) s.push(d((xs(i) + xs(i + 1)) / 2))
  }
  // An asymptote shows as one sample a thousand times anything either side of it. A fixed ceiling
  // (the old test was 10⁷) also refused every steep but finite region; the neighbour test alone
  // would refuse a narrow spike of height 1, so a sample must clear both to count.
  const towers = (j: number): boolean => {
    const v = Math.abs(s[j])
    if (Number.isNaN(v)) return false
    if (!Number.isFinite(v)) return true
    if (v <= 1e7) return false
    const near = [s[j - 1], s[j + 1]].filter((w) => w !== undefined && Number.isFinite(w)).map(Math.abs)
    return v > 1e3 * Math.max(0, ...near)
  }
  for (let j = 0; j < s.length; j++) if (towers(j)) return NaN
  let area = 0
  for (let i = 0; i < steps; i++) {
    const xa = xs(i)
    const xb = xs(i + 1)
    const [dPrev, dm, dNext] = [s[2 * i], s[2 * i + 1], s[2 * i + 2]]
    if (!Number.isFinite(dPrev) || !Number.isFinite(dNext)) continue
    if (dPrev * dNext < 0) {
      const xc = xa + (dPrev / (dPrev - dNext)) * (xb - xa)
      area += simpson(xa, xc, dPrev, 0, d((xa + xc) / 2)) + simpson(xc, xb, 0, dNext, d((xc + xb) / 2))
    } else area += simpson(xa, xb, dPrev, dNext, dm)
  }
  return area
}

/**
 * The slope of y = f(x) at x = a by central differences with one Richardson step, which is exact
 * for anything up to a cubic and within about 10⁻¹⁰ for the smooth functions a question draws a
 * tangent to. NaN where there is no tangent, so a caller can say so instead of drawing a line at a
 * made-up angle: where f has no value on one side (√x at 0); at a corner, where the slopes from
 * the left and the right disagree (|x| at 0, a step); and at a vertical tangent, where the
 * estimate keeps growing as the step shrinks (∛x at 0). Both tests ask whether the disagreement
 * shrinks with the step, as it does for any smooth curve however steep, rather than whether it is
 * small: tan x near π/2 has a slope of thousands and a real tangent.
 */
export function slopeAt(f: Fx, a: number): number {
  // The step grows with |a| so f(a ± h) still differ in their last digits far from 0, but only up
  // to ten times: uncapped it was h = 1 at a = 1000, and sin x there read 0.56124 for cos 1000 =
  // 0.56238. At h = 0.01 the rounding error stays below 10⁻⁸ of the slope out to |a| = 10⁶.
  const h = 1e-3 * Math.min(Math.max(1, Math.abs(a)), 10)
  const central = (step: number) => (f(a + step) - f(a - step)) / (2 * step)
  const coarse = central(h)
  const fine = central(h / 2)
  const slope = (4 * fine - coarse) / 3
  if (!Number.isFinite(slope)) return NaN
  const scale = Math.max(1, Math.abs(slope))
  // A corner: the one-sided slopes differ by more than a few per cent, and halving the step twice
  // does not halve the difference (for a smooth curve it quarters it).
  const oneSided = (step: number) => Math.abs((f(a + step) - f(a)) / step - (f(a) - f(a - step)) / step)
  const c1 = oneSided(h)
  if (c1 > 0.05 * scale && oneSided(h / 4) > c1 / 2) return NaN
  // A vertical tangent: the central estimates differ by more than a per cent, and halving the step
  // again does not halve the difference (for a smooth curve it quarters it).
  const v1 = Math.abs(coarse - fine)
  if (v1 > 0.01 * scale && Math.abs(fine - central(h / 4)) > v1 / 2) return NaN
  return slope
}
