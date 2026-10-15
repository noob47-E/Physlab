// SB51: the Collision Lab's theory - what the formulas say, read from the BUILT scene (so an edited mass or speed moves the
// prediction), and what the run measured, read off the tape after the hit.

import { describe, expect, it } from 'vitest'
import { LAB_THEORY } from '../src/renderer/src/sim/labTheory'
import { buildScene, LAB_DEFAULTS } from '../src/renderer/src/sim/labScenes'
import { theoryFor } from '../src/renderer/src/sim/theory'

const value = (list: { key: string; value: number }[], key: string) => list.find((p) => p.key === key)?.value

describe('two carts', () => {
  it('the defaults: A comes back at 1 m/s, B goes on at 2 m/s, momentum 3, nothing lost', () => {
    const p = LAB_THEORY.lab1d.predict(buildScene('lab1d', LAB_DEFAULTS.lab1d))
    expect(value(p, 'vA')).toBeCloseTo(-1, 12)
    expect(value(p, 'vB')).toBeCloseTo(2, 12)
    expect(value(p, 'p')).toBeCloseTo(3, 12)
    expect(value(p, 'keLost')).toBeCloseTo(0, 12)
  })
  it('follows the build: e = 0.5 loses 2.25 J and A stops; a heavier A changes the after-speeds', () => {
    const half = LAB_THEORY.lab1d.predict(buildScene('lab1d', { ...LAB_DEFAULTS.lab1d, e: 0.5 }))
    expect(value(half, 'vA')).toBeCloseTo(0, 12)
    expect(value(half, 'keLost')).toBeCloseTo(2.25, 12)
    const heavy = LAB_THEORY.lab1d.predict(buildScene('lab1d', { ...LAB_DEFAULTS.lab1d, mA: 2 }))
    expect(value(heavy, 'vA')).toBeCloseTo(0, 12)
    expect(value(heavy, 'vB')).toBeCloseTo(3, 12)
  })
  it('the bounciness used is the larger of the two bodies’ values', () => {
    const b = buildScene('lab1d', { ...LAB_DEFAULTS.lab1d, e: 0 })
    b.bodies.find((d) => d.name === 'B')!.restitution = 1
    expect(value(LAB_THEORY.lab1d.predict(b), 'vA')).toBeCloseTo(-1, 12)
  })
  it('a hit slower than 1 m/s is predicted as the engine does it, with the engine’s limit named', () => {
    const p = LAB_THEORY.lab1d.predict(buildScene('lab1d', { ...LAB_DEFAULTS.lab1d, mB: 1, uA: 0.5 }))
    const vA = p.find((x) => x.key === 'vA')!
    expect(vA.value).toBeCloseTo(0.25, 12)
    expect(vA.note).toMatch(/does not bounce below 1 m\/s/)
  })
})

describe('pucks and the cradle', () => {
  it('pucks at 30°, e = 1: A (0.75, −1.299), B (2.25, 1.299), at 90°', () => {
    const p = LAB_THEORY.lab2d.predict(buildScene('lab2d', LAB_DEFAULTS.lab2d))
    expect(value(p, 'vAx')).toBeCloseTo(0.75, 3)
    expect(value(p, 'vAy')).toBeCloseTo(-1.299, 3)
    expect(value(p, 'vBx')).toBeCloseTo(2.25, 3)
    expect(value(p, 'angle')).toBeCloseTo(90, 9)
  })
  it('pucks: the engine pushes along the line of centres a step before they touch; the stepped prediction says so and gives its numbers', () => {
    const p = LAB_THEORY.lab2d.predict(buildScene('lab2d', LAB_DEFAULTS.lab2d))
    const vAx = p.find((x) => x.key === 'vAx')!
    // At 600 steps a second A is 5 mm short of touching on the last step before: the line it pushes along is 0.5° flatter.
    expect(vAx.stepped!(600)).toBeCloseTo(0.729, 2)
    expect(vAx.stepNote!(600)).toMatch(/a step before they touch, 5 mm apart/)
  })
  it('a measured speed under half a millimetre a second reads 0, as the card writes it (no "−100 %" against a formula of 0)', async () => {
    const { tidySpeed } = await import('../src/renderer/src/sim/labTheory')
    expect(tidySpeed(-3e-6)).toBe(0)
    expect(tidySpeed(0.0012)).toBe(0.0012)
  })
  it('the free cradle, two lifted: the last two leave at 2 m/s', () => {
    const p = LAB_THEORY.labcradle.predict(buildScene('labcradle', { ...LAB_DEFAULTS.labcradle, n: 2, strings: false }))
    expect(value(p, 'v4')).toBeCloseTo(2, 6)
    expect(value(p, 'v5')).toBeCloseTo(2, 6)
  })
  it('review: the cradle on strings is read right after the last hit, every ball, not later when the strings have slowed them', () => {
    const built = buildScene('labcradle', { ...LAB_DEFAULTS.labcradle, e: 0.5 })
    const balls = [1, 2, 3, 4, 5].map((i) => built.bodies.find((d) => d.name === `B${i}`)!)
    const ids = built.bodies.map((d) => d.id)
    // B1 moves at 2 until the hits at steps 10 to 12; after them it moves at 0.5, and the string slows it to 0.2 by step 40.
    const speedOf = (name: string, s: number) => (name === 'B1' ? (s <= 12 ? 2 : s < 20 ? 0.5 : 0.2) : name === 'B5' ? (s <= 12 ? 0 : s < 20 ? 1.4 : 1.1) : 0)
    const tape = {
      first: 0,
      last: 40,
      rate: 600,
      layout: { bodies: ids },
      record: (s: number) => {
        const r = new Float32Array(13 * ids.length)
        built.bodies.forEach((d, i) => (r[i * 13 + 7] = speedOf(d.name, s)))
        return r
      },
      eventsIn: () => [10, 11, 12].map((step, k) => ({ step, e: { a: balls[k].id, b: balls[k + 1].id, approachSpeed: 2 } }))
    }
    const m = LAB_THEORY.labcradle.measure(tape as never, built)
    expect(value(m, 'v1')).toBeCloseTo(0.5, 6)
    expect(value(m, 'v5')).toBeCloseTo(1.4, 6)
  })
  it('each lab is in the theory table with its cards and roles', () => {
    expect(theoryFor('lab1d')?.cards).toEqual(['lab-p0', 'lab-p', 'lab-ke-lost', 'lab-ke0', 'lab-ke', 'lab-ke-lost-theory'])
    expect(theoryFor('lab2d')?.cards).toEqual(['lab2d-px0', 'lab2d-px', 'lab-ke-lost', 'lab2d-py0', 'lab2d-py', 'lab-ke0', 'lab-ke'])
    expect(theoryFor('labcradle')?.cards).toEqual(['lab-cradle-p0', 'lab-cradle-p', 'lab-cradle-ke0', 'lab-cradle-ke'])
  })
})
