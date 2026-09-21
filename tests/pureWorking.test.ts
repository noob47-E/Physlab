import { describe, expect, it } from 'vitest'
import { JOBS, runPure, suggestJob } from '../src/renderer/src/math/pure/run'
import { texToPlain } from '../src/renderer/src/math/pure/work'
import { checkTone, fieldHasText, initialShown, offeredJob, resolveJob, stepPrefFrom } from '../src/renderer/src/math/pure/reveal'
import { agreesNumerically } from '../src/renderer/src/math/pure/complex'
import { evalDisplayedSum } from '../src/renderer/src/math/pure/latexCheck'
import { rStr, rat } from '../src/renderer/src/math/pure/rat'

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
    expect(w.moves[0].head).toMatch(/^In .*x \+ 2.*multiply/)
    expect(w.moves[w.moves.length - 1].head).toMatch(/Add the pieces/)
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
    expect(w.moves[0].head).toBe('Multiply every term of 2x by every term of \\left(x + 1\\right).')
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
    // Everything read as a sentence — the check line, every step heading, every note — goes
    // through texToPlain before it is shown, so none of it may still look like LaTeX afterwards.
    for (const job of JOBS) {
      const w = runPure(job.id, job.example)
      const sentences = [w.check ?? '', ...w.moves.map((m) => m.head), ...w.moves.map((m) => m.note ?? '')]
      for (const raw of sentences) {
        expect(texToPlain(raw), `${job.id}: ${raw}`).not.toMatch(/[\\{}]/)
      }
    }
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
