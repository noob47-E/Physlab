import { describe, expect, it } from 'vitest'
import { compareTriangles, triangleFromSides, type Tri } from '../src/renderer/src/math/congruence'
import type { V3 } from '../src/renderer/src/math/vec'

const tri = (names: string, pts: V3[]): Tri => ({ names: names.split('') as [string, string, string], pts: pts as [V3, V3, V3] })
const ABC = tri('ABC', [
  [0, 0, 0],
  [4, 0, 0],
  [0, 3, 0]
])

describe('congruent triangles', () => {
  it('finds SSS whatever order the corners were drawn in, and names the match', () => {
    const DEF = tri('DEF', [
      [10, 3, 0],
      [10, 0, 0],
      [14, 0, 0]
    ])
    const r = compareTriangles(ABC, DEF)
    expect(r.congruent).toBe(true)
    expect(r.test).toBe('SSS')
    expect(r.matchedName).toBe('EFD')
    expect(r.reasons.at(-1)).toContain('△ABC ≅ △EFD by SSS')
    expect(r.reasons[0]).toMatch(/BC = FD = 5\.00|BC = DF/)
  })

  it('says no, and why, when a side differs', () => {
    const DEF = tri('DEF', [
      [0, 0, 0],
      [5, 0, 0],
      [0, 3, 0]
    ])
    const r = compareTriangles(ABC, DEF)
    expect(r.congruent).toBe(false)
    expect(r.test).toBeNull()
    expect(r.similar).toBeNull()
    expect(r.reasons.at(-1)).toMatch(/but .* so the triangles are not congruent/)
  })

  it('spots a similar triangle and its ratio', () => {
    const DEF = tri('DEF', [
      [0, 0, 0],
      [8, 0, 0],
      [0, 6, 0]
    ])
    const r = compareTriangles(ABC, DEF)
    expect(r.congruent).toBe(false)
    expect(r.similar?.ratio).toBeCloseTo(2, 6)
    expect(r.reasons.at(-1)).toContain('similar')
  })

  it('names the right-angle test for a mirrored right triangle', () => {
    const DEF = tri('DEF', [
      [0, 0, 0],
      [-4, 0, 0],
      [0, 3, 0]
    ])
    const r = compareTriangles(ABC, DEF)
    expect(r.congruent).toBe(true)
    // Three equal sides win first; RHS is what a student would also be allowed to quote.
    expect(['SSS', 'RHS']).toContain(r.test)
  })

  it('builds a triangle from its sides and refuses an impossible one', () => {
    const p = triangleFromSides(3, 4, 5)!
    expect(p[1]).toEqual([5, 0, 0])
    expect(Math.hypot(p[2][0] - p[0][0], p[2][1] - p[0][1])).toBeCloseTo(4, 9)
    expect(Math.hypot(p[2][0] - p[1][0], p[2][1] - p[1][1])).toBeCloseTo(3, 9)
    expect(triangleFromSides(1, 2, 5)).toBeNull()
  })
})
