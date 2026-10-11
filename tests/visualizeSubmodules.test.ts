import { describe, expect, it } from 'vitest'
import * as barrel from '../src/renderer/src/core/visualize'
import * as roots from '../src/renderer/src/core/visualize/roots'
import * as curves from '../src/renderer/src/core/visualize/curves'
import * as regions from '../src/renderer/src/core/visualize/regions'

describe('core/visualize submodules (CW10f)', () => {
  it('re-exports all expected public APIs from roots, curves, and regions', () => {
    // From roots
    expect(barrel.solutionsInX).toBe(roots.solutionsInX)
    expect(barrel.drawability).toBe(roots.drawability)
    expect(barrel.inXAlone).toBe(roots.inXAlone)
    expect(barrel.plainParseError).toBe(roots.plainParseError)
    expect(barrel.NO_REAL_X).toBe(roots.NO_REAL_X)

    // From curves
    expect(barrel.isDrawnAnswer).toBe(curves.isDrawnAnswer)
    expect(barrel.visualizeSolution).toBe(curves.visualizeSolution)
    expect(barrel.visualizeVector).toBe(curves.visualizeVector)
    expect(barrel.visualizePoint).toBe(curves.visualizePoint)
    expect(barrel.visualizeGraph).toBe(curves.visualizeGraph)
    expect(barrel.visualizeTangent).toBe(curves.visualizeTangent)
    expect(barrel.visualizeTangentAt).toBe(curves.visualizeTangentAt)
    expect(barrel.visualizePiecewise).toBe(curves.visualizePiecewise)
    expect(barrel.visualizeCurves).toBe(curves.visualizeCurves)
    expect(barrel.graphBox).toBe(curves.graphBox)
    expect(barrel.frameGraphs).toBe(curves.frameGraphs)
    expect(barrel.visualizeReadings).toBe(curves.visualizeReadings)

    // From regions
    expect(barrel.NORMAL_STRETCH).toBe(regions.NORMAL_STRETCH)
    expect(barrel.visualizeBetween).toBe(regions.visualizeBetween)
    expect(barrel.visualizeArea).toBe(regions.visualizeArea)
    expect(barrel.visualizeNormal).toBe(regions.visualizeNormal)
    expect(barrel.visualizeDots).toBe(regions.visualizeDots)
    expect(barrel.visualizeNumberLine).toBe(regions.visualizeNumberLine)
  })

  it('evaluates each submodule independently without runtime errors', () => {
    expect(typeof roots.solutionsInX).toBe('function')
    expect(typeof curves.visualizeGraph).toBe('function')
    expect(typeof regions.visualizeNormal).toBe('function')
  })
})
