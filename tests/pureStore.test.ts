// The Working store's last line of defence: whatever a generator or the field converter throws,
// the panel shows a sentence and keeps working.
//
// This lives in its own file because the throws are made with vi.mock, which applies to every
// test in the file that imports the mocked module; contracts.test.ts must keep the real engine.

import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/pure/run', async (orig) => {
  const real = await orig<typeof import('../src/renderer/src/math/pure/run')>()
  return {
    ...real,
    runPure: vi.fn((job: string, input: string) => {
      if (input === 'boom') throw new Error('The generator gave up in a way it should not have.')
      return real.runPure(job as never, input)
    })
  }
})

vi.mock('../src/renderer/src/math/latexToMath', async (orig) => {
  const real = await orig<typeof import('../src/renderer/src/math/latexToMath')>()
  return {
    ...real,
    latexToMath: vi.fn((latex: string) => {
      if (latex.includes('\\pm')) throw new Error('± is two equations in one; solve each sign on its own.')
      return real.latexToMath(latex)
    })
  }
})

import { usePure } from '../src/renderer/src/math/pure/store'

describe('the Working store never lets a throw reach the panel', () => {
  it('turns a throw inside a generator into a readable refusal', () => {
    // The old test used inputs the generators refuse politely, so it passed with or without
    // the guard; this input really throws.
    expect(() => usePure.getState().run('factor', 'boom', 'boom')).not.toThrow()
    const w = usePure.getState().working
    expect(w?.error).toBe('The generator gave up in a way it should not have.')
    expect(usePure.getState().inputLatex).toBe('boom')
  })

  it('turns a throw from the field converter into the same kind of refusal', () => {
    // latexToMath is called from the store, inside the guard: converting in the panel first put
    // the throw in the middle of a render. The sentence the converter wrote is what is shown.
    const before = usePure.getState().runSeq
    expect(() => usePure.getState().runLatex('x=\\pm2', 'solve')).not.toThrow()
    const w = usePure.getState().working
    expect(w?.error).toMatch(/two equations in one/)
    expect(w?.title).toBe('Solve')
    expect(usePure.getState().inputLatex).toBe('x=\\pm2')
    expect(usePure.getState().runSeq).toBe(before + 1)
  })

  it('runs the converted text with the job guessed from it when asked to', () => {
    usePure.getState().runLatex('x^{2}-1', 'auto')
    expect(usePure.getState().job).toBe('factor')
    expect(usePure.getState().input).toBe('x^(2)-1')
    expect(usePure.getState().working?.answers[0].tex).toBe('\\left(x - 1\\right)\\left(x + 1\\right)')
    usePure.getState().runLatex('12,\\ 18', 'auto')
    expect(usePure.getState().job).toBe('hcf')
  })
})
