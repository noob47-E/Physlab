export type LimitKey =
  | 'rigid'
  | 'maxRestitution'
  | 'frictionMix'
  | 'bounceThreshold'
  | 'slop'
  | 'speedCap'
  | 'spinCap'
  | 'spinDamping'
  | 'ropeMass'
  | 'softSpring'
  | 'smallSwing'
  | 'rollingModel'
  | 'airModel'
  | 'floatPrecision'

export const LIMITS: Record<LimitKey, { sentence: string; number?: string }> = {
  rigid: { sentence: "Bodies are rigid: a bounce takes no time at all." },
  maxRestitution: { sentence: "When two things hit, the bounce uses the larger of their two bounciness values." },
  frictionMix: { sentence: "Friction between two surfaces is the square root of their two friction values multiplied." },
  bounceThreshold: { sentence: "Below 1 m/s the engine does not bounce at all: a slow ball just stops.", number: "1 m/s" },
  slop: { sentence: "Bodies may sink up to 2 cm into each other before they are pushed apart.", number: "2 cm" },
  speedCap: { sentence: "Nothing moves faster than 500 m/s in this engine.", number: "500 m/s" },
  spinCap: { sentence: "Nothing spins faster than 47 rad/s (15π).", number: "47.1 rad/s" },
  spinDamping: { sentence: "New objects lose a little spin each second (spin damping 0.05), unless you set it to 0." },
  ropeMass: { sentence: "A rope has a small mass of its own (up to a tenth of its load), so a rope pendulum swings a few per cent fast." },
  softSpring: { sentence: "This spring is too stiff for the step rate, so the engine's own spring is used, and it loses energy every swing." },
  smallSwing: { sentence: "2π√(L/g) is the small-swing formula; a bigger swing takes longer." },
  rollingModel: { sentence: "Rolling resistance is PhysLab's simple model: a torque μᵣ m g r against the spin." },
  airModel: { sentence: "Air drag is ½ ρ C_d A v², with C_d for the shape (a sphere 0.47)." },
  floatPrecision: { sentence: "The engine counts in single precision: far from the centre (a few km) small moves are rounded." }
}

export interface SceneFacts {
  anyBounce: boolean;
  anySliding: boolean;
  anySpinDampingAboveZero: boolean;
  anyRope: boolean;
  anyEngineSpring: boolean;
  pendulumAmplitudeDeg: number | null;
  anyRolling: boolean;
  airDensity: number;
  maxSpeed: number;
  maxDistanceFromOrigin: number;
  slowestBounceSpeed: number | null;
}

export function limitsFor(f: SceneFacts): LimitKey[] {
  const keys: LimitKey[] = []

  if (f.anyBounce) {
    keys.push('rigid')
    keys.push('maxRestitution')
  }
  if (f.slowestBounceSpeed !== null && f.slowestBounceSpeed < 1.5) {
    keys.push('bounceThreshold')
  }
  if (f.anySliding) {
    keys.push('frictionMix')
  }
  if (f.anySpinDampingAboveZero) {
    keys.push('spinDamping')
  }
  if (f.anyRope) {
    keys.push('ropeMass')
  }
  if (f.anyEngineSpring) {
    keys.push('softSpring')
  }
  if (f.pendulumAmplitudeDeg !== null && f.pendulumAmplitudeDeg > 5) {
    keys.push('smallSwing')
  }
  if (f.anyRolling) {
    keys.push('rollingModel')
  }
  if (f.airDensity > 0) {
    keys.push('airModel')
  }
  if (f.maxSpeed > 400) {
    keys.push('speedCap')
  }
  if (f.maxDistanceFromOrigin > 1000) {
    keys.push('floatPrecision')
  }

  return keys
}
