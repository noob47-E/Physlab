// The Maths screen's decisions: from the field's LaTeX to what is shown, without a DOM.
//
// evaluateInput is the join between MathLive's LaTeX, the converter and the engine, and the
// sentence a student reads when any of them refuses. It never throws and never says "ERROR".

import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { answerStillFor, answerStillUnder, evaluateInput, isHeavy, lettersIn, linearOf, mainLine, readValueBoxes, shownText, tangentAt, varsAfter, type Answered } from '../src/renderer/src/calc/evaluateInput'
import { errorSentence, nonFiniteSentence, outsideBaseSentence } from '../src/renderer/src/calc/errors'
import { evaluateComp, formatValue, solveNumeric, tidyComplex, type Base } from '../src/renderer/src/calc/engine'
import { getAngleMode, math, setAngleMode } from '../src/renderer/src/math/expr'
import { calcEng, calcNum, formatComplex, setCalcPrecisionSource } from '../src/renderer/src/calc/format'
import { FIELD_MODES, MODE_LABELS, fieldAfterWorking, isFieldMode, useCalc, type FieldMode } from '../src/renderer/src/calc/calcStore'
import { polynomialRootRows, quadraticRoots } from '../src/renderer/src/calc/roots'
import { solveRowsTex } from '../src/renderer/src/lang/commands'
import { latexToMath } from '../src/renderer/src/math/latexToMath'
import { runPure } from '../src/renderer/src/math/pure/run'
import { usePure } from '../src/renderer/src/math/pure/store'
import { RENDERER_SRC, readSource } from './helpers/repo'
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

  it('says what an unknown letter is, and which letters can hold a value', () => {
    // The Variables drawer holds A–F, M, x and y and nothing else, so "give k a value under
    // Variables" was a dead end.
    const r = evaluateInput('COMP', '2k+1', opts)!
    expect(r.error!.sentence).toMatch(/don't know what k is/)
    expect(r.error!.sentence).toMatch(/letters A to F, M, x or y/)
    expect(r.error!.sentence).not.toMatch(/Variables/)
    expect(errorSentence(new Error('Undefined symbol B')).sentence).toMatch(/what B is. Give it a value under Variables/)
  })

  it('says a letter was read as a unit, instead of sending the student to the brackets', () => {
    // mathjs knows t as a tonne (and m, s, g…), so 2t + 1 adds a number to a unit and threw
    // "Unexpected type of argument in function addScalar (expected: Unit, actual: number,
    // index: 1)" — which the screen showed, under "check the brackets".
    for (const line of ['2t+1', '3m+2', 's+1']) {
      const r = evaluateInput('COMP', line, opts)!
      expect(r.error!.sentence, line).toMatch(/read as a unit/)
      // It said "Use one of the letters A to F…", the letters that are units after a number too (2A is two amperes): it points to Variables now.
      expect(r.error!.sentence, line).toMatch(/under Variables/)
      expect(r.error!.sentence, line).not.toMatch(/A to F/)
      expect(r.error!.detail, line).toBeUndefined()
    }
  })

  it('answers the Complex field’s other refusals in words', () => {
    // A lower-case re is the electron radius in the constants list, so mathjs said "'re' is
    // not a function; its value is: 2.8179403205e-15" (CODATA 2022; was ...3262e-15 in 2018).
    const re = evaluateInput('CMPLX', '\\operatorname{re}\\left(3+4i\\right)', opts)!
    expect(re.error!.sentence).toBe('There is no function called re. Check the spelling, or pick one from the keypad.')
    expect(re.error!.detail).toBeUndefined()
    // An = in the Complex field reaches mathjs as an assignment; Numbers mode solves it.
    const eq = evaluateInput('CMPLX', 'x^{2}=-4', opts)!
    expect(eq.error!.sentence).toMatch(/^Equations are solved in Numbers mode/)
    expect(eq.error!.detail).toBeUndefined()
    // A complex number where a whole number was wanted: the brackets are fine.
    const ncr = evaluateInput('CMPLX', '\\operatorname{nCr}\\left(2+3i,2\\right)', opts)!
    expect(ncr.error!.sentence).toBe('Those numbers do not fit this function.')
    expect(ncr.error!.detail).toBeUndefined()
  })

  it('says so when a value divides by zero or has no value', () => {
    expect(evaluateInput('COMP', '\\frac{1}{0}', opts)!.error!.sentence).toBe('That divides by zero.')
    expect(evaluateInput('COMP', '5\\div0', opts)!.error!.sentence).toBe('That divides by zero.')
    expect(evaluateInput('COMP', '\\frac{0}{0}', opts)!.error!.sentence).toMatch(/no value/)
    expect(nonFiniteSentence(NaN).sentence).toMatch(/no value/)
    expect(nonFiniteSentence(Infinity, '((1)/(0))').sentence).toMatch(/divides by zero/)
    expect(nonFiniteSentence(Infinity, '1/0.0').sentence).toMatch(/divides by zero/)
    // ln 0 is −∞ and divides by nothing; "divides by zero" sent a student looking for a fraction.
    expect(evaluateInput('COMP', '\\ln\\left(0\\right)', opts)!.error!.sentence).toMatch(/runs off to infinity/)
    expect(nonFiniteSentence(-Infinity).sentence).toMatch(/runs off to infinity/)
    expect(nonFiniteSentence(-Infinity, 'ln(0)').sentence).not.toMatch(/divides/)
    // 1/0.5 divides by a half, not by zero.
    expect(nonFiniteSentence(Infinity, '1/0.5').sentence).not.toMatch(/divides/)
  })

  it('solves an equation with every one of its solutions, stores none of them, and never offers an exact form for it', () => {
    // It used to answer x = 1.414 only (the root nearest the stored x = 1) and write it into x: half the answer, and a
    // letter overwritten without a word (AG-FULLTEST-16 finding 2.2). Both roots now, and the stored letters untouched.
    const r = evaluateInput('COMP', 'x^{2}=2', { ...opts, vars: { x: 1 } })!
    expect(r.error).toBeUndefined()
    expect(r.solved).toBe(true)
    expect(r.roots).toHaveLength(2)
    expect(r.roots![0]).toBeCloseTo(Math.SQRT2)
    expect(r.roots![1]).toBeCloseTo(-Math.SQRT2)
    expect(r.exact).toBeNull()
    expect(r.main).toMatch(/^x₁ = /)
    expect(varsAfter({ x: 1 }, r)).toEqual({ x: 1 })
    // The student's own x = 5 is what stores.
    expect(r.assign).toBeUndefined()
    expect(evaluateInput('COMP', 'x=5', opts)!.assign).toEqual({ name: 'x', value: 5 })
  })

  it('says it cannot find a root in a sentence', () => {
    // sin x = 2 is not a polynomial, so there is no list of roots to name and a root may still be
    // somewhere else: the sentence says where to start looking. x² = −1 used to be pinned here;
    // it is a polynomial with no real root and answers with its complex roots instead (P7, below).
    const r = evaluateInput('COMP', '\\sin\\left(x\\right)=2', opts)!
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

  it('gives arg in the angle unit shown beside the field, in both modes', () => {
    // mathjs's own arg is radians whatever the switch says: in DEG mode arg(1 + i) read 0.79
    // directly under a card that called the same number "angle 45°".
    const arg = '\\operatorname{arg}\\left(1+i\\right)'
    expect(evaluateInput('CMPLX', arg, { ...opts, angle: 'deg' })!.main).toBe('45')
    expect(evaluateInput('CMPLX', arg, { ...opts, angle: 'rad' })!.main).toBe(calcNum(Math.PI / 4))
    expect(evaluateInput('COMP', arg, { ...opts, angle: 'deg' })!.main).toBe('45')
    expect(Number(evaluateComp('arg(-1)', { ...opts, angle: 'deg' }).value)).toBe(180)
    expect(evaluateInput('CMPLX', '\\operatorname{arg}\\left(-2i\\right)', { ...opts, angle: 'deg' })!.main).toBe('−90')
  })

  it('writes 2∠90° as 2i, not with a round-off real part', () => {
    // The polar key's degrees form is 2 × e^{i × 90π/180}; cos(90°) is 6×10⁻¹⁷, and the answer
    // read "1.2×10⁻¹⁶ + 2i" beside an extras line that said "size 2, angle 90°".
    const r = evaluateInput('CMPLX', '2\\times e^{i\\times\\frac{90\\times\\pi}{180}}', { ...opts, angle: 'deg' })!
    expect(r.main).toBe('2i')
    expect(r.extra).toEqual(['size 2, angle 90°', 'conjugate −2i'])
    expect((r.value as { re: number }).re).toBe(0)
    expect(formatValue(math.complex(1.2e-16, 2))).toBe('2i')
    expect(formatValue(math.complex(3, -2e-15))).toBe('3')
    // The floor is relative to the number's own size: a tiny answer on its own is not "0".
    expect(tidyComplex({ re: 1.6e-19, im: 0 })).toEqual({ re: 1.6e-19, im: 0 })
    expect(tidyComplex({ re: 1e-13, im: 1e-13 })).toEqual({ re: 1e-13, im: 1e-13 })
    expect(formatValue(math.complex(1.6e-19, 0))).toBe('1.6×10^-19')
  })

  it('does bases with the other three bases beside the answer', () => {
    const r = evaluateInput('BASE-N', 'FF + 1', { ...opts, base: 16 })!
    expect(r.main).toBe('100')
    expect(r.extra).toEqual(['decimal 256', 'hex 100', 'binary 000100000000', 'octal 400'])
    expect(evaluateInput('BASE-N', '5/0', { ...opts, base: 10 })!.error!.sentence).toMatch(/divides by zero/)
  })

  it('names the digits a base allows when a digit is outside it', () => {
    // The Bases engine calls a 2 in binary a syntax error, and the sentence for that sent the
    // student to check the brackets.
    const bad = evaluateInput('BASE-N', '12', { ...opts, base: 2 })!
    expect(bad.error!.sentence).toBe('Only the digits of this base are allowed here: 0 and 1 in binary. "2" is not one of them.')
    expect(evaluateInput('BASE-N', 'FG', { ...opts, base: 16 })!.error!.sentence).toMatch(/0 to 9 and A to F in hexadecimal. "G"/)
    expect(evaluateInput('BASE-N', '18', { ...opts, base: 8 })!.error!.sentence).toMatch(/0 to 7 in octal. "8"/)
    expect(evaluateInput('BASE-N', '1A', { ...opts, base: 10 })!.error!.sentence).toMatch(/0 to 9 in decimal. "A"/)
    // The bitwise words, operators and brackets are not digits and are not complained about.
    expect(outsideBaseSentence('(1010 and 0110) or not 1', 2)).toBeNull()
    expect(outsideBaseSentence('FF + 1A', 16)).toBeNull()
    expect(evaluateInput('BASE-N', '1010 and 0110', { ...opts, base: 2 })!.main).toBe('0010')
    // Something the engine still refuses keeps the reading sentence, without the handheld's words.
    const stray = evaluateInput('BASE-N', '1 +', { ...opts, base: 2 })!
    expect(stray.error!.sentence).not.toMatch(/ERROR|digits of this base/)
  })

  it('writes engineering notation on request, with the same digits', () => {
    expect(evaluateInput('COMP', '12345', { ...opts, eng: true })!.main).toBe('12.345×10^3')
  })

  it('decides engineering notation when the answer is drawn, so the eng chip acts at once', () => {
    // The screen used to show the text made when = was pressed, so the chip lit up and the
    // number stayed put until the next =.
    const r = evaluateInput('COMP', '12345\\times678', opts)!
    expect(r.main).toBe('8369910')
    expect(mainLine(r, false)).toBe('8369910')
    // Drawn with a real power (G4); calcEng's own text keeps the caret.
    expect(mainLine(r, true)).toBe('8.36991\u00a0×\u00a010⁶')
    // An equation's answer keeps its "x = " and a complex number its two parts.
    const solved = evaluateInput('COMP', 'x^{2}=2', { ...opts, vars: { x: 1 } })!
    expect(mainLine(solved, true)).toBe(solved.main)
    const z = evaluateInput('CMPLX', '3+4i', opts)!
    expect(mainLine(z, true)).toBe('3 + 4i')
    const err = evaluateInput('COMP', '2+', opts)!
    expect(mainLine(err, true)).toBe('')
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
    // The integral's own refusals (H9) are already sentences for the student: they are the headline,
    // not small print under "I can't work that out."
    const area = 'The area cannot be worked out: the expression has no value at some points between the limits.'
    expect(errorSentence(new Error(area)).sentence).toBe(area)
    expect(errorSentence('something odd').sentence).toBe("I can't work that out.")
    // The engine's words stay available underneath, for a student who wants them — except the
    // Bases engine's own handheld-style messages, which would put "Syntax ERROR" on screen.
    expect(errorSentence(new Error('Undefined symbol q')).detail).toBe('Undefined symbol q')
    expect(errorSentence(new Error('Syntax ERROR')).detail).toBeUndefined()
    expect(errorSentence(new Error('Math ERROR')).detail).toBeUndefined()
  })

  it('keep code out of the small print too', () => {
    // Rule 2 applies to the detail line: a message naming a function, a character position or
    // an argument index is mathjs talking to a programmer.
    for (const msg of [
      'Unexpected type of argument in function addScalar (expected: Unit, actual: number, index: 1)',
      "'re' is not a function; its value is:\n  2.8179403205e-15",
      'Invalid left hand side of assignment operator = (char 6)',
      'Unexpected end of expression (char 3)',
      'Undefined function foo'
    ]) {
      const r = errorSentence(new Error(msg))
      expect(r.detail, msg).toBeUndefined()
      expect(r.sentence, msg).not.toMatch(/in function|is not a function|\(char |index:|expected:|its value is/)
    }
    expect(errorSentence(new Error("'re' is not a function; its value is: 2.8e-15")).sentence).toMatch(/no function called re/)
    expect(errorSentence(new Error('No solution found')).detail).toBe('No solution found')
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
    // Counted, not timed: a clock measures the machine, and a cap of 2 000 points would have
    // passed on a fast one. Four sweeps of 1 000 points, each one evaluation more for its left
    // end, plus Newton's 60 steps (a value and a two-sided derivative each, and the checks after).
    let calls = 0
    const f = (x: number): number => {
      calls++
      return x * x + 1
    }
    expect(() => solveNumeric(f, 0)).toThrow(/No solution/)
    expect(calls).toBeLessThanOrEqual(4 * 1001 + 60 * 5 + 2)
    expect(calls).toBeGreaterThan(4 * 1000)
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

  it('follows a working into the field, whichever way the working arrived', () => {
    // The old Working panel copied inputLatex into its own field. With one field for
    // everything, a factorisation from the command bar, a recalled "Worked out" entry or the
    // tour's example showed its steps under a field and an answer that still belonged to the
    // previous line, and Enter then worked on the wrong one.
    expect(fieldAfterWorking({ mode: 'COMP', input: '2+3' }, 'x^{2}-4')).toEqual({ input: 'x^{2}-4' })
    expect(fieldAfterWorking({ mode: 'CMPLX', input: '' }, 'x^{2}-4')).toEqual({ input: 'x^{2}-4' })
    // The Bases field is plain text and the list modes have no field: the Numbers field shows it.
    expect(fieldAfterWorking({ mode: 'BASE-N', input: 'FF' }, 'x^{2}-4')).toEqual({ input: 'x^{2}-4', mode: 'COMP' })
    expect(fieldAfterWorking({ mode: 'MATRIX', input: '' }, 'x^{2}-4')).toEqual({ input: 'x^{2}-4', mode: 'COMP' })
    // A run from the field itself, or a working with no LaTeX of its own, changes nothing.
    expect(fieldAfterWorking({ mode: 'COMP', input: 'x^{2}-4' }, 'x^{2}-4')).toBeNull()
    expect(fieldAfterWorking({ mode: 'BASE-N', input: 'FF' }, '')).toBeNull()

    // The join is live: the pure store runs, the calculator's field follows.
    useCalc.setState({ mode: 'BASE-N', input: 'FF + 1' })
    usePure.getState().run('factor', 'x^2-5x+6', 'x^{2}-5x+6')
    expect(useCalc.getState().input).toBe('x^{2}-5x+6')
    expect(useCalc.getState().mode).toBe('COMP')
    // Recalling an entry restores the field as it was, as math/pure/store.ts promises.
    useCalc.setState({ input: '2+3' })
    const entry = usePure.getState().history.find((h) => h.input === 'x^2-5x+6')!
    usePure.getState().recall(entry.id)
    expect(useCalc.getState().input).toBe('x^{2}-5x+6')
    useCalc.setState({ mode: 'COMP', input: '' })
  })

  it('loads the maths panels lazily, and no eager path from App.tsx reaches a MathLive field', () => {
    const app = readSource('src/renderer/src/app/App.tsx')
    expect(app).not.toMatch(/^import \{ VectorCalc \}/m)
    expect(app).toMatch(/const VectorCalc = lazy\(/)
    expect(app).toMatch(/const Maths = lazy\(/)
    expect(app).not.toMatch(/panels\/Calculator|panels\/Working'/)
    // Walking the eager import graph is what proves it: the lazy() lines above were true while
    // app/contextActions.ts still imported the Vector Calculator panel — and with it
    // ui/MathInput and 1.4 MB of MathLive — for one right-click menu item.
    const eager = eagerlyReachable('app/App.tsx')
    expect(eager.has('panels/Maths.tsx')).toBe(false)
    expect(eager.has('panels/WorkingView.tsx')).toBe(false)
    const withField = [...eager].filter((f) => /from '(\.\.?\/)*(\.\.\/)?ui\/MathInput'|from 'mathlive'/.test(readSource(join('src/renderer/src', f)))).sort()
    // The last path was app/contextActions.ts → panels/VectorCalc.tsx → ui/MathInput.tsx, for
    // the one menu item that adds a card. The store it wants, addVectorFromScene, lives in
    // panels/vectorCalcStore.ts with no field in it, and the menu imports that.
    expect(withField).toEqual([])
    expect(eager.has('panels/VectorCalc.tsx')).toBe(false)
    expect(eager.has('panels/vectorCalcStore.ts')).toBe(true)
    // The panel is imported statically by nothing outside panels/: only App.tsx's lazy() may
    // name it, or the lazy() is a no-op for the bundle again.
    for (const f of rendererFiles()) {
      if (f.startsWith('panels/')) continue
      const src = readSource(join('src/renderer/src', f))
      const importsPanel = /^import[^\n]*from '(\.\.?\/)+panels\/VectorCalc'/m.test(src)
      expect(importsPanel, `${f} imports panels/VectorCalc statically`).toBe(false)
    }
  }, 20000)

  it('keeps an answer only while the field still holds the line it answers', () => {
    // A calculation recalled from History wrote the store and set the field silently, and the
    // answer was dropped only by a keystroke: 7×8 sat over the answer to 2+3 until Enter.
    const a = { input: '7\\times8', result: 56 }
    expect(answerStillFor(a, '7\\times8')).toBe(a)
    expect(answerStillFor(a, '2+3')).toBeNull()
    expect(answerStillFor(null, '2+3')).toBeNull()
    // The screen follows the store for it, so every write — a recall, the tour's example, a
    // mode crossing that clears the field — drops the answer, and the keystroke path writes
    // the store and nothing else.
    const maths = readSource('src/renderer/src/panels/Maths.tsx')
    expect(maths).toMatch(/useCalc\.subscribe\(\(s, prev\) => \{\s*if \(s\.input !== prev\.input\) setAnswered\(\(a\) => answerStillFor\(a, s\.input\)\)/)
    expect(maths).toMatch(/const onEdit = useCallback\(\(latex: string\) => useCalc\.setState\(\{ input: latex \}\), \[\]\)/)
    // The exact form that SymPy sends later amends the answer it was asked for, and only while
    // that answer is still held; it never replaces or clears the answer of another mode.
    expect(maths).toMatch(/setAnswered\(\(a\) => \(a && a\.mode === mode && a\.input === s\.input && a\.result\.value === r\.value \? \{ \.\.\.a, result: \{ \.\.\.a\.result, exact: res\.latex \} \} : a\)\)/)
    expect(maths).not.toMatch(/setResult\(\(prev\)/)
  })

  it('keeps the answer card when Work it out is pressed on the very line it answers', () => {
    // = then Work it out on 2/3 + √2: the working arrives for the same line, and the ≈ 2.08 card
    // with its exact form used to vanish, leaving only the working's refusal. A working for any
    // other line — the tour's example, a recalled entry — still takes the card with it.
    const maths = readSource('src/renderer/src/panels/Maths.tsx')
    expect(maths).toMatch(/usePure\.subscribe\(\(s, prev\) => \{\s*if \(s\.runSeq === prev\.runSeq\) return\s*setAnswered\(\(a\) => answerStillFor\(a, s\.inputLatex\)\)/)
    // The keypad hangs over exactly where the steps appear, so a working asked for from elsewhere closes it; the working a press of =
    // asks for itself does not (its steps are folded, and the keypad is what the student is using).
    expect(maths).toMatch(/if \(ownRun\.current\) return[\s\S]{0,200}setPanes\(\(p\) => \(p\.keypad \? \{ \.\.\.p, keypad: false \} : p\)\)/)
    // The line the field holds is the line the working is for, character for character, so the
    // comparison the subscriber makes is the one answerStillFor already makes for a keystroke.
    const latex = '\\frac{2}{3}+\\sqrt{2}'
    useCalc.setState({ mode: 'COMP', input: latex })
    const answered = { mode: 'COMP', input: useCalc.getState().input, result: 2 }
    usePure.getState().runLatex(latex, 'auto')
    expect(usePure.getState().inputLatex).toBe(latex)
    expect(useCalc.getState().input).toBe(latex)
    expect(answerStillFor(answered, usePure.getState().inputLatex)).toBe(answered)
    usePure.getState().run('primes', '360', '360')
    expect(answerStillFor(answered, usePure.getState().inputLatex)).toBeNull()
    useCalc.setState({ mode: 'COMP', input: '' })
  })

  it('keeps the keypad off the answer and open across a click in the field', () => {
    // The keypad hung under the field alone, exactly over the answer card, so = on the keypad
    // showed nothing until the keypad was closed; and a click in the field to move the caret
    // counted as "outside" and closed it.
    const maths = readSource('src/renderer/src/panels/Maths.tsx')
    expect(maths).toMatch(/<div className="maths-head" ref=\{headBox\} data-keypad-keep>/)
    expect(maths).toMatch(/<KeypadPopover [^>]*anchorRef=\{headBox\}/)
    expect(maths).toMatch(/closest\?\.\('\[data-keypad-toggle\],\[data-keypad-keep\]'\)/)
    // The head holds the field, the toolbar, the answer and the drawers, and the working is
    // outside it, so the keypad covers at most the steps.
    const head = maths.slice(maths.indexOf('className="maths-head"'), maths.indexOf('<WorkingArea'))
    for (const part of ['<Expression ', '<Answer ', '<VariablesDrawer ', '<HistoryDrawer ', 'Visualize']) expect(head).toContain(part)
    // It follows the panel's scroll and the head's growth.
    expect(maths).toMatch(/document\.addEventListener\('scroll', place, true\)/)
    expect(maths).toMatch(/new ResizeObserver\(place\)/)
    // Drawing opens the viewport beside this screen (P-GCALC GC2), where a hidden drawing used to land.
    expect(maths).toMatch(/if \(draw\(input\)\) \{\s*showBeside\('viewport', 'maths'\)/)
  })

  it('does not start the algebra engine twice', () => {
    // app/layout.ts warms SymPy once when the calculator opens; the old panel did it again on
    // every mount, unguarded.
    expect(readSource('src/renderer/src/panels/Maths.tsx')).not.toMatch(/warmupCas/)
    expect(readSource('src/renderer/src/app/layout.ts')).toMatch(/if \(id === 'calculator' && !casWarmed\)/)
  })
})

describe('P7 — one root format and one order on every route', () => {
  // The same equation used to come back four ways. For x² + 4 = 0, x = ? said "No solution I can
  // find near 0", Equations mode listed "0 − 2i, 0 + 2i", the Solve job "2i, −2i", and the bar's
  // SymPy line "−2i ≈ 0 − 2i or 2i ≈ 0 + 2i"; real roots came smallest first in one place and in
  // the formula's order (3, then −2) in another.
  //
  // THE RULE (P-CALC, 0.9 polish). ORDER: real roots smallest first; then the complex roots in
  // conjugate pairs, the pairs by real part, then by the size of the imaginary part; inside a pair
  // the root with +i first. FORM: a + bi as a student writes it — 2i (never 0 + 2i), −2i, i, −i,
  // −2 + 3i — text with the minus sign −, TeX with -, decimals through the calculator's own
  // formatter. A list shows each root on its own, in that order; a one-line sentence may write a
  // pair as a ± bi, which reads in the same order. x = ? on a polynomial with no real root answers
  // "No real solution. In complex numbers: x = …", an answer and not an error.

  type Cx = { re: number; im: number }
  type SympyRow = Record<string, { latex: string; text: string; numeric: { re: number; im?: number } | null }>
  const I = math.complex(0, 1)
  const cx = (v: unknown): Cx => {
    const c = math.complex(v as never) as unknown as Cx
    return { re: c.re, im: c.im }
  }
  /** What a root written in TeX stands for, read by the calculator's own converter. */
  const valueOfTex = (t: string): Cx => cx(math.evaluate(latexToMath(t), { i: I }))
  /** TeX without its spacing: "- 2 i" and "-2i" draw the same root. */
  const squash = (t: string): string => t.replace(/\\[,;:! ]|\s+/g, '')
  /** Roots as closeTo matchers, so a failure shows which root is out of place. */
  const near = (roots: Cx[], digits = 9): Cx[] =>
    roots.map((r) => ({ re: expect.closeTo(r.re, digits) as unknown as number, im: expect.closeTo(r.im, digits) as unknown as number }))

  /**
   * Equations mode's rows as the panel shows them — the TeX of an exact form, else the text —
   * beside what THE RULE wants in that same form, root by root.
   */
  const rowsAgainst = (coeffs: number[], text: string[], tex: string[]): { shown: string[]; wanted: string[] } => {
    const rows = polynomialRootRows(coeffs)
    return {
      shown: rows.map((row) => (row.tex === null ? row.text : `TeX ${squash(row.tex)}`)),
      wanted: text.map((t, i) => (rows[i] && rows[i].tex !== null ? `TeX ${squash(tex[i])}` : t))
    }
  }

  /** The bar's answer line cut into its roots, in the order shown: the exact TeX and any decimal beside it. */
  const barRoots = (line: string): { exact: string; approx: string | null }[] =>
    line
      .split(/(?<![A-Za-z\\])x(?:_\{?\d+\}?|[₀-₉]+)?\s*=\s*/)
      .slice(1)
      .map((part) => {
        const [exact, approx] = part.replace(/(?:\s|,|\\q?quad|\\text\{\s*or\s*\}|\\ )+$/, '').split('\\approx')
        return { exact: exact.trim(), approx: approx === undefined ? null : approx.trim() }
      })

  /** The scene's default precision, which the bar's decimals follow. */
  const BAR = { decimals: 2, precisionMode: 'dp' as const }

  /**
   * The bar's SymPy line against THE RULE: each root on its own and in order, the exact value right
   * (and written as given, when given), and any decimal beside it read like any other root.
   */
  const checkBar = (rows: SympyRow[], roots: Cx[], exact: string[] | undefined, at: string): void => {
    const line = solveRowsTex(rows, BAR)
    const parts = barRoots(line)
    expect.soft(parts.map((p) => valueOfTex(p.exact)), `bar ${at}: ${line}`).toEqual(near(roots))
    if (exact) expect.soft(parts.map((p) => squash(p.exact)), `bar ${at}: ${line}`).toEqual(exact.map(squash))
    parts.forEach((p, i) => {
      if (p.approx === null) return
      // Never "≈ 0 − 2i" or "≈ 0 − 1i": the decimal is a root too, and reads like one.
      expect.soft(squash(p.approx), `bar ${at}, the decimal beside root ${i + 1}: ${line}`).not.toMatch(/^-?0(\.0+)?[+-]|(^|[+-])1i$/)
      if (roots[i]) expect.soft(valueOfTex(p.approx), `bar ${at}, the decimal beside root ${i + 1}: ${line}`).toEqual(near([roots[i]], 1)[0])
    })
  }

  // What the CAS worker answers for solve(), word for word and in SymPy's own order: recorded from
  // the bundled SymPy 1.14 running workers/cas.worker.ts's PRELUDE (cas_run('solve', …)).
  const I2 = (sign: 1 | -1): SympyRow => ({ x: { latex: sign > 0 ? '2 i' : '- 2 i', text: sign > 0 ? '2*I' : '-2*I', numeric: { re: 0, im: 2 * sign } } })

  const r3 = Math.sqrt(3) / 2
  const EQUATIONS: { latex: string; coeffs: number[]; roots: Cx[]; text: string[]; tex: string[]; exact?: string[]; solve: string; sympy: SympyRow[] }[] = [
    {
      latex: 'x^{2}+4=0',
      coeffs: [1, 0, 4],
      roots: [
        { re: 0, im: 2 },
        { re: 0, im: -2 }
      ],
      text: ['2i', '−2i'],
      tex: ['2i', '-2i'],
      exact: ['2i', '-2i'],
      solve: 'No real solution. In complex numbers: x = ±2i',
      sympy: [I2(-1), I2(1)]
    },
    {
      latex: 'x^{2}+4x+13=0',
      coeffs: [1, 4, 13],
      roots: [
        { re: -2, im: 3 },
        { re: -2, im: -3 }
      ],
      text: ['−2 + 3i', '−2 − 3i'],
      tex: ['-2 + 3i', '-2 - 3i'],
      exact: ['-2 + 3i', '-2 - 3i'],
      solve: 'No real solution. In complex numbers: x = −2 ± 3i',
      sympy: [{ x: { latex: '-2 - 3 i', text: '-2 - 3*I', numeric: { re: -2, im: -3 } } }, { x: { latex: '-2 + 3 i', text: '-2 + 3*I', numeric: { re: -2, im: 3 } } }]
    },
    {
      latex: 'x^{3}-1=0',
      coeffs: [1, 0, 0, -1],
      roots: [
        { re: 1, im: 0 },
        { re: -0.5, im: r3 },
        { re: -0.5, im: -r3 }
      ],
      text: ['1', `−0.5 + ${calcNum(r3)}i`, `−0.5 − ${calcNum(r3)}i`],
      tex: ['1', `-0.5 + ${calcNum(r3)}i`, `-0.5 - ${calcNum(r3)}i`],
      // x = ? gives one root, like the handheld: the real one.
      solve: 'x = 1',
      sympy: [
        { x: { latex: '1', text: '1', numeric: { re: 1 } } },
        { x: { latex: '- \\frac{1}{2} - \\frac{\\sqrt{3} i}{2}', text: '-1/2 - sqrt(3)*I/2', numeric: { re: -0.5, im: -0.8660254037844386 } } },
        { x: { latex: '- \\frac{1}{2} + \\frac{\\sqrt{3} i}{2}', text: '-1/2 + sqrt(3)*I/2', numeric: { re: -0.5, im: 0.8660254037844386 } } }
      ]
    }
  ]

  it('answers x² + 4 = 0, x² + 4x + 13 = 0 and x³ − 1 = 0 with the same roots, in the same order and form, on every route', () => {
    for (const eq of EQUATIONS) {
      const at = eq.latex
      // x = ? (the SOLVE key): one real root like the handheld, or the sentence when there is none.
      const solve = evaluateInput('COMP', eq.latex, opts)!
      expect.soft(solve.error, `x = ? ${at}`).toBeUndefined()
      expect.soft(solve.main, `x = ? ${at}`).toBe(eq.solve)

      // Equations mode, a decimal route: the text is compared.
      const { shown, wanted } = rowsAgainst(eq.coeffs, eq.text, eq.tex)
      expect.soft(shown, `Equations mode ${at}`).toEqual(wanted)

      // The Solve job (Working panel), an exact route. The bar answers solve(…) of a linear or
      // quadratic equation through this same job (commands.ts tryPureMath → runPure), so there
      // these answers are the bar's too. It refuses a cubic in words; if it ever answers one, it agrees.
      const job = runPure('solve', latexToMath(eq.latex))
      if (job.error) expect.soft(job.answers, `Solve job ${at}: ${job.error}`).toEqual([])
      else {
        expect.soft(job.answers.map((a) => valueOfTex(a.tex)), `Solve job ${at}`).toEqual(near(eq.roots))
        if (eq.exact) expect.soft(job.answers.map((a) => squash(a.tex)), `Solve job ${at}`).toEqual(eq.exact.map(squash))
      }

      // The bar's SymPy line — what solve(…) of a cubic and nsolve(…) of anything show — from the
      // worker's own rows in the worker's own order.
      checkBar(eq.sympy, eq.roots, eq.exact, at)
    }
  })

  it('says "No real solution" on x = ? for a polynomial with no real root, as an answer x does not keep', () => {
    const cases: [string, string][] = [
      ['x^{2}+4=0', 'No real solution. In complex numbers: x = ±2i'],
      ['x^{2}+4x+13=0', 'No real solution. In complex numbers: x = −2 ± 3i'],
      ['x^{2}=-1', 'No real solution. In complex numbers: x = ±i'],
      ['\\left(x+1\\right)^{2}=-4', 'No real solution. In complex numbers: x = −1 ± 2i'],
      ['x^{2}+2=0', `No real solution. In complex numbers: x = ±${calcNum(Math.SQRT2)}i`]
    ]
    for (const [line, sentence] of cases) {
      const r = evaluateInput('COMP', line, opts)!
      expect.soft(r.error, line).toBeUndefined()
      expect.soft(r.main, line).toBe(sentence)
      // Maths.tsx stores x only from a solved line, and the eng chip must leave the sentence alone.
      expect.soft(r.solved, line).toBeFalsy()
      expect.soft(mainLine(r, true), line).toBe(sentence)
    }
    // An equation that is not a polynomial keeps its sentence: a root may still be somewhere else.
    expect(evaluateInput('COMP', '\\sin\\left(x\\right)=2', opts)!.error?.sentence).toBe('No solution I can find near 0. Try giving x a value close to the answer first.')
    // A real root is found as before — one root, like the handheld — and becomes x.
    const cube = evaluateInput('COMP', 'x^{3}-1=0', opts)!
    expect(cube.error).toBeUndefined()
    expect(cube.main).toBe('x = 1')
    expect(cube.solved).toBe(true)
    expect(Number(cube.value)).toBeCloseTo(1, 12)
  })

  it('answers √(−4) in Numbers mode with 2i and a note that it is imaginary', () => {
    const r = evaluateInput('COMP', '\\sqrt{-4}', opts)!
    expect(r.error).toBeUndefined()
    expect(r.main).toBe('2i')
    expect(r.extra ?? []).toContain('imaginary — √(−4) = 2i')
    // A real square root has nothing to explain.
    expect(evaluateInput('COMP', '\\sqrt{9}', opts)!.extra ?? []).toEqual([])
  })

  it('gives the real root of (−8)^(1/3), ∛(−8) and (−8)^(2/3), with the principal value beside it, in Numbers and Complex mode', () => {
    // mathjs answers (−8)^(1/3) with its principal value, 1 + 1.732i, while the ∛ key gave −2.
    const cases: [string, number, string][] = [
      ['\\left(-8\\right)^{\\frac{1}{3}}', -2, `1 + ${calcNum(Math.sqrt(3))}i`],
      ['\\sqrt[3]{-8}', -2, `1 + ${calcNum(Math.sqrt(3))}i`],
      ['\\left(-8\\right)^{\\frac{2}{3}}', 4, `${calcNum(-2)} + ${calcNum(2 * Math.sqrt(3))}i`]
    ]
    for (const mode of ['COMP', 'CMPLX'] as const) {
      for (const [line, real, principal] of cases) {
        const at = `${mode} ${line}`
        const r = evaluateInput(mode, line, opts)!
        expect.soft(r.error, at).toBeUndefined()
        expect.soft(r.main, at).toBe(calcNum(real))
        const beside = (r.extra ?? []).join('\n')
        expect.soft(beside, at).toMatch(/\breal root\b/)
        expect.soft(beside, at).toContain(`principal value ${principal}`)
        // The answer kept as Ans is the one on the screen.
        expect.soft(cx(r.value), at).toEqual(near([{ re: real, im: 0 }])[0])
      }
    }
    // At the student's precision, like every other number on the screen.
    setCalcPrecisionSource(() => ({ decimals: 4, precisionMode: 'sf' }))
    try {
      expect.soft((evaluateInput('COMP', '\\left(-8\\right)^{\\frac{1}{3}}', opts)!.extra ?? []).join('\n')).toContain('principal value 1 + 1.732i')
      expect.soft((evaluateInput('CMPLX', '\\left(-8\\right)^{\\frac{2}{3}}', opts)!.extra ?? []).join('\n')).toContain('principal value −2 + 3.464i')
    } finally {
      setCalcPrecisionSource(() => ({ decimals: 10, precisionMode: 'sf' }))
    }
    // An even root of a negative number has no real value: it stays the principal one.
    expect(evaluateInput('COMP', '\\left(-8\\right)^{\\frac{1}{2}}', opts)!.main).toBe(`${calcNum(Math.sqrt(8))}i`)
  })

  it('lists a quadratic as its formula reads it, the + root first, the same on the Solve job and in Equations mode', () => {
    // x₁ = (−b + √Δ)/2a, then x₂ = (−b − √Δ)/2a, taken literally, as the handheld does. The finder's first
    // draft of this test wanted real roots smallest first; the wave head chose the formula's order instead
    // (2026-10-02, the PhysLab Calculator's order), so x² − x − 6 is 3 then −2, and with a < 0 the "+√" root can be the smaller
    // one: −x² + x + 6 gives −2 then 3, and −x² − 4 gives −2i then 2i. Ascending order is for cubics and
    // higher, which have no ± formula (the next test).
    const solved = (latex: string): string[] => runPure('solve', latexToMath(latex)).answers.map((a) => squash(a.tex))
    const text = (coeffs: number[]): string[] => polynomialRootRows(coeffs).map((r) => r.text)
    expect.soft(solved('x^{2}-x-6=0'), 'Solve job x² − x − 6 = 0').toEqual(['3', '-2'])
    const six = rowsAgainst([1, -1, -6], ['3', '−2'], ['3', '-2'])
    expect.soft(six.shown, 'Equations mode x² − x − 6 = 0').toEqual(six.wanted)
    // x² − 5x + 6 and x² − 4: the examples the handheld's manual gives.
    expect.soft(solved('x^{2}-5x+6=0'), 'Solve job x² − 5x + 6 = 0').toEqual(['3', '2'])
    expect.soft(text([1, -5, 6]), 'Equations mode x² − 5x + 6 = 0').toEqual(['3', '2'])
    expect.soft(solved('x^{2}-4=0'), 'Solve job x² − 4 = 0').toEqual(['2', '-2'])
    expect.soft(text([1, 0, -4]), 'Equations mode x² − 4 = 0').toEqual(['2', '−2'])
    // x² − 2x − 1 = 0: 1 + √2 first. Equations mode has no exact form for it and writes the decimal.
    expect.soft(solved('x^{2}-2x-1=0'), 'Solve job x² − 2x − 1 = 0').toEqual(['1+\\sqrt{2}', '1-\\sqrt{2}'])
    expect.soft(text([1, -2, -1]), 'Equations mode x² − 2x − 1 = 0').toEqual([calcNum(1 + Math.SQRT2), calcNum(1 - Math.SQRT2)])
    // A negative a does not turn the pair round: it is the formula's own order.
    expect.soft(solved('-x^{2}+x+6=0'), 'Solve job −x² + x + 6 = 0').toEqual(['-2', '3'])
    expect.soft(text([-1, 1, 6]), 'Equations mode −x² + x + 6 = 0').toEqual(['−2', '3'])
    expect.soft(solved('-x^{2}-4=0'), 'Solve job −x² − 4 = 0').toEqual(['-2i', '2i'])
    const negative = rowsAgainst([-1, 0, -4], ['−2i', '2i'], ['-2i', '2i'])
    expect.soft(negative.shown, 'Equations mode −x² − 4 = 0').toEqual(negative.wanted)
    // Complex roots follow the same rule: the "+" root is x₁ whichever way its imaginary part points.
    expect.soft(solved('x^{2}+4x+13=0'), 'Solve job x² + 4x + 13 = 0').toEqual(['-2+3i', '-2-3i'])
    expect.soft(text([1, 4, 13]), 'Equations mode x² + 4x + 13 = 0').toEqual(['−2 + 3i', '−2 − 3i'])
  })

  it('shows a repeated root once, the same way on every route', () => {
    // x² + 6x + 9 = 0: Durand–Kerner left −3.000000009 and −2.999999991 side by side in Equations
    // mode, and Newton's method stopped at −2.999999917 on the x = ? key. The Solve job said "x = −3".
    const rows = polynomialRootRows([1, 6, 9])
    expect(rows.map((r) => [r.label, r.tex, r.text])).toEqual([['x =', '-3', '−3']])
    const job = runPure('solve', 'x^2+6x+9=0')
    expect(job.answers.map((a) => [a.label, a.tex])).toEqual([['x =', '-3']])
    const key = evaluateInput('COMP', 'x^{2}+6x+9=0', opts)!
    expect(key.main).toBe('x = −3')
    expect(key.value).toBe(-3)
    expect(key.solved).toBe(true)
    // A discriminant that is only round-off (0.6² against 4 × 0.1 × 0.9) is no pair of roots a hair apart.
    expect(polynomialRootRows([0.1, 0.6, 0.9]).map((r) => r.text)).toEqual(['−3'])
    // Past a quadratic: one row for each different root, however many times it repeats.
    expect.soft(polynomialRootRows([1, -3, 3, -1]).map((r) => [r.label, r.text]), '(x − 1)³').toEqual([['x =', '1']])
    expect.soft(polynomialRootRows([1, -4, 6, -4, 1]).map((r) => [r.label, r.text]), '(x − 1)⁴').toEqual([['x =', '1']])
    expect.soft(polynomialRootRows([1, 0, 0, 0]).map((r) => [r.label, r.text]), 'x³').toEqual([['x =', '0']])
    expect.soft(polynomialRootRows([1, 0, 2, 0, 1]).map((r) => r.text), '(x² + 1)²').toEqual(['i', '−i'])
    // …and x = ? on a cubic with a double root gives that root itself, once, not the eight digits Newton reaches, and
    // the other root beside it (it gave x = 1 alone: half the answer).
    const cubic = evaluateInput('COMP', 'x^{3}-3x+2=0', opts)!
    expect.soft(cubic.main, 'x³ − 3x + 2 = 0 on x = ?').toBe('x₁ = −2, x₂ = 1')
    expect.soft(cubic.roots, 'x³ − 3x + 2 = 0 on x = ?').toEqual([-2, 1])
  })

  it('labels the Equations rows x₁, x₂, … in the order of the rule, and x for one root', () => {
    expect(polynomialRootRows([1, -5, 6]).map((r) => [r.label, r.text])).toEqual([
      ['x₁ =', '3'],
      ['x₂ =', '2']
    ])
    expect(polynomialRootRows([1, 4, 13]).map((r) => [r.label, r.text])).toEqual([
      ['x₁ =', '−2 + 3i'],
      ['x₂ =', '−2 − 3i']
    ])
    expect(polynomialRootRows([2, 3]).map((r) => r.label)).toEqual(['x ='])
    expect(polynomialRootRows([1, -6, 11, -6]).map((r) => r.label)).toEqual(['x₁ =', 'x₂ =', 'x₃ ='])
    // Two digits of the number are both subscripts: x₁₀, not x₁0.
    const tenth = polynomialRootRows([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1])
    expect(tenth).toHaveLength(10)
    expect(tenth[9].label).toBe('x₁₀ =')
  })

  it('lists a cubic or higher with real roots smallest first, a repeated root once', () => {
    // No ± formula: x³ − 3x + 2 = (x − 1)²(x + 2) has the roots −2 and 1.
    const cubic = rowsAgainst([1, 0, -3, 2], ['−2', '1'], ['-2', '1'])
    expect.soft(cubic.shown, 'Equations mode x³ − 3x + 2 = 0').toEqual(cubic.wanted)
    expect.soft(polynomialRootRows([1, 0, -3, 2]).map((r) => r.label)).toEqual(['x₁ =', 'x₂ ='])
    const three = rowsAgainst([1, -6, 11, -6], ['1', '2', '3'], ['1', '2', '3'])
    expect.soft(three.shown, 'Equations mode x³ − 6x² + 11x − 6 = 0').toEqual(three.wanted)
    // (x − 2)²(x + 1) = x³ − 3x² + 4.
    expect.soft(polynomialRootRows([1, -3, 0, 4]).map((r) => r.text), '(x − 2)²(x + 1)').toEqual(['−1', '2'])
    // The bar's SymPy line lists them the same way whichever order SymPy gave them in.
    const one = (re: number): SympyRow => ({ x: { latex: String(re), text: String(re), numeric: { re } } })
    checkBar([one(1), one(-2)], [{ re: -2, im: 0 }, { re: 1, im: 0 }], ['-2', '1'], 'x³ − 3x + 2 = 0')
    // Two pairs with one real part: by the size of the imaginary part, + first; a pair with a smaller
    // real part comes before them.
    const pairs = polynomialRootRows([1, 2, 6, 2, 5]).map((r) => r.text)
    expect.soft(pairs, 'x⁴ + 2x³ + 6x² + 2x + 5 = 0').toEqual(['−1 + 2i', '−1 − 2i', 'i', '−i'])
  })

  it('works out a quadratic without losing the small root to cancellation', () => {
    // x² − 10000x + 1: (10000 − √(10⁸ − 4)) ÷ 2 subtracts two numbers 4 × 10⁻⁸ apart and is right to
    // about eight figures; the screen shows ten. The small root is 1/B + 1/B³ + 2/B⁵ + … (Catalan numbers).
    const [big, small] = quadraticRoots(1, -10000, 1)
    expect(small.re / (1e-4 + 1e-12 + 2e-20) - 1).toBeCloseTo(0, 14)
    expect(big.re * small.re).toBeCloseTo(1, 12)
    // The same roots of 2x² + 3x − 5 from the other side: x₁ = 1, x₂ = −2.5.
    expect(quadraticRoots(2, 3, -5).map((z) => z.re)).toEqual([1, -2.5])
  })

  it('puts real roots first, then the pairs by real part and by size, each + first, in Equations mode and the bar', () => {
    const one = (re: number, im: number, latex: string, text: string): SympyRow => ({ x: { latex, text, numeric: im === 0 ? { re } : { re, im } } })
    const CASES: { at: string; coeffs: number[]; roots: Cx[]; text: string[]; tex: string[]; sympy: SympyRow[] }[] = [
      {
        at: 'x⁴ + 5x² + 4 = 0',
        coeffs: [1, 0, 5, 0, 4],
        roots: [
          { re: 0, im: 1 },
          { re: 0, im: -1 },
          { re: 0, im: 2 },
          { re: 0, im: -2 }
        ],
        text: ['i', '−i', '2i', '−2i'],
        tex: ['i', '-i', '2i', '-2i'],
        sympy: [I2(-1), one(0, -1, '- i', '-I'), one(0, 1, 'i', 'I'), I2(1)]
      },
      {
        at: 'x⁴ + 3x² + 6x + 10 = 0',
        coeffs: [1, 0, 3, 6, 10],
        roots: [
          { re: -1, im: 1 },
          { re: -1, im: -1 },
          { re: 1, im: 2 },
          { re: 1, im: -2 }
        ],
        text: ['−1 + i', '−1 − i', '1 + 2i', '1 − 2i'],
        tex: ['-1 + i', '-1 - i', '1 + 2i', '1 - 2i'],
        sympy: [one(-1, -1, '-1 - i', '-1 - I'), one(-1, 1, '-1 + i', '-1 + I'), one(1, -2, '1 - 2 i', '1 - 2*I'), one(1, 2, '1 + 2 i', '1 + 2*I')]
      },
      {
        at: 'x⁴ − 2x³ + x² − 8x − 12 = 0',
        coeffs: [1, -2, 1, -8, -12],
        roots: [
          { re: -1, im: 0 },
          { re: 3, im: 0 },
          { re: 0, im: 2 },
          { re: 0, im: -2 }
        ],
        text: ['−1', '3', '2i', '−2i'],
        tex: ['-1', '3', '2i', '-2i'],
        sympy: [one(-1, 0, '-1', '-1'), one(3, 0, '3', '3'), I2(-1), I2(1)]
      }
    ]
    for (const c of CASES) {
      const { shown, wanted } = rowsAgainst(c.coeffs, c.text, c.tex)
      expect.soft(shown, `Equations mode ${c.at}`).toEqual(wanted)
      checkBar(c.sympy, c.roots, c.tex, c.at)
    }
  })

  it('writes one root the same way wherever it is written: 2i, −i, i, −2 + 3i', () => {
    const shown = (re: number, im: number): string => formatValue(math.complex(re, im))
    expect.soft(shown(0, 2)).toBe('2i')
    expect.soft(shown(0, -2)).toBe('−2i')
    expect.soft(shown(0, 1)).toBe('i')
    expect.soft(shown(0, -1)).toBe('−i')
    expect.soft(shown(-2, 3)).toBe('−2 + 3i')
    expect.soft(shown(-2, -3)).toBe('−2 − 3i')
    expect.soft(shown(2, 0)).toBe('2')
    // A part that is 1 once it is written is i, not 1i: 0.99999999999 is 1 at ten figures.
    expect.soft(shown(0, 1.00000000000001)).toBe('i')
    expect.soft(shown(3, -0.99999999999999)).toBe('3 − i')
    // formatValue is the same function the other routes call; in TeX the minus is the plain -, and the
    // number formatter is the caller's (the bar's own writes a negative real part with its own sign).
    const plain = (n: number): string => String(n)
    expect.soft(formatComplex(0, 2, plain, 'tex')).toBe('2i')
    expect.soft(formatComplex(0, -1, plain, 'tex')).toBe('-i')
    expect.soft(formatComplex(-2, -3, plain, 'tex')).toBe('-2 - 3i')
    expect.soft(formatComplex(1.5, 1, plain, 'tex')).toBe('1.5 + i')
    expect.soft(formatComplex(1.5, 0, plain, 'tex')).toBe('1.5')
    // Equations mode writes its complex rows with it.
    expect.soft(polynomialRootRows([1, 0, 1]).map((r) => r.text)).toEqual(['i', '−i'])
  })

  it('names the complex roots only for a polynomial in x, taking the other letters from what is stored', () => {
    const say = (line: string, vars: Record<string, unknown> = opts.vars) => evaluateInput('COMP', line, { ...opts, vars })!
    const none = 'No real solution. In complex numbers: x = '
    // x² + A = 0 with A stored is x² + 3 = 0, and with A = −4 it has real roots, which come as before.
    expect.soft(say('x^{2}+A=0', { A: 3, x: 0 }).main).toBe(`${none}±${calcNum(Math.sqrt(3))}i`)
    expect.soft(say('x^{2}+A=0', { A: -4, x: 0 }).main).toBe('x₁ = 2, x₂ = −2')
    // Two pairs: each pair once, the pairs by real part and then by size.
    expect.soft(say('x^{4}+5x^{2}+4=0').main).toBe(`${none}±i or x = ±2i`)
    expect.soft(say('x^{4}+2x^{3}+6x^{2}+2x+5=0').main).toBe(`${none}−1 ± 2i or x = ±i`)
    expect.soft(say('x^{2}+4=0').value, 'no number comes of it').toBeUndefined()
    // Not a polynomial in x — 1/x, √x, 2ˣ, sin x — keeps the sentence about where to start looking.
    const sentence = 'No solution I can find near 0. Try giving x a value close to the answer first.'
    for (const line of ['\\frac{1}{x}+x=0', '\\sqrt{x}+1=0', '2^{x}=-1', '\\sin\\left(x\\right)=2']) {
      expect.soft(say(line).error?.sentence, line).toBe(sentence)
    }
    // A power too high to be worth expanding is not read as a polynomial (and costs no time), and
    // an equation with no x left once both sides are taken (x² + 4 = x² + 1) has no roots to name.
    expect.soft(say('\\left(x+1\\right)^{20}=-1').error?.sentence).toBe(sentence)
    expect.soft(say('x^{2}+4=x^{2}+1').error?.sentence).toBe(sentence)
    // A real root is still the one answer, and becomes x.
    const real = say('x^{3}+8=0')
    expect.soft(real.main).toBe('x = −2')
    expect.soft(real.solved).toBe(true)
  })

  it('names the square root of a negative number beside an imaginary answer in Numbers mode', () => {
    const beside = (mode: 'COMP' | 'CMPLX', line: string): string[] => evaluateInput(mode, line, opts)!.extra ?? []
    expect.soft(beside('COMP', '\\sqrt{-9}')).toEqual(['imaginary — √(−9) = 3i'])
    expect.soft(evaluateInput('COMP', '\\sqrt{-4}+1', opts)!.main).toBe('1 + 2i')
    expect.soft(beside('COMP', '\\sqrt{-4}+1')).toEqual(['imaginary — √(−4) = 2i'])
    // Imaginary some other way — ln(−1), (−8)^(1/2): a short note, no root named.
    expect.soft(beside('COMP', '\\ln\\left(-1\\right)')).toEqual(['imaginary — the answer has an i part, so it is a complex number'])
    expect.soft(beside('COMP', '\\left(-8\\right)^{\\frac{1}{2}}')).toEqual(['imaginary — the answer has an i part, so it is a complex number'])
    // The Complex mode shows size and angle instead and needs no word.
    expect.soft(beside('CMPLX', '\\sqrt{-9}').join('\n')).not.toMatch(/imaginary/)
    // A real answer has nothing to explain, even if two imaginary numbers made it.
    const product = evaluateInput('COMP', '\\sqrt{-4}\\times\\sqrt{-4}', opts)!
    expect.soft(product.main).toBe('−4')
    expect.soft(product.extra ?? []).toEqual([])
  })

  it('takes the real root of an odd root of a negative number exactly, and leaves every other power alone', () => {
    const run = (line: string, mode: 'COMP' | 'CMPLX' = 'COMP') => evaluateInput(mode, line, opts)!
    // 64^(1/3) is 3.9999999999999996 in floating point; the root, and the Ans kept from it, are exact.
    expect.soft(run('\\left(-64\\right)^{\\frac{1}{3}}').value).toBe(-4)
    expect.soft(run('\\left(-27\\right)^{\\frac{1}{3}}').value).toBe(-3)
    expect.soft(run('\\sqrt[5]{-32}').value).toBe(-2)
    expect.soft(run('\\left(-8\\right)^{-\\frac{1}{3}}').main).toBe('−0.5')
    expect.soft(run('\\left(-32\\right)^{\\frac{3}{5}}').main).toBe('−8')
    // 0.2 is typed for 1/5.
    expect.soft(run('\\left(-32\\right)^{0.2}').main).toBe('−2')
    // A letter that holds the negative number is no different.
    expect.soft(evaluateInput('COMP', 'x^{\\frac{1}{3}}', { ...opts, vars: { x: -8 } })!.main).toBe('−2')
    // Untouched: a positive base, a whole-number power, an even root, an exponent that is only near 1/3.
    expect.soft(run('8^{\\frac{1}{3}}').extra ?? []).toEqual([])
    expect.soft(run('\\left(-8\\right)^{3}').main).toBe('−512')
    expect.soft(run('\\left(-8\\right)^{3}').extra ?? []).toEqual([])
    expect.soft(run('\\left(-4\\right)^{\\frac{1}{2}}').main).toBe('2i')
    const near = run('\\left(-8\\right)^{0.333}')
    expect.soft(near.main).toMatch(/i$/)
    expect.soft((near.extra ?? []).join('\n')).not.toMatch(/real root/)
    // The ∛ key and the power now give one answer, in both modes, and in a sum the note says which root.
    expect.soft(run('\\sqrt[3]{-8}').main).toBe(run('\\left(-8\\right)^{\\frac{1}{3}}').main)
    const sum = run('1+\\left(-8\\right)^{\\frac{1}{3}}')
    expect.soft(sum.main).toBe('−1')
    expect.soft(sum.extra).toEqual([`real root of (−8)^(1/3) is −2 — principal value 1 + ${calcNum(Math.sqrt(3))}i`])
    expect.soft(run('1+\\left(-8\\right)^{\\frac{1}{3}}', 'CMPLX').extra?.[0]).toBe(sum.extra![0])
  })

  it('writes the bar\'s decimal beside a root like every other root, and keeps a system in SymPy\'s order', () => {
    const row = (re: number, im: number | undefined, latex: string, text: string): SympyRow => ({ x: { latex, text, numeric: im === undefined ? { re } : { re, im } } })
    // Whole parts need no decimal beside them: 2i, −2 + 3i.
    expect(solveRowsTex([row(0, 2, '2 i', '2*I')], BAR)).toBe('x = 2 i')
    expect(solveRowsTex([row(-2, 3, '-2 + 3 i', '-2 + 3*I')], BAR)).toBe('x = -2 + 3 i')
    // A decimal that is not whole is written as the Maths screen writes it, at the scene's precision.
    const half = row(-0.5, 0.8660254037844386, '- \\frac{1}{2} + \\frac{\\sqrt{3} i}{2}', '-1/2 + sqrt(3)*I/2')
    expect(solveRowsTex([half], BAR)).toBe('x = - \\frac{1}{2} + \\frac{\\sqrt{3} i}{2} \\approx -0.5 + 0.87i')
    expect(solveRowsTex([row(1.5, 1, '\\frac{3}{2} + i', '3/2 + I')], BAR)).toBe('x = \\frac{3}{2} + i \\approx 1.5 + i')
    // A real root in a fraction keeps its decimal, as before, and the roots come smallest first.
    expect(solveRowsTex([row(2.5, undefined, '\\frac{5}{2}', '5/2'), row(-1.25, undefined, '- \\frac{5}{4}', '-5/4')], BAR)).toBe(
      'x = - \\frac{5}{4} \\approx -1.25\\quad\\text{or}\\quad x = \\frac{5}{2} \\approx 2.5'
    )
    // One row that holds x and y is a solution of a system: there is no single root to order it by.
    const at = (x: number, y: number) => ({ x: { latex: String(x), text: String(x), numeric: { re: x } }, y: { latex: String(y), text: String(y), numeric: { re: y } } })
    expect(solveRowsTex([at(3, 1), at(-2, 5)], BAR)).toBe('x = 3,\\ y = 1\\quad\\text{or}\\quad x = -2,\\ y = 5')
  })

  it('keeps Ans when an answer has no number in it', () => {
    // The "no real solution" sentence carries no value; an Ans of undefined would read as 0 in the next line.
    expect(readSource('src/renderer/src/panels/Maths.tsx')).toMatch(/ans: r\.value === undefined \? s\.ans : r\.value/)
  })
})

describe('G4 — the ENG view writes powers as superscripts', () => {
  // The eng chip drew "1.269×10^0". calcEng, like calcNum, writes a power of ten with a caret so
  // the number can be read back, and mainLine — the line the screen draws, under the answer and
  // after the ≈ — handed that text on as it was. A caret is programming syntax, which no screen of
  // PhysLab shows: the line is drawn with a real power, "1.269 × 10⁰", as every label in the app
  // writes one (superscriptPowers, math/format.ts). A very large or very small answer reaches the
  // same line with the chip off ("1.6×10^-19"), so it is raised too. The digits must not move.

  beforeEach(() => setCalcPrecisionSource(() => ({ decimals: 10, precisionMode: 'sf' })))

  const RAISED = '⁰¹²³⁴⁵⁶⁷⁸⁹'
  /** A raised power back to the caret text the engine writes: " × 10⁻²¹" is "×10^-21". */
  const lowered = (text: string): string =>
    text.replace(/[ \u00a0]×[ \u00a0]10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_all, p: string) => `×10^${[...p].map((c) => (c === '⁻' ? '-' : String(RAISED.indexOf(c)))).join('')}`)
  /** A typed line to the text the Maths screen draws as its answer, with the eng chip on or off. */
  const drawn = (line: string, eng: boolean): string => mainLine(evaluateInput('COMP', line, opts)!, eng)

  it('draws 1.269, 12345 and 0.000123 as powers of ten a student can read, never with a caret', () => {
    expect(drawn('1.269', true)).toBe('1.269\u00a0×\u00a010⁰')
    expect(drawn('12345', true)).toBe('12.345\u00a0×\u00a010³')
    expect(drawn('0.000123', true)).toBe('123\u00a0×\u00a010⁻⁶')
    expect(drawn('-12345', true)).toBe('−12.345\u00a0×\u00a010³')
    // Zero has no power of ten to raise.
    expect(drawn('0', true)).toBe('0')
  })

  it('keeps every digit and sign calcEng wrote, for one-, two- and three-digit powers, up and down', () => {
    const lines = ['1.269', '12345', '0.000123', '-12345', '-0.000123', '1.6\\times10^{-19}', '6.02\\times10^{23}', '1\\times10^{100}', '1\\times10^{-100}', '\\frac{1}{3}', '\\frac{1}{3}\\times10^{-5}', '9.8\\times10^{-13}']
    for (const line of lines) {
      const r = evaluateInput('COMP', line, opts)!
      expect.soft(r.error, line).toBeUndefined()
      const shown = drawn(line, true)
      expect.soft(shown, line).not.toContain('^')
      // Lowered again, it is the engine's own text for the same value, character for character.
      expect.soft(lowered(shown), line).toBe(calcEng(r.value as number))
    }
    expect(drawn('1.6\\times10^{-19}', true)).toBe('160\u00a0×\u00a010⁻²¹')
    expect(drawn('1\\times10^{100}', true)).toBe('10\u00a0×\u00a010⁹⁹')
    expect(drawn('1\\times10^{-100}', true)).toBe('100\u00a0×\u00a010⁻¹⁰²')
  })

  it('raises a very large or very small answer with the chip off, and leaves an ordinary one alone', () => {
    expect(drawn('1.6\\times10^{-19}', false)).toBe('1.6\u00a0×\u00a010⁻¹⁹')
    expect(drawn('6.02\\times10^{23}', false)).toBe('6.02\u00a0×\u00a010²³')
    expect(drawn('5\\times10^{15}', false)).toBe('5\u00a0×\u00a010¹⁵')
    expect(drawn('9.8\\times10^{-13}', false)).toBe('9.8\u00a0×\u00a010⁻¹³')
    expect(drawn('\\frac{1}{3}', false)).toBe('0.3333333333')
    expect(drawn('12345\\times678', false)).toBe('8369910')
    for (const line of ['1.6\\times10^{-19}', '6.02\\times10^{23}', '5\\times10^{15}']) expect.soft(drawn(line, false), line).not.toContain('^')
  })

  it('still writes the digits of the precision the student chose', () => {
    setCalcPrecisionSource(() => ({ decimals: 4, precisionMode: 'sf' }))
    try {
      expect(drawn('12345', true)).toBe('12.35\u00a0×\u00a010³')
      expect(drawn('0.000123', true)).toBe('123\u00a0×\u00a010⁻⁶')
      expect(drawn('1.6\\times10^{-19}', false)).toBe('1.6\u00a0×\u00a010⁻¹⁹')
    } finally {
      setCalcPrecisionSource(() => ({ decimals: 10, precisionMode: 'sf' }))
    }
  })

  it('is the one line the Maths screen draws, as the answer and after the ≈', () => {
    const maths = readSource('src/renderer/src/panels/Maths.tsx')
    const start = maths.indexOf('function Answer(')
    expect(start).toBeGreaterThan(0)
    const answer = maths.slice(start, maths.indexOf('function WithValuesForm('))
    expect(answer).toMatch(/const main = mainLine\(result, eng\)/)
    // The engine's own text keeps the caret, so it must never be what the screen draws.
    expect(answer).not.toMatch(/result\.main/)
  })

  // The same caret reached two more places on the Maths screen, both plain text the engine wrote:
  // the extras under the answer ("L − R = 4.440892099×10^-16" after x² = 2, "y = 8×10^-20" after a
  // Rec) and the History drawer's result (r.main as it was stored: "1.6×10^-19"). shownText is what
  // both draw — the same text with a real power. The raising happens when the line is drawn, not
  // when it is stored, so a History entry saved before this change reads right too.

  it('writes a power of ten in an extras line or a History result as a real power, with the engine\'s own digits', () => {
    expect(shownText('L − R = 4.440892099×10^-16')).toBe('L − R = 4.440892099\u00a0×\u00a010⁻¹⁶')
    expect(shownText('y = −8×10^-20')).toBe('y = −8\u00a0×\u00a010⁻²⁰')
    expect(shownText('θ = 5.729577951×10^-12°')).toBe('θ = 5.729577951\u00a0×\u00a010⁻¹²°')
    expect(shownText('size 2×10^23, angle 45°')).toBe('size 2\u00a0×\u00a010²³, angle 45°')
    expect(shownText('1.6×10^-19')).toBe('1.6\u00a0×\u00a010⁻¹⁹')
    // Two powers on one line, as a complex answer and its conjugate have.
    expect(shownText('conjugate 1.6×10^-19 − 2.4×10^-19i')).toBe('conjugate 1.6\u00a0×\u00a010⁻¹⁹ − 2.4\u00a0×\u00a010⁻¹⁹i')
  })

  it('leaves a text with no power of ten exactly as it is, and a power already raised', () => {
    for (const same of ['', 'L − R = 0', 'x = −2.5', 'y = 3.464', 'decimal 255', 'hex FF', 'binary 11111111', 'octal 377', 'size 5, angle 53.13010235°', 'θ = 1.047197551 rad', '1.6 × 10⁻¹⁹']) {
      expect(shownText(same), same).toBe(same)
    }
    expect(shownText(shownText('1.6×10^-19'))).toBe('1.6\u00a0×\u00a010⁻¹⁹')
  })

  it('draws a damaged stored History entry — one with no text result — as an empty line, never a crash', () => {
    // History is read back from localStorage. The drawer used to draw {h.result}, and an undefined
    // one drew nothing; a helper that threw on it would have taken the whole Maths screen down.
    for (const damaged of [undefined, null]) expect(shownText(damaged as unknown as string), String(damaged)).toBe('')
  })

  it('draws what a typed line puts under its answer, and the History line it leaves, with no caret and the engine\'s own digits', () => {
    // Each of these writes a power of ten somewhere other than the answer's own line, or is the
    // answer that History keeps.
    const lines: Array<[line: string, mode: 'COMP' | 'CMPLX']> = [
      ['\\operatorname{Rec}\\left(1.6\\times10^{-19},30\\right)', 'COMP'], // y = 8×10^-20 under x = …
      ['\\operatorname{Pol}\\left(1,1\\times10^{-13}\\right)', 'COMP'], // θ = 5.73…×10^-12° under r = 1
      ['1.6\\times10^{-19}+2.4\\times10^{-19}i', 'CMPLX'], // size …, conjugate … under the answer
      ['1.6\\times10^{-19}', 'COMP'] // the answer History keeps
    ]
    for (const [line, mode] of lines) {
      const r = evaluateInput(mode, line, opts)!
      expect.soft(r.error, line).toBeUndefined()
      const raw = [r.main, ...(r.extra ?? [])]
      // The premise: the engine does write a caret on these lines, and r.main / r.extra keep it.
      expect.soft(raw.some((t) => t.includes('^')), line).toBe(true)
      for (const t of raw) {
        const shown = shownText(t)
        expect.soft(shown, `${line} → ${t}`).not.toContain('^')
        // Lowered again it is the engine's own text, character for character.
        expect.soft(lowered(shown), `${line} → ${t}`).toBe(t)
      }
      // History keeps r.main, and its line reads exactly as the answer did.
      expect.soft(shownText(r.main), line).toBe(mainLine(r, false))
    }
    // ln x = 0.3 leaves a residual of rounding noise (5.55×10⁻¹⁷) under the root. Whatever it reads, never a caret.
    // (x² = 2 stood here: it now answers with both its roots and no residual line, and this needs a line that has one.)
    const eq = evaluateInput('COMP', '\\ln x=0.3', opts)!
    expect(eq.extra?.length).toBeGreaterThan(0)
    for (const t of eq.extra ?? []) expect.soft(shownText(t), t).not.toContain('^')
  })

  it('is what the Maths screen draws for every extras line and every History result', () => {
    const maths = readSource('src/renderer/src/panels/Maths.tsx')
    const between = (from: string, to: string): string => {
      const start = maths.indexOf(from)
      const end = maths.indexOf(to)
      expect(start, from).toBeGreaterThan(0)
      expect(end, to).toBeGreaterThan(start)
      return maths.slice(start, end)
    }
    const answer = between('function Answer(', 'function WithValuesForm(')
    expect(answer).toMatch(/<div key=\{i\}>\{shownText\(x\)\}<\/div>/)
    const drawer = between('function HistoryDrawer(', 'function Intro(')
    expect(drawer).toMatch(/\{shownText\(h\.result\)\}/)
    // The engine's own text keeps the caret, so neither line may draw it as it is.
    expect(answer).not.toMatch(/\{x\}/)
    expect(drawer).not.toMatch(/\{h\.result\}/)
  })
})

/** Every .ts/.tsx file under src/renderer/src, as paths relative to it. */
function rendererFiles(dir = RENDERER_SRC): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...rendererFiles(p))
    else if (/\.tsx?$/.test(name)) out.push(relative(RENDERER_SRC, p).split(sep).join('/'))
  }
  return out
}

/** Every renderer file an eager import chain from `entry` reaches, as paths relative to src/renderer/src. */
function eagerlyReachable(entry: string): Set<string> {
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length) {
    const rel = queue.pop()!
    if (seen.has(rel)) continue
    seen.add(rel)
    const src = readSource(join('src/renderer/src', rel))
    // A static import: `import x from`, `import { a, b } from` over several lines, `export … from`.
    // Not `import type`, and not the `import('…')` inside lazy(), which has no `from`. The
    // quote class keeps a match from running across lines into a later import's `from`.
    for (const m of src.matchAll(/^(?:import|export)\s+(?!type\s)[^'"]*?\bfrom\s+['"]([^'"]+)['"]/gm)) {
      const spec = m[1]
      if (!spec.startsWith('.')) continue
      const base = resolve(RENDERER_SRC, dirname(rel), spec)
      const file = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].map((ext) => base + ext).find((f) => existsSync(f) && /\.tsx?$/.test(f))
      if (file) queue.push(relative(RENDERER_SRC, file).split(sep).join('/'))
    }
  }
  return seen
}

// ---------------------------------------------------------------------------------------------------------------------
// B3 — the Maths screen's four misleading or silent spots (polish items H3 UI half, H4, H5) and the angle a line is
// worked out in, wherever its numbers are read after the engine has returned. Maths.tsx is not run here (no DOM), so
// each decision is a pure function in calc/evaluateInput.ts, tested at the boundary — typed line → numbers — and the
// screen's wiring of it is pinned by reading its source, as the tests above do.
// ---------------------------------------------------------------------------------------------------------------------

describe('B3 — Maths screen: tangent, stale answer, with-values, keys', () => {
  const screen = (angle: 'deg' | 'rad') => ({ vars: opts.vars, ans: opts.ans, angle })
  /** The line as the Maths screen hands it to draw(): the field's LaTeX through the converter. */
  const lineOf = (latex: string): string => linearOf('COMP', latex).trim()
  const DDX_SIN_30 = '\\operatorname{ddx}\\left(\\sin\\left(x\\right),30\\right)'
  const mathsSource = (): string => readSource('src/renderer/src/panels/Maths.tsx')

  describe('H3 — the tangent is drawn from the numbers the answer card reads', () => {
    it('in degrees, d/dx sin x at 30 draws the slope the card shows, and both are in radians: cos 30 through (30, sin 30)', () => {
      // The card and the picture agree, and calculus is in radians (the owner's decision of 17 Oct 2026): this pinned them both in the
      // screen's unit, (π/180) × cos 30° = 0.01511 through (30, 0.5). The picture then draws the curve in radians too (calc/formula.ts inRadians).
      const shown = evaluateInput('COMP', DDX_SIN_30, { ...opts, angle: 'deg' })!
      const t = tangentAt(lineOf(DDX_SIN_30), screen('deg'))
      expect(t.x0).toBe(30)
      expect(t.fx).toBeCloseTo(Math.sin(30), 12)
      // The number on the card itself, not a second reading of the same question.
      expect(t.slope).toBe(shown.value)
      expect(t.slope).toBeCloseTo(Math.cos(30), 7)
      expect(Math.abs(t.slope - (Math.PI / 180) * Math.cos(Math.PI / 6))).toBeGreaterThan(0.1)
      expect(t.f).toBe('sin(x)')
    })

    it('in radians, the same line draws cos 30 through (30, sin 30)', () => {
      const shown = evaluateInput('COMP', DDX_SIN_30, { ...opts, angle: 'rad' })!
      const t = tangentAt(lineOf(DDX_SIN_30), screen('rad'))
      expect(t.x0).toBe(30)
      expect(t.fx).toBeCloseTo(Math.sin(30), 12)
      expect(t.slope).toBe(shown.value)
      expect(t.slope).toBeCloseTo(Math.cos(30), 7)
    })

    it('does not depend on the angle mode the maths holds: the screen says which, and nothing is left set', () => {
      const line = lineOf(DDX_SIN_30)
      for (const held of ['deg', 'rad'] as const) {
        setAngleMode(held)
        const d = tangentAt(line, screen('deg'))
        expect(d.fx, `held ${held}`).toBeCloseTo(Math.sin(30), 12)
        expect(d.slope, `held ${held}`).toBeCloseTo(Math.cos(30), 7)
        const r = tangentAt(line, screen('rad'))
        expect(r.fx, `held ${held}`).toBeCloseTo(Math.sin(30), 12)
        expect(r.slope, `held ${held}`).toBeCloseTo(Math.cos(30), 7)
        expect(getAngleMode(), `held ${held}`).toBe(held)
      }
    })

    it('reads the point in the screen’s unit, the curve in radians: the point where sin x is 0.5 is 30 degrees or 0.5236 radians', () => {
      const line = 'ddx(sin(x), asin(0.5))'
      // The point is plain trig outside the body, so 30 in DEG; the height there is the curve in radians, sin(30 rad).
      expect(tangentAt(line, screen('deg')).x0).toBeCloseTo(30, 9)
      expect(tangentAt(line, screen('deg')).fx).toBeCloseTo(Math.sin(30), 9)
      expect(tangentAt(line, screen('rad')).x0).toBeCloseTo(Math.PI / 6, 9)
      expect(tangentAt(line, screen('rad')).fx).toBeCloseTo(0.5, 9)
    })

    it('uses the stored letters for the curve and for the point', () => {
      const t = tangentAt('ddx(A*x^2, B)', { vars: { A: 3, B: 2 }, ans: 0, angle: 'deg' })
      expect(t.x0).toBe(2)
      expect(t.fx).toBeCloseTo(12, 9)
      expect(t.slope).toBeCloseTo(12, 6)
    })

    it('refuses what it cannot draw, in a sentence a student can act on', () => {
      // Not a derivative at a point: one argument, three arguments, another line altogether.
      for (const bad of ['ddx(sin(x))', 'ddx(sin(x), 1, 2)', 'sin(x)', 'ddx(sin(x), 30) + 1']) {
        expect(() => tangentAt(bad, screen('deg')), bad).toThrow(/^A tangent needs/)
      }
      // A curve with no value or no slope there: the old call drew a line with NaN in its formula.
      expect(() => tangentAt('ddx(sqrt(x), -1)', screen('deg'))).toThrow(/^There is no tangent there/)
    })

    it('puts the tangent’s own sentence under "I cannot draw that one.", not the word Error and the sentence', () => {
      // visualize() wrote String(e) there, which reads "Error: There is no tangent there: …" on a student's screen.
      const maths = mathsSource()
      expect(maths).toMatch(/sentence: 'I cannot draw that one\.', detail: e instanceof Error \? e\.message : String\(e\)/)
      expect(maths).not.toMatch(/detail: String\(e\) \}/)
    })

    it('is what the ddx branch of draw() asks: no radians written in, no second reading in the mode the maths holds', () => {
      const maths = mathsSource()
      const branch = maths.slice(maths.indexOf("const ddx = input.match("), maths.indexOf('const integ = input.match('))
      expect(branch).toContain('tangentAt(input, { vars: s.vars, ans: s.ans, angle: angleUnit })')
      expect(branch).not.toMatch(/angle: 'rad'|math\.evaluate/)
    })
  })

  describe('H4 — an answer belongs to the angle unit and base it was worked out under', () => {
    const SIN_30 = '\\sin\\left(30\\right)'
    /** An answer as the screen keeps it: worked out under `angle` (and `base`, in Bases) and remembered with them. */
    const held = (mode: FieldMode, latex: string, angle: 'deg' | 'rad', base: Base = 10): Answered => ({ mode, input: latex, angle, base, result: evaluateInput(mode, latex, { ...opts, angle, base })! })

    it('drops sin 30 worked out in degrees when the unit becomes radians: 0.5 sat under a screen whose sin 30 is −0.988', () => {
      const inDeg = held('COMP', SIN_30, 'deg')
      expect(inDeg.result.value).toBeCloseTo(0.5, 12)
      // The answer the old card pretended to be after the switch:
      expect(evaluateInput('COMP', SIN_30, { ...opts, angle: 'rad' })!.value).toBeCloseTo(Math.sin(30), 12)
      expect(answerStillUnder(inDeg, { angle: 'deg', base: 10 })).toBe(inDeg)
      expect(answerStillUnder(inDeg, { angle: 'rad', base: 10 })).toBeNull()
      const inRad = held('COMP', SIN_30, 'rad')
      expect(answerStillUnder(inRad, { angle: 'rad', base: 10 })).toBe(inRad)
      expect(answerStillUnder(inRad, { angle: 'deg', base: 10 })).toBeNull()
    })

    it('drops a Complex answer the same way: its "angle 45°" line is in the unit it was worked out in', () => {
      const inDeg = held('CMPLX', '1+i', 'deg')
      expect(inDeg.result.extra!.join(' ')).toContain('angle 45°')
      expect(answerStillUnder(inDeg, { angle: 'deg', base: 10 })).toBe(inDeg)
      expect(answerStillUnder(inDeg, { angle: 'rad', base: 10 })).toBeNull()
    })

    it('drops a Bases answer when the base changes: FF is a number in hex and a refusal in decimal', () => {
      const hex = held('BASE-N', 'FF', 'deg', 16)
      expect(hex.result.error).toBeUndefined()
      expect(evaluateInput('BASE-N', 'FF', { ...opts, base: 10 })!.error).toBeDefined()
      expect(answerStillUnder(hex, { angle: 'deg', base: 16 })).toBe(hex)
      expect(answerStillUnder(hex, { angle: 'deg', base: 10 })).toBeNull()
      expect(answerStillUnder(hex, { angle: 'deg', base: 2 })).toBeNull()
    })

    it('leaves an answer alone when the other setting changes: an angle unit means nothing to a number in hex, a base nothing to sin 30', () => {
      const hex = held('BASE-N', 'FF', 'deg', 16)
      expect(answerStillUnder(hex, { angle: 'rad', base: 16 })).toBe(hex)
      const comp = held('COMP', '2+3', 'deg')
      expect(answerStillUnder(comp, { angle: 'deg', base: 16 })).toBe(comp)
      const cmplx = held('CMPLX', '1+i', 'rad')
      expect(answerStillUnder(cmplx, { angle: 'rad', base: 2 })).toBe(cmplx)
    })

    it('has nothing to keep when there is nothing, and hands back the same object when nothing changed (a keystroke is no render)', () => {
      expect(answerStillUnder(null, { angle: 'deg', base: 10 })).toBeNull()
      const a = held('COMP', '2+3', 'deg')
      expect(answerStillUnder(a, { angle: 'deg', base: 10 })).toBe(a)
    })

    it('the screen keeps the unit and base with every answer and checks them as it renders', () => {
      const maths = mathsSource()
      expect(maths).toMatch(/answerStillUnder\(answered, \{ angle: angleUnit, base \}\)/)
      // A stale answer is dropped from the state itself while rendering (no stale paint, no effect), so DEG → RAD → DEG
      // does not bring the old card back under a line the student never worked out again.
      expect(maths).toMatch(/if \(held !== answered\) setAnswered\(held\)/)
      // Every answer the screen makes — a fresh one, or the error that replaces it — carries the settings.
      const made = maths.match(/\{ mode, input: [^}]*\}/g) ?? []
      expect(made.length).toBeGreaterThanOrEqual(2)
      for (const m of made) expect(m).toMatch(/angle: angleUnit, base/)
      // The two subscriptions that follow the line are untouched (pinned above): they have no settings to compare.
      expect(maths).toMatch(/useCalc\.subscribe\(\(s, prev\) => \{\s*if \(s\.input !== prev\.input\) setAnswered\(\(a\) => answerStillFor\(a, s\.input\)\)/)
    })
  })

  describe('H5 — "with values…" says which box it cannot read', () => {
    it('reads a box the way the rest of the calculator reads a number', () => {
      const r = readValueBoxes({ A: '1/2', B: 'sqrt(9)', C: '2ᴇ3', D: '50%', E: 'π', F: ' 2 × 3 ' }, 'deg')
      expect(r).toEqual({ ok: true, values: { A: 0.5, B: 3, C: 2000, D: 0.5, E: Math.PI, F: 6 } })
    })

    it('reads a box that uses sin in the screen’s unit, whatever mode the maths holds', () => {
      for (const held of ['deg', 'rad'] as const) {
        setAngleMode(held)
        expect(readValueBoxes({ A: 'sin(30)' }, 'deg'), `held ${held}`).toEqual({ ok: true, values: { A: expect.closeTo(0.5, 12) } })
        expect(readValueBoxes({ A: 'sin(30)' }, 'rad'), `held ${held}`).toEqual({ ok: true, values: { A: expect.closeTo(Math.sin(30), 12) } })
        expect(getAngleMode(), `held ${held}`).toBe(held)
      }
    })

    it('names the letter whose box cannot be read, and what to type, for every kind of unreadable box', () => {
      // Letters, nothing at all, a half-typed sum, a comma, a division by zero, a number with an i, a unit.
      // true and a quoted "2" are not numbers either: mathjs gives a boolean and a string, which Number() turned into 1 and 2.
      for (const bad of ['', '   ', 'abc', 'x', '2+', '1,5', '1/0', 'sqrt(-1)', 'i', '5 cm', 'true', '"2"']) {
        const r = readValueBoxes({ A: '2', B: bad }, 'deg')
        expect(r.ok, JSON.stringify(bad)).toBe(false)
        if (r.ok) continue
        expect(r.letters, JSON.stringify(bad)).toEqual(['B'])
        expect(r.sentence, JSON.stringify(bad)).toBe('I cannot read the value of B. Type a number, such as 2, 0.5 or 1/3.')
      }
    })

    it('names every letter it cannot read, in the order of the boxes', () => {
      const two = readValueBoxes({ A: 'x', B: '1', C: '2+' }, 'deg')
      expect(two).toEqual({ ok: false, letters: ['A', 'C'], sentence: 'I cannot read the values of A and C. Type a number, such as 2, 0.5 or 1/3.' })
      const three = readValueBoxes({ A: '', B: 'q', C: '', D: '4' }, 'deg')
      expect(three).toMatchObject({ ok: false, letters: ['A', 'B', 'C'] })
      expect((three as { sentence: string }).sentence).toMatch(/^I cannot read the values of A, B and C\. /)
    })

    it('leaves what the student typed alone and speaks plain words', () => {
      const typed = Object.freeze({ A: '2+', B: '3' })
      const r = readValueBoxes(typed, 'deg')
      expect(typed).toEqual({ A: '2+', B: '3' })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.sentence).not.toMatch(/error|undefined|NaN|Infinity|syntax|symbol/i)
    })

    it('the form reads its boxes through it, keeps them when one fails, and says so where a screen reader will hear it', () => {
      const maths = mathsSource()
      const form = maths.slice(maths.indexOf('function WithValuesForm'), maths.indexOf('function VariablesDrawer'))
      expect(form).toContain('readValueBoxes(vals, angleUnit)')
      expect(form).not.toMatch(/math\.evaluate/)
      expect(form).toMatch(/role="alert"/)
      // The boxes are state the failed press never touches, and typing in one clears the sentence about it.
      expect(form).toMatch(/setVals\(\{ \.\.\.vals, \[v\]: e\.target\.value \}\)/)
    })

    it('a different set of letters gets a fresh form, so a box that is no longer on the screen is never read or named', () => {
      // The form kept its boxes' text from the first letters: with A and B open and junk left in A, "with values…" on a
      // line that uses C read A's junk and answered "I cannot read the value of A" with no A box in sight.
      const maths = mathsSource()
      expect(maths).toMatch(/<WithValuesForm[^>]*?key=\{withValues\.join\(','\)\}/)
    })
  })

  describe('the angle a line is worked out in reaches everything that reads its numbers after the engine returns', () => {
    const EQ = 'x^{2}+1+\\sin\\left(30\\right)=0'

    it('x² + 1 + sin 30 = 0 names the roots of the polynomial the screen’s unit makes, whatever mode the maths holds', () => {
      // polynomialInX read sin 30 after evaluateComp had returned, in whatever mode was then set: on a RAD screen with
      // degrees held the roots were ±1.2247i (1 + sin 30° = 1.5) where the screen's x² + 1 + sin 30 is 0.01197.
      for (const held of ['deg', 'rad'] as const) {
        setAngleMode(held)
        const rad = evaluateInput('COMP', EQ, { ...opts, angle: 'rad' })!
        expect(rad.main, `RAD screen, ${held} held`).toContain('±0.1094000727i')
        const deg = evaluateInput('COMP', EQ, { ...opts, angle: 'deg' })!
        expect(deg.main, `DEG screen, ${held} held`).toContain('±1.224744871i')
        expect(getAngleMode(), `${held} held`).toBe(held)
      }
    })

    it('x² − sin 30 = 0 on a RAD screen says where its roots are instead of "No solution I can find"', () => {
      setAngleMode('deg')
      const r = evaluateInput('COMP', 'x^{2}-\\sin\\left(30\\right)=0', { ...opts, angle: 'rad' })!
      expect(r.error).toBeUndefined()
      expect(r.main).toContain('±0.9939977988i')
    })

    it('a repeated root that is a trig constant is still given as itself: (x + sin 30)² = 0 is x = −0.5 on a DEG screen', () => {
      // The polished root comes from the polynomial's own coefficients; read in radians they are another polynomial,
      // and the search's −0.4999999404 was shown as it was found.
      setAngleMode('rad')
      expect(evaluateInput('COMP', '\\left(x+\\sin\\left(30\\right)\\right)^{2}=0', { ...opts, angle: 'deg' })!.main).toBe('x = −0.5')
      setAngleMode('deg')
      expect(evaluateInput('COMP', '\\left(x+\\sin\\left(30\\right)\\right)^{2}=0', { ...opts, angle: 'deg' })!.main).toBe('x = −0.5')
    })

    it('Complex mode puts the angle mode back, as Numbers mode does', () => {
      // evaluateInput set the mode for the line and never undid it: after one Complex answer in radians the next bare
      // evaluation anywhere (the Table, a tangent) worked in radians without a word.
      setAngleMode('deg')
      const r = evaluateInput('CMPLX', '1+i', { ...opts, angle: 'rad' })!
      expect(r.extra!.join(' ')).toContain('angle 0.7853981634 rad')
      expect(getAngleMode()).toBe('deg')
      setAngleMode('rad')
      expect(evaluateInput('CMPLX', '1+i', { ...opts, angle: 'deg' })!.extra!.join(' ')).toContain('angle 45°')
      expect(getAngleMode()).toBe('rad')
    })

    it('Complex mode refuses A = 5 in words, as Numbers mode does, instead of answering 5 and storing nothing', () => {
      for (const line of ['A=5', 'M=2+3i', '(A=5)']) {
        const r = evaluateInput('CMPLX', line, { ...opts, vars: { A: 1 } })!
        expect(r.error?.sentence, line).toMatch(/^Typing \S+ = … does not store a value\. Under Variables, /)
        expect(r.value, line).toBeUndefined()
        expect(r.main, line).toBe('')
      }
      // An ordinary complex line is untouched.
      expect(evaluateInput('CMPLX', '2+3i', opts)!.main).toBe('2 + 3i')
    })

    it('draw() runs every line it reads — limits, points, a sum’s terms — in the screen’s unit', () => {
      const maths = mathsSource()
      expect(maths).toMatch(/const draw = \(input: string\): boolean => withAngle\(angleUnit, \(\) => drawLine\(input\)\)/)
      expect(maths).toMatch(/import \{[^}]*\bwithAngle\b[^}]*\} from '\.\.\/calc\/engine'/)
    })
  })
})
