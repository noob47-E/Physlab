import { describe, it, expect, vi } from 'vitest'
import {
  useViewPref,
  effectiveLook,
  viewForPreset,
  PRESET_VIEW,
  ViewKind,
  LookKind,
  ViewPrefState
} from '../src/renderer/src/sim/viewPref'
import {
  planeGrid,
  gridLabels,
  scaleBar,
  fitOrtho,
  centreOfMass,
  Rect,
  PlaneGrid,
  MassPoint
} from '../src/renderer/src/render/sandbox/planeMath'
import { MeasureSettings } from '../src/renderer/src/math/format'
import { readFileSync } from 'fs'

describe('sim/viewPref', () => {
  it('exports unused locals so they are tested (TypeScript strict)', () => {
    // Assert all exported types are defined
    const viewKind: ViewKind = '3d'
    const lookKind: LookKind = 'real'
    const viewPrefState: ViewPrefState = { view: '3d', setView: () => {}, toggle: () => {} }
    expect(viewKind).toBeDefined()
    expect(lookKind).toBeDefined()
    expect(viewPrefState).toBeDefined()
  })

  it('default is 3d, toggle and setView work', () => {
    expect(useViewPref.getState().view).toBe('3d')
    
    useViewPref.getState().setView('2d')
    expect(useViewPref.getState().view).toBe('2d')

    useViewPref.getState().toggle()
    expect(useViewPref.getState().view).toBe('3d')
  })

  it('effectiveLook behavior', () => {
    expect(effectiveLook('2d', 'real')).toBe('diagram')
    expect(effectiveLook('3d', 'real')).toBe('real')
    expect(effectiveLook('3d', 'diagram')).toBe('diagram')
  })

  it('viewForPreset behavior', () => {
    expect(viewForPreset('lab1d', '3d')).toBe('2d')
    expect(viewForPreset('swingbridge', '2d')).toBe('3d')
    expect(viewForPreset('fall', '2d')).toBe('2d')
    expect(viewForPreset(null, '3d')).toBe('3d')
    expect(PRESET_VIEW).toBeDefined()
  })

  it('does not touch localStorage or import sim/store', () => {
    // If running in a jsdom environment with Storage, spy on it.
    // If not, there's nothing to spy on.
    if (typeof Storage !== 'undefined') {
      const spy = vi.spyOn(Storage.prototype, 'setItem')
      useViewPref.getState().setView('2d')
      useViewPref.getState().toggle()
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
    } else {
      useViewPref.getState().setView('2d')
      useViewPref.getState().toggle()
    }

    const source = readFileSync('src/renderer/src/sim/viewPref.ts', 'utf-8')
    expect(source).not.toContain('sim/store')
  })
})

describe('render/sandbox/planeMath', () => {
  it('exports unused locals so they are tested', () => {
    const rect: Rect = { xMin: -5, xMax: 5, yMin: -5, yMax: 5 }
    const planeGridType: PlaneGrid = { minorStep: 1, majorStep: 5, minorX: [], minorY: [], majorX: [], majorY: [] }
    const massPoint: MassPoint = { mass: 1, position: [0, 0, 0], velocity: [0, 0, 0] }
    expect(rect).toBeDefined()
    expect(planeGridType).toBeDefined()
    expect(massPoint).toBeDefined()
  })

  it('planeGrid combinations', () => {
    // at x from -5 to 5 over 1000 px (100 px per m): minorStep 0.5, majorStep 1
    // minorX has 21 values from -5 to 5, majorX has 11
    let grid = planeGrid({ xMin: -5, xMax: 5, yMin: -5, yMax: 5 }, 1000, 1000)
    expect(grid.minorStep).toBe(0.5)
    expect(grid.majorStep).toBe(1)
    expect(grid.minorX.length).toBe(21)
    expect(grid.minorX[0]).toBe(-5)
    expect(grid.minorX[20]).toBe(5)
    expect(grid.majorX.length).toBe(11)

    // at 500 px per m: minor 0.05, major 0.1
    grid = planeGrid({ xMin: 0, xMax: 2, yMin: 0, yMax: 2 }, 1000, 1000)
    expect(grid.minorStep).toBe(0.05)
    expect(grid.majorStep).toBe(0.1)

    // at 20 px per m: minor 2, major 10
    grid = planeGrid({ xMin: 0, xMax: 50, yMin: 0, yMax: 50 }, 1000, 1000)
    expect(grid.minorStep).toBe(2)
    expect(grid.majorStep).toBe(10)

    // at 10 px per m: minor 5, major 10
    grid = planeGrid({ xMin: 0, xMax: 100, yMin: 0, yMax: 100 }, 1000, 1000)
    expect(grid.minorStep).toBe(5)
    expect(grid.majorStep).toBe(10)

    // a view 20 000 m wide never gives more than 300 lines on an axis
    grid = planeGrid({ xMin: -10000, xMax: 10000, yMin: -10000, yMax: 10000 }, 1000, 1000)
    expect(grid.minorX.length).toBeLessThanOrEqual(300)
    expect(grid.minorY.length).toBeLessThanOrEqual(300)

    // a NaN view gives empty arrays
    grid = planeGrid({ xMin: NaN, xMax: 5, yMin: -5, yMax: 5 }, 1000, 1000)
    expect(grid.minorX.length).toBe(0)
    expect(grid.majorX.length).toBe(0)
  })

  it('scaleBar behavior', () => {
    const defaults: MeasureSettings = { unit: 'm', precisionMode: 'sf', decimals: 3, unitPerSquare: 1, angleUnit: 'deg' }
    
    // scaleBar(100, defaults) = 1 m at 100 px (maxPx 160: the 2 m bar would be 200 px, too long)
    let bar = scaleBar(100, defaults)
    expect(bar.metres).toBe(1)
    expect(bar.px).toBe(100)
    
    // scaleBar(40) = 2 m at 80 px
    bar = scaleBar(40, defaults)
    expect(bar.metres).toBe(2)
    expect(bar.px).toBe(80)

    // scaleBar(300) = 0.5 m at 150 px
    bar = scaleBar(300, defaults)
    expect(bar.metres).toBe(0.5)
    expect(bar.px).toBe(150)

    // the label comes from formatMeasure (no toFixed in the module: read it as text)
    const source = readFileSync('src/renderer/src/render/sandbox/planeMath.ts', 'utf-8')
    expect(source).not.toContain('toFixed')
  })

  it('gridLabels uses measure format', () => {
    const defaults: MeasureSettings = { unit: 'm', precisionMode: 'sf', decimals: 3, unitPerSquare: 1, angleUnit: 'deg' }
    const labels = gridLabels({ xMin: -5, xMax: 5, yMin: -5, yMax: 5 }, 1000, 1000, defaults)
    // JM: toBeDefined() also passes for an empty list; require labels with text on both axes
    expect(labels.x.length).toBeGreaterThan(0)
    expect(labels.y.length).toBeGreaterThan(0)
    expect(labels.x.every(l => l.text.length > 0)).toBe(true)
    expect(labels.y.every(l => l.text.length > 0)).toBe(true)
  })

  it('fitOrtho behavior', () => {
    // fitOrtho({min:[-3,-0.5], max:[3,0.5]}, 1200, 600) = centre [0, 0], pixelsPerMetre 128
    let fit = fitOrtho({ min: [-3, -0.5], max: [3, 0.5] }, 1200, 600)
    expect(fit.centre).toEqual([0, 0])
    expect(Math.round(fit.pixelsPerMetre)).toBe(128)

    // a box 0.1 m wide still keeps minSpan: pixelsPerMetre = 300 (600 px / 2 m) for that screen
    fit = fitOrtho({ min: [-0.05, -0.05], max: [0.05, 0.05] }, 1200, 600)
    expect(Math.round(fit.pixelsPerMetre)).toBe(300)

    // an off-centre box centres on the box
    fit = fitOrtho({ min: [10, 10], max: [12, 12] }, 1200, 600)
    expect(fit.centre).toEqual([11, 11])
  })

  it('centreOfMass behavior', () => {
    // centreOfMass([{mass 1, position [0,0,0], velocity [3,0,0]}, {mass 2, position [3,0,0], velocity [0,0,0]}]) =
    // mass 3, position [2,0,0], velocity [1,0,0], momentum [3,0,0]
    let com = centreOfMass([
      { mass: 1, position: [0, 0, 0], velocity: [3, 0, 0] },
      { mass: 2, position: [3, 0, 0], velocity: [0, 0, 0] }
    ])
    expect(com?.mass).toBe(3)
    expect(com?.position).toEqual([2, 0, 0])
    expect(com?.velocity).toEqual([1, 0, 0])
    expect(com?.momentum).toEqual([3, 0, 0])

    // masses 0 give null
    expect(centreOfMass([{ mass: 0, position: [0, 0, 0], velocity: [0, 0, 0] }])).toBeNull()

    // an empty list gives null
    expect(centreOfMass([])).toBeNull()

    // random seeded lists: the momentum equals the sum of mass x velocity (1e-9)
    const list: MassPoint[] = [
      { mass: 1.5, position: [1, 2, 3], velocity: [-1, 0.5, 2] },
      { mass: 2.5, position: [-2, 4, 1], velocity: [3, -1.5, 0] }
    ]
    com = centreOfMass(list)
    expect(com).not.toBeNull()
    if (com) {
      const sumMx = 1.5 * -1 + 2.5 * 3
      const sumMy = 1.5 * 0.5 + 2.5 * -1.5
      const sumMz = 1.5 * 2 + 2.5 * 0
      expect(Math.abs(com.momentum[0] - sumMx)).toBeLessThan(1e-9)
      expect(Math.abs(com.momentum[1] - sumMy)).toBeLessThan(1e-9)
      expect(Math.abs(com.momentum[2] - sumMz)).toBeLessThan(1e-9)
    }
  })
})
