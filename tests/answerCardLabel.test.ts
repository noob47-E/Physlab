// The Calculator's answer card when "=" cannot answer a line and the step working does (calc/working.ts reconcile).
//
// Fix 1: a single answer keeps its label on the card, so 2t + 4 = 10 reads "t = 3", not a bare "3" that a student
// cannot tell from a number they typed. Several answers already carried their labels.
// Fix 2: a zero term written against a letter (0x) is 0, not the start of a hex number, so the working reads
// x² + 0x − 4 = 0 and 0x + 3 = 3 instead of refusing them with "I could not read that".

import { beforeEach, describe, expect, it } from 'vitest'
import { usePure } from '../src/renderer/src/math/pure/store'
import { reconcile } from '../src/renderer/src/calc/working'
import { evaluateInput } from '../src/renderer/src/calc/evaluateInput'
import { checkCalculatorGuess } from '../src/renderer/src/calc/guessCalc'
import { defaultCheckAdapter } from '../src/renderer/src/math/steps/check-adapter'
import { latexToMath } from '../src/renderer/src/math/latexToMath'
import { cardLabelTex, cardLabelText } from '../src/renderer/src/calc/labels'
import { resetGlobals } from './helpers/globals'

const COMP = { vars: {}, ans: 0, angle: 'deg' } as const

beforeEach(() => {
  resetGlobals()
  usePure.setState({ working: null, input: '', inputLatex: '', history: [] })
})

describe('Fix 1: a single answer keeps its label on the answer card', () => {
  it('2t + 4 = 10 reads "t = 3" on the card when "=" refuses the line', () => {
    usePure.getState().runLatex('2t+4=10', 'auto', { quiet: true })
    const w = usePure.getState().working
    expect(w?.error).toBeUndefined()
    expect(w?.answers.map((a) => a.tex)).toEqual(['3'])
    expect(w?.checked).toBe('ok')

    // "=" refuses this line (it wants Numbers mode), so the card is the working's answer.
    const card = evaluateInput('COMP', '2t+4=10', COMP)!
    expect(card.error).toBeDefined()
    const r = reconcile(card, w)
    expect(r.verdict).toBe('unchecked')
    expect(r.result.main).toContain('t = 3')
    expect(r.result.main).not.toBe('3')
  })

  it('a single answer with a word for its label stays a bare answer', () => {
    // A word label ("Answer") is not a symbol, so there is nothing to show before the value.
    const working = {
      title: 'Simplify',
      input: '2t+4=10',
      moves: [],
      answers: [{ label: 'Answer', tex: '3' }],
      checked: 'ok' as const
    }
    const card = evaluateInput('COMP', '2t+4=10', COMP)!
    const r = reconcile(card, working)
    expect(r.result.main).toBe('3')
  })

  it('x + y = 3, 2x - y = 0 still reads "x = 1" and "y = 2" on the card', () => {
    usePure.getState().runLatex('x + y = 3, 2x - y = 0', 'auto', { quiet: true })
    const w = usePure.getState().working
    const card = evaluateInput('COMP', 'x + y = 3, 2x - y = 0', COMP)!
    const r = reconcile(card, w)
    expect(r.result.main).toContain('x = 1')
    expect(r.result.main).toContain('y = 2')
  })
})

describe('Fix 2: a zero term written with a letter reads as 0', () => {
  it('x^2 + 0x - 4 = 0 gives the answers -2 and 2, checked', () => {
    usePure.getState().runLatex('x^2+0x-4=0', 'auto', { quiet: true })
    const w = usePure.getState().working
    expect(w?.error).toBeUndefined()
    expect(w?.answers.map((a) => a.tex)).toEqual(['-2', '2'])
    expect(w?.checked).toBe('ok')
  })

  it('x^2 + 0x - 4 = 0 puts -2 and 2 on the card', () => {
    usePure.getState().runLatex('x^2+0x-4=0', 'auto', { quiet: true })
    const w = usePure.getState().working
    const card = evaluateInput('COMP', 'x^2+0x-4=0', COMP)!
    const r = reconcile(card, w)
    expect(r.result.main).toContain('x = -2')
    expect(r.result.main).toContain('x = 2')
  })

  it('0x + 3 = 3 says every value of x works, as x - x + 3 = 3 does', () => {
    usePure.getState().runLatex('0x+3=3', 'auto', { quiet: true })
    const w = usePure.getState().working
    expect(w).not.toBeNull()
    expect(w?.error).toMatch(/every value of x works/)

    usePure.getState().runLatex('x-x+3=3', 'auto', { quiet: true })
    expect(usePure.getState().working?.error).toMatch(/every value of x works/)
  })

  it('0x + 3 = 5 says no value of x works', () => {
    usePure.getState().runLatex('0x+3=5', 'auto', { quiet: true })
    expect(usePure.getState().working?.error).toMatch(/no value of x works/)
  })

  it('a line with no letter at all is still refused for want of one', () => {
    usePure.getState().runLatex('3=3', 'auto', { quiet: true })
    expect(usePure.getState().working?.error).toMatch(/found none/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// Review round 1 (K3 fixer). Each block names the finding it pins. Several fail on the K3 commit and pass after the fix.
// ---------------------------------------------------------------------------------------------------------------------

const cardOf = (text: string) => evaluateInput('COMP', text, COMP)!
const workingNow = () => usePure.getState().working

describe('Review 1: 0x, 0b and 0o are numbers, not 0 times a letter', () => {
  it.each([
    ['0x1F+2', '0x1F+2'],
    ['0x1F+7', '0x1F+7'],
    ['0x10+4', '0x10+4'],
    ['0b11+2', '0b11+2'],
    ['0o7+2', '0o7+2']
  ])('%s: the working never disagrees with the "=" card', (latex, text) => {
    usePure.getState().runLatex(latex, 'auto', { quiet: true })
    const card = cardOf(text)
    const r = reconcile(card, workingNow())
    expect(r.verdict).not.toBe('differ')
    expect(r.result.main).toBe(card.main)
  })

  it('0x1F + 2 keeps the card 33 and the working agrees with it', () => {
    usePure.getState().runLatex('0x1F+2', 'auto', { quiet: true })
    const card = cardOf('0x1F+2')
    expect(card.main).toBe('33')
    const r = reconcile(card, workingNow())
    expect(r.verdict).toBe('agree')
    expect(r.result.main).toBe('33')
  })

  it('the checker reads 0x10 as hex: it is 16, not 0 times x', () => {
    expect(defaultCheckAdapter.checkExprEq('0x10', '16')).toBe('valid')
    expect(defaultCheckAdapter.checkExprEq('0x10', '0x11')).not.toBe('valid')
    expect(defaultCheckAdapter.checkExprEq('0x1F+2', '2')).not.toBe('valid')
  })

  it('x + 0x1F reads x + 31 on the card, not a bare x', () => {
    usePure.getState().runLatex('x+0x1F', 'auto', { quiet: true })
    const r = reconcile(cardOf('x+0x1F'), workingNow())
    expect(r.result.main).not.toBe('x')
    expect(r.verdict).not.toBe('differ')
  })

  it('0x10 + x = 5 reads 0x10 as 16 and agrees with "=" on x = -11', () => {
    usePure.getState().runLatex('0x10+x=5', 'auto', { quiet: true })
    const w = workingNow()
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex)).toEqual(['-11'])
    expect(reconcile(cardOf('0x10+x=5'), w).verdict).toBe('agree')
  })

  it('a zero in front of a longer number is not touched: 10x + 1 = 21 gives 2', () => {
    usePure.getState().runLatex('10x+1=21', 'auto', { quiet: true })
    expect(workingNow()?.answers.map((a) => a.tex)).toEqual(['2'])
  })

  it('3e2x = 600 is still x = 2 (an exponent is not a zero times e)', () => {
    usePure.getState().runLatex('3e2x=600', 'auto', { quiet: true })
    expect(workingNow()?.answers.map((a) => a.tex)).toEqual(['2'])
  })

  it('0e2x = 1 says no value of x works', () => {
    usePure.getState().runLatex('0e2x=1', 'auto', { quiet: true })
    expect(workingNow()?.error).toMatch(/no value of x works/)
  })

  it('0e+3 = 3 keeps the old "found none" refusal', () => {
    usePure.getState().runLatex('0e+3=3', 'auto', { quiet: true })
    expect(workingNow()?.error).toMatch(/found none/)
  })

  it('Factorise reads x^2 + 0x - 4 as (x - 2)(x + 2)', () => {
    usePure.getState().runLatex('x^2+0x-4', 'factor', { quiet: true })
    expect(workingNow()?.answers.map((a) => a.tex)).toEqual(['(x - 2)(x + 2)'])
  })

  it('Expand reads (x + 1)(0x + 2) as 2x + 2', () => {
    usePure.getState().runLatex('(x+1)(0x+2)', 'expand', { quiet: true })
    const w = workingNow()
    expect(w?.error).toBeUndefined()
    expect(w?.answers.map((a) => a.tex)).toEqual(['2x + 2'])
  })
})

describe('Review 2: a letter in a divisor is refused, never cancelled into an answer', () => {
  it.each([
    ['\\frac{x^2}{x}=0', 'x^2/x=0'],
    ['\\frac{x^2+2x}{x}=2', '(x^2+2x)/x=2'],
    ['\\frac{x^2-4x}{x}=-4', '(x^2-4x)/x=-4'],
    ['\\frac{x^3}{x}=0', 'x^3/x=0']
  ])('%s is refused or excluded, and the card does not say x = 0', (latex, text) => {
    usePure.getState().runLatex(latex, 'auto', { quiet: true })
    const w = workingNow()
    const saysNoSolution = (w?.answers ?? []).some((a) => a.tex.includes('no value of')) || /letters on the bottom/.test(w?.error ?? '')
    expect(saysNoSolution).toBe(true)
    expect(reconcile(cardOf(text), w).result.main).not.toBe('x = 0')
  })

  it('the checker does not read x^2/x as x', () => {
    expect(defaultCheckAdapter.checkExprEq('x^2/x', 'x')).not.toBe('valid')
  })
})

describe('Review 3: a letter that only cancels does not claim every value works', () => {
  it.each([['\\frac{x}{x}=1'], ['\\frac{2x}{x}=2'], ['\\frac{6x}{3x}=2'], ['\\frac{x}{2x}=\\frac{1}{2}'], ['\\frac{x}{x}-1=0']])(
    '%s is refused for dividing by a letter',
    (latex) => {
      usePure.getState().runLatex(latex, 'auto', { quiet: true })
      const err = workingNow()?.error ?? ''
      expect(err).toMatch(/letters on the bottom/)
      expect(err).not.toMatch(/every value/)
    }
  )

  it('x^0 = 1 does not say every value of x works (0 to the power 0 has no value)', () => {
    usePure.getState().runLatex('x^0=1', 'auto', { quiet: true })
    const err = workingNow()?.error ?? ''
    expect(err).toMatch(/found none/)
    expect(err).not.toMatch(/every value/)
  })
})

describe('Review 4: a lone answer is labelled only when it is a solved value', () => {
  it('a^2 - 9 keeps its factors bare on the card (no "a =")', () => {
    usePure.getState().runLatex('a^2-9', 'auto', { quiet: true })
    expect(reconcile(cardOf('a^2-9'), workingNow()).result.main).toBe('(a - 3)(a + 3)')
  })

  it('(t + 1)(t + 2) expanded keeps its answer bare on the card', () => {
    usePure.getState().runLatex('(t+1)(t+2)', 'expand', { quiet: true })
    expect(reconcile(cardOf('(t+1)(t+2)'), workingNow()).result.main).toBe('t² + 3t + 2')
  })

  it('x + 3 = x + 5 says no value of x works, with no "x =" in front', () => {
    usePure.getState().runLatex('x+3=x+5', 'auto', { quiet: true })
    expect(reconcile(cardOf('x+3=x+5'), workingNow()).result.main).toBe('no value of x works')
  })

  it('y^2 + y + 1 = 0 shows exact complex roots on the card', () => {
    usePure.getState().runLatex('y^2+y+1=0', 'auto', { quiet: true })
    expect(reconcile(cardOf('y^2+y+1=0'), workingNow()).result.main).toContain('i')
  })

  it('2t + 4 = 10 still reads t = 3', () => {
    usePure.getState().runLatex('2t+4=10', 'auto', { quiet: true })
    expect(reconcile(cardOf('2t+4=10'), workingNow()).result.main).toBe('t = 3')
  })
})

describe('Review 5: a Greek unknown keeps its name on the card, and a guess is checked against it', () => {
  it('2θ + 1 = 5 reads θ = 2 on the card, not "= 2"', () => {
    usePure.getState().runLatex('2\\theta+1=5', 'auto', { quiet: true })
    expect(reconcile(cardOf('2theta+1=5'), workingNow()).result.main).toBe('θ = 2')
  })

  it('a guess of 2 is right for 2θ + 1 = 5 in Guess first mode', () => {
    usePure.getState().runLatex('2\\theta+1=5', 'auto', { quiet: true })
    const r = reconcile(cardOf('2theta+1=5'), workingNow())
    expect(checkCalculatorGuess('2', r.result).verdict).toBe('right')
  })
})

describe('Review 6: an identity or a no-value working is not contradicted by one root', () => {
  it.each([['x-x+3=3'], ['2x-2x+7=7'], ['0.0x+1=1'], ['(x-x)=0'], ['0(x+1)=0'], ['x-x=0']])('%s says every value of x works, not x = 0', (text) => {
    usePure.getState().runLatex(text, 'auto', { quiet: true })
    const r = reconcile(cardOf(text), workingNow())
    expect(r.verdict).toBe('differ')
    expect(r.result.main).toMatch(/every value of x works/)
  })

  it('3x + 4 = 3x + 4 shows "every real number", and a guess of 0 is not right', () => {
    usePure.getState().runLatex('3x+4=3x+4', 'auto', { quiet: true })
    const r = reconcile(cardOf('3x+4=3x+4'), workingNow())
    expect(r.result.main).toBe('every real number')
    expect(checkCalculatorGuess('0', r.result).verdict).not.toBe('right')
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// Round 2 (K3 fixer). Each block names the finding it pins. Each one fails on 129f6ab9 and passes after the fix.
// ---------------------------------------------------------------------------------------------------------------------

describe('Round 2 (high): a 0 in front of a subscript is 0 times that letter, never a hex number', () => {
  it('the converter writes 0x_1 as 0*x1, and leaves a plain 0x1F hexadecimal and 10x_1 a number of ten', () => {
    expect(latexToMath('0x_1+2')).toBe('0*x1+2')
    expect(latexToMath('0x_{12}+3')).toBe('0*x12+3')
    expect(latexToMath('0b_2')).toBe('0*b2')
    expect(latexToMath('0o_7')).toBe('0*o7')
    expect(latexToMath('0x1F+2')).toBe('0x1F+2')
    expect(latexToMath('10x_1')).toBe('10x1')
  })

  it('x^2+0x_1-4=0 gives -2 and 2, checked, and the "=" card agrees (it was sqrt(3) and -sqrt(3))', () => {
    usePure.getState().runLatex('x^2+0x_1-4=0', 'auto', { quiet: true })
    const w = workingNow()
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex).sort()).toEqual(['-2', '2'])
    const r = reconcile(cardOf('x^2+0x_1-4=0'), w)
    expect(r.verdict).not.toBe('differ')
    expect(r.result.main).toContain('= 2')
    expect(r.result.main).toContain('= -2')
    expect(r.result.main).not.toMatch(/1\.73/)
  })

  it('2x_1+0x_2=4 gives x_1 = 2 with x_2 free, checked, and the card reads 2 (it was a bare 1)', () => {
    usePure.getState().runLatex('2x_1+0x_2=4', 'auto', { quiet: true })
    const w = workingNow()
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex)).toEqual(['2'])
    expect(reconcile(cardOf('2x_1+0x_2=4'), w).result.main).toBe('x₁ = 2')
  })

  it.each([
    ['x_1+0x_2=3', ['3']],
    ['x_1+0x_{12}=3', ['3']],
    ['x^2+0x_2-4=0', ['2', '-2']]
  ])('%s gives %j (0x_2 and 0x_{12} are 0 times the letter, not hex)', (latex, answers) => {
    usePure.getState().runLatex(latex, 'auto', { quiet: true })
    const w = workingNow()
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex).sort()).toEqual([...answers].sort())
  })

  it('0x_1+1=2 is refused as "no value of x1 works", and the card never says true', () => {
    usePure.getState().runLatex('0x_1+1=2', 'auto', { quiet: true })
    expect(workingNow()?.error).toMatch(/no value of x1 works/)
    const r = reconcile(cardOf('0x_1+1=2'), workingNow())
    expect(r.result.main).not.toBe('true')
    expect(r.verdict).not.toBe('agree')
  })

  it('a plain 0x1 with no subscript is still the hexadecimal number 1, as it was typed', () => {
    expect(latexToMath('0x1+2')).toBe('0x1+2')
    expect(defaultCheckAdapter.checkExprEq('0x1', '1')).toBe('valid')
  })

  it('the checker reads 0x_1 as 0 times x_1, not as the hex number 1', () => {
    expect(defaultCheckAdapter.checkExprEq('0x_1', '1')).not.toBe('valid')
    expect(defaultCheckAdapter.checkExprEq('0x_1', '0')).toBe('valid')
  })
})

describe('Round 2 (medium): a single answer keeps its label when the unknown is a Greek letter or a subscript', () => {
  it.each([
    ['2\\omega+1=7', 'ω = 3'],
    ['2\\alpha+1=7', 'α = 3'],
    ['2\\Delta+1=7', 'Δ = 3'],
    ['3\\tau=12', 'τ = 4'],
    ['2\\phi+2=3', 'φ = 1/2'],
    ['2v_1+1=5', 'v₁ = 2']
  ])('%s reads "%s" on the card, not a bare value', (latex, shown) => {
    usePure.getState().runLatex(latex, 'auto', { quiet: true })
    const w = workingNow()
    expect(w?.checked).toBe('ok')
    expect(w?.answers).toHaveLength(1)
    expect(reconcile(cardOf(latex), w).result.main).toBe(shown)
  })

  it('\\alpha^2=9 labels both roots: "α = -3, α = 3"', () => {
    usePure.getState().runLatex('\\alpha^2=9', 'auto', { quiet: true })
    expect(reconcile(cardOf('\\alpha^2=9'), workingNow()).result.main).toBe('α = -3, α = 3')
  })

  it.each([
    ['ω', 'ω'],
    ['Δ =', 'Δ ='],
    ['v1 =', 'v₁ ='],
    ['x_1 =', 'x₁ ='],
    ['theta_2', 'θ₂']
  ])('the card writes the label %s as %s in plain text', (label, plain) => {
    expect(cardLabelText(label)).toBe(plain)
  })

  it.each([
    ['ω', 'ω'],
    ['v1 =', 'v_{1} ='],
    ['Δ =', 'Δ ='],
    ['x_1 =', 'x_{1} ='],
    ['theta =', '\\theta =']
  ])('the card draws the label %s as %s', (label, tex) => {
    expect(cardLabelTex(label)).toBe(tex)
  })

  it('a word stays a word on the card: 12 =, HCF =, Answer and speed1 = give no symbol', () => {
    expect(['12 =', 'HCF =', 'Answer', 'speed1 ='].map(cardLabelTex)).toEqual([null, null, null, null])
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// K3 review round 2 (guards). The exact lines the checkers named, each pinned against the answer it used to give.
// ---------------------------------------------------------------------------------------------------------------------

describe('K3 review: the exact lines the checkers named', () => {
  const bareCases: Array<[string, 'factor' | 'expand', string]> = [
    ['t^2-9', 'factor', '(t - 3)(t + 3)'],
    ['(t+1)^2', 'expand', 't² + 2t + 1'],
    ['2(t+3)', 'expand', '2t + 6'],
    ['x^2+0x-4', 'factor', '(x - 2)(x + 2)'],
    ['(x+1)(0x+2)', 'expand', '2x + 2']
  ]
  it.each(bareCases)('%s (%s) keeps its answer bare on the card, with no "t =" or "x =" in front', (latex, job, shown) => {
    usePure.getState().runLatex(latex, job, { quiet: true })
    const w = workingNow()
    expect(w?.checked).toBe('ok')
    expect(reconcile(cardOf(latex), w).result.main).toBe(shown)
  })

  it('0xFF + x = 0 is never answered x = 0, since 0xFF is 255 and the line is not checked at 0', () => {
    usePure.getState().runLatex('0xFF+x=0', 'auto', { quiet: true })
    const w = workingNow()
    expect((w?.answers ?? []).map((a) => a.tex)).not.toContain('0')
    expect(reconcile(cardOf('0xFF+x=0'), w).result.main).not.toBe('x = 0')
  })

  it('\\frac{x^2}{x}=3x is refused or excluded, not answered x = 0 (x² over x is undefined at 0)', () => {
    usePure.getState().runLatex('\\frac{x^2}{x}=3x', 'auto', { quiet: true })
    const w = workingNow()
    const saysNoSolution = (w?.answers ?? []).some((a) => a.tex.includes('no value of')) || /letters on the bottom/.test(w?.error ?? '')
    expect(saysNoSolution).toBe(true)
    expect(reconcile(cardOf('x^2/x=3x'), w).result.main).not.toBe('x = 0')
  })

  it('x^2 + 1 = x^2 + 2 says no value of x works, and the card is marked unconfirmed (it was -5.4×10¹³)', () => {
    usePure.getState().runLatex('x^2+1=x^2+2', 'auto', { quiet: true })
    const r = reconcile(cardOf('x^2+1=x^2+2'), workingNow())
    expect(r.result.main).toBe('no value of x works')
    expect(r.verdict).toBe('differ')
    expect(r.result.unconfirmed).toBe(true)
  })

  it('0x_1 + x_1 = 3 gives x₁ = 3 (the 0 is 0 times x₁, not the hex number 1)', () => {
    usePure.getState().runLatex('0x_1+x_1=3', 'auto', { quiet: true })
    const w = workingNow()
    expect(w?.checked).toBe('ok')
    expect(w?.answers.map((a) => a.tex)).toEqual(['3'])
    expect(reconcile(cardOf('0x_1+x_1=3'), w).result.main).toBe('x₁ = 3')
  })
})
