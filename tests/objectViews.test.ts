// The pixel decisions behind the object views: an arrow head that stays 12 px at every zoom, a
// point drawn smaller than 0.6.0 drew it, and a letter that never sits on its own point or on a
// neighbour's.

import { describe, expect, it } from 'vitest'
import { HALO_TIP_PX, HEAD_HALF_ANGLE_DEG, HEAD_PX, LABEL_BOX, POINT_PX, POINT_REACH_PX, arrowHead, pickLabelOffset, pointHalo, pointRadius } from '../src/renderer/src/render/viewMath'
import { readSource } from './helpers/repo'

describe('flat arrow heads', () => {
  it('are 12 px long with a 25° half-angle at any zoom', () => {
    expect(HEAD_PX).toBe(12)
    expect(HEAD_HALF_ANGLE_DEG).toBe(25)
    for (const wpp of [0.01, 0.1, 1, 7.5]) {
      const h = arrowHead(1000 * wpp, wpp)
      expect(h.headLen / wpp).toBeCloseTo(12, 9)
      expect(h.halfWidth / wpp).toBeCloseTo(12 * Math.tan((25 * Math.PI) / 180), 9)
      expect(h.halfWidth / wpp).toBeCloseTo(5.6, 1)
      expect(h.shaftLen / wpp).toBeCloseTo(988, 9)
    }
  })

  it('give most of a very short arrow to the shaft, and never a zero shaft', () => {
    const h = arrowHead(10, 1)
    expect(h.headLen).toBeCloseTo(4.5, 9)
    expect(h.shaftLen).toBeCloseTo(5.5, 9)
    expect(arrowHead(0, 1).shaftLen).toBeGreaterThan(0)
  })

  it('take another length for the halo and the components, at the same angle', () => {
    const big = arrowHead(100, 1, 15)
    const small = arrowHead(100, 1, 10)
    expect(big.headLen).toBe(15)
    expect(small.headLen).toBe(10)
    expect(big.halfWidth / big.headLen).toBeCloseTo(small.halfWidth / small.headLen, 12)
  })

  it('are drawn as a flat triangle in 2-D and the cone only in 3-D', () => {
    const src = readSource('src/renderer/src/render/ObjectViews.tsx')
    expect(src).toMatch(/geometry=\{is3D \? coneGeo : flatHeadGeo\}/)
    // A triangle with its base on the x axis and its apex at +y: three vertices, no more.
    expect(src).toMatch(/flatHeadGeo = new THREE\.BufferGeometry\(\)\.setAttribute\('position', new THREE\.Float32BufferAttribute\(\[-1, 0, 0, 1, 0, 0, 0, 1, 0\], 3\)\)/)
    expect(src).toMatch(/arrowHead\(L, wpp, headPx \?\? \(is3D \? 15 : HEAD_PX\)\)/)
    // The head and the shaft share one material and one render order, so they never disagree.
    expect(src).toMatch(/<mesh ref=\{shaft\} geometry=\{cylGeo\} material=\{mat\} renderOrder=\{renderOrder\} \/>\n\s*<mesh ref=\{head\} geometry=\{is3D \? coneGeo : flatHeadGeo\} material=\{mat\} renderOrder=\{renderOrder\} \/>/)
  })

  it('are laid out from the projected direction in 2-D, so a vector with a z part keeps a square head', () => {
    const src = readSource('src/renderer/src/render/ObjectViews.tsx')
    expect(src).toMatch(/const flat: V3 = is3D \? comp : \[comp\[0\], comp\[1\], 0\]/)
  })

  it('give the selection halo an outline of one width all round, head included', () => {
    // 1.1 px a side beside the shaft; the same 1.1 px outside the 25° edges needs 1.1 / sin 25°.
    expect(HALO_TIP_PX).toBeCloseTo(1.1 / Math.sin((25 * Math.PI) / 180), 9)
    expect(HALO_TIP_PX).toBeCloseTo(2.6, 1)
    const src = readSource('src/renderer/src/render/ObjectViews.tsx')
    expect(src).toMatch(/thick=\{thick \+ 2\.2\} renderOrder=\{11\} headPx=\{15\} headRadPx=\{8\.5\} tipPx=\{HALO_TIP_PX\}/)
    expect(src).toMatch(/const L = L0 \+ tipPx \* wpp/)
  })
})

describe('the resultant is coloured between its parents', () => {
  it('is mixed by the scene bridge when it draws, and again by the view from the live parents', () => {
    const vis = readSource('src/renderer/src/core/visualize.ts')
    expect(vis).toMatch(/o\.color = mixOklabMany\(inputs\.map\(\(p\) => p\.color\)\)/)
    expect(vis).toMatch(/mixParents\.set\(o\.id, inputs\.map\(\(p\) => p\.id\)\)/)
    // And forgotten with the answer, when the next drawing replaces it.
    expect(vis).toMatch(/for \(const id of ids\) mixParents\.delete\(id\)/)
    const view = readSource('src/renderer/src/render/ObjectViews.tsx')
    expect(view).toMatch(/mixParents\.get\(obj\.id\)/)
    expect(view).toMatch(/parents\.length >= 2 \? mixOklabMany\(parents\) : obj\.color/)
    // Redone on a theme change: WebGPU compiles the colour in, so the memo is keyed on the theme.
    expect(view).toMatch(/\[parentColours, obj\.color, colors\.theme\]/)
    // The mixed colour is what the main arrow is drawn with.
    expect(view).toMatch(/<Arrow tail=\{tail\} comp=\{comp\} color=\{color\} is3D=\{is3D\} thick=\{thick\} \/>/)
  })
})

describe('smaller points', () => {
  it('draw a free point at about two thirds of the 5 px of 0.6.0, and a derived one smaller', () => {
    expect(POINT_PX.free / 5).toBeGreaterThanOrEqual(0.6)
    expect(POINT_PX.free / 5).toBeLessThanOrEqual(0.7)
    expect(POINT_PX.derived / 4).toBeGreaterThanOrEqual(0.6)
    expect(POINT_PX.derived / 4).toBeLessThanOrEqual(0.7)
    expect(pointRadius(undefined, true, false)).toBe(POINT_PX.free)
    expect(pointRadius(undefined, false, false)).toBe(POINT_PX.derived)
    expect(pointRadius(undefined, true, true)).toBeGreaterThan(POINT_PX.free)
  })

  it('keep a size the student set', () => {
    expect(pointRadius(8, true, false)).toBe(8)
  })

  it('keep the halo in proportion, as 0.6.0 had it at 6.6 for 5, but never under a pixel wide', () => {
    expect(pointHalo(5)).toBeCloseTo(6.6, 9)
    expect(pointHalo(POINT_PX.free) / POINT_PX.free).toBeCloseTo(1.32, 9)
    expect(pointHalo(POINT_PX.free)).toBeLessThan(6.6)
    expect(pointHalo(POINT_PX.derived) - POINT_PX.derived).toBeGreaterThanOrEqual(1)
    expect(pointHalo(1) - 1).toBeGreaterThanOrEqual(1)
  })

  it('are picked from a 44 px target, whatever size the dot is drawn at', () => {
    expect(POINT_REACH_PX * 2).toBeGreaterThanOrEqual(44)
    const picking = readSource('src/renderer/src/render/picking.ts')
    // A point still wins over a line (priority 0), from the shared reach and not a literal.
    expect(picking).toMatch(/case 'point': \{\n\s*const s = scr\(c\.p\)\n\s*if \(s\.visible\) offer\(\{ id, part: 'body', dist: Math\.hypot\(s\.x - sx, s\.y - sy\), priority: 0 \}, POINT_REACH_PX\)/)
    // Snapping a new point onto an old one keeps its own, tighter radius.
    expect(readSource('src/renderer/src/render/Interaction.tsx')).toMatch(/const SNAP_POINT_PX = 12/)
  })

  it('are drawn through the pure helpers', () => {
    const src = readSource('src/renderer/src/render/ObjectViews.tsx')
    expect(src).toMatch(/const r = pointRadius\(obj\.size, free, hovered\)/)
    expect(src).toMatch(/<circleGeometry args=\{\[pointHalo\(r\), 28\]\} \/>/)
    expect(src).toMatch(/labelAnchors\.set\(obj\.id, \{ p: pos, \.\.\.pickLabelOffset\(\{ x: me\.x, y: me\.y, r \}, near\) \}\)/)
  })

  it('project every point once a frame for the labels, and only the points of the drawing on screen', () => {
    const src = readSource('src/renderer/src/render/ObjectViews.tsx')
    // One shared projection per frame, keyed on the clock R3F advances before any useFrame runs.
    expect(src).toMatch(/projectPoints\(camera, size, clock\.elapsedTime\)/)
    expect(src).toMatch(/if \(cache\.at === at && cache\.w === size\.width && cache\.h === size\.height\) return cache\.pts/)
    // The same visibility rule SceneObjects draws by, so a hidden drawing's point moves no letter.
    expect(src).toMatch(/!visibleIn\(o, activeSpace\) \|\| oc\?\.type !== 'point'/)
  })
})

describe('where a point label goes', () => {
  const P = { x: 100, y: 100, r: 3.4 }
  /** Whether the label box centred at the offset covers a point of radius r. */
  const covers = (o: { dx: number; dy: number }, n: { x: number; y: number }, r = P.r) => {
    const left = P.x + o.dx - LABEL_BOX.w / 2
    const top = P.y + o.dy - LABEL_BOX.h / 2
    const cx = Math.max(left, Math.min(n.x, left + LABEL_BOX.w))
    const cy = Math.max(top, Math.min(n.y, top + LABEL_BOX.h))
    return Math.hypot(n.x - cx, n.y - cy) < r
  }

  it('is up and to the right by default, clear of the point', () => {
    const o = pickLabelOffset(P, [])
    expect(o.dx).toBeGreaterThan(0)
    expect(o.dy).toBeLessThan(0)
    expect(covers(o, P)).toBe(false)
  })

  it('moves to another corner when a neighbour sits up-right, and never covers either point', () => {
    const n = { x: 112, y: 88 }
    const o = pickLabelOffset(P, [n])
    expect(o.dx < 0 || o.dy > 0).toBe(true)
    expect(covers(o, P)).toBe(false)
    expect(covers(o, n)).toBe(false)
  })

  it('finds a free side when every corner is taken', () => {
    const corners = [
      { x: 116, y: 84 },
      { x: 84, y: 84 },
      { x: 116, y: 116 },
      { x: 84, y: 116 }
    ]
    const o = pickLabelOffset(P, corners)
    // A side slot: the corners are all taken.
    expect(o.dx === 0 || o.dy === 0).toBe(true)
    expect(covers(o, P)).toBe(false)
    for (const n of corners) expect(covers(o, n)).toBe(false)
  })

  it('still answers, with the least overlap, when the point is surrounded', () => {
    const ring = Array.from({ length: 16 }, (_, i) => ({ x: 100 + 9 * Math.cos((i * Math.PI) / 8), y: 100 + 9 * Math.sin((i * Math.PI) / 8) }))
    const o = pickLabelOffset(P, ring)
    expect(Number.isFinite(o.dx) && Number.isFinite(o.dy)).toBe(true)
    expect(covers(o, P)).toBe(false)
  })

  it('clears a bigger point too', () => {
    const big = { x: 50, y: 50, r: 9 }
    const o = pickLabelOffset(big, [])
    const left = big.x + o.dx - LABEL_BOX.w / 2
    const top = big.y + o.dy - LABEL_BOX.h / 2
    const cx = Math.max(left, Math.min(big.x, left + LABEL_BOX.w))
    const cy = Math.max(top, Math.min(big.y, top + LABEL_BOX.h))
    expect(Math.hypot(big.x - cx, big.y - cy)).toBeGreaterThanOrEqual(big.r)
  })
})
