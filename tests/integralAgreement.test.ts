// Part C4: an indefinite integral's "=" answer and its working agree when they are the same antiderivative, whatever form each is
// written in and whatever constant each carries. The check used to compare the two as functions sharing one C, so a constant
// difference (½ ln|(x − 1)/(x + 1)| + 3) and an arctanh form (real on (−1, 1) only) were called "gave different answers" although
// both were right. A wrong antiderivative must still be called a disagreement, and a derivative or a definite integral keeps the
// exact comparison it had.
//
// Each test crosses the boundaries that matter: a typed line goes through evaluateInput, the algebra engine's reply is handed back
// through engineAnswer (its asker is an argument, so the reply is stood in for here, in the engine's own shape), and the card that
// comes out is compared with the working. The working is the one the Calculator's panel builds from SymPy's recorded reply for
// the same line (tests/fixtures/calculus), through the same integralWorking function.

import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { evaluateInput, type EvalResult } from '../src/renderer/src/calc/evaluateInput'
import { engineAnswer } from '../src/renderer/src/calc/engineAnswer'
import { reconcile } from '../src/renderer/src/calc/working'
import { integralWorking, type IntegralTree } from '../src/renderer/src/math/engine/sympy/calculusSteps'
import type { Working } from '../src/renderer/src/math/pure/work'
import { repoPath } from './helpers/repo'
import { resetGlobals } from './helpers/globals'

beforeEach(resetGlobals)

/** The working the Calculator's panel builds for a line SymPy answered and the recording kept (tests/fixtures/calculus/<name>.json). */
const workingOf = (name: string): Working => {
  const fixture = JSON.parse(readFileSync(repoPath('tests', 'fixtures', 'calculus', `${name}.json`), 'utf8')) as { payload: { expr: string }; result: IntegralTree }
  return integralWorking(fixture.result, fixture.payload.expr)
}

/**
 * The card the screen shows for a typed indefinite integral once the algebra engine has replied. "=" hands the line to the engine
 * (evaluateInput returns it under `engine`); the reply is the engine's LaTeX and plain text, and the card takes the shape Maths.tsx
 * gives it when the reply lands.
 */
async function integralCard(line: string, latex: string, text: string): Promise<EvalResult> {
  const r = evaluateInput('COMP', line, { vars: {}, ans: 0, angle: 'deg' })
  if (!r?.engine) throw new Error(`"${line}" was not handed to the algebra engine`)
  const reply = await engineAnswer(r.engine, async () => ({ latex, text, numeric: null }))
  if (!reply.ok) throw new Error(reply.error)
  return { ...r, engine: undefined, main: reply.main, tex: reply.tex }
}

const ONE_OVER_X_SQUARED_MINUS_ONE = String.raw`\int\frac{1}{x^2-1}\,dx`
const ONE_OVER_X = String.raw`\int\frac{1}{x}\,dx`
const X_TIMES_E_TO_X = String.raw`\int x e^{x}\,dx`

describe('an indefinite integral agrees with its working when both are the same antiderivative', () => {
  const working = workingOf('integral-partial')

  it('the working’s own form agrees with the card', async () => {
    const card = await integralCard(ONE_OVER_X_SQUARED_MINUS_ONE, String.raw`\frac{1}{2}\ln\left|x-1\right|-\frac{1}{2}\ln\left|x+1\right|`, '1/2*log(abs(x-1)) - 1/2*log(abs(x+1))')
    const out = reconcile(card, working)
    expect(out.verdict).toBe('agree')
    expect(out.result).toBe(card)
    expect(out.line).toBeUndefined()
  })

  it('the same antiderivative written as ½ ln of a quotient agrees', async () => {
    const card = await integralCard(ONE_OVER_X_SQUARED_MINUS_ONE, String.raw`\frac{1}{2}\ln\left|\frac{x-1}{x+1}\right|`, 'log(abs((x-1)/(x+1)))/2')
    expect(reconcile(card, working).verdict).toBe('agree')
  })

  it('the arctanh form agrees: it is real on (−1, 1) only, and the check tests it there', async () => {
    const card = await integralCard(ONE_OVER_X_SQUARED_MINUS_ONE, String.raw`-\tanh^{-1}{\left(x \right)}`, '-atanh(x)')
    const out = reconcile(card, working)
    expect(out.verdict).toBe('agree')
    expect(out.result).toBe(card)
  })

  it('the same antiderivative plus a constant agrees, because the constant is what + C stands for', async () => {
    const card = await integralCard(ONE_OVER_X_SQUARED_MINUS_ONE, String.raw`\frac{1}{2}\ln\left|\frac{x-1}{x+1}\right|+3`, 'log(abs((x-1)/(x+1)))/2 + 3')
    expect(reconcile(card, working).verdict).toBe('agree')
  })

  it('a wrong antiderivative is still a disagreement, shown as one with the working’s answer', async () => {
    // ln|(x − 1)/(x + 1)| is twice the answer: its slope is 2/(x² − 1), not 1/(x² − 1).
    const card = await integralCard(ONE_OVER_X_SQUARED_MINUS_ONE, String.raw`\ln\left|\frac{x-1}{x+1}\right|`, 'log(abs((x-1)/(x+1)))')
    const out = reconcile(card, working)
    expect(out.verdict).toBe('differ')
    expect(out.result.unconfirmed).toBe(true)
    expect(out.result.tex).toBe(working.answers[0].tex)
    expect(out.line).toMatch(/^PHYSLAB_CHECK calc-disagree /)
  })

  it('a log of the square, which has a different slope, is a disagreement too', async () => {
    const card = await integralCard(ONE_OVER_X_SQUARED_MINUS_ONE, String.raw`\frac{1}{2}\ln\left|x^{2}-1\right|`, 'log(abs(x**2-1))/2')
    expect(reconcile(card, working).verdict).toBe('differ')
  })
})

describe('the same test holds for other integrals', () => {
  const reciprocal = workingOf('integral-reciprocal')
  const parts = workingOf('integral-parts')

  it('ln|x| agrees, and so does ln x, which is real only for x > 0', async () => {
    expect(reconcile(await integralCard(ONE_OVER_X, String.raw`\ln\left|x\right|`, 'log(abs(x))'), reciprocal).verdict).toBe('agree')
    expect(reconcile(await integralCard(ONE_OVER_X, String.raw`\ln x`, 'log(x)'), reciprocal).verdict).toBe('agree')
  })

  it('ln|x| with a constant subtracted agrees', async () => {
    expect(reconcile(await integralCard(ONE_OVER_X, String.raw`\ln\left|x\right|-5`, 'log(abs(x)) - 5'), reciprocal).verdict).toBe('agree')
  })

  it('1/x is not the antiderivative of 1/x, and is a disagreement', async () => {
    expect(reconcile(await integralCard(ONE_OVER_X, String.raw`\frac{1}{x}`, '1/x'), reciprocal).verdict).toBe('differ')
  })

  it('(x − 1)eˣ agrees with its expanded form plus a constant, and x eˣ alone is a disagreement', async () => {
    expect(reconcile(await integralCard(X_TIMES_E_TO_X, String.raw`e^{x}\left(x-1\right)`, 'e^x (x - 1)'), parts).verdict).toBe('agree')
    expect(reconcile(await integralCard(X_TIMES_E_TO_X, String.raw`x e^{x}-e^{x}+2`, 'x e^x - e^x + 2'), parts).verdict).toBe('agree')
    expect(reconcile(await integralCard(X_TIMES_E_TO_X, String.raw`x e^{x}`, 'x e^x'), parts).verdict).toBe('differ')
  })

  it('a parameter beside x is a letter of its own: n x is read as n·x and checked, and a wrong power is still a disagreement', async () => {
    const working: Working = { title: 'Integrate', input: 'n x', moves: [], answers: [{ label: 'Answer', tex: String.raw`\frac{n x^{2}}{2} + C` }], checked: 'ok' }
    const right = await integralCard(String.raw`\int n x\,dx`, String.raw`\frac{n x^{2}}{2}`, 'n*x^2/2')
    expect(reconcile(right, working).verdict).toBe('agree')
    const wrong = await integralCard(String.raw`\int n x\,dx`, String.raw`\frac{n x^{3}}{3}`, 'n*x^3/3')
    expect(reconcile(wrong, working).verdict).toBe('differ')
  })

  it('a subscripted letter: the same answer agrees, and a different one is left unchecked, never ticked', async () => {
    // The converter turns a_{1} into a1 and glues it to x, so the reader cannot split it. The same text is still the same answer, but
    // a different one cannot be compared letter by letter, so it is not called a disagreement either.
    const working: Working = { title: 'Integrate', input: 'a_1 x', moves: [], answers: [{ label: 'Answer', tex: String.raw`\frac{a_{1} x^{2}}{2} + C` }], checked: 'ok' }
    const right = await integralCard(String.raw`\int a_{1} x\,dx`, String.raw`\frac{a_{1} x^{2}}{2}`, 'a_1*x^2/2')
    expect(reconcile(right, working).verdict).toBe('agree')
    const wrong = await integralCard(String.raw`\int a_{1} x\,dx`, String.raw`\frac{a_{1} x^{3}}{3}`, 'a_1*x^3/3')
    expect(reconcile(wrong, working).verdict).toBe('unchecked')
  })
})

describe('what stays exact: a definite integral and a derivative', () => {
  it('a definite integral is compared as a number, as before', async () => {
    const definite = workingOf('integral-definite')
    const r = evaluateInput('COMP', String.raw`\int_{0}^{2}x^{2}\,dx`, { vars: {}, ans: 0, angle: 'deg' })!
    expect(r.engine).toBeUndefined()
    expect(reconcile(r, definite).verdict).toBe('agree')
    expect(reconcile({ ...r, main: '3', value: 3, exact: null }, definite).verdict).toBe('differ')
  })

  it('a derivative that differs from the working by a constant is still a disagreement', () => {
    const working: Working = { title: 'Differentiate', input: 'x^2', moves: [], answers: [{ label: 'Answer', tex: '2x + C' }], checked: 'ok' }
    const card: EvalResult = { main: '2x', formula: '2 * x', tex: '2x', src: 'diff(x^2, x)' }
    expect(reconcile(card, working).verdict).toBe('differ')
  })
})
