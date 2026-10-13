// The Sandbox's springs, strings, ropes, balls, outlines and pulley are meshes built here from
// plain numbers (render/sandboxLooks.ts), so everything about them that can be wrong is a number:
// a coil that gains a turn when it stretches, a wire that thins, a rod turned the wrong way, a
// triangle wound inside out (invisible: three.js culls it), an outline that thickens with the body.
// Nothing here needs a canvas.

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { V3 } from '../src/renderer/src/math/vec'
import type { ShapeKind } from '../src/renderer/src/sim/types'
import {
  ballFactors,
  BALL_SEGMENTS,
  BALL_TONES,
  beadMatrices,
  bodyLook,
  coilCentreline,
  coilIndex,
  coilVertexCount,
  EDGE_RADIUS,
  EDGE_TONE,
  edgeCage,
  edgeRadiusFor,
  hingePin,
  LINK_LOOK,
  linkPlacement,
  MAX_WIRE,
  mergeMeshes,
  pulleyMesh,
  pulleyRopePath,
  RAMP_EDGES,
  RAMP_TRIANGLES,
  rampCorners,
  rampSurface,
  RIM_SEGMENTS,
  ropeMatrices,
  SPRING_COIL,
  springLook,
  visibleRadius,
  writeCoil,
  type MeshData
} from '../src/renderer/src/render/sandboxLooks'
import { bodyGeometry, surfaceOf } from '../src/renderer/src/render/sandboxMeshes'
import { makeBody } from '../src/renderer/src/sim/store'

const TAU = Math.PI * 2

/** A repeatable stream of numbers in [0, 1): a test that fails must fail the same way again. */
function stream(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

const sub = (a: ArrayLike<number>, b: ArrayLike<number>): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: ArrayLike<number>, b: ArrayLike<number>): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: ArrayLike<number>, b: ArrayLike<number>): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: ArrayLike<number>): number => Math.hypot(a[0], a[1], a[2])
const unit = (a: ArrayLike<number>): V3 => {
  const l = len(a)
  return [a[0] / l, a[1] / l, a[2] / l]
}

/** Directions that have gone wrong before: along each axis, both ways, nearly vertical, and a spread of others. */
function directions(count = 40): V3[] {
  const r = stream(7)
  const fixed: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 1, 1], [-0.3, -0.9, 0.2], [0.01, -1, 0.02], [1e-7, -1, 0], [0, 0.99, 0.14], [0.6, -0.8, 0]]
  const out = [...fixed]
  while (out.length < count) out.push(unit([r() - 0.5, r() - 0.5, r() - 0.5]))
  return out.map((d) => unit(d))
}

const at = (p: V3, d: V3, k: number): V3 => [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k]

// ---------------------------------------------------------------------------------------------
// A. The spring coil
// ---------------------------------------------------------------------------------------------

describe('the spring coil', () => {
  const N = SPRING_COIL.turns * SPRING_COIL.segmentsPerTurn

  /** The thread's total turning about its axis between its first and last sample that have a radius, in turns. */
  function turnsOf(a: V3, b: V3, coilRadius = 0.1): number {
    const c = coilCentreline(a, b, coilRadius)
    const d = unit(sub(b, a))
    const perp = (i: number): V3 => {
      const p = sub([c[3 * i], c[3 * i + 1], c[3 * i + 2]], a)
      const k = dot(p, d)
      return [p[0] - k * d[0], p[1] - k * d[1], p[2] - k * d[2]]
    }
    let angle = 0
    // Samples 0 and N lie on the axis (no radius, no angle): count from 1 to N − 1.
    for (let i = 1; i < N - 1; i++) angle += Math.atan2(dot(cross(perp(i), perp(i + 1)), d), dot(perp(i), perp(i + 1)))
    return angle / TAU
  }

  it('has the same number of turns at 0.3 m, 1 m and 3 m, in every direction', () => {
    // Samples 1 … N−1 span (N − 2) of N steps of the 10 turns, whatever the length.
    const expected = (SPRING_COIL.turns * (N - 2)) / N
    for (const d of directions(14)) {
      for (const L of [0.3, 1, 3]) {
        const a: V3 = [1.5, -2, 0.5]
        expect(turnsOf(a, at(a, d, L)), `length ${L} along ${d.map((x) => x.toFixed(2))}`).toBeCloseTo(expected, 9)
      }
    }
    // And that is ten turns with the two quarter-turn leads: not nine, not eleven.
    expect(expected).toBeGreaterThan(9.8)
    expect(expected).toBeLessThan(10)
  })

  it('starts exactly at a and ends exactly at b, for any direction and any place in the world', () => {
    const r = stream(11)
    for (const d of directions(36)) {
      const a: V3 = [(r() - 0.5) * 400, (r() - 0.5) * 400, (r() - 0.5) * 400]
      const L = 0.05 + r() * 8
      const b = at(a, d, L)
      const c = coilCentreline(a, b, 0.12)
      expect(len(sub([c[0], c[1], c[2]], a))).toBeLessThan(1e-9)
      expect(len(sub([c[3 * N], c[3 * N + 1], c[3 * N + 2]], b))).toBeLessThan(1e-9)
    }
  })

  it('has an axial extent of exactly |b − a|, nothing sticking out past either end', () => {
    for (const d of directions(24)) {
      for (const L of [0.3, 1, 3]) {
        const a: V3 = [0.4, 1.1, -0.7]
        const b = at(a, d, L)
        const c = coilCentreline(a, b, 0.1)
        const axis = unit(sub(b, a))
        let lo = Infinity
        let hi = -Infinity
        for (let i = 0; i <= N; i++) {
          const k = dot(sub([c[3 * i], c[3 * i + 1], c[3 * i + 2]], a), axis)
          lo = Math.min(lo, k)
          hi = Math.max(hi, k)
        }
        expect(lo).toBeGreaterThan(-1e-12)
        expect(hi - lo).toBeCloseTo(L, 9)
      }
    }
  })

  it('tapers the helix to nothing over the first and last quarter turn, and is a full coil between', () => {
    const a: V3 = [0, 0, 0]
    const b: V3 = [0, 0, 2]
    const c = coilCentreline(a, b, 0.1)
    const radius = (i: number) => Math.hypot(c[3 * i], c[3 * i + 1])
    expect(radius(0)).toBeLessThan(1e-12)
    expect(radius(N)).toBeLessThan(1e-12)
    expect(radius(1)).toBeGreaterThan(0)
    expect(radius(1)).toBeLessThan(0.1)
    // A quarter turn is a quarter of 16 samples: the radius is whole by sample 4 and stays whole.
    for (let i = SPRING_COIL.segmentsPerTurn / 4; i <= N - SPRING_COIL.segmentsPerTurn / 4; i++) expect(radius(i)).toBeCloseTo(0.1, 12)
  })

  /** The wire's cross-section ring i: its centre (the mean of its corners) and its corners' spread. */
  function rings(a: V3, b: V3, coilRadius: number, wire: number) {
    const count = coilVertexCount()
    const pos = new Float32Array(count * 3)
    const nor = new Float32Array(count * 3)
    writeCoil(a, b, coilRadius, wire, pos, nor)
    const R = SPRING_COIL.radialSegments
    const out: { centre: V3; spread: number; normalSpread: number }[] = []
    for (let i = 0; i <= N; i++) {
      const centre: V3 = [0, 0, 0]
      for (let j = 0; j < R; j++) for (let k = 0; k < 3; k++) centre[k] += pos[3 * (i * R + j) + k] / R
      let spread = 0
      let normalSpread = 0
      for (let j = 0; j < R; j++) {
        const v = 3 * (i * R + j)
        spread = Math.max(spread, Math.abs(len(sub([pos[v], pos[v + 1], pos[v + 2]], centre)) - wire))
        normalSpread = Math.max(normalSpread, Math.abs(len([nor[v], nor[v + 1], nor[v + 2]]) - 1))
      }
      out.push({ centre, spread, normalSpread })
    }
    return { pos, nor, rings: out }
  }

  it('keeps the wire at one thickness however far it is stretched or squeezed', () => {
    for (const d of directions(10)) {
      for (const L of [0.02, 0.3, 1, 3, 12]) {
        const a: V3 = [0.4, 1.1, -0.7]
        const { rings: rs } = rings(a, at(a, d, L), 0.1, 0.012)
        // Every corner of every ring is the wire's radius from the ring's centre, to float32 rounding.
        for (const r of rs) expect(r.spread).toBeLessThan(3e-6)
        for (const r of rs) expect(r.normalSpread).toBeLessThan(1e-5)
      }
    }
  })

  it('centres the wire on the thread: the written rings agree with the centre line to float32 rounding', () => {
    const a: V3 = [3, -1, 2]
    const b: V3 = [3.4, -2.6, 2.9]
    const c = coilCentreline(a, b, 0.09)
    const { rings: rs } = rings(a, b, 0.09, 0.015)
    rs.forEach((r, i) => expect(len(sub(r.centre, [c[3 * i], c[3 * i + 1], c[3 * i + 2]]))).toBeLessThan(5e-6))
  })

  it('winds every triangle outward, so three.js does not cull the wire away', () => {
    const index = coilIndex()
    for (const d of directions(12)) {
      for (const L of [0.3, 1, 3]) {
        const a: V3 = [0, 2, 0]
        const { pos, nor } = rings(a, at(a, d, L), 0.1, 0.012)
        const rep = winding({ positions: pos, normals: nor, indices: index })
        expect(rep.inward, `length ${L} along ${d.map((x) => x.toFixed(2))}`).toBe(0)
        expect(rep.outward).toBeGreaterThan(index.length / 3 - 1)
      }
    }
  })

  /** Radius of the circle through three points: how tightly the thread bends there. */
  const bendRadius = (p: V3, q: V3, r: V3): number => {
    const a = sub(q, p)
    const b = sub(r, q)
    const c = sub(r, p)
    const twice = len(cross(a, c))
    return twice < 1e-15 ? Infinity : (len(a) * len(b) * len(c)) / (2 * twice)
  }

  it('leaves each end across the axis, so the end hook bends gently and never doubles back', () => {
    // The thread used to leave along the axis and swing out to the coil within a few millimetres
    // of a short spring's length: a bend far tighter than the wire, and nine inside-out triangles
    // at the ends of a 0.3 m spring. Leaving across the axis, the tightest bend anywhere is about
    // half the coil radius (the hook from the axis out to the coil), whatever the length.
    for (const d of directions(14)) {
      for (const L of [0.05, 0.3, 1, 3]) {
        const a: V3 = [0.2, 1, -0.4]
        const b = at(a, d, L)
        const c = coilCentreline(a, b, 0.1)
        const p = (i: number): V3 => [c[3 * i], c[3 * i + 1], c[3 * i + 2]]
        const axis = unit(sub(b, a))
        // The first and the last piece of thread run more across the axis than along it.
        expect(Math.abs(dot(unit(sub(p(1), p(0))), axis)), `start, ${L} m`).toBeLessThan(0.5)
        expect(Math.abs(dot(unit(sub(p(N), p(N - 1))), axis)), `end, ${L} m`).toBeLessThan(0.5)
        let tightest = Infinity
        for (let i = 1; i < N; i++) tightest = Math.min(tightest, bendRadius(p(i - 1), p(i), p(i + 1)))
        expect(tightest, `${L} m along ${d.map((x) => x.toFixed(2))}`).toBeGreaterThan(0.45 * 0.1)
      }
    }
  })

  it('holds the wire to MAX_WIRE of the coil radius, so a wire thickened to stay visible never folds', () => {
    // Zoomed out, visibleRadius asks for a wire as wide as the coil itself. The tightest bend is
    // about half the coil radius, so a wire thicker than that would turn its inner side inside out.
    expect(MAX_WIRE).toBeLessThanOrEqual(0.4)
    expect(MAX_WIRE).toBeGreaterThanOrEqual(0.25)
    const index = coilIndex()
    for (const d of directions(10)) {
      for (const L of [0.05, 0.3, 1, 3, 12]) {
        const a: V3 = [0, 2, 0]
        const count = coilVertexCount()
        const pos = new Float32Array(count * 3)
        const nor = new Float32Array(count * 3)
        writeCoil(a, at(a, d, L), 0.1, 0.5, pos, nor)
        // Every corner is MAX_WIRE × 0.1 m from its ring's centre on the thread.
        const c = coilCentreline(a, at(a, d, L), 0.1)
        const R = SPRING_COIL.radialSegments
        for (let i = 0; i <= N; i += 7) {
          for (let j = 0; j < R; j++) {
            const v = 3 * (i * R + j)
            expect(len(sub([pos[v], pos[v + 1], pos[v + 2]], [c[3 * i], c[3 * i + 1], c[3 * i + 2]]))).toBeCloseTo(MAX_WIRE * 0.1, 5)
          }
        }
        const rep = winding({ positions: pos, normals: nor, indices: index })
        expect(rep.inward, `${L} m along ${d.map((x) => x.toFixed(2))}`).toBe(0)
      }
    }
  })

  it('joins the rings with a fixed index buffer that stays inside the vertices', () => {
    const index = coilIndex()
    const R = SPRING_COIL.radialSegments
    expect(index.length).toBe(N * R * 6)
    expect(coilVertexCount()).toBe((N + 1) * R)
    let top = 0
    for (const i of index) top = Math.max(top, i)
    expect(top).toBe(coilVertexCount() - 1)
    // The same call twice gives the same buffer: only the positions move each frame.
    expect([...coilIndex()]).toEqual([...index])
  })

  it('fills exactly its vertices and refuses an array that is too small', () => {
    const count = coilVertexCount()
    const pos = new Float32Array(count * 3 + 6).fill(7)
    const nor = new Float32Array(count * 3 + 6).fill(7)
    writeCoil([0, 0, 0], [0, 1, 0], 0.1, 0.01, pos, nor)
    for (let i = count * 3; i < count * 3 + 6; i++) {
      expect(pos[i]).toBe(7)
      expect(nor[i]).toBe(7)
    }
    expect(() => writeCoil([0, 0, 0], [0, 1, 0], 0.1, 0.01, new Float32Array(10), new Float32Array(10))).toThrow(RangeError)
    expect(() => coilIndex({ turns: 0, segmentsPerTurn: 16, radialSegments: 8 })).toThrow(RangeError)
  })

  it('is the same whichever way round it is written: a → b and b → a trace one thread', () => {
    const a: V3 = [1, 2, 3]
    const b: V3 = [2, 0.5, 3.5]
    const one = coilCentreline(a, b, 0.1)
    const two = coilCentreline(b, a, 0.1)
    // Same ends, same axial extent; the thread is reversed.
    expect(len(sub([two[0], two[1], two[2]], b))).toBeLessThan(1e-9)
    expect(len(sub([two[3 * N], two[3 * N + 1], two[3 * N + 2]], a))).toBeLessThan(1e-9)
    expect(one.length).toBe(two.length)
  })

  it('gives no NaN and does not crash when the two ends are the same point, or nearly', () => {
    for (const [a, b] of [
      [[1, 2, 3], [1, 2, 3]],
      [[0, 0, 0], [0, 1e-13, 0]],
      [[0, 0, 0], [1e-9, 0, 0]],
      [[5, 5, 5], [5, 5.0000001, 5]]
    ] as [V3, V3][]) {
      const { pos, nor } = rings(a, b, 0.1, 0.012)
      for (const v of pos) expect(Number.isFinite(v)).toBe(true)
      for (const v of nor) expect(Number.isFinite(v)).toBe(true)
      const c = coilCentreline(a, b, 0.1)
      expect(len(sub([c[0], c[1], c[2]], a))).toBeLessThan(1e-9)
      for (const v of c) expect(Number.isFinite(v)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------------------------
// The look of one spring
// ---------------------------------------------------------------------------------------------

describe('the look of a spring', () => {
  it('takes its turns and its width from its natural length, so stretching it changes neither', () => {
    // A spring of 1.4 m (Mass on a spring) and one of 3 m (Spring on ice): both read as springs at
    // rest, turns about a coil width apart, and they keep those turns however far they stretch.
    for (const L of [0.3, 0.6, 1.4, 3, 5]) {
      const look = springLook(L)
      expect(Number.isInteger(look.shape.turns)).toBe(true)
      expect(look.shape.turns).toBeGreaterThanOrEqual(6)
      expect(look.shape.turns).toBeLessThanOrEqual(40)
      expect(look.coilRadius).toBeGreaterThanOrEqual(0.05)
      expect(look.coilRadius).toBeLessThanOrEqual(0.12)
      // At rest the turns stand between half a coil width and two coil widths apart.
      const pitch = L / look.shape.turns
      if (look.shape.turns > 6 && look.shape.turns < 40) {
        expect(pitch).toBeGreaterThan(0.5 * look.coilRadius)
        expect(pitch).toBeLessThan(2 * look.coilRadius)
      }
      // The same spring always gets the same look: nothing here depends on how far it is stretched.
      expect(springLook(L)).toEqual(look)
    }
    expect(springLook(1.4).shape.turns).toBeGreaterThan(springLook(0.6).shape.turns)
    expect(springLook(3).shape.turns).toBeGreaterThan(springLook(1.4).shape.turns)
  })

  it('draws the wire a fraction of the coil, comfortably inside what the coil can bend round', () => {
    for (const L of [0.1, 0.5, 1.4, 3, 20]) {
      const look = springLook(L)
      expect(look.wireRadius).toBeGreaterThan(0)
      expect(look.wireRadius).toBeLessThanOrEqual(0.2 * look.coilRadius)
      expect(look.shape.radialSegments).toBeGreaterThanOrEqual(6)
      expect(look.shape.segmentsPerTurn % 4).toBe(0)
    }
  })

  it('gives a sensible spring for a length of nothing, a negative one or a nonsense one', () => {
    for (const L of [0, -2, NaN, Infinity, 1e6]) {
      const look = springLook(L)
      expect(Number.isFinite(look.coilRadius) && Number.isFinite(look.wireRadius)).toBe(true)
      expect(coilVertexCount(look.shape)).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------------------------
// B. Rods, strings and the links of a rope
// ---------------------------------------------------------------------------------------------

describe('how each kind of connection is drawn', () => {
  it('draws a rod as a bar, a rope thinner, a string thinner still, and a spring as a coil', () => {
    // A rod, a string and a spring were all 1-px lines in one grey: three different physics
    // ideas that looked the same. Each is now its own thickness and its own theme colour.
    expect(LINK_LOOK.rod.radius).toBeGreaterThan(LINK_LOOK.rope.radius)
    expect(LINK_LOOK.rope.radius).toBeGreaterThan(LINK_LOOK.string.radius * 2)
    expect(LINK_LOOK.string.radius).toBeGreaterThan(0)
    expect(LINK_LOOK.pulley.radius).toBe(LINK_LOOK.rope.radius)
    const tokens = [LINK_LOOK.spring.token, LINK_LOOK.rod.token, LINK_LOOK.string.token, LINK_LOOK.rope.token]
    expect(new Set(tokens).size).toBe(4)
    for (const t of tokens) expect(t).toMatch(/^--sim-[a-z]+$/)
    // On screen every one is at least two pixels wide, however far the camera backs off.
    for (const k of ['spring', 'rod', 'string', 'rope', 'pulley', 'hinge'] as const) expect(LINK_LOOK[k].minPixels).toBeGreaterThanOrEqual(2)
  })
})

describe('the rope over a pulley', () => {
  const wheel: V3 = [0, 5, 0]
  const r = 0.3
  const p1: V3 = [-r, 5, 0]
  const p2: V3 = [r, 5, 0]
  const axle: V3 = [0, 0, 1]

  it('runs from the first mass up to the rim, over the top of the wheel, and down to the second', () => {
    const pa: V3 = [-0.3, 2.5, 0]
    const pb: V3 = [0.3, 2.5, 0]
    const path = pulleyRopePath(pa, p1, p2, pb, axle, 12)
    expect(path[0]).toEqual(pa)
    expect(path[1]).toEqual(p1)
    expect(path[path.length - 2]).toEqual(p2)
    expect(path[path.length - 1]).toEqual(pb)
    expect(path).toHaveLength(12 + 3)
    // The arc between the rim points: on the rim, in the wheel's own plane, over the top.
    for (let i = 1; i < path.length - 1; i++) {
      expect(len(sub(path[i], wheel))).toBeCloseTo(r, 9)
      expect(path[i][2]).toBeCloseTo(0, 12)
      expect(path[i][1]).toBeGreaterThanOrEqual(5 - 1e-12)
    }
    // Every step along the arc is one twelfth of the half turn: no corner on the wheel.
    for (let i = 1; i < path.length - 2; i++) expect(len(sub(path[i + 1], path[i]))).toBeLessThan(((Math.PI * r) / 12) * 1.001)
  })

  it('wraps under the wheel when the masses are above it, and works for a wheel turned in space', () => {
    const under = pulleyRopePath([-0.3, 7, 0], p1, p2, [0.3, 7, 0], axle, 8)
    for (let i = 2; i < under.length - 2; i++) expect(under[i][1]).toBeLessThan(5)
    // A wheel whose axle points along x: its rim points are ±r along z, and the arc stays in y–z.
    const turned = pulleyRopePath([0, 2, -0.3], [0, 5, -r], [0, 5, r], [0, 2, 0.3], [1, 0, 0], 8)
    for (let i = 1; i < turned.length - 1; i++) {
      expect(turned[i][0]).toBeCloseTo(0, 12)
      expect(len(sub(turned[i], wheel))).toBeCloseTo(r, 9)
    }
  })

  it('gives no NaN when the wheel has no size or its axle lies along the rope', () => {
    for (const path of [pulleyRopePath([0, 0, 0], wheel, wheel, [1, 0, 0], axle, 8), pulleyRopePath([-1, 0, 0], p1, p2, [1, 0, 0], [1, 0, 0], 8)]) {
      for (const p of path) for (const v of p) expect(Number.isFinite(v)).toBe(true)
    }
  })
})

describe('the pin of a hinge', () => {
  it('stands through the pivot along the hinge axis, and turns with the body', () => {
    // The seesaw's plank turns about a pin through its own centre: drawn, the pivot is visible.
    const flat = hingePin([0, 0.78, 0], [0, 0, 0, 1], [0, 0, 0], 0.3)
    expect(flat.mid).toEqual([0, 0.78, 0])
    expect(flat.length).toBeCloseTo(0.6, 12)
    expect(Math.abs(new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(...flat.quat)).z)).toBeCloseTo(1, 9)
    // Tipped 30° about z, a pivot half a metre along the plank goes round with it; the axis stays z.
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 6)
    const tipped = hingePin([1, 2, 0], [q.x, q.y, q.z, q.w], [0.5, 0, 0], 0.3)
    expect(tipped.mid[0]).toBeCloseTo(1 + 0.5 * Math.cos(Math.PI / 6), 9)
    expect(tipped.mid[1]).toBeCloseTo(2 + 0.5 * Math.sin(Math.PI / 6), 9)
    expect(Math.abs(new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(...tipped.quat)).z)).toBeCloseTo(1, 9)
  })
})

describe('rods, strings and rope links', () => {
  it('turns +y onto the direction from a to b, for every direction including straight down', () => {
    for (const d of directions(120)) {
      const a: V3 = [0.3, -1.2, 4]
      const p = linkPlacement(a, at(a, d, 2.5))
      const q = new THREE.Quaternion(...p.quat)
      expect(q.length()).toBeCloseTo(1, 12)
      const turned = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
      expect(turned.distanceTo(new THREE.Vector3(...d)), `direction ${d}`).toBeLessThan(1e-9)
    }
  })

  it('reports the midpoint and the length', () => {
    const p = linkPlacement([1, 2, 3], [5, 2, -3])
    expect(p.mid).toEqual([3, 2, 0])
    expect(p.length).toBeCloseTo(Math.hypot(4, 0, 6), 12)
  })

  it('fills the placement it is given, so a frame allocates nothing', () => {
    const out = { mid: [0, 0, 0] as V3, quat: [0, 0, 0, 1] as [number, number, number, number], length: 0 }
    const same = linkPlacement([0, 0, 0], [0, 3, 4], out)
    expect(same).toBe(out)
    expect(out.length).toBeCloseTo(5, 12)
  })

  it('has no direction when a == b: identity rotation, zero length, nothing NaN', () => {
    const p = linkPlacement([2, 3, 4], [2, 3, 4])
    expect(p.length).toBe(0)
    expect(p.quat).toEqual([0, 0, 0, 1])
    expect(p.mid).toEqual([2, 3, 4])
  })

  /** A polyline with a bend, so the pieces are not all parallel. */
  const path: V3[] = [[0, 4, 0], [0.1, 3, 0], [0.3, 2.1, 0.2], [0.2, 1.4, 0.5], [0, 1, 0.5]]

  it('gives one matrix per gap, each what Matrix4.compose makes of the same piece', () => {
    const out = new Float32Array(16 * 8)
    const n = ropeMatrices(path, 0.015, out)
    expect(n).toBe(path.length - 1)
    for (let i = 0; i < n; i++) {
      const p = linkPlacement(path[i], path[i + 1])
      const want = new THREE.Matrix4().compose(new THREE.Vector3(...p.mid), new THREE.Quaternion(...p.quat), new THREE.Vector3(0.015, p.length, 0.015))
      for (let k = 0; k < 16; k++) expect(out[16 * i + k]).toBeCloseTo(want.elements[k], 5)
    }
    // Nothing past the last matrix was touched.
    for (let k = 16 * n; k < out.length; k++) expect(out[k]).toBe(0)
  })

  it('joins the pieces end to end, so a rope is one unbroken line and not a dashed one', () => {
    // A straight rope along y: the unit cylinder's two ends (0, ±½, 0) land on the path's points.
    const line: V3[] = [[0, 0, 0], [0, 1, 0], [0, 2, 0]]
    const out = new Float32Array(32)
    ropeMatrices(line, 0.01, out)
    const ends = (i: number) => {
      const m = new THREE.Matrix4().fromArray(out, 16 * i)
      return [new THREE.Vector3(0, -0.5, 0).applyMatrix4(m).y, new THREE.Vector3(0, 0.5, 0).applyMatrix4(m).y]
    }
    expect(ends(0)[0]).toBeCloseTo(0, 6)
    expect(ends(0)[1]).toBeCloseTo(1, 6)
    expect(ends(1)[0]).toBeCloseTo(ends(0)[1], 6)
    // A fill below one still leaves gaps, centred in each piece, for whoever asks for them.
    ropeMatrices(line, 0.01, out, 0.8)
    expect(ends(0)[0]).toBeCloseTo(0.1, 6)
    expect(ends(0)[1]).toBeCloseTo(0.9, 6)
  })

  it('puts a bead on every joint between two pieces, so the rope reads as a chain of links', () => {
    // A rope is a chain of 20 cm links in the engine; the beads show where they join and round off
    // the corner a bend would otherwise leave between two straight pieces.
    const out = new Float32Array(16 * 6)
    const n = beadMatrices(path, 0.02, out)
    expect(n).toBe(path.length - 2)
    for (let i = 0; i < n; i++) {
      const m = new THREE.Matrix4().fromArray(out, 16 * i)
      const centre = new THREE.Vector3(0, 0, 0).applyMatrix4(m)
      expect(centre.distanceTo(new THREE.Vector3(...path[i + 1]))).toBeLessThan(1e-6)
      // A unit sphere scaled to the bead's radius, the same every way.
      expect(new THREE.Vector3(1, 0, 0).applyMatrix4(m).distanceTo(centre)).toBeCloseTo(0.02, 6)
      expect(new THREE.Vector3(0, 1, 0).applyMatrix4(m).distanceTo(centre)).toBeCloseTo(0.02, 6)
    }
    for (let k = 16 * n; k < out.length; k++) expect(out[k]).toBe(0)
    // Never past the buffer, and none for a rope of one piece or none.
    const small = new Float32Array(16 * 2 + 3).fill(5)
    expect(beadMatrices(Array.from({ length: 30 }, (_, i) => [i, 0, 0] as V3), 0.02, small)).toBe(2)
    for (let k = 32; k < small.length; k++) expect(small[k]).toBe(5)
    expect(beadMatrices([[0, 0, 0], [1, 0, 0]], 0.02, small)).toBe(0)
    expect(beadMatrices([], 0.02, small)).toBe(0)
  })

  it('never writes past the buffer: a longer rope than the room is cut, not overflowed', () => {
    const long: V3[] = Array.from({ length: 40 }, (_, i) => [0, i * 0.1, 0] as V3)
    const out = new Float32Array(16 * 10 + 5).fill(3)
    expect(ropeMatrices(long, 0.01, out)).toBe(10)
    for (let k = 160; k < out.length; k++) expect(out[k]).toBe(3)
    expect(ropeMatrices([], 0.01, out)).toBe(0)
    expect(ropeMatrices([[0, 0, 0]], 0.01, out)).toBe(0)
  })

  it('keeps every number finite when two points of the path coincide', () => {
    const out = new Float32Array(16 * 3)
    ropeMatrices([[0, 0, 0], [0, 0, 0], [0, 1, 0], [0, 1, 0]], 0.01, out)
    for (const v of out) expect(Number.isFinite(v)).toBe(true)
    // A piece with no length still has a width a lighting inverse can handle.
    const m = new THREE.Matrix4().fromArray(out, 0)
    expect(Math.abs(m.determinant())).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------------------------
// C. Minimum thickness on screen
// ---------------------------------------------------------------------------------------------

describe('the minimum thickness on screen', () => {
  it('is the world radius while it is wide enough, and half the minimum width in metres when it is not', () => {
    // A 1 cm string at 200 px per metre is 4 px across: already thicker than a 2 px minimum.
    expect(visibleRadius(0.01, 2, 200)).toBe(0.01)
    // At 20 px per metre it would be 0.4 px; the radius becomes half of 2 px = 1 px = 1/20 m / 2.
    expect(visibleRadius(0.01, 2, 20)).toBeCloseTo(0.05, 12)
    expect(visibleRadius(0.001, 3, 100)).toBeCloseTo(0.015, 12)
  })

  it('grows as the camera backs away and never shrinks the world radius', () => {
    let last = 0
    for (const ppm of [400, 200, 100, 50, 25, 10]) {
      const r = visibleRadius(0.004, 2, ppm)
      expect(r).toBeGreaterThanOrEqual(0.004)
      expect(r).toBeGreaterThanOrEqual(last)
      last = r
    }
  })

  it('leaves the radius alone when the camera gives no scale', () => {
    for (const ppm of [0, -5, NaN]) expect(visibleRadius(0.02, 2, ppm)).toBe(0.02)
  })
})

// ---------------------------------------------------------------------------------------------
// D. Ball marking
// ---------------------------------------------------------------------------------------------

describe('marking a ball so its spin shows', () => {
  const [w, h] = BALL_SEGMENTS
  const geo = new THREE.SphereGeometry(0.25, w, h)
  const pos = geo.getAttribute('position').array as Float32Array
  const f = ballFactors(pos, 0.25)

  it('gives three equal factors per vertex, so it tints without changing the hue', () => {
    expect(f.length).toBe(pos.length)
    for (let i = 0; i < f.length; i += 3) {
      expect(f[i]).toBe(f[i + 1])
      expect(f[i]).toBe(f[i + 2])
      expect(f[i]).toBeGreaterThan(0)
      expect(f[i]).toBeLessThanOrEqual(1)
    }
  })

  it('leaves the upper half the body colour, darkens the lower half, and draws a darker band on the equator', () => {
    const at = (i: number) => f[3 * i]
    for (let i = 0; i < pos.length / 3; i++) {
      const y = pos[3 * i + 1] / 0.25
      if (y > 0.1) expect(at(i)).toBeCloseTo(BALL_TONES.light, 6)
      else if (y < -0.1) expect(at(i)).toBeCloseTo(BALL_TONES.dark, 6)
      else if (Math.abs(y) < 0.05) expect(at(i)).toBeCloseTo(BALL_TONES.band, 6)
    }
    expect(BALL_TONES.light).toBe(1)
    expect(BALL_TONES.band).toBeLessThan(BALL_TONES.dark)
    expect(BALL_TONES.dark).toBeLessThan(BALL_TONES.light)
  })

  it('finds an equator ring on the recommended sphere, with the band thin', () => {
    const band = [...Array(pos.length / 3).keys()].filter((i) => f[3 * i] === Math.fround(BALL_TONES.band))
    // One ring of vertices (a seam column included), out of 33.
    expect(band.length).toBe(w + 1)
    for (const i of band) expect(Math.abs(pos[3 * i + 1])).toBeLessThan(1e-6)
  })

  it('reads the same at any size, and finds the radius itself when it is not told', () => {
    const small = new THREE.SphereGeometry(0.02, w, h).getAttribute('position').array as Float32Array
    expect([...ballFactors(small)]).toEqual([...f])
    expect([...ballFactors(small, 0.02)]).toEqual([...f])
  })

  it('does not depend on which way round the ball is looked at: spin about the poles is the one thing it cannot show', () => {
    // Factors are a function of height alone, so turning the ball about its y axis changes nothing,
    // and turning it about any other axis changes the picture. The claim in the doc comment.
    for (let i = 0; i < pos.length / 3; i++) {
      for (let j = i + 1; j < Math.min(pos.length / 3, i + 3); j++) {
        if (Math.abs(pos[3 * i + 1] - pos[3 * j + 1]) < 1e-7) expect(f[3 * i]).toBe(f[3 * j])
      }
    }
  })

  it('copes with nothing at all and with a ball of no size', () => {
    expect(ballFactors([]).length).toBe(0)
    const flat = ballFactors([0, 0, 0, 0, 0, 0])
    for (const v of flat) expect(v).toBe(Math.fround(BALL_TONES.band))
  })
})

// ---------------------------------------------------------------------------------------------
// Triangles seen from outside
// ---------------------------------------------------------------------------------------------

/**
 * For every triangle: does its geometric normal (the winding) point the way its vertex normals
 * do? A triangle that points the other way is culled and the surface has a hole. Triangles with
 * no area (a pole, a squeezed ring) say nothing either way and are counted apart.
 */
function winding(m: MeshData): { outward: number; inward: number; flat: number } {
  let outward = 0
  let inward = 0
  let flat = 0
  for (let t = 0; t < m.indices.length; t += 3) {
    const [i, j, k] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]]
    const p = (n: number): V3 => [m.positions[3 * n], m.positions[3 * n + 1], m.positions[3 * n + 2]]
    const g = cross(sub(p(j), p(i)), sub(p(k), p(i)))
    const s: V3 = [0, 0, 0]
    for (const n of [i, j, k]) for (let c = 0; c < 3; c++) s[c] += m.normals[3 * n + c]
    const scale = len(sub(p(j), p(i))) * len(sub(p(k), p(i)))
    if (len(g) < 1e-9 * Math.max(scale, 1e-12)) flat++
    else if (dot(g, s) > 0) outward++
    else inward++
  }
  return { outward, inward, flat }
}

const bounds = (m: MeshData) => {
  const lo: V3 = [Infinity, Infinity, Infinity]
  const hi: V3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      lo[c] = Math.min(lo[c], m.positions[i + c])
      hi[c] = Math.max(hi[c], m.positions[i + c])
    }
  }
  return { lo, hi }
}

/** Distance from p to the segment qr. */
function toSegment(p: ArrayLike<number>, q: V3, r: V3): number {
  const e = sub(r, q)
  const l2 = dot(e, e)
  const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, q), e) / l2)) : 0
  return len(sub(p, [q[0] + e[0] * t, q[1] + e[1] * t, q[2] + e[2] * t]))
}

const vertex = (m: MeshData, i: number): V3 => [m.positions[3 * i], m.positions[3 * i + 1], m.positions[3 * i + 2]]
const count = (m: MeshData): number => m.positions.length / 3

/**
 * How many triangles of the mesh stay within r of the segment q–s and run across the plane
 * through its midpoint: that is, how much of a tube of radius r there is along that edge. A
 * joint ball at a corner cannot reach the middle of an edge, so only a real tube counts.
 */
function tubeTriangles(m: MeshData, q: V3, s: V3, r: number): number {
  const e = unit(sub(s, q))
  const mid: V3 = [(q[0] + s[0]) / 2, (q[1] + s[1]) / 2, (q[2] + s[2]) / 2]
  let n = 0
  for (let t = 0; t < m.indices.length; t += 3) {
    const ps = [0, 1, 2].map((k) => vertex(m, m.indices[t + k]))
    if (!ps.every((p) => toSegment(p, q, s) < r + 1e-5)) continue
    const side = ps.map((p) => dot(sub(p, mid), e))
    if (Math.min(...side) < 0 && Math.max(...side) > 0) n++
  }
  return n
}

// ---------------------------------------------------------------------------------------------
// E. Edge outlines
// ---------------------------------------------------------------------------------------------

describe('edge outlines', () => {
  const size: V3 = [2, 1, 3]
  const r = 0.05

  const boxCorners = (s: V3): V3[] => {
    const out: V3[] = []
    for (let k = 0; k < 8; k++) out.push([k & 1 ? s[0] / 2 : -s[0] / 2, k & 2 ? s[1] / 2 : -s[1] / 2, k & 4 ? s[2] / 2 : -s[2] / 2])
    return out
  }
  const boxEdges = (s: V3): [V3, V3][] => {
    const c = boxCorners(s)
    const out: [V3, V3][] = []
    for (let k = 0; k < 8; k++) for (const bit of [1, 2, 4]) if (!(k & bit)) out.push([c[k], c[k | bit]])
    return out
  }

  it('draws the twelve edges of a box, a plank and a wall, and every corner', () => {
    expect(boxEdges(size)).toHaveLength(12)
    for (const shape of ['box', 'plank', 'wall'] as const) {
      const cage = edgeCage(shape, size, r)!
      expect(cage).not.toBeNull()
      // Every vertex lies within r of the cuboid's skeleton, and some lie right at r.
      let far = 0
      for (let i = 0; i < count(cage); i++) far = Math.max(far, Math.min(...boxEdges(size).map(([q, s]) => toSegment(vertex(cage, i), q, s))))
      expect(far).toBeLessThan(r + 1e-6)
      expect(far).toBeGreaterThan(r - 1e-6)
      // Each of the 8 corners has vertices all round it, at r from the corner (the joint ball).
      for (const c of boxCorners(size)) {
        const near = [...Array(count(cage)).keys()].filter((i) => Math.abs(len(sub(vertex(cage, i), c)) - r) < 1e-6)
        expect(near.length, `corner ${c}`).toBeGreaterThan(8)
      }
      // Each of the 12 edges has a tube along it: triangles that stay within r of the edge and run from one end to the other.
      for (const [q, s] of boxEdges(size)) expect(tubeTriangles(cage, q, s, r), `edge ${q} → ${s}`).toBeGreaterThanOrEqual(8)
      // Nothing strays outside the box grown by r.
      const { lo, hi } = bounds(cage)
      for (let c = 0; c < 3; c++) {
        expect(lo[c]).toBeCloseTo(-size[c] / 2 - r, 5)
        expect(hi[c]).toBeCloseTo(size[c] / 2 + r, 5)
      }
    }
  })

  it('draws no outline on the ground, a sphere, a capsule or a pulley', () => {
    for (const shape of ['ground', 'sphere', 'capsule', 'pulley'] as const) expect(edgeCage(shape, [1, 1, 1])).toBeNull()
  })

  it('keeps the tubes the same thickness whatever the size of the body', () => {
    // Built for the size, not scaled: a unit cage stretched to a long plank would thicken the
    // short edges' tubes or thin the long ones'.
    for (const s of [[0.5, 0.5, 0.5], [6, 0.1, 0.4], [40, 40, 40]] as V3[]) {
      const cage = edgeCage('box', s, 0.02)!
      let far = 0
      for (let i = 0; i < count(cage); i++) far = Math.max(far, Math.min(...boxEdges(s).map(([q, e]) => toSegment(vertex(cage, i), q, e))))
      // float32 holds a 20 m coordinate to about 2e-6.
      expect(Math.abs(far - 0.02)).toBeLessThan(1e-5)
    }
  })

  it('winds every triangle of every outline outward', () => {
    const cases: [Parameters<typeof edgeCage>[0], V3][] = [['box', [2, 1, 3]], ['plank', [7, 0.1, 0.5]], ['wall', [0.3, 2, 4]], ['ramp', [5, 1.5, 1.5]], ['cylinder', [0.4, 1, 0]], ['cone', [1, 3, 1]]]
    for (const [shape, s] of cases) {
      const rep = winding(edgeCage(shape, s, 0.03)!)
      expect(rep.inward, shape).toBe(0)
      expect(rep.outward, shape).toBeGreaterThan(100)
    }
  })

  it('outlines a ramp along its nine edges and rounds its six corners, from the same corners the surface uses', () => {
    const s: V3 = [5, 1.5, 1.5]
    const v = rampCorners(s)
    expect(v).toHaveLength(6)
    expect(RAMP_EDGES).toHaveLength(9)
    // The corners of a wedge with its right angle at the bottom left (the collision hull's own list).
    expect(v[0]).toEqual([-2.5, -0.75, -0.75])
    expect(v[1]).toEqual([2.5, -0.75, -0.75])
    expect(v[2]).toEqual([-2.5, 0.75, -0.75])
    expect(v[5]).toEqual([-2.5, 0.75, 0.75])
    const cage = edgeCage('ramp', s, 0.04)!
    let far = 0
    for (let i = 0; i < count(cage); i++) far = Math.max(far, Math.min(...RAMP_EDGES.map(([p, q]) => toSegment(vertex(cage, i), v[p], v[q]))))
    expect(far).toBeCloseTo(0.04, 6)
    for (const [p, q] of RAMP_EDGES) expect(tubeTriangles(cage, v[p], v[q], 0.04), `edge ${p}-${q}`).toBeGreaterThanOrEqual(8)
    // And each of the six corners has its joint ball.
    for (const p of v) expect([...Array(count(cage)).keys()].filter((i) => Math.abs(len(sub(vertex(cage, i), p)) - 0.04) < 1e-6).length).toBeGreaterThan(8)
  })

  it('lists the ramp surface and its outline over the same corners: a closed wedge whose edges are real edges', () => {
    // Every outline edge belongs to two of the eight triangles, and every triangle edge that is
    // not on the outline lies in the plane of a face (the quad's diagonal).
    const key = (i: number, j: number) => (i < j ? `${i}-${j}` : `${j}-${i}`)
    const used = new Map<string, number>()
    for (const [a, b, c] of RAMP_TRIANGLES) for (const [i, j] of [[a, b], [b, c], [c, a]]) used.set(key(i, j), (used.get(key(i, j)) ?? 0) + 1)
    for (const [i, j] of RAMP_EDGES) expect(used.get(key(i, j)), `edge ${i}-${j}`).toBe(2)
    // Closed surface: every edge is shared by exactly two triangles.
    for (const n of used.values()) expect(n).toBe(2)
    // The surface is wound outward over the real corners (the old wedge's table was not: see RAMP_TRIANGLES).
    const v = rampCorners([5, 1.5, 1.5])
    const centre: V3 = [0, 0, 0]
    for (const p of v) for (let c = 0; c < 3; c++) centre[c] += p[c] / 6
    const normals = RAMP_TRIANGLES.map(([a, b, c]) => unit(cross(sub(v[b], v[a]), sub(v[c], v[a]))))
    RAMP_TRIANGLES.forEach(([a], i) => expect(dot(normals[i], sub(v[a], centre)), `triangle ${i}`).toBeGreaterThan(0))
    // An outline edge is a real ridge: its two triangles face different ways. Every other edge of
    // the table is the diagonal of a flat face: its two triangles face the same way.
    const outline = new Set(RAMP_EDGES.map(([i, j]) => key(i, j)))
    const sharing = new Map<string, number[]>()
    RAMP_TRIANGLES.forEach(([a, b, c], t) => {
      for (const [i, j] of [[a, b], [b, c], [c, a]]) sharing.set(key(i, j), [...(sharing.get(key(i, j)) ?? []), t])
    })
    for (const [edge, [t1, t2]] of sharing) {
      const same = dot(normals[t1], normals[t2]) > 1 - 1e-9
      expect(same, `edge ${edge}`).toBe(!outline.has(edge))
    }
  })

  it('draws a cylinder as two rims and a cone as its base rim, at the radius their surfaces have', () => {
    const cyl = edgeCage('cylinder', [0.4, 1, 0], 0.02)!
    for (let i = 0; i < count(cyl); i++) {
      const [x, y, z] = vertex(cyl, i)
      const rim = Math.min(Math.hypot(Math.hypot(x, z) - 0.4, y - 0.5), Math.hypot(Math.hypot(x, z) - 0.4, y + 0.5))
      expect(rim).toBeCloseTo(0.02, 6)
    }
    const { lo, hi } = bounds(cyl)
    expect(hi[1]).toBeCloseTo(0.52, 6)
    expect(lo[1]).toBeCloseTo(-0.52, 6)
    expect(hi[0]).toBeCloseTo(0.42, 3)
    // A cone of base width 1 m and height 3 m: a rim of radius 0.5 m at y = −1.5, and nothing at the apex.
    const cone = edgeCage('cone', [1, 3, 1], 0.02)!
    for (let i = 0; i < count(cone); i++) {
      const [x, y, z] = vertex(cone, i)
      expect(Math.hypot(Math.hypot(x, z) - 0.5, y + 1.5)).toBeCloseTo(0.02, 6)
    }
    expect(bounds(cone).hi[1]).toBeLessThan(-1.4)
    // The corners of the rim are the ones surfaceOf cuts a cylinder into.
    expect(RIM_SEGMENTS).toBe(28)
    const corner = [...Array(count(cyl)).keys()].some((i) => Math.abs(vertex(cyl, i)[0] - 0.4 * Math.sin(TAU / RIM_SEGMENTS)) < 0.021 && Math.abs(vertex(cyl, i)[2] - 0.4 * Math.cos(TAU / RIM_SEGMENTS)) < 0.021)
    expect(corner).toBe(true)
  })

  it('caps the tube radius at 6 % of the shortest side, so a small pivot is not all outline', () => {
    expect(edgeRadiusFor('box', [2, 1, 3])).toBe(EDGE_RADIUS)
    expect(edgeRadiusFor('box', [0.06, 0.06, 0.06])).toBeCloseTo(0.0036, 12)
    expect(edgeRadiusFor('box', [4, 0.1, 0.5])).toBeCloseTo(0.006, 12)
    // A cylinder's size is [radius, height]: its width is twice the first number.
    expect(edgeRadiusFor('cylinder', [0.02, 5, 0])).toBeCloseTo(0.0024, 12)
    expect(edgeRadiusFor('cone', [0.1, 3, 0.1])).toBeCloseTo(0.006, 12)
    expect(edgeRadiusFor('box', [0, 0, 0])).toBe(EDGE_RADIUS)
    // And the cage uses it when no radius is given.
    const small = edgeCage('box', [0.06, 0.06, 0.06])!
    expect(bounds(small).hi[0]).toBeCloseTo(0.03 + 0.0036, 6)
  })

  it('does not crash or give NaN for a body of no size', () => {
    for (const shape of ['box', 'ramp', 'cylinder', 'cone'] as const) {
      const cage = edgeCage(shape, [0, 0, 0])!
      for (const v of cage.positions) expect(Number.isFinite(v)).toBe(true)
      for (const v of cage.normals) expect(Number.isFinite(v)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------------------------
// F. The pulley
// ---------------------------------------------------------------------------------------------

describe('the pulley', () => {
  const size: V3 = [0.3, 0.15, 0.3]
  const mesh = pulleyMesh(size)
  const radius = (i: number) => Math.hypot(mesh.positions[3 * i], mesh.positions[3 * i + 2])
  const height = (i: number) => mesh.positions[3 * i + 1]

  it('has the wheel of the plain cylinder it replaces: radius size[0], thickness size[1], along y', () => {
    const { lo, hi } = bounds(mesh)
    let widest = 0
    for (let i = 0; i < count(mesh); i++) widest = Math.max(widest, radius(i))
    expect(widest).toBeCloseTo(0.3, 6)
    // The flat faces of the wheel itself are at ±thickness/2.
    const faces = [...Array(count(mesh)).keys()].filter((i) => radius(i) > 0.2)
    expect(Math.max(...faces.map(height))).toBeCloseTo(0.075, 6)
    expect(Math.min(...faces.map(height))).toBeCloseTo(-0.075, 6)
    // x and z are the wheel's circle; nothing leans.
    expect(hi[0]).toBeCloseTo(0.3, 3)
    expect(lo[2]).toBeCloseTo(-0.3, 3)
  })

  it('cuts a groove round the rim for the rope: at mid-height the wheel is narrower than at its flanges', () => {
    const rimAt = (lowY: number, highY: number) => Math.max(...[...Array(count(mesh)).keys()].filter((i) => Math.abs(height(i)) >= lowY && Math.abs(height(i)) <= highY && radius(i) > 0.15).map(radius))
    const flange = rimAt(0.05, 0.08)
    const floor = rimAt(0, 0.012)
    expect(flange).toBeCloseTo(0.3, 6)
    expect(floor).toBeLessThan(0.3 - 0.02)
    expect(floor).toBeGreaterThan(0.2)
    // Never deeper than the wheel is thick: a thin wheel keeps its rim.
    const thin = pulleyMesh([0.5, 0.02, 0.5])
    const floorThin = Math.max(...[...Array(count(thin)).keys()].filter((i) => Math.abs(thin.positions[3 * i + 1]) < 0.002 && Math.hypot(thin.positions[3 * i], thin.positions[3 * i + 2]) > 0.2).map((i) => Math.hypot(thin.positions[3 * i], thin.positions[3 * i + 2])))
    expect(0.5 - floorThin).toBeLessThanOrEqual(0.45 * 0.02 + 1e-6)
  })

  it('runs a thin axle through the centre, along the wheel axis and out past both faces', () => {
    const axle = [...Array(count(mesh)).keys()].filter((i) => radius(i) < 0.1)
    expect(axle.length).toBeGreaterThan(30)
    const top = Math.max(...axle.map(height))
    expect(top).toBeGreaterThan(0.075 + 0.05)
    expect(Math.min(...axle.map(height))).toBeCloseTo(-top, 6)
    expect(Math.max(...axle.map(radius))).toBeLessThan(0.3 * 0.2)
    expect(Math.max(...axle.map(radius))).toBeGreaterThan(0.01)
  })

  it('tints the axle and the groove darker than the rim and faces, so a hub seen face-on is not lost', () => {
    expect(mesh.factors).toBeDefined()
    const f = mesh.factors!
    expect(f.length).toBe(mesh.positions.length)
    const axleVertex = [...Array(count(mesh)).keys()].find((i) => radius(i) < 0.1 && Math.abs(height(i)) > 0.1)!
    const faceVertex = [...Array(count(mesh)).keys()].find((i) => radius(i) > 0.28 && Math.abs(height(i) - 0.075) < 1e-6)!
    expect(f[3 * axleVertex]).toBeLessThan(f[3 * faceVertex])
    expect(f[3 * faceVertex]).toBe(1)
    for (const v of f) {
      expect(v).toBeGreaterThan(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('winds every triangle outward, and for a thin and a fat wheel alike', () => {
    for (const s of [size, [0.5, 0.02, 0.5], [0.2, 0.6, 0.2], [1, 0.3, 1]] as V3[]) {
      const rep = winding(pulleyMesh(s))
      expect(rep.inward, `size ${s}`).toBe(0)
      expect(rep.outward).toBeGreaterThan(100)
    }
  })

  it('gives no NaN for a wheel of no size', () => {
    const none = pulleyMesh([0, 0, 0])
    for (const v of none.positions) expect(Number.isFinite(v)).toBe(true)
    for (const v of none.normals) expect(Number.isFinite(v)).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------------------------

describe('merging meshes', () => {
  it('puts the parts in one set of arrays and shifts each one’s indices past the vertices before it', () => {
    const a = edgeCage('box', [1, 1, 1], 0.02)!
    const b = pulleyMesh([0.3, 0.15, 0.3])
    const m = mergeMeshes([a, b])
    expect(count(m)).toBe(count(a) + count(b))
    expect(m.indices.length).toBe(a.indices.length + b.indices.length)
    expect([...m.indices.slice(0, a.indices.length)]).toEqual([...a.indices])
    expect(m.indices[a.indices.length]).toBe(b.indices[0] + count(a))
    // The part without factors counts as untouched.
    expect(m.factors).toBeDefined()
    expect(m.factors![0]).toBe(1)
    expect(m.factors![3 * count(a) + 3 * 5]).toBe(b.factors![15])
    // Parts that have none give none.
    expect(mergeMeshes([a, a]).factors).toBeUndefined()
    expect(mergeMeshes([]).positions.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------------------------
// G. Every shape kind looks like what it is
// ---------------------------------------------------------------------------------------------

const KINDS: ShapeKind[] = ['box', 'sphere', 'cylinder', 'capsule', 'cone', 'ramp', 'plank', 'wall', 'ground', 'pulley']

describe('every shape kind has a look of its own', () => {
  /** A body of this kind at its default size, and the mesh the Sandbox draws for it. */
  const look = (shape: ShapeKind) => {
    const def = makeBody(shape, 'X')
    return { def, mesh: bodyLook(def.shape, def.size, surfaceOf(def)) }
  }

  it('tints every vertex with three equal numbers between 0 and 1, so a body keeps the colour it is given', () => {
    for (const k of KINDS) {
      const { mesh } = look(k)
      expect(mesh.factors, k).toBeDefined()
      expect(mesh.factors!.length, k).toBe(mesh.positions.length)
      for (let i = 0; i < mesh.factors!.length; i += 3) {
        expect(mesh.factors![i + 1]).toBe(mesh.factors![i])
        expect(mesh.factors![i + 2]).toBe(mesh.factors![i])
        expect(mesh.factors![i]).toBeGreaterThan(0)
        expect(mesh.factors![i]).toBeLessThanOrEqual(1)
      }
    }
  })

  it('outlines a box, plank, wall and ramp along their edges, a cylinder round both rims and a cone round its base, in a darker tint', () => {
    // Lit faces of one colour ran together: a crate read as a hexagon of one flat colour.
    expect(EDGE_TONE).toBeGreaterThan(0.15)
    expect(EDGE_TONE).toBeLessThan(0.6)
    for (const k of ['box', 'plank', 'wall', 'ramp', 'cylinder', 'cone'] as const) {
      const { def, mesh } = look(k)
      const cage = edgeCage(k, def.size)!
      const n = count(mesh)
      const c = count(cage)
      // The outline is drawn with the body, as the last vertices of its one mesh, in EDGE_TONE.
      for (let i = 0; i < c; i++) {
        expect(mesh.factors![3 * (n - c + i)], `${k} outline`).toBeCloseTo(EDGE_TONE, 6)
        for (let a = 0; a < 3; a++) expect(mesh.positions[3 * (n - c + i) + a]).toBe(cage.positions[3 * i + a])
      }
      // And the body's own surface is untinted.
      for (let i = 0; i < n - c; i++) expect(mesh.factors![3 * i], `${k} surface`).toBe(1)
    }
  })

  it('marks a ball with its two tones and its band, gives a pulley its groove and axle, and leaves a capsule and the floor plain', () => {
    const ball = look('sphere').mesh
    const tones = new Set([...ball.factors!].map((v) => Math.round(v * 1000) / 1000))
    for (const t of [BALL_TONES.light, BALL_TONES.dark, BALL_TONES.band]) expect(tones.has(t)).toBe(true)
    const { def: wheel, mesh } = look('pulley')
    const want = pulleyMesh(wheel.size)
    expect([...mesh.positions]).toEqual([...want.positions])
    expect([...mesh.factors!]).toEqual([...want.factors!])
    for (const k of ['capsule', 'ground'] as const) {
      const { def, mesh: m } = look(k)
      expect(count(m), k).toBe(count(surfaceOf(def)))
      expect([...m.factors!].every((v) => v === 1), k).toBe(true)
    }
  })

  it('draws a ramp from the corners its collision shape uses, flat faces wound outward', () => {
    const s: V3 = [3, 1.5, 1.5]
    const surface = rampSurface(s)
    const corners = rampCorners(s)
    // Every vertex is one of the six corners.
    for (let i = 0; i < count(surface); i++) expect(corners.some((p) => len(sub(vertex(surface, i), p)) < 1e-6)).toBe(true)
    const rep = winding(surface)
    expect(rep.inward).toBe(0)
    expect(rep.outward).toBe(8)
    // Flat shading: each triangle's three normals are its own face's normal.
    for (let t = 0; t < surface.indices.length; t += 3) {
      const n0 = surface.indices[t]
      for (const n of [surface.indices[t + 1], surface.indices[t + 2]]) for (let a = 0; a < 3; a++) expect(surface.normals[3 * n + a]).toBeCloseTo(surface.normals[3 * n0 + a], 6)
    }
  })

  it('winds every triangle of every kind outward, so nothing is culled into a hole', () => {
    for (const k of KINDS) {
      const rep = winding(look(k).mesh)
      expect(rep.inward, k).toBe(0)
    }
  })

  it('draws no two kinds alike: each has its own outline, tints or proportions', () => {
    const signature = (k: ShapeKind) => {
      const { mesh } = look(k)
      const { lo, hi } = bounds(mesh)
      const extent = [0, 1, 2].map((a) => hi[a] - lo[a]).sort((x, y) => x - y)
      const shape = extent.map((e) => (e / extent[2]).toFixed(2)).join(':')
      const tints = [...new Set([...mesh.factors!].map((v) => v.toFixed(2)))].sort().join(',')
      return `${count(mesh)}|${tints}|${shape}`
    }
    const all = KINDS.map(signature)
    expect(new Set(all).size, all.join('\n')).toBe(KINDS.length)
  })

  it('hands three.js the look as it is: positions, normals, tints and the triangles', () => {
    for (const k of KINDS) {
      const def = makeBody(k, 'X')
      const want = bodyLook(def.shape, def.size, surfaceOf(def))
      const g = bodyGeometry(def)
      expect(g.getAttribute('position').count, k).toBe(count(want))
      expect(g.getAttribute('normal').count, k).toBe(count(want))
      expect(g.getAttribute('color').itemSize, k).toBe(3)
      expect([...(g.getAttribute('color').array as Float32Array)], k).toEqual([...want.factors!])
      expect(g.getIndex()!.count, k).toBe(want.indices.length)
      g.dispose()
    }
  })
})
