import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { checkStated, format2AnswerTex } from '../src/renderer/src/questions/answerKinds'
import { resetGlobals } from './helpers/globals'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import type { PQPart } from '../src/renderer/src/questions/pqjson'

beforeEach(() => resetGlobals())

const S: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }

type VectorPart = Extract<PQPart, { type: 'vector' }>
type MatrixPart = Extract<PQPart, { type: 'matrix' }>

describe('Q6 zero stated value with a huge uncertainty', () => {
  it('refuses "0 ± 1000" against a reference of 0 ± 0.05 N', () => {
    const c = checkStated('0 ± 1000', { x: 0, u: 0.05, unit: 'N' }, S)
    expect(c).toEqual({
      verdict: 'wrong',
      parsed: 0,
      message: 'Your uncertainty is far larger than this answer allows. Check your uncertainty.'
    })
  })

  it('says it is the uncertainty that is too big, not the value (the value 0 is right)', () => {
    const c = checkStated('0 ± 1000', { x: 0, u: 0.05, unit: 'N' }, S)
    expect(c.verdict).toBe('wrong')
    expect(c.message).not.toMatch(/Check your value/)
  })

  it('leaves 0 ± 0.1 against an exact reference of 0 (no uncertainty of its own) to the Eₙ test, as before', () => {
    expect(checkStated('0 ± 0.1 N', { x: 0, u: 0, unit: 'N' }, S).verdict).toBe('right')
  })

  it('still accepts "0 ± 0.05 N" against the same reference', () => {
    const c = checkStated('0 ± 0.05 N', { x: 0, u: 0.05, unit: 'N' }, S)
    expect(c).toEqual({
      verdict: 'right',
      parsed: 0,
      message: 'Agrees with the reference value within the two uncertainties: Eₙ = 0, and 1 or less agrees.'
    })
  })
})

describe('Q21 zero vector and matrix worked out with trig are revealed as 0', () => {
  const zeroVector: VectorPart = {
    type: 'vector',
    prompt: 'Resultant',
    answer: ['F + F*cos(120) + F*cos(240)', 'F*sin(120) + F*sin(240)'],
    unit: 'N',
    tolerance: { kind: 'absolute', value: 0 },
    marks: 1
  }

  it('reveals the zero vector for three equal forces 120° apart', () => {
    expect(format2AnswerTex(zeroVector, { F: 10 }, S)).toBe('\\mathbf{0}\\,\\mathrm{N}')
  })

  it('reveals zero entries for the same components as a matrix', () => {
    const zeroMatrix: MatrixPart = {
      type: 'matrix',
      prompt: 'Resultant',
      answer: [
        ['F + F*cos(120) + F*cos(240)', '0'],
        ['0', 'F*sin(120) + F*sin(240)']
      ],
      tolerance: { kind: 'absolute', value: 0 },
      marks: 1
    }
    expect(format2AnswerTex(zeroMatrix, { F: 10 }, S)).toBe('\\begin{pmatrix} 0 & 0 \\\\ 0 & 0 \\end{pmatrix}')
  })

  it('keeps a real tiny component made from a huge input: the force qE on an electron, E = 10⁴ N/C', () => {
    const qE: VectorPart = {
      type: 'vector',
      prompt: 'F',
      answer: ['q*E', '0'],
      unit: 'N',
      tolerance: { kind: 'relative', value: 0.02 },
      marks: 1
    }
    expect(format2AnswerTex(qE, { q: 1.6e-19, E: 1e4 }, S)).not.toContain('\\mathbf{0}')
    expect(format2AnswerTex(qE, { q: 1.6e-19, E: 1e4 }, S)).toContain('10^{-15}')
  })

  it('keeps a real tiny matrix entry made from a huge input', () => {
    const m: MatrixPart = { type: 'matrix', prompt: 'M', answer: [['q*E', '0']], tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }
    expect(format2AnswerTex(m, { q: 1.6e-19, E: 1e4 }, S)).toContain('10^{-15}')
  })

  it('keeps a real small component on the scale of the vector: (0.004, 5)', () => {
    const small: VectorPart = {
      type: 'vector',
      prompt: 'v',
      answer: ['0.004', '5'],
      unit: 'none',
      tolerance: { kind: 'absolute', value: 0 },
      marks: 1
    }
    expect(format2AnswerTex(small, {}, S)).toBe('4\\times 10^{-3}\\,\\mathbf{i} + 5\\,\\mathbf{j}')
  })
})
