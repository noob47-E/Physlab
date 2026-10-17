// 3D-3B: the Measure panel in Geometry's 3-D view. With nothing selected: the one hint, the Shapes and Theorems galleries (two
// columns of tiles) and the list of the drawing's 3-D objects with their key number. With a selection: a point's x, y, z boxes,
// a solid's sizes and its Volume | Surface area tabs, or what the selected things make (a distance, an angle), each worked out:
// the formula, the numbers put in, the answer (math/measure3d.ts).

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { scene, useScene } from '../core/store'
import type { ObjId } from '../core/types'
import { displayName } from '../core/naming'
import { measure3D, type Row3D } from '../math/measure3d'
import { SOLID_KINDS, SOLID_NAMES, sizesOf } from '../math/solidShape'
import { Tex } from '../ui/Tex'
import { NumField } from '../ui/fields'
import { itemOf, objectList } from './measure3dItems'
import { apexOverPolygon, extrudePolygon } from './shapeSolids'
import { addSolid } from './solids3d'
import { TheoremTiles } from './TheoremTiles'

/** The first ten seconds: what to do. */
const HINT_3D = 'Click 3D shapes to put a cube, pyramid or sphere on the floor, or type P(1, 2, 3).'

function Steps({ row }: { row: Row3D }) {
  return (
    <div className="flex flex-col gap-1 py-1">
      {row.general && <Tex tex={row.general} />}
      {row.substitution && <Tex tex={row.substitution} />}
      <Tex tex={row.answer} className="text-ink-strong" />
    </div>
  )
}

function Fold({ id, title, children, open: start = true }: { id: string; title: string; children: React.ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(start)
  return (
    <div className="card p-2" data-fold={id}>
      <button type="button" className="flex w-full items-center gap-1 text-left text-fine uppercase tracking-wide text-ink-faint" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {title}
      </button>
      {open && <div className="pt-1.5">{children}</div>}
    </div>
  )
}

/** A solid's sizes, each a box that takes a number or a slider's name. */
function SolidSizes({ id }: { id: ObjId }) {
  const o = useScene((s) => s.objects[id])
  const err = useScene((s) => s.ev.errors.get(id))
  if (o?.type !== 'solid') return null
  return (
    <div className="flex flex-wrap gap-2 py-1">
      {sizesOf(o.kind).map((z) => (
        <label key={z.key} className="flex items-center gap-1 text-small">
          <span className="text-ink-faint">{z.label}</span>
          <input
            className="field w-16 pointer-coarse:min-h-[44px]"
            aria-label={z.label}
            defaultValue={o.size[z.key]}
            key={o.size[z.key]}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim()
              if (v && v !== o.size[z.key]) scene().updateObject(id, (d) => void (d.type === 'solid' && (d.size[z.key] = v)))
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        </label>
      ))}
      {err && <p className="w-full text-small text-[color:var(--bad)]">{err}</p>}
    </div>
  )
}

/** A selected shape (a polygon in 3-D): Extrude pushes it up into a prism, Apex lifts a point over it into a pyramid. */
function ShapeActions({ id }: { id: ObjId }) {
  const [h, setH] = useState('4')
  const [apex, setApex] = useState('')
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-1 py-1" data-shape-actions="">
      <div className="flex flex-wrap items-center gap-1">
        <label className="flex items-center gap-1 text-small">
          <span className="text-ink-faint">height h</span>
          <input className="field w-16 pointer-coarse:min-h-[44px]" aria-label="Extrude height" value={h} onChange={(e) => setH(e.target.value)} />
        </label>
        <button type="button" className="btn px-2 text-small pointer-coarse:min-h-[44px]" title="Push the shape straight up into a prism" onClick={() => setErr(extrudePolygon(id, h))}>
          Extrude
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <label className="flex items-center gap-1 text-small">
          <span className="text-ink-faint">apex</span>
          <input className="field w-28 pointer-coarse:min-h-[44px]" aria-label="Apex point" placeholder="(1, 1, 3)" value={apex} onChange={(e) => setApex(e.target.value)} />
        </label>
        <button type="button" className="btn px-2 text-small pointer-coarse:min-h-[44px]" title="Make a pyramid up to the apex (empty: 3 above the middle)" onClick={() => setErr(apexOverPolygon(id, apex))}>
          Apex
        </button>
      </div>
      {err && <p className="text-small text-[color:var(--bad)]">{err}</p>}
    </div>
  )
}

/** A free point's x, y, z, typed. */
function PointBoxes({ id }: { id: ObjId }) {
  const o = useScene((s) => s.objects[id])
  if (o?.type !== 'point' || o.def.kind !== 'free') return null
  const p = o.def.p
  const set = (k: number, v: number) =>
    scene().updateObject(id, (d) => {
      if (d.type === 'point' && d.def.kind === 'free') d.def.p = d.def.p.map((x, i) => (i === k ? v : x)) as typeof p
    })
  return (
    <div className="flex gap-2 py-1">
      {(['x', 'y', 'z'] as const).map((n, k) => (
        <label key={n} className="flex items-center gap-1 text-small">
          <span className="text-ink-faint">{n}</span>
          <NumField value={p[k]} onChange={(v) => set(k, v)} className="w-16" />
        </label>
      ))}
    </div>
  )
}

export function Measure3DPanel() {
  const selection = useScene((s) => s.selection)
  const objects = useScene((s) => s.objects)
  const ev = useScene((s) => s.ev)
  const order = useScene((s) => s.order)
  const settings = useScene((s) => s.settings)
  const space = useScene((s) => s.activeSpace)
  const [tab, setTab] = useState(0)
  const sel = selection.map((id) => objects[id]).filter(Boolean)
  const items = sel.map((o) => itemOf(o, ev.values.get(o.id), objects, ev))
  const m = items.every(Boolean) ? measure3D(items as NonNullable<(typeof items)[number]>[], settings) : null
  const solid = sel.length === 1 && sel[0].type === 'solid' ? sel[0] : null
  const point = sel.length === 1 && sel[0].type === 'point' ? sel[0] : null
  const shape = sel.length === 1 && sel[0].type === 'polygon' && ev.values.get(sel[0].id)?.type === 'polygon' ? sel[0] : null
  const list = objectList(order.filter((id) => objects[id]?.space === space), objects, ev, settings)
  return (
    <div className="panel pb-6" data-measure3d="">
      {sel.length > 0 && (
        <div className="card p-2" data-measure3d-card="">
          <div className="text-small font-semibold text-ink-strong">{m?.title ?? sel.map((o) => displayName(o, objects, ev.values.get(o.id))).join(' and ')}</div>
          {point && <PointBoxes id={point.id} />}
          {solid && <SolidSizes id={solid.id} />}
          {shape && <ShapeActions key={shape.id} id={shape.id} />}
          {m && m.rows.length > 1 && (
            <div className="mt-1 flex flex-wrap gap-1" role="tablist">
              {m.rows.map((r, i) => (
                <button key={r.title} type="button" role="tab" aria-selected={tab === i} className={`btn px-2 text-small pointer-coarse:min-h-[44px] ${tab === i ? 'primary' : ''}`} onClick={() => setTab(i)}>
                  {r.title}
                </button>
              ))}
            </div>
          )}
          {m && <Steps row={m.rows[Math.min(tab, m.rows.length - 1)]} />}
          {!m && !point && !shape && !solid && <p className="text-small text-ink-faint">Pick a second object with Measure or Angle: two points, a point and a plane, two lines, a line and a plane, or two planes.</p>}
        </div>
      )}
      {sel.length === 0 && <p className="px-3 pt-2 text-small text-ink-faint">{HINT_3D}</p>}
      <Fold id="shapes" title="Shapes">
        <div className="grid grid-cols-2 gap-1">
          {SOLID_KINDS.map((k) => (
            <button key={k} type="button" className="btn h-auto min-h-[36px] justify-start whitespace-normal px-2 py-1 text-left text-small" onClick={() => addSolid(k)}>
              {SOLID_NAMES[k]}
            </button>
          ))}
        </div>
      </Fold>
      <Fold id="theorems" title="Theorems">
        <TheoremTiles />
      </Fold>
      {list.length > 0 && (
        <Fold id="objects" title="In the drawing">
          <ul className="flex flex-col gap-0.5">
            {list.map((r) => (
              <li key={r.id}>
                <button type="button" className={`w-full rounded px-1 py-0.5 text-left text-small hover:bg-[var(--bg-3)] ${selection.includes(r.id) ? 'bg-[var(--bg-3)]' : ''}`} onClick={() => scene().select([r.id])}>
                  <span className="text-ink-strong">{r.name}</span> <span className="text-ink-faint">{r.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </Fold>
      )}
    </div>
  )
}
