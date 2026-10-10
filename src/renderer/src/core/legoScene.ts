// REGION L: Geometry Lego — the scene-side helpers behind breakApart and fusePieces. Out of
// core/store.ts (CLEANUP-PLAN.md CW8b); the actions themselves stay in the store.

import { dependentsOf } from './evaluate'
import type { EvalResult, ObjId, PointObj, PolygonObj, SceneObject, SegmentObj } from './types'
import type { Space } from './visibility'
import { newId, nextName } from './naming'
import { doomedBy, sidesOf } from './doomed'
import { themeColor } from '../app/theme'
import type { V3 } from '../math/vec'


/** A polygon that is a piece of a broken-apart shape. */
export type Piece = PolygonObj & { lego: NonNullable<PolygonObj['lego']> }
export const isPiece = (o: SceneObject | undefined): o is Piece => o?.type === 'polygon' && !!o.lego

/** The corners of a polygon as evaluated, or null when it cannot be drawn. */
export function cornersOf(id: ObjId, ev: EvalResult): V3[] | null {
  const c = ev.values.get(id)
  return c?.type === 'polygon' && c.pts.length >= 3 ? c.pts : null
}

/**
 * The corner points of `polygons` that nothing outside `doomed` uses, added to `doomed`. The
 * Polygon tool's own rule ("drop a corner nothing else needs", private to render/tools.ts),
 * applied here after the shape and its sides are already on the list: a corner that is also a
 * corner of a neighbouring triangle, or carries a student's own segment, stays. Repeats until
 * nothing changes, because a corner defined from another corner (a midpoint, say) frees that
 * one only once it is gone itself.
 */
function dropUnusedCorners(polygons: PolygonObj[], objects: Record<ObjId, SceneObject>, doomed: Set<ObjId>): void {
  for (;;) {
    let changed = false
    for (const poly of polygons) {
      for (const pid of poly.points) {
        if (doomed.has(pid) || !objects[pid]) continue
        if ([...dependentsOf(pid, objects)].every((d) => doomed.has(d))) {
          doomed.add(pid)
          changed = true
        }
      }
    }
    if (!changed) return
  }
}

/**
 * A deleted piece takes its corners with it. `doomedBy` keeps a shape's corners because they are
 * the student's points; a piece's corners are not — Break apart made them for the piece — and
 * left behind they sat in the scene (hidden, in a 0.7.0 file), were written into the file and
 * counted as unsaved work. A corner goes only when everything built on it is going too (a
 * segment a student drew between two of them keeps both).
 */
export function dropPieceCorners(doomed: Set<ObjId>, objects: Record<ObjId, SceneObject>): void {
  const pieces = [...doomed].map((id) => objects[id]).filter(isPiece)
  if (pieces.length > 0) dropUnusedCorners(pieces, objects, doomed)
}

/**
 * The rest of a shape's outline, added to `doomed`: segments joining two consecutive corners
 * that are not the shape's `sidesOf`. A shape drawn side by side with the Segment tool is
 * recognised (`closeLoopIfAny`) only after its four segments exist, so they come *before* it in
 * `order` and sidesOf rightly leaves them to a Delete. Break apart and Fuse turn the shape into
 * something else, though, and left behind those segments were the "old frame" still drawn round
 * the pieces (Fix 17). A segment stays when another shape that is staying runs along it too, or
 * when something that is staying is built on it.
 */
function dropFrame(polys: PolygonObj[], objects: Record<ObjId, SceneObject>, order: ObjId[], doomed: Set<ObjId>): void {
  const key = (a: ObjId, b: ObjId) => (a < b ? `${a}|${b}` : `${b}|${a}`)
  const edges = (p: PolygonObj) => p.points.map((a, i) => key(a, p.points[(i + 1) % p.points.length]))
  const going = new Set(polys.flatMap(edges))
  // An edge a staying shape needs drawn: only a shape with no sides of its own (one recognised
  // from loose segments) is drawn by whatever segment runs there. A Triangle-tool shape on the
  // same two corners draws that edge with its own side, and the going shape's copy is surplus.
  const kept = new Set<string>()
  const ownSides = new Set<ObjId>()
  for (const o of Object.values(objects)) {
    if (o.type !== 'polygon' || doomed.has(o.id)) continue
    const sides = sidesOf(o, objects, order)
    if (sides.length === 0) for (const e of edges(o)) kept.add(e)
    for (const sid of sides) ownSides.add(sid)
  }
  for (const o of Object.values(objects)) {
    if (o.type !== 'segment' || doomed.has(o.id) || ownSides.has(o.id)) continue
    const k = key(o.a, o.b)
    if (!going.has(k) || kept.has(k)) continue
    if ([...dependentsOf(o.id, objects)].every((d) => doomed.has(d))) doomed.add(o.id)
  }
}

/**
 * Everything that goes when shapes are broken apart or fused: each shape, whatever was built on
 * it, its sides, the rest of its frame, and its corners once nothing staying needs them.
 */
export function consumeShapes(ids: ObjId[], objects: Record<ObjId, SceneObject>, order: ObjId[]): Set<ObjId> {
  const doomed = doomedBy(ids, objects, order)
  const polys = ids.map((k) => objects[k]).filter((o): o is PolygonObj => o?.type === 'polygon')
  dropFrame(polys, objects, order, doomed)
  dropUnusedCorners(polys, objects, doomed)
  return doomed
}

/**
 * Objects a piece or a fused shape is made of: corner points, the polygon and its sides. A piece
 * (`piece`) has letters of its own like any shape, but its corners and sides are locked: dragging
 * one would bend it, and a piece moves only as one brick. `reserved` names are not handed out —
 * the letters of the shape just broken, so the pieces read as new shapes rather than as the old
 * one's corners come back.
 */
export function makePolygon(
  pts: V3[],
  opts: { color: string; themed?: string; space: Space | undefined; lego?: PolygonObj['lego']; piece: boolean; decomposed?: boolean; label?: string; reserved?: string[] },
  pool: Record<ObjId, SceneObject>
): SceneObject[] {
  const out: SceneObject[] = []
  const take = <T extends SceneObject>(o: T): T => {
    out.push(o)
    pool[o.id] = o
    return o
  }
  const base = { visible: true, locked: false, showLabel: true, space: opts.space, ...(opts.themed ? { themed: opts.themed } : {}) }
  const polyName = nextName('polygon', pool)
  const polyId = newId()
  const corners = pts.map((p) =>
    take<PointObj>({
      ...base,
      id: newId(),
      // Every piece is lettered like any other shape (Fix 17): the hidden helpers named poly2_1
      // that 0.7.0 gave a piece left it with no letters at all, so a student could not say
      // "triangle EFG" or compare two pieces by their corners.
      name: nextName('point', pool, opts.reserved),
      type: 'point',
      def: { kind: 'free', p },
      color: opts.color,
      locked: opts.piece
    })
  )
  const ids = corners.map((c) => c.id)
  take<PolygonObj>({
    ...base,
    id: polyId,
    name: polyName,
    type: 'polygon',
    points: ids,
    fill: true,
    showAngles: false,
    color: opts.color,
    decomposed: opts.decomposed,
    // What the piece was cut as ("Right-angled triangle"); the chip adds its letters.
    label: opts.label,
    lego: opts.lego
  })
  // Sides follow the polygon in `order`, one per side, which is how sidesOf finds them again.
  // A piece's sides are locked: dragging a side moves only its two corners, and a piece must
  // move as one brick or not at all.
  ids.forEach((a, k) =>
    take<SegmentObj>({
      ...base,
      id: newId(),
      name: nextName('segment', pool),
      type: 'segment',
      a,
      b: ids[(k + 1) % ids.length],
      color: opts.color,
      locked: opts.piece
    })
  )
  return out
}

/** The colour of a shape fused into a new outline, from the theme; a test has no stylesheet and keeps the piece's colour. */
export const legoNewColor = (fallback: string): string => (typeof document === 'undefined' ? fallback : themeColor('--lego-new', fallback))

/** Pieces of a shape whose corners changed place between two states of the scene: what the student just dragged. */
export function movedPieces(before: Record<ObjId, SceneObject>, after: Record<ObjId, SceneObject>): Piece[] {
  const out: Piece[] = []
  for (const o of Object.values(after)) {
    if (!isPiece(o) || before[o.id] !== o) continue
    const moved = o.points.some((pid) => {
      const a = before[pid]
      const b = after[pid]
      return a?.type === 'point' && b?.type === 'point' && a.def.kind === 'free' && b.def.kind === 'free' && (a.def.p[0] !== b.def.p[0] || a.def.p[1] !== b.def.p[1])
    })
    if (moved) out.push(o)
  }
  return out
}
