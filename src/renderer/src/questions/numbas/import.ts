// Reading an .exam into a PhysLab question file (PQFile).
// Pure moves from questions/numbas.ts (CW10a). Headless: no React, no store, no DOM.

import { math, symbolsOf } from '../../math/expr'
import { licenseFromNumbas, refusalSentence } from '../license'
import { speakTex } from '../speak'
import {
  DEFAULT_BAND,
  formatVersionOf,
  RESERVED_NAMES,
  UNIT_IDS,
  VARIABLE_NAME,
  type License,
  type PQFile,
  type PQPart,
  type PQQuestion,
  type PQStep,
  type PQVariable,
  type Tolerance,
  type UnitId,
  type VariableDef
} from '../pqjson'
import { unitInPrompt } from '../units'
import { isRecord as isObj } from '../../core/schema'
import {
  JmeRefusal,
  emit,
  jmeToMath,
  jmeToVariableDef,
  parseJme,
  type JmeNode
} from './jme'
import {
  NUMBAS_MAX_RUNS,
  Skip,
  UNIT_LINE,
  asString,
  nonEmpty,
  num,
  precisionBand,
  readCarried,
  readNumberAnswer,
  replaces,
  statedPrecision,
  tryGet,
  type NumberAnswer,
  type Obj,
  type QuestionRead,
  type TextContext
} from './marking'

// ===========================================================================
// Reading an .exam
// ===========================================================================

interface ExamImport {
  file: PQFile
  /** One plain sentence per skipped question or per thing worth telling the teacher. */
  report: string[]
}

// --- HTML → lines ------------------------------------------------------------

/**
 * The named entities of HTML 4 (252 names) and `apos`, which XML adds: Numbas text is the HTML its
 * editor writes, and the editor spells é, €, ü, φ and the curly quotes as names. The cached bank
 * uses 86 of them, every one HTML 4's. The spaces are written as a plain space, and the soft
 * hyphen and the zero-width marks as nothing.
 */
const ENTITIES: Record<string, string> = {
  // Markup
  quot: '"', amp: '&', apos: "'", lt: '<', gt: '>',
  // Latin-1: accents, currency, fractions
  nbsp: ' ', iexcl: '¡', cent: '¢', pound: '£', curren: '¤', yen: '¥', brvbar: '¦', sect: '§',
  uml: '¨', copy: '©', ordf: 'ª', laquo: '«', not: '¬', shy: '', reg: '®', macr: '¯', deg: '°',
  plusmn: '±', sup2: '²', sup3: '³', acute: '´', micro: 'µ', para: '¶', middot: '·', cedil: '¸',
  sup1: '¹', ordm: 'º', raquo: '»', frac14: '¼', frac12: '½', frac34: '¾', iquest: '¿', Agrave: 'À',
  Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å', AElig: 'Æ', Ccedil: 'Ç', Egrave: 'È',
  Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë', Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î', Iuml: 'Ï', ETH: 'Ð',
  Ntilde: 'Ñ', Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', times: '×', Oslash: 'Ø',
  Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü', Yacute: 'Ý', THORN: 'Þ', szlig: 'ß', agrave: 'à',
  aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ', ccedil: 'ç', egrave: 'è',
  eacute: 'é', ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï', eth: 'ð',
  ntilde: 'ñ', ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', divide: '÷', oslash: 'ø',
  ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý', thorn: 'þ', yuml: 'ÿ',
  // Greek letters
  fnof: 'ƒ', Alpha: 'Α', Beta: 'Β', Gamma: 'Γ', Delta: 'Δ', Epsilon: 'Ε', Zeta: 'Ζ', Eta: 'Η',
  Theta: 'Θ', Iota: 'Ι', Kappa: 'Κ', Lambda: 'Λ', Mu: 'Μ', Nu: 'Ν', Xi: 'Ξ', Omicron: 'Ο',
  Pi: 'Π', Rho: 'Ρ', Sigma: 'Σ', Tau: 'Τ', Upsilon: 'Υ', Phi: 'Φ', Chi: 'Χ', Psi: 'Ψ',
  Omega: 'Ω', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο',
  pi: 'π', rho: 'ρ', sigmaf: 'ς', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ',
  psi: 'ψ', omega: 'ω', thetasym: 'ϑ', upsih: 'ϒ', piv: 'ϖ',
  // Punctuation, dashes, spaces
  bull: '•', hellip: '…', prime: '′', Prime: '″', oline: '‾', frasl: '⁄', weierp: '℘', image: 'ℑ',
  real: 'ℜ', trade: '™', alefsym: 'ℵ', larr: '←', uarr: '↑', rarr: '→', darr: '↓', harr: '↔',
  crarr: '↵', lArr: '⇐', uArr: '⇑', rArr: '⇒', dArr: '⇓', hArr: '⇔', forall: '∀', part: '∂',
  exist: '∃', empty: '∅', nabla: '∇', isin: '∈', notin: '∉', ni: '∋', prod: '∏', sum: '∑',
  minus: '−', lowast: '∗', radic: '√', prop: '∝', infin: '∞', ang: '∠', and: '∧', or: '∨',
  cap: '∩', cup: '∪', int: '∫', there4: '∴', sim: '∼', cong: '≅', asymp: '≈', ne: '≠',
  equiv: '≡', le: '≤', ge: '≥', sub: '⊂', sup: '⊃', nsub: '⊄', sube: '⊆', supe: '⊇',
  oplus: '⊕', otimes: '⊗', perp: '⊥', sdot: '⋅', lceil: '⌈', rceil: '⌉', lfloor: '⌊', rfloor: '⌋',
  lang: '⟨', rang: '⟩', loz: '◊', spades: '♠', clubs: '♣', hearts: '♥', diams: '♦',
  ensp: ' ', emsp: ' ', thinsp: ' ', zwnj: '', zwj: '', lrm: '', rlm: '', ndash: '–',
  mdash: '—', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„', dagger: '†',
  Dagger: '‡', permil: '‰', lsaquo: '‹', rsaquo: '›', euro: '€'
}

function decodeEntities(html: string): string {
  return html.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g, (m, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = parseInt(body.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    if (body.startsWith('#')) {
      const code = parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    // Object.prototype names (constructor, toString) are not HTML entities; looking up a body
    // of that name is a function whose source text would have been put into the sentence.
    return Object.prototype.hasOwnProperty.call(ENTITIES, body) ? ENTITIES[body] : m
  })
}

/**
 * A `{…}` or `\var{…}` in Numbas text shows a value. A plain variable name becomes the same
 * chip in PhysLab; an expression (`{a*b}`) becomes a chip on a new formula variable, because
 * PhysLab's chips name variables and nothing else — the author then sees where the number
 * comes from in the Variables tab.
 */
function chipFor(inner: string, ctx: TextContext): string {
  const src = inner.trim()
  if (VARIABLE_NAME.test(src)) {
    if (ctx.names.has(src)) return `{${src}}`
    // A matrix variable is a variable, just not one PhysLab can show — say so, not "no variable".
    if (ctx.matrices.has(src)) throw new Skip(`shows the matrix ${src} in its text, which PhysLab can only take as an answer`)
    throw new Skip(`shows {${src}} in its text, but there is no variable called ${src}`)
  }
  let expr: string
  try {
    expr = jmeToMath(src, 'radians')
  } catch (e) {
    if (e instanceof JmeRefusal) throw new Skip(`uses ${e.what} in its text, which PhysLab does not know`)
    throw e
  }
  let name: string
  do {
    ctx.made++
    name = `shown${ctx.made}`
  } while (ctx.names.has(name))
  ctx.names.add(name)
  ctx.vars.push({ name, def: { kind: 'expr', expr }, description: `Shown in the text: ${src}` })
  return `{${name}}`
}

/**
 * The inside of a `\(…\)` or `\[…\]`. Numbas substitutes only `\var{…}` in LaTeX; a bare group
 * such as the `{a}` of `\frac{a}{b}` is LaTeX, and it must not become a chip when `a` is also a
 * variable's name — a space inside the group keeps `substitute` off it and KaTeX does not mind.
 */
function chipLatex(tex: string, ctx: TextContext): string {
  if (/\\simplify\b/.test(tex)) throw new Skip('uses \\simplify, which PhysLab cannot show')
  return tex
    .replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (m, name: string) => (ctx.names.has(name) ? `{ ${name}}` : m))
    .replace(/\\var\{([^{}]*)\}/g, (_m, inner: string) => chipFor(inner, ctx))
}

/**
 * Plain text between the maths: `{…}` and `\var{…}` both show a value. A brace written `\{` or `\}`
 * is a brace, not the start or end of a value: Numbas's own splitter skips the character after a
 * backslash (util.splitbrackets), so `\{1, 2, 3\}` is words. It is kept as the brace it names; round
 * a variable's name (`\{a\}`) it gets a space inside, as a LaTeX group does in chipLatex, because
 * the player fills in any `{a}` and the author meant the letter.
 */
function chipText(text: string, ctx: TextContext): string {
  // One pass for the values, so the variables made for expressions are numbered in reading order.
  // A backslash and the character after it are one unit, as Numbas reads them: `\\{a}` is a
  // backslash and then a value, and `\{a\}` has no value in it.
  return text
    .replace(/\\var\{((?:[^{}\\]|\\[\s\S])*)\}|\\[\s\S]|\{((?:[^{}\\]|\\[\s\S])*)\}/g, (m, a: string | undefined, b: string | undefined) =>
      a !== undefined || b !== undefined ? chipFor(a ?? b ?? '', ctx) : m
    )
    .replace(/\\\{([A-Za-z][A-Za-z0-9_]*)\\\}|\\([\s\S])/g, (m, name: string | undefined, c: string | undefined) =>
      name !== undefined ? `{ ${name}}` : c === '{' || c === '}' ? c : m
    )
}

// A tag or comment is matched wherever maths is looked for, only so it can be stepped over: a `$`
// inside an attribute starts nothing, and maths may not run past one. `<` followed by a letter,
// `/` or `!` is where a browser starts a tag (`x < 3` is not one), and a `>` inside a quoted
// attribute does not end it.
const TAG = String.raw`<!--[\s\S]*?-->|<[A-Za-z/!](?:[^>"']|"[^"]*"|'[^']*')*>`
/**
 * Where maths starts in Numbas text: `$$`, `$`, `\(`, `\[` or `\begin{env}`, the order Numbas's
 * own reader (`contentsplitbrackets`) tries them in. Most of the public bank writes inline maths
 * as `$…$`; read as plain text, every LaTeX group in it (the `{-1}` of `ms^{-1}`) was taken for a
 * Numbas `{…}` value and became a made-up variable. `\$` is a dollar sign, as MathJax prints it.
 */
const MATHS_START = new RegExp(String.raw`${TAG}|\\\$|\$\$|\$|\\\(|\\\[|\\begin\{([A-Za-z]+\*?)\}`, 'g')
/** A line break or comment inside maths is only the editor's layout; any other tag ends the paragraph the maths had to close in. */
const SOFT_TAG = /^(?:<!--|<\s*w?br\b)/i

/**
 * The words from `from` to the end of its paragraph: to the first tag that is not a line break or
 * comment. The line breaks and comments crossed on the way are taken out: they are layout, and what
 * is inside a comment (a backslash, a brace) is not on the page, so it is no LaTeX left unclosed.
 */
function restOfParagraph(html: string, from: number): string {
  const re = new RegExp(TAG, 'g')
  re.lastIndex = from
  let end = html.length
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (!SOFT_TAG.test(m[0])) {
      end = m.index
      break
    }
  }
  return html.slice(from, end).replace(new RegExp(TAG, 'g'), ' ')
}

/** Where the maths opened by `start` ends: its closing delimiter's index and the index just past it, or null when a tag comes first. */
function closeOf(html: string, from: number, start: string, env: string | undefined): { at: number; end: number } | null {
  const close =
    start === '$'
      ? String.raw`\$`
      : start === '$$'
        ? String.raw`\$\$`
        : start === '\\('
          ? String.raw`\\\)`
          : start === '\\['
            ? String.raw`\\\]`
            : String.raw`\\end\{${(env ?? '').replace('*', '\\*')}\}`
  const re = new RegExp(String.raw`${TAG}|\\\$|${close}`, 'g')
  re.lastIndex = from
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[0] === '\\$') continue
    if (m[0][0] === '<') {
      if (SOFT_TAG.test(m[0])) continue
      return null
    }
    return { at: m.index, end: m.index + m[0].length }
  }
  return null
}

/** Where a lifted maths span sat in the text while the tags were stripped (a private-use character no page holds). */
const MARK = '\uE000'
const MARKED = /\uE000(\d+)\uE000/g
const ONLY_MARK = /^\uE000\d+\uE000$/

/**
 * The maths of Numbas HTML lifted out into `spans`, each replaced by a MARK, found as MathJax
 * finds it in the page Numbas shows: opened and closed within one paragraph, across nothing but
 * line breaks. A `$` with no partner there is a dollar sign ("costs $5") — unless LaTeX follows
 * it in its paragraph: that is maths its author never closed, which Numbas itself shows as raw
 * LaTeX, and a `$$`, `\(`, `\[` or `\begin` with no partner would pair with the next maths
 * PhysLab shows. Either way its question is skipped.
 */
function liftMaths(html: string, spans: { tex: string; display: boolean }[]): string {
  let out = ''
  let copied = 0
  const starts = new RegExp(MATHS_START.source, 'g')
  for (let m = starts.exec(html); m; m = starts.exec(html)) {
    const start = m[0]
    if (start[0] === '<' || start === '\\$') continue
    const from = m.index + start.length
    const close = closeOf(html, from, start, m[1])
    if (close === null) {
      // Numbas reads the rest of the paragraph as maths too: a \var{…} there still shows its
      // value ("costs $\var{p}" reads "costs $12"), but none of its {…} were values and any other
      // command showed its backslash. A lone $$ is left out: PhysLab reads a line starting $$ as
      // display maths.
      if (start === '$' && !/\\(?!\$)|[{}]/.test(restOfParagraph(html, from).replace(/\\var\{[^{}]*\}/g, ''))) continue
      throw new Skip(`opens maths with ${start} but never closes it in the same paragraph`)
    }
    const env = start.startsWith('\\begin')
    const inner = html.slice(from, close.at).replace(new RegExp(TAG, 'g'), ' ')
    const tex = decodeEntities(env ? `${start}${inner}${html.slice(close.at, close.end)}` : inner).trim()
    out += html.slice(copied, m.index)
    copied = close.end
    starts.lastIndex = close.end
    // \[\] shows nothing in Numbas, so there is nothing to lift.
    if (tex === '') continue
    const display = start !== '$' && start !== '\\('
    spans.push({ tex, display })
    out += display ? `\n${MARK}${spans.length - 1}${MARK}\n` : `${MARK}${spans.length - 1}${MARK}`
  }
  return out + html.slice(copied)
}

/**
 * Numbas HTML → the lines of a PhysLab statement: plain text with chips, display maths on a
 * line of its own starting `$$`, inline maths kept as `\(…\)`. Maths is lifted out before the
 * tags go, so an `x < 3` inside it is not mistaken for a tag. A picture, table or frame is
 * something PhysLab has nowhere to show, so the question is skipped rather than shown short.
 */
function htmlToLines(html: string, ctx: TextContext): string[] {
  if (/<\s*(img|table|iframe)\b/i.test(html)) throw new Skip('has a picture or table PhysLab cannot show')
  // A chip shows a number to the student's precision; a fraction or a matrix layout it cannot
  // give, and \var[…]{x} read as the chip {x} left "\var[fractionNumbers]" for KaTeX to refuse.
  const styled = /\\var\s*(\[[^\]]*\])/.exec(html)
  if (styled) throw new Skip(`shows a value with \\var${styled[1]}, which PhysLab cannot show`)
  const spans: { tex: string; display: boolean }[] = []
  const lifted = liftMaths(html, spans)
  const text = decodeEntities(
    lifted
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
      .replace(/<\s*(li|tr)\b[^>]*>/gi, '\n')
      .replace(new RegExp(TAG, 'g'), '')
  )
  // Chips are read in the order they appear, text and maths alike, so the variables made for
  // expressions in the text are numbered the way a reader meets them.
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .map((line) => {
      if (ONLY_MARK.test(line)) {
        const span = spans[Number(line.slice(1, -1))]
        return span.display ? `$$${chipLatex(span.tex, ctx)}$$` : `\\(${chipLatex(span.tex, ctx)}\\)`
      }
      return line
        .split(MARKED)
        .map((piece, k) => (k % 2 === 1 ? `\\(${chipLatex(spans[Number(piece)].tex, ctx)}\\)` : chipText(piece, ctx).replace(/\\\$/g, '$')))
        .join('')
    })
}

/** A plain sentence from a line: inline maths spoken (speakTex), chips of the question's variables kept whole. */
function spoken(line: string, names: ReadonlySet<string>): string {
  return line.replace(/\\\(([\s\S]*?)\\\)/g, (_m, tex: string) => speakTex(tex, names))
}

const NO_NAMES: ReadonlySet<string> = new Set()

/**
 * A question's title is a plain string, but its author may write maths in it between dollar signs
 * ("apply $F=ma$ and $W=mg$"), and a title is nowhere a value is filled in, so every {name} in it
 * is LaTeX grouping. The maths is spoken as a step's words are. A `$` opens maths only before a
 * character that is not a space and closes it only after one and before no digit (pandoc's rule),
 * so "from $5 to $10" stays two prices; `\$` is a dollar sign.
 */
function spokenTitle(title: string): string {
  return title.replace(
    /\\\$|\$\$([^$]+)\$\$|\\\(([\s\S]*?)\\\)|\$(?=\S)([^$]*[^$\s])\$(?!\d)/g,
    (m: string, display: string | undefined, paren: string | undefined, inline: string | undefined) =>
      m === '\\$' ? '$' : speakTex(display ?? paren ?? inline ?? '', NO_NAMES)
  )
}

/**
 * Lines → steps. A line of text is a step's head; a display-maths line becomes the `tex` of
 * the step before it when that step has none, and otherwise a step of its own whose head is
 * the maths spoken, so a student reading only the heads still follows.
 */
function linesToSteps(lines: string[], names: ReadonlySet<string>): PQStep[] {
  const out: PQStep[] = []
  for (const line of lines) {
    if (line.startsWith('$$')) {
      const tex = line.slice(2, -2)
      const last = out[out.length - 1]
      if (last && last.tex === undefined) last.tex = tex
      else out.push({ head: spoken(`\\(${tex}\\)`, names), tex, blank: false })
    } else out.push({ head: spoken(line, names), blank: false })
  }
  return out
}

// --- one question ------------------------------------------------------------

/** Free names in a mathjs expression that are neither the question's variables nor the calculator's own. */
function freeSymbols(expr: string, names: Set<string>): string[] {
  const found = symbolsOf(math.parse(expr))
  return [...new Set(found)].filter((n) => {
    if (names.has(n) || RESERVED_NAMES.has(n)) return false
    const t = math.typeOf((math as unknown as Record<string, unknown>)[n])
    return t !== 'number' && t !== 'Complex' && t !== 'boolean'
  })
}

function refuse(e: unknown, where: string): never {
  if (e instanceof JmeRefusal) throw new Skip(`${where} uses ${e.what}, which PhysLab does not know`)
  throw e
}

/** A stable id from the question's own text, so importing the same file twice gives the same ids. */
function stableId(raw: unknown): string {
  const text = JSON.stringify(raw)
  let h = 5381
  for (let i = 0; i < text.length; i++) h = (h * 33) ^ text.charCodeAt(i)
  return `numbas-${(h >>> 0).toString(16).padStart(8, '0')}`
}

/** The rows of a matrix written out entry by entry — `matrix([1, 2], [3, 4])` or `matrix([[1, 2], [3, 4]])` — or null. */
function matrixRows(n: JmeNode): JmeNode[][] | null {
  if (n.t !== 'call' || n.f !== 'matrix' || n.args.length === 0) return null
  const lists = n.args.length === 1 && n.args[0].t === 'list' && n.args[0].items.every((r) => r.t === 'list') ? n.args[0].items : n.args
  if (!lists.every((r) => r.t === 'list')) return null
  const rows = (lists as Extract<JmeNode, { t: 'list' }>[]).map((r) => r.items)
  // No rows (`matrix([])`), a row that is itself a list of lists, or rows of different lengths, is no matrix to type box by box.
  if (rows.length === 0 || rows[0].length === 0 || rows.some((r) => r.length !== rows[0].length || r.some((e) => e.t === 'list'))) return null
  return rows
}

function readVariables(raw: unknown, ordered: string[], matrices: Map<string, JmeNode> = new Map()): PQVariable[] {
  if (!isObj(raw)) return []
  const keys = [...ordered.filter((k) => k in raw), ...Object.keys(raw).filter((k) => !ordered.includes(k))]
  const out: PQVariable[] = []
  const seen = new Set<string>()
  for (const key of keys) {
    const v = raw[key]
    if (!isObj(v)) continue
    const name = asString(v.name) || key
    if (!VARIABLE_NAME.test(name)) throw new Skip(`has a variable named '${name}', which is not a name PhysLab can use`)
    if (RESERVED_NAMES.has(name)) throw new Skip(`uses '${name}' as a variable name, but that already means something in maths`)
    if (seen.has(name)) continue
    seen.add(name)
    // A matrix written out entry by entry is kept for the matrix part that names it (format 2).
    try {
      const node = parseJme(asString(v.definition))
      if (matrixRows(node)) {
        matrices.set(name, node)
        continue
      }
    } catch {
      // Not readable as JME: jmeToVariableDef below says why in its own sentence.
    }
    let def: VariableDef
    try {
      def = jmeToVariableDef(asString(v.definition))
    } catch (e) {
      refuse(e, `variable ${name}`)
    }
    const pv: PQVariable = { name, def }
    const about = decodeEntities(asString(v.description).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
    if (about) pv.description = about
    out.push(pv)
  }
  return out
}

/** A plain sentence from a line that may be display maths (`$$…$$`): its maths is spoken as inline maths is. */
function spokenLine(line: string, names: ReadonlySet<string>): string {
  return line.length > 4 && line.startsWith('$$') && line.endsWith('$$') ? spoken(`\\(${line.slice(2, -2)}\\)`, names) : spoken(line, names)
}

/**
 * One step's lines with each run of lines of words made one line, so a step keeps one head for a
 * stretch of words as it always had, and its display maths stays in its place between the runs.
 */
function joinWordRuns(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) {
    const last = out[out.length - 1]
    if (last !== undefined && !last.startsWith('$$') && !line.startsWith('$$')) out[out.length - 1] = `${last} ${line}`
    else out.push(line)
  }
  return out
}

/**
 * One part's steps, in the file's order: a Numbas step's words are a head and the display
 * equation after them its maths. A second equation in the same step, or words after one, make a
 * step of their own (linesToSteps) instead of being dropped or folded into the first head.
 */
function readSteps(steps: unknown, ctx: TextContext, into: PQStep[]): void {
  if (!Array.isArray(steps)) return
  for (const s of steps) {
    if (!isObj(s)) continue
    into.push(...linesToSteps(joinWordRuns(htmlToLines(asString(tryGet(s, 'prompt')), ctx)), ctx.names))
  }
}

function readChoicePart(p: Obj, label: string, promptLines: string[], ctx: TextContext, read: QuestionRead, marks: number): void {
  const rawChoices = tryGet(p, 'choices')
  if (!Array.isArray(rawChoices)) throw new Skip(`${label} makes its choices with Numbas scripting`)
  const matrix = tryGet(p, 'matrix')
  if (!Array.isArray(matrix)) throw new Skip(`${label} marks its choices with Numbas scripting`)
  const scores = matrix.map((row) => {
    const cell = Array.isArray(row) ? row[0] : row
    if (typeof cell === 'boolean') return cell ? 1 : 0
    const v = Number(cell)
    if (!Number.isFinite(v) || (typeof cell === 'string' && cell.trim() === '')) throw new Skip(`${label} marks its choices with Numbas scripting`)
    return v
  })
  const whys = tryGet(p, 'distractors')
  const choices = rawChoices.map((c, k) => {
    // A choice and its why are plain sentences: display maths in them is spoken too (spokenLine).
    const text = htmlToLines(asString(c), ctx).map((line) => spokenLine(line, ctx.names)).join(' ')
    const why = Array.isArray(whys) ? htmlToLines(asString(whys[k]), ctx).map((line) => spokenLine(line, ctx.names)).join(' ') : ''
    const choice: { text: string; correct: boolean; why?: string } = { text, correct: (scores[k] ?? 0) > 0 }
    if (why) choice.why = why
    return choice
  })
  if (!choices.some((c) => c.correct)) throw new Skip(`${label} has no right answer among its choices`)
  const maxMarks = Number(tryGet(p, 'maxMarks'))
  let worth = Math.max(marks > 0 ? marks : 0, maxMarks > 0 ? maxMarks : 0, ...scores)
  if (!(worth > 0)) {
    read.notes.push(`${label} was worth 0 marks in Numbas; PhysLab counts it as 1`)
    worth = 1
  }
  read.parts.push({ type: 'choice', prompt: promptLines.join('\n'), choices, shuffle: tryGet(p, 'shuffleChoices') === true, marks: worth })
}

function readMatrixPart(p: Obj, label: string, promptLines: string[], ctx: TextContext, read: QuestionRead, marks: number): void {
  const src = asString(tryGet(p, 'correctAnswer')).trim()
  if (src === '') throw new Skip(`gives no answer for ${label}`)
  const unreadable = new Skip(`gives the answer to ${label} as ${src}, which PhysLab can read only as a matrix written out entry by entry`)
  let node: JmeNode
  try {
    node = parseJme(src)
  } catch (e) {
    if (e instanceof JmeRefusal) throw unreadable
    throw e
  }
  if (node.t === 'name' && ctx.matrices.has(node.v)) node = ctx.matrices.get(node.v)!
  const rows = matrixRows(node)
  if (!rows) throw unreadable
  let answer: string[][]
  try {
    answer = rows.map((r) => r.map((e) => emit(e, 'radians').s))
  } catch (e) {
    refuse(e, label)
  }
  // Only a real JSON number counts as a stated gap: null, "" or a stray string coerce to 0 through
  // Number() just as a deliberate 0 does, and a hand-edited or third-party file writing one of
  // those means "nothing set", not "match exactly".
  const rawTolerance = tryGet(p, 'tolerance')
  const gap = typeof rawTolerance === 'number' ? rawTolerance : NaN
  const precision = statedPrecision(tryGet(p, 'precision'))
  const precisionType = asString(tryGet(p, 'precisionType'))
  // A relative band has no Numbas equivalent (its tolerance is one absolute gap), so it goes out
  // as an exact 0 with the true value tucked into precisionMessage (writeMatrixPart, below) — a
  // plain Numbas install reads it as exact, but a round trip through PhysLab restores the band.
  // The marker is trusted only while the file still looks like PhysLab's own untouched export
  // (tolerance still 0, no precision restriction): an explicit tolerance or precision the file
  // now carries is a teacher's own edit and wins over a stale marker from before that edit.
  const relBack = /^\[physlab:tolerance=relative:([0-9.]+(?:e-?\d+)?)]$/.exec(asString(tryGet(p, 'precisionMessage')))
  const band = precisionBand(precisionType, precision)
  let tolerance: Tolerance
  if (gap > 0) tolerance = { kind: 'absolute', value: gap }
  else if (relBack && gap === 0 && precisionType === 'none' && Number.isFinite(Number(relBack[1]))) tolerance = { kind: 'relative', value: Number(relBack[1]) }
  // Numbas's own default for an untouched matrix part is tolerance 0 with no precision
  // restriction, and that is also exactly how it marks an author's deliberate exact-match part —
  // the two are the same JSON, and Numbas treats both as exact. PhysLab used to read the same
  // zero as "nothing set" and loosen it to the app's 2% default, marking a wrong-by-up-to-2%
  // entry as right when the question demanded an exact match.
  else if (gap === 0 && precisionType !== 'dp' && precisionType !== 'sigfig') tolerance = { kind: 'absolute', value: 0 }
  else if (band) tolerance = band
  else {
    // Decimal places or significant figures asked for without a number that can be read (blank, a
    // variable's name): not "no precision", so the app's 2 % stands in and the report says so, as it
    // does for a number box.
    if (precisionType === 'dp' || precisionType === 'sigfig') {
      read.notes.push(`${label}: PhysLab could not read how many ${precisionType === 'dp' ? 'decimal places' : 'significant figures'} it asks for, so it accepts ${num(2)} %`)
    }
    tolerance = { ...DEFAULT_BAND }
  }
  if (tryGet(p, 'allowResize') === true) read.notes.push(`${label} lets the student choose the size of the matrix in Numbas; PhysLab shows a box for each entry`)
  const part: PQPart = { type: 'matrix', prompt: promptLines.join('\n'), answer, tolerance, marks }
  if (tryGet(p, 'allowFractions') === true) part.allowFractions = true
  if (tryGet(p, 'markPerCell') === true) part.markPerCell = true
  read.parts.push(part)
}

/**
 * The parts of a question, or the gaps of a gap-fill, in order. `prefix` is how Numbas names
 * them (`p` for parts, `p0g` for the gaps of the first), so that adaptive marking, which names
 * the part whose answer it uses, can be matched to the PhysLab part it became. A gap-fill's own
 * adaptive marking is Numbas's way of setting it for its gaps, so it is handed down to them.
 */
function readParts(rawParts: unknown, ctx: TextContext, read: QuestionRead, where: string, prefix = 'p', parent?: Obj): void {
  if (!Array.isArray(rawParts)) return
  rawParts.forEach((p, i) => {
    if (!isObj(p)) return
    const label = `${where}part ${num(i + 1)}`
    const path = `${prefix}${i}`
    const type = asString(tryGet(p, 'type'))
    const at = read.parts.length
    readSteps(tryGet(p, 'steps'), ctx, read.steps)
    if (type === 'information') {
      read.statementLines.push(...htmlToLines(asString(tryGet(p, 'prompt')), ctx))
      return
    }
    if (type === 'gapfill') {
      const gaps = tryGet(p, 'gaps')
      const lead = htmlToLines(asString(tryGet(p, 'prompt')).replace(/\[\[\d+\]\]/g, '___'), ctx)
      if (!Array.isArray(gaps) || gaps.length === 0) {
        read.statementLines.push(...lead)
        return
      }
      // PhysLab writes the unit of a vector or of a set of roots once, as the last line of the
      // gap-fill's prompt ("Give your answer in m."), and gives its boxes no prompt of their own.
      // That line is the unit of every box that names none, not a sentence for the first box.
      const written = UNIT_LINE.exec(lead[lead.length - 1] ?? '')
      const unit = written && (UNIT_IDS as readonly string[]).includes(written[1]) ? (written[1] as UnitId) : null
      if (unit) lead.pop()
      readParts(gaps, ctx, read, `${label}, `, `${path}g`, replaces(p) ? p : parent)
      if (unit) {
        let taken = false
        for (const box of read.parts.slice(at)) {
          if (box.type === 'number' && box.unit === 'none') {
            box.unit = unit
            taken = true
          }
        }
        // No box took it (every gap an expression, a choice or a matrix, or each number box naming a
        // unit of its own): the sentence is then the only place the student reads the unit, so it stays
        // in the prompt, last, where it was.
        if (!taken && written) lead.push(written[0])
      }
      const first = read.parts[at]
      if (first && lead.length > 0) first.prompt = [...lead, first.prompt].filter((l) => l !== '').join('\n')
      // A gap-fill of one gap answers with that gap's number, so a later part may name either.
      if (read.parts.length === at + 1) read.paths.set(path, at)
      return
    }
    readOnePart(p, type, label, ctx, read)
    if (read.parts.length !== at + 1) return
    read.paths.set(path, at)
    if (replaces(p)) read.carried.push({ index: at, label, source: p, inherited: false })
    else if (parent) read.carried.push({ index: at, label, source: parent, inherited: true })
  })
}

/** One part that is not a gap-fill or information: it becomes exactly one PhysLab part, or the question is skipped. */
function readOnePart(p: Obj, type: string, label: string, ctx: TextContext, read: QuestionRead): void {
  const promptLines = htmlToLines(asString(tryGet(p, 'prompt')), ctx)
  let marks = Number(tryGet(p, 'marks'))
  if (type === '1_n_2' || type === 'm_n_2') {
    readChoicePart(p, label, promptLines, ctx, read, marks)
    return
  }
  if (type !== 'numberentry' && type !== 'jme' && type !== 'matrix') throw new Skip(`uses a ${type || 'nameless'} part PhysLab does not read`)
  if (!(marks > 0)) {
    read.notes.push(`${label} was worth 0 marks in Numbas; PhysLab counts it as 1`)
    marks = 1
  }
  if (type === 'matrix') {
    readMatrixPart(p, label, promptLines, ctx, read, marks)
    return
  }
  if (type === 'numberentry') {
    let unit: UnitId
    const last = promptLines[promptLines.length - 1]
    const written = last === undefined ? null : UNIT_LINE.exec(last)
    if (written && (UNIT_IDS as readonly string[]).includes(written[1])) {
      unit = written[1] as UnitId
      promptLines.pop()
    } else unit = unitInPrompt(promptLines.join(' '))
    const precision = statedPrecision(tryGet(p, 'precision'))
    let got: NumberAnswer
    try {
      got = readNumberAnswer(
        asString(tryGet(p, 'minValue')),
        asString(tryGet(p, 'maxValue')),
        asString(tryGet(p, 'precisionType')),
        Number.isFinite(precision) ? precision : null
      )
    } catch (e) {
      refuse(e, label)
    }
    if (got.note) read.notes.push(`${label}: ${got.note}`)
    read.parts.push({ type: 'number', prompt: promptLines.join('\n'), answer: got.answer, unit, tolerance: got.tolerance, marks })
    return
  }
  // jme. Read and set aside: which notation the student may type in and which functions are
  // on offer are Numbas's business; PhysLab's field reads what the calculator reads.
  void tryGet(p, 'notation')
  void tryGet(p, 'enabledFunctions')
  void tryGet(p, 'disabledFunctions')
  void tryGet(p, 'functionSets')
  let answer: string
  try {
    answer = jmeToMath(asString(tryGet(p, 'answer')), 'same')
  } catch (e) {
    refuse(e, label)
  }
  const checking = asString(tryGet(p, 'checkingType'))
  if (checking === 'dp' || checking === 'sigfig') {
    read.notes.push(
      `${label} is checked to a number of ${checking === 'dp' ? 'decimal places' : 'significant figures'} in Numbas; PhysLab checks it as an expression`
    )
  }
  const range = tryGet(p, 'vsetRange')
  const part: PQPart = { type: 'expression', prompt: promptLines.join('\n'), answer, symbols: freeSymbols(answer, ctx.names), marks }
  if (Array.isArray(range) && range.length === 2 && range.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    part.sampleRange = [range[0], range[1]]
  }
  read.parts.push(part)
}

function contributors(raw: Obj, exam: Obj): string[] {
  const list = Array.isArray(raw.contributors) && raw.contributors.length > 0 ? raw.contributors : exam.contributors
  if (!Array.isArray(list)) return []
  return list.map((c) => (isObj(c) ? asString(c.name).trim() : '')).filter((n) => n !== '')
}

/** The licence string of a question, or of the exam when the question says nothing. */
function licenceText(raw: Obj, exam: Obj): string | null {
  const own = isObj(raw.metadata) ? asString(raw.metadata.licence).trim() : ''
  if (own !== '') return own
  const whole = isObj(exam.metadata) ? asString(exam.metadata.licence).trim() : ''
  return whole === '' ? null : whole
}

/** Thrown for a licence refusal; the sentence is license.ts's own, so the wording stays in one place. */
class Refused extends Error {}

function readLicense(raw: Obj, exam: Obj, title: string): License {
  const found = licenceText(raw, exam)
  const id = licenseFromNumbas(found)
  if (id === null) throw new Refused(refusalSentence(title, found))
  const holder = contributors(raw, exam).join(', ')
  if (holder === '') throw new Refused(`Question '${title}' names no author to credit, which PhysLab may not bundle.`)
  return { id, holder, found: found! }
}

/**
 * Numbas's `variablesTest` → PhysLab's `condition`: the same JME condition in the calculator's
 * words (in degrees, like every formula of the variables), the same number of tries. An empty
 * condition is Numbas's "keep every variant", so there is nothing to carry.
 */
function readCondition(test: unknown): PQQuestion['condition'] | undefined {
  if (!isObj(test)) return undefined
  const src = asString(test.condition).trim()
  if (src === '') return undefined
  let when: string
  try {
    when = jmeToMath(src, 'radians')
  } catch (e) {
    if (e instanceof JmeRefusal) throw new Skip(`keeps only the variants that meet a condition using ${e.what}, which PhysLab does not know`)
    throw e
  }
  const runs = Number(test.maxRuns)
  return { when, maxRuns: Number.isInteger(runs) && runs >= 1 ? runs : NUMBAS_MAX_RUNS }
}

/**
 * A matrix variable is only ever an answer here: any other formula that names it (`2*m`, a
 * condition on it) would be worked out by a calculator that has no such variable, so the question
 * is skipped rather than drawn with numbers that are not there.
 */
function noMatrixArithmetic(ctx: TextContext, parts: PQPart[], condition: PQQuestion['condition'] | undefined): void {
  if (ctx.matrices.size === 0) return
  const formulas = [
    ...ctx.vars.flatMap((v) => (v.def.kind === 'expr' ? [v.def.expr] : [])),
    ...parts.flatMap((p) => (p.type === 'number' || p.type === 'expression' ? [p.answer] : p.type === 'matrix' ? p.answer.flat() : [])),
    ...(condition ? [condition.when] : [])
  ]
  for (const f of formulas) {
    const used = symbolsOf(math.parse(f)).find((s) => ctx.matrices.has(s))
    if (used) throw new Skip(`works with the matrix ${used} in a formula, which PhysLab can only take as an answer`)
  }
}

/** `title` is the name the report calls the question by, which for a nameless one is its number. */
function readQuestion(raw: Obj, exam: Obj, title: string): { question: PQQuestion; notes: string[] } {
  // The licence comes first: a question PhysLab may not bundle is refused whatever else it holds.
  const license = readLicense(raw, exam, title)
  for (const key of ['rulesets', 'functions', 'extensions'] as const) {
    if (nonEmpty(raw[key])) throw new Skip('uses Numbas scripting')
  }
  const preamble = raw.preamble
  if (isObj(preamble) && (nonEmpty(preamble.js) || nonEmpty(preamble.css))) throw new Skip('uses Numbas scripting')

  const ordered = Array.isArray(raw.ungrouped_variables) ? raw.ungrouped_variables.map(asString) : []
  if (Array.isArray(raw.variable_groups)) {
    for (const g of raw.variable_groups) if (isObj(g) && Array.isArray(g.variables)) ordered.push(...g.variables.map(asString))
  }
  const matrices = new Map<string, JmeNode>()
  const vars = readVariables(raw.variables, ordered, matrices)
  const ctx: TextContext = { vars, names: new Set(vars.map((v) => v.name)), made: 0, matrices }

  const read: QuestionRead = { parts: [], steps: [], statementLines: htmlToLines(asString(raw.statement), ctx), notes: [], paths: new Map(), carried: [] }
  readParts(raw.parts, ctx, read, '')
  if (read.parts.length === 0) throw new Skip('has no part PhysLab can ask')
  readCarried(read, ctx)
  const condition = readCondition(raw.variablesTest)
  // The advice is read first: a chip in it (`{2*m}`) makes a shown variable the matrix check must see too.
  const steps = [...linesToSteps(htmlToLines(asString(raw.advice), ctx), ctx.names), ...read.steps]
  noMatrixArithmetic(ctx, read.parts, condition)

  const question: PQQuestion = {
    id: stableId(raw),
    title: spokenTitle(asString(raw.name)),
    statement: read.statementLines.join('\n'),
    variables: ctx.vars,
    parts: read.parts,
    license,
    imported: { format: 'numbas', contributors: contributors(raw, exam) }
  }
  if (steps.length > 0) question.steps = { level: 'worked', items: steps }
  if (condition) question.condition = condition
  if (Array.isArray(raw.tags) && raw.tags.length > 0) question.tags = raw.tags.map(asString).filter((t) => t !== '')
  return { question, notes: read.notes }
}

/** Every question in the exam, from `question_groups` and from a flat `questions` list, in file order. */
function examQuestions(exam: Obj): unknown[] {
  const out: unknown[] = []
  if (Array.isArray(exam.question_groups)) {
    for (const g of exam.question_groups) if (isObj(g) && Array.isArray(g.questions)) out.push(...g.questions)
  }
  if (Array.isArray(exam.questions)) out.push(...exam.questions)
  return out
}

const NOT_AN_EXAM = 'This is not a Numbas exam file.'

/**
 * A `.exam` text → a PhysLab question file plus a report: one sentence per skipped question,
 * one per assumption made. The first line `// Numbas version: …` is dropped; the rest is JSON.
 * A question that fails the licence gate, uses a part or a function PhysLab does not read, or
 * shows something PhysLab has nowhere to show is skipped — never half-imported.
 */
export function fromExam(text: string): ExamImport {
  const body = text.replace(/^\uFEFF/, '').replace(/^\s*\/\/[^\n]*\n?/, '')
  let exam: unknown
  try {
    exam = JSON.parse(body)
  } catch {
    throw new Error(NOT_AN_EXAM)
  }
  if (!isObj(exam)) throw new Error(NOT_AN_EXAM)

  const questions: PQQuestion[] = []
  const report: string[] = []
  // The id is a hash of the question's text, so the same question twice in one exam (in two
  // groups, say) would collide; the second copy gets -2, the third -3, and the same file still
  // gives the same ids every time.
  const ids = new Set<string>()
  examQuestions(exam).forEach((raw, i) => {
    if (!isObj(raw)) {
      report.push(`Question ${num(i + 1)} was skipped: it is not a question PhysLab can read.`)
      return
    }
    const title = asString(raw.name) || `Question ${num(i + 1)}`
    try {
      const { question, notes } = readQuestion(raw, exam, title)
      for (const n of notes) report.push(`Question '${title}', ${n}.`)
      const base = question.id
      for (let k = 2; ids.has(question.id); k++) question.id = `${base}-${k}`
      ids.add(question.id)
      questions.push(question)
    } catch (e) {
      if (e instanceof Skip) report.push(`Question '${title}' was skipped: it ${e.reason}.`)
      else if (e instanceof Refused) report.push(e.message)
      else throw e
    }
  })
  // Format 2 only when an import needs it (a matrix, error carried forward, a condition), so a plain
  // import still opens in 0.7.0.
  return { file: { app: 'PhysLab', format: 'pqjson', version: formatVersionOf({ questions }), questions }, report }
}
