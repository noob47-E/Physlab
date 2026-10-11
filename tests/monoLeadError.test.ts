// CW7c-1: mono.ts:249 FunctionNode refusal in pure algebra.
// When a function like sin(x) is entered into Expand or Complex, mono.ts says:
// '"sin" is not something I can factorise.'
// A student asked to expand or simplify a complex expression is told it cannot be factorised.
// This is [answer may change] because it changes errors.txt / nameLists.txt golden outputs.
// Pinned here as it.fails and parked in polish/pro-account/OWNER-APPROVALS.md as CW7c-1.

import { describe, expect, it } from 'vitest'
import { runPure } from '../src/renderer/src/math/pure/run'

describe('CW7c-1: FunctionNode refusal in pure algebra is job-neutral', () => {
  it.fails('expand on sin(x) uses a job-neutral refusal rather than saying factorise', () => {
    const w = runPure('expand', 'sin(x)')
    expect(w.error).not.toMatch(/factorise/i)
  })

  it.fails('divide on sin(x)/2 uses a job-neutral refusal rather than saying factorise', () => {
    const w = runPure('divide', 'sin(x)/2')
    expect(w.error).not.toMatch(/factorise/i)
  })

  it.fails('solve on sin(x)=0 uses a job-neutral refusal rather than saying factorise', () => {
    const w = runPure('solve', 'sin(x)=0')
    expect(w.error).not.toMatch(/factorise/i)
  })
})
