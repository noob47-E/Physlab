// What the grid writes beside its lines, kept pure so it can be tested without a canvas.
//
// The ticks used to print the raw grid coordinate with toFixed: a drawing set to "1 square = 2.5 cm"
// still numbered its axes 1, 2, 3, so the picture and the Measure panel disagreed about where
// anything was. Every number here goes through the same unit and scale as every other number.

import { fmtPrecise, measureValue, UNIT_LABELS, type MeasureSettings } from '../math/format'

/** Decimal places needed to write multiples of `step` exactly: 0.25 → 2, 2.5 → 1, 10 → 0. */
export function tickDecimals(step: number): number {
  const s = Math.abs(step)
  if (!Number.isFinite(s) || s === 0) return 0
  for (let d = 0; d <= 12; d++) {
    const scaled = s * Math.pow(10, d)
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9 * Math.max(1, scaled)) return d
  }
  return 12
}

/** Decimals an axis may show when the precision setting gives no number of decimal places. */
const MOST_TICK_DECIMALS = 4

/**
 * The number beside a grid line, in the drawing's unit and scale. Ticks are exact multiples of a
 * nice step, so the step decides how many decimals are shown, not the precision setting: 3 s.f.
 * would turn the axis into 1.00, 2.00, 3.00. The user's decimal places are still the ceiling,
 * because a scale of 0.3333333 cm per square would otherwise number every line to seven places.
 */
export function tickText(v: number, step: number, s: MeasureSettings): string {
  const value = measureValue(v, 'length', s)
  const ceiling = s.precisionMode === 'dp' ? Math.max(1, s.decimals) : MOST_TICK_DECIMALS
  const decimals = Math.min(tickDecimals(measureValue(step, 'length', s)), ceiling)
  return fmtPrecise(value, { decimals, precisionMode: 'dp' })
}

/** The axis name carries the unit once — "x (cm)" — instead of every tick repeating it. */
export function axisTitle(axis: string, s: MeasureSettings): string {
  return s.unit === 'unit' ? axis : `${axis} (${UNIT_LABELS[s.unit]})`
}

/**
 * The angle written beside each ray of the polar grid, at every 30° and every 45°, in the
 * drawing's angle unit. Radians are exact fractions of π written the way a textbook does —
 * π/6, π/4, π/3, π/2, 2π/3 … 11π/6 — never 0.5236; degrees go through the formatter with no
 * decimals, so a ray never reads 30.0°.
 */
export function ringLabels(angleUnit: 'deg' | 'rad'): { angle: number; text: string }[] {
  // Twelfths of a turn that are also sixths, quarters or thirds: every multiple of π/6 and π/4.
  const twelfths = Array.from({ length: 24 }, (_, n) => n).filter((n) => n % 2 === 0 || n % 3 === 0)
  return twelfths.map((n) => ({ angle: (n * Math.PI) / 12, text: angleUnit === 'deg' ? `${fmtPrecise(n * 15, { decimals: 0, precisionMode: 'dp' })}°` : piFraction(n, 12) }))
}

/** `num/den` of π as plain text: 0 → '0', 12/12 → 'π', 2/12 → 'π/6', 9/12 → '3π/4'. */
function piFraction(num: number, den: number): string {
  if (num === 0) return '0'
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const g = gcd(num, den)
  const n = num / g
  const d = den / g
  const top = n === 1 ? 'π' : `${n}π`
  return d === 1 ? top : `${top}/${d}`
}
