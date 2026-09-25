// Drawing a question's variables. An author writes `{u}` and `{theta}` chips and says how each
// is chosen (a range, a list, or a formula in the others); this module turns a seed into one
// concrete set of numbers, the same numbers every time for the same seed, and says in plain
// words when a formula cannot be worked out. Headless: no React, no store, no DOM.

import type { EvalFunction } from 'mathjs'
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
 *
 * A question with a `condition` ("only variants with real roots") keeps drawing — seed, seed + 1,
 * … up to `maxRuns` draws — until the condition holds, so every seed still gives one fixed variant
 * and a student replaying a saved seed meets the same numbers. The `seed` reported is the one asked
 * for. When no draw meets it the first draw is kept and one sentence says so, never a throw.
 */
export function drawVariables(q: PQQuestion, seed: number): Variant {
  const first = drawOnce(q, seed)
  const c = q.condition
  // A loop or an unknown name leaves nothing drawn; that sentence is the one to read, and the
  // condition would only add "cannot read" on top of it.
  const nothingDrawn = q.variables.length > 0 && Object.keys(first.values).length === 0
  if (c === undefined || nothingDrawn) return first
  const runs = Math.max(1, Math.floor(c.maxRuns))
  for (let k = 0; k < runs; k++) {
    const v = k === 0 ? first : drawOnce(q, seed + k)
    const holds = conditionHolds(c.when, v.values)
    // A condition PhysLab cannot read would fail every draw alike; saying so at once is kinder
    // than a hundred draws and a sentence that blames the ranges.
    if (holds === null) return { ...first, problems: [...first.problems, unreadableCondition(c.when)] }
    if (holds) return { ...v, seed }
  }
  return { ...first, problems: [...first.problems, `No variant met the condition ${conditionText(c.when)} in ${fmtPrecise(runs, SENTENCE_PRECISION)} tries; widen the ranges or loosen the condition.`] }
}

/**
 * Whether a condition in the variables ("b^2 - 4*a*c >= 0", "mu >= tan(theta)") holds for these
 * values: true, false, or null when it cannot be read or does not come out as yes or no. Worked
 * out in degrees like every formula of the variables, so tan(theta) with θ = 30° is tan 30°. A
 * value that could not be drawn (NaN) makes a comparison false, so such a draw is never kept.
 * Shared with `showIf` (questions/ecf.ts): one rule for "only when".
 *
 * "Cannot be read" is a verdict on the condition, not on one draw: it does not parse, or it names
 * something that is neither one of these variables nor a built-in (pi, e …), or it calls a function
 * PhysLab does not know (sqr(b), a slip for sqrt(b)). A readable condition
 * that fails for one draw (sqrt(b) > 2 with b = −4 gives a complex number, and comparing it
 * throws) is simply false for that draw, so the search keeps drawing.
 */
export function conditionHolds(when: string, values: Record<string, number>): boolean | null {
  const read = readCondition(when)
  if (read === null) return null
  if (!read.symbols.every((s) => s in values || s in math)) return null
  // Before any comparison, whatever its result type: mathjs answers NaN != 5 with true, so a
  // draw whose d = √b had no value kept "d != 5" and was served with its "undefined" sentence.
  if (read.symbols.some((s) => s in values && Number.isNaN(values[s]))) return false
  let r: unknown
  try {
    r = inDegrees(() => read.run.evaluate({ ...values }))
  } catch {
    return false
  }
  if (typeof r === 'boolean') return r
  // mathjs reads "a and b" as a boolean but a bare formula as a number: non-zero is yes, as in Numbas.
  if (typeof r === 'number') return Number.isNaN(r) ? false : r !== 0
  // A bare formula that comes out complex for this draw (sqrt(b) with b < 0) is no real yes.
  if (math.isComplex(r)) return false
  return null
}

interface ReadCondition {
  run: EvalFunction
  /** Every name the condition uses other than as a function: each must be a variable or a built-in. */
  symbols: string[]
}

/**
 * The condition parsed and compiled once, cached with its names: null when it does not parse or
 * calls a function PhysLab does not know (sqr(b) for sqrt(b), or b(a + 1) for b × (a + 1)). Such
 * a call would throw for every draw alike, and a throw reads as "false for this draw", so a typo
 * would blame the ranges and hide a showIf part from every student.
 */
function readCondition(when: string): ReadCondition | null {
  const cached = compiledConditions.get(when)
  if (cached !== undefined) return cached
  // A condition is read once and run for every draw of every seed; parsing it each time made a
  // 100-run search the slowest thing in a question's first play.
  if (compiledConditions.size > 64) compiledConditions.clear()
  let read: ReadCondition | null
  try {
    const node = math.parse(preprocess(when))
    const functions = node
      .filter((n) => n.type === 'FunctionNode')
      .map((n) => (n as unknown as { fn: { type: string; name?: string } }).fn)
      .filter((fn) => fn.type === 'SymbolNode')
      .map((fn) => fn.name ?? '')
    const known = functions.every((name) => typeof (math as unknown as Record<string, unknown>)[name] === 'function')
    read = known ? { run: node.compile(), symbols: symbolsOf(node) } : null
  } catch {
    read = null
  }
  compiledConditions.set(when, read)
  return read
}

const compiledConditions = new Map<string, ReadCondition | null>()

/** The condition as a student writes it: b² − 4a × c ≥ 0, not b ^ 2 - 4 * a * c >= 0. */
function conditionText(when: string): string {
  let text: string
  try {
    text = plainFormula(when)
  } catch {
    text = when
  }
  return text.replace(/>=/g, '≥').replace(/<=/g, '≤').replace(/!=/g, '≠').replace(/==/g, '=')
}

// Written the way a student writes it when it parses (an unknown name is the usual trouble), as typed otherwise.
const unreadableCondition = (when: string): string => `PhysLab could not read the condition ${conditionText(when)}, so it cannot choose the variants that meet it.`

/** One draw from `seed` alone, with no condition: the body of `drawVariables`. */
function drawOnce(q: PQQuestion, seed: number): Variant {
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

/** A preview row: one variant, and — when the question keeps only some variants — why this one is not kept. */
export interface PreviewVariant extends Variant {
  /** Set when the row fails the question's condition: a student with this seed gets the next draw that meets it. */
  rejected?: string
}

/** A part's letter as a student reads it: 0 → (a), 1 → (b). */
export const partLetter = (index: number): string => `(${String.fromCharCode(97 + index)})`

/**
 * The rows the authoring tab shows: seeds seed, seed+1, … so the author sees the same ten every
 * time. Each row is the raw draw from its seed, not the kept one, so a condition shows what it
 * throws away: a row that fails it is flagged, and an author whose condition rejects nine rows in
 * ten sees that at a glance instead of ten innocent-looking rows.
 */
export function previewVariants(q: PQQuestion, count = 10, seed = 1): PreviewVariant[] {
  const out: PreviewVariant[] = []
  for (let k = 0; k < count; k++) {
    const row: PreviewVariant = drawOnce(q, seed + k)
    const c = q.condition
    if (c !== undefined && row.problems.length === 0) {
      const holds = conditionHolds(c.when, row.values)
      if (holds === null) row.problems = [...row.problems, unreadableCondition(c.when)]
      else if (!holds) row.rejected = `Left out: ${conditionText(c.when)} does not hold here, so a student gets the next variant that meets it.`
    }
    // A part shown only under a condition PhysLab cannot read is shown anyway (questions/ecf.ts
    // partShown); the author hears about it here rather than from a student.
    if (row.problems.length === 0) {
      q.parts.forEach((p, i) => {
        if (p.showIf !== undefined && conditionHolds(p.showIf, row.values) === null) {
          row.problems.push(`PhysLab could not read the condition for showing part ${partLetter(i)}, ${conditionText(p.showIf)}, so that part is always shown.`)
        }
      })
    }
    out.push(row)
  }
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
