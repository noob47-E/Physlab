// 3D-3B: the Measure panel's worked answers in Geometry's 3-D view, from what is selected: a distance, a length, an angle
// between lines and planes, a point's distance from a plane, a solid's volume and surface area. Each is a formula, the
// numbers put in, and the answer in the student's units and precision; the values are math/geometry3d.ts's (part A), the
// solids beyond its seven math/solids3d.ts's (through math/solidShape.ts).

import {
  coneSurfaceArea,
  coneVolume,
  cuboidSurfaceArea,
  cuboidVolume,
  cylinderSurfaceArea,
  cylinderVolume,
  lineLineAngle,
  linePlaneAngle,
  planePlaneAngle,
  pointDistance,
  pointPlaneDistance,
  sphereSurfaceArea,
  sphereVolume,
  squarePyramidSurfaceArea,
  squarePyramidVolume,
  triangularPrismSurfaceArea,
  triangularPrismVolume
} from './geometry3d'
import { measureValue, texPrecise, type MeasureKind, type MeasureSettings } from './format'
import { answerTex } from './shapeFormulas'
import { sizesOf, type SolidKind } from './solidShape'
import type { V3 } from './vec'

/** What the Measure card is given for each selected object. */
export type Item3D =
  | { type: 'point'; name: string; p: V3 }
  /** A line, ray or segment through p along d; `ends` for a segment, whose length is measured. */
  | { type: 'line'; name: string; p: V3; d: V3; ends?: [V3, V3] }
  /** ax + by + cz = d. */
  | { type: 'plane'; name: string; a: number; b: number; c: number; d: number }
  | { type: 'solid'; name: string; kind: SolidKind; size: Record<string, number>; volume: number; area: number }

export interface Row3D {
  title: string
  general: string
  substitution: string
  answer: string
  value: number
  kind: MeasureKind
}

interface Measure3D {
  title: string
  rows: Row3D[]
}

/** A number as it stands in a substitution: at the student's precision, a negative one in brackets. */
function numberIn(v: number, s: MeasureSettings, kind: MeasureKind = 'number'): string {
  const t = texPrecise(kind === 'number' ? v : measureValue(v, kind, s), s)
  return v < 0 ? `(${t})` : t
}

/** ax + by + cz = d as a student writes it: no 1 before a letter, no term with 0, the signs between. */
export function planeEquationTex(a: number, b: number, c: number, d: number, s: MeasureSettings): string {
  const terms: string[] = []
  for (const [k, letter] of [[a, 'x'], [b, 'y'], [c, 'z']] as const) {
    if (k === 0) continue
    const size = Math.abs(k) === 1 ? '' : texPrecise(Math.abs(k), s)
    const sign = k < 0 ? '-' : '+'
    terms.push(terms.length === 0 ? `${sign === '-' ? '-' : ''}${size}${letter}` : `${sign} ${size}${letter}`)
  }
  const right = d < 0 ? `-${texPrecise(-d, s)}` : texPrecise(d, s)
  return `${terms.join(' ') || '0'} = ${right}`
}

const short = (name: string) => /^[A-Z][′″‴⁗']*$/.test(name)
const pairName = (a: string, b: string) => (short(a) && short(b) ? `${a}${b}` : `${a} to ${b}`)

function distanceRow(p: V3, q: V3, s: MeasureSettings, title: string): Row3D {
  const value = pointDistance(p, q).value
  const L = (v: number) => numberIn(v, s, 'length')
  const parts = [0, 1, 2].map((i) => `(${L(q[i])} - ${L(p[i])})^2`)
  return {
    title,
    general: 'd = \\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2 + (z_2 - z_1)^2}',
    substitution: `d = \\sqrt{${parts.join(' + ')}}`,
    answer: `d = ${answerTex(value, 'length', s)}`,
    value,
    kind: 'length'
  }
}

const dotText = (u: V3, v: V3, s: MeasureSettings) => u.map((x, i) => `${numberIn(x, s)} \\times ${numberIn(v[i], s)}`).join(' + ')
const sizeText = (u: V3, s: MeasureSettings) => `\\sqrt{${u.map((x) => `${numberIn(x, s)}^2`).join(' + ')}}`

function angleRow(u: V3, v: V3, s: MeasureSettings, kind: 'lines' | 'linePlane' | 'planes'): Row3D {
  const value = kind === 'lines' ? lineLineAngle(u, v).value : kind === 'linePlane' ? linePlaneAngle(u, v).value : planePlaneAngle(u, v).value
  const fn = kind === 'linePlane' ? '\\sin' : '\\cos'
  const [a, b] = kind === 'lines' ? ['\\vec{u}', '\\vec{v}'] : kind === 'linePlane' ? ['\\vec{d}', '\\vec{n}'] : ['\\vec{n}_1', '\\vec{n}_2']
  return {
    title: 'Angle',
    // \dfrac (Argon): in text size the roots and squares under the bar were too small to read.
    general: `${fn}\\theta = \\dfrac{|${a} \\cdot ${b}|}{|${a}|\\,|${b}|}`,
    substitution: `${fn}\\theta = \\dfrac{|${dotText(u, v, s)}|}{${sizeText(u, s)}\\,${sizeText(v, s)}}`,
    answer: `\\theta = ${answerTex(value, 'angle', s)}`,
    value,
    kind: 'angle'
  }
}

function pointPlaneRow(p: V3, pl: Extract<Item3D, { type: 'plane' }>, s: MeasureSettings): Row3D {
  const value = pointPlaneDistance(p, pl.a, pl.b, pl.c, pl.d).value
  const n = (v: number) => numberIn(v, s)
  // The point and d are lengths, in the student's unit as the answer is; a, b, c are the normal's plain numbers (review).
  const L = (v: number) => numberIn(v, s, 'length')
  return {
    title: 'Shortest distance',
    general: 'd = \\dfrac{|a x_0 + b y_0 + c z_0 - d|}{\\sqrt{a^2 + b^2 + c^2}}',
    substitution: `d = \\dfrac{|${n(pl.a)} \\times ${L(p[0])} + ${n(pl.b)} \\times ${L(p[1])} + ${n(pl.c)} \\times ${L(p[2])} - ${L(pl.d)}|}{\\sqrt{${n(pl.a)}^2 + ${n(pl.b)}^2 + ${n(pl.c)}^2}}`,
    answer: `d = ${answerTex(value, 'length', s)}`,
    value,
    kind: 'length'
  }
}

/** A solid's two formulas with their sizes put in: [V general, V substitution, A general, A substitution]. */
function solidFormulas(kind: SolidKind, v: Record<string, number>, s: MeasureSettings): [string, string, string, string] {
  const L = (k: string) => numberIn(v[k], s, 'length')
  const [a, b, h, r, l, w, R] = ['a', 'b', 'h', 'r', 'l', 'w', 'R'].map((k) => (k in v ? L(k) : ''))
  switch (kind) {
    case 'cube':
      return ['V = a^3', `V = ${a}^3`, 'A = 6a^2', `A = 6 \\times ${a}^2`]
    case 'cuboid':
      return ['V = l w h', `V = ${l} \\times ${w} \\times ${h}`, 'A = 2(lw + lh + wh)', `A = 2(${l} \\times ${w} + ${l} \\times ${h} + ${w} \\times ${h})`]
    case 'prism':
      return ['V = \\frac{\\sqrt{3}}{4} b^2 h', `V = \\frac{\\sqrt{3}}{4} \\times ${b}^2 \\times ${h}`, 'A = \\frac{\\sqrt{3}}{2} b^2 + 3bh', `A = \\frac{\\sqrt{3}}{2} \\times ${b}^2 + 3 \\times ${b} \\times ${h}`]
    case 'pyramid':
      return ['V = \\frac{1}{3} b^2 h', `V = \\frac{1}{3} \\times ${b}^2 \\times ${h}`, 'A = b^2 + 2b\\sqrt{\\left(\\frac{b}{2}\\right)^2 + h^2}', `A = ${b}^2 + 2 \\times ${b}\\sqrt{\\left(\\frac{${b}}{2}\\right)^2 + ${h}^2}`]
    case 'sphere':
      return ['V = \\frac{4}{3}\\pi r^3', `V = \\frac{4}{3}\\pi \\times ${r}^3`, 'A = 4\\pi r^2', `A = 4\\pi \\times ${r}^2`]
    case 'cylinder':
      return ['V = \\pi r^2 h', `V = \\pi \\times ${r}^2 \\times ${h}`, 'A = 2\\pi r^2 + 2\\pi r h', `A = 2\\pi \\times ${r}^2 + 2\\pi \\times ${r} \\times ${h}`]
    case 'cone':
      return ['V = \\frac{1}{3}\\pi r^2 h', `V = \\frac{1}{3}\\pi \\times ${r}^2 \\times ${h}`, 'A = \\pi r^2 + \\pi r\\sqrt{r^2 + h^2}', `A = \\pi \\times ${r}^2 + \\pi \\times ${r}\\sqrt{${r}^2 + ${h}^2}`]
    case 'tetrahedron':
      return ['V = \\frac{a^3}{6\\sqrt{2}}', `V = \\frac{${a}^3}{6\\sqrt{2}}`, 'A = \\sqrt{3}\\,a^2', `A = \\sqrt{3} \\times ${a}^2`]
    case 'octahedron':
      return ['V = \\frac{\\sqrt{2}}{3} a^3', `V = \\frac{\\sqrt{2}}{3} \\times ${a}^3`, 'A = 2\\sqrt{3}\\,a^2', `A = 2\\sqrt{3} \\times ${a}^2`]
    case 'dodecahedron':
      return ['V = \\frac{15 + 7\\sqrt{5}}{4} a^3', `V = \\frac{15 + 7\\sqrt{5}}{4} \\times ${a}^3`, 'A = 3\\sqrt{25 + 10\\sqrt{5}}\\,a^2', `A = 3\\sqrt{25 + 10\\sqrt{5}} \\times ${a}^2`]
    case 'icosahedron':
      return ['V = \\frac{5(3 + \\sqrt{5})}{12} a^3', `V = \\frac{5(3 + \\sqrt{5})}{12} \\times ${a}^3`, 'A = 5\\sqrt{3}\\,a^2', `A = 5\\sqrt{3} \\times ${a}^2`]
    case 'frustum':
      return [
        'V = \\frac{\\pi h}{3}(R^2 + Rr + r^2)',
        `V = \\frac{\\pi \\times ${h}}{3}(${R}^2 + ${R} \\times ${r} + ${r}^2)`,
        'A = \\pi(R^2 + r^2) + \\pi(R + r)\\sqrt{(R - r)^2 + h^2}',
        `A = \\pi(${R}^2 + ${r}^2) + \\pi(${R} + ${r})\\sqrt{(${R} - ${r})^2 + ${h}^2}`
      ]
    case 'hemisphere':
      return ['V = \\frac{2}{3}\\pi r^3', `V = \\frac{2}{3}\\pi \\times ${r}^3`, 'A = 3\\pi r^2', `A = 3\\pi \\times ${r}^2`]
  }
}

/** The volume and area by part A's formulas for its seven solids; the rest as the shape gives them. */
function solidValues(kind: SolidKind, v: Record<string, number>, fallback: { volume: number; area: number }): { volume: number; area: number } {
  switch (kind) {
    case 'cube':
      return { volume: cuboidVolume(v.a, v.a, v.a).value, area: cuboidSurfaceArea(v.a, v.a, v.a).value }
    case 'cuboid':
      return { volume: cuboidVolume(v.l, v.w, v.h).value, area: cuboidSurfaceArea(v.l, v.w, v.h).value }
    case 'prism':
      return { volume: triangularPrismVolume(v.b, v.b, v.b, v.h).value, area: triangularPrismSurfaceArea(v.b, v.b, v.b, v.h).value }
    case 'pyramid':
      return { volume: squarePyramidVolume(v.b, v.h).value, area: squarePyramidSurfaceArea(v.b, v.h).value }
    case 'sphere':
      return { volume: sphereVolume(v.r).value, area: sphereSurfaceArea(v.r).value }
    case 'cylinder':
      return { volume: cylinderVolume(v.r, v.h).value, area: cylinderSurfaceArea(v.r, v.h).value }
    case 'cone':
      return { volume: coneVolume(v.r, v.h).value, area: coneSurfaceArea(v.r, v.h).value }
    default:
      return fallback
  }
}

/** Round solids are written with π: 36π u³ ≈ 113.1 u³. */
const ROUND: ReadonlySet<SolidKind> = new Set(['sphere', 'cylinder', 'cone', 'frustum', 'hemisphere'])

function solidRows(it: Extract<Item3D, { type: 'solid' }>, s: MeasureSettings): Row3D[] {
  const v: Record<string, number> = {}
  for (const z of sizesOf(it.kind)) v[z.key] = it.size[z.key] ?? z.value
  const [vg, vs, ag, as] = solidFormulas(it.kind, v, s)
  const { volume, area } = solidValues(it.kind, v, it)
  const pi = ROUND.has(it.kind)
  return [
    { title: 'Volume', general: vg, substitution: vs, answer: `V = ${answerTex(volume, 'volume', s, pi)}`, value: volume, kind: 'volume' },
    { title: 'Surface area', general: ag, substitution: as, answer: `A = ${answerTex(area, 'area', s, pi)}`, value: area, kind: 'area' }
  ]
}

const normalOf = (p: Extract<Item3D, { type: 'plane' }>): V3 => [p.a, p.b, p.c]

/** The worked answer for what is selected, or null when it is not one Measure works out (nothing, three things, two solids). */
export function measure3D(items: Item3D[], s: MeasureSettings): Measure3D | null {
  if (items.length === 1) {
    const [it] = items
    if (it.type === 'solid') return { title: it.name, rows: solidRows(it, s) }
    if (it.type === 'line' && it.ends) return { title: `Length of ${it.name}`, rows: [{ ...distanceRow(it.ends[0], it.ends[1], s, 'Length'), answer: `|${it.name}| = ${answerTex(pointDistance(it.ends[0], it.ends[1]).value, 'length', s)}` }] }
    if (it.type === 'plane') return { title: it.name, rows: [{ title: 'Equation', general: '', substitution: '', answer: planeEquationTex(it.a, it.b, it.c, it.d, s), value: Number.NaN, kind: 'number' }] }
    return null
  }
  if (items.length !== 2) return null
  const [x, y] = items
  const pick = <T extends Item3D['type']>(t: T) => items.find((i) => i.type === t) as Extract<Item3D, { type: T }> | undefined
  if (x.type === 'point' && y.type === 'point') return { title: `Distance ${pairName(x.name, y.name)}`, rows: [distanceRow(x.p, y.p, s, 'Distance')] }
  const point = pick('point')
  const plane = pick('plane')
  if (point && plane) return { title: `Distance from ${point.name} to ${plane.name}`, rows: [pointPlaneRow(point.p, plane, s)] }
  const between = `Angle between ${x.name} and ${y.name}`
  if (x.type === 'line' && y.type === 'line') return { title: between, rows: [angleRow(x.d, y.d, s, 'lines')] }
  const line = pick('line')
  if (line && plane) return { title: between, rows: [angleRow(line.d, normalOf(plane), s, 'linePlane')] }
  if (x.type === 'plane' && y.type === 'plane') return { title: between, rows: [angleRow(normalOf(x), normalOf(y), s, 'planes')] }
  return null
}
