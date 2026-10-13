/**
 * Physics formula predictions.
 * Computes textbook answers for Sandbox experiments.
 */

const DEG2RAD = Math.PI / 180;

/**
 * AGM (Arithmetic-Geometric Mean) for exact pendulum period.
 * @param a First number
 * @param b Second number
 * @returns AGM of a and b
 */
function agm(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  let x = a;
  let y = b;
  while (Math.abs(x - y) > 1e-15) {
    const nextX = (x + y) / 2;
    const nextY = Math.sqrt(x * y);
    x = nextX;
    y = nextY;
  }
  return x;
}

/**
 * Time and impact speed for an object in free fall from rest.
 */
export function freeFall(h: number, g: number): { time: number; speed: number } {
  return {
    time: Math.sqrt((2 * h) / g),
    speed: Math.sqrt(2 * g * h)
  };
}

/**
 * Range, max height, and flight time for a projectile launched and landing at the same height.
 */
export function projectile(v: number, angleDeg: number, g: number): { range: number; top: number; flightTime: number } {
  const theta = angleDeg * DEG2RAD;
  const sinTheta = Math.sin(theta);
  return {
    range: (v * v * Math.sin(2 * theta)) / g,
    top: (v * sinTheta) * (v * sinTheta) / (2 * g),
    flightTime: (2 * v * sinTheta) / g
  };
}

/**
 * Time and horizontal distance for a projectile launched horizontally from a height.
 */
export function horizontalLaunch(v: number, h: number, g: number): { time: number; distance: number } {
  const time = Math.sqrt((2 * h) / g);
  return {
    time,
    distance: v * time
  };
}

/**
 * Small-angle approximation for the period of a simple pendulum.
 */
export function pendulumSmall(L: number, g: number): number {
  return 2 * Math.PI * Math.sqrt(L / g);
}

/**
 * Exact period of a simple pendulum using the arithmetic-geometric mean.
 */
export function pendulumExact(L: number, g: number, amplitudeDeg: number): number {
  if (!Number.isFinite(amplitudeDeg)) return NaN;
  // The amplitude is the angle from the bottom, so 181 degrees is the same release as 179 on the other
  // side: reduce to 0 to 180 first (a release past the top swings back down the short way).
  const a = Math.abs(amplitudeDeg) % 360;
  const amp = Math.min(a, 360 - a);
  // Released exactly upright (180 degrees) the bob never starts to fall, so the period is infinite.
  // Just below 180 the period is finite (about 4 sqrt(L/g) ln(4/b)), so the cut-off is the angle itself,
  // not a small value of b (a fixed floor on b would call 179.9999999999 degrees infinite).
  if (amp >= 180) return Infinity;
  const b = Math.cos((amp * DEG2RAD) / 2);
  return (2 * Math.PI * Math.sqrt(L / g)) / agm(1, b);
}

/**
 * Series approximation for the period of a simple pendulum.
 */
export function pendulumSeries(L: number, g: number, amplitudeDeg: number): number {
  const theta0 = amplitudeDeg * DEG2RAD;
  return 2 * Math.PI * Math.sqrt(L / g) * (1 + (theta0 * theta0) / 16);
}

/**
 * Period of a mass on a spring.
 */
export function springPeriod(m: number, k: number): number {
  return 2 * Math.PI * Math.sqrt(m / k);
}

/**
 * Acceleration and tension in an Atwood machine.
 */
export function atwood(m1: number, m2: number, g: number): { a: number; tension: number } {
  const totalM = m1 + m2;
  return {
    a: (Math.abs(m2 - m1) * g) / totalM,
    tension: (2 * m1 * m2 * g) / totalM
  };
}

/**
 * Stopping distance of a sliding mass under kinetic friction.
 */
export function stoppingDistance(v: number, mu: number, g: number): number {
  return (v * v) / (2 * mu * g);
}

/**
 * Max heights of successive bounces for a dropped ball.
 */
export function bounceTops(h: number, e: number, n: number): number[] {
  const tops: number[] = [];
  let currentH = h;
  const eSq = e * e;
  for (let i = 0; i < n; i++) {
    currentH *= eSq;
    tops.push(currentH);
  }
  return tops;
}

/**
 * Cumulative times of successive contacts with the ground for a bouncing ball.
 */
export function bounceTimes(h: number, e: number, n: number, g: number): number[] {
  const t1 = Math.sqrt((2 * h) / g);
  if (e === 0) {
    // Ball lands once and stays
    return [t1];
  }
  
  const times: number[] = [t1];
  let currentT = t1;
  const v0 = Math.sqrt(2 * g * h);
  let currentV = v0 * e;
  
  for (let i = 1; i < n; i++) {
    const tFlight = (2 * currentV) / g;
    currentT += tFlight;
    times.push(currentT);
    currentV *= e;
  }
  return times;
}

/**
 * Terminal speed of a falling object under quadratic drag.
 */
export function terminalSpeed(m: number, rho: number, cd: number, area: number, g: number): number {
  if (rho === 0 || cd === 0 || area === 0) return Infinity;
  return Math.sqrt((2 * m * g) / (rho * cd * area));
}

/**
 * Time to fall a given height from rest under quadratic drag.
 */
export function dragFallTime(h: number, m: number, rho: number, cd: number, area: number, g: number): number {
  const vt = terminalSpeed(m, rho, cd, area, g);
  if (!isFinite(vt)) {
    return Math.sqrt((2 * h) / g); // No drag, so reduces to free fall
  }
  
  const x = (g * h) / (vt * vt);
  let acoshTerm: number;
  if (x > 50) {
    // Avoid exp(x) overflow to Infinity
    acoshTerm = x + Math.LN2;
  } else {
    acoshTerm = Math.acosh(Math.exp(x));
  }
  return (vt / g) * acoshTerm;
}

/**
 * Final speed of an object rolling down a height h.
 */
export function rollingSpeed(h: number, g: number, k: number): number {
  return Math.sqrt((2 * g * h) / (1 + k));
}

/**
 * Acceleration of a rolling object down a slope.
 */
export function rollingAcceleration(angleDeg: number, g: number, k: number): number {
  const theta = angleDeg * DEG2RAD;
  return (g * Math.sin(theta)) / (1 + k);
}

/**
 * Time for a rolling object to cover a distance down a slope from rest.
 */
export function rollingTime(distance: number, angleDeg: number, g: number, k: number): number {
  const a = rollingAcceleration(angleDeg, g, k);
  return Math.sqrt((2 * distance) / a);
}

/**
 * 1D collision outcome for two masses, keeping momentum and using restitution e.
 */
export function collision1D(m1: number, u1: number, m2: number, u2: number, e: number): { v1: number; v2: number } {
  const totalM = m1 + m2;
  const pTotal = m1 * u1 + m2 * u2;
  const sep = e * (u1 - u2);
  
  // m1 * v1 + m2 * v2 = pTotal
  // v2 - v1 = sep  =>  v2 = v1 + sep
  // m1 * v1 + m2 * (v1 + sep) = pTotal
  // v1 * totalM = pTotal - m2 * sep
  
  const v1 = (pTotal - m2 * sep) / totalM;
  const v2 = v1 + sep;
  
  return { v1, v2 };
}

/**
 * Final speed after a perfectly inelastic (sticky) 1D collision, assuming m2 was at rest.
 */
export function sticky(m1: number, u1: number, m2: number): number {
  return (m1 * u1) / (m1 + m2);
}

/**
 * Force and period for uniform circular motion.
 */
export function circular(m: number, v: number, r: number): { force: number; period: number } {
  return {
    force: (m * v * v) / r,
    period: (2 * Math.PI * r) / v
  };
}

/**
 * Period of a conical pendulum.
 */
export function conicalPeriod(L: number, angleDeg: number, g: number): number {
  const theta = angleDeg * DEG2RAD;
  return 2 * Math.PI * Math.sqrt((L * Math.cos(theta)) / g);
}

/**
 * Normal mode angular frequencies and periods for two coupled masses.
 */
export function coupledModes(m: number, k: number): { w1: number; w2: number; T1: number; T2: number } {
  const w1 = Math.sqrt(k / m);
  const w2 = Math.sqrt((3 * k) / m);
  return {
    w1,
    w2,
    T1: (2 * Math.PI) / w1,
    T2: (2 * Math.PI) / w2
  };
}

/**
 * Normal mode periods for a double pendulum (small angles, equal masses and lengths).
 */
export function doublePendulumModes(_m: number, L: number, g: number): { T1: number; T2: number } {
  // omega^2 = (g/L) * (2 -/+ sqrt(2))
  const base = g / L;
  const root2 = Math.SQRT2;
  const w1Sq = base * (2 - root2);
  const w2Sq = base * (2 + root2);
  
  const w1 = Math.sqrt(w1Sq);
  const w2 = Math.sqrt(w2Sq);
  
  return {
    T1: (2 * Math.PI) / w1,
    T2: (2 * Math.PI) / w2
  };
}

/**
 * Forces and motion details for a block on a rough slope.
 */
export function slope(m: number, angleDeg: number, mu: number, g: number): { normal: number; needed: number; slides: boolean; a: number; friction: number } {
  const theta = angleDeg * DEG2RAD;
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);
  
  const normal = m * g * cosTheta;
  const needed = m * g * sinTheta;
  
  const tanTheta = sinTheta / cosTheta;
  const slides = tanTheta > mu;
  
  const a = slides ? g * (sinTheta - mu * cosTheta) : 0;
  const friction = slides ? mu * m * g * cosTheta : m * g * sinTheta;
  
  return {
    normal,
    needed,
    slides,
    a,
    friction
  };
}
