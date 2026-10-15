import { describe, it, expect } from 'vitest';
import {
  theorems3D,
  eulerFormula,
  pythagorasSpace,
  archimedes,
  coneVsCylinder,
  cavalieri,
  cubeCrossSection,
  netUnfolding,
  lineToPlane,
  pointToPlane,
  similarSolids,
} from '../src/renderer/src/math/theorems3d';

const SQRT2 = Math.sqrt(2);
const PI = Math.PI;

describe('Theorems 3D: 10 Interactive Demonstrations', () => {
  describe('Array structure', () => {
    it('exports all 10 theorems in array', () => {
      expect(theorems3D).toHaveLength(10);
      expect(theorems3D[0].id).toBe('euler-polyhedron');
      expect(theorems3D[9].id).toBe('similar-solids-scaling');
    });

    it('each theorem has required fields', () => {
      theorems3D.forEach((t) => {
        expect(t.id).toBeDefined();
        expect(t.title).toBeDefined();
        expect(t.solids).toBeDefined();
        expect(t.parameter).toBeDefined();
        expect(t.quantities).toBeDefined();
        expect(t.statement).toBeDefined();
        expect(t.ahaSentence).toBeDefined();
      });
    });
  });

  describe('1. Euler\'s Polyhedron Formula (V - E + F = 2)', () => {
    it('holds for all listed solids', () => {
      const testCases = [
        { idx: 0, v: 4, e: 6, f: 4 },
        { idx: 1, v: 5, e: 8, f: 5 },
        { idx: 2, v: 8, e: 12, f: 6 },
        { idx: 3, v: 6, e: 9, f: 5 },
        { idx: 4, v: 6, e: 12, f: 8 },
        { idx: 5, v: 20, e: 30, f: 12 },
        { idx: 6, v: 12, e: 30, f: 20 },
      ];

      testCases.forEach(({ idx, v, e, f }) => {
        const vResult = eulerFormula.quantities[0].format(idx);
        const eResult = eulerFormula.quantities[1].format(idx);
        const fResult = eulerFormula.quantities[2].format(idx);
        const eulerResult = eulerFormula.quantities[3].format(idx);

        expect(vResult).toBe(v);
        expect(eResult).toBe(e);
        expect(fResult).toBe(f);
        expect(eulerResult).toBe(2);
      });
    });

    it('parameter is selector with 7 shapes', () => {
      expect(eulerFormula.parameter.name).toBe('shape');
      expect(eulerFormula.parameter.min).toBe(0);
      expect(eulerFormula.parameter.max).toBe(6);
      expect(eulerFormula.parameter.step).toBe(1);
    });
  });

  describe('2. Pythagoras in 3-D (Space Diagonal)', () => {
    it('space diagonal equals sqrt(a^2 + b^2 + c^2) for 3 sizes', () => {
      const testSizes = [
        { idx: 0, a: 3, b: 4, c: 5, expected: 5 * SQRT2 },
        { idx: 1, a: 4, b: 5, c: 6, expected: Math.sqrt(16 + 25 + 36) },
        { idx: 2, a: 2, b: 3, c: 6, expected: 7.0 },
      ];

      testSizes.forEach(({ idx, a, b, c, expected }) => {
        const aResult = pythagorasSpace.quantities[0].format(idx);
        const bResult = pythagorasSpace.quantities[1].format(idx);
        const cResult = pythagorasSpace.quantities[2].format(idx);
        const floorDiag = pythagorasSpace.quantities[3].format(idx);
        const spaceDiag = pythagorasSpace.quantities[4].format(idx);

        expect(aResult).toBe(a);
        expect(bResult).toBe(b);
        expect(cResult).toBe(c);
        expect(floorDiag).toBeCloseTo(Math.sqrt(a * a + b * b), 5);
        expect(spaceDiag).toBeCloseTo(expected, 5);
      });
    });
  });

  describe('3. Archimedes\' Sphere & Cylinder', () => {
    it('sphere volume = 2/3 of cylinder for 3 radii', () => {
      const testRadii = [1.5, 3.0, 4.0];

      testRadii.forEach((r) => {
        const vCyl = archimedes.quantities[0].format(r) as number;
        const vSph = archimedes.quantities[1].format(r) as number;
        const ratio = archimedes.quantities[2].format(r) as number;

        expect(vCyl).toBeCloseTo(PI * r * r * (2 * r), 5);
        expect(vSph).toBeCloseTo((4 / 3) * PI * r * r * r, 5);
        expect(ratio).toBeCloseTo(2 / 3, 5);

        const computedRatio = vSph / vCyl;
        expect(computedRatio).toBeCloseTo(2 / 3, 5);
      });
    });

    it('curved surface areas are equal', () => {
      const testRadii = [1.5, 3.0, 4.0];

      testRadii.forEach((r) => {
        const aSphere = archimedes.quantities[3].format(r) as number;
        const aCylinder = archimedes.quantities[4].format(r) as number;

        expect(aSphere).toBeCloseTo(4 * PI * r * r, 5);
        expect(aCylinder).toBeCloseTo(2 * PI * r * (2 * r), 5);
        expect(aSphere).toBeCloseTo(aCylinder, 5);
      });
    });
  });

  describe('4. Cone vs. Cylinder', () => {
    it('cone volume = 1/3 of cylinder', () => {
      const vCyl = coneVsCylinder.quantities[0].format(0) as number;
      const vCone = coneVsCylinder.quantities[1].format(0) as number;

      expect(vCyl).toBeCloseTo(PI * 9 * 5, 5);
      expect(vCone).toBeCloseTo((1 / 3) * PI * 9 * 5, 5);
      expect(vCone).toBeCloseTo(vCyl / 3, 5);
    });

    it('3 cones fill cylinder for 0-3 fill levels', () => {
      for (let level = 0; level <= 3; level++) {
        const vCyl = coneVsCylinder.quantities[0].format(level) as number;
        const total = coneVsCylinder.quantities[3].format(level) as number;

        expect(total).toBeCloseTo(level * (vCyl / 3), 5);
      }

      const total3 = coneVsCylinder.quantities[3].format(3) as number;
      const vCyl = coneVsCylinder.quantities[0].format(0) as number;
      expect(total3).toBeCloseTo(vCyl, 5);
    });
  });

  describe('5. Cavalieri\'s Principle', () => {
    it('sheared cylinder has same volume as straight', () => {
      const shearValues = [-4.0, -2.0, 0, 2.0, 4.0];

      shearValues.forEach((shear) => {
        const csArea1 = cavalieri.quantities[1].format(shear) as number;
        const csArea2 = cavalieri.quantities[2].format(shear) as number;
        const vol1 = cavalieri.quantities[3].format(shear) as number;
        const vol2 = cavalieri.quantities[4].format(shear) as number;

        expect(csArea1).toBeCloseTo(PI * 6.25, 5);
        expect(csArea2).toBeCloseTo(PI * 6.25, 5);
        expect(vol1).toBeCloseTo(PI * 6.25 * 6, 5);
        expect(vol2).toBeCloseTo(PI * 6.25 * 6, 5);
      });
    });
  });

  describe('6. Cross-Sections of a Cube', () => {
    it('identifies polygon sides at different positions', () => {
      const testCases = [
        { d: -3.4, expectedSides: 3, description: 'corner' },
        { d: -2.0, expectedSides: 6, description: 'hex zone' },
        { d: 0, expectedSides: 6, description: 'center' },
        { d: 2.0, expectedSides: 6, description: 'hex zone' },
        { d: 3.4, expectedSides: 3, description: 'corner' },
      ];

      testCases.forEach(({ d, expectedSides }) => {
        const sides = cubeCrossSection.quantities[0].format(d);
        expect(sides).toBe(expectedSides);
      });
    });

    it('classifies polygon types', () => {
      const center = cubeCrossSection.quantities[1].format(0);
      const corner = cubeCrossSection.quantities[1].format(3.4);

      expect(center).toBe('Regular Hexagon');
      expect(corner).toBe('Triangle');
    });
  });

  describe('7. 3-D Nets Unfolding', () => {
    it('surface area preserved during unfold', () => {
      const areas3d = netUnfolding.quantities[1].format(0);
      const areasFlat = netUnfolding.quantities[2].format(100);

      expect(areas3d).toBe(54.0);
      expect(areasFlat).toBe(54.0);
    });

    it('unfold progress ranges 0-100%', () => {
      const progress0 = netUnfolding.quantities[3].format(0);
      const progress50 = netUnfolding.quantities[3].format(50);
      const progress100 = netUnfolding.quantities[3].format(100);

      expect(progress0).toBe('0%');
      expect(progress50).toBe('50%');
      expect(progress100).toBe('100%');
    });
  });

  describe('8. Angle Between Line and Plane', () => {
    it('computes angle correctly for fixed point', () => {
      const lineLen = lineToPlane.quantities[0].format(0);
      const shadowLen = lineToPlane.quantities[1].format(0);
      const height = lineToPlane.quantities[2].format(0);
      const angle = lineToPlane.quantities[3].format(0);

      expect(lineLen).toBeCloseTo(Math.sqrt(50), 5);
      expect(shadowLen).toBeCloseTo(5, 5);
      expect(height).toBe(5.0);
      expect(angle).toBeCloseTo(45, 1);
    });

    it('angle stays constant as point rotates around z-axis', () => {
      const angles = [0, 90, 180, 270].map((deg) =>
        lineToPlane.quantities[3].format(deg) as number,
      );

      angles.forEach((angle) => {
        expect(angle).toBeCloseTo(45, 1);
      });
    });
  });

  describe('9. Point to Plane Distance', () => {
    it('computes perpendicular distance correctly', () => {
      const distance = pointToPlane.quantities[2].format(0) as number;
      const expected = (1 * 4 + 2 * 5 + 2 * 6 - 6) / Math.sqrt(1 + 4 + 4);

      expect(distance).toBeCloseTo(expected, 5);
      expect(distance).toBeCloseTo(20 / 3, 5);
      expect(distance).toBeCloseTo(6.666, 2);
    });
  });

  describe('10. Similar Solids: Scaling Laws', () => {
    it('area scales by k^2', () => {
      const testFactors = [0.5, 1.0, 1.5, 2.0, 3.0];

      testFactors.forEach((k) => {
        const refArea = similarSolids.quantities[3].format(k) as number;
        const scaledArea = similarSolids.quantities[4].format(k) as number;
        const ratio = similarSolids.quantities[5].format(k) as number;

        expect(scaledArea).toBeCloseTo(refArea * k * k, 5);
        expect(ratio).toBeCloseTo(k * k, 5);
      });
    });

    it('volume scales by k^3', () => {
      const testFactors = [0.5, 1.0, 1.5, 2.0, 3.0];

      testFactors.forEach((k) => {
        const refVol = similarSolids.quantities[6].format(k) as number;
        const scaledVol = similarSolids.quantities[7].format(k) as number;
        const ratio = similarSolids.quantities[8].format(k) as number;

        expect(scaledVol).toBeCloseTo(refVol * k * k * k, 5);
        expect(ratio).toBeCloseTo(k * k * k, 5);
      });
    });

    it('scale x2 yields area x4 and volume x8', () => {
      const k = 2.0;
      const area2 = similarSolids.quantities[5].format(k) as number;
      const vol2 = similarSolids.quantities[8].format(k) as number;

      expect(area2).toBeCloseTo(4, 5);
      expect(vol2).toBeCloseTo(8, 5);
    });

    it('scale x3 yields area x9 and volume x27', () => {
      const k = 3.0;
      const area3 = similarSolids.quantities[5].format(k) as number;
      const vol3 = similarSolids.quantities[8].format(k) as number;

      expect(area3).toBeCloseTo(9, 5);
      expect(vol3).toBeCloseTo(27, 5);
    });
  });

  describe('Integration: All theorems data integrity', () => {
    it('all theorems have valid solids arrays', () => {
      theorems3D.forEach((t) => {
        expect(Array.isArray(t.solids)).toBe(true);
      });
    });

    it('all theorems have at least 3 quantities', () => {
      theorems3D.forEach((t) => {
        expect(t.quantities.length).toBeGreaterThanOrEqual(3);
      });
    });

    it('all quantity formats are functions', () => {
      theorems3D.forEach((t) => {
        t.quantities.forEach((q) => {
          expect(typeof q.format).toBe('function');
        });
      });
    });

    it('statements are non-empty strings', () => {
      theorems3D.forEach((t) => {
        expect(t.statement).toBeTruthy();
        expect(t.statement.length).toBeGreaterThan(10);
      });
    });

    it('aha sentences are non-empty strings', () => {
      theorems3D.forEach((t) => {
        expect(t.ahaSentence).toBeTruthy();
        expect(t.ahaSentence.length).toBeGreaterThan(10);
      });
    });

    it('parameter ranges are valid', () => {
      theorems3D.forEach((t) => {
        expect(t.parameter.max).toBeGreaterThanOrEqual(t.parameter.min);
        expect(t.parameter.step).toBeGreaterThan(0);
      });
    });
  });

  describe('Specific mathematical verifications', () => {
    it('Archimedes ratio is exactly 2/3', () => {
      const radii = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
      radii.forEach((r) => {
        const vCyl = PI * r * r * (2 * r);
        const vSph = (4 / 3) * PI * r * r * r;
        const ratio = vSph / vCyl;
        expect(ratio).toBeCloseTo(2 / 3, 10);
      });
    });

    it('Cone volume is always 1/3 of cylinder with same base and height', () => {
      const pairs = [
        { r: 1.0, h: 1.0 },
        { r: 2.0, h: 3.0 },
        { r: 3.0, h: 5.0 },
      ];

      pairs.forEach(({ r, h }) => {
        const vCone = (1 / 3) * PI * r * r * h;
        const vCyl = PI * r * r * h;
        expect(vCone).toBeCloseTo(vCyl / 3, 10);
      });
    });

    it('Pythagorean theorem chain: floor diagonal then height', () => {
      const cases = [
        { a: 3, b: 4, c: 5 },
        { a: 5, b: 12, c: 13 },
        { a: 1, b: 1, c: 1 },
      ];

      cases.forEach(({ a, b, c }) => {
        const floorDiag = Math.sqrt(a * a + b * b);
        const spaceDiag = Math.sqrt(floorDiag * floorDiag + c * c);
        const directDiag = Math.sqrt(a * a + b * b + c * c);
        expect(spaceDiag).toBeCloseTo(directDiag, 10);
      });
    });
  });
});
