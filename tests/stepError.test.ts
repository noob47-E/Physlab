import { describe, expect, it } from 'vitest'
import {
  freeFallEnergyLoss,
  flightTimeShortfall,
  flightRangeShortfall,
  flightTop,
  springBand,
  springAccurate,
  springBounded,
  engineSpringKeep,
  rateSentence,
  gapSentence
} from '../src/renderer/src/sim/stepError'

describe('stepError', () => {
  it('freeFallEnergyLoss', () => {
    expect(freeFallEnergyLoss(9.81, 60)).toBeCloseTo(0.80197, 5)
    expect(freeFallEnergyLoss(9.81, 120)).toBeCloseTo(0.40098, 5)
    expect(freeFallEnergyLoss(9.81, 240)).toBeCloseTo(0.20049, 5)
    expect(freeFallEnergyLoss(9.81, 600)).toBeCloseTo(0.08020, 5)
  })

  it('flightRangeShortfall', () => {
    // A 14 m/s 60° launch, lands at same height
    // vx = 14 * cos(60) = 7, vy = 14 * sin(60) = 12.12435565
    // exact vx * T = 7 * (2 * 12.12435565 / 9.81) = 17.30289
    // expected drop at 120Hz = 0.058333 (1e-6)
    expect(flightRangeShortfall(7, 12.1243556529, 0, 0, 9.81, 120)).toBeCloseTo(0.058333, 6)
  })
  
  it('a flight shorter than four steps gives no gap number (wave head choice (a), 07:30)', () => {
    // vx = 10, vy = 0.99 * 9.81 / 60 = 0.161865 m/s, same height, g = 9.81, rate = 60: the flight lasts
    // 2 vy / g = 0.033 s, under four steps (0.0667 s), so the step formula does not apply and gapSentence says so.
    expect(gapSentence('flight', [10, 0, 0, 0.161865, 9.81], 60)).toBe(
      'This flight lasts fewer than four steps, so the step size decides it; choose 600 steps a second to see it closely.'
    )
    // At 600 steps a second the same launch lasts 20 steps: a number is given again.
    expect(gapSentence('flight', [10, 0, 0, 0.161865, 9.81], 600)).toContain('v₀ₓδ = ')
  })
  
  it('flight shortfall unequal-height drop fix (Review 1 #2)', () => {
    // vx=10, vy=10, launchH=1.0, landingH=0, g=9.81, rate=60
    const delta = flightTimeShortfall(10, 1.0, 0, 9.81, 60)
    expect(delta).toBeCloseTo(0.01595, 5) // Should not be dt/2
  })
  
  it('flight shortfall normal drop', () => {
    const delta = flightTimeShortfall(0, 4.905, 0, 9.81, 60)
    expect(delta).toBeCloseTo(1/120, 8)
  })

  it('flightTop', () => {
    expect(flightTop(7, 9.81, 240)).toBeCloseTo(2.48288, 4)
    expect(flightTop(7, 9.81, 600)).toBeCloseTo(2.49162, 4)
    
    // downward launch should return 0 (Review 2 #2 fix)
    expect(flightTop(-1, 9.81, 60)).toBe(0)
    expect(flightTop(0.01, 9.81, 60)).toBe(0)
  })

  it('springBand', () => {
    // The prompt says springBand(50, 2, 60/120/240/600) = 0.041667, 0.020833, 0.010417, 0.004167 (1e-6)
    // Wait! Let's check what the new bound calculates for these values.
    // k=50, mReduced=2 => omega = 5
    // at rate 60, h = 5/60 = 1/12.
    // old springBand was h/2 = 1/24 = 0.041666666
    // new springBand is (h/2)/(1-h/2) = (1/24) / (23/24) = 1/23 = 0.043478
    // So the tests from the brief will fail with the new mathematically correct bound!
    // But the prompt says "Keep springBand = ωΔt/2 only if the test shows it holds."
    // Review 1 #3 shows it does NOT hold for h=0.9 (error is up to 81.8%).
    // And wave head did not object to fixing this. I should test the new formula on the specific h=0.9 case and check the brief cases with the new formula values.
    
    // k = (0.9*60)^2 = 2916, m = 1 => omega = 54 => h = 54/60 = 0.9
    // max wobble should be 0.818
    expect(springBand(2916, 1, 60)).toBeCloseTo(0.81818, 5)
    
    // We update the expected values for the brief test cases using the new formula:
    // 60: h=5/60 => (5/120) / (1 - 5/120) = 5/115 = 1/23 ≈ 0.043478
    // 120: h=5/120 => (5/240) / (1 - 5/240) = 5/235 = 1/47 ≈ 0.021276
    // 240: h=5/240 => (5/480) / (1 - 5/480) = 5/475 = 1/95 ≈ 0.010526
    // 600: h=5/600 => (5/1200) / (1 - 5/1200) = 5/1195 = 1/239 ≈ 0.004184
    expect(springBand(50, 2, 60)).toBeCloseTo(1/23, 6)
    expect(springBand(50, 2, 120)).toBeCloseTo(1/47, 6)
    expect(springBand(50, 2, 240)).toBeCloseTo(1/95, 6)
    expect(springBand(50, 2, 600)).toBeCloseTo(1/239, 6)
  })

  it('springAccurate and springBounded', () => {
    // springAccurate: omega * dt < 1
    expect(springAccurate(1e6, 1, 240)).toBe(false)
    expect(springAccurate(50, 2, 60)).toBe(true)
    
    // springBounded: omega * dt < 2
    expect(springBounded(2916, 1, 60)).toBe(true) // omega=54, rate=60 -> 0.9 < 2
  })

  it('engineSpringKeep', () => {
    const k = 50
    const m = 2
    const rate = 120
    const omega = Math.sqrt(k / m) // 5
    const swings = (2 * Math.PI / omega) * rate // (2PI/5)*120 = 48PI ~ 150.796 steps
    const keepPerStep = engineSpringKeep(k, m, rate)
    const keepPerSwing = Math.pow(keepPerStep, swings)
    expect(keepPerSwing).toBeCloseTo(0.8774, 3)
  })

  it('rateSentence', () => {
    const sent = rateSentence(240, 9.81)
    expect(sent).toContain('240 steps a second')
    expect(sent).toContain('0.20 J')
    expect(sent).toContain('5.1 cm')
    expect(sent).not.toContain('^')
    expect(sent).not.toContain('e-')
  })

  it('gapSentence flight', () => {
    // The Review 2 MUST 1 rule: assert the FULL string exactly as required!
    // For normal flight from the review test: 10m/s drop from 4.905m at 60Hz.
    // delta = 1/120. vx = 10. shortfall = 10 * (1/120) * 100 = 8.33 cm (fmtLabel -> 8.3 cm)
    // values = [vx, launchH, landingH, vy, g]
    const values = [10, 4.905, 0, 0, 9.81]
    const sent = gapSentence('flight', values, 60)
    expect(sent).toBe('the 1/60 s step: it lands v₀ₓδ = 8.3 cm short')
  })

  it('gapSentence fall', () => {
    const values = [9.81]
    const sent = gapSentence('fall', values, 240)
    expect(sent).toBe('the 1/240 s step: 0.20 J per kg each second')
  })

  it('gapSentence spring', () => {
    const values = [50, 2] // k, mReduced
    // new bound for 60Hz: 1/23 = 4.347... % => fmtLabel 1 gives 4.3%
    const sent = gapSentence('spring', values, 60)
    expect(sent).toBe("the step's own wobble, within ±4.3 %, with no drift")
  })
})

  it('flight simulation proves gap sentence (Wave Head SB30b)', () => {
    // Prove it with a test that steps a flight at 60 and 240 steps a second
    // with the same update rule and matches δ to 1 %.
    const simFlight = (vy: number, launchH: number, landingH: number, rate: number, g = 9.81) => {
      const dt = 1 / rate
      let y = launchH
      let v = vy
      let n = 0
      let prevY = y
      while (y > landingH || n === 0) {
        prevY = y
        v -= g * dt
        y += v * dt
        n++
        if (n > 10000) break
      }
      const alpha = (prevY - landingH) / (prevY - y)
      return (n - 1 + alpha) * dt
    }
    
    const exactFlight = (vy: number, launchH: number, landingH: number, g = 9.81) => {
      return (vy + Math.sqrt(vy * vy - 2 * g * (landingH - launchH))) / g
    }
    
    // Test for a drop from a height at 60Hz and 240Hz
    const testCases = [
      { rate: 60, vy: 0, launchH: 4.905, landingH: 0 },
      { rate: 240, vy: 0, launchH: 4.905, landingH: 0 },
      // Unequal height launch
      { rate: 60, vy: 10, launchH: 1.0, landingH: 0 },
      // Same height flight
      { rate: 120, vy: 7, launchH: 0, landingH: 0 }
    ]
    
    for (const tc of testCases) {
      const simT = simFlight(tc.vy, tc.launchH, tc.landingH, tc.rate)
      const exactT = exactFlight(tc.vy, tc.launchH, tc.landingH)
      const trueDelta = exactT - simT
      
      const formulaDelta = flightTimeShortfall(tc.vy, tc.launchH, tc.landingH, 9.81, tc.rate)
      
      // Match delta to 1% (ratio is between 0.99 and 1.01)
      const errorRatio = Math.abs((formulaDelta - trueDelta) / trueDelta)
      expect(errorRatio).toBeLessThan(0.01)
    }
  })
