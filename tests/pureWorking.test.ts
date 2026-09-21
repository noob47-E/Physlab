import { describe, expect, it } from 'vitest'
import { JOBS, runPure, suggestJob, type JobId } from '../src/renderer/src/math/pure/run'
import { JUST_A_NUMBER, JUST_A_WHOLE_NUMBER, isNumericLine } from '../src/renderer/src/math/pure/factor'
import { readSource } from './helpers/repo'
import { Steps, texToPlain } from '../src/renderer/src/math/pure/work'
import { checkTone, fieldHasText, initialShown, offeredJob, resolveJob, stepPrefFrom } from '../src/renderer/src/math/pure/reveal'
import { agreesNumerically } from '../src/renderer/src/math/pure/complex'
import { evalDisplayedSum } from '../src/renderer/src/math/pure/latexCheck'
import { rStr, rat } from '../src/renderer/src/math/pure/rat'
import { latexToMath } from '../src/renderer/src/math/latexToMath'

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
    expect(runPure('factor', '2/3+sqrt(2)').error).toBe(JUST_A_NUMBER)
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
      const w = runPure(job.id, job.example)
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
  ...JOBS.map((job): Walked => [`${job.id} "${job.example}"`, runPure(job.id, job.example)]),
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
    // The minus belongs to the first term of the numerator, not to the whole fraction.
    expect(w.answers[0].tex).toContain(String.raw`+ \dfrac{-\frac{1}{2}x`)
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
