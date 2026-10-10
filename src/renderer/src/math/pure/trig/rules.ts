// Trig-identity proofs (math/pure/trigIdentity.ts says how they work): the rewrites a student is allowed, each checked numerically before use.
// Out of trigIdentity.ts as a pure move (CLEANUP-PLAN.md CW10d).

import { add, CANCELLED, div, evaluate, expand, type Factor, fn, type Fn, fnBase, type FnBase, gcd, type Lin, linAdd, linKey, linScale, linSub, makeLin, mono, type Mono, monoSum, mul, num, pow, sub, type Sum, type SumBase, sumOf } from './canonical'
import { fnText, linParts, monoPrint, sumPrint } from './write'

// ---------------------------------------------------------------------------------------------
// The rewrites
// ---------------------------------------------------------------------------------------------

/** One step: the new expression, what was done in words (forwards and read backwards), a chip. */
export interface Rewrite {
  s: Sum
  /** Past tense, what the step did going left to right. */
  fwd: string
  /** The same step read the other way (the backward search's steps are printed reversed). */
  rev: string
  /** The formula used, in LaTeX, for the chip beside the step. */
  chip: string
  /** A short rule id, for tests and statistics. */
  id: string
}

const T = (a: Lin): string => {
  const { top, den, single } = linParts(a)
  if (den === 1 && single) return top
  return den === 1 ? `(${top})` : single ? `(${top}/${den})` : `((${top})/${den})`
}
const fnS = (f: Fn, a: Lin, e = 1): string => (e === 1 ? fnText(f, a, 1) : fnText(f, a, e))

type Emit = (s: Sum, fwd: string, rev: string, chip: string, id: string) => void

// --- whole-expression substitutions: every f(u)ᵉ that matches is replaced at once -------------

function mapFactors(s: Sum, rep: (b: FnBase, e: number) => Sum | null): { s: Sum; changed: boolean } {
  let changed = false
  const terms: Sum[] = []
  for (const m of s.t) {
    let acc = num(m.c)
    for (const x of m.fs) {
      if (x.b.k === 'f') {
        const r = rep(x.b, x.e)
        if (r) {
          changed = true
          acc = mul(acc, r)
          continue
        }
        acc = mul(acc, pow(sumOf([mono(1, [{ b: x.b, e: 1 }])]), x.e))
      } else {
        const inner = mapFactors(x.b.s, rep)
        if (inner.changed) changed = true
        acc = mul(acc, pow(inner.s, x.e))
      }
    }
    terms.push(acc)
  }
  return { s: add(...terms), changed }
}

/** Every distinct f(u) that occurs, with its highest positive and lowest negative power. */
export function fnSites(s: Sum, out = new Map<string, { f: Fn; a: Lin; maxE: number; minE: number }>()) {
  for (const m of s.t)
    for (const x of m.fs) {
      if (x.b.k === 'f') {
        const prev = out.get(x.b.key)
        out.set(x.b.key, { f: x.b.f, a: x.b.a, maxE: Math.max(prev?.maxE ?? 0, x.e), minE: Math.min(prev?.minE ?? 0, x.e) })
      } else fnSites(x.b.s, out)
    }
  return out
}

const RECIP: Partial<Record<Fn, (a: Lin) => Sum>> = {
  tan: (a) => div(fn('sin', a), fn('cos', a)),
  cot: (a) => div(fn('cos', a), fn('sin', a)),
  sec: (a) => div(num(1), fn('cos', a)),
  csc: (a) => div(num(1), fn('sin', a))
}
const RECIP_WORDS: Partial<Record<Fn, (a: Lin) => string>> = {
  tan: (a) => `sin ${T(a)}/cos ${T(a)}`,
  cot: (a) => `cos ${T(a)}/sin ${T(a)}`,
  sec: (a) => `1/cos ${T(a)}`,
  csc: (a) => `1/sin ${T(a)}`
}
const RECIP_CHIP: Partial<Record<Fn, string>> = {
  tan: '\\tan\\theta = \\dfrac{\\sin\\theta}{\\cos\\theta}',
  cot: '\\cot\\theta = \\dfrac{\\cos\\theta}{\\sin\\theta}',
  sec: '\\sec\\theta = \\dfrac{1}{\\cos\\theta}',
  csc: '\\operatorname{cosec}\\theta = \\dfrac{1}{\\sin\\theta}'
}

/** The three forms of cos 2θ, in the order the double-angle rule tries them. */
const DOUBLE_COS_CHIP = ['\\cos 2\\theta = \\cos^2\\theta - \\sin^2\\theta', '\\cos 2\\theta = 2\\cos^2\\theta - 1', '\\cos 2\\theta = 1 - 2\\sin^2\\theta']

/** The chip for "Wrote the sines and cosines as cosec x and sec x.": every function it made. */
function madeChip(names: string[]): string {
  const fns: Fn[] = (['tan', 'cot', 'sec', 'csc'] as Fn[]).filter((f) => names.some((n) => n.startsWith(f === 'csc' ? 'cosec' : f)))
  return fns.map((f) => RECIP_CHIP[f]!).join(',\\ ')
}

function globalRules(s: Sum, targets: Set<string>, emit: Emit): void {
  const sites = [...fnSites(s).values()]

  // tan/cot/sec/cosec → sin, cos: each one on its own, and all of them at once.
  const recip = sites.filter((x) => RECIP[x.f])
  for (const x of recip) {
    const r = mapFactors(s, (b, e) => (b.f === x.f && linKey(b.a) === linKey(x.a) ? pow(RECIP[b.f]!(b.a), e) : null))
    emit(r.s, `Wrote ${fnS(x.f, x.a)} as ${RECIP_WORDS[x.f]!(x.a)}.`, `Wrote ${RECIP_WORDS[x.f]!(x.a)} as ${fnS(x.f, x.a)}.`, RECIP_CHIP[x.f]!, 'to-sincos')
  }
  if (recip.length > 1) {
    const r = mapFactors(s, (b, e) => (RECIP[b.f] ? pow(RECIP[b.f]!(b.a), e) : null))
    emit(r.s, 'Wrote everything in terms of sin and cos.', `Wrote the sines and cosines as ${recip.map((x) => fnS(x.f, x.a)).join(' and ')}.`, madeChip(recip.map((x) => fnS(x.f, x.a))), 'to-sincos')
  }

  // sin, cos → tan, cot, sec, cosec, term by term (sin²x/cos x → sin x tan x).
  {
    let made: string[] = []
    const terms = s.t.map((m) => {
      const r = fromSinCos(m)
      if (r.made.length) made = [...made, ...r.made]
      return r.s
    })
    if (made.length) {
      const names = [...new Set(made)]
      emit(add(...terms), `Wrote the sines and cosines as ${names.join(' and ')}.`, `Wrote ${names.join(' and ')} in terms of sin and cos.`, madeChip(names), 'from-sincos')
    }
  }

  for (const x of sites) {
    const u = x.a
    // Pythagorean replacements of a square: sin²u = 1 − cos²u and the like.
    const PY: [Fn, Fn, number, string, string][] = [
      ['sin', 'cos', -1, `sin²${T(u)} = 1 − cos²${T(u)}`, '\\sin^2\\theta = 1 - \\cos^2\\theta'],
      ['cos', 'sin', -1, `cos²${T(u)} = 1 − sin²${T(u)}`, '\\cos^2\\theta = 1 - \\sin^2\\theta'],
      ['sec', 'tan', 1, `sec²${T(u)} = 1 + tan²${T(u)}`, '\\sec^2\\theta = 1 + \\tan^2\\theta'],
      ['csc', 'cot', 1, `cosec²${T(u)} = 1 + cot²${T(u)}`, '\\operatorname{cosec}^2\\theta = 1 + \\cot^2\\theta'],
      ['tan', 'sec', 1, `tan²${T(u)} = sec²${T(u)} − 1`, '\\tan^2\\theta = \\sec^2\\theta - 1'],
      ['cot', 'csc', 1, `cot²${T(u)} = cosec²${T(u)} − 1`, '\\cot^2\\theta = \\operatorname{cosec}^2\\theta - 1']
    ]
    for (const [f, g, sign, words, chip] of PY) {
      if (x.f !== f || (x.maxE < 2 && x.minE > -2)) continue
      const other = pow(fn(g, u), 2)
      const repl = f === 'tan' || f === 'cot' ? sub(other, num(1)) : sign < 0 ? sub(num(1), other) : add(num(1), other)
      const r = mapFactors(s, (b, e) =>
        b.f === f && linKey(b.a) === linKey(u) && Math.abs(e) >= 2 ? mul(pow(fn(f, u), e - 2 * Math.sign(e)), pow(repl, Math.sign(e))) : null
      )
      if (r.changed) emit(r.s, `Used ${words}.`, `Used ${words.split(' = ').reverse().join(' = ')}.`, chip, 'pythag-sub')
    }

    // Double angle, forwards: f(2u) in terms of u. Allowed when u is a whole multiple, or when
    // u itself appears on the other side (the half-angle case: cos x in terms of x/2).
    if (x.f === 'sin' || x.f === 'cos' || x.f === 'tan') {
      const half = linScale(u, 0.5)
      const whole = half.every(([, c]) => Number.isInteger(c))
      if (whole || targets.has(linKey(half))) {
        const h = T(half)
        const forms: [Sum, string, string][] =
          x.f === 'sin'
            ? [[mul(num(2), fn('sin', half), fn('cos', half)), `sin ${T(u)} = 2 sin ${h} cos ${h}`, '\\sin 2\\theta = 2\\sin\\theta\\cos\\theta']]
            : x.f === 'cos'
              ? [
                  [sub(pow(fn('cos', half), 2), pow(fn('sin', half), 2)), `cos ${T(u)} = cos²${h} − sin²${h}`, '\\cos 2\\theta = \\cos^2\\theta - \\sin^2\\theta'],
                  [sub(mul(num(2), pow(fn('cos', half), 2)), num(1)), `cos ${T(u)} = 2 cos²${h} − 1`, '\\cos 2\\theta = 2\\cos^2\\theta - 1'],
                  [sub(num(1), mul(num(2), pow(fn('sin', half), 2))), `cos ${T(u)} = 1 − 2 sin²${h}`, '\\cos 2\\theta = 1 - 2\\sin^2\\theta']
                ]
              : [[div(mul(num(2), fn('tan', half)), sub(num(1), pow(fn('tan', half), 2))), `tan ${T(u)} = 2 tan ${h}/(1 − tan²${h})`, '\\tan 2\\theta = \\dfrac{2\\tan\\theta}{1 - \\tan^2\\theta}']]
        for (const [rep, words, chip] of forms) {
          const r = mapFactors(s, (b, e) => (b.f === x.f && linKey(b.a) === linKey(u) ? pow(rep, e) : null))
          const kind = whole ? 'double angle' : 'half angle'
          emit(r.s, `Used the ${kind} formula ${words}.`, `Used the ${kind} formula ${words.split(' = ').reverse().join(' = ')}.`, chip, whole ? 'double-expand' : 'half-expand')
        }
      }
    }

    // Compound angle, forwards: sin(A + B), cos(A − B), tan(A + B); and cos 3x as cos(2x + x).
    if (x.f === 'sin' || x.f === 'cos' || x.f === 'tan') {
      let P: Lin | null = null
      let Q: Lin | null = null
      if (u.length >= 2) {
        P = [u[0]]
        Q = u.slice(1)
      } else if (u.length === 1 && Number.isInteger(u[0][1]) && Math.abs(u[0][1]) >= 3) {
        const [v, c] = u[0]
        P = makeLin([[v, c - Math.sign(c)]])
        Q = makeLin([[v, Math.sign(c)]])
      }
      if (P && Q) {
        const rep =
          x.f === 'sin'
            ? add(mul(fn('sin', P), fn('cos', Q)), mul(fn('cos', P), fn('sin', Q)))
            : x.f === 'cos'
              ? sub(mul(fn('cos', P), fn('cos', Q)), mul(fn('sin', P), fn('sin', Q)))
              : div(add(fn('tan', P), fn('tan', Q)), sub(num(1), mul(fn('tan', P), fn('tan', Q))))
        const r = mapFactors(s, (b, e) => (b.f === x.f && linKey(b.a) === linKey(u) ? pow(rep, e) : null))
        const shown = u.length >= 2 ? fnS(x.f, u) : `${x.f}(${T(P)} + ${T(Q)})`
        const neg = Q[0][1] < 0
        const q = neg ? linScale(Q, -1) : Q
        const F = (g: Fn, a: Lin): string => fnText(g, a, 1)
        const pm = (plus: boolean): string => (plus ? '+' : '−')
        const book =
          x.f === 'sin'
            ? `${F('sin', P)} ${F('cos', q)} ${pm(!neg)} ${F('cos', P)} ${F('sin', q)}`
            : x.f === 'cos'
              ? `${F('cos', P)} ${F('cos', q)} ${pm(neg)} ${F('sin', P)} ${F('sin', q)}`
              : `(${F('tan', P)} ${pm(!neg)} ${F('tan', q)})/(1 ${pm(neg)} ${F('tan', P)} ${F('tan', q)})`
        const words = `${shown} = ${book}`
        // cos(A − B) is shown its own formula, with the plus sign, not the one for cos(A + B).
        const chip = neg
          ? x.f === 'sin'
            ? '\\sin(A - B) = \\sin A\\cos B - \\cos A\\sin B'
            : x.f === 'cos'
              ? '\\cos(A - B) = \\cos A\\cos B + \\sin A\\sin B'
              : '\\tan(A - B) = \\dfrac{\\tan A - \\tan B}{1 + \\tan A\\tan B}'
          : x.f === 'sin'
            ? '\\sin(A + B) = \\sin A\\cos B + \\cos A\\sin B'
            : x.f === 'cos'
              ? '\\cos(A + B) = \\cos A\\cos B - \\sin A\\sin B'
              : '\\tan(A + B) = \\dfrac{\\tan A + \\tan B}{1 - \\tan A\\tan B}'
        emit(r.s, `Used the compound angle formula ${words}.`, `Used the compound angle formula ${words.split(' = ').reverse().join(' = ')}.`, chip, 'compound-expand')
      }
    }
  }

  // All double angles at once (cos 2x cos x − sin 2x sin x has two), one variant per cos form.
  const doubles = sites.filter((x) => (x.f === 'sin' || x.f === 'cos') && linScale(x.a, 0.5).every(([, c]) => Number.isInteger(c)))
  if (doubles.length > 1)
    for (const form of [0, 1, 2]) {
      const used = new Set<string>()
      const r = mapFactors(s, (b, e) => {
        if (!(b.f === 'sin' || b.f === 'cos')) return null
        const h = linScale(b.a, 0.5)
        if (!h.every(([, c]) => Number.isInteger(c))) return null
        const H = T(h)
        used.add(
          b.f === 'sin'
            ? `sin ${T(b.a)} = 2 sin ${H} cos ${H}`
            : form === 0
              ? `cos ${T(b.a)} = cos²${H} − sin²${H}`
              : form === 1
                ? `cos ${T(b.a)} = 2 cos²${H} − 1`
                : `cos ${T(b.a)} = 1 − 2 sin²${H}`
        )
        const rep =
          b.f === 'sin'
            ? mul(num(2), fn('sin', h), fn('cos', h))
            : form === 0
              ? sub(pow(fn('cos', h), 2), pow(fn('sin', h), 2))
              : form === 1
                ? sub(mul(num(2), pow(fn('cos', h), 2)), num(1))
                : sub(num(1), mul(num(2), pow(fn('sin', h), 2)))
        return pow(rep, e)
      })
      const list = [...used]
      // The chip shows each formula used, in the form used: sin²A − sin²B = (cos 2B − cos 2A)/2
      // went through cos 2θ = 1 − 2 sin²θ, and used to be shown sin 2θ = 2 sin θ cos θ.
      const chips = [
        list.some((w) => w.startsWith('sin')) ? '\\sin 2\\theta = 2\\sin\\theta\\cos\\theta' : '',
        list.some((w) => w.startsWith('cos')) ? DOUBLE_COS_CHIP[form] : ''
      ].filter(Boolean)
      emit(r.s, `Used the double angle formulas ${list.join(' and ')}.`, `Used the double angle formulas ${list.map(reverseWords).join(' and ')}.`, chips.join(',\\ '), 'double-expand')
    }
}

/** One term's sines and cosines of the same angle turned into tan, cot, sec, cosec. */
function fromSinCos(m: Mono): { s: Sum; made: string[] } {
  const made: string[] = []
  const byArg = new Map<string, { a: Lin; sin: number; cos: number }>()
  const rest: Factor[] = []
  for (const x of m.fs) {
    if (x.b.k === 'f' && (x.b.f === 'sin' || x.b.f === 'cos')) {
      const k = linKey(x.b.a)
      const g = byArg.get(k) ?? { a: x.b.a, sin: 0, cos: 0 }
      g[x.b.f] += x.e
      byArg.set(k, g)
    } else rest.push(x)
  }
  let acc = monoSum(mono(m.c, rest))
  for (const g of byArg.values()) {
    let { sin, cos } = g
    if (sin > 0 && cos < 0) {
      const k = Math.min(sin, -cos)
      acc = mul(acc, pow(fn('tan', g.a), k))
      made.push(`tan ${T(g.a)}`)
      sin -= k
      cos += k
    } else if (cos > 0 && sin < 0) {
      const k = Math.min(cos, -sin)
      acc = mul(acc, pow(fn('cot', g.a), k))
      made.push(`cot ${T(g.a)}`)
      sin += k
      cos -= k
    }
    if (sin < 0) {
      acc = mul(acc, pow(fn('csc', g.a), -sin))
      made.push(`cosec ${T(g.a)}`)
      sin = 0
    }
    if (cos < 0) {
      acc = mul(acc, pow(fn('sec', g.a), -cos))
      made.push(`sec ${T(g.a)}`)
      cos = 0
    }
    acc = mul(acc, pow(fn('sin', g.a), sin), pow(fn('cos', g.a), cos))
  }
  return { s: acc, made }
}

// --- rules inside one sum: pairs of terms, common denominator, factor, expand -----------------

interface Decomp {
  /** The pattern: '1', or fn names with their angles. */
  pat: string
  fns: { f: Fn; a: Lin }[]
  rest: Mono
}

function withoutPowers(m: Mono, take: { key: string; e: number }[]): Mono | null {
  const fs: Factor[] = []
  const need = new Map(take.map((t) => [t.key, t.e]))
  for (const x of m.fs) {
    const n = need.get(x.b.key)
    if (n !== undefined) {
      if (x.e < n) return null
      if (x.e - n !== 0) fs.push({ b: x.b, e: x.e - n })
      need.delete(x.b.key)
    } else fs.push(x)
  }
  if (need.size) return null
  return mono(m.c, fs)
}

function squares(m: Mono): Decomp[] {
  const out: Decomp[] = [{ pat: '1', fns: [], rest: m }]
  for (const x of m.fs)
    if (x.b.k === 'f' && x.e >= 2) {
      const rest = withoutPowers(m, [{ key: x.b.key, e: 2 }])
      if (rest) out.push({ pat: `${x.b.f}²`, fns: [{ f: x.b.f, a: x.b.a }], rest })
    }
  return out
}
function singles(m: Mono): Decomp[] {
  const out: Decomp[] = []
  for (const x of m.fs)
    if (x.b.k === 'f' && (x.b.f === 'sin' || x.b.f === 'cos') && x.e >= 1) {
      const rest = withoutPowers(m, [{ key: x.b.key, e: 1 }])
      if (rest) out.push({ pat: x.b.f, fns: [{ f: x.b.f, a: x.b.a }], rest })
    }
  return out
}
function pairs(m: Mono): Decomp[] {
  const out: Decomp[] = []
  const trig = m.fs.filter((x) => x.b.k === 'f' && (x.b.f === 'sin' || x.b.f === 'cos') && x.e >= 1) as (Factor & { b: FnBase })[]
  for (const p of trig)
    for (const q of trig) {
      if (p === q || linKey(p.b.a) === linKey(q.b.a)) continue
      const rest = withoutPowers(m, [
        { key: p.b.key, e: 1 },
        { key: q.b.key, e: 1 }
      ])
      if (rest) out.push({ pat: `${p.b.f}·${q.b.f}`, fns: [{ f: p.b.f, a: p.b.a }, { f: q.b.f, a: q.b.a }], rest })
    }
  return out
}

/** Pythagorean and double-angle pairs, read as (pattern i, pattern j, ratio cⱼ/cᵢ) → result. */
const SQUARE_PAIRS: { i: string; j: string; r: number; out: (u: Lin) => Sum; k: number; words: (u: Lin) => string; chip: string; id: string }[] = [
  { i: 'sin²', j: 'cos²', r: 1, out: () => num(1), k: 1, words: (u) => `sin²${T(u)} + cos²${T(u)} = 1`, chip: '\\sin^2\\theta + \\cos^2\\theta = 1', id: 'pythag' },
  { i: '1', j: 'sin²', r: -1, out: (u) => pow(fn('cos', u), 2), k: 1, words: (u) => `1 − sin²${T(u)} = cos²${T(u)}`, chip: '\\sin^2\\theta + \\cos^2\\theta = 1', id: 'pythag' },
  { i: '1', j: 'cos²', r: -1, out: (u) => pow(fn('sin', u), 2), k: 1, words: (u) => `1 − cos²${T(u)} = sin²${T(u)}`, chip: '\\sin^2\\theta + \\cos^2\\theta = 1', id: 'pythag' },
  { i: '1', j: 'tan²', r: 1, out: (u) => pow(fn('sec', u), 2), k: 1, words: (u) => `1 + tan²${T(u)} = sec²${T(u)}`, chip: '1 + \\tan^2\\theta = \\sec^2\\theta', id: 'pythag' },
  { i: 'sec²', j: 'tan²', r: -1, out: () => num(1), k: 1, words: (u) => `sec²${T(u)} − tan²${T(u)} = 1`, chip: '1 + \\tan^2\\theta = \\sec^2\\theta', id: 'pythag' },
  { i: 'sec²', j: '1', r: -1, out: (u) => pow(fn('tan', u), 2), k: 1, words: (u) => `sec²${T(u)} − 1 = tan²${T(u)}`, chip: '1 + \\tan^2\\theta = \\sec^2\\theta', id: 'pythag' },
  { i: '1', j: 'cot²', r: 1, out: (u) => pow(fn('csc', u), 2), k: 1, words: (u) => `1 + cot²${T(u)} = cosec²${T(u)}`, chip: '1 + \\cot^2\\theta = \\operatorname{cosec}^2\\theta', id: 'pythag' },
  { i: 'csc²', j: 'cot²', r: -1, out: () => num(1), k: 1, words: (u) => `cosec²${T(u)} − cot²${T(u)} = 1`, chip: '1 + \\cot^2\\theta = \\operatorname{cosec}^2\\theta', id: 'pythag' },
  { i: 'csc²', j: '1', r: -1, out: (u) => pow(fn('cot', u), 2), k: 1, words: (u) => `cosec²${T(u)} − 1 = cot²${T(u)}`, chip: '1 + \\cot^2\\theta = \\operatorname{cosec}^2\\theta', id: 'pythag' },
  { i: 'cos²', j: 'sin²', r: -1, out: (u) => fn('cos', linScale(u, 2)), k: 1, words: (u) => `cos²${T(u)} − sin²${T(u)} = cos ${T(linScale(u, 2))}`, chip: '\\cos 2\\theta = \\cos^2\\theta - \\sin^2\\theta', id: 'double-contract' },
  { i: 'cos²', j: '1', r: -0.5, out: (u) => fn('cos', linScale(u, 2)), k: 0.5, words: (u) => `2 cos²${T(u)} − 1 = cos ${T(linScale(u, 2))}`, chip: '\\cos 2\\theta = 2\\cos^2\\theta - 1', id: 'double-contract' },
  { i: '1', j: 'sin²', r: -2, out: (u) => fn('cos', linScale(u, 2)), k: 1, words: (u) => `1 − 2 sin²${T(u)} = cos ${T(linScale(u, 2))}`, chip: '\\cos 2\\theta = 1 - 2\\sin^2\\theta', id: 'double-contract' }
]

function reverseWords(w: string): string {
  return w.split(' = ').reverse().join(' = ')
}

function sumRules(S: Sum, emit: (s: Sum, fwd: string, rev: string, chip: string, id: string) => void): void {
  const n = S.t.length
  if (n >= 2) {
    const sq = S.t.map(squares)
    const sg = S.t.map(singles)
    const pr = S.t.map(pairs)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if (i === j) continue
        const others = S.t.filter((_, k) => k !== i && k !== j)
        // Squares: Pythagorean pairs and the cos 2θ forms.
        for (const di of sq[i])
          for (const dj of sq[j]) {
            if (di.rest.key !== dj.rest.key) continue
            const r = dj.rest.c / di.rest.c
            for (const p of SQUARE_PAIRS) {
              if (p.i !== di.pat || p.j !== dj.pat || Math.abs(r - p.r) > 1e-9) continue
              const u = (di.fns[0] ?? dj.fns[0]).a
              if (di.fns[0] && dj.fns[0] && linKey(di.fns[0].a) !== linKey(dj.fns[0].a)) continue
              const got = mul(monoSum(di.rest), num(p.k), p.out(u))
              const kind = p.id === 'double-contract' ? 'the double angle formula ' : ''
              emit(add(sumOf(others), got), `Used ${kind}${p.words(u)}.`, `Used ${kind}${reverseWords(p.words(u))}.`, p.chip, p.id)
            }
          }
        // Compound angle, backwards: sin P cos Q + cos P sin Q = sin(P + Q), and the others.
        if (i < j)
          for (const di of pr[i])
            for (const dj of pr[j]) {
              if (di.rest.key !== dj.rest.key) continue
              const r = dj.rest.c / di.rest.c
              const [p1, q1] = di.fns
              const [p2, q2] = dj.fns
              if (linKey(p1.a) !== linKey(p2.a) || linKey(q1.a) !== linKey(q2.a)) continue
              const P = p1.a
              const Q = q1.a
              let out: Sum | null = null
              let words = ''
              let chip = ''
              if (di.pat === 'sin·cos' && dj.pat === 'cos·sin' && Math.abs(r - 1) < 1e-9) {
                out = fn('sin', linAdd(P, Q))
                words = `sin ${T(P)} cos ${T(Q)} + cos ${T(P)} sin ${T(Q)} = ${fnS('sin', linAdd(P, Q))}`
                chip = '\\sin(A + B) = \\sin A\\cos B + \\cos A\\sin B'
              } else if (di.pat === 'sin·cos' && dj.pat === 'cos·sin' && Math.abs(r + 1) < 1e-9) {
                out = fn('sin', linSub(P, Q))
                words = `sin ${T(P)} cos ${T(Q)} − cos ${T(P)} sin ${T(Q)} = ${sumPrint(fn('sin', linSub(P, Q))).text}`
                chip = '\\sin(A - B) = \\sin A\\cos B - \\cos A\\sin B'
              } else if (di.pat === 'cos·cos' && dj.pat === 'sin·sin' && Math.abs(r + 1) < 1e-9) {
                out = fn('cos', linAdd(P, Q))
                words = `cos ${T(P)} cos ${T(Q)} − sin ${T(P)} sin ${T(Q)} = ${fnS('cos', linAdd(P, Q))}`
                chip = '\\cos(A + B) = \\cos A\\cos B - \\sin A\\sin B'
              } else if (di.pat === 'cos·cos' && dj.pat === 'sin·sin' && Math.abs(r - 1) < 1e-9) {
                out = fn('cos', linSub(P, Q))
                words = `cos ${T(P)} cos ${T(Q)} + sin ${T(P)} sin ${T(Q)} = ${sumPrint(fn('cos', linSub(P, Q))).text}`
                chip = '\\cos(A - B) = \\cos A\\cos B + \\sin A\\sin B'
              }
              if (out) emit(add(sumOf(others), mul(monoSum(di.rest), out)), `Used the compound angle formula ${words}.`, `Used the compound angle formula ${reverseWords(words)}.`, chip, 'compound-contract')
            }
        // Sum to product: sin A ± sin B, cos A ± cos B.
        if (i < j)
          for (const di of sg[i])
            for (const dj of sg[j]) {
              if (di.pat !== dj.pat || di.rest.key !== dj.rest.key) continue
              const r = dj.rest.c / di.rest.c
              if (Math.abs(Math.abs(r) - 1) > 1e-9) continue
              let A = di.fns[0].a
              let B = dj.fns[0].a
              if (linKey(A) === linKey(B)) continue
              let c = 1
              // Order so that A − B starts with a plus sign; a difference swaps its sign with it.
              if (linSub(A, B)[0][1] < 0) {
                ;[A, B] = [B, A]
                if (r < 0) c = -1
              }
              const half = (x: Lin) => linScale(x, 0.5)
              const S2 = half(linAdd(A, B))
              const D2 = half(linSub(A, B))
              let out: Sum
              let words: string
              let chip: string
              const f = di.pat as Fn
              if (f === 'sin' && r > 0) {
                out = mul(num(2), fn('sin', S2), fn('cos', D2))
                words = `sin ${T(A)} + sin ${T(B)} = 2 sin ${T(S2)} cos ${T(D2)}`
                chip = '\\sin A + \\sin B = 2\\sin\\frac{A+B}{2}\\cos\\frac{A-B}{2}'
              } else if (f === 'sin') {
                out = mul(num(2 * c), fn('cos', S2), fn('sin', D2))
                words = `sin ${T(A)} − sin ${T(B)} = 2 cos ${T(S2)} sin ${T(D2)}`
                chip = '\\sin A - \\sin B = 2\\cos\\frac{A+B}{2}\\sin\\frac{A-B}{2}'
              } else if (r > 0) {
                out = mul(num(2), fn('cos', S2), fn('cos', D2))
                words = `cos ${T(A)} + cos ${T(B)} = 2 cos ${T(S2)} cos ${T(D2)}`
                chip = '\\cos A + \\cos B = 2\\cos\\frac{A+B}{2}\\cos\\frac{A-B}{2}'
              } else {
                out = mul(num(-2 * c), fn('sin', S2), fn('sin', D2))
                words = `cos ${T(A)} − cos ${T(B)} = −2 sin ${T(S2)} sin ${T(D2)}`
                chip = '\\cos A - \\cos B = -2\\sin\\frac{A+B}{2}\\sin\\frac{A-B}{2}'
              }
              emit(add(sumOf(others), mul(monoSum(di.rest), out)), `Used the sum-to-product formula ${words}.`, `Used the product-to-sum formula ${reverseWords(words)}.`, chip, 'sum-to-product')
            }
      }

    // Common denominator.
    const den = new Map<string, Factor>()
    for (const m of S.t)
      for (const x of m.fs)
        if (x.e < 0) {
          const prev = den.get(x.b.key)
          if (!prev || x.e < prev.e) den.set(x.b.key, x)
        }
    if (den.size) {
      const D = sumOf([mono(1, [...den.values()].map((x) => ({ b: x.b, e: -x.e })))])
      const top = add(...S.t.map((m) => mul(monoSum(m), D)))
      emit(div(top, D), 'Put the fractions over a common denominator.', 'Split into separate fractions.', '\\dfrac{a}{b} + \\dfrac{c}{d} = \\dfrac{ad + bc}{bd}', 'common-denominator')
    }

    // Take out a common factor.
    const first = S.t[0]
    const common: Factor[] = []
    for (const x of first.fs) {
      if (x.e <= 0) continue
      let e = x.e
      for (const m of S.t.slice(1)) {
        const y = m.fs.find((z) => z.b.key === x.b.key)
        e = y && y.e > 0 ? Math.min(e, y.e) : 0
      }
      if (e > 0) common.push({ b: x.b, e })
    }
    const g = S.t.every((m) => Number.isInteger(m.c)) ? S.t.reduce((a, m) => gcd(a, m.c), 0) : 1
    if (common.length || g > 1) {
      const cm = mono(g, common)!
      const inner = sumOf(S.t.map((m) => mono(m.c / g, [...m.fs, ...common.map((x) => ({ b: x.b, e: -x.e }))])))
      const cmText = monoPrint(cm).text
      emit(mul(monoSum(cm), inner), `Took out the common factor ${cmText}.`, `Multiplied ${cmText} into the bracket.`, 'ab + ac = a(b + c)', 'factor')
    }
  }

  // Expand every bracket on the top.
  // The chip names the law actually used: cos x (2 cos²x − 1) is multiplied in, not squared out.
  const ex = expand(S)
  const top = Math.max(0, ...S.t.flatMap((m) => m.fs.filter((x) => x.b.k === 's').map((x) => x.e)))
  if (ex.key !== S.key) emit(ex, 'Expanded the brackets.', 'Factorised.', EXPAND_CHIP[top] ?? EXPAND_CHIP[1], 'expand')
}

/** The law used to expand, by the highest power of a bracket: a square, a cube, or a product. */
const EXPAND_CHIP: Record<number, string> = {
  1: 'a(b + c) = ab + ac',
  2: '(a + b)^2 = a^2 + 2ab + b^2',
  3: '(a + b)^3 = a^3 + 3a^2b + 3ab^2 + b^3'
}

/** Rules on one term: double angle backwards, product to sum, split, conjugate, the bottom. */
function monoRules(m: Mono, emit: (s: Sum, fwd: string, rev: string, chip: string, id: string) => void): void {
  // 2 sin u cos u = sin 2u.
  for (const x of m.fs) {
    if (x.b.k !== 'f' || x.b.f !== 'sin' || x.e < 1) continue
    const cosKey = fnBase('cos', x.b.a).key
    const y = m.fs.find((z) => z.b.key === cosKey && z.e >= 1)
    if (!y) continue
    const rest = withoutPowers(m, [
      { key: x.b.key, e: 1 },
      { key: cosKey, e: 1 }
    ])!
    const u = x.b.a
    const w = `2 sin ${T(u)} cos ${T(u)} = sin ${T(linScale(u, 2))}`
    emit(mul(monoSum(rest), num(0.5), fn('sin', linScale(u, 2))), `Used the double angle formula ${w}.`, `Used the double angle formula ${reverseWords(w)}.`, '\\sin 2\\theta = 2\\sin\\theta\\cos\\theta', 'double-contract')
  }
  // Product to sum.
  for (const d of pairs(m)) {
    const [p, q] = d.fns
    if (!(p.f === 'sin' && q.f === 'cos') && !(p.f === 'cos' && q.f === 'cos' && linKey(p.a) < linKey(q.a)) && !(p.f === 'sin' && q.f === 'sin' && linKey(p.a) < linKey(q.a))) continue
    let A = p.a
    let B = q.a
    const flip = linSub(A, B)[0][1] < 0
    if (flip && p.f === q.f) [A, B] = [B, A]
    let out: Sum
    let words: string
    // The chip is the formula for this pair: 2 sin A sin B used to be shown the sin–cos one.
    let chip: string
    if (p.f === 'sin' && q.f === 'cos') {
      out = mul(num(0.5), add(fn('sin', linAdd(A, B)), fn('sin', linSub(A, B))))
      words = flip
        ? `2 sin ${T(A)} cos ${T(B)} = sin ${T(linAdd(A, B))} − sin ${T(linSub(B, A))}`
        : `2 sin ${T(A)} cos ${T(B)} = sin ${T(linAdd(A, B))} + sin ${T(linSub(A, B))}`
      chip = '2\\sin A\\cos B = \\sin(A + B) + \\sin(A - B)'
    } else if (p.f === 'cos') {
      out = mul(num(0.5), add(fn('cos', linSub(A, B)), fn('cos', linAdd(A, B))))
      words = `2 cos ${T(A)} cos ${T(B)} = cos ${T(linSub(A, B))} + cos ${T(linAdd(A, B))}`
      chip = '2\\cos A\\cos B = \\cos(A - B) + \\cos(A + B)'
    } else {
      out = mul(num(0.5), sub(fn('cos', linSub(A, B)), fn('cos', linAdd(A, B))))
      words = `2 sin ${T(A)} sin ${T(B)} = cos ${T(linSub(A, B))} − cos ${T(linAdd(A, B))}`
      chip = '2\\sin A\\sin B = \\cos(A - B) - \\cos(A + B)'
    }
    emit(mul(monoSum(d.rest), out), `Used the product-to-sum formula ${words}.`, `Used the sum-to-product formula ${reverseWords(words)}.`, chip, 'product-to-sum')
  }

  const tops = m.fs.filter((x) => x.b.k === 's' && x.e > 0)
  const bottoms = m.fs.filter((x) => x.e < 0)
  // Split a fraction whose top is one bracket.
  if (tops.length === 1 && tops[0].e === 1 && bottoms.length) {
    const rest = withoutPowers(m, [{ key: tops[0].b.key, e: 1 }])!
    const parts = (tops[0].b as SumBase).s.t.map((t) => mul(monoSum(t), monoSum(rest)))
    emit(add(...parts), 'Split the fraction.', 'Put the fractions over a common denominator.', '\\dfrac{a + b}{c} = \\dfrac{a}{c} + \\dfrac{b}{c}', 'split')
  }
  // Multiply out a bottom made of several brackets.
  const bb = bottoms.filter((x) => x.b.k === 's')
  if (bb.length >= 2 || bb.some((x) => x.e <= -2)) {
    const D = expand(sumOf([mono(1, bb.map((x) => ({ b: x.b, e: -x.e })))]))
    const rest = mono(m.c, m.fs.filter((x) => !(x.b.k === 's' && x.e < 0)))
    emit(div(monoSum(rest), D), 'Multiplied out the bottom.', 'Factorised the bottom.', '(a + b)(a - b) = a^2 - b^2', 'expand-bottom')
  }
  // Multiply top and bottom by the conjugate of a two-term bottom.
  for (const x of bottoms) {
    if (x.b.k !== 's' || x.e !== -1 || x.b.s.t.length !== 2) continue
    const [a, b] = x.b.s.t
    const conj = sumOf([a, { ...b, c: -b.c }])
    const bottom = expand(mul(sumOf([a, b]), conj))
    const rest = withoutPowers(m, [{ key: x.b.key, e: -1 }])!
    const cj = sumPrint(conj).text
    emit(
      div(mul(monoSum(rest), conj), bottom),
      `Multiplied top and bottom by (${cj}), so the bottom became a difference of two squares.`,
      `Cancelled (${cj}) from the top and the bottom.`,
      '(a + b)(a - b) = a^2 - b^2',
      'conjugate'
    )
  }
}

/** Every sum inside s, with a way to put a changed copy back in its place. */
function sumSites(s: Sum, rebuild: (x: Sum) => Sum, out: [Sum, (x: Sum) => Sum][] = []): [Sum, (x: Sum) => Sum][] {
  out.push([s, rebuild])
  s.t.forEach((m, i) => {
    m.fs.forEach((x, j) => {
      if (x.b.k !== 's') return
      const without = mono(m.c, m.fs.filter((_, k) => k !== j))
      const e = x.e
      sumSites(x.b.s, (inner) => rebuild(add(sumOf(s.t.filter((_, k) => k !== i)), mul(monoSum(without), pow(inner, e)))), out)
    })
  })
  return out
}

// Three points for the numeric check of every rewrite (radians, away from the usual poles).
export const CHECK_POINTS: Record<string, number>[] = [
  { x: 0.4137, A: 0.7213, B: 0.2861, θ: 0.5309, t: 0.6113 },
  { x: 1.1071, A: 1.3033, B: 0.5159, θ: 0.9127, t: 1.2291 },
  { x: 2.3789, A: 0.2917, B: 1.9043, θ: 2.0411, t: 2.6931 }
]

export function agrees(a: Sum, b: Sum, points = CHECK_POINTS): boolean {
  let used = 0
  for (const p of points) {
    const va = evaluate(a, p)
    const vb = evaluate(b, p)
    if (!Number.isFinite(va) || !Number.isFinite(vb) || Math.abs(va) > 1e8 || Math.abs(vb) > 1e8) continue
    used++
    if (Math.abs(va - vb) > 1e-9 * Math.max(1, Math.abs(va))) return false
  }
  return used >= 2
}

/**
 * Every rewrite of s one step away, each checked at three points. A rewrite that changes the
 * value is a bug in a rule: strict (the tests) throws, otherwise the rewrite is dropped — either
 * way it never reaches a student as a "step".
 */
const tidyWords = (w: string): string =>
  w.replace(/\b(sin|cos|tan|cot|sec|cosec)([²³⁴]?) \(/g, '$1$2(').replace(/\b(sin|cos|tan|cot|sec|cosec)([²³⁴])(\d)/g, '$1$2 $3')

const QUIET_CANCEL = new Set(['common-denominator', 'split', 'conjugate', 'expand-bottom', 'to-sincos', 'from-sincos', 'factor'])

export function rewrites(s: Sum, targets: Set<string>, strict = true): Rewrite[] {
  const out: Rewrite[] = []
  const seen = new Set<string>([s.key])
  const push = (n: Sum, fwd: string, rev: string, chip: string, id: string) => {
    const cancelled = [...CANCELLED.values()]
    CANCELLED.clear()
    if (seen.has(n.key)) return
    fwd = tidyWords(fwd)
    rev = tidyWords(rev)
    // Say what cancelled, except where cancelling is the rule itself (common denominator, split).
    if (cancelled.length && !QUIET_CANCEL.has(id)) {
      const names = cancelled.map((b) => (b.k === 'f' ? fnText(b.f, b.a, 1) : `(${sumPrint(b.s).text})`))
      fwd = `${fwd.replace(/\.$/, '')}, then cancelled ${names.join(' and ')}.`
    }
    if (!agrees(s, n)) {
      // Strict (the tests): a rule that changes the value is a bug and must be seen. Otherwise
      // the step is simply not offered — a numeric false alarm must never end a student's proof.
      if (strict) throw new Error(`Rule "${id}" (${fwd}) changed the value of ${sumPrint(s).text}: it gave ${sumPrint(n).text}.`)
      return
    }
    seen.add(n.key)
    out.push({ s: n, fwd, rev, chip, id })
  }
  const tryN = (fn: () => void) => {
    try {
      fn()
    } catch (e) {
      // Only a real division by zero (a rule meeting 0 in a bottom) is skipped; a wrong rule is not.
      if (!(e instanceof Error) || e.message !== 'division by zero') throw e
    }
  }
  CANCELLED.clear()
  for (const [site, rebuild] of sumSites(s, (x) => x)) {
    tryN(() => sumRules(site, (n, f, r, c, id) => push(rebuild(n), f, r, c, id)))
    site.t.forEach((m, i) => {
      const others = sumOf(site.t.filter((_, k) => k !== i))
      tryN(() => monoRules(m, (n, f, r, c, id) => push(rebuild(add(others, n)), f, r, c, id)))
    })
  }
  tryN(() => globalRules(s, targets, push))
  return out
}
