// CLAB: Collision Lab keeps ONE Play / Pause / Reset row and removes duplicate copies.
// The student uses the canonical Transport row (or Space) to play/pause the run.

import { describe, expect, it } from 'vitest'
import { readSource } from './helpers/repo'

describe('CLAB: Collision Lab single Play/Pause/Reset row', () => {
  it('LabPanel does not render a duplicate "Run it" or Play button', () => {
    const src = readSource('src/renderer/src/render/sandbox/LabPanel.tsx')
    expect(src).not.toMatch(/Run it/)
    expect(src).not.toMatch(/<Play/)
    expect(src).not.toMatch(/commit\(draft,\s*true\)/)
  })

  it('Transport row maintains the canonical Play and Reset controls', () => {
    const src = readSource('src/renderer/src/panels/sandbox/Transport.tsx')
    expect(src).toMatch(/data-tour="play"/)
    expect(src).toMatch(/togglePlay/)
    expect(src).toMatch(/resetRun/)
  })
})
