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
