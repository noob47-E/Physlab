import { describe, expect, it } from 'vitest'
import { trigWorking } from '../src/renderer/src/math/pure/trigIdentity'
import { toPlaces } from '../src/renderer/src/math/pure/table'
import { parseNormalQuery, zscoreWorking } from '../src/renderer/src/math/pure/zscore'

describe('U17: a zero angle prints as 0, not as empty brackets', () => {
  it('cos(0) = 1 prints Prove cos 0 = 1 and no empty function brackets anywhere', () => {
    const w = trigWorking('cos(0) = 1')
    expect(w.title).toBe('Prove cos 0 = 1')
    expect(w.input).toBe(String.raw`\cos 0 = 1`)
    expect(w.moves[0]?.tex).toBe(String.raw`\cos 0`)
    expect(w.moves.at(-1)?.tex).toBe('= 1')
    for (const m of w.moves) {
      expect(m.tex ?? '').not.toContain('()')
    }
  })

  it('sin(0) = 0 prints Prove sin 0 = 0', () => {
    const w = trigWorking('sin(0) = 0')
    expect(w.title).toBe('Prove sin 0 = 0')
    expect(w.input).toBe(String.raw`\sin 0 = 0`)
    for (const m of w.moves) {
      expect(m.tex ?? '').not.toContain('()')
    }
  })
})

describe('U18: table rounding uses half-away, not the binary double', () => {
  it('positive exact ties round up', () => {
    expect(toPlaces(73.225, 2)).toBe(73.23)
    expect(toPlaces(68.225, 2)).toBe(68.23)
  })

  it('negative exact ties round away from zero', () => {
    expect(toPlaces(-68.225, 2)).toBe(-68.23)
  })

  it('the Working answer for the top-5% question uses the half-away value', () => {
    const w = zscoreWorking(parseNormalQuery('P(X > x) = 0.05, X ~ N(65, 5^2)')!)
    expect(w.answers[0]?.tex).toBe('73.23')
    expect(w.moves.some((m) => m.tex?.includes('73.23'))).toBe(true)
  })
})
