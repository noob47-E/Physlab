// Drawing a question's variables. An author writes `{u}` and `{theta}` chips and says how each
// is chosen (a range, a list, or a formula in the others); this module turns a seed into one
// concrete set of numbers, the same numbers every time for the same seed, and says in plain
// words when a formula cannot be worked out. Headless: no React, no store, no DOM.

import { inDegrees, math, preprocess, symbolsOf } from '../math/expr'
import { fmtPrecise, type MeasureSettings } from '../math/format'
import { rngFor } from '../math/problems'
import { plainFormula } from './plainFormula'
import { RESERVED_NAMES, type PQQuestion, type PQVariable, type UnitId } from './pqjson'
import { formatQuantity } from './units'

export type Precision = Pick<MeasureSettings, 'decimals' | 'precisionMode'>

/** Numbers quoted inside a problem sentence are not the student's measurements; the plain default does. */
const SENTENCE_PRECISION: Precision = { decimals: 4, precisionMode: 'dp' }

// ---------------------------------------------------------------------------
// Which variable needs which
// ---------------------------------------------------------------------------

/**
 * True for a name mathjs itself supplies (pi, e, i, tau, phi, Infinity …): using it in a formula
 * is not a dependency on another variable, and not an unknown name either.
 */
function isBuiltIn(name: string): boolean {
  if (RESERVED_NAMES.has(name) || name === RANDOM_RANGE) return true
  const t = math.typeOf((math as unknown as Record<string, unknown>)[name])
  return t === 'number' || t === 'Complex' || t === 'boolean'
}

/**
 * The names a variable's formula reads. Every known variable it mentions is a dependency; a name
 * that is neither a variable nor something mathjs supplies is returned too, so `orderVariables`
 * can say "c uses q, but there is no variable called q" instead of letting mathjs read `q` as
 * a unit of charge later. A range or a list depends on nothing. A formula mathjs cannot parse
 * has no dependencies here; `drawVariables` reports it in words when it tries to evaluate it.
 */
export function dependenciesOf(v: PQVariable, known: Set<string>): string[] {
  if (v.def.kind !== 'expr') return []
  let names: string[]
  try {
    names = symbolsOf(math.parse(preprocess(v.def.expr)))
  } catch {
    return []
  }
  return names.filter((n) => known.has(n) || !isBuiltIn(n))
}

export type VariableOrder =
  | { order: string[] }
  | { cycle: string[] }
  | { unknown: { name: string; uses: string } }

/**
 * The order in which the variables can be worked out, so that every formula's inputs are drawn
 * before it is. Kahn's algorithm: among the variables ready at each step the first in the
 * author's order goes next, so the result does not change from one run to the next. A loop
 * (a uses b, b uses a) or a name that is no variable is returned instead of an order.
 */
export function orderVariables(vars: PQVariable[]): VariableOrder {
  const known = new Set(vars.map((v) => v.name))
  const deps = new Map<string, string[]>()
  for (const v of vars) {
    const d = dependenciesOf(v, known)
    const missing = d.find((n) => !known.has(n))
    if (missing !== undefined) return { unknown: { name: v.name, uses: missing } }
    // A formula that mentions the same input twice still needs it only once.
    deps.set(v.name, [...new Set(d)])
  }

  const remaining = new Map<string, number>()
  for (const v of vars) remaining.set(v.name, deps.get(v.name)!.length)
  const done = new Set<string>()
  const order: string[] = []
  for (;;) {
    const next = vars.find((v) => !done.has(v.name) && remaining.get(v.name) === 0)
    if (!next) break
    done.add(next.name)
    order.push(next.name)
    for (const v of vars) {
      if (!done.has(v.name) && deps.get(v.name)!.includes(next.name)) {
        remaining.set(v.name, remaining.get(v.name)! - 1)
      }
    }
  }
  if (order.length === vars.length) return { order }

  // Whatever is left is in a loop or hangs off one. Walk the dependencies from the first
  // leftover until a name repeats; the names from that repeat onwards are the loop itself,
  // in the order "a depends on b, which depends on …".
  const left = new Set(vars.filter((v) => !done.has(v.name)).map((v) => v.name))
  const path: string[] = []
  let at = [...left][0]
  while (!path.includes(at)) {
    path.push(at)
    at = deps.get(at)!.find((n) => left.has(n))!
  }
  return { cycle: path.slice(path.indexOf(at)) }
}

/** "a depends on b, which depends on a — a variable cannot use itself." */
export function cycleSentence(cycle: string[]): string {
  const [first, ...rest] = cycle
  const chain = [...rest, first].map((n) => `depends on ${n}`).join(', which ')
  return `${first} ${chain} — a variable cannot use itself.`
}

/** "c uses q, but there is no variable called q." */
export function unknownSentence(u: { name: string; uses: string }): string {
  return `${u.name} uses ${u.uses}, but there is no variable called ${u.uses}.`
}

// ---------------------------------------------------------------------------
// Drawing one variant
// ---------------------------------------------------------------------------

export interface Variant {
  seed: number
  values: Record<string, number>
  /** Plain sentences about anything that could not be drawn or worked out; empty when all is well. */
  problems: string[]
}

/**
 * from + k·step lands on 0.30000000000000004 for k = 3 and step 0.1; twelve significant digits is
 * far finer than any step an author types and far coarser than the double's own noise.
 */
const tidy = (v: number): number => Number(v.toPrecision(12))

const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b))

/** How many values from..to in steps of step holds; the small addition keeps (0.3 − 0)/0.1 = 2.9999999999999996 from losing the last one. */
const countOf = (from: number, to: number, step: number): number => Math.max(1, Math.floor((to - from) / step + 1e-9) + 1)

/** The name a formula calls to draw from a range whose ends are other variables. */
export const RANDOM_RANGE = 'randomRange'

/**
 * One value from a..b in steps of `step`, drawn from the question's own stream `r`. A range
 * variable's ends are three numbers typed into three boxes; a Numbas `random(a..b)` whose ends are
 * other variables (a second speed that must beat the first, say) needs its ends worked out first,
 * so it is written as the formula `randomRange(a, b, step)` and drawn here. Returns null when the
 * ends cannot be drawn from — a step of 0, or a above b — and the caller says so in words.
 */
export function randomRange(r: () => number, a: number, b: number, step = 1): number | null {
  if (![a, b, step].every(Number.isFinite) || step <= 0 || a > b) return null
  return tidy(a + Math.floor(r() * countOf(a, b, step)) * step)
}

/**
 * One concrete set of values for the question. The same seed always gives the same values:
 * one `rngFor(seed)` stream, consumed in the topological order (not the author's order, so
 * reordering the variable list in the editor does not silently change every saved variant's
 * numbers). Whatever goes wrong is a sentence in `problems`, never a throw — the authoring
 * preview shows the row and marks it.
 */
export function drawVariables(q: PQQuestion, seed: number): Variant {
  const values: Record<string, number> = {}
  const problems: string[] = []
  const ordered = orderVariables(q.variables)
  if ('cycle' in ordered) return { seed, values, problems: [cycleSentence(ordered.cycle)] }
  if ('unknown' in ordered) return { seed, values, problems: [unknownSentence(ordered.unknown)] }

  const byName = new Map(q.variables.map((v) => [v.name, v]))
  const r = rngFor(seed)
  const known = new Set(byName.keys())

  for (const name of ordered.order) {
    const v = byName.get(name)!
    const def = v.def
    if (def.kind === 'range') {
      // A file with such a range is refused by parsePQFile, but the editor's preview draws from
      // three half-typed number boxes: a step of 0 would give NaN and from > to would silently
      // draw `from`, and neither is a row the author should trust.
      if (def.step <= 0 || def.from > def.to) {
        problems.push(
          `${name} has a range from ${fmtPrecise(def.from, SENTENCE_PRECISION)} to ${fmtPrecise(def.to, SENTENCE_PRECISION)} in steps of ${fmtPrecise(def.step, SENTENCE_PRECISION)}, which PhysLab cannot draw from.`
        )
        values[name] = NaN
        continue
      }
      const count = countOf(def.from, def.to, def.step)
      const excluded = def.exclude ?? []
      let value = tidy(def.from)
      let avoided = false
      for (let tries = 0; tries < 100; tries++) {
        value = tidy(def.from + Math.floor(r() * count) * def.step)
        if (!excluded.some((x) => near(value, x))) {
          avoided = true
          break
        }
      }
      if (!avoided) problems.push(`${name} could not avoid the excluded values.`)
      values[name] = value
    } else if (def.kind === 'list') {
      if (def.items.length === 0) {
        problems.push(`${name} has no values to choose from.`)
        values[name] = NaN
      } else {
        values[name] = def.items[Math.floor(r() * def.items.length)]
      }
    } else {
      let result: number
      // A draw inside the formula takes the next number from the same stream as every range, so
      // the variant is still fixed by the seed alone.
      let badRange: string | null = null
      const drawRange = (a: number, b: number, step = 1): number => {
        const v = randomRange(r, Number(a), Number(b), Number(step))
        if (v === null) {
          const f = (x: number): string => fmtPrecise(Number(x), SENTENCE_PRECISION)
          badRange = `${name} is drawn from ${f(a)} to ${f(b)} in steps of ${f(step)}, which PhysLab cannot draw from.`
          return NaN
        }
        return v
      }
      try {
        // Always in degrees: a question's numbers must not change because the student last left
        // the calculator in radians (the same rule checkAnswer.ts keeps for a typed answer).
        // `preprocess` reads the formula the way the calculator does, so u², √u, θ and the proper
        // minus the app writes everywhere mean what the author meant. A copy of the scope: mathjs
        // may write into the scope it is given, and the drawn values are not its to change.
        result = Number(inDegrees(() => math.evaluate(preprocess(def.expr), { ...values, [RANDOM_RANGE]: drawRange })))
      } catch {
        problems.push(`PhysLab could not read the formula for ${name}.`)
        values[name] = NaN
        continue
      }
      if (badRange !== null) {
        problems.push(badRange)
        values[name] = NaN
        continue
      }
      if (!Number.isFinite(result)) {
        // A zero among the inputs is the usual culprit and is named alone. Otherwise every input
        // is named: a = u/(t − 50) at t = 50 used to read "undefined when u = 24", which sent the
        // author looking at the wrong variable.
        const deps = [...new Set(dependenciesOf(v, known))]
        const zero = deps.find((d) => values[d] === 0)
        const named = zero !== undefined ? [zero] : deps
        const when = named.length === 0 ? '' : ` when ${named.map((d) => `${d} = ${fmtPrecise(values[d], SENTENCE_PRECISION)}`).join(' and ')}`
        // Written as a student writes it in a line of text (u²/(2t)), never the file's mathjs
        // text (u ^ 2 / (2 * t)), which is programming and was shown in every red preview row.
        const formula = plainFormula(def.expr).replace(/ \/ /g, '/')
        problems.push(`${name} = ${formula} is infinite or undefined${when}.`)
      }
      values[name] = result
    }
  }
  return { seed, values, problems }
}

/** The rows the authoring tab shows: seeds seed, seed+1, … so the author sees the same ten every time. */
export function previewVariants(q: PQQuestion, count = 10, seed = 1): Variant[] {
  const out: Variant[] = []
  for (let k = 0; k < count; k++) out.push(drawVariables(q, seed + k))
  return out
}

// ---------------------------------------------------------------------------
// Putting the numbers into the text
// ---------------------------------------------------------------------------

/** A `{name}` chip in the author's text. */
const CHIP = /\{([A-Za-z][A-Za-z0-9_]*)\}/g

/**
 * Replaces every `{name}` chip with its drawn value in the student's precision, followed by the
 * variable's unit when it has one ("2.5 m/s", "30°" — a degree sign sits against its number).
 * A chip with no value is left exactly as typed, so a half-written question still shows the
 * author what is missing. Maths gets its chips from `substituteTex` in steps.ts instead.
 *
 * The number is `formatQuantity`'s, the same as the revealed answer's: a copy kept here lacked
 * its "rounds to 0 → scientific" rule, so at 2 dp I = 0.0024 A read "I = 0 A" in the statement
 * while the answer said 2.4×10⁻³ A, and it spaced "20 °C" where every answer wrote "20°C".
 */
export function substitute(
  text: string,
  values: Record<string, number>,
  units: Record<string, UnitId | undefined>,
  settings: Precision
): string {
  return text.replace(CHIP, (chip, name: string) => {
    const v = values[name]
    // A missing value and a NaN (a formula that failed; its Variant already says so in words)
    // both leave the chip as typed: "The charge is undefined C." is no sentence for a student.
    if (v === undefined || Number.isNaN(v)) return chip
    return formatQuantity(v, units[name] ?? 'none', settings)
  })
}
