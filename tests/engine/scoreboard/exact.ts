// Exact arithmetic for the scoreboard's corpora (G3a): rationals on BigInt and polynomials over them. A key is only as
// good as the arithmetic that built it, and doubles lose 6×10²⁴ + 1 and 10⁻¹⁹ + 1, so nothing here touches a float.

const abs = (a: bigint): bigint => (a < 0n ? -a : a)
const gcd = (a: bigint, b: bigint): bigint => {
  a = abs(a)
  b = abs(b)
  while (b) [a, b] = [b, a % b]
  return a
}

/** A rational number n/d in lowest terms, d > 0. */
export class Q {
  readonly n: bigint
  readonly d: bigint
  constructor(n: bigint | number, d: bigint | number = 1n) {
    let nn = BigInt(n)
    let dd = BigInt(d)
    if (dd === 0n) throw new Error('division by zero')
    if (dd < 0n) {
      nn = -nn
      dd = -dd
    }
    const g = gcd(nn, dd) || 1n
    this.n = nn / g
    this.d = dd / g
  }
  static of(x: Q | bigint | number): Q {
    return x instanceof Q ? x : new Q(x)
  }
  add(o: Q): Q {
    return new Q(this.n * o.d + o.n * this.d, this.d * o.d)
  }
  sub(o: Q): Q {
    return new Q(this.n * o.d - o.n * this.d, this.d * o.d)
  }
  mul(o: Q): Q {
    return new Q(this.n * o.n, this.d * o.d)
  }
  div(o: Q): Q {
    return new Q(this.n * o.d, this.d * o.n)
  }
  neg(): Q {
    return new Q(-this.n, this.d)
  }
  pow(k: number): Q {
    if (!Number.isInteger(k)) throw new Error('integer powers only')
    let r = new Q(1)
    const base = k < 0 ? new Q(this.d, this.n) : this
    for (let i = 0; i < Math.abs(k); i++) r = r.mul(base)
    return r
  }
  isZero(): boolean {
    return this.n === 0n
  }
  eq(o: Q): boolean {
    return this.n === o.n && this.d === o.d
  }
  sign(): number {
    return this.n === 0n ? 0 : this.n < 0n ? -1 : 1
  }
  /** A form every engine reads exactly: 7, -3/4, 6*10^24, 5*10^(-19), -3*10^24/7. */
  toString(): string {
    const part = (v: bigint): string => {
      const s = abs(v).toString()
      const zeros = s.length - s.replace(/0+$/, '').length
      if (zeros >= 10) return `${s.slice(0, s.length - zeros)}*10^${zeros}`
      return s
    }
    const sign = this.n < 0n ? '-' : ''
    if (this.d === 1n) return sign + part(this.n)
    const ds = this.d.toString()
    // A denominator that is a power of ten (10^19) reads as a negative power.
    if (/^10+$/.test(ds) && ds.length - 1 >= 10 && abs(this.n).toString().length <= 6) return `${sign}${abs(this.n)}*10^(-${ds.length - 1})`
    // A denominator written with * is bracketed: 1/2*10^18 would read as (1/2)·10^18.
    const den = part(this.d)
    return `${sign}${part(this.n)}/${den.includes('*') ? `(${den})` : den}`
  }
  /** Bracketed when the form holds an operator, so it can be written in front of x. */
  factorForm(): string {
    const s = this.toString()
    return /[*/^]/.test(s.replace(/^-/, '')) ? `(${s})` : s
  }
  toNumber(): number {
    return Number(this.n) / Number(this.d)
  }
}

/** A polynomial in one letter over Q, as degree → coefficient. */
export class Poly {
  readonly c: Map<number, Q>
  constructor(terms: Iterable<[number, Q | bigint | number]> = []) {
    this.c = new Map()
    for (const [e, v] of terms) this.addTerm(e, Q.of(v))
  }
  private addTerm(e: number, v: Q): void {
    const s = (this.c.get(e) ?? new Q(0)).add(v)
    if (s.isZero()) this.c.delete(e)
    else this.c.set(e, s)
  }
  static linear(a: Q | number | bigint, b: Q | number | bigint): Poly {
    return new Poly([
      [1, a],
      [0, b]
    ])
  }
  static constant(v: Q | number | bigint): Poly {
    return new Poly([[0, v]])
  }
  degree(): number {
    return this.c.size ? Math.max(...this.c.keys()) : -1
  }
  coef(e: number): Q {
    return this.c.get(e) ?? new Q(0)
  }
  lead(): Q {
    return this.coef(this.degree())
  }
  add(o: Poly): Poly {
    return new Poly([...this.c, ...o.c])
  }
  sub(o: Poly): Poly {
    return this.add(o.scale(new Q(-1)))
  }
  scale(k: Q): Poly {
    return new Poly([...this.c].map(([e, v]) => [e, v.mul(k)] as [number, Q]))
  }
  mul(o: Poly): Poly {
    const out: [number, Q][] = []
    for (const [e1, v1] of this.c) for (const [e2, v2] of o.c) out.push([e1 + e2, v1.mul(v2)])
    return new Poly(out)
  }
  pow(k: number): Poly {
    let r = Poly.constant(1)
    for (let i = 0; i < k; i++) r = r.mul(this)
    return r
  }
  isZero(): boolean {
    return this.c.size === 0
  }
  eval(x: Q): Q {
    let s = new Q(0)
    for (const [e, v] of this.c) s = s.add(v.mul(x.pow(e)))
    return s
  }
  /** Long division: [quotient, remainder]. */
  divmod(d: Poly): [Poly, Poly] {
    if (d.isZero()) throw new Error('division by the zero polynomial')
    let r = new Poly(this.c)
    let q = new Poly()
    while (!r.isZero() && r.degree() >= d.degree()) {
      const k = r.degree() - d.degree()
      const t = new Poly([[k, r.lead().div(d.lead())]])
      q = q.add(t)
      r = r.sub(t.mul(d))
    }
    return [q, r]
  }
  /** Descending powers: 3*x^2 - 1/2*x + 6*10^24. */
  toString(v = 'x'): string {
    if (this.isZero()) return '0'
    const terms = [...this.c].sort((a, b) => b[0] - a[0])
    return terms
      .map(([e, k], i) => {
        const neg = k.sign() < 0
        const m = neg ? k.neg() : k
        const power = e === 0 ? '' : e === 1 ? v : `${v}^${e}`
        const coef = e === 0 ? m.factorForm() : m.eq(new Q(1)) ? '' : `${m.factorForm()}*`
        const body = coef + power
        if (i === 0) return (neg ? '-' : '') + body
        return (neg ? ' - ' : ' + ') + body
      })
      .join('')
  }
}

/** A seeded generator (mulberry32), so every corpus is the same on every machine. */
export class Rng {
  private s: number
  constructor(seed: number) {
    this.s = seed >>> 0
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }
  nonzero(max = 9): number {
    const v = this.int(1, max)
    return this.next() < 0.5 ? -v : v
  }
  pick<T>(xs: readonly T[]): T {
    return xs[this.int(0, xs.length - 1)]
  }
}

/** The extreme sizes the contract names: 1e−19 and 6e24 (and their kin), exact. */
export const EXTREME: readonly Q[] = [new Q(6n * 10n ** 24n), new Q(10n ** 24n), new Q(-3n * 10n ** 24n), new Q(1n, 10n ** 19n), new Q(5n, 10n ** 19n), new Q(-2n, 10n ** 19n)]
