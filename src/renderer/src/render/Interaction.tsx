import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { FatLine } from './FatLine'
import { niceStep, screenToPlane, toScreen, worldPerPixel, XY_PLANE } from './cameraUtils'
import { overlay, showTip } from './overlay'
import { pickAt, type Hit } from './picking'
import { acceptsFor, advanceTool, createsPointsOnEmpty, resetTool, useTool, type SnapInfo } from './tools'
import { Arrow } from './ObjectViews'
import { Builder } from '../core/factory'
import { isFree, parentRefs } from '../core/evaluate'
import { scene, useScene } from '../core/store'
import type { ObjId, SceneObject } from '../core/types'
import { add, dist, heading, len, sub, type V3 } from '../math/vec'
import { formatMeasure } from '../math/format'
import { recognizeStroke } from '../math/shapes'

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
  const ctxRef = useRef({ camera, size, controls })
  ctxRef.current = { camera, size, controls }

  useEffect(() => {
    const host = overlay.canvasHost
    if (!host) return

    const local = (e: PointerEvent) => {
      const r = host.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const pickCtx = () => {
      const s = scene()
      return { camera: ctxRef.current.camera, size: ctxRef.current.size, objects: s.objects, order: s.order, ev: s.ev }
    }
    const setControls = (enabled: boolean) => {
      const c = ctxRef.current.controls as unknown as { enabled: boolean } | null
      if (c) c.enabled = enabled
    }
    /** Minor grid step at the current zoom. */
    const gridStep = () => {
      const { camera: cam, size: sz } = ctxRef.current
      if (scene().viewMode === '2d') {
        const major = niceStep(100 * worldPerPixel(cam, sz))
        return major / (String(major).replace(/[0.]/g, '').startsWith('2') ? 4 : 5)
      }
      return niceStep(cam.position.length() / 12) / 2
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
      const g: V3 = [Math.round(w[0] / step) * step, Math.round(w[1] / step) * step, w[2]]
      const gs = scr(g)
      if (Math.hypot(gs.x - x, gs.y - y) <= SNAP_GRID_PX) return { p: g, kind: 'grid' }
      if (s.viewMode === '2d') {
        const onX = Math.abs(scr([w[0], 0, 0]).y - y) <= SNAP_AXIS_PX
        const onY = Math.abs(scr([0, w[1], 0]).x - x) <= SNAP_AXIS_PX
        if (onX || onY) return { p: [onY ? 0 : tidy(w[0]), onX ? 0 : tidy(w[1]), w[2]], kind: 'axis' }
      }
      return { p: [tidy(w[0]), tidy(w[1]), w[2]], kind: 'free' }
    }

    const fmtL = (v: number) => formatMeasure(v, 'length', scene().settings)
    const fmtA = (r: number) => formatMeasure(r, 'angle', scene().settings)
    const coordText = (p: V3) => `(${[p[0], p[1]].map((v) => fmtL(v).replace(/ \S+$/, '')).join(', ')})`
    const snapNote = (sn: SnapInfo) => (sn.kind === 'point' ? `  • on ${sn.label}` : sn.kind === 'grid' ? '  • grid' : sn.kind === 'axis' ? '  • axis' : '')

    /** Existing point under the cursor (snapped), or a new free point there. */
    const pointAt = (x: number, y: number, alt: boolean): ObjId | null => {
      const sn = snapAt(x, y, XY_PLANE, alt)
      if (!sn) return null
      if (sn.pointId) return sn.pointId
      const b = new Builder()
      const p = b.point(sn.p)
      b.commit(false)
      return p.id
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      const { x, y } = local(e)
      const s = scene()
      const tool = s.tool
      const accept = acceptsFor(tool, useTool.getState().picks)
      const hit = pickAt(pickCtx(), x, y, tool === 'select' ? undefined : accept)
      down.current = { x, y, world: worldOn(x, y), hit }

      if (tool === 'select') {
        if (!hit) {
          if (!e.shiftKey) s.select([])
          return // empty space: the camera controls pan/orbit
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
      drag.current = {
        hit,
        plane,
        startWorld: down.current?.world ?? anchor,
        starts,
        startComp: c.type === 'vector' ? c.comp : undefined,
        startTail: c.type === 'vector' ? c.tail : undefined,
        moved: false,
        exclude: new Set([o.id, ...starts.keys()])
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
      const first = d.starts.values().next().value as V3 | undefined
      if (first) {
        const target = snapNear(add(first, delta), e.altKey, d.exclude)
        delta = sub(target.p, first)
      }
      for (const [pid, p0] of d.starts) {
        s.updateObject(pid, (dr) => {
          if (dr.type === 'point' && dr.def.kind === 'free') dr.def.p = add(p0, delta)
          if (dr.type === 'vector' && dr.def.kind === 'free') dr.def.tail = add(p0, delta)
        }, false)
      }
      showTip(`move ${coordText(delta)}`, x, y)
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
      const result = recognizeStroke(sk.world, { gridStep: s.settings.snap ? gridStep() : 0 })
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
          useTool.setState({ firstTail: t.dragStart, dragStart: null })
          return
        }
        const end = e.shiftKey && s.viewMode === '2d' ? constrainAngle(tail, sn.p) : sn.p
        if (dist(tail, end) > 1e-9) {
          const b = new Builder()
          b.vector({ kind: 'free', tail, comp: sub(end, tail) })
          b.commit()
        }
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
        } else id = pointAt(x, y, e.altKey)
      }
      if (!id) return
      const next = [...picks, id]
      useTool.setState({ picks: next })
      advanceTool(tool, next)
    }

    const onLeave = () => {
      showTip(null)
      // Labels shown "on hover" must hide once the cursor leaves the drawing.
      if (!drag.current) scene().setHovered(null)
    }

    host.addEventListener('pointerdown', onDown, { capture: true })
    host.addEventListener('pointerleave', onLeave)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      host.removeEventListener('pointerdown', onDown, { capture: true })
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

/** Rubber-band previews, the snap indicator and the freehand stroke. */
function ToolPreview() {
  const tool = useScene((s) => s.tool)
  const viewMode = useScene((s) => s.viewMode)
  const { picks, cursor, dragStart, firstTail, snap, stroke } = useTool()
  const ev = useScene((s) => s.ev)
  useEffect(() => {
    resetTool()
    showTip(null)
  }, [tool])
  const pts = picks.map((id) => ev.values.get(id)).filter((c): c is { type: 'point'; p: V3 } => c?.type === 'point').map((c) => c.p)
  const is3D = viewMode === '3d'

  const snapMark = snap && cursor ? <SnapMarker p={snap.p} kind={snap.kind} /> : null

  if (tool === 'sketch') return stroke.length > 1 ? <FatLine points={stroke} color="#ffe066" width={2.5} renderOrder={35} /> : null
  if (!cursor) return snapMark
  if (tool === 'vector') {
    const tail = dragStart ?? firstTail
    if (!tail || dist(tail, cursor) < 1e-9) return snapMark
    return (
      <>
        <Arrow tail={tail} comp={sub(cursor, tail)} color="#9aa1ab" is3D={is3D} thick={1.4} renderOrder={30} />
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
        <FatLine points={ring} color="#9aa1ab" width={1.5} renderOrder={30} />
        {snapMark}
      </>
    )
  }
  if (['segment', 'line', 'ray', 'distance', 'triangle', 'polygon', 'angle', 'angleBisector', 'midpoint', 'perpBisector'].includes(tool)) {
    const chain = [...pts, cursor]
    if ((tool === 'triangle' && pts.length === 2) || tool === 'polygon') chain.push(pts[0])
    return (
      <>
        <FatLine points={chain} color="#9aa1ab" width={1.5} renderOrder={30} />
        {snapMark}
      </>
    )
  }
  return snapMark
}

function SnapMarker({ p, kind }: { p: V3; kind: SnapInfo['kind'] }) {
  const wpp = useThreeWpp()
  const color = kind === 'point' ? '#ffd43b' : kind === 'axis' ? '#74c0fc' : '#8ce99a'
  const r = (kind === 'point' ? 9 : 6) * wpp
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
