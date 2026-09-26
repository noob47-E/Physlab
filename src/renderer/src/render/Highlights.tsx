// Hover highlights from the side panels: light-grey hatch over a region, glowing sides, dashed heights.
// Also the turn-and-flip handle that floats over a selected Geometry Lego piece.

import { useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { FlipHorizontal2, RotateCw } from 'lucide-react'
import { create } from 'zustand'
import { FatLine } from './FatLine'
import { useView } from './viewState'
import { screenToPlane, toScreen, XY_PLANE } from './cameraUtils'
import { overlay, showTip } from './overlay'
import { scene, useScene } from '../core/store'
import type { ObjId } from '../core/types'
import { themeColor, useThemed } from '../app/theme'
import { centroid } from '../math/geometry'
import { formatMeasure } from '../math/format'
import { handleAnchor, turnFromDrag, turnPiece } from '../math/lego'
import type { Highlight } from '../math/shapeFormulas'
import { toRad, type V3 } from '../math/vec'

export const useHighlight = create<{ h: Highlight | null; set: (h: Highlight | null) => void }>((set) => ({
  h: null,
  set: (h) => set({ h })
}))

/** Horizontal hatch lines clipped to a polygon (scanline intersections). */
export function hatchSegments(region: V3[], spacing: number): V3[] {
  if (region.length < 3 || spacing <= 0) return []
  const ys = region.map((p) => p[1])
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  if ((yMax - yMin) / spacing > 1500) spacing = (yMax - yMin) / 1500
  const out: V3[] = []
  const z = region[0][2]
  for (let y = Math.ceil(yMin / spacing) * spacing; y <= yMax; y += spacing) {
    const xs: number[] = []
    for (let i = 0; i < region.length; i++) {
      const a = region[i]
      const b = region[(i + 1) % region.length]
      if (a[1] > y !== b[1] > y) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]))
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) out.push([xs[k], y, z], [xs[k + 1], y, z])
  }
  return out
}

export function Highlights() {
  const h = useHighlight((s) => s.h)
  const wpp = useView((s) => s.wpp)
  const alive = useScene((s) => !h?.owner || !!s.objects[h.owner])
  const hatch = useMemo(() => (h?.region ? hatchSegments(h.region, 7 * wpp) : []), [h, wpp])
  // The colours come from the stylesheet: a fixed light grey and yellow were invisible on the
  // light theme's pale canvas. Re-read when the theme changes.
  const { hatchColour, glow } = useThemed(() => ({ hatchColour: themeColor('--grid-axis'), glow: themeColor('--warn') }))
  return (
    <>
      <LegoHandle />
      {/* A highlight whose shape has been deleted has nothing to shade. */}
      {h && alive && (
        <>
          {hatch.length > 1 && <FatLine points={hatch} segments color={hatchColour} width={1.1} renderOrder={40} />}
          {h.segments?.map((s, i) => (
            <FatLine key={`s${i}`} points={s} color={glow} width={5} renderOrder={41} />
          ))}
          {h.dashed?.map((s, i) => (
            <FatLine key={`d${i}`} points={s} color={glow} width={2.2} dashed dashSize={7 * wpp} gapSize={5 * wpp} renderOrder={41} />
          ))}
        </>
      )}
    </>
  )
}

/** How much of the top of the view the floating buttons take: a handle any higher hides behind them. */
const HANDLE_TOP_ROOM_PX = 96
/** Half the handle's width: its middle keeps this far from the left and right edges so no button is cut off. */
const HANDLE_SIDE_ROOM_PX = 76

/** A turn of the handle in progress: what the piece looked like when the pointer went down. */
interface TurnDrag {
  id: ObjId
  pointerId: number
  corners: V3[]
  centre: V3
  start: V3
  /** Where the pointer went down, in canvas pixels: a press that hardly moves is a click. */
  x: number
  y: number
  moved: boolean
  deg: number
}

/**
 * The handle over a selected Lego piece: a Turn button (a press turns the piece 15°
 * anticlockwise; held and dragged round the piece it turns in 15° steps, either way) and a
 * Flip button. Real buttons, 44 px tall, because a piece is turned with a finger as often as
 * with a mouse — and never by a hover gesture. Only in the flat view: pieces live in 2D.
 */
function LegoHandle() {
  const pieceId = useScene((s) => {
    if (s.selection.length !== 1 || s.viewMode !== '2d') return null
    const o = s.objects[s.selection[0]]
    return o?.type === 'polygon' && o.lego ? o.id : null
  })
  const pts = useScene((s) => {
    const c = pieceId ? s.ev.values.get(pieceId) : undefined
    return c?.type === 'polygon' && c.pts.length >= 3 ? c.pts : null
  })
  const wpp = useView((s) => s.wpp)
  // Re-read where the piece is on screen after a pan or a zoom: `version` moves with the camera.
  useView((s) => s.version)
  const { camera, size } = useThree()
  const drag = useRef<TurnDrag | null>(null)
  // The handle keeps still while it is being dragged round: the piece's highest corner changes
  // as it turns, and a handle that followed it slid away from under the finger.
  const [held, setHeld] = useState<V3 | null>(null)
  if (!pieceId || !pts) return null
  // Above the piece, unless that puts it under the view's own buttons along the top edge — a
  // piece slid up there had its handle hidden behind "2D / 3D" — in which case it hangs below.
  const above = handleAnchor(pts, wpp)
  const placed = toScreen(camera, size, above).y < HANDLE_TOP_ROOM_PX ? handleAnchor(pts, wpp, 'below') : above
  // A piece hugging the left or right edge would have half its handle cut off by the view's
  // edge: the handle slides inward just far enough to show whole, still over the piece's row.
  const anchor = held ?? keepInView(placed)

  function keepInView(p: V3): V3 {
    const sp = toScreen(camera, size, p)
    const x = Math.min(Math.max(sp.x, HANDLE_SIDE_ROOM_PX), Math.max(HANDLE_SIDE_ROOM_PX, size.width - HANDLE_SIDE_ROOM_PX))
    if (x === sp.x) return p
    return screenToPlane(camera, size, x, sp.y, XY_PLANE) ?? p
  }

  const canvasXY = (e: { clientX: number; clientY: number }) => {
    const r = overlay.canvasHost?.getBoundingClientRect()
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) }
  }
  const worldAt = (e: { clientX: number; clientY: number }): V3 | null => {
    const { x, y } = canvasXY(e)
    return screenToPlane(camera, size, x, y, XY_PLANE)
  }

  const onDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    const start = worldAt(e)
    if (!start) return
    const { x, y } = canvasXY(e)
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: pieceId, pointerId: e.pointerId, corners: pts, centre: centroid(pts), start, x, y, moved: false, deg: 0 }
    setHeld(anchor)
  }
  const onMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    const { x, y } = canvasXY(e)
    if (!d.moved) {
      if (Math.hypot(x - d.x, y - d.y) < 3) return
      d.moved = true
      scene().beginGesture()
    }
    const now = worldAt(e)
    if (!now) return
    const deg = turnFromDrag(d.centre, d.start, now)
    if (deg !== d.deg) {
      d.deg = deg
      const s = scene()
      const piece = s.objects[d.id]
      if (piece?.type !== 'polygon') return
      const next = turnPiece(d.corners, deg)
      piece.points.forEach((pid, k) =>
        s.updateObject(pid, (dr) => {
          if (dr.type === 'point' && dr.def.kind === 'free') dr.def.p = next[k]
        }, false)
      )
    }
    showTip(`turn ${formatMeasure(toRad(deg), 'angle', scene().settings)}`, x, y)
  }
  const finish = (e: React.PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    drag.current = null
    setHeld(null)
    showTip(null)
    // Letting go ends the drag's undo step and lets the store pull the turned piece onto its
    // neighbours and fuse them if they now make a shape — the same as a slid piece let go.
    if (d.moved) scene().endGesture()
    else if (!cancelled) scene().turnPiece(d.id, 15)
  }

  return (
    <Html position={anchor} center zIndexRange={[2, 0]}>
      <div className="flex select-none items-center gap-1 rounded-md border border-[var(--line-2)] bg-[var(--bg-2)] p-0.5 shadow-lg">
        <button
          type="button"
          className="btn min-h-[44px] min-w-[44px] cursor-grab touch-none justify-center"
          title="Turn 15° anticlockwise — or hold and drag round the piece to turn it"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={(e) => finish(e, false)}
          onPointerCancel={(e) => finish(e, true)}
          // Enter or Space (and a screen reader's activation) arrive as a click with no pointer
          // behind it (`detail` 0); a pointer's click already turned the piece when it let go.
          onClick={(e) => {
            if (e.detail === 0) scene().turnPiece(pieceId, 15)
          }}
        >
          <RotateCw size={16} /> Turn
        </button>
        <button type="button" className="btn min-h-[44px] min-w-[44px] justify-center" title="Its mirror image, left for right" onClick={() => scene().flipPiece(pieceId)}>
          <FlipHorizontal2 size={16} /> Flip
        </button>
      </div>
    </Html>
  )
}
