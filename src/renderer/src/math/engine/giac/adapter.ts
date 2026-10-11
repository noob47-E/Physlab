// The Giac adapter (part G1): PhysLab's engine requests as Giac commands (./spelling.ts writes
// them), sent through the worker (./worker.ts), and Giac's printed answers as PhysLab's results.
// Registered in math/engine/index.ts; ENGINE_FOR sends it no job until the scoreboard says so (G4).
//
// Every answer is read back through the spelling, so a name or form PhysLab cannot show is refused
// in a sentence, and an answer Giac could only give as a decimal is refused as inexact. Where Giac is
// known to answer wrongly it is checked, never trusted: a definite integral across a singular point
// (Giac gives the principal value, 0 for ∫₋₁¹ dx/x), a two-sided limit, a derivative at a corner of
// |x|, and every root of a solve, which is put back into its equations.

import { compileScalar } from '../../expr'
import type { EngineJob, EngineRequest, EngineResult, EngineValue, MathEngine } from '../types'
import {
  calls,
  CANT_READ,
  CANT_SHOW,
  fromTree,
  giacName,
  giacOf,
  hasInfinity,
  hasNoValue,
  isApproximate,
  lettersOf,
  readEquation,
  readGiac,
  readPhysLab,
  SpellingError,
  type SpellingContext,
  type Tree
} from './spelling'
import { giacRun, SENTENCES, type GiacRun } from './worker'

/** The jobs Giac answers. `exact` (a decimal's closed form) is not one: Giac has no recogniser, and its
 * exact() gives the nearest fraction (1607521/1136689 for √2), which would be a guess. The steps jobs
 * are PhysLab's own methods' (part S1). */
export const GIAC_JOBS: readonly EngineJob[] = ['eval', 'simplify', 'expand', 'factor', 'factorComplex', 'apart', 'diff', 'integrate', 'limit', 'series', 'solve']

/** What a student is told when Giac does not answer. The first four are the other engine's own words. */
export const REFUSALS = {
  read: CANT_READ,
  divideByZero: 'That divides by zero, so it has no value.',
  notExact: 'This one cannot be worked out exactly.',
  generic: 'I could not work this out. Check what you typed, or try a simpler form.',
  show: CANT_SHOW,
  notThisJob: 'This engine does not do that job.',
  noValue: 'That has no value.',
  noRealValue: 'That has no real value.',
  noLimit: 'This has no limit there.',
  sidesDiffer: 'The limits from the left and from the right are different, so there is no limit there.',
  noDerivative: 'This has no derivative at that point.',
  diverges: 'This integral has no value: it does not converge.',
  everyValue: (letters: string[]): string => `Every value of ${letters.join(' and ')} makes that true.`
} as const

/** A refusal on its way out of a job. */
class Refusal extends Error {
  constructor(readonly sentence: string) {
    super(sentence)
  }
}

const refuse = (error: string): EngineResult => ({ latex: '', text: '', numeric: null, error })

/** The longest printed answer read back: 20,000 characters is pages of formula. */
const MAX_ANSWER_LENGTH = 20000

/** The functions with a corner or a jump, where a derivative's value at a point must be checked from both sides. */
const NOT_SMOOTH = ['abs', 'sign', 'floor', 'ceil']

/** Each job's sentence for an answer with no value (Giac's undef, or its unsigned infinity). */
function noValueSentence(job: EngineJob, tree: Tree): string {
  if (job === 'limit') return tree.k === 'const' && tree.c === 'uinf' ? REFUSALS.sidesDiffer : REFUSALS.noLimit
  if (job === 'integrate') return REFUSALS.diverges
  if (job === 'diff') return REFUSALS.noDerivative
  return tree.k === 'const' && tree.c === 'uinf' ? REFUSALS.divideByZero : REFUSALS.noValue
}

/** A number Giac printed with evalf, as a double; null when it is not one, or does not fit one. */
export function giacNumber(s: string): number | null {
  const m = /^(-?)(\d*\.?\d+)(?:e([-+]?\d+))?$/.exec(s.trim())
  if (!m) return null
  const v = Number(s.trim())
  // 10^400 is not infinite and 2^-2000 is not 0: a value a double cannot hold has no number here.
  if (!Number.isFinite(v) || (v === 0 && /[1-9]/.test(m[2]))) return null
  return v
}

/** True when the tree writes i: in a request, the student is asking about complex numbers. */
function hasI(t: Tree): boolean {
  switch (t.k) {
    case 'const':
      return t.c === 'i'
    case 'neg':
    case 'fact':
    case 'deg':
      return hasI(t.a)
    case 'op':
      return hasI(t.a) || hasI(t.b)
    case 'call':
      return t.args.some(hasI)
    case 'list':
      return t.items.some(hasI)
    default:
      return false
  }
}

class GiacJob {
  readonly ctx: SpellingContext
  /**
   * Whether a complex answer may be shown. The real domain is the default (G00 §1): only factorComplex
   * ("Factorise with i"), a request that itself writes i, and solve's fallback when there is no real
   * root (solveJob) may answer with one. Anything else with an i in it has no real value.
   */
  complexOk: boolean

  constructor(
    private readonly run: GiacRun,
    readonly job: EngineJob,
    req: EngineRequest
  ) {
    this.ctx = { deg: req.deg }
    this.complexOk = job === 'factorComplex'
  }

  /** Read a request's expression, noting whether it writes i. */
  read(text: string): Tree {
    const t = readPhysLab(text)
    if (hasI(t)) this.complexOk = true
    return t
  }

  /** Giac's printed answers to `cmds`, in order; a refusal when the run did not finish. */
  async exec(cmds: string[]): Promise<string[]> {
    const r = await this.run(cmds)
    if ('error' in r) throw new Refusal(r.error)
    return r.outs
  }

  /** A printed answer as a tree, refused in the job's own words when it is not an exact answer PhysLab can show. */
  answer(out: string, allowInfinity: boolean): Tree {
    const text = out.trim()
    if (/^GIAC_ERROR/.test(text)) throw new Refusal(/Unidirectional limits are distinct/.test(text) && this.job === 'limit' ? REFUSALS.sidesDiffer : REFUSALS.generic)
    if (/Integer_too_large|too_large/i.test(text)) throw new Refusal(SENTENCES.tooBig)
    // expand((x+y+z+w)^40) prints half a megabyte: no screen shows that, and no reader should walk it.
    if (text.length > MAX_ANSWER_LENGTH) throw new Refusal(CANT_SHOW)
    let tree: Tree
    try {
      tree = readGiac(text)
    } catch (e) {
      // bounded_function(…) is Giac's way of saying a limit oscillates (sin(1/x) at 0).
      if (this.job === 'limit' && /^bounded_function\(/.test(text)) throw new Refusal(REFUSALS.noLimit)
      throw new Refusal(e instanceof SpellingError ? e.sentence : CANT_SHOW)
    }
    if (hasNoValue(tree)) throw new Refusal(noValueSentence(this.job, tree))
    if (isApproximate(tree)) throw new Refusal(REFUSALS.notExact)
    if (!allowInfinity && hasInfinity(tree)) throw new Refusal(REFUSALS.noValue)
    return tree
  }

  /** The Giac text of a tree read back from Giac (letters keep their prefix). */
  giac(t: Tree): string {
    return giacOf(t, { deg: false })
  }

  /**
   * Each tree's value as PhysLab shows it, with its number when it has no letters. In the real domain
   * a value with an i is refused: "no real value" when its number says so (√−4 is 2i), and as a form
   * PhysLab cannot show when it has letters, or Giac could not give its number.
   */
  async values(trees: Tree[]): Promise<EngineValue[]> {
    const numeric: Array<{ re: number; im?: number } | null> = trees.map(() => null)
    const asked: number[] = []
    const cmds: string[] = []
    trees.forEach((t, k) => {
      if (lettersOf(t).length) return
      if (t.k === 'const' && t.c === 'inf') numeric[k] = { re: Infinity }
      else if (t.k === 'neg' && t.a.k === 'const' && t.a.c === 'inf') numeric[k] = { re: -Infinity }
      else {
        asked.push(k)
        const g = this.giac(t)
        // Thirty digits, so a cancellation in the exact form cannot reach the double that is kept.
        cmds.push(`evalf(re(${g}),30)`, `evalf(im(${g}),30)`)
      }
    })
    if (cmds.length) {
      const outs = await this.exec(cmds)
      asked.forEach((k, j) => {
        const re = giacNumber(outs[2 * j])
        const im = giacNumber(outs[2 * j + 1])
        if (re !== null && im !== null) numeric[k] = im === 0 ? { re } : { re, im }
      })
    }
    if (!this.complexOk) {
      trees.forEach((t, k) => {
        const n = numeric[k]
        // An i that cancels (a real number Giac wrote with i) leaves an imaginary part that is round-off
        // beside the whole value; only one that is not is a value off the real line.
        if (n?.im !== undefined && Math.abs(n.im) > 1e-20 * (Math.abs(n.re) + Math.abs(n.im))) throw new Refusal(REFUSALS.noRealValue)
        if (n?.im !== undefined) numeric[k] = { re: n.re }
        else if (hasI(t) && !n) throw new Refusal(CANT_SHOW)
      })
    }
    return trees.map((t, k) => {
      const shown = fromTree(t)
      if (!shown.ok) throw new Refusal(shown.sentence)
      return { latex: shown.latex, text: shown.text, numeric: numeric[k] }
    })
  }

  /** A letter named in a request (var, vars): one letter, as its Giac name. */
  letter(name: string): { name: string; giac: string } {
    const t = readPhysLab(name)
    if (t.k !== 'sym') throw new SpellingError(CANT_READ)
    return { name: t.name, giac: giacName(t.name) }
  }

  expr(text: string | undefined): Tree {
    if (text === undefined) throw new SpellingError(CANT_READ)
    return this.read(text)
  }

  /** A bound, a point or a limit's target: any expression, ∞ included. */
  point(text: string | undefined): string {
    return giacOf(this.expr(text), this.ctx)
  }
}

/** One answer, as a result. */
async function single(j: GiacJob, out: string, allowInfinity = false): Promise<EngineResult> {
  const [v] = await j.values([j.answer(out, allowInfinity)])
  return v
}

async function simplifyJob(j: GiacJob, req: EngineRequest): Promise<EngineResult> {
  const t = j.expr(req.expr)
  const g = giacOf(t, j.ctx)
  // Giac's simplify writes trig in tan (cos²x − sin²x became (1 − tan²x)/(1 + tan²x)), which has no
  // value at x = π/2 where the question has one. A tan, cot, sec or csc the question did not have
  // sends it to tcollect (cos 2x), and then to normal, which never changes a function.
  const trig = ['tan', 'cot', 'sec', 'csc']
  const cmds = calls(t, ['sin', 'cos', 'tan', 'sec', 'csc', 'cot']) ? [`simplify(${g})`, `simplify(tcollect(${g}))`, `normal(${g})`] : [`simplify(${g})`]
  const outs = await j.exec(cmds)
  let first: Refusal | null = null
  for (const [k, out] of outs.entries()) {
    let tree: Tree
    try {
      tree = j.answer(out, false)
    } catch (e) {
      if (!(e instanceof Refusal)) throw e
      first ??= e
      continue
    }
    if (calls(tree, trig) && !calls(t, trig) && k < outs.length - 1) continue
    return (await j.values([tree]))[0]
  }
  throw first ?? new Refusal(REFUSALS.generic)
}

async function diffJob(j: GiacJob, req: EngineRequest): Promise<EngineResult> {
  const t = j.expr(req.expr)
  const g = giacOf(t, j.ctx)
  const v = j.letter(req.var ?? 'x')
  const order = req.order ?? 1
  if (!Number.isInteger(order) || order < 0 || order > 50) throw new SpellingError(CANT_READ)
  const [out] = await j.exec([order === 0 ? `simplify(${g})` : `simplify(diff(${g},${v.giac},${order}))`])
  const d = j.answer(out, false)
  const [result] = await j.values([d])
  if (req.at === undefined) return result
  const a = j.point(req.at)
  const dg = j.giac(d)
  // The function's own value there is asked too: a slope at a point outside the function's domain is
  // none (d/dx ln x is 1/x, which is −1 at x = −1, where ln x has no real value).
  const cmds = [`simplify(subst(${dg},${v.giac}=${a}))`, `simplify(subst(${g},${v.giac}=${a}))`]
  // At a corner (|x| at 0) the derivative's formula can still give a number: the slope is checked
  // from both sides, and the function must be continuous there too (sign x has slope 0 either side of 0).
  const corner = calls(t, NOT_SMOOTH) || calls(d, NOT_SMOOTH)
  if (corner) {
    cmds.push(`limit(${dg},${v.giac},${a},1)`, `limit(${dg},${v.giac},${a},-1)`, `limit(${g},${v.giac},${a},1)`, `limit(${g},${v.giac},${a},-1)`)
  }
  const outs = await j.exec(cmds)
  let at: Tree
  let fAt: Tree
  try {
    at = j.answer(outs[0], false)
    fAt = j.answer(outs[1], false)
    // The function's value must be real there (its number has no imaginary part), unless complex was asked.
    await j.values([fAt])
  } catch {
    throw new Refusal(REFUSALS.noDerivative)
  }
  if (corner) {
    const same = outs.slice(2, 4).every((o) => o.trim() === outs[0].trim()) && outs.slice(4, 6).every((o) => o.trim() === outs[1].trim())
    if (!same) throw new Refusal(REFUSALS.noDerivative)
  }
  const [value] = await j.values([at])
  return { ...result, value }
}

/** A printed list's items, split at its own commas only (rootof([[1,0,-2],…]) is one item). */
function listItems(text: string): string[] | null {
  const m = /^(?:list)?\[(.*)\]$/.exec(text.trim())
  if (!m) return null
  if (!m[1].trim()) return []
  const out: string[] = []
  let depth = 0
  let from = 0
  for (let k = 0; k < m[1].length; k++) {
    const c = m[1][k]
    if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) depth--
    else if (c === ',' && depth === 0) {
      out.push(m[1].slice(from, k).trim())
      from = k + 1
    }
  }
  out.push(m[1].slice(from).trim())
  return out
}

/**
 * The points strictly between two bounds where Giac says the integrand is singular, in Giac's
 * spelling and in order, and the bounds as numbers. Giac's singular() gives a periodic function's
 * points once (tan's ±π/2, not every π/2 + kπ); crossesAPole looks for the others. A point Giac
 * cannot place on the line refuses.
 */
async function interiorSingularities(j: GiacJob, g: string, v: string, lower: string, upper: string): Promise<{ inside: Array<{ at: number; giac: string }>; from: number; to: number }> {
  const [exact, approx, lo, hi] = await j.exec([`singular(${g},${v})`, `evalf(singular(${g},${v}),30)`, `evalf(${lower},30)`, `evalf(${upper},30)`])
  const bound = (s: string): number | null => (/^\+?infinity$/.test(s.trim()) ? Infinity : /^-infinity$/.test(s.trim()) ? -Infinity : giacNumber(s))
  const a = bound(lo)
  const b = bound(hi)
  const exacts = listItems(exact)
  const nums = listItems(approx)
  if (a === null || b === null || !exacts || !nums || exacts.length !== nums.length) throw new Refusal(REFUSALS.notExact)
  const [from, to] = a <= b ? [a, b] : [b, a]
  const inside: Array<{ at: number; giac: string }> = []
  nums.forEach((n, k) => {
    // A complex singular point (it has an i) is not on the real line between the bounds.
    if (/\bi\b/.test(n)) return
    const at = giacNumber(n)
    if (at === null) throw new Refusal(REFUSALS.notExact)
    if (at > from && at < to) inside.push({ at, giac: j.giac(j.answer(exacts[k], false)) })
  })
  return { inside: inside.sort((p, q) => p.at - q.at), from, to }
}

/** How many points crossesAPole samples, and how far above the integrand's middle size both sides of a sign change must be. */
const POLE_SAMPLES = 20000
const POLE_RATIO = 100

/**
 * Whether the integrand changes sign between two neighbouring samples while both are huge beside its
 * median size: an odd pole, which a continuous function cannot imitate between points this close.
 * This is the pole singular() did not list (tan x at 5π/2), where Giac's answer is the principal value.
 * The integrand is sampled as a graph is drawn (math/expr.ts compileScalar: radians, real odd roots).
 */
function crossesAPole(t: Tree, ctx: SpellingContext, v: string, from: number, to: number): boolean {
  if (!Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) return false
  const shown = fromTree(readGiac(giacOf(t, ctx)))
  if (!shown.ok) return false
  let f: (x: number) => number
  try {
    const compiled = compileScalar(shown.text, [v], () => ({}))
    f = (x) => compiled({ [v]: x })
  } catch {
    return false
  }
  const ys: number[] = []
  for (let k = 0; k < POLE_SAMPLES; k++) ys.push(f(from + ((to - from) * (k + 0.5)) / POLE_SAMPLES))
  const sizes = ys.filter(Number.isFinite).map(Math.abs).sort((p, q) => p - q)
  const middle = sizes[sizes.length >> 1]
  if (sizes.length < POLE_SAMPLES / 2 || !(middle > 0)) return false
  for (let k = 1; k < ys.length; k++) {
    const p = ys[k - 1]
    const q = ys[k]
    if (Number.isFinite(p) && Number.isFinite(q) && p * q < 0 && Math.min(Math.abs(p), Math.abs(q)) > POLE_RATIO * middle) return true
  }
  return false
}

async function integrateJob(j: GiacJob, req: EngineRequest): Promise<EngineResult> {
  const t = j.expr(req.expr)
  const g = giacOf(t, j.ctx)
  const v = j.letter(req.var ?? 'x')
  if (req.lower === undefined || req.upper === undefined) {
    const [out] = await j.exec([`integrate(${g},${v.giac})`])
    // An integral Giac could not do comes back as an integrate(…) of something else.
    if (/\bintegrate\(/.test(out)) throw new Refusal(REFUSALS.notExact)
    return single(j, out)
  }
  const a = j.point(req.lower)
  const b = j.point(req.upper)
  // Across a singular point Giac gives the principal value (∫₋₁¹ dx/x = 0, ∫₀^π tan x dx = 0): the
  // integral is split there, and it has a value only when every piece has one.
  const { inside, from, to } = await interiorSingularities(j, g, v.giac, a, b)
  // A pole singular() did not list, between two of the points the integral is cut at: the samples
  // cannot say whether the integral converges, only that Giac's answer would be a principal value,
  // so it is refused without a claim either way.
  const edges = [from, ...inside.map((p) => p.at), to]
  if (edges.slice(1).some((e, k) => crossesAPole(t, j.ctx, v.name, edges[k], e))) throw new Refusal(REFUSALS.notExact)
  if (!inside.length) {
    const [out] = await j.exec([`simplify(integrate(${g},${v.giac},${a},${b}))`])
    if (/\bintegrate\(/.test(out)) throw new Refusal(REFUSALS.notExact)
    return single(j, out, true)
  }
  const cuts = [a, ...inside.map((p) => p.giac), b]
  const pieces = await j.exec(cuts.slice(1).map((to, k) => `simplify(integrate(${g},${v.giac},${cuts[k]},${to}))`))
  const trees = pieces.map((p) => {
    if (/\bintegrate\(/.test(p)) throw new Refusal(REFUSALS.notExact)
    return j.answer(p, true)
  })
  const signs = new Set(trees.filter(hasInfinity).map((p) => (p.k === 'neg' ? -1 : 1)))
  if (signs.size > 1) throw new Refusal(REFUSALS.diverges)
  if (signs.size === 1) return single(j, signs.has(1) ? '+infinity' : '-infinity', true)
  const [sum] = await j.exec([`simplify(${pieces.map((p) => `(${p})`).join('+')})`])
  return single(j, sum)
}

/** How near a point the function is sampled on each side, as fractions of the point's own size (at least 1). */
const SIDE_STEPS = [1e-3, 1e-4, 1e-5, 1e-6, 1e-7]

/**
 * Whether the function has a real value just to one side of a point, as a graph would draw it there
 * (math/expr.ts compileScalar, radians, real odd roots): √x has none left of 0, so it has no limit from
 * the left, and none from both sides, whatever Giac's complex answer says. Null when it cannot be told
 * (another letter in it, or a point that is not a number).
 */
function definedOnSide(t: Tree, ctx: SpellingContext, v: string, at: number | null, side: 1 | -1): boolean | null {
  if (at === null || lettersOf(t).some((n) => n !== v)) return null
  const shown = fromTree(readGiac(giacOf(t, ctx)))
  if (!shown.ok) return null
  let f: (x: number) => number
  try {
    const compiled = compileScalar(shown.text, [v], () => ({}))
    f = (x) => compiled({ [v]: x })
  } catch {
    return null
  }
  return SIDE_STEPS.some((h) => Number.isFinite(f(at + side * h * Math.max(1, Math.abs(at)))))
}

async function limitJob(j: GiacJob, req: EngineRequest): Promise<EngineResult> {
  const t = j.expr(req.expr)
  const g = giacOf(t, j.ctx)
  const v = j.letter(req.var ?? 'x')
  const to = j.point(req.to)
  const toTree = readPhysLab(req.to as string)
  const atInfinity = (toTree.k === 'const' && toTree.c === 'inf') || (toTree.k === 'neg' && toTree.a.k === 'const' && toTree.a.c === 'inf')
  if (!atInfinity && !j.complexOk) {
    // A side where the function has no real value has no limit (G00: the real domain).
    const [point] = await j.exec([`evalf(${to},30)`])
    const at = giacNumber(point)
    const sides: Array<1 | -1> = req.dir === '+' ? [1] : req.dir === '-' ? [-1] : [1, -1]
    if (sides.some((side) => definedOnSide(t, j.ctx, v.name, at, side) === false)) throw new Refusal(REFUSALS.noLimit)
  }
  if (req.dir === '+' || req.dir === '-' || atInfinity) {
    const [out] = await j.exec([`limit(${g},${v.giac},${to}${atInfinity ? '' : req.dir === '+' ? ',1' : ',-1'})`])
    return single(j, out, true)
  }
  // Two-sided: both sides are asked too, and must agree with it (G00: refuse when they disagree).
  const outs = await j.exec([`limit(${g},${v.giac},${to})`, `limit(${g},${v.giac},${to},1)`, `limit(${g},${v.giac},${to},-1)`])
  const both = j.answer(outs[0], true)
  if (outs[1].trim() !== outs[0].trim() || outs[2].trim() !== outs[0].trim()) throw new Refusal(REFUSALS.sidesDiffer)
  return (await j.values([both]))[0]
}

async function seriesJob(j: GiacJob, req: EngineRequest): Promise<EngineResult> {
  const t = j.expr(req.expr)
  const g = giacOf(t, j.ctx)
  const v = j.letter(req.var ?? 'x')
  const at = j.point(req.at ?? '0')
  const n = req.n ?? 6
  if (!Number.isInteger(n) || n < 1 || n > 60) throw new SpellingError(CANT_READ)
  // n terms, as the other engine counts them: the powers below n. Giac's order is the highest power kept.
  const [out] = await j.exec([`convert(series(${g},${v.giac},${at},${n - 1}),polynom)`])
  return single(j, out)
}

async function solveJob(j: GiacJob, req: EngineRequest): Promise<EngineResult> {
  const eqs = (req.eqs ?? []).filter((s) => s.trim()).map(readEquation)
  if (eqs.some((e) => hasI(e.lhs) || hasI(e.rhs))) j.complexOk = true
  if (!eqs.length) throw new SpellingError(CANT_READ)
  const letters = req.vars?.length ? req.vars.map((n) => j.letter(n)) : lettersOf(...eqs.flatMap((e) => [e.lhs, e.rhs])).map((n) => j.letter(n))
  if (!letters.length) throw new Refusal(REFUSALS.generic)
  const sides = eqs.map((e) => ({ l: giacOf(e.lhs, j.ctx), r: giacOf(e.rhs, j.ctx) }))
  const system = sides.length > 1 || letters.length > 1
  const call = (fn: string): string =>
    system ? `${fn}([${sides.map((s) => `${s.l}=${s.r}`).join(',')}],[${letters.map((l) => l.giac).join(',')}])` : `${fn}(${sides[0].l}=${sides[0].r},${letters[0].giac})`
  // The real domain (G00 §1): real roots, and the complex ones only when there is no real one.
  let [out] = await j.exec([call('solve')])
  let found = j.answer(out, false)
  if (found.k !== 'list') throw new Refusal(REFUSALS.generic)
  if (!found.items.length) {
    // No real root: the complex ones are the answer G00 §1 names ("No real solution. In complex numbers: …").
    j.complexOk = true
    ;[out] = await j.exec([call('csolve')])
    found = j.answer(out, false)
    if (found.k !== 'list') throw new Refusal(REFUSALS.generic)
  }
  const rows = found.items.map((item) => {
    const values = item.k === 'list' ? item.items : [item]
    if (values.length !== letters.length) throw new Refusal(REFUSALS.generic)
    return letters.map((l, k) => ({ letter: l, value: values[k] }))
  })
  // Every row is put back into every equation, exactly: a root that does not satisfy them is never shown.
  const checks = rows.flatMap((row) =>
    sides.map((s) => `simplify(subst((${s.l})-(${s.r}),[${row.map((c) => c.letter.giac).join(',')}],[${row.map((c) => j.giac(c.value)).join(',')}]))`)
  )
  if (checks.length) {
    const outs = await j.exec(checks)
    if (outs.some((o) => o.trim() !== '0')) throw new Refusal(REFUSALS.generic)
  }
  // A letter that equals itself is free (x + y = 1 gives x = 1 − y, y = y): it is left out, as the
  // other engine leaves it out; a row with nothing left says every value works.
  const kept = rows.map((row) => row.filter((c) => !(c.value.k === 'sym' && c.value.name === c.letter.name)))
  if (kept.length && kept.every((row) => !row.length)) throw new Refusal(REFUSALS.everyValue(letters.map((l) => l.name)))
  const flat = kept.flat()
  const shown = await j.values(flat.map((c) => c.value))
  let k = 0
  const solutions = kept.map((row) => Object.fromEntries(row.map((c) => [c.letter.name, shown[k++]])))
  return { latex: '', text: '', numeric: null, solutions, vars: letters.map((l) => l.name) }
}

async function answer(run: GiacRun, job: EngineJob, req: EngineRequest): Promise<EngineResult> {
  const j = new GiacJob(run, job, req)
  switch (job) {
    case 'eval':
    case 'simplify':
      return simplifyJob(j, req)
    case 'expand':
    case 'factor':
    case 'factorComplex': {
      const g = giacOf(j.expr(req.expr), j.ctx)
      const fn = job === 'expand' ? 'expand' : job === 'factor' ? 'factor' : 'cfactor'
      const [out] = await j.exec([`${fn}(${g})`])
      return single(j, out)
    }
    case 'apart': {
      const t = j.expr(req.expr)
      const g = giacOf(t, j.ctx)
      const letters = lettersOf(t)
      // Partial fractions in one letter, as the other engine does them; with two letters it is refused.
      if (letters.length > 1) throw new Refusal(REFUSALS.notExact)
      const [out] = await j.exec([letters.length ? `partfrac(${g},${giacName(letters[0])})` : `simplify(${g})`])
      return single(j, out)
    }
    case 'diff':
      return diffJob(j, req)
    case 'integrate':
      return integrateJob(j, req)
    case 'limit':
      return limitJob(j, req)
    case 'series':
      return seriesJob(j, req)
    case 'solve':
      return solveJob(j, req)
    default:
      return refuse(REFUSALS.notThisJob)
  }
}

/** The Giac engine, sending through `run` (the app's worker; a headless one in tests). */
export function giacEngine(run: GiacRun = giacRun): MathEngine {
  return {
    name: 'giac',
    jobs: new Set(GIAC_JOBS),
    async ask(job, req) {
      if (!GIAC_JOBS.includes(job)) return refuse(REFUSALS.notThisJob)
      try {
        return await answer(run, job, req)
      } catch (e) {
        if (e instanceof Refusal || e instanceof SpellingError) return refuse(e.sentence)
        return refuse(REFUSALS.generic)
      }
    }
  }
}
