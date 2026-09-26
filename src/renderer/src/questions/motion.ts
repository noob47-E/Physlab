// A question's motion binding: a train that waits, sets off, cruises and brakes, written as a
// list of stretches (at rest, steady speed, steady acceleration) in the question's variables.
// Here the list becomes the closed-form x–t, v–t and a–t curves, one formula per stretch, so the
// player can draw them as piecewise graphs and fill a Lab Data table with readings off the same
// formulas. Headless: no React, no store, no DOM.

import type { LabTable } from '../lab/types'
import { fmtPrecise } from '../math/format'
import type { MotionSegment, PQMotion } from './pqjson'
import { evaluateInVariables } from './parts'

/** One formula in x (the graph's across axis, standing for t) and the stretch of time it holds on. */
export interface MotionPiece {
  expr: string
  from: number
  to: number
}

/** One stretch with its numbers worked out: where it starts and how it moves. */
export interface Stretch {
  kind: MotionSegment['kind']
  t0: number
  t1: number
  x0: number
  v0: number
  a: number
}

export interface MotionPieces {
  x: MotionPiece[]
  v: MotionPiece[]
  a: MotionPiece[]
  /** The time the whole motion takes, in seconds. */
  total: number
  stretches: Stretch[]
  /** Plain sentences about any stretch that could not be worked out; empty when all is well. */
  problems: string[]
}

const SENTENCE_PRECISION = { decimals: 4, precisionMode: 'dp' as const }

/**
 * A number as mathjs reads it inside a formula. Twelve figures is far finer than any drawing and
 * far coarser than the double's noise, so 0.1 + 0.2 is written 0.3; a negative number goes in
 * brackets, so "v − 3" never becomes "x - -3" or reads as a subtraction the author did not mean.
 */
function lit(v: number): string {
  const t = Number(v.toPrecision(12))
  const s = String(t)
  return t < 0 ? `(${s})` : s
}

/** a·(x − t0) written so a start at 0 reads "a*x", not "a*(x - 0)". */
const since = (t0: number): string => (t0 === 0 ? 'x' : `(x - ${lit(t0)})`)

function xFormula(s: Stretch): string {
  const terms: string[] = [lit(s.x0)]
  if (s.v0 !== 0) terms.push(`${lit(s.v0)} * ${since(s.t0)}`)
  if (s.a !== 0) terms.push(`${lit(s.a / 2)} * ${since(s.t0)}^2`)
  return terms.join(' + ')
}

function vFormula(s: Stretch): string {
  return s.a === 0 ? lit(s.v0) : `${lit(s.v0)} + ${lit(s.a)} * ${since(s.t0)}`
}

/** Where the stretch leaves the body: x = x₀ + v₀τ + ½aτ², v = v₀ + aτ. */
function endOf(s: Stretch): { x: number; v: number } {
  const tau = s.t1 - s.t0
  return { x: s.x0 + s.v0 * tau + 0.5 * s.a * tau * tau, v: s.v0 + s.a * tau }
}

/**
 * The motion as closed-form pieces, stretch after stretch from x0 and v0 (0 when not given). A
 * stretch "at rest" holds v = 0; "steady speed" sets v; "steady acceleration" carries on from the
 * speed the last stretch ended at. Position is continuous at every join by construction — each
 * stretch starts where the last one left the body — and so is speed, except where the author said
 * a new steady speed or a rest, which is a jump in v and nothing else.
 */
export function motionPieces(m: PQMotion, values: Record<string, number>): MotionPieces {
  const problems: string[] = []
  const read = (expr: string | undefined, what: string, fallback = 0): number => {
    if (expr === undefined || expr.trim() === '') return fallback
    let v: number
    try {
      v = evaluateInVariables(expr, values)
    } catch {
      problems.push(`PhysLab could not read ${what}: ${expr}.`)
      return fallback
    }
    if (!Number.isFinite(v)) {
      problems.push(`${what} works out to infinity or nothing: ${expr}.`)
      return fallback
    }
    return v
  }

  let t = 0
  let x = read(m.x0, 'where the motion starts')
  let v = read(m.v0, 'the starting speed')
  const stretches: Stretch[] = []
  m.segments.forEach((seg, i) => {
    const which = `stretch ${fmtPrecise(i + 1, SENTENCE_PRECISION)}`
    const duration = read(seg.duration, `how long ${which} lasts`, NaN)
    if (!(duration > 0)) {
      if (!Number.isNaN(duration)) problems.push(`Stretch ${fmtPrecise(i + 1, SENTENCE_PRECISION)} of the motion lasts ${fmtPrecise(duration, SENTENCE_PRECISION)} s; each stretch must last some time.`)
      return
    }
    let a = 0
    if (seg.kind === 'rest') v = 0
    else if (seg.kind === 'uniform') v = read(seg.v, `the speed in ${which}`, v)
    else a = read(seg.a, `the acceleration in ${which}`)
    const s: Stretch = { kind: seg.kind, t0: t, t1: t + duration, x0: x, v0: v, a }
    stretches.push(s)
    const end = endOf(s)
    t = s.t1
    x = end.x
    v = end.v
  })

  return {
    x: stretches.map((s) => ({ expr: xFormula(s), from: s.t0, to: s.t1 })),
    v: stretches.map((s) => ({ expr: vFormula(s), from: s.t0, to: s.t1 })),
    a: stretches.map((s) => ({ expr: lit(s.a), from: s.t0, to: s.t1 })),
    total: t,
    stretches,
    problems
  }
}

/**
 * Position, speed and acceleration at time t. At a join the later stretch answers, so a reading
 * taken exactly when the brakes go on shows the braking; past the end the body stays where the
 * last stretch left it, at the speed it left it with.
 */
export function motionAt(stretches: Stretch[], t: number): { x: number; v: number; a: number } {
  if (stretches.length === 0) return { x: 0, v: 0, a: 0 }
  const s = stretches.find((st) => t >= st.t0 && t < st.t1) ?? (t < stretches[0].t0 ? stretches[0] : stretches[stretches.length - 1])
  const tau = Math.min(Math.max(t - s.t0, 0), s.t1 - s.t0)
  return { x: s.x0 + s.v0 * tau + 0.5 * s.a * tau * tau, v: s.v0 + s.a * tau, a: s.a }
}

/** No school lab reads a stopwatch a thousand times; a finer step than that is thinned out. */
const MAX_ROWS = 1000

/**
 * Readings every `every` seconds from t = 0 to the end, as a Lab Data table with t, x and v
 * columns carrying their units. Values keep five figures, as the Sandbox's own recording does.
 * The last reading lands on the end of the motion whether or not the step divides it evenly, so
 * the table always shows where the body stopped.
 */
export function motionTable(pieces: MotionPieces, every: number, title: string): LabTable {
  const step = Math.max(every, pieces.total / MAX_ROWS)
  const round = (v: number): number => Number(v.toPrecision(5))
  const times: number[] = []
  if (step > 0 && Number.isFinite(step)) {
    const count = Math.floor(pieces.total / step + 1e-9)
    for (let k = 0; k <= count; k++) times.push(Number((k * step).toPrecision(12)))
  }
  if (times.length === 0 || Math.abs(times[times.length - 1] - pieces.total) > 1e-9) times.push(pieces.total)
  const stamp = Date.now().toString(36)
  const columns = [
    { id: `mq${stamp}t`, name: 't', unit: 's' },
    { id: `mq${stamp}x`, name: 'x', unit: 'm' },
    { id: `mq${stamp}v`, name: 'v', unit: 'm/s' }
  ]
  return {
    id: `mq${stamp}`,
    title,
    columns,
    rows: times.map((t) => {
      const at = motionAt(pieces.stretches, t)
      return [round(t), round(at.x), round(at.v)]
    }),
    // Speed against time first: the braking question is read off its slope and its area.
    plot: { x: columns[0].id, y: columns[2].id, fit: 'linear' }
  }
}
