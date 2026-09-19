// Converts MathLive (natural textbook math) LaTeX into PhysLab's friendly linear syntax,
// which then goes through math/expr.ts preprocess() into mathjs.
//   \frac{1}{2}      → ((1)/(2))        \sqrt{x}        → sqrt(x)
//   3\hat{i}+4\hat{j} → 3i+4j           \vec{A}\times\vec{B} → A×B (vector mode) or A*B
//   10\angle30^{\circ} → 10∠30°         \left|\vec{A}\right| → |A|
//   \int_{0}^{\pi}\sin x\,dx → integral(sin(x), 0, π)

export interface LatexOptions {
  /** × and · mean cross and dot products (vector calculator) instead of multiplication. */
  vectorOps?: boolean
}

type Tok = string

function tokenize(src: string): Tok[] {
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

const FUNCS = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan', 'ln', 'log', 'exp', 'min', 'max', 'det', 'gcd', 'deg'])
const INVERSE: Record<string, string> = { sin: 'asin', cos: 'acos', tan: 'atan', sinh: 'asinh', cosh: 'acosh', tanh: 'atanh' }
const ARC: Record<string, string> = { arcsin: 'asin', arccos: 'acos', arctan: 'atan' }

const DELIMS: Record<string, string> = {
  '(': '(', ')': ')', '[': '[', ']': ']', '|': '|', '.': '', '\\vert': '|', '\\lvert': '|', '\\rvert': '|', '\\|': '|',
  '\\langle': '<', '\\rangle': '>', '\\lbrack': '[', '\\rbrack': ']', '\\{': '(', '\\}': ')'
}

export function latexToMath(latex: string, opts: LatexOptions = {}): string {
  const t = tokenize(latex)
  let i = 0

  const peek = () => t[i]
  const next = () => t[i++]

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
    if (peek() === '\\left' || peek() === '\\mleft' || peek() === '(') {
      const s = atom()
      return s.startsWith('(') ? s.slice(1, -1) : s
    }
    if (peek() === '{') return arg()
    // \sin x, \sin 2x → take a run of simple tokens (numbers/letters) as the argument.
    let s = ''
    while (i < t.length) {
      if (/^[0-9a-zA-Z.]$|^\\(pi|theta|alpha|beta|phi)$/.test(peek())) s += atom()
      else if (peek() === '^' && (t[i + 1] === '\\circ' || (t[i + 1] === '{' && t[i + 2] === '\\circ' && t[i + 3] === '}'))) s += atom()
      else break
    }
    return s
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
      const a = arg()
      if (a === '°' || a === '(°)') return '°'
      if (a === "'" || a === '\\prime') return "'"
      return `^(${a})`
    }
    if (tok === '_') {
      const a = arg()
      return /^[A-Za-z0-9]+$/.test(a) ? a : `_${a}`
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
        const dm = b.match(/^(?:\(?d\)?|\\differentialD)\s*([a-z])$/)
        if ((a === 'd' || a === '(d)') && dm) {
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
      case 'times':
        return opts.vectorOps ? '×' : '*'
      case 'div':
        return '/'
      case 'pm':
        return '+'
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
          if ((peek() === 'd' || peek() === '\\differentialD') && /^[a-z]$/.test(t[i + 1] ?? '') && (i + 2 >= t.length || !/^[a-z]$/.test(t[i + 2]))) {
            next()
            v = next()
            break
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
        const m = lo.match(/^([a-z])=(.*)$/)
        const v = m ? m[1] : 'x'
        const from = m ? m[2] : lo
        const body = seq(null)
        return `${name === 'sum' ? 'sigma' : 'product'}(${body.replace(new RegExp(`\\b${v}\\b`, 'g'), 'x')}, ${from}, ${hi})`
      }
    }
    if (GREEK[name]) return GREEK[name]
    if (FUNCS.has(name) || ARC[name]) {
      let fname = ARC[name] ?? name
      // \sin^{-1} → asin, \sin^2 x → sin(x)^2
      let power = ''
      if (peek() === '^') {
        const save = i
        next()
        const p = arg()
        if (p === '-1' && INVERSE[fname]) fname = INVERSE[fname]
        else if (p) power = `^(${p})`
        else i = save
      }
      if (fname === 'log' && peek() === '_') {
        next()
        const base = arg()
        return `log(${base}, ${fnArg()})${power}`
      }
      return `${fname}(${fnArg()})${power}`
    }
    return name
  }

  /** Sequence until a closing token. */
  function seq(until: string | string[] | null): string {
    const stops = until === null ? [] : Array.isArray(until) ? until : [until]
    let s = ''
    while (i < t.length && !stops.includes(peek())) s += atom()
    return s
  }

  const out = seq(null)
  return out
    .replace(/\s+/g, ' ')
    .replace(/(\d)\s+(\d)/g, '$1$2')
    .trim()
}
