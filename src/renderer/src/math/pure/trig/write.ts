// Trig-identity proofs (math/pure/trigIdentity.ts says how they work): printing the canonical form in a student's notation.
// Out of trigIdentity.ts as a pure move (CLEANUP-PLAN.md CW10d).

import { type Fn, gcd, type Lin, type Mono, type Sum, sumBase, type SumBase, sumOf } from './canonical'

// ---------------------------------------------------------------------------------------------
// Printing, in a student's notation: sin²x, sin 2x, sin(A + B), cosec x, (1 − sin x)/cos x
// ---------------------------------------------------------------------------------------------

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }
export const sup = (n: number): string => String(n).split('').map((d) => SUP[d] ?? d).join('')
export const MINUS = '−'

/** A rational p/q for a coefficient that came from halving and doubling (q ≤ 12). */
export function ratio(v: number): [number, number] {
  for (let q = 1; q <= 12; q++) {
    const p = Math.round(v * q)
    if (Math.abs(p / q - v) < 1e-9) return [p, q]
  }
  return [v, 1]
}

export function linParts(a: Lin): { top: string; topTex: string; den: number; single: boolean } {
  // A zero angle is a number, not an empty argument: cos 0, never cos().
  if (a.length === 0) return { top: '0', topTex: '0', den: 1, single: true }
  // With π in it, each term is written on its own, in the order given (a positive one first):
  // π/2 − x, x − π/2, 3π/2 + x, cos π.
  if (a.some(([v]) => v === 'π')) {
    const terms = a[0][1] > 0 ? a : [...a.filter(([, c]) => c > 0), ...a.filter(([, c]) => c < 0)]
    let top = ''
    let topTex = ''
    terms.forEach(([v, c], i) => {
      const [p, q] = ratio(Math.abs(c))
      const mag = p === 1 ? '' : String(p)
      const den = q === 1 ? '' : `/${q}`
      const sign = i === 0 ? (c < 0 ? MINUS : '') : c < 0 ? ` ${MINUS} ` : ' + '
      top += `${sign}${mag}${v}${den}`
      topTex += `${sign.replace(MINUS, '-')}${mag}${v === 'π' ? '\\pi' : v === 'θ' ? '\\theta' : v}${den}`
    })
    return { top, topTex, den: 1, single: terms.length === 1 && !top.includes('/') }
  }
  const den = a.reduce((d, [, c]) => {
    const q = ratio(c)[1]
    return (d * q) / gcd(d, q)
  }, 1)
  let top = ''
  let topTex = ''
  a.forEach(([v, c], i) => {
    const k = ratio(c * den)[0]
    const mag = Math.abs(k) === 1 ? '' : String(Math.abs(k))
    const sign = i === 0 ? (k < 0 ? MINUS : '') : k < 0 ? ` ${MINUS} ` : ' + '
    top += `${sign}${mag}${v}`
    topTex += `${i === 0 ? (k < 0 ? '-' : '') : k < 0 ? ' - ' : ' + '}${mag}${v === 'θ' ? '\\theta' : v}`
  })
  return { top, topTex, den, single: a.length === 1 }
}

export function fnText(f: Fn, a: Lin, e: number): string {
  const name = f === 'csc' ? 'cosec' : f
  const p = e === 1 ? '' : sup(e)
  const { top, den, single } = linParts(a)
  // sin²x, but sin² 2x: a power runs straight into a letter, not into a number.
  // (An angle typed with a leading minus, sin(−x), keeps its brackets.)
  if (den === 1 && single && !top.startsWith(MINUS)) return p && /^[A-Za-zθ]/.test(top) ? `${name}${p}${top}` : `${name}${p} ${top}`
  const argText = den === 1 ? top : single ? `${top}/${den}` : `(${top})/${den}`
  return `${name}${p}(${argText})`
}
/**
 * An angle with a denominator is set as a fraction, sin(x/2) as a small x over 2 — except above or
 * below a fraction bar, where a second bar would be a fraction inside a fraction
 * (tests/stepTruth.test.ts flags it); there the angle is written on one line, sin(x/2).
 */
export function fnTex(f: Fn, a: Lin, e: number, inBar = false): string {
  const name = f === 'csc' ? '\\operatorname{cosec}' : `\\${f}`
  const p = e === 1 ? '' : `^{${e}}`
  const { topTex, den, single } = linParts(a)
  if (den === 1 && single && !topTex.startsWith('-')) return `${name}${p} ${topTex}`
  if (den === 1) return `${name}${p}\\left(${topTex}\\right)`
  if (inBar) return `${name}${p}\\left(${single ? topTex : `(${topTex})`}/${den}\\right)`
  return `${name}${p}\\left(\\frac{${topTex}}{${den}}\\right)`
}

export interface Printed {
  text: string
  tex: string
  /**
   * A bracketed sum to the first power, as TeX without its brackets. A fraction bar already
   * groups what stands above and below it, so a whole denominator in brackets is rough writing
   * (tests/stepTruth.test.ts flags it); alone over a bar the sum goes bare.
   */
  bare?: string
}

function monoParts(m: Mono, inBar: boolean): { num: Printed[]; den: Printed[]; p: number; q: number } {
  const [p, q] = ratio(Math.abs(m.c))
  const numP: Printed[] = []
  const denP: Printed[] = []
  for (const x of m.fs) {
    const e = Math.abs(x.e)
    const into = x.e > 0 ? numP : denP
    if (x.b.k === 'f') into.push({ text: fnText(x.b.f, x.b.a, e), tex: fnTex(x.b.f, x.b.a, e, inBar) })
    else {
      const inner = sumPrint(x.b.s, inBar)
      into.push({
        text: `(${inner.text})${e === 1 ? '' : sup(e)}`,
        tex: `\\left(${inner.tex}\\right)${e === 1 ? '' : `^{${e}}`}`,
        bare: e === 1 ? inner.tex : undefined
      })
    }
  }
  return { num: numP, den: denP, p, q }
}

/** A term without its sign. */
export function monoPrint(m: Mono, inBar = false): Printed {
  const bar = inBar || ratio(Math.abs(m.c))[1] !== 1 || m.fs.some((x) => x.e < 0)
  const { num: n, den: d, p, q } = monoParts(m, bar)
  const numText = [p === 1 && n.length ? '' : String(p), ...n.map((x) => x.text)].filter(Boolean)
  const numTex = [p === 1 && n.length ? '' : String(p), ...n.map((x) => x.tex)].filter(Boolean)
  const denText = [q === 1 ? '' : String(q), ...d.map((x) => x.text)].filter(Boolean)
  const denTex = [q === 1 ? '' : String(q), ...d.map((x) => x.tex)].filter(Boolean)
  // Textbook spacing: "2 sin x cos x", but "2(1 + sin x)" and "sin x (1 + cos x)".
  const join = (parts: string[]): string => parts.reduce((acc, s, i) => (i === 0 ? s : /^\d+$/.test(parts[i - 1]) && s.startsWith('(') ? acc + s : `${acc} ${s}`), '')
  const numS = join(numText)
  if (denText.length === 0) return { text: numS, tex: numTex.join(' ') }
  const wrap = (s: string, parts: number): string => (parts > 1 ? `(${s})` : s)
  // Over a bar, a lone bracketed sum loses its brackets: (1 − sin x)/cos x is set as a plain fraction.
  const overBar = (tex: string[], parts: Printed[]): string =>
    tex.length === 1 && parts.length === 1 && parts[0].bare !== undefined ? parts[0].bare : tex.join(' ')
  return {
    text: `${wrap(numS, numText.length)}/${wrap(join(denText), denText.length)}`,
    tex: `\\dfrac{${overBar(numTex, n)}}{${overBar(denTex, d)}}`
  }
}

/** A sum with its positive terms first, so "1 − sin²x" never prints as "−sin²x + 1". */
export function sumPrint(s: Sum, inBar = false): Printed {
  if (s.t.length === 0) return { text: '0', tex: '0' }
  const pk = (m: Mono): string => m.fs.map((x) => `${x.b.sort}^${9 - x.e}`).join(',')
  const byPk = (p: Mono, q: Mono): number => (pk(p) < pk(q) ? -1 : pk(p) > pk(q) ? 1 : 0)
  // A line of only negative terms turns one of them round, the one with the smallest number in
  // front: "−2 cos x (1 − cos²x) − cos x (1 − 2 cos²x)" reads as a textbook writes it,
  // "cos x (2 cos²x − 1) − 2 cos x (1 − cos²x)". A lone term, −(1 − sin x), always turns.
  const oddBracket = (m: Mono): number => m.fs.findIndex((x) => x.b.k === 's' && x.e % 2 !== 0)
  const turnable = s.t.filter((m) => m.c < 0 && oddBracket(m) >= 0)
  const turn = s.t.every((m) => m.c < 0) && turnable.length ? turnable.reduce((a, b) => (Math.abs(b.c) < Math.abs(a.c) ? b : a)) : null
  const shown = s.t.map((m): Mono => {
    const j = oddBracket(m)
    if (m.c >= 0 || j < 0 || (s.t.length > 1 && m !== turn)) return m
    const x = m.fs[j] as { b: SumBase; e: number }
    const flipped = sumOf(x.b.s.t.map((t) => ({ ...t, c: -t.c })))
    return { ...m, c: -m.c, fs: m.fs.map((y, k) => (k === j ? { b: sumBase(flipped), e: y.e } : y)) }
  })
  const ordered = [...shown.filter((m) => m.c > 0).sort(byPk), ...shown.filter((m) => m.c < 0).sort(byPk)]
  let text = ''
  let tex = ''
  ordered.forEach((m, i) => {
    const pm = monoPrint(m, inBar)
    if (i === 0) {
      text = (m.c < 0 ? MINUS : '') + pm.text
      tex = (m.c < 0 ? '-' : '') + pm.tex
    } else {
      text += m.c < 0 ? ` ${MINUS} ${pm.text}` : ` + ${pm.text}`
      tex += m.c < 0 ? ` - ${pm.tex}` : ` + ${pm.tex}`
    }
  })
  return { text, tex }
}
