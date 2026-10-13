import { describe, test, expect } from 'vitest'
import {
  SIGMA,
  HeatBody,
  HeatLink,
  heatStep,
  sharedTemperature,
  timeConstant,
  newtonCooling,
  radiatedPower,
  leadShotRise
} from '../src/renderer/src/sim/heatModel'

describe('pure heat model', () => {
  test('constants and interfaces are defined', () => {
    expect(SIGMA).toBe(5.670374419e-8)
    const dummyBody: HeatBody = { id: 'a', capacity: 1, T: 1, hA: 1, emissivity: 1, area: 1 }
    const dummyLink: HeatLink = { a: 'a', b: 'b', G: 1 }
    expect(dummyBody).toBeDefined()
    expect(dummyLink).toBeDefined()
  })

  test('literals from brief', () => {
    // shared 51.277 °C
    const tShared = sharedTemperature(490, 80, 900*0.5, 20)
    expect(tShared).toBeCloseTo(51.277, 3)
    
    // time constant τ = 46.91 s
    const tc = timeConstant(490, 450, 5)
    expect(tc).toBeCloseTo(46.91, 2)
    
    // stepping heatStep at dt = 0.1 s for 300 s ends within 0.05 °C of 51.277, and the total heat C₁T₁ + C₂T₂ is kept to 1e-9 relative
    let bodies: HeatBody[] = [
      { id: '1', capacity: 490, T: 80, hA: 0, emissivity: 0, area: 0 },
      { id: '2', capacity: 450, T: 20, hA: 0, emissivity: 0, area: 0 }
    ]
    const links: HeatLink[] = [{ a: '1', b: '2', G: 5 }]
    const initialHeat = bodies[0].capacity * bodies[0].T + bodies[1].capacity * bodies[1].T
    for (let i = 0; i < 3000; i++) {
      bodies = heatStep(bodies, links, 20, 0.1)
    }
    
    expect(Math.abs(bodies[0].T - 51.276596)).toBeLessThan(0.05)
    const exactAlum = 51.276596 + (20 - 51.276596) * Math.exp(-300 / 46.914894)
    expect(bodies[1].T).toBeCloseTo(exactAlum, 4)
    const exactSteel = 51.276596 + (80 - 51.276596) * Math.exp(-300 / 46.914894)
    expect(bodies[0].T).toBeCloseTo(exactSteel, 4)

    const finalHeat = bodies[0].capacity * bodies[0].T + bodies[1].capacity * bodies[1].T
    expect(Math.abs(finalHeat - initialHeat) / initialHeat).toBeLessThan(1e-9)

    // 0.25 kg of water (c 4186) at 80 °C, hA = 1 W/K, emissivity 0, room 20 °C: newtonCooling after 600 s = 53.82 °C (0.01)
    const cWater = 0.25 * 4186
    const waterT = newtonCooling(80, 20, cWater, 1, 600)
    expect(waterT).toBeCloseTo(53.82, 2)
    
    let waterBody: HeatBody[] = [{ id: 'w', capacity: cWater, T: 80, hA: 1, emissivity: 0, area: 0 }]
    for (let i = 0; i < 600; i++) {
      waterBody = heatStep(waterBody, [], 20, 1)
    }
    expect(Math.abs(waterBody[0].T - waterT)).toBeLessThan(0.001)

    // a black (emissivity 1) 0.1 m² body at 80 °C in a 20 °C room radiates 46.32 W (0.01)
    const pRad = radiatedPower(1, 0.1, 80, 20)
    expect(pRad).toBeCloseTo(46.32, 2)
    
    // leadShotRise(50, 1, 9.81, 130) = 3.773 K (1e-3)
    const dTl = leadShotRise(50, 1, 9.81, 130)
    expect(dTl).toBeCloseTo(3.773, 3)
    
    // 90 J into a 5 kg wooden crate (c 1700) raises it 0.0106 K
    const cWood = 5 * 1700
    const heatInRes = heatStep([{ id: 'crate', capacity: cWood, T: 20, hA: 0, emissivity: 0, area: 0 }], [], 20, 1, { crate: 90 })
    expect(heatInRes[0].T - 20).toBeCloseTo(0.0106, 4)
  })

  test('MUST 1: Linked-body step cutoff is tight enough for pair mode', () => {
    // 2 bodies, each capacity = 1, T1 = 100, T2 = 0, hA = 0, emissivity = 0, area = 0
    // dt = 1/60, G = 30
    const G = 30
    const dt = 1 / 60
    const bodies = heatStep(
      [
        { id: '1', capacity: 1, T: 100, hA: 0, emissivity: 0, area: 0 },
        { id: '2', capacity: 1, T: 0, hA: 0, emissivity: 0, area: 0 }
      ],
      [{ a: '1', b: '2', G }],
      20,
      dt
    )
    
    // The pair mode decays at 2G / C = 60 per second, so the exact difference after dt is 100 e^(-60 dt) = 100 e^(-1).
    // The step's own error at this stiffness is 0.015 C (the RK4 step with the cut substeps), so the tolerance
    // is 0.02 C: a check against the exact answer, not a copy of the RK4 arithmetic.
    const exactT1 = 50 + 50 * Math.exp(-2 * G * dt)
    expect(Math.abs(bodies[0].T - exactT1)).toBeLessThan(0.02)
    expect(Math.abs(bodies[1].T - (100 - exactT1))).toBeLessThan(0.02)
  })

  test('MUST 3: Stiff link correctly resolves substeps and checks 0.05s endpoint explicitly', () => {
    // 2 bodies, each 1 J/K, 100 °C and 0 °C, one link G = 10 W/K, dt = 1 s.
    const bodiesInit: HeatBody[] = [
      { id: '1', capacity: 1, T: 100, hA: 0, emissivity: 0, area: 0 },
      { id: '2', capacity: 1, T: 0, hA: 0, emissivity: 0, area: 0 }
    ]
    const links: HeatLink[] = [{ a: '1', b: '2', G: 10 }]
    
    const step05 = heatStep(bodiesInit, links, 20, 0.05)
    // Exact: the pair mode decays at 2G / C = 20 per second, so after 0.05 s the difference is 100 e^(-1).
    // The stepped value is within 0.015 C of it at this stiffness (the step's own error), so the tolerance is 0.02 C.
    const exact05 = 50 + 50 * Math.exp(-20 * 0.05)
    expect(Math.abs(step05[0].T - exact05)).toBeLessThan(0.02)
    expect(Math.abs(step05[1].T - (100 - exact05))).toBeLessThan(0.02)
    
    const step1s = heatStep(bodiesInit, links, 20, 1)
    expect(Math.abs(step1s[0].T - 50.000)).toBeLessThan(0.01)
    expect(Math.abs(step1s[1].T - 50.000)).toBeLessThan(0.01)
  })

  test('MUST 4: heatIn correctly scales source rate with total step dt (substepping bug)', () => {
    // one body, capacity = 10, T = 20, hA = 600, heatIn = 90 J, dt = 0.1 s.
    const bodies = heatStep(
      [{ id: '1', capacity: 10, T: 20, hA: 600, emissivity: 0, area: 0 }],
      [],
      20,
      0.1,
      { '1': 90 }
    )
    const exactT = 20 + 1.5 * (1 - Math.exp(-6))
    expect(bodies[0].T).toBeCloseTo(exactT, 2)
  })
})
