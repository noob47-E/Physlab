// Wrong answers for normal-distribution choice questions, each one a named misconception.
//
// A distractor that is just a nearby number teaches nothing; one that is exactly what a student
// gets by forgetting the "1 −" tells the student, when picked, which step went wrong. Each rule
// below re-runs the table route with one step done the wrong way, at the same four places the
// right answer is shown with, so a distractor can never differ from the answer only by noise.
//
// The rule names join `DistractorRule` in questions/pqjson.ts (QZ region); the sentences join
// RULE_WHY in questions/distractors.ts.

import { phiInv, pdf } from './normal'
import { tablePhi, toPlaces } from './table'
import type { NormalQuery } from './zscore'

export type ZMisconception =
  | 'z-sign'            // reads Φ(|z|) for a negative z: the minus sign dropped at the table
  | 'z-one-minus'       // the "1 −" forgotten for an upper tail, or added where none belongs
  | 'z-no-standardise'  // looks x up in the table as if it were already z
  | 'z-variance-for-sd' // divides by the variance σ² instead of the standard deviation σ
  | 'z-between-add'     // adds the two areas for P(a < Z < b) instead of subtracting
  | 'z-density'         // reads the height of the curve φ(z) instead of the area Φ(z)
  | 'z-tail-for-central' // inverse: uses the whole middle area as the area to the left (1.645 for 90 %)
  | 'z-central-for-tail' // inverse: splits a one-sided area between two tails (2.241 for 0.975)

/** The misconception each rule stands for, in words for the box under a wrong pick. */
export const Z_WHY: Record<ZMisconception, string> = {
  'z-sign': 'That reads the table at +z. For a negative z, use the symmetry of the curve: Φ(−z) = 1 − Φ(z).',
  'z-one-minus': 'That is the area on the other side. The table gives the area to the left of z; the area to the right is 1 minus it.',
  'z-no-standardise': 'That looks x up in the table as if it were z. Change x into z first: z = (x − μ)/σ.',
  'z-variance-for-sd': 'That divides by the variance. N(μ, σ²) gives σ², so divide by its square root σ.',
  'z-between-add': 'That adds the two areas. The area between a and b is Φ(b) − Φ(a).',
  'z-density': 'That is the height of the bell curve at z, not the area under it. Probabilities are areas.',
  'z-tail-for-central': 'That puts the whole middle area to the left of z. The middle area leaves half the rest in each tail.',
  'z-central-for-tail': 'That treats the area as a middle area with two tails. Here all of the rest is in one tail.'
}

export interface ZDistractor {
  /** The wrong value, at the places the answer is shown with (4 for an area, 3 for z, 2 for x). */
  value: number
  rule: ZMisconception
  why: string
}

// Table-route Φ for a z of either sign, as zscore.ts computes it (z rounded to three places).
const tPhi = tablePhi
const z2 = (v: number): number => toPlaces(v, 3)
const zOf = (x: number, q: NormalQuery): number => (q.dist ? (x - q.dist.mean) / q.dist.sd : x)
const zVar = (x: number, q: NormalQuery): number | null => (q.dist ? (x - q.dist.mean) / (q.dist.sd * q.dist.sd) : null)

/** The right answer by the table route — what the distractors are kept apart from. */
export function zAnswer(q: NormalQuery): number {
  switch (q.kind) {
    case 'below':
      return tPhi(z2(zOf(q.x, q)))
    case 'above':
      return toPlaces(1 - tPhi(z2(zOf(q.x, q))))
    case 'between':
      return toPlaces(tPhi(z2(zOf(q.b, q))) - tPhi(z2(zOf(q.a, q))))
    case 'inverse':
      return inverseValue(q, leftArea(q))
  }
}

function leftArea(q: Extract<NormalQuery, { kind: 'inverse' }>): number {
  return q.tail === 'below' ? q.p : q.tail === 'above' ? 1 - q.p : (1 + q.p) / 2
}

/** z (3 dp) or x (2 dp) for an area to the left. */
function inverseValue(q: Extract<NormalQuery, { kind: 'inverse' }>, left: number, sd = q.dist?.sd): number {
  const z = toPlaces(phiInv(left), 3)
  return q.dist ? toPlaces(q.dist.mean + z * (sd ?? q.dist.sd), 2) : z
}

/** Candidate wrong values, rule by rule, before the keep-apart filter. */
function candidates(q: NormalQuery): [ZMisconception, number | null][] {
  const out: [ZMisconception, number | null][] = []
  const prob = (v: number): number | null => (v >= 0 && v <= 1 ? toPlaces(v) : null)
  switch (q.kind) {
    case 'below':
    case 'above': {
      const flip = (v: number): number => (q.kind === 'below' ? v : 1 - v)
      const z = z2(zOf(q.x, q))
      out.push(['z-one-minus', prob(flip(1 - tPhi(z)))])
      if (z < 0) out.push(['z-sign', prob(flip(tPhi(-z)))])
      const zv = zVar(q.x, q)
      if (zv !== null) out.push(['z-variance-for-sd', prob(flip(tPhi(z2(zv))))])
      if (q.dist) out.push(['z-no-standardise', prob(flip(tPhi(z2(q.x))))])
      out.push(['z-density', prob(pdf(z))])
      break
    }
    case 'between': {
      const za = z2(zOf(q.a, q))
      const zb = z2(zOf(q.b, q))
      const right = tPhi(zb) - tPhi(za)
      if (za < 0) out.push(['z-sign', prob(tPhi(zb) - tPhi(-za))])
      out.push(['z-between-add', prob(tPhi(zb) + tPhi(za))])
      out.push(['z-one-minus', prob(1 - right)])
      const va = zVar(q.a, q)
      const vb = zVar(q.b, q)
      if (va !== null && vb !== null) out.push(['z-variance-for-sd', prob(tPhi(z2(vb)) - tPhi(z2(va)))])
      break
    }
    case 'inverse': {
      const left = leftArea(q)
      const right = inverseValue(q, left)
      // For an upper tail, taking p as the area to the left is the named slip; it gives the
      // mirror image, so it goes first and the plain sign slip (the same number) is then skipped.
      if (q.tail === 'above') out.push(['z-one-minus', inverseValue(q, q.p)])
      if (q.tail === 'central') out.push(['z-tail-for-central', inverseValue(q, q.p)])
      // z-sign: the minus sign lost (or gained) — the mirror image about the mean.
      out.push(['z-sign', q.dist ? toPlaces(2 * q.dist.mean - right, 2) : toPlaces(-right, 3)])
      // The reverse of z-tail-for-central: a one-sided area split between two tails.
      if (q.tail !== 'central') out.push(['z-central-for-tail', inverseValue(q, (1 + (q.tail === 'below' ? q.p : 1 - q.p)) / 2)])
      if (q.dist) {
        out.push(['z-variance-for-sd', inverseValue(q, left, q.dist.sd * q.dist.sd)])
        // Stopping at z: the standardised value given as if it were x.
        out.push(['z-no-standardise', toPlaces(phiInv(left), 3)])
      }
      break
    }
  }
  return out
}

/**
 * The distractors for one question: at most `max`, each named, each different from the answer
 * and from every other distractor at the places shown (so "0.0668" is never offered twice), and
 * each a possible value (an area between 0 and 1). A rule that cannot give such a value here is
 * skipped rather than bent into one.
 */
export function zscoreDistractors(q: NormalQuery, max = 4): ZDistractor[] {
  const answer = zAnswer(q)
  const eps = q.kind === 'inverse' ? (q.dist ? 0.005 : 0.0005) : 0.00005
  const seen = [answer]
  const out: ZDistractor[] = []
  for (const [rule, value] of candidates(q)) {
    if (value === null || !Number.isFinite(value)) continue
    if (seen.some((s) => Math.abs(s - value) < eps)) continue
    seen.push(value)
    out.push({ value, rule, why: Z_WHY[rule] })
    if (out.length === max) break
  }
  return out
}
