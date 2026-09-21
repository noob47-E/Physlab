// The Maths screen's decisions: from the field's LaTeX to what is shown, without a DOM.
//
// evaluateInput is the join between MathLive's LaTeX, the converter and the engine, and the
// sentence a student reads when any of them refuses. It never throws and never says "ERROR".

import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { answerStillFor, evaluateInput, isHeavy, lettersIn, linearOf, mainLine } from '../src/renderer/src/calc/evaluateInput'
import { errorSentence, nonFiniteSentence, outsideBaseSentence } from '../src/renderer/src/calc/errors'
import { evaluateComp, formatValue, solveNumeric, tidyComplex } from '../src/renderer/src/calc/engine'
import { math } from '../src/renderer/src/math/expr'
import { calcNum } from '../src/renderer/src/calc/format'
import { FIELD_MODES, MODE_LABELS, fieldAfterWorking, isFieldMode, useCalc } from '../src/renderer/src/calc/calcStore'
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
      expect(r.error!.sentence, line).toMatch(/A to F, M, x or y/)
      expect(r.error!.detail, line).toBeUndefined()
    }
  })

  it('answers the Complex field’s other refusals in words', () => {
    // A lower-case re is the electron radius in the constants list, so mathjs said "'re' is
    // not a function; its value is: 2.8179403262e-15".
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
    expect(mainLine(r, true)).toBe('8.36991×10^6')
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
      "'re' is not a function; its value is:\n  2.8179403262e-15",
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
    // The one path left is app/contextActions.ts → panels/VectorCalc.tsx → ui/MathInput.tsx.
    // The store it wants, addVectorFromScene, now lives in panels/vectorCalcStore.ts with no
    // field in it; the import line in contextActions.ts belongs to another track and is
    // repointed at merge, and this list becomes empty then.
    expect(withField).toEqual(['panels/VectorCalc.tsx', 'ui/MathInput.tsx'])
    expect(eager.has('panels/vectorCalcStore.ts')).toBe(true)
  })

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
    // Drawing goes to the viewport tab beside this screen, where a hidden drawing used to land.
    expect(maths).toMatch(/if \(draw\(input\)\) showPanel\('viewport'\)/)
  })

  it('does not start the algebra engine twice', () => {
    // app/layout.ts warms SymPy once when the calculator opens; the old panel did it again on
    // every mount, unguarded.
    expect(readSource('src/renderer/src/panels/Maths.tsx')).not.toMatch(/warmupCas/)
    expect(readSource('src/renderer/src/app/layout.ts')).toMatch(/if \(id === 'calculator' && !casWarmed\)/)
  })
})

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
