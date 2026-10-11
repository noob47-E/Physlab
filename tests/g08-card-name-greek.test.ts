// T7 proof for audit bug 8 [C2]: "Greek card name rejection (math/vectorSolver.ts:1396)".
//
// Verdict REAL. `safeCardName` strips every character outside [A-Za-z0-9_] before validating, so a
// Greek name a student types is silently thrown away and the card keeps its old name — while
// `sceneName` (line 1411-1417) keeps Greek letters, and the panel calls `safeCardName` on the name
// a student types (panels/vectorCalcStore.ts:327, 1369).
import { describe, expect, it } from 'vitest'
import { safeCardName, sceneName } from '../src/renderer/src/math/vectorSolver'

describe('G8: a Greek card name is silently rejected', () => {
  it('the scene can hold a Greek name (the reading back already works)', () => {
    expect(sceneName('θ')).toBe('θ')
    expect(sceneName('λ')).toBe('λ')
  })

  it('typing θ as a vector card name keeps θ', () => {
    expect(safeCardName('θ', 'A', [])).toBe('θ')
  })

  it('typing λ as a vector card name keeps λ', () => {
    expect(safeCardName('λ', 'A', [])).toBe('λ')
  })

  it('the rules that make a name unusable still hold', () => {
    expect(safeCardName('', 'A', [])).toBe('A')
    expect(safeCardName('v__A', 'A', [])).toBe('A')
    expect(safeCardName('i', 'A', [])).toBe('A')
    expect(safeCardName('B', 'A', ['B'])).toBe('A')
    expect(safeCardName('v_A', 'A', [])).toBe('v_A')
  })
})
