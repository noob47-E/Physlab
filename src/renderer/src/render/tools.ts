// Creation tools: what each tool needs to be clicked, and what it builds.

import { create } from 'zustand'
import { Builder } from '../core/factory'
import { isFree, parentRefs } from '../core/evaluate'
import { scene } from '../core/store'
import type { Computed, EvalResult, ObjId, SceneObject, ToolId } from '../core/types'
import { visibleOrder, type Space } from '../core/visibility'
import { add, type V3 } from '../math/vec'
import { outlineRefusal } from '../math/shape3d'
import { themeColor } from '../app/theme'
import { canIntersect, intersectionsOf } from '../math/intersections'

interface ToolInfo {
  id: ToolId
  label: string
  key: string
  hint: string[]
}

export const TOOLS: ToolInfo[] = [
  { id: 'select', label: 'Move', key: 'V', hint: ['Click to select, or drag a box round several objects. Drag points and vector heads. Hold Space and drag (or right-drag) to pan, scroll to zoom.'] },
  { id: 'sketch', label: 'Sketch', key: 'K', hint: ['Draw a rough shape with the mouse: it becomes a perfect square, rectangle, triangle, circle or line. Hold Alt for no grid snapping.'] },
  { id: 'point', label: 'Point', key: 'P', hint: ['Click anywhere to place a point.'] },
  { id: 'vector', label: 'Vector', key: 'W', hint: ['Drag from tail to head (or click tail, then head).', 'Click where the head should be.'] },
  { id: 'segment', label: 'Segment', key: 'S', hint: ['Click the first point.', 'Click the next point. Right-click or Enter when you are done; Backspace removes the last point; close the loop to make a shape.'] },
  { id: 'line', label: 'Line', key: 'L', hint: ['Click the first point.', 'Click the second point.'] },
  { id: 'ray', label: 'Ray', key: 'R', hint: ['Click the start point.', 'Click a point on the ray.'] },
  { id: 'circle', label: 'Circle', key: 'C', hint: ['Click the centre.', 'Click a point on the circle.'] },
  { id: 'triangle', label: 'Triangle', key: 'T', hint: ['Click vertex 1.', 'Click vertex 2.', 'Click vertex 3.'] },
  { id: 'polygon', label: 'Polygon', key: 'G', hint: ['Click the first corner.', 'Click the next corners. Right-click or Enter to finish (or click the first corner again).'] },
  { id: 'angle', label: 'Angle', key: 'A', hint: ['Click a point on the first arm.', 'Click the vertex.', 'Click a point on the second arm.'] },
  { id: 'distance', label: 'Distance', key: 'D', hint: ['Click the first point.', 'Click the second point to measure the distance.'] },
  { id: 'midpoint', label: 'Midpoint', key: 'M', hint: ['Click two points or a segment.', 'Click the second point.'] },
  { id: 'perpendicular', label: 'Perpendicular', key: '', hint: ['Click a point and a line (any order).', 'Click the other one.'] },
  { id: 'parallel', label: 'Parallel', key: '', hint: ['Click a point and a line (any order).', 'Click the other one.'] },
  { id: 'perpBisector', label: 'Perp. bisector', key: '', hint: ['Click two points or a segment.', 'Click the second point.'] },
  { id: 'angleBisector', label: 'Angle bisector', key: '', hint: ['Click a point on arm 1.', 'Click the vertex.', 'Click a point on arm 2.'] },
  { id: 'intersect', label: 'Intersect', key: 'I', hint: ['Click the first curve, line or circle.', 'Click the second curve, line or circle.'] },
  { id: 'text', label: 'Text', key: '', hint: ['Click where the text should go.'] },
  { id: 'delete', label: 'Delete', key: 'X', hint: ['Click an object to delete it.'] },
  // 3D-3B: Geometry's 3-D row (app/modes.ts tools3d).
  { id: 'plane', label: 'Plane', key: '', hint: ['Click the first point, or the floor.', 'Click the second point.', 'Click the third point: the plane goes through all three.'] },
  { id: 'shape', label: 'Shape', key: '', hint: ['Click a grid point to start the outline.', 'Click the next corner.', 'Click the next corner. Click the first point or press Enter to close; Esc cancels.'] },
  { id: 'solids', label: '3D shapes', key: '', hint: ['Pick a shape in the row under the tools: it stands on the floor, ready to measure.'] },
  { id: 'measure3d', label: 'Measure', key: '', hint: ['Click a solid, a segment, two points, or a point and a plane: the Measure panel works it out.'] },
  { id: 'angle3d', label: 'Angle', key: '', hint: ['Click two lines, a line and a plane, or two planes: the Measure panel works out the angle.'] }
]

/**
 * A tool's label as the shelf's fit estimate (`shelfMode`) should measure it. The shelf keeps a
 * label on one line (shell.css), but the estimate sizes a button by its longest word, so a
 * two-word label is handed over as one word of the same length: "Perp. bisector" is as wide as
 * fourteen letters, not as "bisector" (Fix 7).
 */
export const shelfFitLabel = (id: string): string | undefined => TOOLS.find((t) => t.id === id)?.label.replace(/\s/g, '_')

export interface SnapInfo {
  p: V3
  kind: 'free' | 'grid' | 'point' | 'axis' | 'onObject' | 'intersection' | 'vectorHead'
  pointId?: ObjId
  /** For 'onObject': the line/segment/circle the point should stick to, and where along it. */
  onId?: ObjId
  t?: number
  /** For 'intersection': the two objects that cross there, and which of their crossings this is
   *  (numbered the way `intersectionsOf` numbers them, so the point lands on the same crossing
   *  whenever the scene is worked out again). */
  a?: ObjId
  b?: ObjId
  index?: number
  /** For 'vectorHead': the arrow whose head this is. A point made here is defined by that head, so
   *  it stays on the tip when the arrow is dragged, retyped or laid out again. */
  vectorId?: ObjId
  label?: string
}

/** An arrow's head as a snap target: the arrow, and where its head is in the drawing. */
interface HeadTarget {
  id: ObjId
  head: V3
}

/**
 * The arrows whose heads a click can land on, in drawing order: every arrow drawn and visible in
 * the drawing being looked at. A helper Draw on graph keeps hidden, an arrow "Resultant only"
 * hides and one in another mode's drawing are never targets — a click would join something not on
 * screen. `exclude` is what a drag moves, so a dragged arrow never lands on its own old head.
 * Only heads: a tail snaps as any other spot does.
 */
export function headSnapTargets(objects: Record<ObjId, SceneObject>, order: ObjId[], ev: EvalResult, space: Space | null, exclude?: ReadonlySet<ObjId>): HeadTarget[] {
  const out: HeadTarget[] = []
  for (const id of visibleOrder(order, objects, space)) {
    const c = ev.values.get(id)
    if (c?.type !== 'vector' || !objects[id].visible || exclude?.has(id)) continue
    out.push({ id, head: add(c.tail, c.comp) })
  }
  return out
}

/** Screen distances closer than this are one spot: two heads there differ only in the last bits of a sum. */
const SAME_SPOT_PX = 1e-6

/**
 * Where a click at (x, y) on the canvas lands before a crossing, the grid or a side: the existing
 * point under it (`pointHit`, already within the points' radius) if there is one, else the nearest
 * arrow head within `radiusPx` — the points' own radius, so a tip pulls exactly as a point does. A
 * click a pixel off a lone tip used to make a free point beside it, and an angle measured on that
 * point read 60.15° where the arrows make 60° (V5). Of heads at one spot (B's and R's at the top of
 * a head-to-tail figure) the arrow drawn last wins, as pickAll has it: `heads` is in drawing order.
 */
export function pointOrHeadSnap(
  pointHit: SnapInfo | null,
  heads: readonly (HeadTarget & { screen: { x: number; y: number; visible: boolean } })[],
  x: number,
  y: number,
  radiusPx: number
): SnapInfo | null {
  if (pointHit) return pointHit
  let best: HeadTarget | null = null
  let bestD = radiusPx
  for (const h of heads) {
    if (!h.screen.visible) continue
    const d = Math.hypot(h.screen.x - x, h.screen.y - y)
    if (d > radiusPx || (best && d > bestD + SAME_SPOT_PX)) continue
    best = h
    bestD = Math.min(bestD, d)
  }
  return best ? { p: best.head, kind: 'vectorHead', vectorId: best.id } : null
}

/** Equal but for the last bits a sum or a re-evaluation leaves. */
const sameSpot = (a: V3, b: V3) => a.every((v, k) => Math.abs(v - b[k]) <= 1e-9 * Math.max(1, Math.abs(v)))

/**
 * During a drag, whether a point or head may still be snapped onto: not one that has moved since
 * the drag began, nor one sitting where a dragged free arrow had its head then. Both move with the
 * drag without being built on what is dragged, so `exclude` misses them: the answer R that the
 * Vector Calculator lays out again from a dragged B has its head on B's in a head-to-tail figure,
 * and so has a point on R's head. Snapping onto them held B's head where it already was, and the
 * drag crept along in 12 px jumps. `baseline` is the drawing as the drag found it (core/store.ts
 * beginGesture), `dragged` what the drag moves. A target that keeps still is one as before.
 *
 * The old-head rule is for what moves WITH an arrow only: another arrow's head and a point defined
 * by a head (kind vectorHead). A plain point — free, on an object, a crossing, a midpoint — stays
 * where it is, so an arrow drawn onto F and dragged by its body could not land its tail on F: the
 * hint said "grid" and the tail went to the crossing beside it, where it said "on F" before.
 */
export function stillInDrag(baseline: ReadonlyMap<ObjId, Computed> | null, dragged: ReadonlySet<ObjId>, objects: Record<ObjId, SceneObject>): (id: ObjId, p: V3) => boolean {
  if (!baseline) return () => true
  const at = (c: Computed | undefined): V3 | undefined => (c?.type === 'point' ? c.p : c?.type === 'vector' ? add(c.tail, c.comp) : undefined)
  // Only a free arrow's head moves with it: an arrow between two points ends on its end point,
  // which stays a target while only the start is dragged.
  const oldHeads: V3[] = []
  for (const id of dragged) {
    const o = objects[id]
    const c = baseline.get(id)
    if (o?.type === 'vector' && o.def.kind === 'free' && c?.type === 'vector') oldHeads.push(add(c.tail, c.comp))
  }
  /** A target that follows an arrow about: an arrow's head (the id is the arrow's) or a point on a head. */
  const followsAnArrow = (id: ObjId): boolean => {
    const o = objects[id]
    return o?.type === 'vector' || (o?.type === 'point' && o.def.kind === 'vectorHead')
  }
  return (id, p) => {
    const was = at(baseline.get(id))
    if (was && !sameSpot(was, p)) return false
    return !(followsAnArrow(id) && oldHeads.some((h) => sameSpot(h, p)))
  }
}

/** The box a student drags with the Move tool, in canvas pixels; the corners are whichever way round the drag went. */
export interface Marquee {
  x0: number
  y0: number
  x1: number
  y1: number
}

interface ToolRuntime {
  picks: ObjId[]
  cursor: V3 | null
  /** World position where a vector drag started. */
  dragStart: V3 | null
  firstTail: V3 | null
  /** What the cursor is currently snapped to (for the on-screen marker). */
  snap: SnapInfo | null
  /** Freehand stroke being drawn with the Sketch tool. */
  stroke: V3[]
  /** Points this tool itself created for the drawing in progress. Esc removes these and no others:
   *  it used to remove every unused point it had been clicked on, including ones placed earlier. */
  created: ObjId[]
  /** Sides the Segment tool has drawn in this drawing, oldest first. Its picks hold only the end
   *  the pen is at, so Backspace takes the last of these to step back to the point before. */
  sides: ObjId[]
  /** The selection box being dragged on empty space with the Move tool, or null. */
  marquee: Marquee | null
  /** Why a shape could not be closed, in words, until the next click. */
  notice: string | null
}

export const useTool = create<ToolRuntime>(() => ({ picks: [], cursor: null, dragStart: null, firstTail: null, snap: null, stroke: [], created: [], sides: [], marquee: null, notice: null }))

// The snap marker goes too: a tool that has finished, or been swapped for another, has nothing to
// point at, and the ring used to stay on the last crossing until the mouse moved again.
export const resetTool = () => useTool.setState({ picks: [], dragStart: null, firstTail: null, stroke: [], created: [], sides: [], marquee: null, snap: null, notice: null })

/**
 * Delete the picked points that this drawing made itself (`created`) and nothing ended up using.
 * A point placed before the drawing began is never taken, used or not: Finish and Backspace used
 * to drop any unused pick, so clicking an earlier point and pressing Enter deleted it, and with it
 * a midpoint built on it (W1). A point built on a pick (a midpoint, a crossing) counts as using it.
 */
function dropUnusedPicks(picks: ObjId[], created: readonly ObjId[]): void {
  const s = scene()
  const used = new Set<ObjId>()
  for (const o of Object.values(s.objects)) for (const r of parentRefs(o)) used.add(r)
  const drop = picks.filter((id) => {
    const o = s.objects[id]
    return created.includes(id) && !!o && o.type === 'point' && isFree(o) && !used.has(id)
  })
  if (drop.length) s.removeObjects(drop)
}

/**
 * Close the Shape tool's outline: a real polygon on the working plane. An outline that cannot be
 * closed (under three corners, on one line, crossing itself) is refused in words and stays open,
 * so a corner can be taken back with Backspace.
 */
function closeShape(picks: ObjId[]): boolean {
  const s = scene()
  const pts: V3[] = []
  for (const id of picks) {
    const v = s.ev.values.get(id)
    if (v?.type === 'point') pts.push(v.p)
  }
  const why = outlineRefusal(pts)
  if (why) {
    useTool.setState({ notice: why })
    return true
  }
  const b = new Builder()
  const poly = b.polygon(picks, { withSides: true })
  b.commit()
  resetTool()
  s.select([poly.id])
  s.requestFocus('measure')
  return true
}

/**
 * Finish the drawing in progress: a polygon with at least three corners is built,
 * anything else simply stops. Bound to right-click, Enter and double-click.
 */
export function finishTool(): boolean {
  const s = scene()
  const { picks, created } = useTool.getState()
  if (!picks.length) return false
  if (s.tool === 'shape') return closeShape(picks)
  if (s.tool === 'polygon' && picks.length >= 3) {
    const b = new Builder()
    const poly = b.polygon(picks, { withSides: true })
    b.commit()
    resetTool()
    s.select([poly.id])
    s.requestFocus('measure')
    return true
  }
  resetTool()
  dropUnusedPicks(picks, created)
  return true
}

/** Throw away the unfinished drawing (Esc). */
export function cancelTool(): boolean {
  const { picks, created } = useTool.getState()
  if (!picks.length) return false
  resetTool()
  dropUnusedPicks(picks, created)
  return true
}

/**
 * Step back one point of the drawing in progress (Backspace), touching nothing made before it.
 * The Segment tool used to call the scene's undo here, which reverted whatever was done last —
 * an earlier circle when the drawing had begun on an existing point — and then ended the drawing
 * (W2). Now it takes away its own last side and that side's end point, if the drawing made it, and
 * the pen goes back to the side's start; with no side of its own yet the drawing simply ends.
 */
export function undoLastPick(): boolean {
  const s = scene()
  const { picks, created, sides } = useTool.getState()
  if (!picks.length) return false
  const last = picks[picks.length - 1]
  if (s.tool === 'segment') {
    const sideId = sides[sides.length - 1]
    const side = sideId ? s.objects[sideId] : undefined
    if (side?.type !== 'segment') {
      resetTool()
      dropUnusedPicks([last], created)
      return true
    }
    useTool.setState({ picks: [side.a], sides: sides.slice(0, -1) })
    s.removeObjects([side.id])
    dropUnusedPicks([last], created)
    return true
  }
  useTool.setState({ picks: picks.slice(0, -1) })
  dropUnusedPicks([last], created)
  return true
}

const isLineLike = (c?: Computed) => !!c && (c.type === 'line' || c.type === 'segment' || c.type === 'ray' || c.type === 'vector')
const isCurve = (c?: Computed) => isLineLike(c) || c?.type === 'circle' || c?.type === 'graph'
/** A plane typed as an equation (3D-2), which Measure and Angle read as a plane. */
const isPlaneGraph = (o: SceneObject) => o.type === 'graph' && o.kind === 'plane'

/** Which kinds of object the tool accepts for its next click. */
export function acceptsFor(tool: ToolId, picks: ObjId[]): (o: SceneObject, c: Computed) => boolean {
  const pickTypes = picks.map((id) => scene().ev.values.get(id))
  switch (tool) {
    case 'select':
    case 'delete':
      return () => true
    case 'intersect':
      return (_o, c) => isCurve(c)
    case 'perpendicular':
    case 'parallel':
      if (pickTypes.some((c) => c?.type === 'point')) return (_o, c) => isLineLike(c)
      if (pickTypes.some(isLineLike)) return (_o, c) => c.type === 'point'
      return (_o, c) => c.type === 'point' || isLineLike(c)
    // 3D-3B: Measure takes anything it can measure, Angle what has a direction (a line or a plane).
    case 'measure3d':
      return (_o, c) => c.type === 'point' || isLineLike(c) || c.type === 'plane' || c.type === 'solid' || isPlaneGraph(_o)
    case 'angle3d':
      return (_o, c) => (isLineLike(c) && c.type !== 'vector') || c.type === 'plane' || isPlaneGraph(_o)
    case 'midpoint':
    case 'perpBisector':
      return picks.length === 0 ? (_o, c) => c.type === 'point' || c.type === 'segment' : (_o, c) => c.type === 'point'
    default:
      return (_o, c) => c.type === 'point'
  }
}

/** Point tools create a free point when clicking empty space. */
export function createsPointsOnEmpty(tool: ToolId): boolean {
  return !['select', 'delete', 'intersect', 'perpendicular', 'parallel', 'text', 'vector', 'sketch', 'solids', 'measure3d', 'angle3d'].includes(tool)
}

/**
 * When segments drawn one by one close into a loop (e.g. four sides of a rectangle), turn the loop
 * into a polygon so it is recognised and its area can be shown.
 */
function closeLoopIfAny(newSegmentId: ObjId): void {
  const s = scene()
  const seg = s.objects[newSegmentId]
  if (!seg || seg.type !== 'segment') return
  const adj = new Map<ObjId, ObjId[]>()
  for (const o of Object.values(s.objects)) {
    if (o.type !== 'segment') continue
    ;[
      [o.a, o.b],
      [o.b, o.a]
    ].forEach(([p, q]) => adj.set(p, [...(adj.get(p) ?? []), q]))
  }
  // Shortest path from b back to a without using the new segment directly.
  const prev = new Map<ObjId, ObjId>()
  const queue: ObjId[] = [seg.b]
  const seen = new Set([seg.b])
  while (queue.length) {
    const cur = queue.shift()!
    if (cur === seg.a) break
    for (const nx of adj.get(cur) ?? []) {
      if (seen.has(nx)) continue
      if (cur === seg.b && nx === seg.a) continue
      seen.add(nx)
      prev.set(nx, cur)
      queue.push(nx)
    }
  }
  if (!prev.has(seg.a)) return
  const cycle: ObjId[] = [seg.a]
  let cur = seg.a
  while (cur !== seg.b) {
    cur = prev.get(cur)!
    cycle.push(cur)
  }
  if (cycle.length < 3 || cycle.length > 12) return
  const set = new Set(cycle)
  const exists = Object.values(s.objects).some((o) => o.type === 'polygon' && o.points.length === cycle.length && o.points.every((p) => set.has(p)))
  if (exists) return
  const b = new Builder()
  const poly = b.polygon(cycle)
  b.commit(false)
  s.select([poly.id])
  s.pushLog({ input: 'segments', kind: 'result', text: 'Closed shape recognised. Its name and area are in the Measure tab.' })
  s.requestFocus('measure')
  resetTool()
}

/** Called after each accepted pick. Returns true when the tool finished building. */
export function advanceTool(tool: ToolId, picks: ObjId[]): boolean {
  const s = scene()
  const b = new Builder()
  const vals = picks.map((id) => s.ev.values.get(id))
  const done = () => {
    b.commit()
    resetTool()
    return true
  }
  switch (tool) {
    case 'point':
      resetTool()
      s.select([picks[0]])
      return true
    case 'segment': {
      if (picks.length < 2) return false
      const segObj = b.segment(picks[0], picks[1])
      const { created, sides } = useTool.getState()
      done()
      // Continue drawing from the end point, like a pen (Esc to stop). The drawing is still the
      // same one, so what it made and the sides it drew are kept for Backspace and Esc.
      useTool.setState({ picks: [picks[1]], created, sides: [...sides, segObj.id] })
      closeLoopIfAny(segObj.id)
      return true
    }
    case 'distance':
      if (picks.length < 2) return false
      {
        const seg = b.segment(picks[0], picks[1], { color: themeColor('--accent') })
        seg.labelMode = 'value'
      }
      return done()
    case 'line':
      if (picks.length < 2) return false
      b.line({ kind: 'twoPoints', a: picks[0], b: picks[1] })
      return done()
    case 'ray':
      if (picks.length < 2) return false
      b.ray(picks[0], picks[1])
      return done()
    case 'circle':
      if (picks.length < 2) return false
      b.circle({ kind: 'centerPoint', c: picks[0], p: picks[1] })
      return done()
    case 'triangle':
      if (picks.length < 3) return false
      b.polygon(picks.slice(0, 3), { withSides: true })
      return done()
    case 'polygon': {
      const last = picks[picks.length - 1]
      if (picks.length >= 4 && last === picks[0]) {
        b.polygon(picks.slice(0, -1), { withSides: true })
        return done()
      }
      return false
    }
    case 'shape': {
      if (picks.length < 4 || picks[picks.length - 1] !== picks[0]) return false
      const ring = picks.slice(0, -1)
      // The first corner was clicked again to close: a refused outline keeps its corners, minus that click.
      if (!closeShape(ring)) return false
      if (useTool.getState().notice) useTool.setState({ picks: ring })
      return true
    }
    case 'angle':
      if (picks.length < 3) return false
      b.angle(picks[0], picks[1], picks[2])
      return done()
    case 'plane':
      if (picks.length < 3) return false
      b.plane(picks[0], picks[1], picks[2])
      return done()
    case 'angleBisector':
      if (picks.length < 3) return false
      b.line({ kind: 'angleBisector', a: picks[0], vertex: picks[1], b: picks[2] }, { color: themeColor('--warn') })
      return done()
    case 'midpoint':
    case 'perpBisector': {
      const first = s.objects[picks[0]]
      let a: ObjId | undefined
      let bb: ObjId | undefined
      if (first?.type === 'segment') {
        a = first.a
        bb = first.b
      } else if (picks.length >= 2) {
        a = picks[0]
        bb = picks[1]
      }
      if (!a || !bb) return false
      if (tool === 'midpoint') b.point({ kind: 'midpoint', a, b: bb })
      else b.line({ kind: 'perpBisector', a, b: bb }, { color: themeColor('--warn') })
      return done()
    }
    case 'perpendicular':
    case 'parallel': {
      if (picks.length < 2) return false
      const pi = vals.findIndex((c) => c?.type === 'point')
      const through = picks[pi]
      const line = picks[1 - pi]
      b.line({ kind: tool, through, line } as never, { color: tool === 'perpendicular' ? themeColor('--series-5') : themeColor('--series-6') })
      return done()
    }
    case 'intersect': {
      if (picks.length < 2) return false
      const c0 = vals[0]
      const c1 = vals[1]
      const pts = c0 && c1 && canIntersect(c0, c1) ? intersectionsOf(c0, c1) : []
      if (pts.length > 0) {
        for (let i = 0; i < pts.length; i++) {
          b.point({ kind: 'intersection', a: picks[0], b: picks[1], index: i, approx: pts[i] })
        }
      } else {
        b.point({ kind: 'intersection', a: picks[0], b: picks[1], index: 0 })
        if (vals.some((c) => c?.type === 'circle')) b.point({ kind: 'intersection', a: picks[0], b: picks[1], index: 1 })
      }
      b.commit()
      // Drop intersection points that do not exist (e.g. a line missing a circle).
      const bad = b.created.filter((o) => scene().ev.errors.has(o.id)).map((o) => o.id)
      let notice: string | null = null
      if (bad.length) {
        const firstErr = scene().ev.errors.get(bad[0])
        if (firstErr) notice = firstErr
        scene().removeObjects(bad)
      }
      resetTool()
      if (notice) useTool.setState({ notice })
      return true
    }
  }
  return false
}
