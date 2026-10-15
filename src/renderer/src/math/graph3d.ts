// 3D-2 (owner, Wed 14 Oct: "we need ... graphing 3D ... and make their interface good too"): the pure maths of the 3-D graphs.
// A curve in space, a plane ax + by + cz = d, a surface given by x(u, v), y(u, v), z(u, v), the colour by height from three
// theme colours, the thin mesh lines drawn over a surface, the box everything drawn fills (for Home) and the read-out of a
// point. render/GraphView.tsx draws what these give; tests/graph3d.test.ts holds them.

import type { V3 } from './vec'
import { isNoise, sameNumber } from './noise'

/** A curve in space sampled at n + 1 values of t, split where it has no value (each piece a polyline). */
export function spaceCurve(fx: (t: number) => number, fy: (t: number) => number, fz: (t: number) => number, t0: number, t1: number, n = 600): V3[][] {
  const out: V3[][] = []
  let run: V3[] = []
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n
    const p: V3 = [fx(t), fy(t), fz(t)]
    if (p.every(Number.isFinite)) run.push(p)
    else {
      if (run.length > 1) out.push(run)
      run = []
    }
  }
  if (run.length > 1) out.push(run)
  return out
}

/** A plane's coefficients from a function that is linear in x, y, z: F(x, y, z) = ax + by + cz − d. Null when it is not a plane. */
export function planeOf(F: (x: number, y: number, z: number) => number): { a: number; b: number; c: number; d: number } | null {
  const f0 = F(0, 0, 0)
  const a = F(1, 0, 0) - f0
  const b = F(0, 1, 0) - f0
  const c = F(0, 0, 1) - f0
  // No normal: every coefficient is rounding beside the values it came from (0 = 3, or x − x = 1).
  const at = [F(1, 0, 0), F(0, 1, 0), F(0, 0, 1)]
  if (![f0, a, b, c].every(Number.isFinite) || [a, b, c].every((k) => isNoise(k, f0, ...at))) return null
  // Linear means the same at a few other points: x² + y = z is not a plane.
  const probes: V3[] = [[2, -3, 5], [-1.5, 0.25, 4], [3.1, 2.2, -1.7]]
  for (const [x, y, z] of probes) if (!sameNumber(F(x, y, z), a * x + b * y + c * z + f0, f0, ...at)) return null
  return { a, b, c, d: -f0 }
}

/**
 * The part of the plane ax + by + cz = d inside the cube from −half to half, a polygon of 3 to 6 corners in order: laid
 * over the two axes the plane leans on least (the normal's biggest part picks the axis solved for), so a vertical plane
 * is drawn too, then cut to the cube.
 */
export function planePatch(p: { a: number; b: number; c: number; d: number }, half: number): V3[] {
  const n = [p.a, p.b, p.c]
  const k = n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)))
  const [i, j] = [0, 1, 2].filter((m) => m !== k)
  const corner = (u: number, v: number): V3 => {
    const q = [0, 0, 0]
    q[i] = u
    q[j] = v
    q[k] = (p.d - n[i] * u - n[j] * v) / n[k]
    return q as V3
  }
  // The quad is cut to the cube: a plane leaning steeply on the axis solved for ran far past it (x + y + z = 4 reached
  // z = 16), which drew a long sheet and made Home stand far back. What is left is the plane's section of the cube.
  return clipToCube([corner(-half, -half), corner(half, -half), corner(half, half), corner(-half, half)], half)
}

/** A convex polygon cut to the cube from −half to half (Sutherland-Hodgman, one face at a time). */
function clipToCube(poly: V3[], half: number): V3[] {
  let out = poly
  for (let axis = 0; axis < 3; axis++) {
    for (const side of [1, -1]) {
      const inside = (q: V3) => side * q[axis] <= half
      const next: V3[] = []
      for (let k = 0; k < out.length; k++) {
        const p = out[k]
        const q = out[(k + 1) % out.length]
        if (inside(p)) next.push(p)
        if (inside(p) !== inside(q)) {
          const t = (side * half - p[axis]) / (q[axis] - p[axis])
          next.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t])
        }
      }
      out = next
      if (!out.length) return out
    }
  }
  return out
}

/** A surface x(u, v), y(u, v), z(u, v) on an nu × nv grid: positions, the u-v grid's triangles, and which points have a value. */
export function parametricSurface(
  fx: (u: number, v: number) => number,
  fy: (u: number, v: number) => number,
  fz: (u: number, v: number) => number,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
  nu = 96,
  nv = 48
): { positions: Float32Array; indices: number[]; heights: number[]; nu: number; nv: number } {
  const positions = new Float32Array((nu + 1) * (nv + 1) * 3)
  const ok: boolean[] = []
  const heights: number[] = []
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = u0 + ((u1 - u0) * i) / nu
      const v = v0 + ((v1 - v0) * j) / nv
      const p = [fx(u, v), fy(u, v), fz(u, v)]
      const good = p.every(Number.isFinite)
      const at = (j * (nu + 1) + i) * 3
      positions[at] = good ? p[0] : 0
      positions[at + 1] = good ? p[1] : 0
      positions[at + 2] = good ? p[2] : 0
      ok.push(good)
      heights.push(good ? p[2] : NaN)
    }
  }
  const indices: number[] = []
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i
      const b = a + 1
      const c = a + nu + 1
      const d = c + 1
      if (ok[a] && ok[b] && ok[d]) indices.push(a, b, d)
      if (ok[a] && ok[d] && ok[c]) indices.push(a, d, c)
    }
  }
  return { positions, indices, heights, nu, nv }
}

export type RGB = [number, number, number]

/** "#rrggbb" (or "#rgb") as three numbers from 0 to 1; anything else is mid grey. */
export function rgbOf(hex: string): RGB {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [0.5, 0.5, 0.5]
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB
}

/** The colour at height t (0 lowest, 1 highest) between three stops, low → mid → high, mixed in linear light. */
export function rampColour(t: number, low: RGB, mid: RGB, high: RGB): RGB {
  const s = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0.5
  const [a, b, f] = s < 0.5 ? [low, mid, s * 2] : [mid, high, (s - 0.5) * 2]
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const srgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)
  return [0, 1, 2].map((i) => srgb(lin(a[i]) + (lin(b[i]) - lin(a[i])) * f)) as RGB
}

/** Every vertex's colour by its height, from the lowest to the highest point that has a value. */
export function heightColours(heights: readonly number[], low: RGB, mid: RGB, high: RGB): Float32Array {
  const real = heights.filter(Number.isFinite)
  const lo = real.length ? Math.min(...real) : 0
  const hi = real.length ? Math.max(...real) : 0
  const out = new Float32Array(heights.length * 3)
  heights.forEach((h, k) => out.set(rampColour(hi - lo < 1e-9 ? 0.5 : (h - lo) / (hi - lo), low, mid, high), k * 3))
  return out
}

/**
 * The thin mesh lines over a surface on a grid of (nu + 1) × (nv + 1) points: every `every`-th row and column, as segment
 * pairs (for one constant-pixel line), each segment only where both its ends have a value.
 */
export function meshLines(positions: Float32Array, nu: number, nv: number, every: number, ok?: (index: number) => boolean): Float32Array {
  const out: number[] = []
  const at = (i: number, j: number) => j * (nu + 1) + i
  const push = (p: number, q: number) => {
    if (ok && (!ok(p) || !ok(q))) return
    out.push(positions[p * 3], positions[p * 3 + 1], positions[p * 3 + 2], positions[q * 3], positions[q * 3 + 1], positions[q * 3 + 2])
  }
  for (let j = 0; j <= nv; j += every) for (let i = 0; i < nu; i++) push(at(i, j), at(i + 1, j))
  for (let i = 0; i <= nu; i += every) for (let j = 0; j < nv; j++) push(at(i, j), at(i, j + 1))
  return new Float32Array(out)
}

/** The box around a list of points (a flat array x, y, z, …) that have values; null when none has. */
export function boxOf(flat: ArrayLike<number>): { min: V3; max: V3 } | null {
  const min: V3 = [Infinity, Infinity, Infinity]
  const max: V3 = [-Infinity, -Infinity, -Infinity]
  for (let k = 0; k + 2 < flat.length; k += 3) {
    const p = [flat[k], flat[k + 1], flat[k + 2]]
    if (!p.every(Number.isFinite)) continue
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p[i])
      max[i] = Math.max(max[i], p[i])
    }
  }
  return min.every(Number.isFinite) ? { min, max } : null
}

/** Two boxes as one (either may be missing). */
export function unionBox(a: { min: V3; max: V3 } | null, b: { min: V3; max: V3 } | null): { min: V3; max: V3 } | null {
  if (!a) return b
  if (!b) return a
  return { min: a.min.map((v, i) => Math.min(v, b.min[i])) as V3, max: a.max.map((v, i) => Math.max(v, b.max[i])) as V3 }
}
