import { isNoise, sameNumber } from '../noise'
import { bgcd, blcm, Rat, rat, rAdd, rFromNumber, rIsNeg, rIsZero, rMul, rNeg, rSub } from '../pure/rat'
import { pDeg, pDivMod, pEval, pGcd, pIsZero, pLead, pNeg, pTrim } from '../pure/poly'

export type DomainMode = 'real' | 'complex'

/** The default domain for school maths in PhysLab is strictly REAL. */
export const DEFAULT_DOMAIN: DomainMode = 'real'

/** Identifier for complex mode in calculator state. */
export const COMPLEX_MODE = 'comp'

/** Prefix for complex solutions when an equation has no real solutions. */
export const COMPLEX_FALLBACK_PREFIX = 'No real solution. In complex numbers: x = '

/**
 * Format fallback sentence when no real solution exists, matching calc/roots.ts:319 beyondTheReals.
 */
export function formatComplexFallback(roots: string[]): string {
  if (roots.length === 0) {
    return 'No real solution.'
  }
  return `${COMPLEX_FALLBACK_PREFIX}${roots.join(' or x = ')}`
}

/**
 * Returns true if an integer is odd.
 */
export function isOddInteger(n: number): boolean {
  return Number.isInteger(n) && Math.abs(n % 2) === 1
}

/**
 * Convert a floating-point number into an exact rational number (numerator and denominator)
 * via continued fraction expansion up to maxDenominator (default 10000).
 */
export function floatToRational(
  val: number,
  maxDen = 10000,
  tol = 1e-9
): { num: number; den: number } | null {
  if (!Number.isFinite(val)) return null
  if (Number.isInteger(val)) return { num: val, den: 1 }
  const sign = val < 0 ? -1 : 1
  let x = Math.abs(val)
  let a = Math.floor(x)
  let h1 = 1
  let k1 = 0
  let h = a
  let k = 1
  while (x - a > tol && k <= maxDen) {
    x = 1 / (x - a)
    a = Math.floor(x)
    const nextH = a * h + h1
    const nextK = a * k + k1
    if (nextK > maxDen) break
    h1 = h
    h = nextH
    k1 = k
    k = nextK
    if (Math.abs(Math.abs(val) - h / k) < tol) break
  }
  if (Math.abs(Math.abs(val) - h / k) < tol) {
    return reduceFraction(sign * h, k)
  }
  return null
}

/**
 * Parse an exponent into numerator and denominator in lowest terms.
 * Handles exact strings ('1/3', '2/11', '-5/7') and numeric floats via continued fractions.
 */
export function parseRationalExponent(exp: number | string): { num: number; den: number } | null {
  if (typeof exp === 'number') {
    return floatToRational(exp)
  }
  const match = exp.trim().match(/^([+-]?\d+)(?:\s*\/\s*(\d+))?$/)
  if (!match) return null
  const num = parseInt(match[1], 10)
  const den = match[2] ? parseInt(match[2], 10) : 1
  if (den === 0) return null
  return reduceFraction(num, den)
}


function gcd(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y !== 0) {
    const t = y
    y = x % y
    x = t
  }
  return x
}

function reduceFraction(num: number, den: number): { num: number; den: number } {
  const g = gcd(num, den)
  const sign = den < 0 ? -1 : 1
  return { num: (sign * num) / g, den: (sign * den) / g }
}

/**
 * Real odd root rule (CW7a, calc/engine.ts evaluateWithRealRoots; tests/oddRoots.test.ts):
 * (-8)^(1/3) = -2. An odd root of a negative real number is the unique real root.
 * Returns null if rootIndex is not an odd integer.
 */
export function evaluateRealOddRoot(base: number, rootIndex: number): number | null {
  if (!isOddInteger(rootIndex) || rootIndex <= 0) return null
  if (base >= 0) return Math.pow(base, 1 / rootIndex)
  return -Math.pow(-base, 1 / rootIndex)
}

/**
 * Interpret a power base^(p/q) under real domain semantics:
 * - If base < 0 and q is odd: real value is (-1)^p * (|base|^(1/q))^p
 * - If base < 0 and q is even: no real value.
 */
export function hasRealOddRootInterpretation(
  base: number,
  p: number,
  q: number
): { isReal: boolean; value?: number } {
  if (q === 0) return { isReal: false }
  const red = reduceFraction(p, q)
  if (base >= 0) {
    return { isReal: true, value: Math.pow(base, red.num / red.den) }
  }
  if (isOddInteger(red.den)) {
    const root = evaluateRealOddRoot(base, red.den)
    if (root === null) return { isReal: false }
    const val = Math.pow(root, red.num)
    return { isReal: true, value: val }
  }
  return { isReal: false }
}

/**
 * Notice displayed when an operation must assume positive or constrained variables.
 */
export function formatAssumptionNotice(varName: string, condition: string): { text: string; tex: string } {
  return {
    text: `Assuming ${varName} ${condition}`,
    tex: `\\text{Assuming } ${varName} ${condition}`
  }
}

/**
 * Formats a single domain restriction in plain text.
 */
export function formatRestriction(
  variable: string,
  op: '!=' | '>' | '>=' | '<' | '<=',
  value: string | number
): string {
  const opMap: Record<string, string> = {
    '!=': '≠',
    '>': '>',
    '>=': '≥',
    '<': '<',
    '<=': '≤'
  }
  return `${variable} ${opMap[op] ?? op} ${value}`
}

/**
 * Formats a single domain restriction in LaTeX.
 */
export function formatRestrictionTex(
  variable: string,
  op: '!=' | '>' | '>=' | '<' | '<=',
  value: string | number
): string {
  const opMap: Record<string, string> = {
    '!=': '\\ne',
    '>': '>',
    '>=': '\\ge',
    '<': '<',
    '<=': '\\le'
  }
  return `${variable} ${opMap[op] ?? op} ${value}`
}

export type ExcludedPoint = Rat | number | string | { re: number; im: number }

/**
 * Format restrictions for cancelled factors in rational expressions:
 * e.g. x(x-1)/(x-1) = x, x ≠ 1 (or x ≠ ±i in complex mode).
 */
export function formatCancelledFactorRestriction(
  variable: string,
  excludedValues: ExcludedPoint[]
): { text: string; tex: string } {
  if (excludedValues.length === 0) return { text: '', tex: '' }
  // Canonicalise: deduplicate across mixed number, string, Rat, and complex representations
  const map = new Map<string, { valStr: string; valTex: string; sortKey: number | string }>()
  for (const v of excludedValues) {
    let textVal: string
    let texVal: string
    let sortKey: number | string
    if (typeof v === 'number') {
      textVal = String(v)
      texVal = String(v)
      sortKey = v
    } else if (typeof v === 'string') {
      const trimmed = v.trim()
      const num = Number(trimmed)
      if (!Number.isNaN(num)) {
        textVal = String(num)
        texVal = String(num)
        sortKey = num
      } else {
        textVal = trimmed
        texVal = trimmed === 'i' ? 'i' : trimmed === '-i' ? '-i' : trimmed
        sortKey = trimmed
      }
    } else if ('re' in v && 'im' in v) {
      if (Math.abs(v.im) < 1e-12) {
        textVal = String(v.re)
        texVal = String(v.re)
        sortKey = v.re
      } else if (Math.abs(v.re) < 1e-12) {
        if (sameNumber(v.im, 1)) {
          textVal = 'i'
          texVal = 'i'
          sortKey = 'im_1'
        } else if (sameNumber(v.im, -1)) {
          textVal = '-i'
          texVal = '-i'
          sortKey = 'im_-1'
        } else {
          textVal = `${v.im}i`
          texVal = `${v.im}i`
          sortKey = `im_${v.im}`
        }
      } else {
        const sign = v.im < 0 ? '-' : '+'
        const absIm = Math.abs(v.im)
        const imPart = absIm === 1 ? 'i' : `${absIm}i`
        textVal = `${v.re} ${sign} ${imPart}`
        texVal = `${v.re} ${sign} ${imPart}`
        sortKey = `c_${v.re}_${v.im}`
      }
    } else {
      // Rat
      const rVal = v as Rat
      if (rVal.d === 1n) {
        textVal = String(rVal.n)
        texVal = String(rVal.n)
        sortKey = Number(rVal.n)
      } else {
        textVal = `${rVal.n}/${rVal.d}`
        texVal = `\\frac{${rVal.n}}{${rVal.d}}`
        sortKey = Number(rVal.n) / Number(rVal.d)
      }
    }
    const key = textVal
    if (!map.has(key)) {
      map.set(key, { valStr: textVal, valTex: texVal, sortKey })
    }
  }
  const unique = Array.from(map.values())
  unique.sort((a, b) => {
    if (typeof a.sortKey === 'number' && typeof b.sortKey === 'number') {
      return a.sortKey - b.sortKey
    }
    return String(a.sortKey).localeCompare(String(b.sortKey))
  })
  const textExcl = unique.map((u) => `${variable} ≠ ${u.valStr}`).join(', ')
  const texExcl = unique.map((u) => `${variable} \\ne ${u.valTex}`).join(', ')
  return { text: textExcl, tex: texExcl }
}

/**
 * Select the integer parameter variable (k by default, or n if k is already bound).
 */
export function pickPeriodicParamVar(boundVars: string[] = []): string {
  const bound = new Set(boundVars.map((v) => v.toLowerCase().trim()))
  if (!bound.has('k')) return 'k'
  return 'n'
}

/**
 * Periodic solution standard form:
 * - radians: x = base + 2kπ, k ∈ ℤ (or kπ for period π)
 * - degrees: x = base + 360°k, k ∈ ℤ (or 180°k for period 180°)
 */
export function formatPeriodicSolution(
  base: string,
  periodMultiplier: number,
  paramVar?: string,
  angleMode: 'rad' | 'deg' = 'rad',
  varName = 'x',
  baseTex?: string,
  boundVars: string[] = []
): { text: string; tex: string } {
  let chosenVar = paramVar
  const boundLower = boundVars.map((v) => v.toLowerCase().trim())
  if (!chosenVar || boundLower.includes(chosenVar.toLowerCase().trim())) {
    chosenVar = pickPeriodicParamVar(boundVars)
  }
  const bTex = baseTex ?? base.replace(/°/g, '^\\circ').replace(/π/g, '\\pi')
  if (angleMode === 'deg') {
    const periodDeg = periodMultiplier * 180
    const termText = periodDeg === 1 ? `${chosenVar}°` : `${periodDeg}°${chosenVar}`
    const termTex = periodDeg === 1 ? `${chosenVar}^\\circ` : `${periodDeg}^\\circ ${chosenVar}`
    return {
      text: `${varName} = ${base} + ${termText}, ${chosenVar} ∈ ℤ`,
      tex: `${varName} = ${bTex} + ${termTex}, \\; ${chosenVar} \\in \\mathbb{Z}`
    }
  }
  // radians
  let termText: string
  let termTex: string
  if (periodMultiplier === 2) {
    termText = `2${chosenVar}π`
    termTex = `2${chosenVar}\\pi`
  } else if (periodMultiplier === 1) {
    termText = `${chosenVar}π`
    termTex = `${chosenVar}\\pi`
  } else {
    termText = `${periodMultiplier}${chosenVar}π`
    termTex = `${periodMultiplier}${chosenVar}\\pi`
  }
  return {
    text: `${varName} = ${base} + ${termText}, ${chosenVar} ∈ ℤ`,
    tex: `${varName} = ${bTex} + ${termTex}, \\; ${chosenVar} \\in \\mathbb{Z}`
  }
}

/** Linear system classification. */
export type LinearSystemClassification = 'unique' | 'infinite' | 'none'

/**
 * Classify a linear system by Rouché-Capelli ranks:
 * - rank(A) < rank(A|b) -> no solution (inconsistent)
 * - rank(A) = rank(A|b) = numVars -> unique solution
 * - rank(A) = rank(A|b) < numVars -> infinitely many solutions
 */
export function classifyLinearSystem(
  rankA: number,
  rankAug: number,
  numVars: number
): LinearSystemClassification {
  if (rankA < rankAug) return 'none'
  if (rankA === numVars) return 'unique'
  return 'infinite'
}

/**
 * Format a parametric linear solution vector for underdetermined systems (G00-5):
 * x = c + t · v, t ∈ ℝ (or multiple parameters t_1, t_2 for higher nullity).
 */
export function formatParametricLinearSolution(
  particularVector: (number | string)[],
  nullspaceVectors: (number | string)[][],
  paramVars?: string[]
): { text: string; tex: string } {
  const cStr = `[${particularVector.join(', ')}]`
  const cTex = `\\begin{pmatrix} ${particularVector.join(' \\\\ ')} \\end{pmatrix}`
  if (nullspaceVectors.length === 0) {
    return { text: `x = ${cStr}`, tex: `x = ${cTex}` }
  }
  const actualParams: string[] = []
  for (let i = 0; i < nullspaceVectors.length; i++) {
    if (paramVars && paramVars[i]) {
      actualParams.push(paramVars[i])
    } else if (nullspaceVectors.length === 1) {
      actualParams.push('t')
    } else {
      actualParams.push(`t_${i + 1}`)
    }
  }
  const termsText: string[] = []
  const termsTex: string[] = []
  for (let i = 0; i < nullspaceVectors.length; i++) {
    const param = actualParams[i]
    const v = nullspaceVectors[i]
    termsText.push(`${param}·[${v.join(', ')}]`)
    termsTex.push(`${param} \\begin{pmatrix} ${v.join(' \\\\ ')} \\end{pmatrix}`)
  }
  const paramsText = actualParams.map((p) => `${p} ∈ ℝ`).join(', ')
  const paramsTex = actualParams.map((p) => `${p} \\in \\mathbb{R}`).join(', ')
  return {
    text: `x = ${cStr} + ${termsText.join(' + ')}, ${paramsText}`,
    tex: `x = ${cTex} + ${termsTex.join(' + ')}, \\; ${paramsTex}`
  }
}

/**
 * Canonical comparison for polynomials:
 * Strict equality in ℚ[x, ...] after expansion.
 * All coefficients of the difference must be exactly 0.
 */
export function comparePolynomials(
  expandedDiffCoeffs: (number | bigint | { n: bigint; d: bigint })[]
): boolean {
  return expandedDiffCoeffs.every((c) => {
    if (typeof c === 'number') return c === 0
    if (typeof c === 'bigint') return c === 0n
    if (typeof c === 'object' && c !== null) return c.n === 0n
    return false
  })
}

/**
 * Multiply two polynomials over ℚ using exact Rat arithmetic.
 */
export function multiplyPolynomialsRat(p: Rat[], q: Rat[]): Rat[] {
  if (p.length === 0 || q.length === 0) return []
  const res: Rat[] = Array.from({ length: p.length + q.length - 1 }, () => rat(0n))
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) {
      res[i + j] = rAdd(res[i + j], rMul(p[i], q[j]))
    }
  }
  return res
}

/**
 * Exact polynomial comparison over ℚ[x] using exact Rat arithmetic.
 */
export function comparePolynomialsExact(coeffs: Rat[]): boolean {
  return coeffs.every((c) => rIsZero(c))
}

/**
 * Multiply two univariate polynomials whose coefficients are arrays [c0, c1, ..., cn].
 */
export function multiplyPolynomials(p: number[], q: number[]): number[] {
  if (p.length === 0 || q.length === 0) return []
  const res = new Array(p.length + q.length - 1).fill(0)
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) {
      res[i + j] += p[i] * q[j]
    }
  }
  return res
}

/**
 * Exact comparison of two rational numbers a and b in ℚ without floating-point conversion.
 */
export function compareRatExact(a: Rat, b: Rat): number {
  const diff = a.n * b.d - b.n * a.d
  if (diff < 0n) return -1
  if (diff > 0n) return 1
  return 0
}

const babs = (a: bigint): bigint => (a < 0n ? -a : a)

/**
 * Evaluate a univariate polynomial over ℚ at point x in ℚ using exact Rat arithmetic.
 */
export function evaluatePolynomialRat(poly: Rat[], x: Rat): Rat {
  let acc = rat(0n)
  let xPow = rat(1n)
  for (const coeff of poly) {
    acc = rAdd(acc, rMul(coeff, xPow))
    xPow = rMul(xPow, x)
  }
  return acc
}

/**
 * Find all rational roots of a polynomial in ℚ[x] using the Rational Root Theorem.
 */
export function findRationalRootsRat(poly: Rat[]): Rat[] {
  let end = poly.length - 1
  while (end >= 0 && rIsZero(poly[end])) end--
  const trimmed = poly.slice(0, end + 1)
  if (trimmed.length < 2) return []

  // Clear denominators across all coefficients
  const den = trimmed.reduce((acc, c) => blcm(acc, c.d), 1n)
  const whole = trimmed.map((c) => (c.n * den) / c.d)
  const gcdNum = whole.reduce((acc, n) => bgcd(acc, babs(n)), 0n) || 1n
  const intCoeffs = whole.map((c) => c / gcdNum)

  // Factor out powers of x if 0 is a root
  let low = 0
  while (low < intCoeffs.length && intCoeffs[low] === 0n) low++
  const hasZeroRoot = low > 0
  const c0 = intCoeffs[low]
  const cn = intCoeffs[intCoeffs.length - 1]

  const divisors = (v: bigint): bigint[] => {
    const a = babs(v)
    const out: bigint[] = []
    let steps = 0
    for (let d = 1n; d * d <= a; d++) {
      if (steps++ > 1000) break
      if (a % d === 0n) {
        out.push(d)
        if (d !== a / d) out.push(a / d)
      }
    }
    return out.sort((x, y) => (x < y ? -1 : 1))
  }

  const ps = divisors(c0)
  const qs = divisors(cn)
  const seen = new Set<string>()
  const roots: Rat[] = []
  if (hasZeroRoot) {
    roots.push(rat(0n, 1n))
  }
  for (const p of ps) {
    for (const q of qs) {
      for (const s of [1n, -1n]) {
        const r = rat(s * p, q)
        const key = `${r.n}/${r.d}`
        if (!seen.has(key)) {
          seen.add(key)
          if (rIsZero(evaluatePolynomialRat(poly, r))) {
            roots.push(r)
          }
        }
      }
    }
  }
  return roots.sort(compareRatExact)
}

/**
 * Find real roots of a numeric polynomial (degrees 1, 2, or higher via rational root fallback).
 */
export function findRootsNumeric(poly: number[]): number[] {
  let end = poly.length - 1
  while (end >= 0 && Math.abs(poly[end]) < 1e-12) end--
  const trimmed = poly.slice(0, end + 1)
  if (trimmed.length < 2) return []

  if (trimmed.length === 2) {
    const [c0, c1] = trimmed
    if (Math.abs(c1) < 1e-12) return []
    return [-c0 / c1]
  }

  if (trimmed.length === 3) {
    const [c0, c1, c2] = trimmed
    if (Math.abs(c2) < 1e-12) {
      if (Math.abs(c1) < 1e-12) return []
      return [-c0 / c1]
    }
    const disc = c1 * c1 - 4 * c2 * c0
    if (disc < -1e-12) return []
    const d = disc > 0 ? Math.sqrt(disc) : 0
    const r1 = (-c1 - d) / (2 * c2)
    const r2 = (-c1 + d) / (2 * c2)
    return Math.abs(r1 - r2) < 1e-9 ? [r1] : [r1, r2].sort((a, b) => a - b)
  }

  const ratPoly: Rat[] = []
  for (const c of trimmed) {
    const r = floatToRational(c)
    if (!r) return []
    ratPoly.push(rat(BigInt(r.num), BigInt(r.den)))
  }
  return findRationalRootsRat(ratPoly)
    .map((r) => Number(r.n) / Number(r.d))
    .sort((a, b) => a - b)
}

/**
 * Test whether a polynomial in ℚ[x] has at least one real root using Sturm's Theorem.
 * Handles any degree without relying on trial division or numerical approximations.
 */
export function hasRealRootsPoly(poly: Rat[]): boolean {
  const p = pTrim(poly)
  const d = pDeg(p)
  if (d <= 0) return false
  if (d % 2 === 1) return true // Any odd-degree real polynomial has a real root (IVT)
  if (d === 2) {
    const c = p[0] ?? rat(0n)
    const b = p[1] ?? rat(0n)
    const a = p[2] ?? rat(0n)
    const disc = rSub(rMul(b, b), rMul(rat(4n), rMul(a, c)))
    return !rIsNeg(disc)
  }
  // Derivative in ℚ[x]
  const deriv: Rat[] = []
  for (let i = 1; i < p.length; i++) {
    deriv.push(rMul(p[i], rat(BigInt(i))))
  }
  // Construct Sturm sequence
  const chain: Rat[][] = [p, pTrim(deriv)]
  while (true) {
    const pPrev = chain[chain.length - 2]
    const pCurr = chain[chain.length - 1]
    if (pIsZero(pCurr)) break
    const { r } = pDivMod(pPrev, pCurr)
    if (pIsZero(r)) break
    chain.push(pNeg(r))
  }
  // Count sign variations of leading coefficients at -∞ and +∞
  const signAtPosInf = (q: Rat[]): number => {
    const lead = pLead(q)
    return rIsNeg(lead) ? -1 : 1
  }
  const signAtNegInf = (q: Rat[]): number => {
    const lead = pLead(q)
    const signLead = rIsNeg(lead) ? -1 : 1
    return pDeg(q) % 2 === 1 ? -signLead : signLead
  }
  const countVariations = (signs: number[]): number => {
    let v = 0
    let last = signs[0]
    for (let i = 1; i < signs.length; i++) {
      if (signs[i] !== 0) {
        if (last !== 0 && signs[i] !== last) v++
        last = signs[i]
      }
    }
    return v
  }
  const vNeg = countVariations(chain.map(signAtNegInf))
  const vPos = countVariations(chain.map(signAtPosInf))
  return vNeg - vPos > 0
}

export function syntheticDivide(poly: number[], r: number): number[] {
  let end = poly.length - 1
  while (end >= 0 && Math.abs(poly[end]) < 1e-12) end--
  const trimmed = poly.slice(0, end + 1)
  if (trimmed.length < 2) return [0]
  const n = trimmed.length - 1
  const q = new Array(n).fill(0)
  q[n - 1] = trimmed[n]
  for (let k = n - 2; k >= 0; k--) {
    q[k] = trimmed[k + 1] + r * q[k + 1]
  }
  return q
}

export function numToRat(x: number): Rat {
  const rf = floatToRational(x)
  if (rf) return rat(BigInt(rf.num), BigInt(rf.den))
  return rFromNumber(x)
}

export function hasRealRootsNumeric(poly: number[]): boolean {
  let end = poly.length - 1
  while (end >= 0 && Math.abs(poly[end]) < 1e-12) end--
  const trimmed = poly.slice(0, end + 1)
  const d = trimmed.length - 1
  if (d <= 0) return false
  if (d % 2 === 1) return true
  if (d === 2) {
    const [c, b, a] = [trimmed[0], trimmed[1], trimmed[2]]
    const disc = b * b - 4 * a * c
    return disc >= -1e-12
  }
  const ratPoly = trimmed.map(numToRat)
  return hasRealRootsPoly(ratPoly)
}

export function polyDivModNum(poly: number[], divisor: number[]): { q: number[]; r: number[] } {
  let p = [...poly]
  let d = [...divisor]
  while (p.length > 0 && Math.abs(p[p.length - 1]) < 1e-12) p.pop()
  while (d.length > 0 && Math.abs(d[d.length - 1]) < 1e-12) d.pop()
  if (d.length === 0) throw new Error('division by zero')
  if (p.length < d.length) return { q: [0], r: p }
  const degP = p.length - 1
  const degD = d.length - 1
  const leadD = d[degD]
  const q = new Array(degP - degD + 1).fill(0)
  for (let i = degP - degD; i >= 0; i--) {
    const coeff = p[i + degD] / leadD
    q[i] = coeff
    for (let j = 0; j <= degD; j++) {
      p[i + j] -= coeff * d[j]
    }
  }
  while (p.length > 0 && Math.abs(p[p.length - 1]) < 1e-12) p.pop()
  return { q, r: p.length === 0 ? [0] : p }
}

export type RationalExcludedPoint = Rat | number | { re: number; im: number }


function compareExclPoints(a: RationalExcludedPoint, b: RationalExcludedPoint): number {
  if (typeof a !== 'number' && !('re' in a) && typeof b !== 'number' && !('re' in b)) {
    return compareRatExact(a, b)
  }
  const ca = typeof a === 'number' ? { re: a, im: 0 } : 're' in a ? a : { re: Number(a.n) / Number(a.d), im: 0 }
  const cb = typeof b === 'number' ? { re: b, im: 0 } : 're' in b ? b : { re: Number(b.n) / Number(b.d), im: 0 }
  if (Math.abs(ca.re - cb.re) > 1e-12) {
    return ca.re < cb.re ? -1 : 1
  }
  if (Math.abs(ca.im - cb.im) > 1e-12) {
    return ca.im < cb.im ? -1 : 1
  }
  return 0
}

function areExclPointsEqual(a: RationalExcludedPoint, b: RationalExcludedPoint): boolean {
  if (typeof a !== 'number' && !('re' in a) && typeof b !== 'number' && !('re' in b)) {
    return compareRatExact(a, b) === 0
  }
  const ca = typeof a === 'number' ? { re: a, im: 0 } : 're' in a ? a : { re: Number(a.n) / Number(a.d), im: 0 }
  const cb = typeof b === 'number' ? { re: b, im: 0 } : 're' in b ? b : { re: Number(b.n) / Number(b.d), im: 0 }
  return isNoise(ca.re - cb.re) && isNoise(ca.im - cb.im)
}

/**
 * Verify soundly that all cancelled factors between Q1 and Q2 are accounted for by excluded points.
 * Computes K1 = Q1 / gcd(Q1, Q2) and K2 = Q2 / gcd(Q1, Q2) in ℚ[x].
 * Divides out (x - r) for each r in excluded points (exact Rat, numeric/irrational, or complex conjugate pairs).
 * If the remainder has real roots (or degree > 0 in complex mode), returns false.
 */
export function verifyCancelledFactorsExact(
  den1: Rat[],
  den2: Rat[],
  excluded: RationalExcludedPoint[],
  domain: DomainMode = 'real'
): boolean {
  const g = pGcd(den1, den2)
  if (pIsZero(g)) return false
  const k1 = pDivMod(den1, g).q
  const k2 = pDivMod(den2, g).q

  const checkRem = (k: Rat[]): boolean => {
    let rem = pTrim(k)
    for (const r of excluded) {
      if (typeof r !== 'number' && !('re' in r)) {
        while (pDeg(rem) > 0 && rIsZero(pEval(rem, r))) {
          const linearFactor = [rNeg(r), rat(1n)]
          rem = pDivMod(rem, linearFactor).q
        }
      }
    }
    let numRem = rem.map((c) => Number(c.n) / Number(c.d))
    for (const pt of excluded) {
      if (typeof pt === 'number') {
        let val = numRem.reduce((sum, c, i) => sum + c * Math.pow(pt, i), 0)
        while (Math.abs(val) < 1e-9 && numRem.length > 1) {
          numRem = syntheticDivide(numRem, pt)
          val = numRem.reduce((sum, c, i) => sum + c * Math.pow(pt, i), 0)
        }
      }
    }

    // For complex numbers: each non-real root must be paired with an explicit conjugate
    // to soundly clear a real quadratic factor (preventing a single root like i from standing in for ±i)
    const complexList = excluded
      .filter((r): r is { re: number; im: number } => typeof r === 'object' && 're' in r && 'im' in r)
      .map((c) => ({ ...c }))

    for (let i = complexList.length - 1; i >= 0; i--) {
      if (Math.abs(complexList[i].im) < 1e-12) {
        let val = numRem.reduce((sum, c, idx) => sum + c * Math.pow(complexList[i].re, idx), 0)
        while (Math.abs(val) < 1e-9 && numRem.length > 1) {
          numRem = syntheticDivide(numRem, complexList[i].re)
          val = numRem.reduce((sum, c, idx) => sum + c * Math.pow(complexList[i].re, idx), 0)
        }
        complexList.splice(i, 1)
      }
    }

    while (complexList.length >= 2) {
      const pt = complexList[0]
      const conjIdx = complexList.findIndex(
        (c, idx) => idx > 0 && Math.abs(c.re - pt.re) < 1e-9 && Math.abs(c.im + pt.im) < 1e-9
      )
      if (conjIdx === -1) {
        break
      }
      complexList.splice(conjIdx, 1)
      complexList.splice(0, 1)

      const quad = [pt.re * pt.re + pt.im * pt.im, -2 * pt.re, 1]
      const div = polyDivModNum(numRem, quad)
      if (div.r.every((c) => Math.abs(c) < 1e-9)) {
        numRem = div.q
      }
    }

    if (domain === 'complex') {
      let end = numRem.length - 1
      while (end >= 0 && Math.abs(numRem[end]) < 1e-12) end--
      return end <= 0
    }
    return !hasRealRootsNumeric(numRem)
  }

  return checkRem(k1) && checkRem(k2)
}

/**
 * Canonical comparison for rational functions over ℚ[x]:
 * P1/Q1 = P2/Q2 <=> P1*Q2 - P2*Q1 = 0 in ℚ[x], with identical sets of excluded points.
 * Soundly verifies via polynomial GCD, division, and Sturm's theorem that all cancelled
 * denominator roots are accounted for in the excluded points (supporting exact Rat, irrational, and complex roots).
 */
export function compareRationalFunctionsExact(
  num1: Rat[],
  den1: Rat[],
  excluded1: RationalExcludedPoint[],
  num2: Rat[],
  den2: Rat[],
  excluded2: RationalExcludedPoint[],
  domain: DomainMode = 'real'
): boolean {
  const p1q2 = multiplyPolynomialsRat(num1, den2)
  const p2q1 = multiplyPolynomialsRat(num2, den1)
  const len = Math.max(p1q2.length, p2q1.length)
  const diff: Rat[] = []
  for (let i = 0; i < len; i++) {
    const c1 = p1q2[i] ?? rat(0n)
    const c2 = p2q1[i] ?? rat(0n)
    diff.push(rSub(c1, c2))
  }
  if (!comparePolynomialsExact(diff)) return false

  // Both sides must agree on the set of excluded points
  if (excluded1.length !== excluded2.length) return false
  const sorted1 = [...excluded1].sort(compareExclPoints)
  const sorted2 = [...excluded2].sort(compareExclPoints)
  for (let i = 0; i < sorted1.length; i++) {
    if (!areExclPointsEqual(sorted1[i], sorted2[i])) return false
  }

  // Verify that all listed excluded points are roots of at least one denominator
  for (const pt of excluded1) {
    if (typeof pt !== 'number' && !('re' in pt)) {
      const d1AtPt = evaluatePolynomialRat(den1, pt)
      const d2AtPt = evaluatePolynomialRat(den2, pt)
      if (!rIsZero(d1AtPt) && !rIsZero(d2AtPt)) {
        return false
      }
    } else if (typeof pt === 'number') {
      const d1AtPt = den1.reduce((sum, c, i) => sum + (Number(c.n) / Number(c.d)) * Math.pow(pt, i), 0)
      const d2AtPt = den2.reduce((sum, c, i) => sum + (Number(c.n) / Number(c.d)) * Math.pow(pt, i), 0)
      const s1 = den1.reduce((sum, c) => sum + Math.abs(Number(c.n) / Number(c.d)), 1)
      const s2 = den2.reduce((sum, c) => sum + Math.abs(Number(c.n) / Number(c.d)), 1)
      if (Math.abs(d1AtPt) > 1e-9 && !isNoise(d1AtPt, s1) && Math.abs(d2AtPt) > 1e-9 && !isNoise(d2AtPt, s2)) {
        return false
      }
    } else {
      const evalComplex = (den: Rat[]): { re: number; im: number } => {
        let re = 0
        let im = 0
        for (let i = 0; i < den.length; i++) {
          const c = Number(den[i].n) / Number(den[i].d)
          const r = Math.hypot(pt.re, pt.im)
          const theta = Math.atan2(pt.im, pt.re)
          const pR = Math.pow(r, i)
          const pTheta = i * theta
          re += c * pR * Math.cos(pTheta)
          im += c * pR * Math.sin(pTheta)
        }
        return { re, im }
      }
      const v1 = evalComplex(den1)
      const v2 = evalComplex(den2)
      const mag1 = Math.hypot(v1.re, v1.im)
      const mag2 = Math.hypot(v2.re, v2.im)
      if (mag1 > 1e-9 && mag2 > 1e-9) {
        return false
      }
    }
  }

  // Soundly verify that ALL cancelled denominator factors are accounted for in excluded points
  if (!verifyCancelledFactorsExact(den1, den2, excluded1, domain)) {
    return false
  }

  return true
}

/**
 * Canonical comparison for rational functions with numeric coefficients:
 * P1/Q1 = P2/Q2 <=> P1*Q2 - P2*Q1 = 0 in ℚ[x], with identical sets of excluded points.
 * All cancelled denominator roots must be excluded (supporting exact rationals, irrationals, and complex roots).
 */
export function compareRationalFunctions(
  num1: number[],
  den1: number[],
  excluded1: (number | { re: number; im: number })[],
  num2: number[],
  den2: number[],
  excluded2: (number | { re: number; im: number })[],
  domain: DomainMode = 'real'
): boolean {
  return compareRationalFunctionsExact(
    num1.map(numToRat),
    den1.map(numToRat),
    excluded1,
    num2.map(numToRat),
    den2.map(numToRat),
    excluded2,
    domain
  )
}

/**
 * Canonical comparison for derivatives: exact algebraic identity.
 * Difference polynomial between candidate and reference derivative must be zero.
 */
export function compareDerivativesExact(diffDerivativeCoeffs: (number | bigint | Rat)[]): boolean {
  return diffDerivativeCoeffs.every((c) => {
    if (typeof c === 'number') return c === 0
    if (typeof c === 'bigint') return c === 0n
    return rIsZero(c)
  })
}

/**
 * Fallback numeric sampling for derivatives (Rule 0.3):
 * Evaluates candidate against expected derivative on sample points strictly in the common domain.
 * Singularities / non-domain points are filtered out.
 * If samplePoints is not provided or empty, uses 20 low-discrepancy Weyl points with
 * golden-ratio irrational spacing to prevent accidental harmonic cancellation.
 */
export function compareDerivativesOnDomain(
  evalFPrime: (x: number) => number,
  evalCandidate: (x: number) => number,
  samplePoints?: number[],
  domainInterval: [number, number] = [-2, 2]
): boolean {
  let pts = samplePoints
  if (!pts || pts.length === 0) {
    const phi = (1 + Math.sqrt(5)) / 2
    pts = []
    const [a, b] = domainInterval
    for (let i = 1; i <= 20; i++) {
      const t = (i * phi) % 1
      pts.push(a + (b - a) * t)
    }
  }
  // Filter sample points strictly to the common domain of definition:
  // Points where either function evaluates to non-finite (NaN, ±Infinity) or throws
  // are singularities/non-domain points and must be excluded.
  const commonDomainPts = pts.filter((pt) => {
    try {
      const exp = evalFPrime(pt)
      const act = evalCandidate(pt)
      return Number.isFinite(exp) && Number.isFinite(act)
    } catch {
      return false
    }
  })
  if (commonDomainPts.length < 5) {
    return false
  }
  return commonDomainPts.every((pt) => {
    const expected = evalFPrime(pt)
    const actual = evalCandidate(pt)
    return sameNumber(actual, expected)
  })
}

/**
 * Canonical comparison for indefinite integrals: exact differentiation check.
 * Differentiates candidate antiderivative and compares exactly against integrand in ℚ[x].
 */
export function compareIntegralByDifferentiationExact(
  candidateDerivativeCoeffs: Rat[],
  integrandCoeffs: Rat[]
): boolean {
  const len = Math.max(candidateDerivativeCoeffs.length, integrandCoeffs.length)
  const diff: Rat[] = []
  for (let i = 0; i < len; i++) {
    const c1 = candidateDerivativeCoeffs[i] ?? rat(0n)
    const c2 = integrandCoeffs[i] ?? rat(0n)
    diff.push(rSub(c1, c2))
  }
  return comparePolynomialsExact(diff)
}

/**
 * Fallback numeric sampling for indefinite integrals (Rule 0.3):
 * On each connected interval of the domain, candidate antiderivative and reference
 * differ by an additive constant C: (F_cand(x) - F_ref(x)) is constant.
 * Uses 20 low-discrepancy Weyl sample points (golden-ratio irrational spacing) per interval
 * away from singularities and checks variance/spread to prevent accidental harmonic cancellation (e.g. sin(6πx)).
 */
export function compareIntegralsOnIntervals(
  evalCandidate: (x: number) => number,
  evalReference: (x: number) => number,
  intervals: [number, number][],
  samplesPerInterval = 20
): boolean {
  if (intervals.length === 0) return false
  const phi = (1 + Math.sqrt(5)) / 2
  for (const [start, end] of intervals) {
    const diffs: number[] = []
    for (let k = 1; k <= samplesPerInterval; k++) {
      const t = (k * phi) % 1
      const pt = start + t * (end - start)
      try {
        const cand = evalCandidate(pt)
        const ref = evalReference(pt)
        if (Number.isFinite(cand) && Number.isFinite(ref)) {
          diffs.push(cand - ref)
        }
      } catch {
        // Exclude singularity from interval sampling
      }
    }
    if (diffs.length < 5) {
      return false
    }
    const min = Math.min(...diffs)
    const max = Math.max(...diffs)
    const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length
    if (!isNoise(max - min, Math.abs(mean), 1)) {
      return false
    }
  }
  return true
}

export type RootValue = number | { re: number; im: number }

export interface SolutionEntry {
  val: RootValue
  mult: number
}

function areRootsEqual(a: RootValue, b: RootValue): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    return sameNumber(a, b)
  }
  const ca = typeof a === 'number' ? { re: a, im: 0 } : a
  const cb = typeof b === 'number' ? { re: b, im: 0 } : b
  const scale = Math.max(1, Math.abs(ca.re), Math.abs(ca.im), Math.abs(cb.re), Math.abs(cb.im))
  return isNoise(ca.re - cb.re, scale) && isNoise(ca.im - cb.im, scale)
}

function isRealRoot(val: RootValue): boolean {
  if (typeof val === 'number') return true
  return isNoise(val.im, Math.max(1, Math.abs(val.re)))
}

export function normalizeSolutionEntries(entries: SolutionEntry[]): SolutionEntry[] {
  const norm: SolutionEntry[] = []
  for (const entry of entries) {
    const existing = norm.find((e) => areRootsEqual(e.val, entry.val))
    if (existing) {
      existing.mult += entry.mult
    } else {
      norm.push({ val: entry.val, mult: entry.mult })
    }
  }
  return norm
}

/**
 * Canonical comparison for equation solution sets:
 * Compares roots with multiplicities over ℝ or ℂ.
 * Normalizes representation across engines (e.g. grouped vs ungrouped repeated roots).
 * In Complex mode (COMPLEX_MODE, ℂ), polynomial equations of degree n must be complete
 * by degree (sum of algebraic multiplicities equals expectedDegree).
 * In Real mode (the default), only real solutions are returned; sum of multiplicities <= expectedDegree.
 */
export function compareSolutionSets(
  expected: SolutionEntry[],
  actual: SolutionEntry[],
  expectedDegree?: number,
  domain: DomainMode = 'real'
): boolean {
  const normExpected = normalizeSolutionEntries(expected)
  const normActual = normalizeSolutionEntries(actual)
  if (domain === 'real') {
    for (const entry of normActual) {
      if (!isRealRoot(entry.val)) return false
    }
    for (const entry of normExpected) {
      if (!isRealRoot(entry.val)) return false
    }
  }
  if (expectedDegree !== undefined) {
    const sumActualMult = normActual.reduce((sum, r) => sum + r.mult, 0)
    if (domain === 'complex') {
      if (sumActualMult !== expectedDegree) return false
    } else {
      if (sumActualMult > expectedDegree) return false
    }
  }
  if (normExpected.length !== normActual.length) return false
  const matched = new Set<number>()
  for (const exp of normExpected) {
    const idx = normActual.findIndex(
      (act, i) => !matched.has(i) && areRootsEqual(act.val, exp.val) && act.mult === exp.mult
    )
    if (idx === -1) return false
    matched.add(idx)
  }
  return true
}

export interface PrincipalBranchRange {
  fn: 'asin' | 'acos' | 'atan'
  domain: [number, number] | 'all'
  rangeRad: [number, number]
  rangeDeg: [number, number]
  openEndpoints?: boolean
}

export interface PrincipalBranchCutSpec {
  fn: 'sqrt' | 'ln' | 'log10'
  branchCut: string
  principalRange: string
  discontinuityNotice: string
}

export const REAL_BRANCH_CUTS: Record<'sqrt' | 'ln' | 'log10', PrincipalBranchCutSpec> = {
  sqrt: {
    fn: 'sqrt',
    branchCut: 'Negative real axis (-∞, 0)',
    principalRange: '[0, ∞) for real inputs x >= 0',
    discontinuityNotice: 'Assuming x >= 0'
  },
  ln: {
    fn: 'ln',
    branchCut: 'Non-positive real axis (-∞, 0]',
    principalRange: '(-∞, ∞) for real inputs x > 0',
    discontinuityNotice: 'Assuming x > 0'
  },
  log10: {
    fn: 'log10',
    branchCut: 'Non-positive real axis (-∞, 0]',
    principalRange: '(-∞, ∞) for real inputs x > 0',
    discontinuityNotice: 'Assuming x > 0'
  }
}

export const INVERSE_TRIG_BRANCHES: Record<'asin' | 'acos' | 'atan', PrincipalBranchRange> = {
  asin: { fn: 'asin', domain: [-1, 1], rangeRad: [-Math.PI / 2, Math.PI / 2], rangeDeg: [-90, 90] },
  acos: { fn: 'acos', domain: [-1, 1], rangeRad: [0, Math.PI], rangeDeg: [0, 180] },
  atan: { fn: 'atan', domain: 'all', rangeRad: [-Math.PI / 2, Math.PI / 2], rangeDeg: [-90, 90], openEndpoints: true }
}

/**
 * Check if a returned angle lies within the standard principal branch range.
 * For atan, the endpoints are open: (-π/2, π/2) / (-90°, 90°).
 */
export function isInPrincipalRange(
  fn: 'asin' | 'acos' | 'atan',
  angle: number,
  mode: 'rad' | 'deg' = 'rad'
): boolean {
  const branch = INVERSE_TRIG_BRANCHES[fn]
  const [min, max] = mode === 'rad' ? branch.rangeRad : branch.rangeDeg
  if (branch.openEndpoints) {
    return angle > min && angle < max
  }
  return (angle >= min || sameNumber(angle, min)) && (angle <= max || sameNumber(angle, max))
}

/** Canonical comparison rule kinds per job. */
export type CanonicalComparisonKind =
  | 'polynomial_ring_q'
  | 'rational_cross_mult'
  | 'solution_set_with_multiplicity'
  | 'linear_system_classification'
  | 'derivative_domain_eq'
  | 'integral_up_to_constant'
  | 'exact_numerical_match'

export interface JobSemanticsSpec {
  job: string
  comparisonKind: CanonicalComparisonKind
  defaultDomain: DomainMode
  oddRootsRule: boolean
  description: string
}

export const ENGINE_SEMANTICS_JOBS: Record<string, JobSemanticsSpec> = {
  solve: {
    job: 'solve',
    comparisonKind: 'solution_set_with_multiplicity',
    defaultDomain: 'real',
    oddRootsRule: true,
    description: 'Solution set with multiplicities on real domain; periodic solutions in k ∈ ℤ'
  },
  simplify: {
    job: 'simplify',
    comparisonKind: 'rational_cross_mult',
    defaultDomain: 'real',
    oddRootsRule: true,
    description: 'Equivalence on domain; cancelled factors reported as restrictions'
  },
  factor: {
    job: 'factor',
    comparisonKind: 'polynomial_ring_q',
    defaultDomain: 'real',
    oddRootsRule: true,
    description: 'Factorisation over ℚ[x]; factorComplex over ℂ'
  },
  expand: {
    job: 'expand',
    comparisonKind: 'polynomial_ring_q',
    defaultDomain: 'real',
    oddRootsRule: true,
    description: 'Polynomial expansion in ℚ[x] with 2000 term limit guard'
  },
  apart: {
    job: 'apart',
    comparisonKind: 'rational_cross_mult',
    defaultDomain: 'real',
    oddRootsRule: true,
    description: 'Partial fraction decomposition over ℚ; cross-multiplication verification'
  },
  diff: {
    job: 'diff',
    comparisonKind: 'derivative_domain_eq',
    defaultDomain: 'real',
    oddRootsRule: true,
    description: 'Derivative equal on common domain; degree mode trig scaled by π/180'
  },
  integrate: {
    job: 'integrate',
    comparisonKind: 'integral_up_to_constant',
    defaultDomain: 'real',
    oddRootsRule: true,
    description: 'Antiderivative equal up to constant on each domain interval; ln|x| for 1/x'
  },
  limit: {
    job: 'limit',
    comparisonKind: 'exact_numerical_match',
    defaultDomain: 'real',
    oddRootsRule: true,
    description: 'Two-sided and one-sided limits; refuses when left and right limits disagree'
  },
  series: {
    job: 'series',
    comparisonKind: 'polynomial_ring_q',
    defaultDomain: 'real',
    oddRootsRule: true,
    description: 'Taylor/Maclaurin series expansion with exact rational coefficients'
  },
  exact: {
    job: 'exact',
    comparisonKind: 'exact_numerical_match',
    defaultDomain: 'real',
    oddRootsRule: true,
    description: 'Exact form recognition with real odd roots'
  },
  eval: {
    job: 'eval',
    comparisonKind: 'exact_numerical_match',
    defaultDomain: 'real',
    oddRootsRule: true,
    description: 'Numeric evaluation with real odd root semantics'
  },
  linearSystems: {
    job: 'linearSystems',
    comparisonKind: 'linear_system_classification',
    defaultDomain: 'real',
    oddRootsRule: true,
    description: 'Linear system solution: unique, infinitely many (parametrised), or none'
  }
}

export interface AdversarialCase {
  id: string
  name: string
  input: string
  domain: DomainMode
  pitfall: string
  expectedReal: string
  category: string
}

/**
 * The 16 canonical adversarial cases that every checker and step validator must test against.
 */
export const ADVERSARIAL_CASES: readonly AdversarialCase[] = [
  {
    id: 'sqrt_x_sq',
    name: 'Square root of square',
    input: 'sqrt(x^2)',
    domain: 'real',
    pitfall: 'Simplifying to x (fails for x < 0: sqrt((-3)^2) = 3 ≠ -3)',
    expectedReal: '|x|',
    category: 'branch_cut'
  },
  {
    id: 'log_x_sq',
    name: 'Logarithm of square',
    input: 'ln(x^2)',
    domain: 'real',
    pitfall: 'Simplifying to 2*ln(x) (fails for x < 0 where ln(x) is not real)',
    expectedReal: '2*ln|x| (for x ≠ 0)',
    category: 'branch_cut'
  },
  {
    id: 'cancelled_factor',
    name: 'Cancelled rational factor',
    input: 'x*(x-1)/(x-1)',
    domain: 'real',
    pitfall: 'Simplifying to x without domain restriction (misses hole at x = 1)',
    expectedReal: 'x, x ≠ 1',
    category: 'domain_restriction'
  },
  {
    id: 'pole_odd_inv_x',
    name: 'Odd pole at origin',
    input: '1/x near 0',
    domain: 'real',
    pitfall: 'Claiming two-sided limit exists or evaluating at 0',
    expectedReal: 'Undefined at 0; lim_{x->0-} = -∞, lim_{x->0+} = +∞',
    category: 'singularity'
  },
  {
    id: 'pole_even_inv_x_sq',
    name: 'Even pole at origin',
    input: '1/x^2 near 0',
    domain: 'real',
    pitfall: 'Evaluating at 0 or confusing sign from left',
    expectedReal: 'Undefined at 0; lim_{x->0} = +∞',
    category: 'singularity'
  },
  {
    id: 'abs_val_diff',
    name: 'Absolute value derivative',
    input: 'diff(|x|, x) at 0',
    domain: 'real',
    pitfall: 'Returning 0 or sgn(0) without noting non-differentiability',
    expectedReal: 'Undefined at x = 0 (sgn(x) for x ≠ 0)',
    category: 'singularity'
  },
  {
    id: 'sign_func',
    name: 'Signum jump discontinuity',
    input: 'sgn(x) at 0',
    domain: 'real',
    pitfall: 'Treating as continuous across 0',
    expectedReal: 'Jump discontinuity: -1 for x < 0, 0 at x = 0, +1 for x > 0',
    category: 'discontinuity'
  },
  {
    id: 'piecewise',
    name: 'Piecewise transition',
    input: 'piecewise(x < 0, -x, x >= 0, x)',
    domain: 'real',
    pitfall: 'Differentiating across boundary without checking smoothness',
    expectedReal: 'Non-smooth corner at x = 0',
    category: 'piecewise'
  },
  {
    id: 'tan_pole',
    name: 'Tangent asymptote near π/2',
    input: 'tan(x) near pi/2',
    domain: 'real',
    pitfall: 'Numeric overflow or wrong sign across asymptote',
    expectedReal: 'Vertical asymptote: lim_{x->(pi/2)-} = +∞, lim_{x->(pi/2)+} = -∞',
    category: 'asymptote'
  },
  {
    id: 'double_root',
    name: 'Polynomial double root',
    input: '(x-2)^2 = 0',
    domain: 'real',
    pitfall: 'Reporting x = 2 without multiplicity 2',
    expectedReal: 'x = 2 with multiplicity 2',
    category: 'multiplicity'
  },
  {
    id: 'missing_root',
    name: 'Root lost by division',
    input: 'x^2 = x',
    domain: 'real',
    pitfall: 'Dividing by x and reporting only x = 1, losing x = 0',
    expectedReal: 'x = 0, x = 1',
    category: 'missing_root'
  },
  {
    id: 'extraneous_root_squaring',
    name: 'Extraneous root from squaring',
    input: 'x = sqrt(x + 2)',
    domain: 'real',
    pitfall: 'Squaring yields x^2 - x - 2 = 0 and accepting x = -1 (where sqrt(1) = 1 ≠ -1)',
    expectedReal: 'x = 2 only (x = -1 is extraneous)',
    category: 'extraneous_root'
  },
  {
    id: 'zero_times_inf',
    name: 'Indeterminate 0 * ∞ form',
    input: 'lim_{x->0} x * (1/x)',
    domain: 'real',
    pitfall: 'Evaluating 0 * ∞ as 0 or undefined without algebraic cancellation',
    expectedReal: '1',
    category: 'indeterminate_form'
  },
  {
    id: 'odd_root_neg',
    name: 'Real odd root of negative',
    input: '(-8)^(1/3)',
    domain: 'real',
    pitfall: 'Principal complex root 1 + 1.732i instead of -2',
    expectedReal: '-2',
    category: 'odd_root'
  },
  {
    id: 'euler_identity',
    name: 'Euler identity',
    input: 'e^(i*pi)',
    domain: 'complex',
    pitfall: 'Floating point rounding leaving small imaginary residual like -1 + 1.2e-16i',
    expectedReal: '-1 (exact)',
    category: 'exact_form'
  },
  {
    id: 'extreme_coefficients',
    name: 'Extreme scientific coefficients',
    input: '1e-19 * x + 6e24 = 0',
    domain: 'real',
    pitfall: 'Underflow of 1e-19 to 0 or catastrophic precision loss in subtraction',
    expectedReal: 'x = -6e43',
    category: 'precision'
  }
] as const
