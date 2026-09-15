// Creation tools: what each tool needs to be clicked, and what it builds.

import { create } from 'zustand'
import { Builder } from '../core/factory'
import { scene } from '../core/store'
import type { Computed, ObjId, SceneObject, ToolId } from '../core/types'
import type { V3 } from '../math/vec'

export type Need = 'point' | 'lineLike' | 'curve' | 'any' | 'segmentOrPoint'

export interface ToolInfo {
  id: ToolId
  label: string
  key: string
  hint: string[]
}

export const TOOLS: ToolInfo[] = [
  { id: 'select', label: 'Move', key: 'V', hint: ['Click to select. Drag points and vector heads. Drag empty space to pan, scroll to zoom.'] },
  { id: 'sketch', label: 'Sketch', key: 'K', hint: ['Draw a rough shape with the mouse: it becomes a perfect square, rectangle, triangle, circle or line. Hold Alt for no grid snapping.'] },
  { id: 'point', label: 'Point', key: 'P', hint: ['Click anywhere to place a point.'] },
  { id: 'vector', label: 'Vector', key: 'W', hint: ['Drag from tail to head (or click tail, then head).', 'Click where the head should be.'] },
  { id: 'segment', label: 'Segment', key: 'S', hint: ['Click the first point.', 'Click the next point. Keep clicking to draw connected sides; close the loop to make a shape. Esc to stop.'] },
  { id: 'line', label: 'Line', key: 'L', hint: ['Click the first point.', 'Click the second point.'] },
  { id: 'ray', label: 'Ray', key: 'R', hint: ['Click the start point.', 'Click a point on the ray.'] },
  { id: 'circle', label: 'Circle', key: 'C', hint: ['Click the centre.', 'Click a point on the circle.'] },
  { id: 'triangle', label: 'Triangle', key: 'T', hint: ['Click vertex 1.', 'Click vertex 2.', 'Click vertex 3.'] },
  { id: 'polygon', label: 'Polygon', key: 'G', hint: ['Click the vertices; click the first vertex again to close.'] },
  { id: 'angle', label: 'Angle', key: 'A', hint: ['Click a point on the first arm.', 'Click the vertex.', 'Click a point on the second arm.'] },
  { id: 'distance', label: 'Measure', key: 'D', hint: ['Click the first point.', 'Click the second point to measure the distance.'] },
  { id: 'midpoint', label: 'Midpoint', key: 'M', hint: ['Click two points or a segment.', 'Click the second point.'] },
  { id: 'perpendicular', label: 'Perpendicular', key: '', hint: ['Click a point and a line (any order).', 'Click the other one.'] },
  { id: 'parallel', label: 'Parallel', key: '', hint: ['Click a point and a line (any order).', 'Click the other one.'] },
  { id: 'perpBisector', label: 'Perp. bisector', key: '', hint: ['Click two points or a segment.', 'Click the second point.'] },
  { id: 'angleBisector', label: 'Angle bisector', key: '', hint: ['Click a point on arm 1.', 'Click the vertex.', 'Click a point on arm 2.'] },
  { id: 'intersect', label: 'Intersect', key: 'I', hint: ['Click the first line or circle.', 'Click the second line or circle.'] },
  { id: 'text', label: 'Text', key: '', hint: ['Click where the text should go.'] },
  { id: 'delete', label: 'Delete', key: 'X', hint: ['Click an object to delete it.'] }
]

export interface SnapInfo {
  p: V3
  kind: 'free' | 'grid' | 'point' | 'axis'
  pointId?: ObjId
  label?: string
}

export interface ToolRuntime {
  picks: ObjId[]
  cursor: V3 | null
  /** World position where a vector drag started. */
  dragStart: V3 | null
  firstTail: V3 | null
  /** What the cursor is currently snapped to (for the on-screen marker). */
  snap: SnapInfo | null
  /** Freehand stroke being drawn with the Sketch tool. */
  stroke: V3[]
}

export const useTool = create<ToolRuntime>(() => ({ picks: [], cursor: null, dragStart: null, firstTail: null, snap: null, stroke: [] }))

export const resetTool = () => useTool.setState({ picks: [], dragStart: null, firstTail: null, stroke: [] })

const isLineLike = (c?: Computed) => !!c && (c.type === 'line' || c.type === 'segment' || c.type === 'ray' || c.type === 'vector')
const isCurve = (c?: Computed) => isLineLike(c) || c?.type === 'circle'

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
    case 'midpoint':
    case 'perpBisector':
      return picks.length === 0 ? (_o, c) => c.type === 'point' || c.type === 'segment' : (_o, c) => c.type === 'point'
    default:
      return (_o, c) => c.type === 'point'
  }
}

/** Point tools create a free point when clicking empty space. */
export function createsPointsOnEmpty(tool: ToolId): boolean {
  return !['select', 'delete', 'intersect', 'perpendicular', 'parallel', 'text', 'vector', 'sketch'].includes(tool)
}

/**
 * When segments drawn one by one close into a loop (e.g. four sides of a rectangle), turn the loop
 * into a polygon so it is recognised and its area can be shown.
 */
export function closeLoopIfAny(newSegmentId: ObjId): void {
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
      done()
      // Continue drawing from the end point, like a pen (Esc to stop).
      useTool.setState({ picks: [picks[1]] })
      closeLoopIfAny(segObj.id)
      return true
    }
    case 'distance':
      if (picks.length < 2) return false
      {
        const seg = b.segment(picks[0], picks[1], { color: '#74c0fc' })
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
    case 'angle':
      if (picks.length < 3) return false
      b.angle(picks[0], picks[1], picks[2])
      return done()
    case 'angleBisector':
      if (picks.length < 3) return false
      b.line({ kind: 'angleBisector', a: picks[0], vertex: picks[1], b: picks[2] }, { color: '#ffa94d' })
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
      else b.line({ kind: 'perpBisector', a, b: bb }, { color: '#ffa94d' })
      return done()
    }
    case 'perpendicular':
    case 'parallel': {
      if (picks.length < 2) return false
      const pi = vals.findIndex((c) => c?.type === 'point')
      const through = picks[pi]
      const line = picks[1 - pi]
      b.line({ kind: tool, through, line } as never, { color: tool === 'perpendicular' ? '#e599f7' : '#66d9e8' })
      return done()
    }
    case 'intersect': {
      if (picks.length < 2) return false
      b.point({ kind: 'intersection', a: picks[0], b: picks[1], index: 0 })
      if (vals.some((c) => c?.type === 'circle')) b.point({ kind: 'intersection', a: picks[0], b: picks[1], index: 1 })
      b.commit()
      // Drop intersection points that do not exist (e.g. a line missing a circle).
      const bad = b.created.filter((o) => scene().ev.errors.has(o.id)).map((o) => o.id)
      if (bad.length) scene().removeObjects(bad)
      resetTool()
      return true
    }
  }
  return false
}
