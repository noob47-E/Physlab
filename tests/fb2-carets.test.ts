// FB2 caret family (PS-2, 3, 4, 5, 6, 14, 20) and the guard: Problem Sets showed a programming caret
// in a student's text ("1.6×10^-19 C", "x^4"). AGENTS.md rule 2 and "every label chip goes through
// superscriptPowers": a power on screen is raised, "1.6 × 10⁻¹⁹ C", "x⁴".
import { describe, expect, it } from 'vitest'
import { expectedText } from '../src/renderer/src/math/checkAnswer'
import { formatQuantity } from '../src/renderer/src/questions/units'
import { substitute, drawVariables } from '../src/renderer/src/questions/variables'
import { plainFormula } from '../src/renderer/src/questions/plainFormula'
import { checkFunctionPart } from '../src/renderer/src/questions/odeCheck'
import { playQuestion } from '../src/renderer/src/questions/player'
import { markWithECF } from '../src/renderer/src/questions/ecf'
import { checkNumberPart } from '../src/renderer/src/questions/parts'
import type { PQPart, PQQuestion } from '../src/renderer/src/questions/pqjson'

type FunctionPart = Extract<PQPart, { type: 'function' }>
type NumberPart = Extract<PQPart, { type: 'number' }>

const DP = { decimals: 2, precisionMode: 'dp' as const }
const SF = { decimals: 3, precisionMode: 'sf' as const }
const PLAY = { ...DP, unit: 'm' as const, unitPerSquare: 1, angleUnit: 'deg' as const }
const LICENSE = { id: 'CC BY 4.0' as const, holder: 'PhysLab' }

const ecfQuestion = (from: number, to: number): PQQuestion => ({
  id: 'fb2-ecf',
  title: 'ECF',
  statement: 'Part a and b.',
  license: LICENSE,
  variables: [
    { name: 'q', def: { kind: 'range', from, to, step: 1 } },
    { name: 'ans', def: { kind: 'expr', expr: 'q * 2' } }
  ],
  parts: [
    { type: 'number', prompt: 'Find q', answer: 'q', unit: 'C', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 },
    {
      type: 'number',
      prompt: 'Find ans',
      answer: 'ans',
      unit: 'C',
      tolerance: { kind: 'relative', value: 0.02 },
      ecf: { strategy: 'alwaysreplace', uses: [{ part: 0, variable: 'q' }], penalty: 0 },
      marks: 1
    }
  ]
})

const odePart: FunctionPart = {
  type: 'function',
  prompt: 'Solve the ODE',
  ode: "y' = 0",
  model: '1e10',
  x: 'x',
  y: 'y',
  initial: [{ at: '0', value: '1e10', order: 0 }],
  marks: 1
}

describe('FB2 PS-2: a revealed Practice answer has no caret', () => {
  it('an electron-scale answer is written with a raised power', () => {
    const out = expectedText({ key: 'test', label: 'F', value: 1.6e-19, tol: 1e-21, unit: 'N', kind: undefined, traps: [] }, DP)
    expect(out).not.toContain('^')
    expect(out).toContain('10⁻¹⁹')
  })
})

describe('FB2 PS-3: formatQuantity has no caret', () => {
  it('1.6e-19 C and 2.5e6 N', () => {
    expect(formatQuantity(1.6e-19, 'C', DP)).toBe('1.6\u00a0×\u00a010⁻¹⁹ C')
    expect(formatQuantity(2.5e6, 'N', DP)).not.toContain('^')
  })
  it('a revealed number part, typed back exactly as shown, is still marked right', () => {
    const q: PQQuestion = { ...ecfQuestion(1, 1), variables: [{ name: 'q', def: { kind: 'range', from: 1.6e-19, to: 1.6e-19, step: 1 } }] }
    const played = playQuestion(q, 1, PLAY)
    const shown = played.parts[0].answerText!
    expect(shown).not.toContain('^')
    expect(checkNumberPart(shown, q.parts[0] as NumberPart, { q: 1.6e-19 }, DP).verdict).toBe('right')
  })
})

describe('FB2 PS-4: a statement chip has no caret', () => {
  it('{q} = 1.6e-19 C', () => {
    expect(substitute('A particle with charge {q} enters a field.', { q: 1.6e-19 }, { q: 'C' }, DP)).not.toContain('^')
  })
})

describe('FB2 PS-5: an error-carried-forward note has no caret', () => {
  it('a carried 1.6e-19 C', () => {
    const played = playQuestion(ecfQuestion(1, 10), 1, PLAY)
    const check = markWithECF(played.parts[1], '3.2e-19', played, new Map([[0, 1.6e-19]]), PLAY, () => ({ verdict: 'right' }))
    expect(check.ecfNote).toBeDefined()
    expect(check.ecfNote).not.toContain('^')
  })
})

describe('FB2 PS-6: a picture note writes every whole power raised', () => {
  it('x^4, x^5, x^(-2)', () => {
    expect(plainFormula('x^4')).toBe('x⁴')
    expect(plainFormula('x^5')).toBe('x⁵')
    expect(plainFormula('x^(-2)')).toBe('x⁻²')
    expect(plainFormula('x^12')).toBe('x¹²')
  })
})

describe('FB2 PS-14: an unreadable condition sentence has no caret', () => {
  it('x^4 in the condition', () => {
    const q: PQQuestion = {
      id: 'fb2-condition',
      title: 'Condition',
      statement: 'Test',
      license: LICENSE,
      variables: [{ name: 'x', def: { kind: 'range', from: 1, to: 10, step: 1 } }],
      condition: { when: 'x^4 > 0 and badFunc(x)', maxRuns: 10 },
      parts: []
    }
    const variant = drawVariables(q, 1)
    expect(variant.problems.length).toBeGreaterThan(0)
    expect(variant.problems[0]).not.toContain('^')
  })
})

describe('FB2 PS-20: an ODE starting-value sentence has no caret', () => {
  it('y(0) should be 1e10', () => {
    const check = checkFunctionPart('0', odePart, {})
    expect(check.verdict).toBe('wrong')
    expect(check.message).toBeDefined()
    expect(check.message).not.toContain('^')
  })
})

describe('FB2 GUARD: no Problem Sets text a student reads holds a caret (rule 2)', () => {
  it('expectedText, tiny to huge, places and figures', () => {
    for (const value of [1.6e-19, 9.11e-31, 2.998e8, 6.67e-11, 1e25, -3.5e-14]) {
      for (const s of [DP, SF]) {
        expect(expectedText({ key: 'g', label: 'v', value, tol: Math.abs(value) * 0.01, unit: 'N', kind: undefined, traps: [] }, s)).not.toContain('^')
      }
    }
  })
  it('formatQuantity across units and scales', () => {
    for (const v of [1.6e-19, 2.5e6, 1e-12, 1e12, -4.2e-7, 9.99e15]) {
      for (const u of ['C', 'N', 'm', 'kg', 's', 'J', 'none'] as const) {
        expect(formatQuantity(v, u, DP)).not.toContain('^')
        expect(formatQuantity(v, u, SF)).not.toContain('^')
      }
    }
  })
  it('statement chips', () => {
    const out = substitute('A potential {V} acts on a charge {q} of mass {m}.', { V: 5.0e4, q: 1.6e-19, m: 9.11e-31 }, { V: 'V', q: 'C', m: 'kg' }, DP)
    expect(out).not.toContain('^')
  })
  it('plainFormula for whole powers 0 to 9 and negative ones', () => {
    for (const f of ['x^0', 'x^1', 'x^2', 'x^3', 'x^4', 'x^5', 'x^6', 'x^7', 'x^8', 'x^9', 'x^(-1)', 'x^(-2)', 'x^(-3)']) {
      expect(plainFormula(f)).not.toContain('^')
    }
  })
  it('an unreadable condition with x^5', () => {
    const q: PQQuestion = {
      id: 'fb2-guard-condition',
      title: 'Guard',
      statement: 'Test',
      license: LICENSE,
      variables: [{ name: 'x', def: { kind: 'range', from: 1, to: 10, step: 1 } }],
      condition: { when: 'x^5 > 100 and badCondition(x)', maxRuns: 5 },
      parts: []
    }
    for (const problem of drawVariables(q, 1).problems) expect(problem).not.toContain('^')
  })
  it('the ODE check and a carried tiny value', () => {
    expect(checkFunctionPart('0', odePart, {}).message).not.toContain('^')
    const q = ecfQuestion(1.6e-19, 1.6e-19)
    const played = playQuestion(q, 1, PLAY)
    // An earlier answer that differs from the drawn value, so the note is written at all.
    const check = markWithECF(played.parts[1], '3.4e-19', played, new Map([[0, 1.7e-19]]), PLAY, () => ({ verdict: 'right' }))
    expect(check.ecfNote).toBeDefined()
    expect(check.ecfNote).not.toContain('^')
  })
})
