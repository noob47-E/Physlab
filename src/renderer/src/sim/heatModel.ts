export const SIGMA = 5.670374419e-8

export interface HeatBody {
  id: string
  capacity: number
  T: number
  hA: number
  emissivity: number
  area: number
}

export interface HeatLink {
  a: string
  b: string
  G: number
}

export function sharedTemperature(c1: number, T1: number, c2: number, T2: number): number {
  return (c1 * T1 + c2 * T2) / (c1 + c2)
}

export function timeConstant(c1: number, c2: number, G: number): number {
  return (c1 * c2) / (G * (c1 + c2))
}

export function newtonCooling(T0: number, room: number, C: number, hA: number, t: number): number {
  return room + (T0 - room) * Math.exp((-t * hA) / C)
}

export function radiatedPower(emissivity: number, area: number, Tc: number, roomC: number): number {
  const TK = Tc + 273.15
  const roomK = roomC + 273.15
  return emissivity * SIGMA * area * (Math.pow(TK, 4) - Math.pow(roomK, 4))
}

export function leadShotRise(turns: number, heightM: number, g: number, c: number): number {
  return (turns * g * heightM) / c
}

export function heatStep(
  bodies: HeatBody[],
  links: HeatLink[],
  roomC: number,
  dt: number,
  heatIn?: Record<string, number>
): HeatBody[] {
  // First, find the maximum "slope" for any body to determine the number of substeps.
  let maxSlope = 0
  
  // Calculate sum of G and 1/C for each body from links
  const gSum: Record<string, number> = {}
  for (const link of links) {
    gSum[link.a] = (gSum[link.a] || 0) + link.G
    gSum[link.b] = (gSum[link.b] || 0) + link.G
  }

  // To fix MUST 1: The true mode for a link between 1 and 2 has slope G(1/C1 + 1/C2). 
  // The step is cut so that the largest slope times the step stays under 0.5 (RK4 is stable well past
  // that; 0.5 keeps it accurate). The slopes are the Jacobian's: row i has diagonal -(hA + rad + sum G) / C_i
  // and off-diagonals G / C_i, so by Gershgorin's circle theorem every eigenvalue's magnitude is at most
  // (hA + rad + sum G) / C_i + sum G / C_i = (hA + rad + 2 sum G) / C_i. The factor 2 is the pair mode:
  // two bodies on one link, C1 = C2 = 1, hA = 0, rad = 0, have the mode 2G, and the bound gives exactly 2G.
  for (const b of bodies) {
    const radSlope = b.emissivity > 0 ? 4 * b.emissivity * SIGMA * b.area * Math.pow(b.T + 273.15, 3) : 0
    const sumG = gSum[b.id] || 0
    const slope = (b.hA + radSlope + 2 * sumG) / b.capacity
    if (slope > maxSlope) maxSlope = slope
  }
  
  const n = Math.ceil((maxSlope * dt) / 0.5) || 1
  const dtSub = dt / n

  // We map bodies to an array of temperatures for fast RK4
  let T = bodies.map(b => b.T)
  
  for (let step = 0; step < n; step++) {
    const k1 = getDerivatives(bodies, T, links, roomC, heatIn, dt)
    
    const T2 = T.map((t, i) => t + k1[i] * dtSub * 0.5)
    const k2 = getDerivatives(bodies, T2, links, roomC, heatIn, dt)
    
    const T3 = T.map((t, i) => t + k2[i] * dtSub * 0.5)
    const k3 = getDerivatives(bodies, T3, links, roomC, heatIn, dt)
    
    const T4 = T.map((t, i) => t + k3[i] * dtSub)
    const k4 = getDerivatives(bodies, T4, links, roomC, heatIn, dt)
    
    T = T.map((t, i) => t + (dtSub / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]))
  }

  return bodies.map((b, i) => ({ ...b, T: T[i] }))
}

function getDerivatives(
  bodies: HeatBody[],
  T: number[],
  links: HeatLink[],
  roomC: number,
  heatIn: Record<string, number> | undefined,
  dt: number // Need total dt to convert J to W
): number[] {
  const dT = new Float64Array(bodies.length)
  
  // Link heat transfer
  for (const link of links) {
    const i = bodies.findIndex(b => b.id === link.a)
    const j = bodies.findIndex(b => b.id === link.b)
    if (i >= 0 && j >= 0) {
      const q = link.G * (T[j] - T[i])
      dT[i] += q
      dT[j] -= q
    }
  }
  
  // Individual body transfers
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i]
    
    // Newton cooling
    if (b.hA > 0) {
      dT[i] -= b.hA * (T[i] - roomC)
    }
    
    // Radiation
    if (b.emissivity > 0 && b.area > 0) {
      dT[i] -= radiatedPower(b.emissivity, b.area, T[i], roomC)
    }
    
    // External heat (J this step) -> Fix for MUST 4: rate is heatIn / dt
    if (heatIn && heatIn[b.id]) {
      dT[i] += heatIn[b.id] / dt
    }
    
    // Divide by capacity to get temperature derivative
    dT[i] /= b.capacity
  }
  
  return Array.from(dT)
}
