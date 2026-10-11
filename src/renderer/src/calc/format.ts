// How the calculator writes a number: through the student's own precision setting.
//
// The engine used to keep a private ten-significant-figure formatter, and thirty call sites in
// the panels overrode its digit count by hand, so the calculator was the one place in PhysLab
// that ignored the precision the student had chosen (Rule 4: everything shown has the user's
// precision). The digits now come from fmtPrecise; this file only adds what a calculator needs
// on top — the error words, engineering notation, and never showing 0 for something that is not.

import { DISPLAY_FLOOR, fmtPrecise, toExponentialHalfAway, type MeasureSettings } from '../math/format'

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

const calcPrecision = (): CalcPrecision => source()

/**
 * A number as the calculator shows it.
 *
 * A value too small for the chosen decimal places must not read as zero — 1/1000 at two
 * decimal places is 0.0010, not 0 — so such a value is written to the same number of
 * significant figures instead. Exponent form for very large and very small values comes from
 * fmtPrecise itself.
 */
export function calcNum(v: number, s: CalcPrecision = calcPrecision()): string {
  // Words, not a handheld's "ERROR": a cell of a table or a distribution with no value says so.
  if (Number.isNaN(v)) return 'no value'
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞'
  if (v === 0) return '0'
  // fmtPrecise calls anything below 10⁻¹² zero, which is right for a length on the grid and
  // wrong for the charge on an electron. The digits still come from it; only the power of ten
  // is split off here.
  if (Math.abs(v) < DISPLAY_FLOOR) return exponentForm(v, s)
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

/**
 * m×10^e with the mantissa written to the chosen number of significant figures. Mantissa and
 * power come from one rounding of `v` itself: dividing by 10^e first made a new double with binary
 * error of its own (1.2685×10⁻¹³ ÷ 10⁻¹³ is stored just below 1.2685, so it read 1.268), and a
 * mantissa that rounds up to 10 must move the power — 9.9995×10⁻¹³ at 4 figures is 1×10⁻¹²,
 * never 10×10⁻¹³ — which the rounding does itself.
 */
function exponentForm(v: number, s: CalcPrecision): string {
  const [mant, e] = toExponentialHalfAway(v, Math.max(1, s.decimals) - 1).split('e')
  return `${trimZeros(mant).replace('-', '−')}×10^${Number(e)}`
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

/**
 * Engineering notation: the exponent a multiple of three, the digits still the student's, trimmed
 * as calcNum trims them.
 *
 * The digits are read from one rounding of `v`, not from v ÷ 10^e — that division adds binary
 * error of its own (1268.5 ÷ 1000 is stored 1.26849999999999996…, which read 1.268) — and the
 * power of three is chosen from the ROUNDED value: 999.95 at 4 figures is 1000, which is 1×10^3,
 * and choosing on the raw value wrote "1000×10^0" (0.00099995 likewise read "1000×10^-6").
 */
export function calcEng(v: number, s: CalcPrecision = calcPrecision()): string {
  if (!Number.isFinite(v) || v === 0) return calcNum(v, s)
  const band = (x: number): number => Math.floor(x / 3) * 3
  let figures = Math.max(1, s.decimals)
  if (s.precisionMode === 'dp') {
    // As many figures as reach the student's places in the mantissa v ÷ 10^band, counted from
    // the first figure of the decimal the student saw (all 15 figures, so not yet rounded).
    const first = Number(toExponentialHalfAway(v, 14).split('e')[1])
    figures = first - band(first) + 1 + s.decimals
  }
  const [mant, power] = toExponentialHalfAway(v, figures - 1).split('e')
  // The band comes from the rounded power. A carry leaves exactly a power of ten, so when it
  // carries into the next band (999.996 → 1000.00 at 2 places) the coarser places of that band
  // would round to the same 1×10^3: no second rounding is needed, as the zeros are trimmed.
  const x = Number(power)
  const e = band(x)
  // Move the point x − e places right: 1.269e+4 is 12.69×10^3.
  const digits = mant.replace('-', '').replace('.', '')
  const whole = digits.slice(0, x - e + 1).padEnd(x - e + 1, '0')
  const rest = digits.slice(x - e + 1)
  const text = `${mant.startsWith('-') ? '−' : ''}${rest ? `${whole}.${rest}` : whole}`
  return `${trimZeros(text)}×10^${e}`
}

/**
 * What mathjs's formatter is handed for complex numbers, matrices and units: a callback that writes
 * every number in them (a complex number's parts, each entry, a unit's value) with calcNum, so it
 * rounds the decimal the student saw, half away from zero, as a number on its own does. Handing
 * mathjs a precision instead let it round the binary double — 0.35 × 3, stored 1.0499999999999998,
 * read "1.0" at one decimal place where the same number alone reads 1.1 — pad 2.00i, and switch to
 * e-notation ("1.235e+5") from 10⁵.
 */
export function mathFormatOptions(s: CalcPrecision = calcPrecision()): (value: unknown) => string {
  // mathjs hands a BigNumber over as itself, not as a number.
  return (value) => calcNum(typeof value === 'number' ? value : Number(value), s)
}

/**
 * The imaginary part of a number without its sign, as a student writes it: i, 2i, 1.5i. A part that
 * is 1 once written (1, or 0.99999999999 at ten figures) is just i, never 1i.
 */
export function formatImaginary(im: number, num: (n: number) => string = calcNum): string {
  const magnitude = num(Math.abs(im))
  return magnitude === '1' ? 'i' : `${magnitude}i`
}

/**
 * ONE complex number as a student writes it — 2i, −i, −2 + 3i — and the only place that decides how.
 * Numbers and Complex mode (formatValue), Equations mode's rows, the "no real solution" sentence of
 * x = ? and the command bar's decimal beside an exact root all come through here, so one root never
 * reads "0 + 2i" on one screen and "2i" on the next (polish item P7).
 *
 * `num` writes one number the way its screen does (calcNum on the Maths screen, texAt in the bar)
 * and writes the sign of a negative real part itself. The minus between the parts and in front of
 * the i is the typographic − in text and the plain - in TeX.
 */
export function formatComplex(re: number, im: number, num: (n: number) => string = calcNum, style: 'text' | 'tex' = 'text'): string {
  const minus = style === 'tex' ? '-' : '−'
  if (im === 0) return num(re)
  if (re === 0) return `${im < 0 ? minus : ''}${formatImaginary(im, num)}`
  return `${num(re)} ${im < 0 ? minus : '+'} ${formatImaginary(im, num)}`
}
