import { describe, expect, it } from 'vitest'
import { clampWorkZ, normaliseGrid3D, rayToLevelPlane, snapLattice } from '../src/renderer/src/math/workingPlane'

describe('rayToLevelPlane', () => {
  it('lands on the plane at its height, never at another depth', () => {
    const p = rayToLevelPlane([0, 0, 10], [1, 2, -5], 2)!
    expect(p[2]).toBe(2)
    expect(p[0]).toBeCloseTo(1.6)
    expect(p[1]).toBeCloseTo(3.2)
  })
  it('is null for a parallel ray or a plane behind the eye', () => {
    expect(rayToLevelPlane([0, 0, 5], [1, 0, 0], 2)).toBeNull()
    expect(rayToLevelPlane([0, 0, 5], [0, 0, 1], 2)).toBeNull()
  })
})

describe('snapLattice', () => {
  it('rounds x, y and z to whole units', () => {
    expect(snapLattice([1.4, -2.6, 2.51], 1)).toEqual([1, -3, 3])
  })
  it('keeps a half step and never returns -0', () => {
    expect(snapLattice([0.3, -0.1, 0.74], 0.5)).toEqual([0.5, 0, 0.5])
    expect(Object.is(snapLattice([-0.2, 0, 0], 1)[0], 0)).toBe(true)
  })
  it('leaves the point alone for a bad step', () => {
    expect(snapLattice([1.2, 3.4, 5.6], 0)).toEqual([1.2, 3.4, 5.6])
  })
})

describe('clampWorkZ and normaliseGrid3D', () => {
  it('keeps the plane whole and inside the grid', () => {
    expect(clampWorkZ(2.4)).toBe(2)
    expect(clampWorkZ(99)).toBe(10)
    expect(clampWorkZ(-99)).toBe(-10)
    expect(clampWorkZ(NaN)).toBe(0)
  })
  it('falls back to the floor', () => {
    expect(normaliseGrid3D('walls')).toBe('walls')
    expect(normaliseGrid3D('off')).toBe('off')
    expect(normaliseGrid3D('x')).toBe('floor')
    expect(normaliseGrid3D(undefined)).toBe('floor')
  })
})
