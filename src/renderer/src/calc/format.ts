// How the calculator writes a number: through the student's own precision setting.
//
// The engine used to keep a private ten-significant-figure formatter, and thirty call sites in
// the panels overrode its digit count by hand, so the calculator was the one place in PhysLab
// that ignored the precision the student had chosen (Rule 4: everything shown has the user's
// precision). The digits now come from fmtPrecise; this file only adds what a calculator needs
// on top — the error words, engineering notation, and never showing 0 for something that is not.

import { fmtPrecise, type MeasureSettings } from '../math/format'

export type CalcPrecision = Pick<MeasureSettings, 'decimals' | 'precisionMode'>

/**
 * Where the precision comes from. The panel points this at the scene settings when it loads;
 * until then (and in the tests) a calculator's usual ten significant figures apply. A provider
 * rather than an import of the scene store, because the store already reaches calc/engine.ts
 * through the lab's fitting code and a second path back would close a circle.
 */
let source: () => CalcPrecision = () => ({ decimals: 10, precisionMode: 'sf' })

export const setCalcPrecisionSource = (fn: () => CalcPrecision): void => {
  source = fn
}

export const calcPrecision = (): CalcPrecision => source()

/**
 * A number as the calculator shows it.
 *
 * A value too small for the chosen decimal places must not read as zero — 1/1000 at two
 * decimal places is 0.0010, not 0 — so such a value is written to the same number of
 * significant figures instead. Exponent form for very large and very small values comes from
 * fmtPrecise itself.
 */
export function calcNum(v: number, s: CalcPrecision = calcPrecision()): string {
  if (Number.isNaN(v)) return 'Math ERROR'
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞'
  if (v === 0) return '0'
  // fmtPrecise calls anything below 10⁻¹² zero, which is right for a length on the grid and
  // wrong for the charge on an electron. The digits still come from it; only the power of ten
  // is split off here.
  if (Math.abs(v) < 1e-12) return exponentForm(v, s)
  const text = fmtPrecise(v, s)
  // Decimal places are a floor on the figures shown, not a ceiling on the information: at two
  // places the fine-structure constant is 0.0073, not 0.01, and 1/1000 is 0.0010, not 0.
  if (s.precisionMode === 'dp' && Math.abs(v) < 1 && sigFiguresIn(text) < Math.max(1, s.decimals)) {
    return trimZeros(fmtPrecise(v, { decimals: Math.max(1, s.decimals), precisionMode: 'sf' }))
  }
  return trimZeros(text)
}

/** How many significant figures a written number carries: 0.0073 has two, 0.01 has one, 0 none. */
function sigFiguresIn(text: string): number {
  const digits = text.replace(/[^0-9]/g, '').replace(/^0+/, '')
  return digits.length
}

/** m×10^e with the mantissa written to the chosen number of significant figures. */
function exponentForm(v: number, s: CalcPrecision): string {
  const digits = Math.max(1, s.decimals)
  let e = Math.floor(Math.log10(Math.abs(v)))
  let mant = fmtPrecise(v / 10 ** e, { decimals: digits, precisionMode: 'sf' })
  // 9.99… rounds up to 10 at few figures; that is one more power of ten, not a two-digit
  // mantissa. The rounded value is then exactly one power of ten, so the mantissa is 1: formatting
  // again would round 0.95 down to 0.9 and print 0.9×10⁻¹² for 9.5×10⁻¹³.
  if (/^[−-]?10/.test(mant)) {
    e += 1
    mant = `${v < 0 ? '−' : ''}1`
  }
  return `${trimZeros(mant)}×10^${e}`
}

/**
 * A calculator's answer is a number, not a measurement: 5 is 5, never 5.000000000. fmtPrecise
 * keeps the zeros on purpose for measured values (2.50 cm at three figures says how well it was
 * measured); the decimal-places mode already trims them, so this makes both modes agree here.
 */
function trimZeros(text: string): string {
  const [mant, exp = ''] = text.split(/(×10\^.*)$/)
  return (mant.includes('.') ? mant.replace(/\.?0+$/, '') : mant) + exp
}

/** Engineering notation: the exponent a multiple of three, the digits still the student's. */
export function calcEng(v: number, s: CalcPrecision = calcPrecision()): string {
  if (!Number.isFinite(v) || v === 0) return calcNum(v, s)
  const e = Math.floor(Math.log10(Math.abs(v)) / 3) * 3
  return `${calcNum(v / 10 ** e, s)}×10^${e}`
}

/** The precision as mathjs wants it, for complex numbers, matrices and units. */
export function mathFormatOptions(s: CalcPrecision = calcPrecision()): { notation?: 'fixed'; precision: number } {
  return s.precisionMode === 'sf' ? { precision: Math.max(1, s.decimals) } : { notation: 'fixed', precision: s.decimals }
}
