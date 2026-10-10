// LaTeX spoken as plain characters (CLEANUP-PLAN.md CW4): the one reader that turns a piece of
// maths into the words and symbols a sentence can hold — a question's prompt or label, a step's
// words, an imported question's text. Moved here from questions/numbas.ts, where it was written
// for imported Numbas questions; questions/steps.ts and the importer both read through it.

import { texToPlain } from '../math/pure/work'

// --- imported maths spoken as plain characters --------------------------------
//
// texToPlain was written for PhysLab's own generated sentences. Imported Numbas LaTeX is wider: it
// deletes every command it does not know (μ, ∩, ≤, \sin, \infty …), strips every brace (so a script
// such as n+1 loses where it ends), and its \left / \right / \cdot patterns also match the front of
// \rightarrow and \cdots. speakTex therefore turns what it would delete into characters first, takes
// every other command out whole, and brackets a script of more than one symbol.

/** A chip (a variable's value) kept whole through texToPlain, which would otherwise strip its braces. */
const KEEP = '\uE001'
/** A brace the author escaped (`\{`, `\}`): a real brace in the sentence, kept through texToPlain's brace stripping. */
const BRACE_OPEN = '\uE002'
const BRACE_CLOSE = '\uE003'
/** The braces of a `^{…}` or `_{…}` while texToPlain works inside it, so the end of the group is still known afterwards. */
const SCRIPT_OPEN = '\uE004'
const SCRIPT_CLOSE = '\uE005'

// Maps, not plain objects: `\constructor` must not find Object's own property.
const GREEK = new Map(
  Object.entries({
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
    theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο',
    pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ',
    phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω'
  })
)
const FUNCTION_WORDS = new Set(
  'sin cos tan sec csc cot arcsin arccos arctan sinh cosh tanh coth ln log lg exp lim liminf limsup max min sup inf det dim ker arg deg gcd hom Pr'.split(' ')
)
/** Symbols are kept with the spacing the author typed round them: "A \cap B" reads "A ∩ B". */
const SYMBOLS = new Map(
  Object.entries({
    in: '∈', notin: '∉', ni: '∋', cap: '∩', cup: '∪', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇', setminus: '∖',
    le: '≤', leq: '≤', leqslant: '≤', ge: '≥', geq: '≥', geqslant: '≥', ne: '≠', neq: '≠', approx: '≈', equiv: '≡', sim: '∼', cong: '≅',
    propto: '∝', ll: '≪', gg: '≫',
    nexists: '∄', nsubseteq: '⊈', nsubset: '⊄', nsupseteq: '⊉', nsupset: '⊅', nleq: '≰', ngeq: '≱', nless: '≮', ngtr: '≯', nmid: '∤',
    nparallel: '∦', nsim: '≁', ncong: '≇',
    pm: '±', mp: '∓', div: '÷', ast: '*', star: '*', circ: '∘', bullet: '•',
    infty: '∞', emptyset: '∅', varnothing: '∅', partial: '∂', nabla: '∇', sum: '∑', prod: '∏', int: '∫', ell: 'ℓ', hbar: 'ħ',
    forall: '∀', exists: '∃', neg: '¬', land: '∧', wedge: '∧', lor: '∨', vee: '∨', therefore: '∴', because: '∵',
    to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔',
    implies: '⟹', iff: '⟺', mapsto: '↦', uparrow: '↑', downarrow: '↓',
    ldots: '…', dots: '…', cdots: '…', vdots: '⋮', ddots: '⋱',
    angle: '∠', perp: '⊥', parallel: '∥', mid: '|', lt: '<', gt: '>', triangle: '△', prime: '′', degree: '°',
    lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', langle: '⟨', rangle: '⟩', vert: '|', lvert: '|', rvert: '|',
    Vert: '‖', lVert: '‖', rVert: '‖', qquad: ' ',
    // The dotless letters a unit vector's hat sits on (\hat{\imath}).
    imath: 'ı', jmath: 'ȷ'
  })
)
/** The commands texToPlain itself reads. Every other command is taken out here, whole: its `\left`, `\right`, `\cdot` and `\text` patterns match the front of a longer name. */
const TEXTOPLAIN_WORDS = new Set(['frac', 'dfrac', 'sqrt', 'text', 'left', 'right', 'times', 'cdot', 'quad'])
/** The fraction and binomial commands speakFractions reads (texToPlain would delete them and run the two numbers together). */
const FRACTION_WORDS = new Set(['over', 'choose', 'binom', 'dbinom', 'tbinom'])
/** Control symbols (a backslash and one character): braces become marks that survive texToPlain; spacing commands become a space. */
const CONTROL_SYMBOLS = new Map<string, string>([
  ['\\', ' '], ['{', BRACE_OPEN], ['}', BRACE_CLOSE], ['%', '%'], ['&', '&'], ['$', '$'], ['#', '#'],
  [' ', ' '], [',', ' '], [';', ' '], [':', ' '], ['>', ' '], ['!', ''], ['|', '‖'], ['/', ''], ['-', '']
])
const BLACKBOARD = new Map(Object.entries({ N: 'ℕ', Z: 'ℤ', Q: 'ℚ', R: 'ℝ', C: 'ℂ' }))
/** `\not` and the symbol it strikes through: dropping the `\not` of `\not\in` would say the opposite. */
const NEGATED = new Map<string, string>([
  ['\\in', '∉'], ['\\ni', '∌'], ['\\subset', '⊄'], ['\\subseteq', '⊈'], ['\\supset', '⊅'], ['\\supseteq', '⊉'], ['=', '≠'],
  ['\\equiv', '≢'], ['\\approx', '≉'], ['\\sim', '≁'], ['\\cong', '≇'], ['\\le', '≰'], ['\\leq', '≰'],
  ['\\leqslant', '≰'], ['\\ge', '≱'], ['\\geq', '≱'], ['\\geqslant', '≱'], ['<', '≮'], ['>', '≯'], ['\\parallel', '∦'], ['\\mid', '∤'],
  ['\\exists', '∄']
])
/** The combining mark each accent command leaves on its one letter. */
const ACCENTS = new Map(
  Object.entries({
    bar: '̄', overline: '̄', vec: '⃗', overrightarrow: '⃗', hat: '̂', widehat: '̂',
    dot: '̇', ddot: '̈', tilde: '̃', widetilde: '̃'
  })
)
const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉'
const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const asSubscript = (digits: string): string => [...digits].map((d) => SUBSCRIPT_DIGITS[Number(d)]).join('')

/**
 * Commands and marks → characters, left to right so that `\\` and `\{` are read as the two-character
 * commands they are. A space after a Greek letter was only there to end the command (`\mu R`): the
 * page shows μR. A function name gets a space where a letter, digit or group follows (`\sin\theta`).
 */
function speakCommands(tex: string): string {
  return tex
    .replace(/\^\s*(?:\{\s*\\circ\s*\}|\\circ(?![A-Za-z]))/g, '°')
    .replace(/\\(?:mathbb|Bbb)\s*(?:\{\s*([A-Za-z])\s*\}|([A-Za-z]))/g, (_m, braced: string | undefined, bare: string | undefined) => {
      const letter = braced ?? bare ?? ''
      return BLACKBOARD.get(letter) ?? letter
    })
    // The bar of a mean or of a complement stays on its letter (a combining macron): x-bar, not x. So do the
    // arrow of a vector, the hat of a unit vector and the dots of a rate: "F = ma" was what \vec{F} = m\vec{a} lost.
    .replace(
      /\\(bar|overline|vec|overrightarrow|hat|widehat|dot|ddot|tilde|widetilde)(?![A-Za-z])\s*(?:\{\s*(\p{L}|\\[A-Za-z]+)\s*\}|(\p{L}|\\[A-Za-z]+))/gu,
      (_m, accent: string, braced: string | undefined, bare: string | undefined) => (braced ?? bare ?? '') + (ACCENTS.get(accent) ?? '')
    )
    // `\not\in` is ∉: dropping the \not would say the opposite.
    .replace(/\\not\s*(\\[A-Za-z]+|[=<>])/g, (_m, what: string) => NEGATED.get(what) ?? `not ${what}`)
    // An environment's name and its column list are layout, not words.
    .replace(/\\begin\{array\}\{[^{}]*\}/g, ' ')
    .replace(/\\(?:begin|end)\{[A-Za-z]+\*?\}/g, ' ')
    .replace(
      /\\([A-Za-z]+)([ \t]*(?=[A-Za-z]))?|\\([\s\S])|&/g,
      (m: string, word: string | undefined, gap: string | undefined, control: string | undefined, at: number, whole: string): string => {
        // A bare `&` is an alignment mark; `\&` is a control symbol and keeps its character.
        if (word === undefined) return control === undefined ? ' ' : (CONTROL_SYMBOLS.get(control) ?? m)
        const space = gap ?? ''
        const greek = GREEK.get(word)
        if (greek !== undefined) return greek
        const symbol = SYMBOLS.get(word)
        if (symbol !== undefined) return symbol + space
        if (FUNCTION_WORDS.has(word)) {
          const after = whole.slice(at + m.length)
          return word + (space !== '' || !/^(?:[0-9{]|\\(?!left|right))/.test(after) ? space : ' ')
        }
        if (word === 'tfrac') return `\\frac${space}`
        // `\over`, `\choose` and `\binom` are turned into fractions and binomials by speakFractions once the scripts are marked.
        return TEXTOPLAIN_WORDS.has(word) || FRACTION_WORDS.has(word) ? m : space
      }
    )
}

/**
 * `_{12}` → ₁₂ and `_1` → ₁. Any other `^{…}` or `_{…}` has its braces swapped for SCRIPT marks, the
 * closing brace found by counting so a group inside it does not end it early; resolveScripts reads it
 * once texToPlain has worked inside (a fraction in an exponent). A superscript of digits is left
 * as it is: texToPlain writes those.
 */
function markScripts(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if ((c === '^' || c === '_') && s[i + 1] === '{') {
      let depth = 0
      let j = i + 1
      for (; j < s.length; j++) {
        if (s[j] === '{') depth++
        else if (s[j] === '}' && --depth === 0) break
      }
      if (j < s.length) {
        const inner = s.slice(i + 2, j)
        const digits = inner.trim()
        if (/^[0-9]+$/.test(digits)) out += c === '_' ? asSubscript(digits) : `^{${digits}}`
        else out += `${c}${SCRIPT_OPEN}${markScripts(inner)}${SCRIPT_CLOSE}`
        i = j
        continue
      }
    }
    out += c
  }
  return out.replace(/_([0-9])/g, (_m, d: string) => asSubscript(d))
}

/**
 * The other ways TeX writes a fraction or a binomial coefficient: `{a \over b}` becomes `\frac{a}{b}`,
 * which texToPlain reads, and `\binom{n}{r}` or `{n \choose r}` becomes C(n, r) (texToPlain would delete
 * the command and leave "nr", a product). Done after markScripts, whose marks leave the groups
 * it looks at free of nested braces.
 */
function speakFractions(tex: string): string {
  return speakDivisionsAndRoots(
    tex
      .replace(/\{([^{}]*?)\\over(?![A-Za-z])([^{}]*)\}/g, (_m, top: string, bottom: string) => `\\frac{${top}}{${bottom}}`)
      .replace(/\{([^{}]*?)\\choose(?![A-Za-z])([^{}]*)\}/g, (_m, n: string, r: string) => `C(${n.trim()}, ${r.trim()})`)
      .replace(/\\[dt]?binom\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_m, n: string, r: string) => `C(${n.trim()}, ${r.trim()})`)
  )
}

/** One argument of `\frac` or `\sqrt` read from `at`: a braced group (counted, so a group inside it does not end it), a chip, a command with its group, or one character with its accent marks. */
function readArgument(s: string, at: number): { inner: string; end: number } | undefined {
  let i = at
  while (s[i] === ' ' || s[i] === '\t') i++
  if (i >= s.length) return undefined
  if (s[i] === '{') {
    let depth = 0
    for (let j = i; j < s.length; j++) {
      if (s[j] === '{') depth++
      else if (s[j] === '}' && --depth === 0) return { inner: s.slice(i + 1, j), end: j + 1 }
    }
    return undefined
  }
  const m = new RegExp(`^(?:${KEEP}\\d+${KEEP}|\\\\[A-Za-z]+(?:\\{[^{}]*\\})?|[\\p{L}\\p{N}]\\p{M}*)`, 'u').exec(s.slice(i))
  return m ? { inner: m[0], end: i + m[0].length } : undefined
}

/** A part of a fraction or a root as the student will read it: its own fractions, roots, groups and scripts already spoken. */
const plainPart = (tex: string): string => resolveScripts(texToPlain(speakFractions(tex)))
/** One word, one number, one chip or one bracketed group needs no brackets of its own; a script (`τ_xy`, `x^n`) or a second word or term does. */
const isOnePiece = (t: string): boolean => new RegExp(`^-?[\\p{L}\\p{M}\\p{N}.]+$|^${KEEP}\\d+${KEEP}$|^\\([^()]*\\)$`, 'u').test(t)
const bracketed = (t: string): string => (isOnePiece(t) ? t : `(${t})`)

/**
 * `\frac` and `\sqrt`, left to right, each part read through plainPart. texToPlain reads only a flat
 * `\frac{a}{b}` and writes `\sqrt{…}` as √ before an unbracketed argument: a fraction inside a fraction, a space
 * before the brace, TeX's one-character arguments (`\frac 1 2`, `\frac\pi2`), a part holding a group
 * (`\frac{\text{distance}}{\text{time}}`) and an unbraced or indexed root were run together ("1/42",
 * "π2", "distancetime", "√b²-4ac", "2", "[3]x"). A part of more than one word or term is bracketed, and so is the
 * whole fraction when a letter, a bracket, a power, a script, a chip or another fraction or root follows
 * ("(3/10)x", "(2/3)²", "(3/4)π"), not "3/10x" read as 3 ÷ 10x.
 */
function speakDivisionsAndRoots(s: string): string {
  const command = /\\(?:[dt]?frac|sqrt)(?![A-Za-z])/g
  let out = ''
  let from = 0
  for (let m = command.exec(s); m; m = command.exec(s)) {
    let read: string | undefined
    let end = m.index + m[0].length
    if (m[0] === '\\sqrt') {
      const index = /^\s*\[([^\]]*)\]/.exec(s.slice(end))
      if (index) end += index[0].length
      const arg = readArgument(s, end)
      if (arg) {
        const inner = plainPart(arg.inner)
        // A power under the root is bracketed too: √x² could be either (√x)² or √(x²).
        const under = isOnePiece(inner) && !/[⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(inner) ? inner : `(${inner})`
        read = rootSign(index ? plainPart(index[1]) : '') + under
        end = arg.end
      }
    } else {
      const top = readArgument(s, end)
      const bottom = top && readArgument(s, top.end)
      if (top && bottom) {
        // A bottom of a number and a letter is a product: x/2a would read as (x/2)·a, so it is x/(2a).
        const under = plainPart(bottom.inner)
        const flat = `${bracketed(plainPart(top.inner))}/${/^-?[0-9.]+\p{L}/u.test(under) ? `(${under})` : bracketed(under)}`
        const follows = new RegExp(`^\\s*(?:[\\p{L}(^_${KEEP}${SCRIPT_OPEN}]|\\\\(?:left|sqrt|[dt]?frac)(?![A-Za-z]))`, 'u')
        // A fraction after a whole number is a mixed number (2\frac12 is two and a half): it keeps a space after the
        // whole part, never "21/2", and no brackets of its own, "3 1/4 m".
        const before = out + s.slice(from, m.index)
        const mixed = new RegExp(`(?:^|[^\\p{L}\\p{N}\\p{M}^_.)}!${KEEP}${SCRIPT_CLOSE}])[0-9]+(?:\\.[0-9]+)?\\s*$`, 'u').test(before)
        // Written straight after a letter, a power, a chip or a bracket it is a product, and is bracketed: {a}1/2
        // would read 41/2 once the chip is filled in.
        const glued = !mixed && !/\\[A-Za-z]+$/.test(before) && new RegExp(`[\\p{L}\\p{N}\\p{M})}!\\]${KEEP}${SCRIPT_CLOSE}]$`, 'u').test(before)
        read = (mixed && !/\s$/.test(before) ? ' ' : '') + (!mixed && (glued || follows.test(s.slice(bottom.end))) ? `(${flat})` : flat)
        end = bottom.end
      }
    }
    // A command with nothing to read is left for texToPlain to take out.
    if (read === undefined) continue
    out += s.slice(from, m.index) + read
    from = end
    command.lastIndex = end
  }
  return out + s.slice(from)
}

/** The sign of a root with its index: √, ∛, ∜, a raised number or n (⁵√, ⁿ√), else the words "kth root of". */
function rootSign(index: string): string {
  const t = index.trim()
  if (t === '' || t === '2') return '√'
  if (t === '3') return '∛'
  if (t === '4') return '∜'
  if (/^[0-9]+$/.test(t)) return [...t].map((d) => SUPERSCRIPT_DIGITS[Number(d)]).join('') + '√'
  if (t === 'n') return 'ⁿ√'
  return `${bracketed(t)}th root of `
}

/**
 * A script that is one letter, one number or one chip reads bare (`F_MAX`, `x^-1`); anything longer is bracketed (`y_(n-1)`,
 * `x^(1/2)`). A subscript of several letters is a label (`τ_xy`); a power of several is a product (`e^(2x)`, never e^2x).
 */
function resolveScripts(s: string): string {
  const group = new RegExp(`([\\^_])${SCRIPT_OPEN}([^${SCRIPT_OPEN}${SCRIPT_CLOSE}]*)${SCRIPT_CLOSE}`, 'g')
  let prev: string
  do {
    prev = s
    s = s.replace(group, (_m, mark: string, inner: string) => {
      const t = inner.trim()
      // Already one bracketed group (`^{(h)}`): no second pair.
      const bare = mark === '^' ? /^-?(?:[\p{N}.]+|\p{L}\p{M}*|\uE001\d+\uE001)$|^\([^()]*\)$/u : /^-?[\p{L}\p{N}.\uE001]+$|^\([^()]*\)$/u
      return t === '' ? '' : bare.test(t) ? `${mark}${t}` : `${mark}(${t})`
    })
  } while (s !== prev)
  return s.replace(new RegExp(`[${SCRIPT_OPEN}${SCRIPT_CLOSE}]`, 'g'), '')
}

/**
 * One piece of imported LaTeX as a plain sentence. Only `{name}` for a name that is one of the
 * question's variables is a chip (chipLatex has already put a space inside a LaTeX group round a
 * variable's name); any other `{name}` is LaTeX grouping and loses its braces.
 */
export function speakTex(tex: string, names: ReadonlySet<string>): string {
  const chips: string[] = []
  const kept = tex
    .replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (m, name: string) => (names.has(name) ? `${KEEP}${chips.push(name) - 1}${KEEP}` : m))
    // chipLatex's space inside a group round a variable's name only kept it from being filled in; it is a plain group now.
    .replace(/\{ +(?=[A-Za-z][A-Za-z0-9_]*\})/g, '{')
  return (
    resolveScripts(texToPlain(speakFractions(markScripts(speakCommands(kept)))))
      // A brace the author escaped round a variable's name must not read as a chip the player fills in.
      .replace(new RegExp(`${BRACE_OPEN}([A-Za-z][A-Za-z0-9_]*)${BRACE_CLOSE}`, 'g'), (m, name: string) => (names.has(name) ? `{ ${name}}` : m))
      .split(BRACE_OPEN)
      .join('{')
      .split(BRACE_CLOSE)
      .join('}')
      .replace(/\uE001(\d+)\uE001/g, (_m, k: string) => `{${chips[Number(k)]}}`)
  )
}
