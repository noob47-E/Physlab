// QL: the Lego-fill answer part (rung 1). A question gives a shape; PhysLab cuts it with Break
// apart's own cutter, turns the pieces and lays them beside the outline; the student fits them
// back together and "Check my shape" compares the outline they make with the target's.
//
// Known answers (worked by hand, and the six joinings of the two 4 × 3 halves recomputed by the
// crew's DeepSeek V4 Pro from the geometry, not from this code): the two halves of the 4 × 3
// rectangle cut on its diagonal, each area 6, joined along a full equal side make exactly six
// shapes of area 12 — the rectangle 4, 3, 4, 3; parallelograms 4, 5, 4, 5 and 3, 5, 3, 5;
// isosceles triangles 8, 5, 5 and 6, 5, 5; the kite 4, 3, 3, 4 with its fourth corner at
// (28/25, 96/25). Only the rectangle is the target.

import { beforeEach, describe, expect, it } from 'vitest'
import { resetGlobals } from './helpers/globals'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PartRows } from '../src/renderer/src/panels/QuestionParts'
import { useScene } from '../src/renderer/src/core/store'
import type { PolygonObj, SceneObject } from '../src/renderer/src/core/types'
import { Builder } from '../src/renderer/src/core/factory'
import { polygonArea } from '../src/renderer/src/math/geometry'
import { outlineOf, sameShape, turnPiece, flipPiece } from '../src/renderer/src/math/lego'
import type { V3 } from '../src/renderer/src/math/vec'
import type { Check } from '../src/renderer/src/math/checkAnswer'
import {
  checkLegoPart,
  checkLegoShapes,
  forgetLegoPart,
  LEGO_GAP,
  LEGO_OVERLAP,
  LEGO_TURNS,
  LEGO_UNTOUCHED,
  legoAnswer,
  legoCut,
  legoHandIn,
  legoLayout,
  legoLaidOut,
  legoShapesNow,
  madeOfLineage,
  legoTarget,
  NOT_LAID_OUT,
  readLegoAnswer,
  showLegoPart,
  type LegoPart
} from '../src/renderer/src/questions/legoPart'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import { checkPlayedPart, countedParts, markPlayed, playQuestion, type PartAnswer, type Played } from '../src/renderer/src/questions/player'
import { questionVerdict, tally } from '../src/renderer/src/panels/QuestionParts'
import { recordFirstTries, resultParts } from '../src/renderer/src/questions/results'
import { parsePQFile, serializePQFile, type PQQuestion } from '../src/renderer/src/questions/pqjson'

const RECT: V3[] = [
  [0, 0, 0],
  [4, 0, 0],
  [4, 3, 0],
  [0, 3, 0]
]
/** The rectangle's two halves, cut on the diagonal (0, 0)–(4, 3). */
const LOWER: V3[] = [
  [0, 0, 0],
  [4, 0, 0],
  [4, 3, 0]
]
const UPPER: V3[] = [
  [0, 0, 0],
  [4, 3, 0],
  [0, 3, 0]
]
const move = (pts: V3[], dx: number, dy: number): V3[] => pts.map((p) => [p[0] + dx, p[1] + dy, 0])

const lego = (target: [string, string][], pieces = 2): LegoPart => ({ type: 'lego', prompt: 'Fill the shape.', target, pieces, marks: 1 })
const RECT_PART = lego([
  ['0', '0'],
  ['w', '0'],
  ['w', 'h'],
  ['0', 'h']
])

describe('the shape to make', () => {
  it('works the corners out from the variables, anticlockwise', () => {
    const t = legoTarget(RECT_PART, { w: 4, h: 3 })
    expect(t).toEqual(RECT)
  })

  it('turns a clockwise outline round and drops a corner that lies on a side', () => {
    const t = legoTarget(
      lego([
        ['0', '3'],
        ['4', '3'],
        ['4', '0'],
        ['2', '0'],
        ['0', '0']
      ]),
      {}
    )
    expect(t).toHaveLength(4)
    expect(polygonArea(t)).toBeCloseTo(12, 12)
    expect(sameShape(t, RECT)).toBe(true)
  })

  it('refuses a shape with no area, a crossed outline and a corner it cannot work out, each in a sentence', () => {
    const flat = lego([
      ['0', '0'],
      ['2', '0'],
      ['4', '0']
    ])
    expect(() => legoTarget(flat, {})).toThrow('The shape to make has no area, so there is nothing to fill.')
    const bowTie = lego([
      ['0', '0'],
      ['4', '3'],
      ['4', '0'],
      ['0', '3']
    ])
    expect(() => legoTarget(bowTie, {})).toThrow('crosses itself')
    const unknown = lego([
      ['0', '0'],
      ['side', '0'],
      ['0', 'side']
    ])
    expect(() => legoTarget(unknown, {})).toThrow('PhysLab could not work out a corner of the shape to make: (side, 0).')
    expect(() => legoTarget(lego([['0', '0'], ['1/0', '0'], ['0', '1']]), {})).toThrow('infinity or nothing')
  })
})

describe('cutting it into the author’s number of pieces (Break apart’s cutter)', () => {
  it('cuts the 4 × 3 rectangle on its diagonal into two right-angled triangles of area 6', () => {
    const parts = legoCut(RECT, 2)!
    expect(parts).toHaveLength(2)
    for (const p of parts) {
      expect(p.area).toBeCloseTo(6, 12)
      expect(sameShape(p.pts, LOWER)).toBe(true)
    }
    expect(outlineOf(parts.map((p) => p.pts))).not.toBeNull()
  })

  it('cuts a triangle along the median to its longest side: (0, 0), (6, 0), (0, 4) into two halves of area 6 meeting at (3, 2)', () => {
    const parts = legoCut(
      [
        [0, 0, 0],
        [6, 0, 0],
        [0, 4, 0]
      ],
      2
    )!
    expect(parts.map((p) => p.area)).toEqual([6, 6])
    for (const p of parts) expect(p.pts.some((q) => Math.abs(q[0] - 3) < 1e-12 && Math.abs(q[1] - 2) < 1e-12)).toBe(true)
  })

  it('cuts an L into two rectangles, one piece is the whole shape, and a count that is not a whole number of pieces is null', () => {
    const L: V3[] = [
      [0, 0, 0],
      [3, 0, 0],
      [3, 1, 0],
      [1, 1, 0],
      [1, 3, 0],
      [0, 3, 0]
    ]
    const two = legoCut(L, 2)!
    expect(two).toHaveLength(2)
    expect(two.reduce((s, p) => s + p.area, 0)).toBeCloseTo(5, 12)
    expect(two.every((p) => p.pts.length === 4)).toBe(true)
    expect(legoCut(RECT, 1)!.map((p) => p.area)).toEqual([12])
    expect(legoCut(RECT, 0)).toBeNull()
    expect(legoCut(RECT, 2.5)).toBeNull()
  })

  it('for more pieces than the one cut gives, cuts the biggest piece again the same way', () => {
    // The rectangle's diagonal halves (6 and 6), then one half along the median to its
    // hypotenuse: 6, 3 and 3, which still tile the rectangle exactly.
    const three = legoCut(RECT, 3)!
    expect(three.map((p) => p.area).sort((a, b) => a - b)).toEqual([3, 3, 6])
    expect(sameShape(outlineOf(three.map((p) => p.pts))!, RECT)).toBe(true)
    // The right triangle 4, 3 in three pieces (the Practice fixture's Lego part): 3, 1.5 and 1.5.
    const tri: V3[] = [
      [0, 0, 0],
      [4, 0, 0],
      [0, 3, 0]
    ]
    const cut = legoCut(tri, 3)!
    expect(cut.map((p) => p.area).sort((a, b) => a - b)).toEqual([1.5, 1.5, 3])
    expect(sameShape(outlineOf(cut.map((p) => p.pts))!, tri)).toBe(true)
    expect(legoCut(RECT, 6)).toHaveLength(6)
  })
})

describe('laying the pieces out', () => {
  const box = (pts: V3[]) => ({
    minX: Math.min(...pts.map((p) => p[0])),
    maxX: Math.max(...pts.map((p) => p[0])),
    minY: Math.min(...pts.map((p) => p[1])),
    maxY: Math.max(...pts.map((p) => p[1]))
  })
  const apart = (a: V3[], b: V3[]) => {
    const A = box(a)
    const B = box(b)
    return A.maxX < B.minX || B.maxX < A.minX || A.maxY < B.minY || B.maxY < A.minY
  }

  it('keeps every piece its own shape, turned by a whole number of 15° steps, clear of the outline and of each other', () => {
    const parts = legoCut(RECT, 2)!.map((p) => p.pts)
    const laid = legoLayout(RECT, parts)
    expect(laid).toHaveLength(2)
    laid.forEach((pts, i) => {
      expect(sameShape(pts, parts[i])).toBe(true)
      expect(apart(pts, RECT)).toBe(true)
      expect(Math.abs(LEGO_TURNS[i]) % 15).toBe(0)
      expect(LEGO_TURNS[i]).not.toBe(0)
    })
    expect(apart(laid[0], laid[1])).toBe(true)
    // Handed over, they do not already make a shape: there is something to do.
    expect(outlineOf(laid)).toBeNull()
  })

  it('turned back by the same steps and slid home, the laid-out pieces fill the rectangle again', () => {
    const parts = legoCut(RECT, 2)!.map((p) => p.pts)
    const laid = legoLayout(RECT, parts)
    const home = laid.map((pts, i) => {
      const back = turnPiece(pts, -LEGO_TURNS[i])
      // Slide so its first corner lands on the cut piece's first corner.
      return move(back, parts[i][0][0] - back[0][0], parts[i][0][1] - back[0][1])
    })
    expect(checkLegoShapes(home, RECT, 2).verdict).toBe('right')
  })
})

describe('Check my shape', () => {
  it('the rectangle cut on its diagonal and reassembled into the rectangle is right — anywhere, turned or flipped', () => {
    expect(checkLegoShapes([LOWER, UPPER], RECT, 2)).toEqual({ verdict: 'right' })
    const elsewhere = [move(LOWER, 10, -7), move(UPPER, 10, -7)].map((pts) => turnPiece(pts, 0))
    expect(checkLegoShapes(elsewhere, RECT, 2).verdict).toBe('right')
    // The whole rectangle turned a quarter turn: 3 wide, 4 tall.
    const upright: V3[][] = [
      [
        [0, 0, 0],
        [3, 0, 0],
        [3, 4, 0]
      ],
      [
        [0, 0, 0],
        [3, 4, 0],
        [0, 4, 0]
      ]
    ]
    expect(checkLegoShapes(upright, RECT, 2).verdict).toBe('right')
    expect(checkLegoShapes([flipPiece(RECT)], RECT, 2).verdict).toBe('right')
  })

  it('into a parallelogram is wrong with "same area, different outline"', () => {
    // The other half set against the lower half's side of length 3, (4, 0)–(4, 3), the wrong
    // way round: (0,0),(4,0),(4,3) and (4,0),(8,3),(4,3) make the 4, 5, 4, 5 parallelogram.
    const other: V3[] = [
      [4, 0, 0],
      [8, 3, 0],
      [4, 3, 0]
    ]
    const c = checkLegoShapes([LOWER, other], RECT, 2)
    expect(c.verdict).toBe('wrong')
    expect(c.message).toBe('Same area, different outline: the pieces make a parallelogram. Turn or flip a piece and try again.')
  })

  it('every one of the six joinings has area 12, and only the rectangle is right', () => {
    const shapes: Record<string, V3[][]> = {
      rectangle: [LOWER, UPPER],
      'parallelogram 4, 5, 4, 5': [LOWER, [[4, 0, 0], [8, 3, 0], [4, 3, 0]]],
      'parallelogram 3, 5, 3, 5': [LOWER, [[0, 0, 0], [0, -3, 0], [4, 0, 0]]],
      'isosceles triangle 8, 5, 5': [LOWER, [[4, 0, 0], [8, 0, 0], [4, 3, 0]]],
      'isosceles triangle 6, 5, 5': [LOWER, [[0, 0, 0], [4, -3, 0], [4, 0, 0]]],
      kite: [LOWER, [[0, 0, 0], [4, 3, 0], [28 / 25, 96 / 25, 0]]]
    }
    for (const [name, pieces] of Object.entries(shapes)) {
      const outline = outlineOf(pieces)
      expect(outline, name).not.toBeNull()
      expect(polygonArea(outline!), name).toBeCloseTo(12, 9)
      const c = checkLegoShapes(pieces, RECT, 2)
      if (name === 'rectangle') expect(c.verdict).toBe('right')
      else {
        expect(c.verdict, name).toBe('wrong')
        expect(c.message, name).toMatch(/^Same area, different outline: the pieces make an? [a-z]/)
      }
    }
    expect(checkLegoShapes(shapes.kite, RECT, 2).message).toContain('a kite')
    expect(checkLegoShapes(shapes['isosceles triangle 8, 5, 5'], RECT, 2).message).toContain('an isosceles triangle')
  })

  it('a fused shape counts as one: the rectangle fused back is right, a fused parallelogram is not', () => {
    expect(checkLegoShapes([RECT], RECT, 2).verdict).toBe('right')
    const para: V3[] = [
      [0, 0, 0],
      [4, 0, 0],
      [8, 3, 0],
      [4, 3, 0]
    ]
    expect(checkLegoShapes([para], RECT, 2).message).toContain('Same area, different outline')
  })

  it('pieces apart, on top of each other, missing or joined to another shape each get their own sentence', () => {
    expect(checkLegoShapes([LOWER, move(UPPER, 20, 0)], RECT, 2)).toEqual({ verdict: 'wrong', message: LEGO_GAP })
    expect(checkLegoShapes([LOWER, LOWER], RECT, 2)).toEqual({ verdict: 'wrong', message: LEGO_OVERLAP })
    expect(checkLegoShapes([LOWER], RECT, 2)).toEqual({ verdict: 'wrong', message: 'Some of the shape is missing: it needs all 2 pieces.' })
    const bigger: V3[] = [
      [0, 0, 0],
      [8, 0, 0],
      [8, 3, 0],
      [0, 3, 0]
    ]
    expect(checkLegoShapes([bigger], RECT, 2).message).toBe('This has more in it than the pieces you were given: use only those 2 pieces.')
    expect(checkLegoShapes([], RECT, 2)).toEqual({ verdict: 'unreadable', message: NOT_LAID_OUT })
  })

  it('a piece turned twenty-four times by 15° and slid home still fits exactly', () => {
    let spun = UPPER
    for (let k = 0; k < 24; k++) spun = turnPiece(spun, 15)
    const home = move(spun, UPPER[0][0] - spun[0][0], UPPER[0][1] - spun[0][1])
    expect(checkLegoShapes([LOWER, home], RECT, 2).verdict).toBe('right')
  })
})

describe('the answer as text', () => {
  it('reads back to the same numbers, digit for digit', () => {
    const shapes = [turnPiece(LOWER, 15), UPPER]
    expect(readLegoAnswer(legoAnswer(shapes))).toEqual(shapes)
  })

  it('refuses a row that is not a shape', () => {
    expect(readLegoAnswer([['0', '0', '1', '0']])).toBeNull()
    expect(readLegoAnswer([['0', '0', '1', '0', '1']])).toBeNull()
    expect(readLegoAnswer([['0', '0', '1', 'x', '1', '1']])).toBeNull()
    expect(readLegoAnswer([['0', '0', '1', '', '1', '1']])).toBeNull()
  })

  it('checkLegoPart marks the answer against the target worked out from the variables', () => {
    expect(checkLegoPart(legoAnswer([LOWER, UPPER]), RECT_PART, { w: 4, h: 3 }).verdict).toBe('right')
    expect(checkLegoPart(legoAnswer([LOWER, UPPER]), RECT_PART, { w: 5, h: 3 }).verdict).toBe('wrong')
    expect(checkLegoPart([], RECT_PART, { w: 4, h: 3 })).toEqual({ verdict: 'unreadable', message: NOT_LAID_OUT })
    // The pieces exactly as PhysLab lays them out, in either order: not begun, not a try.
    const laid = legoLayout(RECT, legoCut(RECT, 2)!.map((c) => c.pts))
    expect(checkLegoPart(legoAnswer(laid), RECT_PART, { w: 4, h: 3 })).toEqual({ verdict: 'unreadable', message: LEGO_UNTOUCHED })
    expect(checkLegoPart(legoAnswer([laid[1], laid[0]]), RECT_PART, { w: 4, h: 3 })).toEqual({ verdict: 'unreadable', message: LEGO_UNTOUCHED })
    // A hair off where they were laid is the student's own layout, gap and all.
    expect(checkLegoPart(legoAnswer([laid[0], move(laid[1], 0.01, 0)]), RECT_PART, { w: 4, h: 3 })).toEqual({ verdict: 'wrong', message: LEGO_GAP })
    // One piece laid out, turned beside the outline, already is the shape: right, untouched or not.
    const one = legoLayout(RECT, legoCut(RECT, 1)!.map((c) => c.pts))
    expect(checkLegoPart(legoAnswer(one), lego(RECT_PART.target, 1), { w: 4, h: 3 })).toEqual({ verdict: 'right' })
    // The question's own broken outline is its fault: a sentence, never a cross for the student.
    expect(checkLegoPart(legoAnswer([LOWER, UPPER]), lego([['0', '0'], ['side', '0'], ['0', 'side']]), {})).toEqual({
      verdict: 'unreadable',
      message: 'PhysLab could not work out a corner of the shape to make: (side, 0).'
    })
    expect(checkLegoPart(legoAnswer([LOWER, UPPER]), lego([['0', '0'], ['4', '0'], ['8', '0']]), {}).verdict).toBe('unreadable')
  })
})


// ---------------------------------------------------------------------------
// In Geometry, through the scene store
// ---------------------------------------------------------------------------

const S: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }
const sc = () => useScene.getState()

/** A first-look question: fill a w × h rectangle with its two diagonal halves. */
const RECT_Q: PQQuestion = {
  id: 'fill-rectangle',
  title: 'Fill the rectangle',
  statement: 'Here is a rectangle {w} long and {h} high, cut into two pieces.',
  variables: [
    { name: 'w', def: { kind: 'list', items: [4] } },
    { name: 'h', def: { kind: 'list', items: [3] } }
  ],
  parts: [RECT_PART],
  license: { id: 'CC BY 4.0', holder: 'PhysLab' },
  rung: 1
}

const polygons = (): PolygonObj[] => sc().order.map((id) => sc().objects[id]).filter((o): o is PolygonObj => o?.type === 'polygon')
const pieces = (): PolygonObj[] => polygons().filter((p) => !!p.lego)

/** Puts a piece's corners exactly at `pts` (in its own corner order). */
function place(piece: PolygonObj, pts: V3[]): void {
  piece.points.forEach((pid, k) =>
    sc().updateObject(pid, (d) => {
      if (d.type === 'point' && d.def.kind === 'free') d.def.p = pts[k]
    })
  )
}

/** Where a piece's corners are now, in its own corner order. */
const cornersNow = (piece: PolygonObj): V3[] => piece.points.map((pid) => (sc().ev.values.get(pid) as { p: V3 }).p)

/**
 * The triangle `tri`'s corners in the order that matches this piece's own corners side for side,
 * so a piece can be put exactly where a hand-worked triangle says whichever half it is.
 */
function asPiece(piece: PolygonObj, tri: V3[]): V3[] {
  const sides = (pts: V3[]) => pts.map((p, k) => Math.hypot(pts[(k + 1) % 3][0] - p[0], pts[(k + 1) % 3][1] - p[1]))
  const have = sides(cornersNow(piece))
  for (const order of [[0, 1, 2], [1, 2, 0], [2, 0, 1], [0, 2, 1], [2, 1, 0], [1, 0, 2]]) {
    const cand = order.map((k) => tri[k])
    if (sides(cand).every((g, k) => Math.abs(g - have[k]) < 1e-6)) return cand
  }
  throw new Error('no corner order fits')
}

/** What Check my shape gives: the shapes on the drawing now, as the part's answer, through checkPlayedPart. */
const checkNow = (played: Played) => {
  const p = played.parts[0]
  const shapes = legoShapesNow(played, p)
  return checkPlayedPart(p, legoAnswer(shapes ?? []), played, S)
}

describe('a Lego part laid out in Geometry and checked from the drawing', () => {
  let played: Played
  beforeEach(() => {
    resetGlobals()
    forgetLegoPart()
    sc().newScene()
    sc().setActiveSpace('vectors')
    played = playQuestion(RECT_Q, 1, S)
  })

  it('lays out the outline to fill and the two pieces, in Geometry, whatever drawing is open', () => {
    expect(played.problems).toEqual([])
    const note = showLegoPart(played, played.parts[0])
    expect(note).toBe('The 2 pieces are beside the outline in Geometry. Slide and turn them to fill it, then press Check my shape.')
    const guide = polygons().filter((p) => !p.lego)
    expect(guide).toHaveLength(1)
    expect(guide[0]).toMatchObject({ fill: false, themed: '--text-dim', label: 'The shape to make' })
    expect(pieces()).toHaveLength(2)
    expect(Object.values(sc().objects).every((o) => o.space === 'shapes')).toBe(true)
    // Each piece moves as one brick, as Break apart makes them: corners and sides locked.
    for (const piece of pieces()) {
      expect(piece.lego!.sourceSignature).not.toBe('')
      for (const pid of piece.points) expect(sc().objects[pid].locked).toBe(true)
    }
    expect(Object.values(sc().objects).filter((o) => o.type === 'segment' && !o.themed).every((o) => o.locked)).toBe(true)
    expect(legoLaidOut(played, played.parts[0])).toBe(true)
    // Laid out, nothing is done yet: work not begun, like an untouched box — not a try, and not
    // "there is a gap" for pieces PhysLab set apart itself.
    expect(checkNow(played)).toEqual({ verdict: 'unreadable', message: LEGO_UNTOUCHED })
    // One piece moved, and the gap is the student's to close.
    const [a] = pieces()
    place(a, asPiece(a, LOWER))
    expect(checkNow(played)).toEqual({ verdict: 'wrong', message: LEGO_GAP })
  })

  it('the rectangle cut on its diagonal and reassembled into the rectangle is right — apart, fused with Fuse, and after an undo', () => {
    showLegoPart(played, played.parts[0])
    const [a, b] = pieces()
    // Rebuilt away from the outline: where it is built does not matter.
    place(a, asPiece(a, move(LOWER, 12, 5)))
    place(b, asPiece(b, move(UPPER, 12, 5)))
    expect(checkNow(played)).toEqual({ verdict: 'right' })
    expect(sc().fusePieces([a.id, b.id])).toBeNull()
    expect(pieces()).toHaveLength(0)
    expect(legoShapesNow(played, played.parts[0])).toHaveLength(1)
    expect(checkNow(played)).toEqual({ verdict: 'right' })
    // Undo brings the pieces back, and they are still this part's.
    sc().undo()
    expect(legoShapesNow(played, played.parts[0])).toHaveLength(2)
    expect(checkNow(played)).toEqual({ verdict: 'right' })
  })

  it('a piece let go beside its partner snaps and fuses by itself, and the fused shape is still checked', () => {
    showLegoPart(played, played.parts[0])
    const [a, b] = pieces()
    place(a, asPiece(a, LOWER))
    // The second piece dragged to within a hair of home: the release pulls it on and fuses.
    sc().beginGesture()
    place(b, asPiece(b, move(UPPER, 0.01, -0.01)))
    sc().endGesture()
    expect(pieces()).toHaveLength(0)
    const shapes = legoShapesNow(played, played.parts[0])!
    expect(shapes).toHaveLength(1)
    expect(sameShape(shapes[0], RECT)).toBe(true)
    expect(checkNow(played)).toEqual({ verdict: 'right' })
  })

  it('into a parallelogram is wrong with "same area, different outline", fused or not', () => {
    showLegoPart(played, played.parts[0])
    const [a, b] = pieces()
    // The 4, 5, 4, 5 parallelogram: (0,0),(4,0),(4,3) and (4,0),(8,3),(4,3).
    place(a, asPiece(a, LOWER))
    place(b, asPiece(b, [[4, 0, 0], [8, 3, 0], [4, 3, 0]]))
    const apartCheck = checkNow(played)
    expect(apartCheck).toEqual({ verdict: 'wrong', message: 'Same area, different outline: the pieces make a parallelogram. Turn or flip a piece and try again.' })
    // Fused into it with the Fuse button: a new shape, still this part's, still wrong.
    expect(sc().fusePieces([a.id, b.id])).toBeNull()
    expect(legoShapesNow(played, played.parts[0])).toHaveLength(1)
    expect(checkNow(played)).toEqual(apartCheck)
  })

  it('pressing it again starts over: the old pieces, the old outline and whatever they were fused into go', () => {
    showLegoPart(played, played.parts[0])
    const [a, b] = pieces()
    place(a, asPiece(a, LOWER))
    place(b, asPiece(b, UPPER))
    expect(sc().fusePieces([a.id, b.id])).toBeNull()
    showLegoPart(played, played.parts[0])
    expect(pieces()).toHaveLength(2)
    expect(polygons()).toHaveLength(3)
    // Outline: 4 corners, 1 polygon, 4 sides; each triangle: 3 corners, 1 polygon, 3 sides.
    expect(Object.keys(sc().objects)).toHaveLength(9 + 7 + 7)
    expect(checkNow(played)).toEqual({ verdict: 'unreadable', message: LEGO_UNTOUCHED })
  })

  it('another question’s part and a part never laid out are not read from the drawing', () => {
    expect(legoShapesNow(played, played.parts[0])).toBeNull()
    expect(checkNow(played)).toEqual({ verdict: 'unreadable', message: NOT_LAID_OUT })
    showLegoPart(played, played.parts[0])
    const other = playQuestion({ ...RECT_Q, id: 'another' }, 1, S)
    expect(legoShapesNow(other, other.parts[0])).toBeNull()
    // A piece deleted: some of the shape is missing.
    sc().removeObjects([pieces()[0].id])
    expect(checkNow(played)).toEqual({ verdict: 'wrong', message: 'Some of the shape is missing: it needs all 2 pieces.' })
  })

  it('a teacher’s triangle in three pieces, read from its file, lays out three and marks them put back as right', () => {
    const tri = lego(
      [
        ['0', '0'],
        ['4', '0'],
        ['0', '3']
      ],
      3
    )
    const text = serializePQFile({ app: 'PhysLab', format: 'pqjson', version: 1, questions: [{ ...RECT_Q, id: 'tri', parts: [tri] }] })
    const [q] = parsePQFile(text).questions
    const p3 = playQuestion(q, 1, S)
    showLegoPart(p3, p3.parts[0])
    expect(pieces()).toHaveLength(3)
    const cut = legoCut(legoTarget(tri, {}), 3)!
    pieces().forEach((piece, i) => place(piece, move(cut[i].pts, -9, 2)))
    expect(checkPlayedPart(p3.parts[0], legoAnswer(legoShapesNow(p3, p3.parts[0])!), p3, S)).toEqual({ verdict: 'right' })
  })

  it('a shape of the student’s own fused with a piece is not taken for a piece, nor is it after an undo', () => {
    showLegoPart(played, played.parts[0])
    const [a] = pieces()
    place(a, asPiece(a, LOWER))
    // The student draws the other half themselves and fuses it with piece a.
    const bld = new Builder()
    const own = bld.polygon(UPPER.map((pt) => bld.point(pt).id), { withSides: true })
    sc().addObjects(bld.created.map((o) => ({ ...o, space: 'shapes' as const })))
    expect(sc().fusePieces([a.id, own.id])).toBeNull()
    // Only piece b is still this part's: half the shape is missing, never "right".
    expect(legoShapesNow(played, played.parts[0])).toHaveLength(1)
    expect(checkNow(played)).toEqual({ verdict: 'wrong', message: 'Some of the shape is missing: it needs all 2 pieces.' })
    sc().undo()
    expect(legoShapesNow(played, played.parts[0])).toHaveLength(2)
    expect(sc().objects[own.id]).toBeDefined()
    expect(checkNow(played)).toEqual({ verdict: 'wrong', message: LEGO_GAP })
  })

  it('madeOfLineage adopts a Break apart of a fused shape, and nothing from a change that removes a stranger', () => {
    const poly = (id: string): SceneObject => ({ id, name: id, type: 'polygon', points: [], fill: true, visible: true, locked: false, color: '#888888', showLabel: true }) as SceneObject
    const area: Record<string, number> = { f: 12, p1: 6, p2: 6, mine: 6, big: 18 }
    const areaOf = (id: string) => area[id]
    const objs = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, poly(id)]))
    expect(madeOfLineage(objs('f'), objs('p1', 'p2'), new Set(['f']), areaOf)).toEqual(['p1', 'p2'])
    expect(madeOfLineage(objs('p1', 'mine'), objs('big'), new Set(['p1']), areaOf)).toEqual([])
    expect(madeOfLineage(objs('p1', 'p2'), objs('p1'), new Set(['p1', 'p2']), areaOf)).toEqual([])
    // Same polygons taken away but a different area made: not these pieces.
    expect(madeOfLineage(objs('p1', 'p2'), objs('big'), new Set(['p1', 'p2']), areaOf)).toEqual([])
  })

  it('any Check marks what the pieces make now, not an answer read before they were moved; gone from the drawing, the last checked answer stands', () => {
    showLegoPart(played, played.parts[0])
    const p = played.parts[0]
    const [a, b] = pieces()
    place(a, asPiece(a, LOWER))
    place(b, asPiece(b, UPPER))
    const filled = legoAnswer(legoShapesNow(played, p)!)
    expect(checkPlayedPart(p, filled, played, S)).toEqual({ verdict: 'right' })
    // Moved into the parallelogram after Check my shape: the question's own Check (which marks
    // with the answer Check my shape stored, or with none) sees the drawing, never the old tick.
    place(b, asPiece(b, [[4, 0, 0], [8, 3, 0], [4, 3, 0]]))
    const parallelogram = { verdict: 'wrong', message: 'Same area, different outline: the pieces make a parallelogram. Turn or flip a piece and try again.' }
    expect(checkPlayedPart(p, filled, played, S)).toEqual(parallelogram)
    expect(checkPlayedPart(p, '', played, S)).toEqual(parallelogram)
    // Another question's pieces laid out take these away: what was last checked is marked.
    const other = playQuestion({ ...RECT_Q, id: 'another' }, 1, S)
    showLegoPart(other, other.parts[0])
    expect(legoShapesNow(played, p)).toBeNull()
    expect(checkPlayedPart(p, filled, played, S)).toEqual({ verdict: 'right' })
    // Never checked and off the drawing: empty like an untouched box, as markPlayed expects of
    // every part with nothing typed; "not in Geometry" is for a press of Check my shape.
    expect(checkPlayedPart(p, '', played, S)).toEqual({ verdict: 'empty' })
    expect(checkPlayedPart(p, legoAnswer([]), played, S)).toEqual({ verdict: 'unreadable', message: NOT_LAID_OUT })
  })

  it('is laid out only while something of it is on the drawing: an undone lay-out or a new drawing is not', () => {
    const p = played.parts[0]
    showLegoPart(played, p)
    expect(legoLaidOut(played, p)).toBe(true)
    sc().undo()
    expect(Object.keys(sc().objects)).toHaveLength(0)
    expect(legoLaidOut(played, p)).toBe(false)
    // So Check my shape says to lay them out, and the button it names is the one on screen.
    expect(checkNow(played)).toEqual({ verdict: 'unreadable', message: NOT_LAID_OUT })
    sc().redo()
    expect(legoLaidOut(played, p)).toBe(true)
    sc().newScene()
    expect(legoLaidOut(played, p)).toBe(false)
    expect(legoShapesNow(played, p)).toBeNull()
  })

  it('a shape with no area refuses in a sentence and leaves the drawing alone', () => {
    const bad = playQuestion({ ...RECT_Q, parts: [lego([['0', '0'], ['4', '0'], ['8', '0']])] }, 1, S)
    expect(() => showLegoPart(bad, bad.parts[0])).toThrow('The shape to make has no area, so there is nothing to fill.')
    expect(Object.keys(sc().objects)).toHaveLength(0)
  })
})

describe('a Lego part counts in the question’s score', () => {
  /** Rectangle, then "What is its area?": a Lego part beside a number part. */
  const WITH_AREA: PQQuestion = {
    ...RECT_Q,
    id: 'fill-rectangle-and-area',
    parts: [RECT_PART, { type: 'number', prompt: 'What is its area?', answer: 'w*h', unit: 'none', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }]
  }
  const PARALLELOGRAM = { verdict: 'wrong', message: 'Same area, different outline: the pieces make a parallelogram. Turn or flip a piece and try again.' }

  /** What Check my shape writes as the part's answer: what the pieces make on the drawing now. */
  const handIn = (played: Played): PartAnswer => legoAnswer(legoShapesNow(played, played.parts[0]) ?? [])

  beforeEach(() => {
    resetGlobals()
    forgetLegoPart()
    sc().newScene()
    sc().setActiveSpace('vectors')
  })

  it('a Lego-only question with the rectangle put back is marked right and scored 1 / 1; the parallelogram is wrong', () => {
    const played = playQuestion(RECT_Q, 1, S)
    expect(countedParts(played).map((p) => p.part.type)).toEqual(['lego'])
    showLegoPart(played, played.parts[0])
    const [a, b] = pieces()
    place(a, asPiece(a, LOWER))
    place(b, asPiece(b, UPPER))
    const right = markPlayed(played, { p0: handIn(played) }, S)
    expect(right.p0).toMatchObject({ verdict: 'right', marks: 1, outOf: 1 })
    expect(questionVerdict(played, right, false)).toBe(true)
    // Right at the first Check: the result file's facility counts it, with its mark.
    const firstTries = recordFirstTries(null, right, false)
    expect(firstTries).toEqual({ p0: true })
    const parts = countedParts(played).map((p) => ({ key: p.key, index: p.index, marks: p.part.marks }))
    expect(resultParts(parts, right, firstTries, false)).toEqual([{ index: 0, answered: true, firstTry: true, right: true, marks: 1, outOf: 1 }])
    // The full solution opened first: shown, not earned.
    expect(questionVerdict(played, right, true)).toBe(false)

    place(b, asPiece(b, [[4, 0, 0], [8, 3, 0], [4, 3, 0]]))
    const wrong = markPlayed(played, { p0: handIn(played) }, S)
    expect(wrong.p0).toMatchObject({ ...PARALLELOGRAM, marks: 0, outOf: 1 })
    expect(questionVerdict(played, wrong, false)).toBe(false)
    expect(tally([{ right: questionVerdict(played, right, false) }, { right: questionVerdict(played, wrong, false) }])).toEqual({ right: 1, marked: 2, unmarked: 0 })
  })

  it('never laid out, it is an empty answer: not in "not marked", and not right', () => {
    const played = playQuestion(RECT_Q, 1, S)
    const nothing = markPlayed(played, {}, S)
    expect(nothing.p0).toMatchObject({ verdict: 'empty', marks: 0 })
    expect(questionVerdict(played, nothing, false)).toBe(false)
    // Check my shape pressed before the pieces were laid out: the sentence says what to press, and
    // it is not the student's first try.
    const early = markPlayed(played, { p0: handIn(played) }, S)
    expect(early.p0).toMatchObject({ verdict: 'unreadable', message: NOT_LAID_OUT })
    expect(recordFirstTries(null, early, false)).toEqual({})
  })

  it('a Lego part beside a number part: the right area with the parallelogram is not all right; with the rectangle it is', () => {
    const played = playQuestion(WITH_AREA, 1, S)
    expect(countedParts(played).map((p) => p.key)).toEqual(['p0', 'p1'])
    showLegoPart(played, played.parts[0])
    const [a, b] = pieces()
    place(a, asPiece(a, LOWER))
    place(b, asPiece(b, [[4, 0, 0], [8, 3, 0], [4, 3, 0]]))
    const wrong = markPlayed(played, { p0: handIn(played), p1: '12' }, S)
    expect(wrong.p0).toMatchObject(PARALLELOGRAM)
    expect(wrong.p1.verdict).toBe('right')
    expect(questionVerdict(played, wrong, false)).toBe(false)
    place(b, asPiece(b, UPPER))
    // The question's Check reads the drawing again, whatever answer was written before.
    const right = markPlayed(played, { p0: legoAnswer([]), p1: '12' }, S)
    expect(right.p0.verdict).toBe('right')
    expect(questionVerdict(played, right, false)).toBe(true)
  })

  it('pieces laid out and not yet moved are no try: the area typed and checked first leaves the Lego part without a cross or a missed first try', () => {
    const played = playQuestion(WITH_AREA, 1, S)
    showLegoPart(played, played.parts[0])
    const first = markPlayed(played, { p1: '12' }, S)
    expect(first.p0).toMatchObject({ verdict: 'unreadable', message: LEGO_UNTOUCHED })
    expect(first.p1.verdict).toBe('right')
    expect(questionVerdict(played, first, false)).toBe(false)
    const firstTries = recordFirstTries(null, first, false)
    expect(firstTries).toEqual({ p1: true })
    // Then the rectangle is made: the Lego part's first real try is this one, and it is right.
    const [a, b] = pieces()
    place(a, asPiece(a, LOWER))
    place(b, asPiece(b, UPPER))
    const done = markPlayed(played, { p0: handIn(played), p1: '12' }, S)
    expect(questionVerdict(played, done, false)).toBe(true)
    expect(recordFirstTries(firstTries, done, false)).toEqual({ p1: true, p0: true })
  })

  it('Check my shape on a part whose pieces another part took away keeps its right answer', () => {
    const TWO: PQQuestion = { ...RECT_Q, id: 'fill-two', parts: [RECT_PART, RECT_PART] }
    const played = playQuestion(TWO, 1, S)
    const [pa, pb] = played.parts
    showLegoPart(played, pa)
    const [a, b] = pieces()
    place(a, asPiece(a, LOWER))
    place(b, asPiece(b, UPPER))
    const typed: Record<string, PartAnswer> = { p0: legoHandIn(played, pa, undefined) }
    expect(markPlayed(played, typed, S).p0.verdict).toBe('right')
    // Part (b) laid out takes (a)'s pieces away; (a)'s Check my shape pressed again keeps what was
    // checked, where writing an empty list marked it "not in Geometry" and lost the tick.
    showLegoPart(played, pb)
    expect(legoShapesNow(played, pa)).toBeNull()
    typed.p0 = legoHandIn(played, pa, typed.p0)
    expect(typed.p0).not.toEqual([])
    expect(markPlayed(played, typed, S).p0.verdict).toBe('right')
    // Never laid out and never checked, it still says to lay the pieces out.
    expect(legoHandIn(playQuestion({ ...TWO, id: 'fresh' }, 1, S), pa, '')).toEqual([])
    expect(legoHandIn(played, pb, undefined)).toHaveLength(2)
  })
})

describe('the Check my shape row', () => {
  it('offers both buttons as 44 px targets, with the prompt and what to do, and no box to type in', () => {
    const played = playQuestion(RECT_Q, 1, S)
    const html = renderToStaticMarkup(createElement(PartRows, { played, typed: {}, checks: {}, revealed: false, onChange: () => {}, onEnter: () => {} }))
    expect(html).toContain('Fill the shape.')
    expect(html).toContain('Put the pieces in Geometry')
    expect(html).toContain('Check my shape')
    expect(html).toContain('turn them with the handle above a piece')
    expect(html.match(/<button[^>]*min-h-\[44px\]/g)).toHaveLength(2)
    expect(html).not.toContain('<input')
  })

  it('an unreadable check shows its sentence and no cross; a wrong shape still has its cross', () => {
    const played = playQuestion(RECT_Q, 1, S)
    const row = (check: Check) => renderToStaticMarkup(createElement(PartRows, { played, typed: {}, checks: { p0: check }, revealed: false, onChange: () => {}, onEnter: () => {} }))
    const early = row({ verdict: 'unreadable', message: NOT_LAID_OUT })
    expect(early).toContain('The pieces are not in Geometry.')
    expect(early).not.toContain('aria-label="not right"')
    // A note on what to do next, not the red of a wrong answer.
    expect(early).toContain('<div class="mt-1 text-ink-dim">The pieces are not in Geometry.')
    expect(early).not.toContain('text-bad')
    const wrong = row({ verdict: 'wrong', message: LEGO_GAP })
    expect(wrong).toContain('aria-label="not right"')
    expect(row({ verdict: 'right' })).toContain('aria-label="right"')
  })
})
