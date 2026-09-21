// Volumes and frontal areas, checked against the mensuration formulas. The volume becomes the
// mass a student reads off the panel; the area decides how hard the air pushes back.

import { describe, expect, it } from 'vitest'
import { dragCoefficient, frontalArea, materialById, MATERIALS, shapeVolume } from '../src/renderer/src/sim/materials'

type Size = [number, number, number]

describe('shapeVolume', () => {
  it('a sphere of radius 0.5 m has volume 0.5236 m³', () => {
    expect(shapeVolume('sphere', [0.5, 0.5, 0.5])).toBeCloseTo(0.5236, 4)
    expect(shapeVolume('sphere', [1, 0, 0])).toBeCloseTo((4 / 3) * Math.PI, 12)
  })

  it('boxes, planks, walls and the ground are width × height × depth', () => {
    for (const shape of ['box', 'plank', 'wall', 'ground']) expect(shapeVolume(shape, [2, 3, 4])).toBeCloseTo(24, 12)
    expect(shapeVolume('box', [1, 1, 1])).toBe(1)
  })

  it('a cylinder and a pulley are πr²h', () => {
    expect(shapeVolume('cylinder', [0.5, 2, 0])).toBeCloseTo(Math.PI * 0.5, 12)
    expect(shapeVolume('pulley', [0.3, 0.1, 0])).toBeCloseTo(Math.PI * 0.009, 12)
  })

  it('a capsule is a cylinder with a whole sphere on its ends', () => {
    expect(shapeVolume('capsule', [0.5, 2, 0])).toBeCloseTo(Math.PI * 0.5 + (4 / 3) * Math.PI * 0.125, 12)
    // No middle section: just the sphere.
    expect(shapeVolume('capsule', [0.5, 0, 0])).toBeCloseTo(shapeVolume('sphere', [0.5, 0, 0]), 12)
  })

  it('a cone is one third of the cylinder round it, using its base width as a diameter', () => {
    // Width 1 m, height 3 m: radius 0.5, so V = ⅓ π 0.25 × 3 = π/4.
    expect(shapeVolume('cone', [1, 3, 1])).toBeCloseTo(Math.PI / 4, 12)
    expect(shapeVolume('cone', [1, 3, 1]) * 3).toBeCloseTo(shapeVolume('cylinder', [0.5, 3, 0]), 12)
  })

  it('a ramp is half of its box', () => {
    expect(shapeVolume('ramp', [2, 1, 3])).toBeCloseTo(3, 12)
    expect(shapeVolume('ramp', [2, 1, 3])).toBeCloseTo(shapeVolume('box', [2, 1, 3]) / 2, 12)
  })

  it('scales with the cube of the size, from millimetres to kilometres', () => {
    const one = shapeVolume('sphere', [1, 1, 1])
    for (const k of [1e-3, 0.01, 10, 1e3]) expect(shapeVolume('sphere', [k, k, k]) / one).toBeCloseTo(k ** 3, 6)
    expect(shapeVolume('box', [1e3, 1e3, 1e3])).toBe(1e9)
    expect(shapeVolume('box', [0, 1, 1])).toBe(0)
  })

  it('gives a real mass through the material density', () => {
    // A steel ball of radius 0.25 m: 7850 × 0.06545 ≈ 514 kg, the figure the review quotes.
    expect(materialById('steel').density * shapeVolume('sphere', [0.25, 0, 0])).toBeCloseTo(513.8, 0)
    // A wooden 0.6 m crate: 700 × 0.216 ≈ 151 kg.
    expect(materialById('wood').density * shapeVolume('box', [0.6, 0.6, 0.6])).toBeCloseTo(151.2, 1)
  })
})

describe('frontalArea', () => {
  const box: Size = [1, 2, 3]

  it('a sphere of radius 0.5 m shows 0.7854 m² whichever way it moves', () => {
    expect(frontalArea('sphere', [0.5, 0, 0], [1, 0, 0])).toBeCloseTo(0.7854, 4)
    expect(frontalArea('sphere', [0.5, 0, 0], [0, -1, 0])).toBeCloseTo(0.7854, 4)
    expect(frontalArea('sphere', [0.5, 0, 0], [0.6, 0, 0.8])).toBeCloseTo(0.7854, 4)
  })

  it('a box shows the face it is moving towards, and a blend in between', () => {
    expect(frontalArea('box', box, [1, 0, 0])).toBeCloseTo(6, 12)
    expect(frontalArea('box', box, [-1, 0, 0])).toBeCloseTo(6, 12)
    expect(frontalArea('box', box, [0, 1, 0])).toBeCloseTo(3, 12)
    expect(frontalArea('box', box, [0, 0, 1])).toBeCloseTo(2, 12)
    // Moving at 3-4-5 in the xy-plane: the projected area of a box is Σ|nᵢ|·faceᵢ.
    expect(frontalArea('box', box, [0.6, 0.8, 0])).toBeCloseTo(0.6 * 6 + 0.8 * 3, 12)
    for (const shape of ['plank', 'wall', 'ramp', 'ground']) expect(frontalArea(shape, box, [1, 0, 0])).toBeCloseTo(6, 12)
  })

  it('a cylinder shows its round end going along its axis and its side going across', () => {
    const cyl: Size = [0.5, 2, 0]
    expect(frontalArea('cylinder', cyl, [0, 1, 0])).toBeCloseTo(Math.PI * 0.25, 12)
    expect(frontalArea('cylinder', cyl, [1, 0, 0])).toBeCloseTo(2, 12)
    expect(frontalArea('cylinder', cyl, [0, 0, -1])).toBeCloseTo(2, 12)
  })

  it('a capsule keeps its rounded ends in view from the side', () => {
    const cap: Size = [0.5, 2, 0]
    expect(frontalArea('capsule', cap, [0, 1, 0])).toBeCloseTo(Math.PI * 0.25, 12)
    // Side on: the 1 × 2 rectangle plus the two half-discs, which make one whole disc.
    expect(frontalArea('capsule', cap, [1, 0, 0])).toBeCloseTo(2 + Math.PI * 0.25, 12)
    // With no middle it is a sphere, from every direction.
    expect(frontalArea('capsule', [0.5, 0, 0], [1, 0, 0])).toBeCloseTo(frontalArea('sphere', [0.5, 0, 0], [1, 0, 0]), 12)
  })

  it('a cone shows its base disc from below and its triangle from the side', () => {
    const cone: Size = [1, 3, 1]
    expect(frontalArea('cone', cone, [0, -1, 0])).toBeCloseTo(Math.PI * 0.25, 12)
    expect(frontalArea('cone', cone, [1, 0, 0])).toBeCloseTo(1.5, 12)
  })

  it('never goes negative for any direction, and scales with the square of the size', () => {
    const dirs: Size[] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [-0.577, -0.577, -0.577],
      [0.6, -0.8, 0]
    ]
    for (const shape of ['sphere', 'box', 'cylinder', 'capsule', 'cone', 'ramp']) {
      for (const d of dirs) expect(frontalArea(shape, [0.5, 1, 0.7], d)).toBeGreaterThan(0)
      const small = frontalArea(shape, [0.5, 1, 0.7], [1, 0, 0])
      const big = frontalArea(shape, [500, 1000, 700], [1, 0, 0])
      expect(big / small).toBeCloseTo(1e6, 6)
    }
  })

  it('reads a size as a length whichever way it was typed', () => {
    // A negative size from an old file gave a negative volume, which world.ts clamped to a
    // mass of a microgram: the ball then flew off at the first touch.
    for (const shape of ['sphere', 'box', 'cylinder', 'capsule', 'cone', 'ramp', 'pulley']) {
      const v = shapeVolume(shape, [0.5, 1, 0.7])
      expect(v).toBeGreaterThan(0)
      expect(shapeVolume(shape, [-0.5, 1, 0.7])).toBeCloseTo(v, 12)
      expect(shapeVolume(shape, [0.5, -1, 0.7])).toBeCloseTo(v, 12)
      expect(shapeVolume(shape, [-0.5, -1, -0.7])).toBeCloseTo(v, 12)
      for (const d of [[1, 0, 0], [0, 1, 0], [0.6, -0.8, 0]] as Size[]) {
        const a = frontalArea(shape, [0.5, 1, 0.7], d)
        expect(a).toBeGreaterThan(0)
        expect(frontalArea(shape, [-0.5, -1, -0.7], d)).toBeCloseTo(a, 12)
      }
    }
    expect(shapeVolume('sphere', [-0.5, 0, 0])).toBeCloseTo(0.5236, 4)
  })

  it('the Sandbox knows every material it names, and falls back to steel', () => {
    expect(materialById('nonsense')).toBe(MATERIALS[0])
    for (const m of MATERIALS) {
      expect(materialById(m.id)).toBe(m)
      expect(m.density).toBeGreaterThan(0)
      expect(m.friction).toBeGreaterThanOrEqual(0)
      expect(m.restitution).toBeGreaterThanOrEqual(0)
      expect(m.restitution).toBeLessThanOrEqual(1)
    }
    expect(dragCoefficient('sphere')).toBeCloseTo(0.47)
    expect(dragCoefficient('box')).toBeCloseTo(1.05)
  })
})
