export interface Thermal {
  /** J/(kg K) */
  specificHeat: number
  /** W/(m K) */
  conductivity: number
  /** 1/K, linear */
  expansion: number
  /** 0..1 */
  emissivity: number
}

export const THERMAL: Record<string, Thermal> = {
  steel: { specificHeat: 490, conductivity: 50, expansion: 12e-6, emissivity: 0.3 },
  aluminium: { specificHeat: 900, conductivity: 205, expansion: 23e-6, emissivity: 0.1 },
  wood: { specificHeat: 1700, conductivity: 0.15, expansion: 5e-6, emissivity: 0.9 },
  rubber: { specificHeat: 2000, conductivity: 0.16, expansion: 80e-6, emissivity: 0.95 },
  glass: { specificHeat: 840, conductivity: 1.0, expansion: 9e-6, emissivity: 0.92 },
  concrete: { specificHeat: 880, conductivity: 1.4, expansion: 12e-6, emissivity: 0.9 },
  ice: { specificHeat: 2100, conductivity: 2.2, expansion: 51e-6, emissivity: 0.97 },
  plastic: { specificHeat: 1900, conductivity: 0.2, expansion: 100e-6, emissivity: 0.9 },
  cork: { specificHeat: 2000, conductivity: 0.04, expansion: 50e-6, emissivity: 0.9 },
  lead: { specificHeat: 130, conductivity: 35, expansion: 29e-6, emissivity: 0.3 },
  foam: { specificHeat: 1400, conductivity: 0.03, expansion: 100e-6, emissivity: 0.9 }
}

export const THERMAL_NOTE = 'Rounded handbook values, to be checked by a teacher.'

export function thermalOf(materialId: string): Thermal {
  return THERMAL[materialId] ?? THERMAL['steel']!
}

export function temperatureRise(heatJ: number, massKg: number, materialId: string): number {
  const thermal = thermalOf(materialId)
  return heatJ / (massKg * thermal.specificHeat)
}
