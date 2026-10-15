// T974: a shape becomes a solid - Extrude (a prism), Apex (a pyramid) and From corners (a polyhedron from typed vertices). Each
// checks its input first and answers a refusal in words, or null once the solid stands, selected, with its volume said.

import { Builder } from '../core/factory'
import { scene } from '../core/store'
import { compileScalar, sceneNames } from '../math/expr'
import { formatMeasure } from '../math/format'
import { parseCorners } from '../math/polyhedron'
import { solidShape, SOLID_NAMES, type SolidKind } from '../math/solidShape'
import type { V3 } from '../math/vec'

/** The solid stood on `at`, its outline and apex kept relative to it; the solid is selected and its volume said. */
function stand(kind: SolidKind, size: Record<string, string>, pts: V3[], apex?: V3): string | null {
  const s = scene()
  const lo = Math.min(...pts.map((p) => p[2]), ...(apex ? [apex[2]] : []))
  const at: V3 = [pts.reduce((t, p) => t + p[0], 0) / pts.length, pts.reduce((t, p) => t + p[1], 0) / pts.length, lo]
  const rel = (p: V3): V3 => [p[0] - at[0], p[1] - at[1], p[2] - at[2]]
  const relPts = pts.map(rel)
  const relApex = apex ? rel(apex) : undefined
  try {
    solidShape(kind, Object.fromEntries(Object.entries(size).map(([k, v]) => [k, Number(v)])), at, { pts: relPts, apex: relApex })
  } catch (e) {
    return e instanceof Error ? `${e.message[0].toUpperCase()}${e.message.slice(1)}.` : 'That solid cannot be made.'
  }
  const b = new Builder()
  const solid = b.solid(kind, size, at, {}, { pts: relPts, apex: relApex })
  b.commit()
  s.select([solid.id])
  s.setTool('select')
  const c = scene().ev.values.get(solid.id)
  if (c?.type === 'solid') s.pushLog({ input: SOLID_NAMES[kind], kind: 'result', text: `${SOLID_NAMES[kind]}: V = ${formatMeasure(c.shape.volume, 'volume', s.settings)}, total surface ${formatMeasure(c.shape.area, 'area', s.settings)}. Measure has the edges, faces and angles with their steps.` })
  s.requestFocus('measure')
  return null
}

function outlineOf(polygon: string): V3[] | null {
  const c = scene().ev.values.get(polygon)
  return c?.type === 'polygon' ? c.pts : null
}

/** A typed height: a number or a slider's name; it must work out above 0. */
function heightOf(text: string): string | null {
  try {
    const v = compileScalar(text, [], () => ({ ...scene().ev.scope }), sceneNames())({})
    return v > 0 ? text.trim() : null
  } catch {
    return null
  }
}

/** The polygon pushed straight up from its plane by `h` (a number or a slider's name): a prism. */
export function extrudePolygon(polygon: string, h: string): string | null {
  const pts = outlineOf(polygon)
  if (!pts) return 'Select a shape first.'
  const height = heightOf(h)
  if (!height) return 'The height must be a number above 0 (or a slider that is).'
  if (pts.some((p) => Math.abs(p[2] - pts[0][2]) > 1e-9)) return 'Extrude pushes a flat shape straight up: this outline is not level. Draw it on one working plane.'
  return stand('extrusion', { h: height }, pts)
}

/** The polygon and an apex typed as (x, y, z): a pyramid. An empty box puts the apex 3 above the middle of the base. */
export function apexOverPolygon(polygon: string, text: string): string | null {
  const pts = outlineOf(polygon)
  if (!pts) return 'Select a shape first.'
  let apex: V3
  if (text.trim() === '') apex = [pts.reduce((t, p) => t + p[0], 0) / pts.length, pts.reduce((t, p) => t + p[1], 0) / pts.length, pts[0][2] + 3]
  else {
    try {
      const got = parseCorners(text)
      if (got.length !== 1) return 'Type the apex as one point, like (1, 1, 3).'
      apex = got[0]
    } catch (e) {
      return e instanceof Error ? `${e.message[0].toUpperCase()}${e.message.slice(1)}.` : 'Type the apex like (1, 1, 3).'
    }
  }
  return stand('apex', {}, pts, apex)
}

/** A polyhedron from typed corners like (0,0,0), (2,0,0), ... */
export function solidFromCorners(text: string): string | null {
  let pts: V3[]
  try {
    pts = parseCorners(text)
  } catch (e) {
    return e instanceof Error ? `${e.message[0].toUpperCase()}${e.message.slice(1)}.` : 'Type the corners like (0, 0, 0), (2, 0, 0).'
  }
  return stand('corners', {}, pts)
}
