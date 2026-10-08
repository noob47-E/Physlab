// A19 inspector leads (P-SIM H18, H24, H26, H27, H29): the decisions, away from React.

import { describe, expect, it } from 'vitest'
import { CONTACT_HINT, dragSetsStart, showsLive, showsMotionAids, sizeFields } from '../src/renderer/src/sim/inspector'
import { makeBody } from '../src/renderer/src/sim/store'

describe('size boxes name what they do (H26)', () => {
  it('a cone has a base width and a height, and no depth', () => {
    const f = sizeFields('cone', [0.5, 0.8, 0.5])
    expect(f.map((x) => x.label)).toEqual(['base width', 'height'])
    expect(f[0].set(1)).toEqual([1, 0.8, 1])
  })
  it('a pulley has a radius and a thickness', () => {
    expect(sizeFields('pulley', [0.3, 0.15, 0.3]).map((x) => x.label)).toEqual(['radius', 'thickness'])
  })
  it('a capsule’s height is the whole height, round ends and all', () => {
    const [, h] = sizeFields('capsule', [0.2, 0.6, 0.2])
    expect(h.value).toBeCloseTo(1, 12)
    expect(h.set(1.4)[1]).toBeCloseTo(1, 12)
  })
  it('a box keeps width, height and depth', () => {
    expect(sizeFields('box', [1, 2, 3]).map((x) => x.letter)).toEqual(['w', 'h', 'd'])
  })
})

describe('the other inspector leads', () => {
  it('H27: only a moving object offers a velocity arrow and a trail', () => {
    expect(showsMotionAids({ ...makeBody('box', 'A'), motion: 'dynamic' })).toBe(true)
    expect(showsMotionAids({ ...makeBody('box', 'A'), motion: 'static' })).toBe(false)
  })
  it('H24: paused part-way, the inspector shows where things are', () => {
    expect(showsLive(false, 2.3)).toBe(true)
    expect(showsLive(false, 0)).toBe(false)
    expect(showsLive(true, 0)).toBe(true)
  })
  it('H18: a drag paused part-way through a run does not rewrite a moving body’s start', () => {
    const ball = { ...makeBody('sphere', 'A'), motion: 'dynamic' as const }
    expect(dragSetsStart(0, ball)).toBe(true)
    expect(dragSetsStart(1.5, ball)).toBe(false)
    expect(dragSetsStart(1.5, { ...ball, motion: 'static' })).toBe(true)
  })
  it('H29: the sliders say how two surfaces combine', () => {
    expect(CONTACT_HINT).toMatch(/√\(μ₁ × μ₂\)/)
  })
})
