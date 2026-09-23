// The two graph kinds a question picture can ask for, and the tangent's slope. A piecewise curve
// must read as one line through every join, the region between two curves must be shaded exactly
// between them and report the right area, and the slope of a tangent must be the derivative — all
// pure geometry, checked here rather than through the viewport.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The stylesheet is not loaded here, so the drawing's colours fall back.
vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { betweenArea, betweenMesh, samplePiecewise, slopeAt } from '../src/renderer/src/math/graphs'
import { visualizeBetween, visualizePiecewise, visualizeTangentAt } from '../src/renderer/src/core/visualize'
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
})

describe('slopeAt', () => {
  it('is the derivative for polynomials, trig and exponentials', () => {
    expect(slopeAt(sq, 1)).toBeCloseTo(2, 9)
    expect(slopeAt((x) => x * x * x - 2 * x, 2)).toBeCloseTo(10, 9)
    expect(slopeAt(Math.sin, 0)).toBeCloseTo(1, 9)
    expect(slopeAt(Math.exp, 1)).toBeCloseTo(Math.E, 8)
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
})
