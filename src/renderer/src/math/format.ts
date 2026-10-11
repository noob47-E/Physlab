import type { V3 } from './vec'
import type { LengthUnit, SceneSettings } from '../core/types'

export type AngleUnit = 'deg' | 'rad' | 'grad'

// ---------------------------------------------------------------------------
// Notation: every book writes vectors a little differently, so the user chooses
// ---------------------------------------------------------------------------

interface Notation {
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

/**
 * The writer's own floor: fmt, tex, fmtPrecise, fmtIJK, texIJK and fmtPoint write a value under it as
 * 0, or leave the part out (a dragged point's last-bit noise). A line elsewhere that asks "will the
 * writer show this as 0?" — and then writes it in scientific form, or drops a z — names it, so the two
 * never drift apart. It is a screen rule, not a noise rule: rounding noise is judged against the sizes
 * it came from by math/noise.ts, and a known value goes through fmtKnown or fmtSci, which have no floor.
 */
export const DISPLAY_FLOOR = 1e-12

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
// Rounding as a scientific calculator rounds: the decimal the student saw, half away from zero
// ---------------------------------------------------------------------------
//
// toFixed, toPrecision and toExponential round the binary double, not the decimal the student
// typed or saw. A double cannot hold 2.675 — it holds 2.67499999999999982… — so toFixed(2) wrote
// 2.67, and 25.37 ÷ 20 (stored 1.26849999999999996…) read 1.268 at 4 s.f. where the calculator
// shows 1.269. The rule here, in one place: take the shortest decimal that is the double (what
// String() prints, and what the student typed), cut it to the 15 significant figures a
// calculator holds — which only strips a calculation's binary noise, so 0.35 × 3 is 1.05 and
// sin 30° is 0.5 — then round THAT half away from zero, in decimal digits.

/**
 * A finite number as a decimal: its sign, its significant digits with no leading or trailing
 * zeros ('' for zero), and the power of ten of the first digit — 2.675 is ('2675', 0) and
 * 0.00012 is ('12', −4). Rounding is done on these digits, never on the double.
 */
interface Decimal {
  neg: boolean
  digits: string
  exp: number
}

const ZERO: Decimal = { neg: false, digits: '', exp: 0 }

/** The figures a scientific calculator holds. Every double carries 15 faithfully, so cutting there loses nothing real. */
const CALC_FIGURES = 15

/** Whole-number argument, as toFixed takes one; anything unusable counts as 0. */
const whole = (n: number): number => (Number.isFinite(n) ? Math.trunc(n) : 0)

/**
 * The decimal a student saw for `v` (finite). String() gives the shortest decimal that is this
 * double — "2.675", "0.000123", "1.23e-7", "1e+21", "5e-324" — and anything past 15 figures is
 * the binary noise of a calculation (0.35 × 3 prints 1.0499999999999998), so it is rounded off.
 */
function decimalOf(v: number): Decimal {
  let t = String(v)
  const neg = t.charCodeAt(0) === 45 // '-'
  if (neg) t = t.slice(1)
  let e = 0
  const ei = t.indexOf('e')
  if (ei >= 0) {
    e = Number(t.slice(ei + 1))
    t = t.slice(0, ei)
  }
  const dot = t.indexOf('.')
  // The digits as one integer, worth all × 10^(e − frac).
  const frac = dot >= 0 ? t.length - dot - 1 : 0
  let all = dot >= 0 ? t.slice(0, dot) + t.slice(dot + 1) : t
  let lead = 0
  while (lead < all.length && all.charCodeAt(lead) === 48) lead++
  all = all.slice(lead)
  if (all === '') return ZERO
  let end = all.length
  while (all.charCodeAt(end - 1) === 48) end--
  const d: Decimal = { neg, digits: all.slice(0, end), exp: all.length - 1 + e - frac }
  return d.digits.length > CALC_FIGURES ? roundDigits(d, CALC_FIGURES) : d
}

/**
 * Keeps the first `n` significant digits (n may be 0 or less) and rounds half away from zero:
 * the digits are the exact decimal, so a 5 in the first dropped place is a true half or more and
 * rounds the size up whatever follows. Nines carry, and a carry out of the first digit moves the
 * power of ten (9.9995 at 4 figures is 10.00). What rounds to nothing is zero, never −0.
 */
function roundDigits(d: Decimal, n: number): Decimal {
  if (d.digits.length <= n) return d
  if (n < 0) return ZERO
  if (d.digits.charCodeAt(n) < 53) {
    // Below '5' in the first dropped place: keep the digits, less any zeros now at the end.
    let end = n
    while (end > 0 && d.digits.charCodeAt(end - 1) === 48) end--
    return end === 0 ? ZERO : { neg: d.neg, digits: d.digits.slice(0, end), exp: d.exp }
  }
  let i = n - 1
  while (i >= 0 && d.digits.charCodeAt(i) === 57) i-- // '9' carries
  if (i < 0) return { neg: d.neg, digits: '1', exp: d.exp + 1 }
  return { neg: d.neg, digits: d.digits.slice(0, i) + String.fromCharCode(d.digits.charCodeAt(i) + 1), exp: d.exp }
}

/** `v` (finite) rounded to `places` decimal places or to `places` significant figures. */
function roundedDecimal(v: number, places: number, mode: 'dp' | 'sf'): Decimal {
  const d = decimalOf(v)
  if (d.digits === '') return d
  // The last kept digit sits at 10^−places, which is digit number exp + places of the decimal.
  return roundDigits(d, mode === 'sf' ? Math.max(1, whole(places)) : d.exp + whole(places) + 1)
}

/** The decimal written with exactly `places` digits after the point (none when places is 0). */
function writeFixed(d: Decimal, places: number): string {
  const { digits, exp } = d
  const int = exp < 0 || digits === '' ? '0' : digits.length > exp ? digits.slice(0, exp + 1) : digits + '0'.repeat(exp + 1 - digits.length)
  const sign = d.neg ? '-' : ''
  if (places <= 0) return sign + int
  // Digit number exp + 1 of the decimal is the first after the point.
  const first = exp + 1
  const frac = (first < 0 ? '0'.repeat(-first) + digits : digits.slice(first)).slice(0, places).padEnd(places, '0')
  return `${sign}${int}.${frac}`
}

// The exact rule parses String(v) on every call, and that made fmt about three times slower than
// the built-in toFixed it replaced — a Sandbox run formats the clock 60 times a second. But the rule
// and the built-in can only disagree at a halfway point: the rule rounds the 15-figure decimal of the
// double, the built-in rounds the double itself, so away from a halfway point both land on the same
// digit. The helper below says when a value is provably far enough away; every other value takes
// the exact path above, unchanged.

/** 10^k for k = 0…20. Each is a double with no rounding in it (the first that is not is 10^23). */
const POW10 = [1, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15, 1e16, 1e17, 1e18, 1e19, 1e20]

/**
 * |v| × 10^places (for x = |v|, finite, and places ≥ 0) when the built-in `x.toFixed(places)` is
 * provably the digits the exact rule writes at `places`; otherwise −1.
 *
 * Why it is safe. Both round to the nearest whole number of 10^−places, so they agree unless a
 * halfway point k + ½ lies between the two scaled values. Let `s` be x × 10^places in doubles:
 * 10^places is exact, so the product is one rounding, at most 1.2×10⁻¹⁶ of s away from the true
 * product, and that true product is what the built-in rounds. The exact rule rounds D, the
 * 15-figure decimal of x: String() prints a decimal within half a unit of the double's last place
 * (1.2×10⁻¹⁶ of x), and cutting it to 15 figures moves it at most 5×10⁻¹⁵ more, so D × 10^places is
 * within 5.3×10⁻¹⁵ of s, relative. A value whose fraction is further than 10⁻¹⁴ × max(1, s) from ½
 * therefore has no halfway point between the two — nearly twice the worst case, and the 1 keeps
 * the margin absolute where s is under 1. (A subnormal x has fewer than 15 figures to lose, but
 * its s is under 10⁻²⁸⁸, nowhere near a half.) Where a double has lost its fraction (s ≥ 10¹⁵,
 * which also catches Infinity) or 10^places is not exact (places > 20) there is nothing to trust.
 * The two subtractions lose nothing that matters: `s - Math.floor(s)` is a multiple of the double's
 * own spacing below 1, so it is exact, and `frac - 0.5` is exact once frac is within a quarter of ½
 * — the only place the comparison with 10⁻¹⁴ is close — and far from 10⁻¹⁴ before that.
 */
function scaledAwayFromTie(x: number, places: number): number {
  if (places > 20) return -1
  const s = x * POW10[places]
  if (!(s < 1e15)) return -1
  const frac = s - Math.floor(s)
  return Math.abs(frac - 0.5) > 1e-14 * (s > 1 ? s : 1) ? s : -1
}

/**
 * `v` rounded the way a calculator rounds — the decimal the student saw, half away from zero —
 * to `places` decimal places ('dp') or significant figures ('sf'). Number(v.toFixed(n)) rounds
 * the binary double instead (2.675 came out 2.67), and Math.round rounds a half up rather than
 * away from zero (−2.5 came out −2). Returns the double that names the rounded decimal (String()
 * prints it back), +0 for anything that rounds to zero, and a non-finite `v` unchanged. At the
 * very top of the range the rounded decimal may not fit a double (1.7976931348623157e308 to 4 s.f.
 * is Infinity): a writer should format `v` itself with the string helpers below, which work on
 * the digits.
 */
export function roundHalfAway(v: number, places: number, mode: 'dp' | 'sf' = 'dp'): number {
  if (!Number.isFinite(v)) return v
  const d = roundedDecimal(v, places, mode)
  if (d.digits === '') return 0
  return Number(`${d.neg ? '-' : ''}${d.digits}e${d.exp - d.digits.length + 1}`)
}

/**
 * toFixed with the calculator's rounding: exactly `places` decimals and an ASCII "-", but 2.675
 * reads 2.68 (toFixed: 2.67), and a value that rounds away to nothing reads 0.00, never −0.00.
 * Non-finite input is written as String() writes it. Away from a halfway point the built-in
 * toFixed writes the same digits and is used (see scaledAwayFromTie); a value near one is rounded
 * on its decimal digits.
 */
export function toFixedHalfAway(v: number, places: number): string {
  if (!Number.isFinite(v)) return String(v)
  const p = Math.max(0, whole(places))
  const x = Math.abs(v)
  const s = scaledAwayFromTie(x, p)
  if (s >= 0) {
    const text = x.toFixed(p)
    // The sign goes only on what is left to sign: s > ½ rounds to a digit, and a negative that
    // rounds away to nothing reads 0.00, never −0.00. (s is not near ½ here, so this is exact.)
    return v < 0 && s > 0.5 ? `-${text}` : text
  }
  return writeFixed(roundedDecimal(v, p, 'dp'), p)
}

/**
 * toPrecision with the calculator's rounding, always in plain digits (toPrecision switches to
 * "1.23e+3" by itself): exactly `figures` significant figures, keeping the zeros that show them —
 * 2.5 at 3 is 2.50, 123456 at 3 is 123000, 9.9995 at 4 carries to 10.00, 0.0012345 at 4 is
 * 0.001235. Choosing plain or scientific is the caller's business.
 */
export function toPrecisionHalfAway(v: number, figures: number): string {
  if (!Number.isFinite(v)) return String(v)
  const f = Math.max(1, whole(figures))
  const x = Math.abs(v)
  if (x > 0 && f <= 15) {
    // With digits to the right of the point, f figures are toFixed at one place: f − 1 − (the power
    // of ten of the first figure). The power comes from log10, which can be one out right beside a
    // power of ten, so it is not trusted: the value is taken only when x × 10^places is a number of
    // exactly f digits — 10^(f−1) up to 10^f − ½, where a carry into a new decade begins (9.9996 at
    // 4 figures is 10.00, written one place shorter). Then the first figure is at that place whatever
    // log10 said, for the double and for the 15-figure decimal the exact rule rounds (15 figures
    // reach every power of ten, so that decimal is not below 10^(f−1−places) if the double is not),
    // and both round at the same place, to the same digits.
    const places = f - 1 - Math.floor(Math.log10(x))
    if (places >= 0) {
      const s = scaledAwayFromTie(x, places)
      if (s >= POW10[f - 1] && s < POW10[f] - 0.5) {
        const text = x.toFixed(places)
        return v < 0 ? `-${text}` : text
      }
    }
  }
  const d = roundedDecimal(v, f, 'sf')
  if (d.digits === '') return writeFixed(d, f - 1)
  // The last figure sits at 10^(exp − f + 1): that many places after the point, if any.
  return writeFixed(d, f - 1 - d.exp)
}

/**
 * toExponential with the calculator's rounding: "1.269e-13", "6.022e+23", "0.00e+0". The
 * mantissa is rounded before the power is read, so a mantissa that reaches 10 moves the power
 * (9.9995e-20 at 3 places is 1.000e-19, never 10.000e-20). Non-finite input as String().
 */
export function toExponentialHalfAway(v: number, places: number): string {
  if (!Number.isFinite(v)) return String(v)
  const p = Math.max(0, whole(places))
  const d = roundedDecimal(v, p + 1, 'sf')
  const digits = d.digits === '' ? '0' : d.digits
  const mant = p > 0 ? `${digits[0]}.${digits.slice(1).padEnd(p, '0')}` : digits[0]
  const e = d.digits === '' ? 0 : d.exp
  return `${d.neg ? '-' : ''}${mant}e${e < 0 ? '-' : '+'}${Math.abs(e)}`
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

/**
 * Whether a number written by toPrecisionHalfAway lies in [10⁻⁶, 10⁹), where fmtPrecise keeps
 * plain digits. It is read off the digits, which are the number AS ROUNDED: a whole part of ten or
 * more digits is 10⁹ or more (a number under 1 begins "0.", one digit), and a point followed by six
 * zeros is under 10⁻⁶ (1.00×10⁻⁶ is "0.00000100", five).
 */
function inPlainRange(text: string): boolean {
  const start = text.charCodeAt(0) === 45 ? 1 : 0 // '-'
  const dot = text.indexOf('.')
  if ((dot < 0 ? text.length : dot) - start >= 10) return false
  return !text.startsWith('0.000000', start)
}

/** Number with the chosen precision: decimal places or significant figures. */
export function fmtPrecise(v: number, s: Pick<MeasureSettings, 'decimals' | 'precisionMode'>): string {
  if (!Number.isFinite(v)) return fmt(v)
  if (s.precisionMode === 'sf') {
    // The same noise floor as fmt: a point dragged onto the axis reads 0, not 3×10⁻¹⁷.
    if (Math.abs(v) < DISPLAY_FLOOR) return '0'
    // Far outside [10⁻⁶, 10⁹) no rounding can bring a number back in: one at 10⁹ or over rounds to
    // 10⁹ or over, one under 5×10⁻⁷ to 5×10⁻⁷ at most. Those go straight to the scientific writer,
    // so a 1e300 is not first written out as 300 digits of plain zeros only to be thrown away.
    const size = Math.abs(v)
    if (size >= 1e9 || size < 5e-7) return fmtSci(v, s)
    // Round once, in plain digits that keep the zeros showing the precision (3 s.f. of 2.5 reads
    // 2.50), and choose the form on THOSE digits: 999 999 999.9 at 3 s.f. is 1.00×10^9, and deciding
    // on the unrounded value sent it down the plain path, where it came out as "1000000000". The
    // scientific writer rounds `v` by the same rule, so it prints the digits this rounding chose.
    const text = toPrecisionHalfAway(v, Math.max(1, s.decimals))
    return inPlainRange(text) ? text.replace('-', '−') : fmtSci(v, s)
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

/**
 * A known value (an answer, a constant, a result) in the student's precision: as fmtPrecise writes it,
 * but in scientific form under the DISPLAY_FLOOR, where fmtPrecise would write 0 — an electron's
 * 1.6×10⁻¹⁹ N is never "0 N". revealPrecision, roundSig and the Practice reveal all write with it.
 */
export function fmtKnown(x: number, q: Pick<MeasureSettings, 'decimals' | 'precisionMode'>): string {
  return x !== 0 && Math.abs(x) < DISPLAY_FLOOR ? fmtSci(x, q) : fmtPrecise(x, q)
}

/**
 * "m×10^e", rounded as the calculator rounds (toExponential rounded 1.2685×10⁻¹¹ down to
 * 1.268×10⁻¹¹); the mantissa's zeros are kept or trimmed as the caller asks.
 */
function sci(n: number, decimals: number, trim: boolean): string {
  const [m, e] = toExponentialHalfAway(n, decimals).split('e')
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
  return `${measureNumber(v, kind, s)}${unitSuffix(kind, s)}`
}

/** A measure's number alone, in the student's unit and precision: "12", "0.33" — for a list of coordinates that names the unit once, or none. */
export function measureNumber(v: number, kind: MeasureKind, s: MeasureSettings): string {
  return fmtPrecise(measureValue(v, kind, s), s)
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

/**
 * Whether `fmt` and `tex` write `n` (finite, above the noise floor) in powers of ten at `decimals`
 * places. The upper switch is decided on the number AS ROUNDED: 999 999 999.996 at 2 places is
 * 1 000 000 000, and the raw value, a hair under 10⁹, sent it down the plain path as "1000000000" —
 * ten digits, where fmtPrecise in significant figures (which rounds first) writes 1×10^9. The
 * lower switch stays on the raw value (0.000099 at 4 places keeps its 9.9×10^-5). Only a value
 * within half a unit of 10⁹ can round up to it, so everything else skips the rounding.
 */
const inPowersOfTen = (n: number, decimals: number): boolean => {
  const abs = Math.abs(n)
  return abs < 1e-4 || abs >= 1e9 || (abs >= 999999999 && Math.abs(roundHalfAway(n, Math.max(0, whole(decimals)), 'dp')) >= 1e9)
}

/** Human-friendly number: up to `decimals` decimals, trailing zeros trimmed, scientific when huge/tiny. */
export function fmt(n: number, decimals = 4): string {
  if (Number.isNaN(n)) return 'undefined'
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '−∞'
  if (Math.abs(n) < DISPLAY_FLOOR) return '0'
  if (inPowersOfTen(n, decimals)) return sci(n, decimals, true)
  // toFixedHalfAway, not toFixed: 2.675 is 2.68 at 2 places, as the student's calculator says.
  // It also never signs a zero, so a small negative that rounds away reads 0, not "−0": a
  // midpoint at −0.0004 once read "(−0, 5)" and a unit vector "1i − 0j".
  return trimZeros(toFixedHalfAway(n, decimals)).replace('-', '−')
}

/** The raised digits 0–9 a label writes a power of ten with (the raised minus is U+207B). */
const RAISED_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹'

/**
 * Rewrites every "×10^e" that fmt, fmtPrecise or fmtSci wrote inside an already finished plain
 * string into " × 10" and a raised number: "1.49×10^-8i + 3×10^10j" (from fmtIJK) reads
 * "1.49 × 10⁻⁸i + 3 × 10¹⁰j". A label or a line of panel text reads better with a real power, and
 * a caret is programming syntax, which no screen of PhysLab shows. Only the exact form the
 * formatters write is touched — "x^2", LaTeX's "\times 10^{…}", e-notation and a power already
 * raised pass through as they are — so running it twice changes nothing. It is a separate step
 * because fmt, fmtPrecise and fmtSci must keep writing the caret: shownValue, sciExponent and
 * toTex read that form back. The spaces either side of × are no-break spaces (U+00A0), so a narrow
 * panel can never wrap "7.6 ×" away from "10⁹ u".
 */
export function superscriptPowers(text: string): string {
  return text.replace(/×10\^(-?\d+)/g, (_all, e: string) => `\u00a0×\u00a010${e.replace(/\d/g, (d) => RAISED_DIGITS[Number(d)]).replace('-', '⁻')}`)
}

/**
 * A number for a drawing label or a line of panel text: exactly what `fmt` (when `p` is a number
 * of decimal places) or `fmtPrecise` (when `p` is the student's settings) writes — the same
 * rounding, switch to powers of ten, trimmed or kept zeros, U+2212 minus and 10⁻¹² noise floor, and
 * "undefined" and ∞ for what is not a number — except that a power of ten is raised: "8.89 × 10¹⁹",
 * "1.49 × 10⁻⁸", never "8.89×10^19". See superscriptPowers for why. Not for LaTeX (use tex or
 * texPrecise) and not for text a student types back (shownValue reads the caret form).
 */
export function fmtLabel(v: number, p: Precision = 3): string {
  return superscriptPowers(fmtAt(v, p))
}

function trimZeros(s: string): string {
  if (!s.includes('.')) return s
  return s.replace(/\.?0+$/, '')
}

/** LaTeX version of fmt: the same rounding and the same unsigned zero, with an ASCII minus. */
export function tex(n: number, decimals = 4): string {
  if (Number.isNaN(n)) return '\\text{undefined}'
  if (!Number.isFinite(n)) return n > 0 ? '\\infty' : '-\\infty'
  if (Math.abs(n) < DISPLAY_FLOOR) return '0'
  // The same switch as fmt, on the same rounded value.
  if (inPowersOfTen(n, decimals)) {
    const [m, e] = toExponentialHalfAway(n, decimals).split('e')
    return `${trimZeros(m)}\\times 10^{${Number(e)}}`
  }
  return trimZeros(toFixedHalfAway(n, decimals))
}

/** A plain-text number made ready for KaTeX: an ASCII minus and a real exponent. */
const toTex = (text: string): string => text.replace('−', '-').replace(/×10\^(-?\d+)/, '\\times 10^{$1}')

/**
 * fmtPrecise for KaTeX: an ASCII minus and a real exponent. What is not a number is written as
 * `tex` writes it — fmtPrecise's plain "undefined" would reach KaTeX as italic letters and its raw
 * "∞" as a Unicode character, where "\text{undefined}" and "\infty" are meant.
 */
export function texPrecise(v: number, s: Pick<MeasureSettings, 'decimals' | 'precisionMode'>): string {
  return Number.isFinite(v) ? toTex(fmtPrecise(v, s)) : tex(v)
}

/** fmtSci for KaTeX, with the same words for what is not a number as texPrecise. */
export function texSci(v: number, s: Pick<MeasureSettings, 'decimals' | 'precisionMode'>): string {
  return Number.isFinite(v) ? toTex(fmtSci(v, s)) : tex(v)
}

/**
 * The power of ten fmtSci writes for `v`, so a vector can be scaled to the same power as its
 * size. It is read from the rounded form, not from log10: 9.99999×10⁻²⁰ rounds to 1×10⁻¹⁹, and
 * taking the exponent before rounding wrote it as "10×10⁻²⁰".
 */
export function sciExponent(v: number, s: Pick<MeasureSettings, 'decimals' | 'precisionMode'>): number {
  return Number(fmtSci(v, s).match(/×10\^(-?\d+)/)?.[1] ?? 0)
}

/**
 * Number wrapped in parentheses when negative, for substituting into formulas. It is what is
 * WRITTEN that is bracketed: a negative that rounds to nothing is written 0 (never −0), and
 * brackets round a 0 mean nothing.
 */
export function texP(n: number, decimals = 4): string {
  const s = tex(n, decimals)
  return s.startsWith('-') ? `(${s})` : s
}

export const fmtPoint = (p: V3, decimals = 3): string =>
  Math.abs(p[2]) < DISPLAY_FLOOR ? `(${fmt(p[0], decimals)}, ${fmt(p[1], decimals)})` : `(${fmt(p[0], decimals)}, ${fmt(p[1], decimals)}, ${fmt(p[2], decimals)})`

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
 * components the same way as its magnitudes. In i, j, k form a component whose shown size is 0
 * is left out, as an exact zero is: a unit vector with −0.0004 as its second component is "1i",
 * not "1i − 0j" (the pair, column and polar forms write the unsigned 0 that fmt gives).
 */
export function fmtIJK(v: V3, precision: Precision = 3): string {
  if (NOTATION.components === 'pair' || NOTATION.components === 'column') {
    const nums = (Math.abs(v[2]) < DISPLAY_FLOOR ? v.slice(0, 2) : v).map((c) => fmtAt(c, precision))
    return NOTATION.components === 'pair' ? `(${nums.join(', ')})` : `[${nums.join('; ')}]`
  }
  if (NOTATION.components === 'polar' && Math.abs(v[2]) < DISPLAY_FLOOR) {
    const m = Math.hypot(v[0], v[1])
    const ang = Math.atan2(v[1], v[0])
    return `${fmtAt(m, precision)} ∠ ${polarDirection(ang < 0 ? ang + 2 * Math.PI : ang, precision, false)}`
  }
  const parts: string[] = []
  const names = ['i', 'j', 'k']
  v.forEach((c, idx) => {
    if (Math.abs(c) < DISPLAY_FLOOR) return
    const mag = fmtAt(Math.abs(c), precision)
    // Left out like an exact zero: the sign of a size that shows as 0 is not information.
    if (mag === '0') return
    const sign = c < 0 ? '−' : '+'
    parts.push(parts.length === 0 ? `${c < 0 ? '−' : ''}${mag}${names[idx]}` : ` ${sign} ${mag}${names[idx]}`)
  })
  return parts.length ? parts.join('') : '0'
}

export function texIJK(v: V3, precision: Precision = 3): string {
  if (NOTATION.components === 'pair') {
    const nums = (Math.abs(v[2]) < DISPLAY_FLOOR ? v.slice(0, 2) : v).map((c) => texAt(c, precision))
    return `\\left(${nums.join(',\\; ')}\\right)`
  }
  if (NOTATION.components === 'column') {
    const nums = (Math.abs(v[2]) < DISPLAY_FLOOR ? v.slice(0, 2) : v).map((c) => texAt(c, precision))
    return `\\begin{pmatrix}${nums.join(' \\\\ ')}\\end{pmatrix}`
  }
  if (NOTATION.components === 'polar' && Math.abs(v[2]) < DISPLAY_FLOOR) {
    const m = Math.hypot(v[0], v[1])
    const ang = Math.atan2(v[1], v[0])
    const a = ang < 0 ? ang + 2 * Math.PI : ang
    return `${texAt(m, precision)}\\,\\angle\\,${polarDirection(a, precision, true)}`
  }
  const parts: string[] = []
  const names = ['\\hat{i}', '\\hat{j}', '\\hat{k}']
  v.forEach((c, idx) => {
    if (Math.abs(c) < DISPLAY_FLOOR) return
    const mag = texAt(Math.abs(c), precision)
    // As fmtIJK: a component that shows as 0 is left out.
    if (mag === '0') return
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

/**
 * Degrees → D°M'S" string (like the calculator's ° ' " key).
 *
 * The whole angle is rounded first, to hundredths of a second, and only then split into degrees,
 * minutes and seconds in whole numbers, so the carry is decided on the seconds as shown. The carry
 * was once decided on the raw double (S ≥ 59.995): 59.995″ is stored as 59.99499999999999, so the
 * minute did not carry and the seconds read 59.99″ — or 60″ once they are rounded as a calculator
 * rounds. And splitting off the degrees before rounding left 12°34′59.995″ with seconds of
 * 59.99499999999776, noise too large for the 15-figure step, which read 59.99″.
 */
export function toDMS(deg: number): string {
  const hundredths = Math.round(roundHalfAway(Math.abs(deg) * 3600, 2) * 100)
  const D = Math.floor(hundredths / 360000)
  const M = Math.floor((hundredths % 360000) / 6000)
  const S = (hundredths % 6000) / 100
  // As in every other writer, an angle that rounds to nothing carries no sign.
  const sign = deg < 0 && hundredths > 0 ? '−' : ''
  return `${sign}${D}°${M}'${fmt(S, 2)}"`
}

// ---------------------------------------------------------------------------
// Step-by-step working: every line true as written (Fix 4)
// ---------------------------------------------------------------------------

/** Precision with only the part a number needs: decimal places or significant figures. */
export type DigitSettings = Pick<MeasureSettings, 'decimals' | 'precisionMode'>

/** How many digits past the student's own a working line may add before it gives up and writes ≈. */
export const STEP_GUARD_MAX = 6

/**
 * The number a calculator is given when a student types a value exactly as the screen shows it:
 * "−2.5" is −2.5, "1.6×10^-19" is 1.6e-19, "8.66°" is 8.66. The unit is the caller's business.
 */
export function shownValue(text: string): number {
  const t = text.replace(/−/g, '-').replace(/\\times\s*10\^\{(-?\d+)\}/, 'e$1').replace(/×10\^(-?\d+)/, 'e$1')
  const m = t.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/)
  return m ? Number(m[0]) : NaN
}

/** The student's precision with `extra` more digits, in the same mode (places or figures). */
export const morePrecise = <S extends DigitSettings>(s: S, extra: number): S => ({ ...s, decimals: s.decimals + extra })

/**
 * THE rule for every line of step-by-step working, in one place.
 *
 * A student copies working into a notebook and checks it on a calculator, typing each number
 * exactly as the screen shows it. So a line such as "10 cos 30° = 10 × 0.87 = 8.66" is false
 * (10 × 0.87 is 8.7), even though 8.66 is the right value of 10 cos 30°. Rounding the middle
 * number is what broke it; rounding the answer is what the student asked for.
 *
 * The rule: a number that a line calculates WITH is written with as many digits as it takes for
 * that calculation, done from the numbers as written, to give the line's result as written. The
 * student's own precision is the fewest digits ever used; digits are added one at a time, and
 * only where they are needed. Results — and every answer — are always the true value rounded to
 * the student's precision, never a value rebuilt from rounded pieces, so the extra digits change
 * no answer. The same quantity may therefore appear as 0.39 where it is an answer and 0.3928
 * where the next line divides by it; both are that number, rounded for its job.
 *
 * `agrees(q)` says whether the line holds when its operands are written at precision q. The
 * result is the precision to write them at, and `holds: false` when even STEP_GUARD_MAX extra
 * digits cannot make it true (a result sitting exactly on a rounding boundary) — the caller
 * then writes ≈ instead of =, which is what a textbook does.
 */
export function stepPrecision<S extends DigitSettings>(s: S, agrees: (q: S) => boolean): { q: S; holds: boolean } {
  for (let extra = 0; extra <= STEP_GUARD_MAX; extra++) {
    const q = morePrecise(s, extra)
    if (agrees(q)) return { q, holds: true }
  }
  return { q: morePrecise(s, STEP_GUARD_MAX), holds: false }
}

/**
 * The binary-noise floor added to an answer's stated band when it is marked: 10⁻⁹ of the answer's
 * own size. Doubles get the last bit of a sum wrong — 0.1 + 0.2 is 0.30000000000000004, and 70 cm
 * in metres is 0.7000000000000001 — so a part marked exactly (a band of 0) compared on doubles
 * marked a student's exact "0.3" or "70 cm" wrong. 10⁻⁹ is far above that noise (10⁻¹⁶ of the
 * value) and far below any rounding a student does. It is relative, never an absolute amount:
 * physics answers are tiny in SI units, and an absolute 10⁻⁹ would swamp a 2 % band on a charge of
 * 1.6×10⁻¹⁹ C and mark "0" right. An answer of several numbers (a vector's components, a set of
 * roots, a matrix's entries) passes its largest size as `largest`, and each number's floor is 10⁻⁹
 * of the larger of its own size and a millionth of that: a zero worked out as 6×10⁻¹⁷ among numbers
 * of size 1 (cos 90°) is still a zero (its floor is 10⁻¹⁵), while a root of 2 beside a root of 10⁹
 * keeps its own 2 % band plus only 10⁻⁶ (10⁻⁹ of the larger root would add 1, and
 * "3, 1000000000" was marked right). A lone answer of exactly 0 has no size and so no floor: a
 * zero worked out as 10⁻¹⁷ needs its author's own tolerance (docs/ACCURACY.md). Nor has an answer
 * worked out as infinity (an author's 1/(a − b) at a = b): 10⁻⁹ of it is ∞, which took every number
 * typed as right in a box the player had flagged "cannot mark", so its floor is 0.
 */
export function noiseFloor(value: number, largest: number = value): number {
  const floor = 1e-9 * Math.max(Math.abs(value), 1e-6 * Math.abs(largest))
  return Number.isFinite(floor) ? floor : 0
}

/**
 * The precision a KNOWN answer is revealed at, so that typing back what the screen shows marks
 * right. `show` is the formatter the caller writes the number with (plain or scientific), read
 * back by `shownValue`, so every test is made on exactly the text on screen. The default writes a
 * tiny answer in powers of ten: fmtPrecise writes anything under 10⁻¹² as 0, right for a dragged
 * point's noise and wrong for a known 1.6×10⁻¹⁹ C.
 *
 * With a band `tol`: the student's own precision whenever its rounding stays within half the
 * band; otherwise three significant figures, then four, and so on — never fewer than one more
 * than a student on significant figures asked for. At 2 d.p. Charles's law revealed 0.0538 m³ as
 * "0.05 m³", and typed back that was 7 % off a 2 % band — "Right method — just rounded a little
 * early" under the very answer PhysLab had just given. The search goes on to 15 figures, all a
 * double holds faithfully (CALC_FIGURES): it once stopped at six, and 12345.67 ± 0.0002 was
 * revealed as "12345.7", 0.03 away from an answer whose band is 0.0002.
 *
 * Marked exactly (`tol` 0, negative or NaN) there is no band to fit inside, and the student's own
 * precision was kept: at 1 s.f. 12 was revealed as "10", and typed back that was wrong under the
 * answer PhysLab had just given. So the answer is shown exactly — "exactly" meaning equal after
 * both are cut to 15 significant figures, which strips only the arithmetic's binary noise
 * (0.1 + 0.2 reads "0.3", never 0.30000000000000004). The student's own precision when it already
 * does that; otherwise the FEWEST significant figures that do, from one more than the student's
 * own (on significant figures) or from 1 (on decimal places): 12 at 1 s.f. reads "12", 6.3 at
 * 0 d.p. "6.3", 2.675 at 2 d.p. "2.675". The fewest, because past them come only trailing zeros,
 * which in an exact answer would claim a measurement's precision it never had ("12.0"). The search
 * stops at 15 figures, which always show a double exactly in this sense.
 */
export function revealPrecision<S extends DigitSettings>(
  v: number,
  tol: number,
  s: S,
  show: (x: number, q: S) => string = fmtKnown
): S {
  if (!Number.isFinite(v)) return s
  const figures = (digits: number): S => ({ ...s, precisionMode: 'sf', decimals: digits })
  if (!(tol > 0)) {
    const exact = roundHalfAway(v, CALC_FIGURES, 'sf')
    const shownExactly = (q: S): boolean => roundHalfAway(shownValue(show(v, q)), CALC_FIGURES, 'sf') === exact
    if (shownExactly(s)) return s
    for (let digits = s.precisionMode === 'sf' ? s.decimals + 1 : 1; digits < CALC_FIGURES; digits++) {
      if (shownExactly(figures(digits))) return figures(digits)
    }
    return figures(CALC_FIGURES)
  }
  const holds = (q: S): boolean => Math.abs(shownValue(show(v, q)) - v) <= tol / 2
  if (holds(s)) return s
  // Never fewer figures than the student already asked for.
  const from = s.precisionMode === 'sf' ? Math.max(3, s.decimals + 1) : 3
  for (let digits = from; digits < CALC_FIGURES; digits++) {
    if (holds(figures(digits))) return figures(digits)
  }
  return figures(Math.max(CALC_FIGURES, from))
}

/** "=" when a working line holds as written, "≈" when rounding means it can only be close. */
export const stepEq = (holds: boolean): string => (holds ? '=' : '\\approx')

/**
 * The inverse of `measureValue`: a number as the student typed it, in whatever unit is on screen,
 * turned back into the world value the scene stores. Typing a measurement to set it needs this,
 * and it has to be the exact mirror of the display or the drawing will drift a little each time.
 */
export function worldValue(shown: number, kind: MeasureKind, s: MeasureSettings): number {
  if (isAngular(kind)) return angleTo(shown, s.angleUnit)
  return shown / Math.pow(s.unitPerSquare, DIM[kind])
}

// ---------------------------------------------------------------------------
// Significant-figure rounding (the calculator's card) — thin wrappers that
// choose the right writer for the size of the number
// ---------------------------------------------------------------------------

/**
 * `v` rounded to `n` significant figures and written as the rest of PhysLab writes it: the
 * digits the student sees, half away from zero (25.37 ÷ 20 = 1.2685 is 1.269 at 4 figures, 2.675
 * is 2.68 at 3), the zeros that are figures kept (1.2 at 4 is 1.200), the app's own minus, and a
 * real power of ten — never "1.23e+5" — once a number is too big or small for plain digits. This
 * used to be Number(v.toPrecision(n)).toPrecision(n), which rounds the binary double behind the
 * number: 1.2685 is stored just under the half and read 1.268.
 */
export function roundSig(v: number, n: number): string {
  const s: DigitSettings = { decimals: n, precisionMode: 'sf' }
  // fmtPrecise calls anything under 10⁻¹² zero, right for a length dragged onto the axis and wrong
  // for the charge on an electron (calcNum splits it off for the same reason): fmtSci has no floor.
  return superscriptPowers(fmtKnown(v, s))
}

/**
 * A number in scientific notation as the Measure card writes it, "4.560 × 10⁻³": `figures` digits
 * (the typed number's own count, so 0.004560 keeps its last zero), rounded as roundSig rounds, with a
 * real raised power — the card used to write "4.560 × 10^-3" and "3.20 × 10^+4", a caret and a plus
 * no student writes. A double holds 15 figures: a longer typed number has no more real digits to
 * show, and toExponential printed its binary noise instead.
 */
export function sciNotation(v: number, figures: number): string {
  return superscriptPowers(fmtSci(v, { decimals: Math.min(15, figures), precisionMode: 'sf' }))
}
