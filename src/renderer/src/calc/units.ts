// The Units mode's category lists and its two conversions, kept out of the panel so a test can
// check that every unit the lists offer really converts on the app's own mathjs instance, and
// what a student reads when a conversion cannot be done. The panel used to print mathjs's own
// words ('Unit "lightyear" not found.', "Units do not match ('C' != '1 A')").

import { math } from '../math/expr'
import { errorSentence } from './errors'
import { calcNum } from './format'

export const UNIT_PRESETS: [string, string[]][] = [
  ['Length', ['m', 'cm', 'mm', 'km', 'inch', 'ft', 'yard', 'mile', 'angstrom', 'au', 'lightyear', 'parsec']],
  ['Mass', ['kg', 'g', 'mg', 'tonne', 'lb', 'oz', 'dalton']],
  ['Time', ['s', 'ms', 'minute', 'hour', 'day', 'year']],
  // Speed stays fourth: the panel opens on it, at km/h → m/s.
  ['Speed', ['m/s', 'km/h', 'mi/h', 'ft/s', 'knot']],
  ['Force', ['N', 'kN', 'dyn', 'lbf', 'kgf']],
  ['Energy', ['J', 'kJ', 'cal', 'kcal', 'eV', 'kWh', 'erg', 'BTU']],
  ['Power', ['W', 'kW', 'hp']],
  ['Pressure', ['Pa', 'kPa', 'bar', 'atm', 'mmHg', 'psi', 'torr']],
  ['Temperature', ['degC', 'K', 'degF']],
  ['Angle', ['deg', 'rad', 'grad']],
  ['Area', ['m^2', 'cm^2', 'km^2', 'hectare', 'acre']],
  ['Volume', ['m^3', 'L', 'mL', 'cm^3', 'gallon']],
  // Two lists, not one "Charge & current": a coulomb can never be changed into an ampere.
  ['Charge', ['C', 'mC', 'uC']],
  ['Current', ['A', 'mA']]
]

/**
 * What a list shows for a unit whose mathjs name is not the one students know. The atomic mass
 * unit is defined as dalton (math/expr.ts) because u is SUVAT's initial speed and what μ becomes.
 */
const LABELS: Record<string, string> = { dalton: 'u' }

export const unitLabel = (name: string): string => LABELS[name] ?? name

/** One line of the Units screen: an answer, or a sentence saying why there is none. */
export interface UnitAnswer {
  text: string
  /** True when `text` is a sentence rather than an answer, so no unit may follow it. */
  refused: boolean
}

/**
 * Symbols math/expr.ts leaves undefined on purpose (each would swallow a letter typed elsewhere),
 * with the name that works and what it stands for.
 */
export const TYPE_INSTEAD: Record<string, { name: string; what: string }> = {
  ly: { name: 'lightyear', what: 'the light-year' },
  pc: { name: 'parsec', what: 'the parsec' },
  AU: { name: 'au', what: 'the astronomical unit' },
  u: { name: 'dalton', what: 'the atomic mass unit' },
  amu: { name: 'dalton', what: 'the atomic mass unit' },
  Da: { name: 'dalton', what: 'the atomic mass unit' },
  kn: { name: 'knot', what: 'the knot' }
}

export function unknownUnit(name: string, onBar = false): string {
  const instead = TYPE_INSTEAD[name]
  if (instead) return `I don't know the unit "${name}". For ${instead.what}, type ${instead.name}.`
  return onBar ? `I don't know the unit "${name}". Check the spelling.` : `I don't know the unit "${name}". Check the spelling, or pick a unit from the lists above.`
}

/** The sentence for what mathjs threw. `from` and `to` name the units when a list asked. */
export function unitRefusal(e: unknown, from?: string, to?: string, onBar = false): string {
  const msg = e instanceof Error ? e.message : String(e)
  const unknown = /Unit "([^"]+)" not found/.exec(msg) ?? /Undefined symbol\s+(\S+)/.exec(msg)
  if (unknown) return unknownUnit(unknown[1], onBar)
  if (/Units do not match/.test(msg)) {
    const which = from && to ? `${unitLabel(from)} and ${unitLabel(to)}` : 'Those two units'
    return `${which} measure different things, so one cannot be changed into the other.`
  }
  if (/in function to\b/.test(msg)) return 'After "to", type the unit to change into, for example 5 N m to J.'
  // 5 m + 2: mathjs cannot add a plain number to a quantity with a unit.
  if (/(add|subtract)Scalar|expected: Unit/.test(msg)) return 'Every number here needs its unit, for example 5 m + 20 cm.'
  return errorSentence(e).sentence
}

/** A Units list's answer: `value` in `from`, changed into `to`, at the student's precision. */
export function convertListed(value: number, from: string, to: string): UnitAnswer {
  try {
    return { text: `${calcNum(math.unit(value, from).toNumber(to))} ${unitLabel(to)}`, refused: false }
  } catch (e) {
    return { text: unitRefusal(e, from, to), refused: true }
  }
}

/**
 * The typed box: any line mathjs can read, such as "5 N m to J". The unit is the one mathjs
 * writes; the number goes through the calculator's formatter, because mathjs's own format with
 * a fixed ten figures ignored the precision the student chose.
 */
export function convertTyped(text: string): UnitAnswer {
  if (!text.trim()) return { text: '', refused: false }
  try {
    const v = math.evaluate(text) as unknown
    if (typeof v === 'number') return { text: calcNum(v), refused: false }
    if (math.isUnit(v) && v.value !== null) {
      return { text: math.format(v, (n: unknown) => (typeof n === 'number' ? calcNum(n) : String(n))), refused: false }
    }
    // A unit with no number ("km"), true or false, a list: nothing here to convert.
    return { text: 'Type a number with its unit, for example 5 N m to J.', refused: true }
  } catch (e) {
    return { text: unitRefusal(e), refused: true }
  }
}
