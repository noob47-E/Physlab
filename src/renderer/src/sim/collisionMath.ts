/**
 * Formulas for 1D and 2D collisions and momentum, used by the Sandbox
 * physics engine and collision cards.
 */

import { isNoise } from '../math/noise';

export function reducedMass(m1: number, m2: number): number {
  return (m1 * m2) / (m1 + m2);
}

export interface Collision1D {
  v1: number;
  v2: number;
  eUsed: number;
  approach: number;
  p0: number;
  p1: number;
  ke0: number;
  ke1: number;
  keLost: number;
  keLostShare: number;
  vcm: number;
}

export function collide1D(
  m1: number,
  u1: number,
  m2: number,
  u2: number,
  e: number,
  opts?: { minBounceSpeed?: number }
): Collision1D {
  const approach = u1 - u2;
  const p0 = m1 * u1 + m2 * u2;
  const ke0 = 0.5 * m1 * u1 * u1 + 0.5 * m2 * u2 * u2;
  const vcm = p0 / (m1 + m2);

  let eUsed = e;
  let v1 = u1;
  let v2 = u2;

  if (approach <= 0) {
    // they are not approaching, velocities unchanged
  } else {
    if (opts?.minBounceSpeed !== undefined && approach < opts.minBounceSpeed) {
      eUsed = 0;
    }
    v1 = ((m1 - eUsed * m2) * u1 + (1 + eUsed) * m2 * u2) / (m1 + m2);
    v2 = ((m2 - eUsed * m1) * u2 + (1 + eUsed) * m1 * u1) / (m1 + m2);
  }

  const p1 = m1 * v1 + m2 * v2;
  const ke1 = 0.5 * m1 * v1 * v1 + 0.5 * m2 * v2 * v2;
  const keLost = ke0 - ke1;
  const keLostShare = ke0 === 0 ? 0 : keLost / ke0;

  return { v1, v2, eUsed, approach, p0, p1, ke0, ke1, keLost, keLostShare, vcm };
}

export function keLost1D(m1: number, u1: number, m2: number, u2: number, e: number): number {
  const approach = u1 - u2;
  return 0.5 * reducedMass(m1, m2) * (1 - e * e) * approach * approach;
}

export type V2 = [number, number];

export interface Body2D {
  m: number;
  v: V2;
}

export interface Collision2D {
  va: V2;
  vb: V2;
  p0: V2;
  p1: V2;
  ke0: number;
  ke1: number;
  keLost: number;
  eUsed: number;
  angleBetweenDeg: number | null;
  normalApproach: number;
}

export function angleBetweenDeg(a: V2, b: V2): number | null {
  const lenA = Math.sqrt(a[0] * a[0] + a[1] * a[1]);
  const lenB = Math.sqrt(b[0] * b[0] + b[1] * b[1]);
  if (lenA === 0 || lenB === 0) return null;
  const dot = a[0] * b[0] + a[1] * b[1];
  const cosTheta = dot / (lenA * lenB);
  // clamp due to float inaccuracies
  const clamped = Math.max(-1, Math.min(1, cosTheta));
  return (Math.acos(clamped) * 180) / Math.PI;
}

export function collide2D(
  a: Body2D,
  b: Body2D,
  e: number,
  normal: V2,
  opts?: { minBounceSpeed?: number }
): Collision2D {
  let nx = normal[0];
  let ny = normal[1];
  const nLen = Math.sqrt(nx * nx + ny * ny);

  const ke0 = 0.5 * a.m * (a.v[0] * a.v[0] + a.v[1] * a.v[1]) + 0.5 * b.m * (b.v[0] * b.v[0] + b.v[1] * b.v[1]);
  const p0: V2 = [a.m * a.v[0] + b.m * b.v[0], a.m * a.v[1] + b.m * b.v[1]];

  if (nLen === 0) {
    return {
      va: [...a.v],
      vb: [...b.v],
      p0,
      p1: [...p0],
      ke0,
      ke1: ke0,
      keLost: 0,
      eUsed: e,
      angleBetweenDeg: angleBetweenDeg(a.v, b.v),
      normalApproach: 0
    };
  }

  nx /= nLen;
  ny /= nLen;

  // The contract's rule: the normal runs from a to b (contactNormal gives it), and it is used as
  // given. u1 and u2 are the speeds of a and b along it, so u1 - u2 is positive only when the
  // bodies close in. Bodies that separate (u1 - u2 <= 0) keep their velocities, as collide1D does;
  // flipping the normal here would swap their velocities, which is a collision that never happens.
  const u1 = a.v[0] * nx + a.v[1] * ny;
  const u2 = b.v[0] * nx + b.v[1] * ny;

  const approach = u1 - u2;
  const c1d = collide1D(a.m, u1, b.m, u2, e, opts);

  const va: V2 = [a.v[0] - u1 * nx + c1d.v1 * nx, a.v[1] - u1 * ny + c1d.v1 * ny];
  const vb: V2 = [b.v[0] - u2 * nx + c1d.v2 * nx, b.v[1] - u2 * ny + c1d.v2 * ny];

  const p1: V2 = [a.m * va[0] + b.m * vb[0], a.m * va[1] + b.m * vb[1]];
  const ke1 = 0.5 * a.m * (va[0] * va[0] + va[1] * va[1]) + 0.5 * b.m * (vb[0] * vb[0] + vb[1] * vb[1]);

  return {
    va,
    vb,
    p0,
    p1,
    ke0,
    ke1,
    keLost: ke0 - ke1,
    eUsed: c1d.eUsed,
    angleBetweenDeg: angleBetweenDeg(va, vb),
    normalApproach: approach
  };
}

export function contactNormal(centreA: V2, centreB: V2): V2 | null {
  const dx = centreB[0] - centreA[0];
  const dy = centreB[1] - centreA[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return null;
  return [dx / len, dy / len];
}

export function obliqueSetup(
  rA: number,
  rB: number,
  impactAngleDeg: number,
  travel: number
): { aStart: V2; bStart: V2; normal: V2; offset: number } {
  const angleRad = (impactAngleDeg * Math.PI) / 180;
  const R = rA + rB;
  const offset = R * Math.sin(angleRad);
  const contactAx = -R * Math.cos(angleRad);
  const contactAy = -R * Math.sin(angleRad);

  return {
    aStart: [contactAx - travel, contactAy],
    bStart: [0, 0],
    normal: [Math.cos(angleRad), Math.sin(angleRad)],
    offset
  };
}

export interface ChainBall {
  x: number;
  r: number;
  m: number;
  v: number;
}

export interface ChainEvent {
  t: number;
  i: number;
  approach: number;
  eUsed: number;
}

export interface ChainResult {
  v: number[];
  events: ChainEvent[];
  p0: number;
  p1: number;
  ke0: number;
  ke1: number;
  settled: boolean;
}

export function simulateChain1D(
  balls: ChainBall[],
  e: number,
  opts?: { minBounceSpeed?: number; maxEvents?: number; stopBelow?: number }
): ChainResult {
  const maxEvents = opts?.maxEvents ?? 10000;
  const stopBelow = opts?.stopBelow ?? 1e-9;
  const minBounceSpeed = opts?.minBounceSpeed;

  const currentBalls = balls.map((b) => ({ ...b }));
  // The largest position plus radius in the chain: rounding in a meeting time is noise against this size.
  let scale = 0;
  for (const b of balls) scale = Math.max(scale, Math.abs(b.x) + b.r);
  let tTotal = 0;
  const events: ChainEvent[] = [];
  
  let p0 = 0;
  let ke0 = 0;
  for (const b of currentBalls) {
    p0 += b.m * b.v;
    ke0 += 0.5 * b.m * b.v * b.v;
  }

  let settled = false;

  for (let eventCount = 0; eventCount < maxEvents; eventCount++) {
    let bestTime = Infinity;
    let bestI = -1;
    let bestApproach = 1;

    for (let i = 0; i < currentBalls.length - 1; i++) {
      const b1 = currentBalls[i];
      const b2 = currentBalls[i + 1];
      const approach = b1.v - b2.v;
      if (approach > stopBelow) {
        const gap = b2.x - b2.r - (b1.x + b1.r);
        // A gap that rounds slightly negative means the balls already touch: clamp to 0.
        const dtSafe = Math.max(0, gap / approach);
        // The earliest meeting wins. An exact tie goes to the lowest i (the contract's rule). Two
        // meetings at the same instant can differ by float rounding. A gap is a difference of positions,
        // so its rounding is about 1e-15 of the largest position: in time units that is scale / approach.
        // A later pair takes over only when its time is not the same number at that size (math/noise.ts).
        const tie =
          bestI >= 0 && isNoise(dtSafe - bestTime, dtSafe, bestTime, scale / approach, scale / bestApproach);
        if (dtSafe < bestTime && !tie) {
          bestTime = dtSafe;
          bestI = i;
          bestApproach = approach;
        }
      }
    }

    if (bestI === -1) {
      settled = true;
      break;
    }

    // advance all
    for (const b of currentBalls) {
      b.x += b.v * bestTime;
    }
    tTotal += bestTime;

    const b1 = currentBalls[bestI];
    const b2 = currentBalls[bestI + 1];
    
    // Only the pair (bestI, bestI+1) is resolved. A simultaneous three-ball meeting is therefore
    // solved pair by pair, lowest i first, as the contract says. A symmetric solver that applies
    // both impulses at once is a different model and is not used; the test
    // "simultaneous 3-body tie" pins this order.
    const c1d = collide1D(b1.m, b1.v, b2.m, b2.v, e, { minBounceSpeed });
    
    events.push({
      t: tTotal,
      i: bestI,
      approach: c1d.approach,
      eUsed: c1d.eUsed
    });
    
    b1.v = c1d.v1;
    b2.v = c1d.v2;
  }

  let p1 = 0;
  let ke1 = 0;
  for (const b of currentBalls) {
    p1 += b.m * b.v;
    ke1 += 0.5 * b.m * b.v * b.v;
  }

  return {
    v: currentBalls.map((b) => b.v),
    events,
    p0,
    p1,
    ke0,
    ke1,
    settled
  };
}

export function momentumDefect(before: number[], after: number[]): number {
  let sumB = 0;
  for (const x of before) sumB += x;
  let sumA = 0;
  for (const x of after) sumA += x;
  
  const absB = Math.abs(sumB);
  const absA = Math.abs(sumA);
  // eslint-disable-next-line no-restricted-syntax -- required by the specification to prevent division by zero for exact zero values
  const maxDiv = Math.max(absB, absA, 1e-12);
  
  return Math.abs(sumA - sumB) / maxDiv;
}
