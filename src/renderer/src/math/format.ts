import type { V3 } from './vec'
import type { LengthUnit, SceneSettings } from '../core/types'

export type AngleUnit = 'deg' | 'rad' | 'grad'

// ---------------------------------------------------------------------------
// Notation: every book writes vectors a little differently, so the user chooses
// ---------------------------------------------------------------------------

export interface Notation {
  /** How a vector's letter is written. */
  vector: 'arrow' | 'bold' | 'underline'
  /** How its components are written. */
  components: 'ijk' | 'pair' | 'column' | 'polar'
  /** How a direction is given: from the +x axis, or as a compass bearing. */
  direction: 'standard' | 'bearing'
}

let NOTATION: Notation = { vector: 'arrow', components: 'ijk', direction: 'standard' }

export const notation = (): Notation => NOTATION
export const setNotation = (n: Partial<Notation>): void => {
  NOTATION = { ...NOTATION, ...n }
}

/** A vector's name in LaTeX, in the chosen style. */
export function vecTex(name: string): string {
  if (NOTATION.vector === 'bold') return `\\mathbf{${name}}`
  if (NOTATION.vector === 'underline') return `\\underline{${name}}`
  return `\\vec{${name}}`
}

/** Decimal places, or the student's precision settings (which may mean significant figures). */
export type Precision = number | Pick<MeasureSettings, 'decimals' | 'precisionMode'>

const fmtAt = (n: number, p: Precision): string => (typeof p === 'number' ? fmt(n, p) : fmtPrecise(n, p))
const texAt = (n: number, p: Precision): string => (typeof p === 'number' ? tex(n, p) : texPrecise(n, p))

/**
 * A compass bearing such as "N 30° E" for a direction measured from +x. The zero vector has
 * no direction, so it is said so rather than written as "S undefined° W".
 */
export function bearingText(rad: number, precision: Precision = 2): string {
  if (!Number.isFinite(rad)) return 'undefined'
  const fromNorth = ((90 - (rad * 180) / Math.PI) % 360 + 360) % 360
  const exact = ['N', 'E', 'S', 'W'][Math.round(fromNorth / 90) % 4]
  if (Math.abs(fromNorth - Math.round(fromNorth / 90) * 90) < 1e-9) return exact
  const ns = fromNorth < 90 || fromNorth > 270 ? 'N' : 'S'
  const ew = fromNorth < 180 ? 'E' : 'W'
  const off = ns === 'N' ? (fromNorth < 90 ? fromNorth : 360 - fromNorth) : Math.abs(180 - fromNorth)
  return `${ns} ${fmtAt(off, precision)}° ${ew}`
}

// ---------------------------------------------------------------------------
// Measurements with units and precision (one place for every displayed value)
// ---------------------------------------------------------------------------

/**
 * 'angle' is an amount of turning (the corner of a triangle, the angle between two vectors);
 * 'direction' is which way something points, measured from +x. Only a direction can be written
 * as a compass bearing — "N 30° E" makes no sense for the corner of a triangle — so the bearing
 * setting applies to 'direction' alone.
 */
export type MeasureKind = 'length' | 'area' | 'volume' | 'angle' | 'direction' | 'number'
export type MeasureSettings = Pick<SceneSettings, 'decimals' | 'precisionMode' | 'unit' | 'unitPerSquare' | 'angleUnit'>

export const UNIT_LABELS: Record<LengthUnit, string> = { unit: 'u', mm: 'mm', cm: 'cm', m: 'm', km: 'km', in: 'in', ft: 'ft' }
export const UNIT_NAMES: Record<LengthUnit, string> = { unit: 'grid units', mm: 'millimetres', cm: 'centimetres', m: 'metres', km: 'kilometres', in: 'inches', ft: 'feet' }

/** Number with the chosen precision: decimal places or significant figures. */
export function fmtPrecise(v: number, s: Pick<MeasureSettings, 'decimals' | 'precisionMode'>): string {
  if (!Number.isFinite(v)) return fmt(v)
  if (s.precisionMode === 'sf') {
    // The same noise floor as fmt: a point dragged onto the axis reads 0, not 3×10⁻¹⁷.
    if (Math.abs(v) < 1e-12) return '0'
    const digits = Math.max(1, s.decimals)
    // Round before choosing the form: 999 999 999.9 at 3 s.f. is 1.00×10^9, and deciding on the
    // unrounded value sent it down the plain path, where it came out as "1000000000".
    const r = Number(v.toPrecision(digits))
    const abs = Math.abs(r)
    if (abs >= 1e9 || abs < 1e-6) return fmtSci(r, s)
    // Keep the string from toPrecision: Number(...) would drop the zeros that show the precision
    // (3 s.f. of 2.5 must read 2.50), but trim the exponent form and any padding zeros before the point.
    const text = r.toPrecision(digits)
    const plain = /e/i.test(text) ? String(Number(text)) : text
    return plain.replace('-', '−')
  }
  return fmt(v, s.decimals)
}

/**
 * The scientific form in the student's precision, whatever the size of the number. Unlike
 * fmtPrecise it has no noise floor: a known answer of 1.6×10⁻¹⁹ N is not drag noise and must
 * not be revealed as "0 N". Significant figures keep their zeros (2.50×10^-7); decimal places
 * trim them, as fmt does.
 */
export function fmtSci(v: number, s: Pick<MeasureSettings, 'decimals' | 'precisionMode'>): string {
  if (!Number.isFinite(v)) return fmt(v)
  if (v === 0) return '0'
  if (s.precisionMode === 'sf') return sci(v, Math.max(1, s.decimals) - 1, false)
  return sci(v, s.decimals, true)
}

/** "m×10^e" from toExponential; the mantissa's zeros are kept or trimmed as the caller asks. */
function sci(n: number, decimals: number, trim: boolean): string {
  const [m, e] = n.toExponential(decimals).split('e')
  // The mantissa takes the same proper minus as every other number on screen (the calculator's
  // own formatter already does); the exponent keeps the plain hyphen `texPrecise` looks for.
  return `${(trim ? trimZeros(m) : m).replace('-', '−')}×10^${Number(e)}`
}

const DIM: Record<MeasureKind, number> = { length: 1, area: 2, volume: 3, angle: 0, direction: 0, number: 0 }

const isAngular = (kind: MeasureKind): boolean => kind === 'angle' || kind === 'direction'

/** A direction is written as a bearing only when the student asked for bearings, in degrees. */
const asBearing = (kind: MeasureKind, s: MeasureSettings): boolean => kind === 'direction' && NOTATION.direction === 'bearing' && s.angleUnit === 'deg'

/** Converts a world (grid) value into the chosen real unit. */
export function measureValue(v: number, kind: MeasureKind, s: MeasureSettings): number {
  if (isAngular(kind)) return angleFrom(v, s.angleUnit)
  return v * Math.pow(s.unitPerSquare, DIM[kind])
}

/** Degrees, radians or grads — written the way each one is written. */
const ANGLE_SUFFIX: Record<AngleUnit, string> = { deg: '°', rad: ' rad', grad: ' grad' }
const ANGLE_TEX: Record<AngleUnit, string> = { deg: '^\\circ', rad: '\\,\\text{rad}', grad: '\\,\\text{grad}' }

export function unitSuffix(kind: MeasureKind, s: MeasureSettings): string {
  // A ternary on 'deg' labelled a grad angle "rad": the number was converted, the name was not.
  if (isAngular(kind)) return ANGLE_SUFFIX[s.angleUnit] ?? ' rad'
  if (kind === 'number') return ''
  const u = UNIT_LABELS[s.unit]
  return ` ${u}${DIM[kind] === 2 ? '²' : DIM[kind] === 3 ? '³' : ''}`
}

/** "12 cm²", "53.13°", "5 u" — and a direction as "N 36.87° E" when bearings are chosen. */
export function formatMeasure(v: number, kind: MeasureKind, s: MeasureSettings): string {
  if (asBearing(kind, s)) return bearingText(v, s)
  return `${fmtPrecise(measureValue(v, kind, s), s)}${unitSuffix(kind, s)}`
}

/** LaTeX version: "12\,\text{cm}^2". */
export function texMeasure(v: number, kind: MeasureKind, s: MeasureSettings, withUnit = true): string {
  if (asBearing(kind, s)) return `\\text{${bearingText(v, s)}}`
  const n = texPrecise(measureValue(v, kind, s), s)
  if (!withUnit || kind === 'number') return n
  if (isAngular(kind)) return `${n}${ANGLE_TEX[s.angleUnit] ?? ANGLE_TEX.rad}`
  const d = DIM[kind]
  return `${n}\\,\\text{${UNIT_LABELS[s.unit]}}${d > 1 ? `^${d}` : ''}`
}

export function texUnit(kind: MeasureKind, s: MeasureSettings): string {
  if (isAngular(kind)) return ANGLE_TEX[s.angleUnit] ?? ANGLE_TEX.rad
  if (kind === 'number') return ''
  const d = DIM[kind]
  return `\\,\\text{${UNIT_LABELS[s.unit]}}${d > 1 ? `^${d}` : ''}`
}

/** Human-friendly number: up to `decimals` decimals, trailing zeros trimmed, scientific when huge/tiny. */
export function fmt(n: number, decimals = 4): string {
  if (Number.isNaN(n)) return 'undefined'
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '−∞'
  if (Math.abs(n) < 1e-12) return '0'
  const abs = Math.abs(n)
  if (abs >= 1e9 || abs < 1e-4) return sci(n, decimals, true)
  // A small negative that rounds away at this precision is 0, not "−0": a midpoint at −0.0004
  // read "(−0, 5)" and a unit vector "1i − 0j".
  const t = trimZeros(n.toFixed(decimals))
  return (t === '-0' ? '0' : t).replace('-', '−')
}

function trimZeros(s: string): string {
  if (!s.includes('.')) return s
  return s.replace(/\.?0+$/, '')
}

/** LaTeX version of fmt. */
export function tex(n: number, decimals = 4): string {
  if (Number.isNaN(n)) return '\\text{undefined}'
  if (!Number.isFinite(n)) return n > 0 ? '\\infty' : '-\\infty'
  if (Math.abs(n) < 1e-12) return '0'
  const abs = Math.abs(n)
  if (abs >= 1e9 || abs < 1e-4) {
    const [m, e] = n.toExponential(decimals).split('e')
    return `${trimZeros(m)}\\times 10^{${Number(e)}}`
  }
  const t = trimZeros(n.toFixed(decimals))
  return t === '-0' ? '0' : t
}

/** A plain-text number made ready for KaTeX: an ASCII minus and a real exponent. */
const toTex = (text: string): string => text.replace('−', '-').replace(/×10\^(-?\d+)/, '\\times 10^{$1}')

/** fmtPrecise for KaTeX: an ASCII minus and a real exponent. */
export function texPrecise(v: number, s: Pick<MeasureSettings, 'decimals' | 'precisionMode'>): string {
  return toTex(fmtPrecise(v, s))
}

/** fmtSci for KaTeX. */
export function texSci(v: number, s: Pick<MeasureSettings, 'decimals' | 'precisionMode'>): string {
  return toTex(fmtSci(v, s))
}

/**
 * The power of ten fmtSci writes for `v`, so a vector can be scaled to the same power as its
 * size. It is read from the rounded form, not from log10: 9.99999×10⁻²⁰ rounds to 1×10⁻¹⁹, and
 * taking the exponent before rounding wrote it as "10×10⁻²⁰".
 */
export function sciExponent(v: number, s: Pick<MeasureSettings, 'decimals' | 'precisionMode'>): number {
  return Number(fmtSci(v, s).match(/×10\^(-?\d+)/)?.[1] ?? 0)
}

/** Number wrapped in parentheses when negative, for substituting into formulas. */
export function texP(n: number, decimals = 4): string {
  const s = tex(n, decimals)
  return n < 0 && Math.abs(n) >= 1e-12 ? `(${s})` : s
}

export const fmtPoint = (p: V3, decimals = 3): string =>
  Math.abs(p[2]) < 1e-12 ? `(${fmt(p[0], decimals)}, ${fmt(p[1], decimals)})` : `(${fmt(p[0], decimals)}, ${fmt(p[1], decimals)}, ${fmt(p[2], decimals)})`

/**
 * The direction in polar notation follows the student's angle unit and precision whenever the
 * whole settings are given; a bare number of decimals means degrees, as the Measurements panel
 * asks for. Hard-wired degrees at 2 d.p. put "R = 5.66 ∠ 45°" directly above "θ = 0.785 rad".
 */
const withAngleUnit = (p: Precision): p is MeasureSettings => typeof p === 'object' && 'angleUnit' in p
function polarDirection(rad: number, p: Precision, forTex: boolean): string {
  if (withAngleUnit(p)) return forTex ? texMeasure(rad, 'direction', p) : formatMeasure(rad, 'direction', p)
  const d = typeof p === 'number' ? p : 2
  if (NOTATION.direction === 'bearing') return forTex ? `\\text{${bearingText(rad, p)}}` : bearingText(rad, p)
  return forTex ? texAngle(rad, 'deg', d) : fmtAngle(rad, 'deg', d)
}

/**
 * "3i + 4j − 2k" style, or whatever the notation setting asks for. `precision` is a number of
 * decimal places or the student's settings, so a solution in significant figures writes its
 * components the same way as its magnitudes.
 */
export function fmtIJK(v: V3, precision: Precision = 3): string {
  if (NOTATION.components === 'pair' || NOTATION.components === 'column') {
    const nums = (Math.abs(v[2]) < 1e-12 ? v.slice(0, 2) : v).map((c) => fmtAt(c, precision))
    return NOTATION.components === 'pair' ? `(${nums.join(', ')})` : `[${nums.join('; ')}]`
  }
  if (NOTATION.components === 'polar' && Math.abs(v[2]) < 1e-12) {
    const m = Math.hypot(v[0], v[1])
    const ang = Math.atan2(v[1], v[0])
    return `${fmtAt(m, precision)} ∠ ${polarDirection(ang < 0 ? ang + 2 * Math.PI : ang, precision, false)}`
  }
  const parts: string[] = []
  const names = ['i', 'j', 'k']
  v.forEach((c, idx) => {
    if (Math.abs(c) < 1e-12) return
    const mag = fmtAt(Math.abs(c), precision)
    const sign = c < 0 ? '−' : '+'
    parts.push(parts.length === 0 ? `${c < 0 ? '−' : ''}${mag}${names[idx]}` : ` ${sign} ${mag}${names[idx]}`)
  })
  return parts.length ? parts.join('') : '0'
}

export function texIJK(v: V3, precision: Precision = 3): string {
  if (NOTATION.components === 'pair') {
    const nums = (Math.abs(v[2]) < 1e-12 ? v.slice(0, 2) : v).map((c) => texAt(c, precision))
    return `\\left(${nums.join(',\\; ')}\\right)`
  }
  if (NOTATION.components === 'column') {
    const nums = (Math.abs(v[2]) < 1e-12 ? v.slice(0, 2) : v).map((c) => texAt(c, precision))
    return `\\begin{pmatrix}${nums.join(' \\\\ ')}\\end{pmatrix}`
  }
  if (NOTATION.components === 'polar' && Math.abs(v[2]) < 1e-12) {
    const m = Math.hypot(v[0], v[1])
    const ang = Math.atan2(v[1], v[0])
    const a = ang < 0 ? ang + 2 * Math.PI : ang
    return `${texAt(m, precision)}\\,\\angle\\,${polarDirection(a, precision, true)}`
  }
  const parts: string[] = []
  const names = ['\\hat{i}', '\\hat{j}', '\\hat{k}']
  v.forEach((c, idx) => {
    if (Math.abs(c) < 1e-12) return
    const mag = texAt(Math.abs(c), precision)
    if (parts.length === 0) parts.push(`${c < 0 ? '-' : ''}${mag}${names[idx]}`)
    else parts.push(` ${c < 0 ? '-' : '+'} ${mag}${names[idx]}`)
  })
  return parts.length ? parts.join('') : '\\vec{0}'
}

export function angleFrom(rad: number, unit: AngleUnit): number {
  if (unit === 'deg') return (rad * 180) / Math.PI
  if (unit === 'grad') return (rad * 200) / Math.PI
  return rad
}

export function angleTo(value: number, unit: AngleUnit): number {
  if (unit === 'deg') return (value * Math.PI) / 180
  if (unit === 'grad') return (value * Math.PI) / 200
  return value
}

export function fmtAngle(rad: number, unit: AngleUnit = 'deg', decimals = 2): string {
  if (Number.isNaN(rad)) return 'undefined'
  if (unit === 'deg' && NOTATION.direction === 'bearing') return bearingText(rad, decimals)
  const v = angleFrom(rad, unit)
  return unit === 'deg' ? `${fmt(v, decimals)}°` : unit === 'grad' ? `${fmt(v, decimals)} grad` : `${fmt(v, 4)} rad`
}

export function texAngle(rad: number, unit: AngleUnit = 'deg', decimals = 2): string {
  const v = angleFrom(rad, unit)
  return unit === 'deg' ? `${tex(v, decimals)}^\\circ` : unit === 'grad' ? `${tex(v, decimals)}\\,\\text{grad}` : `${tex(v, 4)}\\,\\text{rad}`
}

/** Degrees → D°M'S" string (like the calculator's ° ' " key). */
export function toDMS(deg: number): string {
  const sign = deg < 0 ? '−' : ''
  const d = Math.abs(deg)
  let D = Math.floor(d)
  let M = Math.floor((d - D) * 60)
  let S = (d - D - M / 60) * 3600
  if (S >= 59.995) {
    S = 0
    M += 1
  }
  if (M >= 60) {
    M = 0
    D += 1
  }
  return `${sign}${D}°${M}'${fmt(S, 2)}"`
}

/**
 * The inverse of `measureValue`: a number as the student typed it, in whatever unit is on screen,
 * turned back into the world value the scene stores. Typing a measurement to set it needs this,
 * and it has to be the exact mirror of the display or the drawing will drift a little each time.
 */
export function worldValue(shown: number, kind: MeasureKind, s: MeasureSettings): number {
  if (isAngular(kind)) return angleTo(shown, s.angleUnit)
  return shown / Math.pow(s.unitPerSquare, DIM[kind])
}
