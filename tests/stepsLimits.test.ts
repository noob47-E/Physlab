// The Calculator's limits, checked (phase 09-C-LIMITS): the cases the builder must get right, through the real path. The
// "=" card comes from evaluateInput, the working from the pure store (runLatex), and reconcile joins them, as the Maths
// screen does. A value is ticked only when an exact rule gives it and the function's own values agree; a value read only
// from the values near the point is an estimate and is never ticked; a limit that does not exist is said so, never a number.

import { beforeEach, describe, expect, it } from 'vitest'
import { evaluateInput } from '../src/renderer/src/calc/evaluateInput'
import { reconcile } from '../src/renderer/src/calc/working'
import { usePure } from '../src/renderer/src/math/pure/store'
import { resetGlobals } from './helpers/globals'

beforeEach(() => resetGlobals())

const OPTS = { vars: {}, ans: 0, angle: 'deg' as const }

/** The card, the working and the joined result for a typed line, exactly as the Maths screen computes them after "=". */
function run(line: string) {
  const card = evaluateInput('COMP', line, OPTS)!
  usePure.getState().runLatex(line, 'auto', { quiet: true })
  const working = usePure.getState().working ?? null
  return { card, working, joined: reconcile(card, working) }
}

describe('the required limits give the right value, checked by a rule', () => {
  const CASES: [string, string, string][] = [
    [String.raw`\lim_{x\to 1}\frac{x^2-1}{x-1}`, '2', 'Cancelling a common factor'],
    [String.raw`\lim_{x\to 2}\frac{x^2-4}{x-2}`, '4', 'Cancelling a common factor'],
    [String.raw`\lim_{x\to 0}\frac{\sin x}{x}`, '1', 'Standard limit'],
    [String.raw`\lim_{x\to 0}\frac{1-\cos x}{x^2}`, '0.5', "L'Hôpital's rule"],
    [String.raw`\lim_{x\to \infty}\frac{3x^2+1}{x^2-2}`, '3', 'Dividing by the highest power'],
    [String.raw`\lim_{x\to \infty}\frac{2x+1}{x^2+1}`, '0', 'Dividing by the highest power'],
    [String.raw`\lim_{x\to 2}(x^2+3x)`, '10', 'Putting the point in']
  ]
  for (const [line, value, method] of CASES) {
    it(`${line} is ${value}, checked (${method})`, () => {
      const { card, working, joined } = run(line)
      expect(card?.error).toBeUndefined()
      expect(card?.main).toBe(value)
      expect(working?.checked).toBe('ok')
      expect(working?.method).toBe(method)
      expect(joined.verdict).toBe('agree')
    })
  }

  it('names the standard limit for sin x over x, and says it is radians', () => {
    const { card, working } = run(String.raw`\lim_{x\to 0}\frac{\sin x}{x}`)
    expect(working?.moves.map((m) => m.head).join(' ')).toMatch(/standard limit/i)
    expect(card?.extra?.join(' ') ?? '').toMatch(/radians/)
  })

  it('reads the arrow form lim(x->1, f) and the linear form lim(f, x, 1), checked', () => {
    expect(run('lim(x->1, (x^2-1)/(x-1))').card?.main).toBe('2')
    expect(run('lim(x->1, (x^2-1)/(x-1))').working?.checked).toBe('ok')
    expect(run('lim((x^2-1)/(x-1), x, 1)').card?.main).toBe('2')
    expect(run('lim((x^2-1)/(x-1), x, 1)').working?.checked).toBe('ok')
  })
})

describe('a limit that does not exist is said so, and is never a number', () => {
  it('1/x at 0: left goes to −∞, right to +∞', () => {
    const { card, working } = run(String.raw`\lim_{x\to 0}\frac{1}{x}`)
    expect(card?.value).toBeUndefined()
    expect(card?.main).toMatch(/does not exist/)
    expect(card?.main).toMatch(/from the left the values grow without bound towards −∞/)
    expect(card?.main).toMatch(/from the right towards \+∞/)
    expect(working?.checked).toBe('ok')
    expect(working?.answers[0]?.tex).toBe('\\text{does not exist}')
  })

  it('|x|/x at 0: settles on −1 from the left and 1 from the right', () => {
    const { card, working } = run(String.raw`\lim_{x\to 0}\frac{|x|}{x}`)
    expect(card?.value).toBeUndefined()
    expect(card?.main).toMatch(/from the left the values settle on −1, and from the right they settle on 1/)
    expect(working?.checked).toBe('ok')
  })

  it('the one-sided limits of 1/x are +∞ from the right and −∞ from the left', () => {
    expect(run(String.raw`\lim_{x\to 0^{+}}\frac{1}{x}`).card?.main).toBe('∞')
    expect(run(String.raw`\lim_{x\to 0^{-}}\frac{1}{x}`).card?.main).toBe('−∞')
    expect(run(String.raw`\lim_{x\to 0^{+}}\frac{1}{x}`).working?.checked).toBe('ok')
  })

  it('the one-sided limits of |x|/x are 1 from the right and −1 from the left', () => {
    expect(run(String.raw`\lim_{x\to 0^{+}}\frac{|x|}{x}`).card?.main).toBe('1')
    expect(run(String.raw`\lim_{x\to 0^{-}}\frac{|x|}{x}`).card?.main).toBe('−1')
    expect(run(String.raw`\lim_{x\to 0^{-}}\frac{|x|}{x}`).working?.checked).toBe('ok')
  })

  it('(x²+1)/(x−1) at 1 and (x²−1)/(x−1)² at 1 both have no limit, by their signs on each side', () => {
    expect(run(String.raw`\lim_{x\to 1}\frac{x^2+1}{x-1}`).card?.main).toMatch(/does not exist/)
    expect(run(String.raw`\lim_{x\to 1}\frac{x^2+1}{x-1}`).working?.checked).toBe('ok')
    expect(run(String.raw`\lim_{x\to 1}\frac{x^2-1}{(x-1)^2}`).card?.main).toMatch(/does not exist/)
    expect(run(String.raw`\lim_{x\to 1}\frac{x^2-1}{(x-1)^2}`).working?.checked).toBe('ok')
  })

  it('a claim against a limit that does not exist is false', () => {
    expect(run(String.raw`\lim_{x\to 0}\frac{1}{x}=0`).card?.extra?.join(' ') ?? '').toMatch(/so the statement is false/)
  })
})

describe('the "= value" after a limit is said to be true or false under the answer', () => {
  it('true when the claim is the limit', () => {
    expect(run(String.raw`\lim_{x\to 1}\frac{x^3-1}{x-1}=3`).card?.extra?.join(' ') ?? '').toMatch(/so the statement is true/)
  })

  it('false when the claim is another number', () => {
    expect(run(String.raw`\lim_{x\to 1}\frac{x^3-1}{x-1}=4`).card?.extra?.join(' ') ?? '').toMatch(/so the statement is false/)
  })
})

describe('an answer no exact rule gives is never ticked', () => {
  it('sin x over x squared at 0: says it does not exist, and the working is not ticked', () => {
    const { card, working } = run(String.raw`\lim_{x\to 0}\frac{\sin x}{x^{2}}`)
    expect(card?.main ?? '').toMatch(/does not exist/)
    expect(working?.checked).not.toBe('ok')
  })

  it('sin(1/x) at 0 has no value that can be checked: no card value, no tick', () => {
    const { card, working } = run(String.raw`\lim_{x\to 0}\sin\frac{1}{x}`)
    expect(card?.value).toBeUndefined()
    expect(card?.error).toBeDefined()
    expect(working?.checked).not.toBe('ok')
  })

  it('exp(−1/x²) at 0 is an estimate: shown as approximate, not ticked', () => {
    const { card, working } = run('lim(exp(-1/x^2), x, 0)')
    expect(card?.main).toBe('0')
    expect(card?.approximate).toBe(true)
    expect(working?.checked).not.toBe('ok')
  })

  it('floor(x) at 1: the sides differ, but that is not proved by a rule, so it is not ticked', () => {
    const { card, working } = run('lim(floor(x), x, 1)')
    expect(card?.main).toMatch(/does not exist/)
    expect(card?.unconfirmed ?? card?.approximate ?? false).toBe(true)
    expect(working?.checked).not.toBe('ok')
  })
})

describe('exact rules that go beyond the first cases', () => {
  it('sqrt(x+1)−1 over x at 0 is 1/2, by L’Hôpital, checked', () => {
    const { card, working } = run(String.raw`\lim_{x\to 0}\frac{\sqrt{x+1}-1}{x}`)
    expect(card?.main).toBe('0.5')
    expect(working?.checked).toBe('ok')
  })

  it('sin 3x over sin 2x at 0 is 3/2, checked', () => {
    expect(run(String.raw`\lim_{x\to 0}\frac{\sin 3x}{\sin 2x}`).card?.main).toBe('1.5')
    expect(run(String.raw`\lim_{x\to 0}\frac{\sin 3x}{\sin 2x}`).working?.checked).toBe('ok')
  })

  it('(x²−9)/(x²−6x+9) at 3 has no limit, checked by its factors', () => {
    expect(run(String.raw`\lim_{x\to 3}\frac{x^2-9}{x^2-6x+9}`).card?.main).toMatch(/does not exist/)
    expect(run(String.raw`\lim_{x\to 3}\frac{x^2-9}{x^2-6x+9}`).working?.checked).toBe('ok')
  })

  it('x² over |x| at 0 is 0 from both sides, checked', () => {
    expect(run(String.raw`\lim_{x\to 0}\frac{x^{2}}{|x|}`).card?.main).toBe('0')
    expect(run(String.raw`\lim_{x\to 0}\frac{x^{2}}{|x|}`).working?.checked).toBe('ok')
  })

  it('e^x at 0 is 1 by substitution, checked', () => {
    expect(run('lim(exp(x), x, 0)').card?.main).toBe('1')
    expect(run('lim(exp(x), x, 0)').working?.checked).toBe('ok')
  })
})
