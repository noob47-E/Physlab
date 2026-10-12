import { describe, it, expect } from 'vitest'
import { MATERIALS } from '../src/renderer/src/sim/materials'
import { Thermal, THERMAL, THERMAL_NOTE, thermalOf, temperatureRise } from '../src/renderer/src/sim/thermal'

describe('thermal', () => {
  it('exports THERMAL_NOTE', () => {
    expect(THERMAL_NOTE).toBeDefined()
  })

  it('has valid thermal properties for every material', () => {
    for (const material of MATERIALS) {
      const thermal: Thermal | undefined = THERMAL[material.id]
      expect(thermal).toBeDefined()
      expect(thermal!.specificHeat).toBeGreaterThan(0)
      expect(thermal!.conductivity).toBeGreaterThan(0)
      expect(thermal!.expansion).toBeGreaterThan(0)
      expect(thermal!.emissivity).toBeGreaterThan(0)
      expect(thermal!.emissivity).toBeLessThanOrEqual(1)
    }
  })

  it('calculates temperature rise correctly', () => {
    // temperatureRise(90, 5, 'wood') = 0.010588 (1e-6)
    const riseWood = temperatureRise(90, 5, 'wood')
    expect(riseWood).toBeCloseTo(0.010588, 6)

    // temperatureRise(33.4e3, 0.1, 'ice') = 33.4e3 / (0.1 × 2100) = 159.0476 K (c of ice 2100 J/(kg K))
    const riseIce = temperatureRise(33.4e3, 0.1, 'ice')
    expect(riseIce).toBeCloseTo(159.0476, 3)
  })

  it('falls back to steel for unknown material', () => {
    const unknownThermal = thermalOf('unknown')
    const steelThermal = thermalOf('steel')
    expect(unknownThermal).toEqual(steelThermal)
  })

  it('calculates linear expansion correctly', () => {
    // a 1 m steel rod warmed by 50 K grows by 1 × 12e-6 × 50 = 0.0006 m (expansion × length × ΔT, 1e-9)
    const steelThermal = thermalOf('steel')
    const length = 1
    const deltaT = 50
    const expansion = length * steelThermal.expansion * deltaT
    expect(expansion).toBeCloseTo(0.0006, 9)
  })
})
