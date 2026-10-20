// Converts MathLive (natural textbook math) LaTeX into PhysLab's friendly linear syntax,
// which then goes through math/expr.ts preprocess() into mathjs.
//   \frac{1}{2}      → ((1)/(2))        \sqrt{x}        → sqrt(x)
//   3\hat{i}+4\hat{j} → 3i+4j           \vec{A}\times\vec{B} → A×B (vector mode) or A*B
//   10\angle30^{\circ} → 10∠30°         \left|\vec{A}\right| → |A|
//   \int_{0}^{\pi}\sin x\,dx → integral(sin(x), 0, π)
//
// This is the LaTeX-to-text step only: reading the text is preprocess's job, the one reader of typed
// maths (π, °, ∠, |…|, <…> and, in vector mode, × and · are left to it). It still writes \div as / and \le,
// \ge, \ne as <=, >=, != although preprocess reads ÷ ≤ ≥ ≠ the same way, because not every caller
// reads this text through preprocess: Pure Maths hands it to its job finder and the algebra engine
// as it is (math/pure/store.ts), and the Maths screen asks whether it holds an = before inserting
// one (panels/Maths.tsx), which "x ≤ 3" would not. tests/golden/reader.golden.test.ts pins what
// each route reads.

interface LatexOptions {
  /** × and · mean cross and dot products (vector calculator) instead of multiplication. */
  vectorOps?: boolean
}

type Tok = string

/**
 * Characters a student pastes from a textbook or types with a Unicode keyboard, read as the
 * LaTeX MathLive would have produced: î ĵ k̂ are the unit vectors, − is a minus, x² is a square.
 * ½A is half of A. Without this a pasted "3î + 4ĵ" failed while the typed version worked.
 */
const UNICODE_ALIASES: [RegExp, string][] = [
  [/î|î/g, '\\hat{i}'],
  [/ĵ|ĵ/g, '\\hat{j}'],
  [/k̂/g, '\\hat{k}'],
  [/[−–]/g, '-'],
  [/²/g, '^{2}'],
  [/³/g, '^{3}'],
  [/½/g, '\\frac{1}{2}'],
  [/¼/g, '\\frac{1}{4}'],
  [/¾/g, '\\frac{3}{4}'],
  [/⅓/g, '\\frac{1}{3}'],
  [/⅔/g, '\\frac{2}{3}'],
  [/±/g, '\\pm']
]

const PM_REFUSAL = 'Choose + or −: PhysLab works one case at a time, so ask for the + answer and the − answer separately.'

/**
 * Where the ×10ˣ key's mark stood, between reading it and the end of latexToMath, which turns it into
 * text. A private-use character (U+E010), so a ᴇ typed or pasted into the field is never mistaken for it
 * (that one is the calculator's own, read by the engine's input step in calc/engine.ts) and the mark
 * never leaves this file. Built from its code rather than typed, because an invisible character in the
 * source is one an editor can lose.
 */
const E10 = String.fromCharCode(0xe010)
/**
 * The plain number a piece of text ends with, if it does. Nothing that can belong to a name stands in front
 * of it: any letter or digit (Greek ones too, so α2 is a name) or a dot (1.2.5 is no number).
 */
const NUMBER_AT_END = /(?<![\p{L}\p{N}_.])(\d+(?:\.\d*)?|\.\d+)$/u
/** A power that is a sign and digits and nothing else — 3, -19, +3 — which a number can take as a plain e-number. */
const WHOLE_POWER = /^[+-]?\d+$/

/** The ")" that closes the "(" at `open`, or -1 when it is never closed. */
function closingBracket(text: string, open: number): number {
  if (text[open] !== '(') return -1
  let depth = 0
  for (let k = open; k < text.length; k++) {
    if (text[k] === '(') depth++
    else if (text[k] === ')' && --depth === 0) return k
  }
  return -1
}

/**
 * Writes out every ×10ˣ mark standardForm left in `text` (each is E10 and "(power)"). A plain number in front
 * of a mark is the mantissa of the number the key builds — mark, 10 and power are ONE number in standard form
 * — so the number and the mark leave as one number whatever the power looks like, and 1 ÷ 2 ×10ˣ 3 divides by
 * 2000, never by 2 and then multiplies by 1000:
 *   - a power of a sign and digits joins it as a plain e-number, 1.6 + mark + (-19) is 1.6e-19, which the
 *     calculator, the working and the algebra engine all read alike;
 *   - any other power (a bracket, a sum: 2 ×10ˣ (-3), 2 ×10ˣ 1+2) goes in a bracket of its own, 2*10^((-3)),
 *     because without it a ÷ in front takes only the 2: 1 ÷ 2 ×10ˣ (-3) read 0.0005 and 6 ÷ 2 ×10ˣ (-2)
 *     read 0.03 where the numbers the student built are 1 ÷ 0.002 = 500 and 6 ÷ 0.02 = 300.
 * Anything else in front of the mark — a bracket, a fraction, a root, a letter, a name that ends in a digit —
 * is scaled by ten to the power, "*10^", as the × key and a 10^ would have done. So is a number whose power
 * runs on into a digit or a dot (2, the mark, (3) and a typed 5 is neither 2×10³⁵ nor 2×10³ times 5): left
 * as it always was, it is refused where it is read. A mark whose bracket is never closed is left to be refused too.
 */
function resolveStandardForm(text: string): string {
  let out = ''
  // What is in `out` already: text before this index (and the marks inside a power that was written out).
  let done = 0
  for (let at = text.indexOf(E10); at !== -1; at = text.indexOf(E10, done)) {
    const close = closingBracket(text, at + 1)
    const mantissa = NUMBER_AT_END.exec(text.slice(0, at))?.[1]
    if (mantissa === undefined || close === -1 || /[\d.]/.test(text[close + 1] ?? '')) {
      out += `${text.slice(done, at)}*10^`
      done = at + 1
      continue
    }
    // A mark inside the power (2 ×10ˣ (3 ×10ˣ 2)) is a number of its own, written out first.
    const power = resolveStandardForm(text.slice(at + 2, close))
    out += text.slice(done, at - mantissa.length) + (WHOLE_POWER.test(power) ? `${mantissa}e${power}` : `(${mantissa}*10^(${power}))`)
    done = close + 1
  }
  return out + text.slice(done)
}

function tokenize(raw: string): Tok[] {
  const src = UNICODE_ALIASES.reduce((s, [re, to]) => s.replace(re, to), raw)
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === '\\') {
      const m = src.slice(i).match(/^\\([a-zA-Z]+|.)/)
      if (m) {
        out.push(m[0])
        i += m[0].length
        continue
      }
    }
    if (ch === '#' && src[i + 1] === '?') {
      out.push('#?')
      i += 2
      continue
    }
    if (/\s/.test(ch)) {
      i++
      continue
    }
    out.push(ch)
    i++
  }
  return out
}

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'θ',
  iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ',
  varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω'
}

/** The Greek letters themselves, as a line typed from the keypad writes them (∫ sinθ dθ) rather than by command. */
const GREEK_GLYPHS = new Set(Object.values(GREEK))

const FUNCS = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan', 'ln', 'log', 'exp', 'min', 'max', 'det', 'gcd', 'deg'])
const INVERSE: Record<string, string> = { sin: 'asin', cos: 'acos', tan: 'atan', sinh: 'asinh', cosh: 'acosh', tanh: 'atanh' }
const ARC: Record<string, string> = { arcsin: 'asin', arccos: 'acos', arctan: 'atan' }

const DELIMS: Record<string, string> = {
  '(': '(', ')': ')', '[': '[', ']': ']', '|': '|', '.': '', '\\vert': '|', '\\lvert': '|', '\\rvert': '|', '\\|': '|',
  '\\langle': '<', '\\rangle': '>', '\\lbrack': '[', '\\rbrack': ']', '\\{': '(', '\\}': ')'
}

/**
 * latexToMath for code that runs while a panel is drawing itself: the ± refusal is an Error, and
 * an Error thrown mid-render blanks the panel to the error boundary. This returns the sentence
 * instead so the panel can show it beside the input.
 */
export function tryLatexToMath(latex: string, opts: LatexOptions = {}): { src: string; problem?: string } {
  try {
    return { src: latexToMath(latex, opts) }
  } catch (e) {
    return { src: '', problem: e instanceof Error ? e.message : String(e) }
  }
}

export function latexToMath(latex: string, opts: LatexOptions = {}): string {
  const t = tokenize(latex)
  let i = 0

  const peek = () => t[i]
  const next = () => t[i++]
  /** Reads past LaTeX spacing (\, \; \: \! \  \quad \qquad), which says nothing about the maths. */
  const SPACING = new Set(['\\,', '\\;', '\\:', '\\!', '\\ ', '\\quad', '\\qquad'])
  const skipSpacing = (): void => {
    while (i < t.length && SPACING.has(t[i])) i++
  }

  /** A single argument: {group} or one token. */
  const arg = (): string => {
    if (peek() === '{') {
      next()
      const s = seq('}')
      next()
      return s
    }
    if (i >= t.length) return ''
    return atom()
  }

  /** Parenthesised argument after a function name, or a single atom if not parenthesised. */
  const fnArg = (): string => {
    // A plain "(" opens the argument the way \left( does and is read to its own ")": \sin(30),
    // \ln(2), \sin(2(15)). It used to go through atom() with \left, but atom() takes just the one "("
    // token, so the argument came out empty and "30)" was left over: sin()30) — "check the brackets".
    // The depth keeps an inner pair from ending the argument early. A closer that belongs to an
    // enclosing group ends it as well (an unclosed bracket closes there, as an unclosed \left( does),
    // so it is never swallowed as text. Inside the bracket a letter in front of a root or function
    // is kept apart from it the same way a sequence does.
    if (peek() === '(') {
      next()
      let s = ''
      let depth = 0
      while (i < t.length && !GROUP_CLOSERS.includes(peek()) && !(peek() === ')' && depth === 0)) {
        if (peek() === '(') depth++
        else if (peek() === ')') depth--
        s += gapBefore(s, peek()) + atom()
      }
      if (peek() === ')') next()
      return s
    }
    if (peek() === '\\left' || peek() === '\\mleft') {
      const s = atom()
      return s.startsWith('(') ? s.slice(1, -1) : s
    }
    if (peek() === '{') return arg()
    // A matrix straight after the name is its whole argument, as it is inside \left( … \right): \det\begin{pmatrix}…\end{pmatrix}
    // came out as det() with the matrix left outside it, and the Calculator refused the empty det.
    if (peek() === '\\begin') return atom()
    // A fraction or a root straight after the name is the whole argument, the way a book reads sin π/6 and
    // ln √x. MathLive writes exactly this when a function is typed on the keyboard and "/" follows
    // (\sin\frac{\pi}{6}; the keypad's own function keys bring their brackets). The run below knows only
    // letters, digits and a few Greek names, so the fraction used to end the argument as the empty string:
    // the line reached the engine as sin()((π)/(6)), which mathjs refused, and the half-angle identity typed
    // with fractions was refused in Working too. atom() reads the fraction or root as it does inside
    // \left( … \right), so with the brackets typed or not the text is the same. d/dx reads its body through
    // here as well: d/dx 1/x and d/dx √x were "diff(, x)" with the body left outside.
    const lead = peek()
    if (lead === '\\frac' || lead === '\\dfrac' || lead === '\\tfrac' || lead === '\\sqrt') return atom()
    // A function straight after another name or after d/dx is the whole argument with its own: d/dx sin x
    // was diff(, x)sin(x), the body left outside.
    if (lead?.startsWith('\\') && FUNCS.has(lead.slice(1))) return atom()
    // \sin x, \sin 2x, \sin 30°, \sin μ, \sin x! → take a run of simple tokens as the argument.
    let s = ''
    while (i < t.length) {
      const p = peek() ?? ''
      if (p === '^' || p === '_') {
        s += atom()
        continue
      }
      const greek = p.startsWith('\\') && GREEK[p.slice(1)] !== undefined
      if (/^[0-9a-zA-Z.!°]$/.test(p) || greek) s += atom()
      else break
    }
    return s
  }

  /**
   * What comes after the ×10ˣ key's mark (\mathord{\times}, already read): the 10 and the power on it.
   * Mark, 10 and power are ONE number in standard form, so they leave as E10 + "(power)" and the end of
   * this function joins that to the number in front of it, so that 1 ÷ 2 ×10ˣ 3 is 1 ÷ 2000 (0.0005), not
   * (1 ÷ 2) × 1000. A plain \times never comes this way: it only ever multiplies. When the 10 is no longer
   * exactly 10 — the student deleted into it, or typed another digit after it — nothing is standard form
   * any more and the mark was an ordinary ×.
   */
  const standardForm = (): string => {
    const times = opts.vectorOps ? '×' : '*'
    if (t[i] !== '1' || t[i + 1] !== '0' || /^[0-9.]$/.test(t[i + 2] ?? '')) return times
    i += 2
    if (peek() !== '^') return `${times}10`
    next()
    return `${E10}(${arg().trim()})`
  }

  /**
   * The power of a pasted standard form, and nothing else. MathLive reads a pasted "^" the way TeX does:
   * the superscript is only the minus, or only the first digit, and the rest of the power is left on the
   * line — the pasted text 1.6×10^-19 reaches this function as 1.6\times10^{-}19 and 6.02×10^23 as
   * 6.02\times10^23, which read as "10 to the minus, then 19" and "10², then 3": an error, or a wrong
   * number. After a × and a 10 the digits behind such a ^ are its power, so they are taken with it (a
   * one-digit power, 3×10^8, and a braced one, 10^{23}, are already right and are left alone). Returns ''
   * and moves nowhere when what follows is not that. The pasted line is a multiplication like any other ×.
   */
  const pastedPower = (): string => {
    if (t[i] !== '1' || t[i + 1] !== '0' || t[i + 2] !== '^') return ''
    let j = i + 3
    let sign = ''
    if (t[j] === '{' && (t[j + 1] === '-' || t[j + 1] === '+') && t[j + 2] === '}') {
      sign = t[j + 1]
      j += 3
    }
    const from = j
    while (/^\d$/.test(t[j] ?? '')) j++
    if (j === from || (sign === '' && j - from < 2)) return ''
    i = j
    return sign + t.slice(from, j).join('')
  }

  const atom = (): string => {
    const tok = next()
    if (tok === undefined) return ''
    if (tok === '{') {
      const s = seq('}')
      next()
      return `(${s})`
    }
    if (tok === '#?') return ''
    if (tok === '^') {
      let a = arg()
      if ((a === '-' || a === '+') && /^\d$/.test(peek() ?? '')) {
        let digits = ''
        while (i < t.length && /^\d$/.test(peek() ?? '')) digits += atom()
        a += digits
      }
      if (a === '°' || a === '(°)') return '°'
      if (a === "'" || a === '\\prime') return "'"
      return `^(${a})`
    }
    if (tok === '_') {
      const a = arg()
      return /^[A-Za-z0-9]+$/.test(a) ? a : `_(${a})`
    }
    if (!tok.startsWith('\\')) {
      if (tok === '·') return opts.vectorOps ? '·' : '*'
      if (tok === '×') return opts.vectorOps ? '×' : '*'
      return tok
    }
    const name = tok.slice(1)
    switch (name) {
      case ',':
      case ';':
      case ':':
      case '!':
      case ' ':
      case 'quad':
      case 'qquad':
        return ' '
      case 'left':
      case 'right':
      case 'mleft':
      case 'mright':
      case 'bigl':
      case 'bigr':
      case 'Bigl':
      case 'Bigr': {
        const d = next()
        const open = DELIMS[d] ?? d
        if (name === 'left' || name === 'mleft' || name === 'bigl' || name === 'Bigl') {
          const close = open === '(' ? ')' : open === '[' ? ']' : open === '|' ? '|' : open === '<' ? '>' : ''
          const inner = seq(['\\right', '\\mright', '\\bigr', '\\Bigr'])
          if (i < t.length) {
            next()
            next()
          }
          return `${open}${inner}${close}`
        }
        return DELIMS[d] ?? d
      }
      case 'frac':
      case 'dfrac':
      case 'tfrac': {
        const a = arg()
        const b = arg()
        const dm = b.match(/^(?:\(?d\)?|\\differentialD)\s*([a-zA-Z\u0370-\u03FF])$/u)
        if ((a === 'd' || a === '(d)') && dm) {
          skipSpacing() // d/dx\;x^2: the typed space is only the gap before the body
          const body = fnArg()
          return `diff(${body}, ${dm[1]})`
        }
        return `((${a})/(${b}))`
      }
      case 'sqrt': {
        if (peek() === '[') {
          next()
          const n = seq(']')
          next()
          return `nthRoot(${arg()}, ${n})`
        }
        return `sqrt(${arg()})`
      }
      case 'vec':
      case 'overrightarrow':
      case 'mathbf':
      case 'boldsymbol':
      case 'bm':
      case 'hat':
      case 'mathrm':
      case 'mathit':
      case 'operatorname':
      case 'text':
      case 'textrm':
      case 'mathnormal': {
        const a = arg()
        return a.replace(/^\((.*)\)$/, '$1').replace(/\\imath/g, 'i').replace(/\\jmath/g, 'j')
      }
      case 'imath':
        return 'i'
      case 'jmath':
        return 'j'
      case 'cdot':
      case 'bullet':
        return opts.vectorOps ? '·' : '*'
      case 'times': {
        const times = opts.vectorOps ? '×' : '*'
        const power = pastedPower()
        return power ? `${times}10^(${power})` : times
      }
      case 'mathord':
        // The ×10ˣ key's mark. Any other \mathord is not understood, as before.
        if (t[i] === '{' && t[i + 1] === '\\times' && t[i + 2] === '}') {
          i += 3
          return standardForm()
        }
        break
      case 'div':
        return '/'
      case 'pm':
      case 'mp':
        // Turning ± into + gave one of the two answers with no hint that the other existed.
        throw new Error(PM_REFUSAL)
      case 'le':
      case 'leq':
        return '<='
      case 'ge':
      case 'geq':
        return '>='
      case 'ne':
      case 'neq':
        return '!='
      case 'lt':
        return '<'
      case 'gt':
        return '>'
      case 'circ':
      case 'degree':
        return '°'
      case 'prime':
        return "'"
      case 'angle':
      case 'measuredangle':
        return '∠'
      case 'pi':
        return 'π'
      case 'infty':
        return 'Infinity'
      case 'exponentialE':
        return 'e'
      case 'imaginaryI':
        return 'i'
      case '%':
        return '%'
      case 'placeholder':
        arg()
        return ''
      case 'langle':
        return '<'
      case 'rangle':
        return '>'
      case 'lbrack':
        return '['
      case 'rbrack':
        return ']'
      case 'begin': {
        // \begin{pmatrix} 3 \\ 4 \end{pmatrix}: a column vector, or any matrix, cell by cell.
        // Rows are split at \\ and cells at &; each cell is a small expression of its own.
        const env = arg().replace(/^\((.*)\)$/, '$1')
        const rows: Tok[][] = [[]]
        let cell: Tok[] = []
        let depth = 0
        while (i < t.length) {
          const tok = next()
          if (tok === '\\begin') depth++
          if (tok === '\\end') {
            if (depth === 0) {
              arg()
              break
            }
            depth--
          }
          if (depth === 0 && tok === '\\\\') {
            rows[rows.length - 1].push(...cell)
            cell = []
            rows.push([])
            continue
          }
          if (depth === 0 && tok === '&') {
            rows[rows.length - 1].push(...cell, '&')
            cell = []
            continue
          }
          cell.push(tok)
        }
        rows[rows.length - 1].push(...cell)
        const parsed = rows
          .filter((r) => r.length)
          .map((r) => {
            const cells: Tok[][] = [[]]
            for (const tok of r) {
              if (tok === '&') cells.push([])
              else cells[cells.length - 1].push(tok)
            }
            return cells.map((c) => latexToMath(c.join(' '), opts) || '0')
          })
        // Bracketed, because mathjs reads "2[[3], [4]]" as a stray operator but "2([[3], [4]])" as
        // a scalar times a column vector, which is how a book writes it.
        const body = `([${parsed.map((r) => `[${r.join(', ')}]`).join(', ')}])`
        return env === 'vmatrix' ? `det${body}` : body
      }
      case 'int': {
        let lo = ''
        let hi = ''
        for (let k = 0; k < 2; k++) {
          if (peek() === '_') {
            next()
            lo = arg()
          } else if (peek() === '^') {
            next()
            hi = arg()
          }
        }
        const bodyToks: string[] = []
        let v = 'x'
        while (i < t.length) {
          // The differential's letter: a lone Latin one (dx) or a Greek one (dθ, d\theta, d\omega). A Greek letter
          // used to be left in the body, so ∫ sinθ dθ read as integrate(sin(θ)·d·θ, x): the engine answered
          // θ·d·x·sin θ and the working agreed with it, so a wrong answer was shown ticked.
          if (peek() === 'd' || peek() === '\\differentialD') {
            const started = i
            next()
            skipSpacing()
            const p = peek() ?? ''
            const greek = p.startsWith('\\') && GREEK[p.slice(1)] !== undefined ? GREEK[p.slice(1)] : GREEK_GLYPHS.has(p) ? p : ''
            // A name of several Latin letters after the d is a word, not a differential: dxy stays in the body.
            if (/^[a-z]$/.test(p) && !/^[a-z]$/.test(t[i + 1] ?? '')) {
              v = next()
              break
            }
            if (greek !== '') {
              next()
              v = greek
              break
            }
            i = started
          }
          if (peek() === '\\mathrm' && t[i + 1] === '{' && t[i + 2] === 'd' && t[i + 3] === '}') {
            i += 4
            v = next()
            break
          }
          bodyToks.push(atom())
        }
        const body = bodyToks.join('').trim()
        return lo || hi ? `integral(${body.replace(new RegExp(`\\b${v}\\b`, 'g'), 'x')}, ${lo}, ${hi})` : `integrate(${body}, ${v})`
      }
      case 'sum':
      case 'prod': {
        let lo = ''
        let hi = ''
        for (let k = 0; k < 2; k++) {
          if (peek() === '_') {
            next()
            lo = arg()
          } else if (peek() === '^') {
            next()
            hi = arg()
          }
        }
        const m = lo.match(/^([a-zA-Z])=(.*)$/)
        const v = m ? m[1] : 'x'
        const from = m ? m[2] : lo
        const body = seq(['=', '<', '>', '\\le', '\\leq', '\\ge', '\\geq', '\\ne', '\\neq'])
        return `${name === 'sum' ? 'sigma' : 'product'}(${body.replace(new RegExp(`\\b${v}\\b`, 'g'), 'x')}, ${from}, ${hi})`
      }
    }
    if (GREEK[name]) return GREEK[name]
    if (FUNCS.has(name) || ARC[name]) {
      let fname = ARC[name] ?? name
      // The maths field writes a typed space as \; (P-FIX-BROWSER F9, so "10 N m" keeps its spaces):
      // after a function's name it is only the space between the name and what it takes, as in
      // "sin 30" — read past it, or \sin\;30 became "sin() 30".
      skipSpacing()
      // \sin^{-1} → asin, \sin^2 x → sin(x)^2
      let power = ''
      if (peek() === '^') {
        const save = i
        next()
        const p = arg()
        if (p === '-1' && INVERSE[fname]) fname = INVERSE[fname]
        else if (p) power = `^(${p})`
        else i = save
        skipSpacing()
      }
      if (fname === 'log' && peek() === '_') {
        next()
        const base = arg()
        skipSpacing() // \log_{2}\;8: the typed space is only the gap before what log takes
        return `log(${base}, ${fnArg()})${power}`
      }
      return `${fname}(${fnArg()})${power}`
    }
    return name
  }

  /** Tokens that can only close a group some caller opened; they never belong inside a bracket's own text. */
  const GROUP_CLOSERS = ['}', '\\right', '\\mright', '\\bigr', '\\Bigr']

  /**
   * The name `text` ends in — a letter or π with any letters and digits after it (x, π, F1; the 2 of
   * 2x is a number in front of the name, not part of it) — or '' when it ends in a number or a
   * symbol. It walks back over the last stretch instead of running a regular expression over the
   * whole text, so a long expression costs no more than a short one.
   */
  const nameAtEnd = (text: string): string => {
    let k = text.length
    while (k > 0 && /[\p{L}\p{N}_]/u.test(text[k - 1])) k--
    const stretch = text.slice(k)
    const first = stretch.search(/[\p{L}_]/u)
    return first < 0 ? '' : stretch.slice(first)
  }

  /**
   * What goes in front of `tok` when `before` is the text written so far: a "*" (or, after i, a
   * space) where the two would be glued into one name, else ''.
   * A root, a function and π come out as sqrt(…), sin(…) and π with nothing in front of them, so a
   * name standing just before one was glued on: x√2 became "xsqrt" (no such function), Aπ became "Api"
   * once π turned into pi, and a·tan 45° became "atan" — a real function, the inverse, so the screen
   * answered 88.7 without a word. Only a name ending the text and one of these tokens coming next
   * count: a number in front (3sqrt(2)), a closing bracket (the (x+1) of (x+1)√2) and another root
   * are products mathjs already reads, and a letter before "(" is a call, f(2), so it gets no sign.
   * The sign is "*", which mathjs and the calculus route read alike (2x*cos(x^(2)), as
   * math/pure/store.ts hands it to the algebra engine); never ×, because in vector mode × is the cross product.
   * The one exception is the imaginary unit, which gets a space: the Complex working reads "i√5" as
   * the implicit product it is, splits "isqrt(5)" that way itself (math/pure/mono.ts writeTimes) and
   * takes a typed sign for a product to multiply out — with a "*", 1/(√2 − i√5) opened with a step
   * that rewrote a sign nobody typed instead of multiplying by the conjugate.
   */
  const gapBefore = (before: string, tok: string): string => {
    if (!tok.startsWith('\\')) return ''
    // \operatorname{atan} writes a function's name the way a computer algebra system's plain LaTeX does, and its text comes out as
    // "atan(...)" the way \sin's does, so a name in front of it used to be glued on: x\operatorname{atan}{x}
    // became the one name xatan, which no reader could take apart and the integral check left unchecked.
    const name = tok.slice(1)
    if (!(name === 'sqrt' || name === 'pi' || name === 'operatorname' || FUNCS.has(name) || ARC[name])) return ''
    const written = nameAtEnd(before)
    return written === '' ? '' : written === 'i' ? ' ' : '*'
  }

  /** Sequence until a closing token. */
  function seq(until: string | string[] | null): string {
    const stops = until === null ? [] : Array.isArray(until) ? until : [until]
    let s = ''
    while (i < t.length && !stops.includes(peek())) s += gapBefore(s, peek()) + atom()
    return s
  }

  const out = seq(null)
  const text = out.replace(/\s+/g, ' ').replace(/(\d)\s+(\d)/g, '$1$2')
  // The ×10ˣ key's number is one number (see standardForm), written out by resolveStandardForm: a plain
  // number in front of the mark joins it, a bracket, a fraction, a root or a letter is scaled by ten to the
  // power instead. A line without the mark is returned exactly as it always was.
  const resolved = text.includes(E10) ? resolveStandardForm(text) : text
  return resolved.trim()
}
