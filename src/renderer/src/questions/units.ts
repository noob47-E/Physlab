// Units for question parts. A part's answer, a variable's value and what a student types can
// each carry a unit; this module is the one place that knows what each `UnitId` means in SI
// terms, so a wrong-unit answer gets a plain sentence instead of a silently wrong mark.
// Headless: no React, no store, no DOM.

import type { ConstantNode, FunctionNode, MathNode, OperatorNode, ParenthesisNode, SymbolNode } from 'mathjs'
import type { LengthUnit } from '../core/types'
import { math, preprocess } from '../math/expr'
import { fmtPrecise, fmtSci, revealPrecision, texPrecise, texSci, type MeasureSettings } from '../math/format'
import { UNIT_IDS, type UnitId } from './pqjson'

export type Precision = Pick<MeasureSettings, 'decimals' | 'precisionMode'>

/**
 * A physical dimension as powers of the seven SI base quantities, in the fixed order
 * [length, mass, time, current, temperature, amount, angle]. Angle is not an SI base quantity —
 * radians are dimensionless — but it is kept as its own slot so `rad/s` and `Hz` (both "per
 * second" in bare SI terms) are never treated as the same thing.
 */
export type Dim = readonly [number, number, number, number, number, number, number]

const D = (m: number, kg: number, s: number, A: number, K: number, mol: number, rad: number): Dim => [m, kg, s, A, K, mol, rad]

const NONE = D(0, 0, 0, 0, 0, 0, 0)
const LENGTH = D(1, 0, 0, 0, 0, 0, 0)
const AREA = D(2, 0, 0, 0, 0, 0, 0)
const VOLUME = D(3, 0, 0, 0, 0, 0, 0)
const TIME = D(0, 0, 1, 0, 0, 0, 0)
const MASS = D(0, 1, 0, 0, 0, 0, 0)
const FORCE = D(1, 1, -2, 0, 0, 0, 0)
const ENERGY = D(2, 1, -2, 0, 0, 0, 0)
const POWER = D(2, 1, -3, 0, 0, 0, 0)
const PRESSURE = D(-1, 1, -2, 0, 0, 0, 0)
const VELOCITY = D(1, 0, -1, 0, 0, 0, 0)
const ACCEL = D(1, 0, -2, 0, 0, 0, 0)
const ANGLE = D(0, 0, 0, 0, 0, 0, 1)
const ANGULAR_VEL = D(0, 0, -1, 0, 0, 0, 1)
const FREQ = D(0, 0, -1, 0, 0, 0, 0)
const CHARGE = D(0, 0, 1, 1, 0, 0, 0)
const VOLTAGE = D(2, 1, -3, -1, 0, 0, 0)
const CURRENT = D(0, 0, 0, 1, 0, 0, 0)
const RESISTANCE = D(2, 1, -3, -2, 0, 0, 0)
const TEMPERATURE = D(0, 0, 0, 0, 1, 0, 0)
const AMOUNT = D(0, 0, 0, 0, 0, 1, 0)
const MOMENTUM = D(1, 1, -1, 0, 0, 0, 0)

export interface UnitInfo {
  /** How the unit is written after a number: "m/s", "°", "Ω". */
  label: string
  /** In words, for a "that is in <name>" sentence: "metres per second". */
  name: string
  dim: Dim
  /** Multiply a value in this unit by `toSI` to get the SI base unit for its dimension. */
  toSI: number
  /** Added after scaling, for a unit whose zero is not the SI zero (°C only). */
  offset?: number
}

export const UNITS: Record<UnitId, UnitInfo> = {
  none: { label: '', name: 'no unit', dim: NONE, toSI: 1 },
  m: { label: 'm', name: 'metres', dim: LENGTH, toSI: 1 },
  cm: { label: 'cm', name: 'centimetres', dim: LENGTH, toSI: 0.01 },
  mm: { label: 'mm', name: 'millimetres', dim: LENGTH, toSI: 0.001 },
  km: { label: 'km', name: 'kilometres', dim: LENGTH, toSI: 1000 },
  s: { label: 's', name: 'seconds', dim: TIME, toSI: 1 },
  ms: { label: 'ms', name: 'milliseconds', dim: TIME, toSI: 0.001 },
  min: { label: 'min', name: 'minutes', dim: TIME, toSI: 60 },
  h: { label: 'h', name: 'hours', dim: TIME, toSI: 3600 },
  kg: { label: 'kg', name: 'kilograms', dim: MASS, toSI: 1 },
  g: { label: 'g', name: 'grams', dim: MASS, toSI: 0.001 },
  N: { label: 'N', name: 'newtons', dim: FORCE, toSI: 1 },
  J: { label: 'J', name: 'joules', dim: ENERGY, toSI: 1 },
  W: { label: 'W', name: 'watts', dim: POWER, toSI: 1 },
  Pa: { label: 'Pa', name: 'pascals', dim: PRESSURE, toSI: 1 },
  'm/s': { label: 'm/s', name: 'metres per second', dim: VELOCITY, toSI: 1 },
  'km/h': { label: 'km/h', name: 'kilometres per hour', dim: VELOCITY, toSI: 1000 / 3600 },
  'm/s²': { label: 'm/s²', name: 'metres per second squared', dim: ACCEL, toSI: 1 },
  'rad/s': { label: 'rad/s', name: 'radians per second', dim: ANGULAR_VEL, toSI: 1 },
  rad: { label: 'rad', name: 'radians', dim: ANGLE, toSI: 1 },
  '°': { label: '°', name: 'degrees', dim: ANGLE, toSI: Math.PI / 180 },
  Hz: { label: 'Hz', name: 'hertz', dim: FREQ, toSI: 1 },
  C: { label: 'C', name: 'coulombs', dim: CHARGE, toSI: 1 },
  V: { label: 'V', name: 'volts', dim: VOLTAGE, toSI: 1 },
  A: { label: 'A', name: 'amps', dim: CURRENT, toSI: 1 },
  Ω: { label: 'Ω', name: 'ohms', dim: RESISTANCE, toSI: 1 },
  K: { label: 'K', name: 'kelvin', dim: TEMPERATURE, toSI: 1 },
  '°C': { label: '°C', name: 'degrees Celsius', dim: TEMPERATURE, toSI: 1, offset: 273.15 },
  mol: { label: 'mol', name: 'moles', dim: AMOUNT, toSI: 1 },
  'N·m': { label: 'N·m', name: 'newton-metres', dim: ENERGY, toSI: 1 },
  'kg·m/s': { label: 'kg·m/s', name: 'kilogram-metres per second', dim: MOMENTUM, toSI: 1 },
  'm²': { label: 'm²', name: 'square metres', dim: AREA, toSI: 1 },
  'm³': { label: 'm³', name: 'cubic metres', dim: VOLUME, toSI: 1 }
}

const sameDim = (a: Dim, b: Dim): boolean => a.every((v, i) => v === b[i])

/** Whether the two units measure the same kind of thing (a metre and a second never do). */
export function unitsCompatible(a: UnitId, b: UnitId): boolean {
  return sameDim(UNITS[a].dim, UNITS[b].dim)
}

/** A formula's dimension, 'zero' for a bare 0 (which adds to anything), or null when it cannot be told. */
type DimOf = Dim | 'zero' | null

const addDims = (a: Dim, b: Dim, k: number): Dim => a.map((v, i) => v + k * b[i]) as unknown as Dim

function dimOf(node: MathNode, units: Record<string, UnitId | undefined>): DimOf {
  switch (node.type) {
    case 'ConstantNode': {
      const k = Number((node as ConstantNode).value)
      if (k === 0) return 'zero'
      // A whole number or a half is a pure number (2gh, ½mv²); 9.8 in "m*9.8" is g with its unit
      // left off, and calling m × 9.8 a mass in kg would be wrong, so such a formula is not told.
      return Number.isInteger(k * 2) ? NONE : null
    }
    case 'ParenthesisNode':
      return dimOf((node as ParenthesisNode).content, units)
    case 'SymbolNode': {
      const name = (node as SymbolNode).name
      if (name === 'pi' || name === 'e') return NONE
      // An undeclared symbol cannot be told; a variable the question declares with no unit (a
      // coefficient of friction) is a pure number, so μmg is still in N.
      if (!Object.prototype.hasOwnProperty.call(units, name)) return null
      const u = units[name]
      if (u === undefined || u === 'none') return NONE
      // A variable in grams or km/h would need its scale carried too; the label is left off instead.
      if (UNITS[u].toSI !== 1 || UNITS[u].offset !== undefined) return null
      return UNITS[u].dim
    }
    case 'FunctionNode': {
      const f = node as FunctionNode
      const fn = f.fn.name
      // A trig or exponential function gives a pure number whatever its argument is in.
      if (['sin', 'cos', 'tan', 'exp', 'log', 'ln', 'asin', 'acos', 'atan'].includes(fn)) return NONE
      const inner = f.args[0] ? dimOf(f.args[0], units) : null
      if (fn === 'abs') return inner
      if (fn === 'sqrt') return inner === 'zero' ? 'zero' : inner && inner.every((v) => v % 2 === 0) ? (inner.map((v) => v / 2) as unknown as Dim) : null
      return null
    }
    case 'OperatorNode': {
      const op = node as OperatorNode
      const [a, b] = op.args.map((x) => dimOf(x, units))
      if (op.args.length === 1) return a
      if (a === null || b === null) return null
      if (op.op === '*' || op.op === '/') {
        if (a === 'zero' || b === 'zero') return 'zero'
        return addDims(a, b, op.op === '*' ? 1 : -1)
      }
      if (op.op === '+' || op.op === '-') {
        if (a === 'zero') return b
        if (b === 'zero') return a
        return sameDim(a, b) ? a : null
      }
      if (op.op === '^' && b !== 'zero' && b.every((v) => v === 0) && a !== 'zero') {
        let k: number
        try {
          k = Number(op.args[1].evaluate())
        } catch {
          return null
        }
        return Number.isFinite(k) ? (a.map((v) => v * k) as unknown as Dim) : null
      }
      return null
    }
    default:
      return null
  }
}

/** The variable a component is, give or take its sign ('' for a bare 0), or undefined for anything else. */
function loneSymbol(node: MathNode): string | undefined {
  if (node.type === 'ParenthesisNode') return loneSymbol((node as ParenthesisNode).content)
  if (node.type === 'SymbolNode') return (node as SymbolNode).name
  if (node.type === 'ConstantNode') return Number((node as ConstantNode).value) === 0 ? '' : undefined
  const op = node as OperatorNode
  if (node.type === 'OperatorNode' && op.args.length === 1 && (op.op === '-' || op.op === '+')) return loneSymbol(op.args[0])
  return undefined
}

/**
 * When every component is ±(one variable) or 0 — an arrow r = (d, 0) with d in cm — the arrow is
 * in that variable's own unit, scaled or not: its numbers are the variable's own. Undefined when
 * the components are anything else, or their variables' units differ.
 */
function ownUnitOf(components: readonly string[], units: Record<string, UnitId | undefined>): UnitId | undefined {
  let found: UnitId | undefined
  for (const c of components) {
    let name: string | undefined
    try {
      name = loneSymbol(math.parse(preprocess(c)))
    } catch {
      return undefined
    }
    if (name === undefined) return undefined
    if (name === '') continue
    const u = Object.prototype.hasOwnProperty.call(units, name) ? units[name] : undefined
    if (u === undefined || u === 'none' || UNITS[u].offset !== undefined) return undefined
    if (found !== undefined && found !== u) return undefined
    found = u
  }
  return found
}

/**
 * The unit an arrow of a question picture is in, from its component formulas and the units of
 * the variables they use: ["0", "-m2*g"] with m2 in kg and g in m/s² is in N. Null for a pure
 * number, for components that disagree, or for anything that cannot be told — the drawing then
 * keeps its grid units. Only an SI unit is named (a variable in grams would need its scale too),
 * unless every component is ±(one variable) or 0, when the arrow's numbers are in that variable's
 * own unit (r = (d, 0) with d in cm reads in cm).
 */
export function unitOfComponents(components: readonly string[], units: Record<string, UnitId | undefined>): UnitId | null {
  const own = ownUnitOf(components, units)
  if (own !== undefined) return own
  let found: Dim | null = null
  for (const c of components) {
    let d: DimOf
    try {
      d = dimOf(math.parse(preprocess(c)), units)
    } catch {
      return null
    }
    if (d === null) return null
    if (d === 'zero') continue
    if (found && !sameDim(found, d)) return null
    found = d
  }
  if (!found || found.every((v) => v === 0)) return null
  const id = (Object.keys(UNITS) as UnitId[]).find((k) => UNITS[k].toSI === 1 && UNITS[k].offset === undefined && sameDim(UNITS[k].dim, found!))
  return id ?? null
}

const toSI = (v: number, u: UnitInfo): number => v * u.toSI + (u.offset ?? 0)
const fromSI = (v: number, u: UnitInfo): number => (v - (u.offset ?? 0)) / u.toSI

/** `v` in unit `from`, expressed in unit `to` — or `null` when the two are not the same kind of thing. */
export function convertQuantity(v: number, from: UnitId, to: UnitId): number | null {
  const a = UNITS[from]
  const b = UNITS[to]
  if (!sameDim(a.dim, b.dim)) return null
  return fromSI(toSI(v, a), b)
}

/**
 * The question unit the scene's own length unit is: the four metric lengths share an id; `in`
 * and `ft` have no question unit (a question never asks for inches) and `unit` is a bare grid
 * square, so all three give null and a caller converts through `fromLengthUnit` instead.
 */
export function lengthUnitId(u: LengthUnit): UnitId | null {
  return u === 'm' || u === 'cm' || u === 'mm' || u === 'km' ? u : null
}

/** Metres in one of the scene's non-metric lengths; the grid square has no size at all. */
const LENGTH_TO_M: Partial<Record<LengthUnit, number>> = { in: 0.0254, ft: 0.3048 }

/**
 * A length measured on the scene grid, expressed in a question unit — or null when the grid is
 * in bare units (nothing to convert) or `to` is not a length.
 */
export function fromLengthUnit(v: number, u: LengthUnit, to: UnitId): number | null {
  const id = lengthUnitId(u)
  if (id !== null) return convertQuantity(v, id, to)
  const metres = LENGTH_TO_M[u]
  return metres === undefined ? null : convertQuantity(v * metres, 'm', to)
}

/**
 * The number a chip or an answer shows: `fmtPrecise`/`fmtSci` (the scientific form once a value
 * strays far from 1, so a charge of 1.6×10⁻¹⁹ never rounds to 0) followed by the unit's label. A
 * degree sign sits against its number, as `formatMeasure` writes it, never with a space.
 */
export function formatQuantity(v: number, unit: UnitId, settings: Precision): string {
  const abs = Math.abs(v)
  let shown = abs >= 1e6 || (abs > 0 && abs < 1e-3) ? fmtSci(v, settings) : fmtPrecise(v, settings)
  // The fixed cutoff above is not tied to the student's precision: at 2 dp both 0.0012 m and its
  // half-double 0.0024 m printed as "0 m", one right and one wrong with the same text. A known
  // value that rounds away at this precision goes scientific instead.
  if (v !== 0 && (shown === '0' || shown === '−0')) shown = fmtSci(v, settings)
  const info = UNITS[unit]
  if (info.label === '') return shown
  const gap = info.label === '°' || info.label === '°C' ? '' : ' '
  return `${shown}${gap}${info.label}`
}

/**
 * The precision a part's known answer is revealed at (`revealPrecision`), tested on the number
 * exactly as `formatQuantity` and `texQuantity` write it, plain or scientific: the answer under
 * the box and on the full solution's Answer card must mark right when typed back.
 */
export function revealSettings<S extends Precision>(v: number, tol: number, settings: S): S {
  return revealPrecision(v, tol, settings, (x, q) => formatQuantity(x, 'none', q))
}

/**
 * The same units as a plain keyboard types them. The labels have ², · and ° in them, which no
 * keyboard has a key for; "9.8 m/s^2" or "50 deg" was not read here, fell through to
 * `checkAnswer`, whose own tail list dropped the unit without a word, and a number in the wrong
 * unit was marked on its number alone.
 */
const TYPED_UNITS: Record<string, UnitId> = {
  'm/s^2': 'm/s²',
  'm/s2': 'm/s²',
  'm s^-2': 'm/s²',
  'ms^-2': 'm/s²',
  'm/s/s': 'm/s²',
  deg: '°',
  degree: '°',
  degrees: '°',
  degC: '°C',
  Nm: 'N·m',
  'N m': 'N·m',
  'N*m': 'N·m',
  'N.m': 'N·m',
  'kgm/s': 'kg·m/s',
  'kg m/s': 'kg·m/s',
  'kg*m/s': 'kg·m/s',
  'kg.m/s': 'kg·m/s',
  hz: 'Hz',
  HZ: 'Hz',
  'km/hr': 'km/h',
  kph: 'km/h',
  'm^2': 'm²',
  m2: 'm²',
  'm^3': 'm³',
  m3: 'm³',
  ohm: 'Ω',
  ohms: 'Ω'
}

/** Every spelling a tail may use → its unit: the labels themselves, then the typed spellings. */
const TAIL_SPELLINGS: Map<string, UnitId> = new Map([
  ...(UNIT_IDS as readonly UnitId[]).filter((u) => u !== 'none' && UNITS[u].label !== '').map((u) => [UNITS[u].label, u] as [string, UnitId]),
  ...Object.entries(TYPED_UNITS)
])

/**
 * The spellings a student might type after a number, longest first so `m/s²` is read whole
 * instead of being cut down to `m`. Escaped for use inside a regular expression.
 */
function buildTailPattern(): RegExp {
  const spellings = [...TAIL_SPELLINGS.keys()].sort((a, b) => b.length - a.length).map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`(?<=[\\d)\\s])\\s*(${spellings.join('|')})\\s*$`)
}

const TAIL_PATTERN = buildTailPattern()

/**
 * Generalises `UNIT_TAIL` in `math/checkAnswer.ts` to the whole unit set: reads a unit a student
 * typed after a number ("50 km/h") and returns the number's own text separately from the unit it
 * was found in, so the caller can convert it before marking. No unit found leaves `value` as the
 * whole trimmed text and `unit` null.
 */
export function unitFromTail(text: string): { value: string; unit: UnitId | null } {
  const trimmed = text.trim()
  if (trimmed === '') return { value: trimmed, unit: null }
  const m = trimmed.match(TAIL_PATTERN)
  if (!m || m.index === undefined) return { value: trimmed, unit: null }
  const unit = TAIL_SPELLINGS.get(m[1]) ?? null
  return { value: trimmed.slice(0, m.index).trim(), unit }
}

// ---------------------------------------------------------------------------
// Units in LaTeX, for the steps and the chips inside maths
// ---------------------------------------------------------------------------

/**
 * A unit as KaTeX sets it. `substitute` writes units as plain text ("2.5 m/s"), which is right
 * in a sentence and wrong in maths, where `m/s` would be three italic letters and `°` a stray
 * symbol. Only the units with a special character need a spelling of their own.
 */
const TEX_UNITS: Partial<Record<UnitId, string>> = {
  '°': '^{\\circ}',
  '°C': '^{\\circ}\\mathrm{C}',
  Ω: '\\Omega',
  'm/s²': '\\mathrm{m/s^{2}}',
  'N·m': '\\mathrm{N\\cdot m}',
  'kg·m/s': '\\mathrm{kg\\cdot m/s}',
  'm²': '\\mathrm{m^{2}}',
  'm³': '\\mathrm{m^{3}}'
}

export function texUnit(unit: UnitId | undefined): string {
  if (unit === undefined || unit === 'none') return ''
  return TEX_UNITS[unit] ?? `\\mathrm{${unit}}`
}

/**
 * A drawn value as LaTeX with its unit: the same numbers and the same scientific threshold as
 * the chips in the statement, so a step never contradicts the question above it. A degree sign
 * sits against its number; every other unit takes a thin space.
 */
export function texQuantity(v: number, unit: UnitId | undefined, s: Pick<MeasureSettings, 'decimals' | 'precisionMode'>): string {
  const abs = Math.abs(v)
  let number = abs >= 1e6 || (abs > 0 && abs < 1e-3) ? texSci(v, s) : texPrecise(v, s)
  // formatQuantity's rule, so a step never shows 0 A where the statement shows 2.4×10⁻³ A.
  if (v !== 0 && /^[-−]?0$/.test(fmtPrecise(v, s))) number = texSci(v, s)
  const u = texUnit(unit)
  if (u === '') return number
  if (unit === '°' || unit === '°C') {
    // A degree is a superscript, and a scientific number already carries one: KaTeX refuses
    // 10^{-19}^{\circ} as a double superscript unless the number is grouped first.
    return number.includes('^') ? `{${number}}${u}` : `${number}${u}`
  }
  return `${number}\\,${u}`
}

// --- units named in a prompt ------------------------------------------------

/** Longest first, so "m/s²" is found before "m/s" and both before "m". */
const UNIT_WORDS: [string, UnitId][] = [
  ['m\\/s\\^?2|m s\\^?-2|ms\\^?-2|m\\/s²|met(?:re|er)s per second squared', 'm/s²'],
  ['kg m\\/s|kg m s\\^?-1|kgms\\^?-1|kg·m\\/s', 'kg·m/s'],
  ['rad\\/s|rad s\\^?-1|radians per second', 'rad/s'],
  ['m\\/s|m s\\^?-1|ms\\^?-1|met(?:re|er)s per second', 'm/s'],
  ['km\\/h|km h\\^?-1|kmh\\^?-1|kilomet(?:re|er)s per hour', 'km/h'],
  ['N m|N·m|Nm|newton met(?:re|er)s', 'N·m'],
  ['m\\^?2|m²|square met(?:re|er)s', 'm²'],
  ['m\\^?3|m³|cubic met(?:re|er)s', 'm³'],
  ['°C|degrees celsius|degrees centigrade', '°C'],
  ['°|degrees', '°'],
  ['kilograms?|kg', 'kg'],
  ['grams?|g', 'g'],
  ['newtons?|N', 'N'],
  ['joules?|J', 'J'],
  ['watts?|W', 'W'],
  ['pascals?|Pa', 'Pa'],
  ['hertz|Hz', 'Hz'],
  ['coulombs?|C', 'C'],
  ['volts?|V', 'V'],
  ['amp(?:ere)?s?|A', 'A'],
  ['ohms?|Ω', 'Ω'],
  ['kelvin|K', 'K'],
  ['moles?|mol', 'mol'],
  ['radians?|rad', 'rad'],
  ['milliseconds?|ms', 'ms'],
  ['minutes?|min', 'min'],
  ['hours?|h', 'h'],
  ['seconds?|s', 's'],
  ['kilomet(?:re|er)s?|km', 'km'],
  ['centimet(?:re|er)s?|cm', 'cm'],
  ['millimet(?:re|er)s?|mm', 'mm'],
  ['met(?:re|er)s?|m', 'm']
]

const PROMPT_UNIT_TAIL = UNIT_WORDS.map(
  ([words, unit]) =>
    [new RegExp(`(?:\\bin\\b|\\bunits? of\\b|\\(|\\[)\\s*(?:the\\s+)?(?:${words})\\s*[)\\]]?\\s*[.?:!]*\\s*$`), unit] as const
)

/**
 * The unit a prompt asks for, read from its tail: "… in m/s", "… (in metres per second)",
 * "… in \(\mathrm{ms^{-1}}\)". Numbas has no unit field on a number part, so the words are all
 * there is; nothing found means `none`, never a guess.
 */
export function unitInPrompt(prompt: string): UnitId {
  const plain = prompt
    .replace(/\\[()[\]]/g, ' ')
    .replace(/\\(?:mathrm|text|textrm|mathit|,|;| )\s*\{?/g, ' ')
    .replace(/\^\{(-?\d)\}/g, '^$1')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  for (const [re, unit] of PROMPT_UNIT_TAIL) if (re.test(plain)) return unit
  return 'none'
}
