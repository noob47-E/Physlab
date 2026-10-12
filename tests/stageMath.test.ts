import { describe, it, expect } from 'vitest';
import {
    Tier,
    Bounds,
    TIER_STAGE,
    boundsOf,
    shadowCamera,
    needsRefit,
    gridStep,
    horizonFade,
    LIGHT_RIG
} from '../src/renderer/src/render/sandbox/stageMath';

describe('stageMath', () => {
    describe('TIER_STAGE', () => {
        it('matches the tier table', () => {
            const lowTier: Tier = 'low';
            expect(TIER_STAGE[lowTier]).toEqual({ shadows: false, mapSize: 0, softness: 0, environment: false, blobShadows: true });
            expect(TIER_STAGE.medium).toEqual({ shadows: true, mapSize: 1024, softness: 2, environment: true, blobShadows: false });
            expect(TIER_STAGE.high).toEqual({ shadows: true, mapSize: 2048, softness: 3, environment: true, blobShadows: false });
        });
    });

    describe('boundsOf', () => {
        it('grows by the radius', () => {
            const points: [number, number, number][] = [
                [0, 0, 0],
                [10, 5, -2]
            ];
            const radius = [1, 2];
            const b = boundsOf(points, radius);
            expect(b.min).toEqual([-1, -1, -4]);
            expect(b.max).toEqual([12, 7, 1]);
        });
        
        it('handles empty points', () => {
            const b = boundsOf([], []);
            expect(b.min).toEqual([0, 0, 0]);
            expect(b.max).toEqual([0, 0, 0]);
        });
    });

    describe('shadowCamera', () => {
        it('holds the bounds plus margin metres on every side projected along the light', () => {
            const b: Bounds = { min: [-5, -5, -5], max: [5, 5, 5] };
            const lightDir: [number, number, number] = [0, -1, 0];
            const cam = shadowCamera(b, lightDir, 1);
            
            // For a cube [-5, 5]^3 with light shining down (0, -1, 0),
            // orthographic bounds should be [-6, 6] in x and z, and near/far should cover [-6, 6]
            expect(cam.left).toBeCloseTo(-6);
            expect(cam.right).toBeCloseTo(6);
            expect(cam.bottom).toBeCloseTo(-6);
            expect(cam.top).toBeCloseTo(6);
            // With target at [0, 0, 0] and light looking down y axis from positive y to negative y
            expect(cam.near).toBeCloseTo(-6);
            expect(cam.far).toBeCloseTo(6);
            expect(cam.target).toEqual([0, 0, 0]);
        });

        it('for random seeded boxes and light directions every corner lies inside the shadow box', () => {
            // Seeded PRNG for reproducibility
            let seed = 12345;
            const rand = () => {
                seed = (seed * 9301 + 49297) % 233280;
                return seed / 233280;
            };

            for (let t = 0; t < 100; t++) {
                const b: Bounds = {
                    min: [rand() * 10 - 5, rand() * 10 - 5, rand() * 10 - 5],
                    max: [0, 0, 0]
                };
                b.max = [b.min[0] + rand() * 10, b.min[1] + rand() * 10, b.min[2] + rand() * 10];

                const lightDir: [number, number, number] = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
                if (lightDir[0] === 0 && lightDir[1] === 0 && lightDir[2] === 0) lightDir[1] = 1;
                
                const margin = rand() * 2;
                const cam = shadowCamera(b, lightDir, margin);
                
                // Project corners using the light coordinate system
                const len = Math.hypot(lightDir[0], lightDir[1], lightDir[2]);
                const zDir = [lightDir[0] / len, lightDir[1] / len, lightDir[2] / len];
                const lz = [-zDir[0], -zDir[1], -zDir[2]];
                
                let up = [0, 1, 0];
                if (Math.abs(lz[1]) > 0.999) up = [0, 0, 1];
                
                let lx = [
                    up[1] * lz[2] - up[2] * lz[1],
                    up[2] * lz[0] - up[0] * lz[2],
                    up[0] * lz[1] - up[1] * lz[0]
                ];
                const xLen = Math.hypot(lx[0], lx[1], lx[2]);
                lx = [lx[0] / xLen, lx[1] / xLen, lx[2] / xLen];
                
                let ly = [
                    lz[1] * lx[2] - lz[2] * lx[1],
                    lz[2] * lx[0] - lz[0] * lx[2],
                    lz[0] * lx[1] - lz[1] * lx[0]
                ];
                const yLen = Math.hypot(ly[0], ly[1], ly[2]);
                ly = [ly[0] / yLen, ly[1] / yLen, ly[2] / yLen];
                
                for (let i = 0; i < 2; i++) {
                    for (let j = 0; j < 2; j++) {
                        for (let k = 0; k < 2; k++) {
                            const p = [
                                i === 0 ? b.min[0] : b.max[0],
                                j === 0 ? b.min[1] : b.max[1],
                                k === 0 ? b.min[2] : b.max[2]
                            ];
                            
                            const v = [p[0] - cam.target[0], p[1] - cam.target[1], p[2] - cam.target[2]];
                            
                            const px = v[0] * lx[0] + v[1] * lx[1] + v[2] * lx[2];
                            const py = v[0] * ly[0] + v[1] * ly[1] + v[2] * ly[2];
                            const pz = v[0] * lz[0] + v[1] * lz[1] + v[2] * lz[2];
                            
                            expect(px).toBeGreaterThanOrEqual(cam.left - 0.001);
                            expect(px).toBeLessThanOrEqual(cam.right + 0.001);
                            expect(py).toBeGreaterThanOrEqual(cam.bottom - 0.001);
                            expect(py).toBeLessThanOrEqual(cam.top + 0.001);
                            expect(pz).toBeGreaterThanOrEqual(-cam.far - 0.001);
                            expect(pz).toBeLessThanOrEqual(-cam.near + 0.001);
                        }
                    }
                }
            }
        });
    });

    describe('needsRefit', () => {
        it('is false for a small move and true past the slack', () => {
            const old: Bounds = { min: [0, 0, 0], max: [10, 10, 10] };
            
            // small move
            expect(needsRefit(old, { min: [0, -1, 0], max: [10, 11, 10] }, 2)).toBe(false);
            
            // true past the slack
            expect(needsRefit(old, { min: [-3, 0, 0], max: [10, 10, 10] }, 2)).toBe(true);
            expect(needsRefit(old, { min: [0, 0, 0], max: [13, 10, 10] }, 2)).toBe(true);
        });
    });

    describe('gridStep', () => {
        it('selects minor and major grid steps maintaining at least 12 pixels per minor cell', () => {
            expect(gridStep(200)).toEqual({ minor: 0.1, major: 1 });
            expect(gridStep(20)).toEqual({ minor: 1, major: 10 });
            expect(gridStep(1)).toEqual({ minor: 100, major: 1000 });
        });
    });

    describe('horizonFade', () => {
        it('is 1 at start, 0 at end, 0.5 halfway, and monotone', () => {
            expect(horizonFade(10, 10, 20)).toBe(1);
            expect(horizonFade(20, 10, 20)).toBe(0);
            expect(horizonFade(15, 10, 20)).toBe(0.5);
            expect(horizonFade(5, 10, 20)).toBe(1);
            expect(horizonFade(25, 10, 20)).toBe(0);
            
            // monotone check
            let prev = 1;
            for (let d = 10; d <= 20; d += 1) {
                const fade = horizonFade(d, 10, 20);
                expect(fade).toBeLessThanOrEqual(prev);
                prev = fade;
            }
        });
    });

    describe('LIGHT_RIG', () => {
        it('directions are unit length and matches requirements', () => {
            const lenKey = Math.hypot(LIGHT_RIG.key.dir[0], LIGHT_RIG.key.dir[1], LIGHT_RIG.key.dir[2]);
            expect(lenKey).toBeCloseTo(1);
            
            const lenFill = Math.hypot(LIGHT_RIG.fill.dir[0], LIGHT_RIG.fill.dir[1], LIGHT_RIG.fill.dir[2]);
            expect(lenFill).toBeCloseTo(1);
            
            expect(LIGHT_RIG.key.intensity).toBe(2.2);
            expect(LIGHT_RIG.fill.intensity).toBe(0.5);
            expect(LIGHT_RIG.hemi.intensity).toBe(0.6);
            expect(LIGHT_RIG.ambientLow).toBe(0.55);
        });
    });
});
