// T7 proof for audit bug 23 [C8]: "False singularity error on small-determinant systems
// (calc/engine.ts:1071)".
//
// Verdict REAL. `solveLinearSystem` refuses any system whose determinant is under an ABSOLUTE
// 1e-14, so a perfectly conditioned system written in small units is called singular. Measured
// today: [[10⁻⁸, 0], [0, 10⁻⁸]] x = [10⁻⁸, 2×10⁻⁸] throws "No unique solution (determinant is 0)"
// although its solution is (1, 2). The student route is Matrices → Simultaneous
// (panels/calcModes.tsx:598); the same function fits a curve at calc/engine.ts:1216.
import { describe, expect, it } from 'vitest'
import { solveLinearSystem } from '../src/renderer/src/calc/engine'

describe('G23: a small but well-conditioned system is called singular', () => {
  it('the 10⁻⁸ system solves to (1, 2)', () => {
    expect(() => solveLinearSystem([[1e-8, 0], [0, 1e-8]], [1e-8, 2e-8])).not.toThrow()
    const [x, y] = solveLinearSystem([[1e-8, 0], [0, 1e-8]], [1e-8, 2e-8])
    expect(x).toBeCloseTo(1, 9)
    expect(y).toBeCloseTo(2, 9)
  })

  it('a genuinely singular system is still refused', () => {
    expect(() => solveLinearSystem([[1, 2], [2, 4]], [1, 2])).toThrow(/No unique solution/)
  })

  it('an ordinary system is unchanged', () => {
    expect(solveLinearSystem([[1, 0], [0, 1]], [1, 2])).toEqual([1, 2])
  })
})
