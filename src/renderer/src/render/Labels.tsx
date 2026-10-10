import { useEffect, useMemo, useRef } from 'react'
import { visibleIn } from '../core/visibility'
import { useFrame } from '@react-three/fiber'
import { toScreen } from './cameraUtils'
import { labelAnchors, overlay } from './overlay'
import { useScene } from '../core/store'
import { displayName, vectorAmount } from '../core/naming'
import { cssColor } from '../app/theme'
import type { Computed, ObjId, SceneObject, SceneSettings } from '../core/types'
import { fmtSci, formatMeasure, measureNumber, measureValue, superscriptPowers, unitSuffix } from '../math/format'
import { heading, len, type V3 } from '../math/vec'
import { polygonArea } from '../math/geometry'
import { duplicateSides, PIECE_LETTER_PX, settleLabel, sharedCornerLabels, type LabelBox, type MergedCorner } from './pieceLabels'

// What the chip calls an object is core/naming.ts's displayName: the Measure list and the
// selection header use the same one, so the drawing's FC is never the panel's "Segment d".
export { displayName }

type LabelMode = SceneSettings['measureLabels']

/**
 * Corners of Lego pieces that share a spot, as one label each ("G, K") — render/pieceLabels.ts
 * says why. Null when fewer than two pieces are drawn.
 */
function useSharedCorners(): Map<ObjId, MergedCorner | null> | null {
  const objects = useScene((s) => s.objects)
  const ev = useScene((s) => s.ev)
  return useMemo(() => {
    const pieces: { points: string[]; pts: V3[] }[] = []
    for (const o of Object.values(objects)) {
      if (o.type !== 'polygon' || !o.lego) continue
      const c = ev.values.get(o.id)
      if (c?.type === 'polygon' && c.pts.length === o.points.length) pieces.push({ points: o.points, pts: c.pts })
    }
    return pieces.length > 1 ? sharedCornerLabels(pieces, (id) => objects[id]?.name ?? '') : null
  }, [objects, ev])
}

/**
 * Short measurement text for an object, e.g. "5 u ∠ 53.13°" for a vector. A power of ten is
 * raised, "8.89 × 10¹⁹ cm ∠ 67°": the formatters write "8.89×10^19" so shownValue can read it
 * back, and a caret is programming syntax, which no screen of PhysLab shows (V6). It is done on the
 * finished string, after a component's unit has been cut off it, and it covers the Measure panel,
 * which reads the same text.
 */
export function measureText(o: SceneObject, c: Computed | undefined, s: SceneSettings, full: boolean): string {
  return superscriptPowers(measureTextAsFormatted(o, c, s, full))
}

function measureTextAsFormatted(o: SceneObject, c: Computed | undefined, s: SceneSettings, full: boolean): string {
  if (!c) return ''
  switch (c.type) {
    case 'vector': {
      // fmtPrecise writes anything under 10⁻¹² as 0 (a drag's noise), so a card typed as 1.6×10⁻¹⁹ ∠ 30°
      // had the chip "0 cm ∠ 30°" beside a card line that said 1.6 × 10⁻¹⁹ (F2). A vector whose size,
      // as the student sees it, is under that floor is written in scientific form, in the unit
      // vectorAmount would give it, and a component under 10⁻¹² of its size is noise beside it (the
      // card line's rule, which also keeps its z). Any other vector goes the way it always did.
      const unit = o.type === 'vector' ? o.unit : undefined
      const shown = (v: number): number => (unit ? v : measureValue(v, 'length', s))
      const size = len(c.comp)
      const tiny = size !== 0 && Math.abs(shown(size)) < 1e-12
      const big = tiny ? Math.max(...c.comp.map(Math.abs)) : 0
      const comp: V3 = tiny ? (c.comp.map((v) => (Math.abs(v) < 1e-12 * big ? 0 : v)) as V3) : c.comp
      // A question's force arrow is measured in N, not in grid squares.
      const amount = (v: number): string =>
        tiny ? `${fmtSci(shown(v), s)}${unit ? ` ${unit}` : unitSuffix('length', s)}` : o.type === 'vector' ? vectorAmount(v, o, s) : formatMeasure(v, 'length', s)
      const m = amount(len(comp))
      const planar = tiny ? comp[2] === 0 : Math.abs(comp[2]) < 1e-12
      // The zero vector has no direction: heading(0) is atan2(0, 0) = 0, which wrote "0 cm ∠ 0°" where
      // its card line says "no direction" (H7). Only an exactly zero vector is one; a tiny one has an angle.
      const base = size === 0 ? `${m}, no direction` : planar ? `${m} ∠ ${formatMeasure(heading(comp), 'direction', s)}` : m
      if (!full) return base
      const comps = comp.slice(0, planar ? 2 : 3).map((v) => amount(v).replace(/ \S+$/, ''))
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
      return full ? `(${c.p.slice(0, Math.abs(c.p[2]) > 1e-9 ? 3 : 2).map((v) => measureNumber(v, 'length', s)).join(', ')})` : ''
    default:
      return ''
  }
}

/**
 * Objects whose labels light up for the pointed-at / selected objects:
 * a shape brings its sides and corners, a side brings its end points,
 * and a dragged point brings the sides and shapes it moves.
 */
function activeLabelIds(ids: ObjId[], objects: Record<ObjId, SceneObject>, dragging: boolean): Set<ObjId> {
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

/**
 * Whether a label is a plain letter rather than a chip: a point showing only its letter ("Always
 * show point letters", or names only). A chip's coloured left border beside a lone letter read as
 * a stray "⌈" (⌈E, ⌈C — V5). Anything with a measurement, and any other object, stays a chip.
 */
export const plainLetter = (o: SceneObject, showName: boolean, text: string): boolean => o.type === 'point' && showName && !text

/** HTML labels for every object (positions are set every frame by LabelProjector). */
export function LabelLayer() {
  const objects = useScene((s) => s.objects)
  const order = useScene((s) => s.order)
  const ev = useScene((s) => s.ev)
  const selection = useScene((s) => s.selection)
  const hovered = useScene((s) => s.hovered)
  const gesture = useScene((s) => s.gesture)
  const settings = useScene((s) => s.settings)
  const space = useScene((s) => s.activeSpace)
  const ref = useRef<HTMLDivElement>(null)
  const shared = useSharedCorners()
  // The cut is a side of both halves: its length is written once.
  const twinSides = useMemo(() => {
    const corners = new Set<ObjId>()
    for (const o of Object.values(objects)) if (o.type === 'polygon' && o.lego) for (const p of o.points) corners.add(p)
    const sides: { id: string; a: V3; b: V3 }[] = []
    for (const id of order) {
      const o = objects[id]
      if (o?.type !== 'segment' || !corners.has(o.a) || !corners.has(o.b)) continue
      const a = ev.values.get(o.a)
      const b = ev.values.get(o.b)
      if (a?.type === 'point' && b?.type === 'point') sides.push({ id, a: a.p, b: b.p })
    }
    return sides.length > 1 ? duplicateSides(sides) : null
  }, [objects, order, ev])

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
        if (!o || !o.visible || !ev.values.has(id) || !visibleIn(o, space)) return null
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
        // A piece corner sharing its spot with another piece's is written in that one's label.
        const merged = shared?.get(id)
        if (merged === null) return null
        // The cut's other copy is left out while the copy that keeps the label is showing.
        const twin = twinSides?.get(id)
        if (twin && (when === 'always' || active.has(twin) || objects[twin]?.labelPin === 'always')) return null

        if (o.type === 'graph') {
          return (
            <span key={id} data-oid={id} className={`obj-label ${visible ? '' : 'is-away'}`} style={{ color: cssColor(o), display: 'none' }}>
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
        // A piece reads "ΔKLM · 6 u²": the long "Right-angled triangle" and "Area" belong in the
        // Measure panel, and two 230 px labels at the middle of the cut covered each other.
        const pieceArea = o.type === 'polygon' && o.lego && c?.type === 'polygon' ? superscriptPowers(`· ${formatMeasure(polygonArea(c.pts), 'area', settings)}`) : null
        const text = showMeasure ? (pieceArea ?? measureText(o, c, settings, content === 'full' || sel)) : ''
        if (!showName && !text) return null
        // A plain letter wears the label text colour and the halo every label has: in the point's
        // own colour it is near-white, and was lost on the Light theme (styles.css .obj-label.chip).
        const plain = plainLetter(o, showName, text)
        return (
          <span
            key={id}
            data-oid={id}
            className={`${plain ? 'obj-label text-[color:var(--label-text)]' : 'obj-label chip'} ${sel ? 'is-selected' : ''} ${visible ? '' : 'is-away'}`}
            style={{ ['--c' as string]: cssColor(o), display: 'none' }}
          >
            {showName && <span className={`nm ${o.type === 'vector' ? 'vec-name' : ''}`}>{merged?.text ?? displayName(o, objects, c)}</span>}
            {text && <span className="ms">{text}</span>}
          </span>
        )
      })}
    </div>
  )
}

const sizeCache = new WeakMap<HTMLElement, { key: string; w: number; h: number }>()

/** Runs inside the canvas: moves labels to their anchors and nudges overlapping ones apart. */
export function LabelProjector() {
  // A shared piece corner's one label ("G, K") sits outside every piece there
  // (render/pieceLabels.ts says why); worked out when the drawing changes, not every frame.
  const shared = useSharedCorners()
  useFrame(({ camera, size }) => {
    const host = overlay.labels
    if (!host) return
    const children = host.children
    const placed: LabelBox[] = []
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
      let { dx = 0, dy = 0 } = a
      const dir = shared?.get(id)?.dir
      if (dir) {
        // The direction is in the drawing; its screen direction comes from projecting a step along it.
        const t = toScreen(camera, size, [a.p[0] + dir[0] * 1e-3, a.p[1] + dir[1] * 1e-3, a.p[2]])
        const l = Math.hypot(t.x - s.x, t.y - s.y)
        if (l > 1e-9) {
          dx = ((t.x - s.x) / l) * PIECE_LETTER_PX
          dy = ((t.y - s.y) / l) * PIECE_LETTER_PX
        }
      }
      let box: LabelBox = { x: s.x + dx - cached.w / 2, y: s.y + dy - cached.h / 2, w: cached.w, h: cached.h }
      // Hidden (fading) labels keep following their object but never push visible ones aside.
      if (el.classList.contains('is-away')) {
        // eslint-disable-next-line no-restricted-syntax -- a CSS length for the label box, not a number a student reads
        el.style.transform = `translate(${box.x.toFixed(1)}px, ${box.y.toFixed(1)}px)`
        continue
      }
      // The first free place on a ladder of steps below and above (pieceLabels.ts, settleLabel).
      box = settleLabel(box, placed)
      placed.push(box)
      // eslint-disable-next-line no-restricted-syntax -- a CSS length for the label box, not a number a student reads
      el.style.transform = `translate(${box.x.toFixed(1)}px, ${box.y.toFixed(1)}px)`
    }
  })
  return null
}
