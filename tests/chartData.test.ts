// What the Lab Data graph is handed. uPlot draws every series against one shared x axis, so the
// readings and the curve must share it in order, with nothing invented and nothing lost.

import { describe, expect, it } from 'vitest'
import { chartSeries, residualSeries } from '../src/renderer/src/lab/chartData'
import { fitOf, type Fit } from '../src/renderer/src/lab/fit'

/** A fit with any predictor, so the series can be checked without the least-squares maths. */
const fake = (predict: (x: number) => number, residuals: number[] = []): Fit => ({
  shape: 'linear',
  label: 'y = f(x)',
  expr: 'f(x)',
  coef: {},
  r2: 1,
  predict,
  residuals
})

const sorted = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1] <= x)

describe('chartSeries', () => {
  it('puts the readings in x order and carries their y values with them', () => {
    const s = chartSeries([3, 1, 2], [30, 10, 20], null)
    expect(s.x).toEqual([1, 2, 3])
    expect(s.points).toEqual([10, 20, 30])
    expect(s.curve).toEqual([])
  })

  it('has nothing to draw for no readings, with or without a fit', () => {
    expect(chartSeries([], [], null)).toEqual({ x: [], points: [], curve: [] })
    expect(chartSeries([], [], fake((x) => x))).toEqual({ x: [], points: [], curve: [] })
  })

  it('keeps every reading and adds many curve points between them', () => {
    const xs = [1, 2, 3, 4, 5]
    const ys = [2, 4, 6, 8, 10]
    const s = chartSeries(xs, ys, fake((x) => 2 * x))
    expect(s.x.length).toBe(s.points.length)
    expect(s.x.length).toBe(s.curve.length)
    expect(s.x.length).toBeGreaterThan(100)
    expect(sorted(s.x)).toBe(true)
    // The readings are still there, at their own x, and nowhere else.
    const measured = s.x.map((x, i) => [x, s.points[i]] as const).filter(([, y]) => y !== null)
    expect(measured).toEqual([
      [1, 2],
      [2, 4],
      [3, 6],
      [4, 8],
      [5, 10]
    ])
    // The curve runs from the first reading to the last, and is right everywhere.
    expect(s.x[0]).toBe(1)
    expect(s.x[s.x.length - 1]).toBe(5)
    s.x.forEach((x, i) => expect(s.curve[i]).toBeCloseTo(2 * x, 12))
  })

  it('never repeats an x where a curve point lands on a reading', () => {
    const s = chartSeries([0, 60, 120], [0, 1, 2], fake((x) => x / 60))
    expect(new Set(s.x).size).toBe(s.x.length)
    expect(s.x.filter((x) => x === 0 || x === 60 || x === 120)).toHaveLength(3)
  })

  it('draws the curve through a reading’s x even when the fit disagrees with the reading', () => {
    const s = chartSeries([1, 2, 3], [2.1, 3.9, 6.2], fake((x) => 2 * x))
    const at2 = s.x.indexOf(2)
    expect(s.points[at2]).toBe(3.9)
    expect(s.curve[at2]).toBe(4)
  })

  it('leaves a hole in the curve where the fit has no value, rather than a wild number', () => {
    // 1/x blows up at 0; log(x) is undefined below it.
    const s = chartSeries([0, 1, 2], [0, 1, 0.5], fake((x) => 1 / x))
    expect(s.curve[0]).toBeNull()
    expect(s.curve.slice(1).every((c) => c !== null && Number.isFinite(c))).toBe(true)
    const t = chartSeries([-1, 0, 1], [0, 0, 0], fake((x) => Math.log(x)))
    expect(t.curve[t.x.indexOf(-1)]).toBeNull()
    expect(t.curve[t.x.indexOf(0)]).toBeNull()
    expect(t.curve[t.x.indexOf(1)]).toBe(0)
  })

  it('handles a single reading, and readings all at one x, without dividing the span', () => {
    const one = chartSeries([4], [8], fake((x) => 2 * x))
    expect(one).toEqual({ x: [4], points: [8], curve: [8] })
    const same = chartSeries([2, 2, 2], [1, 2, 3], fake((x) => x))
    expect(same.x).toEqual([2, 2, 2])
    expect(same.points).toEqual([1, 2, 3])
    expect(same.curve).toEqual([2, 2, 2])
  })

  it('keeps repeated readings at the same x (a repeated measurement is data, not a duplicate)', () => {
    const s = chartSeries([1, 2, 2, 3], [1, 2.1, 1.9, 3], fake((x) => x))
    const at2 = s.x.map((x, i) => (x === 2 ? s.points[i] : null)).filter((y) => y !== null)
    expect(at2).toEqual([2.1, 1.9])
    expect(sorted(s.x)).toBe(true)
  })

  it('stays in order for negative, tiny and huge x values', () => {
    for (const xs of [
      [-5, -2, 0, 3],
      [1e-9, 2e-9, 5e-9],
      [1e9, 2e9, 5e9],
      [-1e12, 0, 1e12]
    ]) {
      const s = chartSeries(xs, xs.map((x) => x * 2), fake((x) => 2 * x))
      expect(sorted(s.x)).toBe(true)
      expect(s.points.filter((p) => p !== null)).toEqual(xs.map((x) => x * 2))
      expect(s.x[0]).toBe(xs[0])
      expect(s.x[s.x.length - 1]).toBe(xs[xs.length - 1])
    }
  })

  it('agrees with a real least-squares fit', () => {
    const xs = [1, 2, 3, 4, 5]
    const ys = [2.1, 3.9, 6.2, 7.8, 10.1]
    const fit = fitOf(xs, ys, 'linear')!
    const s = chartSeries(xs, ys, fit)
    s.x.forEach((x, i) => expect(s.curve[i]).toBeCloseTo(fit.predict(x), 12))
  })
})

describe('residualSeries', () => {
  it('pairs each residual with its own x, in x order, and is empty without a fit', () => {
    expect(residualSeries([1, 2], null)).toEqual({ x: [], e: [] })
    const r = residualSeries([3, 1, 2], fake((x) => x, [0.3, 0.1, 0.2]))
    expect(r.x).toEqual([1, 2, 3])
    expect(r.e).toEqual([0.1, 0.2, 0.3])
  })
})
