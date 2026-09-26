// Axis labels by Talbot, Lin & Hanrahan's extended Wilkinson search. A plain JavaScript port of the
// paper's code took JavaScript's `%` for R's `%%`, so on an axis starting below zero the "labels
// include 0" bonus was never paid and a velocity axis from −7.3 to 1.2 could skip its origin.

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { axisTicks, extendedTicks, isMultipleOf, MIN_LABEL_PX } from '../src/renderer/src/render/ticks'
import { minorStepOf } from '../src/renderer/src/render/gridMath'
import { axisLabels, rulerLabels } from '../src/renderer/src/render/gridLabels'
import { niceStep } from '../src/renderer/src/render/cameraUtils'
import type { MeasureSettings } from '../src/renderer/src/math/format'

const GRID: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'unit', unitPerSquare: 1, angleUnit: 'deg' }

/**
 * The oracle: R `labeling::extended` (MIT; Talbot's own code), run through an R-faithful JavaScript
 * copy kept outside the repo. Rows are [dmin, dmax, m, j, q, labels].
 */
const ORACLE: [number, number, number, number, number, number[]][] = [
  [-7.3, 1.2, 5, 1, 2, [-8, -6, -4, -2, 0, 2]],
  [-35, 5, 5, 1, 1, [-30, -20, -10, 0]],
  [-0.69, 0.12, 5, 1, 2, [-0.6, -0.4, -0.2, 0, 0.2]],
  [0.6929, 1.6721, 6, 2, 1, [0.7, 0.9, 1.1, 1.3, 1.5, 1.7]],
  [-690.9, 119.7, 5, 1, 2, [-600, -400, -200, 0, 200]],
  [-3.5, 0.6, 5, 1, 1, [-3, -2, -1, 0, 1]],
  [-9.8, 2.1, 6, 1, 2.5, [-10, -7.5, -5, -2.5, 0, 2.5]],
  [0, 100, 10, 1, 1, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]],
  [-1.3, 7.2, 8, 1, 1, [-1, 0, 1, 2, 3, 4, 5, 6, 7]],
  [0.0001, 0.00091, 6, 1, 2, [0, 0.0002, 0.0004, 0.0006, 0.0008, 0.001]],
  [1e6, 3e6, 6, 1, 5, [1e6, 1.5e6, 2e6, 2.5e6, 3e6]],
  [-5, 5, 10, 1, 1, [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]],
  [0, 1, 5, 1, 2.5, [0, 0.25, 0.5, 0.75, 1]],
  [12, 1583, 8, 1, 2, [0, 200, 400, 600, 800, 1000, 1200, 1400, 1600]],
  [-100, 400, 10, 1, 5, [-100, -50, 0, 50, 100, 150, 200, 250, 300, 350, 400]],
  [0, 9, 10, 1, 1, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]],
  [1.5, 1.9, 5, 1, 1, [1.5, 1.6, 1.7, 1.8, 1.9]]
]

const hasZero = (ticks: number[]) => ticks.some((t) => Math.abs(t) < 1e-12)

/** The verifier's seeded generator: magnitudes log-uniform 10⁻³…10⁶ with random signs, so about half the ranges cross zero. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function signedRanges(seed: number, count: number) {
  const rand = mulberry32(seed)
  return Array.from({ length: count }, () => {
    const a = 10 ** (-3 + rand() * 9) * (rand() < 0.5 ? -1 : 1)
    const b = 10 ** (-3 + rand() * 9) * (rand() < 0.5 ? -1 : 1)
    const dmin = Math.min(a, b)
    let dmax = Math.max(a, b)
    if (dmax - dmin < Math.abs(dmax) * 1e-9) dmax = dmin + Math.abs(dmin) * 1e-3
    return { dmin, dmax, m: 5 + Math.floor(rand() * 8) }
  })
}

describe('extendedTicks — the axes the design names', () => {
  it('labels 0 on a velocity axis from −7.3 to 1.2', () => {
    expect(hasZero(extendedTicks(-7.3, 1.2, 5)!.ticks)).toBe(true)
  })
  it('labels −35 … 5 as −30, −20, −10, 0', () => {
    expect(extendedTicks(-35, 5, 5)!.ticks).toEqual([-30, -20, -10, 0])
  })
  it('labels 0 on an axis from −0.69 to 0.12', () => {
    expect(hasZero(extendedTicks(-0.69, 0.12, 5)!.ticks)).toBe(true)
  })
  it('steps 0.2 as two of 0.1 (j = 2) on 0.6929 … 1.6721 with six labels', () => {
    const r = extendedTicks(0.6929, 1.6721, 6)!
    expect(r.j).toBe(2)
    expect(r.q).toBe(1)
    expect(r.step).toBe(0.2)
    // Odd tenths, not multiples of the step: a caller that assumed j = 1 would draw 0.6, 0.8 …
    expect(r.ticks).toEqual([0.7, 0.9, 1.1, 1.3, 1.5, 1.7])
  })
})

describe('extendedTicks agrees with R labeling::extended', () => {
  it.each(ORACLE)('[%s, %s] with m = %s', (dmin, dmax, m, j, q, labels) => {
    const r = extendedTicks(dmin, dmax, m)!
    expect(r.j).toBe(j)
    expect(r.q).toBe(q)
    // Exact: the ticks are written as n·q/10^k, never with an inexact 0.1 multiplied in.
    expect(r.ticks).toEqual(labels)
  })

  it('labels 0 on every one of 1 014 zero-crossing ranges in a 2 000-range signed sweep, as the oracle does', () => {
    const ranges = signedRanges(0x0915eed, 2000)
    const crossing = ranges.filter((c) => c.dmin <= 0 && c.dmax >= 0)
    // The oracle run over the same seed found 1 014 crossing ranges and labelled 0 on all of them.
    expect(crossing.length).toBe(1014)
    const missing = crossing.filter((c) => !hasZero(extendedTicks(c.dmin, c.dmax, c.m)!.ticks))
    expect(missing).toEqual([])
  })

  it('takes under 0.15 ms for 99 in 100 ranges', () => {
    const ranges = signedRanges(0x1234, 2000)
    for (const c of ranges.slice(0, 300)) extendedTicks(c.dmin, c.dmax, c.m)
    const times = ranges.map((c) => {
      const t0 = performance.now()
      extendedTicks(c.dmin, c.dmax, c.m)
      return performance.now() - t0
    })
    times.sort((a, b) => a - b)
    expect(times[Math.ceil(0.99 * times.length) - 1]).toBeLessThan(0.15)
  })

  it('answers a reversed, a zero-width and a non-finite range without hanging', () => {
    expect(extendedTicks(1.2, -7.3, 5)!.ticks).toEqual(extendedTicks(-7.3, 1.2, 5)!.ticks)
    expect(extendedTicks(3, 3, 5)!.ticks).toEqual([3])
    expect(extendedTicks(Number.NaN, 1, 5)).toBeNull()
    expect(extendedTicks(-Number.MAX_VALUE, Number.MAX_VALUE, 5)).toBeNull()
  })
})

/** Every grid scale the 2-D viewport can reach: major 1, 2 or 5 × 10ⁿ, drawn 57–150 px apart. */
function* views() {
  for (const zoom of [0.37, 1, 3.1, 7.5, 12, 18, 37.5, 55, 100, 240, 400, 1900, 30000]) {
    for (const width of [480, 800, 1366]) {
      const raw = 100 / zoom
      const e = Math.floor(Math.log10(raw))
      const b = raw / 10 ** e
      const major = (b < 1.5 ? 1 : b < 3.5 ? 2 : b < 7.5 ? 5 : 10) * 10 ** e
      for (const centre of [0, -3.3, 17.25, -1234.5]) {
        const half = width / 2 / zoom
        yield { zoom, width, major, dmin: centre - half, dmax: centre + half }
      }
    }
  }
}

describe('axisTicks — the labels the grid writes', () => {
  it('puts every label on a drawn line: a whole number of minor steps', () => {
    for (const v of views()) {
      const minor = minorStepOf(v.major)
      const ticks = axisTicks(v.dmin, v.dmax, v.width, minor, v.major)
      expect(ticks.length).toBeGreaterThan(1)
      for (const t of ticks) if (t !== 0) expect(isMultipleOf(Math.abs(t), minor), `${t} on minor ${minor}`).toBe(true)
    }
  })

  it('never writes two labels closer than 60 px, and keeps the heavy lines’ rhythm', () => {
    for (const v of views()) {
      const ticks = axisTicks(v.dmin, v.dmax, v.width, minorStepOf(v.major), v.major)
      const step = ticks[1] - ticks[0]
      for (let i = 1; i < ticks.length; i++) expect((ticks[i] - ticks[i - 1]) * v.zoom).toBeGreaterThanOrEqual(MIN_LABEL_PX - 1e-6)
      expect(isMultipleOf(v.major, step) || isMultipleOf(step, v.major), `step ${step} beside major ${v.major}`).toBe(true)
    }
  })

  it('labels 0 whenever it is in view, and a view below zero only with negative numbers', () => {
    expect(axisTicks(-7.3, 1.2, 800, 0.2, 1)).toContain(0)
    expect(axisTicks(-0.69, 0.12, 800, 0.02, 0.1)).toContain(0)
    const below = axisTicks(-35, -5, 800, 1, 5)
    expect(below.every((t) => t < 0)).toBe(true)
    expect(below).toEqual([...below].sort((a, b) => a - b))
  })

  it('numbers a wide x axis and a short y axis of the same paper in the same step', () => {
    for (const v of views()) {
      const minor = minorStepOf(v.major)
      const x = axisTicks(v.dmin, v.dmax, v.width, minor, v.major)
      const h = 300 / v.zoom
      const y = axisTicks(-h / 2, h / 2, 300, minor, v.major)
      expect(y[1] - y[0]).toBeCloseTo(x[1] - x[0], 12)
    }
  })

  it('slides the labels under a pan instead of choosing new ones', () => {
    const a = axisTicks(-4, 4, 800, 0.2, 1)
    const b = axisTicks(-4 + 0.37, 4 + 0.37, 800, 0.2, 1)
    const step = a[1] - a[0]
    expect(b[1] - b[0]).toBeCloseTo(step, 12)
    // The same lattice of values, only a different stretch of it: 4 goes out of view, 4.3 would not be one.
    expect(a).toContain(-4)
    expect(b).not.toContain(-4)
    for (const t of b) if (t !== 0) expect(isMultipleOf(Math.abs(t), step)).toBe(true)
  })

  it('writes clean decimals, never 0.30000000000000004', () => {
    for (const t of axisTicks(-0.9, 0.9, 1366, 0.02, 0.1)) expect(String(t).length).toBeLessThan(8)
  })

  it('gives nothing for an empty or broken view', () => {
    expect(axisLabels(1, 1, 800, 1, 0.2, GRID)).toEqual([])
    expect(axisTicks(1, 1, 800, 0.2)).toEqual([])
    expect(axisTicks(0, 1, 0, 0.2)).toEqual([])
    expect(axisTicks(0, Number.NaN, 800, 0.2)).toEqual([])
    expect(axisTicks(0, 1, 800, 0)).toEqual([])
  })
})

describe('axisLabels — what the grid writes along an axis', () => {
  it('writes the numbers to the label step’s decimals, leaving 0 to the origin', () => {
    // 150 px per unit: major 0.5 at 75 px, minor 0.1.
    const labels = axisLabels(-2.4, 2.9, 800, 0.5, 0.1, GRID)
    expect(labels.map((l) => l.text)).toEqual(['−2', '−1.5', '−1', '−0.5', '0.5', '1', '1.5', '2', '2.5'])
    expect(labels.some((l) => l.value === 0)).toBe(false)
  })

  it('numbers a drawing at its own scale: 1 square = 2.5 cm reads 2.5, 5, 7.5', () => {
    const cm: MeasureSettings = { ...GRID, unit: 'cm', unitPerSquare: 2.5 }
    // 80 px per square: major 1, minor 0.2.
    expect(axisLabels(0.1, 3.4, 264, 1, 0.2, cm).map((l) => l.text)).toEqual(['2.5', '5', '7.5'])
  })

  it('writes a label every second heavy line when the heavy lines are under 60 px apart', () => {
    // 28.5 px per unit: major 2 at 57 px, minor 0.5 — labels at 4, 8, 12 (114 px), all on heavy lines.
    const labels = axisLabels(-14, 14, 798, 2, 0.5, GRID)
    expect(labels.map((l) => l.value)).toEqual([-12, -8, -4, 4, 8, 12])
  })
})

describe('rulerLabels — the numbers along the 3-D floor’s axes', () => {
  const view = { width: 800, height: 600 }
  const HOME: [number, number, number] = [9, -12, 9]
  const cameraAt = (pos: [number, number, number]) => {
    const camera = new THREE.PerspectiveCamera(45, view.width / view.height, 0.01, 5000)
    camera.up.set(0, 0, 1)
    camera.position.set(...pos)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    const v = new THREE.Vector3()
    const screenOf = (p: [number, number, number]) => {
      v.set(p[0], p[1], p[2]).project(camera)
      return { x: ((v.x + 1) / 2) * view.width, y: ((1 - v.y) / 2) * view.height, visible: v.z > -1 && v.z < 1 }
    }
    // The floor's step, as Grid3D chooses it from the camera's distance.
    const dist = Math.hypot(...pos)
    const step = niceStep(dist / 12)
    return { screenOf, step, half: 10 * step }
  }
  const AXES: [number, number, number][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]

  it('keeps every pair of labels at least 60 px apart on screen, far half included', () => {
    const turns = [0, 0.7, 1.9, 3.3, 4.6]
    for (const d of [6, 9.2, 10, 13, 17.5, 25, 40]) {
      for (const turn of turns) {
        const k = d / Math.hypot(...HOME)
        const c = Math.cos(turn)
        const s = Math.sin(turn)
        const pos: [number, number, number] = [(HOME[0] * c - HOME[1] * s) * k, (HOME[0] * s + HOME[1] * c) * k, HOME[2] * k]
        const { screenOf, step, half } = cameraAt(pos)
        for (const dir of AXES) {
          const labels = rulerLabels(dir, half, step, screenOf, view, GRID)
          for (let i = 1; i < labels.length; i++) {
            const gap = Math.hypot(labels[i].x - labels[i - 1].x, labels[i].y - labels[i - 1].y)
            expect(gap, `distance ${d}, turn ${turn}, axis ${dir}: ${labels[i - 1].text} and ${labels[i].text}`).toBeGreaterThanOrEqual(MIN_LABEL_PX)
          }
        }
      }
    }
  })

  it('still numbers every axis in the home view, on the lines the floor draws', () => {
    for (const d of [10, 17.5]) {
      const k = d / Math.hypot(...HOME)
      const { screenOf, step, half } = cameraAt([HOME[0] * k, HOME[1] * k, HOME[2] * k])
      for (const dir of AXES) {
        const labels = rulerLabels(dir, half, step, screenOf, view, GRID)
        expect(labels.length, `distance ${d}, axis ${dir}`).toBeGreaterThanOrEqual(3)
        for (const l of labels) expect(isMultipleOf(Math.abs(l.value), step / 2)).toBe(true)
      }
    }
  })

  it('shows nothing along an axis seen end-on', () => {
    // Looking almost straight down z: the whole z axis lands within a pixel or two of one spot.
    const { screenOf, step, half } = cameraAt([0.01, 0, 17.5])
    expect(rulerLabels([0, 0, 1], half, step, screenOf, view, GRID)).toEqual([])
    expect(rulerLabels([1, 0, 0], 0, step, screenOf, view, GRID)).toEqual([])
  })
})
