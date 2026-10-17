import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { scene } from '../src/renderer/src/core/store'
import * as VS from '../src/renderer/src/math/vectorSolver'

describe('Part X7: Vectors: Solver + Vector Calculator as one panel', () => {
  it('showSolution focuses vectorcalc instead of a separate solver panel', () => {
    const sol = VS.solveAddition([
      { name: 'A', v: [3, 4, 0] },
      { name: 'B', v: [1, 2, 0] }
    ])

    scene().showSolution(sol)

    const focus = scene().focusPanel
    expect(focus).not.toBeNull()
    // It must focus the unified vectorcalc panel, never the separate solver panel
    expect(focus?.id).toBe('vectorcalc')
  })

  it('Solver.tsx re-exports or renders the unified VectorCalc panel', () => {
    const solverSrcPath = path.resolve(__dirname, '../src/renderer/src/panels/Solver.tsx')
    const solverSrc = fs.readFileSync(solverSrcPath, 'utf-8')

    // Solver.tsx must point to the unified VectorCalc panel
    expect(solverSrc).toMatch(/VectorCalc/)
  })

  it('VectorCalc handles external solutions from showSolution in its result card', () => {
    const sol = VS.solveTorque([2, 0, 0], [0, 3, 0])
    scene().showSolution(sol)

    // VectorCalc should display the solution from scene().solution
    const vcSrcPath = path.resolve(__dirname, '../src/renderer/src/panels/VectorCalc.tsx')
    const vcSrc = fs.readFileSync(vcSrcPath, 'utf-8')

    // Must listen to or sync with useScene solution
    expect(vcSrc).toMatch(/useScene\([\s\S]*?s\.solution[\s\S]*?\)/)
  })

  it('offers solveAdditionCosineLaw when adding two vectors', () => {
    // When adding two vectors, the solver methods (components, cosine law) should be available
    const solCosine = VS.solveAdditionCosineLaw(
      { name: 'A', v: [3, 4, 0] },
      { name: 'B', v: [1, 2, 0] },
      'R'
    )
    expect(solCosine.title).toContain('cosines')
    expect(solCosine.steps.length).toBeGreaterThan(0)
  })
})
