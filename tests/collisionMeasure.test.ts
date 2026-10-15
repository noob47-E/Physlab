import { describe, it, expect } from 'vitest';
import {
  totalsOf,
  conservation,
  measureContact,
  explainCollisionGap,
  BodyAt,
  SystemTotals,
  Conservation,
  ContactSample,
  MeasuredContact,
  GapInput,
  GapReport,
  V3
} from '../src/renderer/src/sim/collisionMeasure';
import { collide1D } from '../src/renderer/src/sim/collisionMath';
import { LIMITS } from '../src/renderer/src/sim/limits';

describe('collisionMeasure', () => {
  it('type exports check', () => {
    // to comply with noUnusedLocals, instantiate type exports
    const _typeBodyAt: BodyAt | undefined = undefined;
    const _typeSystemTotals: SystemTotals | undefined = undefined;
    const _typeConservation: Conservation | undefined = undefined;
    const _typeContactSample: ContactSample | undefined = undefined;
    const _typeMeasuredContact: MeasuredContact | undefined = undefined;
    const _typeGapInput: GapInput | undefined = undefined;
    const _typeGapReport: GapReport | undefined = undefined;
    const _typeV3: V3 | undefined = undefined;
    
    expect(_typeBodyAt).toBeUndefined();
    expect(_typeSystemTotals).toBeUndefined();
    expect(_typeConservation).toBeUndefined();
    expect(_typeContactSample).toBeUndefined();
    expect(_typeMeasuredContact).toBeUndefined();
    expect(_typeGapInput).toBeUndefined();
    expect(_typeGapReport).toBeUndefined();
    expect(_typeV3).toBeUndefined();
  });

  describe('totalsOf', () => {
    it('totalsOf for two bodies', () => {
      const bodies: BodyAt[] = [
        { id: 'A', mass: 1, velocity: [3, 0, 0] },
        { id: 'B', mass: 2, velocity: [0, 0, 0] }
      ];
      const t = totalsOf(bodies);
      expect(t.p[0]).toBeCloseTo(3, 9);
      expect(t.p[1]).toBeCloseTo(0, 9);
      expect(t.p[2]).toBeCloseTo(0, 9);
      expect(t.pMag).toBeCloseTo(3, 9);
      expect(t.ke).toBeCloseTo(4.5, 9);
      expect(t.vcm[0]).toBeCloseTo(1, 9);
      expect(t.vcm[1]).toBeCloseTo(0, 9);
      expect(t.vcm[2]).toBeCloseTo(0, 9);
      expect(t.mass).toBeCloseTo(3, 9);
    });

    it('totalsOf for empty array', () => {
      const t = totalsOf([]);
      expect(t.p[0]).toBe(0);
      expect(t.p[1]).toBe(0);
      expect(t.p[2]).toBe(0);
      expect(t.pMag).toBe(0);
      expect(t.ke).toBe(0);
      expect(t.vcm[0]).toBe(0);
      expect(t.vcm[1]).toBe(0);
      expect(t.vcm[2]).toBe(0);
      expect(t.mass).toBe(0);
      expect(Number.isNaN(t.p[0])).toBe(false);
      expect(Number.isNaN(t.vcm[0])).toBe(false);
    });
  });

  describe('conservation', () => {
    const before: SystemTotals = {
      p: [3, 0, 0], pMag: 3, ke: 4.5, vcm: [1, 0, 0], mass: 3
    };

    it('conservation with expected values 1', () => {
      const after = totalsOf([
        { id: 'A', mass: 1, velocity: [0, 0, 0] },
        { id: 'B', mass: 2, velocity: [1.5, 0, 0] }
      ]);
      const c = conservation(before, after);
      expect(c.pDefect).toBeCloseTo(0, 9);
      expect(c.keLost).toBeCloseTo(2.25, 9);
      expect(c.keLostShare).toBeCloseTo(0.5, 9);
      expect(c.deltaVcm).toBeCloseTo(0, 9);
    });

    it('conservation when they stuck', () => {
      const after = totalsOf([
        { id: 'A', mass: 1, velocity: [1, 0, 0] },
        { id: 'B', mass: 2, velocity: [1, 0, 0] }
      ]);
      const c = conservation(before, after);
      expect(c.keLost).toBeCloseTo(3, 9);
      expect(c.keLostShare).toBeCloseTo(0.666666667, 9);
    });

    it('conservation with 0.000999000999 defect', () => {
      const after = totalsOf([
        { id: 'A', mass: 1, velocity: [0, 0, 0] },
        { id: 'B', mass: 2, velocity: [1.5015, 0, 0] }
      ]);
      const c = conservation(before, after);
      // after p = 3.003
      // pDefect = |3.003 - 3| / max(3, 3.003, 1e-12) = 0.003 / 3.003 = 0.000999000999
      expect(c.pDefect).toBeCloseTo(0.000999000999, 9);
    });
  });

  describe('measureContact', () => {
    it('measureContact for 1D', () => {
      const c: ContactSample = {
        a: 'A', b: 'B',
        massA: 1, massB: 2,
        vBeforeA: [3, 0, 0], vBeforeB: [0, 0, 0],
        vAfterA: [0, 0, 0], vAfterB: [1.5, 0, 0],
        normal: [1, 0, 0],
        eUsed: 0.5, time: 0, step: 0
      };
      const m = measureContact(c);
      expect(m.approach).toBeCloseTo(3, 9);
      expect(m.separation).toBeCloseTo(1.5, 9);
      expect(m.eMeasured).toBeCloseTo(0.5, 9);
      expect(m.impulse).toBeCloseTo(3, 9);
      expect(m.keLost).toBeCloseTo(2.25, 9);
      expect(m.pDefect).toBeCloseTo(0, 9);
    });

    it('measureContact for 45 degree normal', () => {
      const n: V3 = [0.707106781, 0.707106781, 0];
      const c: ContactSample = {
        a: 'A', b: 'B',
        massA: 1, massB: 2,
        vBeforeA: [3 * n[0], 3 * n[1], 0], vBeforeB: [0, 0, 0],
        vAfterA: [0, 0, 0], vAfterB: [1.5 * n[0], 1.5 * n[1], 0],
        normal: n,
        eUsed: 0.5, time: 0, step: 0
      };
      const m = measureContact(c);
      expect(m.approach).toBeCloseTo(3, 6);
      expect(m.separation).toBeCloseTo(1.5, 6);
      expect(m.eMeasured).toBeCloseTo(0.5, 6);
      expect(m.impulse).toBeCloseTo(3, 6);
      expect(m.keLost).toBeCloseTo(2.25, 6);
      expect(m.pDefect).toBeCloseTo(0, 6);
    });

    it('measureContact with approach 0 gives eMeasured null', () => {
      const c: ContactSample = {
        a: 'A', b: 'B',
        massA: 1, massB: 2,
        vBeforeA: [0, 0, 0], vBeforeB: [0, 0, 0],
        vAfterA: [0, 0, 0], vAfterB: [0, 0, 0],
        normal: [1, 0, 0],
        eUsed: 0.5, time: 0, step: 0
      };
      const m = measureContact(c);
      expect(m.approach).toBeCloseTo(0, 9);
      expect(m.eMeasured).toBeNull();
    });

    it('measureContact oblique', () => {
      const c: ContactSample = {
        a: 'A', b: 'B',
        massA: 1, massB: 1,
        vBeforeA: [3, 0, 0], vBeforeB: [0, 0, 0],
        vAfterA: [1.3125, -0.974278579, 0], vAfterB: [1.6875, 0.974278579, 0],
        normal: [0.866025404, 0.5, 0],
        eUsed: 0.5, time: 0, step: 0
      };
      const m = measureContact(c);
      expect(m.approach).toBeCloseTo(2.598076211, 8);
      expect(m.separation).toBeCloseTo(1.299038106, 8);
      expect(m.eMeasured).toBeCloseTo(0.5, 8);
      expect(m.keLost).toBeCloseTo(1.265625, 8);
    });
  });

  describe('explainCollisionGap', () => {
    it('exact', () => {
      const rep = explainCollisionGap({
        mA: 1, uA: 3, mB: 2, uB: 0, eA: 0.5, eB: 0.5, eAsked: 0.5,
        measured: { vA: 0, vB: 1.5 }
      });
      expect(rep.percent).toBeCloseTo(0, 9);
      expect(rep.within).toBe(true);
      expect(rep.explained).toBe(true);
      expect(rep.reason).toBeNull();
    });

    it('slow', () => {
      const rep = explainCollisionGap({
        mA: 1, uA: 0.5, mB: 1, uB: 0, eA: 1, eB: 1, eAsked: 1,
        measured: { vA: 0.25, vB: 0.25 }
      });
      expect(rep.predicted.vA).toBeCloseTo(0, 9);
      expect(rep.predicted.vB).toBeCloseTo(0.5, 9);
      expect(rep.percent).toBeCloseTo(50, 9);
      expect(rep.within).toBe(false);
      expect(rep.explained).toBe(true);
      expect(rep.reason?.key).toBe('bounceThreshold');
      expect(rep.sentence.startsWith(LIMITS.bounceThreshold.sentence)).toBe(true);
      expect(rep.sentence).toContain('0.5'); // names 0.5 m/s
    });

    it('larger of two', () => {
      const rep = explainCollisionGap({
        mA: 1, uA: 3, mB: 2, uB: 0, eA: 0.2, eB: 0.9, eAsked: 0.2,
        measured: { vA: -0.8, vB: 1.9 }
      });
      expect(rep.predicted.vA).toBeCloseTo(0.6, 9);
      expect(rep.predicted.vB).toBeCloseTo(1.2, 9);
      expect(rep.explained).toBe(true);
      expect(rep.reason?.key).toBe('maxRestitution');
      expect(rep.sentence.startsWith(LIMITS.maxRestitution.sentence)).toBe(true);
      expect(rep.sentence).toContain('0.9');
      expect(rep.sentence).toContain('0.2');
    });

    it('unexplained', () => {
      const rep = explainCollisionGap({
        mA: 1, uA: 3, mB: 2, uB: 0, eA: 0.5, eB: 0.5, eAsked: 0.5,
        measured: { vA: 0, vB: 1.545 } // 3% off on B
      });
      expect(rep.within).toBe(false);
      expect(rep.explained).toBe(false);
      expect(rep.reason).toBeNull();
      expect(rep.sentence).toContain('no known cause accounts for it');
    });

    it('unexplained within tolerance 5', () => {
      const rep = explainCollisionGap({
        mA: 1, uA: 3, mB: 2, uB: 0, eA: 0.5, eB: 0.5, eAsked: 0.5,
        measured: { vA: 0, vB: 1.545 },
        tolerancePercent: 5
      });
      expect(rep.within).toBe(true);
    });

    it('slow case with threshold option set to 0.4', () => {
      const rep = explainCollisionGap({
        mA: 1, uA: 0.5, mB: 1, uB: 0, eA: 1, eB: 1, eAsked: 1,
        measured: { vA: 0.25, vB: 0.25 },
        minBounceSpeed: 0.4
      });
      // approach = 0.5, above 0.4 threshold. It should not be explained by bounceThreshold
      expect(rep.explained).toBe(false);
    });

    it('closest match: bounceThreshold and maxRestitution both within tolerance', () => {
      // mA = mB = 1, uA = 0.5, uB = 0, eA = 0.004, eB = 0, eAsked = 1
      // measured 0.249 and 0.251
      // bounceThreshold (e=1 but approach 0.5 < 1) would give both at 0.25
      // maxRestitution (e=max(0.004,0)=0.004) gives different result
      // We expect maxRestitution to be chosen (closest match)
      const rep = explainCollisionGap({
        mA: 1, uA: 0.5, mB: 1, uB: 0, eA: 0.004, eB: 0, eAsked: 1,
        measured: { vA: 0.249, vB: 0.251 }
      });
      expect(rep.explained).toBe(true);
      expect(rep.reason?.key).toBe('maxRestitution');
    });

    it('property test: 300 random seeds', () => {
      for (let i = 0; i < 300; i++) {
        // pseudo-random parameters
        const mA = 0.1 + (i % 10);
        const mB = 0.1 + ((i * 3) % 10);
        const uA = 1 + (i % 20); // enforce approach > 1
        const uB = -1 - (i % 20);
        const eA = (i % 11) / 10;
        const eB = ((i * 7) % 11) / 10;
        const eAsked = ((i * 13) % 11) / 10;
        
        // test 1: measured is exactly collide1D with e = max(eA, eB)
        const eMax = Math.max(eA, eB);
        const maxMeas = collide1D(mA, uA, mB, uB, eMax);
        const rep1 = explainCollisionGap({
          mA, uA, mB, uB, eA, eB, eAsked,
          measured: { vA: maxMeas.v1, vB: maxMeas.v2 }
        });
        expect(rep1.explained).toBe(true);
        expect(Number.isNaN(rep1.percent)).toBe(false);

        // test 2: measured is exactly collide1D with eAsked
        const askedMeas = collide1D(mA, uA, mB, uB, eAsked);
        const rep2 = explainCollisionGap({
          mA, uA, mB, uB, eA, eB, eAsked,
          measured: { vA: askedMeas.v1, vB: askedMeas.v2 }
        });
        expect(rep2.within).toBe(true);
        expect(Number.isNaN(rep2.percent)).toBe(false);
      }
    });
  });
});
