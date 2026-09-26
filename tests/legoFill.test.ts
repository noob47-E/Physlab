// Fix 18 and Fix 20: how a shape's fill is drawn after Decompose, Break apart and Fuse.
// Fix 18 — the owner's purple rectangle, decomposed, broken apart and fused back, came back blue:
// Fuse gave the rebuilt original `decomposed: true`, and a decomposed shape was drawn part by
// part in the series colours even when its one part was the whole rectangle.
// Fix 20 — every part's fill was pulled 4 px in from its sides, leaving an unshaded strip along
// each side and along the cut.

import { beforeEach, describe, expect, it } from 'vitest'
import { useScene } from '../src/renderer/src/core/store'
import type { PolygonObj, SceneObject } from '../src/renderer/src/core/types'
import type { V3 } from '../src/renderer/src/math/vec'
import { decompose } from '../src/renderer/src/math/decompose'
import { fillOutline, fillsWhole } from '../src/renderer/src/render/fillMath'
import { shownColor } from '../src/renderer/src/app/theme'
import { readSource } from './helpers/repo'

const sc = () => useScene.getState()
const PURPLE = '#9775fa'
const base = (id: string, name: string, color = PURPLE) => ({ id, name, visible: true, locked: false, color, showLabel: true, space: 'shapes' as const })
const polygons = () => sc().order.map((id) => sc().objects[id]).filter((o): o is PolygonObj => o.type === 'polygon')
const pieces = () => polygons().filter((p) => !!p.lego)

/** The owner's 3 × 2 purple rectangle DCBA, drawn with the Polygon tool (corners, polygon, sides). */
function rectangle(decomposed: boolean): SceneObject[] {
  const P: V3[] = [
    [3, 0, 0],
    [3, 2, 0],
    [0, 2, 0],
    [0, 0, 0]
  ]
  const ids = ['pD', 'pC', 'pB', 'pA']
  return [
    ...P.map((p, k): SceneObject => ({ ...base(ids[k], 'DCBA'[k], '#e7f5ff'), type: 'point', def: { kind: 'free', p } })),
    { ...base('rect', 'poly1'), type: 'polygon', points: ids, fill: true, decomposed },
    ...ids.map((a, k): SceneObject => ({ ...base(`s${k}`, `s${k}`), type: 'segment', a, b: ids[(k + 1) % 4] }))
  ]
}

describe('a shape fused back into its original outline (Fix 18)', () => {
  beforeEach(() => sc().newScene())

  it('comes back in the original colour and drawn whole, decomposed first or not', () => {
    for (const decomposed of [true, false]) {
      sc().newScene()
      sc().addObjects(rectangle(decomposed))
      sc().breakApart('rect')
      expect(pieces().length).toBe(2)
      // The pieces are tinted so they read as parts; the colour to come back to rides with them.
      for (const p of pieces()) expect(p.lego!.originalColor).toBe(PURPLE)
      expect(sc().fusePieces(pieces().map((p) => p.id))).toBeNull()
      const [shape] = polygons()
      expect(sc().log.at(-1)?.text).toBe('Back to the original shape.')
      expect(shape.color).toBe(PURPLE)
      expect(shownColor(shape)).toBe(PURPLE)
      expect(shape.themed).toBeUndefined()
      expect(shape.decomposed).toBeFalsy()
      const c = sc().ev.values.get(shape.id)
      const pts = c?.type === 'polygon' ? c.pts : []
      expect(fillsWhole(shape.decomposed, decompose(pts, 'basic', 0).parts.length)).toBe(true)
    }
  })

  it('a different outline takes the new-shape colour instead', () => {
    sc().addObjects(rectangle(false))
    sc().breakApart('rect')
    const [a, b] = pieces()
    // Slide the second half along so the two make a parallelogram.
    const c = sc().ev.values.get(b.id)
    const pts = c?.type === 'polygon' ? c.pts : []
    const shift: V3 = pts.some((p) => p[0] === 0 && p[1] === 2) ? [3, 0, 0] : [-3, 0, 0]
    for (const pid of b.points) sc().updateObject(pid, (d) => void (d.type === 'point' && d.def.kind === 'free' && (d.def.p = [d.def.p[0] + shift[0], d.def.p[1], 0])), false)
    const note = sc().fusePieces([a.id, b.id])
    // Whichever way the diagonal ran, the halves either make a parallelogram or refuse with a sentence.
    if (note === null) {
      const [shape] = polygons()
      expect(shape.themed).toBe('--lego-new')
      expect(shape.color).not.toBe(PURPLE)
    } else expect(polygons().length).toBe(2)
  })
})

describe('a decomposed shape with one part (Fix 18)', () => {
  it('is filled whole in its own colour; two or more parts are drawn part by part', () => {
    const rect: V3[] = [
      [0, 0, 0],
      [3, 0, 0],
      [3, 2, 0],
      [0, 2, 0]
    ]
    expect(decompose(rect, 'basic', 0).parts.length).toBe(1)
    expect(fillsWhole(true, 1)).toBe(true)
    expect(fillsWhole(false, 3)).toBe(true)
    expect(fillsWhole(undefined, 0)).toBe(true)
    expect(fillsWhole(true, 2)).toBe(false)
  })

  it('PolygonView asks fillsWhole before it draws the fill or the parts', () => {
    const src = readSource('src/renderer/src/render/ObjectViews.tsx')
    expect(src).toMatch(/const whole = fillsWhole\(obj\.decomposed, dec\?\.parts\.length \?\? 1\)/)
    expect(src).toMatch(/\{geometry && whole && \(/)
    expect(src).toMatch(/\{!whole && dec && pts\.length >= 3 && <DecomposedParts obj=\{obj\} dec=\{dec\}/)
  })

  it('PolygonView decomposes only a shape that is decomposed, not every polygon on every frame', () => {
    const src = readSource('src/renderer/src/render/ObjectViews.tsx')
    const view = src.slice(src.indexOf('export const PolygonView'), src.indexOf('function DecomposedParts'))
    const calls = view.match(/decompose\(/g) ?? []
    expect(calls).toHaveLength(1)
    expect(view).toMatch(/obj\.decomposed \? decompose\(pts,/)
  })
})

describe('fills meet their edges (Fix 20)', () => {
  it('a part is filled to its own corners exactly, with no inset at any zoom', () => {
    const tri: V3[] = [
      [0, 0, 0],
      [4, 0, 0],
      [4, 3, 0]
    ]
    expect(fillOutline(tri)).toEqual([
      [0, 0],
      [4, 0],
      [4, 3]
    ])
  })

  it('DecomposedParts cuts each fill to fillOutline and keeps no gap', () => {
    const src = readSource('src/renderer/src/render/ObjectViews.tsx')
    expect(src).toMatch(/new THREE\.Shape\(fillOutline\(part\.pts\)\.map\(\(\[x, y\]\) => new THREE\.Vector2\(x, y\)\)\)/)
    expect(src).not.toMatch(/const gap = /)
    expect(src).not.toMatch(/inset/)
  })

  it('a rectangle and a triangle cut from a right trapezium share the cut to the last digit, so their fills meet on it', () => {
    const dec = decompose(
      [
        [0, 0, 0],
        [6, 0, 0],
        [4, 3, 0],
        [0, 3, 0]
      ],
      'basic',
      0
    )
    expect(dec.parts.length).toBe(2)
    const [p, q] = dec.parts.map((part) => fillOutline(part.pts))
    // The cut's two ends are corners of both fills.
    const shared = p.filter(([x, y]) => q.some(([u, v]) => u === x && v === y))
    expect(shared.length).toBe(2)
  })
})
