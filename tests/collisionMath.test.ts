import { describe, expect, it } from 'vitest';
import {
  angleBetweenDeg,
  collide1D,
  collide2D,
  contactNormal,
  keLost1D,
  momentumDefect,
  obliqueSetup,
  reducedMass,
  simulateChain1D
} from '../src/renderer/src/sim/collisionMath';
import type {
  Body2D,
  ChainBall,
  ChainEvent,
  ChainResult,
  Collision1D,
  Collision2D,
  V2
} from '../src/renderer/src/sim/collisionMath';


// Pseudo-random generator for seeded tests
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Collision Maths', () => {
  it('collide1D basic cases', () => {
    // collide1D(1, 3, 2, 0, 1): v1 -1, v2 2, p0 = p1 = 3, ke0 = ke1 = 4.5, keLost 0, vcm 1
    const r1 = collide1D(1, 3, 2, 0, 1);
    expect(r1.v1).toBeCloseTo(-1, 9);
    expect(r1.v2).toBeCloseTo(2, 9);
    expect(r1.p0).toBeCloseTo(3, 9);
    expect(r1.p1).toBeCloseTo(3, 9);
    expect(r1.ke0).toBeCloseTo(4.5, 9);
    expect(r1.ke1).toBeCloseTo(4.5, 9);
    expect(r1.keLost).toBeCloseTo(0, 9);
    expect(r1.vcm).toBeCloseTo(1, 9);

    // collide1D(1, 3, 2, 0, 0.5): v1 0, v2 1.5, ke1 2.25, keLost 2.25, keLostShare 0.5
    const r2 = collide1D(1, 3, 2, 0, 0.5);
    expect(r2.v1).toBeCloseTo(0, 9);
    expect(r2.v2).toBeCloseTo(1.5, 9);
    expect(r2.ke1).toBeCloseTo(2.25, 9);
    expect(r2.keLost).toBeCloseTo(2.25, 9);
    expect(r2.keLostShare).toBeCloseTo(0.5, 9);

    // collide1D(1, 3, 2, 0, 0): v1 = v2 = 1, ke1 1.5, keLost 3, keLostShare 0.666666667
    const r3 = collide1D(1, 3, 2, 0, 0);
    expect(r3.v1).toBeCloseTo(1, 9);
    expect(r3.v2).toBeCloseTo(1, 9);
    expect(r3.ke1).toBeCloseTo(1.5, 9);
    expect(r3.keLost).toBeCloseTo(3, 9);
    expect(r3.keLostShare).toBeCloseTo(0.666666667, 9);

    // collide1D(1, 5, 3, 0, 0.9): v1 -2.125, v2 2.375
    const r4 = collide1D(1, 5, 3, 0, 0.9);
    expect(r4.v1).toBeCloseTo(-2.125, 9);
    expect(r4.v2).toBeCloseTo(2.375, 9);

    // collide1D(2, 2, 1, -3, 1): v1 -1.333333333, v2 3.666666667, p0 = p1 = 1, ke0 = ke1 = 8.5
    const r5 = collide1D(2, 2, 1, -3, 1);
    expect(r5.v1).toBeCloseTo(-1.333333333, 9);
    expect(r5.v2).toBeCloseTo(3.666666667, 9);
    expect(r5.p0).toBeCloseTo(1, 9);
    expect(r5.p1).toBeCloseTo(1, 9);
    expect(r5.ke0).toBeCloseTo(8.5, 9);
    expect(r5.ke1).toBeCloseTo(8.5, 9);

    // collide1D(1, 10, 1000, 0, 1): v1 -9.980019980, v2 0.019980020
    const r6 = collide1D(1, 10, 1000, 0, 1);
    expect(r6.v1).toBeCloseTo(-9.980019980, 9);
    expect(r6.v2).toBeCloseTo(0.019980020, 9);

    // collide1D(1, 10, 1000, 0, 0): v1 = v2 = 0.009990010
    const r7 = collide1D(1, 10, 1000, 0, 0);
    expect(r7.v1).toBeCloseTo(0.009990010, 9);
    expect(r7.v2).toBeCloseTo(0.009990010, 9);

    // collide1D(1, 0.5, 1, 0, 1, { minBounceSpeed: 1 }): eUsed 0, v1 = v2 = 0.25
    const r8 = collide1D(1, 0.5, 1, 0, 1, { minBounceSpeed: 1 });
    expect(r8.eUsed).toBe(0);
    expect(r8.v1).toBeCloseTo(0.25, 9);
    expect(r8.v2).toBeCloseTo(0.25, 9);

    // The same without the option: v1 0, v2 0.5, eUsed 1
    const r9 = collide1D(1, 0.5, 1, 0, 1);
    expect(r9.v1).toBeCloseTo(0, 9);
    expect(r9.v2).toBeCloseTo(0.5, 9);
    expect(r9.eUsed).toBe(1);

    // collide1D(1, 1, 1, 2, 1): they are separating, so v1 1, v2 2 (unchanged).
    const r10 = collide1D(1, 1, 1, 2, 1);
    expect(r10.v1).toBe(1);
    expect(r10.v2).toBe(2);
    expect(r10.approach).toBe(-1);
  });

  it('keLost1D and reducedMass', () => {
    // keLost1D(1, 3, 2, 0, 0.5) = 2.25; reducedMass(1, 2) = 0.666666667
    expect(keLost1D(1, 3, 2, 0, 0.5)).toBeCloseTo(2.25, 9);
    expect(reducedMass(1, 2)).toBeCloseTo(0.666666667, 9);
  });

  it('collide1D property test 1000 cases', () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 1000; i++) {
      const m1 = 0.001 + rng() * 1000;
      const m2 = 0.001 + rng() * 1000;
      const u1 = -50 + rng() * 100;
      const u2 = -50 + rng() * 100;
      const e = rng();

      const r = collide1D(m1, u1, m2, u2, e);
      
      // momentum kept (1e-9 relative)
      expect(momentumDefect([m1 * u1, m2 * u2], [m1 * r.v1, m2 * r.v2])).toBeLessThanOrEqual(1e-9);
      
      // ke1 <= ke0 (1e-12 relative)
      const maxKe = Math.max(r.ke0, r.ke1, 1e-12);
      expect((r.ke1 - r.ke0) / maxKe).toBeLessThanOrEqual(1e-12);
      
      // keLost equals keLost1D
      if (r.approach > 0) {
        // the difference can be tiny due to float rounding on subtraction
        // relative diff
        const expectedKeLost = keLost1D(m1, u1, m2, u2, e);
        expect(Math.abs(r.keLost - expectedKeLost) / Math.max(expectedKeLost, 1e-12)).toBeLessThanOrEqual(1e-9);
      } else {
        expect(r.keLost).toBeCloseTo(0, 9);
      }
      
      // for approaching bodies v2 - v1 = e (u1 - u2)
      if (r.approach > 0) {
        expect(r.v2 - r.v1).toBeCloseTo(e * (u1 - u2), 8); // e is used exactly in collide1D but there may be small precision drift
      }
    }
  });

  it('collide2D general tests', () => {
    const cos30 = Math.cos((30 * Math.PI) / 180);
    const sin30 = Math.sin((30 * Math.PI) / 180);

    const a = { m: 1, v: [3, 0] as [number, number] };
    const b = { m: 1, v: [0, 0] as [number, number] };
    
    // e = 1: va [0.75, -1.299038106], vb [2.25, 1.299038106], keLost 0, angleBetweenDeg 90
    const r1 = collide2D(a, b, 1, [cos30, sin30]);
    expect(r1.va[0]).toBeCloseTo(0.75, 9);
    expect(r1.va[1]).toBeCloseTo(-1.299038106, 9);
    expect(r1.vb[0]).toBeCloseTo(2.25, 9);
    expect(r1.vb[1]).toBeCloseTo(1.299038106, 9);
    expect(r1.keLost).toBeCloseTo(0, 9);
    expect(r1.angleBetweenDeg).toBeCloseTo(90, 9);

    // e = 0.5: va [1.3125, -0.974278579], vb [1.6875, 0.974278579], ke0 4.5, ke1 3.234375, keLost 1.265625, angleBetweenDeg 66.587 (0.005)
    const r2 = collide2D(a, b, 0.5, [cos30, sin30]);
    expect(r2.va[0]).toBeCloseTo(1.3125, 9);
    expect(r2.va[1]).toBeCloseTo(-0.974278579, 9);
    expect(r2.vb[0]).toBeCloseTo(1.6875, 9);
    expect(r2.vb[1]).toBeCloseTo(0.974278579, 9);
    expect(r2.ke0).toBeCloseTo(4.5, 9);
    expect(r2.ke1).toBeCloseTo(3.234375, 9);
    expect(r2.keLost).toBeCloseTo(1.265625, 9);
    expect(r2.angleBetweenDeg).toBeCloseTo(66.587, 2);

    // e = 0: va [1.875, -0.649519053], vb [1.125, 0.649519053], ke1 2.8125, keLost 1.6875
    const r3 = collide2D(a, b, 0, [cos30, sin30]);
    expect(r3.va[0]).toBeCloseTo(1.875, 9);
    expect(r3.va[1]).toBeCloseTo(-0.649519053, 9);
    expect(r3.vb[0]).toBeCloseTo(1.125, 9);
    expect(r3.vb[1]).toBeCloseTo(0.649519053, 9);
    expect(r3.ke1).toBeCloseTo(2.8125, 9);
    expect(r3.keLost).toBeCloseTo(1.6875, 9);

    // normal [1, 0], e = 1: the two exchange velocities
    const r4 = collide2D(a, b, 1, [1, 0]);
    expect(r4.va[0]).toBeCloseTo(0, 9);
    expect(r4.va[1]).toBeCloseTo(0, 9);
    expect(r4.vb[0]).toBeCloseTo(3, 9);
    expect(r4.vb[1]).toBeCloseTo(0, 9);

    // The same normal given as [2, 0] gives the same answer
    const r5 = collide2D(a, b, 1, [2, 0]);
    expect(r5.va[0]).toBeCloseTo(0, 9);
    expect(r5.va[1]).toBeCloseTo(0, 9);
    expect(r5.vb[0]).toBeCloseTo(3, 9);
    expect(r5.vb[1]).toBeCloseTo(0, 9);

    // A normal [0, 0] returns the velocities unchanged
    const r6 = collide2D(a, b, 1, [0, 0]);
    expect(r6.va[0]).toBe(3);
    expect(r6.va[1]).toBe(0);
    expect(r6.vb[0]).toBe(0);
    expect(r6.vb[1]).toBe(0);
  });

  it('collide2D uses the normal from a to b as given: a normal from b to a is no approach', () => {
    // Scene: two equal discs, mA=mB=1 kg, r=0.15 m, touching at (0,0) and (0.3,0); vA=(3,0), vB=(0,0), e=0.5.
    // A has its back to B along the normal [-1,0] (from b to a): the bodies are not closing in on it,
    // so nothing changes (the contract: approach <= 0 keeps the velocities).
    const a = { m: 1, v: [3, 0] as [number, number] };
    const b = { m: 1, v: [0, 0] as [number, number] };
    const r = collide2D(a, b, 0.5, [-1, 0]);

    expect(r.va[0]).toBeCloseTo(3, 9);
    expect(r.va[1]).toBeCloseTo(0, 9);
    expect(r.vb[0]).toBeCloseTo(0, 9);
    expect(r.vb[1]).toBeCloseTo(0, 9);
    expect(r.normalApproach).toBeCloseTo(-3, 9);
    expect(r.keLost).toBeCloseTo(0, 9);
  });

  it('collide2D leaves separating bodies alone (no velocity swap)', () => {
    // A (1 m/s) is behind B (2 m/s) along the normal [1,0] from A to B, so they separate.
    // Flipping the normal would swap their velocities, a collision that never happens.
    const a = { m: 1, v: [1, 0] as [number, number] };
    const b = { m: 1, v: [2, 0] as [number, number] };
    const r = collide2D(a, b, 1, [1, 0]);

    expect(r.va[0]).toBeCloseTo(1, 9);
    expect(r.vb[0]).toBeCloseTo(2, 9);
    expect(r.va[1]).toBeCloseTo(0, 9);
    expect(r.vb[1]).toBeCloseTo(0, 9);
    expect(r.normalApproach).toBeCloseTo(-1, 9);
    expect(r.keLost).toBeCloseTo(0, 9);
  });

  it('collide2D grazing contact at 89 degrees gives the exact hand values (not skipped)', () => {
    // Grazing: normal [cos 89deg, sin 89deg], e = 1: |va| stays within 0.1 % of 3
    const a = { m: 1, v: [3, 0] as [number, number] };
    const b = { m: 1, v: [0, 0] as [number, number] };
    const rad89 = (89 * Math.PI) / 180;
    const norm: [number, number] = [Math.cos(rad89), Math.sin(rad89)];
    
    const r = collide2D(a, b, 1, norm);
    
    const speedA = Math.sqrt(r.va[0] * r.va[0] + r.va[1] * r.va[1]);
    expect(Math.abs(speedA - 3) / 3).toBeLessThan(0.001); // 0.1%
    
    // Momentum is checked per component: a scalar sum would let an x error cancel a y error.
    expect(r.va[0] + r.vb[0]).toBeCloseTo(3, 9);
    expect(r.va[1] + r.vb[1]).toBeCloseTo(0, 9);
    expect(Math.abs(r.ke0 - r.ke1)).toBeLessThanOrEqual(1e-9);
    expect(Number.isNaN(r.va[0])).toBe(false);
    
    // Explicitly check that velocities changed properly (so collision wasn't just skipped).
    // The exact calculated values by hand are:
    // vA=(3 sin^2 89deg, -3 sin89deg cos89deg)
    // vB=(3 cos^2 89deg, 3 sin89deg cos89deg)
    const sin89 = Math.sin(rad89);
    const cos89 = Math.cos(rad89);
    const vATrueX = 3 * sin89 * sin89;
    const vATrueY = -3 * sin89 * cos89;
    const vBTrueX = 3 * cos89 * cos89;
    const vBTrueY = 3 * sin89 * cos89;
    
    expect(r.va[0]).toBeCloseTo(vATrueX, 9);
    expect(r.va[1]).toBeCloseTo(vATrueY, 9);
    expect(r.vb[0]).toBeCloseTo(vBTrueX, 9);
    expect(r.vb[1]).toBeCloseTo(vBTrueY, 9);
  });

  it('collide2D property test', () => {
    const rng = mulberry32(54321);
    for (let i = 0; i < 200; i++) {
      const a = { m: 1 + rng() * 10, v: [rng() * 10 - 5, rng() * 10 - 5] as [number, number] };
      const b = { m: 1 + rng() * 10, v: [rng() * 10 - 5, rng() * 10 - 5] as [number, number] };
      const e = rng();
      const n: [number, number] = [rng() * 2 - 1, rng() * 2 - 1];
      if (Math.abs(n[0]) < 1e-5 && Math.abs(n[1]) < 1e-5) continue;
      
      const r = collide2D(a, b, e, n);
      
      // momentum kept in each component (the scalar check below would let an x error cancel a y error)
      const pxBefore = a.m * a.v[0] + b.m * b.v[0];
      const pyBefore = a.m * a.v[1] + b.m * b.v[1];
      const pxAfter = a.m * r.va[0] + b.m * r.vb[0];
      const pyAfter = a.m * r.va[1] + b.m * r.vb[1];
      expect(Math.abs(pxAfter - pxBefore)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(pxBefore)));
      expect(Math.abs(pyAfter - pyBefore)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(pyBefore)));
      expect(momentumDefect([a.m * a.v[0], a.m * a.v[1], b.m * b.v[0], b.m * b.v[1]], 
                            [a.m * r.va[0], a.m * r.va[1], b.m * r.vb[0], b.m * r.vb[1]])).toBeLessThanOrEqual(1e-9);
      
      // keLost >= 0
      expect(r.keLost).toBeGreaterThanOrEqual(-1e-12);
      
      // the across-normal components unchanged
      const len = Math.sqrt(n[0] * n[0] + n[1] * n[1]);
      const nx = n[0] / len;
      const ny = n[1] / len;
      const tX = -ny;
      const tY = nx;
      
      const vA_t0 = a.v[0] * tX + a.v[1] * tY;
      const vA_t1 = r.va[0] * tX + r.va[1] * tY;
      expect(vA_t1).toBeCloseTo(vA_t0, 9);
      
      const vB_t0 = b.v[0] * tX + b.v[1] * tY;
      const vB_t1 = r.vb[0] * tX + r.vb[1] * tY;
      expect(vB_t1).toBeCloseTo(vB_t0, 9);
    }
  });

  it('contactNormal', () => {
    // contactNormal([0, 0], [3, 4]) = [0.6, 0.8]
    const n = contactNormal([0, 0], [3, 4]);
    expect(n).not.toBeNull();
    expect(n![0]).toBeCloseTo(0.6, 9);
    expect(n![1]).toBeCloseTo(0.8, 9);

    // coincident centres give null
    expect(contactNormal([1, 1], [1, 1])).toBeNull();
  });

  it('obliqueSetup', () => {
    // obliqueSetup(0.15, 0.15, 30, 2.5): offset 0.15, bStart [0, 0], normal [0.866025404, 0.5], aStart [-2.759807621, -0.15]
    const s1 = obliqueSetup(0.15, 0.15, 30, 2.5);
    expect(s1.offset).toBeCloseTo(0.15, 9);
    expect(s1.bStart[0]).toBeCloseTo(0, 9);
    expect(s1.bStart[1]).toBeCloseTo(0, 9);
    expect(s1.normal[0]).toBeCloseTo(0.866025404, 9);
    expect(s1.normal[1]).toBeCloseTo(0.5, 9);
    expect(s1.aStart[0]).toBeCloseTo(-2.759807621, 9);
    expect(s1.aStart[1]).toBeCloseTo(-0.15, 9);

    // obliqueSetup(0.15, 0.15, 0, 2.5): offset 0, aStart [-2.8, 0]
    const s2 = obliqueSetup(0.15, 0.15, 0, 2.5);
    expect(s2.offset).toBe(0);
    expect(s2.aStart[0]).toBe(-2.8);
    expect(s2.aStart[1]).toBeCloseTo(0, 9);

    // Feeding aStart and bStart to contactNormal at the moment of contact (A moved `travel` along +x) gives obliqueSetup's normal (1e-9)
    const n = contactNormal([s1.aStart[0] + 2.5, s1.aStart[1]], s1.bStart);
    expect(n![0]).toBeCloseTo(s1.normal[0], 9);
    expect(n![1]).toBeCloseTo(s1.normal[1], 9);
  });

  it('simulateChain1D 5 equal balls', () => {
    const ballsTemplate = [
      { x: -0.612, r: 0.15, m: 1, v: 0 },
      { x: -0.306, r: 0.15, m: 1, v: 0 },
      { x: 0, r: 0.15, m: 1, v: 0 },
      { x: 0.306, r: 0.15, m: 1, v: 0 },
      { x: 0.612, r: 0.15, m: 1, v: 0 }
    ];

    // e = 1: v [0, 0, 0, 0, 2], 4 events, ke0 = ke1 = 2, p0 = p1 = 2, settled true
    const b1 = ballsTemplate.map(b => ({ ...b }));
    b1[0].v = 2;
    const r1 = simulateChain1D(b1, 1);
    expect(r1.v[0]).toBeCloseTo(0, 9);
    expect(r1.v[4]).toBeCloseTo(2, 9);
    expect(r1.events.length).toBe(4);
    expect(r1.ke0).toBeCloseTo(2, 9);
    expect(r1.ke1).toBeCloseTo(2, 9);
    expect(r1.p0).toBeCloseTo(2, 9);
    expect(r1.p1).toBeCloseTo(2, 9);
    expect(r1.settled).toBe(true);

    // velocities [2, 2, 0, 0, 0], e = 1: v [0, 0, 0, 2, 2] (two in, two out), 6 events
    const b2 = ballsTemplate.map(b => ({ ...b }));
    b2[0].v = 2; b2[1].v = 2;
    const r2 = simulateChain1D(b2, 1);
    expect(r2.v[0]).toBeCloseTo(0, 9);
    expect(r2.v[1]).toBeCloseTo(0, 9);
    expect(r2.v[2]).toBeCloseTo(0, 9);
    expect(r2.v[3]).toBeCloseTo(2, 9);
    expect(r2.v[4]).toBeCloseTo(2, 9);
    expect(r2.events.length).toBe(6);

    // velocities [2, 2, 2, 0, 0], e = 1: v [0, 0, 2, 2, 2], 6 events
    const b3 = ballsTemplate.map(b => ({ ...b }));
    b3[0].v = 2; b3[1].v = 2; b3[2].v = 2;
    const r3 = simulateChain1D(b3, 1);
    expect(r3.v[0]).toBeCloseTo(0, 9);
    expect(r3.v[1]).toBeCloseTo(0, 9);
    expect(r3.v[2]).toBeCloseTo(2, 9);
    expect(r3.v[3]).toBeCloseTo(2, 9);
    expect(r3.v[4]).toBeCloseTo(2, 9);
    expect(r3.events.length).toBe(6);

    // e = 0.98, velocities [2, 0, 0, 0, 0]: the last ball leaves at 2 x 0.99^4 = 1.92119202 (1e-6); momentum kept (1e-9); ke1 < ke0; more than 4 events; settled true
    const b4 = ballsTemplate.map(b => ({ ...b }));
    b4[0].v = 2;
    const r4 = simulateChain1D(b4, 0.98);
    expect(r4.v[4]).toBeCloseTo(1.92119202, 6);
    expect(r4.p1).toBeCloseTo(r4.p0, 9);
    expect(r4.ke1).toBeLessThan(r4.ke0);
    expect(r4.events.length).toBeGreaterThan(4);
    expect(r4.settled).toBe(true);
  });

  it('simulateChain1D three balls', () => {
    // three balls (r 0.15 for all) at x = 0, 0.306, 0.612 with masses [1, 3, 1] and velocities [2, 0, 0], e = 1
    const balls = [
      { x: 0, r: 0.15, m: 1, v: 2 },
      { x: 0.306, r: 0.15, m: 3, v: 0 },
      { x: 0.612, r: 0.15, m: 1, v: 0 }
    ];
    // final v [-1, 0.5, 1.5], 2 events, p1 = 2, ke1 = 2
    const r = simulateChain1D(balls, 1);
    expect(r.v[0]).toBeCloseTo(-1, 9);
    expect(r.v[1]).toBeCloseTo(0.5, 9);
    expect(r.v[2]).toBeCloseTo(1.5, 9);
    expect(r.events.length).toBe(2);
    expect(r.p1).toBeCloseTo(2, 9);
    expect(r.ke1).toBeCloseTo(2, 9);
  });

  it('simulateChain1D minBounceSpeed', () => {
    // e = 0.9 and velocities [2, 0, 0, 0, 0]: the last ball leaves at 2 x 0.95^4 = 1.6290125 (1e-6) with and without minBounceSpeed 1 (only the slow later collisions change)
    const ballsTemplate = [
      { x: -0.612, r: 0.15, m: 1, v: 0 },
      { x: -0.306, r: 0.15, m: 1, v: 0 },
      { x: 0, r: 0.15, m: 1, v: 0 },
      { x: 0.306, r: 0.15, m: 1, v: 0 },
      { x: 0.612, r: 0.15, m: 1, v: 0 }
    ];
    const b1 = ballsTemplate.map(b => ({ ...b }));
    b1[0].v = 2;
    const rWith = simulateChain1D(b1, 0.9, { minBounceSpeed: 1 });
    
    const b2 = ballsTemplate.map(b => ({ ...b }));
    b2[0].v = 2;
    const rWithout = simulateChain1D(b2, 0.9);

    expect(rWith.v[4]).toBeCloseTo(1.6290125, 6);
    expect(rWithout.v[4]).toBeCloseTo(1.6290125, 6);
    expect(rWith.settled).toBe(true);
    expect(rWithout.settled).toBe(true);
    expect(rWith.p1).toBeCloseTo(rWith.p0, 9);
    expect(rWithout.p1).toBeCloseTo(rWithout.p0, 9);

    // with the option the four slow balls end within 0.001 m/s of each other (they stuck: about 0.0927 each)
    const vMaxW = Math.max(rWith.v[0], rWith.v[1], rWith.v[2], rWith.v[3]);
    const vMinW = Math.min(rWith.v[0], rWith.v[1], rWith.v[2], rWith.v[3]);
    expect(vMaxW - vMinW).toBeLessThan(0.001);
    expect(rWith.v[0]).toBeCloseTo(0.0927, 3);

    // without it their speeds spread by more than 0.01 m/s
    const vMaxWO = Math.max(rWithout.v[0], rWithout.v[1], rWithout.v[2], rWithout.v[3]);
    const vMinWO = Math.min(rWithout.v[0], rWithout.v[1], rWithout.v[2], rWithout.v[3]);
    expect(vMaxWO - vMinWO).toBeGreaterThan(0.01);
  });

  it('simulateChain1D non-meeting balls', () => {
    // A pair that never meets (both moving apart) gives 0 events and the same velocities.
    const balls = [
      { x: 0, r: 0.15, m: 1, v: -1 },
      { x: 0.4, r: 0.15, m: 1, v: 1 }
    ];
    const r = simulateChain1D(balls, 1);
    expect(r.events.length).toBe(0);
    expect(r.v[0]).toBe(-1);
    expect(r.v[1]).toBe(1);
  });

  it('simulateChain1D simultaneous 3-body tie: the lowest pair first, pair by pair (the contract rule)', () => {
    // Balls 0 and 1 meet at t = 0.1, and so do balls 1 and 2 (ties: lowest i). The contract resolves
    // pair (0,1) first with collide1D, then pair (1,2) on the new velocities, then (0,1) again.
    // A symmetric solver that applies both impulses at once would give another answer (for e = 0.5,
    // v = [-0.5, 0, 0.5]); that is a different model and is not what the contract asks for.
    // Hand check: pair 1 gives 0.25, 0.75; pair 2 gives -0.5625, 0.3125; pair 1 again gives -0.359375, 0.046875.
    const balls = [
      { x: -0.4, r: 0.15, m: 1, v: 1 },
      { x: 0, r: 0.15, m: 1, v: 0 },
      { x: 0.4, r: 0.15, m: 1, v: -1 }
    ];
    const r = simulateChain1D(balls, 0.5);
    
    expect(r.v[0]).toBeCloseTo(-0.359375, 9);
    expect(r.v[1]).toBeCloseTo(0.046875, 9);
    expect(r.v[2]).toBeCloseTo(0.3125, 9);
    
    // Total energy is sequentially reduced with 3 events
    expect(r.events.length).toBe(3);
    for (const ev of r.events) {
      expect(ev.t).toBeCloseTo(0.1, 9); // All happen at exactly t=0.1
    }
  });

  it('simulateChain1D unequal gaps meeting at the same instant: float rounding keeps the lowest-i order', () => {
    // Balls at 0, 0.4 and 1.0 (r = 0.15): both meetings are at t = 0.1 s, but in floating point the two
    // gaps differ by about 1e-16, so a plain "<" would take pair 1 first. The contract's rule: lowest pair
    // first, pair by pair: (0,1) gives 0.25, 0.75; (1,2) gives -2.0625, -0.1875; (0,1) gives -1.484375, -0.328125.
    const balls = [
      { x: 0, r: 0.15, m: 1, v: 1 },
      { x: 0.4, r: 0.15, m: 1, v: 0 },
      { x: 1.0, r: 0.15, m: 1, v: -3 }
    ];
    const r = simulateChain1D(balls, 0.5);

    expect(r.events.map((ev) => ev.i)).toEqual([0, 1, 0]);
    expect(r.v[0]).toBeCloseTo(-1.484375, 9);
    expect(r.v[1]).toBeCloseTo(-0.328125, 9);
    expect(r.v[2]).toBeCloseTo(-0.1875, 9);
    expect(momentumDefect([1, 0, -3], r.v)).toBeLessThanOrEqual(1e-9);
  });

  it('simulateChain1D the same tie moved 1e6 m along the line keeps the same order', () => {
    // A position offset must not change the physics. At 1e6 m the gaps are rounded at about 1e-10 m,
    // well inside the noise bound for a meeting time (1e-15 of the position size, in seconds).
    const off = 1e6;
    const balls = [
      { x: off + 0, r: 0.15, m: 1, v: 1 },
      { x: off + 0.4, r: 0.15, m: 1, v: 0 },
      { x: off + 1.0, r: 0.15, m: 1, v: -3 }
    ];
    const r = simulateChain1D(balls, 0.5);

    expect(r.events.map((ev) => ev.i)).toEqual([0, 1, 0]);
    expect(r.v[0]).toBeCloseTo(-1.484375, 6);
    expect(r.v[1]).toBeCloseTo(-0.328125, 6);
    expect(r.v[2]).toBeCloseTo(-0.1875, 6);
  });

  it('the result types describe what the functions return', () => {
    const ball: ChainBall = { x: 0, r: 0.15, m: 1, v: 1 };
    const chain: ChainResult = simulateChain1D([ball], 0.5);
    const ev: ChainEvent = { t: 0.1, i: 0, approach: 1, eUsed: 0.5 };
    const c1: Collision1D = collide1D(1, 3, 2, 0, 1);
    const body: Body2D = { m: 1, v: [0, 0] };
    const n: V2 = [1, 0];
    const c2: Collision2D = collide2D(body, body, 1, n);

    expect(chain.settled).toBe(true);
    expect(chain.v).toEqual([1]);
    expect(ev.eUsed).toBe(0.5);
    expect(c1.v1).toBeCloseTo(-1, 9);
    expect(c2.keLost).toBeCloseTo(0, 9);
  });

  it('angleBetweenDeg', () => {
    // angleBetweenDeg([1, 0], [0, 2]) = 90; ([1, 0], [-1, 0]) = 180; ([0, 0], [1, 0]) = null
    expect(angleBetweenDeg([1, 0], [0, 2])).toBeCloseTo(90, 9);
    expect(angleBetweenDeg([1, 0], [-1, 0])).toBeCloseTo(180, 9);
    expect(angleBetweenDeg([0, 0], [1, 0])).toBeNull();
  });

  it('momentumDefect', () => {
    // momentumDefect([3], [3.003]) = 0.000999000999 (1e-9); ([0], [0]) = 0
    expect(momentumDefect([3], [3.003])).toBeCloseTo(0.000999000999, 9);
    expect(momentumDefect([0], [0])).toBe(0);
  });
});
