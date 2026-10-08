// H22: air drag's frontal area read the body's sizes unturned: a plank turned on end and falling
// end-first met the air with its broad face (1.2 m²) instead of its end (0.03 m²).

import { describe, expect, it } from 'vitest'
import { frontalAreaTurned } from '../src/renderer/src/sim/materials'

describe('the frontal area follows how a body is turned (H22)', () => {
  const plank: [number, number, number] = [4, 0.1, 0.3]
  const down: [number, number, number] = [0, -1, 0]

  it('unturned, falling flat, it is the broad face', () => {
    expect(frontalAreaTurned('plank', plank, [0, 0, 0, 1], down)).toBeCloseTo(4 * 0.3, 12)
  })

  it('turned 90° about z and falling end-first, it is the end', () => {
    const q: [number, number, number, number] = [0, 0, Math.SQRT1_2, Math.SQRT1_2]
    expect(frontalAreaTurned('plank', plank, q, down)).toBeCloseTo(0.1 * 0.3, 9)
  })
})
