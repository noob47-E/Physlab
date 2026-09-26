// A Lego-fill part (rung 1, "first look"): the question gives a shape, PhysLab cuts it into the
// author's number of pieces with the same cutter Geometry's Break apart uses, turns them and lays
// them beside the shape's outline in Geometry, and the student slides, turns and snaps them back
// together. "Check my shape" takes whatever the pieces make now — still apart, or fused into one
// shape (Geometry fuses the pieces by itself once they make the shape they were cut from) — and
// compares its outline with the target's by congruence, so where on the drawing it was built and
// which way up does not matter.
//
// The pure half (the target, the cut, the layout, the marking, the answer as text) is tested
// headless; `showLegoPart` and `legoShapesNow` are the only functions that reach the scene.

import { Builder } from '../core/factory'
import { scene, useScene } from '../core/store'
import type { ObjId, PolygonObj, SceneObject } from '../core/types'
import type { Check } from '../math/checkAnswer'
import type { Part } from '../math/decompose'
import { decompose } from '../math/decompose'
import { polygonArea, signedArea2D } from '../math/geometry'
import { legoParts, outlineOf, piecesOverlap, sameShape, signatureOf, simpleCut, tintPiece, turnPiece } from '../math/lego'
import { classifyPolygon, cleanPolygon } from '../math/shapes'
import type { V3 } from '../math/vec'
import { fitCamera } from '../render/viewState'
import { evaluateInVariables } from './parts'
import type { PQPart } from './pqjson'
import type { Played, PlayedPart } from './player'

export type LegoPart = Extract<PQPart, { type: 'lego' }>

// ---------------------------------------------------------------------------
// The shape to make
// ---------------------------------------------------------------------------

/** Do the sides a–b and c–d cross at a point inside both? Shared ends do not count. */
function crosses(a: V3, b: V3, c: V3, d: V3): boolean {
  const side = (p: V3, q: V3, r: V3): number => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const eps = 1e-12
  const d1 = side(c, d, a)
  const d2 = side(c, d, b)
  const d3 = side(a, b, c)
  const d4 = side(a, b, d)
  return ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))
}

/**
 * The target outline with this variant's numbers in, anticlockwise and without repeated or
 * in-line corners. Throws a sentence when a corner cannot be worked out, when the shape has no
 * area, or when its outline crosses itself (a bow-tie has no inside to fill).
 */
export function legoTarget(part: LegoPart, values: Record<string, number>): V3[] {
  const raw = part.target.map(([x, y]): V3 => {
    let p: V3
    try {
      p = [evaluateInVariables(x, values), evaluateInVariables(y, values), 0]
    } catch {
      throw new Error(`PhysLab could not work out a corner of the shape to make: (${x}, ${y}).`)
    }
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) throw new Error(`A corner of the shape to make works out to infinity or nothing: (${x}, ${y}).`)
    return p
  })
  const pts = cleanPolygon(raw)
  const n = pts.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue // neighbours round the end
      if (crosses(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) throw new Error('The outline of the shape to make crosses itself, so it has no single inside to fill.')
    }
  }
  // After the crossing check: a symmetric bow-tie's two halves cancel to no area at all.
  const area = n >= 3 ? polygonArea(pts) : 0
  const span = Math.max(...pts.map((p) => Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1])), 0)
  if (n < 3 || area <= 1e-9 * Math.max(1, span * span)) throw new Error('The shape to make has no area, so there is nothing to fill.')
  return signedArea2D(pts) < 0 ? [...pts].reverse() : pts
}

// ---------------------------------------------------------------------------
// The pieces
// ---------------------------------------------------------------------------

/** The most ways of cutting one shape tried before giving up on the author's piece count. */
const MAX_WAYS = 60

/** Is the polygon convex (every turn the same way)? A straight cut between two corners stays inside only then. */
function convex(pts: V3[]): boolean {
  const n = pts.length
  let sign = 0
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const c = pts[(i + 2) % n]
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (Math.abs(z) < 1e-12) continue
    if (sign === 0) sign = Math.sign(z)
    else if (Math.sign(z) !== sign) return false
  }
  return true
}

/**
 * The target cut into exactly `n` pieces, by the cutter Geometry's Break apart uses (`legoParts`):
 * its first way first, then the other ways it knows, with only rectangles and triangles first
 * and then any shape with an area formula. A rectangle has only one way, along its diagonal, and
 * a triangle one, along the median to its longest side — two pieces — so for more the biggest
 * convex piece is cut again the same way (`simpleCut`) until there are `n`: a triangle asked for
 * in three pieces is its two median halves with the bigger half cut again. Null when no way
 * reaches `n` (fewer than one, or a shape that only comes apart into more). One piece is the
 * whole shape, to be turned back into place.
 */
export function legoCut(target: V3[], n: number): Part[] | null {
  if (!Number.isInteger(n) || n < 1) return null
  const whole = (pts: V3[]): Part => ({ pts, cls: classifyPolygon(pts, 0.5, 0.005), area: polygonArea(pts) })
  if (n === 1) return [whole(cleanPolygon(target))]
  let fewer: Part[] | null = null
  for (const goal of ['basic', 'formula'] as const) {
    const ways = Math.min(MAX_WAYS, Math.max(1, decompose(target, goal, 0).alternatives))
    for (let index = 0; index < ways; index++) {
      const parts = legoParts(target, goal, index)
      if (parts.length === n) return parts
      if (parts.length >= 2 && parts.length < n && (!fewer || parts.length > fewer.length)) fewer = parts
    }
  }
  if (!fewer) return null
  const parts = [...fewer]
  while (parts.length < n) {
    // The biggest piece that can be cut straight: a cut across a concave piece could leave it.
    let at = -1
    parts.forEach((p, i) => {
      if (convex(p.pts) && (at < 0 || p.area > parts[at].area)) at = i
    })
    if (at < 0) return null
    const halves = simpleCut(parts[at].pts)
    if (halves.length !== 2) return null
    parts.splice(at, 1, ...halves)
  }
  return parts
}

/**
 * How each piece is turned before it is handed over, in turn: every one a whole number of the
 * 15° steps the turn buttons and the turn handle take, so a student can always turn it straight
 * again, and never 0, so no piece already sits the right way round by accident.
 */
export const LEGO_TURNS = [15, -30, 45, -15, 30, -45, 60, -60] as const

const bbox = (pts: V3[]) => {
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

/**
 * Where the pieces are laid out: each turned by its `LEGO_TURNS` step about its own centre, then
 * set in a row to the right of the outline, level with its middle, a quarter of the shape's size
 * apart — so no piece starts on the outline or on another piece, and the drawing framed on the
 * outline and the row shows everything at once.
 */
export function legoLayout(target: V3[], pieces: V3[][]): V3[][] {
  const box = bbox(target)
  const size = Math.max(box.maxX - box.minX, box.maxY - box.minY)
  const gap = size / 4
  const midY = (box.minY + box.maxY) / 2
  let cursor = box.maxX + 2 * gap
  return pieces.map((pts, i) => {
    const turned = turnPiece(pts, LEGO_TURNS[i % LEGO_TURNS.length])
    const b = bbox(turned)
    const dx = cursor - b.minX
    const dy = midY - (b.minY + b.maxY) / 2
    cursor += b.maxX - b.minX + gap
    return turned.map((p): V3 => [p[0] + dx, p[1] + dy, 0])
  })
}

// ---------------------------------------------------------------------------
// Marking
// ---------------------------------------------------------------------------

export const NOT_LAID_OUT = 'The pieces are not in Geometry. Press "Put the pieces in Geometry" to lay them out.'
export const LEGO_GAP = 'The pieces do not quite touch — there is a gap. Slide them together until their sides meet.'
export const LEGO_OVERLAP = 'Two pieces lie on top of each other. Move one off the other.'
export const LEGO_RIGHT = 'That fills the shape exactly.'
export const LEGO_UNTOUCHED = 'The pieces are still where PhysLab put them: slide and turn them into the outline, then press Check my shape.'

/** "a parallelogram", "an isosceles triangle": a shape's name as it is said in a sentence. */
const aShape = (name: string): string => {
  const lower = name.charAt(0).toLowerCase() + name.slice(1)
  return `${/^[aeiou]/.test(lower) ? 'an' : 'a'} ${lower}`
}

const sameArea = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b))

/**
 * Marks what the student's pieces make against the target. `shapes` is every shape made of this
 * part's pieces as it stands now: the pieces still apart, or fewer, bigger shapes once some were
 * fused. Right is one outline congruent to the target — anywhere on the drawing, turned or
 * flipped. The pieces always keep their area, so a wrong outline is "same area, different
 * outline", named; pieces left apart, lying on each other, missing or joined to another shape
 * each get their own sentence.
 */
export function checkLegoShapes(shapes: V3[][], target: V3[], pieces: number): Check {
  const live = shapes.map((s) => cleanPolygon(s)).filter((s) => s.length >= 3)
  if (live.length === 0) return { verdict: 'unreadable', message: NOT_LAID_OUT }
  const want = polygonArea(target)
  const have = live.reduce((s, pc) => s + polygonArea(pc), 0)
  if (!sameArea(have, want)) {
    return have < want
      ? { verdict: 'wrong', message: `Some of the shape is missing: it needs ${pieces === 1 ? 'the piece' : `all ${pieces} pieces`}.` }
      : { verdict: 'wrong', message: `This has more in it than the pieces you were given: use only ${pieces === 1 ? 'that piece' : `those ${pieces} pieces`}.` }
  }
  let outline: V3[]
  if (live.length === 1) outline = live[0]
  else {
    if (piecesOverlap(live)) return { verdict: 'wrong', message: LEGO_OVERLAP }
    const joined = outlineOf(live)
    if (!joined) return { verdict: 'wrong', message: LEGO_GAP }
    outline = joined
  }
  if (sameShape(outline, target)) return { verdict: 'right' }
  return { verdict: 'wrong', message: `Same area, different outline: the pieces make ${aShape(classifyPolygon(outline).name)}. Turn or flip a piece and try again.` }
}

/**
 * The shapes as a part's answer: one row per shape, its corners' x and y in turn, as text that
 * reads back to the same doubles. Practice keeps every part's answer as text or a grid of text;
 * this is how a Lego part's answer travels through `checkPlayedPart` like any other.
 */
export const legoAnswer = (shapes: V3[][]): string[][] => shapes.map((pts) => pts.flatMap((p) => [String(p[0]), String(p[1])]))

/** The shapes back from `legoAnswer`'s text; null when any row is not a shape's corners. */
export function readLegoAnswer(rows: readonly (readonly string[])[]): V3[][] | null {
  const out: V3[][] = []
  for (const row of rows) {
    if (row.length < 6 || row.length % 2 !== 0) return null
    const nums = row.map((t) => (t.trim() === '' ? NaN : Number(t)))
    if (nums.some((v) => !Number.isFinite(v))) return null
    const pts: V3[] = []
    for (let k = 0; k < nums.length; k += 2) pts.push([nums[k], nums[k + 1], 0])
    out.push(pts)
  }
  return out
}

/**
 * Marks a Lego part from its answer (`legoAnswer`'s rows) with this variant's numbers. A target
 * the question itself gets wrong (no area, a crossed outline, a corner that cannot be worked out)
 * is the question's fault, said in a sentence and never a cross against the student.
 */
export function checkLegoPart(answer: readonly (readonly string[])[], part: LegoPart, values: Record<string, number>): Check {
  let target: V3[]
  try {
    target = legoTarget(part, values)
  } catch (e) {
    return { verdict: 'unreadable', message: e instanceof Error ? e.message : String(e) }
  }
  const shapes = readLegoAnswer(answer)
  if (!shapes) return { verdict: 'unreadable', message: NOT_LAID_OUT }
  const c = checkLegoShapes(shapes, target, part.pieces)
  // Pieces still exactly where PhysLab laid them are work not begun, like an untouched box: marked
  // "there is a gap" they were a cross and a missed first try for a student who had only typed
  // the next part's answer. A single piece laid out already fills the shape, and stays right.
  return c.verdict === 'wrong' && stillLaidOut(shapes, target, part.pieces) ? { verdict: 'unreadable', message: LEGO_UNTOUCHED } : c
}

/**
 * Are `shapes` the pieces exactly as `showLegoPart` lays them out? The cut and the layout depend
 * only on the target and the number of pieces, so this is known without the drawing — the answer
 * a part kept after its pieces were taken away is judged the same way as the pieces on it.
 */
function stillLaidOut(shapes: V3[][], target: V3[], pieces: number): boolean {
  const cut = legoCut(target, pieces)
  if (!cut || cut.length !== shapes.length) return false
  const laid = legoLayout(
    target,
    cut.map((c) => c.pts)
  )
  const eps = 1e-9 * Math.max(1, ...target.map((q) => Math.max(Math.abs(q[0]), Math.abs(q[1]))))
  const same = (a: V3[], b: V3[]) => a.length === b.length && a.every((q, k) => Math.abs(q[0] - b[k][0]) <= eps && Math.abs(q[1] - b[k][1]) <= eps)
  const left = [...laid]
  return shapes.every((s) => {
    const i = left.findIndex((l) => same(s, l))
    if (i < 0) return false
    left.splice(i, 1)
    return true
  })
}

// ---------------------------------------------------------------------------
// In Geometry
// ---------------------------------------------------------------------------

/** One part's pieces on the drawing. */
interface LegoSetup {
  /** The played question and part it belongs to (`Played.problem.id` and the part's key). */
  key: string
  /** The outline to fill: its corners, polygon and sides. */
  guide: ObjId[]
  /**
   * Every polygon made of this part's pieces: the pieces themselves, and whatever a Fuse or a
   * Break apart made of them since. A fused shape carries no Lego record (the original shape
   * comes back as a plain polygon), so it is recognised by being made in the same change that
   * took pieces away. Ids are never reused, so the set only grows; what is on the drawing now is
   * the set against the scene, which also follows an undo.
   */
  lineage: Set<ObjId>
}

let current: LegoSetup | null = null
let watching = false

const partKey = (played: Played, p: PlayedPart): string => `${played.problem.id}:${p.key}`

const polygonIds = (objects: Record<ObjId, SceneObject>): ObjId[] => Object.keys(objects).filter((id) => objects[id].type === 'polygon')

/**
 * The polygons made of this part's shapes in one change of the scene, or none. A change that
 * takes away only this part's shapes and adds polygons of the same total area turned them into
 * those polygons: a Fuse, Geometry's own fuse, a Break apart of a fused shape, an undo or a redo of
 * one. A change that also takes away a shape of the student's own (a piece fused with a triangle
 * they drew) adopts nothing — adopting every new polygon counted that triangle as a piece, and
 * undoing such a Fuse then pulled the student's triangle itself in.
 */
export function madeOfLineage(prev: Record<ObjId, SceneObject>, next: Record<ObjId, SceneObject>, lineage: ReadonlySet<ObjId>, areaOf: (id: ObjId, objects: Record<ObjId, SceneObject>) => number): ObjId[] {
  const removed = polygonIds(prev).filter((id) => !next[id])
  if (removed.length === 0 || !removed.every((id) => lineage.has(id))) return []
  const added = polygonIds(next).filter((id) => !prev[id])
  const before = removed.reduce((s, id) => s + areaOf(id, prev), 0)
  const after = added.reduce((s, id) => s + areaOf(id, next), 0)
  return added.length > 0 && sameArea(after, before) ? added : []
}

/** Follows this part's shapes through every change of the scene (see madeOfLineage). */
function follow(): void {
  if (watching) return
  watching = true
  useScene.subscribe((s, prev) => {
    if (!current || s.objects === prev.objects) return
    // Each side's areas from its own evaluation: a removed polygon has corners only in the old one.
    const areaOf = (id: ObjId, objects: Record<ObjId, SceneObject>): number => {
      const c = (objects === prev.objects ? prev.ev : s.ev).values.get(id)
      return c?.type === 'polygon' && c.pts.length >= 3 ? polygonArea(c.pts) : NaN
    }
    for (const id of madeOfLineage(prev.objects, s.objects, current.lineage, areaOf)) current.lineage.add(id)
  })
}

/**
 * Is this part the one whose pieces are on the drawing now? Laid out last, and something of it —
 * the outline, a piece or what the pieces were fused into — still on the drawing: an undone
 * lay-out, deleted pieces or a new drawing leave nothing to start again from.
 */
export function legoLaidOut(played: Played, p: PlayedPart): boolean {
  if (current?.key !== partKey(played, p)) return false
  const { objects } = scene()
  return current.guide.some((id) => id in objects) || [...current.lineage].some((id) => id in objects)
}

/**
 * Puts the part's outline and its pieces in the Geometry drawing, replacing any Lego part laid
 * out before (its pieces and whatever they were fused into), and returns what was done as one
 * sentence. The pieces are made as Break apart makes them — locked corners and sides so each
 * moves as one brick, tinted from one colour, and all carrying the target's signature, so Geometry
 * snaps them to each other and fuses them by itself once they make the target again. Throws a
 * sentence when the shape cannot be worked out or cut into the author's number of pieces.
 */
export function showLegoPart(played: Played, p: PlayedPart): string {
  if (p.part.type !== 'lego') throw new Error('This part is not a Lego part.')
  const part = p.part
  const target = legoTarget(part, played.variant.values)
  const cut = legoCut(target, part.pieces)
  if (!cut) throw new Error(`PhysLab cannot cut this shape into ${part.pieces} pieces.`)
  const laid = legoLayout(
    target,
    cut.map((c) => c.pts)
  )

  const s = scene()
  if (current) {
    const alive = [...current.guide, ...[...current.lineage].flatMap((id) => {
      const o = s.objects[id]
      return o?.type === 'polygon' ? [id, ...o.points] : []
    })].filter((id) => s.objects[id])
    current = null
    if (alive.length) s.removeObjects(alive)
  }

  const b = new Builder()
  const corners = target.map((pt) => b.point(pt))
  const outline = b.polygon(
    corners.map((c) => c.id),
    { withSides: true }
  )
  const guideIds = new Set(b.created.map((o) => o.id))
  const sourceId = `lego-${outline.id}`
  const signature = signatureOf(target)
  const pieceIds: ObjId[] = []
  laid.forEach((pts, i) => {
    const color = tintPiece(outline.color, i, laid.length)
    const ids = pts.map((pt) => b.point(pt, { color }).id)
    const poly = b.polygon(ids, { withSides: true, color })
    Object.assign(poly, {
      showAngles: false,
      label: cut[i].cls.name,
      lego: { sourceId, sourceSignature: signature, pieceIndex: i, originalColor: outline.color }
    })
    pieceIds.push(poly.id)
  })

  const made = b.created.map((o): SceneObject => {
    // Every object is in the Geometry drawing whatever the mode is when the button is pressed.
    const inShapes = { ...o, space: 'shapes' as const }
    if (guideIds.has(o.id)) {
      // The outline is a frame to fill, not a shape to move: unfilled, drawn in the theme's own
      // dim ink, and its corners fixed where the question put them.
      if (o.type === 'polygon') return { ...inShapes, fill: false, showAngles: false, themed: '--text-dim', label: 'The shape to make' } as PolygonObj
      return { ...inShapes, themed: '--text-dim', locked: o.type === 'point' ? true : o.locked } as SceneObject
    }
    // A piece's corners and sides are locked, as Break apart makes them: it moves only as one brick.
    return o.type === 'point' || o.type === 'segment' ? ({ ...inShapes, locked: true } as SceneObject) : inShapes
  })
  s.addObjects(made)
  // The camera comes to the outline and the row of pieces: laid out to the right of the outline,
  // the pieces were off screen with the view left where it was.
  const all = [target, ...laid].flat()
  fitCamera({
    min: [Math.min(...all.map((q) => q[0])), Math.min(...all.map((q) => q[1])), 0],
    max: [Math.max(...all.map((q) => q[0])), Math.max(...all.map((q) => q[1])), 0]
  })
  current = { key: partKey(played, p), guide: [...guideIds], lineage: new Set(pieceIds) }
  follow()
  const count = laid.length === 1 ? 'The piece is' : `The ${laid.length} pieces are`
  return `${count} beside the outline in Geometry. Slide and turn them to fill it, then press Check my shape.`
}

/**
 * What this part's pieces make on the drawing now, one corner list per shape, or null when this
 * part's pieces were never laid out (or another part's were laid out since).
 */
export function legoShapesNow(played: Played, p: PlayedPart): V3[][] | null {
  if (!legoLaidOut(played, p) || !current) return null
  const { objects, ev, order } = scene()
  return order.flatMap((id) => {
    if (!current!.lineage.has(id) || objects[id]?.type !== 'polygon') return []
    const c = ev.values.get(id)
    return c?.type === 'polygon' && c.pts.length >= 3 ? [c.pts] : []
  })
}

/**
 * What Check my shape writes as the part's answer: what its pieces make on the drawing now, or,
 * once another part's pieces have taken them away, the answer last checked (`stored`) — writing
 * an empty list there wiped a part already checked right, which the question's own Check keeps.
 * Never laid out and never checked, it is the empty list, which says to lay the pieces out.
 */
export function legoHandIn(played: Played, p: PlayedPart, stored: unknown): string[][] {
  const now = legoShapesNow(played, p)
  if (now) return legoAnswer(now)
  const kept = Array.isArray(stored) && stored.length > 0 && stored.every((row) => Array.isArray(row) && row.every((t) => typeof t === 'string'))
  return kept ? (stored as string[][]) : []
}

/** Forgets the laid-out part (a new scene, the tests). The objects stay where they are. */
export function forgetLegoPart(): void {
  current = null
}
