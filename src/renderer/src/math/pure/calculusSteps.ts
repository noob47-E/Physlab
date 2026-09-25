// Calculus working: turns the rule trees the SymPy worker sends (ops `integral_steps` and
// `diff_steps` in workers/cas.worker.ts) into textbook working a student can follow and check.
//
// The worker does the maths and prints every expression the way a book does (sin x, ln|x − 1|,
// ½ ln x). This file only arranges those pieces into lines — "∫3x² dx = 3∫x² dx = 3·x³/3 + C =
// x³ + C" — and never re-derives anything, so a line can only be as wrong as the pieces SymPy
// computed. Every line is an equation whose sides are equal (up to the constant C for an
// integral); tests/calculusSteps.test.ts checks that numerically for every recorded fixture.
//
// Two decisions from the spec (S-Q §1): the rule tree is SymPy's own `integral_steps` (bundled
// SymPy 1.14, dataclass rules), not a copy of SymPy Gamma's formatter; and calculus is worked in
// radians even in DEG mode, with one sentence saying so.

import { Steps, type Answer, type Working } from './work'
import { rEq, rMul, rSub, rTex, rat, R1, type Rat } from './rat'
import { texPrecise, type DigitSettings } from '../format'

/** One expression as the worker prints it: LaTeX to show, SymPy text to read back. */
export interface TexText {
  latex: string
  text: string
}

/**
 * One node of SymPy's `integral_steps` tree, serialised over its dataclass fields. Only the fields
 * this file reads are named; a rule SymPy adds later arrives whole and is refused politely.
 */
export interface IntegralRule {
  rule: string
  integrand: TexText | null
  variable: TexText | null
  /** The node's antiderivative (no + C), with ln|u| where integration made the log. */
  result?: TexText
  constant?: TexText
  other?: TexText
  substep?: IntegralRule | null
  substeps?: IntegralRule[]
  alternatives?: IntegralRule[]
  u_var?: TexText
  u_func?: TexText
  u?: TexText
  dv?: TexText
  v_step?: IntegralRule | null
  second_step?: IntegralRule | null
  parts_rules?: IntegralRule[]
  coefficient?: TexText
  rewritten?: TexText
  base?: TexText
  exp?: TexText
  a?: TexText
  b?: TexText
  c?: TexText
  /** Added by the worker: du/dx for a substitution or for u in integration by parts. */
  du?: TexText | TexText[]
  /** Added by the worker for cyclic parts: the u·v terms before solving for I. */
  terms?: TexText
  /** Added by the worker to a substitution that completes a square: the integrand as (x + 1)² + 4. */
  square?: TexText
  /** Added by the worker for a rewrite: which kind, so the heading can say what was done. */
  kind?: 'partial' | 'complete_square' | 'rewrite'
}

/** The worker's whole reply to `integral_steps`. */
export interface IntegralTree {
  var: string
  integrand: TexText
  /** SymPy found no rule tree (or it contains a "don't know"): the answer comes from integrate(). */
  unsupported: boolean
  /** False when SymPy could not integrate at all and handed the integral back. */
  closed: boolean
  raw_latex: string
  raw_text: string
  answer_latex: string
  answer_text: string
  /** d/dx of the answer simplified back to the integrand. */
  checked: boolean
  /** DEG mode was on; the worker worked in radians anyway. */
  deg_ignored: boolean
  tree?: IntegralRule
  definite?: {
    lower: TexText
    upper: TexText
    value: TexText
    numeric: { re: number; im?: number } | null
    F_lower?: TexText
    F_upper?: TexText
    /** F(b) − F(a) equals the definite integral (false when the function breaks between the limits). */
    agrees?: boolean
    /** SymPy's value is nan or zoo: the integral has no value at all (∫₋₁¹ 1/x dx). */
    diverges?: boolean
    /** SymPy's value is ∞ or −∞: an infinite area (∫₋₁¹ 1/x² dx). */
    infinite?: boolean
  }
  error?: string
}

export type DerivRuleName =
  | 'constant'
  | 'x'
  | 'sum'
  | 'constant_multiple'
  | 'product'
  | 'quotient'
  | 'chain'
  | 'power'
  | 'exp_base'
  | 'exp'
  | 'log'
  | 'sin'
  | 'cos'
  | 'tan'
  | 'sec'
  | 'csc'
  | 'cot'
  | 'asin'
  | 'acos'
  | 'atan'
  | 'acot'
  | 'sinh'
  | 'cosh'
  | 'tanh'

/** One node of the worker's derivative walk (`diff_steps`). */
export interface DerivRule {
  rule: DerivRuleName
  expr: TexText
  /** The derivative, written in the order the rule produces it (f′g + fg′, not SymPy's order). */
  result: TexText
  /**
   * Sum only, when its terms combine: the term-by-term sum before it was worked out, as
   * (1 + ln x) − 1 before ln x. The result is then the worked-out sum.
   */
  shown?: TexText
  substeps?: DerivRule[]
  constant?: TexText
  other?: TexText
  exp?: TexText
  base?: TexText
  numerator?: TexText
  denominator?: TexText
  /** Quotient rule: g f′ − f g′ multiplied out, and then factorised. */
  expanded?: TexText
  top?: TexText
  /** Chain rule: the outside rule, the inside u, the outside as a function of u and its derivative. */
  outer?: DerivRuleName
  u?: TexText
  /** Chain rule: the letter this inside is called (u, then w for the next inside out, …). */
  letter?: string
  outer_expr?: TexText
  outer_derivative?: TexText
  outer_at_inner?: TexText
}

/** The worker's whole reply to `diff_steps`. */
export interface DerivTree {
  var: string
  expr: TexText
  /** The letter the chain rule calls the inside (u, or the first letter the question does not use). */
  u: string
  /** The letters free for the chain rule's insides, in the order they are handed out. */
  letters?: string[]
  deg_ignored: boolean
  tree?: DerivRule
  unsupported: boolean
  answer_latex: string
  answer_text: string
  checked: boolean
  error?: string
}

/** Shown when the answer is known but no rule tree could be explained. */
export const NO_STEPS = 'PhysLab can give the answer but not the steps for this one.'

/** Decision 2 of the spec: the sentence DEG mode gets. */
export const RADIANS_NOTE =
  'Calculus is worked in radians, even in DEG mode: in degrees every line would carry a factor of π/180.'

// ---------------------------------------------------------------------------------------------
// Writing LaTeX pieces together
// ---------------------------------------------------------------------------------------------

/** True when `tex` has a + or − between terms at the top level (so it needs brackets to be multiplied). */
export function isSum(tex: string): boolean {
  let depth = 0
  const s = tex.trim()
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (s.startsWith('\\left', i)) {
      depth++
      i += 4
      continue
    }
    if (s.startsWith('\\right', i)) {
      depth--
      i += 5
      continue
    }
    if (ch === '{' || ch === '(' || ch === '[') depth++
    else if (ch === '}' || ch === ')' || ch === ']') depth--
    else if (depth === 0 && (ch === '+' || ch === '-') && s.slice(0, i).trim() !== '') return true
  }
  return false
}

const isNeg = (tex: string): boolean => tex.trim().startsWith('-')

/** Brackets a factor when multiplying it would change its meaning: a sum or a negative. */
export function br(tex: string): string {
  const t = tex.trim()
  return isSum(t) || isNeg(t) ? `\\left(${t}\\right)` : t
}

/** a × b as a book writes it: juxtaposed, with a dot only where two numbers would run together. */
export function times(a: string, b: string): string {
  const A = br(a)
  const B = br(b)
  if (A === '1') return B
  if (B === '1' && !/^[0-9]/.test(A)) return `${A} \\cdot 1`
  // A plain factor goes in front of a function, as a book writes x ln x: "ln x x" reads as the
  // log of x².
  // The same for a plain fraction: x²/2 ln x, never ln x x²/2.
  if (/^\\(ln|sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|operatorname)\b/.test(A) && /^(\\frac)?[0-9A-Za-z^{}\s]+$/.test(B)) return `${B} ${A}`
  // A dot where two numbers would run together (3 · x³/3, ½ · x²/2 — two fractions side by side
  // read as a mixed number), or after a function whose argument has no brackets, since "sin x x²"
  // reads as the sine of x·x².
  if (
    /^[0-9.]/.test(B) ||
    ((/[0-9]$/.test(A) || /\\frac\{[^{}]*\}\{[^{}]*\}$/.test(A)) && /^\\frac/.test(B)) ||
    /\\[a-z]+(\^\{[^}]*\})? \{[^{}]*\}$/.test(A)
  )
    return `${A} \\cdot ${B}`
  return `${A} ${B}`
}

/** a − b and a + b with the sign of b folded in: never "+ −" (Fix 4's rule). */
export function plus(a: string, b: string): string {
  const t = b.trim()
  if (!a.trim()) return t
  return isNeg(t) ? `${a} - ${t.replace(/^-\s*/, '')}` : `${a} + ${t}`
}

export function minus(a: string, b: string): string {
  const t = b.trim()
  if (isSum(t)) return `${a} - \\left(${t}\\right)`
  return isNeg(t) ? `${a} + ${t.replace(/^-\s*/, '')}` : `${a} - ${t}`
}

/** −F, with the sign folded into F when F already carries one. */
export function negate(f: string): string {
  const t = f.trim()
  if (isSum(t)) return `-\\left(${t}\\right)`
  return isNeg(t) ? t.replace(/^-\s*/, '') : `-${t}`
}

/** a × b with the signs of both pulled to the front: 2x · (−cos x) is −2x cos x. */
export function timesSigned(a: string, b: string): string {
  const na = isNeg(a) && !isSum(a)
  const nb = isNeg(b) && !isSum(b)
  const prod = times(na ? negate(a) : a, nb ? negate(b) : b)
  return na !== nb ? negate(prod) : prod
}

/** c·F: "3 · x³/3", "−2 sin x", "½ (F)"; a negative constant puts its sign in front. */
function scale(c: string, f: string): string {
  const k = c.trim()
  if (k === '1') return f
  if (k === '-1') return negate(f)
  return timesSigned(k, f)
}

const d = (v: string): string => `\\,d${v}`

/**
 * The worker's name for the variable, as maths: theta is \theta, and lamda (SymPy's spelling, since
 * lambda is a word Python keeps for itself) is \lambda. "d/dtheta" and "dalpha" were written out in
 * letters (GLM #25).
 */
export function varTex(name: string): string {
  if (name === 'lamda') return '\\lambda'
  return /^(?:alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|rho|sigma|tau|upsilon|phi|chi|psi|omega)$/.test(name) ? `\\${name}` : name
}
const same = (a: string, b: string): boolean => a.replace(/\s+/g, '') === b.replace(/\s+/g, '')

/** ∫ f dv, with the integrand bracketed when it is a sum. */
function integral(f: string, v: string): string {
  const t = f.trim()
  if (t === '1') return `\\int d${v}`
  return `\\int ${isSum(t) ? `\\left(${t}\\right)` : t}${d(v)}`
}

/** Chains "a = b = c", dropping a side identical to the one before it. */
function chain(...sides: string[]): string {
  const out: string[] = []
  for (const s of sides) if (!out.length || !same(out[out.length - 1], s)) out.push(s)
  return out.join(' = ')
}

const withC = (f: string): string => (same(f, '0') ? 'C' : `${f} + C`)

/** A small exact number from SymPy's text, or null when it is not a plain fraction. */
function ratOf(text: string | undefined): Rat | null {
  const m = text?.trim().match(/^(-?\d+)(?:\/(\d+))?$/)
  return m ? rat(BigInt(m[1]), BigInt(m[2] ?? '1')) : null
}

// ---------------------------------------------------------------------------------------------
// Integrals
// ---------------------------------------------------------------------------------------------

/** Rules answered by one standard result: each is one line of working. */
const INT_ATOMIC: Record<string, { head: string; chip?: (v: string, n: IntegralRule) => string | undefined }> = {
  ConstantRule: { head: 'Integrated a constant: it is multiplied by the variable.', chip: (v) => `\\int k${d(v)} = k${v} + C` },
  PowerRule: {
    head: 'Used the power rule: raised the power by one and divided by the new power.',
    chip: (v) => `\\int ${v}^{n}${d(v)} = \\frac{${v}^{n+1}}{n+1} + C,\\ n \\ne -1`
  },
  NestedPowRule: { head: 'Used the power rule.', chip: (v) => `\\int ${v}^{n}${d(v)} = \\frac{${v}^{n+1}}{n+1} + C` },
  ExpRule: {
    head: 'Used the exponential rule.',
    chip: (v, n) =>
      n.base?.text === 'E' ? `\\int e^{${v}}${d(v)} = e^{${v}} + C` : `\\int a^{${v}}${d(v)} = \\frac{a^{${v}}}{\\ln a} + C`
  },
  ReciprocalRule: {
    head: 'Used the reciprocal rule: the integral of one over something whose derivative is 1 is the log of its size.',
    chip: (v) => `\\int \\frac{1}{${v}}${d(v)} = \\ln\\left|${v}\\right| + C`
  },
  SinRule: { head: 'Used the standard result for sine.', chip: (v) => `\\int \\sin ${v}${d(v)} = -\\cos ${v} + C` },
  CosRule: { head: 'Used the standard result for cosine.', chip: (v) => `\\int \\cos ${v}${d(v)} = \\sin ${v} + C` },
  Sec2Rule: { head: 'Used the standard result: sec² is the derivative of tan.', chip: (v) => `\\int \\sec^{2} ${v}${d(v)} = \\tan ${v} + C` },
  Csc2Rule: { head: 'Used the standard result: cosec² is minus the derivative of cot.', chip: (v) => `\\int \\csc^{2} ${v}${d(v)} = -\\cot ${v} + C` },
  SecTanRule: { head: 'Used the standard result: sec tan is the derivative of sec.', chip: (v) => `\\int \\sec ${v}\\tan ${v}${d(v)} = \\sec ${v} + C` },
  CscCotRule: {
    head: 'Used the standard result: cosec cot is minus the derivative of cosec.',
    chip: (v) => `\\int \\csc ${v}\\cot ${v}${d(v)} = -\\csc ${v} + C`
  },
  SinhRule: { head: 'Used the standard result for sinh.', chip: (v) => `\\int \\sinh ${v}${d(v)} = \\cosh ${v} + C` },
  CoshRule: { head: 'Used the standard result for cosh.', chip: (v) => `\\int \\cosh ${v}${d(v)} = \\sinh ${v} + C` },
  ArctanRule: {
    head: 'Used the standard result for one over a sum of squares.',
    chip: (v, n) =>
      n.a?.text === '1' && n.b?.text === '1' && n.c?.text === '1'
        ? `\\int \\frac{1}{1 + ${v}^{2}}${d(v)} = \\tan^{-1} ${v} + C`
        : `\\int \\frac{1}{a^{2} + ${v}^{2}}${d(v)} = \\frac{1}{a}\\tan^{-1}\\frac{${v}}{a} + C`
  },
  ArcsinRule: {
    head: 'Used the standard result for one over the square root of one minus a square.',
    chip: (v) => `\\int \\frac{1}{\\sqrt{1 - ${v}^{2}}}${d(v)} = \\sin^{-1} ${v} + C`
  },
  ArcsinhRule: {
    head: 'Used the standard result for one over the square root of one plus a square.',
    chip: (v) => `\\int \\frac{1}{\\sqrt{1 + ${v}^{2}}}${d(v)} = \\sinh^{-1} ${v} + C`
  },
  ReciprocalSqrtQuadraticRule: { head: 'Used a standard result from the table of integrals.' },
  SqrtQuadraticRule: { head: 'Used a standard result from the table of integrals.' },
  DerivativeRule: { head: 'The expression is the derivative of something, so integrating undoes it.' }
}

/** Rules this file can put into words; anything else (erf, Si, Heaviside, …) gets the answer only. */
const INT_KNOWN = new Set([
  ...Object.keys(INT_ATOMIC),
  'ConstantTimesRule',
  'AddRule',
  'URule',
  'PartsRule',
  'CyclicPartsRule',
  'RewriteRule',
  'CompleteSquareRule',
  'AlternativeRule'
])

class Unexplained extends Error {}

const lat = (t: TexText | null | undefined): string => {
  if (!t) throw new Unexplained()
  return t.latex
}
const vOf = (n: IntegralRule, fallback: string): string => n.variable?.latex ?? fallback

/** Every rule in the tree is one this file can explain. */
function explainable(n: IntegralRule | null | undefined): boolean {
  if (!n) return true
  if (n.rule === 'AlternativeRule') {
    const alt = pickAlternative(n)
    return alt !== undefined && explainable(alt)
  }
  if (!INT_KNOWN.has(n.rule)) return false
  const kids = [n.substep, n.v_step, n.second_step, ...(n.substeps ?? []), ...(n.parts_rules ?? [])]
  return kids.every(explainable)
}

/** How many rules a tree holds: the length of the working it would give, roughly. */
function size(n: IntegralRule | null | undefined): number {
  if (!n) return 0
  if (n.rule === 'AlternativeRule') {
    const alt = pickAlternative(n)
    return alt ? size(alt) : 0
  }
  const kids = [n.substep, n.v_step, n.second_step, ...(n.substeps ?? []), ...(n.parts_rules ?? [])]
  return 1 + kids.reduce((t, k) => t + size(k), 0)
}

/**
 * Which of SymPy's alternative ways a book would take. SymPy lists them in the order it found
 * them, and for ∫x ln x dx the first is "substitute u = ln x, then parts" over thirteen moves,
 * where every book does one integration by parts. So: one this file can explain; integration by
 * parts when it is on offer at the top; otherwise the shortest.
 */
function pickAlternative(n: IntegralRule): IntegralRule | undefined {
  const all = n.alternatives ?? []
  const known = all.filter(explainable)
  const pool = known.length ? known : all
  const parts = pool.find((a) => a.rule === 'PartsRule')
  if (parts) return parts
  let best: IntegralRule | undefined
  for (const a of pool) if (!best || size(a) < size(best)) best = a
  return best
}

/**
 * The shape a book uses rather than the one SymPy found. SymPy takes the 2 out of ∫2x cos(x²) dx
 * and then puts ½ back inside the substitution; a book lets du = 2x dx absorb it. Alternatives
 * are resolved to the one a book would take (pickAlternative).
 */
function normalise(n: IntegralRule): IntegralRule {
  if (n.rule === 'AlternativeRule') {
    const alt = pickAlternative(n)
    if (alt) return normalise({ ...alt, integrand: n.integrand })
  }
  if (n.rule === 'ConstantTimesRule' && n.substep) {
    const inner = normalise(n.substep)
    const k = inner.rule === 'URule' && inner.substep?.rule === 'ConstantTimesRule' ? inner.substep : null
    const c1 = ratOf(n.constant?.text)
    const c2 = ratOf(k?.constant?.text)
    if (k?.substep && c1 && c2 && rEq(rMul(c1, c2), R1)) {
      return { ...inner, integrand: n.integrand, result: n.result, substep: normalise(k.substep) }
    }
    return { ...n, substep: inner }
  }
  const out: IntegralRule = { ...n }
  if (n.substep) out.substep = normalise(n.substep)
  if (n.substeps) out.substeps = n.substeps.map(normalise)
  if (n.v_step) out.v_step = normalise(n.v_step)
  if (n.second_step) out.second_step = normalise(n.second_step)
  return out
}

/** Answered in one line: a standard result, a constant times one, or a sum of them. */
function simple(n: IntegralRule): boolean {
  if (n.rule in INT_ATOMIC) return true
  if (n.rule === 'ConstantTimesRule') return !!n.substep && n.substep.rule !== 'AddRule' && simple(n.substep)
  if (n.rule === 'AddRule') return (n.substeps ?? []).every((k) => k.rule !== 'AddRule' && simple(k))
  return false
}

/** The one standard result behind a simple node, when there is exactly one. */
function chipOf(n: IntegralRule): string | undefined {
  const v = vOf(n, 'x')
  if (n.rule in INT_ATOMIC) return INT_ATOMIC[n.rule].chip?.(v, n)
  if (n.rule === 'ConstantTimesRule' && n.substep) return chipOf(n.substep)
  if (n.rule === 'AddRule') {
    const chips = new Set((n.substeps ?? []).map(chipOf))
    return chips.size === 1 ? [...chips][0] : undefined
  }
  return undefined
}

function headOf(n: IntegralRule): string {
  if (n.rule in INT_ATOMIC) return INT_ATOMIC[n.rule].head
  if (n.rule === 'ConstantTimesRule' && n.substep) {
    const inner = headOf(n.substep).replace(/^Used/, 'used').replace(/^Integrated/, 'integrated').replace(/^The /, 'the ')
    return `Took the constant outside the integral and ${inner}`
  }
  return 'Integrated term by term: the integral of a sum is the sum of the integrals.'
}

/** ∫(f + g − h) dx written as ∫f dx + ∫g dx − ∫h dx. */
function termIntegrals(n: IntegralRule, v: string): string {
  let out = ''
  for (const k of n.substeps ?? []) {
    const f = lat(k.integrand)
    if (k.rule === 'ConstantTimesRule' && k.constant?.text === '-1') out = out ? `${out} - ${integral(lat(k.other), v)}` : `-${integral(lat(k.other), v)}`
    else if (isNeg(f)) out = out ? `${out} - ${integral(f.trim().replace(/^-\s*/, ''), v)}` : `-${integral(f.trim().replace(/^-\s*/, ''), v)}`
    else out = out ? `${out} + ${integral(f, v)}` : integral(f, v)
  }
  return out
}

/** The mechanical middle of a simple node's line: 3 · x³/3, or F + G − H before tidying. */
function shownOf(n: IntegralRule): string {
  if (n.rule === 'ConstantTimesRule' && n.substep) return scale(lat(n.constant), shownOf(n.substep))
  if (n.rule === 'AddRule') return (n.substeps ?? []).map(shownOf).reduce((a, b) => plus(a, b), '')
  return lat(n.result)
}

/** The sides of a simple node after "∫ f dx =": the constant taken out, term by term, the result. */
function simpleSides(n: IntegralRule, v: string): string[] {
  const res = lat(n.result)
  if (n.rule === 'ConstantTimesRule' && n.substep) {
    const c = lat(n.constant)
    const other = lat(n.other)
    const pulled = c === '-1' ? `-${integral(other, v)}` : `${c} ${integral(other, v)}`
    return [pulled, withC(shownOf(n)), withC(res)]
  }
  if (n.rule === 'AddRule') return [termIntegrals(n, v), withC(shownOf(n)), withC(res)]
  return [withC(res)]
}

/**
 * Explains `∫ n.integrand d(var) = n.result + C` as moves, and returns the result. Simple nodes
 * are one line; the others lay out their method and explain their pieces first.
 */
function explainIntegral(n: IntegralRule, s: Steps, from?: string): string {
  const v = vOf(n, 'x')
  const f = lat(n.integrand)
  const res = lat(n.result)
  // The integral this node's first line starts from: its own, or — after a rewrite — the
  // student's original one, so the working reads as one unbroken chain.
  const lhs = from ?? integral(f, v)
  if (simple(n)) {
    s.add(headOf(n), chain(lhs, ...simpleSides(n, v)), chipOf(n))
    return res
  }
  switch (n.rule) {
    case 'ConstantTimesRule': {
      const sub = n.substep
      if (!sub) throw new Unexplained()
      const c = lat(n.constant)
      const pulled = c === '-1' ? `-${integral(lat(n.other), v)}` : `${c} ${integral(lat(n.other), v)}`
      s.add('Took the constant outside the integral.', chain(lhs, pulled), `\\int k f${d(v)} = k\\int f${d(v)}`)
      const inner = explainIntegral(sub, s)
      s.add('Multiplied the result by the constant.', chain(pulled, withC(scale(c, inner)), withC(res)))
      return res
    }
    case 'AddRule': {
      s.goal('Integrate term by term')
      s.add('Split the integral into one integral per term.', chain(lhs, termIntegrals(n, v)), `\\int (f + g)${d(v)} = \\int f${d(v)} + \\int g${d(v)}`)
      for (const k of n.substeps ?? []) if (!simple(k)) explainIntegral(k, s)
      s.add('Added the pieces.', chain(termIntegrals(n, v), withC(shownOf(n)), withC(res)))
      return res
    }
    case 'URule': {
      const sub = n.substep
      if (!sub) throw new Unexplained()
      const u = lat(n.u_var)
      const du = Array.isArray(n.du) ? undefined : n.du
      if (!du) throw new Unexplained()
      const g = lat(n.u_func)
      // 1/(x² + 2x + 5): the square is completed first, (x + 1)² + 4, and u = x + 1 comes out of it.
      const from = n.square ? integral(n.square.latex, v) : lhs
      if (n.square) {
        s.goal('Complete the square')
        s.add('Completed the square in the bottom, so that it becomes a square plus a number.', chain(lhs, from))
      }
      s.goal('Substitute')
      s.add(
        `Put ${u} equal to the inside, so that d${u} takes care of the rest of the integrand.`,
        `${u} = ${g},\\quad d${u} = ${same(du.latex, '1') ? `d${v}` : `${du.latex}${d(v)}`}`,
        `\\int f(g(${v}))\\,g'(${v})${d(v)} = \\int f(${u})\\,d${u}`
      )
      const h = lat(sub.integrand)
      s.add(`Wrote the integral in terms of ${u} alone.`, chain(from, integral(h, u)))
      if (simple(sub)) {
        s.add(`Integrated with respect to ${u}, then wrote ${u} in terms of ${v} again.`, chain(integral(h, u), ...simpleSides(sub, u), withC(res)), chipOf(sub))
      } else {
        const inner = explainIntegral(sub, s)
        s.add(`Wrote ${u} in terms of ${v} again.`, chain(withC(inner), withC(res)))
      }
      return res
    }
    case 'PartsRule': {
      const vstep = n.v_step
      if (!vstep) throw new Unexplained()
      const u = lat(n.u)
      const dv = lat(n.dv)
      const du = Array.isArray(n.du) ? undefined : n.du
      if (!du) throw new Unexplained()
      s.goal('Integrate by parts')
      s.add(
        'Chose u and dv: u is the factor that gets simpler when it is differentiated.',
        `u = ${u},\\quad dv = ${same(dv, '1') ? `d${v}` : `${dv}${d(v)}`}`,
        `\\int u\\,dv = uv - \\int v\\,du`
      )
      if (!simple(vstep)) explainIntegral(vstep, s)
      const V = lat(vstep.result)
      s.add('Differentiated u and integrated dv.', `du = ${same(du.latex, '1') ? `d${v}` : `${du.latex}${d(v)}`},\\quad ${chain(`v = ${integral(dv, v)}`, V)}`)
      const uv = timesSigned(u, V)
      const second = n.second_step
      if (!second) {
        s.add('Put them into the formula; nothing was left to integrate.', chain(lhs, withC(uv), withC(res)))
        return res
      }
      const w = lat(second.integrand)
      // uv − ∫(−2cos x) dx is written uv + ∫2cos x dx, as a book does.
      const rest = isNeg(w) ? plus(uv, integral(negate(w), v)) : minus(uv, integral(w, v))
      s.add('Put them into the formula.', chain(lhs, rest))
      if (simple(second)) {
        s.add(headOf(second).replace(/^Used/, 'Integrated what was left with'), chain(rest, withC(minus(uv, shownOf(second))), withC(res)), chipOf(second))
      } else {
        const g = explainIntegral(second, s)
        s.add('Put the pieces together.', chain(rest, withC(minus(uv, g)), withC(res)))
      }
      return res
    }
    case 'CyclicPartsRule': {
      const parts = n.parts_rules ?? []
      const terms = lat(n.terms)
      const k = ratOf(n.coefficient?.text)
      if (!k || parts.length === 0) throw new Unexplained()
      const I = 'I'
      s.goal('Integrate by parts twice')
      // The choices go in the maths line, not the note: a note is read as plain text, where
      // \sin would simply vanish.
      const us = parts.map((p) => `u = ${lat(p.u)}`).join('\\text{, then }')
      s.add(
        'Called the integral I and integrated by parts twice: the integral came back on the right.',
        `I = ${lhs},\\qquad ${us},\\quad dv = ${lat(parts[0].dv)}${d(v)}`,
        `\\int u\\,dv = uv - \\int v\\,du`
      )
      const kTex = rTex(k)
      const back = kTex === '1' ? I : kTex === '-1' ? `-${I}` : `${kTex}${I}`
      s.add('Wrote what the two steps give.', `I = ${plus(terms, back)}`)
      const m = rSub(R1, k)
      if (m.n === 0n) throw new Unexplained() // I − I: nothing to solve for
      const mTex = rTex(m)
      if (mTex === '1') {
        s.add('Moved the I terms to one side.', `I = ${withC(res)}`)
        return res
      }
      s.add('Moved the I terms to one side.', `${mTex}I = ${terms}`)
      s.add(`Divided by ${mTex}.`, chain(`I`, withC(res)))
      return res
    }
    case 'RewriteRule':
    case 'CompleteSquareRule': {
      const sub = n.substep
      if (!sub) throw new Unexplained()
      const next = lat(sub.integrand)
      let inner: string
      if (n.kind === 'partial') {
        // The algebra on its own line, then the integral carries on from the student's own:
        // ∫ 1/(x² − 1) dx = ½ ∫ (1/(x − 1) − 1/(x + 1)) dx.
        s.goal('Split into partial fractions')
        s.add('Split the fraction into partial fractions.', chain(f, n.rewritten?.latex ?? next, next))
        inner = explainIntegral(sub, s, lhs)
      } else {
        s.goal('Rewrite')
        s.add(n.kind === 'complete_square' ? 'Completed the square.' : 'Rewrote the integrand in a form with a standard result.', chain(lhs, integral(next, v)))
        inner = explainIntegral(sub, s)
      }
      if (!same(inner, res)) s.add('Tidied the result.', chain(withC(inner), withC(res)))
      return res
    }
    default:
      throw new Unexplained()
  }
}

/** A Working with the answer and no steps — the answer comes first, whatever happens. */
function answerOnly(title: string, input: string, answer: string | Answer[], reason: string, checked?: boolean): Working {
  return {
    title,
    input,
    moves: [],
    answers: typeof answer === 'string' ? [{ label: 'Answer', tex: answer }] : answer,
    noWorking: true,
    reason,
    // A tick when SymPy's check passed; otherwise no verdict, because an answer SymPy could not
    // simplify back (a hypergeometric one, say) is unverified, not wrong.
    checked: checked ? 'ok' : undefined
  }
}

/** How a decimal is written when the caller does not pass the scene's own setting. */
const DEFAULT_DIGITS: DigitSettings = { decimals: 4, precisionMode: 'sf' }

/** The value of a definite integral as a real number, when it has one. */
function realValue(def: NonNullable<IntegralTree['definite']>): number | null {
  const n = def.numeric
  return n && Number.isFinite(n.re) && n.im === undefined ? n.re : null
}

/**
 * The answer rows of a definite integral: the exact value, and beside it the decimal a student can
 * use (½√π erf 1 ≈ 0.7468) unless the exact value is already a plain number. With no closed form
 * the decimal is the answer, never the integral echoed back.
 */
function definiteAnswers(def: NonNullable<IntegralTree['definite']>, digits: DigitSettings): Answer[] {
  const exact = def.value.latex.includes('\\int') ? null : def.value.latex
  const num = realValue(def)
  const rows: Answer[] = exact ? [{ label: 'Answer', tex: exact }] : []
  if (num !== null && (!exact || !ratOf(def.value.text))) {
    rows.push({ label: exact ? 'As a decimal' : 'Answer', tex: `\\approx ${texPrecise(num, digits)}` })
  }
  return rows
}

/** Said instead of an answer when a definite integral has no value at all (∫₋₁¹ 1/x dx). */
export const NO_VALUE =
  'This integral has no value: the function goes to infinity between the limits, and the areas on either side do not settle to a number.'

/**
 * The worker's `integral_steps` reply as working a student can follow. `digits` is how the
 * decimal of a definite integral is written (the scene's own setting when the caller has one).
 */
export function integralWorking(tree: IntegralTree, input: string, digits: DigitSettings = DEFAULT_DIGITS): Working {
  const title = 'Integrate'
  if (tree.error) return { title, input, moves: [], answers: [], error: tree.error }
  const v = varTex(tree.var || 'x')
  const def = tree.definite
  const f = tree.integrand.latex
  const shownInput = def ? `\\int_{${def.lower.latex}}^{${def.upper.latex}} ${isSum(f) ? `\\left(${f}\\right)` : f}${d(v)}` : integral(f, v)
  const radians = tree.deg_ignored ? ` ${RADIANS_NOTE}` : ''
  // SymPy's nan / zoo is "no value"; it must never reach the student as "NaN".
  if (def && (def.diverges || /nan|zoo/.test(def.value.text))) return { title, input: shownInput, moves: [], answers: [], error: NO_VALUE }
  if (!tree.closed) {
    if (def && realValue(def) !== null) {
      return answerOnly(
        title,
        shownInput,
        definiteAnswers(def, digits),
        `No formula made of ordinary functions exists for this integral, so its value was worked out numerically.${radians}`
      )
    }
    return {
      title,
      input: shownInput,
      moves: [],
      answers: [],
      error: 'This integral has no formula made of ordinary functions (powers, e, ln, sin …), so PhysLab cannot integrate it.'
    }
  }
  const finals: Answer[] = def ? definiteAnswers(def, digits) : [{ label: 'Answer', tex: withC(tree.answer_latex) }]
  const s = new Steps()
  try {
    if (tree.unsupported || !tree.tree || !explainable(tree.tree)) throw new Unexplained()
    const top = normalise(tree.tree)
    explainIntegral(top, s)
    if (!same(tree.answer_latex, tree.raw_latex)) {
      s.add(/^\\left\(/.test(tree.answer_latex.trim()) ? 'Took out the common factor.' : 'Tidied the answer.', chain(withC(tree.raw_latex), withC(tree.answer_latex)))
    }
  } catch (e) {
    if (!(e instanceof Unexplained)) throw e
    return answerOnly(title, shownInput, finals, `${NO_STEPS}${radians}`, tree.checked)
  }
  if (tree.deg_ignored && s.moves[0]) s.moves[0].note = s.moves[0].note ? `${s.moves[0].note} ${RADIANS_NOTE}` : RADIANS_NOTE
  if (def) {
    const F = tree.answer_latex
    const a = def.lower.latex
    const b = def.upper.latex
    s.goal('Put in the limits')
    if (def.agrees && def.F_lower && def.F_upper) {
      s.add(
        `Put in the upper limit, then the lower, and subtracted: the + C cancels.`,
        chain(shownInput, `\\left[${F}\\right]_{${a}}^{${b}}`, minus(def.F_upper.latex, def.F_lower.latex), def.value.latex),
        `\\int_{a}^{b} f${d(v)} = F(b) - F(a)`
      )
    } else {
      const infinite = def.infinite ?? /^-?oo$/.test(def.value.text.trim())
      s.add(
        infinite
          ? 'F(b) − F(a) does not apply here: the function goes to infinity between the limits, and the area under it is infinite.'
          : 'F(b) − F(a) does not apply here: the function breaks between the limits, so the area was worked out directly.',
        `${shownInput} = ${def.value.latex}`
      )
    }
  }
  return {
    title,
    input: shownInput,
    method: methodOf(tree.tree),
    moves: s.moves,
    answers: finals,
    check: tree.checked
      ? 'Differentiating the answer gives back the expression that was integrated.'
      : 'Differentiating the answer did not give back the integrand, so treat this answer with suspicion.',
    checked: tree.checked ? 'ok' : 'failed'
  }
}

/** The method's name, when the top of the tree has one a book would print. */
function methodOf(n: IntegralRule | undefined): string | undefined {
  if (!n) return undefined
  const top = normalise(n)
  const names: Record<string, string> = {
    URule: 'Substitution',
    PartsRule: 'Integration by parts',
    CyclicPartsRule: 'Integration by parts, twice',
    PowerRule: 'Power rule'
  }
  if (top.rule === 'RewriteRule' && top.kind === 'partial') return 'Partial fractions'
  if (top.rule === 'RewriteRule' && top.substep) return methodOf(top.substep)
  return names[top.rule]
}

// ---------------------------------------------------------------------------------------------
// Derivatives
// ---------------------------------------------------------------------------------------------

const D_FN: Record<string, { head: string; chip: (v: string) => string }> = {
  power: { head: 'Used the power rule: brought the power down and lowered it by one.', chip: (v) => `\\frac{d}{d${v}}${v}^{n} = n${v}^{n-1}` },
  exp: { head: 'Used the exponential rule: eˣ is its own derivative.', chip: (v) => `\\frac{d}{d${v}}e^{${v}} = e^{${v}}` },
  exp_base: { head: 'Used the rule for a number raised to a power.', chip: (v) => `\\frac{d}{d${v}}a^{${v}} = a^{${v}}\\ln a` },
  log: { head: 'Used the rule for the natural log.', chip: (v) => `\\frac{d}{d${v}}\\ln ${v} = \\frac{1}{${v}}` },
  sin: { head: 'Used the derivative of sine.', chip: (v) => `\\frac{d}{d${v}}\\sin ${v} = \\cos ${v}` },
  cos: { head: 'Used the derivative of cosine.', chip: (v) => `\\frac{d}{d${v}}\\cos ${v} = -\\sin ${v}` },
  tan: { head: 'Used the derivative of tangent.', chip: (v) => `\\frac{d}{d${v}}\\tan ${v} = \\sec^{2} ${v}` },
  sec: { head: 'Used the derivative of secant.', chip: (v) => `\\frac{d}{d${v}}\\sec ${v} = \\sec ${v}\\tan ${v}` },
  csc: { head: 'Used the derivative of cosecant.', chip: (v) => `\\frac{d}{d${v}}\\csc ${v} = -\\csc ${v}\\cot ${v}` },
  cot: { head: 'Used the derivative of cotangent.', chip: (v) => `\\frac{d}{d${v}}\\cot ${v} = -\\csc^{2} ${v}` },
  asin: { head: 'Used the derivative of inverse sine.', chip: (v) => `\\frac{d}{d${v}}\\sin^{-1} ${v} = \\frac{1}{\\sqrt{1 - ${v}^{2}}}` },
  acos: { head: 'Used the derivative of inverse cosine.', chip: (v) => `\\frac{d}{d${v}}\\cos^{-1} ${v} = -\\frac{1}{\\sqrt{1 - ${v}^{2}}}` },
  atan: { head: 'Used the derivative of inverse tangent.', chip: (v) => `\\frac{d}{d${v}}\\tan^{-1} ${v} = \\frac{1}{1 + ${v}^{2}}` },
  acot: { head: 'Used the derivative of inverse cotangent.', chip: (v) => `\\frac{d}{d${v}}\\cot^{-1} ${v} = -\\frac{1}{1 + ${v}^{2}}` },
  sinh: { head: 'Used the derivative of sinh.', chip: (v) => `\\frac{d}{d${v}}\\sinh ${v} = \\cosh ${v}` },
  cosh: { head: 'Used the derivative of cosh.', chip: (v) => `\\frac{d}{d${v}}\\cosh ${v} = \\sinh ${v}` },
  tanh: { head: 'Used the derivative of tanh.', chip: (v) => `\\frac{d}{d${v}}\\tanh ${v} = \\operatorname{sech}^{2} ${v}` },
  constant: { head: 'A constant does not change, so its derivative is 0.', chip: (v) => `\\frac{d}{d${v}}k = 0` },
  x: { head: 'The derivative of the variable itself is 1.', chip: (v) => `\\frac{d}{d${v}}${v} = 1` }
}

/** d/dx applied to an expression, bracketed unless it is one simple piece. */
const dd = (v: string, f: string): string => {
  const t = f.trim()
  return /^[A-Za-z0-9^{}]+$/.test(t) || /^\\[a-z]+(\^\{[^}]*\})? *\{?[A-Za-z0-9]\}?$/.test(t) ? `\\frac{d}{d${v}}${t}` : `\\frac{d}{d${v}}\\left(${t}\\right)`
}

/** Differentiated at sight: a standard result, a constant times one, or a sum of them. */
function dSimple(n: DerivRule): boolean {
  if (n.rule in D_FN) return true
  if (n.rule === 'constant_multiple') return (n.substeps ?? []).every((k) => k.rule !== 'sum' && dSimple(k))
  if (n.rule === 'sum') return (n.substeps ?? []).every((k) => k.rule !== 'sum' && dSimple(k))
  return false
}

function dChip(n: DerivRule, v: string): string | undefined {
  if (n.rule in D_FN) return D_FN[n.rule].chip(v)
  if (n.rule === 'constant_multiple' && n.substeps?.[0]) return dChip(n.substeps[0], v)
  if (n.rule === 'sum') {
    const chips = new Set((n.substeps ?? []).filter((k) => k.rule !== 'constant').map((k) => dChip(k, v)))
    return chips.size === 1 ? [...chips][0] : `\\frac{d}{d${v}}(f + g) = f' + g'`
  }
  return undefined
}

function dHead(n: DerivRule): string {
  if (n.rule in D_FN) return D_FN[n.rule].head
  if (n.rule === 'constant_multiple' && n.substeps?.[0]) return `Kept the constant and ${dHead(n.substeps[0]).replace(/^Used/, 'used').replace(/^A constant/, 'a constant').replace(/^The /, 'the ')}`
  return 'Differentiated term by term.'
}

/** The sides of a simple node's line after "d/dx(f) =". */
function dSimpleSides(n: DerivRule, v: string): string[] {
  const res = n.result.latex
  if (n.rule === 'constant_multiple' && n.substeps?.[0]) {
    const c = lat(n.constant)
    const k = n.substeps[0]
    const pulled = c === '-1' ? `-${dd(v, k.expr.latex)}` : `${c}${dd(v, k.expr.latex)}`
    return [pulled, scale(c, k.result.latex), res]
  }
  if (n.rule === 'sum') return [dShown(n), res]
  return [res]
}

/** The term-by-term middle of a sum's line, before tidying: 3 · 4x³ − 2 · 1 + 0. */
function dShown(n: DerivRule): string {
  if (n.rule === 'constant_multiple' && n.substeps?.[0]) return scale(lat(n.constant), dShown(n.substeps[0]))
  if (n.rule === 'sum') return (n.substeps ?? []).map(dShown).reduce((a, b) => plus(a, b), '')
  return n.result.latex
}

/**
 * The two letters the product and quotient rules name their factors by: f and g, unless the
 * question already uses one of them (f x sin x, or g² sin g differentiated by g) or a chain rule in
 * the same working has taken it; "f = x" beside a constant f gave f two meanings at once (GLM #23).
 */
export function factorNames(tree: DerivTree): [string, string] {
  // SymPy's own text of the question: a name not followed by "(" is a letter, not a function.
  const taken = new Set([tree.var, ...(tree.expr.text.match(/[A-Za-z_][A-Za-z0-9_]*(?![A-Za-z0-9_]*\s*\()/g) ?? [])])
  const walk = (n: DerivRule | undefined): void => {
    if (!n) return
    if (n.letter) taken.add(n.letter)
    n.substeps?.forEach(walk)
  }
  walk(tree.tree)
  const pairs: [string, string][] = [
    ['f', 'g'],
    ['u', 'v'],
    ['p', 'q'],
    ['h', 'k']
  ]
  return pairs.find(([a, b]) => !taken.has(a) && !taken.has(b)) ?? ['F', 'G']
}

function explainDerivative(n: DerivRule, v: string, U: string, s: Steps, fg: [string, string] = ['f', 'g']): string {
  const f = n.expr.latex
  const res = n.result.latex
  if (dSimple(n)) {
    s.add(dHead(n), chain(dd(v, f), ...dSimpleSides(n, v)), dChip(n, v))
    return res
  }
  const kids = n.substeps ?? []
  switch (n.rule) {
    case 'constant_multiple': {
      const k = kids[0]
      const c = lat(n.constant)
      const inner = explainDerivative(k, v, U, s, fg)
      s.add('Multiplied by the constant.', chain(dd(v, f), `${c === '-1' ? '-' : c}${dd(v, k.expr.latex)}`, scale(c, inner), res), `\\frac{d}{d${v}}(kf) = k\\frac{df}{d${v}}`)
      return res
    }
    case 'sum': {
      s.goal('Differentiate term by term')
      for (const k of kids) if (!dSimple(k)) explainDerivative(k, v, U, s, fg)
      // The terms side by side first; when they combine ((1 + ln x) − 1) the working-out is its
      // own line, so the answer is never left as an unfinished sum.
      const termwise = n.shown?.latex ?? res
      s.add('Differentiated term by term and added.', chain(dd(v, f), termwise), `\\frac{d}{d${v}}(f + g) = f' + g'`)
      if (!same(termwise, res)) s.add('Tidied the answer.', chain(termwise, res))
      return res
    }
    case 'product': {
      const [a, b] = kids
      if (!a || !b) throw new Unexplained()
      s.goal('Product rule')
      for (const k of kids) if (!dSimple(k) && k.rule !== 'sum') explainDerivative(k, v, U, s, fg)
      const [F, G] = fg
      s.add(
        `Named the two factors ${F} and ${G} and differentiated each.`,
        `${F} = ${a.expr.latex},\\quad ${F}' = ${a.result.latex},\\qquad ${G} = ${b.expr.latex},\\quad ${G}' = ${b.result.latex}`
      )
      s.add('Used the product rule.', chain(dd(v, f), plus(times(a.result.latex, b.expr.latex), times(a.expr.latex, b.result.latex)), res), `\\frac{d}{d${v}}(${F}${G}) = ${F}'${G} + ${F}${G}'`)
      return res
    }
    case 'quotient': {
      const [top, bottom] = kids
      if (!top || !bottom) throw new Unexplained()
      s.goal('Quotient rule')
      for (const k of kids) if (!dSimple(k) && k.rule !== 'sum') explainDerivative(k, v, U, s, fg)
      const [F, G] = fg
      s.add(
        `Named the top ${F} and the bottom ${G} and differentiated each.`,
        `${F} = ${top.expr.latex},\\quad ${F}' = ${top.result.latex},\\qquad ${G} = ${bottom.expr.latex},\\quad ${G}' = ${bottom.result.latex}`
      )
      const gt = bottom.expr.latex.trim()
      const g2 = /^[A-Za-z0-9]$/.test(gt) ? `${gt}^{2}` : `\\left(${gt}\\right)^{2}`
      const raw = minus(times(bottom.expr.latex, top.result.latex), times(top.expr.latex, bottom.result.latex))
      const sides = [dd(v, f), `\\frac{${raw}}{${g2}}`]
      if (n.expanded && !same(n.expanded.latex, raw)) sides.push(`\\frac{${n.expanded.latex}}{${g2}}`)
      sides.push(res)
      s.add('Used the quotient rule: bottom times the derivative of the top, minus top times the derivative of the bottom, all over the bottom squared.', chain(...sides), `\\frac{d}{d${v}}\\left(\\frac{${F}}{${G}}\\right) = \\frac{${G}${F}' - ${F}${G}'}{${G}^{2}}`)
      return res
    }
    case 'chain': {
      const inner = kids[0]
      if (!inner || !n.outer) throw new Unexplained()
      s.goal('Chain rule')
      if (!dSimple(inner)) explainDerivative(inner, v, U, s, fg)
      const u = lat(n.u)
      // Each inside has its own letter (the worker hands them out), so u keeps one meaning.
      const L = n.letter ?? U
      s.add(
        `Called the inside ${L} and differentiated the outside with respect to ${L}.`,
        `${L} = ${u},\\quad \\frac{d${L}}{d${v}} = ${inner.result.latex},\\qquad ${chain(dd(L, lat(n.outer_expr)), lat(n.outer_derivative))}`,
        D_FN[n.outer]?.chip(L)
      )
      s.add(
        'Used the chain rule: the outside’s derivative, with the inside put back, times the inside’s derivative.',
        // Always outside′ · inside′ with the dot, in that order, so the rule is visible in the
        // line before it is tidied: cos(3x²) · 6x = 6x cos(3x²). A factor of 1 is not written.
        chain(dd(v, f), same(inner.result.latex, '1') ? lat(n.outer_at_inner) : `${br(lat(n.outer_at_inner))} \\cdot ${br(inner.result.latex)}`, res),
        `\\frac{dy}{d${v}} = \\frac{dy}{d${L}}\\cdot\\frac{d${L}}{d${v}}`
      )
      return res
    }
    default:
      throw new Unexplained()
  }
}

/** The worker's `diff_steps` reply as working a student can follow. */
export function derivativeWorking(tree: DerivTree, input: string): Working {
  const title = 'Differentiate'
  if (tree.error) return { title, input, moves: [], answers: [], error: tree.error }
  const v = varTex(tree.var || 'x')
  const shownInput = dd(v, tree.expr.latex)
  const radians = tree.deg_ignored ? ` ${RADIANS_NOTE}` : ''
  const s = new Steps()
  try {
    if (tree.unsupported || !tree.tree) throw new Unexplained()
    explainDerivative(tree.tree, v, tree.u || 'u', s, factorNames(tree))
  } catch (e) {
    if (!(e instanceof Unexplained)) throw e
    return answerOnly(title, shownInput, tree.answer_latex, `${NO_STEPS}${radians}`, tree.checked)
  }
  if (tree.deg_ignored && s.moves[0]) s.moves[0].note = s.moves[0].note ? `${s.moves[0].note} ${RADIANS_NOTE}` : RADIANS_NOTE
  const methods: Partial<Record<DerivRuleName, string>> = { product: 'Product rule', quotient: 'Quotient rule', chain: 'Chain rule' }
  return {
    title,
    input: shownInput,
    method: methods[tree.tree.rule],
    moves: s.moves,
    answers: [{ label: 'Answer', tex: tree.answer_latex }],
    check: tree.checked
      ? 'Differentiating a second, independent way gave the same answer.'
      : 'A second way of differentiating disagrees with this answer, so treat it with suspicion.',
    checked: tree.checked ? 'ok' : 'failed'
  }
}
