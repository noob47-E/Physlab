// T976: a solid from typed corners that reach below its anchor keeps its height line on the solid.
import { describe, expect, it } from 'vitest'
import { solidShape } from '../src/renderer/src/math/solidShape'
import type { V3 } from '../src/renderer/src/math/vec'

describe('from-shape height', () => {
  it('base sits at the lowest corner, top at the highest, and height is their difference', () => {
    const pts: V3[] = [[0, 0, -1], [2, 0, -1], [0, 2, -1], [0, 0, 2]]
    const s = solidShape('corners', {}, [0, 0, 0], { pts } as never)
    expect(s.base[2]).toBeCloseTo(-1, 9)
    expect(s.top[2]).toBeCloseTo(2, 9)
    expect(s.top[2] - s.base[2]).toBeCloseTo(s.height, 9)
  })
})
