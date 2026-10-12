// A card's three lines from a Reading: the formula, the values put into it with their units, and
// the result (Idea #39 §4.4, FIG. 4):
//   KE = ½mv²   = ½ × 2 kg × (3.132 m/s)²   = 9.81 J
// Each line comes twice: `tex` for KaTeX, with every symbol (and every value put in for it) wrapped
// \htmlData{q=<quantity>}{…} so the dock can colour it and light its arrow and graph line; and
// `plain`, the same line in ordinary characters for a screen reader or a sentence — never a caret,
// a backslash or e-notation (AGENTS.md: superscriptPowers).
//
// The formula is written once, as LaTeX with `@{key}` for each symbol and `*` for each
// multiplication (nothing in the formula, × once numbers stand there). Everything else is derived
// from it, so a card cannot show one formula and compute another without its own test noticing.

import { stepEq, type DigitSettings } from '../../math/format'
import { GREEK_LETTERS } from '../../math/names'
import { honestDigits, type DigitInput, type DigitRule, type ShownNumber } from './digits'
import { isConstantSource, sourceValue } from './reading'
import type { CardLine, CardSpec, CardView, QKey, Reading } from './types'
import { unitPlain, unitTex, unitsCheck } from './units'

/** What stands for a value nobody has: a dash, never a made-up number. */
const MISSING = '—'

// ---------------------------------------------------------------------------
// The template: `@{key}` symbols and `*` multiplications in otherwise ordinary LaTeX
// ---------------------------------------------------------------------------

type Piece = { kind: 'tex'; text: string } | { kind: 'sym'; key: string; powered: boolean; leads: boolean } | { kind: 'times' }

/** The template cut into LaTeX, symbols and multiplication points. */
function pieces(template: string): Piece[] {
  const out: Piece[] = []
  let at = 0
  for (const m of template.matchAll(/@\{([^}]*)\}|\*/g)) {
    const i = m.index ?? 0
    if (i > at) out.push({ kind: 'tex', text: template.slice(at, i) })
    if (m[0] === '*') out.push({ kind: 'times' })
    else {
      const before = template.slice(0, i).trimEnd()
      const after = template.slice(i + m[0].length).trimStart()
      // A value with its unit is bracketed before a power — (3.132 m/s)² — and when it is
      // negative anywhere but the start of a group, where "× −0.25 m" would read as a subtraction.
      out.push({ kind: 'sym', key: m[1], powered: after.startsWith('^'), leads: before === '' || /[{(=]$/.test(before) })
    }
    at = i + m[0].length
  }
  if (at < template.length) out.push({ kind: 'tex', text: template.slice(at) })
  return out
}

const wrap = (q: QKey | null, tex: string): string => (q ? `\\htmlData{q=${q}}{${tex}}` : tex)

// ---------------------------------------------------------------------------
// LaTeX into ordinary characters, for the small part of LaTeX a card is written in
// ---------------------------------------------------------------------------

const RAISED: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '−': '⁻', '+': '⁺', '°': '°', n: 'ⁿ' }
const LOWERED: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ'
}
const VULGAR: Record<string, string> = { '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾' }
const GREEK = new Map(GREEK_LETTERS.map((g) => [g.name, g.letter]))
/** The capitals a card may write, which the lowercase list in math/names.ts does not hold. */
const CAPITALS: Record<string, string> = { Delta: 'Δ', Sigma: 'Σ', Omega: 'Ω' }
const WORD_COMMANDS: Record<string, string> = { times: '×', cdot: '·', approx: '≈', circ: '°', infty: '∞', pm: '±', '%': '%', ',': ' ', ';': ' ', ' ': ' ', quad: ' ', left: '', right: '' }
const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'ln', 'log', 'exp'])

/** A raised or lowered piece: each character that has a raised (lowered) form takes it; one that has none stays as it is. */
const shift = (text: string, table: Record<string, string>): string => [...text].map((c) => table[c] ?? c).join('')

/** Whether a piece of a sentence is one thing ("g", "v₀", "30°") or needs brackets once written in a line. */
const topLevel = (text: string): string => {
  let depth = 0
  let out = ''
  for (const c of text) {
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (depth === 0) out += c
  }
  return out
}
const isAtom = (text: string): boolean => !/[\s/×·+−]/.test(topLevel(text))

/**
 * A card's LaTeX as a sentence: \tfrac{1}{2} → ½, \frac{a}{b} → a / b (bracketed where a reader
 * would misgroup it), \sqrt{x} → √(x), ^2 → ², _0 → ₀, \theta → θ, \sin → sin, - → −.
 */
export function plainOf(tex: string): string {
  return convert(tex).replace(/\s+/g, ' ').trim()
}

function convert(s: string): string {
  let i = 0
  let out = ''
  /** The next argument: a {group} or one character or command, converted. */
  const arg = (): string => {
    while (s[i] === ' ') i++
    if (s[i] === '{') {
      let depth = 0
      const from = i
      for (; i < s.length; i++) {
        if (s[i] === '{') depth++
        else if (s[i] === '}' && --depth === 0) break
      }
      i++
      return convert(s.slice(from + 1, i - 1))
    }
    if (s[i] === '\\') {
      const m = /^\\([a-zA-Z]+|.)/.exec(s.slice(i))!
      i += m[0].length
      return convert(m[0])
    }
    return i < s.length ? convert(s[i++]) : ''
  }
  while (i < s.length) {
    const c = s[i]
    if (c === '\\') {
      const m = /^\\([a-zA-Z]+|.)/.exec(s.slice(i))!
      i += m[0].length
      const name = m[1]
      if (name === 'frac' || name === 'tfrac' || name === 'dfrac') {
        const top = arg()
        const bottom = arg()
        // A sum on top needs brackets ("(a + b) / c"); a product reads left to right without them.
        // Anything but a single thing underneath needs them: "/ 9.81 m/s²" would divide by 9.81 alone.
        out += VULGAR[`${top}/${bottom}`] ?? `${/ [+−] /.test(topLevel(top)) ? `(${top})` : top} / ${isAtom(bottom) ? bottom : `(${bottom})`}`
      } else if (name === 'sqrt') {
        const inside = arg()
        out += `√${isAtom(inside) ? inside : `(${inside})`}`
      } else if (name === 'text' || name === 'mathrm' || name === 'mathit' || name === 'operatorname') {
        out += arg()
      } else if (name === 'htmlData') {
        arg()
        out += arg()
      } else if (FUNCTIONS.has(name)) {
        let j = i
        while (s[j] === ' ') j++
        out += s[j] === '(' ? name : `${name} `
      } else if (name === 'pi') out += 'π'
      else if (GREEK.has(name)) out += GREEK.get(name)
      else if (name in CAPITALS) out += CAPITALS[name]
      else if (name in WORD_COMMANDS) out += WORD_COMMANDS[name]
      else out += name
    } else if (c === '^') {
      i++
      out += shift(arg(), RAISED)
    } else if (c === '_') {
      i++
      out += shift(arg(), LOWERED)
    } else if (c === '{' || c === '}') {
      i++
    } else {
      out += c === '-' ? '−' : c
      i++
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// The numbers, then the lines
// ---------------------------------------------------------------------------

/** The numbers behind a card's lines: each symbol as shown (null where the reading has none) and the result. */
export interface CardNumbers {
  inputs: Record<string, ShownNumber | null>
  /** Null when a value it needs is missing, or the formula has no answer for these values. */
  result: ShownNumber | null
  value: number
  holds: boolean
}

/** The numbers a card shows, or null when a role it needs is not in the reading. */
export function cardNumbers(spec: CardSpec, r: Reading, s: DigitSettings, rule: DigitRule = honestDigits): CardNumbers | null {
  const known: DigitInput[] = []
  let missing = false
  for (const sym of spec.symbols) {
    const raw = sourceValue(sym.from, r)
    if (raw === undefined) return null
    if (raw === null) missing = true
    else known.push({ key: sym.key, value: (sym.sign ?? 1) * raw, given: isConstantSource(sym.from) })
  }
  if (missing) {
    // The values that are known are still shown, at the student's precision: no sum is claimed.
    const d = rule(known, () => NaN, s)
    const inputs: Record<string, ShownNumber | null> = {}
    for (const sym of spec.symbols) inputs[sym.key] = d.inputs[sym.key] ?? null
    return { inputs, result: null, value: NaN, holds: false }
  }
  const d = rule(known, spec.compute, s)
  const value = spec.compute(Object.fromEntries(known.map((k) => [k.key, k.value])))
  return { inputs: d.inputs, result: Number.isNaN(value) ? null : d.result, value, holds: d.holds && Number.isFinite(value) }
}

/** A card evaluated on a reading at the student's precision, or null when a role it needs is not there. */
export function evaluateSpec(spec: CardSpec, r: Reading, s: DigitSettings, rule: DigitRule = honestDigits): CardView | null {
  const n = cardNumbers(spec, r, s, rule)
  if (!n) return null
  const bySym = new Map(spec.symbols.map((sym) => [sym.key, sym]))
  const parts = pieces(spec.formulaTex)
  const symOf = (key: string) => {
    const sym = bySym.get(key)
    if (!sym) throw new Error(`card ${spec.id}: @{${key}} is not one of its symbols`)
    return sym
  }

  // Line 1: the formula.
  const formulaTex = parts.map((p) => (p.kind === 'tex' ? p.text : p.kind === 'times' ? '\\,' : `{${wrap(symOf(p.key).q, symOf(p.key).tex)}}`)).join('')
  const formulaPlain = plainOf(parts.map((p) => (p.kind === 'tex' ? p.text : p.kind === 'times' ? ' ' : `{${symOf(p.key).tex}}`)).join(''))

  // Line 2: the values put in, each with its unit.
  const valueTex = (p: Extract<Piece, { kind: 'sym' }>): string => {
    const sym = symOf(p.key)
    const shown = n.inputs[p.key]
    if (!shown) return `{\\text{${MISSING}}}`
    const body = wrap(sym.q, `${shown.tex}${unitTex(sym.unit)}`)
    const bracket = p.powered || (!p.leads && shown.plain.startsWith('−'))
    return bracket ? `{\\left(${body}\\right)}` : `{${body}}`
  }
  const valuePlain = (p: Extract<Piece, { kind: 'sym' }>): string => {
    const sym = symOf(p.key)
    const shown = n.inputs[p.key]
    if (!shown) return `{${MISSING}}`
    const body = `${shown.plain}${unitPlain(sym.unit)}`
    return p.powered || (!p.leads && shown.plain.startsWith('−')) ? `{(${body})}` : `{${body}}`
  }
  const substTex = parts.map((p) => (p.kind === 'tex' ? p.text : p.kind === 'times' ? ' \\times ' : valueTex(p))).join('')
  const substPlain = plainOf(parts.map((p) => (p.kind === 'tex' ? p.text : p.kind === 'times' ? ' \\times ' : valuePlain(p))).join(''))

  // Line 3: the result, = when the shown sum checks and ≈ when it cannot.
  const res = spec.result
  const name = plainOf(res.tex)
  const resultTex = n.result ? wrap(res.q, `${n.result.tex}${unitTex(res.unit)}`) : `\\text{${MISSING}}`
  const resultPlain = n.result ? `${n.result.plain}${unitPlain(res.unit)}` : MISSING
  const eqTex = n.result ? stepEq(n.holds) : '='
  const eqPlain = eqTex === '=' ? '=' : '≈'

  const lines: CardLine[] = [
    { tex: `${wrap(res.q, res.tex)} = ${formulaTex}`, plain: `${name} = ${formulaPlain}` },
    { tex: `= ${substTex}`, plain: `= ${substPlain}` },
    { tex: `${eqTex} ${resultTex}`, plain: `${eqPlain} ${resultPlain}` }
  ]
  const quantities: QKey[] = []
  for (const q of [...spec.symbols.map((sym) => sym.q), res.q]) if (q && !quantities.includes(q)) quantities.push(q)
  return {
    id: spec.id,
    title: spec.title,
    lines,
    value: n.value,
    unit: res.unit,
    text: `${name} = ${resultPlain}`,
    sumChecks: n.result !== null && n.holds,
    unitsCheck: unitsCheck(spec),
    quantities
  }
}
