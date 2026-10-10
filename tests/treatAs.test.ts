// P-FIX-TREATAS (owner's tester, 2026-10-10): "Treat as" under the Maths working, and the working's
// own offers, must work on the line in the field now — not on the last line worked out. The tester
// ran a "What can it do?" example (12, 18, 30), typed a new line, pressed = and chose a job: the
// panel worked out 12, 18, 30 again.

import { beforeEach, describe, expect, it } from 'vitest'
import { useCalc } from '../src/renderer/src/calc/calcStore'
import { usePure } from '../src/renderer/src/math/pure/store'
import { jobById, type JobId } from '../src/renderer/src/math/pure/run'
import { treatAs, workingIsFor } from '../src/renderer/src/panels/treatAs'

/** What "What can it do?" does for one job: its example into the field, and worked out. */
function runExample(job: JobId): void {
  const def = jobById(job)
  useCalc.setState({ input: def.exampleLatex })
  usePure.getState().run(def.id, def.example, def.exampleLatex)
}

const answer = (): string => {
  const w = usePure.getState().working
  expect(w?.error ?? null).toBeNull()
  return (w?.answers ?? []).map((a) => a.tex).join(' ; ')
}

beforeEach(() => runExample('hcf'))

describe('Treat as works on the line in the field', () => {
  it('24, 36, 60 treated as HCF gives 12', () => {
    useCalc.setState({ input: '24,\\ 36,\\ 60' })
    treatAs('hcf')
    expect(usePure.getState().input).not.toMatch(/18/)
    expect(answer()).toBe('12')
  })

  it('4, 6 treated as LCM gives 12', () => {
    useCalc.setState({ input: '4,\\ 6' })
    treatAs('lcm')
    expect(answer()).toBe('12')
  })

  it('360 treated as Prime factors gives 2³ × 3² × 5', () => {
    useCalc.setState({ input: '360' })
    treatAs('primes')
    expect(answer().replace(/\s/g, '')).toMatch(/2\^\{?3\}?.*3\^\{?2\}?.*5/)
  })

  it('1/(x(x+1)) treated as Partial fractions gives 1/x − 1/(x + 1)', () => {
    useCalc.setState({ input: '\\frac{1}{x\\left(x+1\\right)}' })
    treatAs('partial')
    const a = answer()
    expect(a).toMatch(/\\d?frac\{1\}\{x\}/)
    expect(a).toMatch(/-\s*\\d?frac\{1\}\{x\s*\+\s*1\}/)
  })

  it('with nothing in the field, works the shown line again', () => {
    useCalc.setState({ input: '' })
    treatAs('lcm')
    expect(answer()).toBe('180')
  })

  it('a line the converter cannot read comes back as its sentence, under the chosen job', () => {
    usePure.getState().runLatex('x=\\pm2', 'solve')
    const workItOut = usePure.getState().working?.error
    runExample('hcf')
    useCalc.setState({ input: 'x=\\pm2' })
    treatAs('solve')
    expect(workItOut).toBeTruthy()
    expect(usePure.getState().working?.error).toBe(workItOut)
    expect(usePure.getState().inputLatex).toBe('x=\\pm2')
  })

  it('in BASE-N, whose field is not maths, works the shown line again', () => {
    useCalc.setState({ mode: 'BASE-N', input: 'FF+1A' })
    try {
      treatAs('lcm')
      expect(answer()).toBe('180')
    } finally {
      useCalc.setState({ mode: 'COMP' })
    }
  })
})

describe('the working says whose line it is', () => {
  const is = (field: string, mode = 'COMP'): boolean => workingIsFor(field, usePure.getState().inputLatex, usePure.getState().input, mode)
  it('belongs to the field while the field holds its line, and not once the line changes', () => {
    expect(is(useCalc.getState().input)).toBe(true)
    expect(is('24,\\ 36,\\ 60')).toBe(false)
    expect(is('')).toBe(true)
  })
  it('the same line written with other spacing is the same line; BASE-N never says so', () => {
    expect(is('12,18,30')).toBe(true)
    expect(is('FF+1A', 'BASE-N')).toBe(true)
  })
})
