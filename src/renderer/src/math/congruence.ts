// Are two triangles the same triangle? And if so, by which rule — SSS, SAS, ASA, AAS or RHS —
// with every equality written out, the way a proof is marked. Pure, so the panel and the tests
// share one answer.

import { triangleInfo } from './geometry'
import { interiorAngles, sideLengths } from './shapes'
import type { V3 } from './vec'

export type CongruenceTest = 'SSS' | 'SAS' | 'ASA' | 'AAS' | 'RHS'

export interface Tri {
  /** Corner names in order, e.g. ['A', 'B', 'C']. */
  names: [string, string, string]
  pts: [V3, V3, V3]
}

/** One matched pair of parts: side AB against side DE, or angle B against angle E. */
export interface Pair {
  kind: 'side' | 'angle'
  /** The part in the first triangle, e.g. "AB" or "B". */
  a: string
  b: string
  valueA: number
  valueB: number
  equal: boolean
}

export interface Congruence {
  congruent: boolean
  test: CongruenceTest | null
  /** For each corner of the first triangle, the corner of the second it matches. */
  mapping: [number, number, number]
  /** The corners of the second triangle in matching order, e.g. "△DEF" against "△ABC". */
  matchedName: string
  sides: Pair[]
  angles: Pair[]
  /** Not congruent, but every angle matches: the same shape at another size. */
  similar: { ratio: number } | null
  /** Plain-English lines a student can copy into a proof. Angles in radians are already converted by the caller's formatter. */
  reasons: string[]
}

const PERMS: [number, number, number][] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0]
]

/** Side opposite corner i is between the other two corners. */
const sideName = (names: [string, string, string], i: number) => names[(i + 1) % 3] + names[(i + 2) % 3]

export interface CompareOptions {
  /** Relative tolerance on lengths, and the same figure in radians for angles. Drawings snap to a grid, so 0.5 % is forgiving without being wrong. */
  tolerance?: number
  /** How to write a length and an angle in the reasons. */
  fmtLength?: (v: number) => string
  fmtAngle?: (rad: number) => string
}

export function compareTriangles(A: Tri, B: Tri, opts: CompareOptions = {}): Congruence {
  const tol = opts.tolerance ?? 5e-3
  const fl = opts.fmtLength ?? ((v) => v.toFixed(2))
  const fa = opts.fmtAngle ?? ((r) => `${((r * 180) / Math.PI).toFixed(1)}°`)
  const ia = triangleInfo(A.pts[0], A.pts[1], A.pts[2])
  const ib = triangleInfo(B.pts[0], B.pts[1], B.pts[2])
  const scale = Math.max(...ia.sides, ...ib.sides, 1e-9)
  const eqLen = (x: number, y: number) => Math.abs(x - y) <= tol * scale
  const eqAng = (x: number, y: number) => Math.abs(x - y) <= tol * 2

  // Try every way of matching the corners and keep the one with the most equal parts.
  let best: { perm: [number, number, number]; sides: Pair[]; angles: Pair[]; score: number } | null = null
  for (const perm of PERMS) {
    const sides: Pair[] = []
    const angles: Pair[] = []
    for (let i = 0; i < 3; i++) {
      const j = perm[i]
      const sa = ia.sides[i]
      const sb = ib.sides[j]
      sides.push({ kind: 'side', a: sideName(A.names, i), b: sideName(B.names, j), valueA: sa, valueB: sb, equal: eqLen(sa, sb) })
      const aa = ia.angles[i]
      const ab = ib.angles[j]
      angles.push({ kind: 'angle', a: A.names[i], b: B.names[j], valueA: aa, valueB: ab, equal: eqAng(aa, ab) })
    }
    const score = sides.filter((p) => p.equal).length * 2 + angles.filter((p) => p.equal).length
    if (!best || score > best.score) best = { perm, sides, angles, score }
  }
  const { perm, sides, angles } = best!
  const es = sides.map((p) => p.equal)
  const ea = angles.map((p) => p.equal)
  const nSides = es.filter(Boolean).length
  const nAngles = ea.filter(Boolean).length
  const matchedName = perm.map((j) => B.names[j]).join('')
  const reasons: string[] = []
  const sideLine = (p: Pair) => `${p.a} = ${p.b} = ${fl(p.valueA)}`
  const angleLine = (p: Pair) => `∠${p.a} = ∠${p.b} = ${fa(p.valueA)}`

  let test: CongruenceTest | null = null
  if (nSides === 3) {
    test = 'SSS'
    sides.forEach((p) => reasons.push(sideLine(p)))
  } else {
    // Side i is opposite corner i, so the angle *included* between sides i and j is corner k.
    for (let k = 0; k < 3 && !test; k++) {
      const i = (k + 1) % 3
      const j = (k + 2) % 3
      if (es[i] && es[j] && ea[k]) {
        test = 'SAS'
        reasons.push(sideLine(sides[i]), angleLine(angles[k]), sideLine(sides[j]))
      }
    }
    // ASA: two angles and the side between them; the side between corners i and j is side k.
    for (let k = 0; k < 3 && !test; k++) {
      const i = (k + 1) % 3
      const j = (k + 2) % 3
      if (ea[i] && ea[j] && es[k]) {
        test = 'ASA'
        reasons.push(angleLine(angles[i]), sideLine(sides[k]), angleLine(angles[j]))
      }
    }
    // AAS: two angles and any other side (the third angle follows from the angle sum).
    if (!test && nAngles >= 2 && nSides >= 1) {
      test = 'AAS'
      angles.filter((p) => p.equal).slice(0, 2).forEach((p) => reasons.push(angleLine(p)))
      reasons.push(sideLine(sides.find((p) => p.equal)!))
    }
    // RHS: a right angle, equal hypotenuses, and one more equal side.
    if (!test && nSides >= 2) {
      const right = angles.findIndex((p) => p.equal && Math.abs(p.valueA - Math.PI / 2) <= tol * 2)
      if (right >= 0 && es[right]) {
        const other = sides.findIndex((p, i) => p.equal && i !== right)
        if (other >= 0) {
          test = 'RHS'
          reasons.push(`∠${angles[right].a} = ∠${angles[right].b} = 90°`, `${sideLine(sides[right])} (the hypotenuse)`, sideLine(sides[other]))
        }
      }
    }
  }

  const congruent = test !== null
  const nameA = A.names.join('')
  if (congruent) {
    const by = test === 'SSS' ? 'three sides' : test === 'SAS' ? 'two sides and the angle between them' : test === 'ASA' ? 'two angles and the side between them' : test === 'AAS' ? 'two angles and a side' : 'the right angle, the hypotenuse and a side'
    reasons.push(`So △${nameA} ≅ △${matchedName} by ${test} (${by}).`)
  } else {
    const wrong = sides.find((p) => !p.equal)
    if (wrong) reasons.push(`${wrong.a} = ${fl(wrong.valueA)} but ${wrong.b} = ${fl(wrong.valueB)}, so the triangles are not congruent.`)
    else {
      const wa = angles.find((p) => !p.equal)
      if (wa) reasons.push(`∠${wa.a} = ${fa(wa.valueA)} but ∠${wa.b} = ${fa(wa.valueB)}, so the triangles are not congruent.`)
    }
  }

  let similar: { ratio: number } | null = null
  if (!congruent && nAngles === 3) {
    const ratio = sides[0].valueB / sides[0].valueA
    similar = { ratio }
    reasons.push(`All three angles match, so the triangles are similar: △${matchedName} is ${fl(ratio)} times △${nameA}.`)
  }

  return { congruent, test, mapping: perm, matchedName, sides, angles, similar, reasons }
}

/**
 * A triangle from three side lengths, laid on the plane with the first side along x, or null
 * when no such triangle exists (the two shorter sides must reach across the longest).
 */
export function triangleFromSides(a: number, b: number, c: number, at: V3 = [0, 0, 0]): [V3, V3, V3] | null {
  if (a <= 0 || b <= 0 || c <= 0) return null
  if (a + b <= c || b + c <= a || c + a <= b) return null
  // Side c along x from A to B; C found from b (from A) and a (from B).
  const x = (b * b - a * a + c * c) / (2 * c)
  const y = Math.sqrt(Math.max(0, b * b - x * x))
  return [
    [at[0], at[1], at[2]],
    [at[0] + c, at[1], at[2]],
    [at[0] + x, at[1] + y, at[2]]
  ]
}

/** A named polygon to compare: corner letters in order, with the corners. */
export interface NamedShape {
  names: string[]
  pts: V3[]
}

/**
 * Two polygons with the same number of corners compared corner by corner: every way of laying
 * one on the other (starting at any corner, read either way round) is tried, and the first in
 * which every side and every angle matches gives the correspondence. Triangles go through
 * compareTriangles instead, which names the rule (SSS, SAS …) a proof would quote.
 */
export function comparePolygons(A: NamedShape, B: NamedShape, tolerance = 5e-3): { congruent: boolean; matchedName: string; reason: string } {
  const n = A.pts.length
  const nameA = A.names.join('')
  if (n < 3 || B.pts.length !== n) return { congruent: false, matchedName: B.names.join(''), reason: `${nameA} and ${B.names.join('')} have different numbers of corners, so they are not congruent.` }
  const sa = sideLengths(A.pts)
  const aa = interiorAngles(A.pts)
  const scale = Math.max(...sa, ...sideLengths(B.pts), 1e-9)
  for (const dir of [1, -1]) {
    for (let k = 0; k < n; k++) {
      // Corner i of A lies on corner order[i] of B.
      const order = Array.from({ length: n }, (_, i) => (((k + dir * i) % n) + n) % n)
      const P = order.map((j) => B.pts[j])
      const sb = sideLengths(P)
      const ab = interiorAngles(P)
      const same = sa.every((s, i) => Math.abs(s - sb[i]) <= tolerance * scale) && aa.every((a, i) => Math.abs(a - ab[i]) <= tolerance * 2)
      if (!same) continue
      const matchedName = order.map((j) => B.names[j]).join('')
      return { congruent: true, matchedName, reason: `So ${nameA} ≅ ${matchedName}: every side and every angle matches, in that order.` }
    }
  }
  return { congruent: false, matchedName: B.names.join(''), reason: `${nameA} and ${B.names.join('')} cannot be laid one on the other, so they are not congruent.` }
}

/** Two parts found congruent: which two, and the sentence that says so and why. */
export interface CongruentPair {
  i: number
  j: number
  /** The rule for two triangles (SSS, SAS …); null for other polygons, matched side by side and angle by angle. */
  test: CongruenceTest | null
  sentence: string
}

/**
 * Every pair of congruent parts among the pieces of a decomposed shape (Fix 19). 0.7.0 compared
 * only two separately drawn triangles, so the two halves a Decompose had just made could not be
 * asked about at all.
 */
export function congruentParts(parts: NamedShape[], opts: CompareOptions = {}): CongruentPair[] {
  const out: CongruentPair[] = []
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const A = parts[i]
      const B = parts[j]
      if (A.pts.length !== B.pts.length) continue
      if (A.pts.length === 3) {
        const r = compareTriangles({ names: A.names as Tri['names'], pts: A.pts as Tri['pts'] }, { names: B.names as Tri['names'], pts: B.pts as Tri['pts'] }, opts)
        if (r.congruent) out.push({ i, j, test: r.test, sentence: r.reasons[r.reasons.length - 1] })
      } else {
        const r = comparePolygons(A, B, opts.tolerance)
        if (r.congruent) out.push({ i, j, test: null, sentence: r.reason })
      }
    }
  }
  return out
}

/**
 * The two triangles the congruence card compares, from what is selected: any drawn triangle, a
 * Lego piece included. 0.7.0 left pieces out because their corners were hidden helpers named
 * poly2_1; since Fix 17 every piece is lettered, and the two halves of a rectangle cut along its
 * diagonal are the first thing a student wants to compare (Fix 19).
 */
export function trianglesToCompare<T extends { id: string; type: string; points?: string[] }>(
  sel: T[],
  drawable: (id: string) => boolean,
  lettered: (o: T) => boolean = () => true
): T[] {
  // `lettered` keeps out a piece from a 0.7.0 file: the card names a triangle by its corners, and
  // that piece's corners are hidden helpers the card would print as "△poly2_1poly2_2poly2_3".
  return sel.filter((o) => o.type === 'polygon' && o.points?.length === 3 && drawable(o.id) && lettered(o))
}
