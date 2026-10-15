import { collide1D } from './collisionMath';
import { LIMITS } from './limits';
import { fmtLabel } from '../math/format';

export type V3 = [number, number, number];

export interface BodyAt {
  id: string;
  mass: number;
  velocity: V3;
}

export interface SystemTotals {
  p: V3;
  pMag: number;
  ke: number;
  vcm: V3;
  mass: number;
}

export function totalsOf(bodies: BodyAt[]): SystemTotals {
  let mass = 0;
  let px = 0;
  let py = 0;
  let pz = 0;
  let ke = 0;

  for (const b of bodies) {
    mass += b.mass;
    px += b.mass * b.velocity[0];
    py += b.mass * b.velocity[1];
    pz += b.mass * b.velocity[2];
    ke += 0.5 * b.mass * (b.velocity[0] * b.velocity[0] + b.velocity[1] * b.velocity[1] + b.velocity[2] * b.velocity[2]);
  }

  const pMag = Math.sqrt(px * px + py * py + pz * pz);
  
  let vcm: V3 = [0, 0, 0];
  if (mass > 0) {
    vcm = [px / mass, py / mass, pz / mass];
  }

  return { p: [px, py, pz], pMag, ke, vcm, mass };
}

export interface Conservation {
  pDefect: number;
  keLost: number;
  keLostShare: number;
  deltaVcm: number;
}

export function conservation(before: SystemTotals, after: SystemTotals): Conservation {
  const dx = after.p[0] - before.p[0];
  const dy = after.p[1] - before.p[1];
  const dz = after.p[2] - before.p[2];
  const diffMag = Math.sqrt(dx * dx + dy * dy + dz * dz);
  
  // eslint-disable-next-line no-restricted-syntax -- required by the specification to prevent division by zero for exact zero values
  const maxDiv = Math.max(before.pMag, after.pMag, 1e-12);
  const pDefect = diffMag / maxDiv;
  
  const keLost = before.ke - after.ke;
  const keLostShare = before.ke === 0 ? 0 : keLost / before.ke;
  
  const dvx = after.vcm[0] - before.vcm[0];
  const dvy = after.vcm[1] - before.vcm[1];
  const dvz = after.vcm[2] - before.vcm[2];
  const deltaVcm = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
  
  return { pDefect, keLost, keLostShare, deltaVcm };
}

export interface ContactSample {
  a: string;
  b: string;
  massA: number;
  massB: number;
  vBeforeA: V3;
  vBeforeB: V3;
  vAfterA: V3;
  vAfterB: V3;
  normal: V3; /* unit, from A to B */
  eUsed: number;
  time: number;
  step: number;
}

export interface MeasuredContact {
  approach: number;
  separation: number;
  eMeasured: number | null;
  impulse: number;
  keLost: number;
  pDefect: number;
}

function dotProduct(v1: V3, v2: V3): number {
  return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
}

export function measureContact(c: ContactSample): MeasuredContact {
  
  
  
  
  const vBeforeRel: V3 = [c.vBeforeA[0] - c.vBeforeB[0], c.vBeforeA[1] - c.vBeforeB[1], c.vBeforeA[2] - c.vBeforeB[2]];
  const approach = dotProduct(vBeforeRel, c.normal);
  
  const vAfterRel: V3 = [c.vAfterB[0] - c.vAfterA[0], c.vAfterB[1] - c.vAfterA[1], c.vAfterB[2] - c.vAfterA[2]];
  const separation = dotProduct(vAfterRel, c.normal);
  
  let eMeasured: number | null = separation / approach;
  if (approach <= 1e-9) {
    eMeasured = null;
  }
  
  const vDiffA: V3 = [c.vAfterA[0] - c.vBeforeA[0], c.vAfterA[1] - c.vBeforeA[1], c.vAfterA[2] - c.vBeforeA[2]];
  const impulse = c.massA * Math.abs(dotProduct(vDiffA, c.normal));
  
  const keBefore = 0.5 * c.massA * dotProduct(c.vBeforeA, c.vBeforeA) + 0.5 * c.massB * dotProduct(c.vBeforeB, c.vBeforeB);
  const keAfter = 0.5 * c.massA * dotProduct(c.vAfterA, c.vAfterA) + 0.5 * c.massB * dotProduct(c.vAfterB, c.vAfterB);
  const keLost = keBefore - keAfter;
  
  const pBefore: V3 = [
    c.massA * c.vBeforeA[0] + c.massB * c.vBeforeB[0],
    c.massA * c.vBeforeA[1] + c.massB * c.vBeforeB[1],
    c.massA * c.vBeforeA[2] + c.massB * c.vBeforeB[2]
  ];
  const pAfter: V3 = [
    c.massA * c.vAfterA[0] + c.massB * c.vAfterB[0],
    c.massA * c.vAfterA[1] + c.massB * c.vAfterB[1],
    c.massA * c.vAfterA[2] + c.massB * c.vAfterB[2]
  ];
  
  const dp: V3 = [pAfter[0] - pBefore[0], pAfter[1] - pBefore[1], pAfter[2] - pBefore[2]];
  const dpMag = Math.sqrt(dotProduct(dp, dp));
  
  const pBeforeMag = Math.sqrt(dotProduct(pBefore, pBefore));
  const pAfterMag = Math.sqrt(dotProduct(pAfter, pAfter));
  
  // eslint-disable-next-line no-restricted-syntax -- required by the specification to prevent division by zero for exact zero values
  const maxDiv = Math.max(pBeforeMag, pAfterMag, 1e-12);
  const pDefect = dpMag / maxDiv;

  return { approach, separation, eMeasured, impulse, keLost, pDefect };
}

export interface GapInput {
  mA: number;
  uA: number;
  mB: number;
  uB: number;
  eA: number;
  eB: number;
  eAsked: number;
  measured: { vA: number; vB: number };
  minBounceSpeed?: number;
  tolerancePercent?: number;
}

export interface GapReport {
  predicted: { vA: number; vB: number };
  percent: number;
  within: boolean;
  explained: boolean;
  reason: { key: 'bounceThreshold' | 'maxRestitution'; sentence: string } | null;
  sentence: string;
}

function calculatePercent(predictedA: number, predictedB: number, measuredA: number, measuredB: number): number {
  const diffA = Math.abs(measuredA - predictedA);
  const diffB = Math.abs(measuredB - predictedB);
  const maxDiff = Math.max(diffA, diffB);
  
  // eslint-disable-next-line no-restricted-syntax -- required by the specification to prevent division by zero for exact zero values
  const maxPred = Math.max(Math.abs(predictedA), Math.abs(predictedB), 1e-12);
  
  return (maxDiff / maxPred) * 100;
}

export function explainCollisionGap(g: GapInput): GapReport {
  const tolerancePercent = g.tolerancePercent !== undefined ? g.tolerancePercent : 0.5;
  const minBounceSpeed = g.minBounceSpeed !== undefined ? g.minBounceSpeed : 1.0;

  const predictedRes = collide1D(g.mA, g.uA, g.mB, g.uB, g.eAsked);
  const predictedA = predictedRes.v1;
  const predictedB = predictedRes.v2;

  const percent = calculatePercent(predictedA, predictedB, g.measured.vA, g.measured.vB);
  const within = percent <= tolerancePercent;

  if (within) {
    return {
      predicted: { vA: predictedA, vB: predictedB },
      percent,
      within: true,
      explained: true,
      reason: null,
      sentence: `The engine agrees with the formula to ${fmtLabel(percent)} %.`
    };
  }

  // Try both known causes and pick the one with smallest residual (closest match)
  let bestMatch: { type: 'bounceThreshold' | 'maxRestitution'; percent: number; vA: number; vB: number; approach?: number; eMax?: number } | null = null;

  // 1. Check bounceThreshold
  const approach = g.uA - g.uB;
  if (approach < minBounceSpeed) {
    const threshRes = collide1D(g.mA, g.uA, g.mB, g.uB, g.eAsked, { minBounceSpeed });
    const pThreshPercent = calculatePercent(threshRes.v1, threshRes.v2, g.measured.vA, g.measured.vB);

    if (pThreshPercent <= tolerancePercent) {
      bestMatch = { type: 'bounceThreshold', percent: pThreshPercent, vA: threshRes.v1, vB: threshRes.v2, approach };
    }
  }

  // 2. Check maxRestitution
  const eMax = Math.max(g.eA, g.eB);
  if (eMax !== g.eAsked) {
    const maxRes = collide1D(g.mA, g.uA, g.mB, g.uB, eMax);
    const pMaxPercent = calculatePercent(maxRes.v1, maxRes.v2, g.measured.vA, g.measured.vB);

    if (pMaxPercent <= tolerancePercent) {
      // If we have a bestMatch and this one is better (smaller residual), or equal (tie goes to bounceThreshold)
      if (bestMatch === null || pMaxPercent < bestMatch.percent) {
        bestMatch = { type: 'maxRestitution', percent: pMaxPercent, vA: maxRes.v1, vB: maxRes.v2, eMax };
      }
    }
  }

  // If we found a match, return it
  if (bestMatch) {
    if (bestMatch.type === 'bounceThreshold') {
      return {
        predicted: { vA: predictedA, vB: predictedB },
        percent,
        within: false,
        explained: true,
        reason: {
          key: 'bounceThreshold',
          sentence: LIMITS.bounceThreshold.sentence
        },
        sentence: `${LIMITS.bounceThreshold.sentence} This hit came in at ${fmtLabel(bestMatch.approach!)} m/s, so the two stick: A leaves at ${fmtLabel(bestMatch.vA)} m/s and B at ${fmtLabel(bestMatch.vB)} m/s.`
      };
    } else {
      return {
        predicted: { vA: predictedA, vB: predictedB },
        percent,
        within: false,
        explained: true,
        reason: {
          key: 'maxRestitution',
          sentence: LIMITS.maxRestitution.sentence
        },
        sentence: `${LIMITS.maxRestitution.sentence} Here that is ${fmtLabel(bestMatch.eMax!)}, not ${fmtLabel(g.eAsked)}.`
      };
    }
  }

  // None matches
  return {
    predicted: { vA: predictedA, vB: predictedB },
    percent,
    within: false,
    explained: false,
    reason: null,
    sentence: `The engine differs from the formula by ${fmtLabel(percent)} % and no known cause accounts for it.`
  };
}
