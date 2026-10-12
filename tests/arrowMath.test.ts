import { describe, it, expect } from 'vitest';
import {
  ArrowKind,
  ARROW_SCALE,
  sceneScale,
  arrowGeometry,
  labelPosition,
  scaleKeyText,
  multiflashSteps
} from '../src/renderer/src/render/sandbox/arrowMath';

describe('arrowMath', () => {
  it('imports all exports to satisfy noUnusedLocals', () => {
    const dummyKind: ArrowKind = 'velocity';
    expect(dummyKind).toBeDefined();
    expect(ARROW_SCALE).toBeDefined();
    expect(sceneScale).toBeTypeOf('function');
    expect(arrowGeometry).toBeTypeOf('function');
    expect(labelPosition).toBeTypeOf('function');
    expect(scaleKeyText).toBeTypeOf('function');
    expect(multiflashSteps).toBeTypeOf('function');
  });

  it('a velocity of (2, 0, 0) at the ARROW_SCALE gives a 1 m arrow', () => {
    const scale = ARROW_SCALE.velocity.metresPer;
    const geom = arrowGeometry([0, 0, 0], [2, 0, 0], scale, 100);
    expect(geom.length).toBe(1);
  });

  it('arrowGeometry keeps shaftRadius × 2 × pixelsPerMetre = 3 px at two zooms', () => {
    const scale = ARROW_SCALE.velocity.metresPer;
    const geom100 = arrowGeometry([0, 0, 0], [2, 0, 0], scale, 100);
    expect(geom100.shaftRadius * 2 * 100).toBe(3);
    
    const geom200 = arrowGeometry([0, 0, 0], [2, 0, 0], scale, 200);
    expect(geom200.shaftRadius * 2 * 200).toBe(3);
  });

  it('a tiny vector is not visible', () => {
    const scale = ARROW_SCALE.velocity.metresPer;
    const geom = arrowGeometry([0, 0, 0], [0.01, 0, 0], scale, 100);
    expect(geom.visible).toBe(false);
  });

  it('labelPosition is offsetPx/pixelsPerMetre beyond the tip along dir', () => {
    const tip: [number, number, number] = [1, 2, 3];
    const dir: [number, number, number] = [0, 1, 0];
    const offsetPx = 10;
    const ppm = 100;
    const pos = labelPosition(tip, dir, ppm, offsetPx);
    expect(pos[0]).toBeCloseTo(1);
    expect(pos[1]).toBeCloseTo(2.1);
    expect(pos[2]).toBeCloseTo(3);
  });

  it('scaleKeyText text format', () => {
    expect(scaleKeyText('velocity', 0.5)).toBe('1 m = 2 m/s');
    expect(scaleKeyText('force', 0.1)).toBe('1 m = 10 N');
  });

  it('multiflashSteps(0, 240, 240, 0.1) = [0, 24, 48, ..., 240]', () => {
    const steps = multiflashSteps(0, 240, 240, 0.1);
    expect(steps.length).toBe(11);
    expect(steps[0]).toBe(0);
    expect(steps[1]).toBe(24);
    expect(steps[10]).toBe(240);
  });

  it('multiflashSteps(0, 240, 240, 0) returns [] and finishes', () => {
    const steps = multiflashSteps(0, 240, 240, 0);
    expect(steps).toEqual([]);
  });

  it('sceneScale(kind, 10, -9.81) finishes and equals sceneScale(kind, 10, 9.81)', () => {
    const scaleNeg = sceneScale('acceleration', 10, -9.81);
    const scalePos = sceneScale('acceleration', 10, 9.81);
    expect(scaleNeg).toBe(scalePos);
    expect(scaleNeg).toBeDefined();
  });

  it('with a free fall y = −½ 9.81 t² the gaps between the first four flash positions are 0.0491, 0.1472, 0.2453 m (1 : 3 : 5, to 1e-4)', () => {
    // y = -1/2 * 9.81 * t^2
    const steps = multiflashSteps(0, 240, 240, 0.1); // t = 0, 0.1, 0.2, 0.3
    const positions = steps.slice(0, 4).map(s => {
      const t = s / 240; // 0, 0.1, 0.2, 0.3
      return -0.5 * 9.81 * t * t;
    });
    // gaps: 
    // g1 = |pos[0] - pos[1]| = 0.04905
    // g2 = |pos[1] - pos[2]| = 0.14715
    // g3 = |pos[2] - pos[3]| = 0.24525
    const gap1 = Math.abs(positions[0] - positions[1]);
    const gap2 = Math.abs(positions[1] - positions[2]);
    const gap3 = Math.abs(positions[2] - positions[3]);

    expect(Math.abs(gap1 - 0.0491)).toBeLessThan(1e-4);
    expect(Math.abs(gap2 - 0.1472)).toBeLessThan(1e-4);
    expect(Math.abs(gap3 - 0.2453)).toBeLessThan(1e-4);
    
    // Check 1:3:5 ratios to 1e-4
    expect(Math.abs(gap2 / gap1 - 3)).toBeLessThan(1e-4);
    expect(Math.abs(gap3 / gap1 - 5)).toBeLessThan(1e-4);
  });

  it('sceneScale keeps a typical arrow between 5 % and 25 %', () => {
    const sceneSize = 100;
    const typicalValue = 50;
    const scale = sceneScale('velocity', sceneSize, typicalValue);
    const arrowLen = typicalValue * scale;
    expect(arrowLen).toBeGreaterThanOrEqual(sceneSize * 0.05);
    expect(arrowLen).toBeLessThanOrEqual(sceneSize * 0.25);
  });
});
