// Physics checks for SB59 apparatus: real lever on knife-edge pivot with slotted-mass hangers,
// and real Atwood machine on retort stand with pulley, mass hangers and vertical metre rule.

import { describe, expect, it } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import { DEFAULT_WORLD, type BodyState, type BodyDef } from '../src/renderer/src/sim/types'
import { presetById } from '../src/renderer/src/sim/presets'
import { rotateVec } from '../src/renderer/src/sim/rotate'
import { dist, type V3 } from '../src/renderer/src/math/vec'
import {
  buildMetreRule,
  buildKnifeEdge,
  buildSlottedHanger,
  buildRetortStand,
  buildSpokedPulley,
  buildPulleyBracket,
  slideHanger,
  discCountOf
} from '../src/renderer/src/sim/apparatus'

const tiltDeg = (st: BodyState) => (2 * Math.asin(st.rotation[2]) * 180) / Math.PI

describe('SB59: apparatus builders (geometry)', () => {
  it('metreRule: creates 1 m beam with correct size (1.0 × 0.03 × 0.006 or 0.03 × 1.0 × 0.006)', () => {
    const horiz = buildMetreRule('beam_h', 'Horizontal', [0, 0.6, 0])
    expect(horiz.size).toEqual([1.0, 0.03, 0.006])
    expect(horiz.mass).toBe(0.15)
    expect(horiz.material).toBe('wood')

    const vert = buildMetreRule('beam_v', 'Vertical', [0, 0.75, -0.1], { orientation: 'vertical', motion: 'static' })
    expect(vert.size).toEqual([0.03, 1.0, 0.006])
    expect(vert.motion).toBe('static')
  })

  it('knifeEdge: creates base and wedge with correct geometry and pivot point', () => {
    const knife = buildKnifeEdge('pivot', [0, 0, 0], 0.6)
    expect(knife.base.id).toBe('pivot_base')
    expect(knife.base.size).toEqual([0.18, 0.04, 0.12])
    expect(knife.base.motion).toBe('static')
    expect(knife.wedge.id).toBe('pivot_wedge')
    expect(knife.wedge.size[0]).toBe(0.12) // width
    expect(knife.wedge.size[2]).toBe(0.08) // depth
    expect(knife.pivot).toEqual([0, 0.6, 0])
    expect(knife.hingeLink).toBeDefined()

    const link = knife.hingeLink({ id: 'beam', position: [0, 0.6, 0], size: [1, 0, 0] } as BodyDef)
    expect(link.kind).toBe('hinge')
    expect(link.a).toBe('beam')
    expect(link.b).toBe('pivot_wedge')
  })

  it('slottedMassHanger: creates hanger with correct mass and disc count', () => {
    const h1kg = buildSlottedHanger('hanger1', 'Hanger 1 kg', [0, 0.6, 0], 1.0, 0.15)
    expect(h1kg.hanger.id).toBe('hanger1')
    expect(h1kg.hanger.mass).toBe(1.0)
    expect(h1kg.hanger.motion).toBe('dynamic')
    // 1 kg = 2 discs at 0.5 kg each
    expect(h1kg.hanger.size[1]).toBe(0.02 + 0.015 * 2) // height = base + disc height

    const h3kg = buildSlottedHanger('hanger3', 'Hanger 3 kg', [0.2, 0.6, 0], 3.0, 0.15)
    expect(h3kg.hanger.mass).toBe(3.0)
    // 3 kg = 6 discs at 0.5 kg each
    expect(h3kg.hanger.size[1]).toBe(0.02 + 0.015 * 6)

    const link = h3kg.stringLink({ id: 'beam', position: [0, 0.6, 0], size: [1, 0, 0] } as BodyDef)
    expect(link.kind).toBe('string')
    expect(link.b).toBe('hanger3')
    expect(link.length).toBe(0.15)
  })

  it('retortStand: creates base, rod, clamp, and arm with correct dimensions', () => {
    const stand = buildRetortStand([0, 0, -0.18], 1.6)
    expect(stand.base.id).toBe('retort_base')
    expect(stand.base.size).toEqual([0.35, 0.04, 0.24])
    expect(stand.base.motion).toBe('static')

    expect(stand.rod.id).toBe('retort_rod')
    expect(stand.rod.size).toEqual([0.01, 1.6, 0.01])

    expect(stand.clamp.id).toBe('retort_clamp')
    expect(stand.clamp.size).toEqual([0.045, 0.045, 0.045])

    expect(stand.arm.id).toBe('retort_arm')
    expect(stand.arm.size[0]).toBe(0.008) // radius
    expect(stand.arm.size[1]).toBe(0.18) // height = |z|
    expect(stand.arm.size[2]).toBe(0.008) // radius

    expect(stand.armEnd).toEqual([0, 1.55, 0]) // clampY at 1.6 - 0.05 = 1.55
  })

  it('spokedPulley: creates wheel with correct size and properties', () => {
    const wheel = buildSpokedPulley('pulley', 'Pulley wheel', [0, 1.45, 0])
    expect(wheel.id).toBe('pulley')
    expect(wheel.size).toEqual([0.1, 0.04, 0.1])
    expect(wheel.motion).toBe('static')
    expect(wheel.material).toBe('steel')
  })

  it('discCountOf: calculates disc count from mass (0.5 kg per disc)', () => {
    expect(discCountOf(0.5)).toBe(1)
    expect(discCountOf(1.0)).toBe(2)
    expect(discCountOf(2.0)).toBe(4)
    expect(discCountOf(3.0)).toBe(6)
    expect(discCountOf(0.55)).toBe(1) // rounds to nearest
    expect(discCountOf(0.05)).toBe(1) // minimum 1
  })

  it('pulleyBracket: creates bracket with correct height between arm and pulley', () => {
    const bracket = buildPulleyBracket([0, 1.55, 0], [0, 1.45, 0])
    expect(bracket.id).toBe('pulley_bracket')
    expect(bracket.size[0]).toBe(0.035) // width
    expect(bracket.size[1]).toBeCloseTo(0.1, 5) // height = 1.55 - 1.45, account for floating point
    expect(bracket.size[2]).toBe(0.035) // depth
    expect(bracket.motion).toBe('static')
  })

  it('slideHanger: snaps position to 1 cm marks and clamps within beam bounds', () => {
    const beam = buildMetreRule('beam', 'Beam', [0, 0.6, 0])
    const hanger = buildSlottedHanger('hanger', 'Hanger', [0, 0.6, 0], 1.0, 0.15)
    const link = hanger.stringLink(beam)

    // Slide to 0.305 m (should snap to 0.31 m per Math.round behavior)
    const slid = slideHanger(beam, hanger.hanger, link, 0.305)
    expect(slid.link.pivotA!).toEqual([0.31, 0, 0])
    expect(slid.hanger.position[0]).toBeCloseTo(0.31, 5)

    // Slide to -0.425 m (should snap to -0.43 m and clamp within beam bounds)
    const slid2 = slideHanger(beam, hanger.hanger, link, -0.425)
    expect(slid2.link.pivotA![0]).toBeLessThanOrEqual(0.48) // clamped within beam
    expect(slid2.link.pivotA![0]).toBeGreaterThanOrEqual(-0.48)
  })
})

describe('SB59: real lever on knife edge', () => {
  it('lever balanced (2 kg × 0.30 m = 3 kg × 0.20 m): beam stays within 0.5° of level for 5 s at 240 Hz', async () => {
    const preset = presetById('seesaw')!
    const built = preset.build()

    // Verify the preset is set up with the correct masses and positions
    const beam = built.bodies.find((b) => b.name === 'Beam')!
    const leftHanger = built.bodies.find((b) => b.name === 'Left hanger')!
    const rightHanger = built.bodies.find((b) => b.name === 'Right hanger')!
    const leftLink = built.links!.find((l) => l.b === leftHanger.id)!
    const rightLink = built.links!.find((l) => l.b === rightHanger.id)!

    expect(leftHanger.mass).toBe(2.0)
    expect(rightHanger.mass).toBe(3.0)
    expect(leftLink.pivotA![0]).toBe(-0.30) // left at -0.30 m
    expect(rightLink.pivotA![0]).toBe(0.20) // right at +0.20 m

    const world = await SimWorld.create({ ...DEFAULT_WORLD, ...(built.world ?? {}), stepRate: 240, twoD: true })
    world.rebuild(built.bodies, built.links ?? [])

    let worstTilt = 0
    // Check initial state at t=0
    let st = world.state(beam.id)!
    let tilt = Math.abs(tiltDeg(st))
    if (tilt > worstTilt) worstTilt = tilt

    // Step through 5 s (5 * 240 = 1200 steps)
    for (let i = 0; i < 5 * 240; i++) {
      world.stepOnce()
      st = world.state(beam.id)!
      tilt = Math.abs(tiltDeg(st))
      if (tilt > worstTilt) worstTilt = tilt
    }

    world.destroy()
    // Stays within 0.5 degrees of level
    expect(worstTilt).toBeLessThan(0.5)
  })

  it('lever unbalanced (3 kg moved to 0.30 m): turns to 3 kg side, angular acceleration matches τ/I within 5 %', async () => {
    const preset = presetById('seesaw')!
    const built = preset.build()

    // Move the 3 kg right hanger from 0.20 m to 0.30 m using slideHanger helper
    const beam = built.bodies.find((b) => b.name === 'Beam')!
    const rightHanger = built.bodies.find((b) => b.name === 'Right hanger')!
    const rightLink = built.links!.find((l) => l.b === rightHanger.id)!

    const { hanger: movedHanger, link: movedLink } = slideHanger(beam, rightHanger, rightLink, 0.30)
    const bodies = built.bodies.map((b) => (b.id === rightHanger.id ? movedHanger : b))
    const links = built.links!.map((l) => (l.id === rightLink.id ? movedLink : l))

    const world = await SimWorld.create({ ...DEFAULT_WORLD, ...(built.world ?? {}), stepRate: 240, twoD: true })
    world.rebuild(bodies, links)

    // How I is computed:
    // The beam is a uniform rod of length L = 1.0 m, mass M = 0.15 kg, rotating about its centre:
    //   I_beam = (1/12) * M * L^2 = (1/12) * 0.15 * 1.0 = 0.0125 kg·m²
    // The two hanging masses act at the hook points (dL = 0.30 m, dR = 0.30 m), contributing as point masses:
    //   I_left = mL * dL^2 = 2.0 * 0.30^2 = 0.18 kg·m²
    //   I_right = mR * dR^2 = 3.0 * 0.30^2 = 0.27 kg·m²
    // Total moment of inertia about the pivot:
    //   I_total = I_beam + I_left + I_right = 0.0125 + 0.18 + 0.27 = 0.4625 kg·m²
    // Net torque at t = 0 (horizontal):
    //   τ = (mR * dR - mL * dL) * g = (3.0 * 0.30 - 2.0 * 0.30) * 9.81 = 0.30 * 9.81 = 2.943 N·m
    // Theoretical initial angular acceleration:
    //   α_expected = τ / I_total = 2.943 / 0.4625 ≈ 6.3632 rad/s²
    const g = 9.81
    const beamMass = beam.mass
    const beamLength = beam.size[0]
    const mL = 2.0
    const mR = 3.0
    const dL = 0.30
    const dR = 0.30

    const I_beam = (1 / 12) * beamMass * (beamLength ** 2)
    const I_total = I_beam + mL * (dL ** 2) + mR * (dR ** 2)
    const tau = (mR * dR - mL * dL) * g
    const alpha_expected = tau / I_total

    // Record baseline angle at t=0
    let st = world.state(beam.id)!
    const initialAngle = tiltDeg(st)

    // Step 10 steps (10 / 240 s ≈ 0.0417 s) near t ≈ 0 to measure initial angular acceleration
    const steps = 10
    for (let i = 0; i < steps; i++) {
      world.stepOnce()
    }

    st = world.state(beam.id)!
    const dt = steps / 240
    // Negative angular velocity about z means turning clockwise (right side down)
    expect(st.angularVelocity[2]).toBeLessThan(0)

    const alpha_measured = Math.abs(st.angularVelocity[2]) / dt
    const errorFraction = Math.abs(alpha_measured - alpha_expected) / alpha_expected
    expect(errorFraction).toBeLessThan(0.05)

    // Verify the beam actually turns within 0.5 s (contract requirement, from t=0)
    let beamTurnedBy05s = false
    // Continue stepping until 0.5 s total (we've already stepped 10 steps, need 0.5*240 - 10 more)
    const stepsTo05s = Math.ceil(0.5 * 240) - steps
    for (let i = 0; i < stepsTo05s && !beamTurnedBy05s; i++) {
      world.stepOnce()
      const st2 = world.state(beam.id)!
      const currentAngle = tiltDeg(st2)
      // Check that beam has turned toward 3 kg side (negative angle, since we're tilting right)
      if (currentAngle < initialAngle - 0.01) {
        beamTurnedBy05s = true
      }
    }
    expect(beamTurnedBy05s).toBe(true)
  })

  it('hangers never fall off: run 10 s tipped fully, strings stay attached within string length', async () => {
    const preset = presetById('seesaw')!
    const built = preset.build()

    // Create an unbalanced setup so the beam tips fully
    const beam = built.bodies.find((b) => b.name === 'Beam')!
    const leftHanger = built.bodies.find((b) => b.name === 'Left hanger')!
    const rightHanger = built.bodies.find((b) => b.name === 'Right hanger')!
    const leftLink = built.links!.find((l) => l.b === leftHanger.id)!
    const rightLink = built.links!.find((l) => l.b === rightHanger.id)!

    // 0.5 kg on left, 4 kg on right
    leftHanger.mass = 0.5
    rightHanger.mass = 4.0

    const world = await SimWorld.create({ ...DEFAULT_WORLD, ...(built.world ?? {}), stepRate: 240, twoD: true })
    world.rebuild(built.bodies, built.links ?? [])

    const stringLenL = leftLink.length
    const stringLenR = rightLink.length
    const pivotAL = leftLink.pivotA
    const pivotAR = rightLink.pivotA

    // Assert that pivot points are defined (should not use defaults)
    expect(pivotAL).toBeDefined()
    expect(pivotAR).toBeDefined()

    if (!pivotAL || !pivotAR) {
      world.destroy()
      throw new Error('Pivot points must be defined in string links')
    }

    let maxExcessL = 0
    let maxExcessR = 0
    let worstTilt = 0

    for (let i = 0; i < 10 * 240; i++) {
      world.stepOnce()
      const bSt = world.state(beam.id)!
      const lSt = world.state(leftHanger.id)!
      const rSt = world.state(rightHanger.id)!

      const hookL: V3 = [
        bSt.position[0] + rotateVec(bSt.rotation, pivotAL)[0],
        bSt.position[1] + rotateVec(bSt.rotation, pivotAL)[1],
        0
      ]

      const hookR: V3 = [
        bSt.position[0] + rotateVec(bSt.rotation, pivotAR)[0],
        bSt.position[1] + rotateVec(bSt.rotation, pivotAR)[1],
        0
      ]

      const distL = dist(hookL, lSt.position)
      const distR = dist(hookR, rSt.position)

      if (distL - stringLenL > maxExcessL) maxExcessL = distL - stringLenL
      if (distR - stringLenR > maxExcessR) maxExcessR = distR - stringLenR

      const tilt = Math.abs(tiltDeg(bSt))
      if (tilt > worstTilt) worstTilt = tilt
    }

    world.destroy()
    // Verify the beam actually tipped fully (more than 45 degrees to show it "tipped")
    expect(worstTilt).toBeGreaterThan(45)
    // Neither hanger leaves its hook point by more than the string length
    expect(maxExcessL).toBeLessThan(0.005)
    expect(maxExcessR).toBeLessThan(0.005)
  })
})

describe('SB59: real Atwood machine', () => {
  it('measured acceleration matches 0.467 m/s² within 1 % at 240 Hz from distance after 1 s and 2 s', async () => {
    const preset = presetById('atwood')!
    const built = preset.build()

    const world = await SimWorld.create({ ...DEFAULT_WORLD, ...(built.world ?? {}), stepRate: 240, twoD: true })
    world.rebuild(built.bodies, built.links ?? [])

    const m1 = built.bodies.find((b) => b.name === 'm₁')!
    const m2 = built.bodies.find((b) => b.name === 'm₂')!

    // Get baseline positions from world state at t=0 (after rebuild)
    const st1_0 = world.state(m1.id)!
    const st2_0 = world.state(m2.id)!
    const y1_0 = st1_0.position[1]
    const y2_0 = st2_0.position[1]

    // Fixed apparatus body IDs that should never collide with moving masses
    const fixedBodyIds = new Set(['retort_base', 'retort_rod', 'retort_clamp', 'retort_arm', 'rule', 'pulley_bracket'])

    // Verify all fixed body IDs exist in built bodies
    for (const id of fixedBodyIds) {
      expect(built.bodies.some((b) => b.id === id)).toBe(true)
    }

    const fixedBodyCollisions: unknown[] = []

    world.onAfterStep((_w, ev) => {
      if (ev.contacts && ev.contacts.length > 0) {
        for (const contact of ev.contacts) {
          // Check if either body in the contact is a fixed apparatus part
          if (fixedBodyIds.has(contact.a) || fixedBodyIds.has(contact.b)) {
            fixedBodyCollisions.push(contact)
          }
        }
      }
    })

    let d1_1s = 0
    let d2_1s = 0
    let d1_2s = 0
    let d2_2s = 0

    for (let i = 1; i <= 2 * 240; i++) {
      world.stepOnce()
      if (i === 240) {
        const s1 = world.state(m1.id)!
        const s2 = world.state(m2.id)!
        d1_1s = s1.position[1] - y1_0
        d2_1s = y2_0 - s2.position[1]
      }
      if (i === 2 * 240) {
        const s1 = world.state(m1.id)!
        const s2 = world.state(m2.id)!
        d1_2s = s1.position[1] - y1_0
        d2_2s = y2_0 - s2.position[1]
      }
    }

    world.destroy()

    // Verify setup: 0.50 kg and 0.55 kg with 9.81 m/s² gravity
    expect(m1.mass).toBe(0.50)
    expect(m2.mass).toBe(0.55)

    const a_expected = 0.467142857 // g * (0.55 - 0.50) / (0.55 + 0.50)
    const a_1s = 2 * d2_1s / (1 * 1)
    const a_2s = 2 * d2_2s / (2 * 2)

    // Acceleration matches 0.467 m/s² within 1 % at 1 s and 2 s
    expect(Math.abs(a_1s - a_expected) / a_expected).toBeLessThan(0.01)
    expect(Math.abs(a_2s - a_expected) / a_expected).toBeLessThan(0.01)

    // Both masses move the same distance in opposite directions within 1 mm
    expect(Math.abs(d1_1s - d2_1s)).toBeLessThan(0.001)
    expect(Math.abs(d1_2s - d2_2s)).toBeLessThan(0.001)

    // The decorative stand, rule and bracket never collide with moving masses
    expect(fixedBodyCollisions.length).toBe(0)
  })
})
