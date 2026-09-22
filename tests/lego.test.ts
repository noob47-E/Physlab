// Geometry Lego: the pieces of a shape taken apart have to be recognised when they are put back
// together — as the shape they came from, or as a new one — and a dragged piece has to snap so
// its corners meet a neighbour's exactly. A wrong verdict here tells a student their rectangle
// is a parallelogram, or the other way round.

import { beforeEach, describe, expect, it } from 'vitest'
import { sidesOf, useScene } from '../src/renderer/src/core/store'
import type { PolygonObj, SceneObject } from '../src/renderer/src/core/types'
import { decompose } from '../src/renderer/src/math/decompose'
import { centroid, perimeter, polygonArea } from '../src/renderer/src/math/geometry'
import {
  flipPiece,
  fuseResult,
  GAP_SENTENCE,
  legoStatus,
  matchesSignature,
  ONE_PIECE_SENTENCE,
  outlineOf,
  OVERLAP_SENTENCE,
  piecesOverlap,
  sameShape,
  signatureOf,
  snapToCorners,
  snapTolerance,
  tintPiece,
  turnPiece
} from '../src/renderer/src/math/lego'
import { parseColour } from '../src/renderer/src/render/colourMix'
import { add, rotateZ, toRad, type V3 } from '../src/renderer/src/math/vec'
import { BLOCKS, THEME_CSS, contrast, themeBlock, tokenValue } from './helpers/theme'

const P = (...xy: number[]): V3[] => {
  const out: V3[] = []
  for (let i = 0; i < xy.length; i += 2) out.push([xy[i], xy[i + 1], 0])
  return out
}
const moved = (pts: V3[], d: V3): V3[] => pts.map((p) => add(p, d))
const turned = (pts: V3[], deg: number): V3[] => pts.map((p) => rotateZ(p, toRad(deg)))
const mirrored = (pts: V3[]): V3[] => pts.map((p) => [-p[0], p[1], 0])

/** A 4 × 3 rectangle cut along a diagonal: two congruent right-angled triangles. */
const triA = P(0, 0, 4, 0, 4, 3)
const triB = P(0, 0, 4, 3, 0, 3)
const rect = P(0, 0, 4, 0, 4, 3, 0, 3)
/** A right trapezium: bottom 6, top 4, height 3. */
const rightTrap = P(0, 0, 6, 0, 4, 3, 0, 3)
/** An L: a 4×4 square with the top-right 2×2 corner missing. */
const ell = P(0, 0, 4, 0, 4, 2, 2, 2, 2, 4, 0, 4)
/** A unit square cut along a diagonal. */
const halfA = P(0, 0, 1, 0, 1, 1)
const halfB = P(0, 0, 1, 1, 0, 1)
const square = P(0, 0, 1, 0, 1, 1, 0, 1)

describe('outlineOf', () => {
  it('joins two triangles that share their hypotenuse into the rectangle they came from', () => {
    const outline = outlineOf([triA, triB])
    expect(outline).not.toBeNull()
    expect(outline!.length).toBe(4)
    expect(polygonArea(outline!)).toBeCloseTo(12, 9)
  })

  it('is null while the pieces are apart, touch at one corner only, or overlap', () => {
    expect(outlineOf([triA, moved(triB, [10, 0, 0])])).toBeNull()
    // A gap of a hundredth: the corners no longer meet.
    expect(outlineOf([triA, moved(triB, [-0.01, 0, 0])])).toBeNull()
    // Corner to corner: (4,3) of the first meets (4,3) of a copy pushed up and right — a pinch, not a shape.
    expect(outlineOf([triA, moved(triA, [4, 3, 0])])).toBeNull()
    // The same triangle twice lies on top of itself.
    expect(outlineOf([triA, triA])).toBeNull()
    // Half overlapping rectangles: a loop appears but the areas do not add up.
    expect(outlineOf([rect, moved(rect, [2, 0, 0])])).toBeNull()
  })

  it('splits a long side at the corner of a shorter piece resting on it', () => {
    // Two unit squares side by side under a 2 × 1 slab: the slab's bottom edge meets two squares.
    const slab = P(0, 1, 2, 1, 2, 2, 0, 2)
    const sq1 = P(0, 0, 1, 0, 1, 1, 0, 1)
    const sq2 = P(1, 0, 2, 0, 2, 1, 1, 1)
    const outline = outlineOf([slab, sq1, sq2])
    expect(outline).not.toBeNull()
    expect(polygonArea(outline!)).toBeCloseTo(4, 9)
    expect(outline!.length).toBe(4)
  })

  it('does not care which way round a piece is listed', () => {
    const clockwise = [...triB].reverse()
    expect(outlineOf([triA, clockwise])).not.toBeNull()
  })
})

describe('sameShape', () => {
  it('sees a shape through a slide, a turn and a flip', () => {
    expect(sameShape(rect, moved(rect, [7, -2, 0]))).toBe(true)
    expect(sameShape(rect, turnPiece(rect, 90))).toBe(true)
    expect(sameShape(rightTrap, turnPiece(rightTrap, 37))).toBe(true)
    expect(sameShape(rightTrap, flipPiece(rightTrap))).toBe(true)
    expect(sameShape(ell, flipPiece(turnPiece(ell, 180)))).toBe(true)
  })

  it('tells a parallelogram from the rectangle of the same area', () => {
    const para = P(0, 0, 4, 0, 8, 3, 4, 3)
    expect(polygonArea(para)).toBeCloseTo(polygonArea(rect), 9)
    expect(sameShape(rect, para)).toBe(false)
    expect(sameShape(triA, triB)).toBe(true)
    expect(sameShape(triA, P(0, 0, 4, 0, 4, 4))).toBe(false)
  })
})

describe('signatureOf', () => {
  it('gives the same text after a slide, a turn of 37° and a reflection', () => {
    for (const shape of [rect, rightTrap, ell, triA]) {
      const sig = signatureOf(shape)
      expect(sig).not.toBe('')
      expect(signatureOf(moved(shape, [3.25, -8, 0]))).toBe(sig)
      expect(signatureOf(turned(shape, 37))).toBe(sig)
      expect(signatureOf(mirrored(shape))).toBe(sig)
      expect(signatureOf([...shape].reverse())).toBe(sig)
      // Starting the list from another corner is the same shape too.
      expect(signatureOf([...shape.slice(2), ...shape.slice(0, 2)])).toBe(sig)
    }
  })

  it('tells shapes apart and reads back with a tolerance', () => {
    const para = P(0, 0, 4, 0, 8, 3, 4, 3)
    expect(signatureOf(rect)).not.toBe(signatureOf(para))
    expect(signatureOf(rect)).not.toBe(signatureOf(P(0, 0, 3, 0, 3, 3, 0, 3)))
    const sig = signatureOf(rect)
    expect(matchesSignature(turned(moved(rect, [1, 1, 0]), 123), sig)).toBe(true)
    expect(matchesSignature(mirrored(rect), sig)).toBe(true)
    expect(matchesSignature(para, sig)).toBe(false)
    expect(matchesSignature(triA, sig)).toBe(false)
    expect(matchesSignature(rect, 'not a signature')).toBe(false)
  })
})

describe('legoStatus', () => {
  it('is original when the two triangles sit as the rectangle, different as a parallelogram, apart otherwise', () => {
    expect(legoStatus([triA, triB], rect).kind).toBe('original')
    // Slide the second triangle right by 4: its vertical leg meets the first's, making a parallelogram.
    const para = legoStatus([triA, moved(triB, [4, 0, 0])], rect)
    expect(para.kind).toBe('different')
    if (para.kind === 'different') {
      expect(para.name).toBe('Parallelogram')
      expect(polygonArea(para.outline)).toBeCloseTo(polygonArea(rect), 9)
    }
    expect(legoStatus([triA, moved(triB, [9, 9, 0])], rect).kind).toBe('apart')
    expect(legoStatus([triA], rect).kind).toBe('apart')
  })

  it('recognises the original from its signature alone, as the pieces carry it', () => {
    const sig = signatureOf(rect)
    expect(legoStatus([triA, triB], sig).kind).toBe('original')
    expect(legoStatus([triA, moved(triB, [4, 0, 0])], sig).kind).toBe('different')
    // Two halves of a square placed as one larger triangle: same area, new outline.
    const bigger = legoStatus([halfA, P(1, 0, 2, 0, 1, 1)], signatureOf(square))
    expect(sameShape(halfB, P(1, 0, 2, 0, 1, 1))).toBe(true)
    expect(bigger.kind).toBe('different')
    if (bigger.kind === 'different') {
      expect(bigger.name).toMatch(/triangle/i)
      expect(polygonArea(bigger.outline)).toBeCloseTo(1, 9)
    }
  })

  it('recognises the original however the pieces were turned on the way back', () => {
    // Turn both pieces together by 90°: still the rectangle, standing on its short side.
    const both = [triA, triB].map((pc) => turnPiece(pc, 90))
    // turnPiece turns each piece about its own centre, so put them back edge to edge by hand.
    const a = both[0]
    const b = both[1]
    const shift: V3 = [a[2][0] - b[1][0], a[2][1] - b[1][1], 0]
    expect(legoStatus([a, moved(b, shift)], rect).kind).toBe('original')
  })

  it('still sees the original after a piece was turned a full circle in 15° steps', () => {
    // Each Turn 15° rounds the corners to 1e-9, so twenty-four of them leave a piece a few
    // nanometres from where it started. A union cleaned tighter than the vertices were merged
    // kept the two collinear corners along that piece's side, and a student who turned a piece
    // round and put it back read "A new shape: Concave decagon" for their own hexagon.
    const hexagon = P(0, 0, 5, 0, 5, 1, 1, 1, 1, 4, 5, 4, 5, 5, 0, 5)
    const parts = decompose(hexagon, 'basic', 0).parts.map((p) => p.pts)
    expect(parts.length).toBeGreaterThanOrEqual(2)
    const spinFull = (pts: V3[]): V3[] => {
      let out = pts
      for (let k = 0; k < 24; k++) out = turnPiece(out, 15)
      return out
    }
    const oneTurned = parts.map((pc, i) => (i === 0 ? spinFull(pc) : pc))
    for (const pieces of [oneTurned, parts.map(spinFull)]) {
      const result = fuseResult(pieces, signatureOf(hexagon))
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.kind).toBe('original')
    }
  })

  it('puts every decomposition of a shape back together as the original, with the areas adding up', () => {
    const hexagon = P(0, 0, 5, 0, 5, 1, 1, 1, 1, 4, 5, 4, 5, 5, 0, 5)
    for (const shape of [ell, rightTrap, hexagon]) {
      for (const goal of ['basic', 'formula'] as const) {
        const first = decompose(shape, goal)
        for (let index = 0; index < first.alternatives; index++) {
          const d = decompose(shape, goal, index)
          const total = d.parts.reduce((s, p) => s + p.area, 0)
          expect(total, `${goal} split ${index} of ${shape.length}-gon`).toBeCloseTo(polygonArea(shape), 6)
          if (d.parts.length < 2) continue
          const pieces = d.parts.map((p) => p.pts)
          expect(legoStatus(pieces, shape).kind, `${goal} split ${index} of ${shape.length}-gon`).toBe('original')
          expect(legoStatus(pieces, signatureOf(shape)).kind, `${goal} split ${index} by signature`).toBe('original')
        }
      }
    }
  })
})

describe('fuseResult', () => {
  it('names and measures the shape the pieces make', () => {
    const back = fuseResult([triA, triB], signatureOf(rect))
    expect(back.ok).toBe(true)
    if (back.ok) {
      expect(back.kind).toBe('original')
      expect(back.name).toBe('Rectangle')
      expect(back.area).toBeCloseTo(12, 9)
      expect(back.perimeter).toBeCloseTo(14, 9)
    }
    const para = fuseResult([triA, moved(triB, [4, 0, 0])], signatureOf(rect))
    expect(para.ok).toBe(true)
    if (para.ok) {
      expect(para.kind).toBe('different')
      expect(para.name).toBe('Parallelogram')
      expect(para.area).toBeCloseTo(12, 9)
      expect(para.perimeter).toBeCloseTo(perimeter(P(0, 0, 4, 0, 8, 3, 4, 3)), 9)
    }
  })

  it('says in plain words why the pieces make nothing yet', () => {
    expect(fuseResult([triA], signatureOf(rect))).toEqual({ ok: false, sentence: ONE_PIECE_SENTENCE })
    // Slid a hundredth away from the diagonal: a hair's gap. Slid the other way, a sliver of overlap.
    expect(fuseResult([triA, moved(triB, [-0.01, 0, 0])], signatureOf(rect))).toEqual({ ok: false, sentence: GAP_SENTENCE })
    expect(fuseResult([triA, moved(triB, [0.01, 0, 0])], signatureOf(rect))).toEqual({ ok: false, sentence: OVERLAP_SENTENCE })
    expect(fuseResult([triA, moved(triB, [9, 9, 0])], signatureOf(rect))).toEqual({ ok: false, sentence: GAP_SENTENCE })
    expect(fuseResult([triA, triA], signatureOf(rect))).toEqual({ ok: false, sentence: OVERLAP_SENTENCE })
    expect(fuseResult([triA, moved(triB, [1, 0, 0])], signatureOf(rect))).toEqual({ ok: false, sentence: OVERLAP_SENTENCE })
    expect(fuseResult([rect, moved(rect, [2, 0, 0])], signatureOf(rect))).toEqual({ ok: false, sentence: OVERLAP_SENTENCE })
  })

  it('tells touching pieces from overlapping ones', () => {
    expect(piecesOverlap([triA, triB])).toBe(false)
    expect(piecesOverlap([triA, moved(triB, [4, 0, 0])])).toBe(false)
    expect(piecesOverlap([triA, moved(triB, [0.5, 0, 0])])).toBe(true)
    // A small square sitting wholly inside a big one: no sides cross, but its corners are inside.
    expect(piecesOverlap([P(0, 0, 4, 0, 4, 4, 0, 4), P(1, 1, 2, 1, 2, 2, 1, 2)])).toBe(true)
  })
})

describe('snapToCorners', () => {
  it('pulls the nearest corner onto a neighbour within reach and leaves a far move alone', () => {
    const targets = triA
    // Moving triB by (4.05, 0.02) brings its corner (0,0)+(4.05,0.02) near triA's (4,0).
    const near = snapToCorners(triB, [4.05, 0.02, 0], targets, 0.2)
    expect(near.snapped).toBe(true)
    expect(near.delta).toEqual([4, 0, 0])
    const far = snapToCorners(triB, [10, 10, 0], targets, 0.2)
    expect(far.snapped).toBe(false)
    expect(far.delta).toEqual([10, 10, 0])
  })

  it('reaches a fiftieth of the longest side', () => {
    expect(snapTolerance(triA)).toBeCloseTo(0.1, 12)
    expect(snapTolerance(rect)).toBeCloseTo(0.08, 12)
  })
})

describe('turnPiece and flipPiece', () => {
  it('keep the area and the centre, and a turn of 360° is no turn at all', () => {
    for (const deg of [90, 15, 37]) {
      const t = turnPiece(rightTrap, deg)
      expect(polygonArea(t)).toBeCloseTo(polygonArea(rightTrap), 6)
      const c0 = centroid(rightTrap)
      const c1 = centroid(t)
      expect(c1[0]).toBeCloseTo(c0[0], 8)
      expect(c1[1]).toBeCloseTo(c0[1], 8)
    }
    const full = turnPiece(turnPiece(turnPiece(turnPiece(rightTrap, 90), 90), 90), 90)
    full.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(rightTrap[i][0], 8)
      expect(p[1]).toBeCloseTo(rightTrap[i][1], 8)
    })
    const f = flipPiece(rightTrap)
    expect(polygonArea(f)).toBeCloseTo(polygonArea(rightTrap), 9)
    expect(centroid(f)[0]).toBeCloseTo(centroid(rightTrap)[0], 8)
    expect(centroid(f)[1]).toBeCloseTo(centroid(rightTrap)[1], 8)
    const twice = flipPiece(f)
    twice.forEach((p, i) => expect(p).toEqual(rightTrap[i]))
  })
})

describe('the colours of the pieces', () => {
  it('tints each piece from the parent, lighter and a little apart from its neighbour', () => {
    const parent = '#9775fa'
    const tints = [0, 1, 2].map((i) => tintPiece(parent, i, 3))
    expect(new Set(tints).size).toBe(3)
    for (const t of tints) {
      expect(t).toMatch(/^#[0-9a-f]{6}$/)
      const [r, g, b] = parseColour(t)!
      const [r0, g0, b0] = parseColour(parent)!
      expect(r + g + b).toBeGreaterThan(r0 + g0 + b0)
    }
    expect(tintPiece('not a colour', 0, 2)).toBe('not a colour')
  })

  it('declares --lego-new in every theme, readable against the page', () => {
    for (const [theme, selector] of Object.entries(BLOCKS)) {
      const block = themeBlock(THEME_CSS, selector)
      const fg = tokenValue(block, '--lego-new')
      const bg = tokenValue(block, '--bg-0')
      expect(fg, `${theme} --lego-new`).toBeDefined()
      expect(contrast(fg!, bg!), `${theme} --lego-new on --bg-0`).toBeGreaterThanOrEqual(3)
    }
  })
})

// ---------------------------------------------------------------------------
// Through the scene store: a decomposed polygon into pieces, a drag that snaps and fuses.
// ---------------------------------------------------------------------------

const sc = () => useScene.getState()
const base = (id: string, name: string, color = '#9775fa') => ({ id, name, visible: true, locked: false, color, showLabel: true, space: 'shapes' as const })
const pointObj = (id: string, name: string, p: V3): SceneObject => ({ ...base(id, name), type: 'point', def: { kind: 'free', p } })

/** The L-shaped hexagon as the Polygon tool draws it: six corners, the polygon and six sides, decomposed. */
function ellScene(): SceneObject[] {
  const ids = ell.map((_, i) => `c${i}`)
  const out: SceneObject[] = ell.map((p, i) => pointObj(ids[i], 'ABCDEF'[i], p))
  out.push({ ...base('poly', 'poly1'), type: 'polygon', points: ids, fill: true, decomposed: true })
  ids.forEach((a, i) => out.push({ ...base(`s${i}`, 'abcdef'[i]), type: 'segment', a, b: ids[(i + 1) % ids.length] }))
  return out
}

const pieces = () => sc().order.map((id) => sc().objects[id]).filter((o): o is PolygonObj => o.type === 'polygon' && !!o.lego)
const polygonsInScene = () => sc().order.map((id) => sc().objects[id]).filter((o): o is PolygonObj => o.type === 'polygon')
const cornersOf = (id: string): V3[] => {
  const c = sc().ev.values.get(id)
  return c?.type === 'polygon' ? c.pts : []
}
/** Drags a piece by `delta` the way the viewport does: one gesture, its free corners moved together. */
function dragPiece(id: string, delta: V3): void {
  const piece = sc().objects[id]
  if (piece?.type !== 'polygon') throw new Error('not a polygon')
  sc().beginGesture()
  for (const pid of piece.points) {
    const p = sc().objects[pid]
    if (p?.type === 'point' && p.def.kind === 'free') {
      const at = p.def.p
      sc().updateObject(
        pid,
        (d) => {
          if (d.type === 'point' && d.def.kind === 'free') d.def.p = add(at, delta)
        },
        false
      )
    }
  }
  sc().endGesture()
}

describe('breakApart in the scene', () => {
  beforeEach(() => sc().newScene())

  it('replaces the shape and its sides with rigid pieces that carry where they came from, as one undo step', () => {
    sc().addObjects(ellScene())
    const parts = decompose(ell, 'basic', 0).parts.length
    expect(parts).toBeGreaterThanOrEqual(2)
    const before = sc().order.length
    const undoDepth = sc().past.length
    sc().breakApart('poly')
    expect(sc().objects.poly).toBeUndefined()
    // The parent's sides and its corners, which nothing else used, went with it.
    expect(sc().order.some((id) => id.startsWith('s') || id.startsWith('c'))).toBe(false)
    const ps = pieces()
    expect(ps.length).toBe(parts)
    expect(ps.map((p) => p.lego!.pieceIndex)).toEqual(ps.map((_, i) => i))
    for (const p of ps) {
      expect(p.lego!.sourceId).toBe('poly')
      expect(p.lego!.sourceSignature).toBe(signatureOf(ell))
      expect(p.lego!.originalColor).toBe('#9775fa')
      expect(p.color).not.toBe('#9775fa')
      // Corners are hidden helpers and the sides are locked, so a piece only moves as a whole.
      for (const pid of p.points) expect(sc().objects[pid]).toMatchObject({ type: 'point', visible: false, auxiliary: true })
      const sides = sidesOf(p, sc().objects, sc().order)
      expect(sides.length).toBe(p.points.length)
      for (const sid of sides) expect(sc().objects[sid]).toMatchObject({ type: 'segment', locked: true })
    }
    // The pieces cover the shape exactly.
    expect(legoStatus(ps.map((p) => cornersOf(p.id)), ell).kind).toBe('original')
    expect(sc().selection).toEqual(ps.map((p) => p.id))
    expect(sc().past.length).toBe(undoDepth + 1)

    sc().undo()
    expect(sc().objects.poly).toBeDefined()
    expect(sc().order.length).toBe(before)
    expect(pieces()).toEqual([])
    sc().redo()
    expect(pieces().length).toBe(parts)
  })

  it('keeps a corner another object still needs', () => {
    sc().addObjects(ellScene())
    sc().addObjects([{ ...base('own', 'q'), type: 'segment', a: 'c0', b: 'c3' }])
    sc().breakApart('poly')
    expect(sc().objects.c0).toBeDefined()
    expect(sc().objects.c3).toBeDefined()
    expect(sc().objects.c1).toBeUndefined()
    expect(sc().objects.own).toBeDefined()
  })

  it('does nothing to a shape that is already simple', () => {
    sc().addObjects([pointObj('a', 'A', [0, 0, 0]), pointObj('b', 'B', [4, 0, 0]), pointObj('c', 'C', [0, 3, 0]), { ...base('tri', 'poly1'), type: 'polygon', points: ['a', 'b', 'c'], fill: true }])
    const before = sc().order
    sc().breakApart('tri')
    expect(sc().order).toEqual(before)
    expect(sc().log.at(-1)?.text).toMatch(/already a simple shape/)
  })
})

describe('moving, turning, flipping and fusing pieces in the scene', () => {
  beforeEach(() => {
    sc().newScene()
    sc().addObjects(ellScene())
    sc().breakApart('poly')
  })

  it('a piece dragged away stays apart; dragged back within reach it snaps and fuses into the original', () => {
    const [first] = pieces()
    const n = pieces().length
    dragPiece(first.id, [10, 0, 0])
    expect(pieces().length).toBe(n)
    expect(sc().log.at(-1)?.text).not.toMatch(/original/)
    // Nearly back: off by a fiftieth of a unit, inside the snap tolerance of any of these pieces.
    dragPiece(first.id, [-10 + 0.02, 0.01, 0])
    expect(pieces().length).toBe(0)
    const shape = polygonsInScene()
    expect(shape.length).toBe(1)
    expect(shape[0].color).toBe('#9775fa')
    expect(sameShape(cornersOf(shape[0].id), ell)).toBe(true)
    expect(sc().log.at(-1)?.text).toBe('Back to the original shape.')
    // Undo takes the fuse back in one step, leaving the pieces where they snapped to.
    sc().undo()
    expect(pieces().length).toBe(n)
    expect(polygonsInScene().length).toBe(n)
    expect(legoStatus(pieces().map((p) => cornersOf(p.id)), ell).kind).toBe('original')
  })

  it('turn and flip keep the area and the centre of a piece, each as one undo step', () => {
    const piece = pieces()[0]
    const before = cornersOf(piece.id)
    const depth = sc().past.length
    sc().turnPiece(piece.id, 90)
    const turned = cornersOf(piece.id)
    expect(polygonArea(turned)).toBeCloseTo(polygonArea(before), 6)
    expect(centroid(turned)[0]).toBeCloseTo(centroid(before)[0], 6)
    expect(centroid(turned)[1]).toBeCloseTo(centroid(before)[1], 6)
    expect(sc().past.length).toBe(depth + 1)
    sc().flipPiece(piece.id)
    expect(polygonArea(cornersOf(piece.id))).toBeCloseTo(polygonArea(before), 6)
    expect(sc().past.length).toBe(depth + 2)
    sc().undo()
    sc().undo()
    expect(cornersOf(piece.id)).toEqual(before)
  })

  it('Fuse on pieces with a gap says so in a sentence and changes nothing', () => {
    const [first] = pieces()
    const n = pieces().length
    dragPiece(first.id, [10, 0, 0])
    const order = sc().order
    const sentence = sc().fusePieces(pieces().map((p) => p.id))
    expect(sentence).toBe(GAP_SENTENCE)
    expect(sc().order).toEqual(order)
    expect(pieces().length).toBe(n)
    expect(sc().fusePieces([first.id])).toBe(ONE_PIECE_SENTENCE)
  })

  it('deleting a piece takes its hidden corners with it, and undo brings them back', () => {
    // A piece's corners are hidden helpers, not the student's points: left behind, they sat
    // invisible in the scene, were written into the file and counted as unsaved work.
    const [first, ...rest] = pieces()
    const corners = first.points
    const sides = sidesOf(first, sc().objects, sc().order)
    const before = sc().order.length
    const depth = sc().past.length
    sc().removeObjects([first.id])
    expect(sc().objects[first.id]).toBeUndefined()
    for (const id of [...corners, ...sides]) expect(sc().objects[id]).toBeUndefined()
    expect(sc().order.length).toBe(before - 1 - corners.length - sides.length)
    // The other pieces and their corners are untouched.
    for (const p of rest) for (const pid of p.points) expect(sc().objects[pid]).toBeDefined()
    expect(sc().past.length).toBe(depth + 1)
    sc().undo()
    expect(sc().order.length).toBe(before)
    for (const id of corners) expect(sc().objects[id]).toBeDefined()
  })

  it('deleting a piece keeps a hidden corner that a student built on', () => {
    const [first] = pieces()
    const [c0, c1] = first.points
    sc().addObjects([{ ...base('own', 'q'), type: 'segment', a: c0, b: c1 }])
    sc().removeObjects([first.id])
    expect(sc().objects[first.id]).toBeUndefined()
    expect(sc().objects.own).toBeDefined()
    expect(sc().objects[c0]).toBeDefined()
    expect(sc().objects[c1]).toBeDefined()
    for (const pid of first.points.slice(2)) expect(sc().objects[pid]).toBeUndefined()
  })
})

describe('fusing into a different shape', () => {
  beforeEach(() => sc().newScene())

  it('names the new shape with its area and perimeter, and never joins pieces of two different shapes', () => {
    const sig = signatureOf(rect)
    const lego = (i: number, sourceId = 'src') => ({ sourceId, sourceSignature: sig, pieceIndex: i, originalColor: '#9775fa' })
    const pieceObjs = (id: string, pts: V3[], i: number, sourceId?: string): SceneObject[] => [
      ...pts.map((p, k) => pointObj(`${id}p${k}`, `${id}_${k}`, p)),
      { ...base(id, id, '#a08cff'), type: 'polygon', points: pts.map((_, k) => `${id}p${k}`), fill: true, lego: lego(i, sourceId) }
    ]
    // The two halves of the 4 × 3 rectangle laid as a parallelogram.
    sc().addObjects([...pieceObjs('t1', triA, 0), ...pieceObjs('t2', moved(triB, [4, 0, 0]), 1)])
    sc().setSettings({ decimals: 1 })
    expect(sc().fusePieces(['t1', 't2'])).toBeNull()
    const shape = polygonsInScene()
    expect(shape.length).toBe(1)
    expect(shape[0].lego).toBeUndefined()
    expect(shape[0].decomposed).toBe(true)
    expect(sc().log.at(-1)?.text).toBe('A new shape — same area, different outline: Parallelogram, area 12 u², perimeter 18 u.')
    // The pieces' own corners went; the new shape has visible corners of its own.
    expect(sc().objects.t1p0).toBeUndefined()
    for (const pid of shape[0].points) expect(sc().objects[pid]).toMatchObject({ type: 'point', visible: true })

    sc().newScene()
    sc().addObjects([...pieceObjs('t1', triA, 0), ...pieceObjs('t2', triB, 0, 'other')])
    expect(sc().fusePieces(['t1', 't2'])).toMatch(/different shapes/)
    expect(polygonsInScene().length).toBe(2)
  })
})
