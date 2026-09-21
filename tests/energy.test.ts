// The joules the Sandbox reports, checked against the textbook formulas. These are the numbers
// a student compares with their own working, so they must be the numbers the formulas give.

import { describe, expect, it } from 'vitest'
import { EMPTY_ENERGY, energyOf, groundTopOf, momentOfInertia, momentumOf, momentumSize, systemEnergy, systemMomentum } from '../src/renderer/src/sim/energy'
import type { BodyDef, BodyState } from '../src/renderer/src/sim/types'
import type { V3 } from '../src/renderer/src/math/vec'

let n = 0
function body(over: Partial<BodyDef> = {}): BodyDef {
  return {
    id: `b${++n}`,
    name: `B${n}`,
    shape: 'sphere',
    size: [0.5, 0.5, 0.5],
    position: [0, 1, 0],
    rotation: [0, 0, 0],
    velocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    motion: 'dynamic',
    material: 'steel',
    massMode: 'mass',
    mass: 1,
    restitution: 0.5,
    friction: 0.5,
    linearDamping: 0,
    angularDamping: 0,
    color: '#fff',
    ...over
  }
}

function state(over: Partial<BodyState> = {}): BodyState {
  return { position: [0, 0, 0], rotation: [0, 0, 0, 1], velocity: [0, 0, 0], angularVelocity: [0, 0, 0], mass: 1, asleep: false, ...over }
}

const G = 9.81

describe('energyOf', () => {
  it('a 2 kg ball at 3 m/s has 9 J of kinetic energy', () => {
    const e = energyOf(body({ mass: 2 }), state({ mass: 2, velocity: [3, 0, 0] }), G)
    expect(e.linear).toBeCloseTo(9, 12)
    expect(e.rotational).toBe(0)
    expect(e.kinetic).toBeCloseTo(9, 12)
    expect(e.potential).toBe(0)
    expect(e.total).toBeCloseTo(9, 12)
  })

  it('speed is the size of the velocity, whichever way it points', () => {
    const e = energyOf(body(), state({ mass: 2, velocity: [0, -3, 0] }), G)
    expect(e.linear).toBeCloseTo(9, 12)
    const diagonal = energyOf(body(), state({ mass: 2, velocity: [1, 2, 2] }), G)
    expect(diagonal.linear).toBeCloseTo(9, 12)
  })

  it('a 1 kg mass 2 m up has 19.62 J of potential energy at g = 9.81', () => {
    const e = energyOf(body(), state({ position: [0, 2, 0] }), G)
    expect(e.potential).toBeCloseTo(19.62, 12)
    expect(e.total).toBeCloseTo(19.62, 12)
  })

  it('measures height from the datum, and goes negative below it', () => {
    expect(energyOf(body(), state({ position: [0, 3, 0] }), 10, 1).potential).toBeCloseTo(20, 12)
    expect(energyOf(body(), state({ position: [0, 0.5, 0] }), 10, 1).potential).toBeCloseTo(-5, 12)
    expect(energyOf(body(), state({ position: [0, -4, 0] }), G).potential).toBeCloseTo(-39.24, 12)
  })

  it('a rolling solid ball carries 7/10 mv² all told', () => {
    const r = 0.5
    const m = 2
    const v = 3
    const e = energyOf(body({ size: [r, r, r], mass: m }), state({ mass: m, velocity: [v, 0, 0], angularVelocity: [0, 0, v / r] }), G)
    expect(e.linear).toBeCloseTo(9, 12)
    expect(e.rotational).toBeCloseTo(3.6, 12)
    expect(e.kinetic).toBeCloseTo(0.7 * m * v * v, 12)
  })

  it('uses the right moment of inertia for each shape', () => {
    const m = 2
    expect(momentOfInertia(body({ shape: 'sphere', size: [0.5, 0, 0] }), m)).toBeCloseTo(0.4 * m * 0.25, 12)
    expect(momentOfInertia(body({ shape: 'cylinder', size: [0.5, 2, 0] }), m)).toBeCloseTo(0.5 * m * 0.25, 12)
    expect(momentOfInertia(body({ shape: 'capsule', size: [0.5, 2, 0] }), m)).toBeCloseTo(0.5 * m * 0.25, 12)
    // A pulley is a cylinder, not a box.
    expect(momentOfInertia(body({ shape: 'pulley', size: [0.3, 0.1, 0] }), m)).toBeCloseTo(0.5 * m * 0.09, 12)
    // A cone's first size is its base width: the radius is half of it.
    expect(momentOfInertia(body({ shape: 'cone', size: [1, 2, 1] }), m)).toBeCloseTo(0.3 * m * 0.25, 12)
    // A box about its centre: m(w² + h²)/12.
    expect(momentOfInertia(body({ shape: 'box', size: [1, 2, 3] }), m)).toBeCloseTo((m * 5) / 12, 12)
    expect(momentOfInertia(body({ shape: 'plank', size: [4, 0.1, 0.3] }), m)).toBeCloseTo((m * 16.01) / 12, 12)
  })

  it('gives a fixed floor or wall no energy at all, however high it sits', () => {
    expect(energyOf(body({ motion: 'static' }), state({ position: [0, 5, 0], velocity: [1, 0, 0] }), G)).toEqual(EMPTY_ENERGY)
    expect(energyOf(body({ motion: 'kinematic' }), state({ velocity: [9, 0, 0] }), G)).toEqual(EMPTY_ENERGY)
  })

  it('works without gravity and with an enormous mass', () => {
    expect(energyOf(body(), state({ position: [0, 100, 0] }), 0).potential).toBe(0)
    const e = energyOf(body(), state({ mass: 1e9, velocity: [1e3, 0, 0], position: [0, 1e3, 0] }), G)
    expect(e.linear).toBeCloseTo(5e14, -2)
    expect(e.potential).toBeCloseTo(9.81e12, -3)
    expect(Number.isFinite(e.total)).toBe(true)
  })
})

describe('systemEnergy', () => {
  it('adds every term, and an empty scene has none', () => {
    expect(systemEnergy([])).toEqual(EMPTY_ENERGY)
    const a = energyOf(body({ mass: 2 }), state({ mass: 2, velocity: [3, 0, 0] }), G)
    const b = energyOf(body(), state({ position: [0, 2, 0] }), G)
    const sum = systemEnergy([a, b, EMPTY_ENERGY])
    expect(sum.linear).toBeCloseTo(9, 12)
    expect(sum.potential).toBeCloseTo(19.62, 12)
    expect(sum.kinetic).toBeCloseTo(9, 12)
    expect(sum.total).toBeCloseTo(28.62, 12)
  })

  it('does not change what it was handed', () => {
    const a = energyOf(body({ mass: 2 }), state({ mass: 2, velocity: [3, 0, 0] }), G)
    const before = { ...a }
    systemEnergy([a, a])
    expect(a).toEqual(before)
    expect(EMPTY_ENERGY).toEqual({ linear: 0, rotational: 0, kinetic: 0, potential: 0, total: 0 })
  })

  it('a ball dropped from 2 m has the same total at the top and at the bottom', () => {
    const top = energyOf(body(), state({ position: [0, 2, 0] }), G)
    const v = Math.sqrt(2 * G * 2)
    const bottom = energyOf(body(), state({ position: [0, 0, 0], velocity: [0, -v, 0] }), G)
    expect(systemEnergy([top]).total).toBeCloseTo(systemEnergy([bottom]).total, 10)
  })
})

describe('momentum and the datum', () => {
  it('p = mv as a vector, and its size', () => {
    const s = state({ mass: 2, velocity: [3, -4, 0] })
    expect(momentumOf(s)).toEqual([6, -8, 0])
    expect(momentumSize(s)).toBeCloseTo(10, 12)
    const total: V3 = systemMomentum([s, state({ mass: 1, velocity: [-6, 8, 0] })])
    expect(total).toEqual([0, 0, 0])
  })

  it('measures height from the top of the floor, and from zero when there is none', () => {
    expect(groundTopOf([])).toBe(0)
    expect(groundTopOf([body({ shape: 'ground', size: [50, 1, 50], position: [0, -0.5, 0], motion: 'static' })])).toBeCloseTo(0, 12)
    expect(groundTopOf([body({ shape: 'box', size: [4, 2, 4], position: [0, 1, 0], motion: 'static' })])).toBeCloseTo(2, 12)
    expect(groundTopOf([body()])).toBe(0)
  })
})
