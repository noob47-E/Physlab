import { describe, expect, it, vi } from 'vitest'
import katex from 'katex'
import { JOBS, runPure, suggestJob, type JobId } from '../src/renderer/src/math/pure/run'
import { workedFor } from './helpers/calculusFixtures'
import { JUST_A_NUMBER, JUST_A_WHOLE_NUMBER, isNumericLine } from '../src/renderer/src/math/pure/factor'
import { readSource } from './helpers/repo'
import { Steps, texToPlain, type Working } from '../src/renderer/src/math/pure/work'
import { checkTone, fieldHasText, initialShown, offeredJob, resolveJob, stepPrefFrom } from '../src/renderer/src/math/pure/reveal'
import { agreesNumerically } from '../src/renderer/src/math/pure/complex'
import { evalDisplayedSum } from '../src/renderer/src/math/pure/latexCheck'
import { rStr, rat } from '../src/renderer/src/math/pure/rat'
import { latexToMath } from '../src/renderer/src/math/latexToMath'
import { usePure } from '../src/renderer/src/math/pure/store'
import { writeTimes } from '../src/renderer/src/math/pure/mono'
import { math, preprocess } from '../src/renderer/src/math/expr'
import { texPrecise, type DigitSettings } from '../src/renderer/src/math/format'
import { calcNum, setCalcPrecisionSource } from '../src/renderer/src/calc/format'
import { evaluateInput } from '../src/renderer/src/calc/evaluateInput'
import { scene } from '../src/renderer/src/core/store'

describe('long division', () => {
  it('divides exactly and says so', () => {
    const w = runPure('divide', '(x^3 - 6x^2 + 11x - 6)/(x - 1)')
    expect(w.error).toBeUndefined()
    expect(w.answers[0].tex).toBe('x^{2} - 5x + 6')
    expect(w.answers[1].tex).toBe('0')
  })

  it('reports a remainder', () => {
    const w = runPure('divide', '(x^3 - 2x^2 + 3x - 4)/(x - 1)')
    expect(w.answers[0].tex).toBe('x^{2} - x + 2')
    expect(w.answers[1].tex).toBe('-2')
    expect(w.answers[2].label).toBe('Altogether')
  })

  it('stops when the top is smaller than the bottom', () => {
    const w = runPure('divide', '(x + 1)/(x^2 + 1)')
    expect(w.answers[0].tex).toBe('0')
    expect(w.answers[1].tex).toBe('x + 1')
  })

  it('mentions the remainder theorem for a linear divisor', () => {
    const w = runPure('divide', '(x^3 - 2x^2 + 3x - 4)/(x - 1)')
    expect(w.moves.some((m) => m.rule?.includes('remainder theorem'))).toBe(true)
  })

  it('brackets a fractional coefficient when it speaks a term', () => {
    // "1/2x²" reads as one over 2x²; the sentence has to say (1/2)x². The tex is untouched.
    const w = runPure('divide', '(x^3 + 1)/(2x + 1)')
    const heads = w.moves.map((m) => texToPlain(m.head))
    expect(heads[0]).toBe('Divide x³ by 2x to get (1/2)x² — that is the next piece of the answer.')
    expect(heads[1]).toBe('Multiply (1/2)x² by the divisor and take the result away.')
    expect(heads[2]).toBe('Divide (-1/2)x² by 2x to get (-1/4)x — that is the next piece of the answer.')
    // The constant piece is a bare fraction and needs no bracket.
    expect(heads[4]).toBe('Divide (1/4)x by 2x to get 1/8 — that is the next piece of the answer.')
    expect(w.moves[0].tex).toBe(String.raw`\dfrac{x^{3}}{2x} = \frac{1}{2}x^{2}`)
    for (const h of heads) expect(h).not.toMatch(/\d\/\d+[a-z]/)
  })
})

describe('partial fractions', () => {
  it('splits two distinct linear factors by cover-up', () => {
    const w = runPure('partial', '(3x + 5)/((x + 1)(x + 2))')
    expect(w.error).toBeUndefined()
    expect(w.method).toBe('Cover-up rule')
    expect(w.check).toMatch(/the original/)
    // 3x + 5 over (x+1)(x+2) is 2/(x+1) + 1/(x+2).
    expect(w.answers[0].tex).toMatch(/\\dfrac\{2\}/)
    expect(w.answers[0].tex).toMatch(/\\dfrac\{1\}/)
  })

  it('handles a repeated factor', () => {
    const w = runPure('partial', '(x + 3)/((x + 1)^2)')
    expect(w.error).toBeUndefined()
    expect(w.check).toMatch(/the original/)
  })

  it('handles an irreducible quadratic factor', () => {
    const w = runPure('partial', '(2x + 1)/((x + 1)(x^2 + 1))')
    expect(w.error).toBeUndefined()
    expect(w.check).toMatch(/the original/)
  })

  it('divides out an improper fraction first', () => {
    const w = runPure('partial', '(x^3)/((x + 1)(x + 2))')
    expect(w.error).toBeUndefined()
    expect(w.moves[0].head).toMatch(/divide first/)
    expect(w.check).toMatch(/the original/)
  })
})

describe('complex numbers', () => {
  it('multiplies and shows i squared becoming minus one', () => {
    const w = runPure('complex', '(2 + 3i)(4 - 5i)')
    expect(w.error).toBeUndefined()
    expect(w.answers[0].tex).toBe('23 + 2i')
    expect(w.moves.some((m) => m.tex === 'i^2 = -1' || m.rule?.includes('i^2 = -1'))).toBe(true)
  })

  it('divides using the conjugate', () => {
    const w = runPure('complex', '(2 + 3i)/(1 - i)')
    expect(w.error).toBeUndefined()
    // (2+3i)(1+i)/2 = (-1 + 5i)/2
    expect(w.answers[0].tex).toBe('-\\frac{1}{2} + \\frac{5}{2}i')
    expect(w.moves.some((m) => m.head.includes('conjugate'))).toBe(true)
  })

  it('reduces high powers of i', () => {
    const w = runPure('complex', 'i^7 + i^2')
    expect(w.error).toBeUndefined()
    expect(w.answers[0].tex).toBe('-1 - i')
  })

  it('reports modulus, argument and conjugate', () => {
    const w = runPure('complex', '3 + 4i')
    expect(w.answers.find((a) => a.label === 'Modulus')?.tex).toBe('5')
    expect(w.answers.find((a) => a.label === 'Conjugate')?.tex).toBe('3 - 4i')
  })

  it('still runs the numeric check on an implicit product like i(2 + 3i)', () => {
    // mathjs alone reads "i(" as a call to a function named i, so the check used to end with no
    // verdict at all while (1 + i)^2 got its tick.
    const w = runPure('complex', 'i(2+3i)')
    expect(w.answers[0].tex).toBe('-3 + 2i')
    expect(w.checked).toBe('ok')
    expect(w.check).toMatch(/same number/)
  })
})

describe('solving quadratics', () => {
  it('gives complex roots when the discriminant is negative', () => {
    const w = runPure('solve', 'x^2 + 4x + 13 = 0')
    expect(w.error).toBeUndefined()
    expect(w.answers[0].tex).toBe('-2 + 3i')
    expect(w.answers[1].tex).toBe('-2 - 3i')
    expect(w.moves.some((m) => m.rule?.includes('\\sqrt{-1}'))).toBe(true)
  })

  it('gives rational roots when it factorises', () => {
    const w = runPure('solve', 'x^2 - 5x + 6 = 0')
    expect(w.answers.map((a) => a.tex).sort()).toEqual(['2', '3'])
  })

  it('gives a repeated root when the discriminant is zero', () => {
    const w = runPure('solve', 'x^2 + 6x + 9 = 0')
    expect(w.answers).toHaveLength(1)
    expect(w.answers[0].tex).toBe('-3')
  })

  it('gives a surd when the discriminant is positive but not square', () => {
    const w = runPure('solve', 'x^2 - 2x - 1 = 0')
    expect(w.answers[0].tex).toBe('1 + \\sqrt{2}')
    expect(w.answers[1].tex).toBe('1 - \\sqrt{2}')
  })
})

describe('factorising over the complex numbers', () => {
  it('splits a sum of squares', () => {
    const w = runPure('factorComplex', 'x^2 + 4')
    expect(w.error).toBeUndefined()
    expect(w.answers[0].tex).toMatch(/2i/)
  })

  it('goes all the way down on x^4 - 16', () => {
    const w = runPure('factorComplex', 'x^4 - 16')
    expect(w.error).toBeUndefined()
    expect(w.answers[0].tex).toMatch(/2i/)
  })
})

describe('algebraic HCF and LCM', () => {
  it('finds a common bracket', () => {
    const w = runPure('hcf', 'x^2 - 1, x^2 + 2x + 1')
    expect(w.error).toBeUndefined()
    expect(w.answers[0].tex).toBe('\\left(x + 1\\right)')
  })

  it('takes the highest power for the LCM', () => {
    const w = runPure('lcm', 'x^2 - 1, x^2 + 2x + 1')
    expect(w.error).toBeUndefined()
    expect(w.answers[0].tex).toMatch(/\^\{2\}/)
  })

  it('still does plain numbers', () => {
    expect(runPure('hcf', '12, 18, 30').answers[0].tex).toBe('6')
    expect(runPure('lcm', '4, 6, 10').answers[0].tex).toBe('60')
  })
})

describe('the dispatcher', () => {
  it('sends a bare number to prime factors', () => {
    expect(runPure('factor', '360').answers[0].tex).toBe('2^{3} \\times 3^{2} \\times 5')
  })

  it('expands', () => {
    expect(runPure('expand', '(2x + 3)(3x - 1)').answers[0].tex).toBe('6x^{2} + 7x - 3')
  })

  it('expands by showing the distribution, not by restating the answer', () => {
    const w = runPure('expand', '(2x + 3)(3x - 1)')
    expect(w.input).toBe('\\left(2x + 3\\right)\\left(3x - 1\\right)')
    // The heading names the actual brackets; the first step is the each-times-each grid.
    expect(w.moves[0].head).toContain('2x + 3')
    expect(w.moves[0].head).toContain('3x - 1')
    expect(w.moves[0].tex).toContain('\\begin{array}')
    expect(w.moves[0].tex).toContain('6x^{2}')
    expect(w.moves[0].tex).toContain('-2x')
    // Then the products in a line, then the like terms collected.
    expect(w.moves[1].tex).toBe('6x^{2} - 2x + 9x - 3')
    expect(w.moves[2].tex).toBe('6x^{2} + \\left(-2x + 9x\\right) - 3 = 6x^{2} + 7x - 3')
    expect(w.checked).toBe('ok')
    // A square is the bracket written twice, and three brackets are done two at a time.
    expect(runPure('expand', '(x + 1)^2').moves[0].head).toMatch(/x \+ 1.*x \+ 1/)
    const three = runPure('expand', '(x + 1)^2 (x - 2)')
    expect(three.answers[0].tex).toBe('x^{3} - 3x - 2')
    expect(three.moves.filter((m) => m.tex?.includes('\\begin{array}'))).toHaveLength(2)
    expect(three.checked).toBe('ok')
    // A number outside a bracket is distributed too.
    expect(runPure('expand', '3(x + 2)').moves[0].tex).toContain('3x')
  })

  it('expands a sum of products piece by piece and then adds the pieces', () => {
    // (x + 2)² − (x − 2)² used to be one "factor", and the working said there was nothing to
    // multiply out — for a textbook expand question.
    const w = runPure('expand', '(x + 2)^2 - (x - 2)^2')
    expect(w.answers[0].tex).toBe('8x')
    expect(w.checked).toBe('ok')
    expect(w.moves.filter((m) => m.tex?.includes('\\begin{array}'))).toHaveLength(2)
    // The "In …" prefix names the piece as typed, in plain characters: it used to splice the
    // LaTeX \left(x + 2\right) straight into the spoken sentence. Each piece gets its own heading.
    expect(w.moves[0].head).toBe('In (x + 2)(x + 2), multiply every term of (x + 2) by every term of (x + 2).')
    expect(w.moves[0].subgoal).toBe('Multiply out the first piece')
    expect(w.moves.find((m) => m.subgoal === 'Multiply out the second piece')?.head).toBe('In (x - 2)(x - 2), multiply every term of (x - 2) by every term of (x - 2).')
    expect(w.moves[w.moves.length - 1].head).toBe('Put the pieces side by side and collect the like terms once more.')
    expect(w.moves[w.moves.length - 1].subgoal).toBe('Add the pieces together')
    expect(w.moves[w.moves.length - 1].tex).toBe('\\left(x^{2} + 4x + 4\\right) + \\left(-x^{2} + 4x - 4\\right) = 8x')
    expect(w.input).toBe('\\left(x + 2\\right)\\left(x + 2\\right) - \\left(x - 2\\right)\\left(x - 2\\right)')
    const plus = runPure('expand', '(x + 1)(x - 1) + 3')
    expect(plus.answers[0].tex).toBe('x^{2} + 2')
    expect(plus.checked).toBe('ok')
  })

  it('reads x(x + 1) as x times the bracket, not as a function call', () => {
    // The first expand exercise a student meets was refused with '"x" is not something I can
    // factorise', because mathjs reads a letter before a bracket as a call.
    const w = runPure('expand', '2x(x + 1)')
    expect(w.error).toBeUndefined()
    expect(w.answers[0].tex).toBe('2x^{2} + 2x')
    // 2x is one term: the grid distributes 2x over the bracket, not 2 over x first.
    expect(w.moves[0].head).toBe('Multiply every term of 2x by every term of (x + 1).')
    expect(w.moves[0].tex).toContain('\\begin{array}')
    expect(w.checked).toBe('ok')
    expect(runPure('expand', 'x(x + 1)').answers[0].tex).toBe('x^{2} + x')
    expect(runPure('expand', 'x^2(x - 3)').answers[0].tex).toBe('x^{3} - 3x^{2}')
    expect(runPure('factor', 'x(x + 1)').answers[0].tex).toBe('x\\left(x + 1\\right)')
    // A letter inside a longer name is left alone: sin is still a function, and still refused.
    expect(runPure('expand', 'sin(x)').error).toMatch(/sin/)
  })

  it('writes a bracket to a high power out in full, and says that is what it did', () => {
    const seven = runPure('expand', '(x + 1)^7')
    expect(seven.answers[0].tex).toBe('x^{7} + 7x^{6} + 21x^{5} + 35x^{4} + 35x^{3} + 21x^{2} + 7x + 1')
    expect(seven.checked).toBe('ok')
    const nine = runPure('expand', '(x + 1)^9')
    expect(nine.answers[0].tex).toContain('126x^{5}')
    expect(nine.moves[0].head).toMatch(/power that high/)
    expect(nine.check).toMatch(/nothing to check/)
    expect(nine.checked).toBeUndefined()
    // The heading shows what was typed. It used to show the expanded answer as the "input".
    expect(nine.input).toBe('\\left(x + 1\\right)^{9}')
    expect(runPure('expand', '3(x + 1)^9 - 2').input).toBe('3\\left(x + 1\\right)^{9} - 2')
  })

  it('keeps a minus in front of a product as a sign, not as part of the first bracket', () => {
    // mathjs reads −(x + 1)(x − 1) as (−(x + 1))·(x − 1); the grid used to multiply (−x − 1).
    const w = runPure('expand', '-(x + 1)(x - 1)')
    expect(w.input).toBe('-\\left(x + 1\\right)\\left(x - 1\\right)')
    expect(w.moves[0].head).toBe('Multiply every term of (x + 1) by every term of (x - 1).')
    expect(w.answers[0].tex).toBe('-x^{2} + 1')
    expect(w.checked).toBe('ok')
    expect(runPure('expand', '(x + 1)(-(x - 1))').answers[0].tex).toBe('-x^{2} + 1')
  })

  it('knows whether a field holds something to run, even when the converter refuses it', () => {
    expect(fieldHasText('')).toBe(false)
    expect(fieldHasText('  ')).toBe(false)
    expect(fieldHasText('x^{2}+1')).toBe(true)
  })

  it('guesses a sensible job from what was typed', () => {
    expect(suggestJob('360')).toBe('primes')
    expect(suggestJob('12, 18')).toBe('hcf')
    expect(suggestJob('2 + 3i')).toBe('complex')
    expect(suggestJob('x^2 - 4 = 0')).toBe('solve')
    expect(suggestJob('6x^2 + 7x - 3')).toBe('factor')
    expect(suggestJob('(3x+5)/((x+1)(x+2))')).toBe('partial')
    expect(suggestJob('(x^3-1)/(x-1)')).toBe('divide')
  })

  it('factorises the bottom before choosing between division and partial fractions', () => {
    // No visible bracket pair, but x² − 4 is (x − 2)(x + 2): a partial-fractions question.
    expect(suggestJob('1/(x^2-4)')).toBe('partial')
    expect(suggestJob('(x+3)/(x^2+2x+1)')).toBe('partial')
    expect(suggestJob('(x^2+1)/(x^3-2)')).toBe('divide')
    expect(suggestJob('(x+1)/(x^2+1)')).toBe('divide')
  })

  it('sends a quadratic with no real roots to Factorise with i', () => {
    expect(suggestJob('x^2 + 4')).toBe('factorComplex')
    expect(suggestJob('x^2 + x + 1')).toBe('factorComplex')
    expect(suggestJob('x^2 - 4')).toBe('factor')
    expect(suggestJob('x^4 + 4')).toBe('factor')
    // x⁴ + 1 only splits with a surd middle term, which is the i tool's job; Auto used to send
    // it to the real factoriser, which told the student it does not factorise.
    expect(suggestJob('x^4 + 1')).toBe('factorComplex')
    expect(suggestJob('x^4 + 2x^2 + 4')).toBe('factorComplex')
    // Neither tool can write √3 ± √2 as one surd, so this stays with the honest real answer.
    expect(suggestJob('x^4 - 10x^2 + 1')).toBe('factor')
  })

  it('tells a plain sum apart from an expression', () => {
    expect(isNumericLine('2/3+sqrt(2)')).toBe(true)
    expect(isNumericLine('1/2+1/3')).toBe(true)
    expect(isNumericLine('sin(30)*pi')).toBe(true)
    expect(isNumericLine('2*3+4')).toBe(true)
    expect(isNumericLine('x^2-4')).toBe(false)
    expect(isNumericLine('sqrt(x)')).toBe(false)
    expect(isNumericLine('2+3i')).toBe(false)
  })

  it('refuses a plain sum in one sentence that says what to do instead', () => {
    // Work it out on 2/3 + √2 went to Divide and said "sqrt is not something I can factorise";
    // on 1/2 + 1/3 it named "Factorise number", a job the Treat-as list had stopped offering.
    // A whole number is the one that has working of its own, and the sentence names that job
    // by the label the list shows.
    expect(suggestJob('2/3+sqrt(2)')).toBe('factor')
    expect(suggestJob('1/2+1/3')).toBe('factor')
    // P22b: a line with a root in it is simplified (here it is already as simple as it gets, and
    // says so); only a sum of plain numbers keeps this sentence.
    expect(runPure('factor', '2/3+sqrt(2)').error).toBeUndefined()
    expect(runPure('factor', '2/3+sqrt(2)').title).toBe('Simplify surds')
    expect(runPure('factor', '1/2+1/3').error).toBe(JUST_A_NUMBER)
    expect(JUST_A_NUMBER).toMatch(/= gives its value/)
    expect(runPure('divide', '5/6').error).toBeTruthy()
    const primes = JOBS.find((j) => j.id === 'primes')!
    expect(JUST_A_WHOLE_NUMBER).toContain(`"${primes.label}"`)
    expect(JUST_A_WHOLE_NUMBER).toContain('Treat as')
    expect(JUST_A_WHOLE_NUMBER).not.toMatch(/Factorise number/)
    // A whole number written as a sum still gets its primes, and its own title.
    expect(suggestJob('2*3+4')).toBe('factor')
    expect(runPure('factor', '2*3+4').error).toBeUndefined()
    expect(runPure('factor', '2*3+4').title).toBe('Factorise 10 into primes')
    // The old sentence is gone from the engine altogether.
    expect(readSource('src/renderer/src/math/pure/factor.ts')).not.toMatch(/Factorise number/)
  })

  it('never throws, whatever it is given', () => {
    const junk = ['', '   ', ')(', 'sin(x)', '!!!', '1/0', 'x^-2', '0', 'pi', '=', 'x=', '((((']
    for (const j of junk) {
      for (const job of JOBS) {
        const w = runPure(job.id, j)
        // Either a readable error or a real answer — never a crash, never an empty shell.
        expect(Boolean(w.error) || w.answers.length > 0, `${job.id} on "${j}"`).toBe(true)
      }
    }
  })

  it('every example offered in the UI actually works', () => {
    for (const job of JOBS) {
      // Integrate and Differentiate are worked by SymPy: theirs is set out from its recorded reply.
      const w = workedFor(job.id, job.example)
      expect(w.error, `${job.id}: ${job.example}`).toBeUndefined()
      expect(w.answers.length, job.id).toBeGreaterThan(0)
      expect(w.moves.length, job.id).toBeGreaterThan(0)
    }
  })

  it('never shows working it could not verify', () => {
    const cases = ['6x^2+7x-3', 'x^4-16', 'x^3-6x^2+11x-6', 'x^2-y^2', '2x^2-8']
    for (const c of cases) {
      expect(runPure('factor', c).check, c).not.toMatch(/suspicion/)
    }
    for (const c of ['(3x+5)/((x+1)(x+2))', '(x+3)/((x+1)^2)', '(2x+1)/((x+1)(x^2+1))']) {
      expect(runPure('partial', c).check, c).not.toMatch(/suspicion/)
    }
  })
})

// One representative input per branch of every generator this suite covers, chosen to walk
// through several stages of each so more than the happy path is checked. Shared by the wording
// checks below: a head that regresses on one of these branches has to fail, not only one that
// regresses on the panel's ten examples.
const STAGE_WALK: [JobId, string][] = [
  ['primes', '360'],
  ['primes', '97'], // already prime
  ['primes', '-360'], // the minus sign kept outside
  ['hcf', '12, 18, 30'],
  ['lcm', '12, 18, 30'],
  ['hcf', 'x^2 - 1, x^2 + 2x + 1'],
  ['lcm', 'x^2 - 1, x^2 + 2x + 1'],
  ['factor', '6x^2 + 7x - 3'], // splitting the middle term
  ['factor', 'x^4 - 16'], // difference of squares, twice
  ['factor', '27a^3 + 8b^3'], // sum of cubes
  ['factor', 'x^2 + 6x + 9'], // perfect square
  ['factor', 'x^3 - 6x^2 + 11x - 6'], // a root found by trial, peeled off
  ['factor', '2x^3 - 3x^2 - 3x + 2'], // a fractional root: (2x − 1) peeled off
  ['factor', 'x^4 + 5x^2 + 4'], // substitution
  ['factor', 'x^20 + 5x^10 + 4'], // substitution with a two-digit power in the sentences
  ['factor', 'x^4 + 4'], // completing the square
  ['factor', '2x^3 - x^2 - 2x + 1'], // grouping
  ['factor', '(x + 1)^2 - 4'], // a bracket multiplied out first
  ['expand', '(2x + 3)(3x - 1)'],
  ['expand', '(x + 2)^2 - (x - 2)^2'], // more than one piece
  ['expand', '(x + 1)^5'], // one piece, several brackets
  ['divide', '(x^3 - 6x^2 + 11x - 6)/(x - 1)'],
  ['divide', '(x^3 + 1)/(2x + 1)'], // fractions on the staircase
  ['partial', '(3x + 5)/((x + 1)(x + 2))'], // cover-up rule
  ['partial', '(3x + 5)/((2x + 1)(x + 2))'], // cover-up with a fractional root
  ['partial', '(2x + 1)/((x + 1)(x^2 + 1))'], // equating coefficients
  ['partial', '(x^3)/((x + 1)(x + 2))'], // improper, divided first
  ['complex', '(2 + 3i)(4 - 5i)'], // no fraction
  ['complex', '(2 + 3i)/(1 - i)'], // division by the conjugate
  ['complex', '3 + 4i'], // modulus, argument, conjugate
  ['solve', 'x^2 + 4x + 13 = 0'], // complex roots
  ['solve', 'x^2 - 5x + 6 = 0'], // real roots
  ['solve', 'x/2 + 1 = 4'], // linear, a fraction in front
  ['solve', '2x + 1 = 7'], // linear, whole coefficient
  ['factorComplex', 'x^2 + 4'],
  ['factorComplex', 'x^4 - 16'],
  ['factorComplex', 'x^4 + 1'] // the surd-completed-square branch
]

type Walked = [where: string, w: ReturnType<typeof runPure>]

/** Every worked answer the wording checks walk: the panel's examples and the branch walk above. */
const everyWorking = (): Walked[] => [
  ...JOBS.map((job): Walked => [`${job.id} "${job.example}"`, workedFor(job.id, job.example)]),
  ...STAGE_WALK.map(([job, src]): Walked => [`${job} "${src}"`, runPure(job, src)])
]

describe('the check sentence', () => {
  it('reads as words, not as LaTeX', () => {
    expect(texToPlain(String.raw`6x^{2} + 7x - 3`)).toBe('6x² + 7x - 3')
    expect(texToPlain(String.raw`\left(x + 1\right)`)).toBe('(x + 1)')
    expect(texToPlain(String.raw`2^{3} \times 3^{2} \times 5`)).toBe('2³ × 3² × 5')
    expect(texToPlain(String.raw`\dfrac{3}{4}`)).toBe('3/4')
    expect(texToPlain(String.raw`\text{HCF} = 6`)).toBe('HCF = 6')
    expect(texToPlain(String.raw`\sqrt{2}`)).toBe('√2')
  })

  it('leaves no backslashes or braces anywhere a student can see', () => {
    // Everything read as a sentence — the check line, every step heading, every note, every
    // stage heading — goes through texToPlain before it is shown, so none of it may still look
    // like LaTeX afterwards.
    for (const [where, w] of everyWorking()) {
      const sentences = [w.check ?? '', ...w.moves.map((m) => m.head), ...w.moves.map((m) => m.note ?? ''), ...w.moves.map((m) => m.subgoal ?? '')]
      for (const raw of sentences) {
        expect(texToPlain(raw), `${where}: ${raw}`).not.toMatch(/[\\{}]/)
      }
    }
  })

  it('never puts LaTeX straight into a head, even before texToPlain runs', () => {
    // A head is a spoken sentence; only `tex` and `rule` are meant to carry backslashes. Checking
    // the raw string (not the texToPlain'd one) catches a head that was written as LaTeX by
    // mistake, which texToPlain would otherwise quietly clean up and hide. The branch walk is in
    // here as well as the panel's examples: the factor-theorem head and expand's "In …" prefix
    // both spliced \left(…\right) into a sentence on branches the examples never reach.
    for (const [where, w] of everyWorking()) {
      expect(w.error, where).toBeUndefined()
      for (const m of w.moves) {
        expect(m.head, `${where}: ${m.head}`).not.toMatch(/\\/)
      }
    }
  })
})

describe('subgoal labels', () => {
  it('every generator names what each stage of its working is for', () => {
    for (const [where, w] of everyWorking()) {
      expect(w.error, where).toBeUndefined()
      expect(w.moves.some((m) => m.subgoal), `${where} set no subgoal`).toBe(true)
    }
  })

  it('a subgoal is a short plain label, never LaTeX', () => {
    for (const [where, w] of everyWorking()) {
      for (const m of w.moves) {
        if (!m.subgoal) continue
        expect(m.subgoal, `${where}: ${m.subgoal}`).not.toMatch(/\\/)
        expect(m.subgoal.split(/\s+/).length, `${where}: ${m.subgoal}`).toBeLessThanOrEqual(5)
      }
    }
  })

  it('never heads two stages in a row with the same words', () => {
    // A long division used to say "Divide the leading terms" above every row of the staircase,
    // and (x + 1)⁵ said "Multiply the brackets out" four times: a heading that repeats verbatim
    // stops reading as "what we are doing now".
    for (const [where, w] of everyWorking()) {
      const headings = w.moves.map((m) => m.subgoal).filter((g): g is string => g !== undefined)
      headings.forEach((g, i) => {
        if (i > 0) expect(g, `${where}: "${g}" twice in a row`).not.toBe(headings[i - 1])
      })
    }
  })

  it('the remainder-theorem check is its own stage, not part of the staircase', () => {
    // The check by f(a) used to sit under "Set out the long division" as if it were another row.
    const w = runPure('divide', '(x^3 - 6x^2 + 11x - 6)/(x - 1)')
    const check = w.moves.find((m) => m.head.startsWith('Check the remainder'))
    expect(check?.subgoal).toBe('Check the remainder quickly')
  })

  it('a two-digit power in a heading is two superscript digits, not one and a digit', () => {
    // texToPlain reads ^ the way LaTeX does, so an unbraced x^10 came out as "x¹0".
    const w = runPure('factor', 'x^20 + 5x^10 + 4')
    expect(w.moves[0].subgoal).toBe('Substitute for x^{10}')
    expect(texToPlain(w.moves[0].subgoal ?? '')).toBe('Substitute for x¹⁰')
    expect(texToPlain(w.moves[0].head)).toContain('Write u = x¹⁰ ')
    expect(texToPlain(w.moves[2].head)).toBe('Put x¹⁰ back in place of u.')
    expect(w.check).not.toMatch(/suspicion/)
  })

  it('a bracket typed as a power is not a bracket to multiply out', () => {
    // The Maths screen hands 6x² + 9x over as 6x^(2)+9x, and that used to open the working with
    // a "Multiply out first" stage whose maths was just the question again.
    const w = runPure('factor', latexToMath('6x^2+9x'))
    expect(w.moves).toHaveLength(1)
    expect(w.moves[0].subgoal).toBe('Take out the common factor')
    expect(w.moves[0].head).toBe('Every term has 3x in it, so take it out at the front.')
    // A real bracket still is.
    expect(runPure('factor', '(x + 1)^2 - 4').moves[0].subgoal).toBe('Multiply out first')
  })

  it('Steps.goal names the very next move, and only that one', () => {
    const s = new Steps()
    s.goal('Find the common factor').add('First step.')
    s.add('Second step, no goal of its own.')
    s.goal('Check by multiplying back').add('Third step.')
    expect(s.moves.map((m) => m.subgoal)).toEqual(['Find the common factor', undefined, 'Check by multiplying back'])
  })

  it('Steps.goal ignores the stage that is already running', () => {
    // splitQuadratic is called once per quadratic factor of x⁴ + 1 and names its stage each
    // time; the second call must not put the same heading up again.
    const s = new Steps()
    s.goal('Split each quadratic factor').add('The first one.')
    s.goal('Split each quadratic factor').add('The second one.')
    s.goal('Write the finished factors').add('Together.')
    s.goal('Split each quadratic factor').add('A later stage with the old name is a new heading.')
    expect(s.moves.map((m) => m.subgoal)).toEqual(['Split each quadratic factor', undefined, 'Write the finished factors', 'Split each quadratic factor'])
  })
})

// ---------------------------------------------------------------------------
// Regressions from the 0.3.3 repairs. Each of these shipped green, so each one
// gets a test that fails loudly if it ever comes back.
// ---------------------------------------------------------------------------

describe('a negative highest power', () => {
  it('factorises instead of giving up', () => {
    const w = runPure('factor', '-x^2 + 5x - 6')
    expect(w.check).not.toMatch(/does not break into simpler factors/)
    expect(w.check).not.toMatch(/suspicion/)
    expect(w.answers[0].tex).toMatch(/x - 2/)
    expect(w.answers[0].tex).toMatch(/x - 3/)
    expect(w.answers[0].tex.startsWith('-')).toBe(true)
  })

  it('writes the sign as a minus, never as -1(...)', () => {
    for (const src of ['-x^2 + 5x - 6', '-2x^2 - 5x - 2', '-x^3 + 6x^2 - 11x + 6']) {
      // `\l` in a regex is just `l`, so the old pattern looked for "-1left" and could never fail.
      expect(runPure('factor', src).answers[0].tex, src).not.toMatch(/-1\\left/)
    }
  })

  it('carries the sign through a cubic without tripping its own check', () => {
    const w = runPure('factor', '-x^3 + 6x^2 - 11x + 6')
    expect(w.check).not.toMatch(/suspicion/)
  })

  it('is honest when only the sign can come out', () => {
    const w = runPure('factor', '-x^2 - 1')
    expect(w.check).toMatch(/most that can be taken out is the minus sign/)
  })

  it('never claims a wrong answer, over many generated products', () => {
    // Deterministic, so a failure is reproducible.
    let seed = 12345
    const rnd = (n: number): number => {
      seed = (seed * 16807) % 2147483647
      return seed % n
    }
    const pick = (): string => {
      const p = 1 + rnd(4)
      const q = rnd(13) - 6 || 1
      return `(${p}x ${q < 0 ? '-' : '+'} ${Math.abs(q)})`
    }
    for (let i = 0; i < 200; i++) {
      const body = Array.from({ length: 2 + rnd(2) }, pick).join('*')
      for (const src of [body, `-(${body})`]) {
        const w = runPure('factor', src)
        expect(w.check ?? '', src).not.toMatch(/suspicion/)
        expect(w.error, src).toBeUndefined()
      }
    }
  })
})

describe('partial fractions show what they checked', () => {
  it('gets the sign right on an irreducible quadratic', () => {
    // The old string-patching turned this into something that is 0 at x = 0, not 1.
    const w = runPure('partial', '1/((x + 1)(x^2 + 1))')
    expect(w.check).toMatch(/the original/)
    // The minus belongs to the first term of the numerator, not to the whole fraction. The ½ is
    // cleared into the bottom, so no fraction sits inside another (Fix 4).
    expect(w.answers[0].tex).toContain(String.raw`+ \dfrac{-x + 1}{2\left(x^{2} + 1\right)}`)
    // And the strongest form of the same claim: what is displayed is 1 at x = 0, not 0.
    expect(rStr(evalDisplayedSum(w.answers[0].tex, 'x', rat(0n))!)).toBe('1')
  })

  it('never leaves a "+ -" or a negated whole fraction in the answer', () => {
    for (const src of [
      '1/((x + 1)(x^2 + 1))',
      '(2x + 1)/((x + 1)(x^2 + 1))',
      '(x^2 - 1)/((x + 2)(x^2 + 4))',
      '(-2x + 1)/((x - 1)(x + 3))',
      '(x^3)/((x + 1)(x + 2))'
    ]) {
      const w = runPure('partial', src)
      expect(w.check, src).toMatch(/the original/)
      expect(w.answers[0].tex, src).not.toMatch(/\+ -/)
    }
  })
})

describe('HCF and LCM of algebra', () => {
  it('compares powers of the same letter', () => {
    expect(runPure('hcf', 'x^2, x^3').answers[0].tex).toBe('x^{2}')
    expect(runPure('hcf', '12x^3, 18x^2').answers[0].tex).toBe('6x^{2}')
    expect(runPure('hcf', 'x^3 + x^2, x^2 + 2x').answers[0].tex).toBe('x')
    expect(runPure('hcf', '12x^3*y^2, 6x^2*y^4').answers[0].tex).toBe('6x^{2}y^{2}')
    expect(runPure('hcf', '6x^2*y, 9x*y^2').answers[0].tex).toBe('3xy')
  })

  it('takes the highest power for the LCM', () => {
    expect(runPure('lcm', '12x^3, 18x^2').answers[0].tex).toBe('36x^{3}')
  })
})

describe('a power typed as natural maths', () => {
  it('is read the same however it was bracketed', () => {
    // latexToMath turns a typed x² into x^(2); rejecting that made the field unusable.
    expect(runPure('factor', '6x^(2)+7x-3').answers[0].tex).toMatch(/2x \+ 3/)
    expect(runPure('solve', 'x^(2)+4x+13=0').answers[0].tex).toBe('-2 + 3i')
  })
})

describe('what the Working panel decides before it draws anything', () => {
  it('hides the steps first unless the student has asked to see them all', () => {
    // Retrieval practice beats reading: the answer is shown, the steps wait to be asked for.
    expect(stepPrefFrom(null)).toBe('try')
    expect(stepPrefFrom('nonsense')).toBe('try')
    expect(stepPrefFrom('all')).toBe('all')
    expect(initialShown(6, 'try')).toBe(0)
    expect(initialShown(6, 'all')).toBe(6)
    expect(initialShown(0, 'try')).toBe(0)
  })

  it('treats the typing as whatever was chosen, or guesses when nothing was', () => {
    expect(resolveJob('auto', '12, 18')).toBe('hcf')
    expect(resolveJob('auto', 'x^2 + 4')).toBe('factorComplex')
    expect(resolveJob('expand', '12, 18')).toBe('expand')
  })

  it('colours the check line by the verdict, never by the wording', () => {
    expect(checkTone({ checked: 'ok', check: 'Treat this answer with suspicion.' })).toBe('ok')
    expect(checkTone({ checked: 'failed', check: 'All fine.' })).toBe('failed')
    expect(checkTone({ check: 'Nothing was multiplied, so there is nothing to check.' })).toBe('plain')
    // Every generator that verifies its answer says so.
    for (const src of [
      ['factor', '6x^2 + 7x - 3'],
      ['factorComplex', 'x^2 + 4'],
      ['expand', '(x + 1)(x - 1)'],
      ['solve', '2x + 1 = 7'],
      ['partial', '(3x + 5)/((x + 1)(x + 2))'],
      ['partial', '1/(x^2 - 4)'],
      ['divide', '(x^3 - 1)/(x - 1)'],
      ['divide', '(x^2 + 1)/(x - 1)'],
      ['hcf', '12, 18'],
      ['hcf', '7, 9'],
      ['lcm', '4, 6'],
      ['primes', '84'],
      ['primes', '97'],
      ['hcf', 'x^2 - 1, x^2 + 2x + 1'],
      ['lcm', '4x, 6x^2'],
      ['complex', '(1 + i)(2 - i)'],
      ['complex', '(2 + 3i)/(1 - i)'],
      ['complex', '(1 + i)^4']
    ] as const) {
      expect(checkTone(runPure(src[0], src[1])), src.join(' ')).toBe('ok')
    }
    // A check line that only restates the answer carries no verdict.
    expect(checkTone(runPure('expand', 'x^2 + 2x + 1'))).toBe('plain')
  })

  it('the Complex tool really compares its exact answer with an independent numeric one', () => {
    expect(agreesNumerically('(1 + i)(2 - i)', { re: rat(3n), im: rat(1n) })).toBe(true)
    expect(agreesNumerically('(1 + i)(2 - i)', { re: rat(3n), im: rat(-1n) })).toBe(false)
    expect(agreesNumerically('(2 + 3i)/(1 - i)', { re: rat(-1n, 2n), im: rat(5n, 2n) })).toBe(true)
  })

  it('offers "Allow i" only for a job the panel knows', () => {
    const known = JOBS.map((j) => j.id)
    expect(offeredJob(runPure('factor', 'x^2 + 4'), known)).toBe('factorComplex')
    expect(offeredJob(runPure('factor', 'x^2 - 4'), known)).toBeNull()
    expect(offeredJob({ offer: { job: 'nothing', label: '', hint: '' } }, known)).toBeNull()
    expect(offeredJob({ error: 'no', offer: { job: 'factorComplex', label: '', hint: '' } }, known)).toBeNull()
  })

  it('records why the steps are missing when SymPy had to answer', () => {
    // The reason is a field of its own, so the panel can show it under the answer.
    const w = runPure('factorComplex', 'x^5 + x + 1')
    expect(w.error).toBeTruthy()
    expect(w.error).toMatch(/power 5|cannot/)
  })
})

// ---------------------------------------------------------------------------------------------
// P22 (owner, 2026-10-01): Maths screen → Complex, 1/(√2 − √5 i). The calculator answered
// 0.2 + 0.32i, but "Work it out" said: I cannot do that one — "sqrt" is not something I can
// factorise. The Complex working reads its line with the polynomial reader (mono.ts), which
// refuses any function, and an exact complex number there is two fractions with no room for a
// root. Every test below goes the way the button goes: the LaTeX the field holds → runLatex →
// the Working the panel draws.
// ---------------------------------------------------------------------------------------------

/** The working for a line typed into the Maths field, by the same route as "Work it out". */
function workTyped(latex: string): Working {
  usePure.getState().runLatex(latex, 'auto')
  const w = usePure.getState().working
  if (!w) throw new Error(`No working at all for ${latex}`)
  return w
}

/**
 * LaTeX with the spelling choices taken out, so a test pins the maths and not the spacing:
 * \left and \right, thin spaces, ≈, braces round a one-digit power, the proper minus, and an i
 * written before its root (i\sqrt{5} is the same number as \sqrt{5}i).
 */
const flat = (tex: string): string =>
  tex
    .replace(/\\mathrm\{i\}|\\text\{i\}/g, 'i')
    .replace(/(?<![A-Za-z\\])i\s*\\sqrt\{(\w+)\}/g, '\\sqrt{$1}i')
    .replace(/\\approx|≈|\\left|\\right|\\[,;:! ]|\\q?quad/g, '')
    .replace(/\^\{(\d)\}/g, '^$1')
    .replace(/−/g, '-')
    .replace(/\s+/g, '')

/** The number a piece of the working's LaTeX stands for, read back through the field's converter and mathjs. */
function valueOfTex(tex: string): { re: number; im: number } {
  // The converter joins an i written in front of a root into one name ("isqrt"); a × keeps them apart.
  const linear = latexToMath(tex.replace(/(?<![A-Za-z\\])i\s*\\sqrt/g, 'i\\cdot\\sqrt'))
  const v = math.evaluate(writeTimes(preprocess(linear))) as unknown
  if (typeof v === 'number') return { re: v, im: 0 }
  const c = v as { re?: unknown; im?: unknown } | undefined
  if (typeof c?.re === 'number' && typeof c?.im === 'number') return { re: c.re, im: c.im }
  throw new Error(`"${tex}" does not come to a number`)
}

const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))

/**
 * A complex number as PhysLab writes decimals at the student's precision. Either of the app's own
 * formatters is accepted — texPrecise (the Working panel's decimal rows, as a definite integral's
 * "As a decimal") or calcNum (the calculator's answer line, the 0.2 + 0.32i the owner saw) — and
 * nothing else, so a hand-rolled toFixed fails.
 */
function decimalForms(re: number, im: number, s: DigitSettings): string[] {
  const forms = new Set<string>()
  for (const num of [(v: number): string => texPrecise(v, s), (v: number): string => calcNum(v, s)]) {
    const r = num(re)
    const m = num(Math.abs(im))
    const iPart = m === '1' ? 'i' : `${m}i`
    if (im === 0) {
      forms.add(flat(r))
      continue
    }
    forms.add(flat(`${r}${im < 0 ? '-' : '+'}${iPart}`))
    if (re === 0) forms.add(flat(`${im < 0 ? '-' : ''}${iPart}`))
  }
  return [...forms]
}

/**
 * Runs `check` at the student's own precision and again at 6 significant figures — two settings no
 * fixed format can match at once — then puts the setting back. The precision lives in
 * scene().settings (core/store.ts: 2 decimal places by default); the calculator reads it through
 * setCalcPrecisionSource (panels/Maths.tsx) and the Working panel's integrals through workSteps
 * (math/pure/store.ts).
 */
function atEachPrecision(check: (s: DigitSettings) => void): void {
  const own: DigitSettings = { decimals: scene().settings.decimals, precisionMode: scene().settings.precisionMode }
  const other: DigitSettings = { decimals: 6, precisionMode: 'sf' }
  try {
    for (const s of [own, other]) {
      scene().setSettings(s)
      check(s)
    }
  } finally {
    scene().setSettings(own)
  }
}

/** One of the answer rows is the decimal of re + im·i at precision `s`. */
function expectDecimalRow(w: Working, re: number, im: number, s: DigitSettings, what: string): void {
  const want = decimalForms(re, im, s)
  const rows = w.answers.map((a) => flat(a.tex))
  const refused = w.error ? `; the working was refused with "${w.error}"` : ''
  expect(rows.some((r) => want.includes(r)), `${what} at ${s.decimals} ${s.precisionMode}: an answer row reading ${want.join(' or ')}; the rows were [${rows.join(' | ')}]${refused}`).toBe(true)
}

const rendersInKatex = (tex: string, where: string): void => {
  expect(() => katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: 'ignore' }), `${where}: ${tex}`).not.toThrow()
}

/** Everything the student reads as words, joined. */
const wordsOf = (w: Working): string =>
  [w.title, w.error, w.reason, w.check, ...w.moves.flatMap((m) => [m.subgoal, m.head, m.note]), ...w.answers.map((a) => a.label)]
    .filter((t): t is string => Boolean(t))
    .join(' | ')

/**
 * A sentence as the panel shows it: WorkingView passes heads, notes, subgoals, the check and the
 * reason through texToPlain, and shows an error as it is. texToPlain drops any command it cannot
 * read, so \dfrac{\sqrt{2}}{7} would reach the student as "√27": every root and every fraction
 * written must arrive as a √ and a /.
 */
function expectPlain(raw: string | undefined, where: string, shownAsIs = false): void {
  if (!raw) return
  const plain = shownAsIs ? raw : texToPlain(raw)
  expect(plain, `${where}: "${raw}"`).not.toMatch(/[\\{}^*]|sqrt/)
  if (shownAsIs) return
  const count = (s: string, re: RegExp): number => s.match(re)?.length ?? 0
  expect(count(plain, /√/g) - count(raw, /√/g), `${where}: every root arrives as √ — "${raw}" reads "${plain}"`).toBe(count(raw, /\\sqrt/g))
  expect(count(plain, /\//g) - count(raw, /\//g), `${where}: every fraction arrives as / — "${raw}" reads "${plain}"`).toBe(count(raw, /\\[dt]?frac/g))
}

/** Every piece of maths goes through real KaTeX, none of it is the linear text the engine ran, and every sentence is plain. */
function expectRendersAndReads(w: Working, what: string): void {
  const maths: [string, string][] = [['input', w.input]]
  w.moves.forEach((m, i) => {
    if (m.tex) maths.push([`move ${i + 1} tex`, m.tex])
    if (m.rule) maths.push([`move ${i + 1} rule`, m.rule])
  })
  w.answers.forEach((a) => maths.push([`answer "${a.label}"`, a.tex]))
  for (const [where, tex] of maths) {
    rendersInKatex(tex, `${what} ${where}`)
    // KaTeX happily draws sqrt(2) as the letters s·q·r·t, so passing it renders is not enough.
    expect(tex, `${what} ${where} is the linear text the engine ran, not maths`).not.toMatch(/sqrt\(|\)\/\(/)
  }
  w.moves.forEach((m, i) => {
    expectPlain(m.subgoal, `${what} move ${i + 1} subgoal`)
    expectPlain(m.head, `${what} move ${i + 1} head`)
    expectPlain(m.note, `${what} move ${i + 1} note`)
  })
  expectPlain(w.check, `${what} check`)
  expectPlain(w.reason, `${what} reason`)
  expectPlain(w.error, `${what} error`, true)
}

interface SurdCase {
  name: string
  /** As the MathLive field writes it (latex-unstyled, smart fences on); the first is the usual way to type it. */
  latex: string[]
  /** The value, worked by hand. */
  re: number
  im: number
  /** The exact answer keeps a square root. */
  surd: boolean
  /** A step says it multiplies by the conjugate. */
  conjugate: boolean
  /** Maths some step must show (compared flattened, in a move's tex or rule). */
  shows: string[]
}

const R2 = Math.SQRT2
const R3 = Math.sqrt(3)
const R5 = Math.sqrt(5)

const P22_CASES: SurdCase[] = [
  {
    // (√2 + √5 i)/((√2)² + (√5)²) = (√2 + √5 i)/7
    name: '1/(√2 − √5 i)',
    latex: ['\\frac{1}{\\sqrt{2}-\\sqrt{5}i}'],
    re: R2 / 7,
    im: R5 / 7,
    surd: true,
    conjugate: true,
    shows: ['\\sqrt{2}+\\sqrt{5}i', '2+5=7']
  },
  {
    // 1 + 2√3 i + 3i² = −2 + 2√3 i
    name: '(1 + √3 i)²',
    latex: ['\\left(1+\\sqrt{3}i\\right)^2'],
    re: -2,
    im: 2 * R3,
    surd: true,
    conjugate: false,
    shows: ['3i^2', 'i^2=-1']
  },
  {
    // √2(1 − i)²/((1 + i)(1 − i)) = √2(−2i)/2 = −√2 i; typed with or without the dot
    name: '√2·(1 − i)/(1 + i)',
    latex: ['\\frac{\\sqrt{2}\\left(1-i\\right)}{1+i}', '\\sqrt{2}\\cdot\\frac{1-i}{1+i}'],
    re: 0,
    im: -R2,
    surd: true,
    conjugate: true,
    shows: ['1+1=2']
  },
  {
    // (3 + 4i)/25 — no root at all: the fractions-only route this must not break
    name: '1/(3 − 4i)',
    latex: ['\\frac{1}{3-4i}'],
    re: 3 / 25,
    im: 4 / 25,
    surd: false,
    conjugate: true,
    shows: ['3+4i', '9+16=25']
  }
]

describe('P22 — complex numbers with surds (typed LaTeX → Working)', () => {
  for (const c of P22_CASES) {
    it(`${c.name}: the exact answer, with its steps and a check that passes`, () => {
      for (const latex of c.latex) {
        const what = `${c.name} typed as ${latex}`
        const w = workTyped(latex)
        expect(w.error, `${what} was refused`).toBeUndefined()
        expect(usePure.getState().job, `${what} went to the wrong job`).toBe('complex')
        expect(w.noWorking, `${what} came back as an answer with no steps`).toBeFalsy()
        const exact = w.answers[0]?.tex ?? ''
        expect(exact, `${what}: the answer must be exact, not a rounded decimal`).not.toMatch(/\d\.\d/)
        if (c.surd) expect(exact, `${what}: the exact answer keeps its square root`).toMatch(/\\sqrt/)
        const z = valueOfTex(exact)
        expect(near(z.re, c.re) && near(z.im, c.im), `${what}: ${exact} comes to ${z.re} + ${z.im}i, not ${c.re} + ${c.im}i`).toBe(true)
        if (c.conjugate) expect(w.moves.some((m) => /conjugate/i.test(m.head)), `${what}: no step multiplies by the conjugate`).toBe(true)
        for (const s of c.shows) {
          const seen = w.moves.some((m) => flat(m.tex ?? '').includes(flat(s)) || flat(m.rule ?? '').includes(flat(s)))
          expect(seen, `${what}: no step shows ${s}`).toBe(true)
        }
        // The modulus and the conjugate, when they are given, belong to this number.
        const modulus = w.answers.find((a) => a.label === 'Modulus')
        if (modulus) expect(near(valueOfTex(modulus.tex).re, Math.hypot(c.re, c.im)), `${what}: modulus ${modulus.tex}`).toBe(true)
        const conj = w.answers.find((a) => a.label === 'Conjugate')
        if (conj) {
          const b = valueOfTex(conj.tex)
          expect(near(b.re, c.re) && near(b.im, -c.im), `${what}: conjugate ${conj.tex}`).toBe(true)
        }
        expect(w.check, `${what}: no check line`).toBeTruthy()
        expect(w.checked, `${what}: the check did not pass`).toBe('ok')
      }
    })

    it(`${c.name}: the decimal answer as well, at the student's own precision`, () => {
      atEachPrecision((s) => expectDecimalRow(workTyped(c.latex[0]), c.re, c.im, s, c.name))
    })

    it(`${c.name}: every piece of maths renders in KaTeX and every sentence reads as plain words`, () => {
      const w = workTyped(c.latex[0])
      expect(w.error, `${c.name} was refused`).toBeUndefined()
      expectRendersAndReads(w, c.name)
    })
  }

  it('(√2 + √3 i)(√5 + i), two different roots in one part, still gets its decimal answer, and a refusal names the Complex job, never factorising', () => {
    // √10 + √2 i + √15 i + √3 i² = (√10 − √3) + (√2 + √15) i: each part holds two different roots,
    // which one exact surd per part cannot write. Answers are mandatory, so the decimal still comes.
    const latex = '\\left(\\sqrt{2}+\\sqrt{3}i\\right)\\left(\\sqrt{5}+i\\right)'
    const what = '(√2 + √3 i)(√5 + i)'
    const re = Math.sqrt(10) - R3
    const im = R2 + Math.sqrt(15)
    atEachPrecision((s) => {
      const w = workTyped(latex)
      expect(wordsOf(w), `${what}: this is the Complex job, not factorising`).not.toMatch(/factoris/i)
      // An error replaces the whole answer card (WorkingView.tsx), so a refusal that keeps the answer cannot be one.
      expect(w.error, `${what}: the answer is mandatory, so this cannot end in "I cannot do that one"`).toBeUndefined()
      expect(usePure.getState().job, `${what} went to the wrong job`).toBe('complex')
      expectDecimalRow(w, re, im, s, what)
      if (w.noWorking || w.moves.length === 0) {
        expect(texToPlain(w.reason ?? ''), `${what}: the reason names the job that could not write it exactly`).toMatch(/complex/i)
      } else {
        const z = valueOfTex(w.answers[0]?.tex ?? '')
        expect(near(z.re, re) && near(z.im, im), `${what}: ${w.answers[0]?.tex}`).toBe(true)
        expect(w.checked, `${what}: the check did not pass`).toBe('ok')
      }
      expectRendersAndReads(w, what)
    })
  })

  it('a root written after its i — (1 + i√3)², 1/(√2 − i√5) — reaches the Complex job too', () => {
    // Textbooks write i√3 as often as √3 i. The field converter joins "i" and "\sqrt" into one
    // name ("isqrt", latexToMath.ts), so the stand-alone i that picks Complex (run.ts suggestJob)
    // is never seen and the line goes to Factorise or Divide instead.
    const typed: [string, number, number][] = [
      ['\\left(1+i\\sqrt{3}\\right)^2', -2, 2 * R3],
      ['\\frac{1}{\\sqrt{2}-i\\sqrt{5}}', R2 / 7, R5 / 7]
    ]
    for (const [latex, re, im] of typed) {
      const w = workTyped(latex)
      expect(usePure.getState().job, `${latex} went to the wrong job`).toBe('complex')
      expect(w.error, `${latex} was refused`).toBeUndefined()
      const z = valueOfTex(w.answers[0]?.tex ?? '')
      expect(near(z.re, re) && near(z.im, im), `${latex}: ${w.answers[0]?.tex}`).toBe(true)
      expect(w.checked, `${latex}: the check did not pass`).toBe('ok')
    }
  })

  // The fixer's probes (P22). Each line either gets a checked exact working or its decimal answer
  // with a reason, and every piece renders and reads.

  it('the exact answer is written the way the textbook writes it, √2/7 + (√5/7)i, and so is the check sentence', () => {
    const w = workTyped('\\frac{1}{\\sqrt{2}-\\sqrt{5}i}')
    expect(flat(w.answers[0]?.tex ?? '')).toBe(flat('\\frac{\\sqrt{2}}{7}+\\frac{\\sqrt{5}}{7}i'))
    expect(flat(w.answers.find((a) => a.label === 'Modulus')?.tex ?? '')).toBe(flat('\\frac{\\sqrt{7}}{7}'))
    expect(texToPlain(w.check ?? '')).toMatch(/Real part √2\/7, imaginary part √5\/7\./)
  })

  // Worked by hand: the value of each line, which the working must reach exactly and check.
  const MORE_EXACT: [string, number, number][] = [
    ['\\frac{1}{\\sqrt{2}}+i', R2 / 2, 1],
    ['\\sqrt{-4}+i', 0, 3],
    ['\\sqrt{2}i\\cdot\\sqrt{2}i', -2, 0],
    ['\\left(\\sqrt{2}+i\\right)^{3}', -R2, 5],
    ['\\frac{\\sqrt{3}+i}{\\sqrt{3}-i}', 0.5, R3 / 2],
    ['\\frac{1}{\\sqrt{2}+\\sqrt{3}i}', R2 / 5, -R3 / 5],
    ['\\sqrt{0.5}+i', R2 / 2, 1],
    ['\\sqrt{\\frac{1}{4}}+i', 0.5, 1],
    ['i\\sqrt{3}', 0, R3],
    ['-i\\sqrt{5}', 0, -R5],
    ['\\frac{2}{1+\\sqrt{2}}+i', 2 * R2 - 2, 1],
    ['\\frac{\\sqrt{3}}{2}+\\frac{1}{2}i', R3 / 2, 0.5],
    ['\\left(\\frac{\\sqrt{3}}{2}+\\frac{1}{2}i\\right)^3', 0, 1],
    ['\\sqrt{-2}+i', 0, 1 + R2],
    ['\\frac{1}{\\sqrt{2}+i}+\\frac{1}{\\sqrt{2}-i}', (2 * R2) / 3, 0],
    ['\\sqrt{12345678901234}+i', Math.sqrt(12345678901234), 1]
  ]

  it('more lines with roots: each worked exactly, checked, with its decimal at the student\'s precision', () => {
    for (const [latex, re, im] of MORE_EXACT) {
      atEachPrecision((s) => {
        const w = workTyped(latex)
        expect(usePure.getState().job, `${latex} went to the wrong job`).toBe('complex')
        expect(w.error, `${latex} was refused`).toBeUndefined()
        expect(w.noWorking, `${latex} came back with no steps`).toBeFalsy()
        const exact = w.answers[0]?.tex ?? ''
        expect(exact, `${latex}: the answer must be exact`).not.toMatch(/\d\.\d|\\approx/)
        const z = valueOfTex(exact)
        expect(near(z.re, re) && near(z.im, im), `${latex}: ${exact} comes to ${z.re} + ${z.im}i`).toBe(true)
        expect(w.checked, `${latex}: the check did not pass`).toBe('ok')
        expectDecimalRow(w, re, im, s, latex)
        expectRendersAndReads(w, latex)
      })
    }
  })

  it('a heading says "multiply out" only when something is multiplied, and names i² = −1 only where i² is', () => {
    // i√5 = √5i, √−4 + i = 2i + i and √3/2 + ½i have nothing to multiply out: they were headed
    // "Multiply out and collect", and 1/(√2 − i√5) began with a step that only moved the i.
    for (const latex of ['i\\sqrt{3}', '-i\\sqrt{5}', '\\sqrt{8}i', '\\sqrt{-4}+i', '\\frac{\\sqrt{3}}{2}+\\frac{1}{2}i', '\\frac{1}{2}\\sqrt{2}+i']) {
      for (const m of workTyped(latex).moves) expect(m.head, `${latex}: "${m.head}" over ${m.tex}`).not.toMatch(/multiply out/i)
    }
    const moved = workTyped('\\frac{1}{\\sqrt{2}-i\\sqrt{5}}')
    expect(moved.moves[0]?.head, 'the first step multiplies by the conjugate').toMatch(/conjugate/)
    // A line made of terms over plain numbers is not made one fraction and divided back out again.
    expect(workTyped('\\frac{\\sqrt{3}}{2}+\\frac{1}{2}i').moves.some((m) => /one fraction|divide/i.test(m.head))).toBe(false)
    // The lines with roots. The fractions-only working keeps its wording as it was, "using i² = −1"
    // over (1)(3 + 4i) included.
    for (const [latex] of [...MORE_EXACT, ...P22_CASES.filter((c) => c.surd).map((c): [string] => [c.latex[0]])]) {
      for (const m of workTyped(latex).moves) {
        if (/using i² = −1/.test(m.head)) expect(flat(`${m.tex ?? ''}${m.rule ?? ''}`), `${latex}: "${m.head}" over ${m.tex}`).toMatch(/i\^2/)
      }
    }
  })

  // Lines the exact working cannot hold: the answer as a decimal, and the reason in words.
  const DECIMAL_ONLY: [string, number, number, RegExp][] = [
    ['2^{0.5}+i', R2, 1, /whole-number powers/],
    ['\\sin\\left(i\\right)', 0, Math.sinh(1), /sine/],
    ['e^{i\\pi}', -1, 0, /never ends/],
    ['2\\pi i', 0, 2 * Math.PI, /never ends/],
    ['\\left|1+\\sqrt{3}i\\right|', 2, 0, /Modulus/],
    ['\\sqrt[3]{2}+i', Math.cbrt(2), 1, /root other than a square root/],
    ['\\sqrt{i}', Math.SQRT1_2, Math.SQRT1_2, /square roots of ordinary numbers/],
    ['\\left(1+\\sqrt{3}i\\right)^{13}', 4096, 4096 * R3, /12th/],
    ['\\left(\\sqrt{2}+\\sqrt{3}\\right)\\left(\\sqrt{2}-\\sqrt{3}\\right)+i', -1, 1, /two different roots/],
    // The decimal comes from the double the typed …567 is held as, which is …568.
    ['\\sqrt{12345678901234567}+i', Math.sqrt(12345678901234568), 1, /last figure/]
  ]

  it('a line the exact working cannot hold gets its decimal answer and a reason naming the Complex job, never a tick', () => {
    for (const [latex, re, im, why] of DECIMAL_ONLY) {
      atEachPrecision((s) => {
        const w = workTyped(latex)
        expect(usePure.getState().job, `${latex} went to the wrong job`).toBe('complex')
        expect(w.error, `${latex}: the answer is mandatory`).toBeUndefined()
        expect(w.noWorking, `${latex} should come back as an answer without steps`).toBe(true)
        expect(texToPlain(w.reason ?? ''), `${latex}: the reason`).toMatch(why)
        expect(texToPlain(w.reason ?? ''), `${latex}: the reason names the job`).toMatch(/complex/i)
        expect(wordsOf(w), `${latex}: this is the Complex job, not factorising`).not.toMatch(/factoris/i)
        expect(w.checked, `${latex}: a decimal answer has no exact check to pass`).toBeUndefined()
        expectDecimalRow(w, re, im, s, latex)
        expectRendersAndReads(w, latex)
      })
    }
  })

  // P22 round 2 (the checker, in the browser): at two decimal places the calculator line read
  // "0.5 + i" and the "As a decimal" row under it "≈ 0.5 + 1i". The row decided "i" from the number
  // (is it exactly 1?) where the calculator decides from what is written (does it read 1?), and 0.999
  // is written 1 at two places: one number, two readings on one screen.
  interface ReadsAsOne {
    latex: string
    /** The writer that makes the row: the fractions-only working, the working with roots, or an answer with no steps. */
    route: 'fractions' | 'roots' | 'no steps'
    /** "As a decimal" follows an exact answer; with no steps the decimal is the Answer itself. */
    label: 'As a decimal' | 'Answer'
    /** The calculator line at two decimal places, worked by hand. */
    at2dp: string
  }

  const READS_AS_ONE: ReadsAsOne[] = [
    { latex: '\\frac{1}{2}+0.999i', route: 'fractions', label: 'As a decimal', at2dp: '0.5 + i' },
    { latex: '\\frac{1}{2}-0.999i', route: 'fractions', label: 'As a decimal', at2dp: '0.5 − i' },
    { latex: '-0.999i', route: 'fractions', label: 'As a decimal', at2dp: '−i' },
    { latex: '0.999i', route: 'fractions', label: 'As a decimal', at2dp: 'i' },
    // Written 1 at six significant figures too, so the bare i has to come at the second precision as well.
    { latex: '\\frac{1}{2}+0.9999996i', route: 'fractions', label: 'As a decimal', at2dp: '0.5 + i' },
    { latex: '\\sqrt{2}+0.999i', route: 'roots', label: 'As a decimal', at2dp: '1.41 + i' },
    { latex: '2^{0.5}+0.999i', route: 'no steps', label: 'Answer', at2dp: '1.41 + i' }
  ]

  /**
   * The calculator line for a typed line, at the precision the scene holds: panels/Maths.tsx points
   * the calculator at the scene's settings, and without the same here the line is written at ten
   * significant figures and the test compares two precisions.
   */
  function calculatorLine(latex: string): string {
    setCalcPrecisionSource(() => scene().settings)
    try {
      const r = evaluateInput('CMPLX', latex, { vars: {}, ans: 0, angle: 'deg' })
      if (!r || r.error) throw new Error(`The calculator has no answer for ${latex}: ${r?.error?.sentence ?? 'an empty line'}`)
      return r.main
    } finally {
      // The calculator's usual ten significant figures, as it stood before.
      setCalcPrecisionSource(() => ({ decimals: 10, precisionMode: 'sf' }))
    }
  }

  it('the decimal row reads exactly as the calculator line does, the bare i included, in every kind of working', () => {
    for (const c of READS_AS_ONE) {
      atEachPrecision((s) => {
        const where = `${c.latex} (${c.route}) at ${s.decimals} ${s.precisionMode}`
        const w = workTyped(c.latex)
        expect(w.error, `${where} was refused`).toBeUndefined()
        expect(usePure.getState().job, `${where} went to the wrong job`).toBe('complex')
        // The cases are meant to cover the three writers; a line that moved to another route would leave one uncovered.
        expect(Boolean(w.noWorking), `${where}: steps or an answer with none`).toBe(c.route === 'no steps')
        const exact = w.answers[0]?.tex ?? ''
        if (c.route === 'roots') expect(exact, `${where}: the working with roots`).toMatch(/\\sqrt/)
        if (c.route === 'fractions') expect(exact, `${where}: the fractions-only working`).not.toMatch(/\\sqrt|\\approx/)
        const row = w.answers.find((a) => a.label === c.label)
        const line = calculatorLine(c.latex)
        expect(row, `${where}: no "${c.label}" row among [${w.answers.map((a) => a.label).join(', ')}]`).toBeDefined()
        // Soft, so a table that fails lists every line and precision that disagrees, not the first.
        expect.soft(flat(row?.tex ?? ''), `${where}: the row reads "${row?.tex}", the calculator line "${line}"`).toBe(flat(line))
        rendersInKatex(row?.tex ?? '', where)
      })
    }
  })

  it('at two decimal places 0.999 is written 1, so the row says i and −i, never 1i', () => {
    // Pinned on its own, at a precision set here and not the scene's default, so the test above cannot
    // pass by both sides going wrong the same way, or by the default changing under it.
    const own: DigitSettings = { decimals: scene().settings.decimals, precisionMode: scene().settings.precisionMode }
    try {
      scene().setSettings({ decimals: 2, precisionMode: 'dp' })
      for (const c of READS_AS_ONE) {
        const row = workTyped(c.latex).answers.find((a) => a.label === c.label)
        expect.soft(flat(row?.tex ?? ''), `${c.latex}: the row reads "${row?.tex}"`).toBe(flat(c.at2dp))
        expect.soft(flat(calculatorLine(c.latex)), `${c.latex}: the calculator line`).toBe(flat(c.at2dp))
      }
    } finally {
      scene().setSettings(own)
    }
  })

  it('a number with more figures than the computer holds is never worked "exactly" from its rounded value', () => {
    // 12345678901234567 is stored as …568; worked from that and checked in the same doubles, the
    // working ticked an answer that was not the number typed.
    for (const latex of ['12345678901234567+i', '\\sqrt{123456789012345678901234567890}+i', '0.1000000000000000055511151231257827+i']) {
      const w = workTyped(latex)
      expect(w.noWorking, `${latex} should get its decimal answer`).toBe(true)
      expect(w.checked, latex).toBeUndefined()
      expect(texToPlain(w.reason ?? ''), latex).toMatch(/complex/i)
      // The line is shown back as it was typed, not as the double it was read as.
      expect(w.input, latex).toContain(latex.match(/[\d.]{16,}/)?.[0])
      expectRendersAndReads(w, latex)
    }
  })

  it('a bottom that comes to zero says so, and is not sent to the calculator as "no i here"', () => {
    for (const latex of ['\\frac{1}{0i}', '\\frac{1}{i-i}', '\\frac{i}{\\sqrt{2}-\\sqrt{2}}', '\\frac{1}{\\sqrt{2}-\\sqrt{2}}+i']) {
      const w = workTyped(latex)
      expect(usePure.getState().job, latex).toBe('complex')
      expect(w.error, latex).toMatch(/bottom comes to zero/)
      expectRendersAndReads(w, latex)
    }
  })

  it('an equation is told it is one, and a tiny argument still renders', () => {
    expect(workTyped('\\sqrt{2}+i=0').error).toMatch(/equation/)
    // texAngle writes 5.73\times 10^{-6}^\circ for these, a double superscript KaTeX refuses.
    for (const latex of ['10000000+i', '\\sqrt{12345678901234}+i']) expectRendersAndReads(workTyped(latex), latex)
  })

  it('∛2 + i goes to Complex, while a list still goes to HCF', () => {
    expect(suggestJob('nthRoot(2, 3)+i')).toBe('complex')
    expect(suggestJob('x^2-1, x-1')).toBe('hcf')
    expect(suggestJob('nthRoot(8, 3), 4')).toBe('hcf')
  })
})

// ---------------------------------------------------------------------------------------------
// P22b (owner, 2026-10-02): "when I give it an underroot question it does not solve it step by
// step". Auto sent every line with a square root and no letter to Factorise, which refused it with
// "That is just a number: = gives its value. Working is for a line with a letter in it, like
// x² − 4" — no steps and no answer — although the exact surd reader the Complex job has used since
// P22 holds all of them (a real surd is one with nothing imaginary). Every test goes the way the
// button goes: the LaTeX the field holds → runLatex(…, 'auto') → the Working the panel draws. The
// job that works them is not pinned: the fix decides its name.
// ---------------------------------------------------------------------------------------------

/**
 * The calculator's line for a typed line in the Numbers mode, at the precision the scene holds:
 * panels/Maths.tsx points the calculator at the scene's settings, and without the same here the
 * line is written at ten significant figures and the test compares two precisions.
 */
function numbersLine(latex: string): string {
  setCalcPrecisionSource(() => scene().settings)
  try {
    const r = evaluateInput('COMP', latex, { vars: {}, ans: 0, angle: 'deg' })
    if (!r || r.error) throw new Error(`The calculator has no answer for ${latex}: ${r?.error?.sentence ?? 'an empty line'}`)
    return r.main
  } finally {
    // The calculator's usual ten significant figures, as it stood before.
    setCalcPrecisionSource(() => ({ decimals: 10, precisionMode: 'sf' }))
  }
}

interface RootCase {
  name: string
  latex: string
  /** The value, worked by hand. */
  value: number
  /** The exact answer keeps a square root; otherwise it is a whole number or a fraction. */
  surd: boolean
  /** Maths some step must show (compared flattened, in a move's tex or rule); a RegExp is tried on the flattened text. */
  shows: (string | RegExp)[]
  /** Words some step's heading must say. */
  says: RegExp[]
}

/** √n with its square factor named, √(25 × 2), written with × or with a dot. */
const named = (square: number, rest: number): RegExp => new RegExp(`\\\\sqrt\\{${square}(?:\\\\times|\\\\cdot)${rest}\\}`)

/** The seven lines the owner's probe sent to Factorise, worked by hand. */
const ROOT_CASES: RootCase[] = [
  // √50 = √(25 × 2) = 5√2
  { name: '√50', latex: '\\sqrt{50}', value: 5 * R2, surd: true, shows: [named(25, 2)], says: [/square/i] },
  // √12 + √27 = 2√3 + 3√3 = 5√3
  {
    name: '√12 + √27',
    latex: '\\sqrt{12}+\\sqrt{27}',
    value: 5 * R3,
    surd: true,
    shows: [named(4, 3), named(9, 3), '(2+3)\\sqrt{3}'],
    says: [/square/i, /like/i]
  },
  // 1/(√3 + 1) × (√3 − 1)/(√3 − 1) = (√3 − 1)/(3 − 1)
  { name: '1/(√3 + 1)', latex: '\\frac{1}{\\sqrt{3}+1}', value: (R3 - 1) / 2, surd: true, shows: ['3-1'], says: [/conjugate/i] },
  // 3/√2 × √2/√2 = 3√2/2
  { name: '3/√2', latex: '\\frac{3}{\\sqrt{2}}', value: (3 * R2) / 2, surd: true, shows: [], says: [/by √2/] },
  // 2² − (√3)² = 4 − 3
  {
    name: '(2 + √3)(2 − √3)',
    latex: '\\left(2+\\sqrt{3}\\right)\\left(2-\\sqrt{3}\\right)',
    value: 1,
    surd: false,
    shows: ['4-3'],
    says: [/multiply/i]
  },
  // √8 = 2√2, and 2√2 × √2 = 2 × 2
  { name: '√8 × √2', latex: '\\sqrt{8}\\times\\sqrt{2}', value: 4, surd: false, shows: [named(4, 2)], says: [/square/i] },
  // (√5)² = 5
  { name: '(√5)²', latex: '\\left(\\sqrt{5}\\right)^2', value: 5, surd: false, shows: [/\(\\sqrt\{5\}\)\^2/], says: [] }
]

/** More lines of the same kind, so the fix is a working and not seven special cases. */
const MORE_ROOT_CASES: RootCase[] = [
  { name: '√18 − √8', latex: '\\sqrt{18}-\\sqrt{8}', value: R2, surd: true, shows: [named(9, 2)], says: [/square/i] },
  { name: '(1 + √2)²', latex: '\\left(1+\\sqrt{2}\\right)^2', value: 3 + 2 * R2, surd: true, shows: ['3+2\\sqrt{2}'], says: [] },
  { name: '(2 + √3)/(2 − √3)', latex: '\\frac{2+\\sqrt{3}}{2-\\sqrt{3}}', value: 7 + 4 * R3, surd: true, shows: [], says: [/conjugate/i] },
  { name: '√2/√8', latex: '\\frac{\\sqrt{2}}{\\sqrt{8}}', value: 0.5, surd: false, shows: [named(4, 2)], says: [/by √2/] },
  { name: '√3 × √6', latex: '\\sqrt{3}\\times\\sqrt{6}', value: 3 * R2, surd: true, shows: ['\\sqrt{18}'], says: [] },
  { name: '4/(2 − √2)', latex: '\\frac{4}{2-\\sqrt{2}}', value: 4 + 2 * R2, surd: true, shows: [], says: [/conjugate/i] },
  { name: '(2√3)²', latex: '\\left(2\\sqrt{3}\\right)^2', value: 12, surd: false, shows: ['=12'], says: [] },
  { name: '1/√2 + 1/√8', latex: '\\frac{1}{\\sqrt{2}}+\\frac{1}{\\sqrt{8}}', value: (3 * R2) / 4, surd: true, shows: [], says: [/by √2/] },
  { name: '3√2 + 2√2', latex: '3\\sqrt{2}+2\\sqrt{2}', value: 5 * R2, surd: true, shows: ['(3+2)\\sqrt{2}'], says: [/like/i] }
]

/** Whether some step shows the maths, as the P22 cases ask it: flattened, in a step's tex or rule. */
const someStepShows = (w: Working, want: string | RegExp): boolean =>
  w.moves.some((m) => [m.tex ?? '', m.rule ?? ''].some((t) => (typeof want === 'string' ? flat(t).includes(flat(want)) : want.test(flat(t)))))

describe('P22b — ordinary surd lines are worked step by step (typed LaTeX → Working)', () => {
  for (const c of [...ROOT_CASES, ...MORE_ROOT_CASES]) {
    it(`${c.name}: the exact answer, with its steps and a check that passes`, () => {
      const what = `${c.name} typed as ${c.latex}`
      const w = workTyped(c.latex)
      expect(w.error, `${what} was refused`).toBeUndefined()
      expect(w.noWorking, `${what} came back as an answer with no steps`).toBeFalsy()
      expect(w.moves.length, `${what}: no steps`).toBeGreaterThan(0)
      const exact = w.answers[0]?.tex ?? ''
      expect(exact, `${what}: the answer must be exact, not a rounded decimal`).not.toMatch(/\d\.\d|\\approx/)
      if (c.surd) expect(exact, `${what}: the exact answer keeps its square root`).toMatch(/\\sqrt/)
      else expect(exact, `${what}: the exact answer has no root left in it`).not.toMatch(/\\sqrt/)
      const z = valueOfTex(exact)
      expect(near(z.re, c.value) && z.im === 0, `${what}: ${exact} comes to ${z.re}, not ${c.value}`).toBe(true)
      for (const s of c.shows) expect(someStepShows(w, s), `${what}: no step shows ${String(s)}`).toBe(true)
      for (const re of c.says) expect(w.moves.some((m) => re.test(texToPlain(m.head))), `${what}: no step says ${String(re)}; the heads were [${w.moves.map((m) => m.head).join(' | ')}]`).toBe(true)
      // The words are the surd working's own: this is neither factorising nor complex numbers.
      expect(wordsOf(w), `${what}: the words name another job`).not.toMatch(/factoris|complex|just a number/i)
      expect(w.check, `${what}: no check line`).toBeTruthy()
      expect(w.checked, `${what}: the check did not pass`).toBe('ok')
    })

    it(`${c.name}: the decimal answer as well, as the calculator line reads it at the student's own precision`, () => {
      atEachPrecision((s) => {
        const what = `${c.name} at ${s.decimals} ${s.precisionMode}`
        const w = workTyped(c.latex)
        expect(w.error, `${what} was refused`).toBeUndefined()
        const line = flat(numbersLine(c.latex))
        const rows = w.answers.map((a) => flat(a.tex))
        expect(rows.includes(line), `${what}: an answer row reading ${line}; the rows were [${rows.join(' | ')}]`).toBe(true)
        // A whole number is its own decimal; anything else has the row the Complex job's answers have.
        if (!Number.isInteger(c.value)) {
          const row = w.answers.find((a) => a.label === 'As a decimal')
          expect(row, `${what}: no "As a decimal" row among [${w.answers.map((a) => a.label).join(', ')}]`).toBeDefined()
          expect(flat(row?.tex ?? ''), `${what}: the row reads "${row?.tex}", the calculator line "${line}"`).toBe(line)
          rendersInKatex(row?.tex ?? '', what)
        }
      })
    })

    it(`${c.name}: every piece of maths renders in KaTeX and every sentence reads as plain words`, () => {
      const w = workTyped(c.latex)
      expect(w.error, `${c.name} was refused`).toBeUndefined()
      expectRendersAndReads(w, c.name)
    })
  }

  /** A step's line cut at its = signs outside braces: a = b = c is [a, b, c]. */
  const linksOf = (tex: string): string[] => {
    const out: string[] = []
    let depth = 0
    let from = 0
    for (let i = 0; i < tex.length; i++) {
      if (tex[i] === '{') depth++
      else if (tex[i] === '}') depth--
      else if (tex[i] === '=' && depth === 0) {
        out.push(tex.slice(from, i))
        from = i + 1
      }
    }
    out.push(tex.slice(from))
    return out.map((t) => t.trim()).filter(Boolean)
  }

  // More lines than the cases above, for the truth test only: powers, sums of fractions, brackets
  // with signs in them, the root of a fraction, a negative power.
  const MORE_LINES = [
    '\\left(\\sqrt{2}\\right)^2+3',
    '-\\sqrt{50}',
    '2\\sqrt{8}',
    '\\frac{6}{\\sqrt{3}}',
    '\\sqrt{\\frac{1}{4}}',
    '\\sqrt{0.5}',
    '\\frac{1}{2}\\sqrt{8}',
    '\\sqrt{2}\\left(\\sqrt{2}+1\\right)',
    '\\left(\\sqrt{3}+1\\right)^3',
    '\\left(\\sqrt{2}\\right)^{-2}',
    '\\left(1+\\sqrt{2}\\right)^{-1}',
    '\\left(2-\\sqrt{3}\\right)^2',
    '\\left(3+\\sqrt{2}\\right)\\left(1-\\sqrt{2}\\right)',
    '\\frac{3+\\sqrt{2}}{1+\\sqrt{2}}',
    '\\frac{\\sqrt{3}}{\\sqrt{3}-1}',
    '\\frac{1}{2+\\sqrt{3}}+\\frac{1}{2-\\sqrt{3}}',
    '\\sqrt{2}\\sqrt{8}\\sqrt{3}',
    '\\frac{\\sqrt{2}}{\\sqrt{3}}',
    '\\frac{\\sqrt{2}+1}{\\sqrt{2}-1}',
    '\\frac{2+\\sqrt{3}}{2}',
    '\\frac{6\\sqrt{2}}{4}',
    '\\left(\\sqrt{8}+\\sqrt{2}\\right)\\left(\\sqrt{8}-\\sqrt{2}\\right)',
    '1-\\left(\\sqrt{2}+3\\right)',
    '\\sqrt{50}-\\sqrt{8}+\\sqrt{18}-1',
    '3+\\sqrt{2}-2\\sqrt{2}+1',
    '\\left(-\\sqrt{2}\\right)^3',
    '\\left(\\frac{\\sqrt{3}}{2}\\right)^2'
  ]

  it('every equality a step writes is true: each side of each = comes to the same number', () => {
    // A student copies a step into a notebook and checks it on a calculator. The exact answer is
    // checked against mathjs by the working itself; this holds every line in between to the same.
    for (const latex of [...ROOT_CASES, ...MORE_ROOT_CASES].map((c) => c.latex).concat(MORE_LINES)) {
      const w = workTyped(latex)
      expect(w.error, `${latex} was refused`).toBeUndefined()
      w.moves.forEach((m, k) => {
        // The roots step puts one equality after another with a comma between them.
        for (const statement of (m.tex ?? '').split(',\\quad')) {
          const sides = linksOf(statement).map((t) => ({ t, v: valueOfTex(t).re }))
          for (const side of sides) {
            expect(near(side.v, sides[0].v), `${latex}, step ${k + 1}: "${side.t}" comes to ${side.v}, but "${sides[0].t}" to ${sides[0].v}`).toBe(true)
          }
        }
      })
      // The answer is every line's number, and the decimal row is it again.
      const answer = valueOfTex(w.answers[0]?.tex ?? '').re
      expect(near(answer, Number(math.evaluate(writeTimes(preprocess(latexToMath(latex))))) as number), `${latex}: the answer ${w.answers[0]?.tex}`).toBe(true)
      expect(w.checked, `${latex}: the check did not pass`).toBe('ok')
      expectRendersAndReads(w, latex)
    }
  })

  it('a first step starts from what was typed: √3 + 1 is not turned round to 1 + √3, and (√5)² keeps its brackets in the header', () => {
    // The textbook writes the answer rational part first, but the line the student typed is what the
    // first step multiplies; the same sum typed 1 + √3 is shown as 1 + √3.
    const first = (latex: string): string => flat(workTyped(latex).moves[0]?.tex ?? '')
    expect(first('\\frac{1}{\\sqrt{3}+1}')).toContain('\\dfrac{1}{\\sqrt{3}+1}')
    expect(first('\\frac{1}{1+\\sqrt{3}}')).toContain('\\dfrac{1}{1+\\sqrt{3}}')
    expect(flat(workTyped('\\left(\\sqrt{3}+1\\right)^3').moves[0]?.tex ?? '')).toContain('(\\sqrt{3}+1)(\\sqrt{3}+1)')
    // √5 with a 2 after it reads as the root of 5², and (√5)² is the number that was typed.
    expect(flat(workTyped('\\left(\\sqrt{5}\\right)^2').input)).toBe('(\\sqrt{5})^2')
  })

  it('the conjugate is the bottom with the sign between its two terms turned round as it was typed, and a minus left on the bottom goes to the top', () => {
    // √3 + 1 is cleared by √3 − 1 (3 − 1 = 2), 1 + √3 by 1 − √3 (1 − 3 = −2, so the answer is
    // (1 − √3)/(−2) = (√3 − 1)/2), 1 − √2 by 1 + √2 (1 − 2 = −1): the one rule a student learns.
    const cases: [string, RegExp, number, boolean][] = [
      ['\\frac{1}{\\sqrt{3}+1}', /conjugate, √3 [-−] 1,/, 1 / (R3 + 1), false],
      ['\\frac{1}{1+\\sqrt{3}}', /conjugate, 1 [-−] √3,/, 1 / (1 + R3), true],
      ['\\frac{1}{2-\\sqrt{3}}', /conjugate, 2 \+ √3,/, 1 / (2 - R3), false],
      ['\\frac{5}{3+\\sqrt{2}}', /conjugate, 3 [-−] √2,/, 5 / (3 + R2), false],
      ['\\frac{1}{\\sqrt{5}-2}', /conjugate, √5 \+ 2,/, 1 / (R5 - 2), false],
      ['\\frac{1}{1-\\sqrt{2}}', /conjugate, 1 \+ √2,/, 1 / (1 - R2), true]
    ]
    for (const [latex, said, value, minus] of cases) {
      const w = workTyped(latex)
      expect(w.error, `${latex} was refused`).toBeUndefined()
      expect(w.moves.some((m) => said.test(texToPlain(m.head))), `${latex}: ${w.moves.map((m) => m.head).join(' | ')}`).toBe(true)
      const z = valueOfTex(w.answers[0]?.tex ?? '')
      expect(near(z.re, value) && z.im === 0, `${latex}: ${w.answers[0]?.tex} comes to ${z.re}, not ${value}`).toBe(true)
      // A bottom that came to a negative number says what happens to the signs; one that did not, says nothing of it.
      expect(w.moves.some((m) => /minus on the bottom/.test(m.head)), `${latex}: the minus on the bottom`).toBe(minus)
      expect(w.checked, `${latex}: the check did not pass`).toBe('ok')
      expectRendersAndReads(w, latex)
    }
  })

  it('the bottom that comes to zero is said, not refused as "just a number"', () => {
    const w = workTyped('\\frac{1}{\\sqrt{2}-\\sqrt{2}}')
    expect(w.error).toBe('The bottom comes to zero.')
    expectRendersAndReads(w, '1/(√2 − √2)')
  })

  it('√2 + √3, two roots that cannot be put together, answers itself in a plain sentence and is never "just a number"', () => {
    // Either the line itself is the answer with a sentence that says the roots differ, or there are
    // no steps and the reason says so; and its decimal comes either way.
    const latex = '\\sqrt{2}+\\sqrt{3}'
    atEachPrecision((s) => {
      const what = `√2 + √3 at ${s.decimals} ${s.precisionMode}`
      const w = workTyped(latex)
      expect(w.error, `${what} was refused with "${w.error}"`).toBeUndefined()
      expect(wordsOf(w), `${what}: the words name another job`).not.toMatch(/factoris|complex|just a number/i)
      const line = flat(numbersLine(latex))
      const rows = w.answers.map((a) => flat(a.tex))
      expect(rows.includes(line), `${what}: an answer row reading ${line}; the rows were [${rows.join(' | ')}]`).toBe(true)
      const said = [w.reason, w.check, ...w.moves.flatMap((m) => [m.head, m.note])]
        .filter((t): t is string => Boolean(t))
        .map(texToPlain)
        .join(' | ')
      expect(said, `${what}: nothing says the roots are different; it said [${said}]`).toMatch(/different/i)
      if (w.noWorking) {
        expect(w.reason, `${what}: no steps and no reason`).toBeTruthy()
      } else {
        expect(w.moves.length, `${what}: no steps`).toBeGreaterThan(0)
        expect(w.answers[0]?.tex ?? '', `${what}: the answer keeps both roots`).toMatch(/\\sqrt\{2\}.*\\sqrt\{3\}|\\sqrt\{3\}.*\\sqrt\{2\}/)
        expect(w.checked, `${what}: a check that failed is no answer`).not.toBe('failed')
      }
      expectRendersAndReads(w, what)
    })
  })

  // Lines the exact working cannot hold: the answer as a decimal and the reason, in words that do
  // not send a student who has no i to "the Complex job". Answers are mandatory, so never an error.
  it('a number that never ends gets its decimal answer and a reason, never "just a number" and never the Complex job', () => {
    for (const latex of ['\\sqrt{2}\\pi', '\\sqrt{2}+\\pi']) {
      atEachPrecision((s) => {
        const what = `${latex} at ${s.decimals} ${s.precisionMode}`
        const w = workTyped(latex)
        expect(w.error, `${what}: the answer is mandatory, but it was refused with "${w.error}"`).toBeUndefined()
        expect(w.noWorking, `${what} should come back as an answer without steps`).toBe(true)
        expect(texToPlain(w.reason ?? ''), `${what}: the reason`).toMatch(/never ends/)
        expect(wordsOf(w), `${what}: the words name another job`).not.toMatch(/factoris|complex|just a number/i)
        const line = flat(numbersLine(latex))
        const rows = w.answers.map((a) => flat(a.tex))
        expect(rows.includes(line), `${what}: an answer row reading ${line}; the rows were [${rows.join(' | ')}]`).toBe(true)
        expect(w.checked, `${what}: a decimal answer has no exact check to pass`).toBeUndefined()
        expectRendersAndReads(w, what)
      })
    }
  })

  // Two different roots in one number, multiplied or divided, are beyond one surd (q + r√n). The
  // textbook lines below are exact on paper, but until the working can hold them they must still
  // give their decimal and say why in the surd working's own words; if it ever holds them, the
  // exact answer must be right.
  const TWO_KINDS: [string, string, number][] = [
    ['\\left(\\sqrt{2}+\\sqrt{3}\\right)\\left(\\sqrt{2}-\\sqrt{3}\\right)', '(√2 + √3)(√2 − √3)', -1],
    ['\\frac{1}{\\sqrt{3}-\\sqrt{2}}', '1/(√3 − √2)', R3 + R2],
    ['\\left(\\sqrt{2}+\\sqrt{3}\\right)^2', '(√2 + √3)²', 5 + 2 * Math.sqrt(6)]
  ]

  it('a line with two kinds of root in one number is never refused: its decimal, and a reason that says the roots differ', () => {
    for (const [latex, name, value] of TWO_KINDS) {
      atEachPrecision((s) => {
        const what = `${name} at ${s.decimals} ${s.precisionMode}`
        const w = workTyped(latex)
        expect(w.error, `${what}: the answer is mandatory, but it was refused with "${w.error}"`).toBeUndefined()
        expect(wordsOf(w), `${what}: the words name another job`).not.toMatch(/factoris|complex|just a number/i)
        const line = flat(numbersLine(latex))
        const rows = w.answers.map((a) => flat(a.tex))
        expect(rows.includes(line), `${what}: an answer row reading ${line}; the rows were [${rows.join(' | ')}]`).toBe(true)
        if (w.noWorking) {
          expect(texToPlain(w.reason ?? ''), `${what}: the reason`).toMatch(/different/)
          expect(w.checked, `${what}: a decimal answer has no exact check to pass`).toBeUndefined()
        } else {
          const z = valueOfTex(w.answers[0]?.tex ?? '')
          expect(near(z.re, value) && z.im === 0, `${what}: ${w.answers[0]?.tex} comes to ${z.re}, not ${value}`).toBe(true)
          expect(w.checked, `${what}: the check did not pass`).toBe('ok')
        }
        expectRendersAndReads(w, what)
      })
    }
  })

  it('a sum whose roots differ is its own answer, with whatever does combine collected first', () => {
    // √8 + √3 is 2√2 + √3, 5√3 + √5 is all that √12 + √27 + √5 comes to, and √3 + √2 − √3 is just √2.
    const cases: [string, number, string, (string | RegExp)[]][] = [
      ['\\sqrt{8}+\\sqrt{3}', 2 * R2 + R3, '2\\sqrt{2}+\\sqrt{3}', [named(4, 2)]],
      ['\\sqrt{12}+\\sqrt{27}+\\sqrt{5}', 5 * R3 + R5, '5\\sqrt{3}+\\sqrt{5}', ['(2+3)\\sqrt{3}']],
      ['2\\sqrt{2}-3\\sqrt{3}+1', 2 * R2 - 3 * R3 + 1, '1+2\\sqrt{2}-3\\sqrt{3}', []],
      ['\\sqrt{3}-\\sqrt{2}', R3 - R2, '\\sqrt{3}-\\sqrt{2}', []],
      ['\\sqrt{3}+\\sqrt{2}-\\sqrt{3}', R2, '\\sqrt{2}', ['(1-1)\\sqrt{3}']],
      ['\\left(\\sqrt{2}+\\sqrt{3}-\\sqrt{3}\\right)\\sqrt{2}', 2, '2', ['(1-1)\\sqrt{3}']]
    ]
    for (const [latex, value, shape, shows] of cases) {
      atEachPrecision((s) => {
        const what = `${latex} at ${s.decimals} ${s.precisionMode}`
        const w = workTyped(latex)
        expect(w.error, `${what} was refused with "${w.error}"`).toBeUndefined()
        expect(w.noWorking, `${what} came back as an answer with no steps`).toBeFalsy()
        expect(w.moves.length, `${what}: no steps`).toBeGreaterThan(0)
        expect(flat(w.answers[0]?.tex ?? ''), `${what}: the answer as it stands`).toBe(flat(shape))
        const z = valueOfTex(w.answers[0]?.tex ?? '')
        expect(near(z.re, value) && z.im === 0, `${what}: ${w.answers[0]?.tex} comes to ${z.re}, not ${value}`).toBe(true)
        for (const want of shows) expect(someStepShows(w, want), `${what}: no step shows ${String(want)}`).toBe(true)
        const line = flat(numbersLine(latex))
        expect(w.answers.map((a) => flat(a.tex)).includes(line), `${what}: an answer row reading ${line}`).toBe(true)
        expect(w.checked, `${what}: a check that failed is no answer`).not.toBe('failed')
        expectRendersAndReads(w, what)
      })
    }
    // Two roots that stay say so, once, in plain words; a sum whose roots all combine says no such thing.
    expect(workTyped('\\sqrt{3}+\\sqrt{2}').moves.map((m) => m.head).join(' | ')).toMatch(/√2 and √3 are different roots/)
    expect(workTyped('\\sqrt{2}+\\sqrt{3}+\\sqrt{5}').moves.map((m) => m.head).join(' | ')).toMatch(/all different/)
    expect(workTyped('\\sqrt{3}+\\sqrt{2}-\\sqrt{3}').moves.map((m) => m.head).join(' | ')).not.toMatch(/different/)
    // The sum as typed is not put back together, so no tick is given for it; the one that was rewritten is ticked.
    expect(workTyped('\\sqrt{2}+\\sqrt{3}').checked).toBeUndefined()
    expect(workTyped('\\sqrt{8}+\\sqrt{3}').checked).toBe('ok')
  })

  it('a high power that nearly cancels is still checked and written to the last digit: (4 − √12)²⁷ is about 5 × 10⁻⁸', () => {
    // The exact answer is a difference of two numbers near 10²³; summed in doubles it came to 0, and
    // the check called a right answer suspicious.
    const w = workTyped('\\left(\\left(\\left(4-\\sqrt{12}\\right)^3\\right)^3\\right)^3')
    expect(w.error).toBeUndefined()
    expect(w.checked).toBe('ok')
    expect(flat(w.answers.find((a) => a.label === 'As a decimal')?.tex ?? ''), 'the decimal row').toMatch(/^4\.8\d*\\times10\^\{-8\}$/)
  })

  it('the root of a negative number, typed with no i, is worked as the complex number it is', () => {
    // √−4 has a root and no letter, so it reached the same refusal; its i comes from the root itself.
    const w = workTyped('\\sqrt{-4}')
    expect(w.error, 'was refused').toBeUndefined()
    expect(w.moves.length, 'no steps').toBeGreaterThan(0)
    const z = valueOfTex(w.answers[0]?.tex ?? '')
    expect(near(z.re, 0) && near(z.im, 2), `${w.answers[0]?.tex} comes to ${z.re} + ${z.im}i, not 2i`).toBe(true)
    expect(w.checked).toBe('ok')
  })

  it('a sum of plain numbers with no root keeps its sentence: it is just a number', () => {
    // The guard on the other side of the fix: only a root earns the working. Lines like these are
    // answered by the calculator line above the button, and the sentence says so.
    for (const latex of ['\\frac{1}{2}+\\frac{1}{3}', '\\frac{3}{4}', '0.5+0.25', '\\ln\\left(2\\right)+1']) {
      const w = workTyped(latex)
      expect(w.error, `${latex}: the sentence it has always had`).toBe(JUST_A_NUMBER)
      expect(usePure.getState().job, `${latex} went to the wrong job`).toBe('factor')
    }
    // A whole number written as a sum still gets its primes, and its own title.
    const five = workTyped('2+3')
    expect(five.error).toBeUndefined()
    expect(five.title).toBe('Factorise 5 into primes')
  })

  it('a root beside a sine keeps the sentence it had: a decimal worked in radians would contradict the calculator in degrees', () => {
    // √2 sin 30° is 0.71 on the calculator line in DEG mode; the working's own decimal comes from
    // mathjs, which reads 30 as radians and gives −1.40. Until Pure Math knows the angle unit, no
    // answer is better than a wrong one: the refusal is the one this line has always had.
    const w = workTyped('\\sqrt{2}\\sin\\left(30\\right)')
    expect(w.error).toBe(JUST_A_NUMBER)
  })
})

// ---------------------------------------------------------------------------------------------
// P22b round 2 (checker, 2026-10-03). The surd working read every one-argument operator but the
// minus as nothing, so 3!√2 was worked as 3√2 — "≈ 4.24, already as simple as it gets, nothing to
// check" beside a calculator line of 8.49 — with the numeric check that disagreed hidden, and the
// header wrote the factorial as a plus ("+3√2"). The conjugate sentence read \frac{\sqrt{3}}{2} as
// "√32", and the header of a line with a base-10 log said ln beside the base-10 decimal.
// ---------------------------------------------------------------------------------------------

describe('P22b round 2 — a factorial, the conjugate in words, log and ln (typed LaTeX → Working)', () => {
  const FACTORIALS: [string, string][] = [
    ['3!\\sqrt{2}', '3!√2'],
    ['\\sqrt{2}\\times3!', '√2 × 3!'],
    ['\\sqrt{2}+3!', '√2 + 3!'],
    ['\\sqrt{9}!', '√9!'],
    ['\\left(\\sqrt{2}+1\\right)!', '(√2 + 1)!'],
    ['\\sqrt{2}\\left(\\sqrt{3}\\right)!', '√2(√3)!']
  ]

  /** The line worked out by mathjs, as the calculator reads it. */
  const valueOfLine = (latex: string): number => Number(math.evaluate(writeTimes(preprocess(latexToMath(latex)))))

  it('a factorial is beyond exact surd working: the decimal the calculator gives, a reason that names it, and no tick', () => {
    for (const [latex, name] of FACTORIALS) {
      atEachPrecision((s) => {
        const what = `${name} at ${s.decimals} ${s.precisionMode}`
        const w = workTyped(latex)
        expect(w.error, `${what}: the answer is mandatory, but it was refused with "${w.error}"`).toBeUndefined()
        expect(w.noWorking, `${what}: worked exactly as if the ! were not there, to ${w.answers[0]?.tex}`).toBe(true)
        expect(texToPlain(w.reason ?? ''), `${what}: the reason`).toMatch(/factorial/)
        expect(wordsOf(w), `${what}: the words name another job`).not.toMatch(/factoris|complex|just a number/i)
        const line = flat(numbersLine(latex))
        const rows = w.answers.map((a) => flat(a.tex))
        expect(rows.includes(line), `${what}: an answer row reading ${line}; the rows were [${rows.join(' | ')}]`).toBe(true)
        expect(w.checked, `${what}: a decimal answer has no exact check to pass`).toBeUndefined()
        expect(w.check ?? '', `${what}: nothing was simplified, and nothing may say it was`).not.toMatch(/simplest|nothing to check/)
        expectRendersAndReads(w, what)
      })
    }
  })

  it('the header shows the factorial where it was typed, never as a plus', () => {
    for (const [latex, name] of FACTORIALS) {
      const w = workTyped(latex)
      expect(w.input, `${name}: the header`).toContain('!')
      expect(flat(w.input), `${name}: the header writes the factorial as a plus`).not.toMatch(/^\+|[(×]\+/)
      // The header is the line that was typed: worked out, it comes to the calculator's number.
      const header = valueOfTex(w.input).re
      expect(near(header, valueOfLine(latex)), `${name}: the header ${w.input} comes to ${header}, the line to ${valueOfLine(latex)}`).toBe(true)
      rendersInKatex(w.input, `${name} header`)
    }
    expect(flat(workTyped('3!\\sqrt{2}').input)).toBe('3!\\sqrt{2}')
    expect(flat(workTyped('\\sqrt{2}\\times3!').input)).toBe('\\sqrt{2}\\times3!')
    // √9! is the factorial of √9, as mathjs and the calculator read it; the bracket says so.
    expect(flat(workTyped('\\sqrt{9}!').input)).toBe('(\\sqrt{9})!')
  })

  it('the Complex job names the factorial too: the two readers refuse the same things in the same words', () => {
    const w = workTyped('3!+i')
    expect(usePure.getState().job).toBe('complex')
    expect(w.noWorking).toBe(true)
    expect(texToPlain(w.reason ?? '')).toMatch(/factorial/)
    expect(flat(w.input)).toBe('3!+i')
  })

  it('any other operator the surd reader cannot hold goes the same way, and is not read as if it were not there', () => {
    // A prime after a part of the line reaches the reader as one more one-argument operator (mathjs
    // reads it as a transpose). Every one but a sign was passed over, so 3√2′ was worked as 3√2: the
    // right number by luck, and no word that anything else had been in the line.
    for (const latex of ["3\\sqrt{2}'", '\\sqrt{2}^{\\prime}']) {
      atEachPrecision((s) => {
        const w = workTyped(latex)
        expect(w.error, `${latex}: refused with "${w.error}"`).toBeUndefined()
        expect(w.noWorking, `${latex}: worked exactly as if the prime were not there, to ${w.answers[0]?.tex}`).toBe(true)
        expect(texToPlain(w.reason ?? ''), `${latex}: the reason`).toMatch(/something else/)
        expectDecimalRow(w, valueOfLine(latex), 0, s, latex)
        expect(w.checked, `${latex}: a decimal answer has no exact check to pass`).toBeUndefined()
        expectRendersAndReads(w, latex)
      })
    }
  })

  it('a numeric check that disagrees is never hidden, even under an answer that is the line itself', () => {
    // 3√2 is already as simple as it gets, so there is nothing to put back together and no tick. But
    // the numeric route is the independent one: if it ever comes to another number, "nothing to
    // check" would hide the one sign that the exact answer is wrong (3!√2 hid its 8.49 that way).
    // mathjs's evaluate is the numeric route; here it is made to disagree.
    const real = math.evaluate.bind(math)
    const spy = vi.spyOn(math, 'evaluate').mockImplementation(((expr: unknown, scope?: unknown) => (String(expr).includes('sqrt') ? 99 : real(expr as never, scope as never))) as never)
    try {
      for (const latex of ['3\\sqrt{2}', '\\sqrt{2}+\\sqrt{3}']) {
        const w = workTyped(latex)
        expect(w.error, `${latex} was refused`).toBeUndefined()
        expect(w.checked, `${latex}: the disagreement`).toBe('failed')
        expect(w.check, `${latex}: the check line`).toMatch(/^Careful/)
      }
    } finally {
      spy.mockRestore()
    }
    // With the numeric route back, the line that answers itself has no verdict, as before.
    expect(workTyped('3\\sqrt{2}').checked).toBeUndefined()
    expect(workTyped('3\\sqrt{2}').check).toMatch(/nothing to check/)
  })

  it('the conjugate is written in plain symbols, as the step writes it: √3/2 − 1, never "√32 - 1"', () => {
    // texToPlain reads a fraction only when its top and bottom hold no braces of their own, so the
    // sentence took \frac{\sqrt{3}}{2} for "√32". The words must be the number the step multiplies by,
    // in the order it was typed, with the proper minus.
    const cases: [string, string, number][] = [
      ['\\frac{1}{\\frac{\\sqrt{3}}{2}+1}', '√3/2 − 1', R3 / 2 - 1],
      ['\\frac{1}{\\sqrt{0.5}+1}', '√2/2 − 1', R2 / 2 - 1],
      ['\\frac{2}{1-\\sqrt{\\frac{1}{2}}}', '1 + √2/2', 1 + R2 / 2],
      ['\\frac{1}{\\sqrt{\\frac{5}{6}}-1}', '√30/6 + 1', Math.sqrt(30) / 6 + 1],
      ['\\frac{1}{\\sqrt{3}+1}', '√3 − 1', R3 - 1],
      ['\\frac{1}{\\sqrt{5}-2}', '√5 + 2', R5 + 2],
      // A bottom worked out on the way has no typed order: its conjugate is the number's own.
      ['\\frac{1}{\\left(1+\\sqrt{2}\\right)^2}', '3 − 2√2', 3 - 2 * R2]
    ]
    for (const [latex, said, value] of cases) {
      const w = workTyped(latex)
      expect(w.error, `${latex} was refused`).toBeUndefined()
      const head = w.moves.map((m) => texToPlain(m.head)).find((h) => /conjugate/.test(h)) ?? ''
      const conjugate = /conjugate, (.+?), to clear it/.exec(head)?.[1] ?? ''
      expect(conjugate, `${latex}: the sentence was "${head}"`).toBe(said)
      // Read back as maths, the words are the number the step multiplies by.
      const read = Number(math.evaluate(conjugate.replace(/√(\d+)/g, 'sqrt($1)').replace(/−/g, '-')))
      expect(near(read, value), `${latex}: "${conjugate}" comes to ${read}, not ${value}`).toBe(true)
      expect(w.checked, `${latex}: the check did not pass`).toBe('ok')
      expectRendersAndReads(w, latex)
    }
  })

  it('a base-10 log is shown as log and a natural log as ln, beside the decimal each one gives', () => {
    // mathjs writes its own log, the natural one, as \ln; the Maths field's log is base 10.
    const cases: [string, string][] = [
      ['\\log\\left(\\sqrt{10}\\right)+\\sqrt{2}', '\\log(\\sqrt{10})+\\sqrt{2}'],
      ['\\ln\\left(\\sqrt{10}\\right)+\\sqrt{2}', '\\ln(\\sqrt{10})+\\sqrt{2}'],
      ['\\log_{2}\\left(8\\right)+\\sqrt{2}', '\\log_{2}(8)+\\sqrt{2}']
    ]
    for (const [latex, header] of cases) {
      const w = workTyped(latex)
      expect(w.error, `${latex}: refused with "${w.error}"`).toBeUndefined()
      expect(flat(w.input), `${latex}: the header`).toBe(flat(header))
      const rows = w.answers.map((a) => flat(a.tex))
      expect(rows.includes(flat(numbersLine(latex))), `${latex}: the rows were [${rows.join(' | ')}]`).toBe(true)
      // The header, worked out, is the number the decimal answer gives.
      expect(near(valueOfTex(w.input).re, valueOfLine(latex)), `${latex}: the header ${w.input}`).toBe(true)
      expectRendersAndReads(w, latex)
    }
  })

  it('the seven lines the owner gave are still worked exactly', () => {
    for (const c of ROOT_CASES) {
      const w = workTyped(c.latex)
      expect(w.noWorking, c.name).toBeFalsy()
      expect(near(valueOfTex(w.answers[0]?.tex ?? '').re, c.value), `${c.name}: ${w.answers[0]?.tex}`).toBe(true)
      expect(w.checked, c.name).toBe('ok')
    }
  })
})

// ---------------------------------------------------------------------------------------------
// H12: the expression parser spells θ out as "theta", and the Solve job wrote that word into its
// sentences ("Line the equation up as atheta² + btheta + c = 0") and as italic letters into its
// maths (theta_1 + theta_2), Copy included. The answer labels were already right, and their format
// ("theta_1 =") is what the command bar reads, so it stays.
// ---------------------------------------------------------------------------------------------

describe('H12 — a Greek unknown is θ in words and \\theta in maths, never the word "theta"', () => {
  /** What the student reads as words, labels left out: a label keeps its engine spelling for the command bar. */
  const sentencesOf = (w: Working): string[] =>
    [w.title, w.error, w.reason, w.check, ...w.moves.flatMap((m) => [m.subgoal, m.head, m.note])].filter((t): t is string => Boolean(t))
  const mathsOf = (w: Working): string[] => [w.input, ...w.moves.flatMap((m) => [m.tex, m.rule]), ...w.answers.map((a) => a.tex)].filter((t): t is string => Boolean(t))

  const LINES: [string, string, string[]][] = [
    ['\\theta^2-5\\theta+6=0', 'solve', ['theta_1 =', 'theta_2 =']],
    ['\\theta^2+4=0', 'solve', ['theta_1 =', 'theta_2 =']],
    ['\\theta^2-4\\theta+4=0', 'solve', ['theta =']],
    ['2\\theta+3=7', 'solve', ['theta =']],
    ['\\frac{\\theta}{2}=3', 'solve', ['theta =']]
  ]

  for (const [latex, job, labels] of LINES) {
    it(`${latex}: θ in every sentence, \\theta in every piece of maths, and the labels as the command bar reads them`, () => {
      const w = workTyped(latex)
      expect(usePure.getState().job, `${latex} went to the wrong job`).toBe(job)
      expect(w.error, `${latex} was refused`).toBeUndefined()
      for (const t of sentencesOf(w)) {
        expect(t, `${latex}: a sentence spells the letter out`).not.toMatch(/theta/)
        expect(texToPlain(t), `${latex}: a sentence as the panel shows it`).not.toMatch(/theta/)
      }
      expect(sentencesOf(w).some((t) => t.includes('θ')), `${latex}: no sentence names θ; they were [${sentencesOf(w).join(' | ')}]`).toBe(true)
      for (const t of mathsOf(w)) expect(t, `${latex}: maths writes the letter as the italic letters t, h, e, t, a`).not.toMatch(/(?<!\\)theta/)
      expect(mathsOf(w).some((t) => t.includes('\\theta')), `${latex}: no maths holds \\theta`).toBe(true)
      expect(w.answers.map((a) => a.label)).toEqual(labels)
      expect(w.checked, `${latex}: the check did not pass`).toBe('ok')
      expectRendersAndReads(w, latex)
    })
  }

  it('the quadratic reads aθ² + bθ + c = 0 and checks θ₁ + θ₂, while x stays x', () => {
    const theta = workTyped('\\theta^2-5\\theta+6=0')
    expect(theta.moves[0]?.head).toBe('Line the equation up as aθ² + bθ + c = 0 and read off the three numbers.')
    expect(theta.moves[0]?.rule).toBe('a\\theta^2 + b\\theta + c = 0')
    expect(theta.moves.some((m) => (m.tex ?? '').includes('\\theta_1 + \\theta_2'))).toBe(true)
    const x = workTyped('x^2-5x+6=0')
    expect(x.moves[0]?.head).toBe('Line the equation up as ax² + bx + c = 0 and read off the three numbers.')
    expect(x.moves[0]?.rule).toBe('ax^2 + bx + c = 0')
    expect(x.moves.some((m) => (m.tex ?? '').includes('x_1 + x_2'))).toBe(true)
    expect(x.answers.map((a) => a.label)).toEqual(['x_1 =', 'x_2 ='])
  })

  // H16: the Factorise-with-i job (chosen by hand) wrote "subtract each root from theta" and \left(theta^2 + 4\right).
  it('Factorise with i: θ in its sentences and \\theta in its maths', () => {
    for (const line of ['theta^2 + 4', 'theta^2 + 2*theta + 5', 'theta^4 + 4']) {
      const w = runPure('factorComplex', line)
      expect(w.error, `${line} was refused`).toBeUndefined()
      for (const t of sentencesOf(w)) expect(texToPlain(t), `${line}: a sentence spells the letter out`).not.toMatch(/theta/)
      for (const t of mathsOf(w)) expect(t, `${line}: maths writes the italic letters t, h, e, t, a`).not.toMatch(/(?<!\\)theta/)
      expect(mathsOf(w).some((t) => t.includes('\\theta')), `${line}: no maths holds \\theta`).toBe(true)
      expectRendersAndReads(w, line)
    }
  })
})

// ---------------------------------------------------------------------------------------------
// H15: ∛8 arrives from the field as nthRoot(8, 3), and the router sent every line with a comma to
// HCF unless it had an i in it, which refused it: "Give me at least two expressions". A list's
// commas stand outside every bracket; the one inside nthRoot (or log₂'s) belongs to the function.
// ---------------------------------------------------------------------------------------------

describe('H15 — a comma inside a bracket is never a list for the router', () => {
  it('∛8 goes where a number line goes, and ∛8 + √2 gets its decimal and a reason', () => {
    expect(suggestJob('nthRoot(8, 3)')).toBe('factor')
    const cube = workTyped('\\sqrt[3]{8}')
    expect(usePure.getState().job, '∛8 went to the wrong job').toBe('factor')
    expect(cube.error, '∛8 is a number, as 1/2 + 1/3 is').toBe(JUST_A_NUMBER)
    for (const latex of ['\\sqrt[3]{8}+\\sqrt{2}', '\\log_{2}\\left(8\\right)+\\sqrt{2}']) {
      const w = workTyped(latex)
      expect(usePure.getState().job, `${latex} went to the wrong job`).toBe('factor')
      expect(w.error, `${latex} was refused with "${w.error}"`).toBeUndefined()
      expect(w.noWorking, `${latex}: a decimal answer`).toBe(true)
      expect(w.reason, `${latex}: no reason`).toBeTruthy()
      const rows = w.answers.map((a) => flat(a.tex))
      expect(rows.includes(flat(numbersLine(latex))), `${latex}: the rows were [${rows.join(' | ')}]`).toBe(true)
      expectRendersAndReads(w, latex)
    }
    expect(texToPlain(workTyped('\\sqrt[3]{8}+\\sqrt{2}').reason ?? '')).toMatch(/root other than a square root/)
  })

  it('a list still goes to HCF, whatever its parts hold', () => {
    expect(suggestJob('12, 18')).toBe('hcf')
    expect(suggestJob('nthRoot(8, 3), 4')).toBe('hcf')
    expect(suggestJob('x^2-1, x-1')).toBe('hcf')
    expect(suggestJob('(x+1)(x+2), (x+1)^2')).toBe('hcf')
    expect(suggestJob('nthRoot(2, 3)+i')).toBe('complex')
    const w = workTyped('12,18')
    expect(usePure.getState().job).toBe('hcf')
    expect(w.answers[0]?.tex).toBe('6')
  })
})
