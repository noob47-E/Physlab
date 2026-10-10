// Trig-identity proofs (math/pure/trigIdentity.ts says how they work): the search that joins the two sides, and the sentence when they are not equal.
// Out of trigIdentity.ts as a pure move (CLEANUP-PLAN.md CW10d).

import { fmtPrecise } from '../../format'
import { evaluate, linKey, size, type Sum } from './canonical'
import { sumPrint } from './write'
import { agrees, CHECK_POINTS, fnSites, type Rewrite, rewrites } from './rules'

// ---------------------------------------------------------------------------------------------
// The search
// ---------------------------------------------------------------------------------------------

interface TrigLine {
  /** The expression on this line, in a student's notation. */
  text: string
  tex: string
  /** What was done to reach this line, past tense; empty on the first line. */
  rule: string
  /** The formula used, as LaTeX. */
  chip: string
  id: string
}

export interface ProveOptions {
  /** Combined depth of the two searches. */
  maxDepth?: number
  /** Stop after this many expressions have been looked at. */
  nodeCap?: number
  /** Search only from the left (for comparison; the default meets in the middle). */
  forwardOnly?: boolean
  /**
   * Stop looking after this many milliseconds (default 1500): the search runs on the main
   * thread as the student presses Enter, so it must hand back the "True" answer promptly.
   */
  budgetMs?: number
  /** A rule that changes a value throws instead of being skipped (the tests turn this on). */
  strict?: boolean
}

interface Node {
  s: Sum
  parent: string | null
  step: Rewrite | null
  depth: number
  /** Sum of the rule costs from this side's start. */
  cost: number
}

function allArgs(s: Sum, out = new Set<string>()): Set<string> {
  for (const x of fnSites(s).values()) out.add(linKey(x.a))
  return out
}

interface Proof {
  lines: TrigLine[]
  rules: string[]
  /** Expressions looked at, for the spike's statistics. */
  nodes: number
}

/**
 * What a step costs the reader. Every step costs 1; the ones a textbook reaches for only when the
 * question is about them cost more, so between two chains of the same length — or one step
 * longer — the search prints the one a teacher would write: cos 3x = cos(2x + x) = …, not
 * cos 3x = cos x − 2 sin x sin 2x = ….
 */
const RULE_COST: Record<string, number> = {
  'product-to-sum': 2.5,
  'sum-to-product': 1.5,
  'pythag-sub': 1.1,
  'half-expand': 1.2
}
const stepCost = (r: Rewrite, backward: boolean): number =>
  // Read forwards, a backward "expand" is a factorisation of a full expansion: harder to follow.
  (RULE_COST[r.id] ?? 1) + (backward && r.id === 'expand' ? 0.5 : 0)

/**
 * The chip for a rule read backwards, where the law runs the other way: a common denominator read
 * backwards is a split, and the chip beside "Split into separate fractions." used to show a/b + c/d
 * being combined. Rules whose chip is an equation true both ways (the double angle) are not here.
 */
const REVERSE_CHIP: Record<string, string> = {
  'common-denominator': '\\dfrac{a + b}{c} = \\dfrac{a}{c} + \\dfrac{b}{c}',
  split: '\\dfrac{a}{b} + \\dfrac{c}{d} = \\dfrac{ad + bc}{bd}',
  factor: 'a(b + c) = ab + ac'
}
/** The chip beside a backward step: an expansion read backwards is its own law turned round. */
const reverseChip = (r: Rewrite): string => REVERSE_CHIP[r.id] ?? (r.id === 'expand' ? r.chip.split(' = ').reverse().join(' = ') : r.chip)

/** The three check points and two more: whether the two sides agree at all. */
export const FIVE_POINTS = [...CHECK_POINTS, { x: 1, A: 1, B: 0.3, θ: 1, t: 1 }, { x: 0.2, A: 0.9, B: 0.1, θ: 0.2, t: 0.2 }]

/** Prove lhs = rhs, or say why not. */
export function proveIdentity(lhs: Sum, rhs: Sum, opts: ProveOptions = {}): Proof | { refused: string; nodes?: number } {
  const maxDepth = opts.maxDepth ?? 6
  const nodeCap = opts.nodeCap ?? 60000
  const deadline = performance.now() + (opts.budgetMs ?? 1500)
  let outOfTime = false
  if (!agrees(lhs, rhs, FIVE_POINTS)) return { refused: 'not-equal' }

  const targetsFwd = allArgs(rhs)
  const targetsBwd = allArgs(lhs)
  const limit = Math.max(size(lhs), size(rhs)) * 2 + 8
  const fwd = new Map<string, Node>([[lhs.key, { s: lhs, parent: null, step: null, depth: 0, cost: 0 }]])
  const bwd = new Map<string, Node>([[rhs.key, { s: rhs, parent: null, step: null, depth: 0, cost: 0 }]])
  let best: { key: string; cost: number; ahead: number } | null = lhs.key === rhs.key ? { key: lhs.key, cost: 0, ahead: 0 } : null
  let fFront = [lhs.key]
  let bFront = [rhs.key]
  let fDepth = 0
  let bDepth = 0
  let nodes = 2
  const consider = (key: string) => {
    const a = fwd.get(key)
    const b = bwd.get(key)
    // A chain may be at most maxDepth steps long, however the two sides split it.
    if (!a || !b || a.depth + b.depth > maxDepth) return
    const cost = a.cost + b.cost
    // Cheaper wins; at equal cost, the chain with more steps done from the left (a textbook
    // works forwards from the side it starts on).
    if (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) < 1e-9 && a.depth > best.ahead)) best = { key, cost, ahead: a.depth }
  }
  // The levels grown may run two past maxDepth in total: a side that cannot meet the other (the
  // backward side of cos 3x = 4 cos³x − 3 cos x) must not use up the depth the other side needs.
  while (fDepth + bDepth < maxDepth + 2 && Math.max(fDepth, bDepth) < maxDepth && nodes < nodeCap && !outOfTime) {
    // A chain not found yet needs a new level on one side, so it has at least min(depths) + 1
    // steps, and every step costs at least 1: nothing cheaper than that bound can turn up.
    if (best && best.cost <= Math.min(fDepth, bDepth) + 1) break
    if (fFront.length === 0 && bFront.length === 0) break
    // Grow the side whose frontier is smaller (the two meet in the middle at the least cost),
    // but never let one side run more than two levels ahead of the other: a narrow side that
    // never meets would otherwise spend the whole depth budget on its own.
    let growF = fFront.length > 0 && (bFront.length === 0 || fFront.length <= bFront.length)
    if (growF && fDepth >= bDepth + 2 && bFront.length) growF = false
    else if (!growF && bDepth >= fDepth + 2 && fFront.length) growF = true
    // Once a chain is known, only the shallower side can still find a cheaper one soon.
    if (best && fFront.length && bFront.length) growF = fDepth <= bDepth
    if (opts.forwardOnly) {
      if (fFront.length === 0) break
      growF = true
    }
    const [mine, front, targets] = growF ? [fwd, fFront, targetsFwd] : [bwd, bFront, targetsBwd]
    const next: string[] = []
    for (const key of front) {
      const node = mine.get(key)!
      for (const r of rewrites(node.s, targets, opts.strict ?? false)) {
        if (size(r.s) > limit) continue
        const cost = node.cost + stepCost(r, !growF)
        const old = mine.get(r.s.key)
        if (old) {
          // Reached again on this same level by a cheaper step: keep the cheaper way.
          if (old.depth === node.depth + 1 && cost < old.cost - 1e-9) mine.set(r.s.key, { ...old, parent: key, step: r, cost })
          else continue
        } else {
          mine.set(r.s.key, { s: r.s, parent: key, step: r, depth: node.depth + 1, cost })
          nodes++
          next.push(r.s.key)
        }
        consider(r.s.key)
        if (nodes >= nodeCap) break
      }
      if (nodes >= nodeCap) break
      // Out of time: keep the chain found so far, if any, or give the "True" answer without one.
      if (performance.now() > deadline) {
        outOfTime = true
        break
      }
    }
    if (growF) {
      fFront = next
      fDepth++
    } else {
      bFront = next
      bDepth++
    }
  }
  if (!best) return { refused: 'not-found', nodes }

  // Forward half: LHS … meet. Backward half: meet … RHS, each backward step read in reverse.
  const meet: string = (best as { key: string }).key
  const left: Node[] = []
  for (let k: string | null = meet; k; k = fwd.get(k)!.parent) left.unshift(fwd.get(k)!)
  const lines: TrigLine[] = left.map((n, i) => ({
    ...sumPrint(n.s),
    rule: i === 0 ? '' : n.step!.fwd,
    chip: i === 0 ? '' : n.step!.chip,
    id: i === 0 ? '' : n.step!.id
  }))
  for (let k: string | null = meet; k; ) {
    const n: Node = bwd.get(k)!
    if (!n.parent) break
    const p = bwd.get(n.parent)!
    lines.push({ ...sumPrint(p.s), rule: n.step!.rev, chip: reverseChip(n.step!), id: n.step!.id })
    k = n.parent
  }
  return { lines, rules: lines.slice(1).map((l) => l.id), nodes }
}

/**
 * The sentence for an identity that is not one: both sides at x = 1 (or A = 1, B = 0.3), in
 * radians. Every letter shown is the value used, and a point where the two sides happen to read
 * the same to `places` decimal places is passed over for the next, so the sentence always shows a
 * difference. Two sides that differ only further out are shown to as many places as that takes.
 */
export function notEqualSentence(lhsText: string, rhsText: string, lhs: Sum, rhs: Sum, places = 3): string {
  const names = [...new Set([...allArgs(lhs), ...allArgs(rhs)].flatMap((k) => k.match(/[A-Za-zθ]/g) ?? []))]
  const known: Record<string, number> = { x: 1, A: 1, B: 0.3, θ: 1, t: 1 }
  const spare = [0.3, 0.6, 0.8, 1.2, 1.5]
  const first: Record<string, number> = {}
  let k = 0
  for (const n of names) first[n] = known[n] ?? (k++ === 0 ? 1 : spare[(k - 2) % spare.length])
  // Wider points too: tan(x/100) and sin(x/100) read 0.01 and 0.01 at every point near 1 (GLM #11).
  const candidates = [first, ...[0.5, 0.7, 1.3, 2, 5, 10].map((f) => Object.fromEntries(names.map((n) => [n, Math.round(first[n] * f * 100) / 100])))]
  const sides = (at: Record<string, number>): [number, number] => [evaluate(lhs, at), evaluate(rhs, at)]
  const dp =
    (p: number) =>
    (v: number): string =>
      fmtPrecise(v, { decimals: p, precisionMode: 'dp' })
  // A real difference at p places, not two values either side of a rounding edge: sin 0.0005 and
  // tan 0.0005 differ by 4×10⁻¹¹, yet round to 0 and 0.001, which says sin is 0 (GLM #11).
  const shows = (at: Record<string, number>, p: number): boolean => {
    const [a, b] = sides(at)
    return Number.isFinite(a) && Number.isFinite(b) && dp(p)(a) !== dp(p)(b) && Math.abs(a - b) >= 0.5 * 10 ** -p
  }
  // No letters, no point: "at , cos π = −1" had nothing to say where (GLM #26).
  const where = (at: Record<string, number>): string => (names.length ? ` at ${names.map((n) => `${n} = ${dp(places)(at[n])} rad`).join(', ')},` : '')
  const said = (at: Record<string, number>, p: number, lead: string): string => {
    const [a, b] = sides(at)
    return `${lead}:${where(at)} ${lhsText} = ${dp(p)(a)} but ${rhsText} = ${dp(p)(b)}.`
  }
  const NOT_EQUAL = 'Those two sides are not equal, so there is nothing to prove'
  const at = candidates.find((q) => shows(q, places))
  if (at) return said(at, places, NOT_EQUAL)
  // The sides differ only past the places shown: two equal-looking numbers under "not equal"
  // contradict the sentence, so the point where they differ most is shown to as many places as it
  // takes to see the difference, and the sentence says how far out that is.
  const gap = (q: Record<string, number>): number => {
    const [a, b] = sides(q)
    return Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) : -1
  }
  const widest = candidates.reduce((best, q) => (gap(q) > gap(best) ? q : best))
  if (gap(widest) < 0) return said(first, places, NOT_EQUAL)
  for (let p = places + 1; p <= 12; p++) {
    if (shows(widest, p)) return said(widest, p, `${NOT_EQUAL}, though they differ only from the ${ordinal(p)} decimal place`)
  }
  return `${NOT_EQUAL}, though they differ only beyond the 12th decimal place.`
}

const ordinal = (n: number): string => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`
