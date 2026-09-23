import { useState } from 'react'
import { ListOrdered } from 'lucide-react'
import { scene, useScene } from '../core/store'
import type { Computed, ObjId, SceneObject, SceneSettings } from '../core/types'
import { distanceToLineLike, footOfPerpendicular, lineEquation, lineLineIntersection, polygonArea, triangleInfo } from '../math/geometry'
import { add, angleBetween, cross, directionAngles, dist, dot, heading, len, mid, normalize, sub, type V3 } from '../math/vec'
import { fmt, fmtIJK, fmtPoint, formatMeasure, measureValue, unitSuffix, worldValue } from '../math/format'
import { pointAtAngle, pointAtLength } from '../math/setMeasure'
import { pieceMeasures } from '../math/lego'
import * as VS from '../math/vectorSolver'
import { visualizeSolution } from '../core/visualize'
import { ShapeInfo } from './ShapeInfo'
import { measureText } from '../render/Labels'
import { PinLabelButton } from '../ui/LabelControls'
import { menuForObject } from '../app/contextActions'
import { showContextMenu } from '../ui/ContextMenu'
import { visibleIn } from '../core/visibility'
import { CongruenceCard, TriangleFromSides } from './Congruence'

type Row = {
  label: string
  value: number | string
  kind?: 'num' | 'length' | 'area' | 'angle' | 'direction' | 'text'
  accent?: boolean
  /**
   * Set when PhysLab can make the value be whatever is typed — a length whose far end is a free
   * point, an angle whose arm can turn. Rows without it stay read-only, because a measurement
   * that is a consequence of other things must not pretend it can be dictated.
   */
  set?: (value: number) => void
}
type Get = (id: ObjId) => Computed | undefined

export function rowsFor(o: SceneObject, get: Get, objects: Record<ObjId, SceneObject>): { title: string; rows: Row[] }[] {
  const c = get(o.id)
  if (!c) return []
  switch (c.type) {
    case 'point': {
      const rows: Row[] = [
        { label: 'x', value: c.p[0], kind: 'length' },
        { label: 'y', value: c.p[1], kind: 'length' }
      ]
      if (Math.abs(c.p[2]) > 1e-12) rows.push({ label: 'z', value: c.p[2], kind: 'length' })
      rows.push({ label: 'Distance from origin', value: len(c.p), kind: 'length' }, { label: 'Angle from +x', value: heading(c.p), kind: 'direction' })
      return [{ title: `Point ${o.name}`, rows }]
    }
    case 'vector': {
      const v = c.comp
      const rows: Row[] = [
        { label: `${o.name}x (x-component)`, value: v[0], kind: 'length' },
        { label: `${o.name}y (y-component)`, value: v[1], kind: 'length' }
      ]
      const threeD = Math.abs(v[2]) > 1e-12
      if (threeD) rows.push({ label: `${o.name}z (z-component)`, value: v[2], kind: 'length' })
      rows.push({ label: `|${o.name}| magnitude`, value: len(v), kind: 'length', accent: true })
      if (!threeD) rows.push({ label: 'θ with +x axis', value: heading(v), kind: 'direction', accent: true })
      else {
        const [a, b, g] = directionAngles(v)
        rows.push({ label: 'α with x-axis', value: a, kind: 'angle' }, { label: 'β with y-axis', value: b, kind: 'angle' }, { label: 'γ with z-axis', value: g, kind: 'angle' })
      }
      rows.push({ label: 'Unit vector', value: fmtIJK(normalize(v), 4), kind: 'text' }, { label: 'Tail', value: fmtPoint(c.tail), kind: 'text' }, { label: 'Head', value: fmtPoint(add(c.tail, v)), kind: 'text' })
      return [{ title: `Vector ${o.name} = ${fmtIJK(v)}`, rows }]
    }
    case 'segment':
    case 'ray':
    case 'line': {
      const a = c.line.p
      const b = add(a, c.line.d)
      const eq = lineEquation(a, b)
      const rows: Row[] = []
      if (c.type === 'segment') {
        // A length can be typed when the far end is a point PhysLab is free to move: the end
        // slides along the line it is already on, so the drawing keeps its direction.
        const seg = o.type === 'segment' ? o : null
        const movable = seg && isFreePoint(objects[seg.b]) ? seg.b : seg && isFreePoint(objects[seg.a]) ? seg.a : null
        const anchorAt = movable === seg?.b ? a : b
        const endAt = movable === seg?.b ? b : a
        rows.push(
          {
            label: 'Length',
            value: len(c.line.d),
            kind: 'length',
            accent: true,
            set: movable
              ? (world) => {
                  const to = pointAtLength(anchorAt, endAt, world)
                  if (to) movePoint(movable, to)
                }
              : undefined
          },
          { label: 'Midpoint', value: fmtPoint(mid(a, b)), kind: 'text' }
        )
      }
      rows.push(
        { label: 'Slope m', value: Number.isFinite(eq.slope) ? eq.slope : 'vertical (undefined)', kind: Number.isFinite(eq.slope) ? 'num' : 'text' },
        { label: 'Inclination', value: eq.inclination, kind: 'angle' },
        { label: 'Equation', value: `${fmt(eq.a, 3)}x + ${fmt(eq.b, 3)}y = ${fmt(eq.c, 3)}`.replace(/\+ −/g, '− '), kind: 'text' }
      )
      if (Number.isFinite(eq.yIntercept)) rows.push({ label: 'y-intercept', value: eq.yIntercept, kind: 'length' })
      const groups = [{ title: `${c.type[0].toUpperCase()}${c.type.slice(1)} ${o.name}`, rows }]
      // A side of a triangle/polygon: also show the whole shape.
      if (o.type === 'segment') {
        for (const p of Object.values(objects)) {
          if (p.type === 'polygon' && p.points.includes(o.a) && p.points.includes(o.b)) groups.push(...rowsFor(p, get, objects))
        }
      }
      return groups
    }
    case 'circle': {
      const { c: ctr, r } = c.circle
      return [
        {
          title: `Circle ${o.name}`,
          rows: [
            { label: 'Centre', value: fmtPoint(ctr), kind: 'text' },
            { label: 'Radius r', value: r, kind: 'length', accent: true },
            { label: 'Diameter', value: 2 * r, kind: 'length' },
            { label: 'Circumference 2πr', value: 2 * Math.PI * r, kind: 'length' },
            { label: 'Area πr²', value: Math.PI * r * r, kind: 'area' },
            { label: 'Equation', value: `(x − ${fmt(ctr[0], 3)})² + (y − ${fmt(ctr[1], 3)})² = ${fmt(r * r, 3)}`, kind: 'text' }
          ]
        }
      ]
    }
    case 'polygon': {
      const pts = c.pts
      if (o.type === 'polygon' && o.lego) {
        // Numbered sides, never the hidden corners' helper names (pieceMeasures says why).
        return [{ title: `${o.label ?? 'Piece'}, a piece of a shape`, rows: pieceMeasures(pts).map((r) => ({ ...r, accent: r.kind === 'area' })) }]
      }
      const names = (o.type === 'polygon' ? o.points : []).map((id) => objects[id]?.name ?? '?')
      if (pts.length === 3) {
        const t = triangleInfo(pts[0], pts[1], pts[2])
        const [A, B, C] = names
        return [
          {
            title: `Triangle ${A}${B}${C}`,
            rows: [
              { label: `Side ${B}${C} (a)`, value: t.sides[0], kind: 'length', accent: true },
              { label: `Side ${C}${A} (b)`, value: t.sides[1], kind: 'length', accent: true },
              { label: `Side ${A}${B} (c)`, value: t.sides[2], kind: 'length', accent: true },
              { label: `∠${A}`, value: t.angles[0], kind: 'angle', accent: true },
              { label: `∠${B}`, value: t.angles[1], kind: 'angle', accent: true },
              { label: `∠${C}`, value: t.angles[2], kind: 'angle', accent: true },
              { label: 'Angle sum', value: t.angles[0] + t.angles[1] + t.angles[2], kind: 'angle' },
              { label: 'Perimeter', value: t.perimeter, kind: 'length' },
              { label: 'Area', value: t.area, kind: 'area' },
              { label: 'Type', value: `${t.bySides}, ${t.byAngles}`, kind: 'text' },
              { label: `Height from ${A}`, value: t.heights[0], kind: 'length' },
              { label: `Height from ${B}`, value: t.heights[1], kind: 'length' },
              { label: `Height from ${C}`, value: t.heights[2], kind: 'length' },
              { label: 'Centroid', value: fmtPoint(t.centroid), kind: 'text' },
              { label: 'Circumradius R', value: t.circumradius, kind: 'length' },
              { label: 'Inradius r', value: t.inradius, kind: 'length' }
            ]
          }
        ]
      }
      const rows: Row[] = pts.map((p, i) => ({ label: `Side ${names[i]}${names[(i + 1) % pts.length]}`, value: dist(p, pts[(i + 1) % pts.length]), kind: 'length' as const }))
      rows.push({ label: 'Perimeter', value: rows.reduce((s, r) => s + (r.value as number), 0), kind: 'length' }, { label: 'Area', value: polygonArea(pts), kind: 'area', accent: true })
      return [{ title: `Polygon ${o.name}`, rows }]
    }
    case 'angle': {
      // Typing an angle turns whichever arm is free about the vertex, keeping its length. If both
      // arms are fixed points, the angle is a consequence of the drawing and stays read-only.
      const ang = o.type === 'angle' ? o : null
      const vertexAt = ang ? get(ang.vertex) : undefined
      const turn =
        ang && vertexAt?.type === 'point'
          ? isFreePoint(objects[ang.b])
            ? { move: ang.b, fixed: ang.a }
            : isFreePoint(objects[ang.a])
              ? { move: ang.a, fixed: ang.b }
              : null
          : null
      const at = (id: ObjId): V3 | null => {
        const p = get(id)
        return p?.type === 'point' ? p.p : null
      }
      const setAngle =
        turn && vertexAt?.type === 'point'
          ? (world: number) => {
              const fixed = at(turn.fixed)
              const moving = at(turn.move)
              if (!fixed || !moving) return
              const to = pointAtAngle(vertexAt.p, fixed, moving, world)
              if (to) movePoint(turn.move, to)
            }
          : undefined
      return [
        {
          title: `Angle ${o.name}`,
          rows: [
            { label: 'Value', value: c.value, kind: 'angle', accent: true, set: setAngle },
            { label: 'In radians', value: c.value },
            { label: 'Supplement (180° − θ)', value: Math.PI - c.value, kind: 'angle' },
            { label: 'Complement (90° − θ)', value: Math.PI / 2 - c.value, kind: 'angle' }
          ]
        }
      ]
    }
    case 'number':
      return [{ title: `Number ${o.name}`, rows: [{ label: 'Value', value: c.value, accent: true }] }]
    default:
      return []
  }
}

function pairRows(a: SceneObject, b: SceneObject, get: Get): { title: string; rows: Row[] } | null {
  const ca = get(a.id)
  const cb = get(b.id)
  if (!ca || !cb) return null
  if (ca.type === 'vector' && cb.type === 'vector') {
    const A = ca.comp
    const B = cb.comp
    return {
      title: `${a.name} and ${b.name}`,
      rows: [
        { label: 'Angle between', value: angleBetween(A, B), kind: 'angle', accent: true },
        { label: `${a.name}·${b.name}`, value: dot(A, B), accent: true },
        { label: `${a.name}×${b.name}`, value: fmtIJK(cross(A, B), 3), kind: 'text' },
        { label: `|${a.name}×${b.name}| (parallelogram area)`, value: len(cross(A, B)), kind: 'area' },
        { label: `|${a.name}+${b.name}|`, value: len(add(A, B)), kind: 'length' },
        { label: `|${a.name}−${b.name}|`, value: len(sub(A, B)), kind: 'length' },
        { label: `Projection of ${b.name} on ${a.name}`, value: dot(A, B) / (len(A) || 1), kind: 'length' }
      ]
    }
  }
  const pt = (c: Computed) => (c.type === 'point' ? c.p : null)
  const line = (c: Computed) => (c.type === 'line' || c.type === 'segment' || c.type === 'ray' ? c.line : null)
  if (pt(ca) && pt(cb)) {
    const P = pt(ca)!
    const Q = pt(cb)!
    const eq = lineEquation(P, Q)
    return {
      title: `${a.name} and ${b.name}`,
      rows: [
        { label: `Distance ${a.name}${b.name}`, value: dist(P, Q), kind: 'length', accent: true },
        { label: 'Midpoint', value: fmtPoint(mid(P, Q)), kind: 'text' },
        { label: 'Slope', value: Number.isFinite(eq.slope) ? eq.slope : 'undefined', kind: Number.isFinite(eq.slope) ? 'num' : 'text' },
        { label: `Vector ${a.name}→${b.name}`, value: fmtIJK(sub(Q, P)), kind: 'text' }
      ]
    }
  }
  const P = pt(ca) ?? pt(cb)
  const L = line(ca) ?? line(cb)
  if (P && L) {
    return {
      title: 'Point and line',
      rows: [
        { label: 'Distance to line', value: distanceToLineLike(P, { ...L, kind: 'line' }), kind: 'length', accent: true },
        { label: 'Foot of perpendicular', value: fmtPoint(footOfPerpendicular(P, L)), kind: 'text' }
      ]
    }
  }
  const L1 = line(ca)
  const L2 = line(cb)
  if (L1 && L2) {
    const ang = angleBetween(L1.d, L2.d)
    const acute = ang > Math.PI / 2 ? Math.PI - ang : ang
    const X = lineLineIntersection({ ...L1, kind: 'line' }, { ...L2, kind: 'line' })
    return {
      title: 'Two lines',
      rows: [
        { label: 'Angle between', value: acute, kind: 'angle', accent: true },
        { label: 'Intersection', value: X ? fmtPoint(X) : 'parallel — none', kind: 'text' },
        { label: 'Relation', value: acute < 1e-9 ? 'parallel' : Math.abs(acute - Math.PI / 2) < 1e-9 ? 'perpendicular' : 'neither', kind: 'text' }
      ]
    }
  }
  if ((P && cb.type === 'circle') || (P && ca.type === 'circle')) {
    const circ = ca.type === 'circle' ? ca.circle : (cb as Extract<Computed, { type: 'circle' }>).circle
    const d = dist(P, circ.c)
    return {
      title: 'Point and circle',
      rows: [
        { label: 'Distance to centre', value: d, kind: 'length' },
        { label: 'Position', value: Math.abs(d - circ.r) < 1e-9 ? 'on the circle' : d < circ.r ? 'inside' : 'outside', kind: 'text' }
      ]
    }
  }
  return null
}

function RowView({ row, base, settings }: { row: Row; base?: Row; settings: SceneSettings }) {
  // 'direction' is a heading from +x, so the compass-bearing setting applies to it; corner angles stay 'angle'.
  const k = row.kind === 'angle' || row.kind === 'direction' || row.kind === 'length' || row.kind === 'area' ? row.kind : 'number'
  const show = (v: number | string) => (typeof v === 'string' ? v : formatMeasure(v, k, settings))
  const delta = base && typeof row.value === 'number' && typeof base.value === 'number' ? row.value - base.value : 0
  return (
    <>
      <div className="k">{row.label}</div>
      <div className={`v ${row.accent ? 'font-semibold text-ink-strong' : ''}`}>
        {/* Typed in whatever unit is on screen — centimetres, degrees — and converted back to the
            world value the scene stores, or a drawing in cm would jump by a factor of ten. */}
        {row.set && typeof row.value === 'number' ? (
          <EditableValue
            value={measureValue(row.value, k, settings)}
            suffix={unitSuffix(k, settings)}
            onSet={(shown) => row.set!(worldValue(shown, k, settings))}
          />
        ) : (
          show(row.value)
        )}
        {Math.abs(delta) > 1e-9 && (
          <span className={`ml-2 text-fine ${delta > 0 ? 'text-good' : 'text-bad'}`}>
            Δ {delta > 0 ? '+' : '−'}
            {/* A change of heading is an amount of turning, never a bearing. */}
            {formatMeasure(Math.abs(delta), k === 'direction' ? 'angle' : k, settings)}
          </span>
        )}
      </div>
    </>
  )
}

const LISTED = new Set(['vector', 'segment', 'circle', 'polygon', 'angle', 'point'])

/** Every measurement at the side of the drawing; pointing at a row shows that label on the drawing. */
function AllMeasurements() {
  const objects = useScene((s) => s.objects)
  const order = useScene((s) => s.order)
  const ev = useScene((s) => s.ev)
  const settings = useScene((s) => s.settings)
  const hovered = useScene((s) => s.hovered)
  const select = useScene((s) => s.select)
  const setHovered = useScene((s) => s.setHovered)
  const space = useScene((s) => s.activeSpace)
  const list = order.map((id) => objects[id]).filter((o) => o && o.visible && !o.auxiliary && LISTED.has(o.type) && ev.values.has(o.id) && visibleIn(o, space))

  return (
    <div data-tour="measure" className="panel pb-6">
      <div className="px-3 pb-2 pt-3 text-ink-faint">
        Click any object to measure it live. Drag it and watch the <span className="text-good">Δ changes</span>. Shift-click two vectors for the angle, dot and cross product, or two triangles to see whether they are congruent.
      </div>
      {space === 'shapes' && <TriangleFromSides />}
      {list.length > 0 && (
        <>
          <div className="section-title flex items-center">
            <span className="flex-1">All measurements</span>
            <span className="normal-case tracking-normal text-ink-faint">pin = always on drawing</span>
          </div>
          {list.map((o) => {
            const c = ev.values.get(o.id)
            const text = measureText(o, c, settings, o.type === 'point')
            return (
              <div
                key={o.id}
                onMouseEnter={() => setHovered(o.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => select([o.id])}
                onContextMenu={(e) => {
                  e.preventDefault()
                  select([o.id])
                  showContextMenu(e, menuForObject(o.id))
                }}
                className={`group flex h-7 cursor-pointer items-center gap-2 px-3 ${hovered === o.id ? 'bg-surface-3' : ''}`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.color }} />
                <span className="w-14 shrink-0 truncate font-math font-semibold italic text-ink-strong">
                  {o.name}
                </span>
                <span className="min-w-0 flex-1 truncate tabular-nums text-ink">{text || '—'}</span>
                <PinLabelButton id={o.id} className={o.labelPin === 'always' ? '' : 'opacity-0 group-hover:opacity-100'} />
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

export function Measurements() {
  const selection = useScene((s) => s.selection)
  const objects = useScene((s) => s.objects)
  const ev = useScene((s) => s.ev)
  const baseline = useScene((s) => s.baseline)
  const settings = useScene((s) => s.settings)
  const showSolution = useScene((s) => s.showSolution)

  const sel = selection.map((id) => objects[id]).filter(Boolean)
  if (!sel.length) return <AllMeasurements />

  const get: Get = (id) => ev.values.get(id)
  const getBase: Get = (id) => baseline?.get(id)

  const groups = sel.flatMap((o) => rowsFor(o, get, objects))
  const baseGroups = baseline ? sel.flatMap((o) => rowsFor(o, getBase, objects)) : []
  const pair = sel.length === 2 ? pairRows(sel[0], sel[1], get) : null
  const basePair = sel.length === 2 && baseline ? pairRows(sel[0], sel[1], getBase) : null

  const vecs = sel.filter((o) => ev.values.get(o.id)?.type === 'vector').map((o) => ({ name: o.name, v: (ev.values.get(o.id) as { comp: V3 }).comp }))

  // Shapes to explain: selected polygons/circles, or the polygon a selected side belongs to.
  const shapeIds = [
    ...new Set(
      sel.flatMap((o) => {
        if (o.type === 'polygon' || o.type === 'circle') return [o.id]
        if (o.type === 'segment') return Object.values(objects).filter((p) => p.type === 'polygon' && p.points.includes(o.a) && p.points.includes(o.b)).map((p) => p.id)
        if (o.type === 'point') return Object.values(objects).filter((p) => p.type === 'polygon' && p.points.includes(o.id)).map((p) => p.id).slice(0, 1)
        return []
      })
    )
  ]

  // Two triangles: are they the same triangle, and by which rule?
  // Lego pieces are left out: the card names a triangle by its corners, and a piece's corners are
  // hidden helpers ("△poly2_1poly2_2poly2_3"), which read like code.
  const triangles = sel.filter((o) => o.type === 'polygon' && !o.lego && o.points.length === 3 && ev.values.get(o.id)?.type === 'polygon')

  return (
    <div className="panel pb-6">
      {triangles.length === 2 && <CongruenceCard a={triangles[0].id} b={triangles[1].id} />}
      {triangles.length === 1 && sel.length === 1 && (
        <>
          <div className="px-3 pt-2 text-fine text-ink-faint">Shift-click another triangle to check whether the two are congruent — or draw one to compare with:</div>
          <TriangleFromSides />
        </>
      )}
      {shapeIds.map((id) => (
        <ShapeInfo key={id} id={id} />
      ))}
      {vecs.length >= 2 && (
        <div className="card p-2">
          <div className="mb-1.5 text-fine uppercase tracking-wide text-ink-faint">Solve with steps</div>
          <div className="flex flex-wrap gap-1.5">
            <button className="btn" onClick={() => showSolution(VS.solveAddition(vecs))}>
              <ListOrdered size={13} /> {vecs.map((v) => v.name).join(' + ')}
            </button>
            {vecs.length === 2 && (
              <>
                <button className="btn" onClick={() => showSolution(VS.solveSubtraction(vecs[0], vecs[1]))}>
                  {vecs[0].name} − {vecs[1].name}
                </button>
                <button className="btn" onClick={() => showSolution(VS.solveDot(vecs[0], vecs[1]))}>
                  {vecs[0].name} · {vecs[1].name}
                </button>
                <button className="btn" onClick={() => showSolution(VS.solveCross(vecs[0], vecs[1]))}>
                  {vecs[0].name} × {vecs[1].name}
                </button>
                <button className="btn" onClick={() => showSolution(VS.solveProjection(vecs[1], vecs[0]))}>
                  proj {vecs[1].name} on {vecs[0].name}
                </button>
              </>
            )}
            <button className="btn" onClick={() => showSolution(VS.solveEquilibrium(vecs))}>
              Equilibrium
            </button>
            <button className="btn ghost" onClick={() => visualizeSolution(VS.solveAddition(vecs))} title="Draw the head-to-tail construction">
              Draw head-to-tail
            </button>
          </div>
        </div>
      )}
      {pair && (
        <div className="card">
          <div className="section-title">{pair.title}</div>
          <div className="kv pb-2">
            {pair.rows.map((r, i) => (
              <RowView key={r.label} row={r} base={basePair?.rows[i]} settings={settings} />
            ))}
          </div>
        </div>
      )}
      {groups.map((g, gi) => (
        <div key={gi} className="card">
          <div className="section-title normal-case">{g.title}</div>
          <div className="kv pb-2">
            {g.rows.map((r, i) => (
              <RowView key={r.label} row={r} base={baseGroups[gi]?.rows[i]} settings={settings} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * A measurement you can type into. It shows the value in whatever unit the drawing is using, and
 * hands back the number as typed — the caller converts it, because only the caller knows whether
 * it is looking at a length in centimetres or an angle in degrees.
 */
function EditableValue({ value, suffix, onSet }: { value: number; suffix: string; onSet: (shown: number) => void }) {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const shown = editing ? text : fmt(value, 4)
  const commit = () => {
    setEditing(false)
    const raw = text.trim().replace(/−/g, '-')
    if (!raw) return
    const v = Number(raw)
    if (Number.isFinite(v)) onSet(v)
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input
        className="field num h-5 w-20 px-1 py-0"
        value={shown}
        title="Type a value and the drawing moves to match"
        onFocus={(e) => {
          setEditing(true)
          setText(fmt(value, 4).replace(/−/g, '-'))
          e.target.select()
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setEditing(false)
            ;(e.target as HTMLInputElement).blur()
          }
          e.stopPropagation()
        }}
      />
      <span className="text-ink-faint">{suffix.trim()}</span>
    </span>
  )
}

/** A point PhysLab may move: one that was placed, not one worked out from other objects. */
const isFreePoint = (o: SceneObject | undefined): boolean => !!o && o.type === 'point' && o.def.kind === 'free'

/** Puts a free point somewhere, which is what typing a measurement comes down to. */
function movePoint(id: ObjId, to: V3): void {
  scene().updateObject(id, (d) => {
    if (d.type === 'point' && d.def.kind === 'free') d.def.p = to
  })
}
