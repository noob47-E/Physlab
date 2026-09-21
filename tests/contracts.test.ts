// Contracts that cross a boundary.
//
// Every bug repaired in 0.3.3 lived on a boundary: TypeScript to Python, a store to a web
// component, an internal vector to the string a student reads. 209 tests passed with all of them
// in the tree, because each half was tested on its own and nothing tested the join.
//
// These do. They are still pure — no DOM, no browser.

import { readSource } from './helpers/repo'
import { describe, expect, it } from 'vitest'
import katex from 'katex'
import { isFieldSafeLatex, linearSyntaxIn } from '../src/renderer/src/ui/latexSafety'
import { isActivatable, isTyping } from '../src/renderer/src/app/keyTargets'
import { JOBS, linearToLatex, runPure } from '../src/renderer/src/math/pure/run'
import { casAnswerIsCurrent, casRequestFor, usePure } from '../src/renderer/src/math/pure/store'
import { CAS_OPS } from '../src/renderer/src/math/cas'
import { latexToMath } from '../src/renderer/src/math/latexToMath'
import { evalDisplayedSum, splitDisplayedSum } from '../src/renderer/src/math/pure/latexCheck'
import { rStr, rat } from '../src/renderer/src/math/pure/rat'
import { exprTex, parseExpr, parseFraction } from '../src/renderer/src/math/pure/mono'

/**
 * What an input means, independent of how it was spelled.
 * A comma-separated list (HCF, LCM) is compared part by part.
 */
const sideMeaning = (part: string): string => {
  try {
    return exprTex(parseExpr(part))
  } catch {
    // Not a plain expression: it may still be a fraction, which is its own shape.
  }
  try {
    const { num, den } = parseFraction(part)
    return `${exprTex(num)} over ${exprTex(den)}`
  } catch {
    return part.replace(/\s+/g, '')
  }
}

const meaningOf = (src: string): string =>
  src
    .split(',')
    .map((part) => part.split('=').map(sideMeaning).join(' = '))
    .join(' | ')

describe('what may be written into a maths field', () => {
  it('recognises linear syntax', () => {
    expect(isFieldSafeLatex('6x^{2}+7x-3')).toBe(true)
    expect(isFieldSafeLatex(String.raw`\frac{3x+5}{\left(x+1\right)}`)).toBe(true)
    expect(isFieldSafeLatex('360')).toBe(true)

    expect(linearSyntaxIn('6x^(2)+7x-3')).not.toHaveLength(0)
    expect(linearSyntaxIn('(3x+5)/((x+1)(x+2))')).not.toHaveLength(0)
    expect(linearSyntaxIn('2*x')).not.toHaveLength(0)
    expect(linearSyntaxIn('sqrt(2)')).not.toHaveLength(0)
    expect(linearSyntaxIn('30°')).not.toHaveLength(0)
  })

  it('flags exactly what latexToMath produces', () => {
    // latexToMath's output is the linear form, so by definition it must never be field-safe.
    expect(isFieldSafeLatex(latexToMath(String.raw`\frac{1}{2}`))).toBe(false)
    expect(isFieldSafeLatex(latexToMath('x^{2}'))).toBe(false)
  })

  it('every example the panel can load is LaTeX', () => {
    for (const j of JOBS) {
      expect(linearSyntaxIn(j.exampleLatex), `${j.id}: ${j.exampleLatex}`).toEqual([])
    }
  })

  it('the store never puts linear syntax where the field will read it', () => {
    // The real store: zustand, and its localStorage use is already inside try/catch, so it loads
    // in plain node. This is the invariant the bracket bug broke.
    for (const j of JOBS) {
      usePure.getState().run(j.id, j.example, j.exampleLatex)
      const { input, inputLatex } = usePure.getState()
      expect(isFieldSafeLatex(inputLatex), `${j.id} wrote linear syntax into the field`).toBe(true)
      // …and the field still means what was actually worked out. Compared by meaning, not by
      // spelling: "6x^2 + 7x - 3" and "6x^(2)+7x-3" are the same expression written two ways.
      expect(meaningOf(latexToMath(inputLatex)), j.id).toBe(meaningOf(input))
    }
  })

  it('the command bar route converts its linear syntax before the field sees it', () => {
    // factor(6x^2+7x-3) typed in the command bar used to be written into the Working field as
    // it was, so the student saw x^(2) with a stray bracket. Every example must convert cleanly
    // and still mean the same thing.
    for (const j of JOBS) {
      const latex = linearToLatex(j.example)
      expect(isFieldSafeLatex(latex), `${j.id}: ${latex}`).toBe(true)
      expect(meaningOf(latexToMath(latex)), j.id).toBe(meaningOf(j.example))
    }
    expect(linearToLatex('x^2 + 4x + 13 = 0')).toBe('x^{2}+4x+13=0')
    // A lone letter inside a command's braces keeps them: \\fracx{2} is an unknown command.
    expect(linearToLatex('x/2')).toBe('\\frac{x}{2}')
    expect(linearToLatex('sqrt(x)+1')).toBe('\\sqrt{x}+1')
    expect(linearToLatex('2*x')).toBe('2\\cdot x')
    expect(linearToLatex('x^2/(x+1)')).toBe('\\frac{x^{2}}{x+1}')
    for (const src of ['x/2', 'sqrt(x)+1', '2*x', 'x^2/(x+1)', 'x/2+1=3']) {
      const latex = linearToLatex(src)
      expect(isFieldSafeLatex(latex), latex).toBe(true)
      expect(() => katex.renderToString(latex, { throwOnError: true, strict: 'ignore' }), latex).not.toThrow()
    }
  })

  it('a throw inside a generator becomes a readable refusal, never a crash', () => {
    // The store's guard is the last line of defence: whatever a generator throws, the panel
    // shows a sentence and keeps working.
    expect(() => usePure.getState().run('factorComplex', 'x^2 + 2i', 'x^2+2i')).not.toThrow()
    expect(usePure.getState().working?.error).toMatch(/already has i/)
    expect(() => usePure.getState().run('solve', '(1+i)x = 3', '(1+i)x=3')).not.toThrow()
    expect(usePure.getState().working?.error).toBeTruthy()
  })

  it('drops a slow SymPy answer that belongs to an earlier run', () => {
    // Problem 1 asks SymPy; the student types problems 2 and 3 meanwhile. Only an answer to the
    // latest run may be shown, whatever the input text happens to be.
    expect(casAnswerIsCurrent(1, 3)).toBe(false)
    expect(casAnswerIsCurrent(3, 3)).toBe(true)
    const before = usePure.getState().runSeq
    usePure.getState().run('factor', 'x^2 - 1', 'x^{2}-1')
    usePure.getState().run('factor', 'x^2 - 1', 'x^{2}-1')
    expect(usePure.getState().runSeq).toBe(before + 2)
  })

  it('recalling an entry restores the LaTeX, not the linear form', () => {
    usePure.getState().clearHistory()
    usePure.getState().run('factor', '6x^2 + 7x - 3', '6x^{2}+7x-3')
    const [entry] = usePure.getState().history
    expect(entry).toBeDefined()
    usePure.getState().run('primes', '360', '360')
    usePure.getState().recall(entry.id)
    expect(usePure.getState().inputLatex).toBe('6x^{2}+7x-3')
    expect(isFieldSafeLatex(usePure.getState().inputLatex)).toBe(true)
  })
})

describe('who owns a keypress', () => {
  it('stands down for anything being typed in', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'MATH-FIELD', 'math-field']) {
      expect(isTyping({ tagName }), tagName).toBe(true)
    }
    expect(isTyping({ tagName: 'DIV', isContentEditable: true })).toBe(true)
    expect(isTyping({ tagName: 'DIV' })).toBe(false)
    expect(isTyping({ tagName: 'CANVAS' })).toBe(false)
    expect(isTyping(null)).toBe(false)
  })

  it('leaves Enter and Space to controls that already use them', () => {
    expect(isActivatable({ tagName: 'BUTTON' })).toBe(true)
    expect(isActivatable({ tagName: 'SUMMARY' })).toBe(true)
    expect(isActivatable({ tagName: 'A', hasAttribute: () => true })).toBe(true)
    expect(isActivatable({ tagName: 'DIV', getAttribute: () => 'checkbox' })).toBe(true)
    expect(isActivatable({ tagName: 'DIV', getAttribute: () => null })).toBe(false)
  })
})

describe('the contract with the Python worker', () => {
  it('sends solve the key the worker actually reads', () => {
    // This was `equations` while the worker read `eqs`, so every solve fallback failed silently.
    expect(casRequestFor('solve', 'x^3 = 1')).toEqual({ op: 'solve', payload: { eqs: ['x^3 = 1'] } })
  })

  it('sends everything else an expression', () => {
    expect(casRequestFor('factor', 'x^2-1')).toEqual({ op: 'factor', payload: { expr: 'x^2-1' } })
    expect(casRequestFor('partial', '1/(x^2-1)')).toEqual({ op: 'apart', payload: { expr: '1/(x^2-1)' } })
    // Over the complex numbers, not the rationals: plain factor would hand x² + 4 straight back.
    expect(casRequestFor('factorComplex', 'x^2+4')).toEqual({ op: 'factor_complex', payload: { expr: 'x^2+4' } })
    expect(readSource('src/renderer/src/workers/cas.worker.ts')).toContain('extension=[sp.I]')
  })

  it('only asks for operations the worker implements', () => {
    // Reading the Python as text is the only thing that can tie a TypeScript constant to a string
    // literal in another language. It is ugly, and it is the check that was missing.
    const worker = readSource('src/renderer/src/workers/cas.worker.ts')
    for (const op of CAS_OPS) {
      if (op === 'warmup') continue // handled before the dispatch, not as a branch
      expect(worker, `worker has no branch for '${op}'`).toContain(`if op == '${op}'`)
    }
    for (const j of JOBS) {
      const req = casRequestFor(j.id, 'x')
      if (req) expect(CAS_OPS, `${j.id} asks for an unknown op`).toContain(req.op)
    }
  })
})

describe('reading a displayed answer back', () => {
  it('splits a sum of fractions', () => {
    const parts = splitDisplayedSum(String.raw`\dfrac{2}{\left(x + 1\right)} + \dfrac{1}{\left(x + 2\right)}`)
    expect(parts).toHaveLength(2)
    expect(parts?.[0].sign).toBe(1)
    expect(parts?.[1].den).toBe(String.raw`\left(x + 2\right)`)
  })

  it('handles a leading minus, a whole part and a power on the bottom', () => {
    const whole = splitDisplayedSum(String.raw`x - 3 - \dfrac{1}{\left(x + 1\right)}`)
    expect(whole?.[0]).toMatchObject({ sign: 1, num: 'x - 3', den: null })
    expect(whole?.[1].sign).toBe(-1)

    const squared = splitDisplayedSum(String.raw`\dfrac{2}{\left(x + 1\right)^{2}}`)
    expect(squared?.[0].den).toBe(String.raw`\left(x + 1\right)^{2}`)
  })

  it('evaluates what is written, exactly', () => {
    const answer = String.raw`\dfrac{2}{\left(x + 1\right)} + \dfrac{1}{\left(x + 2\right)}`
    // (3x+5)/((x+1)(x+2)) at x = 0 is 5/2.
    expect(rStr(evalDisplayedSum(answer, 'x', rat(0n))!)).toBe('5/2')
  })

  it('refuses rather than guesses when it cannot read the string', () => {
    expect(splitDisplayedSum(String.raw`\sqrt{x}`)).not.toBeNull() // a whole part is legitimate
    expect(evalDisplayedSum(String.raw`\dfrac{1}{\left(x - 2\right)}`, 'x', rat(2n))).toBeNull() // pole
    expect(evalDisplayedSum('not maths at all {{{', 'x', rat(1n))).toBeNull()
  })

  it('catches an answer whose sign was corrupted', () => {
    // The shape of the bug this was written for: negating a whole fraction when only the first
    // term of its numerator was negative.
    const right = String.raw`\dfrac{\frac{1}{2}}{\left(x + 1\right)} + \dfrac{-\frac{1}{2}x + \frac{1}{2}}{\left(x^{2} + 1\right)}`
    const wrong = String.raw`\dfrac{\frac{1}{2}}{\left(x + 1\right)} - \dfrac{\frac{1}{2}x + \frac{1}{2}}{\left(x^{2} + 1\right)}`
    expect(rStr(evalDisplayedSum(right, 'x', rat(0n))!)).toBe('1')
    expect(rStr(evalDisplayedSum(wrong, 'x', rat(0n))!)).toBe('0')
  })
})

// A timeout on each of these so a lost ceiling FAILS the suite instead of hanging it.
describe('searches stop instead of freezing the window', () => {
  it('a huge discriminant still answers', { timeout: 4000 }, () => {
    const w = runPure('solve', 'x^2 + x + 1000000000000000003 = 0')
    expect(w.error).toBeUndefined()
    expect(w.answers.length).toBeGreaterThan(0)
  })

  it('a huge constant term says it gave up, and does not claim there are no factors', { timeout: 4000 }, () => {
    const w = runPure('factor', 'x^3 - 999999999999937')
    expect(w.check ?? '').not.toMatch(/does not break into simpler factors/)
  })

  it('a huge product in a quadratic still returns', { timeout: 4000 }, () => {
    const w = runPure('factor', '999999937x^2 + 2x + 1')
    expect(Boolean(w.error) || w.answers.length > 0).toBe(true)
  })
})
