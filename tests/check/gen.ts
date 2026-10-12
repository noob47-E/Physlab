// G2 tests: a seeded generator of polynomials, written out and multiplied by hand here (BigInt), independent of the
// checkers' own arithmetic, so a right answer and a planted wrong one are known by construction.

export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A whole number in [lo, hi]. */
export const int = (rand: () => number, lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1))

/** Coefficients low degree first, as BigInt. */
export type Coeffs = bigint[]

export function mul(p: Coeffs, q: Coeffs): Coeffs {
  const out: Coeffs = new Array(p.length + q.length - 1).fill(0n)
  p.forEach((a, i) => q.forEach((b, j) => (out[i + j] += a * b)))
  return out
}

/** "3*x^2 - 2*x + 5" (zeros left out; the zero polynomial is "0"). */
export function show(p: Coeffs, x = 'x'): string {
  const parts: string[] = []
  for (let i = p.length - 1; i >= 0; i--) {
    const c = p[i]
    if (c === 0n) continue
    const mon = i === 0 ? '' : i === 1 ? x : `${x}^${i}`
    const abs = c < 0n ? -c : c
    const body = mon ? (abs === 1n ? mon : `${abs}*${mon}`) : `${abs}`
    parts.push(parts.length ? (c < 0n ? ` - ${body}` : ` + ${body}`) : c < 0n ? `-${body}` : body)
  }
  return parts.length ? parts.join('') : '0'
}

/** A bracket (x − r) as text, r whole. */
export const bracket = (r: number, x = 'x'): string => (r === 0 ? x : r > 0 ? `(${x} - ${r})` : `(${x} + ${-r})`)
