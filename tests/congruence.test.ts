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

describe('congruent only when all six parts agree (H10)', () => {
  // Two sides and the angle between them, from a corner at the origin.
  const sas = (names: string, s1: number, s2: number, deg: number, at: V3 = [0, 0, 0]): Tri => {
    const r = (deg * Math.PI) / 180
    return tri(names, [at, [at[0] + s1, at[1], 0], [at[0] + s2 * Math.cos(r), at[1] + s2 * Math.sin(r), 0]])
  }

  it('10, 10 at 60° against 10.05, 10.05 at 60.5° is not congruent, and names the third side with both values', () => {
    const r = compareTriangles(sas('ABC', 10, 10, 60), sas('DEF', 10.05, 10.05, 60.5, [20, 0, 0]))
    expect(r.congruent).toBe(false)
    expect(r.test).toBeNull()
    const last = r.reasons.find((l) => /not congruent/.test(l))!
    expect(last).toMatch(/= 10\.00 but \w+ = 10\.13, so the triangles are not congruent\./)
  })

  it('an exactly congruent snapped pair keeps its result and wording', () => {
    const DEF = tri('DEF', [
      [10, 3, 0],
      [10, 0, 0],
      [14, 0, 0]
    ])
    const r = compareTriangles(ABC, DEF)
    expect(r.congruent).toBe(true)
    expect(r.reasons).toEqual(['BC = FD = 5.00', 'CA = DE = 3.00', 'AB = EF = 4.00', 'So △ABC ≅ △EFD by SSS (three sides).'])
  })

  it('a right-angled pair and a reflected pair are congruent', () => {
    const right = compareTriangles(sas('ABC', 3, 4, 90), sas('DEF', 4, 3, 90, [10, 0, 0]))
    expect(right.congruent).toBe(true)
    const mirror = compareTriangles(sas('ABC', 5, 7, 40), tri('DEF', [[0, 0, 0], [-5, 0, 0], [-7 * Math.cos((40 * Math.PI) / 180), 7 * Math.sin((40 * Math.PI) / 180), 0]]))
    expect(mirror.congruent).toBe(true)
  })

  it('a pair equal within the tolerance on all six parts is congruent, and each line shows both values', () => {
    const r = compareTriangles(sas('ABC', 10, 8, 50), sas('DEF', 10.02, 8.01, 50.1, [30, 0, 0]))
    expect(r.congruent).toBe(true)
    // Every line names each triangle's own value; one that differs in print says it is within 0.5 %.
    const within = r.reasons.filter((l) => /within/.test(l))
    expect(within.length).toBeGreaterThan(0)
    for (const l of within) expect(l).toMatch(/^(∠?\w+ = [\d.]+°?) and (∠?\w+ = [\d.]+°?), equal to within (0\.5 %|0\.6°)$/)
    expect(r.reasons.some((l) => /AB = \w+ = /.test(l) && !/and/.test(l))).toBe(false)
  })
})
