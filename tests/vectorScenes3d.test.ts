import { describe, it, expect } from 'vitest';
import {
  vectorScenes3d,
  magnitude,
  add,
  subtract,
  dotProduct,
  crossProduct,
  scalarTripleProduct,
} from '../src/renderer/src/math/vectorScenes3d';

describe('vectorScenes3d', () => {
  describe('Equilibrium scene - Three forces sum to zero', () => {
    it('should sum three equilibrium forces to zero vector', () => {
      const scene = vectorScenes3d.find((s) => s.id === 'equilibrium')!;
      const f1 = scene.vectors[0].components;
      const f2 = scene.vectors[1].components;
      const f3 = scene.vectors[2].components;

      const resultant = add(f1, f2, f3);

      expect(resultant.x).toBeCloseTo(0, 5);
      expect(resultant.y).toBeCloseTo(0, 5);
      expect(resultant.z).toBeCloseTo(0, 5);
    });
  });

  describe('Torque scene - τ = r × F', () => {
    it('should compute torque as cross product of position and force', () => {
      const scene = vectorScenes3d.find((s) => s.id === 'torque')!;
      const r = scene.vectors[0].components;
      const f = scene.vectors[1].components;

      const torque = crossProduct(r, f);

      expect(torque.x).toBeCloseTo(20, 5);
      expect(torque.y).toBeCloseTo(-15, 5);
      expect(torque.z).toBeCloseTo(17, 5);
    });

    it('should verify torque is perpendicular to r', () => {
      const scene = vectorScenes3d.find((s) => s.id === 'torque')!;
      const r = scene.vectors[0].components;
      const f = scene.vectors[1].components;

      const torque = crossProduct(r, f);
      const dotProduct_tau_r = dotProduct(torque, r);

      expect(dotProduct_tau_r).toBeCloseTo(0, 5);
    });

    it('should verify torque is perpendicular to F', () => {
      const scene = vectorScenes3d.find((s) => s.id === 'torque')!;
      const r = scene.vectors[0].components;
      const f = scene.vectors[1].components;

      const torque = crossProduct(r, f);
      const dotProduct_tau_f = dotProduct(torque, f);

      expect(dotProduct_tau_f).toBeCloseTo(0, 5);
    });
  });

  describe('Plane normal scene - Normal perpendicular to both edge vectors', () => {
    it('should compute normal as cross product of two edge vectors', () => {
      const scene = vectorScenes3d.find((s) => s.id === 'plane-normal')!;
      const a = scene.vectors[0].components;
      const b = scene.vectors[1].components;

      const normal = crossProduct(a, b);

      expect(normal.x).toBeCloseTo(2, 5);
      expect(normal.y).toBeCloseTo(-8, 5);
      expect(normal.z).toBeCloseTo(11, 5);
    });

    it('should verify normal is perpendicular to vector A', () => {
      const scene = vectorScenes3d.find((s) => s.id === 'plane-normal')!;
      const a = scene.vectors[0].components;
      const b = scene.vectors[1].components;

      const normal = crossProduct(a, b);
      const dot = dotProduct(normal, a);

      expect(dot).toBeCloseTo(0, 5);
    });

    it('should verify normal is perpendicular to vector B', () => {
      const scene = vectorScenes3d.find((s) => s.id === 'plane-normal')!;
      const a = scene.vectors[0].components;
      const b = scene.vectors[1].components;

      const normal = crossProduct(a, b);
      const dot = dotProduct(normal, b);

      expect(dot).toBeCloseTo(0, 5);
    });
  });

  describe('Work scene - W = F · d', () => {
    it('should compute work as dot product of force and displacement', () => {
      const scene = vectorScenes3d.find((s) => s.id === 'work')!;
      const f = scene.vectors[0].components;
      const s = scene.vectors[1].components;

      const work = dotProduct(f, s);

      expect(work).toBeCloseTo(26.0, 5);
    });
  });

  describe('Direction cosines scene - cos²α + cos²β + cos²γ = 1', () => {
    it('should verify direction cosines sum of squares equals 1', () => {
      const scene = vectorScenes3d.find((s) => s.id === 'direction-cosines')!;
      const a = scene.vectors[0].components;

      const mag = magnitude(a);

      const cosAlpha = a.x / mag;
      const cosBeta = a.y / mag;
      const cosGamma = a.z / mag;

      const sumOfSquares =
        cosAlpha * cosAlpha +
        cosBeta * cosBeta +
        cosGamma * cosGamma;

      expect(sumOfSquares).toBeCloseTo(1.0, 5);
    });
  });

  describe('Tripod scene - Three forces resultant', () => {
    it('should sum three tripod leg forces correctly', () => {
      const scene = vectorScenes3d.find((s) => s.id === 'tripod')!;
      const t1 = scene.vectors[0].components;
      const t2 = scene.vectors[1].components;
      const t3 = scene.vectors[2].components;

      const resultant = add(t1, t2, t3);

      expect(resultant.x).toBeCloseTo(0, 5);
      expect(resultant.y).toBeCloseTo(0, 5);
      expect(resultant.z).toBeCloseTo(-12, 5);
    });
  });

  describe('Relative velocity scene - v_B/A = v_B − v_A', () => {
    it('should compute relative velocity as subtraction', () => {
      const scene = vectorScenes3d.find((s) => s.id === 'relative-velocity')!;
      const vA = scene.vectors[0].components;
      const vB = scene.vectors[1].components;

      const relVel = subtract(vB, vA);

      expect(relVel.x).toBeCloseTo(-3, 5);
      expect(relVel.y).toBeCloseTo(4, 5);
      expect(relVel.z).toBeCloseTo(2, 5);
    });
  });

  describe('Parallelepiped volume - V = |A · (B × C)|', () => {
    it('should compute volume via scalar triple product', () => {
      const scene = vectorScenes3d.find((s) => s.id === 'parallelepiped')!;
      const a = scene.vectors[0].components;
      const b = scene.vectors[1].components;
      const c = scene.vectors[2].components;

      const volume = scalarTripleProduct(a, b, c);

      expect(volume).toBeCloseTo(60.0, 5);
    });
  });
});
