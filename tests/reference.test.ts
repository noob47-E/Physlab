import { describe, expect, it } from 'vitest';
import { rk4, rk45, verlet, rk45Until, systems, type Deriv } from '../src/renderer/src/sim/reference';

describe('Reference sim functions', () => {
  it('type check exports', () => {
    const _typeVar: Deriv = (_t, _y) => [];
    expect(_typeVar).toBeDefined();
    expect(rk4).toBeDefined();
    expect(rk45).toBeDefined();
    expect(verlet).toBeDefined();
    expect(rk45Until).toBeDefined();
    expect(systems).toBeDefined();
  });

  it('pendulum period with rk45Until', () => {
    const g = 9.81;
    const L = 2.0;
    const sys = systems.pendulum(L, g);
    const th0 = 15 * Math.PI / 180;
    const y0 = [th0, 0];
    
    const stop = (_t: number, y: number[]) => y[0];
    
    const firstCross = rk45Until(sys, y0, 0, 5, 1e-12, stop);
    expect(firstCross).not.toBeNull();
    
    const secondCross = rk45Until(sys, firstCross!.y, firstCross!.t, 5, 1e-12, stop);
    expect(secondCross).not.toBeNull();
    
    const thirdCross = rk45Until(sys, secondCross!.y, secondCross!.t, 5, 1e-12, stop);
    expect(thirdCross).not.toBeNull();
    
    const period = thirdCross!.t - firstCross!.t;
    expect(Math.abs(period - 2.84921)).toBeLessThanOrEqual(1e-5);
  });
  
  it('dragProjectile range and best angle', () => {
    const sys = (v0: number, angle: number) => {
      const g = 9.81;
      const m = 0.5;
      const r = 0.3;
      const cd = 0.47;
      const rho = 1.225;
      const f = systems.dragProjectile(m, r, cd, rho, g);
      const rad = angle * Math.PI / 180;
      const vx0 = v0 * Math.cos(rad);
      const vy0 = v0 * Math.sin(rad);
      return { f, y0: [0, 0, vx0, vy0] };
    };
    
    const stop = (_t: number, y: number[]) => y[1];
    
    const { f: f37, y0: y0_37 } = sys(14, 37);
    const res1 = rk45(f37, y0_37, 0, 0.01, 1e-12);
    const cross = rk45Until(f37, res1.y, 0.01, 10, 1e-12, stop);
    expect(cross).not.toBeNull();
    const range37 = cross!.y[0];
    
    expect(Math.abs(range37 - 6.8335)).toBeLessThanOrEqual(1e-3);
    
    let bestAngle = -1;
    let maxRange = -1;
    for (let angle = 30; angle <= 45; angle += 0.25) {
      const { f, y0 } = sys(14, angle);
      const res = rk45(f, y0, 0, 0.01, 1e-12);
      const c = rk45Until(f, res.y, 0.01, 10, 1e-12, stop);
      if (c && c.y[0] > maxRange) {
        maxRange = c.y[0];
        bestAngle = angle;
      }
    }
    
    expect(Math.abs(bestAngle - 37)).toBeLessThanOrEqual(0.5);
  });
  
  it('doublePendulum periods (small swing)', () => {
    const g = 9.81;
    const f = systems.doublePendulum(1, 1, 1, 1, g);
    
    const ratio = Math.SQRT2;
    const th1_slow = 1e-4;
    const th2_slow = th1_slow * ratio;
    
    const stop1 = (_t: number, y: number[]) => y[0];
    const cross1 = rk45Until(f, [th1_slow, th2_slow, 0, 0], 0, 10, 1e-12, stop1);
    const T_slow = cross1!.t * 4;
    
    expect(Math.abs(T_slow - 2.6211) / 2.6211).toBeLessThanOrEqual(0.001);
    
    const ratio_fast = -Math.SQRT2;
    const th1_fast = 1e-4;
    const th2_fast = th1_fast * ratio_fast;
    const cross2 = rk45Until(f, [th1_fast, th2_fast, 0, 0], 0, 10, 1e-12, stop1);
    const T_fast = cross2!.t * 4;
    
    expect(Math.abs(T_fast - 1.0857) / 1.0857).toBeLessThanOrEqual(0.001);
  });
  
  it('doublePendulum accelerations for unequal masses (m2 = 0.5)', () => {
    // Checked against the standard mass-matrix solve (JM, 13 Oct 2026): a1 = -7.743808, a2 = 4.295773.
    const f = systems.doublePendulum(1, 0.5, 1, 1, 9.81);
    const d = f(0, [0.7, 0.3, 0.4, -0.9]);
    expect(Math.abs(d[2] - -7.743808)).toBeLessThanOrEqual(1e-5);
    expect(Math.abs(d[3] - 4.295773)).toBeLessThanOrEqual(1e-5);
  });

  it('verlet and rk4 accuracy on spring', () => {
    const accel = (x: number[]) => [-x[0]];
    const resV = verlet(accel, [1], [0], 0.01, 10000);
    const finalEnergy = 0.5 * (resV.x[0] * resV.x[0] + resV.v[0] * resV.v[0]);
    expect(Math.abs(finalEnergy - 0.5)).toBeLessThanOrEqual(1e-4);
    
    const deriv = (_t: number, y: number[]) => [y[1], -y[0]];
    const resRk4_1 = rk4(deriv, [1, 0], 0, 10, 0.01);
    const err1 = Math.abs(resRk4_1[0] - Math.cos(10));
    
    const resRk4_2 = rk4(deriv, [1, 0], 0, 10, 0.005);
    const err2 = Math.abs(resRk4_2[0] - Math.cos(10));
    
    const ratio = err1 / err2;
    expect(ratio).toBeGreaterThanOrEqual(14);
    expect(ratio).toBeLessThanOrEqual(18);
  });
  
  it('springMass period', () => {
    const f = systems.springMass(2, 200);
    const stop = (_t: number, y: number[]) => y[0];
    const cross1 = rk45Until(f, [1, 0], 0, 10, 1e-12, stop);
    const cross2 = rk45Until(f, cross1!.y, cross1!.t, 10, 1e-12, stop);
    const cross3 = rk45Until(f, cross2!.y, cross2!.t, 10, 1e-12, stop);
    const period = cross3!.t - cross1!.t; // full period between two same direction crossings
    
    // The exact period is 2π/√(k/m) = 0.6283185 s; the spec's 0.62832 is that rounded to 5 places, so the test
    // compares with the exact value, within 1e-6 (not with the rounded literal).
    expect(Math.abs(period - (2 * Math.PI) / Math.sqrt(200 / 2))).toBeLessThanOrEqual(1e-6);
  });
  
  it('start-on-event for rk45Until', () => {
    // If the event condition is perfectly met at t0, the solver must not silently return t0,
    // but should integrate until the next event.
    // For a drag projectile launched from y=0 with vy=10, it should find the landing time, not t=0.
    const f = systems.dragProjectile(0.5, 0.3, 0.47, 1.225, 9.81);
    const stop = (_t: number, y: number[]) => y[1]; // stops when height y is 0
    
    const cross = rk45Until(f, [0, 0, 10, 10], 0, 10, 1e-12, stop);
    
    expect(cross).not.toBeNull();
    // It should find the time it hits the ground again, not t=0
    expect(cross!.t).toBeGreaterThan(0.1);
    expect(Math.abs(cross!.y[1])).toBeLessThanOrEqual(1e-10);
  });
  
  it('start on an event: the next crossing is found even when the first step jumps over it', () => {
    // y' = 1 - 2t from y = 0 at t = 0 gives y = t - t^2: the run starts on the event y = 0 (rising) and
    // crosses it again at t = 1. The first step (0.1 x 40 = 4) jumps over t = 1 (JM, 13 Oct 2026).
    const hit = rk45Until((t) => [1 - 2 * t], [0], 0, 40, 1e-12, (_t, y) => y[0]);
    expect(hit).not.toBeNull();
    expect(Math.abs(hit!.t - 1)).toBeLessThanOrEqual(1e-6);
  });

  it('start on a flat event (zero first derivative): the next crossing is found', () => {
    // y' = 3t^2 - 2t from y = 0 at t = 0 gives y = t^3 - t^2 = t^2 (t - 1): the start is a double zero, the
    // run goes below zero and comes back at t = 1, and the first step (0.1 x 40 = 4) jumps over it (JM, 13 Oct 2026).
    const hit = rk45Until((t) => [3 * t * t - 2 * t], [0], 0, 40, 1e-12, (_t, y) => y[0]);
    expect(hit).not.toBeNull();
    expect(Math.abs(hit!.t - 1)).toBeLessThanOrEqual(1e-6);
  });

  it('a restart from an exact returned crossing does not report it again', () => {
    // y' = 1 from y = -0.2 rises through zero at t = 0.2 and never falls back: the returned crossing is the event
    // itself (s = 0 or on the new side), so the restart finds nothing more before tMax (JM, 13 Oct 2026).
    const f = (_t: number, _y: number[]) => [1];
    const first = rk45Until(f, [-0.2], 0, 2, 1e-12, (_t, y) => y[0]);
    expect(first).not.toBeNull();
    expect(Math.abs(first!.t - 0.2)).toBeLessThanOrEqual(1e-9);
    expect(rk45Until(f, first!.y, first!.t, 2, 1e-12, (_t, y) => y[0])).toBeNull();
  });

  it("dense output of rk45Until is accurate to 1e-8 on y' = y (through the real solver)", () => {
    // The event at t = 0.37 is located by bisection on the dense output; the state there must equal e^t to 1e-8.
    const f = (_t: number, y: number[]) => [y[0]];
    const hit = rk45Until(f, [1], 0, 1, 1e-12, (t) => t - 0.37);
    expect(hit).not.toBeNull();
    expect(Math.abs(hit!.t - 0.37)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(hit!.y[0] - Math.exp(hit!.t))).toBeLessThanOrEqual(1e-8);
  });
});
