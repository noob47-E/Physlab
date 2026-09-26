// Exact fractions, on bigint.
//
// Everything in Pure Math is worked out on these rather than on JavaScript numbers. A student
// reading a factorisation must never be shown 0.30000000000000004, and a step that divides by 3
// and multiplies back by 3 has to land exactly where it started or the working stops making sense.

/** A fraction in lowest terms. `d` is always positive, so the sign lives in `n`. */
export interface Rat {
  n: bigint
  d: bigint
}

const babs = (a: bigint): bigint => (a < 0n ? -a : a)

export function bgcd(a: bigint, b: bigint): bigint {
  a = babs(a)
  b = babs(b)
  while (b) {
    const t = a % b
    a = b
    b = t
  }
  return a
}

export function blcm(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return 0n
  return babs(a / bgcd(a, b) * b)
}

/** Build a fraction and put it in lowest terms. */
export function rat(n: bigint | number, d: bigint | number = 1n): Rat {
  let bn = typeof n === 'bigint' ? n : BigInt(Math.trunc(n))
  let bd = typeof d === 'bigint' ? d : BigInt(Math.trunc(d))
  if (bd === 0n) throw new Error('divide by zero')
  if (bd < 0n) {
    bn = -bn
    bd = -bd
  }
  const g = bgcd(bn, bd) || 1n
  return { n: bn / g, d: bd / g }
}

export const R0 = rat(0n)
export const R1 = rat(1n)
export const RM1 = rat(-1n)

export const rIsZero = (a: Rat): boolean => a.n === 0n
export const rIsInt = (a: Rat): boolean => a.d === 1n
export const rIsNeg = (a: Rat): boolean => a.n < 0n
export const rIsOne = (a: Rat): boolean => a.n === 1n && a.d === 1n

export const rAdd = (a: Rat, b: Rat): Rat => rat(a.n * b.d + b.n * a.d, a.d * b.d)
export const rSub = (a: Rat, b: Rat): Rat => rat(a.n * b.d - b.n * a.d, a.d * b.d)
export const rMul = (a: Rat, b: Rat): Rat => rat(a.n * b.n, a.d * b.d)
export const rDiv = (a: Rat, b: Rat): Rat => {
  if (b.n === 0n) throw new Error('divide by zero')
  return rat(a.n * b.d, a.d * b.n)
}
export const rNeg = (a: Rat): Rat => ({ n: -a.n, d: a.d })
export const rAbs = (a: Rat): Rat => ({ n: babs(a.n), d: a.d })
export const rInv = (a: Rat): Rat => rDiv(R1, a)
export const rEq = (a: Rat, b: Rat): boolean => a.n === b.n && a.d === b.d

/** −1, 0 or 1. */
export function rCmp(a: Rat, b: Rat): number {
  const l = a.n * b.d
  const r = b.n * a.d
  return l < r ? -1 : l > r ? 1 : 0
}

export const rSign = (a: Rat): number => (a.n < 0n ? -1 : a.n > 0n ? 1 : 0)
export const rMax = (a: Rat, b: Rat): Rat => (rCmp(a, b) >= 0 ? a : b)
export const rMin = (a: Rat, b: Rat): Rat => (rCmp(a, b) <= 0 ? a : b)

/** a^k for a whole k (negative k inverts). */
export function rPow(a: Rat, k: number): Rat {
  if (k < 0) return rInv(rPow(a, -k))
  let out = R1
  let base = a
  let e = k
  while (e > 0) {
    if (e & 1) out = rMul(out, base)
    base = rMul(base, base)
    e >>= 1
  }
  return out
}

export const rNum = (a: Rat): number => Number(a.n) / Number(a.d)

/**
 * An exact fraction for a JavaScript number.
 *
 * Decimals are read the way they were written — 0.15 becomes 15/100, not the binary value the
 * double actually holds — because a student who typed 0.15 means three twentieths, and the
 * alternative is a "simplified" fraction with a nineteen-digit denominator.
 */
export function rFromNumber(x: number): Rat {
  if (!Number.isFinite(x)) throw new Error('not a finite number')
  if (Number.isInteger(x)) return rat(BigInt(x))
  const s = String(x)
  const exp = s.match(/e([+-]?\d+)$/i)
  if (exp) {
    const k = Number(exp[1])
    const mant = rFromNumber(Number(s.slice(0, exp.index)))
    return k >= 0 ? rMul(mant, rPow(rat(10n), k)) : rDiv(mant, rPow(rat(10n), -k))
  }
  const dot = s.indexOf('.')
  if (dot < 0) return rat(BigInt(s))
  const places = s.length - dot - 1
  return rat(BigInt(s.replace('.', '')), 10n ** BigInt(places))
}

/** Plain text: "3", "-2/5". */
export function rStr(a: Rat): string {
  return a.d === 1n ? String(a.n) : `${a.n}/${a.d}`
}

/** LaTeX: an integer, or a \frac with the sign pulled out in front. */
export function rTex(a: Rat): string {
  if (a.d === 1n) return String(a.n)
  const sign = a.n < 0n ? '-' : ''
  return `${sign}\\frac{${babs(a.n)}}{${a.d}}`
}

/** LaTeX for a coefficient inside a longer sum, where a leading minus is written by the caller. */
export function rTexAbs(a: Rat): string {
  return rTex(rAbs(a))
}

/** The smallest positive whole number that clears every denominator in the list. */
export function commonDenominator(rs: Rat[]): bigint {
  return rs.reduce((acc, r) => blcm(acc, r.d), 1n) || 1n
}

/** The highest common factor of a list of fractions: hcf of tops over lcm of bottoms. */
export function rGcd(rs: Rat[]): Rat {
  const nonZero = rs.filter((r) => !rIsZero(r))
  if (nonZero.length === 0) return R0
  const n = nonZero.reduce((a, r) => bgcd(a, r.n), 0n)
  const d = nonZero.reduce((a, r) => blcm(a, r.d), 1n)
  return rat(n, d)
}

/**
 * √a when it is exact, else null. Used for perfect squares, and for deciding whether a quadratic
 * has nice roots before choosing how to show the working.
 */
export function rSqrt(a: Rat): Rat | null {
  if (a.n < 0n) return null
  const isqrt = (v: bigint): bigint | null => {
    if (v < 2n) return v
    let x = v
    let y = (x + 1n) / 2n
    while (y < x) {
      x = y
      y = (x + v / x) / 2n
    }
    return x * x === v ? x : null
  }
  const n = isqrt(a.n)
  const d = isqrt(a.d)
  return n !== null && d !== null ? rat(n, d) : null
}
