import { describe, it, expect } from 'vitest'
import { LimitKey, LIMITS, SceneFacts, limitsFor } from '../src/renderer/src/sim/limits'

describe('sim/limits', () => {
  it('every LimitKey has a sentence that is plain English', () => {
    for (const key of Object.keys(LIMITS) as LimitKey[]) {
      const sentence = LIMITS[key].sentence
      // Check for programming words on screen
      expect(sentence).not.toMatch(/\^/)
      expect(sentence).not.toMatch(/e-/)
      expect(sentence).not.toContain('null')
      expect(sentence).not.toContain('NaN')
      expect(sentence).not.toContain('function')
    }
  })

  it('a still scene in a vacuum gives []', () => {
    const stillScene: SceneFacts = {
      anyBounce: false,
      anySliding: false,
      anySpinDampingAboveZero: false,
      anyRope: false,
      anyEngineSpring: false,
      pendulumAmplitudeDeg: null,
      anyRolling: false,
      airDensity: 0,
      maxSpeed: 0,
      maxDistanceFromOrigin: 0,
      slowestBounceSpeed: null
    }

    expect(limitsFor(stillScene)).toEqual([])
  })

  it('each rule of limitsFor fires on its own fact and only then', () => {
    const base: SceneFacts = {
      anyBounce: false,
      anySliding: false,
      anySpinDampingAboveZero: false,
      anyRope: false,
      anyEngineSpring: false,
      pendulumAmplitudeDeg: null,
      anyRolling: false,
      airDensity: 0,
      maxSpeed: 0,
      maxDistanceFromOrigin: 0,
      slowestBounceSpeed: null
    }

    // anyBounce fires rigid and maxRestitution
    expect(limitsFor({ ...base, anyBounce: true })).toEqual(['rigid', 'maxRestitution'])

    // bounceThreshold if slowestBounceSpeed !== null && < 1.5
    expect(limitsFor({ ...base, slowestBounceSpeed: 1.4 })).toEqual(['bounceThreshold'])
    expect(limitsFor({ ...base, slowestBounceSpeed: 1.5 })).toEqual([])
    expect(limitsFor({ ...base, slowestBounceSpeed: 1.6 })).toEqual([])

    // anySliding
    expect(limitsFor({ ...base, anySliding: true })).toEqual(['frictionMix'])

    // anySpinDampingAboveZero
    expect(limitsFor({ ...base, anySpinDampingAboveZero: true })).toEqual(['spinDamping'])

    // anyRope
    expect(limitsFor({ ...base, anyRope: true })).toEqual(['ropeMass'])

    // anyEngineSpring
    expect(limitsFor({ ...base, anyEngineSpring: true })).toEqual(['softSpring'])

    // pendulumAmplitudeDeg > 5
    expect(limitsFor({ ...base, pendulumAmplitudeDeg: 5.1 })).toEqual(['smallSwing'])
    expect(limitsFor({ ...base, pendulumAmplitudeDeg: 5.0 })).toEqual([])
    expect(limitsFor({ ...base, pendulumAmplitudeDeg: 4.9 })).toEqual([])

    // anyRolling
    expect(limitsFor({ ...base, anyRolling: true })).toEqual(['rollingModel'])

    // airDensity > 0
    expect(limitsFor({ ...base, airDensity: 0.1 })).toEqual(['airModel'])
    expect(limitsFor({ ...base, airDensity: 0 })).toEqual([])

    // maxSpeed > 400
    expect(limitsFor({ ...base, maxSpeed: 401 })).toEqual(['speedCap'])
    expect(limitsFor({ ...base, maxSpeed: 400 })).toEqual([])

    // maxDistanceFromOrigin > 1000
    expect(limitsFor({ ...base, maxDistanceFromOrigin: 1001 })).toEqual(['floatPrecision'])
    expect(limitsFor({ ...base, maxDistanceFromOrigin: 1000 })).toEqual([])
  })
})
