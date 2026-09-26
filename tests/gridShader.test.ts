// The 2-D grid shader (0.9, Idea 1 — track QG). The shader itself runs on the GPU; what can go
// wrong with it is decided here, in pure functions: which grids it draws (the rollback switch),
// how much ink each pixel gets, and how far from world zero the numbers it works with grow.
import { describe, expect, it } from 'vitest'
import {
  GRID_SHADER_WEBGL2,
  GRID_STYLES,
  gridPixel,
  gridShaderPlan,
  gridVertices,
  lineCoverage,
  minorStepOf,
  shaderGridQuad,
  snapStep
} from '../src/renderer/src/render/gridMath'
import { niceStep } from '../src/renderer/src/render/cameraUtils'
import { readSource } from './helpers/repo'
import type { GridStyle } from '../src/renderer/src/core/types'

const BACKENDS = ['WebGPU', 'WebGL2', 'starting'] as const

// The whole table written out, not derived: a new style or backend has to be decided here.
const PLAN_2D: Record<GridStyle, Record<(typeof BACKENDS)[number], 'shader' | 'lines'>> = {
  lines: { WebGPU: 'shader', WebGL2: 'shader', starting: 'lines' },
  fine: { WebGPU: 'shader', WebGL2: 'shader', starting: 'lines' },
  paper: { WebGPU: 'shader', WebGL2: 'shader', starting: 'lines' },
  dots: { WebGPU: 'lines', WebGL2: 'lines', starting: 'lines' },
  polar: { WebGPU: 'lines', WebGL2: 'lines', starting: 'lines' },
  isometric: { WebGPU: 'lines', WebGL2: 'lines', starting: 'lines' },
  hex: { WebGPU: 'lines', WebGL2: 'lines', starting: 'lines' }
}

describe('gridShaderPlan — which grids the shader draws', () => {
  it('covers every style the pickers offer', () => {
    expect(Object.keys(PLAN_2D).sort()).toEqual(GRID_STYLES.map((g) => g.id).sort())
  })

  it('draws only the 2-D square styles, on WebGPU always and on WebGL2 while the gate is open', () => {
    for (const style of GRID_STYLES.map((g) => g.id)) {
      for (const backend of BACKENDS) {
        expect(gridShaderPlan(backend, style, false, { webgl2Ok: true }), `${backend} ${style} 2-D`).toBe(PLAN_2D[style][backend])
        // Closing the WebGL2 gate changes WebGL2 only.
        const closed = backend === 'WebGL2' ? 'lines' : PLAN_2D[style][backend]
        expect(gridShaderPlan(backend, style, false, { webgl2Ok: false }), `${backend} ${style} 2-D gate shut`).toBe(closed)
        // The 3-D floor is always line segments.
        expect(gridShaderPlan(backend, style, true, { webgl2Ok: true }), `${backend} ${style} 3-D`).toBe('lines')
        expect(gridShaderPlan(backend, style, true, { webgl2Ok: false }), `${backend} ${style} 3-D gate shut`).toBe('lines')
      }
    }
  })

  it('follows GRID_SHADER_WEBGL2 when no gate is given, so rollback is one constant', () => {
    expect(gridShaderPlan('WebGL2', 'lines', false)).toBe(GRID_SHADER_WEBGL2 ? 'shader' : 'lines')
    expect(gridShaderPlan('WebGPU', 'lines', false)).toBe('shader')
  })
})

/** Pixel centres across a line at `line`, `phase` of a pixel off it, one device pixel `wpp` wide. */
const across = (line: number, phase: number, wpp: number) => [-3, -2, -1, 0, 1, 2, 3].map((k) => line + (k + phase) * wpp)

describe('lineCoverage — the shader line-distance function', () => {
  const ZOOMS = [0.1, 1, 37.5, 400]
  const DPRS = [1, 1.5, 2]

  it('gives every line exactly one device pixel of ink at zooms 0.1, 1, 37.5 and 400, wherever it falls', () => {
    for (const zoom of ZOOMS) {
      const major = niceStep(100 / zoom)
      const minor = minorStepOf(major)
      for (const dpr of DPRS) {
        const wpp = 1 / (zoom * dpr)
        for (const step of [minor, snapStep(minor, 'fine'), major]) {
          // A line well away from zero on both sides, as the view is after a pan.
          for (const line of [0, 7 * step, -13 * step]) {
            for (let i = 0; i < 40; i++) {
              const phase = i / 40
              const cov = across(line, phase, wpp).map((x) => lineCoverage(x, step, wpp))
              const where = `zoom ${zoom} dpr ${dpr} step ${step} line ${line} phase ${phase}`
              expect(cov.reduce((s, c) => s + c, 0), where).toBeCloseTo(1, 9)
              expect(Math.max(...cov), where).toBeLessThanOrEqual(1)
              // At most two pixels share it: a line never smears into a band.
              expect(cov.filter((c) => c > 1e-12).length, where).toBeLessThanOrEqual(2)
            }
          }
        }
      }
    }
  })

  it('puts a line through a pixel centre in that pixel alone, at full colour', () => {
    for (const zoom of ZOOMS) {
      const step = niceStep(100 / zoom)
      const wpp = 1 / zoom
      // Rounded to 9 places: the neighbours come out at 2×10⁻¹⁴ from the doubles' own dust.
      const cov = across(3 * step, 0, wpp).map((x) => Math.round(lineCoverage(x, step, wpp) * 1e9) / 1e9)
      expect(cov).toEqual([0, 0, 0, 1, 0, 0, 0])
    }
  })

  it('draws a wider line as that many pixels of ink (the axis at 1.6 px × dpr would be)', () => {
    const wpp = 0.01
    for (const w of [1, 1.6, 2, 3.2]) {
      for (let i = 0; i < 20; i++) {
        const xs = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((k) => (k + i / 20) * wpp)
        expect(xs.reduce((s, x) => s + lineCoverage(x, 1, wpp, w), 0)).toBeCloseTo(w, 9)
      }
    }
  })

  it('inks a row of pixels exactly as many times as the line path draws lines across it', () => {
    // The same view drawn both ways: gridVertices' vertical minor lines, and the shader's minor
    // coverage summed along one row of pixels. Neither may gain or lose a line.
    for (const zoom of [0.1, 1, 37.5, 400]) {
      const major = niceStep(100 / zoom)
      const minor = minorStepOf(major)
      for (const style of ['lines', 'fine'] as const) {
        const step = snapStep(minor, style)
        const wpp = 1 / (zoom * 1.5)
        // The row starts half a step past a line, so no line sits on the row's edge.
        const x0 = -17.5 * step
        const n = Math.round((40 * step) / wpp)
        const area = { xMin: x0, xMax: x0 + n * wpp, yMin: 0, yMax: 1 }
        const v = gridVertices(style, area, major, minor, 0, wpp)
        const vertical = v.minor.filter((_, i) => i % 6 === 1 && v.minor[i + 3] !== v.minor[i]).length
        let ink = 0
        for (let k = 0; k < n; k++) ink += lineCoverage(x0 + (k + 0.5) * wpp, step, wpp)
        expect(ink, `zoom ${zoom} ${style}`).toBeCloseTo(vertical, 6)
      }
    }
  })
})

describe('gridPixel — the major colour where a major line is, the minor colour elsewhere', () => {
  const major = 1
  const minor = 0.2
  const wpp = 0.001

  it('shows the major colour where major lines cross, the minor colour on a minor line and the page between', () => {
    expect(gridPixel(0, 0, minor, major, wpp)).toEqual({ minor: 1, major: 1, alpha: 1 })
    expect(gridPixel(2, 0.37, minor, major, wpp)).toEqual({ minor: 1, major: 1, alpha: 1 })
    expect(gridPixel(0.4, 0.37, minor, major, wpp)).toEqual({ minor: 1, major: 0, alpha: 1 })
    expect(gridPixel(0.3, 0.1, minor, major, wpp)).toEqual({ minor: 0, major: 0, alpha: 0 })
  })

  it('gives a major line split between two pixels one pixel of ink, not one and a half', () => {
    // Every major line is also a minor line. The browser check found the first shader stacking
    // the two (alpha = major + minor·(1 − major)): 0.75 + 0.75 across a split major line.
    for (let i = 0; i < 20; i++) {
      const phase = i / 20
      const xs = across(2, phase, wpp)
      const ink = xs.reduce((s, x) => s + gridPixel(x, 0.1, minor, major, wpp).alpha, 0)
      expect(ink, `phase ${phase}`).toBeCloseTo(1, 9)
      // …and the pixels it lights take the major colour.
      for (const x of xs) {
        const p = gridPixel(x, 0.1, minor, major, wpp)
        if (p.alpha > 0) expect(p.major).toBeCloseTo(p.alpha, 9)
      }
    }
  })

  it('keeps alpha within 0..1 where a half-lit minor and a half-lit major line cross', () => {
    const p = gridPixel(0.2 + wpp / 2, 1 + wpp / 2, minor, major, wpp)
    expect(p.minor).toBeCloseTo(0.5, 9)
    expect(p.major).toBeCloseTo(0.5, 9)
    expect(p.alpha).toBeCloseTo(0.5, 9)
  })
})

describe('shaderGridQuad — small numbers for a 32-bit GPU', () => {
  const f32 = Math.fround

  it('measures from a major line near the view, so the lines stay on multiples of their step', () => {
    const q = shaderGridQuad('fine', { xMin: 12340, xMax: 12352, yMin: -8.2, yMax: -2.1 }, 1, 0.2)
    expect(q.origin).toEqual([12346, -5])
    expect(q.minor).toBeCloseTo(0.1, 12)
    expect(q.major).toBe(1)
    const [x0, y0, x1, y1] = q.corners
    expect(x0).toBeCloseTo(-6, 9)
    expect(x1).toBeCloseTo(6, 9)
    expect(y0).toBeCloseTo(-3.2, 9)
    expect(y1).toBeCloseTo(2.9, 9)
  })

  it('keeps a line one pixel of ink at zoom 400 twelve thousand units from zero, where world numbers would not', () => {
    const zoom = 400
    const dpr = 2
    const wpp = 1 / (zoom * dpr)
    const major = niceStep(100 / zoom)
    const minor = minorStepOf(major)
    const cx = 12345.678
    const half = 1920 / zoom / 2
    const q = shaderGridQuad('lines', { xMin: cx - 3 * half, xMax: cx + 3 * half, yMin: -1, yMax: 1 }, major, minor)
    const line = Math.round(cx / minor) * minor
    let worstLocal = 0
    let worstWorld = 0
    for (let i = 0; i < 40; i++) {
      const xs = across(line, i / 40, wpp)
      // What the GPU sees: the interpolated coordinate rounded to a 32-bit float.
      const local = xs.reduce((s, x) => s + lineCoverage(f32(x - q.origin[0]), q.minor, wpp), 0)
      const world = xs.reduce((s, x) => s + lineCoverage(f32(x), q.minor, wpp), 0)
      worstLocal = Math.max(worstLocal, Math.abs(local - 1))
      worstWorld = Math.max(worstWorld, Math.abs(world - 1))
    }
    expect(worstLocal).toBeLessThan(1e-3)
    // The reason for the origin: measured from world zero the same line gains or loses ink.
    expect(worstWorld).toBeGreaterThan(0.1)
  })
})

describe('Grid.tsx draws the shader it is tested as', () => {
  const grid = readSource('src/renderer/src/render/Grid.tsx')

  it('chooses the path with gridShaderPlan and keeps the line path for everything else', () => {
    expect(grid).toContain('gridShaderPlan(')
    expect(grid).toContain('shaderGridQuad(')
    // The 3-D floor never asks: it always draws segments.
    const grid3d = grid.slice(grid.indexOf('export function Grid3D'))
    expect(grid3d).not.toContain('gridShaderPlan(')
  })

  it('measures pixels with fwidth, reads the theme colours, and recompiles on a theme change', () => {
    expect(grid).toMatch(/fwidth\(/)
    expect(grid).toMatch(/themeColor\('--grid-minor'\)/)
    expect(grid).toMatch(/themeColor\('--grid-major'\)/)
    expect(grid).toMatch(/needsUpdate = true/)
    // The same tent as lineCoverage: half the width plus half a pixel, less the distance in pixels.
    expect(grid).toMatch(/GRID_LINE_PX \* 0\.5 \+ 0\.5/)
  })

  it('keeps the PHYSLAB_CHECK grid trace and says which path drew the frame', () => {
    expect(grid).toMatch(/PHYSLAB_CHECK grid f\$\{trace\}.*path=\$\{/)
  })
})
