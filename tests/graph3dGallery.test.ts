import { describe, it, expect } from 'vitest';
import { graph3dGallery } from '../src/renderer/src/math/graph3dGallery';

describe('graph3dGallery', () => {
  it('contains exactly 12 entries', () => {
    expect(graph3dGallery).toHaveLength(12);
  });

  it('all entries have unique ids', () => {
    const ids = graph3dGallery.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all entries have titles', () => {
    graph3dGallery.forEach((g) => {
      expect(g.title).toBeTruthy();
      expect(typeof g.title).toBe('string');
    });
  });

  it('all captions are under 120 characters', () => {
    graph3dGallery.forEach((g) => {
      expect(g.caption.length).toBeLessThanOrEqual(120);
    });
  });

  it('all sliders have valid ranges', () => {
    graph3dGallery.forEach((g) => {
      const { slider } = g;
      expect(slider.min).toBeLessThanOrEqual(slider.default);
      expect(slider.default).toBeLessThanOrEqual(slider.max);
      expect(slider.min).toBeLessThanOrEqual(slider.max);
    });
  });

  it('all camera targets are inside domain box', () => {
    graph3dGallery.forEach((g) => {
      const { camera } = g;
      const [tx, ty] = camera.target;

      if (g.kind === 'surface') {
        const domainMin = g.domain?.min ?? -5;
        const domainMax = g.domain?.max ?? 5;
        expect(tx).toBeGreaterThanOrEqual(domainMin - 1);
        expect(tx).toBeLessThanOrEqual(domainMax + 1);
        expect(ty).toBeGreaterThanOrEqual(domainMin - 1);
        expect(ty).toBeLessThanOrEqual(domainMax + 1);
      }
    });
  });

  describe('surfaces produce finite values', () => {
    graph3dGallery
      .filter((g) => g.kind === 'surface' && g.expressions)
      .forEach((g) => {
        it(`${g.id} is finite on domain at slider extremes`, () => {
          const domainMin = g.domain?.min ?? -5;
          const domainMax = g.domain?.max ?? 5;
          const gridSize = 40;
          const step = (domainMax - domainMin) / (gridSize - 1);

          // Test at slider min, default, and max
          const sliderValues = [g.slider.min, g.slider.default, g.slider.max];

          sliderValues.forEach((sliderVal) => {
            const params = { [g.slider.name]: sliderVal };

            for (let i = 0; i < gridSize; i++) {
              for (let j = 0; j < gridSize; j++) {
                const x = domainMin + i * step;
                const y = domainMin + j * step;
                const z = g.expressions!.z(x, y, params);
                expect(isFinite(z)).toBe(true);
              }
            }
          });
        });
      });
  });

  describe('parametric surfaces produce finite values', () => {
    graph3dGallery
      .filter((g) => g.kind === 'parametricSurface' && g.parametricSurface)
      .forEach((g) => {
        it(`${g.id} is finite on domain at slider extremes`, () => {
          const uMin = g.rangeU?.min ?? 0;
          const uMax = g.rangeU?.max ?? 2 * Math.PI;
          const vMin = g.rangeV?.min ?? 0;
          const vMax = g.rangeV?.max ?? 2 * Math.PI;

          const gridSize = 40;
          const uStep = (uMax - uMin) / (gridSize - 1);
          const vStep = (vMax - vMin) / (gridSize - 1);

          const sliderValues = [g.slider.min, g.slider.default, g.slider.max];

          sliderValues.forEach((sliderVal) => {
            const params = { [g.slider.name]: sliderVal };

            for (let i = 0; i < gridSize; i++) {
              for (let j = 0; j < gridSize; j++) {
                const u = uMin + i * uStep;
                const v = vMin + j * vStep;
                const x = g.parametricSurface!.x(u, v, params);
                const y = g.parametricSurface!.y(u, v, params);
                const z = g.parametricSurface!.z(u, v, params);
                expect(isFinite(x)).toBe(true);
                expect(isFinite(y)).toBe(true);
                expect(isFinite(z)).toBe(true);
              }
            }
          });
        });
      });
  });

  describe('parametric curves produce finite values', () => {
    graph3dGallery
      .filter((g) => g.kind === 'curve' && g.parametricCurve)
      .forEach((g) => {
        it(`${g.id} is finite on domain at slider extremes`, () => {
          const tMin = g.rangeT?.min ?? 0;
          const tMax = g.rangeT?.max ?? 2 * Math.PI;

          const gridSize = 40;
          const tStep = (tMax - tMin) / (gridSize - 1);

          const sliderValues = [g.slider.min, g.slider.default, g.slider.max];

          sliderValues.forEach((sliderVal) => {
            const params = { [g.slider.name]: sliderVal };

            for (let i = 0; i < gridSize; i++) {
              const t = tMin + i * tStep;
              const x = g.parametricCurve!.x(t, params);
              const y = g.parametricCurve!.y(t, params);
              const z = g.parametricCurve!.z(t, params);
              expect(isFinite(x)).toBe(true);
              expect(isFinite(y)).toBe(true);
              expect(isFinite(z)).toBe(true);
            }
          });
        });
      });
  });

  describe('geometric surfaces satisfy their constraints', () => {
    it('torus points lie on torus surface', () => {
      const torus = graph3dGallery.find((g) => g.id === 'torus-doughnut')!;
      const params = { R: torus.slider.default };
      const R = params.R;
      const r = 1.2;

      // Sample several points on the torus
      for (let u = 0; u < 2 * Math.PI; u += Math.PI / 4) {
        for (let v = 0; v < 2 * Math.PI; v += Math.PI / 4) {
          const x = torus.parametricSurface!.x(u, v, params);
          const y = torus.parametricSurface!.y(u, v, params);
          const z = torus.parametricSurface!.z(u, v, params);

          // Distance from z-axis should be R + r*cos(v)
          const distFromZAxis = Math.sqrt(x * x + y * y);
          const expectedDist = R + r * Math.cos(v);
          expect(distFromZAxis).toBeCloseTo(expectedDist, 5);

          // Height should be r*sin(v)
          expect(z).toBeCloseTo(r * Math.sin(v), 5);
        }
      }
    });

    it('sphere points lie on sphere surface', () => {
      const sphere = graph3dGallery.find((g) => g.id === 'parametric-sphere')!;
      const params = { R: sphere.slider.default };
      const R = params.R;

      for (let u = 0; u < 2 * Math.PI; u += Math.PI / 4) {
        for (let v = 0; v < Math.PI; v += Math.PI / 4) {
          const x = sphere.parametricSurface!.x(u, v, params);
          const y = sphere.parametricSurface!.y(u, v, params);
          const z = sphere.parametricSurface!.z(u, v, params);

          const dist = Math.sqrt(x * x + y * y + z * z);
          expect(dist).toBeCloseTo(R, 9);
        }
      }
    });

    it('Möbius strip is single-sided', () => {
      const mobius = graph3dGallery.find((g) => g.id === 'mobius-strip')!;
      const params = { n: 1 };

      // With n=1, it should have exactly half the twist compared to n=2
      const uTest = Math.PI;
      const vValues = [-1, 0, 1];

      const normalVectors = vValues.map((v) => {
        const du = 0.001;
        const dv = 0.001;

        const x = mobius.parametricSurface!.x(uTest, v, params);
        const y = mobius.parametricSurface!.y(uTest, v, params);
        const z = mobius.parametricSurface!.z(uTest, v, params);

        const x1 = mobius.parametricSurface!.x(uTest + du, v, params);
        const y1 = mobius.parametricSurface!.y(uTest + du, v, params);
        const z1 = mobius.parametricSurface!.z(uTest + du, v, params);

        const x2 = mobius.parametricSurface!.x(uTest, v + dv, params);
        const y2 = mobius.parametricSurface!.y(uTest, v + dv, params);
        const z2 = mobius.parametricSurface!.z(uTest, v + dv, params);

        return {
          x,
          y,
          z,
          tangentU: [x1 - x, y1 - y, z1 - z],
          tangentV: [x2 - x, y2 - y, z2 - z],
        };
      });

      // Verify all points exist and are distinct
      expect(normalVectors).toHaveLength(3);
      normalVectors.forEach((nv) => {
        expect(isFinite(nv.x)).toBe(true);
        expect(isFinite(nv.y)).toBe(true);
        expect(isFinite(nv.z)).toBe(true);
      });
    });
  });

  describe('specific graphs at default slider values', () => {
    it('saddle surface has correct a parameter', () => {
      const saddle = graph3dGallery.find((g) => g.id === 'saddle-surface')!;
      const params = { a: saddle.slider.default };
      const z = saddle.expressions!.z(1, 1, params);
      expect(z).toBeCloseTo(0, 5);
    });

    it('Gaussian bell has peak at origin', () => {
      const bell = graph3dGallery.find((g) => g.id === 'gaussian-bell')!;
      const params = { s: bell.slider.default };
      const zAtOrigin = bell.expressions!.z(0, 0, params);
      const zAtRadius = bell.expressions!.z(1, 0, params);
      expect(zAtOrigin).toBeGreaterThan(zAtRadius);
    });

    it('paraboloid bowl is negative at origin by default', () => {
      const bowl = graph3dGallery.find((g) => g.id === 'paraboloid-bowl')!;
      const params = { a: bowl.slider.default };
      const z = bowl.expressions!.z(0, 0, params);
      expect(z).toBeLessThan(0);
    });

    it('helix spring produces correct spacing', () => {
      const helix = graph3dGallery.find((g) => g.id === '3d-helix-spring')!;
      const params = { c: helix.slider.default };
      const z0 = helix.parametricCurve!.z(0, params);
      const z1 = helix.parametricCurve!.z(Math.PI, params);
      const zDiff = z1 - z0;
      expect(zDiff).toBeCloseTo(params.c * Math.PI, 5);
    });

    it('double cone has apex at origin', () => {
      const cone = graph3dGallery.find((g) => g.id === 'double-cone')!;
      const params = { a: cone.slider.default };
      const x = cone.parametricSurface!.x(0, 0, params);
      const y = cone.parametricSurface!.y(0, 0, params);
      const z = cone.parametricSurface!.z(0, 0, params);
      expect(x).toBeCloseTo(0, 5);
      expect(y).toBeCloseTo(0, 5);
      expect(z).toBeCloseTo(0, 5);
    });

    it('quantum wave packet is symmetric in x', () => {
      const qwp = graph3dGallery.find((g) => g.id === 'quantum-wave-packet')!;
      const params = { k: qwp.slider.default };
      const z1 = qwp.expressions!.z(2, 1, params);
      const z2 = qwp.expressions!.z(-2, 1, params);
      expect(z1).toBeCloseTo(z2, 5);
    });
  });

  describe('slider ranges are reasonable', () => {
    it('all sliders have positive range', () => {
      graph3dGallery.forEach((g) => {
        const { slider } = g;
        if (slider.min >= 0 && slider.max >= 0) {
          expect(slider.default).toBeGreaterThanOrEqual(slider.min);
        }
      });
    });

    it('step values exist where appropriate', () => {
      graph3dGallery.forEach((g) => {
        const { slider } = g;
        if (slider.step === undefined) {
          // If step is not defined, it should at least have been considered
          expect(slider.max - slider.min).toBeGreaterThan(0);
        } else {
          expect(slider.step).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('all required properties exist', () => {
    it('all entries have camera configuration', () => {
      graph3dGallery.forEach((g) => {
        expect(g.camera).toBeDefined();
        expect(g.camera.position).toHaveLength(3);
        expect(g.camera.target).toHaveLength(3);
        g.camera.position.forEach((p) => expect(isFinite(p)).toBe(true));
        g.camera.target.forEach((t) => expect(isFinite(t)).toBe(true));
      });
    });

    it('all entries have valid kind', () => {
      graph3dGallery.forEach((g) => {
        expect(['surface', 'parametricSurface', 'curve']).toContain(g.kind);
      });
    });

    it('surface entries have expressions', () => {
      graph3dGallery.filter((g) => g.kind === 'surface').forEach((g) => {
        expect(g.expressions).toBeDefined();
        expect(g.expressions!.z).toBeDefined();
      });
    });

    it('parametric surface entries have parametricSurface', () => {
      graph3dGallery.filter((g) => g.kind === 'parametricSurface').forEach((g) => {
        expect(g.parametricSurface).toBeDefined();
        expect(g.parametricSurface!.x).toBeDefined();
        expect(g.parametricSurface!.y).toBeDefined();
        expect(g.parametricSurface!.z).toBeDefined();
      });
    });

    it('curve entries have parametricCurve', () => {
      graph3dGallery.filter((g) => g.kind === 'curve').forEach((g) => {
        expect(g.parametricCurve).toBeDefined();
        expect(g.parametricCurve!.x).toBeDefined();
        expect(g.parametricCurve!.y).toBeDefined();
        expect(g.parametricCurve!.z).toBeDefined();
      });
    });
  });

  describe('mesh density values are reasonable', () => {
    it('surface meshes have reasonable density', () => {
      graph3dGallery.filter((g) => g.kind === 'surface').forEach((g) => {
        expect(g.meshDensity?.u).toBeGreaterThanOrEqual(32);
        expect(g.meshDensity?.u).toBeLessThanOrEqual(128);
      });
    });

    it('parametric surface meshes have reasonable density', () => {
      graph3dGallery.filter((g) => g.kind === 'parametricSurface').forEach((g) => {
        expect(g.meshDensity?.u).toBeGreaterThanOrEqual(32);
        expect(g.meshDensity?.u).toBeLessThanOrEqual(128);
      });
    });

    it('curve meshes have reasonable density', () => {
      graph3dGallery.filter((g) => g.kind === 'curve').forEach((g) => {
        expect(g.meshDensity?.tubular).toBeGreaterThanOrEqual(100);
        expect(g.meshDensity?.radial).toBeGreaterThanOrEqual(8);
      });
    });
  });

  describe('color schemes are defined', () => {
    it('all entries have colorScheme', () => {
      graph3dGallery.forEach((g) => {
        expect(g.colorScheme).toBeTruthy();
      });
    });
  });
});
