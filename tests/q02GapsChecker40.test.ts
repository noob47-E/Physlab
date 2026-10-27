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

describe('Q02 Quality Gate: 40+ Inputs Checker for 4 Maths Engine Gaps', () => {
  // ==========================================
  // GAP 1: LIMITS (12 cases)
  // ==========================================
  describe('Gap 1: Limits (12 cases)', () => {
    it('1. (x^2-1)/(x-1) at x->1 = 2', () => {
      const res = run(String.raw`\lim_{x\to 1}\frac{x^2-1}{x-1}`)
      expect(res.card?.main).toBe('2')
      expect(res.working?.checked).toBe('ok')
    })

    it('2. (x^2-4)/(x-2) at x->2 = 4', () => {
      const res = run(String.raw`\lim_{x\to 2}\frac{x^2-4}{x-2}`)
      expect(res.card?.main).toBe('4')
      expect(res.working?.checked).toBe('ok')
    })

    it('3. (x^2-9)/(x-3) at x->3 = 6', () => {
      const res = run(String.raw`\lim_{x\to 3}\frac{x^2-9}{x-3}`)
      expect(res.card?.main).toBe('6')
      expect(res.working?.checked).toBe('ok')
    })

    it('4. sin(x)/x at x->0 = 1', () => {
      const res = run(String.raw`\lim_{x\to 0}\frac{\sin x}{x}`)
      expect(res.card?.main).toBe('1')
      expect(res.working?.checked).toBe('ok')
    })

    it('5. (1-cos(x))/x^2 at x->0 = 0.5', () => {
      const res = run(String.raw`\lim_{x\to 0}\frac{1-\cos x}{x^2}`)
      expect(res.card?.main).toBe('0.5')
      expect(res.working?.checked).toBe('ok')
    })

    it('6. (3x^2+1)/(x^2-2) at x->inf = 3', () => {
      const res = run(String.raw`\lim_{x\to \infty}\frac{3x^2+1}{x^2-2}`)
      expect(res.card?.main).toBe('3')
      expect(res.working?.checked).toBe('ok')
    })

    it('7. (5x^3-2x+1)/(2x^3+4) at x->inf = 2.5', () => {
      const res = run(String.raw`\lim_{x\to \infty}\frac{5x^3-2x+1}{2x^3+4}`)
      expect(res.card?.main).toBe('2.5')
      expect(res.working?.checked).toBe('ok')
    })

    it('8. 1/x at x->0 does not exist', () => {
      const res = run(String.raw`\lim_{x\to 0}\frac{1}{x}`)
      expect(res.card?.main).toMatch(/does not exist/)
      expect(res.working?.checked).toBe('ok')
    })

    it('9. (sqrt(x)-2)/(x-4) at x->4 = 0.25', () => {
      const res = run(String.raw`\lim_{x\to 4}\frac{\sqrt{x}-2}{x-4}`)
      expect(res.card?.main).toBe('0.25')
      expect(res.working?.checked).toBe('ok')
    })

    it('10. x/sin(x) at x->0 = 1', () => {
      const res = run(String.raw`\lim_{x\to 0}\frac{x}{\sin x}`)
      expect(res.card?.main).toBe('1')
      expect(res.working?.checked).toBe('ok')
    })

    it('11. (e^x-1)/x at x->0 = 1', () => {
      const res = run(String.raw`\lim_{x\to 0}\frac{e^x-1}{x}`)
      expect(res.card?.main).toBe('1')
      expect(res.working?.checked).toBe('ok')
    })

    it('12. 3x+2 at x->1 = 5', () => {
      const res = run(String.raw`\lim_{x\to 1}(3x+2)`)
      expect(res.card?.main).toBe('5')
      expect(res.working?.checked).toBe('ok')
    })
  })

  // ==========================================
  // GAP 2: GENERAL TRIG (10 cases)
  // ==========================================
  describe('Gap 2: General Trig (10 cases)', () => {
    it('13. 3 sin x = 2 in deg gives 41.81 and 138.19', () => {
      const res = run(String.raw`3\sin(x) = 2`, 'deg')
      const answers = res.working?.answers.map((a) => a.tex)
      expect(answers).toContain('41.81')
      expect(answers).toContain('138.19')
      expect(res.working?.checked).toBe('ok')
    })

    it('14. 5 cos x = 2 in deg gives 66.42 and 293.58', () => {
      const res = run(String.raw`5\cos(x) = 2`, 'deg')
      const answers = res.working?.answers.map((a) => a.tex)
      expect(answers).toContain('66.42')
      expect(answers).toContain('293.58')
      expect(res.working?.checked).toBe('ok')
    })

    it('15. tan x = 3 in deg gives 71.57 and 251.57', () => {
      const res = run(String.raw`\tan(x) = 3`, 'deg')
      const answers = res.working?.answers.map((a) => a.tex)
      expect(answers).toContain('71.57')
      expect(answers).toContain('251.57')
      expect(res.working?.checked).toBe('ok')
    })

    it('16. 2 sin x = 1 in deg gives 30 and 150', () => {
      const res = run(String.raw`2\sin(x) = 1`, 'deg')
      const answers = res.working?.answers.map((a) => a.tex)
      expect(answers).toContain('30')
      expect(answers).toContain('150')
      expect(res.working?.checked).toBe('ok')
    })

    it('17. 2 cos x = 1 in deg gives 60 and 300', () => {
      const res = run(String.raw`2\cos(x) = 1`, 'deg')
      const answers = res.working?.answers.map((a) => a.tex)
      expect(answers).toContain('60')
      expect(answers).toContain('300')
      expect(res.working?.checked).toBe('ok')
    })

    it('18. tan x = 1 in deg gives 45 and 225', () => {
      const res = run(String.raw`\tan(x) = 1`, 'deg')
      const answers = res.working?.answers.map((a) => a.tex)
      expect(answers).toContain('45')
      expect(answers).toContain('225')
      expect(res.working?.checked).toBe('ok')
    })

    it('19. sin x = 0 in deg gives 0 and 180', () => {
      const res = run(String.raw`\sin(x) = 0`, 'deg')
      const answers = res.working?.answers.map((a) => a.tex)
      expect(answers).toContain('0')
      expect(answers).toContain('180')
      expect(res.working?.checked).toBe('ok')
    })

    it('20. cos x = 0 in deg gives 90 and 270', () => {
      const res = run(String.raw`\cos(x) = 0`, 'deg')
      const answers = res.working?.answers.map((a) => a.tex)
      expect(answers).toContain('90')
      expect(answers).toContain('270')
      expect(res.working?.checked).toBe('ok')
    })

    it('21. 3 sin x = 2 in rad gives 0.7297 and 2.4119', () => {
      const res = run(String.raw`3\sin(x) = 2`, 'rad')
      const answers = res.working?.answers.map((a) => a.tex)
      expect(answers).toContain('0.7297')
      expect(answers).toContain('2.4119')
      expect(res.working?.checked).toBe('ok')
    })

    it('22. 2 cos x = 1 in rad gives pi/3 and 5pi/3', () => {
      const res = run(String.raw`2\cos(x) = 1`, 'rad')
      const answers = res.working?.answers.map((a) => a.tex)
      expect(answers).toContain(String.raw`\frac{\pi}{3}`)
      expect(answers).toContain(String.raw`\frac{5\pi}{3}`)
      expect(res.working?.checked).toBe('ok')
    })
  })

  // ==========================================
  // GAP 3: LOGS & EXPONENTIALS (12 cases)
  // ==========================================
  describe('Gap 3: Logs & Exponentials (12 cases)', () => {
    it('23. e^x = 5 gives ln 5', () => {
      const res = run('e^x = 5')
      expect(res.working?.answers.map((a) => a.tex)).toEqual(['\\ln(5)'])
      expect(res.working?.checked).toBe('ok')
    })

    it('24. ln x = 2 gives e^2', () => {
      const res = run(String.raw`\ln(x) = 2`)
      expect(res.working?.answers.map((a) => a.tex)).toEqual(['e^{2}'])
      expect(res.working?.checked).toBe('ok')
    })

    it('25. log_2 x = 5 gives 32', () => {
      const res = run(String.raw`\log_{2}(x) = 5`)
      expect(res.card?.main).toBe('x = 32')
      expect(res.working?.checked).toBe('ok')
    })

    it('26. log(x) = 2 gives 100', () => {
      const res = run(String.raw`\log(x) = 2`)
      expect(res.working?.answers.map((a) => a.tex)).toEqual(['100'])
      expect(res.working?.checked).toBe('ok')
    })

    it('27. log(x) + log(x - 3) = 1 gives 5 (-2 rejected)', () => {
      const res = run(String.raw`\log(x) + \log(x - 3) = 1`)
      expect(res.card?.main).toBe('x = 5')
      expect(res.working?.answers.map((a) => a.tex)).toEqual(['5'])
      expect(res.working?.checked).toBe('ok')
    })

    it('28. 2^x = 8 gives 3', () => {
      const res = run(String.raw`2^{x} = 8`)
      expect(res.working?.answers.map((a) => a.tex)).toEqual(['3'])
      expect(res.working?.checked).toBe('ok')
    })

    it('29. 3^(2x - 1) = 27 gives 2', () => {
      const res = run(String.raw`3^{2x - 1} = 27`)
      expect(res.working?.answers.map((a) => a.tex)).toEqual(['2'])
      expect(res.working?.checked).toBe('ok')
    })

    it('30. 2^x = 16 gives 4', () => {
      const res = run(String.raw`2^{x} = 16`)
      expect(res.working?.answers.map((a) => a.tex)).toEqual(['4'])
      expect(res.working?.checked).toBe('ok')
    })

    it('31. 5^x = 25 gives 2', () => {
      const res = run(String.raw`5^{x} = 25`)
      expect(res.working?.answers.map((a) => a.tex)).toEqual(['2'])
      expect(res.working?.checked).toBe('ok')
    })

    it('32. log_3(2x - 1) = 2 gives 5', () => {
      const res = run(String.raw`\log_{3}(2x - 1) = 2`)
      expect(res.working?.answers.map((a) => a.tex)).toEqual(['5'])
      expect(res.working?.checked).toBe('ok')
    })

    it('33. log_2(x) = 3 gives 8', () => {
      const res = run(String.raw`\log_{2}(x) = 3`)
      expect(res.working?.answers.map((a) => a.tex)).toEqual(['8'])
      expect(res.working?.checked).toBe('ok')
    })

    it('34. 5^x = 12 gives exact log', () => {
      const res = run(String.raw`5^{x} = 12`)
      expect(res.working?.checked).toBe('ok')
    })
  })

  // ==========================================
  // GAP 4: SUBSTITUTION (10 cases)
  // ==========================================
  describe('Gap 4: Substitution (10 cases)', () => {
    it('35. 4^x - 3*2^x + 2 = 0 gives 0 and 1', () => {
      const res = run('4^x - 3 * 2^x + 2 = 0')
      const answers = res.working?.answers.map((a) => a.tex)
      expect(answers).toContain('0')
      expect(answers).toContain('1')
      expect(res.working?.checked).toBe('ok')
    })

    it('36. e^(2x) - 5e^x + 6 = 0 gives ln 2 and ln 3', () => {
      const res = run(String.raw`e^{2x} - 5e^{x} + 6 = 0`)
      const answers = res.working?.answers.map((a) => a.tex)
      expect(answers).toContain('\\ln{2}')
      expect(answers).toContain('\\ln{3}')
      expect(res.working?.checked).toBe('ok')
    })

    it('37. 2 sqrt(x) = x - 3 gives 9 (1 rejected)', () => {
      const res = run('2 sqrt(x) = x - 3')
      expect(res.working?.answers.map((a) => a.tex)).toEqual(['9'])
      expect(res.working?.checked).toBe('ok')
    })

    it('38. 9^x - 4*3^x + 3 = 0 gives 0 and 1', () => {
      const res = run('9^x - 4 * 3^x + 3 = 0')
      const answers = res.working?.answers.map((a) => a.tex)
      expect(answers).toContain('0')
      expect(answers).toContain('1')
      expect(res.working?.checked).toBe('ok')
    })

    it('39. 4^x - 6*2^x + 8 = 0 gives 1 and 2', () => {
      const res = run('4^x - 6 * 2^x + 8 = 0')
      const answers = res.working?.answers.map((a) => a.tex)
      expect(answers).toContain('1')
      expect(answers).toContain('2')
      expect(res.working?.checked).toBe('ok')
    })

    it('40. e^(2x) - 3e^x + 2 = 0 gives 0 and ln 2', () => {
      const res = run(String.raw`e^{2x} - 3e^{x} + 2 = 0`)
      const answers = res.working?.answers.map((a) => a.tex)
      expect(answers).toContain('0')
      expect(answers).toContain('\\ln{2}')
      expect(res.working?.checked).toBe('ok')
    })

    it('41. e^(2x) - 4e^x + 3 = 0 gives 0 and ln 3', () => {
      const res = run(String.raw`e^{2x} - 4e^{x} + 3 = 0`)
      const answers = res.working?.answers.map((a) => a.tex)
      expect(answers).toContain('0')
      expect(answers).toContain('\\ln{3}')
      expect(res.working?.checked).toBe('ok')
    })

    it('42. 4^x - 5*2^x + 4 = 0 gives 0 and 2', () => {
      const res = run('4^x - 5 * 2^x + 4 = 0')
      const answers = res.working?.answers.map((a) => a.tex)
      expect(answers).toContain('0')
      expect(answers).toContain('2')
      expect(res.working?.checked).toBe('ok')
    })

    it('43. 2^x = 2^(-1) gives -1', () => {
      const res = run(String.raw`2^{x} = 2^{-1}`)
      expect(res.working?.answers.map((a) => a.tex)).toEqual(['-1'])
      expect(res.working?.checked).toBe('ok')
    })

    it('44. 9^x - 10*3^x + 9 = 0 gives 0 and 2', () => {
      const res = run('9^x - 10 * 3^x + 9 = 0')
      const answers = res.working?.answers.map((a) => a.tex)
      expect(answers).toContain('0')
      expect(answers).toContain('2')
      expect(res.working?.checked).toBe('ok')
    })
  })
})
