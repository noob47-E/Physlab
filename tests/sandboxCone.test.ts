// H17: a cone collided as a four-sided pyramid (its hull had four base corners at ±a/2) while it was
// drawn (THREE.ConeGeometry, radius a/2), weighed (shapeVolume) and spun (inertia) as a round cone:
// the pyramid's corners stuck out 41 % past the drawn base, and its volume was 4/π of the cone's.

import { describe, expect, it } from 'vitest'
import { coneHull } from '../src/renderer/src/sim/world'
import { shapeVolume } from '../src/renderer/src/sim/materials'

describe('the cone collides as the round cone it is drawn as (H17)', () => {
  const a = 2
  const b = 3
  const pts = coneHull(a, b)

  it('has its apex on the axis and its base on the drawn circle, all the way round', () => {
    const [apex, ...base] = pts
    expect(apex).toEqual([0, b / 2, 0])
    expect(base.length).toBeGreaterThanOrEqual(16)
    for (const p of base) {
      expect(p[1]).toBe(-b / 2)
      expect(Math.hypot(p[0], p[2])).toBeCloseTo(a / 2, 12)
    }
  })

  it('holds the round cone’s volume to within 2 %', () => {
    const base = pts.slice(1)
    let area = 0
    for (let i = 0; i < base.length; i++) {
      const p = base[i]
      const q = base[(i + 1) % base.length]
      area += (p[0] * q[2] - q[0] * p[2]) / 2
    }
    const hull = (Math.abs(area) * b) / 3
    const cone = shapeVolume('cone', [a, b, a])
    expect(Math.abs(hull - cone) / cone).toBeLessThan(0.02)
  })
})
