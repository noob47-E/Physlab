import { describe, expect, it } from 'vitest'
import { outlineCrosses, outlineRefusal, outlineStats } from '../src/renderer/src/math/shape3d'
import type { V3 } from '../src/renderer/src/math/vec'

const L: V3[] = [[0, 0, 2], [4, 0, 2], [4, 2, 2], [2, 2, 2], [2, 4, 2], [0, 4, 2]]
const bowtie: V3[] = [[0, 0, 1], [4, 4, 1], [4, 0, 1], [0, 4, 1]]

describe('the Shape tool outline', () => {
  it('measures a closed outline on a raised working plane', () => {
    const s = outlineStats(L)
    expect(s.area).toBeCloseTo(12, 9)
    expect(s.perimeter).toBeCloseTo(16, 9)
  })
  it('closes a simple outline', () => {
    expect(outlineCrosses(L)).toBe(false)
    expect(outlineRefusal(L)).toBeNull()
  })
  it('refuses a self-crossing outline in words', () => {
    expect(outlineCrosses(bowtie)).toBe(true)
    expect(outlineRefusal(bowtie)).toMatch(/crosses itself/)
  })
  it('refuses fewer than three corners and corners on a line', () => {
    expect(outlineRefusal([[0, 0, 0], [1, 0, 0]])).toMatch(/three corners/)
    expect(outlineRefusal([[0, 0, 0], [1, 0, 0], [2, 0, 0]])).toMatch(/one line/)
  })
  it('refuses a side that touches another corner', () => {
    expect(outlineCrosses([[0, 0, 0], [4, 0, 0], [2, 0, 0], [2, 3, 0]])).toBe(true)
  })
})
