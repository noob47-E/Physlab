// Answers are mandatory (wave head 2026-10-06, from the owner's browser check): a refused huge power such as
// x^100000 left "Checking that one a different way…" on screen for about a minute while SymPy was asked, and when
// that gave up the line simply went away. A power past the limit is now refused at once — SymPy is not asked for
// what it cannot do in time either — and whenever the other way fails, the panel ends with one plain sentence.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async () => ({ error: 'This took too long.' })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))
vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { cas } from '../src/renderer/src/math/engine/sympy/worker'
import { OTHER_WAY_FAILED, usePure } from '../src/renderer/src/math/pure/store'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  vi.mocked(cas).mockClear()
})

const settle = async (): Promise<void> => {
  for (let k = 0; k < 5; k++) await Promise.resolve()
}

describe('a line nothing can work out ends in a sentence, never a silent blank', () => {
  it('x^100000 is refused at once in words, and SymPy is not asked', async () => {
    usePure.getState().run('factor', 'x^100000')
    await settle()
    const s = usePure.getState()
    expect(s.asking).toBe(false)
    expect(s.working?.error).toMatch(/too big to work out/)
    expect(vi.mocked(cas)).not.toHaveBeenCalled()
  })

  it('when the other way fails too, the refusal says so in one more sentence and the waiting line goes', async () => {
    // A line this engine refuses for a reason other than size: SymPy is asked and gives up.
    usePure.getState().run('factor', 'x^2 + sin(x)')
    await settle()
    const s = usePure.getState()
    expect(vi.mocked(cas)).toHaveBeenCalled()
    expect(s.asking).toBe(false)
    expect(s.working?.error).toContain(OTHER_WAY_FAILED)
  })
})
