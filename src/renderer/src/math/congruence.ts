// Are two triangles the same triangle? And if so, by which rule — SSS, SAS, ASA, AAS or RHS —
// with every equality written out, the way a proof is marked. Pure, so the panel and the tests
// share one answer.

import { triangleInfo } from './geometry'
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
