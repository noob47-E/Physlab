// T7 proof for audit bug 17 [C5]: "Programming underscore leak in launch velocity readout
// (panels/Sandbox.tsx:954)".
//
// Verdict REAL (the wave head had already confirmed it by reading). The launch readout writes
// "vₓ = … · v_y = …": one component with a real subscript and one with an ASCII underscore, which
// rule 2 keeps off the screen. The string is inline in the JSX, so this is a source pin.
import { describe, expect, it } from 'vitest'
import { readSource } from './helpers/repo'

const SRC = readSource('src/renderer/src/panels/sandbox/Selected.tsx')

describe('G17: the launch readout writes v_y with an underscore', () => {
  it('the readout uses the subscript form for both components', () => {
    expect(SRC).not.toContain('v_y')
  })

  it('the subscript form is what the panel already writes for x', () => {
    expect(SRC).toContain('vₓ')
  })
})
