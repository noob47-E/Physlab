import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { toScreen } from './cameraUtils'
import { labelAnchors, overlay } from './overlay'
import { useScene } from '../core/store'
import type { Computed, ObjId, SceneObject, SceneSettings } from '../core/types'
import { formatMeasure } from '../math/format'
import { heading, len } from '../math/vec'
import { polygonArea } from '../math/geometry'

type LabelMode = SceneSettings['measureLabels']

/** Short measurement text for an object, e.g. "5 u ∠ 53.13°" for a vector. */
export function measureText(o: SceneObject, c: Computed | undefined, s: SceneSettings, full: boolean): string {
  if (!c) return ''
  switch (c.type) {
    case 'vector': {
      const m = formatMeasure(len(c.comp), 'length', s)
      const planar = Math.abs(c.comp[2]) < 1e-12
      const base = planar ? `${m} ∠ ${formatMeasure(heading(c.comp), 'angle', s)}` : m
      if (!full) return base
      const comps = c.comp.slice(0, planar ? 2 : 3).map((v) => formatMeasure(v, 'length', s).replace(/ \S+$/, ''))
      return `${base}  (${comps.join(', ')})`
    }
    case 'segment':
      return formatMeasure(len(c.line.d), 'length', s)
    case 'ray':
    case 'line':
      return ''
    case 'angle':
      return formatMeasure(c.value, 'angle', s)
    case 'number':
      return formatMeasure(c.value, 'number', s)
    case 'circle':
      return `r = ${formatMeasure(c.circle.r, 'length', s)}`
    case 'polygon':
      return `Area ${formatMeasure(polygonArea(c.pts), 'area', s)}`
    case 'point':
      return full ? `(${c.p.slice(0, Math.abs(c.p[2]) > 1e-9 ? 3 : 2).map((v) => formatMeasure(v, 'length', s).replace(/ \S+$/, '')).join(', ')})` : ''
    default:
      return ''
  }
}

/**
 * Objects whose labels light up for the pointed-at / selected objects:
 * a shape brings its sides and corners, a side brings its end points,
 * and a dragged point brings the sides and shapes it moves.
 */
export function activeLabelIds(ids: ObjId[], objects: Record<ObjId, SceneObject>, dragging: boolean): Set<ObjId> {
  const out = new Set<ObjId>()
  const all = Object.values(objects)
  for (const id of ids) {
    const o = objects[id]
    if (!o) continue
    out.add(id)
    if (o.type === 'polygon') {
      for (const p of o.points) out.add(p)
      for (const s of all) if (s.type === 'segment' && o.points.includes(s.a) && o.points.includes(s.b)) out.add(s.id)
    } else if (o.type === 'segment') {
      out.add(o.a)
      out.add(o.b)
    } else if (o.type === 'point' && dragging) {
      for (const s of all) {
        if (s.type === 'segment' && (s.a === id || s.b === id)) out.add(s.id)
        if (s.type === 'polygon' && s.points.includes(id)) out.add(s.id)
      }
    }
  }
  return out
}

/** HTML labels for every object (positions are set every frame by LabelProjector). */
export function LabelLayer() {
  const objects = useScene((s) => s.objects)
  const order = useScene((s) => s.order)
  const ev = useScene((s) => s.ev)
  const selection = useScene((s) => s.selection)
  const hovered = useScene((s) => s.hovered)
  const gesture = useScene((s) => s.gesture)
  const settings = useScene((s) => s.settings)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    overlay.labels = ref.current
  }, [])

  const content: LabelMode = settings.measureLabels
  const when = settings.labelShow
  const active = useMemo(
    () => activeLabelIds(hovered ? [hovered, ...selection] : selection, objects, gesture),
    [hovered, selection, objects, gesture]
  )

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 overflow-hidden">
      {order.map((id) => {
        const o = objects[id]
        if (!o || !o.visible || !ev.values.has(id)) return null
        const c = ev.values.get(id)
        const sel = selection.includes(id)
        if (o.type === 'text') {
          return (
            <span key={id} data-oid={id} className="obj-label is-text" style={{ display: 'none' }}>
              {o.text}
            </span>
          )
        }
        if (o.type === 'number' || o.labelPin === 'never') return null
        if (o.type === 'graph' && !o.showLabel) return null

        // When: pinned labels always show; otherwise the global setting decides.
        const isActive = active.has(id)
        const pinned = o.labelPin === 'always'
        const letterOnly = o.type === 'point' && settings.pointLetters && !isActive && !pinned
        const visible = pinned || letterOnly || when === 'always' || (when === 'hover' && isActive)
        // Hidden labels that could appear on hover stay in the page so they can fade in and out.
        if (!visible && when !== 'hover') return null
        if (o.auxiliary && !sel && !pinned) return null

        if (o.type === 'graph') {
          return (
            <span key={id} data-oid={id} className={`obj-label ${visible ? '' : 'is-away'}`} style={{ color: o.color, display: 'none' }}>
              {o.name}
            </span>
          )
        }

        // What: the per-object label mode wins; otherwise the global content setting.
        let showName = o.showLabel
        let showMeasure = content !== 'name'
        if (o.labelMode === 'name') showMeasure = false
        if (o.labelMode === 'value') {
          showName = false
          showMeasure = true
        }
        if (o.labelMode === 'nameValue') showMeasure = true
        // Shapes stay uncluttered: name and area only when pointed at, selected, pinned or "Everything".
        if (o.type === 'polygon' && !isActive && !pinned && content !== 'full' && when !== 'hover') return null
        if (letterOnly) showMeasure = content === 'full'
        const text = showMeasure ? measureText(o, c, settings, content === 'full' || sel) : ''
        if (!showName && !text) return null
        return (
          <span
            key={id}
            data-oid={id}
            className={`obj-label chip ${sel ? 'is-selected' : ''} ${visible ? '' : 'is-away'}`}
            style={{ ['--c' as string]: o.color, display: 'none' }}
          >
            {showName && <span className={`nm ${o.type === 'vector' ? 'vec-name' : ''}`}>{o.name}</span>}
            {text && <span className="ms">{text}</span>}
          </span>
        )
      })}
    </div>
  )
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const sizeCache = new WeakMap<HTMLElement, { key: string; w: number; h: number }>()

/** Runs inside the canvas: moves labels to their anchors and nudges overlapping ones apart. */
export function LabelProjector() {
  useFrame(({ camera, size }) => {
    const host = overlay.labels
    if (!host) return
    const children = host.children
    const placed: Box[] = []
    for (let i = 0; i < children.length; i++) {
      const el = children[i] as HTMLElement
      const id = el.dataset.oid
      if (!id) continue
      const a = labelAnchors.get(id)
      if (!a) {
        el.style.display = 'none'
        continue
      }
      const s = toScreen(camera, size, a.p)
      if (!s.visible || s.x < -200 || s.y < -100 || s.x > size.width + 200 || s.y > size.height + 100) {
        el.style.display = 'none'
        continue
      }
      if (el.style.display === 'none') el.style.display = ''
      const key = el.textContent ?? ''
      let cached = sizeCache.get(el)
      if (!cached || cached.key !== key) {
        cached = { key, w: el.offsetWidth, h: el.offsetHeight }
        sizeCache.set(el, cached)
      }
      const box: Box = { x: s.x + (a.dx ?? 0) - cached.w / 2, y: s.y + (a.dy ?? 0) - cached.h / 2, w: cached.w, h: cached.h }
      // Hidden (fading) labels keep following their object but never push visible ones aside.
      if (el.classList.contains('is-away')) {
        el.style.transform = `translate(${box.x.toFixed(1)}px, ${box.y.toFixed(1)}px)`
        continue
      }
      // Greedy collision avoidance: slide down (then up) until the label no longer overlaps.
      for (let attempt = 0; attempt < 6; attempt++) {
        const hit = placed.find((p) => box.x < p.x + p.w && box.x + box.w > p.x && box.y < p.y + p.h && box.y + box.h > p.y)
        if (!hit) break
        box.y = attempt % 2 === 0 ? hit.y + hit.h + 2 : hit.y - box.h - 2
      }
      placed.push(box)
      el.style.transform = `translate(${box.x.toFixed(1)}px, ${box.y.toFixed(1)}px)`
    }
  })
  return null
}
