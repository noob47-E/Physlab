import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { FatLine } from './FatLine'
import { niceStep, screenToPlane, toScreen, worldPerPixel, XY_PLANE } from './cameraUtils'
import { labelAnchors, overlay, showTip } from './overlay'
import { CURVE_PICK_PX, pickAll, pickAt, type Hit } from './picking'
import { acceptsFor, advanceTool, createsPointsOnEmpty, finishTool, resetTool, useTool, type Marquee, type SnapInfo } from './tools'
import { marqueeStarted, mergeSelection, normalizeRect, objectInRect, rightDragPanned, type S2 } from './selectMath'
import { menuForBackground, menuForObject } from '../app/contextActions'
import { isSpaceHeld, markSpaceUsed } from './panKey'
import { drag3D } from './viewMath'
import { useTurnMode } from './viewState'
import { showContextMenu } from '../ui/ContextMenu'
import { Arrow } from './ObjectViews'
import { Builder } from '../core/factory'
import { asGLine, dependentsOf, isFree, parentRefs } from '../core/evaluate'
import { intersectionsOf } from '../math/intersections'
import { scene, useScene } from '../core/store'
import type { Computed, ObjId, SceneObject } from '../core/types'
import { add, dist, dot, heading, len, normalize, scale, sub, type V3 } from '../math/vec'
import { formatMeasure } from '../math/format'
import { recognizeStroke } from '../math/shapes'
import { visibleOrder } from '../core/visibility'
import { minorStepOf, normaliseGridStyle, sketchSnap, snapStep, snapToGrid, styleFor3D } from './gridMath'
import { legoSnap, pieceSnapTolerance, slideAlong } from '../math/lego'
import { themeColor, useThemed } from '../app/theme'

interface DragState {
  hit: Hit
  plane: THREE.Plane
  startWorld: V3
  /** Original positions of free points / vector tails we are translating. */
  starts: Map<ObjId, V3>
  startComp?: V3
  startTail?: V3
  moved: boolean
  /** Objects that must not be snapped onto (the dragged object and its parents). */
  exclude: Set<ObjId>
}

const SNAP_POINT_PX = 12
const SNAP_GRID_PX = 9
const SNAP_AXIS_PX = 6
/** How far from a line or circle the cursor may be for it to count towards a crossing. */
const SNAP_CURVE_PX = 12

/** A line, segment, ray, vector or circle: something that can cross something else. */
const isCurve = (c: Computed) => !!asGLine(c) || c.type === 'circle'

/**
 * The positions that decide whether a selection box takes an object: the whole of what defines
 * it has to be inside (see `objectInRect`). A graph has no geometry of its own here, so its label
 * anchor stands for it; a number has nowhere on the drawing at all.
 */
function keyPoints(id: ObjId, c: Computed): V3[] {
  switch (c.type) {
    case 'point':
    case 'text':
      return [c.p]
    case 'vector':
      return [c.tail, add(c.tail, c.comp)]
    case 'segment':
    case 'ray':
    case 'line':
      return [c.line.p, add(c.line.p, c.line.d)]
    case 'circle':
      return [c.circle.c]
    case 'polygon':
      return c.pts
    case 'angle':
      return [c.vertex]
    case 'graph': {
      const a = labelAnchors.get(id)
      return a ? [a.p] : []
    }
    case 'number':
      return []
  }
}

/** Rounds an angle to 15° steps (Shift while drawing). */
function constrainAngle(from: V3, to: V3): V3 {
  const d = sub(to, from)
  const L = Math.hypot(d[0], d[1])
  const a = Math.round(Math.atan2(d[1], d[0]) / (Math.PI / 12)) * (Math.PI / 12)
  return [from[0] + L * Math.cos(a), from[1] + L * Math.sin(a), to[2]]
}

export function Interaction() {
  const { camera, size, controls } = useThree()
  const drag = useRef<DragState | null>(null)
  const down = useRef<{ x: number; y: number; world: V3 | null; hit: Hit | null } | null>(null)
  const sketch = useRef<{ world: V3[]; lastX: number; lastY: number } | null>(null)
  // A selection box in progress: where the left button went down on empty space with the Move tool.
  const box = useRef<{ x0: number; y0: number } | null>(null)
  // Where the right button went down on the canvas, so the contextmenu event that follows can
  // tell a right-drag pan from a right-click (see rightDragPanned).
  const rightDown = useRef<{ x: number; y: number } | null>(null)
  // The existing point a vector drag or first click started on, so a vector drawn from one
  // point to another is tied to them and follows when either point moves.
  const vectorTail = useRef<{ down: ObjId | null; first: ObjId | null }>({ down: null, first: null })
  const ctxRef = useRef({ camera, size, controls })
  ctxRef.current = { camera, size, controls }

  useEffect(() => {
    const host = overlay.canvasHost
    if (!host) return

    const local = (e: { clientX: number; clientY: number }) => {
      const r = host.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const pickCtx = () => {
      const s = scene()
      // Only what is on screen can be picked: the other drawings are not there.
      return { camera: ctxRef.current.camera, size: ctxRef.current.size, objects: s.objects, order: visibleOrder(s.order, s.objects, s.activeSpace), ev: s.ev }
    }
    const setControls = (enabled: boolean) => {
      const c = ctxRef.current.controls as unknown as { enabled: boolean } | null
      if (c) c.enabled = enabled
    }
    /** The grid as it is drawn at the current zoom: its style and its major and minor steps, by the same rules `Grid2D` and `Grid3D` build it. */
    const gridNow = () => {
      const { camera: cam, size: sz } = ctxRef.current
      const s = scene()
      const style = normaliseGridStyle(s.settings.gridStyle)
      if (s.viewMode === '2d') {
        const major = niceStep(100 * worldPerPixel(cam, sz))
        return { style, major, minor: minorStepOf(major) }
      }
      const step = niceStep(cam.position.length() / 12)
      return { style: styleFor3D(style), major: step * 2, minor: step / 2 }
    }
    /** The step a point snaps to at the current zoom: the minor grid step, halved with the Fine style, the same rule the grid is drawn by. */
    const gridStep = () => {
      const g = gridNow()
      return snapStep(g.minor, g.style)
    }
    const worldOn = (x: number, y: number, plane: THREE.Plane = XY_PLANE) => screenToPlane(ctxRef.current.camera, ctxRef.current.size, x, y, plane)
    const scr = (p: V3) => toScreen(ctxRef.current.camera, ctxRef.current.size, p)

    /**
     * Magnetic snapping: jumps to an existing point, a grid crossing or an axis only when the cursor
     * is close to it on screen; otherwise the position stays where the mouse is. Alt turns snapping off.
     */
    const snapAt = (x: number, y: number, plane: THREE.Plane, alt: boolean, exclude?: Set<ObjId>): SnapInfo | null => {
      const w = worldOn(x, y, plane)
      if (!w) return null
      const s = scene()
      const step = gridStep()
      const tidy = (v: number) => Math.round(v / (step / 20)) * (step / 20)
      if (alt || !s.settings.snap) return { p: [tidy(w[0]), tidy(w[1]), w[2]], kind: 'free' }
      const hit = pickAt(pickCtx(), x, y, (o, c) => c.type === 'point' && !exclude?.has(o.id))
      if (hit && hit.dist <= SNAP_POINT_PX) {
        const c = s.ev.values.get(hit.id)
        if (c?.type === 'point') return { p: c.p, kind: 'point', pointId: hit.id, label: s.objects[hit.id]?.name }
      }
      // Where two lines or circles cross. A point placed here is defined by the crossing, so it
      // follows when either parent moves; before this a student had to aim at a crossing by eye
      // and got a free point that stayed behind. Tried before the grid, because a crossing that
      // happens to sit near a grid line used to lose to the grid.
      const crossing = crossingNear(x, y, exclude)
      if (crossing) return crossing
      // The nearest crossing of whatever grid is drawn: a circle and a ray, a lattice point, a
      // hexagon's centre or corner — not always a multiple of the step on each axis.
      const grid = gridNow()
      const g = snapToGrid(grid.style, w, grid.major, grid.minor)
      const gs = scr(g)
      if (Math.hypot(gs.x - x, gs.y - y) <= SNAP_GRID_PX) return { p: g, kind: 'grid' }
      // On a side or a circle: the new point sticks to it and slides along it.
      const onHit = pickAt(pickCtx(), x, y, (o, c) => !exclude?.has(o.id) && (c.type === 'segment' || c.type === 'ray' || c.type === 'line' || c.type === 'circle'))
      if (onHit && onHit.dist <= SNAP_POINT_PX) {
        const c = s.ev.values.get(onHit.id)
        const name = s.objects[onHit.id]?.name
        if (c?.type === 'circle') {
          const dir = normalize(sub(w, c.circle.c))
          const p = add(c.circle.c, scale(dir, c.circle.r))
          const t = (Math.atan2(dir[1], dir[0]) + 2 * Math.PI) / (2 * Math.PI)
          return { p, kind: 'onObject', onId: onHit.id, t: t % 1, label: `on ${name}` }
        }
        if (c?.type === 'segment' || c?.type === 'ray' || c?.type === 'line') {
          const dd = dot(c.line.d, c.line.d)
          let t = dd > 1e-12 ? dot(sub(w, c.line.p), c.line.d) / dd : 0
          if (c.type === 'segment') t = Math.max(0, Math.min(1, t))
          if (c.type === 'ray') t = Math.max(0, t)
          return { p: add(c.line.p, scale(c.line.d, t)), kind: 'onObject', onId: onHit.id, t, label: `on ${name}` }
        }
      }
      if (s.viewMode === '2d') {
        const onX = Math.abs(scr([w[0], 0, 0]).y - y) <= SNAP_AXIS_PX
        const onY = Math.abs(scr([0, w[1], 0]).x - x) <= SNAP_AXIS_PX
        if (onX || onY) return { p: [onY ? 0 : tidy(w[0]), onX ? 0 : tidy(w[1]), w[2]], kind: 'axis' }
      }
      return { p: [tidy(w[0]), tidy(w[1]), w[2]], kind: 'free' }
    }

    /** The nearest crossing of two curves under the cursor, within `SNAP_POINT_PX`, or null. */
    const crossingNear = (x: number, y: number, exclude?: Set<ObjId>): SnapInfo | null => {
      const s = scene()
      // Each curve's own reach, widened so that both lines of a crossing are found when the
      // cursor is near the crossing rather than exactly on both.
      const curves = pickAll(pickCtx(), x, y, (o, c) => !exclude?.has(o.id) && isCurve(c), SNAP_CURVE_PX - CURVE_PICK_PX)
      if (curves.length < 2) return null
      let best: SnapInfo | null = null
      let bestD = SNAP_POINT_PX
      for (let i = 0; i < curves.length; i++) {
        for (let j = i + 1; j < curves.length; j++) {
          const a = curves[i].id
          const b = curves[j].id
          const ca = s.ev.values.get(a)
          const cb = s.ev.values.get(b)
          if (!ca || !cb) continue
          // Numbered by intersectionsOf, which is what the evaluator uses to place the point later.
          intersectionsOf(ca, cb).forEach((p, index) => {
            const sp = scr(p)
            const d = Math.hypot(sp.x - x, sp.y - y)
            if (!sp.visible || d >= bestD) return
            bestD = d
            best = { p, kind: 'intersection', a, b, index, label: `${s.objects[a]?.name} ∩ ${s.objects[b]?.name}` }
          })
        }
      }
      return best
    }

    const fmtL = (v: number) => formatMeasure(v, 'length', scene().settings)
    const fmtA = (r: number) => formatMeasure(r, 'angle', scene().settings)
    const coordText = (p: V3) => `(${[p[0], p[1]].map((v) => fmtL(v).replace(/ \S+$/, '')).join(', ')})`
    const snapNote = (sn: SnapInfo) =>
      sn.kind === 'point' ? `  • on ${sn.label}` : sn.kind === 'onObject' || sn.kind === 'intersection' ? `  • ${sn.label}` : sn.kind === 'grid' ? '  • grid' : sn.kind === 'axis' ? '  • axis' : ''

    /** Existing point under the cursor (snapped), or a new free point there. */
    const pointAt = (x: number, y: number, alt: boolean): ObjId | null => {
      const sn = snapAt(x, y, XY_PLANE, alt)
      if (!sn) return null
      if (sn.pointId) return sn.pointId
      const b = new Builder()
      // A point placed on a side belongs to it and slides along it afterwards; one placed on a
      // crossing belongs to both lines and stays on the crossing when they move.
      const p =
        sn.kind === 'intersection' && sn.a && sn.b && sn.index !== undefined
          ? b.point({ kind: 'intersection', a: sn.a, b: sn.b, index: sn.index })
          : sn.kind === 'onObject' && sn.onId
            ? b.point({ kind: 'onObject', on: sn.onId, t: sn.t ?? 0 })
            : b.point(sn.p)
      b.commit(false)
      // Remember that the tool made this point, so Esc may take it away again — and only this.
      useTool.setState((t) => ({ created: [...t.created, p.id] }))
      return p.id
    }

    const onDown = (e: PointerEvent) => {
      // The buttons floating over the drawing — 2D/3D, grid, snap, the label choices — live inside
      // the same container this listener is attached to, and it listens in the capture phase, so a
      // click on one of them used to reach the canvas as well: pressing "Always" with a drawing
      // tool selected dropped a point behind the button. Only the canvas draws.
      if (!(e.target instanceof HTMLCanvasElement)) {
        rightDown.current = null
        return
      }
      // The camera controls own the right button (a pan in 2D, a turn in 3D); this only
      // remembers where it started.
      if (e.button === 2) {
        rightDown.current = local(e)
        return
      }
      if (e.button !== 0) return
      const { x, y } = local(e)
      const s = scene()
      const tool = s.tool
      const accept = acceptsFor(tool, useTool.getState().picks)
      const hit = pickAt(pickCtx(), x, y, tool === 'select' ? undefined : accept)
      down.current = { x, y, world: worldOn(x, y), hit }

      // In 3D one rule (drag3D) says whether this press turns or slides the view or belongs to the
      // tool. The left button's camera action is set here, per press, because only this listener
      // knows the tool and what is under the cursor; it runs in the capture phase, before
      // OrbitControls reads the button. Shift and Ctrl are left to OrbitControls, which swaps.
      if (s.viewMode === '3d') {
        const act = drag3D({ button: 0, tool, onObject: !!hit, spaceHeld: isSpaceHeld(), turnMode: useTurnMode.getState().on })
        if (act !== 'tool') {
          const c = ctxRef.current.controls as unknown as { enabled: boolean; mouseButtons?: { LEFT: THREE.MOUSE } } | null
          if (c) {
            c.enabled = true
            if (c.mouseButtons) c.mouseButtons.LEFT = act === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE
          }
          if (tool === 'select' && !hit && !e.shiftKey) s.select([])
          markSpaceUsed()
          down.current = null
          return
        }
      }

      if (tool === 'select') {
        if (!hit) {
          if (!e.shiftKey) s.select([])
          // Empty space. With Space held the camera pans; otherwise the drag draws a selection box.
          if (isSpaceHeld()) {
            markSpaceUsed()
            return
          }
          setControls(false)
          box.current = { x0: x, y0: y }
          return
        }
        setControls(false)
        if (e.shiftKey) s.select([hit.id], true)
        else if (!s.selection.includes(hit.id)) s.select([hit.id])
        startDrag(hit)
        return
      }
      // Creation tools own the left button.
      setControls(false)
      if (tool === 'sketch') {
        const w = worldOn(x, y)
        sketch.current = w ? { world: [w], lastX: x, lastY: y } : null
        useTool.setState({ stroke: w ? [w] : [] })
        return
      }
      if (tool === 'vector') {
        const sn = snapAt(x, y, XY_PLANE, e.altKey)
        vectorTail.current.down = sn?.pointId ?? null
        useTool.setState({ dragStart: sn ? sn.p : null })
      }
    }

    const startDrag = (hit: Hit) => {
      const s = scene()
      const o = s.objects[hit.id]
      const c = s.ev.values.get(hit.id)
      if (!o || !c || o.locked) return
      const cam = ctxRef.current.camera
      let anchor: V3 = [0, 0, 0]
      if (c.type === 'point' || c.type === 'text') anchor = c.p
      else if (c.type === 'vector') anchor = hit.part === 'head' ? add(c.tail, c.comp) : c.tail
      let plane: THREE.Plane
      if (s.viewMode === '2d') plane = XY_PLANE
      else {
        plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -anchor[2])
        const view = new THREE.Vector3()
        cam.getWorldDirection(view)
        if (Math.abs(view.z) < 0.15) plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(view.x, view.y, 0).normalize(), new THREE.Vector3(...anchor))
      }
      const starts = new Map<ObjId, V3>()
      collectFreePoints(o, s.objects, starts)
      // Nothing that moves with the drag may be snapped onto: the object, the points it is
      // moved by, and everything built on those. A dragged corner used to snap onto its own
      // side, which moved away as it did.
      const exclude = new Set<ObjId>([o.id, ...starts.keys()])
      for (const id of [...exclude]) for (const d of dependentsOf(id, s.objects)) exclude.add(d)
      drag.current = {
        hit,
        plane,
        startWorld: down.current?.world ?? anchor,
        starts,
        startComp: c.type === 'vector' ? c.comp : undefined,
        startTail: c.type === 'vector' ? c.tail : undefined,
        moved: false,
        exclude
      }
    }

    const onMove = (e: PointerEvent) => {
      const { x, y } = local(e)
      const s = scene()
      const inside = x >= 0 && y >= 0 && x <= host.clientWidth && y <= host.clientHeight

      if (sketch.current) {
        const sk = sketch.current
        if (Math.hypot(x - sk.lastX, y - sk.lastY) >= 2) {
          const w = worldOn(x, y)
          if (w) {
            sk.world.push(w)
            sk.lastX = x
            sk.lastY = y
            useTool.setState({ stroke: [...sk.world] })
          }
        }
        return
      }

      const bx = box.current
      if (bx) {
        const m: Marquee = { x0: bx.x0, y0: bx.y0, x1: x, y1: y }
        // A few pixels of wobble on a click is not a box.
        useTool.setState({ marquee: marqueeStarted(m) ? m : null })
        return
      }

      const d = drag.current
      if (d) {
        if (!d.moved) {
          if (down.current && Math.hypot(x - down.current.x, y - down.current.y) < 3) return
          d.moved = true
          s.beginGesture()
        }
        applyDrag(d, x, y, e)
        return
      }

      if (!inside) {
        showTip(null)
        useTool.setState({ cursor: null, snap: null })
        return
      }
      const sn = snapAt(x, y, XY_PLANE, e.altKey)
      const t = useTool.getState()
      let cursor = sn?.p ?? null
      // Shift draws at 15° steps from the previous point.
      const anchorPt = s.tool === 'vector' ? t.dragStart ?? t.firstTail : lastPickPoint()
      if (cursor && e.shiftKey && anchorPt && s.viewMode === '2d') cursor = constrainAngle(anchorPt, cursor)
      useTool.setState({ cursor, snap: s.tool === 'select' || !sn || sn.kind === 'free' ? null : sn })

      if (s.tool !== 'select' && s.tool !== 'sketch' && cursor && sn) {
        let text = coordText(cursor)
        if (anchorPt && ['vector', 'segment', 'line', 'ray', 'distance', 'triangle', 'polygon', 'angle'].includes(s.tool)) {
          const dv = sub(cursor, anchorPt)
          text = `${s.tool === 'vector' ? '|v| = ' : 'length = '}${fmtL(len(dv))}   θ = ${fmtA(heading(dv))}`
          if (s.tool === 'vector') text += `   (${fmtL(dv[0]).replace(/ \S+$/, '')}, ${fmtL(dv[1]).replace(/ \S+$/, '')})`
        } else if (anchorPt && s.tool === 'circle') text = `r = ${fmtL(dist(anchorPt, cursor))}`
        showTip(text + snapNote(sn), x, y)
      } else showTip(null)

      if (e.buttons === 0 || s.tool !== 'select') {
        const hit = s.tool === 'sketch' ? null : pickAt(pickCtx(), x, y, s.tool === 'select' ? undefined : acceptsFor(s.tool, t.picks))
        s.setHovered(hit?.id ?? null)
        host.style.cursor = hit ? (s.tool === 'select' ? (isDraggable(hit) ? 'grab' : 'pointer') : 'pointer') : s.tool === 'select' ? '' : 'crosshair'
      }
    }

    /** Everything on this drawing that the box holds whole. */
    const idsInRect = (m: Marquee): ObjId[] => {
      const rect = normalizeRect(m)
      const s = scene()
      const out: ObjId[] = []
      for (const id of visibleOrder(s.order, s.objects, s.activeSpace)) {
        const o = s.objects[id]
        const c = s.ev.values.get(id)
        if (!o || !c || !o.visible) continue
        const pts = keyPoints(id, c).map(scr)
        if (!pts.every((p) => p.visible)) continue
        if (objectInRect(o.type, pts as S2[], rect)) out.push(id)
      }
      return out
    }

    const lastPickPoint = (): V3 | null => {
      const picks = useTool.getState().picks
      const last = picks[picks.length - 1]
      const c = last ? scene().ev.values.get(last) : undefined
      return c?.type === 'point' ? c.p : null
    }

    const isDraggable = (hit: Hit) => {
      const o = scene().objects[hit.id]
      if (!o) return false
      if (isFree(o)) return true
      // Points that live on a side slide along it.
      if (o.type === 'point' && o.def.kind === 'onObject') return true
      const m = new Map<ObjId, V3>()
      collectFreePoints(o, scene().objects, m)
      return m.size > 0
    }

    const applyDrag = (d: DragState, x: number, y: number, e: PointerEvent) => {
      const s = scene()
      const o = s.objects[d.hit.id]
      if (!o) return
      const sn = snapAt(x, y, d.plane, e.altKey, d.exclude)
      if (!sn) return
      const w = sn.p
      host.style.cursor = 'grabbing'
      if (o.type === 'vector' && o.def.kind === 'free') {
        if (d.hit.part === 'head') {
          const tail = d.startTail!
          const head = e.shiftKey && s.viewMode === '2d' ? constrainAngle(tail, w) : w
          const comp = sub(head, tail)
          s.updateObject(o.id, (dr) => {
            if (dr.type === 'vector' && dr.def.kind === 'free') dr.def.comp = comp
          }, false)
          showTip(`|${o.name}| = ${fmtL(len(comp))}   θ = ${fmtA(heading(comp))}${snapNote(sn)}`, x, y)
        } else {
          const raw = worldOn(x, y, d.plane)
          const delta = sub(raw ?? w, d.startWorld)
          let tail = add(d.startTail!, delta)
          const tsn = snapNear(tail, e.altKey, d.exclude)
          tail = tsn.p
          s.updateObject(o.id, (dr) => {
            if (dr.type === 'vector' && dr.def.kind === 'free') dr.def.tail = tail
          }, false)
          showTip(`tail ${coordText(tail)}${snapNote(tsn)}`, x, y)
        }
        return
      }
      if (o.type === 'vector' && o.def.kind === 'points') {
        const target = d.hit.part === 'head' ? o.def.b : d.hit.part === 'tail' ? o.def.a : null
        if (target && isFree(s.objects[target])) {
          s.updateObject(target, (dr) => {
            if (dr.type === 'point' && dr.def.kind === 'free') dr.def.p = w
          }, false)
          showTip(coordText(w) + snapNote(sn), x, y)
          return
        }
      }
      // A point that lives on a side or circle slides along it instead of moving freely.
      if (o.type === 'point' && o.def.kind === 'onObject') {
        const host2 = s.ev.values.get(o.def.on)
        const raw = worldOn(x, y, d.plane) ?? w
        let t = o.def.t
        if (host2?.type === 'circle') {
          const a = Math.atan2(raw[1] - host2.circle.c[1], raw[0] - host2.circle.c[0])
          t = ((a + 2 * Math.PI) / (2 * Math.PI)) % 1
        } else if (host2?.type === 'segment' || host2?.type === 'ray' || host2?.type === 'line') {
          const dd = dot(host2.line.d, host2.line.d)
          t = dd > 1e-12 ? dot(sub(raw, host2.line.p), host2.line.d) / dd : 0
          if (host2.type === 'segment') t = Math.max(0, Math.min(1, t))
          if (host2.type === 'ray') t = Math.max(0, t)
        }
        s.updateObject(o.id, (dr) => {
          if (dr.type === 'point' && dr.def.kind === 'onObject') dr.def.t = t
        }, false)
        const now = scene().ev.values.get(o.id)
        showTip(`${o.name} ${now?.type === 'point' ? coordText(now.p) : ''} on ${s.objects[o.def.on]?.name ?? ''}`, x, y)
        return
      }
      if (o.type === 'point' && o.def.kind === 'free') {
        s.updateObject(o.id, (dr) => {
          if (dr.type === 'point' && dr.def.kind === 'free') dr.def.p = w
        }, false)
        showTip(`${o.name} ${coordText(w)}${snapNote(sn)}`, x, y)
        return
      }
      if (o.type === 'text') {
        s.updateObject(o.id, (dr) => {
          if (dr.type === 'text') dr.p = w
        }, false)
        return
      }
      // Translate every free defining point together (segments, polygons, circles…),
      // snapping the whole shape by its first corner so it lands neatly on the grid.
      const raw = worldOn(x, y, d.plane) ?? w
      let delta = sub(raw, d.startWorld)
      // REGION L2: a Lego piece is pulled onto a piece of the same shape the moment a corner
      // comes within 12 px of a neighbour's corner or side, before the grid gets a say — a
      // neighbour is what the student is aiming at, and the grid used to pull the piece a few
      // pixels off it. Alt turns this off like every other snap. The corners are the piece's
      // own free points, taken where they stood when the drag began.
      let met: 'corner' | 'edge' | 'none' = 'none'
      let along: V3 | null = null
      if (o.type === 'polygon' && o.lego && !e.altKey) {
        const source = o.lego.sourceId
        const own = o.points.map((pid) => d.starts.get(pid)).filter((p): p is V3 => !!p)
        const neighbours = Object.values(s.objects).flatMap((n) => {
          if (n.type !== 'polygon' || !n.lego || n.id === o.id || n.lego.sourceId !== source) return []
          const c = s.ev.values.get(n.id)
          return c?.type === 'polygon' ? [c.pts] : []
        })
        const tol = pieceSnapTolerance(worldPerPixel(ctxRef.current.camera, ctxRef.current.size))
        const pull = legoSnap(own, delta, neighbours, tol)
        met = pull.how
        delta = pull.delta
        if (pull.how === 'edge') along = pull.along
      }
      const first = d.starts.values().next().value as V3 | undefined
      if (met === 'none' && first) {
        const target = snapNear(add(first, delta), e.altKey, d.exclude)
        delta = sub(target.p, first)
      } else if (met === 'edge' && along && first) {
        // Glued to a neighbour's side, the piece is still free to run along it — and along it
        // the grid keeps its say, so a piece let go part-way down a side lands on a grid line
        // (or a tidy step) as a plain move would, not at y = −0.457967552. Only the part of the
        // grid's pull that runs along the side is taken; across the side the fit stays exact.
        const target = snapNear(add(first, delta), e.altKey, d.exclude)
        delta = slideAlong(delta, along, sub(sub(target.p, first), delta))
      }
      for (const [pid, p0] of d.starts) {
        s.updateObject(pid, (dr) => {
          if (dr.type === 'point' && dr.def.kind === 'free') dr.def.p = add(p0, delta)
          if (dr.type === 'vector' && dr.def.kind === 'free') dr.def.tail = add(p0, delta)
        }, false)
      }
      showTip(`move ${coordText(delta)}${met === 'corner' ? '  • corner to corner' : met === 'edge' ? '  • side to side' : ''}`, x, y)
    }

    /** Snap a world position (not the cursor) using the same magnetic rules. */
    const snapNear = (p: V3, alt: boolean, exclude?: Set<ObjId>): SnapInfo => {
      const sp = scr(p)
      return snapAt(sp.x, sp.y, new THREE.Plane(new THREE.Vector3(0, 0, 1), -p[2]), alt, exclude) ?? { p, kind: 'free' }
    }

    const finishSketch = () => {
      const sk = sketch.current
      sketch.current = null
      useTool.setState({ stroke: [] })
      setControls(true)
      if (!sk || sk.world.length < 4) return
      const s = scene()
      // The grid's own points, not a square step: on isometric paper a sketched triangle's corners
      // used to land on square-grid points that were not drawn.
      const g = gridNow()
      const result = recognizeStroke(sk.world, s.settings.snap ? sketchSnap(g.style, g.major, g.minor) : { gridStep: 0 })
      const b = new Builder()
      let primary: SceneObject | undefined
      if (result.kind === 'none') {
        s.pushLog({ input: 'sketch', kind: 'info', text: result.reason })
        const last = scr(sk.world[sk.world.length - 1])
        showTip(result.reason, last.x, last.y)
        setTimeout(() => showTip(null), 2500)
        return
      }
      if (result.kind === 'segment') {
        const a = b.point(result.a)
        const p = b.point(result.b)
        primary = b.segment(a.id, p.id)
        s.pushLog({ input: 'sketch', kind: 'result', text: `Recognised a straight line, length ${fmtL(dist(result.a, result.b))}.` })
      } else if (result.kind === 'circle') {
        const c = b.point(result.center)
        const edge = b.point([result.center[0] + result.r, result.center[1], 0], { auxiliary: false })
        primary = b.circle({ kind: 'centerPoint', c: c.id, p: edge.id })
        s.pushLog({ input: 'sketch', kind: 'result', text: `Recognised a circle, radius ${fmtL(result.r)}.` })
      } else {
        const ids = result.pts.map((p) => b.point(p).id)
        primary = b.polygon(ids, { withSides: true })
        s.pushLog({ input: 'sketch', kind: 'result', text: `Recognised: ${result.label}.` })
      }
      b.commit(false)
      if (primary) {
        s.select([primary.id])
        s.requestFocus('measure')
      }
    }

    const onUp = (e: PointerEvent) => {
      if (e.button !== 0) return
      const s = scene()
      if (sketch.current) {
        finishSketch()
        return
      }
      if (box.current) {
        const bx = box.current
        box.current = null
        setControls(true)
        useTool.setState({ marquee: null })
        const { x, y } = local(e)
        const m: Marquee = { x0: bx.x0, y0: bx.y0, x1: x, y1: y }
        // Shift adds what the box holds to the selection; without it the box is the selection.
        // (A Shift-click toggles one object, but a box that took away what it covered surprised.)
        if (marqueeStarted(m)) s.select(mergeSelection(s.selection, idsInRect(m), e.shiftKey))
        down.current = null
        return
      }
      const d = drag.current
      drag.current = null
      if (d) {
        if (d.moved) s.endGesture()
        setControls(true)
        showTip(null)
        return
      }
      const dn = down.current
      down.current = null
      if (!dn) return
      const { x, y } = local(e)
      const tool = s.tool
      if (tool === 'select') return
      setControls(true)
      const clickLike = Math.hypot(x - dn.x, y - dn.y) < 5

      if (tool === 'vector') {
        const t = useTool.getState()
        const sn = snapAt(x, y, XY_PLANE, e.altKey)
        if (!sn) return
        const tail = clickLike ? t.firstTail : t.dragStart
        if (!tail) {
          vectorTail.current.first = vectorTail.current.down
          useTool.setState({ firstTail: t.dragStart, dragStart: null })
          return
        }
        const end = e.shiftKey && s.viewMode === '2d' ? constrainAngle(tail, sn.p) : sn.p
        if (dist(tail, end) > 1e-9) {
          const tailId = clickLike ? vectorTail.current.first : vectorTail.current.down
          const headId = e.shiftKey ? null : (sn.pointId ?? null)
          const b = new Builder()
          // Drawn from one existing point to another, the vector belongs to those points.
          if (tailId && headId && tailId !== headId) b.vector({ kind: 'points', a: tailId, b: headId })
          else b.vector({ kind: 'free', tail, comp: sub(end, tail) })
          b.commit()
        }
        vectorTail.current = { down: null, first: null }
        resetTool()
        showTip(null)
        return
      }

      if (!clickLike) return
      if (tool === 'delete') {
        if (dn.hit) s.removeObjects([dn.hit.id])
        return
      }
      if (tool === 'text') {
        const sn = snapAt(x, y, XY_PLANE, e.altKey)
        if (sn) {
          const b = new Builder()
          b.text(sn.p, 'Text')
          b.commit()
          s.setTool('select')
        }
        return
      }
      const picks = useTool.getState().picks
      const accept = acceptsFor(tool, picks)
      let id: ObjId | null = null
      const hit = pickAt(pickCtx(), x, y, accept)
      if (hit) id = hit.id
      else if (createsPointsOnEmpty(tool)) {
        // Shift-constrained position for the next vertex.
        const anchorPt = lastPickPoint()
        const sn = snapAt(x, y, XY_PLANE, e.altKey)
        if (sn && e.shiftKey && anchorPt && !sn.pointId && s.viewMode === '2d') {
          const b = new Builder()
          id = b.point(constrainAngle(anchorPt, sn.p)).id
          b.commit(false)
          useTool.setState((t) => ({ created: [...t.created, id!] }))
        } else id = pointAt(x, y, e.altKey)
      }
      if (!id) return
      const next = [...picks, id]
      useTool.setState({ picks: next })
      advanceTool(tool, next)
    }

    // Right-click finishes a drawing; otherwise it opens the menu for whatever is under the cursor.
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      const from = rightDown.current
      rightDown.current = null
      // A right button pressed during a selection box is part of the box, never a menu.
      if (box.current) return
      // A right-drag panned the view: the button coming up is the end of the pan, not a click.
      const at = local(e)
      if (rightDragPanned(from, at.x, at.y)) return
      if (useTool.getState().picks.length && finishTool()) {
        e.stopPropagation()
        return
      }
      const hit = pickAt(pickCtx(), at.x, at.y)
      if (hit) {
        const s = scene()
        if (!s.selection.includes(hit.id)) s.select([hit.id])
        showContextMenu(e, menuForObject(hit.id))
      } else {
        showContextMenu(e, menuForBackground(worldOn(at.x, at.y)))
      }
    }

    const onDoubleClick = () => {
      if (useTool.getState().picks.length) finishTool()
    }

    const onLeave = () => {
      showTip(null)
      // Labels shown "on hover" must hide once the cursor leaves the drawing.
      if (!drag.current) scene().setHovered(null)
    }

    host.addEventListener('pointerdown', onDown, { capture: true })
    host.addEventListener('contextmenu', onContextMenu, { capture: true })
    host.addEventListener('dblclick', onDoubleClick)
    host.addEventListener('pointerleave', onLeave)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      host.removeEventListener('pointerdown', onDown, { capture: true })
      host.removeEventListener('contextmenu', onContextMenu, { capture: true })
      host.removeEventListener('dblclick', onDoubleClick)
      host.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  return <ToolPreview />
}

function collectFreePoints(o: SceneObject, objects: Record<ObjId, SceneObject>, out: Map<ObjId, V3>, seen = new Set<ObjId>()) {
  if (seen.has(o.id)) return
  seen.add(o.id)
  if (o.type === 'point' && o.def.kind === 'free') {
    out.set(o.id, o.def.p)
    return
  }
  if (o.type === 'vector' && o.def.kind === 'free') {
    out.set(o.id, o.def.tail)
    return
  }
  if (o.type === 'point') return // dependent points do not move their parents
  for (const pid of parentRefs(o)) {
    const p = objects[pid]
    if (p) collectFreePoints(p, objects, out, seen)
  }
}

/**
 * What a tool draws before it has made anything: the rubber band in a quiet grey, the freehand
 * stroke in the accent colour and the snap rings in the same colours a selection uses. Read from the stylesheet and
 * re-read when the theme flips, so they show on the light canvas too.
 */
function usePreviewColors() {
  return useThemed(() => {
    const accent = themeColor('--accent')
    const good = themeColor('--good')
    // Every snap colour is resolved here, once per theme, rather than in a closure that read the
    // stylesheet again on each mouse move over a point.
    const snap: Record<SnapInfo['kind'], string> = { point: themeColor('--sel-glow'), axis: accent, onObject: themeColor('--series-5'), intersection: themeColor('--key-intercept'), grid: good, free: good }
    return {
      band: themeColor('--text-dim'),
      // The stroke is the only thing on screen while a student draws, and the selection yellow
      // was the faintest line on the light canvas; the accent blue reads in both themes.
      stroke: accent,
      snap
    }
  })
}

/** Rubber-band previews, the snap indicator and the freehand stroke. */
function ToolPreview() {
  const tool = useScene((s) => s.tool)
  const viewMode = useScene((s) => s.viewMode)
  const { picks, cursor, dragStart, firstTail, snap, stroke } = useTool()
  const ev = useScene((s) => s.ev)
  const colors = usePreviewColors()
  useEffect(() => {
    resetTool()
    showTip(null)
  }, [tool])
  const pts = picks.map((id) => ev.values.get(id)).filter((c): c is { type: 'point'; p: V3 } => c?.type === 'point').map((c) => c.p)
  const is3D = viewMode === '3d'

  const snapMark = snap && cursor ? <SnapMarker p={snap.p} color={colors.snap[snap.kind]} kind={snap.kind} /> : null

  if (tool === 'sketch') return stroke.length > 1 ? <FatLine points={stroke} color={colors.stroke} width={2.5} renderOrder={35} /> : null
  if (!cursor) return snapMark
  if (tool === 'vector') {
    const tail = dragStart ?? firstTail
    if (!tail || dist(tail, cursor) < 1e-9) return snapMark
    return (
      <>
        <Arrow tail={tail} comp={sub(cursor, tail)} color={colors.band} is3D={is3D} thick={1.4} renderOrder={30} />
        {snapMark}
      </>
    )
  }
  if (!pts.length) return snapMark
  const last = pts[pts.length - 1]
  if (tool === 'circle') {
    const r = dist(last, cursor)
    const ring: V3[] = Array.from({ length: 97 }, (_, i) => {
      const t = (i / 96) * Math.PI * 2
      return [last[0] + r * Math.cos(t), last[1] + r * Math.sin(t), last[2]]
    })
    return (
      <>
        <FatLine points={ring} color={colors.band} width={1.5} renderOrder={30} />
        {snapMark}
      </>
    )
  }
  if (['segment', 'line', 'ray', 'distance', 'triangle', 'polygon', 'angle', 'angleBisector', 'midpoint', 'perpBisector'].includes(tool)) {
    const chain = [...pts, cursor]
    if ((tool === 'triangle' && pts.length === 2) || tool === 'polygon') chain.push(pts[0])
    return (
      <>
        <FatLine points={chain} color={colors.band} width={1.5} renderOrder={30} />
        {snapMark}
      </>
    )
  }
  return snapMark
}

function SnapMarker({ p, kind, color }: { p: V3; kind: SnapInfo['kind']; color: string }) {
  const wpp = useThreeWpp()
  const r = (kind === 'point' || kind === 'onObject' || kind === 'intersection' ? 9 : 6) * wpp
  const ring: V3[] = Array.from({ length: 33 }, (_, i) => {
    const t = (i / 32) * Math.PI * 2
    return [p[0] + r * Math.cos(t), p[1] + r * Math.sin(t), p[2]]
  })
  return <FatLine points={ring} color={color} width={2} renderOrder={36} />
}

function useThreeWpp() {
  const { camera, size } = useThree()
  return worldPerPixel(camera, size)
}
