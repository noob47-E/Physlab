import { fmtLabel } from '../math/format'

function padTo2(val: number): string {
  let s = fmtLabel(val, 2)
  if (!s.includes('.')) s += '.00'
  else if (s.split('.')[1].length === 1) s += '0'
  return s
}


export function freeFallEnergyLoss(g: number, rate: number): number {
  return 0.5 * g * g * (1 / rate)
}

export function flightTimeShortfall(vy: number, launchH: number, landingH: number, g: number, rate: number): number {
  // exact continuous flight time
  const det = vy * vy - 2 * g * (landingH - launchH)
  if (det < 0) return 0
  const T = (vy + Math.sqrt(det)) / g
  if (T === 0) return 0
  
  const vyLand = vy - g * T
  if (vyLand === 0) return 1 / rate
  
  return (1 / rate) * g * T / (2 * Math.abs(vyLand))
}

export function flightRangeShortfall(vx: number, vy: number, launchH: number, landingH: number, g: number, rate: number): number {
  return vx * flightTimeShortfall(vy, launchH, landingH, g, rate)
}

export function flightTop(vy: number, g: number, rate: number): number {
  
  const vTop = vy - g * (1 / rate) / 2
  if (vTop <= 0) return 0
  return (vTop * vTop) / (2 * g)
}

export function springBand(k: number, mReduced: number, rate: number): number {
  const omega = Math.sqrt(k / mReduced)
  const h = omega * (1 / rate)
  if (h >= 2) return Infinity // Unbounded
  return (h / 2) / (1 - h / 2)
}

export function springAccurate(k: number, mReduced: number, rate: number): boolean {
  const omega = Math.sqrt(k / mReduced)
  return omega * (1 / rate) < 1
}

export function springBounded(k: number, mReduced: number, rate: number): boolean {
  const omega = Math.sqrt(k / mReduced)
  return omega * (1 / rate) < 2
}

export function engineSpringKeep(k: number, m: number, rate: number): number {
  const omega = Math.sqrt(k / m)
  return Math.pow(1 + omega * omega * (1 / rate) * (1 / rate), -0.5)
}

export function rateSentence(rate: number, g: number): string {
  const energyLoss = padTo2(freeFallEnergyLoss(g, rate))
  
  const vx = 14 * Math.cos(30 * Math.PI / 180)
  const vy = 14 * Math.sin(30 * Math.PI / 180)
  const shortfallCm = fmtLabel(flightRangeShortfall(vx, vy, 0, 0, g, rate) * 100, 1)
  
  return `At ${rate} steps a second, a free fall loses ${energyLoss} J for every kg each second to the step, not to physics, and a 14 m/s throw at 30° lands ${shortfallCm} cm short.`
}

export function gapSentence(kind: 'flight' | 'fall' | 'spring', values: number[], rate: number): string {
  const dtText = `1/${rate}`
  
  if (kind === 'flight') {
    // values = [vx, launchH, landingH, vy, g]
    const vx = values[0]
    const launchH = values[1]
    const landingH = values[2]
    const vy = values[3]
    const g = values[4]

    // A flight shorter than four steps is not measured by the step formula (delta = dt g T / (2 |v_land|)
    // is first order in dt / T): the stepped path lands on its first step. So no number is given there
    // (the wave head's choice (a), Tue 13 Oct 07:30).
    const det = vy * vy - 2 * g * (landingH - launchH)
    if (det >= 0 && (vy + Math.sqrt(det)) / g < 4 / rate) {
      return 'This flight lasts fewer than four steps, so the step size decides it; choose 600 steps a second to see it closely.'
    }

    const delta = flightTimeShortfall(vy, launchH, landingH, g, rate)
    const shortfallCm = fmtLabel(vx * delta * 100, 1)
    return `the ${dtText} s step: it lands v₀ₓδ = ${shortfallCm} cm short`
  }
  
  if (kind === 'fall') {
    // values = [g]
    const g = values[0]
    const energyLoss = padTo2(freeFallEnergyLoss(g, rate))
    return `the ${dtText} s step: ${energyLoss} J per kg each second`
  }
  
  if (kind === 'spring') {
    // values = [k, mReduced]
    const k = values[0]
    const m = values[1]
    const band = fmtLabel(springBand(k, m, rate) * 100, 1)
    return `the step's own wobble, within ±${band} %, with no drift`
  }
  
  return ''
}
