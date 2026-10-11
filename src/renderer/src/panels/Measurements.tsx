import { useRef, useState } from 'react'
import { ListOrdered } from 'lucide-react'
import { scene, useScene } from '../core/store'
import type { Computed, ObjId, SceneObject, SceneSettings } from '../core/types'
import { circleEquation3DText, distanceToLineLike, footOfPerpendicular, lineEquation, lineEquation3DText, lineLineIntersection, polygonArea, triangleInfo } from '../math/geometry'
import { add, angleBetween, cross, directionAngles, dist, dot, heading, len, mid, NO_DIRECTION as SHORTEST_DIRECTED, normalize, sub, type V3 } from '../math/vec'
import { fmt, fmtIJK, fmtPoint, fmtPrecise, formatMeasure, measureValue, superscriptPowers, unitSuffix, worldValue } from '../math/format'
import { pointAtAngle, pointAtLength } from '../math/setMeasure'
import { isPieceCorner, namedByLetters, pieceLettered, pieceMeasures } from '../math/lego'
import { classifyPolygon } from '../math/shapes'
import * as VS from '../math/vectorSolver'
import { visualizeSolution } from '../core/visualize'
import { ShapeInfo } from './ShapeInfo'
import { measureText } from '../render/Labels'
import { PinLabelButton } from '../ui/LabelControls'
import { menuForObject } from '../app/contextActions'
import { showContextMenu } from '../ui/ContextMenu'
import { visibleIn } from '../core/visibility'
import { displayName } from '../core/naming'
import { CongruenceCard, TriangleFromSides } from './Congruence'
import { trianglesToCompare } from '../math/congruence'

export type Row = {
  label: string
  value: number | string
  kind?: 'num' | 'length' | 'area' | 'angle' | 'direction' | 'text'
  accent?: boolean
  /**
   * A vector's own unit ("N", "m/s"): its rows read in it at the student's precision, never in the
   * grid's unit — a force of 10 N read "10 u", or "20 cm" at 1 square = 2 cm.
   */
  unit?: string
  /**
   * Set when PhysLab can make the value be whatever is typed — a length whose far end is a free
   * point, an angle whose arm can turn. Rows without it stay read-only, because a measurement
   * that is a consequence of other things must not pretend it can be dictated.
   */
  set?: (value: number) => void
}
type Get = (id: ObjId) => Computed | undefined

/** What a direction row says for a zero vector, which has none: it used to read 0°, "0" or "undefined°". */
const NO_DIRECTION = 'undefined — a zero vector has no direction'
// math/vec.ts's floor on a length (an absolute floor, parked for the owner as CW9-N1-1 with CW9-N3-2): a vector of
// 10⁻¹⁹ is told it has no direction (tests/noiseFloorsN1.test.ts).
const isZero = (v: V3) => !(len(v) > SHORTEST_DIRECTED)

/** "circle, centre J" as a heading: "Circle, centre J". */
const capitalised = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1)

export function rowsFor(o: SceneObject, get: Get, objects: Record<ObjId, SceneObject>): { title: string; rows: Row[] }[] {
  const c = get(o.id)
  if (!c) return []
  switch (c.type) {
    case 'point': {
      const rows: Row[] = [
        { label: 'x', value: c.p[0], kind: 'length' },
        { label: 'y', value: c.p[1], kind: 'length' }
      ]
      // eslint-disable-next-line no-restricted-syntax -- a coordinate in the drawing's own squares (a fixed scale), not the scaled value the writer floors: decided for the owner as CW9-N1-6 (tests/noiseFloorsN1.test.ts)
      const threeD = Math.abs(c.p[2]) > 1e-12
      if (threeD) rows.push({ label: 'z', value: c.p[2], kind: 'length' })
      rows.push({ label: 'Distance from origin', value: len(c.p), kind: 'length' })
      // Off the page, a heading from +x is only the shadow's: (0, 0, 5) read 0°. OP's angles with the
      // axes, as the vector card gives them.
      if (!threeD) rows.push({ label: 'Angle from +x', value: heading(c.p), kind: 'direction' })
      else {
        const [a, b, g] = directionAngles(c.p)
        rows.push({ label: 'α with x-axis', value: a, kind: 'angle' }, { label: 'β with y-axis', value: b, kind: 'angle' }, { label: 'γ with z-axis', value: g, kind: 'angle' })
      }
      return [{ title: `Point ${o.name}`, rows }]
    }
    case 'vector': {
      const v = c.comp
      const unit = o.type === 'vector' && o.unit ? o.unit : undefined
      const rows: Row[] = [
        { label: `${o.name}x (x-component)`, value: v[0], kind: 'length', unit },
        { label: `${o.name}y (y-component)`, value: v[1], kind: 'length', unit }
      ]
      // eslint-disable-next-line no-restricted-syntax -- a coordinate in the drawing's own squares (a fixed scale), not the scaled value the writer floors: decided for the owner as CW9-N1-6 (tests/noiseFloorsN1.test.ts)
      const threeD = Math.abs(v[2]) > 1e-12
      if (threeD) rows.push({ label: `${o.name}z (z-component)`, value: v[2], kind: 'length', unit })
      rows.push({ label: `|${o.name}| magnitude`, value: len(v), kind: 'length', accent: true, unit })
      if (isZero(v)) rows.push({ label: 'θ with +x axis', value: NO_DIRECTION, kind: 'text' })
      else if (!threeD) rows.push({ label: 'θ with +x axis', value: heading(v), kind: 'direction', accent: true })
      else {
        const [a, b, g] = directionAngles(v)
        rows.push({ label: 'α with x-axis', value: a, kind: 'angle' }, { label: 'β with y-axis', value: b, kind: 'angle' }, { label: 'γ with z-axis', value: g, kind: 'angle' })
      }
      rows.push({ label: 'Unit vector', value: isZero(v) ? NO_DIRECTION : fmtIJK(normalize(v), 4), kind: 'text' }, { label: 'Tail', value: fmtPoint(c.tail), kind: 'text' }, { label: 'Head', value: fmtPoint(add(c.tail, v)), kind: 'text' })
      return [{ title: `Vector ${o.name} = ${superscriptPowers(fmtIJK(v))}`, rows }]
    }
    case 'segment':
    case 'ray':
    case 'line': {
      const a = c.line.p
      const b = add(a, c.line.d)
      const eq = lineEquation(a, b)
      const level = a[2] === b[2]
      const rows: Row[] = []
      if (c.type === 'segment') {
        // A length can be typed when the far end is a point PhysLab is free to move: the end
        // slides along the line it is already on, so the drawing keeps its direction.
        const seg = o.type === 'segment' ? o : null
        const movable = seg && isFreePoint(objects[seg.b], objects) ? seg.b : seg && isFreePoint(objects[seg.a], objects) ? seg.a : null
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
      // Slope, inclination and y-intercept belong to a line on a level: one that climbs had its
      // shadow's, and an equation in x and y only ("x − y = 0" for (0, 0, 0)–(1, 1, 1)).
      if (level) {
        rows.push(
          { label: 'Slope m', value: Number.isFinite(eq.slope) ? eq.slope : 'vertical (undefined)', kind: Number.isFinite(eq.slope) ? 'num' : 'text' },
          { label: 'Inclination', value: eq.inclination, kind: 'angle' }
        )
      }
      rows.push({ label: 'Equation', value: lineEquation3DText(a, b), kind: 'text' })
      if (level && Number.isFinite(eq.yIntercept)) rows.push({ label: 'y-intercept', value: eq.yIntercept, kind: 'length' })
      // The side the drawing calls FC is "Segment FC" here too, never its stored name "d".
      const groups = [{ title: `${c.type[0].toUpperCase()}${c.type.slice(1)} ${displayName(o, objects).replace(/^ray /, '')}`, rows }]
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
          title: capitalised(displayName(o, objects, c)),
          rows: [
            { label: 'Centre', value: fmtPoint(ctr), kind: 'text' },
            { label: 'Radius r', value: r, kind: 'length', accent: true },
            { label: 'Diameter', value: 2 * r, kind: 'length' },
            { label: 'Circumference 2πr', value: 2 * Math.PI * r, kind: 'length' },
            { label: 'Area πr²', value: Math.PI * r * r, kind: 'area' },
            { label: 'Equation', value: circleEquation3DText(ctr, r), kind: 'text' }
          ]
        }
      ]
    }
    case 'polygon': {
      const pts = c.pts
      if (o.type === 'polygon' && o.lego && !pieceLettered(o.points, objects)) {
        // A piece from a 0.7.0 file: numbered sides, never its hidden corners' helper names
        // (pieceMeasures says why). A piece made since Fix 17 has letters and is measured by them
        // below, as its chip and ShapeInfo name it ("Right-angled triangle EFG").
        return [{ title: `${o.label ?? 'Piece'}, a piece of a shape`, rows: pieceMeasures(pts).map((r) => ({ ...r, accent: r.kind === 'area' })) }]
      }
      const names = (o.type === 'polygon' ? o.points : []).map((id) => objects[id]?.name ?? '?')
      const cls = classifyPolygon(pts)
      if (cls.notAShape) {
        // Corners not in one plane, a bow-tie or corners in a line: sides and perimeter are true of
        // it, an area or angles are not (an upright skew quadrilateral used to show its shadow's).
        const rows: Row[] = pts.map((p, i) => ({ label: `Side ${names[i]}${names[(i + 1) % pts.length]}`, value: dist(p, pts[(i + 1) % pts.length]), kind: 'length' as const }))
        rows.push({ label: 'Perimeter', value: rows.reduce((s, r) => s + (r.value as number), 0), kind: 'length' }, { label: 'Area', value: cls.notAShape, kind: 'text' })
        return [{ title: `${cls.name} ${names.join('')}`, rows }]
      }
      if (pts.length === 3) {
        const t = triangleInfo(pts[0], pts[1], pts[2])
        const [A, B, C] = names
        return [
          {
            // Named as ShapeInfo and the chip name it ("Right-angled triangle EFG"), not plain "Triangle".
            title: `${cls.name} ${A}${B}${C}`,
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
      // Named as ShapeInfo names it: a rectangle fused back from its halves reads "Rectangle ABCD",
      // not "Polygon poly1" (Fix 17).
      return [{ title: `${cls.name} ${names.join('')}`, rows }]
    }
    case 'angle': {
      // Typing an angle turns whichever arm is free about the vertex, keeping its length. If both
      // arms are fixed points, the angle is a consequence of the drawing and stays read-only.
      const ang = o.type === 'angle' ? o : null
      const vertexAt = ang ? get(ang.vertex) : undefined
      const turn =
        ang && vertexAt?.type === 'point'
          ? isFreePoint(objects[ang.b], objects)
            ? { move: ang.b, fixed: ang.a }
            : isFreePoint(objects[ang.a], objects)
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

export function pairRows(a: SceneObject, b: SceneObject, get: Get): { title: string; rows: Row[] } | null {
  const ca = get(a.id)
  const cb = get(b.id)
  if (!ca || !cb) return null
  if (ca.type === 'vector' && cb.type === 'vector') {
    const A = ca.comp
    const B = cb.comp
    return {
      title: `${a.name} and ${b.name}`,
      rows: [
        isZero(A) || isZero(B) ? { label: 'Angle between', value: NO_DIRECTION, kind: 'text' } : { label: 'Angle between', value: angleBetween(A, B), kind: 'angle', accent: true },
        { label: `${a.name}·${b.name}`, value: dot(A, B), accent: true },
        { label: `${a.name}×${b.name}`, value: fmtIJK(cross(A, B), 3), kind: 'text' },
        { label: `|${a.name}×${b.name}| (parallelogram area)`, value: len(cross(A, B)), kind: 'area' },
        { label: `|${a.name}+${b.name}|`, value: len(add(A, B)), kind: 'length' },
        { label: `|${a.name}−${b.name}|`, value: len(sub(A, B)), kind: 'length' },
        // Nothing projects onto a zero vector: this read 0 while the steps button said undefined.
        { label: `Projection of ${b.name} on ${a.name}`, value: isZero(A) ? NO_DIRECTION : dot(A, B) / len(A), kind: isZero(A) ? 'text' : 'length' }
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
        ...(P[2] === Q[2] ? [{ label: 'Slope', value: Number.isFinite(eq.slope) ? eq.slope : 'undefined', kind: Number.isFinite(eq.slope) ? ('num' as const) : ('text' as const) }] : []),
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
        // Lines that are not parallel and do not meet pass each other at different heights.
        { label: 'Intersection', value: X ? fmtPoint(X) : acute < 1e-9 ? 'parallel — none' : 'none — they pass without meeting (skew lines)', kind: 'text' },
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

/** The kind a row's number is formatted as. */
const kindOf = (row: Row) => (row.kind === 'angle' || row.kind === 'direction' || row.kind === 'length' || row.kind === 'area' ? row.kind : 'number')

/**
 * A value as its row shows it: in the vector's own unit when it has one, else the drawing's, with
 * powers of ten raised (N44: at 1 square = 1.5×10¹⁰ the cards wrote "3.11x10^10 u").
 */
function valueText(v: number | string, row: Row, settings: SceneSettings, k: ReturnType<typeof kindOf> = kindOf(row)): string {
  if (typeof v === 'string') return superscriptPowers(v)
  return superscriptPowers(row.unit ? `${fmtPrecise(v, settings)} ${row.unit}` : formatMeasure(v, k, settings))
}

/** The text a row shows (exported for the tests). */
export const rowText = (row: Row, settings: SceneSettings): string => valueText(row.value, row, settings)

/**
 * How a typed-into box reads when not being typed in: lengths and angles at the student's
 * precision, as the drawing labels them. An angle box showed "36.8699 °" beside 36.87°.
 */
export function boxDisplay(k: ReturnType<typeof kindOf>, settings: SceneSettings): ((v: number) => string) | undefined {
  return k === 'length' || k === 'angle' ? (v) => fmtPrecise(v, settings) : undefined
}

/**
 * The number a box hands back when it loses focus, or null for none: Escape cancels, and a box
 * left as it was filled in changes nothing (focusing then leaving one wrote 4.4721 back over the
 * point's true place and added an undo step).
 */
export function typedValue(text: string, seed: string, cancelled: boolean): number | null {
  if (cancelled || text === seed) return null
  const raw = text.trim().replace(/−/g, '-')
  if (!raw) return null
  const v = Number(raw)
  return Number.isFinite(v) ? v : null
}

function RowView({ row, base, settings }: { row: Row; base?: Row; settings: SceneSettings }) {
  // 'direction' is a heading from +x, so the compass-bearing setting applies to it; corner angles stay 'angle'.
  const k = kindOf(row)
  const show = (v: number | string) => valueText(v, row, settings, k)
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
            // A length reads at the student's precision, as the tip while drawing and the label on
            // the drawing do: the box used to show 4.6063 u beside a segment labelled 4.61 u (Fix 1).
            display={boxDisplay(k, settings)}
            onSet={(shown) => row.set!(worldValue(shown, k, settings))}
          />
        ) : (
          show(row.value)
        )}
        {Math.abs(delta) > 1e-9 && (
          <span className={`ml-2 text-fine ${delta > 0 ? 'text-good' : 'text-bad'}`}>
            Δ {delta > 0 ? '+' : '−'}
            {/* A change of heading is an amount of turning, never a bearing. */}
            {valueText(Math.abs(delta), row, settings, k === 'direction' ? 'angle' : k)}
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
                {/* The textbook name (ΔGHJ, FC, circle, centre J), never the stored poly1, d or c1;
                    wide enough for "Rectangle CDEF", and cut short only past half the row. */}
                <span className="min-w-14 max-w-[50%] shrink-0 truncate font-math font-semibold italic text-ink-strong">
                  {displayName(o, objects, c)}
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

  // Two triangles, Lego pieces included: are they the same triangle, and by which rule?
  const triangles = trianglesToCompare(
    sel,
    (id) => ev.values.get(id)?.type === 'polygon',
    (o) => namedByLetters(o, objects)
  )

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
function EditableValue({ value, suffix, display, onSet }: { value: number; suffix: string; display?: (v: number) => string; onSet: (shown: number) => void }) {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const cancelled = useRef(false)
  const seed = fmt(value, 4).replace(/−/g, '-')
  const shown = editing ? text : display ? display(value) : fmt(value, 4)
  const commit = () => {
    setEditing(false)
    const v = typedValue(text, seed, cancelled.current)
    cancelled.current = false
    if (v !== null) onSet(v)
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input
        className="field num h-5 w-20 px-1 py-0"
        value={shown}
        title="Type a value and the drawing moves to match"
        onFocus={(e) => {
          setEditing(true)
          cancelled.current = false
          setText(seed)
          e.target.select()
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            cancelled.current = true
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
// A corner of a Lego piece is not: typing a length or an angle would move that one corner and bend
// the piece, so it is never offered. A point the student locked by hand still is — the lock stops a
// drag, and typing a number is a deliberate act — as it was before 0.9 (isPieceCorner).
const isFreePoint = (o: SceneObject | undefined, objects: Record<ObjId, SceneObject>): boolean =>
  !!o && o.type === 'point' && o.def.kind === 'free' && !isPieceCorner(o.id, objects)

/** Puts a free point somewhere, which is what typing a measurement comes down to. */
function movePoint(id: ObjId, to: V3): void {
  scene().updateObject(id, (d) => {
    if (d.type === 'point' && d.def.kind === 'free') d.def.p = to
  })
}
