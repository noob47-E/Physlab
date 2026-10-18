// Tests for part XE:
// 1. '=' path reads runs of single letters as multiplication (xe = x·e, 2xy = 2·x·y, xe^x = x·e^x, x sin x = x·sin(x))
//    without splitting functions, constants, or student variables.
// 2. Card and working reconciliation: if '=' cannot answer but working answered the same job, card shows working's checked answer.

import { beforeEach, describe, expect, it } from 'vitest'
import { evaluateInput } from '../src/renderer/src/calc/evaluateInput'
import { reconcile } from '../src/renderer/src/calc/working'
import { resetGlobals } from './helpers/globals'
import type { Working } from '../src/renderer/src/math/pure/work'

beforeEach(resetGlobals)

describe('part XE: reading run of single letters as multiplication', () => {
  it('xe and 2xy multiply', () => {
    // xe with x having a value multiplies x * e
    const rXe = evaluateInput('COMP', 'xe', { vars: { x: 3 }, ans: 0, angle: 'deg' })!
    expect(rXe.error).toBeUndefined()
    expect(Number(rXe.main)).toBeCloseTo(3 * Math.E, 5)

    // 2xy with x and y having values multiplies 2 * x * y
    const r2xy = evaluateInput('COMP', '2xy', { vars: { x: 3, y: 4 }, ans: 0, angle: 'deg' })!
    expect(r2xy.error).toBeUndefined()
    expect(r2xy.main).toBe('24')

    // xe^x with x having a value multiplies x * e^x
    const rXeX = evaluateInput('COMP', 'xe^{x}', { vars: { x: 2 }, ans: 0, angle: 'deg' })!
    expect(rXeX.error).toBeUndefined()
    expect(Number(rXeX.main)).toBeCloseTo(2 * Math.exp(2), 5)
  })

  it('preserves formulas when variables have no value yet', () => {
    // xe with x unassigned stays a formula in x and e
    const rXeOpen = evaluateInput('COMP', 'xe', { vars: {}, ans: 0, angle: 'deg' })!
    expect(rXeOpen.error).toBeUndefined()
    expect(rXeOpen.formula).toBeDefined()

    // 2xy with x and y unassigned stays a formula in x and y
    const r2xyOpen = evaluateInput('COMP', '2xy', { vars: {}, ans: 0, angle: 'deg' })!
    expect(r2xyOpen.error).toBeUndefined()
    expect(r2xyOpen.formula).toBeDefined()
  })

  it('leaves sin x, exp(x), pi x untouched', () => {
    // sin x is untouched (sin not split into s*i*n)
    const rSin = evaluateInput('COMP', '\\sin 30', { vars: {}, ans: 0, angle: 'deg' })!
    expect(rSin.error).toBeUndefined()
    expect(rSin.main).toBe('0.5')

    // exp(0) is untouched (exp not split into e*x*p)
    const rExp = evaluateInput('COMP', '\\exp\\left(0\\right)', { vars: {}, ans: 0, angle: 'deg' })!
    expect(rExp.error).toBeUndefined()
    expect(rExp.main).toBe('1')

    // pi x multiplies pi * x without splitting pi into p*i
    const rPi = evaluateInput('COMP', '\\pi x', { vars: { x: 2 }, ans: 0, angle: 'deg' })!
    expect(rPi.error).toBeUndefined()
    expect(Number(rPi.main)).toBeCloseTo(2 * Math.PI, 5)

    // theta is untouched
    const rTheta = evaluateInput('COMP', '\\theta', { vars: { theta: 45 }, ans: 0, angle: 'deg' })!
    expect(rTheta.error).toBeUndefined()
    expect(rTheta.main).toBe('45')

    // student variables with longer names are never split
    const rCustomVar = evaluateInput('COMP', 'mass+1', { vars: { mass: 10 }, ans: 0, angle: 'deg' })!
    expect(rCustomVar.error).toBeUndefined()
    expect(rCustomVar.main).toBe('11')
  })

  it('x sin x multiplies x * sin(x)', () => {
    const rXSinX = evaluateInput('COMP', 'x \\sin x', { vars: { x: 30 }, ans: 0, angle: 'deg' })!
    expect(rXSinX.error).toBeUndefined()
    expect(rXSinX.main).toBe('15')
  })
})

describe('part XE: card and working reconciliation', () => {
  it('xe^x (treated as Integrate) gives (x - 1)e^x + C on the card', () => {
    // When '=' cannot answer or returned an error, but working answered Integrate
    const refused = {
      main: '',
      src: 'xe^(x)',
      error: { sentence: "I don't know what xe is. Use one of the letters A to F, M, x or y for a value, or check the spelling." }
    }
    const integrateWorking: Working = {
      title: 'Integrate',
      input: 'xe^{x}',
      moves: [],
      answers: [{ label: 'Answer', tex: '\\left(x - 1\\right) e^{x} + C' }],
      checked: 'ok'
    }

    const reconciled = reconcile(refused, integrateWorking)
    expect(reconciled.result.error).toBeUndefined()
    expect(reconciled.result.tex).toBe('\\left(x - 1\\right) e^{x} + C')
    expect(reconciled.result.main).toBe('(x - 1) e^x + C')
  })

  it('keeps intentional refusal when line tries to store a variable', () => {
    const stores = {
      main: '',
      src: 'A = 5',
      error: { sentence: 'Typing A = … does not store a value. Under Variables, type the value beside A.' }
    }
    const workingWithAnswer: Working = {
      title: 'Solve',
      input: 'A = 5',
      moves: [],
      answers: [{ label: 'A =', tex: '5' }],
      checked: 'ok'
    }
    const reconciled = reconcile(stores, workingWithAnswer)
    expect(reconciled.result.error).toBeDefined()
    expect(reconciled.result.error!.sentence).toMatch(/does not store a value/)
  })
})
