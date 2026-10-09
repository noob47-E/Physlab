// FB2 PS-11, 13, 15, 18, 19, 8: right answers refused because the reader did not know a form a
// student writes. Each test types the answer the way a student does.
import { describe, expect, it } from 'vitest'
import { isReadError, readMatrixCell, readSet, readStated, readVector } from '../src/renderer/src/questions/answerText'
import { checkVectorPart } from '../src/renderer/src/questions/answerKinds'
import type { PQPart } from '../src/renderer/src/questions/pqjson'

type VectorPart = Extract<PQPart, { type: 'vector' }>
const DP = { decimals: 2, precisionMode: 'dp' as const }

describe('FB2 PS-11: "+ -" with spaces is ± in a set of roots', () => {
  it('"1 + - 2" and "1 + / - 2" give 3 and −1', () => {
    for (const typed of ['1 + - 2', '1 + / - 2', '1 +- 2', '1 +/- 2']) {
      const r = readSet(typed)
      expect(isReadError(r), typed).toBe(false)
      expect([...(r as number[])].sort((a, b) => a - b), typed).toEqual([-1, 3])
    }
  })
})

describe('FB2 PS-13: a fraction with a spaced minus in a matrix entry', () => {
  it('"- 1/2" and "−1 / 2" are −0.5', () => {
    expect(readMatrixCell('- 1/2', true)).toBe(-0.5)
    expect(readMatrixCell('−1 / 2', true)).toBe(-0.5)
    expect(readMatrixCell('- 1/2', false)).toBeNull()
  })
})

describe('FB2 PS-15: the zero vector', () => {
  it('"0" and "0 N" read as the zero vector', () => {
    expect(readVector('0')).toEqual({ v: [0, 0], unit: null })
    expect(readVector('0 N')).toEqual({ v: [0, 0], unit: 'N' })
  })
  it('"0" is marked right for a vector part whose answer is the zero vector, and wrong for another', () => {
    const zero: VectorPart = { type: 'vector', prompt: 'R =', answer: ['0', '0', '0'], unit: 'N', tolerance: { kind: 'absolute', value: 0.01 }, marks: 1 }
    expect(checkVectorPart('0', zero, {}, DP).verdict).toBe('right')
    expect(checkVectorPart('0 N', zero, {}, DP).verdict).toBe('right')
    const other: VectorPart = { ...zero, answer: ['3', '4'] }
    expect(checkVectorPart('0', other, {}, DP).verdict).toBe('wrong')
  })
})

describe('FB2 PS-18: a set of roots in round brackets', () => {
  it('"(1 ± 2)" and "(2, −3)" are read', () => {
    expect([...(readSet('(1 ± 2)') as number[])].sort((a, b) => a - b)).toEqual([-1, 3])
    expect(readSet('(2, −3)')).toEqual([2, -3])
  })
  it('brackets that are not one pair round the whole are left alone', () => {
    expect(readSet('(1+3)/2, (5-1)/2')).toEqual([2, 2])
  })
})

describe('FB2 PS-19: a stated value with its unit on both halves', () => {
  it('"5 m ± 0.1 m" is 5 ± 0.1 m', () => {
    expect(readStated('5 m ± 0.1 m')).toEqual({ x: 5, u: 0.1, unit: 'm' })
    expect(readStated('(5 m ± 0.1 m)')).toEqual({ x: 5, u: 0.1, unit: 'm' })
    expect(readStated('5 ± 0.1 m')).toEqual({ x: 5, u: 0.1, unit: 'm' })
    // Crew lead (DeepSeek): a second unit after the uncertainty's own is refused, not dropped.
    expect(isReadError(readStated('5 m ± 0.1 m s'))).toBe(true)
  })
  it('two different units are refused in the owner\'s words', () => {
    expect(readStated('5 m ± 0.1 s')).toEqual({ error: "The value and its ± part need the same unit: m and s don't match." })
  })
})

describe('FB2 PS-8: a shared power of ten in e-notation', () => {
  it('"(1.602 ± 0.002)e-19" is 1.602e-19 ± 0.002e-19', () => {
    expect(readStated('(1.602 ± 0.002)e-19')).toEqual({ x: 1.602e-19, u: 0.002e-19, unit: null })
    expect(readStated('(1.602 ± 0.002)E-19 C')).toEqual({ x: 1.602e-19, u: 0.002e-19, unit: 'C' })
  })
})
