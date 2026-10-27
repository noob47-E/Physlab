import { describe, it, expect, beforeEach } from 'vitest'
import { evaluateInput } from '../src/renderer/src/calc/evaluateInput'
import { reconcile } from '../src/renderer/src/calc/working'
import { usePure } from '../src/renderer/src/math/pure/store'
import { resetGlobals } from './helpers/globals'

import { scene } from '../src/renderer/src/core/store'

beforeEach(() => {
  resetGlobals()
  scene().setSettings({ angleUnit: 'deg' })
})

const OPTS_DEG = { vars: {}, ans: 0, angle: 'deg' as const }
const OPTS_RAD = { vars: {}, ans: 0, angle: 'rad' as const }

function run(line: string, angle: 'deg' | 'rad' = 'deg') {
  scene().setSettings({ angleUnit: angle })
  const opts = angle === 'rad' ? OPTS_RAD : OPTS_DEG
  const card = evaluateInput('COMP', line, opts)
  usePure.getState().runLatex(line, 'auto', { quiet: true })
  const working = usePure.getState().working ?? null
  const joined = card ? reconcile(card, working) : { verdict: 'unchecked' }
  return { card, working, joined }
}

describe('Probe the 4 Maths Engine Gaps', () => {
  describe('Limits', () => {
    it('(x^2-1)/(x-1) at x->1 = 2', () => {
      const res = run(String.raw`\lim_{x\to 1}\frac{x^2-1}{x-1}`)
      console.log('Limit (x^2-1)/(x-1):', { main: res.card?.main, workingChecked: res.working?.checked, verdict: res.joined.verdict })
      expect(res.card?.main).toBe('2')
      expect(res.working?.checked).toBe('ok')
    })

    it('sin x / x at x->0 = 1', () => {
      const res = run(String.raw`\lim_{x\to 0}\frac{\sin x}{x}`)
      console.log('Limit sin x / x:', { main: res.card?.main, workingChecked: res.working?.checked, verdict: res.joined.verdict })
      expect(res.card?.main).toBe('1')
      expect(res.working?.checked).toBe('ok')
    })

    it('(1 - cos x)/x^2 at x->0 = 1/2', () => {
      const res = run(String.raw`\lim_{x\to 0}\frac{1-\cos x}{x^2}`)
      console.log('Limit (1-cos x)/x^2:', { main: res.card?.main, workingChecked: res.working?.checked, verdict: res.joined.verdict })
      expect(res.card?.main).toBe('0.5')
      expect(res.working?.checked).toBe('ok')
    })

    it('(3x^2+1)/(x^2-2) at x->inf = 3', () => {
      const res = run(String.raw`\lim_{x\to \infty}\frac{3x^2+1}{x^2-2}`)
      console.log('Limit (3x^2+1)/(x^2-2):', { main: res.card?.main, workingChecked: res.working?.checked, verdict: res.joined.verdict })
      expect(res.card?.main).toBe('3')
      expect(res.working?.checked).toBe('ok')
    })

    it('1/x at x->0 does not exist', () => {
      const res = run(String.raw`\lim_{x\to 0}\frac{1}{x}`)
      console.log('Limit 1/x at 0:', { main: res.card?.main, workingChecked: res.working?.checked, verdict: res.joined.verdict })
      expect(res.card?.main).toMatch(/does not exist/)
      expect(res.working?.checked).toBe('ok')
    })
  })

  describe('General Trig', () => {
    it('3 sin x = 2 in deg gives 41.81 and 138.19 (both)', () => {
      const res = run(String.raw`3\sin(x) = 2`, 'deg')
      console.log('3\\sin(x) = 2 (deg):', { main: res.card?.main, answers: res.working?.answers?.map(a => a.tex), checked: res.working?.checked, verdict: res.joined.verdict })
      const resPlain = run('3*sin(x) = 2', 'deg')
      console.log('3*sin(x) = 2 (deg):', { main: resPlain.card?.main, answers: resPlain.working?.answers?.map(a => a.tex), checked: resPlain.working?.checked, verdict: resPlain.joined.verdict })
    })

    it('5 cos x = 2 in deg', () => {
      const res = run(String.raw`5\cos(x) = 2`, 'deg')
      console.log('5\\cos(x) = 2 (deg):', { main: res.card?.main, answers: res.working?.answers?.map(a => a.tex), checked: res.working?.checked, verdict: res.joined.verdict })
    })

    it('tan x = 3 in deg', () => {
      const res = run(String.raw`\tan(x) = 3`, 'deg')
      console.log('\\tan(x) = 3 (deg):', { main: res.card?.main, answers: res.working?.answers?.map(a => a.tex), checked: res.working?.checked, verdict: res.joined.verdict })
    })

    it('3 sin x = 2 in rad', () => {
      const res = run(String.raw`3\sin(x) = 2`, 'rad')
      console.log('3\\sin(x) = 2 (rad):', { main: res.card?.main, answers: res.working?.answers?.map(a => a.tex), checked: res.working?.checked, verdict: res.joined.verdict })
    })
  })

  describe('Logs', () => {
    it('e^x = 5 gives ln 5', () => {
      const res = run('e^x = 5')
      console.log('e^x = 5:', { main: res.card?.main, answers: res.working?.answers?.map(a => a.tex), checked: res.working?.checked, verdict: res.joined.verdict })
    })

    it('ln x = 2 gives e^2', () => {
      const res = run(String.raw`\ln(x) = 2`)
      console.log('\\ln(x) = 2:', { main: res.card?.main, answers: res.working?.answers?.map(a => a.tex), checked: res.working?.checked, verdict: res.joined.verdict })
      const resPlain = run('ln(x) = 2')
      console.log('ln(x) = 2:', { main: resPlain.card?.main, answers: resPlain.working?.answers?.map(a => a.tex), checked: resPlain.working?.checked, verdict: resPlain.joined.verdict })
    })

    it('log_2 x = 5 gives 32', () => {
      const res = run(String.raw`\log_{2}(x) = 5`)
      console.log('log_2 x = 5:', { main: res.card?.main, answers: res.working?.answers?.map(a => a.tex), checked: res.working?.checked, verdict: res.joined.verdict })
      expect(res.card?.main).toBe('x = 32')
      expect(res.working?.checked).toBe('ok')
    })

    it('log x + log(x-3) = 1 gives 5 (-2 rejected, log domain)', () => {
      const res = run(String.raw`\log(x) + \log(x-3) = 1`)
      console.log('log x + log(x-3) = 1:', { main: res.card?.main, answers: res.working?.answers?.map(a => a.tex), checked: res.working?.checked, verdict: res.joined.verdict })
      expect(res.card?.main).toBe('x = 5')
      expect(res.working?.checked).toBe('ok')
      expect(res.working?.answers[0]?.tex).toBe('5')
    })
  })

  describe('Substitution', () => {
    it('4^x - 3 * 2^x + 2 = 0 gives 0 and 1', () => {
      const res = run('4^x - 3 * 2^x + 2 = 0')
      console.log('4^x - 3*2^x + 2 = 0:', { main: res.card?.main, answers: res.working?.answers?.map(a => a.tex), checked: res.working?.checked, verdict: res.joined.verdict })
    })

    it('e^(2x) - 5 e^x + 6 = 0 gives ln 2, ln 3', () => {
      const res = run('e^{2x} - 5e^{x} + 6 = 0')
      console.log('e^{2x} - 5e^{x} + 6 = 0:', { main: res.card?.main, answers: res.working?.answers?.map(a => a.tex), checked: res.working?.checked, verdict: res.joined.verdict })
    })

    it('2 sqrt(x) = x - 3 gives 9 (1 rejected)', () => {
      const res = run('2 sqrt(x) = x - 3')
      console.log('2 sqrt(x) = x - 3:', { main: res.card?.main, answers: res.working?.answers?.map(a => a.tex), checked: res.working?.checked, verdict: res.joined.verdict })
    })
  })
})
