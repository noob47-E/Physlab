import { describe, expect, it } from 'vitest';
import {
  freeFall,
  projectile,
  horizontalLaunch,
  pendulumSmall,
  pendulumExact,
  pendulumSeries,
  springPeriod,
  atwood,
  stoppingDistance,
  bounceTops,
  bounceTimes,
  terminalSpeed,
  dragFallTime,
  rollingSpeed,
  rollingAcceleration,
  rollingTime,
  collision1D,
  sticky,
  circular,
  conicalPeriod,
  coupledModes,
  doublePendulumModes,
  slope
} from '../src/renderer/src/sim/predict';

describe('predict.ts physics predictions', () => {
  it('freeFall(5)', () => {
    const res = freeFall(5, 9.81);
    expect(res.time).toBeCloseTo(1.0096, 4);
    expect(res.speed).toBeCloseTo(9.9045, 4);
  });

  it('projectile(14, 30)', () => {
    const res = projectile(14, 30, 9.81);
    expect(res.range).toBeCloseTo(17.3029, 4);
    expect(res.top).toBeCloseTo(2.4975, 4);
    expect(res.flightTime).toBeCloseTo(1.4271, 4);
  });

  it('horizontalLaunch(3, 4)', () => {
    const res = horizontalLaunch(3, 4, 9.81);
    expect(res.time).toBeCloseTo(0.9030, 4);
    expect(res.distance).toBeCloseTo(2.7091, 4);
  });

  it('pendulumSmall(2)', () => {
    expect(pendulumSmall(2, 9.81)).toBeCloseTo(2.8370, 4);
  });

  it('pendulumExact(2, 15°)', () => {
    expect(pendulumExact(2, 9.81, 15)).toBeCloseTo(2.84921, 5);
  });

  it('pendulumExact at 180 returns Infinity', () => {
    expect(pendulumExact(1, 9.81, 180)).toBe(Infinity);
  });

  it('pendulumExact just below 180 is finite (about 37.23 s for L = 1 m), not Infinity', () => {
    // Hand value: T ~ 4 sqrt(L/g) ln(4/b), b = cos(89.99999999995 deg) = 8.7266e-13,
    // so 1.27710 x 29.1535 = 37.23 s.
    expect(pendulumExact(1, 9.81, 179.9999999999)).toBeCloseTo(37.23, 1);
  });

  it('pendulumExact past the top: 181 degrees is the release at 179 on the other side (7.8258 s)', () => {
    // Hand value: b = cos(89.5 deg) = 0.0087265, AGM(1, b) = 0.25634, T = 2.00607 / 0.25634 = 7.8258 s.
    expect(pendulumExact(1, 9.81, 181)).toBeCloseTo(7.8258, 3);
    expect(pendulumExact(1, 9.81, 181)).toBeCloseTo(pendulumExact(1, 9.81, 179), 12);
    expect(pendulumExact(1, 9.81, 0)).toBeCloseTo(2.00607, 4);
  });

  it('pendulumSeries(2, 15°)', () => {
    expect(pendulumSeries(2, 9.81, 15)).toBeCloseTo(2.84916, 5);
  });

  it('springPeriod', () => {
    expect(springPeriod(2, 200)).toBeCloseTo(0.62832, 5);
    expect(springPeriod(2, 50)).toBeCloseTo(1.25664, 5);
  });

  it('atwood', () => {
    const res1 = atwood(1, 2, 9.81);
    expect(res1.a).toBeCloseTo(3.27, 2);
    expect(res1.tension).toBeCloseTo(13.08, 2);

    const res2 = atwood(3, 4, 9.81);
    expect(res2.a).toBeCloseTo(1.4014, 3);
    expect(res2.tension).toBeCloseTo(33.634, 3);
  });

  it('stoppingDistance(6, 0.4)', () => {
    expect(stoppingDistance(6, 0.4, 9.81)).toBeCloseTo(4.5872, 4);
  });

  it('bounceTops(3, 0.8, 3)', () => {
    const res = bounceTops(3, 0.8, 3);
    expect(res.length).toBe(3);
    expect(res[0]).toBeCloseTo(1.92, 4);
    expect(res[1]).toBeCloseTo(1.2288, 4);
    expect(res[2]).toBeCloseTo(0.7864, 4);
  });

  it('bounceTimes(3, 0.8, 4)', () => {
    const res = bounceTimes(3, 0.8, 4, 9.81);
    expect(res.length).toBe(4);
    expect(res[0]).toBeCloseTo(0.7821, 4);
    expect(res[1]).toBeCloseTo(2.0334, 4);
    expect(res[2]).toBeCloseTo(3.0344, 4);
    expect(res[3]).toBeCloseTo(3.8352, 4);
  });

  it('bounceTimes e = 0', () => {
    const res = bounceTimes(5, 0, 4, 9.81);
    expect(res.length).toBe(1);
    expect(res[0]).toBeCloseTo(1.0096, 4);
  });

  it('terminalSpeed', () => {
    expect(terminalSpeed(0.8, 1.225, 0.47, Math.PI * 0.15 * 0.15, 9.81)).toBeCloseTo(19.64, 2);
  });

  it('dragFallTime', () => {
    expect(dragFallTime(20, 0.1, 1.225, 0.47, Math.PI * 0.05 * 0.05, 9.81)).toBeCloseTo(2.1743, 3);
    expect(dragFallTime(20, 10, 1.225, 0.47, Math.PI * 0.05 * 0.05, 9.81)).toBeCloseTo(2.0208, 3);
  });

  it('dragFallTime air off', () => {
    expect(dragFallTime(20, 1, 0, 0, Math.PI * 0.05 * 0.05, 9.81)).toBeCloseTo(2.0193, 4);
  });

  it('dragFallTime large drag overflow case', () => {
    // Exact value from hand calc: ~88.5
    expect(dragFallTime(100, 0.008, 1.225, 1, 0.1, 9.81)).toBeCloseTo(88.42, 1);
  });

  it('rollingSpeed', () => {
    expect(rollingSpeed(1.5, 9.81, 2/5)).toBeCloseTo(4.5849, 4);
    expect(rollingSpeed(1.5, 9.81, 0)).toBeCloseTo(5.4249, 4);
  });

  it('rollingAcceleration', () => {
    expect(rollingAcceleration(30, 9.81, 2/5)).toBeCloseTo(3.50357, 5);
  });

  it('rollingTime', () => {
    expect(rollingTime(2, 30, 9.81, 2/5)).toBeCloseTo(1.0685, 4);
    expect(rollingTime(2, 30, 9.81, 1/2)).toBeCloseTo(1.1060, 4);
  });

  it('collision1D(1, 5, 3, 0, 0.9)', () => {
    const res = collision1D(1, 5, 3, 0, 0.9);
    expect(res.v1).toBeCloseTo(-2.125, 9);
    expect(res.v2).toBeCloseTo(2.375, 9);
  });

  it('collision1D keeps momentum and the restitution rule for seeded randoms', () => {
    // A fixed seed (mulberry32) so the same 50 cases run every time. Momentum alone would also pass
    // with the restitution sign flipped, so the separation speed v2 - v1 = e (u1 - u2) is checked too.
    let s = 20261013;
    const rnd = (): number => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < 50; i++) {
      const m1 = rnd() * 10 + 0.1;
      const m2 = rnd() * 10 + 0.1;
      const u1 = (rnd() - 0.5) * 20;
      const u2 = (rnd() - 0.5) * 20;
      const e = rnd();

      const pInitial = m1 * u1 + m2 * u2;
      const { v1, v2 } = collision1D(m1, u1, m2, u2, e);
      const pFinal = m1 * v1 + m2 * v2;

      expect(pFinal).toBeCloseTo(pInitial, 9);
      expect(Math.abs(v2 - v1 - e * (u1 - u2))).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(u1 - u2)));
    }
  });

  it('sticky(1, 4, 3)', () => {
    expect(sticky(1, 4, 3)).toBe(1);
  });

  it('circular', () => {
    const res = circular(1, 3, 1.5);
    expect(res.force).toBeCloseTo(6, 5);
    expect(res.period).toBeCloseTo(3.1416, 4);
  });

  it('conicalPeriod(2, 30)', () => {
    expect(conicalPeriod(2, 30, 9.81)).toBeCloseTo(2.6401, 4);
  });

  it('coupledModes(2, 50)', () => {
    const res = coupledModes(2, 50);
    expect(res.w1).toBeCloseTo(5, 4);
    expect(res.w2).toBeCloseTo(8.6603, 4);
    expect(res.T1).toBeCloseTo(1.2566, 4);
    expect(res.T2).toBeCloseTo(0.7255, 4);
  });

  it('doublePendulumModes(1, 1)', () => {
    const res = doublePendulumModes(1, 1, 9.81);
    expect(res.T1).toBeCloseTo(2.6211, 4);
    expect(res.T2).toBeCloseTo(1.0857, 4);
  });

  it('slope', () => {
    const res1 = slope(2, 30, 0.8, 9.81);
    expect(res1.normal).toBeCloseTo(16.991, 3);
    expect(res1.friction).toBeCloseTo(9.81, 2); // 9.81 N static since it doesn't slide
    expect(res1.slides).toBe(false);

    const res2 = slope(2, 30, 0.4, 9.81);
    expect(res2.slides).toBe(true);
    expect(res2.a).toBeCloseTo(1.5067, 4);
    // Correct by hand:
    // N = mg cos30° = 2 * 9.81 * 0.866025 = 16.9914 N
    // F_f = mu * N = 0.4 * 16.9914 = 6.796567 N
    // Rounded to 3 decimal places this is 6.797
    expect(res2.friction).toBeCloseTo(6.797, 3);
  });

  it('all functions return NaN-free finite numbers for positive inputs', () => {
    expect(Number.isFinite(freeFall(10, 9.81).time)).toBe(true);
    expect(Number.isNaN(freeFall(10, 9.81).time)).toBe(false);
    expect(Number.isFinite(projectile(10, 45, 9.81).range)).toBe(true);
    expect(Number.isNaN(projectile(10, 45, 9.81).range)).toBe(false);
    expect(Number.isFinite(horizontalLaunch(10, 10, 9.81).distance)).toBe(true);
    expect(Number.isNaN(horizontalLaunch(10, 10, 9.81).distance)).toBe(false);
    expect(Number.isFinite(pendulumSmall(1, 9.81))).toBe(true);
    expect(Number.isNaN(pendulumSmall(1, 9.81))).toBe(false);
    expect(Number.isFinite(pendulumExact(1, 9.81, 10))).toBe(true);
    expect(Number.isNaN(pendulumExact(1, 9.81, 10))).toBe(false);
    expect(Number.isFinite(pendulumSeries(1, 9.81, 10))).toBe(true);
    expect(Number.isNaN(pendulumSeries(1, 9.81, 10))).toBe(false);
    expect(Number.isFinite(springPeriod(1, 10))).toBe(true);
    expect(Number.isNaN(springPeriod(1, 10))).toBe(false);
    expect(Number.isFinite(atwood(1, 2, 9.81).a)).toBe(true);
    expect(Number.isNaN(atwood(1, 2, 9.81).a)).toBe(false);
    expect(Number.isFinite(stoppingDistance(10, 0.5, 9.81))).toBe(true);
    expect(Number.isNaN(stoppingDistance(10, 0.5, 9.81))).toBe(false);
    expect(Number.isFinite(bounceTops(10, 0.5, 3)[0])).toBe(true);
    expect(Number.isNaN(bounceTops(10, 0.5, 3)[0])).toBe(false);
    expect(Number.isFinite(bounceTimes(10, 0.5, 3, 9.81)[0])).toBe(true);
    expect(Number.isNaN(bounceTimes(10, 0.5, 3, 9.81)[0])).toBe(false);
    expect(Number.isFinite(terminalSpeed(1, 1, 1, 1, 9.81))).toBe(true);
    expect(Number.isNaN(terminalSpeed(1, 1, 1, 1, 9.81))).toBe(false);
    expect(Number.isFinite(dragFallTime(10, 1, 1, 1, 1, 9.81))).toBe(true);
    expect(Number.isNaN(dragFallTime(10, 1, 1, 1, 1, 9.81))).toBe(false);
    expect(Number.isFinite(rollingSpeed(10, 9.81, 0.5))).toBe(true);
    expect(Number.isNaN(rollingSpeed(10, 9.81, 0.5))).toBe(false);
    expect(Number.isFinite(rollingAcceleration(30, 9.81, 0.5))).toBe(true);
    expect(Number.isNaN(rollingAcceleration(30, 9.81, 0.5))).toBe(false);
    expect(Number.isFinite(rollingTime(10, 30, 9.81, 0.5))).toBe(true);
    expect(Number.isNaN(rollingTime(10, 30, 9.81, 0.5))).toBe(false);
    expect(Number.isFinite(collision1D(1, 1, 1, 1, 1).v1)).toBe(true);
    expect(Number.isNaN(collision1D(1, 1, 1, 1, 1).v1)).toBe(false);
    expect(Number.isFinite(sticky(1, 1, 1))).toBe(true);
    expect(Number.isNaN(sticky(1, 1, 1))).toBe(false);
    expect(Number.isFinite(circular(1, 1, 1).force)).toBe(true);
    expect(Number.isNaN(circular(1, 1, 1).force)).toBe(false);
    expect(Number.isFinite(conicalPeriod(1, 10, 9.81))).toBe(true);
    expect(Number.isNaN(conicalPeriod(1, 10, 9.81))).toBe(false);
    expect(Number.isFinite(coupledModes(1, 1).w1)).toBe(true);
    expect(Number.isNaN(coupledModes(1, 1).w1)).toBe(false);
    expect(Number.isFinite(doublePendulumModes(1, 1, 9.81).T1)).toBe(true);
    expect(Number.isNaN(doublePendulumModes(1, 1, 9.81).T1)).toBe(false);
    expect(Number.isFinite(slope(1, 10, 0.5, 9.81).normal)).toBe(true);
    expect(Number.isNaN(slope(1, 10, 0.5, 9.81).normal)).toBe(false);
  });
});
