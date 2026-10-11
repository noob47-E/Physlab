// Numeric sampling for the graphing calculator: explicit, implicit, parametric, inequalities, surfaces.

import type { V3 } from './vec'
import { fmtLabel, type Precision } from './format'

export type Fx = (x: number) => number
export type Fxy = (x: number, y: number) => number

/** Samples y = f(x); breaks the curve at NaN/∞ and near vertical asymptotes. */
export function sampleExplicit(f: Fx, xMin: number, xMax: number, n: number, viewH: number): V3[][] {
  const polylines: V3[][] = []
  let cur: V3[] = []
  const dx = (xMax - xMin) / n
  let prevX = NaN
  let prevY = NaN
  // `depth` counts how many times the step being pushed has been cut into quarters (see below).
  const push = (x: number, y: number, depth = 0): void => {
    if (!Number.isFinite(y) || Math.abs(y) > 1e7) {
      if (cur.length > 1) polylines.push(cur)
      cur = []
      prevY = NaN
      return
    }
    const jump = Math.abs(y - prevY)
    if (jump > viewH * 1.5) {
      // Probe along this step (for a refined step, along it and not along dx) and compare with the
      // chord. A straight line, however steep, passes through its chord, and a smooth curve stays
      // close to it; across an asymptote the curve is far off it, often beyond one end (1/x half
      // way from −0.01 to 0.02 is 200). Comparing the half-way value with the jump from each end
      // instead took every line steeper than the view for an asymptote: y = 10000x was drawn as
      // nothing at all. The quarters are probed with the middle, always, because across a pole that
      // both sides climb to, any one of the three can land near the chord by chance: from 6214
      // down to 343 across the pole of tan² x at −5π/2 the middle is 2334, a quarter of the way
      // along it is 62 500, and in the step from 5781 to 80 940 across the same pole the middle
      // is 40 off the chord and only the quarters are not.
      const x0 = prevX
      const y0 = prevY
      const xq = [1, 2, 3].map((k) => x0 + ((x - x0) * k) / 4)
      const yq = xq.map((xs) => f(xs))
      const far = yq.some((v, k) => !(Math.abs(v - (y0 + ((k + 1) / 4) * (y - y0))) <= jump / 4))
      if (far) {
        // A step that fails the test is a pole, a jump, or a curve that grows faster than the step
        // is short: e^(100(x − 3)) takes 0.2 to 71 in one step of 300 over [−10.19, 8.63], and its
        // middle is as far under the chord as a pole's is over it, so the curve was cut off in
        // mid-air instead of rising through the top of the view. The two part when the step is cut
        // up. A smooth curve is nearly straight over a quarter of the step and passes, while a pole
        // is as far off the chord as ever in the quarter that holds it, so the cut comes there:
        // each step that fails is looked at in quarters, the probes being the three new points, up
        // to three times over (a 64th of the step). That is three evaluations for each step, whole
        // or quarter, whose jump is more than a view and a half, and none for a step with less.
        if (depth < 3) {
          for (let k = 0; k < 3; k++) push(xq[k], yq[k], depth + 1)
          push(x, y, depth + 1)
          return
        }
        if (cur.length > 1) polylines.push(cur)
        cur = []
      }
    }
    cur.push([x, y, 0])
    prevX = x
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

/** What a key point of a graph is. One point can be several: the bottom of y = x² − 4 is its min and its y-intercept. */
type KeyKind = 'root' | 'max' | 'min' | 'yIntercept'

export interface KeyPoint {
  x: number
  y: number
  /** What the point is first: its dot takes this colour and its label starts with this word. */
  kind: KeyKind
  /** Everything the point is, most important first; `kinds[0]` is `kind`. */
  kinds: KeyKind[]
}

/** A turning point says the most about a curve, then a root, then where it crosses the y-axis. */
const KIND_RANK: Record<KeyKind, number> = { max: 0, min: 0, root: 1, yIntercept: 2 }

/**
 * Where f changes sign between a and b. The halving goes on to neighbouring doubles, so that a root
 * near 0 is found to its own precision: sixty halvings of a step left the root of x^(1/4) = 0.001,
 * 10⁻¹², uncertain in its eighth digit. A bracket that still holds 0 after `iters` halvings stops
 * there unless `onwards` says to go on: a root at 0 itself (sin x, x³) is put on 0 by keyPoints, and
 * halving on towards it, or towards a pole at 0, would go through a thousand subnormal numbers.
 */
function bisect(f: Fx, a: number, b: number, iters = 60, onwards?: () => boolean): number {
  let fa = f(a)
  // 2100 halvings take any bracket of doubles down to neighbours; the loop ends long before.
  for (let i = 0; i < 2100; i++) {
    const m = (a + b) / 2
    if (m === a || m === b) break
    if (i >= iters && Math.min(a, b) <= 0 && Math.max(a, b) >= 0 && !onwards?.()) break
    const fm = f(m)
    if (Math.sign(fm) === Math.sign(fa)) {
      a = m
      fa = fm
    } else b = m
  }
  return (a + b) / 2
}

/**
 * Where f turns between the samples a and b either side of a sample x0 (value y0) that is higher
 * than both (a max) or lower than both (a min). A golden-section search finds how far f goes, but
 * not where on a flat top or bottom it gets there: x² − 4 is −4 to the last bit for every |x| below
 * 1.49×10⁻⁸ and x⁶ − 4 for every |x| below 0.0025, so every comparison there is a tie, and the
 * search walked to the right-hand end of that stretch — the bottom of x⁶ − 4 came out at
 * (0.002, −4). The answer is the middle of the stretch over which f goes as far as the best value
 * found, its two ends found by bisection; for an even function that middle is exactly 0.
 */
function turningPoint(f: Fx, a: number, x0: number, b: number, y0: number, max: boolean): number {
  const h = (x: number) => (max ? -f(x) : f(x))
  const g = (Math.sqrt(5) - 1) / 2
  let at = x0
  let best = max ? -y0 : y0
  const keep = (x: number, v: number) => {
    if (v < best) {
      best = v
      at = x
    }
  }
  let lo = a
  let hi = b
  let c = hi - g * (hi - lo)
  let d = lo + g * (hi - lo)
  let hc = h(c)
  let hd = h(d)
  keep(c, hc)
  keep(d, hd)
  // Each step keeps one of the two inner points, so it costs one evaluation; it ends when the
  // bracket is down to neighbouring doubles.
  for (let i = 0; i < 120 && c < d; i++) {
    if (hc < hd) {
      hi = d
      d = c
      hd = hc
      c = hi - g * (hi - lo)
      hc = h(c)
      keep(c, hc)
    } else {
      lo = c
      c = d
      hc = hd
      d = lo + g * (hi - lo)
      hd = h(d)
      keep(d, hd)
    }
  }
  // An end of the stretch lies between `inside`, as far as the best, and `outside`, a sample that
  // is not (a value that does not exist counts as outside).
  const end = (inside: number, outside: number): number => {
    for (let i = 0; i < 100; i++) {
      const m = inside + (outside - inside) / 2
      if (m === inside || m === outside) break
      if (h(m) <= best) inside = m
      else outside = m
    }
    return inside
  }
  const left = end(at, a)
  const right = end(at, b)
  return left + (right - left) / 2
}

/** A key point before points on one spot are merged. */
interface Found {
  x: number
  y: number
  kinds: KeyKind[]
  /** How far either side other points belong to this one, where that is further than the same-spot distance. */
  reach?: number
}

/**
 * The height f settles on at x from both sides, or NaN where there is none. Where f has a value at
 * x it is that value; at a hole, where f has none but both sides close in on one height (sin x / x
 * is 0/0 at x = 0 and closes in on 1), it is that height. There is none at a pole, where the values
 * run away as the step shrinks (tan x, 1/x², ln|x|), nor at a jump, where each side settles on a
 * height of its own (x − floor(x) at a whole number). It looks from three steps, each a thousand
 * times shorter than the one before: beside a smooth point or a cusp such as the point of
 * 1 − |x|^0.1 the change from one step to the next shrinks, beside ln|x| it stays ln 1000, and
 * beside 1/x² it grows. A height jump cannot tell these apart: the top of 1/(1 + 10⁶x²) is 1 and
 * the samples either side of it reach only 0.015.
 */
function settledAt(f: Fx, x: number, step: number): number {
  const y = f(x)
  if (y === Infinity || y === -Infinity) return NaN
  const steps = [step, step / 1e3, step / 1e6]
  const left = steps.map((e) => f(x - e))
  const right = steps.map((e) => f(x + e))
  const all = Number.isNaN(y) ? [...left, ...right] : [y, ...left, ...right]
  if (!all.every(Number.isFinite)) return NaN
  // Changes this small are the rounding of values this size, not the curve.
  // eslint-disable-next-line no-restricted-syntax -- relative already (10⁻¹² of the sizes); math/noise.ts says 10⁻¹⁵, and which number is the owner's (OWNER-APPROVALS CW9-N2-1, with CW9-N3-1)
  const noise = 1e-12 * Math.max(...all.map(Math.abs))
  const l = closingIn(left, noise)
  const r = closingIn(right, noise)
  if (Number.isNaN(l.to) || Number.isNaN(r.to)) return NaN
  if (Math.abs(left[2] - right[2]) > l.within + r.within) return NaN
  if (Number.isNaN(y)) return (l.to + r.to) / 2
  return Math.abs(y - left[2]) <= l.within && Math.abs(y - right[2]) <= r.within ? y : NaN
}

/**
 * Where three values of f are going, taken at steps from a point that are each the same number of
 * times shorter than the one before, if their changes go on shrinking as they did (the sum of that
 * geometric series), and how far from the nearest value that may be: twice the rest of the series,
 * and never less than the last change, which also covers rounding in a formula that cancels: the
 * bottom of x² − 0.2x + 0.01 is 10⁻¹⁸ of rounding, more than the curve rises at the nearest step.
 * NaN where the changes do not shrink. `noise` is the size below which a change is rounding, not
 * the curve.
 */
function closingIn(v: number[], noise: number): { to: number; within: number } {
  const before = v[1] - v[0]
  const last = v[2] - v[1]
  if (Math.abs(last) <= noise) return { to: v[2], within: noise }
  if (Math.abs(last) > 0.9 * Math.abs(before)) return { to: NaN, within: NaN }
  const r = Math.max(0, last / before)
  return { to: v[2] + (last * r) / (1 - r), within: Math.abs(last) * Math.max(1, (2 * r) / (1 - r)) + noise }
}

/**
 * Where f is going as x nears `edge` from the side `dir` (1 for the right, −1 for the left), and how
 * big f is on the way there (`size`, the largest of the values looked at); `to` is NaN where it goes
 * nowhere. At the end of a domain a curve has a root if it is on the axis there, but the nearest
 * point bisection reaches is only about 10⁻²⁰ from the edge, and a curve that is going to 0 slowly
 * is still far from it there: x^(1/4) is 10⁻⁵ at 10⁻²⁰ from 0. So f is looked at in three points,
 * each a thousand times nearer the edge than the one before, and asked where it is going, as
 * `settledAt` does: x^(1/4), √√x and x^(1/5) are going to 0, √x + 1 to 1, and 1/√x and ln x
 * nowhere. The farthest point is within a step of the samples and no further from the edge than a
 * millionth of its size, so that what the curve does away from the edge (x^(1/4) + x) is small
 * there; the nearest is no nearer than the rounding of x allows (3 + 10⁻¹⁶ is 3), and if the
 * window is so small that not even a factor of ten is left between the points, nothing is claimed.
 */
function edgeLimit(f: Fx, edge: number, dir: number, look: number): { to: number; size: number; nearest: number } {
  const far = Math.min(look, 1e-6 * Math.max(1, Math.abs(edge)))
  const near = Math.max(far / 1e6, 4096 * Number.EPSILON * Math.abs(edge))
  // The factor between one point and the next: a thousand, or less where the rounding of x allows less.
  const k = Math.sqrt(far / near)
  if (!(k >= 10)) return { to: NaN, size: NaN, nearest: NaN }
  const v = [far, far / k, far / (k * k)].map((d) => f(edge + dir * d))
  if (!v.every(Number.isFinite)) return { to: NaN, size: NaN, nearest: NaN }
  const size = Math.max(...v.map(Math.abs))
  // `nearest` is the curve's size at the point nearest the edge, which the limit is judged against: a steep
  // curve is far larger a step away, and 1e6√x + 0.01 (1000 at 10⁻⁶, 1.01 at 10⁻¹²) tending to 0.01 was
  // within a ten-thousandth of 1000 and its edge taken for a root (H27).
  // eslint-disable-next-line no-restricted-syntax -- relative already (10⁻¹² of the sizes); math/noise.ts says 10⁻¹⁵, and which number is the owner's (OWNER-APPROVALS CW9-N2-1, with CW9-N3-1)
  return { to: closingIn(v, 1e-12 * size).to, size, nearest: Math.abs(v[2]) }
}

/**
 * How near 0 the limit at the end of a domain must be, as a part of the curve's own size there, for
 * the curve to be tending to 0. The limit is only as good as the edge is placed, and an edge such as
 * √10 is a rounded double: that leaves the limit of (10 − x²)^(1/4) at √10 some 10⁻⁶ of its size off
 * 0, and up to 6×10⁻⁶ for (10 − x²)^(1/8). The curve's size is what it is beside the edge, never
 * the height of the window: a millionth of a window a million wide is 0.001, and √x = 0.001 was
 * answered x = 0 because √x − 0.001 is −0.001 at its edge.
 */
const TENDS_TO_ZERO = 1e-4

/**
 * How close two points of a graph must be to be one spot: a billionth of their size, and no more
 * than a billionth of the window `width` they are in (see keyPoints).
 */
const sameSpot = (x: number, width: number): number => 1e-9 * Math.min(width, Math.max(1, Math.abs(x)))

/**
 * Roots, local maxima/minima and the y-intercept inside [xMin, xMax], one point for each spot: a
 * point that is several of them at once lists them all in `kinds`, most important first.
 */
export function keyPoints(f: Fx, xMin: number, xMax: number, n = 800): KeyPoint[] {
  const dx = (xMax - xMin) / n
  const at = (i: number) => xMin + i * dx
  // How close to a point f is looked at to tell a hole, a pole or a jump there: well inside a step.
  const look = dx / 64
  const raw = Array.from({ length: n + 1 }, (_, i) => f(at(i)))
  // A hole — one sample with no value between two that have one, as sin x / x has on a window with
  // a sample on 0 — takes the height both sides close in on, so a top there is bracketed like any
  // other. Without it no three samples ever had the top of sin x / x between them.
  const ys = raw.map((y, i) => (Number.isNaN(y) && (i === 0 || Number.isFinite(raw[i - 1])) && (i === n || Number.isFinite(raw[i + 1])) ? settledAt(f, at(i), look) : y))
  const span = Math.max(1e-9, ...ys.filter(Number.isFinite).map(Math.abs))
  // Closer than a billionth of its own size is the same spot, and a coordinate that close to 0 is
  // 0, so a point that lands a hair from the y-axis is on it. A billionth of the window was the
  // measure before, and on a window 2×10⁷ wide that is 0.02: the root of y = x − 0.01 was snapped
  // onto the y-axis. The refinement places a point far better than that wherever it is. The window
  // still caps it, so that zoomed right in, two points the student can see apart stay apart.
  const tol = (x: number) => sameSpot(x, xMax - xMin)
  const snap = (x: number) => (Math.abs(x) <= tol(0) ? 0 : x)
  // f's height at 0, worked out once and only when it is asked for: it is the y-intercept, and it
  // says whether a root found a hair from 0 is at 0.
  let height0: number | undefined
  const at0 = (): number => (height0 ??= f(0))
  // Whether f has a value at 0 that is clearly off the axis: further from it than a billionth of
  // the samples either side of 0.
  const offAt0 = (): boolean => {
    const y = at0()
    if (!Number.isFinite(y) || y === 0) return false
    const j = Math.min(n - 1, Math.max(0, Math.floor(-xMin / dx)))
    return Math.abs(y) > 1e-9 * Math.max(0, ...[ys[j], ys[j + 1]].filter(Number.isFinite).map(Math.abs))
  }
  // A root a hair from 0 is put on 0 as any point is (snap), but only where 0 is a root as well:
  // x^(1/4) − 0.001 is −0.001 at 0, and the root of x^(1/4) = 0.001 is 10⁻¹², not 0; nor is a root
  // put onto a pole at 0 (1/x = 10¹²). A hole at 0 (x ln|x|) has no height to tell, and is snapped.
  const snapRoot = (r: number): number => (Math.abs(r) <= tol(0) && Math.abs(at0()) !== Infinity && !offAt0() ? 0 : r)
  const found: Found[] = []
  // The root between a and b, where f has opposite signs, if f goes through 0 there and not
  // through infinity; false for a pole, where |f| blows up instead.
  // Whether |f| keeps shrinking toward r from both sides: a millionfold step closer at least halves it. An odd root
  // crosses the axis that way however slowly it closes in (x^(1/5) is still 10⁻⁴ from it where bisection stops); a
  // jump keeps its height there, and a pole grows.
  const closesIn = (r: number, width: number): boolean =>
    [-1, 1].every((side) => {
      const h = side * width * 1e-4
      const near = Math.abs(f(r + h))
      const nearer = Math.abs(f(r + h * 1e-6))
      return Number.isFinite(near) && Number.isFinite(nearer) && nearer < near / 2
    })
  const rootBetween = (a: number, b: number): boolean => {
    const r = bisect(f, a, b, 60, offAt0)
    const fr = Math.abs(f(r))
    // Since the real odd root (CW7b), x^(1/5) crosses 0 instead of ending there: a crossing that closes in counts too.
    // Only looked at below the window's tallest sample, which a pole never is, so a pole costs nothing more.
    if (!(fr < span * 1e-6 + 1e-9) && !(fr < span && closesIn(r, b - a))) return false
    // Small beside the curve at both ends of the bracket too: exp(1/x) − 2 jumps from −2 to +∞ at 0 and the halving
    // ends on its −2, which a window whose tallest sample is huge took for 0 (H33). A true root's |f| there is far
    // below both ends.
    const ends = [f(a), f(b)].map(Math.abs).filter(Number.isFinite)
    // eslint-disable-next-line no-restricted-syntax -- parked for the owner (OWNER-APPROVALS CW9-N2-2): an absolute floor on a curve's height, so exp(1/x) − 2 scaled by 10⁻¹³ gains a false root at 0 (tests/noiseFloors.test.ts)
    if (ends.length && fr > 1e-3 * Math.min(...ends) + 1e-12) return false
    found.push({ x: snapRoot(r), y: 0, kinds: ['root'] })
    return true
  }
  // A root between two points where f has opposite signs (the same test as for the sign changes between samples below).
  const crossing = (a: number, b: number) => {
    const fa = f(a)
    const fb = f(b)
    if (Number.isFinite(fa) && Number.isFinite(fb) && Math.sign(fa) * Math.sign(fb) < 0) rootBetween(a, b)
  }
  // pole[i]: f changes sign between samples i and i + 1 by jumping through infinity, not through 0.
  // A sample of ±∞ takes part: ln x is −∞ on a sample at 0 and its root, 1, lies between that
  // sample and the next, and on [−1000, 1000] that pair was skipped and the root lost.
  const pole: boolean[] = []
  for (let i = 0; i < n; i++) {
    const y0 = ys[i]
    const y1 = ys[i + 1]
    if (Number.isNaN(y0) || Number.isNaN(y1) || y0 === 0 || y1 === 0) continue
    if (Math.sign(y0) !== Math.sign(y1) && !rootBetween(at(i), at(i + 1))) pole[i] = true
  }
  // A sample exactly on the axis is a root, and so a sign change that ends on 0 is found here, even
  // where the next sample has no value (√(−x) at 0) or there is none (a root on the last sample).
  // Two zero samples in a row are not: they are a stretch of curve lying on the axis — y = 0,
  // |x| − x for x ≥ 0, floor(x) on [0, 1) — and a dot at every one of their samples buried the
  // view under a column of labels.
  for (let i = 0; i <= n; i++) {
    if (ys[i] === 0 && ys[i - 1] !== 0 && ys[i + 1] !== 0) found.push({ x: snapRoot(i === n ? xMax : at(i)), y: 0, kinds: ['root'] })
  }
  // A root at the edge of the domain: √(9 − x²) is 0 at ±3 and has no value beyond, so no two
  // samples differ in sign and a root was only seen when a sample landed on 3 itself. Wherever a
  // sample with a value sits beside one with none, the edge is found by bisection, and:
  // - where the curve is across the axis at the edge from the sample beside it, the root between
  //   them is found like any other: √x − 0.001 is −0.001 at 0 and its root, 10⁻⁶, lies before the
  //   first sample, where it was never looked for;
  // - the edge is a root where the curve is on the axis there, or is closing in on it: √x and acos x
  //   are, and so is x^(1/4), which is still 10⁻⁵ from the axis at the nearest point bisection
  //   reaches; √x + 1 (starts at 1), ln x (at −∞) and 1/√x (at ∞) are not. Both are judged against
  //   the curve's own size there, never the window's: a millionth of the tallest sample of a window
  //   a million wide is 0.001, and the edge of √x − 0.001 was taken for its root;
  // - where the curve is going somewhere across the axis, it crosses nearer the edge than bisection
  //   first reaches: x^(1/8) − 0.001 is still above the axis at 10⁻²⁰ from 0, and its root is 10⁻²⁴.
  // A lone sample with no value between two that have one is a hole, whose height was settled on
  // above or not at all; and a value of ±∞ beside a value is a pole. Neither is the end of a domain.
  for (let i = 0; i < n; i++) {
    const here = Number.isFinite(ys[i])
    if (here === Number.isFinite(ys[i + 1])) continue
    const gap = here ? i + 1 : i
    if (!Number.isNaN(ys[gap])) continue
    const beyond = here ? gap + 1 : gap - 1
    if (beyond >= 0 && beyond <= n && Number.isFinite(ys[beyond])) continue
    const sample = here ? i : i + 1
    const ySample = ys[sample]
    let inside = at(sample)
    let outside = at(gap)
    for (let k = 0; k < 60; k++) {
      const m = inside + (outside - inside) / 2
      if (Number.isNaN(f(m))) outside = m
      else inside = m
    }
    const across = (y: number) => Math.sign(y) * Math.sign(ySample) < 0
    const yEdge = f(inside)
    if (across(yEdge)) {
      rootBetween(inside, at(sample))
      continue
    }
    // On the axis at once: as near it as a hundred-millionth of the sample beside the edge.
    if (yEdge === 0 || Math.abs(yEdge) <= 1e-8 * Math.abs(ySample)) {
      found.push({ x: snapRoot(inside), y: 0, kinds: ['root'] })
      continue
    }
    // The curve lies to the left of the edge where the sample at i has a value, to the right where it has none.
    const { to, size, nearest } = edgeLimit(f, inside, here ? -1 : 1, look)
    // A limit across the axis by more than rounding: the crossing is between the edge and `inside`,
    // and the halving goes on towards the edge until the curve is across.
    if (across(to) && Math.abs(to) > 1e-9 * size) {
      let last = inside
      let crossed = false
      for (let k = 0; k < 2100 && !crossed; k++) {
        const m = inside + (outside - inside) / 2
        if (m === inside || m === outside) break
        const y = f(m)
        if (Number.isNaN(y)) outside = m
        else if (!across(y)) inside = last = m
        else {
          // Found the other side: the root (or a pole, which rootBetween turns down) is between.
          rootBetween(m, last)
          crossed = true
        }
      }
      if (crossed) continue
    }
    if (Math.abs(to) <= TENDS_TO_ZERO * nearest) found.push({ x: snapRoot(inside), y: 0, kinds: ['root'] })
  }
  for (let s = 1; s < n; s++) {
    const yp = ys[s - 1]
    const y0 = ys[s]
    if (!Number.isFinite(yp) || !Number.isFinite(y0) || y0 === yp) continue
    // A top or bottom can be several samples wide: x¹⁰ − 4 is −4 to the last bit for every |x|
    // below 0.029, so the samples there are all equal and none is lower than both its neighbours.
    // The run of equal samples is the turning point when the samples either side of it are both
    // higher or both lower; a single sample is a run of one.
    const first = s
    while (s < n && ys[s + 1] === y0) s++
    const last = s
    const y1 = ys[last + 1]
    if (last === n || !Number.isFinite(y1)) continue
    const max = y0 > yp && y0 > y1
    if (!max && !(y0 < yp && y0 < y1)) continue
    // A pole is not a turning point. Beside one the samples climb towards it and come back from
    // the other side's infinity, so the sample next to it is higher or lower than both its
    // neighbours: tan x had a max and a min at each of its six poles, at heights such as −3×10¹⁵.
    if (pole[first - 1] || pole[last]) continue
    const where = turningPoint(f, at(first - 1), at((first + last) >> 1), at(last + 1), y0, max)
    let x = snap(where)
    let y = settledAt(f, x, look)
    // Snapping onto the y-axis must not carry the point across a jump or onto a pole: just left of
    // 0 the top of x − floor(x) is nearly 1, and at 0 itself the curve is back at 0.
    if (x !== where && !(max ? y >= y0 : y <= y0)) {
      x = where
      y = settledAt(f, x, look)
    }
    // Nor is the climb to a pole the curve does not jump across (1/x², ln|x|), nor the top of a
    // tooth of x − floor(x), which the curve climbs towards and never reaches: f settles on no
    // one height there. A narrow peak and the point of a cusp settle, however far they stand
    // above the samples beside them.
    if (Number.isNaN(y)) continue
    const turn = max ? 'max' : 'min'
    // A turning point on the axis is a root as well: the curve touches it without crossing, so no
    // two samples differ in sign and the root was only seen when a sample happened to land on it.
    // "On" is to within what the curve itself rises over ten times the same-spot distance either
    // side: x² − 0.0001 rises 10⁻¹⁶ there, far less than the 0.0001 its bottom is below the axis,
    // while the rounding in x² − 0.2x + 0.01 leaves its bottom about 10⁻¹⁸ off the axis, well
    // within the 10⁻¹⁶ it rises. A billionth of the step to the next sample was the measure before,
    // and zoomed out to [−10⁶, 10⁶] that is 0.003, so the bottom of x² − 0.0001 was a root. A flat
    // top or bottom several samples wide that lies on the axis is a stretch of curve on it, which
    // has no root, as above: the bottom of |floor(x)| is a min, all of [0, 1).
    const beside = 10 * tol(x)
    const rise = Math.max(Math.abs(f(x - beside) - y), Math.abs(f(x + beside) - y))
    if (Math.abs(y) <= rise && !(last > first && y0 === 0)) found.push({ x, y: 0, kinds: [turn, 'root'], reach: beside })
    else {
      found.push({ x, y, kinds: [turn] })
      // A turning point can be across the axis from every sample: (x − 1)(x − 1.01) is below it
      // between 1 and 1.01, a stretch shorter than a step, and above it at each sample, so no two
      // samples differ in sign and neither root was seen. The curve crosses between the turning
      // point and the samples either side of it, and each crossing is found like any other.
      if (max ? y > 0 && y0 <= 0 : y < 0 && y0 >= 0) {
        crossing(at(first - 1), x)
        crossing(x, at(last + 1))
      }
    }
  }
  if (xMin <= 0 && xMax >= 0) {
    const y = at0()
    if (Number.isFinite(y)) found.push({ x: 0, y, kinds: ['yIntercept'] })
  }
  return oneSpotOnePoint(found, tol, 1e-9 * span)
}

/**
 * Points of any kinds that are closer than `near(x)` across and `flat` up are one point. It sits
 * where its most important kind put it and lists everything it is. Only points of the same kind
 * used to be merged, so the bottom of y = x² − 4 was a min and a y-intercept on the same pixel, and
 * their two labels printed over each other read "0^-8, −4)". A turning point that touches the axis
 * also takes in the roots within its `reach`: rounding splits the touch of x² − 0.2x + 0.01 into
 * two crossings 2×10⁻⁹ apart, one spot at any zoom.
 */
function oneSpotOnePoint(found: Found[], near: (x: number) => number, flat: number): KeyPoint[] {
  found.sort((p, q) => p.x - q.x)
  const out: KeyPoint[] = []
  const reach: number[] = []
  for (const p of found) {
    const own = Math.max(near(p.x), p.reach ?? 0)
    const back = Math.max(own, 10 * near(p.x))
    let same: KeyPoint | undefined
    for (let j = out.length - 1; j >= 0 && out[j].x >= p.x - back; j--) {
      if (p.x - out[j].x <= Math.max(own, reach[j]) && Math.abs(out[j].y - p.y) <= flat) {
        same = out[j]
        reach[j] = Math.max(reach[j], own)
        break
      }
    }
    if (!same) {
      out.push({ x: p.x, y: p.y, kind: p.kinds[0], kinds: [...p.kinds] })
      reach.push(own)
      continue
    }
    if (KIND_RANK[p.kinds[0]] < KIND_RANK[same.kind]) {
      same.x = p.x
      same.y = p.y
    }
    for (const k of p.kinds) if (!same.kinds.includes(k)) same.kinds.push(k)
    same.kinds.sort((u, v) => KIND_RANK[u] - KIND_RANK[v])
    same.kind = same.kinds[0]
  }
  return out
}

/**
 * The key points a graph shows when its roots and its turning points are switched on or off (the
 * y-intercept goes with the turning points). A point keeps only the kinds that are shown, is named
 * and coloured by the first of them, and is not drawn if none is left. Filtering on `kind` alone
 * would hide the bottom of y = x² whenever only roots are shown, because that point is a min first.
 */
export function shownKeyPoints(points: readonly KeyPoint[], roots: boolean, extrema: boolean): KeyPoint[] {
  const out: KeyPoint[] = []
  for (const k of points) {
    const kinds = k.kinds.filter((kind) => (kind === 'root' ? roots : extrema))
    if (kinds.length) out.push({ ...k, kind: kinds[0], kinds })
  }
  return out
}

/**
 * Every x inside [xMin, xMax] where g is 0, the ones its curve only touches as well as the ones it
 * crosses: the vertical lines of an equation in x alone, such as x² = 4 or (x − 1)² = 0. Those have
 * no y to plot against, so the line is drawn wherever g meets the x-axis. The sign-change plotter
 * (implicitSegments) never sees (x − 1)², which is 0 at x = 1 and positive on both sides: it drew
 * that line only where a grid column happened to land exactly on 1. The roots are keyPoints' own,
 * which already counts a turning point on the axis as a root. Ascending.
 *
 * Some formulas cannot be followed by samples: x^200 underflows to a stretch of exact zeros, which
 * is a curve lying on the axis and not a root, and x^(10⁹) − 2 goes from −2 to ∞ within 10⁻⁶ of 1,
 * which looks like a pole. When the caller has already worked out the solutions it hands them in as
 * `known`, and they are the answer: those inside the window, smallest first, each once. An empty
 * list is an answer too (there are none), so a caller that has not found them all should not pass it.
 */
export function verticalLineXs(g: Fx, xMin: number, xMax: number, n = 1200, known?: readonly number[]): number[] {
  if (known) {
    const inside = known.filter((x) => Number.isFinite(x) && x >= xMin && x <= xMax).sort((a, b) => a - b)
    return inside.filter((x, i) => i === 0 || x - inside[i - 1] > sameSpot(x, xMax - xMin))
  }
  return keyPoints(g, xMin, xMax, n)
    .filter((k) => k.kinds.includes('root'))
    .map((k) => k.x)
}

/**
 * The solutions a graph of an equation in x alone brings with it, to hand to verticalLineXs as
 * `known`: the command bar leaves them on the graph as `solvedXs: { expr, xs }` when it has worked
 * them out exactly. The type of a graph does not declare the field, so it is read as what it may
 * be, and anything but a list of numbers is ignored. They belong to the formula they were worked
 * out for, `expr`: a graph whose formula has since changed, by an edit or by renaming a slider that
 * rewrites it, goes back to being looked at. A formula with a slider in it has no fixed solutions
 * to carry, and the command bar must not leave any.
 */
export function carriedSolutions(graph: { exprs: readonly string[]; solvedXs?: unknown }): number[] | undefined {
  const solved = graph.solvedXs as { expr?: unknown; xs?: unknown } | null | undefined
  if (!solved || typeof solved !== 'object' || solved.expr !== graph.exprs[0] || !Array.isArray(solved.xs)) return undefined
  return solved.xs.every((x) => typeof x === 'number') ? (solved.xs as number[]) : undefined
}

/**
 * The two sides an equation in x alone was typed with, read back from the text of its graph: the
 * command bar makes the formula of "x^200 = 0" as `(x^200 ) - ( 0)`, each side as typed, and hands
 * the solver those sides as well, which it needs for what the difference hides: (x − 1)^1000 = 0 is
 * solved from x − 1 = 0, and (x − 1)^1000 itself underflows to 0 for a stretch round 1. A split of
 * the text is taken only if it makes this very formula again, so a graph whose text or formula has
 * been changed since (an edit, a slider renamed) is not given sides it no longer has: there are none.
 */
export function typedSides(source: string, expr: string): [string, string] | undefined {
  for (let at = source.indexOf('='); at >= 0; at = source.indexOf('=', at + 1)) {
    if (`(${source.slice(0, at)}) - (${source.slice(at + 1)})` === expr) return [source.slice(0, at), source.slice(at + 1)]
  }
  return undefined
}

/** What a solver of an equation in x alone says, as far as drawing it goes (core/visualize.ts XSolved). */
export interface LineSolved {
  kind: 'real' | 'none' | 'every' | 'stretch'
  xs?: readonly number[]
  /** Set where `xs` is only some of the solutions: those nearest 0, or those of one period. */
  more?: unknown
}

/** The solver of the command bar (core/visualize.ts solutionsInX): the formula, its sides as typed, and the scene's names. */
type LineSolver = (expr: string, sides: [string, string] | undefined, scope: Record<string, unknown>) => LineSolved | null

/**
 * The solutions of a graph of an equation in x alone, from the solver the command bar names them
 * with, to hand to verticalLineXs as `known`: the lines are drawn where the bar said the solutions
 * are, not where a sampled curve happens to cross the axis. x^200 = 0 is a curve on the axis for
 * a stretch of exact zeros, x^(10⁹) = 2 jumps from −2 to ∞ within 10⁻⁶ of 1, and x^(10⁶) = 1 is a
 * wall at ±1 that a pan of the view moves between samples: the bar named their solutions and the
 * view drew nothing. The solver is handed in (math/ does not reach into core/).
 *
 * Only a complete list is a list: undefined (look at the curve, as before) where the solver has
 * not worked them out, found no real x or every x, listed only some of them (`more`: the ones
 * nearest 0, or one period), took too long or failed.
 */
export function solvedLineXs(graph: { exprs: readonly string[]; source?: string }, scope: Record<string, unknown>, solve: LineSolver): number[] | undefined {
  const expr = graph.exprs[0]
  if (typeof expr !== 'string') return undefined
  let solved: LineSolved | null
  try {
    solved = solve(expr, typedSides(graph.source ?? '', expr), scope)
  } catch {
    return undefined
  }
  if (solved?.kind !== 'real' || solved.more || !solved.xs?.length || !solved.xs.every(Number.isFinite)) return undefined
  return [...solved.xs]
}

const KIND_WORD: Record<KeyKind, string> = { root: 'root', max: 'max', min: 'min', yIntercept: 'y-intercept' }

/**
 * What a key point's label says, in the student's precision: its first kind and where it is, then
 * anything else it also is — "min (0, −4), y-intercept", "root (2, 0)". The numbers are written
 * as every label in the app writes them (fmtLabel), a power of ten as "1.49 × 10⁻⁸", never with a
 * caret.
 */
export function keyPointLabel(k: KeyPoint, precision: Precision): string {
  const [first, ...rest] = k.kinds.length ? k.kinds : [k.kind]
  // keyPoints never makes a point without a value, but a label for one must not print code words
  // ("undefined" is what fmtLabel says of NaN).
  const num = (v: number): string => (Number.isNaN(v) ? 'no value' : fmtLabel(v, precision))
  return [`${KIND_WORD[first]} (${num(k.x)}, ${num(k.y)})`, ...rest.map((r) => KIND_WORD[r])].join(', ')
}

/** Where a label is drawn, in screen pixels: the left end of its text, the middle of its height, and its width if known. */
export interface LabelSpot {
  x: number
  y: number
  w?: number
}

/** The width taken for a label whose spot does not give one: about that of "min (−1.571, −1)". */
const LABEL_WIDTH = 160

/**
 * Screen positions for labels drawn at `spots`, moved up or down only so that no two whose text
 * would overlap are less than `lineHeight` apart. A label clear of every other stays exactly where
 * it was; a crowd is stacked downwards, the highest staying put. It runs on every frame, so it is
 * one sweep in order of height: each label only ever moves down, past each placed label it would
 * overlap, and the placed labels are kept in order of where they ended up.
 */
export function spreadLabels(spots: readonly LabelSpot[], lineHeight: number): { x: number; y: number }[] {
  const out = spots.map((s) => ({ x: s.x, y: s.y }))
  const width = (i: number) => spots[i].w ?? LABEL_WIDTH
  const order = spots.map((_, i) => i).sort((i, j) => spots[i].y - spots[j].y || i - j)
  const placed: number[] = []
  for (const i of order) {
    let y = out[i].y
    for (const j of placed) {
      if (out[j].x >= out[i].x + width(i) || out[i].x >= out[j].x + width(j)) continue
      if (out[j].y <= y - lineHeight) continue
      if (out[j].y >= y + lineHeight) break
      y = out[j].y + lineHeight
    }
    out[i].y = y
    let k = placed.length
    while (k > 0 && out[placed[k - 1]].y > y) k--
    placed.splice(k, 0, i)
  }
  return out
}

/** Where a key point's label is drawn: the anchor in screen pixels, and which end of the text sits on it. */
interface PlacedLabel {
  x: number
  /** The middle of the label's height. */
  y: number
  /** 'left': the text starts at x. 'right': it ends there. */
  align: 'left' | 'right'
}

/** A label sits this far across from its point, and its middle this far above it. */
const LABEL_GAP = 8
const LABEL_RISE = 14

/**
 * Where to draw the label of each of `points` (their screen positions, with the width of the label
 * where it is known) in a view `width` by `height`, with every label wholly inside it and none over
 * another. A label goes 8 px to the right of its point and 14 px above it; when its text would
 * cross the right edge it goes to the left of the point instead, ending 8 px short of it (and where
 * it fits on neither side, to the side with more room and as far in as it can go); one that would
 * cross the top or the bottom is moved in. Labels that would overlap are stacked a line apart as
 * spreadLabels does, downwards from the highest; where that pushes a stack past the bottom edge it
 * is pushed back up from there, the lowest staying put.
 */
export function placeLabels(points: readonly LabelSpot[], lineHeight: number, width: number, height: number): PlacedLabel[] {
  const half = lineHeight / 2
  const widths = points.map((p) => p.w ?? LABEL_WIDTH)
  const sides = points.map((p, i) => {
    const w = widths[i]
    const toRight = p.x + LABEL_GAP
    const toLeft = p.x - LABEL_GAP - w
    const align: 'left' | 'right' = toRight + w <= width ? 'left' : toLeft >= 0 ? 'right' : p.x - LABEL_GAP > width - toRight ? 'right' : 'left'
    // Where it fits on neither side the text is moved in as far as the edges allow.
    const left = Math.min(Math.max(align === 'left' ? toRight : toLeft, 0), Math.max(0, width - w))
    return { left, align }
  })
  const top = (p: LabelSpot) => Math.max(half, Math.min(height - half, p.y - LABEL_RISE))
  const spread = spreadLabels(points.map((p, i) => ({ x: sides[i].left, y: top(p), w: widths[i] })), lineHeight)
  // A stack stacked downwards may now hang over the bottom: from the lowest up, each label is held
  // to the bottom edge and a line above every label below it that shares its horizontal space.
  const ys = spread.map((s) => s.y)
  const lowestFirst = ys.map((_, i) => i).sort((i, j) => ys[j] - ys[i] || j - i)
  const settled: number[] = []
  for (const i of lowestFirst) {
    let y = Math.min(ys[i], height - half)
    for (const j of settled) {
      if (sides[j].left >= sides[i].left + widths[i] || sides[i].left >= sides[j].left + widths[j]) continue
      y = Math.min(y, ys[j] - lineHeight)
    }
    // A crowd too big for the view is kept in it, overlapping, rather than spread past its edge.
    ys[i] = Math.max(half, y)
    settled.push(i)
  }
  return points.map((_, i) => ({ x: sides[i].align === 'left' ? sides[i].left : sides[i].left + widths[i], y: ys[i], align: sides[i].align }))
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
  const val = (i: number, j: number) => (i < 0 || j < 0 || i > nx || j > ny ? NaN : vals[j * (nx + 1) + i])
  // Whether |F| grows towards an edge from the grid value `far` just beyond its corner value
  // `near`, as it does on both sides of a pole (or whether nothing beyond says otherwise). Towards a
  // crossing of the curve |F| shrinks instead, on at least one side.
  const climbs = (near: number, far: number) => !(far > 0 === near > 0 && Math.abs(far) >= Math.abs(near))
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
      // A change of sign along an edge is a crossing of the curve, or F jumping through infinity at
      // a pole: 1/x = y drew 165 segments up and down x = 0 and tan x = y a thousand along its
      // poles. Where |F| climbs towards the edge from both sides, F is tried at the crossing
      // itself: on the curve it lies between the corner values, beside a pole it is beyond them.
      const edge = (px: number, py: number, va: number, vb: number, beforeA: number, afterB: number) => {
        if (climbs(va, beforeA) && climbs(vb, afterB)) {
          const fp = F(px, py)
          if (!(fp >= Math.min(va, vb) && fp <= Math.max(va, vb))) return
        }
        edges.push([px, py, 0])
      }
      // edge crossings: bottom, right, top, left
      if (v0 > 0 !== v1 > 0) edge(x + lerp(v0, v1) * dx, y, v0, v1, val(i - 1, j), val(i + 2, j))
      if (v1 > 0 !== v2 > 0) edge(x + dx, y + lerp(v1, v2) * dy, v1, v2, val(i + 1, j - 1), val(i + 1, j + 2))
      if (v3 > 0 !== v2 > 0) edge(x + lerp(v3, v2) * dx, y + dy, v3, v2, val(i - 1, j + 1), val(i + 2, j + 1))
      if (v0 > 0 !== v3 > 0) edge(x, y + lerp(v0, v3) * dy, v0, v3, val(i, j - 1), val(i, j + 2))
      // With a pole through the cell, what is left is the curve's own way through it, if any.
      if (edges.length === 2) out.push(edges[0], edges[1])
      else if (edges.length === 4) {
        // Saddle: disambiguate with the centre value.
        const c = F(x + dx / 2, y + dy / 2)
        if (c > 0 === v0 > 0) out.push(edges[0], edges[1], edges[2], edges[3])
        else out.push(edges[0], edges[3], edges[1], edges[2])
      }
    }
  }
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
function turbo(t: number): [number, number, number] {
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
interface Piece {
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
  const usual = 1e-3 * Math.min(Math.max(1, Math.abs(a)), 10)
  // Near 0 the step is kept to a thousandth of the distance to 0, where it was more than a hundredth of it: a pole or
  // the end of a domain at 0 is not stepped across or leaned on (tangent(1/x, 0.001) "had no slope", and 1/x at
  // 0.01 read −9999.75). Never below 10⁻⁸, so an ordinary slope keeps its digits.
  const h = a !== 0 && usual > 1e-2 * Math.abs(a) ? Math.max(1e-3 * Math.abs(a), 1e-8) : usual
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

/** A box on the drawing, lowest corner and highest corner. */
export interface Box {
  min: V3
  max: V3
}

/**
 * The box a set of curves fills, each on its own stretch of x, sampled `n` times a stretch. A
 * question's picture runs where the default view is not: a region under y = 6x to x = 6 reaches
 * y = 36 and a cyclist's position 87 m, both far above the top of the screen, and the camera has
 * to come to them. A value past 10⁹ is an asymptote, not somewhere to frame, and is left out.
 * Null when no curve has a finite value anywhere on its stretch.
 */
export function curveBox(curves: { f: Fx; from: number; to: number }[], n = 64): Box | null {
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const { f, from, to } of curves) {
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue
    for (let i = 0; i <= n; i++) {
      const x = from + ((to - from) * i) / n
      let y: number
      try {
        y = f(x)
      } catch {
        continue
      }
      if (!Number.isFinite(y) || Math.abs(y) > 1e9) continue
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
    }
  }
  if (!Number.isFinite(x0)) return null
  return { min: [x0, y0, 0], max: [x1, y1, 0] }
}
