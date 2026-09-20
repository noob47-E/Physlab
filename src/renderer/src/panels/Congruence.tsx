// Are these two triangles the same? The card that answers, with the reason written out, and the
// marks on the drawing that a proof would carry. The other way in: type three sides and draw it.

import { useEffect, useMemo, useState } from 'react'
import { Equal, Shapes } from 'lucide-react'
import { useScene } from '../core/store'
import type { ObjId, PolygonObj } from '../core/types'
import { Builder } from '../core/factory'
import { compareTriangles, triangleFromSides, type Tri } from '../math/congruence'
import { formatMeasure } from '../math/format'
import type { V3 } from '../math/vec'
import { useMarks, type Marks } from '../render/Marks'
import { NumField } from '../ui/fields'
import { fitCamera } from '../render/viewState'

function triOf(id: ObjId): Tri | null {
  const s = useScene.getState()
  const o = s.objects[id]
  const c = s.ev.values.get(id)
  if (!o || o.type !== 'polygon' || c?.type !== 'polygon' || c.pts.length !== 3) return null
  const names = o.points.map((p) => s.objects[p]?.name ?? '?') as [string, string, string]
  return { names, pts: c.pts as [V3, V3, V3] }
}

/** Two selected triangles, compared. */
export function CongruenceCard({ a, b }: { a: ObjId; b: ObjId }) {
  const ev = useScene((s) => s.ev)
  const objects = useScene((s) => s.objects)
  const settings = useScene((s) => s.settings)
  const setMarks = useMarks((s) => s.set)
  const [showMarks, setShowMarks] = useState(true)

  const result = useMemo(() => {
    const A = triOf(a)
    const B = triOf(b)
    if (!A || !B) return null
    return {
      A,
      B,
      r: compareTriangles(A, B, {
        fmtLength: (v) => formatMeasure(v, 'length', settings),
        fmtAngle: (v) => formatMeasure(v, 'angle', settings)
      })
    }
    // ev and objects are what the triangles are read from.
  }, [a, b, ev, objects, settings])

  // Equal parts get matching marks: one tick on the first equal pair, two on the next, and so on.
  useEffect(() => {
    if (!result || !showMarks) {
      setMarks(null)
      return
    }
    const { A, B, r } = result
    const marks: Marks = { ticks: [], arcs: [] }
    let n = 0
    r.sides.forEach((p, i) => {
      if (!p.equal) return
      n++
      const j = r.mapping[i]
      marks.ticks.push({ a: A.pts[(i + 1) % 3], b: A.pts[(i + 2) % 3], n }, { a: B.pts[(j + 1) % 3], b: B.pts[(j + 2) % 3], n })
    })
    let m = 0
    r.angles.forEach((p, i) => {
      if (!p.equal) return
      m++
      const j = r.mapping[i]
      marks.arcs.push({ vertex: A.pts[i], a: A.pts[(i + 1) % 3], b: A.pts[(i + 2) % 3], n: m }, { vertex: B.pts[j], a: B.pts[(j + 1) % 3], b: B.pts[(j + 2) % 3], n: m })
    })
    setMarks(marks)
    return () => setMarks(null)
  }, [result, showMarks, setMarks])

  if (!result) return null
  const { A, B, r } = result
  const len = (v: number) => formatMeasure(v, 'length', settings)
  const ang = (v: number) => formatMeasure(v, 'angle', settings)
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[color:var(--line)] px-2 py-1.5">
        <Equal size={15} className="text-[color:var(--good)]" />
        <div className="flex-1 font-semibold text-[color:var(--text-strong)]">
          △{A.names.join('')} and △{r.matchedName}
        </div>
        <span className={`rounded-full border px-2 text-[11px] ${r.congruent ? 'border-[color:var(--good)] text-[color:var(--good)]' : r.similar ? 'border-[color:var(--warn)] text-[color:var(--warn)]' : 'border-[color:var(--bad)] text-[color:var(--bad)]'}`}>
          {r.congruent ? `congruent · ${r.test}` : r.similar ? 'similar' : 'not congruent'}
        </span>
      </div>
      <div className="kv">
        {r.sides.map((p) => (
          <Row key={p.a} label={`${p.a} · ${p.b}`} a={len(p.valueA)} b={len(p.valueB)} equal={p.equal} />
        ))}
        {r.angles.map((p) => (
          <Row key={`∠${p.a}`} label={`∠${p.a} · ∠${p.b}`} a={ang(p.valueA)} b={ang(p.valueB)} equal={p.equal} />
        ))}
      </div>
      <ol className="space-y-1 border-t border-[color:var(--line)] px-3 py-2 text-[color:var(--text)]">
        {r.reasons.map((line, i) => (
          <li key={i} className={i === r.reasons.length - 1 ? 'font-semibold text-[color:var(--text-strong)]' : ''}>
            {i + 1}. {line}
          </li>
        ))}
      </ol>
      <label className="flex cursor-pointer items-center gap-2 border-t border-[color:var(--line)] px-3 py-1.5 text-[color:var(--text-dim)]">
        <input type="checkbox" checked={showMarks} onChange={(e) => setShowMarks(e.target.checked)} /> Mark the equal sides and angles on the drawing
      </label>
    </div>
  )
}

function Row({ label, a, b, equal }: { label: string; a: string; b: string; equal: boolean }) {
  return (
    <>
      <span className="k">{label}</span>
      <span className={`v ${equal ? 'text-[color:var(--good)]' : 'text-[color:var(--text-dim)]'}`}>
        {a} {equal ? '=' : '≠'} {b}
      </span>
    </>
  )
}

/** A triangle typed in by its three sides, drawn beside the last thing on the page. */
export function TriangleFromSides() {
  const [sides, setSides] = useState<[number, number, number]>([3, 4, 5])
  const [error, setError] = useState('')
  const draw = () => {
    const s = useScene.getState()
    // Put it to the right of everything already drawn, so two typed triangles sit side by side.
    let x = 0
    for (const c of s.ev.values.values()) if (c.type === 'point') x = Math.max(x, c.p[0] + 1)
    const pts = triangleFromSides(sides[0], sides[1], sides[2], [x, 0, 0])
    if (!pts) {
      setError('Those three sides cannot make a triangle: the two shorter ones must add up to more than the longest.')
      return
    }
    setError('')
    const b = new Builder()
    const ids = pts.map((p) => b.point(p).id)
    b.polygon(ids, { withSides: true })
    b.commit()
    fitCamera()
  }
  return (
    <div className="card p-2">
      <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-[color:var(--text-faint)]">
        <Shapes size={12} /> Draw a triangle from its sides
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {(['a', 'b', 'c'] as const).map((l, i) => (
          <label key={l} className="flex items-center gap-1">
            <span className="italic text-[color:var(--text-dim)]">{l}</span>
            <div className="w-16">
              <NumField
                value={sides[i]}
                onChange={(v) => {
                  const next: [number, number, number] = [...sides]
                  next[i] = v
                  setSides(next)
                }}
              />
            </div>
          </label>
        ))}
        <button className="btn" onClick={draw}>
          Draw
        </button>
      </div>
      {error && <div className="mt-1 text-[color:var(--bad)]">{error}</div>}
      <div className="mt-1 text-[11px] text-[color:var(--text-faint)]">Draw two, then Shift-click both to compare them.</div>
    </div>
  )
}

export const isTriangle = (o: PolygonObj | undefined) => !!o && o.points.length === 3
