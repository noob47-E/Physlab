import { describe, expect, it } from 'vitest';
import {
  TapeLike,
  SeriesKind,
  series,
  springSeries,
  valueAt,
  playheadX,
} from '../src/renderer/src/sim/graphSeries';

class FakeTape implements TapeLike {
  public rate = 240;
  public first = 0;
  public last = 240; // 1 second at 240 steps/s

  timeOf(step: number): number {
    return step / this.rate;
  }

  record(step: number): Float32Array | null {
    if (step < this.first || step > this.last) return null;
    const t = this.timeOf(step);
    
    // y = 5 - 1/2 * 9.81 * t^2
    // vy = -9.81 * t
    const y = 5 - 0.5 * 9.81 * t * t;
    const vy = -9.81 * t;

    const arr = new Float32Array(13);
    arr[0] = 0; // x
    arr[1] = y; // y
    arr[2] = 0; // z
    
    // Quaternions
    arr[3] = 0; // qx
    arr[4] = 0; // qy
    arr[5] = 0; // qz
    arr[6] = 1; // qw
    
    arr[7] = 0; // vx
    arr[8] = vy; // vy
    arr[9] = 0; // vz
    
    // Angular velocity
    arr[10] = 0;
    arr[11] = 0;
    arr[12] = 0;

    return arr;
  }
}

class FakeSpringTape implements TapeLike {
  public rate = 240;
  public first = 0;
  public last = 240;

  timeOf(step: number): number {
    return step / this.rate;
  }

  record(step: number): Float32Array | null {
    if (step < this.first || step > this.last) return null;
    
    const arr = new Float32Array(13);
    // Body a is at x = 3.6, y = 0, z = 0
    arr[0] = 3.6; // x
    arr[1] = 0;   // y
    arr[2] = 0;   // z
    
    // Others are 0
    return arr;
  }
}


describe('graphSeries', () => {
  it('series gives y and vy matching the formula at every kept point', () => {
    const tape = new FakeTape();
    const kinds: SeriesKind[] = ['y', 'vy', 'ke', 'pe'];
    const result = series(tape, 0, kinds, {
      mass: 1,
      g: 9.81,
      datumY: 0,
      maxPoints: 600,
    });

    expect(result.t.length).toBeGreaterThan(0);
    expect(result.t.length).toBeLessThanOrEqual(600);
    
    // First and last steps are kept
    expect(result.t[0]).toBe(0);
    expect(result.t[result.t.length - 1]).toBe(1);

    for (let i = 0; i < result.t.length; i++) {
      const t = result.t[i];
      const y = result.values['y'][i];
      const vy = result.values['vy'][i];
      const expectedY = 5 - 0.5 * 9.81 * t * t;
      const expectedVy = -9.81 * t;

      expect(Math.abs(y - expectedY)).toBeLessThan(1e-5);
      expect(Math.abs(vy - expectedVy)).toBeLessThan(1e-5);

      const ke = result.values['ke'][i];
      const pe = result.values['pe'][i];
      
      // Total energy at t=0 is m*g*h = 1 * 9.81 * 5 = 49.05
      const totalEnergy = ke + pe;
      expect(Math.abs(totalEnergy - 49.05)).toBeLessThan(1e-3);
    }
  });

  it('series upTo cuts at the playhead', () => {
    const tape = new FakeTape();
    // 120 steps is 0.5s
    const result = series(tape, 0, ['y'], {
      mass: 1,
      g: 9.81,
      datumY: 0,
      maxPoints: 600,
      upTo: 120,
    });

    expect(result.t[result.t.length - 1]).toBe(0.5);
  });

  it('springSeries calculates correct elastic potential energy', () => {
    const tape = new FakeSpringTape();
    
    // k = 50, L = 3, distance = 3.6
    // E = 0.5 * 50 * (3.6 - 3)^2 = 25 * 0.36 = 9.0 J
    const result = springSeries(tape, 0, null, [0, 0, 0], 50, 3, 600);
    // JM: an empty series would pass the loop below with no check at all
    expect(result.t.length).toBeGreaterThan(0);

    for (let i = 0; i < result.t.length; i++) {
      expect(Math.abs(result.elastic[i] - 9.0)).toBeLessThan(1e-5);
    }
  });

  it('valueAt interpolates and returns null outside', () => {
    const t = [0, 1, 2];
    const values = [0, 10, 20];

    expect(valueAt(t, values, -1)).toBeNull();
    expect(valueAt(t, values, 3)).toBeNull();
    
    expect(valueAt(t, values, 0)).toBe(0);
    expect(valueAt(t, values, 0.5)).toBe(5);
    expect(valueAt(t, values, 1)).toBe(10);
    expect(valueAt(t, values, 1.25)).toBe(12.5);
    expect(valueAt(t, values, 2)).toBe(20);
  });

  it('playheadX maps correctly', () => {
    expect(playheadX(5, 5, 15, 100)).toBe(0);
    expect(playheadX(10, 5, 15, 100)).toBe(50);
    expect(playheadX(15, 5, 15, 100)).toBe(100);
  });
});
