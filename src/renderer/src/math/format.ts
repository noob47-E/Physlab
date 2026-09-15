import type { V3 } from './vec'
import type { LengthUnit, SceneSettings } from '../core/types'

export type AngleUnit = 'deg' | 'rad' | 'grad'

// ---------------------------------------------------------------------------
// Measurements with units and precision (one place for every displayed value)
// ---------------------------------------------------------------------------

export type MeasureKind = 'length' | 'area' | 'volume' | 'angle' | 'number'
export type MeasureSettings = Pick<SceneSettings, 'decimals' | 'precisionMode' | 'unit' | 'unitPerSquare' | 'angleUnit'>

export const UNIT_LABELS: Record<LengthUnit, string> = { unit: 'u', mm: 'mm', cm: 'cm', m: 'm', km: 'km', in: 'in', ft: 'ft' }
export const UNIT_NAMES: Record<LengthUnit, string> = { unit: 'grid units', mm: 'millimetres', cm: 'centimetres', m: 'metres', km: 'kilometres', in: 'inches', ft: 'feet' }

/** Number with the chosen precision: decimal places or significant figures. */
export function fmtPrecise(v: number, s: Pick<MeasureSettings, 'decimals' | 'precisionMode'>): string {
  if (!Number.isFinite(v)) return fmt(v)
  if (s.precisionMode === 'sf') {
    if (v === 0) return '0'
    const abs = Math.abs(v)
    if (abs >= 1e9 || abs < 1e-6) return fmt(Number(v.toPrecision(Math.max(1, s.decimals))), Math.max(1, s.decimals))
    return Number(v.toPrecision(Math.max(1, s.decimals))).toString().replace('-', '−')
  }
  return fmt(v, s.decimals)
}

const DIM: Record<MeasureKind, number> = { length: 1, area: 2, volume: 3, angle: 0, number: 0 }

/** Converts a world (grid) value into the chosen real unit. */
export function measureValue(v: number, kind: MeasureKind, s: MeasureSettings): number {
  if (kind === 'angle') return angleFrom(v, s.angleUnit)
  return v * Math.pow(s.unitPerSquare, DIM[kind])
}

export function unitSuffix(kind: MeasureKind, s: MeasureSettings): string {
  if (kind === 'angle') return s.angleUnit === 'deg' ? '°' : ' rad'
  if (kind === 'number') return ''
  const u = UNIT_LABELS[s.unit]
  return ` ${u}${DIM[kind] === 2 ? '²' : DIM[kind] === 3 ? '³' : ''}`
}

/** "12 cm²", "53.13°", "5 u". */
export function formatMeasure(v: number, kind: MeasureKind, s: MeasureSettings): string {
  return `${fmtPrecise(measureValue(v, kind, s), s)}${unitSuffix(kind, s)}`
}

/** LaTeX version: "12\,\text{cm}^2". */
export function texMeasure(v: number, kind: MeasureKind, s: MeasureSettings, withUnit = true): string {
  const n = fmtPrecise(measureValue(v, kind, s), s).replace('−', '-').replace(/×10\^(-?\d+)/, '\\times 10^{$1}')
  if (!withUnit || kind === 'number') return n
  if (kind === 'angle') return s.angleUnit === 'deg' ? `${n}^\\circ` : `${n}\\,\\text{rad}`
  const d = DIM[kind]
  return `${n}\\,\\text{${UNIT_LABELS[s.unit]}}${d > 1 ? `^${d}` : ''}`
}

export function texUnit(kind: MeasureKind, s: MeasureSettings): string {
  if (kind === 'angle') return s.angleUnit === 'deg' ? '^\\circ' : '\\,\\text{rad}'
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
  if (abs >= 1e9 || abs < 1e-4) {
    const [m, e] = n.toExponential(decimals).split('e')
    return `${trimZeros(m)}×10^${Number(e)}`
  }
  return trimZeros(n.toFixed(decimals)).replace('-', '−')
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
  return trimZeros(n.toFixed(decimals))
}

/** Number wrapped in parentheses when negative, for substituting into formulas. */
export function texP(n: number, decimals = 4): string {
  const s = tex(n, decimals)
  return n < 0 && Math.abs(n) >= 1e-12 ? `(${s})` : s
}

export const fmtPoint = (p: V3, decimals = 3): string =>
  Math.abs(p[2]) < 1e-12 ? `(${fmt(p[0], decimals)}, ${fmt(p[1], decimals)})` : `(${fmt(p[0], decimals)}, ${fmt(p[1], decimals)}, ${fmt(p[2], decimals)})`

/** "3i + 4j − 2k" style. */
export function fmtIJK(v: V3, decimals = 3): string {
  const parts: string[] = []
  const names = ['i', 'j', 'k']
  v.forEach((c, idx) => {
    if (Math.abs(c) < 1e-12) return
    const mag = fmt(Math.abs(c), decimals)
    const sign = c < 0 ? '−' : '+'
    parts.push(parts.length === 0 ? `${c < 0 ? '−' : ''}${mag}${names[idx]}` : ` ${sign} ${mag}${names[idx]}`)
  })
  return parts.length ? parts.join('') : '0'
}

export function texIJK(v: V3, decimals = 3): string {
  const parts: string[] = []
  const names = ['\\hat{i}', '\\hat{j}', '\\hat{k}']
  v.forEach((c, idx) => {
    if (Math.abs(c) < 1e-12) return
    const mag = tex(Math.abs(c), decimals)
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
  let d = Math.abs(deg)
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
