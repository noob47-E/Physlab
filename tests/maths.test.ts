// The Maths screen's decisions: from the field's LaTeX to what is shown, without a DOM.
//
// evaluateInput is the join between MathLive's LaTeX, the converter and the engine, and the
// sentence a student reads when any of them refuses. It never throws and never says "ERROR".

import { beforeEach, describe, expect, it } from 'vitest'
import { evaluateInput, isHeavy, lettersIn, linearOf } from '../src/renderer/src/calc/evaluateInput'
import { errorSentence, nonFiniteSentence } from '../src/renderer/src/calc/errors'
import { evaluateComp, solveNumeric } from '../src/renderer/src/calc/engine'
import { calcNum } from '../src/renderer/src/calc/format'
import { FIELD_MODES, MODE_LABELS, isFieldMode, useCalc } from '../src/renderer/src/calc/calcStore'
import { readSource } from './helpers/repo'
import { resetGlobals } from './helpers/globals'

beforeEach(resetGlobals)

const opts = { vars: { A: 0, x: 0 }, ans: 0, angle: 'deg' as const }

describe('from the field to the answer', () => {
  it('reads textbook maths and finds the exact form', () => {
    const r = evaluateInput('COMP', '\\frac{1}{2}+\\sqrt{9}', opts)!
    expect(r.error).toBeUndefined()
    expect(r.main).toBe('3.5')
    expect(r.exact).toBe('\\frac{7}{2}')
    expect(r.value).toBe(3.5)
    expect(r.src).toBe('((1)/(2))+sqrt(9)')
    expect(r.askExact).toBe(false)
  })

  it('shows a surd and a multiple of π exactly, and asks the algebra engine only when it has to', () => {
    expect(evaluateInput('COMP', '\\sqrt{2}', opts)!.exact).toBe('\\sqrt{2}')
    expect(evaluateInput('COMP', '\\frac{\\pi}{3}', opts)!.exact).toBe('\\frac{\\pi}{3}')
    // Nothing offline recognises √2 + 1/3, so SymPy is worth asking.
    expect(evaluateInput('COMP', '\\sqrt{2}+\\frac{1}{3}', opts)!.askExact).toBe(true)
    // A whole number needs no exact form and no question.
    const seven = evaluateInput('COMP', '3+4', opts)!
    expect(seven.exact).toBeNull()
    expect(seven.askExact).toBe(false)
  })

  it('is empty for an empty field, not an error', () => {
    expect(evaluateInput('COMP', '', opts)).toBeNull()
    expect(evaluateInput('COMP', '\\placeholder{}', opts)).toBeNull()
    expect(evaluateInput('BASE-N', '   ', { ...opts, base: 16 })).toBeNull()
  })

  it('answers with a sentence when it cannot read the line, never with ERROR', () => {
    for (const bad of ['2+', '(1+2', '\\sqrt{}+', '\\sin(', '2 \\pm 3']) {
      const r = evaluateInput('COMP', bad, opts)!
      expect(r.error, bad).toBeDefined()
      expect(r.error!.sentence, bad).toMatch(/^[A-Z]/)
      expect(r.error!.sentence, bad).not.toMatch(/ERROR|Error/)
      expect(r.main).toBe('')
    }
    expect(evaluateInput('COMP', '2+', opts)!.error!.sentence).toMatch(/check the brackets/)
    expect(evaluateInput('COMP', '2 \\pm 3', opts)!.error!.sentence).toMatch(/Choose \+ or −/)
  })

  it('says what an unknown letter is, and offers the way to give it a value', () => {
    const r = evaluateInput('COMP', '2k+1', opts)!
    expect(r.error!.sentence).toMatch(/don't know what k is/)
    expect(r.error!.sentence).toMatch(/Variables/)
  })

  it('says so when a value divides by zero or has no value', () => {
    expect(evaluateInput('COMP', '\\frac{1}{0}', opts)!.error!.sentence).toMatch(/divides by zero/)
    expect(evaluateInput('COMP', '\\frac{0}{0}', opts)!.error!.sentence).toMatch(/no value/)
    expect(nonFiniteSentence(NaN).sentence).toMatch(/no value/)
    expect(nonFiniteSentence(-Infinity).sentence).toMatch(/divides by zero/)
  })

  it('solves an equation, marks it so x is remembered, and never offers an exact form for it', () => {
    const r = evaluateInput('COMP', 'x^{2}=2', { ...opts, vars: { x: 1 } })!
    expect(r.error).toBeUndefined()
    expect(r.solved).toBe(true)
    expect(Number(r.value)).toBeCloseTo(Math.SQRT2)
    expect(r.exact).toBeNull()
    expect(r.main).toMatch(/^x = /)
  })

  it('says it cannot find a root in a sentence', () => {
    const r = evaluateInput('COMP', 'x^{2}=-1', opts)!
    expect(r.error!.sentence).toMatch(/^No solution I can find/)
    // The engine still throws its own words; the sentence is made from them.
    expect(() => solveNumeric((x) => x * x + 1)).toThrow('No solution found')
  })

  it('does complex numbers with plain words for the extras', () => {
    const r = evaluateInput('CMPLX', '(3+4i)(1-2i)', { ...opts, angle: 'deg' })!
    expect(r.error).toBeUndefined()
    expect(r.main).toBe('11 − 2i')
    expect(r.extra![0]).toMatch(/^size [\d.]+, angle −?[\d.]+°$/)
    expect(r.extra![1]).toBe('conjugate 11 + 2i')
  })

  it('does bases with the other three bases beside the answer', () => {
    const r = evaluateInput('BASE-N', 'FF + 1', { ...opts, base: 16 })!
    expect(r.main).toBe('100')
    expect(r.extra).toEqual(['decimal 256', 'hex 100', 'binary 000100000000', 'octal 400'])
    const bad = evaluateInput('BASE-N', '12', { ...opts, base: 2 })!
    expect(bad.error!.sentence).not.toMatch(/ERROR/)
    expect(evaluateInput('BASE-N', '5/0', { ...opts, base: 10 })!.error!.sentence).toMatch(/divides by zero/)
  })

  it('writes engineering notation on request, with the same digits', () => {
    expect(evaluateInput('COMP', '12345', { ...opts, eng: true })!.main).toBe('12.345×10^3')
  })

  it('converts LaTeX for the maths modes and passes the Bases text through', () => {
    expect(linearOf('COMP', '\\frac{1}{2}')).toBe('((1)/(2))')
    expect(linearOf('BASE-N', 'FF and 0F')).toBe('FF and 0F')
  })
})

describe('the sentences', () => {
  it('turn every engine message into words a student can act on', () => {
    expect(errorSentence(new Error('Syntax ERROR')).sentence).toMatch(/can't read that/)
    expect(errorSentence(new Error('Math ERROR')).sentence).toMatch(/divides by zero/)
    expect(errorSentence(new Error('Unexpected end of expression (char 3)')).sentence).toMatch(/can't read that/)
    expect(errorSentence(new Error('Parenthesis ) expected (char 4)')).sentence).toMatch(/brackets/)
    expect(errorSentence(new Error('Undefined symbol q')).sentence).toMatch(/what q is/)
    expect(errorSentence(new Error('Undefined function foo')).sentence).toMatch(/no function called foo/)
    expect(errorSentence(new Error('No solution found')).sentence).toMatch(/No solution/)
    expect(errorSentence('something odd').sentence).toBe("I can't work that out.")
    // The engine's words stay available underneath, for a student who wants them — except the
    // Bases engine's own handheld-style messages, which would put "Syntax ERROR" on screen.
    expect(errorSentence(new Error('Undefined symbol q')).detail).toBe('Undefined symbol q')
    expect(errorSentence(new Error('Syntax ERROR')).detail).toBeUndefined()
    expect(errorSentence(new Error('Math ERROR')).detail).toBeUndefined()
  })

  it('never contain the handheld’s words', () => {
    for (const msg of ['Syntax ERROR', 'Math ERROR', 'x', 'Undefined symbol y', 'Unexpected type of argument', 'No solution found', '']) {
      expect(errorSentence(new Error(msg)).sentence).not.toMatch(/ERROR/)
    }
  })

  it('write a number with no value in words too', () => {
    expect(calcNum(NaN)).toBe('no value')
  })
})

describe('what runs after the key press paints', () => {
  it('defers the slow lines and runs arithmetic at once', () => {
    expect(isHeavy('\\int_{0}^{1}x^{2}dx')).toBe(true)
    expect(isHeavy('\\sum_{x=1}^{100}x')).toBe(true)
    expect(isHeavy('x^{2}=2')).toBe(true)
    expect(isHeavy('\\frac{1}{2}+\\sqrt{9}')).toBe(false)
  })

  it('caps the root search so an equation with no root answers quickly', () => {
    const start = performance.now()
    expect(() => evaluateComp('x^2 + 1 = 0', { vars: {}, ans: 0, angle: 'rad' })).toThrow(/No solution/)
    expect(performance.now() - start).toBeLessThan(400)
    // …and still finds a root that Newton alone would miss, far from the guess.
    expect(solveNumeric((x) => (x - 5000) * (x - 5000) - 1, 0)).toBeCloseTo(4999, 6)
  })
})

describe('the "with values…" key', () => {
  it('asks only about the calculator’s own letters', () => {
    expect(lettersIn('2*A + B*x')).toEqual(['A', 'B', 'x'])
    expect(lettersIn('e^2 + pi')).toEqual([])
    expect(lettersIn('sin(x)')).toEqual(['x'])
  })
})

describe('the store, without the handheld', () => {
  it('has no SHIFT, ALPHA or STO state left', () => {
    const s = useCalc.getState() as unknown as Record<string, unknown>
    for (const k of ['shift', 'alpha', 'sto']) expect(k in s, k).toBe(false)
  })

  it('keeps the internal mode ids and gives each a word', () => {
    expect(FIELD_MODES).toEqual(['COMP', 'CMPLX', 'BASE-N'])
    expect(isFieldMode('COMP')).toBe(true)
    expect(isFieldMode('MATRIX')).toBe(false)
    expect(Object.keys(MODE_LABELS)).toHaveLength(15)
  })

  it('leaves MathLive out of the start-up bundle', () => {
    // The Vector Calculator was the one eager import of a MathLive field; every other maths
    // field is in a lazily loaded panel.
    const app = readSource('src/renderer/src/app/App.tsx')
    expect(app).not.toMatch(/^import \{ VectorCalc \}/m)
    expect(app).toMatch(/const VectorCalc = lazy\(/)
    expect(app).toMatch(/const Maths = lazy\(/)
    expect(app).not.toMatch(/panels\/Calculator|panels\/Working'/)
  })

  it('does not start the algebra engine twice', () => {
    // app/layout.ts warms SymPy once when the calculator opens; the old panel did it again on
    // every mount, unguarded.
    expect(readSource('src/renderer/src/panels/Maths.tsx')).not.toMatch(/warmupCas/)
    expect(readSource('src/renderer/src/app/layout.ts')).toMatch(/if \(id === 'calculator' && !casWarmed\)/)
  })
})
