// Contracts that cross a boundary.
//
// Every bug repaired in 0.3.3 lived on a boundary: TypeScript to Python, a store to a web
// component, an internal vector to the string a student reads. 209 tests passed with all of them
// in the tree, because each half was tested on its own and nothing tested the join.
//
// These do. They are still pure — no DOM, no browser.

import { readSource } from './helpers/repo'
import { afterEach, describe, expect, it, vi } from 'vitest'
import katex from 'katex'
import { isFieldSafeLatex, linearSyntaxIn } from '../src/renderer/src/ui/latexSafety'
import { isActivatable, isTyping } from '../src/renderer/src/app/keyTargets'
import { JOBS, linearToLatex, runPure } from '../src/renderer/src/math/pure/run'
import { casAnswerIsCurrent, usePure } from '../src/renderer/src/math/pure/store'
import { casRequestFor, forSymPy } from './helpers/sympyRequests'
import { CAS_OPS } from '../src/renderer/src/math/engine/sympy/worker'
import { latexToMath } from '../src/renderer/src/math/latexToMath'
import { evalDisplayedSum, splitDisplayedSum } from '../src/renderer/src/math/pure/latexCheck'
import { rStr, rat } from '../src/renderer/src/math/pure/rat'
import { exprTex, parseExpr, parseFraction } from '../src/renderer/src/math/pure/mono'
import type { MathNode } from 'mathjs'
import { math, preprocess } from '../src/renderer/src/math/expr'

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
    // Not a polynomial either (x^2 sin(x), which Differentiate offers): compared by its values,
    // read the way the app reads it, since "x^2 sin(x)" and "x^(2)sin(x)" are one function.
  }
  try {
    const f = asSymPyReadsIt(part).compile()
    return [0.3, 0.7, 1.9].map((x) => Number(f.evaluate({ x })).toPrecision(10)).join(', ')
  } catch {
    return part.replace(/\s+/g, '')
  }
}

/**
 * A calculus line read the way the worker's SymPy parser reads it (implicit multiplication): a
 * run of letters that is no known name is a product of single letters ("xe^(x)" is x·e^x), and a
 * letter before a bracket multiplies it ("x(e)^(x)" is x·e^x). Integrate and Differentiate send
 * the field's line to SymPy, not to mathjs, so this is what the field has to mean.
 */
function asSymPyReadsIt(part: string): MathNode {
  // Split at the token level, as SymPy does, so "xe^(x)" is x·e^x and never (x·e)^x.
  const split = preprocess(forSymPy(part)).replace(/[A-Za-z]+(\s*\()?/g, (run, bracket?: string) => {
    const name = bracket ? run.slice(0, -bracket.length) : run
    if (name in math && (bracket || typeof (math as unknown as Record<string, unknown>)[name] !== 'function')) return run
    return name.split('').join('*') + (bracket ? `*${bracket}` : '')
  })
  return math.parse(split)
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
    expect(casRequestFor('solve', 'x^3 = 1', true)).toEqual({ op: 'solve', payload: { eqs: ['x^3 = 1'], deg: true } })
  })

  it('sends everything else an expression', () => {
    expect(casRequestFor('factor', 'x^2-1', true)).toEqual({ op: 'factor', payload: { expr: 'x^2-1', deg: true } })
    expect(casRequestFor('partial', '1/(x^2-1)', false)).toEqual({ op: 'apart', payload: { expr: '1/(x^2-1)', deg: false } })
    // Over the complex numbers, not the rationals: plain factor would hand x² + 4 straight back.
    expect(casRequestFor('factorComplex', 'x^2+4', true)).toEqual({ op: 'factor_complex', payload: { expr: 'x^2+4', deg: true } })
  })

  it('only asks for operations the worker implements', () => {
    // Every op in CAS_OPS has a branch in the worker, and the branch is run in casWorker.test.ts.
    // Here: every job the panel can send names an op from that list.
    for (const j of JOBS) {
      const req = casRequestFor(j.id, 'x', true)
      if (req) expect(CAS_OPS, `${j.id} asks for an unknown op`).toContain(req.op)
    }
  })

  it('a warm-up is not a question: it carries no id, so nothing waits, counts as busy or times out', () => {
    // Sent through cas() it was a request like any other: the strip said "Working…" with a Stop
    // button while SymPy loaded, and a slow first launch hit the 30 s timer and killed the worker.
    // The client's warm-up is run in the describe below; the worker's two checks are still read.
    const worker = readSource('src/renderer/src/workers/cas.worker.ts')
    expect(worker).toContain("if (id === undefined || op === 'warmup')")
    // A failed load still answers a waiting request, with a sentence and the raw text as detail.
    expect(worker).toMatch(/if \(!py\) \{\s*postMessage\(\{ status: 'error'[^\n]*\n\s*if \(id !== undefined\) postMessage\(\{ id, result: \{ error: /)
  })
})

describe('the algebra client sends a warm-up as one message with no id (A6-07)', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('warmupCas posts one id-less warm-up, and a second call while the worker exists posts nothing', async () => {
    class FakeWorker {
      static made: FakeWorker[] = []
      sent: unknown[] = []
      onmessage: unknown = null
      onerror: unknown = null
      constructor() {
        FakeWorker.made.push(this)
      }
      postMessage(m: unknown): void {
        this.sent.push(m)
      }
      terminate(): void {}
    }
    // getWorker starts a two-minute boot timer; fake time keeps it from outliving this test.
    vi.useFakeTimers()
    vi.stubGlobal('Worker', FakeWorker)
    vi.resetModules()
    const client = await import('../src/renderer/src/math/engine/sympy/worker')
    client.warmupCas()
    client.warmupCas()
    expect(FakeWorker.made).toHaveLength(1)
    // An id would make the worker answer it, and a request with an id counts as busy.
    expect(FakeWorker.made[0].sent).toStrictEqual([{ op: 'warmup', payload: {} }])
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
    // 15 digits: a longer number loses digits before Pure Maths sees it and is refused (P-FIX-PURE U2).
    const w = runPure('solve', 'x^2 + x + 999999999999989 = 0')
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
