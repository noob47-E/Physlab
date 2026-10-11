// T7 proof for audit bug 5 [C2]: "Zero division on degenerate triangle input
// (math/congruence.ts:156)".
//
// Verdict REAL, with the mechanism corrected: no division is made (line 156 is `const congruent =
// test !== null`, and the `similar` ratio guard at line 172 is never reached because a degenerate
// triangle's angles do not match). What happens instead is that `triangleInfo` hands back NaN
// angles for a zero-length side, `eqAng` compares them as unequal, and the NaN is written straight
// into the sentence a student reads: "∠A = NaN° but ∠D = NaN°".
import { describe, expect, it } from 'vitest'
import { compareTriangles, type Tri } from '../src/renderer/src/math/congruence'

/** Two triangles that each have a corner doubled back on itself (a zero-length side). */
const A = { names: ['A', 'B', 'C'], pts: [[0, 0, 0], [0, 0, 0], [1, 0, 0]] } as unknown as Tri
const B = { names: ['D', 'E', 'F'], pts: [[0, 0, 0], [0, 0, 0], [1, 0, 0]] } as unknown as Tri
/** Three coincident corners: every side is zero. */
const C = { names: ['A', 'B', 'C'], pts: [[1, 1, 0], [1, 1, 0], [1, 1, 0]] } as unknown as Tri

describe('G5: a degenerate triangle puts NaN into the congruence reason', () => {
  it('a zero-length side is not reported as "NaN°"', () => {
    expect(compareTriangles(A, B).reasons.join(' ')).not.toContain('NaN')
  })

  it('three coincident corners are not reported as "NaN°"', () => {
    expect(compareTriangles(C, C).reasons.join(' ')).not.toContain('NaN')
  })

  it('an ordinary pair still reads as before', () => {
    const p = [[0, 0, 0], [3, 0, 0], [0, 4, 0]] as unknown as [never, never, never]
    const r = compareTriangles({ names: ['A', 'B', 'C'], pts: p } as unknown as Tri, { names: ['D', 'E', 'F'], pts: p } as unknown as Tri)
    expect(r.congruent).toBe(true)
    expect(r.reasons.join(' ')).not.toContain('NaN')
  })
})
