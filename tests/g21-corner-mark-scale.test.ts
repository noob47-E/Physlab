// T7 proof for audit bug 21 [C6]: "Corner angle orientation flip on small-scale polygons
// (render/pointerMath.ts:41)".
//
// Verdict REAL (the cited file is wrong; the code is render/markGeometry.ts:41-42). `flat` treats
// the corner as having no winding when its cross product is under an ABSOLUTE 1e-9, so a reflex
// corner of a small polygon falls back to the unoriented `angleAt` and its arc is drawn as the
// outside angle. Measured today with the reflex corner (2,0)→(1,0.5)→(2,2):
//   unit scale  : 61 mark points sweeping 4.8367 rad (277.1°, the inside angle) — right
//   ×10⁻⁶ scale : 41 mark points sweeping 1.4464 rad (82.9°, the outside angle) — wrong
import { describe, expect, it } from 'vitest'
import { polygonCornerMark } from '../src/renderer/src/render/markGeometry'

type V = [number, number, number]
const PREV: V = [2, 0, 0]
const VERT: V = [1, 0.5, 0]
const NEXT: V = [2, 2, 0]
const ORIENTATION = 1
const RADIUS = 0.5
const K = 1e-6

const at = (p: V, k: number): V => [p[0] * k, p[1] * k, p[2] * k]

/** Total angle the mark sweeps around the vertex, in radians. */
function sweep(pts: number[][], v: V): number {
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    const a1 = Math.atan2(pts[i - 1][1] - v[1], pts[i - 1][0] - v[0])
    const a2 = Math.atan2(pts[i][1] - v[1], pts[i][0] - v[0])
    let d = a2 - a1
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    total += d
  }
  return total
}

describe('G21: a reflex corner of a tiny polygon gets the outside arc', () => {
  it('the unit-scale corner is drawn as the reflex arc (the reference)', () => {
    expect(sweep(polygonCornerMark(PREV, VERT, NEXT, ORIENTATION, false, RADIUS), VERT)).toBeCloseTo(4.8367, 3)
  })

  it('the same corner at 10⁻⁶ scale sweeps the same angle', () => {
    const big = sweep(polygonCornerMark(PREV, VERT, NEXT, ORIENTATION, false, RADIUS), VERT)
    const small = sweep(polygonCornerMark(at(PREV, K), at(VERT, K), at(NEXT, K), ORIENTATION, false, RADIUS * K), at(VERT, K))
    expect(small).toBeCloseTo(big, 6)
  })
})
