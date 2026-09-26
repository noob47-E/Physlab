// Typing a measurement to set it: the free end must land where the number says, and the number
// must read back exactly as typed. A student who types "hypotenuse = 10" and reads 9.99 has been
// told the drawing cannot be trusted.

import { describe, expect, it } from 'vitest'
import { pointAtAngle, pointAtLength } from '../src/renderer/src/math/setMeasure'
import { angleBetween, dist, sub, type V3 } from '../src/renderer/src/math/vec'

const deg = (d: number) => (d * Math.PI) / 180

const close = (p: V3 | null, q: V3, digits = 9) => {
  expect(p).not.toBeNull()
  for (let i = 0; i < 3; i++) expect(p![i]).toBeCloseTo(q[i], digits)
}

describe('pointAtLength', () => {
  it('keeps the direction of a 3-4-5 triangle when its hypotenuse is set to 10', () => {
    const a: V3 = [0, 0, 0]
    const b: V3 = [3, 4, 0]
    const to = pointAtLength(a, b, 10)
    close(to, [6, 8, 0])
    expect(dist(a, to!)).toBeCloseTo(10, 12)
  })

  it('moves the far end, never the anchor, and works from any anchor', () => {
    const a: V3 = [1, 1, 0]
    const to = pointAtLength(a, [4, 5, 0], 2.5)
    close(to, [2.5, 3, 0])
    expect(dist(a, to!)).toBeCloseTo(2.5, 12)
  })

  it('reads back exactly what was typed, at any scale', () => {
    for (const wanted of [1e-6, 0.1, 6.4, 123.456, 1e6, 1e9]) {
      const to = pointAtLength([2, -3, 1], [5, 1, 1], wanted)!
      expect(dist([2, -3, 1], to)).toBeCloseTo(wanted, 12 - Math.max(0, Math.log10(wanted)))
    }
  })

  it('works in three dimensions', () => {
    const to = pointAtLength([0, 0, 0], [1, 2, 2], 6)
    close(to, [2, 4, 4])
  })

  it('says no when the points coincide, or the length is not a usable number', () => {
    expect(pointAtLength([1, 1, 0], [1, 1, 0], 5)).toBeNull()
    expect(pointAtLength([1, 1, 0], [1 + 1e-12, 1, 0], 5)).toBeNull()
    expect(pointAtLength([0, 0, 0], [1, 0, 0], 0)).toBeNull()
    expect(pointAtLength([0, 0, 0], [1, 0, 0], -4)).toBeNull()
    expect(pointAtLength([0, 0, 0], [1, 0, 0], NaN)).toBeNull()
    expect(pointAtLength([0, 0, 0], [1, 0, 0], Infinity)).toBeNull()
  })
})

describe('pointAtAngle', () => {
  const vertex: V3 = [0, 0, 0]
  const fixed: V3 = [1, 0, 0]

  it('turns the moving arm to the angle asked for and keeps its length', () => {
    const moving: V3 = [0, 2, 0]
    const to = pointAtAngle(vertex, fixed, moving, deg(60))
    close(to, [1, Math.sqrt(3), 0])
    expect(angleBetween(sub(fixed, vertex), sub(to!, vertex))).toBeCloseTo(deg(60), 12)
    expect(dist(vertex, to!)).toBeCloseTo(2, 12)
  })

  it('reads back the angle typed, whatever the vertex and arms', () => {
    const v: V3 = [2, 3, 0]
    const f: V3 = [5, 7, 0]
    const m: V3 = [-1, 4, 0]
    for (const a of [1, 30, 45, 89.9, 90, 120, 179]) {
      const to = pointAtAngle(v, f, m, deg(a))!
      expect(angleBetween(sub(f, v), sub(to, v))).toBeCloseTo(deg(a), 10)
      expect(dist(v, to)).toBeCloseTo(dist(v, m), 10)
      // A flat drawing stays flat.
      expect(to[2]).toBe(0)
    }
  })

  it('keeps the moving arm on the side it already is', () => {
    const above = pointAtAngle(vertex, fixed, [1, 1, 0], deg(90))
    close(above, [0, 1.4142135624, 0])
    const below = pointAtAngle(vertex, fixed, [1, -1, 0], deg(90))
    close(below, [0, -1.4142135624, 0])
  })

  it('turns in the plane the three points make, not always the page', () => {
    // Fixed arm along x, moving arm along z: the result must stay in the xz-plane.
    const to = pointAtAngle(vertex, fixed, [0, 0, 2], deg(45))
    close(to, [Math.SQRT2, 0, Math.SQRT2])
  })

  it('opens collinear arms into the page', () => {
    const to = pointAtAngle(vertex, fixed, [3, 0, 0], deg(90))
    close(to, [0, 3, 0])
    const folded = pointAtAngle(vertex, fixed, [-3, 0, 0], deg(90))
    expect(folded).not.toBeNull()
    expect(angleBetween(fixed, folded!)).toBeCloseTo(deg(90), 12)
    expect(dist(vertex, folded!)).toBeCloseTo(3, 12)
  })

  it('an arm a hair off the line still opens to the side it is on', () => {
    // Near enough collinear to take the fallback, but the fallback used to point at +y whatever
    // side the arm was on: a point just below the fixed arm was opened upwards.
    close(pointAtAngle(vertex, [2, 0, 0], [2, -1e-10, 0], deg(60)), [1, -Math.sqrt(3), 0])
    close(pointAtAngle(vertex, [2, 0, 0], [2, 1e-10, 0], deg(60)), [1, Math.sqrt(3), 0])
    close(pointAtAngle(vertex, [2, 0, 0], [-2, -1e-10, 0], deg(90)), [0, -2, 0])
    // Along z, the same: a hair towards −x opens towards −x.
    close(pointAtAngle(vertex, [0, 0, 1], [-1e-10, 0, 2], deg(90)), [-2, 0, 0])
    close(pointAtAngle(vertex, [0, 0, 1], [1e-10, 0, 2], deg(90)), [2, 0, 0])
  })

  it('judges "in line" against the size of the drawing, not in absolute units', () => {
    // A drawing measured in micrometres: an across-component of 1e-7 is a real angle there, and
    // the point below the arm must stay below it.
    const to = pointAtAngle(vertex, [2e-6, 0, 0], [2e-6, -1e-7, 0], deg(60))!
    expect(to[1]).toBeLessThan(0)
    expect(angleBetween([1, 0, 0], to)).toBeCloseTo(deg(60), 10)
    expect(dist(vertex, to)).toBeCloseTo(Math.hypot(2e-6, 1e-7), 16)
  })

  it('still turns when the collinear arms stand along z (there is no in-page perpendicular)', () => {
    // Used to hand back the vertex itself: the fallback perpendicular was the zero vector.
    const up: V3 = [0, 0, 1]
    const to = pointAtAngle(vertex, up, [0, 0, 2], deg(90))
    expect(to).not.toBeNull()
    expect(dist(vertex, to!)).toBeCloseTo(2, 12)
    expect(angleBetween(up, to!)).toBeCloseTo(deg(90), 12)
    const down = pointAtAngle(vertex, [0, 0, -1], [0, 0, 4], deg(30))
    expect(dist(vertex, down!)).toBeCloseTo(4, 12)
    expect(angleBetween([0, 0, -1], down!)).toBeCloseTo(deg(30), 12)
  })

  it('accepts 0° and 180° and a reflex request lands on the other side', () => {
    close(pointAtAngle(vertex, fixed, [0, 2, 0], 0), [2, 0, 0])
    close(pointAtAngle(vertex, fixed, [0, 2, 0], Math.PI), [-2, 0, 0])
    const reflex = pointAtAngle(vertex, fixed, [0, 2, 0], deg(270))!
    expect(angleBetween(fixed, reflex)).toBeCloseTo(deg(90), 12)
    expect(reflex[1]).toBeLessThan(0)
  })

  it('says no when an arm has no length, or the angle is not a number', () => {
    expect(pointAtAngle(vertex, vertex, [0, 2, 0], deg(30))).toBeNull()
    expect(pointAtAngle(vertex, fixed, vertex, deg(30))).toBeNull()
    expect(pointAtAngle(vertex, fixed, [0, 2, 0], NaN)).toBeNull()
    expect(pointAtAngle(vertex, fixed, [0, 2, 0], Infinity)).toBeNull()
  })

  it('keeps its precision for huge and tiny drawings', () => {
    const huge = pointAtAngle([0, 0, 0], [1e6, 0, 0], [0, 2e6, 0], deg(60))!
    expect(dist([0, 0, 0], huge)).toBeCloseTo(2e6, 3)
    expect(angleBetween([1, 0, 0], huge)).toBeCloseTo(deg(60), 10)
    const tiny = pointAtAngle([0, 0, 0], [1e-4, 0, 0], [0, 2e-4, 0], deg(60))!
    expect(dist([0, 0, 0], tiny)).toBeCloseTo(2e-4, 14)
    expect(angleBetween([1, 0, 0], tiny)).toBeCloseTo(deg(60), 10)
  })
})
