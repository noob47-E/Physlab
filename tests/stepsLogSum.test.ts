import { describe, it, expect, beforeEach } from 'vitest'
import { usePure } from '../src/renderer/src/math/pure/store'
import { resetGlobals } from './helpers/globals'
import { logSumMethodSolver, logSumMethod } from '../src/renderer/src/math/steps/methods/logSum'
import { createDefaultStepRouter, stepWorkingFor } from '../src/renderer/src/math/steps/solve'
import { renderWorkingToDoc } from '../src/renderer/src/math/steps/render'
import { defaultCheckAdapter } from '../src/renderer/src/math/steps/check-adapter'
import { validateWorking } from '../src/renderer/src/math/steps/validate'

beforeEach(() => {
  resetGlobals()
  usePure.setState({ working: null, input: '', inputLatex: '', history: [] })
})

describe('Log Sum Method step by step', () => {
  it('applies to log(x) + log(x - 3) = 1', async () => {
    const p = { job: 'solve' as const, input: 'log(x) + log(x - 3) = 1', variable: 'x' }
    expect(logSumMethod.appliesTo(p)).toBe(true)
    const router = createDefaultStepRouter()
    const w = logSumMethodSolver(p, router)
    expect(w.noWorking).toBeFalsy()
    expect(w.checked).toBe('ok')

    const vRes = validateWorking(w, defaultCheckAdapter, 'real')
    console.log('validateWorking result:', vRes)
    if (vRes.failedStep) {
      console.log('failedStep data:', vRes.failedStep.data)
      const { sentenceFor } = await import('../src/renderer/src/math/steps/sentences')
      console.log('sentenceFor failedStep:', sentenceFor(vRes.failedStep))
    }

    const doc = renderWorkingToDoc(w, p, defaultCheckAdapter)
    console.log('renderWorkingToDoc result:', { docNoWorking: doc?.noWorking, moves: doc?.moves?.length, answers: doc?.answers })

    const rDefault = createDefaultStepRouter()
    const wDefault = rDefault.solve(p)
    console.log('wDefault:', { noWorking: wDefault?.noWorking, method: wDefault?.method, steps: wDefault?.steps?.length })

    const stepped = stepWorkingFor(p)
    console.log('stepWorkingFor result:', { steppedNoWorking: stepped?.noWorking, moves: stepped?.moves?.length, answers: stepped?.answers })
  })

  it('runs through runLatex with \\log(x) + \\log(x - 3) = 1', () => {
    usePure.getState().runLatex(String.raw`\log(x) + \log(x - 3) = 1`, 'auto', { quiet: true })
    const w = usePure.getState().working
    console.log('runLatex log sum working:', {
      noWorking: w?.noWorking,
      checked: w?.checked,
      answers: w?.answers,
      method: w?.method
    })
    expect(w?.checked).toBe('ok')
  })
})
