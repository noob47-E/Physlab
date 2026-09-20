// The command bar used to say "CAS ● ready". These are the plain words it says instead.

import { describe, expect, it } from 'vitest'
import { describeCasStatus } from '../src/renderer/src/ui/casStatus'

describe('what the command bar says about the algebra engine', () => {
  it('says nothing at all when everything is ready', () => {
    const s = describeCasStatus('ready', 0)
    expect(s.words).toBe('')
    expect(s.tone).toBe('good')
    expect(s.tip).toMatch(/ready/i)
  })

  it('says it is working, in words, whatever the engine state', () => {
    expect(describeCasStatus('ready', 2).words).toBe('Working…')
    expect(describeCasStatus('loading', 1).words).toBe('Working…')
  })

  it('says it is starting while the engine loads', () => {
    expect(describeCasStatus('loading', 0).words).toMatch(/starting/i)
  })

  it('says algebra is unavailable, with the reason in the tooltip, when it failed', () => {
    const s = describeCasStatus('error', 0, 'no WebAssembly')
    expect(s.tone).toBe('bad')
    expect(s.words).toBe('Algebra unavailable')
    expect(s.tip).toContain('no WebAssembly')
  })

  it('never uses the acronym or a symbol a student would have to look up', () => {
    for (const status of ['idle', 'loading', 'ready', 'error'] as const) {
      for (const busy of [0, 1]) {
        const s = describeCasStatus(status, busy)
        expect(`${s.words} ${s.tip}`).not.toMatch(/CAS|SymPy|[●◌○✕]/)
      }
    }
  })
})
