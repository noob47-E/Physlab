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
//
// The blocks at the end cover the findings of the review that followed: tiny integrands, Greek integration letters, the engine's plain
// LaTeX (\log for the natural log, \operatorname for the inverse functions) and a sweep of wrong cards at every scale. Vitest does not run
// SymPy, so those replies are written in the shape SymPy's plain printer gives (the \log{\left(...\right)} form that
// tests/fixtures/engineReplies/integrate-reciprocal-square.json records from a real reply).

import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { evaluateInput, type EvalResult } from '../src/renderer/src/calc/evaluateInput'
import { engineAnswer } from '../src/renderer/src/calc/engineAnswer'
import { reconcile } from '../src/renderer/src/calc/working'
import { sameAntiderivative } from '../src/renderer/src/calc/formula'
import { math } from '../src/renderer/src/math/expr'
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

/**
 * The plain reply the algebra engine gave for a typed integral, as recorded in tests/fixtures/engineReplies/<name>.json (op 'integrate').
 * The engine's plain LaTeX writes the natural log as \log, which is what a real reply carries; the stand-in replies above write \ln. The
 * folder is not tests/fixtures/calculus, whose every file is a worker's integral or derivative tree.
 */
const replyOf = (name: string): { latex: string; text: string } => {
  const fixture = JSON.parse(readFileSync(repoPath('tests', 'fixtures', 'engineReplies', `${name}.json`), 'utf8')) as { result: { latex: string; text: string } }
  return fixture.result
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

  it('the engine’s own reply, which writes the natural log as \\log, agrees with the working (the log is ln on the card)', async () => {
    // Without the fix the card was read with \log as log base 10: its slope was off by 1/ln 10 and the working was called wrong.
    const recorded = replyOf('integrate-reciprocal-square')
    const card = await integralCard(ONE_OVER_X_SQUARED_MINUS_ONE, recorded.latex, recorded.text)
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

  it('ln x written with \\log, as the engine writes it, agrees too, and a wrong answer is still a disagreement', async () => {
    expect(reconcile(await integralCard(ONE_OVER_X, String.raw`\log{\left(x \right)}`, 'log(x)'), reciprocal).verdict).toBe('agree')
    expect(reconcile(await integralCard(ONE_OVER_X, String.raw`\log{\left(x \right)}+3`, 'log(x) + 3'), reciprocal).verdict).toBe('agree')
    expect(reconcile(await integralCard(ONE_OVER_X, String.raw`\frac{1}{x}`, '1/x'), reciprocal).verdict).toBe('differ')
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

  it('a subscripted letter: the same answer agrees, and a wrong one is a disagreement', async () => {
    // The converter turns a_{1} into a1 and glues it to x. The reader splits a letter and its digits from the letter after them (a1·x),
    // so the wrong power is compared and called a disagreement. Before the split it was left unchecked, which the brief does not allow.
    const working: Working = { title: 'Integrate', input: 'a_1 x', moves: [], answers: [{ label: 'Answer', tex: String.raw`\frac{a_{1} x^{2}}{2} + C` }], checked: 'ok' }
    const right = await integralCard(String.raw`\int a_{1} x\,dx`, String.raw`\frac{a_{1} x^{2}}{2}`, 'a_1*x^2/2')
    expect(reconcile(right, working).verdict).toBe('agree')
    const wrong = await integralCard(String.raw`\int a_{1} x\,dx`, String.raw`\frac{a_{1} x^{3}}{3}`, 'a_1*x^3/3')
    expect(reconcile(wrong, working).verdict).toBe('differ')
  })
})

describe('an integrand of 10⁻⁹ or 10⁻¹⁹, or a steep one, is checked by its own size', () => {
  // A fixed floor used to make every answer agree at these scales (a wrong card, twice the truth, was ticked). The check now compares
  // each slope with its own size and its own rounding, so a wrong card is a disagreement at any scale.

  it('an integrand of 10⁻⁹ x: the right antiderivative agrees and a card twice the truth is a disagreement', async () => {
    const working: Working = { title: 'Integrate', input: '10^-9 x', moves: [], answers: [{ label: 'Answer', tex: String.raw`\frac{10^{-9}x^{2}}{2} + C` }], checked: 'ok' }
    const right = await integralCard(String.raw`\int 10^{-9}x\,dx`, String.raw`\frac{x^{2}}{2\times10^{9}}`, 'x^2/(2*10^9)')
    expect(reconcile(right, working).verdict).toBe('agree')
    const wrong = await integralCard(String.raw`\int 10^{-9}x\,dx`, String.raw`10^{-9}x^{2}`, '10^-9*x^2')
    expect(reconcile(wrong, working).verdict).toBe('differ')
  })

  it('an integrand of 1.6×10⁻¹⁹: a card twice the truth is a disagreement', async () => {
    const working: Working = { title: 'Integrate', input: '1.6e-19', moves: [], answers: [{ label: 'Answer', tex: String.raw`1.60\times10^{-19}x + C` }], checked: 'ok' }
    const right = await integralCard(String.raw`\int 1.6\times10^{-19}\,dx`, String.raw`1.6\times10^{-19}x`, '1.6e-19*x')
    expect(reconcile(right, working).verdict).toBe('agree')
    const wrong = await integralCard(String.raw`\int 1.6\times10^{-19}\,dx`, String.raw`3.2\times10^{-19}x`, '3.2e-19*x')
    expect(reconcile(wrong, working).verdict).toBe('differ')
  })

  it('a small SI coefficient (6.674×10⁻¹¹, as in G): a card without the ½ is a disagreement', async () => {
    const working: Working = { title: 'Integrate', input: '6.674e-11 x', moves: [], answers: [{ label: 'Answer', tex: String.raw`3.337\times10^{-11}x^{2} + C` }], checked: 'ok' }
    const right = await integralCard(String.raw`\int 6.674\times10^{-11}x\,dx`, String.raw`\frac{6.674\times10^{-11}x^{2}}{2}`, '3.337e-11*x^2')
    expect(reconcile(right, working).verdict).toBe('agree')
    const wrong = await integralCard(String.raw`\int 6.674\times10^{-11}x\,dx`, String.raw`6.674\times10^{-11}x^{2}`, '6.674e-11*x^2')
    expect(reconcile(wrong, working).verdict).toBe('differ')
  })

  it('e^(−100x), which changes fast: the right antiderivative agrees and half of it is a disagreement', async () => {
    const working: Working = { title: 'Integrate', input: 'e^(-100x)', moves: [], answers: [{ label: 'Answer', tex: String.raw`-\frac{1}{100}e^{-100x} + C` }], checked: 'ok' }
    const right = await integralCard(String.raw`\int e^{-100x}\,dx`, String.raw`-\frac{e^{-100x}}{100}`, '-exp(-100*x)/100')
    expect(reconcile(right, working).verdict).toBe('agree')
    const half = await integralCard(String.raw`\int e^{-100x}\,dx`, String.raw`-\frac{e^{-100x}}{200}`, '-exp(-100*x)/200')
    expect(reconcile(half, working).verdict).toBe('differ')
  })

  it('a constant far bigger than the integrand is never ticked when the card is wrong', async () => {
    // The rounding of a value of 10⁶ is far bigger than the slope of 10⁻⁹ x, so nothing can be said about the slope: unchecked is right,
    // a checked "agree" for a wrong card is not.
    const working: Working = { title: 'Integrate', input: '10^-9 x', moves: [], answers: [{ label: 'Answer', tex: String.raw`\frac{10^{-9}x^{2}}{2} + 1000000 + C` }], checked: 'ok' }
    const wrong = await integralCard(String.raw`\int 10^{-9}x\,dx`, String.raw`10^{-9}x^{2}`, '10^-9*x^2')
    expect(reconcile(wrong, working).verdict).not.toBe('agree')
  })
})

describe('Greek letters and subscripts glued to the next letter are split, not left as one name', () => {
  it('ωt: the right antiderivative agrees and a wrong power is a disagreement', async () => {
    const working: Working = { title: 'Integrate', input: 'omega t', moves: [], answers: [{ label: 'Answer', tex: String.raw`\frac{\omega t^{2}}{2} + C` }], checked: 'ok' }
    const right = await integralCard(String.raw`\int \omega t\,dt`, String.raw`\frac{t^{2}\omega}{2}`, 't^2*omega/2')
    expect(reconcile(right, working).verdict).toBe('agree')
    const wrong = await integralCard(String.raw`\int \omega t\,dt`, String.raw`\omega t^{2}`, 'omega*t^2')
    expect(reconcile(wrong, working).verdict).toBe('differ')
  })

  it('v₀t: the right antiderivative agrees and a wrong power is a disagreement', async () => {
    const working: Working = { title: 'Integrate', input: 'v_0', moves: [], answers: [{ label: 'Answer', tex: String.raw`v_{0} t + C` }], checked: 'ok' }
    const right = await integralCard(String.raw`\int v_{0}\,dt`, String.raw`t v_{0}`, 't*v_0')
    expect(reconcile(right, working).verdict).toBe('agree')
    const wrong = await integralCard(String.raw`\int v_{0}\,dt`, String.raw`\frac{v_{0} t^{2}}{2}`, 'v_0*t^2/2')
    expect(reconcile(wrong, working).verdict).toBe('differ')
  })

  it('∫ cos(ωt) dt: sin(ωt) without the 1/ω is a disagreement, and the right answer agrees', async () => {
    const working: Working = { title: 'Integrate', input: 'cos(omega t)', moves: [], answers: [{ label: 'Answer', tex: String.raw`\frac{\sin(\omega t)}{\omega} + C` }], checked: 'ok' }
    const right = await integralCard(String.raw`\int \cos(\omega t)\,dt`, String.raw`\frac{1}{\omega}\sin(\omega t)`, 'sin(omega*t)/omega')
    expect(reconcile(right, working).verdict).toBe('agree')
    const wrong = await integralCard(String.raw`\int \cos(\omega t)\,dt`, String.raw`\sin(\omega t)`, 'sin(omega*t)')
    expect(reconcile(wrong, working).verdict).toBe('differ')
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

/** A working with one answer, as the Calculator's panel holds it. */
const oneAnswer = (tex: string): Working => ({ title: 'Integrate', input: '', moves: [], answers: [{ label: 'Answer', tex }], checked: 'ok' })

describe('a tiny integrand is judged by its own size, so a wrong sign or factor is a disagreement (C4 finding 1)', () => {
  // The check compared slopes with an absolute 10⁻⁷. At a coefficient of 10⁻⁹ every slope is below that, so every point "agreed" and a
  // wrong card was ticked. Each case below is a wrong card at a small scale, which must be called a disagreement.
  const wrongCards: { note: string; line: string; latex: string; text: string; workingTex: string }[] = [
    { note: 'a sign flipped at 10⁻⁹', line: String.raw`\int 10^{-9}x\,dx`, latex: String.raw`-\frac{x^{2}}{2000000000}`, text: '-x^2/2000000000', workingTex: String.raw`\frac{10^{-9}x^{2}}{2} + C` },
    { note: 'the integrand kept at 10⁻¹²', line: String.raw`\int 10^{-12}x\,dx`, latex: String.raw`10^{-12}x`, text: '1e-12*x', workingTex: String.raw`\frac{10^{-12}x^{2}}{2} + C` },
    { note: 'a sign flipped at the G scale', line: String.raw`\int 6.67\times10^{-11}x\,dx`, latex: String.raw`-\frac{6.67\times10^{-11}x^{2}}{2}`, text: '-6.67e-11*x^2/2', workingTex: String.raw`\frac{6.67\times10^{-11}x^{2}}{2} + C` },
    { note: 'cos for sin at 10⁻¹⁰', line: String.raw`\int 10^{-10}\sin x\,dx`, latex: String.raw`10^{-10}\cos x`, text: '1e-10*cos(x)', workingTex: String.raw`-10^{-10}\cos x + C` },
    { note: 'a doubled answer at 10⁻²⁰', line: String.raw`\int 10^{-20}x^{3}\,dx`, latex: String.raw`\frac{10^{-20}x^{4}}{2}`, text: '1e-20*x^4/2', workingTex: String.raw`\frac{10^{-20}x^{4}}{4} + C` },
    { note: 'x² for x at 8.85×10⁻¹²', line: String.raw`\int 8.85\times10^{-12}\,dx`, latex: String.raw`8.85\times10^{-12}x^{2}`, text: '8.85e-12*x^2', workingTex: String.raw`8.85\times10^{-12}x + C` },
    { note: 'x³ for x² at 1.05×10⁻³⁴', line: String.raw`\int 1.05\times10^{-34}x\,dx`, latex: String.raw`\frac{1.05\times10^{-34}x^{3}}{3}`, text: '1.05e-34*x^3/3', workingTex: String.raw`\frac{1.05\times10^{-34}x^{2}}{2} + C` },
    { note: '1/r² for 1/r at 6.67×10⁻¹¹', line: String.raw`\int \frac{6.67\times10^{-11}}{r^{2}}\,dr`, latex: String.raw`-\frac{6.67\times10^{-11}}{r^{2}}`, text: '-6.67e-11/r^2', workingTex: String.raw`-\frac{6.67\times10^{-11}}{r} + C` },
    { note: 'an offset of x/10⁸ on an integrand of 10⁻⁹', line: String.raw`\int 10^{-9}\,dx`, latex: String.raw`10^{-9}x + \frac{x}{10^{8}}`, text: '1e-9*x + x/1e8', workingTex: String.raw`10^{-9}x + C` },
  ]
  for (const c of wrongCards) {
    it(`${c.note}: the card is a disagreement`, async () => {
      const card = await integralCard(c.line, c.latex, c.text)
      expect(reconcile(card, oneAnswer(c.workingTex)).verdict).toBe('differ')
    })
  }

  it('the right answer at 10⁻⁹ agrees, so the check is not simply refusing small numbers', async () => {
    const card = await integralCard(String.raw`\int 10^{-9}x\,dx`, String.raw`\frac{x^{2}}{2000000000}`, 'x^2/2000000000')
    expect(reconcile(card, oneAnswer(String.raw`\frac{10^{-9}x^{2}}{2} + C`)).verdict).toBe('agree')
  })

  it('k_B T at SI scale, read from the command bar: a card without the ½ is a disagreement', async () => {
    const working = oneAnswer(String.raw`\frac{k_{B} T^{2}}{2} + C`)
    expect(reconcile(await integralCard('integrate(k_B*T, T)', String.raw`\frac{k_{B} T^{2}}{2}`, 'k_B*T^2/2'), working).verdict).toBe('agree')
    expect(reconcile(await integralCard('integrate(k_B*T, T)', String.raw`k_{B} T^{2}`, 'k_B*T^2'), working).verdict).toBe('differ')
    expect(reconcile(await integralCard('integrate(k_B*T, T)', String.raw`-\frac{k_{B} T^{2}}{2}`, '-k_B*T^2/2'), working).verdict).toBe('differ')
  })

  it('a sweep: every wrong card (negated, doubled, halved) at every coefficient scale is a disagreement, and every right card agrees', async () => {
    // The shape of the sweep that found the fault: five coefficient scales, five integrands, the right antiderivative and three wrong cards each.
    const scales = ['10^{-9}', '10^{-11}', '6.67\\times10^{-11}', '10^{-20}', '1']
    const forms = [
      { integrand: 'K x', right: String.raw`\frac{K x^{2}}{2}` },
      { integrand: String.raw`K \sin x`, right: String.raw`-K \cos x` },
      { integrand: String.raw`K e^{x}`, right: String.raw`K e^{x}` },
      { integrand: String.raw`K x^{2}`, right: String.raw`\frac{K x^{3}}{3}` },
      { integrand: String.raw`K \cos x`, right: String.raw`K \sin x` },
    ]
    for (const K of scales) {
      for (const form of forms) {
        const integrand = form.integrand.replace(/K/g, K)
        const right = form.right.replace(/K/g, K)
        const line = String.raw`\int ${integrand}\,dx`
        const working = oneAnswer(`${right} + C`)
        const agreed = reconcile(await integralCard(line, right, ''), working)
        expect(agreed.verdict, `${line} with the right answer ${right}`).toBe('agree')
        for (const wrong of [String.raw`-\left(${right}\right)`, String.raw`2\left(${right}\right)`, String.raw`\frac{${right}}{2}`]) {
          expect(reconcile(await integralCard(line, wrong, ''), working).verdict, `${line} with the wrong card ${wrong}`).toBe('differ')
        }
      }
    }
  })
})

describe('a Greek integration letter is read the way the answers read it (C4 finding 2)', () => {
  // The converter reads \theta as theta, keeps \alpha as the glyph α and turns \mu into u. The letter the line names must be read the same way,
  // or the variable is in neither answer and every answer agrees with every other.
  const LETTERS: [string, string, string][] = [
    ['\\theta', 'θ', 'theta'],
    ['\\alpha', 'α', 'alpha'],
    ['\\beta', 'β', 'beta'],
    ['\\gamma', 'γ', 'gamma'],
    ['\\delta', 'δ', 'delta'],
    ['\\lambda', 'λ', 'lambda'],
    ['\\mu', 'μ', 'mu'],
    ['\\omega', 'ω', 'omega'],
    ['\\phi', 'φ', 'phi'],
  ]
  for (const [tex, glyph, spelled] of LETTERS) {
    for (const name of [glyph, spelled]) {
      it(`the integral of ${name}² in ${name}: the right answer agrees and ${name}²/2 is a disagreement`, async () => {
        const working = oneAnswer(String.raw`\frac{${tex}^{3}}{3} + C`)
        expect(reconcile(await integralCard(`integrate(${name}^2, ${name})`, String.raw`\frac{${tex}^{3}}{3}`, ''), working).verdict).toBe('agree')
        expect(reconcile(await integralCard(`integrate(${name}^2, ${name})`, String.raw`\frac{${tex}^{2}}{2}`, ''), working).verdict).toBe('differ')
      })
    }
  }

  it('cos θ in θ, from the command bar: the wrong cards -sin θ, cos θ and θ are each a disagreement, and sin θ agrees', async () => {
    const working = oneAnswer(String.raw`\sin{\left(\theta \right)} + C`)
    const line = 'integrate(cos(θ), θ)'
    expect(reconcile(await integralCard(line, String.raw`\sin{\left(\theta \right)}`, 'sin(theta)'), working).verdict).toBe('agree')
    expect(reconcile(await integralCard(line, String.raw`-\sin{\left(\theta \right)}`, '-sin(theta)'), working).verdict).toBe('differ')
    expect(reconcile(await integralCard(line, String.raw`\cos{\left(\theta \right)}`, 'cos(theta)'), working).verdict).toBe('differ')
    expect(reconcile(await integralCard(line, String.raw`\theta`, 'theta'), working).verdict).toBe('differ')
  })

  it('a letter that neither answer contains is not compared: the check says so rather than agreeing', () => {
    expect(sameAntiderivative(math.parse('2*x'), math.parse('3*x'), 'theta')).toBe('unknown')
  })
})

describe('the engine’s plain LaTeX is read as the card it is: \\log is the natural log, \\operatorname the inverse functions (C4 findings 3 and 5)', () => {
  // SymPy's plain printer writes the natural log as \log{\left(...\right)} and an inverse function as \operatorname{atan}. Each line here has
  // its right answer, which must agree, and a negated or doubled card, which must be a disagreement. None of these shapes was tested before.
  const cases: { note: string; line: string; reply: string; text: string; working: string; right: boolean }[] = [
    { note: '1/x: ln|x|', line: String.raw`\int\frac{1}{x}\,dx`, reply: String.raw`\log{\left(x \right)}`, text: 'log(x)', working: String.raw`\ln\left|x\right| + C`, right: true },
    { note: '1/x: the negated card', line: String.raw`\int\frac{1}{x}\,dx`, reply: String.raw`-\log{\left(x \right)}`, text: '-log(x)', working: String.raw`\ln\left|x\right| + C`, right: false },
    { note: '1/x: the doubled card', line: String.raw`\int\frac{1}{x}\,dx`, reply: String.raw`2 \log{\left(x \right)}`, text: '2*log(x)', working: String.raw`\ln\left|x\right| + C`, right: false },
    { note: 'ln x', line: String.raw`\int\ln x\,dx`, reply: String.raw`x \log{\left(x \right)} - x`, text: 'x*log(x) - x', working: String.raw`x\ln x - x + C`, right: true },
    { note: 'ln x: without the − x', line: String.raw`\int\ln x\,dx`, reply: String.raw`x \log{\left(x \right)}`, text: 'x*log(x)', working: String.raw`x\ln x - x + C`, right: false },
    { note: 'tan x: −ln|cos x|', line: String.raw`\int\tan x\,dx`, reply: String.raw`- \log{\left(\cos{\left(x \right)} \right)}`, text: '-log(cos(x))', working: String.raw`-\ln\left|\cos x\right| + C`, right: true },
    { note: 'tan x: the sign flipped', line: String.raw`\int\tan x\,dx`, reply: String.raw`\log{\left(\cos{\left(x \right)} \right)}`, text: 'log(cos(x))', working: String.raw`-\ln\left|\cos x\right| + C`, right: false },
    { note: 'tan x: doubled', line: String.raw`\int\tan x\,dx`, reply: String.raw`-2\log{\left(\cos{\left(x \right)} \right)}`, text: '-2*log(cos(x))', working: String.raw`-\ln\left|\cos x\right| + C`, right: false },
    { note: '1/(1 + x²): atan x', line: String.raw`\int\frac{1}{1+x^{2}}\,dx`, reply: String.raw`\operatorname{atan}{\left(x \right)}`, text: 'atan(x)', working: String.raw`\tan^{-1}x + C`, right: true },
    { note: '1/(1 + x²): the negated card', line: String.raw`\int\frac{1}{1+x^{2}}\,dx`, reply: String.raw`- \operatorname{atan}{\left(x \right)}`, text: '-atan(x)', working: String.raw`\tan^{-1}x + C`, right: false },
    { note: '1/(1 + x²): the doubled card', line: String.raw`\int\frac{1}{1+x^{2}}\,dx`, reply: String.raw`2\operatorname{atan}{\left(x \right)}`, text: '2*atan(x)', working: String.raw`\tan^{-1}x + C`, right: false },
    { note: 'x eˣ: (x − 1)eˣ', line: String.raw`\int x e^{x}\,dx`, reply: String.raw`\left(x - 1\right) e^{x}`, text: '(x - 1)*exp(x)', working: String.raw`(x-1)e^{x} + C`, right: true },
    { note: 'x eˣ: the integrand itself', line: String.raw`\int x e^{x}\,dx`, reply: String.raw`x e^{x}`, text: 'x*exp(x)', working: String.raw`(x-1)e^{x} + C`, right: false },
    { note: '1/(3x + 2)', line: String.raw`\int\frac{1}{3x+2}\,dx`, reply: String.raw`\frac{\log{\left(3 x + 2 \right)}}{3}`, text: 'log(3*x + 2)/3', working: String.raw`\frac{\ln\left|3x+2\right|}{3} + C`, right: true },
    { note: '1/(3x + 2): doubled', line: String.raw`\int\frac{1}{3x+2}\,dx`, reply: String.raw`\frac{2\log{\left(3 x + 2 \right)}}{3}`, text: '2*log(3*x + 2)/3', working: String.raw`\frac{\ln\left|3x+2\right|}{3} + C`, right: false },
    { note: '1/(x² − 4): real on x > 2 only, so it needs six points there', line: String.raw`\int\frac{1}{x^{2}-4}\,dx`, reply: String.raw`\frac{\log{\left(x - 2 \right)}}{4} - \frac{\log{\left(x + 2 \right)}}{4}`, text: 'log(x-2)/4 - log(x+2)/4', working: String.raw`\frac{1}{4}\ln\left|\frac{x-2}{x+2}\right| + C`, right: true },
    { note: '1/(x² − 4): doubled', line: String.raw`\int\frac{1}{x^{2}-4}\,dx`, reply: String.raw`\frac{\log{\left(x - 2 \right)}}{2} - \frac{\log{\left(x + 2 \right)}}{2}`, text: 'log(x-2)/2 - log(x+2)/2', working: String.raw`\frac{1}{4}\ln\left|\frac{x-2}{x+2}\right| + C`, right: false },
    { note: '1/((x − 1)(x + 2))', line: String.raw`\int\frac{1}{(x-1)(x+2)}\,dx`, reply: String.raw`\frac{\log{\left(x - 1 \right)}}{3} - \frac{\log{\left(x + 2 \right)}}{3}`, text: 'log(x-1)/3 - log(x+2)/3', working: String.raw`\frac{1}{3}\ln\left|\frac{x-1}{x+2}\right| + C`, right: true },
    { note: '1/(1 − x²): the right answer', line: String.raw`\int\frac{1}{1-x^{2}}\,dx`, reply: String.raw`- \frac{\log{\left(x - 1 \right)}}{2} + \frac{\log{\left(x + 1 \right)}}{2}`, text: '-log(x-1)/2 + log(x+1)/2', working: String.raw`\frac{1}{2}\ln\left|\frac{x+1}{x-1}\right| + C`, right: true },
    { note: '1/(1 − x²): the negated card', line: String.raw`\int\frac{1}{1-x^{2}}\,dx`, reply: String.raw`\frac{\log{\left(x - 1 \right)}}{2} - \frac{\log{\left(x + 1 \right)}}{2}`, text: 'log(x-1)/2 - log(x+1)/2', working: String.raw`\frac{1}{2}\ln\left|\frac{x+1}{x-1}\right| + C`, right: false },
    { note: 'x ln x', line: String.raw`\int x\ln x\,dx`, reply: String.raw`\frac{x^{2} \log{\left(x \right)}}{2} - \frac{x^{2}}{4}`, text: 'x^2*log(x)/2 - x^2/4', working: String.raw`\frac{1}{4}x^{2}\left(2\ln x - 1\right) + C`, right: true },
    { note: 'x ln x: without the − x²/4', line: String.raw`\int x\ln x\,dx`, reply: String.raw`\frac{x^{2} \log{\left(x \right)}}{2}`, text: 'x^2*log(x)/2', working: String.raw`\frac{1}{4}x^{2}\left(2\ln x - 1\right) + C`, right: false },
    { note: '(ln x)²/x', line: String.raw`\int\frac{\ln x}{x}\,dx`, reply: String.raw`\frac{\log{\left(x \right)}^{2}}{2}`, text: 'log(x)^2/2', working: String.raw`\frac{(\ln x)^{2}}{2} + C`, right: true },
    { note: '(ln x)²/x: without the ½', line: String.raw`\int\frac{\ln x}{x}\,dx`, reply: String.raw`\log{\left(x \right)}^{2}`, text: 'log(x)^2', working: String.raw`\frac{(\ln x)^{2}}{2} + C`, right: false },
  ]
  for (const c of cases) {
    it(`${c.note}: ${c.right ? 'agrees' : 'is a disagreement'}`, async () => {
      const card = await integralCard(c.line, c.reply, c.text)
      expect(reconcile(card, oneAnswer(c.working)).verdict).toBe(c.right ? 'agree' : 'differ')
    })
  }
})
