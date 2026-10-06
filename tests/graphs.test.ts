// The two graph kinds a question picture can ask for, and the tangent's slope. A piecewise curve
// must read as one line through every join, the region between two curves must be shaded exactly
// between them and report the right area, and the slope of a tangent must be the derivative — all
// pure geometry, checked here rather than through the viewport. So are a graph's key points (its
// roots, turning points and y-intercept), the words and numbers of their labels, and where those
// labels go so that no two sit on one spot.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The stylesheet is not loaded here, so the drawing's colours fall back.
vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { betweenArea, betweenMesh, carriedSolutions, implicitSegments, keyPointLabel, keyPoints, placeLabels, sampleExplicit, samplePiecewise, shownKeyPoints, slopeAt, solvedLineXs, spreadLabels, typedSides, verticalLineXs, type KeyPoint, type LineSolved } from '../src/renderer/src/math/graphs'
import { solutionsInX, visualizeBetween, visualizePiecewise, visualizeTangentAt } from '../src/renderer/src/core/visualize'
import { scene } from '../src/renderer/src/core/store'
import { Builder } from '../src/renderer/src/core/factory'
import { compileScalar } from '../src/renderer/src/math/expr'
import type { GraphObj, PointObj, TextObj } from '../src/renderer/src/core/types'
import type { V3 } from '../src/renderer/src/math/vec'

const sq = (x: number) => x * x
const line = (x: number) => x + 2
const zero = () => 0

/** Sum of the areas of the triangles in a fill buffer (shoelace, unsigned). */
function fillArea(fill: Float32Array): number {
  let area = 0
  for (let i = 0; i + 8 < fill.length; i += 9) {
    const [ax, ay, bx, by, cx, cy] = [fill[i], fill[i + 1], fill[i + 3], fill[i + 4], fill[i + 6], fill[i + 7]]
    area += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2
  }
  return area
}

describe('samplePiecewise', () => {
  const pieces = [
    { f: sq, from: -3, to: 0 },
    { f: (x: number) => x, from: 0, to: 2 },
    { f: () => 2, from: 2, to: 4 }
  ]

  it('joins three pieces that meet into one polyline with x strictly increasing', () => {
    const polys = samplePiecewise(pieces, 50)
    expect(polys).toHaveLength(1)
    const p = polys[0]
    expect(p[0][0]).toBeCloseTo(-3, 9)
    expect(p[p.length - 1][0]).toBeCloseTo(4, 9)
    for (let i = 1; i < p.length; i++) expect(p[i][0], `sample ${i} sits after sample ${i - 1}`).toBeGreaterThan(p[i - 1][0])
  })

  it('keeps the shared point once, so there is no zero-length segment at a join', () => {
    const p = samplePiecewise(pieces, 50)[0]
    const atJoin = p.filter((q) => Math.abs(q[0]) < 1e-9)
    expect(atJoin).toHaveLength(1)
  })

  it('follows each formula on its own stretch', () => {
    const p = samplePiecewise(pieces, 100)[0]
    const expected = (x: number) => (x < 0 ? sq(x) : x < 2 ? x : 2)
    for (const [x, y] of p) expect(y, `at x = ${x}`).toBeCloseTo(expected(x), 6)
    const near = (x: number): V3 => p.reduce((best, q) => (Math.abs(q[0] - x) < Math.abs(best[0] - x) ? q : best))
    expect(near(-2)[0]).toBeCloseTo(-2, 1)
    expect(near(3)[0]).toBeCloseTo(3, 1)
  })

  it('breaks the line where two pieces do not meet', () => {
    const polys = samplePiecewise([pieces[0], pieces[1], { f: () => 3, from: 2, to: 4 }], 50)
    expect(polys).toHaveLength(2)
    expect(polys[0][polys[0].length - 1][1]).toBeCloseTo(2, 9)
    expect(polys[1][0][1]).toBeCloseTo(3, 9)
  })

  it('takes the pieces in order of x whatever order they were given in', () => {
    const polys = samplePiecewise([pieces[2], pieces[0], pieces[1]], 50)
    expect(polys).toHaveLength(1)
    expect(polys[0][0][0]).toBeCloseTo(-3, 9)
  })

  it('draws nothing for an empty stretch and ignores a piece with no width', () => {
    expect(samplePiecewise([], 50)).toEqual([])
    expect(samplePiecewise([{ f: sq, from: 1, to: 1 }], 50)).toEqual([])
  })

  it('reads a piece written with its ends the wrong way round', () => {
    const polys = samplePiecewise([{ f: sq, from: 2, to: -1 }], 30)
    expect(polys).toHaveLength(1)
    expect(polys[0][0][0]).toBeCloseTo(-1, 9)
  })
})

describe('betweenMesh', () => {
  it('shades x² down to the axis on [0, 3] with area 9', () => {
    const { fill } = betweenMesh(sq, zero, 0, 3, 400)
    expect(fillArea(fill)).toBeCloseTo(9, 3)
  })

  it('shades exactly between x + 2 and x² on [-1, 2]: every vertex lies between the curves', () => {
    const { fill, outline } = betweenMesh(line, sq, -1, 2, 400)
    expect(fillArea(fill)).toBeCloseTo(4.5, 3)
    for (let i = 0; i < fill.length; i += 3) {
      const x = fill[i]
      const y = fill[i + 1]
      expect(x).toBeGreaterThanOrEqual(-1 - 1e-9)
      expect(x).toBeLessThanOrEqual(2 + 1e-9)
      expect(y).toBeGreaterThanOrEqual(Math.min(sq(x), line(x)) - 1e-6)
      expect(y).toBeLessThanOrEqual(Math.max(sq(x), line(x)) + 1e-6)
    }
    // The curves meet at both ends, so the outline is just the two curves: no closing edges.
    expect(outline).toHaveLength(2)
  })

  it('closes the ends with vertical edges where the curves are apart', () => {
    const { outline } = betweenMesh(sq, zero, 1, 3, 100)
    expect(outline).toHaveLength(4)
    const edges = outline.slice(2)
    expect(edges[0][0][0]).toBeCloseTo(1, 9)
    expect(edges[0][1][1]).toBeCloseTo(1, 9)
    expect(edges[1][0][0]).toBeCloseTo(3, 9)
    expect(edges[1][1][1]).toBeCloseTo(9, 9)
  })

  it('splits a column at a crossing instead of drawing a bow-tie', () => {
    // y = x and y = −x cross at 0; the region between them on [-1, 1] is two triangles of area 1.
    const { fill } = betweenMesh((x) => x, (x) => -x, -1, 1, 3)
    expect(fillArea(fill)).toBeCloseTo(2, 6)
  })

  it('leaves a column empty where a curve has no value', () => {
    const { fill } = betweenMesh((x) => Math.sqrt(x), zero, -1, 1, 200)
    for (let i = 0; i < fill.length; i += 3) expect(fill[i]).toBeGreaterThanOrEqual(-1e-9)
    expect(fillArea(fill)).toBeCloseTo(2 / 3, 2)
  })

  it('breaks the outline at an asymptote instead of joining straight through it', () => {
    // 1/x on [−1, 1] in a view 20 high: the top outline is two pieces, neither crossing x = 0.
    const { outline } = betweenMesh((x) => 1 / x, zero, -1, 1, 400, 20)
    const curve = outline.filter((poly) => poly.length > 2 && poly.some((p) => p[1] !== 0))
    expect(curve).toHaveLength(2)
    for (const poly of curve) {
      const signs = new Set(poly.map((p) => Math.sign(p[0])))
      expect(signs.size).toBe(1)
    }
  })

  it('accepts the ends the wrong way round', () => {
    expect(fillArea(betweenMesh(sq, zero, 3, 0, 400).fill)).toBeCloseTo(9, 3)
  })
})

describe('betweenArea', () => {
  it('matches the integral: x² on [0, 3] is 9', () => {
    expect(betweenArea(sq, zero, 0, 3)).toBeCloseTo(9, 9)
  })

  it('x + 2 over x² on [-1, 2] is 4.5, whichever is called upper', () => {
    expect(betweenArea(line, sq, -1, 2)).toBeCloseTo(4.5, 9)
    expect(betweenArea(sq, line, -1, 2)).toBeCloseTo(4.5, 9)
  })

  it('counts the whole region when the curves swap over', () => {
    expect(betweenArea((x) => x, (x) => -x, -1, 1)).toBeCloseTo(2, 9)
    // sin x and cos x cross at π/4 inside [0, π/2]: 2(√2 − 1).
    expect(betweenArea(Math.sin, Math.cos, 0, Math.PI / 2)).toBeCloseTo(2 * (Math.SQRT2 - 1), 6)
  })

  it('skips where a curve has no value rather than returning NaN', () => {
    expect(betweenArea((x) => Math.sqrt(x), zero, -1, 1)).toBeCloseTo(2 / 3, 3)
  })

  it('is NaN where a curve runs off to infinity, because the integral diverges', () => {
    expect(betweenArea((x) => 1 / x, zero, -1, 1)).toBeNaN()
    expect(betweenArea((x) => 1 / (x - 0.3), zero, 0, 1)).toBeNaN()
    // The same pole outside the stretch is no trouble.
    expect(betweenArea((x) => 1 / x, zero, 1, 2)).toBeCloseTo(Math.LN2, 6)
  })

  it('gives a steep but finite region its area rather than calling it infinite', () => {
    // e^x reaches 4.85 × 10⁸ at 20 and x⁴ reaches 1.3 × 10⁷ at 60; both were once refused.
    const exact = Math.exp(20) - 1
    expect(betweenArea(Math.exp, zero, 0, 20) / exact).toBeCloseTo(1, 8)
    expect(betweenArea((x) => x ** 4, zero, 0, 60) / (60 ** 5 / 5)).toBeCloseTo(1, 8)
    // A narrow spike is not a pole either.
    expect(betweenArea((x) => Math.exp(-((x - 0.5) ** 2) / 1e-8), zero, 0, 1)).toBeGreaterThan(0)
  })
})

describe('slopeAt', () => {
  it('is the derivative for polynomials, trig and exponentials', () => {
    expect(slopeAt(sq, 1)).toBeCloseTo(2, 9)
    expect(slopeAt((x) => x * x * x - 2 * x, 2)).toBeCloseTo(10, 9)
    expect(slopeAt(Math.sin, 0)).toBeCloseTo(1, 9)
    expect(slopeAt(Math.exp, 1)).toBeCloseTo(Math.E, 8)
  })

  it('stays accurate far from the origin', () => {
    // The step once grew with |a| without limit: h = 1 at 1000 put sin x's slope out in the third digit.
    expect(slopeAt(Math.sin, 1000)).toBeCloseTo(Math.cos(1000), 8)
    expect(slopeAt(sq, 1e6)).toBeCloseTo(2e6, 3)
    expect(slopeAt(Math.abs, -1e5)).toBeCloseTo(-1, 6)
  })

  it('is NaN where the function has no value on one side', () => {
    expect(slopeAt(Math.sqrt, 0)).toBeNaN()
  })

  it('is NaN at a corner, where the left and right slopes disagree', () => {
    expect(slopeAt(Math.abs, 0)).toBeNaN()
    expect(slopeAt((x) => Math.abs(x - 2) + x, 2)).toBeNaN()
    expect(slopeAt(Math.floor, 1)).toBeNaN()
  })

  it('is NaN at a vertical tangent, where the estimate never settles', () => {
    expect(slopeAt(Math.cbrt, 0)).toBeNaN()
    expect(slopeAt((x) => Math.sqrt(Math.abs(x)) * Math.sign(x), 0)).toBeNaN()
  })

  it('still gives a steep smooth curve its slope', () => {
    expect(slopeAt(Math.tan, 1.55) / (1 / Math.cos(1.55) ** 2)).toBeCloseTo(1, 4)
    expect(slopeAt((x) => Math.exp(10 * x), 1)).toBeCloseTo(10 * Math.exp(10), 0)
    expect(slopeAt(Math.abs, 0.5)).toBeCloseTo(1, 9)
  })
})

// ---------------------------------------------------------------------------
// Key points: the dots and labels on a selected graph. Each spot on the curve is one point with one
// label. y = x² − 4 once had two at its bottom: the golden-section search stopped on the flat floor
// at x = 1.49×10⁻⁸, the y-intercept sat at 0, only points of the same kind were merged, and the
// y-intercept's "(0, −4)" was drawn on the same pixel over the front of "(1.49×10^-8, −4)", so the
// student read "0^-8, −4)".
// ---------------------------------------------------------------------------

/** y = f(x) compiled the way the graph view compiles what the student typed. */
const typed = (expr: string) => {
  const g = compileScalar(expr, ['x'], () => ({}))
  return (x: number) => g({ x })
}
const byX = (pts: KeyPoint[]): KeyPoint[] => [...pts].sort((a, b) => a.x - b.x)
const near = (pts: KeyPoint[], x: number, within: number): KeyPoint[] => pts.filter((k) => Math.abs(k.x - x) < within)
/** A point names its turning first, then that it is a root, then that it is the y-intercept. */
const RANK: Record<KeyPoint['kind'], number> = { max: 0, min: 0, root: 1, yIntercept: 2 }
const dp3 = { decimals: 3, precisionMode: 'dp' } as const
const sf3 = { decimals: 3, precisionMode: 'sf' } as const

describe('keyPoints', () => {
  const parabola = typed('x^2 - 4')

  it.each([
    { n: 1200, how: 'as densely as the graph view asks' },
    { n: undefined, how: 'at the default density' }
  ])('y = x² − 4 on [−10, 10] has one point at its bottom, exactly (0, −4), the min and the y-intercept, and its roots at ±2 ($how)', ({ n }) => {
    const pts = byX(n === undefined ? keyPoints(parabola, -10, 10) : keyPoints(parabola, -10, 10, n))
    const bottom = near(pts, 0, 0.5)
    expect(bottom, 'one point at the bottom, not a min and a y-intercept on top of each other').toHaveLength(1)
    expect(Math.abs(bottom[0].x), 'x of the bottom').toBe(0)
    expect(bottom[0].y).toBe(-4)
    expect(bottom[0].kind).toBe('min')
    expect(bottom[0].kinds).toEqual(['min', 'yIntercept'])
    expect(pts).toHaveLength(3)
    const [left, , right] = pts
    expect(Math.abs(left.x + 2)).toBeLessThan(1e-12)
    expect(Math.abs(right.x - 2)).toBeLessThan(1e-12)
    for (const root of [left, right]) {
      expect(root.kind).toBe('root')
      expect(root.kinds).toEqual(['root'])
      expect(Math.abs(root.y)).toBe(0)
    }
  })

  it('zoomed right in on the bottom of y = x² − 4 it is still one point, at exactly (0, −4)', () => {
    // This window is 0.003 wide, so a snap to 0 within 10⁻⁹ of it reaches only 3×10⁻¹²: the bottom
    // has to be found where it is, not rounded there from 1.49×10⁻⁸.
    const pts = keyPoints(parabola, -0.001, 0.002, 1200)
    expect(pts).toHaveLength(1)
    expect(Math.abs(pts[0].x)).toBe(0)
    expect(pts[0].y).toBe(-4)
    expect(pts[0].kinds).toEqual(['min', 'yIntercept'])
  })

  it('the top of y = cos x is one point, exactly (0, 1), the max and the y-intercept', () => {
    const top = near(keyPoints(typed('cos(x)'), -10, 10, 1200), 0, 0.5)
    expect(top).toHaveLength(1)
    expect(Math.abs(top[0].x)).toBe(0)
    expect(top[0].y).toBe(1)
    expect(top[0].kind).toBe('max')
    expect(top[0].kinds).toEqual(['max', 'yIntercept'])
  })

  it.each([
    [-10, 10],
    [-13.37, 12.91]
  ])('y = (x − 1)² on [%s, %s] has its min at exactly x = 1, and that point is also its root', (a, b) => {
    // The curve touches the axis there without crossing it, so no two samples differ in sign: the
    // root was found only on a window that happened to put a sample on x = 1, and then as a second
    // point on top of the min.
    const pts = byX(keyPoints(typed('(x - 1)^2'), a, b, 1200))
    expect(pts).toHaveLength(2)
    const [yInt, bottom] = pts
    expect(bottom.x).toBe(1)
    expect(bottom.y).toBe(0)
    expect(bottom.kind).toBe('min')
    expect(bottom.kinds).toEqual(['min', 'root'])
    expect(Math.abs(yInt.x)).toBe(0)
    expect(yInt.y).toBe(1)
    expect(yInt.kinds).toEqual(['yIntercept'])
  })

  it.each([
    [-10, 10],
    [-13.37, 12.91]
  ])('y = x² on [%s, %s] touches the axis at the origin: one point, (0, 0), the min, a root and the y-intercept', (a, b) => {
    const pts = keyPoints(typed('x^2'), a, b, 1200)
    expect(pts).toHaveLength(1)
    expect(Math.abs(pts[0].x)).toBe(0)
    expect(pts[0].y).toBe(0)
    expect(pts[0].kind).toBe('min')
    expect(pts[0].kinds).toEqual(['min', 'root', 'yIntercept'])
  })

  it('a bottom just above the axis is not a root: y = x² + 0.001 has none', () => {
    const pts = keyPoints(typed('x^2 + 0.001'), -10, 10, 1200)
    expect(pts).toHaveLength(1)
    expect(Math.abs(pts[0].x)).toBe(0)
    expect(pts[0].y).toBe(0.001)
    expect(pts[0].kinds).toEqual(['min', 'yIntercept'])
  })

  it('points that are merely close stay apart: y = x² − 0.0001 keeps its roots at ±0.01 beside its bottom', () => {
    // Each root is less than one sample step (1/60) from the bottom, but it is another point of the
    // curve: "min (0, −0.0001), root" would name a root that is not there.
    const pts = byX(keyPoints(typed('x^2 - 0.0001'), -10, 10, 1200))
    expect(pts.map((k) => k.kinds)).toEqual([['root'], ['min', 'yIntercept'], ['root']])
    expect(Math.abs(pts[0].x + 0.01)).toBeLessThan(1e-12)
    expect(Math.abs(pts[1].x)).toBe(0)
    expect(pts[1].y).toBe(-0.0001)
    expect(Math.abs(pts[2].x - 0.01)).toBeLessThan(1e-12)
  })

  it('sin x on [−10, 10]: three maxima and three minima at π/2 + kπ to 10⁻⁹, seven roots at kπ, and the origin is one point', () => {
    const pts = byX(keyPoints(typed('sin(x)'), -10, 10, 1200))
    const h = Math.PI / 2
    const maxima = pts.filter((k) => k.kind === 'max')
    const minima = pts.filter((k) => k.kind === 'min')
    expect(maxima.map((k) => Math.round(k.x / h))).toEqual([-3, 1, 5])
    expect(minima.map((k) => Math.round(k.x / h))).toEqual([-5, -1, 3])
    for (const k of [...maxima, ...minima]) expect(Math.abs(k.x - Math.round(k.x / h) * h), `${k.kind} at ${k.x}`).toBeLessThan(1e-9)
    const roots = pts.filter((k) => k.kind === 'root')
    // `+ 0` turns a −0 into 0, which toEqual would otherwise tell apart.
    expect(roots.map((k) => Math.round(k.x / Math.PI) + 0)).toEqual([-3, -2, -1, 0, 1, 2, 3])
    for (const k of roots) expect(Math.abs(k.x - Math.round(k.x / Math.PI) * Math.PI), `root at ${k.x}`).toBeLessThan(1e-12)
    const origin = near(pts, 0, 0.5)
    expect(origin).toHaveLength(1)
    expect(origin[0].kinds).toEqual(['root', 'yIntercept'])
    expect(pts).toHaveLength(13)
  })

  it.each([
    { expr: 'x^4 - 4', shown: 'x⁴ − 4' },
    { expr: 'x^6 - 4', shown: 'x⁶ − 4' }
  ])('a very flat bottom, y = $shown, is one point at exactly (0, −4), not two', ({ expr }) => {
    // x⁶ − 4 is −4 to the last bit for every |x| below 0.0028, and the search that walked to the
    // right-hand end of that flat floor put the min at (0.002, −4) beside the y-intercept.
    const bottom = near(keyPoints(typed(expr), -10, 10, 1200), 0, 0.5)
    expect(bottom).toHaveLength(1)
    expect(Math.abs(bottom[0].x)).toBe(0)
    expect(bottom[0].y).toBe(-4)
    expect(bottom[0].kinds).toEqual(['min', 'yIntercept'])
  })

  it.each([
    [-10, 10],
    [-9.91, 10.07]
  ])('a pole is not a root: tan x and 1/x on [%s, %s]', (a, b) => {
    // tan x jumps from +∞ to −∞ at π/2 + kπ and 1/x at 0: a change of sign with no zero in it.
    // Already right; pinned so that merging and snapping keep it so. The second window puts no
    // sample on a pole.
    const isRoot = (k: KeyPoint) => k.kind === 'root' || (k.kinds ?? []).includes('root')
    const tanRoots = byX(keyPoints(typed('tan(x)'), a, b, 1200).filter(isRoot))
    expect(tanRoots.map((k) => Math.round(k.x / Math.PI) + 0)).toEqual([-3, -2, -1, 0, 1, 2, 3])
    for (const k of tanRoots) expect(Math.abs(k.x - Math.round(k.x / Math.PI) * Math.PI), `root at ${k.x}`).toBeLessThan(1e-12)
    expect(keyPoints(typed('1/x'), a, b, 1200).filter(isRoot)).toEqual([])
  })

  it.each([
    [-10, 10],
    [-9.91, 10.07]
  ])('a pole is not a turning point either, and every key point is at a finite height, on [%s, %s]', (a, b) => {
    // Beside a pole the samples climb towards it on one side and come back down on the other, and
    // that read as a max and a min at the pole itself: tan x had twelve, at heights such as
    // −3.27×10¹⁵, and 1/x two at x ≈ 10⁻¹⁹ — which a snap to x = 0 would put at 1/0 = ∞.
    for (const expr of ['tan(x)', '1/x', '1/(x - 0.3)']) {
      const pts = keyPoints(typed(expr), a, b, 1200)
      expect(pts.filter((k) => k.kind === 'max' || k.kind === 'min'), `turning points of y = ${expr}`).toEqual([])
      for (const k of pts) expect(Number.isFinite(k.x) && Number.isFinite(k.y), `y = ${expr} at (${k.x}, ${k.y})`).toBe(true)
    }
  })

  it('every point lists its kinds, most important first, and no two points share a spot', () => {
    for (const expr of ['x^2 - 4', '(x - 1)^2', 'x^2', 'x^2 - 0.0001', 'cos(x)', 'sin(x)', 'x^4 - 4', 'x^3 - 3x']) {
      for (const [a, b] of [
        [-10, 10],
        [-13.37, 12.91]
      ]) {
        const pts = byX(keyPoints(typed(expr), a, b, 1200))
        const where = `y = ${expr} on [${a}, ${b}]`
        for (const k of pts) {
          expect(k.kinds?.[0], `${where}: the kinds of (${k.x}, ${k.y}) start with its kind`).toBe(k.kind)
          for (let i = 1; i < k.kinds.length; i++) expect(RANK[k.kinds[i]], `${where}: kinds ${k.kinds.join(', ')}`).toBeGreaterThan(RANK[k.kinds[i - 1]])
        }
        for (let i = 1; i < pts.length; i++) expect(pts[i].x - pts[i - 1].x, `${where}: two points at x = ${pts[i].x}`).toBeGreaterThan(1e-9 * (b - a))
      }
    }
  })

  it.each([
    [-10, 10],
    [-9.91, 10.07]
  ])('a hole is filled from both sides: sin x / x and its kin turn at (0, 1) on [%s, %s], whether or not a sample lands on the 0/0', (a, b) => {
    // sin x / x is 0/0 at x = 0, but both sides close in on 1. The top was found at exactly 0 and
    // then dropped because f(0) has no value; on a window with a sample on 0 that sample had no
    // value, so no three samples ever bracketed the top. The curve has no value on the y-axis, so
    // the point is not a y-intercept.
    for (const [expr, label] of [
      ['sin(x)/x', 'max (0, 1)'],
      ['(sin(x)/x)^2', 'max (0, 1)'],
      ['tan(x)/x', 'min (0, 1)'],
      ['x/sin(x)', 'min (0, 1)']
    ]) {
      const top = near(keyPoints(typed(expr), a, b, 1200), 0, 0.5)
      expect(top.map((k) => keyPointLabel(k, dp3)), `y = ${expr}`).toEqual([label])
      expect(Math.abs(top[0].x), `y = ${expr}`).toBe(0)
      expect(Math.abs(top[0].y - 1), `y = ${expr}`).toBeLessThan(1e-12)
    }
    // A 0/0 whose sides run off to infinity is a pole, not a hole: x/x³ is 1/x² and sin x / x³ nearly so.
    for (const expr of ['x/x^3', 'sin(x)/x^3']) expect(near(keyPoints(typed(expr), a, b, 1200), 0, 0.5), `y = ${expr}`).toEqual([])
  })

  it.each([
    [-10, 10],
    [-9.91, 10.07]
  ])('a peak narrower than a sample step, and the point of a cusp, are turning points, not poles, on [%s, %s]', (a, b) => {
    // The top of 1/(1 + 10⁶(x − 0.5)²) is 1, but the samples beside it reach only about 0.015, and
    // a test that called any top far above its samples a pole dropped it; so it did the point of
    // 1 − |x|^0.1. A pole runs away as the step shrinks; these settle on one height from both sides.
    const narrow = keyPoints(typed('1/(1 + 1000000(x - 0.5)^2)'), a, b, 1200).filter((k) => k.kind === 'max')
    expect(narrow.map((k) => keyPointLabel(k, dp3))).toEqual(['max (0.5, 1)'])
    expect(Math.abs(narrow[0].x - 0.5)).toBeLessThan(1e-9)
    expect(Math.abs(narrow[0].y - 1)).toBeLessThan(1e-12)
    for (const expr of ['1/(1 + 1000000x^2)', '1 - abs(x)^0.1']) {
      const top = near(keyPoints(typed(expr), a, b, 1200), 0, 0.5)
      expect(top.map((k) => keyPointLabel(k, dp3)), `y = ${expr}`).toEqual(['max (0, 1), y-intercept'])
      expect(Math.abs(top[0].x), `y = ${expr}`).toBe(0)
      expect(top[0].y, `y = ${expr}`).toBe(1)
    }
  })

  it.each([
    [-10, 10],
    [-9.91, 10.07]
  ])('a jump is not a turning point: x − floor(x) never reaches the 1 its teeth climb to, and floor(x) has no max or min, on [%s, %s]', (a, b) => {
    // Each tooth of the sawtooth climbs towards 1 and drops back to 0 before it gets there: the
    // left side settles on 1 and the right on 0, so there is no top, only a jump.
    for (const expr of ['x - floor(x)', 'floor(x)']) {
      const turns = keyPoints(typed(expr), a, b, 1200).filter((k) => k.kinds.includes('max') || k.kinds.includes('min'))
      expect(turns.map((k) => keyPointLabel(k, dp3)), `y = ${expr}`).toEqual([])
    }
  })

  it.each([
    [-10, 10],
    [-9.91, 10.07]
  ])('a bottom so flat that the samples around it are equal is still a min: x¹⁰ − 4 and (x − 1)¹⁰ − 4 on [%s, %s]', (a, b) => {
    // x¹⁰ − 4 is −4 to the last bit for every |x| below 0.029, so the samples there are all equal,
    // none is lower than both its neighbours, and only the y-intercept was shown.
    const flat = near(keyPoints(typed('x^10 - 4'), a, b, 1200), 0, 0.5)
    expect(flat.map((k) => keyPointLabel(k, dp3))).toEqual(['min (0, −4), y-intercept'])
    expect(Math.abs(flat[0].x)).toBe(0)
    expect(flat[0].y).toBe(-4)
    const shifted = near(keyPoints(typed('(x - 1)^10 - 4'), a, b, 1200), 1, 0.5)
    expect(shifted.map((k) => keyPointLabel(k, dp3))).toEqual(['min (1, −4)'])
    expect(Math.abs(shifted[0].x - 1)).toBeLessThan(1e-12)
    expect(shifted[0].y).toBe(-4)
  })

  it.each([
    [-1e6, 1e6],
    [-1e7, 1e7]
  ])('zoomed far out, on [%s, %s], "the same spot" and "on the axis" are judged near the point, not across the window', (a, b) => {
    // A billionth of a window 2×10⁷ wide is 0.02, so the root of y = x − 0.01 was snapped onto the
    // y-axis as "root (0, 0), y-intercept"; and the bottom of y = x² − 0.0001, 0.0001 below the
    // axis, was called a root because the samples beside it differ by millions.
    const line = byX(keyPoints(typed('x - 0.01'), a, b, 1200))
    expect(line.map((k) => k.kinds)).toEqual([['yIntercept'], ['root']])
    expect(line[0].x).toBe(0)
    expect(line[0].y).toBe(-0.01)
    expect(Math.abs(line[1].x - 0.01)).toBeLessThan(1e-12)
    const pts = byX(keyPoints(typed('x^2 - 0.0001'), a, b, 1200))
    expect(pts.map((k) => k.kinds)).toEqual([['root'], ['min', 'yIntercept'], ['root']])
    expect(Math.abs(pts[0].x + 0.01)).toBeLessThan(1e-12)
    expect(Math.abs(pts[1].x)).toBe(0)
    expect(pts[1].y).toBe(-0.0001)
    expect(Math.abs(pts[2].x - 0.01)).toBeLessThan(1e-12)
  })

  it.each([
    [-10, 10],
    [-9.91, 10.07]
  ])('a bottom that touches the axis only to within rounding is still one point on it: y = x² − 0.2x + 0.01 on [%s, %s]', (a, b) => {
    // 0.2 and 0.01 are not exact in binary, so this (x − 0.1)² dips 10⁻¹⁸ below the axis and crosses
    // it twice, 2×10⁻⁹ apart. A tighter same-spot distance must not split that touch into a min and
    // two roots, nor lose the min to its rounding.
    const pts = byX(keyPoints(typed('x^2 - 0.2x + 0.01'), a, b, 1200))
    expect(pts.map((k) => keyPointLabel(k, dp3))).toEqual(['y-intercept (0, 0.01)', 'min (0.1, 0), root'])
    expect(Math.abs(pts[1].x - 0.1)).toBeLessThan(1e-8)
  })

  it.each([
    [-10, 10],
    [-9.91, 10.07]
  ])('a stretch of curve lying along the x-axis has no root dots, on [%s, %s]', (a, b) => {
    // Every sample exactly 0 was a root: y = 0 had 1201, |x| − x a few hundred along x ≥ 0 and
    // floor(x) one at each sample of its step on [0, 1), and selecting the graph drew them all and
    // stacked their labels over half the view. Two zero samples in a row are a stretch on the axis.
    const isRoot = (k: KeyPoint) => k.kinds.includes('root')
    for (const expr of ['0', 'abs(x) - x', 'floor(x)']) expect(keyPoints(typed(expr), a, b, 1200).filter(isRoot), `y = ${expr}`).toEqual([])
    expect(keyPoints(typed('0'), a, b, 1200).map((k) => keyPointLabel(k, dp3))).toEqual(['y-intercept (0, 0)'])
    // A flat bottom lying on the axis is a min at the middle of its stretch, not a root either.
    const step = keyPoints(typed('abs(floor(x))'), a, b, 1200).filter((k) => k.x > 0 && k.x < 1)
    expect(step.map((k) => k.kinds)).toEqual([['min']])
    expect(Math.abs(step[0].x - 0.5)).toBeLessThan(1e-9)
  })

  it('a single sample on the axis is still a root: x·(x − 2) at exactly 0 and 2, x − 10 and x + 10 at the ends of the window, √(−x) where it ends', () => {
    const roots = (expr: string) => byX(keyPoints(typed(expr), -10, 10, 1200).filter((k) => k.kinds.includes('root'))).map((k) => k.x + 0)
    expect(roots('x*(x - 2)')).toEqual([0, 2])
    expect(roots('x - 10')).toEqual([10])
    expect(roots('x + 10')).toEqual([-10])
    // The sample on 0 is the last one with a value: the root was looked for only between two samples that both had one.
    expect(roots('sqrt(-x)')).toEqual([0])
  })
})

describe('keyPointLabel', () => {
  it('the bottom of y = x² − 4 reads "min (0, −4), y-intercept", in decimal places or significant figures', () => {
    const bottom = near(keyPoints(typed('x^2 - 4'), -10, 10, 1200), 0, 0.5)
    expect(bottom.map((k) => keyPointLabel(k, dp3))).toEqual(['min (0, −4), y-intercept'])
    expect(bottom.map((k) => keyPointLabel(k, 3))).toEqual(['min (0, −4), y-intercept'])
    expect(bottom.map((k) => keyPointLabel(k, sf3))).toEqual(['min (0, −4.00), y-intercept'])
  })

  it("names a point's kind before its coordinates and its other kinds after them", () => {
    expect(keyPointLabel({ x: 2, y: 0, kind: 'root', kinds: ['root'] }, dp3)).toBe('root (2, 0)')
    expect(keyPointLabel({ x: -2, y: 0, kind: 'root', kinds: ['root'] }, dp3)).toBe('root (−2, 0)')
    expect(keyPointLabel({ x: Math.PI / 2, y: 1, kind: 'max', kinds: ['max'] }, dp3)).toBe('max (1.571, 1)')
    expect(keyPointLabel({ x: Math.PI / 2, y: 1, kind: 'max', kinds: ['max'] }, sf3)).toBe('max (1.57, 1.00)')
    expect(keyPointLabel({ x: 0, y: 1, kind: 'yIntercept', kinds: ['yIntercept'] }, dp3)).toBe('y-intercept (0, 1)')
    expect(keyPointLabel({ x: 0, y: 0, kind: 'min', kinds: ['min', 'root', 'yIntercept'] }, dp3)).toBe('min (0, 0), root, y-intercept')
  })

  it('writes a tiny or huge coordinate with a raised power of ten, never a caret', () => {
    // fmt and fmtPrecise write 1.49×10^-8 in plain text; a label on the drawing raises the power.
    // A space either side of × is the label formatter's choice.
    expect(keyPointLabel({ x: 1.49e-8, y: -4, kind: 'min', kinds: ['min'] }, dp3)).toMatch(/^min \(1\.49[ \u00a0]?×[ \u00a0]?10⁻⁸, −4\)$/)
    expect(keyPointLabel({ x: 1.23e-7, y: 2, kind: 'max', kinds: ['max'] }, sf3)).toMatch(/^max \(1\.23[ \u00a0]?×[ \u00a0]?10⁻⁷, 2\.00\)$/)
    // At 3 s.f. fmtPrecise writes 0.000123 out in full; a label formatter may raise it instead.
    expect(keyPointLabel({ x: 0.000123, y: 2, kind: 'max', kinds: ['max'] }, sf3)).toMatch(/^max \((0\.000123|1\.23[ \u00a0]?×[ \u00a0]?10⁻⁴), 2\.00\)$/)
    expect(keyPointLabel({ x: 3, y: 2.5e10, kind: 'max', kinds: ['max'] }, dp3)).toMatch(/^max \(3, 2\.5[ \u00a0]?×[ \u00a0]?10¹⁰\)$/)
    expect(keyPointLabel({ x: 3, y: -2.5e10, kind: 'min', kinds: ['min'] }, sf3)).toMatch(/^min \(3\.00, −2\.50[ \u00a0]?×[ \u00a0]?10¹⁰\)$/)
  })

  it('writes a power of ten as every other label in the app does (fmtLabel): spaced round the ×, the power raised, no caret (polish H17)', () => {
    expect(keyPointLabel({ x: 1.23e-7, y: 0, kind: 'root', kinds: ['root'] }, sf3)).toBe('root (1.23\u00a0×\u00a010⁻⁷, 0)')
    expect(keyPointLabel({ x: 1.49e-8, y: -4, kind: 'min', kinds: ['min', 'yIntercept'] }, dp3)).toBe('min (1.49\u00a0×\u00a010⁻⁸, −4), y-intercept')
    expect(keyPointLabel({ x: 3, y: -2.5e10, kind: 'min', kinds: ['min'] }, sf3)).toBe('min (3.00, −2.50\u00a0×\u00a010¹⁰)')
    expect(keyPointLabel({ x: 3, y: 2.5e10, kind: 'max', kinds: ['max'] }, 3)).toBe('max (3, 2.5\u00a0×\u00a010¹⁰)')
    // Both coordinates, in every precision the student can choose: a caret is programming syntax,
    // and the unspaced ×10 of fmt itself is not what a label says.
    for (const v of [1.23e-7, -4.56e-9, 2.5e10, -7.89e15, 1e300, 1e-300]) {
      for (const p of [dp3, sf3, 0, 3, 6, { decimals: 1, precisionMode: 'sf' } as const]) {
        const label = keyPointLabel({ x: v, y: -v, kind: 'max', kinds: ['max', 'root'] }, p)
        expect(label, `${v} at ${JSON.stringify(p)}`).not.toContain('^')
        expect(label, `${v} at ${JSON.stringify(p)}`).not.toMatch(/×10/)
      }
    }
  })

  it('no label ever shows a caret, NaN, Infinity or undefined', () => {
    const banned = /\^|NaN|Infinity|undefined/
    for (const expr of ['x^2 - 4', 'x^2 + 0.001', 'x^6 - 4', 'sin(x)', 'tan(x)', '1/x', '1/(x - 0.3)']) {
      for (const [a, b] of [
        [-10, 10],
        [-9.91, 10.07],
        [-0.001, 0.002]
      ]) {
        for (const k of keyPoints(typed(expr), a, b, 1200)) {
          for (const p of [dp3, sf3, 6]) expect(keyPointLabel(k, p), `y = ${expr} on [${a}, ${b}] at (${k.x}, ${k.y})`).not.toMatch(banned)
        }
      }
    }
    // keyPoints never makes a point without a value, but a label for one must not print code words.
    const broken: KeyPoint[] = [
      { x: Number.NaN, y: 1, kind: 'max', kinds: ['max'] },
      { x: 1, y: Number.POSITIVE_INFINITY, kind: 'min', kinds: ['min'] },
      { x: Number.NEGATIVE_INFINITY, y: 0, kind: 'root', kinds: ['root'] }
    ]
    for (const k of broken) for (const p of [dp3, sf3]) expect(keyPointLabel(k, p), `(${k.x}, ${k.y})`).not.toMatch(banned)
  })
})

describe('shownKeyPoints', () => {
  it('the bottom of y = x², a min, a root and the y-intercept, shows as a root when only roots are on, and as a min when only turning points are', () => {
    // The graph view used to filter on `kind` alone, which would hide this point, a min first,
    // whenever only roots were shown.
    const pts = keyPoints(typed('x^2'), -10, 10, 1200)
    expect(shownKeyPoints(pts, true, false).map((k) => [k.kind, k.kinds])).toEqual([['root', ['root']]])
    expect(shownKeyPoints(pts, false, true).map((k) => [k.kind, k.kinds])).toEqual([['min', ['min', 'yIntercept']]])
    expect(shownKeyPoints(pts, true, false).map((k) => keyPointLabel(k, dp3))).toEqual(['root (0, 0)'])
    expect(shownKeyPoints(pts, true, true)).toEqual(pts)
    expect(shownKeyPoints(pts, false, false)).toEqual([])
  })

  it('a point with nothing left to show is dropped: the y-intercept of y = x² − 4 goes with the turning points', () => {
    const pts = keyPoints(typed('x^2 - 4'), -10, 10, 1200)
    expect(byX(shownKeyPoints(pts, true, false)).map((k) => keyPointLabel(k, dp3))).toEqual(['root (−2, 0)', 'root (2, 0)'])
    expect(shownKeyPoints(pts, false, true).map((k) => keyPointLabel(k, dp3))).toEqual(['min (0, −4), y-intercept'])
  })
})

describe('spreadLabels', () => {
  const LINE = 18

  it('moves two labels 3 px apart until they are at least a line apart, up or down only', () => {
    const anchors = [
      { x: 300, y: 200 },
      { x: 300, y: 203 }
    ]
    const given = anchors.map((p) => ({ ...p }))
    const out = spreadLabels(anchors, LINE)
    expect(out).toHaveLength(2)
    expect(Math.abs(out[0].y - out[1].y)).toBeGreaterThanOrEqual(LINE)
    expect(out.map((p) => p.x)).toEqual([300, 300])
    expect(anchors, 'the anchors passed in are not changed').toEqual(given)
  })

  it('labels on the very same pixel, as at the bottom of y = x² − 4, all end up a line apart', () => {
    const out = spreadLabels(
      [
        { x: 120, y: 340 },
        { x: 120, y: 340 },
        { x: 120, y: 340 }
      ],
      LINE
    )
    expect(out).toHaveLength(3)
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) expect(Math.abs(out[i].y - out[j].y), `labels ${i} and ${j}`).toBeGreaterThanOrEqual(LINE)
    }
  })

  it('labels far apart stay exactly where they were, in the order given', () => {
    const apart = [
      { x: 100, y: 100 },
      { x: 400, y: 300 },
      { x: 100, y: 500 }
    ]
    expect(spreadLabels(apart, LINE)).toEqual(apart)
    // Side by side on one row but far apart, like the two roots of a wide parabola.
    const row = [
      { x: 100, y: 200 },
      { x: 600, y: 200 }
    ]
    expect(spreadLabels(row, LINE)).toEqual(row)
  })

  it('leaves a single label alone and gives nothing for nothing', () => {
    expect(spreadLabels([], LINE)).toEqual([])
    expect(spreadLabels([{ x: 5, y: 7 }], LINE)).toEqual([{ x: 5, y: 7 }])
  })
})

// ---------------------------------------------------------------------------
// From a picture binding into the scene: what a question's "Show it" actually draws.
// ---------------------------------------------------------------------------

const graphs = (): GraphObj[] => Object.values(scene().objects).filter((o): o is GraphObj => o.type === 'graph')
const texts = (): TextObj[] => Object.values(scene().objects).filter((o): o is TextObj => o.type === 'text')
const evalAt = (expr: string, x: number) => compileScalar(expr, ['x'], () => ({}))({ x })

describe('picture bindings into the scene', () => {
  beforeEach(() => {
    scene().newScene()
    scene().setSettings({ decimals: 3, precisionMode: 'dp' })
  })

  it('a piecewise picture is one graph object carrying its pieces', () => {
    visualizePiecewise([
      { expr: 'x^2', from: -3, to: 0 },
      { expr: 'x', from: 0, to: 2 },
      { expr: '2', from: 2, to: 4 }
    ], 'f')
    const g = graphs()
    expect(g).toHaveLength(1)
    expect(g[0].kind).toBe('piecewise')
    expect(g[0].pieces).toHaveLength(3)
    expect(g[0].name).toBe('f')
    // The source is the bar's own spelling, so Properties' Equation field can re-run it.
    expect(g[0].source).toBe('piecewise(x^2 from -3 to 0, x from 0 to 2, 2 from 2 to 4)')
  })

  it("a piecewise curve's exprs mirror its pieces, and renaming a slider used in a piece rewrites them", () => {
    const b = new Builder()
    const k = b.number('2', { name: 'k' })
    b.commit()
    visualizePiecewise([
      { expr: 'k*x', from: 0, to: 2 },
      { expr: '4', from: 2, to: 4 }
    ])
    expect(scene().renameObject(k.id, 'm')).toBeNull()
    const g = graphs()[0]
    // The viewport compiles piece i from exprs[i], so the curve follows the new name.
    expect(g.exprs).toEqual(['m*x', '4'])
    expect(g.pieces).toHaveLength(2)
    expect(g.exprs.every((e, i) => e === g.pieces![i].expr || e === 'm*x')).toBe(true)
    expect(compileScalar(g.exprs[0], ['x'], () => ({ m: 3 }))({ x: 1 })).toBe(3)
  })

  it('a second piecewise curve is added beside the first, like any graph typed into the bar', () => {
    visualizePiecewise([{ expr: 'x', from: 0, to: 1 }])
    visualizePiecewise([{ expr: '2x', from: 0, to: 1 }])
    expect(graphs()).toHaveLength(2)
  })

  it('refuses a picture with no pieces in a sentence', () => {
    expect(() => visualizePiecewise([])).toThrow('at least one piece')
  })

  it('a between picture shades between the two curves and writes the area in the precision setting', () => {
    const area = visualizeBetween('x + 2', 'x^2', -1, 2)
    expect(area).toBeCloseTo(4.5, 9)
    const region = graphs().find((g) => g.kind === 'between')!
    expect(region.exprs).toEqual(['x + 2', 'x^2'])
    expect(region.tMin).toBe(-1)
    expect(region.tMax).toBe(2)
    expect(graphs().filter((g) => g.kind === 'explicit')).toHaveLength(2)
    expect(texts().map((t) => t.text)).toEqual(['area = 4.5'])
    expect(texts()[0].p[0]).toBeCloseTo(0.5, 9)
  })

  it('the region, its curves and its area label all land in Graphing whatever mode asked for them', () => {
    // The app launches in Vectors, and Practice maps to it too; the picture must not leave its
    // label behind in a space nobody is looking at.
    scene().setActiveSpace('vectors')
    visualizeBetween('x + 2', 'x^2', -1, 2)
    expect(graphs().map((g) => g.space)).toEqual(['graphing', 'graphing', 'graphing'])
    expect(texts().map((t) => t.space)).toEqual(['graphing'])
  })

  it("a between region's source is the bar's own spelling and a caption goes in the label", () => {
    visualizeBetween('x + 2', 'x^2', -1, 2, 'the shaded region')
    const region = graphs().find((g) => g.kind === 'between')!
    expect(region.source).toBe('between(x + 2, x^2, -1, 2)')
    expect(region.label).toBe('the shaded region')
    // Bounds are written in full, not rounded to the precision setting.
    scene().newScene()
    visualizeBetween('x', '0', 0.12345, 1)
    expect(graphs().find((g) => g.kind === 'between')!.source).toBe('between(x, 0, 0.12345, 1)')
  })

  it('refuses a region with no width or no area in a sentence', () => {
    expect(() => visualizeBetween('x^2', 'x', 1, 1)).toThrow('from and to are the same x')
    expect(() => visualizeBetween('1/x', '0', -1, 1)).toThrow('has no area')
    expect(graphs()).toHaveLength(0)
  })

  it('the area label follows the precision setting rather than toFixed', () => {
    scene().setSettings({ decimals: 2, precisionMode: 'sf' })
    visualizeBetween('sin(x)', 'cos(x)', 0, Math.PI / 2)
    expect(texts().map((t) => t.text)).toEqual(['area = 0.83'])
  })

  it('a second between picture replaces the first instead of piling up', () => {
    visualizeBetween('x + 2', 'x^2', -1, 2)
    visualizeBetween('x', '0', 0, 1)
    expect(graphs().filter((g) => g.kind === 'between')).toHaveLength(1)
    expect(texts().map((t) => t.text)).toEqual(['area = 0.5'])
  })

  it('a tangent picture works the height and slope out from the formula alone', () => {
    const { fa, slope } = visualizeTangentAt('x^2', 1)
    expect(fa).toBe(1)
    expect(slope).toBeCloseTo(2, 9)
    const tangent = graphs().find((g) => g.name === 'tangent')!
    expect(tangent.source).toBe('tangent at x = 1')
    // The tangent line at x = 1 is y = 2x − 1.
    expect(evalAt(tangent.exprs[0], 0)).toBeCloseTo(-1, 9)
    expect(evalAt(tangent.exprs[0], 3)).toBeCloseTo(5, 9)
    expect(texts().map((t) => t.text)).toEqual(['slope = 2'])
  })

  it('the tangent point T and the slope text land in Graphing whatever mode asked for them', () => {
    scene().setActiveSpace('vectors')
    visualizeTangentAt('x^2', 1)
    const T = Object.values(scene().objects).find((o): o is PointObj => o.type === 'point' && o.name === 'T')!
    expect(T.space).toBe('graphing')
    expect(texts().map((t) => t.space)).toEqual(['graphing'])
  })

  it('refuses a tangent where the curve has no value or no slope', () => {
    expect(() => visualizeTangentAt('sqrt(x)', -1)).toThrow('has no value at x = −1')
    expect(() => visualizeTangentAt('sqrt(x)', 0)).toThrow('has no slope at x = 0')
    expect(() => visualizeTangentAt('abs(x)', 0)).toThrow('has no slope at x = 0')
    expect(() => visualizeTangentAt('cbrt(x)', 0)).toThrow('has no slope at x = 0')
    expect(graphs()).toHaveLength(0)
  })

  it('deleting the drawn objects leaves a clean scene', () => {
    visualizeBetween('x + 2', 'x^2', -1, 2)
    visualizePiecewise([{ expr: 'x', from: 0, to: 1 }])
    scene().removeObjects(Object.keys(scene().objects))
    expect(Object.keys(scene().objects)).toHaveLength(0)
  })

  it('deleting the shaded region takes its area with it, and deleting the tangent its slope', () => {
    visualizeBetween('x + 2', 'x^2', -1, 2)
    const region = graphs().find((g) => g.kind === 'between')!
    scene().removeObjects([region.id])
    expect(texts()).toEqual([])
    // The curves stay: only the region and what it said are gone. Undo brings both back.
    expect(graphs()).toHaveLength(2)
    scene().undo()
    expect(texts().map((t) => t.text)).toEqual(['area = 4.5'])

    visualizeTangentAt('x^2', 1)
    scene().removeObjects([graphs().find((g) => g.name === 'tangent')!.id])
    expect(texts()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Implicit curves F(x, y) = 0 by marching squares, and inequality boundaries, which use the same
// plotter. A cell whose corners differ in sign gets a segment, but across a pole F changes sign by
// jumping through infinity, not through 0: 1/x = y drew 165 segments up and down x = 0 and
// tan x = y about a thousand along its poles.
// ---------------------------------------------------------------------------

describe('implicitSegments', () => {
  const W = [-9.7, 10.3, -9.7, 10.3, 333, 333] as const
  const typedXY = (expr: string) => {
    const g = compileScalar(expr, ['x', 'y'], () => ({}))
    return (x: number, y: number) => g({ x, y })
  }
  const pairs = (s: V3[]): [V3, V3][] => {
    const out: [V3, V3][] = []
    for (let i = 0; i + 1 < s.length; i += 2) out.push([s[i], s[i + 1]])
    return out
  }
  /** How many segments a curve with no poles gets: one for each two corner sign changes round each cell. */
  const crossed = (F: (x: number, y: number) => number): number => {
    const [x0, x1, y0, y1, nx, ny] = W
    const dx = (x1 - x0) / nx
    const dy = (y1 - y0) / ny
    let count = 0
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v = [F(x0 + i * dx, y0 + j * dy), F(x0 + (i + 1) * dx, y0 + j * dy), F(x0 + (i + 1) * dx, y0 + (j + 1) * dy), F(x0 + i * dx, y0 + (j + 1) * dy)]
        if (!v.every(Number.isFinite)) continue
        let changes = 0
        for (let k = 0; k < 4; k++) if (v[k] > 0 !== v[(k + 1) % 4] > 0) changes++
        count += changes / 2
      }
    }
    return count
  }
  const POLES: Record<string, number[]> = {
    '1/x - y': [0],
    '1/(x - 0.3) - y': [0.3],
    'tan(x) - y': [-3, -2, -1, 0, 1, 2].map((k) => Math.PI / 2 + k * Math.PI)
  }
  const ON: Record<string, [number, number][]> = {
    '1/x - y': [[1, 1], [0.5, 2], [1 / 9, 9], [-0.2, -5], [-4, -0.25]],
    '1/(x - 0.3) - y': [[1.3, 1], [0.3 + 1 / 9, 9], [0.1, -5]],
    'tan(x) - y': [[Math.PI / 4, 1], [Math.atan(9), 9], [Math.PI - Math.atan(5), -5]]
  }

  it.each(Object.keys(POLES))('%s = 0 draws no line along its poles, and still draws the curve right up beside them', (expr) => {
    const seg = pairs(implicitSegments(typedXY(expr), ...W))
    const along = seg.filter(([p, q]) => POLES[expr].some((c) => Math.abs(p[0] - c) < 0.1 && Math.abs(q[0] - c) < 0.1) && Math.abs(p[1]) < 5 && Math.abs(q[1]) < 5)
    expect(along, `segments of ${expr} = 0 lying along a pole`).toEqual([])
    for (const [x, y] of ON[expr]) expect(seg.some(([p]) => Math.hypot(p[0] - x, p[1] - y) < 0.1), `${expr} = 0 is drawn through (${x}, ${y})`).toBe(true)
  })

  it.each(['x*y - 1', 'x^2 + y^2 - 25', 'y - x^3/20', 'x - 3', 'x^3 - x', 'exp(x) - 2', 'sin(x) - y'])('%s = 0, with no pole, keeps a segment in every cell it crosses', (expr) => {
    const F = typedXY(expr)
    expect(pairs(implicitSegments(F, ...W)).length).toBe(crossed(F))
  })
})

// ---------------------------------------------------------------------------
// y = f(x) as polylines. Where two samples are more than 1.5 view-heights apart the sampler probes
// half way to tell an asymptote from a steep curve.
// ---------------------------------------------------------------------------

describe('sampleExplicit', () => {
  const VIEW_H = 20

  it.each([300, 500, 800, 1200, 2000, 4000])('a steep straight line is one unbroken line through the view at n = %s', (n) => {
    // The probe called any half-way value more than 0.75 view-heights from both ends an asymptote,
    // and a straight line's half-way value is always half the jump from each end: y = 10000x came
    // out as no line at all for every n, and y = 1000x for n up to 500.
    for (const expr of ['10000x', '1000x', '-5000x + 3']) {
      const polys = sampleExplicit(typed(expr), -10, 10, n, VIEW_H)
      expect(polys, `y = ${expr}`).toHaveLength(1)
      const ys = polys[0].map((p) => p[1])
      expect(Math.min(...ys), `y = ${expr}`).toBeLessThan(-VIEW_H)
      expect(Math.max(...ys), `y = ${expr}`).toBeGreaterThan(VIEW_H)
    }
  })

  it.each([300, 500, 1200, 4000])('an asymptote is still a break at n = %s: no segment joins the two sides of 1/x, tan x, 1/(x − 0.3), 1/x² or tan² x', (n) => {
    const POLE: Record<string, number[]> = {
      '1/x': [0],
      '1/(x - 0.3)': [0.3],
      'tan(x)': [-3, -2, -1, 0, 1, 2].map((k) => Math.PI / 2 + k * Math.PI),
      // Both sides of these run up to +∞, so the half-way value can land near the chord by chance:
      // across the pole of tan² x at −5π/2 from 6214 down to 343 it is 2334.
      '1/x^2': [0],
      'tan(x)^2': [-3, -2, -1, 0, 1, 2].map((k) => Math.PI / 2 + k * Math.PI)
    }
    for (const [expr, poles] of Object.entries(POLE)) {
      for (const [a, b] of [
        [-10, 10],
        [-9.91, 10.07]
      ]) {
        const polys = sampleExplicit(typed(expr), a, b, n, VIEW_H)
        for (const poly of polys) {
          for (let k = 1; k < poly.length; k++) {
            const across = poles.filter((c) => poly[k - 1][0] < c && c < poly[k][0])
            expect(across, `y = ${expr} on [${a}, ${b}] joins (${poly[k - 1][0]}, ${poly[k - 1][1]}) to (${poly[k][0]}, ${poly[k][1]})`).toEqual([])
          }
        }
        // Each side of each asymptote is still drawn.
        expect(polys.length, `pieces of y = ${expr} on [${a}, ${b}]`).toBe(poles.length + 1)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// An equation in x alone (polish P4): x² = 4 and (x − 1)² = 0 have no y, so the plane holds only
// vertical lines, one at each x where the two sides are equal. The sign-change plotter finds x² − 4
// because it changes sign, but a repeated root such as (x − 1)² touches zero without crossing it
// and was drawn only where a grid column fell exactly on x = 1.
// ---------------------------------------------------------------------------

describe('verticalLineXs', () => {
  const at = (expr: string, a = -10, b = 10) => verticalLineXs(typed(expr), a, b)
  /** The roots found, each to within 1e-6 of the one expected, and no others. */
  const expectRoots = (found: number[], want: number[], label: string) => {
    expect(found, `${label}: ${found.join(', ')}`).toHaveLength(want.length)
    want.forEach((w, i) => expect(Math.abs(found[i] - w), `${label}: root ${i + 1} is ${found[i]}, not ${w}`).toBeLessThan(1e-6))
  }

  it('(x − 1)² has its repeated root, which the sign-change plotter cannot draw', () => {
    // Off centre on purpose, as the command bar's own check is: no grid column falls on x = 1.
    const seg = implicitSegments((x) => (x - 1) ** 2, -9.7, 10.3, -9.7, 10.3, 333, 333)
    expect(seg, 'marching squares draws nothing for a curve that only touches zero').toHaveLength(0)
    for (const [a, b] of [[-10, 10], [-9.7, 10.3], [-3, 5]]) expectRoots(at('(x-1)^2', a, b), [1], `(x − 1)² on [${a}, ${b}]`)
  })

  it('finds a root that crosses, as before: x² − 4 at ±2 and x³ − x at −1, 0 and 1, smallest first', () => {
    expectRoots(at('x^2-4'), [-2, 2], 'x² − 4')
    expectRoots(at('x^3-x'), [-1, 0, 1], 'x³ − x')
  })

  it('finds every multiple of π for sin x on [−10, 10]', () => {
    expectRoots(at('sin(x)'), [-3, -2, -1, 0, 1, 2, 3].map((k) => k * Math.PI), 'sin x')
  })

  it('finds no root for x² + 1, which never reaches zero', () => {
    expect(at('x^2+1')).toEqual([])
    expect(at('x^2+1', -9.7, 10.3)).toEqual([])
  })

  it('finds a touching root beside a crossing one, and every touching power', () => {
    expectRoots(at('(x-1)^2*(x+2)'), [-2, 1], '(x − 1)²(x + 2)')
    expectRoots(at('x^4'), [0], 'x⁴')
    expectRoots(at('(x-1)^3'), [1], '(x − 1)³')
    expectRoots(at('abs(x)'), [0], '|x|')
    expectRoots(at('sin(x)^2', -4, 4), [-Math.PI, 0, Math.PI], 'sin² x')
  })

  it('does not take a curve that comes near zero without reaching it for a root', () => {
    expect(at('(x-1)^2+1e-12')).toEqual([])
    expect(at('x^2+0.0001')).toEqual([])
  })

  it('is not fooled by a pole, where the curve changes sign through infinity', () => {
    expect(at('1/x')).toEqual([])
    expect(at('1/(x-0.3)')).toEqual([])
    expect(at('1/x^2')).toEqual([])
  })

  it('keeps to the window it is given', () => {
    expectRoots(at('x^2-4', 0, 10), [2], 'x² − 4 on [0, 10]')
    expectRoots(at('x^2-4', 2.5, 10), [], 'x² − 4 on [2.5, 10]')
  })
})

// ---------------------------------------------------------------------------
// A steep smooth curve is not an asymptote (polish wave, part P-GRAPH: H3, round 2). The chord test
// that tells a pole from a steep line also fired for a fast-growing curve: across a step that takes
// e^(100(x − 3)) from 0.2 to 71 the half-way value is far below the chord, as it is across a pole,
// and the curve was cut off in mid-air instead of rising through the top of the view. A step that
// fails the test is now looked at in four, three times over: a pole keeps jumping as the step
// shrinks, a smooth curve does not.
// ---------------------------------------------------------------------------

describe('sampleExplicit: a steep smooth curve rises through the view, a pole is still a break (polish H3, round 2)', () => {
  const VIEW_H = 9.6
  const TOP = VIEW_H / 2
  /** How many drawn segments cross the height `level`, going either way: a curve that is cut short crosses nothing. */
  const crossings = (polys: V3[][], level: number): number =>
    polys.reduce((sum, poly) => sum + poly.filter((p, k) => k > 0 && (poly[k - 1][1] < level) !== (p[1] < level)).length, 0)
  /**
   * Whether a drawn segment of any polyline has its two ends either side of x = c and reaches into
   * the heights |y| <= within. A pole whose two sides climb to the same height can be joined by a
   * level segment thousands of units above the view, where it cannot be seen (a step with the same
   * height at both ends has no jump to test), and a view is never as tall as that.
   */
  const joinsAcross = (polys: V3[][], c: number, within = Infinity): boolean =>
    polys.some((poly) => poly.some((p, k) => k > 0 && poly[k - 1][0] < c && c < p[0] && Math.min(poly[k - 1][1], p[1]) <= within && Math.max(poly[k - 1][1], p[1]) >= -within))

  it('e^(100(x − 3)) on [−10.19, 8.63] at 300 samples reaches the top of the view; it stopped at (2.98, 0.2)', () => {
    const polys = sampleExplicit(typed('e^(100*(x-3))'), -10.19, 8.63, 300, VIEW_H)
    const top = Math.max(...polys.flat().map((p) => p[1]))
    expect(top, `highest point ${top}`).toBeGreaterThanOrEqual(TOP)
    expect(crossings(polys, TOP), 'a drawn segment goes through the top edge').toBeGreaterThanOrEqual(1)
    // Drawn as one line from the left of the window to where it leaves the view, not in pieces.
    expect(polys).toHaveLength(1)
  })

  // The four the checker named: each stopped short in about twice as many view positions as before
  // the first round of H3. Every window is tried from a few positions, as a pan moves the samples.
  const STEEP: [string, number, number][] = [
    ['e^(10*x)', -100, 100],
    ['2^x', -1000, 1000],
    ['x^100', -10, 10],
    ['sinh(10*x)', -100, 100]
  ]
  it.each([300, 400, 500, 800, 1200])('e^(10x), 2^x, x^100 and sinh(10x) go through the top of the view at n = %s', (n) => {
    for (const [expr, lo, hi] of STEEP) {
      for (const shift of [0, 0.013, 0.37, 1.1]) {
        const w = hi - lo
        const a = lo + shift * (w / 20)
        const polys = sampleExplicit(typed(expr), a, a + w, n, VIEW_H)
        const label = `y = ${expr} on [${a}, ${a + w}] at n = ${n}`
        expect(crossings(polys, TOP), `${label} rises through the top`).toBeGreaterThanOrEqual(1)
        // sinh(10x) and x^100 come down to the same height on their left; e^(10x) and 2^x have no left to speak of.
        if (expr === 'x^100') expect(crossings(polys, TOP), `${label}: both sides`).toBeGreaterThanOrEqual(2)
        if (expr === 'sinh(10*x)') expect(crossings(polys, -TOP), `${label}: down through the bottom`).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('a steep curve is still one piece where it has no pole: e^(10x) and x^100', () => {
    for (const [expr, a, b] of [['e^(10*x)', -3.3, 1.3], ['x^100', 0.2, 1.1]] as const) {
      const polys = sampleExplicit(typed(expr), a, b, 300, VIEW_H)
      expect(polys, `y = ${expr}`).toHaveLength(1)
    }
  })

  const POLES: Record<string, (a: number, b: number) => number[]> = {
    '1/x': () => [0],
    '1/(x - 0.3)': () => [0.3],
    '1/x^2': () => [0],
    'tan(x)': (a, b) => Array.from({ length: 12 }, (_, k) => Math.PI / 2 + (k - 6) * Math.PI).filter((p) => p > a && p < b),
    'tan(x)^2': (a, b) => Array.from({ length: 12 }, (_, k) => Math.PI / 2 + (k - 6) * Math.PI).filter((p) => p > a && p < b)
  }
  it.each([300, 301, 399, 500, 777, 1200])('a pole is still a break and no segment joins its two sides at n = %s, in a view 9.6 tall panned across', (n) => {
    for (const [expr, polesIn] of Object.entries(POLES)) {
      for (let step = 0; step < 24; step++) {
        const a = -10.3 + step * 0.0371
        const b = a + 20
        const polys = sampleExplicit(typed(expr), a, b, n, VIEW_H)
        const poles = polesIn(a, b)
        for (const c of poles) expect(joinsAcross(polys, c, 4 * VIEW_H), `y = ${expr} on [${a}, ${b}] at n = ${n} joins the two sides of ${c}`).toBe(false)
        expect(polys.length, `y = ${expr} on [${a}, ${b}]: a piece for each side of each pole`).toBeGreaterThanOrEqual(poles.length)
      }
    }
  })

  it('the crew windows: 1/x and 1/(x − 0.3) on [−1, 1], 1/x² on [−1.1, 1], tan x and tan² x on [−1.8, −1.4]', () => {
    const CASES: [string, number, number, number, number][] = [
      ['1/x', -1, 1, 399, 0],
      ['1/(x - 0.3)', -1, 1, 399, 0.3],
      ['1/x^2', -1.1, 1.0, 400, 0],
      ['tan(x)', -1.8, -1.4, 399, -Math.PI / 2],
      ['tan(x)^2', -1.8, -1.4, 399, -Math.PI / 2]
    ]
    for (const [expr, a, b, n, pole] of CASES) {
      const polys = sampleExplicit(typed(expr), a, b, n, VIEW_H)
      expect(polys.length, `y = ${expr}`).toBeGreaterThanOrEqual(2)
      expect(joinsAcross(polys, pole), `y = ${expr} joins the two sides of ${pole}`).toBe(false)
    }
  })

  it.each([300, 500, 1200, 4000])('a steep straight line is still one unbroken line at n = %s', (n) => {
    for (const expr of ['10000x', '-5000x + 3']) {
      const polys = sampleExplicit(typed(expr), -10, 10, n, VIEW_H)
      expect(polys, `y = ${expr}`).toHaveLength(1)
    }
  })

  it('a jump is still a break: floor(x) scaled past the view is two pieces either side of every whole number', () => {
    const polys = sampleExplicit(typed('floor(x) * 20'), -2.5, 2.5, 400, VIEW_H)
    for (const c of [-2, -1, 0, 1, 2]) expect(joinsAcross(polys, c), `joins across x = ${c}`).toBe(false)
  })

  // Only a step that fails the test is looked at again, and only so far: the cost of a function
  // that fails it at every sample is a fixed number of times n, not a number that grows with the
  // function.
  it('looks again at a flagged step only so far: a curve that is one pole after another costs a bounded number of evaluations', () => {
    let calls = 0
    const g = typed('tan(1000*x)')
    const f = (x: number) => {
      calls++
      return g(x)
    }
    const n = 2000
    sampleExplicit(f, -10, 10, n, VIEW_H)
    expect(calls, `${calls} evaluations for ${n + 1} samples`).toBeLessThan(40 * (n + 1))
    calls = 0
    sampleExplicit((x) => (calls++, Math.tan(x)), -1000, 1000, 4000, VIEW_H)
    expect(calls, `${calls} evaluations for 4001 samples over 640 poles`).toBeLessThan(25 * 4001)
    // A curve with no step to look at again costs what it did: one evaluation a sample.
    calls = 0
    sampleExplicit((x) => (calls++, Math.sin(x)), -10, 10, 1000, VIEW_H)
    expect(calls).toBe(1001)
  })
})

// ---------------------------------------------------------------------------
// A root at the edge of a function's domain (polish wave, part P-GRAPH: H13). √(9 − x²) is 0 at
// x = ±3 and has no value beyond, so no two samples differ in sign and the roots were found only
// when a sample happened to land on 3 exactly: on [−9.91, 10.07] the graph showed no root at all,
// and the equation √x = 0 was told it has no real solution.
// ---------------------------------------------------------------------------

describe('keyPoints and verticalLineXs: a root where the domain ends (polish H13)', () => {
  const rootsOf = (expr: string, a = -9.91, b = 10.07, n = 1200): number[] =>
    byX(keyPoints(typed(expr), a, b, n).filter((k) => k.kinds.includes('root'))).map((k) => k.x + 0)
  const expectAt = (found: number[], want: number[], label: string) => {
    expect(found, `${label}: ${found.join(', ')}`).toHaveLength(want.length)
    want.forEach((w, i) => expect(Math.abs(found[i] - w), `${label}: root ${i + 1} is ${found[i]}, not ${w}`).toBeLessThan(1e-9))
  }
  // No sample lands on 3 in any of these; the window is moved about so that none does by luck.
  const WINDOWS: [number, number][] = [[-9.91, 10.07], [-10, 10], [-3.7, 4.1], [-3.0003, 3.0001], [-9.613, 10.387], [-3.0000001, 3.0000001]]

  it.each([300, 800, 1200])('√(9 − x²) has its roots at −3 and 3 whatever the window, at n = %s', (n) => {
    for (const [a, b] of WINDOWS) expectAt(rootsOf('sqrt(9 - x^2)', a, b, n), [-3, 3], `√(9 − x²) on [${a}, ${b}]`)
  })

  it("the roots are the equation's too: verticalLineXs finds them, which is what an equation in x alone is solved from", () => {
    expectAt(verticalLineXs(typed('sqrt(9 - x^2)'), -9.91, 10.07), [-3, 3], 'verticalLineXs')
    expectAt(verticalLineXs(typed('sqrt(x)'), -9.7, 10.3), [0], 'verticalLineXs of √x')
  })

  it('x·√x, √x and √(−x) have their root at 0 where they start or end', () => {
    for (const expr of ['x*sqrt(x)', 'sqrt(x)', 'sqrt(-x)']) {
      for (const [a, b] of WINDOWS.concat([[-0.1013, 9.8987], [-9.8987, 0.1013]])) {
        // A window that does not hold 0 has no root there to find.
        if (a > 0 || b < 0) continue
        expectAt(rootsOf(expr, a, b), [0], `y = ${expr} on [${a}, ${b}]`)
      }
    }
  })

  it('the other ends of a domain: √(x − 3) at 3, acos x at 1, √(1 − x²) at −1 and 1, √(x + 23.7) at −23.7', () => {
    expectAt(rootsOf('sqrt(x - 3)'), [3], '√(x − 3)')
    expectAt(rootsOf('acos(x)'), [1], 'acos x')
    expectAt(rootsOf('sqrt(1 - x^2)'), [-1, 1], '√(1 − x²)')
    expectAt(rootsOf('sqrt(x + 23.7)', -30, 30), [-23.7], '√(x + 23.7)')
  })

  it('a curve that tends to something other than 0 where it ends has no root there', () => {
    // √x + 1 starts at 1, ln x at −∞ and 1/√x at ∞; ln|x| and √x − 0.5 keep only their ordinary roots.
    expect(rootsOf('sqrt(x) + 1')).toEqual([])
    expect(rootsOf('1/sqrt(x)')).toEqual([])
    expect(rootsOf('sqrt(x) + 0.001')).toEqual([])
    expectAt(rootsOf('ln(x)'), [1], 'ln x')
    expectAt(rootsOf('ln(abs(x))'), [-1, 1], 'ln|x|')
    // Where ln|x| has no ordinary root in the window it has none at all: it goes to −∞ at 0.
    expect(rootsOf('ln(abs(x))', -0.9, 0.9)).toEqual([])
    expectAt(rootsOf('sqrt(x) - 0.5'), [0.25], '√x − 0.5')
    expect(rootsOf('asin(x) - 2')).toEqual([])
  })

  it('a point with no value between two that have one is a hole, not the end of a domain', () => {
    // sin x / x has no value at 0 and settles on 1; (x² − 1)/(x − 1) has none at 1 and settles on 2.
    expectAt(rootsOf('sin(x)/x', -10, 10), [-3, -2, -1, 1, 2, 3].map((k) => k * Math.PI), 'sin x / x')
    expectAt(rootsOf('(x^2 - 1)/(x - 1)', -9, 11), [-1], '(x² − 1)/(x − 1)')
  })

  it('costs nothing for a function with no end to its domain, and a fixed number of evaluations for each end', () => {
    // Evaluations of keyPoints on [−9.91, 10.07] at 1200 before the ends of a domain were looked for.
    const BEFORE: [string, number][] = [['sin(x)', 2621], ['x^2-4', 1586], ['1/x', 1264], ['tan(x)', 2008], ['x^3-x', 1734]]
    for (const [expr, before] of BEFORE) {
      const g = typed(expr)
      let calls = 0
      keyPoints((x) => (calls++, g(x)), -9.91, 10.07, 1200)
      expect(calls, `y = ${expr}: ${calls} evaluations, ${before} before`).toBeLessThanOrEqual(before)
    }
    // A domain with many ends: sixty bisections for each of some six hundred, and no more.
    let calls = 0
    keyPoints((x) => (calls++, Math.sqrt(Math.sin(x))), -1000, 1000, 1200)
    expect(calls, `${calls} evaluations`).toBeLessThan(70 * 1201)
  })
})

// ---------------------------------------------------------------------------
// A root where the curve closes in on 0 slowly at the end of its domain (polish wave, part
// P-GRAPH: H13, round 3). The edge was found by sixty bisections and called a root when the curve
// was within a millionth of its height there, but x^(1/4) is still 10⁻⁵ at 10⁻²⁰ from 0, so
// x^(1/4), √√x and x^(1/5) had no root at 0 and the command bar answered "No real x" for
// x^(1/4) = 0. A curve that tends to 0, however slowly, has its root at the edge; one that tends
// to anything else has not.
// ---------------------------------------------------------------------------

describe('keyPoints and verticalLineXs: a curve that closes in on 0 slowly where its domain ends (polish H13, round 3)', () => {
  const rootsOf = (expr: string, a = -9.91, b = 10.07, n = 1200): number[] =>
    byX(keyPoints(typed(expr), a, b, n).filter((k) => k.kinds.includes('root'))).map((k) => k.x + 0)
  const expectAt = (found: number[], want: number[], label: string) => {
    expect(found, `${label}: ${found.join(', ')}`).toHaveLength(want.length)
    want.forEach((w, i) => expect(Math.abs(found[i] - w), `${label}: root ${i + 1} is ${found[i]}, not ${w}`).toBeLessThan(1e-9))
  }
  // None of these has a sample on 0, apart from [−10, 10]; the windows are moved about so that no sample lands on the root by luck.
  const WINDOWS: [number, number][] = [[-9.91, 10.07], [-10, 10], [-3.7, 4.1], [-3.0003, 3.0001], [-9.613, 10.387], [-3.0000001, 3.0000001], [-0.1013, 9.8987], [-9.8987, 0.1013]]

  it.each([300, 800, 1200])('x^(1/4), √√x and x^(1/5) have their root at 0 whatever the window, at n = %s', (n) => {
    for (const expr of ['x^(1/4)', 'sqrt(sqrt(x))', 'x^(1/5)', 'x^(1/8)']) {
      for (const [a, b] of WINDOWS) {
        // The mirror image, from the other side of 0, has the root at 0 as well.
        if (a <= 0 && b >= 0) expectAt(rootsOf(expr, a, b, n), [0], `y = ${expr} on [${a}, ${b}]`)
      }
    }
    for (const [a, b] of WINDOWS) if (a <= 0 && b >= 0) expectAt(rootsOf('(-x)^(1/4)', a, b, n), [0], `y = (−x)^(1/4) on [${a}, ${b}]`)
  })

  it('the equation x^(1/4) = 0 is solved from that root: verticalLineXs finds it', () => {
    expectAt(verticalLineXs(typed('x^(1/4)'), -9.91, 10.07), [0], 'verticalLineXs of x^(1/4)')
    expectAt(verticalLineXs(typed('sqrt(sqrt(x))'), -9.7, 10.3), [0], 'verticalLineXs of √√x')
  })

  it('an edge that is not on a number a computer holds exactly has its root too: (x − 3)^(1/4), (10 − x²)^(1/4), (x + 0.1 + 0.2 − 0.3)^(1/4)', () => {
    expectAt(rootsOf('(x - 3)^(1/4)'), [3], '(x − 3)^(1/4)')
    expectAt(rootsOf('(x + 23.7)^(1/4)', -30, 30), [-23.7], '(x + 23.7)^(1/4)')
    expectAt(rootsOf('(10 - x^2)^(1/4)'), [-Math.sqrt(10), Math.sqrt(10)], '(10 − x²)^(1/4)')
    // 0.1 + 0.2 is 0.30000000000000004, so the edge of this domain is at −5.5×10⁻¹⁷, not at 0, and the snap puts it on the axis.
    expectAt(rootsOf('(x + 0.1 + 0.2 - 0.3)^(1/4)'), [0], '(x + 0.1 + 0.2 − 0.3)^(1/4)')
  })

  it('√(9 − x²) still has −3 and 3, and a curve that dies faster still does too', () => {
    for (const [a, b] of [[-9.91, 10.07], [-10, 10], [-3.7, 4.1]]) {
      expectAt(rootsOf('sqrt(9 - x^2)', a, b), [-3, 3], `√(9 − x²) on [${a}, ${b}]`)
      expectAt(rootsOf('sqrt(x)', a, b), [0], `√x on [${a}, ${b}]`)
    }
    expectAt(rootsOf('x^(1/4) * 1e-9'), [0], '10⁻⁹ x^(1/4)')
  })

  it('a curve that tends to something other than 0 has no root at its end, however slowly it gets there', () => {
    expect(rootsOf('sqrt(x) + 1')).toEqual([])
    expect(rootsOf('1/sqrt(x)')).toEqual([])
    expect(rootsOf('ln(x)')).toEqual([1])
    // Beside x^(1/4) the 0.001 is a thousandth of the curve's height but a thousand times the tolerance.
    expect(rootsOf('x^(1/4) + 0.001')).toEqual([])
    expect(rootsOf('sqrt(x) + 0.00001')).toEqual([])
    expect(rootsOf('sqrt(sqrt(x)) + 1')).toEqual([])
    expect(rootsOf('1/x^(1/4)')).toEqual([])
    expect(rootsOf('ln(abs(x))', -0.9, 0.9)).toEqual([])
    for (const [a, b] of WINDOWS) {
      if (a > 0 || b < 0) continue
      expect(rootsOf('sqrt(x) + 1', a, b), `√x + 1 on [${a}, ${b}]`).toEqual([])
      expect(rootsOf('x^(1/4) + 0.001', a, b), `x^(1/4) + 0.001 on [${a}, ${b}]`).toEqual([])
      expect(rootsOf('1/x^(1/4)', a, b), `1/x^(1/4) on [${a}, ${b}]`).toEqual([])
    }
  })

  it('costs three evaluations for an edge that is not found to be a root at once, and nothing for one that is', () => {
    const callsFor = (expr: string, a = -9.91, b = 10.07): number => {
      const g = typed(expr)
      let calls = 0
      keyPoints((x) => (calls++, g(x)), a, b, 1200)
      return calls
    }
    // √x is on the axis where it starts, which one look at its height shows: nothing more is done.
    const plain = callsFor('sqrt(x)')
    expect(callsFor('sqrt(x) + 1') - plain, '√x + 1').toBe(3)
    expect(callsFor('x^(1/4)') - plain, 'x^(1/4)').toBe(3)
    // A domain with many ends, none of them a root: the sixty bisections and the three looks for each, and no more.
    expect(callsFor('sqrt(sin(x)) + 1', -1000, 1000)).toBeLessThan(70 * 1201)
  })
})

// ---------------------------------------------------------------------------
// Roots that lie between two samples (polish wave, part P-GRAPH: P4, round 3). (x − 1)(x − 1.01) is
// below the axis for 0.01 only, which is less than a step of the samples: every sample is above the
// axis, so no two differ in sign and the roots were found only when a sample landed between 1 and
// 1.01 or exactly on one of them — nothing on [−9.91, 10.07], one of two lines on [−10.3, 9.7]. The
// curve's own bottom is found between the samples, and when it is across the axis from them both
// the roots either side of it are found too. A formula the samples cannot follow at all (x^200
// underflows to a stretch of exact zeros, x^(10⁹) − 2 jumps from −2 to ∞ within 10⁻⁶ of 1) is drawn
// from the solutions the caller has already worked out, handed to verticalLineXs.
// ---------------------------------------------------------------------------

describe('keyPoints and verticalLineXs: roots that lie between two samples (polish P4, round 3)', () => {
  const lines = (expr: string, a: number, b: number, n = 1200, known?: number[]): number[] => verticalLineXs(typed(expr), a, b, n, known)
  const expectLines = (found: number[], want: number[], label: string) => {
    expect(found, `${label}: ${found.join(', ')}`).toHaveLength(want.length)
    want.forEach((w, i) => expect(Math.abs(found[i] - w), `${label}: line ${i + 1} is ${found[i]}, not ${w}`).toBeLessThan(1e-9))
  }
  const WINDOWS: [number, number][] = [[-9.91, 10.07], [-10.3, 9.7], [-10, 10], [-9.613, 10.387], [-3.1, 5.2], [-0.3, 1.9], [0.5, 1.5], [0.999, 1.011], [-100, 100]]

  it.each([300, 800, 1200])('(x − 1)(x − 1.01) has both its lines whatever the window, at n = %s', (n) => {
    for (const [a, b] of WINDOWS) expectLines(lines('(x-1)*(x-1.01)', a, b, n), [1, 1.01], `(x − 1)(x − 1.01) on [${a}, ${b}]`)
  })

  it.each([300, 800, 1200])('so has the curve turned over, which is above the axis for 0.01 only, at n = %s', (n) => {
    for (const [a, b] of WINDOWS) expectLines(lines('-(x-1)*(x-1.01)', a, b, n), [1, 1.01], `−(x − 1)(x − 1.01) on [${a}, ${b}]`)
  })

  it('a bottom just across the axis, nearer and further from a sample: 0.004, 0.0001 and 10⁻⁷ between the roots', () => {
    for (const [a, b] of WINDOWS) {
      expectLines(lines('(x-3)*(x-3.004)', Math.min(a, 2), Math.max(b, 4)), [3, 3.004], `(x − 3)(x − 3.004) on [${a}, ${b}]`)
      expectLines(lines('(x+0.5)*(x+0.5001)', Math.min(a, -1), Math.max(b, 0)), [-0.5001, -0.5], `(x + 0.5)(x + 0.5001) on [${a}, ${b}]`)
      expectLines(lines('(x-2)*(x-2.0000001)', Math.min(a, 1), Math.max(b, 3)), [2, 2.0000001], `(x − 2)(x − 2.0000001) on [${a}, ${b}]`)
    }
  })

  it('a dip beside a root that a sample finds, and beside a crossing: (x − 1)(x − 1.01)(x + 4) has three, with the bottom between two samples', () => {
    for (const [a, b] of WINDOWS) {
      if (a > -4.5 || b < 1.5) continue
      expectLines(lines('(x-1)*(x-1.01)*(x+4)', a, b), [-4, 1, 1.01], `(x − 1)(x − 1.01)(x + 4) on [${a}, ${b}]`)
    }
  })

  it('the points of the curve are its bottom and its two roots, the bottom still below the axis', () => {
    const pts = byX(keyPoints(typed('(x-1)*(x-1.01)'), -9.91, 10.07, 1200).filter((k) => k.x > 0.5))
    expect(pts.map((k) => k.kind)).toEqual(['root', 'min', 'root'])
    expect(pts.map((k) => Math.round(k.x * 1e9) / 1e9)).toEqual([1, 1.005, 1.01])
    expect(pts[1].y).toBeCloseTo(-0.000025, 9)
    expect(pts[0].y).toBe(0)
    expect(pts[2].y).toBe(0)
  })

  it('a dip that stays on one side of the axis has no line: (x − 1)(x − 1.01) + 0.0001, x² + 0.0001, (x − 1)² + 10⁻¹²', () => {
    for (const [a, b] of WINDOWS) {
      expect(lines('(x-1)*(x-1.01)+0.0001', a, b), `+ 0.0001 on [${a}, ${b}]`).toEqual([])
      expect(lines('x^2+0.0001', a, b)).toEqual([])
      expect(lines('(x-1)^2+1e-12', a, b)).toEqual([])
      expect(lines('-(x-1)*(x-1.01)-0.0001', a, b)).toEqual([])
    }
  })

  it('gives the lines of a curve that touches the axis, as before, and no line twice where the dip is a hair across', () => {
    for (const [a, b] of WINDOWS) {
      expectLines(lines('(x-1)^2', a, b), [1], `(x − 1)² on [${a}, ${b}]`)
      // Its root, 0.1, is not in every window.
      if (a < 0.05 && b > 0.15) expectLines(lines('x^2 - 0.2*x + 0.01', a, b), [0.1], `x² − 0.2x + 0.01 on [${a}, ${b}]`)
    }
  })

  describe('the solutions the caller already has', () => {
    it('x^200 = 0: the curve underflows to a stretch of exact zeros that is not a root, and the solution 0 is drawn', () => {
      for (const [a, b] of WINDOWS) expect(lines('x^200', a, b, 1200, [0]), `x^200 on [${a}, ${b}]`).toEqual(a <= 0 && b >= 0 ? [0] : [])
    })

    it('x^(10⁹) = 2: the curve jumps from −2 to ∞ within 10⁻⁶ of 1, and the solutions ±2^(10⁻⁹) are drawn', () => {
      const root = 2 ** 1e-9
      expect(root).toBeGreaterThan(1.0000000006)
      expect(root).toBeLessThan(1.0000000008)
      expect(lines('x^1e9-2', -9.91, 10.07, 1200, [-root, root])).toEqual([-root, root])
      expect(lines('x^1e9-2', -10.3, 9.7, 300, [root, -root])).toEqual([-root, root])
    })

    it('are those inside the window, smallest first, each once', () => {
      expect(lines('x^2-4', -10, 10, 1200, [2, -2, 30, -30, 2, 0.5])).toEqual([-2, 0.5, 2])
      expect(lines('x^2-4', 0, 10, 1200, [2, -2])).toEqual([2])
      expect(lines('x^2-4', 2, 2.5, 1200, [2])).toEqual([2])
      expect(lines('x^2-4', -1, 1, 1200, [2, -2])).toEqual([])
      expect(lines('x^2-4', -10, 10, 1200, [Number.NaN, Number.POSITIVE_INFINITY, 2])).toEqual([2])
    })

    it('an empty list is a list: the caller found no solution, so there is no line', () => {
      expect(lines('x^2-4', -10, 10, 1200, [])).toEqual([])
    })

    it('without them the curve is looked at as before', () => {
      expectLines(lines('x^2-4', -10, 10), [-2, 2], 'x² − 4')
      expectLines(verticalLineXs(typed('x^2-4'), -10, 10, 1200, undefined), [-2, 2], 'x² − 4, known undefined')
      expectLines(verticalLineXs(typed('sin(x)'), -10, 10), [-3, -2, -1, 0, 1, 2, 3].map((k) => k * Math.PI), 'sin x')
    })

    it("a graph brings the solutions it was made with, for its own formula and no other", () => {
      const made = { exprs: ['x^200 - 0'], solvedXs: { expr: 'x^200 - 0', xs: [0] } }
      expect(carriedSolutions(made)).toEqual([0])
      // The formula was edited or rewritten since: the solutions are not its any more.
      expect(carriedSolutions({ ...made, exprs: ['x^200 - 1'] })).toBeUndefined()
      expect(carriedSolutions({ ...made, exprs: ['x^200 - 0 '] })).toBeUndefined()
      expect(carriedSolutions({ ...made, exprs: [] })).toBeUndefined()
      // A graph made without any, or with something that is not a list of numbers.
      expect(carriedSolutions({ exprs: ['x^200 - 0'] })).toBeUndefined()
      expect(carriedSolutions({ exprs: ['x^200 - 0'], solvedXs: null })).toBeUndefined()
      expect(carriedSolutions({ exprs: ['x^200 - 0'], solvedXs: 3 })).toBeUndefined()
      expect(carriedSolutions({ exprs: ['x^200 - 0'], solvedXs: { expr: 'x^200 - 0' } })).toBeUndefined()
      expect(carriedSolutions({ exprs: ['x^200 - 0'], solvedXs: { expr: 'x^200 - 0', xs: '0' } })).toBeUndefined()
      expect(carriedSolutions({ exprs: ['x^200 - 0'], solvedXs: { expr: 'x^200 - 0', xs: [0, '1'] } })).toBeUndefined()
      // None found is a list too.
      expect(carriedSolutions({ exprs: ['x^2 + 1'], solvedXs: { expr: 'x^2 + 1', xs: [] } })).toEqual([])
    })
  })
})

// ---------------------------------------------------------------------------
// A key-point label near the edge of the view (polish wave, part P-GRAPH: H14). Labels were put 8
// px to the right of their point and only moved up or down to keep apart, so a point near the right
// edge had its label cut off by the edge of the view, and a crowd stacked downwards ran off the
// bottom. placeLabels is the pure placement GraphView now draws from.
// ---------------------------------------------------------------------------

describe('placeLabels: a label stays inside the view (polish H14)', () => {
  const LINE = 22
  const W = 800
  const H = 600
  const place = (points: { x: number; y: number; w?: number }[], w = W, h = H) => placeLabels(points, LINE, w, h)

  it('labels far from each other and from the edges stay where they were: 8 px right of the point and 14 px above it', () => {
    expect(place([{ x: 100, y: 100, w: 80 }, { x: 400, y: 300, w: 100 }])).toEqual([
      { x: 108, y: 86, align: 'left' },
      { x: 408, y: 286, align: 'left' }
    ])
  })

  it('a point at x = 750 with a label 100 px wide on a canvas 800 px wide has its label to the left of it, ending 8 px short', () => {
    expect(place([{ x: 750, y: 300, w: 100 }])).toEqual([{ x: 742, y: 286, align: 'right' }])
  })

  it('stays on the right while it fits, to the pixel, and goes left the moment it does not', () => {
    expect(place([{ x: 692, y: 300, w: 100 }])[0]).toEqual({ x: 700, y: 286, align: 'left' })
    expect(place([{ x: 692.5, y: 300, w: 100 }])[0].align).toBe('right')
    // A spot with no width is taken for 160 px wide.
    expect(place([{ x: 600, y: 300 }])[0].align).toBe('left')
    expect(place([{ x: 640, y: 300 }])[0].align).toBe('right')
  })

  it('a label that fits on neither side goes where there is more room, inside the view as far as it can', () => {
    // 100 px wide canvas, 90 px label: 42 px of room each side of a point in the middle.
    expect(place([{ x: 50, y: 300, w: 90 }], 100)[0]).toEqual({ x: 10, y: 286, align: 'left' })
    expect(place([{ x: 70, y: 300, w: 90 }], 100)[0].align).toBe('right')
    expect(place([{ x: 70, y: 300, w: 90 }], 100)[0].x).toBe(90)
    // Wider than the view altogether: it starts at the left edge.
    expect(place([{ x: 50, y: 300, w: 150 }], 100)[0]).toEqual({ x: 0, y: 286, align: 'left' })
  })

  it('a label whose point is at the top keeps its whole height in the view; so does one whose point is at or below the bottom', () => {
    expect(place([{ x: 100, y: 5, w: 80 }])[0].y).toBe(LINE / 2)
    expect(place([{ x: 100, y: 20, w: 80 }])[0].y).toBe(LINE / 2)
    expect(place([{ x: 100, y: 25, w: 80 }])[0].y).toBe(LINE / 2)
    expect(place([{ x: 100, y: 26, w: 80 }])[0].y).toBe(12)
    expect(place([{ x: 100, y: H, w: 80 }])[0].y).toBe(H - 14)
    expect(place([{ x: 100, y: H + 12, w: 80 }])[0].y).toBe(H - LINE / 2)
  })

  it('two labels near the bottom both stay in the view and apart: the lower one is not pushed off, the upper one is pushed up', () => {
    const [a, b] = place([{ x: 100, y: 595, w: 80 }, { x: 110, y: 598, w: 80 }])
    expect(b.y).toBe(H - LINE / 2)
    expect(a.y).toBe(H - LINE / 2 - LINE)
    expect(b.y - a.y).toBeGreaterThanOrEqual(LINE)
  })

  it('a crowd at the bottom stacks upward from the bottom edge, in the order its points were in', () => {
    const crowd = [0, 1, 2, 3, 4].map((k) => ({ x: 100, y: 590 + k, w: 80 }))
    const ys = place(crowd).map((p) => p.y)
    expect(ys).toEqual([501, 523, 545, 567, 589])
  })

  it('a crowd at the top stacks downward from the top edge, as it always did', () => {
    const crowd = [0, 1, 2].map((k) => ({ x: 100, y: 2 + k, w: 80 }))
    expect(place(crowd).map((p) => p.y)).toEqual([11, 33, 55])
  })

  it('two labels flipped to the left of their points near the right edge keep apart from each other too', () => {
    const [a, b] = place([{ x: 790, y: 100, w: 100 }, { x: 780, y: 104, w: 100 }])
    expect(a).toEqual({ x: 782, y: 86, align: 'right' })
    expect(b).toEqual({ x: 772, y: 108, align: 'right' })
  })

  it('a crowd that cannot all fit in the view is kept in it, not spread past the edge', () => {
    const crowd = Array.from({ length: 40 }, (_, k) => ({ x: 100, y: 300 + (k % 3), w: 80 }))
    for (const p of place(crowd, W, 300)) {
      expect(p.y).toBeGreaterThanOrEqual(LINE / 2)
      expect(p.y).toBeLessThanOrEqual(300 - LINE / 2)
    }
  })

  // Whatever the points: inside the view, and no two labels over each other where there is room.
  it('for any scatter of points: every label is inside the view, and two that share horizontal space are a line apart', () => {
    let seed = 12345
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    for (let trial = 0; trial < 300; trial++) {
      const n = 1 + Math.floor(rnd() * 12)
      const points = Array.from({ length: n }, () => ({ x: rnd() * W, y: rnd() * H, w: 40 + Math.floor(rnd() * 120) }))
      // Some trials crowd the points into a corner, where the labels must stack.
      if (trial % 3 === 0) points.forEach((p) => ((p.x = W - 30 * rnd()), (p.y = H - 20 * rnd())))
      const placed = place(points)
      const box = placed.map((p, i) => ({ left: p.align === 'left' ? p.x : p.x - points[i].w, right: p.align === 'left' ? p.x + points[i].w : p.x, y: p.y }))
      box.forEach((b, i) => {
        expect(b.left, `trial ${trial} label ${i} left`).toBeGreaterThanOrEqual(-1e-9)
        expect(b.right, `trial ${trial} label ${i} right`).toBeLessThanOrEqual(W + 1e-9)
        expect(b.y, `trial ${trial} label ${i} top`).toBeGreaterThanOrEqual(LINE / 2 - 1e-9)
        expect(b.y, `trial ${trial} label ${i} bottom`).toBeLessThanOrEqual(H - LINE / 2 + 1e-9)
        for (let j = 0; j < i; j++) {
          const share = Math.min(b.right, box[j].right) - Math.max(b.left, box[j].left) > 1e-9
          if (share) expect(Math.abs(b.y - box[j].y), `trial ${trial}: labels ${j} and ${i} overlap`).toBeGreaterThanOrEqual(LINE - 1e-9)
        }
      })
    }
  })

  it('moves nothing that spreadLabels did not: the same labels away from every edge come out where they did', () => {
    const points = [{ x: 200, y: 200, w: 100 }, { x: 210, y: 205, w: 100 }, { x: 205, y: 190, w: 100 }, { x: 500, y: 400, w: 90 }]
    const before = spreadLabels(points.map((p) => ({ x: p.x + 8, y: p.y - 14, w: p.w })), LINE)
    expect(place(points).map((p) => ({ x: p.x, y: p.y }))).toEqual(before)
  })
})

describe('sampleExplicit: what it hands back is always a drawable line (polish H3, round 2)', () => {
  // Cutting a step into quarters adds points between the samples; whatever it does, each piece must
  // still run left to right, hold two points or more, and keep to values the viewport can place.
  const FUNCS = ['tan(x)', '1/x', '1/x^2', 'sqrt(sin(x))*100', 'ln(x)*50', 'floor(x)*20', 'e^(100*(x-3))', 'x^100', 'sin(100*x)*20', 'tan(1000*x)', '1/sin(x)', 'sqrt(x)*1000', 'atan(1000*x)*20', '(x^2-1)/(x-1)*50', 'sign(x)*50', '1e8/x', 'e^x*1e5']
  it.each([300, 301, 777, 2000])('every piece runs left to right, has two points or more and stays under ten million, at n = %s', (n) => {
    const faults: string[] = []
    for (const expr of FUNCS) {
      for (const [a, b] of [[-10, 10], [-9.913, 10.087], [-3.1, 2.9], [-0.1013, 0.0987], [0.5, 100.5], [-100, 100]]) {
        for (const poly of sampleExplicit(typed(expr), a, b, n, 9.6)) {
          if (poly.length < 2) faults.push(`y = ${expr} on [${a}, ${b}] has a piece of ${poly.length}`)
          for (let k = 0; k < poly.length; k++) {
            if (!(Number.isFinite(poly[k][1]) && Math.abs(poly[k][1]) <= 1e7)) faults.push(`y = ${expr} on [${a}, ${b}]: (${poly[k][0]}, ${poly[k][1]})`)
            if (k > 0 && !(poly[k][0] > poly[k - 1][0])) faults.push(`y = ${expr} on [${a}, ${b}]: x does not increase at point ${k}`)
          }
        }
      }
    }
    expect(faults.slice(0, 5)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// A root just inside the end of a domain (polish wave, part P-GRAPH: H25). √x − 0.001 is −0.001
// where its domain starts and above the axis at the first sample, so its root, 10⁻⁶, lies between
// the edge and that sample, where no two samples differ in sign, and it was never looked for. The
// edge itself was called a root when the curve there was within a millionth of the window's tallest
// sample, which on a window a million wide is 0.001: the command bar answered √x = 0.001 with x = 0
// and x^(1/4) = 0.001 with "No real x". A sign change between the edge and the first sample is
// bisected like any other, and the edge is a root only when the curve tends to 0 there compared with
// its own height beside it, never with the window.
// ---------------------------------------------------------------------------

describe('keyPoints and verticalLineXs: a root just inside the end of a domain (polish H25)', () => {
  const WINDOWS: [number, number][] = [[-10, 10], [-9.91, 10.07], [-1e3, 1e3]]
  const rootsOf = (expr: string, a: number, b: number, n = 1200): number[] =>
    byX(keyPoints(typed(expr), a, b, n).filter((k) => k.kinds.includes('root'))).map((k) => k.x + 0)
  /** Each root within `rel` of its own size (a root at 0 exactly on it). */
  const expectNear = (found: number[], want: number[], rel: number, label: string) => {
    expect(found, `${label}: ${found.join(', ')}`).toHaveLength(want.length)
    want.forEach((w, i) => expect(Math.abs(found[i] - w), `${label}: root ${i + 1} is ${found[i]}, not ${w}`).toBeLessThanOrEqual(rel * Math.abs(w)))
  }

  it.each(WINDOWS)('√x − 0.001 has its root at 10⁻⁶ and x^(1/4) − 0.001 at 10⁻¹², not at 0, on [%s, %s]', (a, b) => {
    expectNear(rootsOf('sqrt(x) - 0.001', a, b), [1e-6], 1e-9, `keyPoints of √x − 0.001 on [${a}, ${b}]`)
    expectNear(verticalLineXs(typed('sqrt(x) - 0.001'), a, b), [1e-6], 1e-9, `verticalLineXs of √x − 0.001 on [${a}, ${b}]`)
    expectNear(rootsOf('x^(1/4) - 0.001', a, b), [1e-12], 1e-9, `keyPoints of x^(1/4) − 0.001 on [${a}, ${b}]`)
    expectNear(verticalLineXs(typed('x^(1/4) - 0.001'), a, b), [1e-12], 1e-9, `verticalLineXs of x^(1/4) − 0.001 on [${a}, ${b}]`)
    // The mirror image, whose domain ends at 0 instead of starting there.
    expectNear(rootsOf('sqrt(-x) - 0.001', a, b), [-1e-6], 1e-9, `√(−x) − 0.001 on [${a}, ${b}]`)
  })

  it.each(WINDOWS)('the roots that were right stay right on [%s, %s]: √x − 2, x^(1/4), √(9 − x²), √x + 1, ln x', (a, b) => {
    for (const roots of [(e: string) => rootsOf(e, a, b), (e: string) => verticalLineXs(typed(e), a, b)]) {
      expectNear(roots('sqrt(x) - 2'), [4], 1e-9, `√x − 2 on [${a}, ${b}]`)
      expectNear(roots('x^(1/4)'), [0], 0, `x^(1/4) on [${a}, ${b}]`)
      expectNear(roots('sqrt(9 - x^2)'), [-3, 3], 1e-9, `√(9 − x²) on [${a}, ${b}]`)
      expect(roots('sqrt(x) + 1'), `√x + 1 on [${a}, ${b}]`).toEqual([])
      expectNear(roots('ln(x)'), [1], 1e-9, `ln x on [${a}, ${b}]`)
    }
  })

  it('a window a million wide does not put the edge on the axis: 0.001 is a thousandth of nothing there', () => {
    // [−971300, 1028700] at 300 samples is the widest window the command bar solves over.
    for (const [a, b, n] of [[-1e6, 1e6, 1200], [-971300, 1028700, 300]]) {
      expect(rootsOf('sqrt(x) + 0.001', a, b, n), `√x + 0.001 on [${a}, ${b}]`).toEqual([])
      expect(rootsOf('x^(1/4) + 0.001', a, b, n), `x^(1/4) + 0.001 on [${a}, ${b}]`).toEqual([])
      expectNear(rootsOf('sqrt(x) - 0.001', a, b, n), [1e-6], 1e-9, `√x − 0.001 on [${a}, ${b}]`)
      expectNear(rootsOf('x^(1/4) - 0.001', a, b, n), [1e-12], 1e-9, `x^(1/4) − 0.001 on [${a}, ${b}]`)
      expectNear(rootsOf('x^(1/8) - 0.001', a, b, n), [1e-24], 1e-9, `x^(1/8) − 0.001 on [${a}, ${b}]`)
      expectNear(rootsOf('sqrt(x)', a, b, n), [0], 0, `√x on [${a}, ${b}]`)
    }
  })

  it('the command bar solves √x = 0.001 and x^(1/4) = 0.001 from these roots', () => {
    const solved = (lhs: string, rhs: string): number[] | string => {
      const s = solutionsInX(`(${lhs}) - (${rhs})`, [lhs, rhs], {})
      return s?.kind === 'real' && !s.more ? s.xs : String(s?.kind)
    }
    const expectSolved = (lhs: string, rhs: string, want: number[]) => {
      const xs = solved(lhs, rhs)
      expect(Array.isArray(xs), `${lhs} = ${rhs}: ${xs}`).toBe(true)
      expectNear(xs as number[], want, 1e-9, `${lhs} = ${rhs}`)
    }
    expectSolved('sqrt(x)', '0.001', [1e-6])
    expectSolved('x^(1/4)', '0.001', [1e-12])
    expectSolved('sqrt(x)', '2', [4])
    expectSolved('x^(1/4)', '0', [0])
    expectSolved('sqrt(9 - x^2)', '0', [-3, 3])
    expect(solved('sqrt(x)', '-1')).toBe('none')
  })
})

// ---------------------------------------------------------------------------
// The lines of an equation in x alone, from its solutions (polish wave, part P-GRAPH: P4known). The
// command bar answered x^200 = 0 with "The solution is x = 0 — drawn as a vertical line." and the view
// drew nothing, because it looked at the curve, which underflows to a stretch of exact zeros; so for
// (x − 1)^1000 = 0, x^(10⁹) = 0 and x^(10⁹) = 2 (−2 to ∞ within 10⁻⁶ of 1), and x^(10⁶) = 1 lost its
// lines after a small pan. solvedLineXs asks the solver the bar names the solutions with, for the graph
// as the bar made it, and the view hands what it says to verticalLineXs.
// ---------------------------------------------------------------------------

describe('solvedLineXs: an equation in x alone is drawn at the solutions the bar names (polish P4known)', () => {
  /** The graph the command bar makes of the line it was typed: that text, and its formula as `(left) - (right)`. */
  const barGraph = (line: string) => {
    const at = line.indexOf('=')
    return { source: line, exprs: [`(${line.slice(0, at)}) - (${line.slice(at + 1)})`] }
  }
  const solved = (line: string, scope: Record<string, unknown> = {}) => solvedLineXs(barGraph(line), scope, solutionsInX)
  const expectXs = (found: number[] | undefined, want: number[], label: string) => {
    expect(found, `${label}: no list`).toBeDefined()
    const xs = found ?? []
    expect(xs, `${label}: ${xs.join(', ')}`).toHaveLength(want.length)
    want.forEach((w, i) => expect(Math.abs(xs[i] - w), `${label}: solution ${i + 1} is ${xs[i]}, not ${w}`).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(w))))
  }
  /** What the viewport draws: the lines, from the solutions when there are some, else from the curve. */
  const drawn = (line: string, a: number, b: number, n = 1200): number[] => {
    const g = barGraph(line)
    return verticalLineXs(typed(g.exprs[0]), a, b, n, solvedLineXs(g, {}, solutionsInX))
  }
  const root = 2 ** 1e-9

  it('x^200 = 0, x^1e9 = 0 and (x − 1)^1000 = 0 have their one solution', () => {
    expectXs(solved('x^200 = 0'), [0], 'x^200 = 0')
    expectXs(solved('x^1e9 = 0'), [0], 'x^1e9 = 0')
    expectXs(solved('x^(1e9) = 0'), [0], 'x^(1e9) = 0')
    // The base of the power is not a bare x: the sides as typed are what it is solved from.
    expectXs(solved('(x - 1)^1000 = 0'), [1], '(x − 1)^1000 = 0')
    expectXs(solved('0 = (x + 2)^500'), [-2], '0 = (x + 2)^500')
  })

  it('x^1e9 − 2 = 0 has ±2^(10⁻⁹) and x^1e6 = 1 has ±1', () => {
    expectXs(solved('x^1e9 - 2 = 0'), [-root, root], 'x^1e9 − 2 = 0')
    expectXs(solved('x^1e6 = 1'), [-1, 1], 'x^1e6 = 1')
  })

  it('an ordinary equation has its exact solutions as well, and one with a slider the solutions for the slider where it is', () => {
    expectXs(solved('x^2 = 4'), [-2, 2], 'x² = 4')
    expectXs(solved('x^2 = a', { a: 9 }), [-3, 3], 'x² = a, a = 9')
    expectXs(solved('x^2 = a', { a: 0.25 }), [-0.5, 0.5], 'x² = a, a = 0.25')
  })

  it('no list where the solver has not got them all or there are none: periodic, no real x, every x, a stretch', () => {
    expect(solved('sin(x) = 0.5'), 'sin x = 0.5 repeats').toBeUndefined()
    expect(solved('x^2 + 4*x + 13 = 0'), 'no real x').toBeUndefined()
    expect(solved('x^2 = a', { a: -1 }), 'x² = a, a = −1').toBeUndefined()
    expect(solved('x = x'), 'every x').toBeUndefined()
  })

  it('the lines are drawn from them: x^200 = 0 at 0, x^1e9 − 2 = 0 at ±2^(10⁻⁹), and x^1e6 = 1 at ±1 however the view is panned', () => {
    expect(drawn('x^200 = 0', -9.91, 10.07)).toEqual([0])
    expect(drawn('x^200 = 0', 0.5, 10.5)).toEqual([])
    expect(drawn('(x - 1)^1000 = 0', -9.7, 10.3)).toEqual([1])
    expectXs(drawn('x^1e9 - 2 = 0', -9.7, 10.3), [-root, root], 'x^1e9 − 2 = 0')
    expectXs(drawn('x^1e9 - 2 = 0', -9.7, 10.3, 300), [-root, root], 'x^1e9 − 2 = 0 at 300 samples')
    for (const [a, b] of [[-9.7, 10.3], [-9.2, 10.8], [-8.9, 11.1], [-10.4, 9.6], [-1.3, 1.9], [-1.0000001, 1.0000001]] as const) {
      expectXs(drawn('x^1e6 = 1', a, b), [-1, 1], `x^1e6 = 1 on [${a}, ${b}]`)
    }
    // Only those inside the view: a view that holds one of the two draws that one.
    expectXs(drawn('x^1e6 = 1', 0.5, 10.5), [1], 'x^1e6 = 1 on [0.5, 10.5]')
    expect(drawn('x^1e6 = 1', 2, 10)).toEqual([])
  })

  it('a solver that finds nothing, fails or says only some of them leaves the curve to be looked at', () => {
    const graph = barGraph('x^2 = 4')
    const says = (s: LineSolved | null) => solvedLineXs(graph, {}, () => s)
    expect(says({ kind: 'real', xs: [2, -2] })).toEqual([2, -2])
    expect(says(null)).toBeUndefined()
    expect(says({ kind: 'real', xs: [2], more: 'further' })).toBeUndefined()
    expect(says({ kind: 'real', xs: [0], more: { period: 3 } })).toBeUndefined()
    expect(says({ kind: 'real', xs: [] })).toBeUndefined()
    expect(says({ kind: 'real', xs: [1, Number.NaN] })).toBeUndefined()
    expect(says({ kind: 'none' })).toBeUndefined()
    expect(solvedLineXs(graph, {}, () => { throw new Error('too slow') })).toBeUndefined()
    expect(solvedLineXs({ exprs: [], source: '' }, {}, () => ({ kind: 'real', xs: [1] }))).toBeUndefined()
  })

  it('the solver is asked once, for the formula, the sides as typed and the scene scope', () => {
    const asked: unknown[][] = []
    const scope = { a: 3 }
    solvedLineXs(barGraph('x^200 = 0'), scope, (...args) => (asked.push(args), { kind: 'real', xs: [0] }))
    expect(asked).toEqual([['(x^200 ) - ( 0)', ['x^200 ', ' 0'], scope]])
    expect(asked[0][2]).toBe(scope)
  })

  it('the sides are those the formula was made from, and none where it was not', () => {
    expect(typedSides('x^200 = 0', '(x^200 ) - ( 0)')).toEqual(['x^200 ', ' 0'])
    expect(typedSides('x²=4', '(x²) - (4)')).toEqual(['x²', '4'])
    // The text or the formula was changed since, a slider renamed in the formula, or it was never typed as an equation.
    expect(typedSides('x^200 = 0', '(x^200 ) - ( 1)')).toBeUndefined()
    expect(typedSides('x^2 = k', '(x^2 ) - ( b)')).toBeUndefined()
    expect(typedSides('x^2 - 4', '(x^2 ) - ( 4)')).toBeUndefined()
    expect(typedSides('', '(x^200 ) - ( 0)')).toBeUndefined()
  })
})
