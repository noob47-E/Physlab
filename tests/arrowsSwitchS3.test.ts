// S3 (report 8.3): in the Sandbox a fast run's velocity arrows shot up through the formula cards, the graph dock and the top
// bar, and the only switch to hide them was in All tools → World, out of reach of the simple panel. Now one Arrows switch sits
// in the Play/Reset row of both views, and a velocity arrow stops growing at 2.5 m (a force arrow already stopped at 3 m).

import { describe, expect, it } from 'vitest'
import { pushArrowScale, velocityArrowScale, VELOCITY_ARROW_MAX } from '../src/renderer/src/sim/arrowScale'
import { useSandbox } from '../src/renderer/src/sim/store'
import { readSource } from './helpers/repo'

describe('S3: a velocity arrow never grows past 2.5 m', () => {
  it('slow bodies keep half a metre per m/s (4 m/s is a 2 m arrow, as before)', () => {
    expect(4 * velocityArrowScale(4)).toBeCloseTo(2, 12)
    expect(5 * velocityArrowScale(5)).toBeCloseTo(2.5, 12)
  })

  it('fast bodies stop at 2.5 m, pointing the same way', () => {
    for (const v of [6, 15, 40, 300]) expect(v * velocityArrowScale(v), `${v} m/s`).toBeCloseTo(VELOCITY_ARROW_MAX, 12)
  })

  it('a body at rest gives no NaN', () => {
    expect(velocityArrowScale(0)).toBe(0.5)
  })

  it('a push keeps its rule: a metre per 20 N, at most 3 m', () => {
    expect(25 * pushArrowScale(25)).toBeCloseTo(1.25, 12)
    expect(200 * pushArrowScale(200)).toBeCloseTo(3, 12)
  })

  it('the arrows are drawn with these scales', () => {
    const src = readSource('src/renderer/src/render/sandbox/Arrows.tsx')
    expect(src).toMatch(/const k = velocityArrowScale\(speed\)/)
    expect(src).toMatch(/const k = pushArrowScale\(size\)/)
  })
})

describe('S3: one Arrows switch in the Play/Reset row of both views', () => {
  const src = readSource('src/renderer/src/panels/sandbox/Transport.tsx')

  it('the switch turns every arrow off and on again', () => {
    useSandbox.getState().setArrowsShown(false)
    expect(useSandbox.getState().arrowsShown).toBe(false)
    useSandbox.getState().setArrowsShown(true)
    expect(useSandbox.getState().arrowsShown).toBe(true)
  })

  it('it is drawn outside the full-panel-only buttons, so the simple panel has it too, with its word there', () => {
    const toggle = src.indexOf('onClick={() => setArrowsShown(!arrowsShown)}')
    const fullOnly = src.indexOf('{!simple && (')
    expect(toggle).toBeGreaterThan(0)
    expect(toggle).toBeLessThan(fullOnly)
    expect(src).toMatch(/aria-pressed=\{arrowsShown\}/)
    expect(src).toMatch(/\{simple && ' Arrows'\}/)
  })
})
