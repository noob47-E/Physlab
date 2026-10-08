import { describe, expect, it } from 'vitest'
import { presetById } from '../src/renderer/src/sim/presets'

describe('H10: projectile greatest height center vs trail', () => {
  it('quotes 2.8 m greatest height matching ball center trail (y = 0.3 + 2.5)', () => {
    const p = presetById('projectile')!
    expect(p.about).toContain('greatest height 2.8 m')
    expect(p.about).not.toContain('greatest height 2.5 m')
    const { bodies } = p.build()
    const ball = bodies.find((b) => b.name === 'P')!
    expect(ball.position[1]).toBe(0.3)
    const vy = ball.velocity[1]
    const rise = (vy * vy) / (2 * 9.81)
    const peakCenterY = ball.position[1] + rise
    expect(peakCenterY).toBeCloseTo(2.8, 1)
  })
})

describe('H11: rolling against sliding lane friction and initial contact', () => {
  it('places ball and block on the slope without airborne drop', () => {
    const p = presetById('rollslide')!
    const { bodies } = p.build()
    const ball = bodies.find((b) => b.name === 'Ball')!
    const block = bodies.find((b) => b.name === 'Block')!

    // Slope surface at x = -5.2 is y = 2.7.
    // Ball radius 0.25 / cos(20.556°) ≈ 0.267 -> y = 2.967
    expect(ball.position[1]).toBeCloseTo(2.967, 3)

    // Block half-height 0.2 / cos(20.556°) ≈ 0.214 -> y = 2.914, rotated to lie flat on slope
    expect(block.position[1]).toBeCloseTo(2.914, 3)
    expect(block.rotation[2]).toBeCloseTo(-20.556, 3)
  })

  it('provides a dedicated frictionless lane for the sliding block', () => {
    const p = presetById('rollslide')!
    const { bodies } = p.build()
    const block = bodies.find((b) => b.name === 'Block')!
    const iceLane = bodies.find((b) => b.name === 'Ice lane')!
    expect(iceLane).toBeDefined()
    expect(iceLane.friction).toBe(0)
    expect(block.friction).toBe(0)
  })
})

describe('H12: recoil gun rests on the ice floor', () => {
  it('places gun and bullet center at y = 0.3 resting on the floor', () => {
    const p = presetById('recoil')!
    const { bodies } = p.build()
    const gun = bodies.find((b) => b.name === 'Gun')!
    const bullet = bodies.find((b) => b.name === 'Bullet')!
    // Gun height is 0.6 m, center at y = 0.3 rests directly on floor at y = 0
    expect(gun.position[1]).toBe(0.3)
    expect(gun.position[1] - gun.size[1] / 2).toBeCloseTo(0, 6)
    expect(bullet.position[1]).toBe(0.3)
  })
})

describe('H13: trolleys ball rests on the ice floor', () => {
  it('places incoming ball center at y = 0.2 resting on the floor', () => {
    const p = presetById('trolleys')!
    const { bodies } = p.build()
    const ball = bodies.find((b) => b.name === 'Ball')!
    // Default ball radius is 0.2 m, center at y = 0.2 rests directly on floor at y = 0
    expect(ball.position[1]).toBe(0.2)
    expect(ball.position[1] - ball.size[0]).toBeCloseTo(0, 6)
  })
})

describe('A18: the energy ramp ball rests on its slope (part head check)', () => {
  it('starts touching the slope, so the 1.5 m drop is the one the sentence quotes', () => {
    const { bodies } = presetById('ramp')!.build()
    const ball = bodies.find((b) => b.name === 'A')!
    // The slope runs 1.5 m down over 5 m: the surface at x = −4.4 is 1.5 × (1 − 0.1 / 5) = 1.47,
    // and the centre sits r / cos θ = 0.25 / cos(atan 0.3) above it. It started 2 cm in the air.
    const surface = 1.5 * (1 - 0.1 / 5)
    expect(ball.position[1]).toBeCloseTo(surface + 0.25 / Math.cos(Math.atan(0.3)), 3)
  })
})
