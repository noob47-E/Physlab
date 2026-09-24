// The decisions behind Question Author, kept out of the panels so they can be tested: how a
// teacher's text holds variable chips, how a formula built in the maths field becomes the
// question's formula, how a chip sits in a step's maths, what the ten-variant preview shows and
// what it suggests when a variant fails, and what a question needs before it can leave PhysLab.
// Headless: no React, no store, no DOM. Rule 2 holds throughout — the teacher never types braces,
// JSON or code; the file format is written here and read back here.

import type { MathNode, SymbolNode } from 'mathjs'
import { math, preprocess } from '../math/expr'
import type { MeasureSettings } from '../math/format'
import { tryLatexToMath } from '../math/latexToMath'
import { JOBS, suggestJob, type JobId } from '../math/pure/run'
import type { Move } from '../math/pure/work'
import { isShippable } from './license'
import { fromExam } from './numbas'
import { evaluateInVariables } from './parts'
import { playQuestion } from './player'
import {
  isCommandArgument,
  parsePQFile,
  RESERVED_NAMES,
  serializePQFile,
  VARIABLE_NAME,
  type License,
  type LicenseId,
  type PQFile,
  type PQPart,
  type PQQuestion,
  type PQStep,
  type UnitId,
  type VariableDef
} from './pqjson'
import { stepsToWorking, VECTOR_SOLVER_NAMES } from './steps'
import { formatQuantity } from './units'
import { drawVariables, type Variant } from './variables'

// ---------------------------------------------------------------------------
// Chips in text
// ---------------------------------------------------------------------------

/** A run of a teacher's sentence: plain words, or a variable chip that becomes its number. */
export type ChipPiece = { text: string } | { chip: string }

const CHIP = /\{([A-Za-z][A-Za-z0-9_]*)\}/g

/**
 * A sentence as the editor shows it: words, and chips where the file has `{name}`. The braces
 * are the file's business; the teacher sees a chip and never types one.
 */
export function chipPieces(text: string): ChipPiece[] {
  const out: ChipPiece[] = []
  let at = 0
  for (const m of text.matchAll(CHIP)) {
    if (m.index! > at) out.push({ text: text.slice(at, m.index) })
    out.push({ chip: m[1] })
    at = m.index! + m[0].length
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}

/** The editor's pieces back into the file's text. */
export function piecesText(pieces: readonly ChipPiece[]): string {
  return pieces.map((p) => ('chip' in p ? `{${p.chip}}` : p.text)).join('')
}

/** The chips a sentence uses that are not variables of the question: the editor marks them. */
export function unknownChips(text: string, names: readonly string[]): string[] {
  return [...new Set(chipPieces(text).flatMap((p) => ('chip' in p && !names.includes(p.chip) ? [p.chip] : [])))]
}

/** Every chip of `from` renamed to `to`, when a variable is renamed: its chips follow it. */
export function renameChips(text: string, from: string, to: string): string {
  return text.replace(CHIP, (whole, name: string) => (name === from ? `{${to}}` : whole))
}

// ---------------------------------------------------------------------------
// Formulas built in the maths field
// ---------------------------------------------------------------------------

/** A name the maths itself supplies (pi, e, sqrt …): never a variable, never unknown. */
function isBuiltIn(name: string): boolean {
  if (RESERVED_NAMES.has(name)) return true
  const t = math.typeOf((math as unknown as Record<string, unknown>)[name])
  return t === 'number' || t === 'Complex' || t === 'boolean' || t === 'function'
}

/**
 * Splits a run of letters into variable names, longest first: `vt` with variables v and t is
 * v × t. The maths field writes letters side by side with nothing between them, and the
 * calculator reads `vt` as one name; a teacher who clicked the v chip and then the t chip meant
 * their product. Null when the run is not made of the question's names.
 */
function splitIntoNames(run: string, names: readonly string[]): string[] | null {
  const byLength = [...names].sort((a, b) => b.length - a.length)
  const memo = new Map<number, string[] | null>()
  const from = (i: number): string[] | null => {
    if (i === run.length) return []
    if (memo.has(i)) return memo.get(i)!
    let found: string[] | null = null
    for (const n of byLength) {
      if (run.startsWith(n, i)) {
        const rest = from(i + n.length)
        if (rest) {
          found = [n, ...rest]
          break
        }
      }
    }
    memo.set(i, found)
    return found
  }
  return from(0)
}

/** Only the brackets the meaning needs, and every product written with its × (2 * a, never 2 a). */
const TIDY = { parenthesis: 'auto', implicit: 'show' } as const

export type FormulaRead = { expr: string; problem?: undefined } | { expr?: undefined; problem: string }

/**
 * The maths field's LaTeX as the question's formula (mathjs text, which is what the file holds).
 * `names` are the question's variables; `free` the letters the formula may also use on its own —
 * x for a curve, t for a push, the student's letters for an expression answer. Letters written
 * side by side are split into the names they are made of; a letter that is neither a name nor
 * free is a plain sentence, so "There is no variable called q." shows under the field instead of
 * mathjs later reading q as a unit of charge.
 */
export function readFormula(latex: string, names: readonly string[], free: readonly string[] = []): FormulaRead {
  if (latex.trim() === '') return { expr: '' }
  const linear = tryLatexToMath(latex)
  if (linear.problem !== undefined) return { problem: linear.problem }
  // A variable called mu written as the Greek μ is that variable: the calculator would read μ as
  // micro and make it u.
  let src = linear.src
  for (const n of [...names, ...free]) if (GREEK[n]) src = src.split(GREEK[n]).join(` ${n} `)
  let node: MathNode
  try {
    node = math.parse(preprocess(src))
  } catch {
    return { problem: 'PhysLab cannot read this formula yet.' }
  }
  const allowed = new Set([...names, ...free])
  let unknown: string | null = null
  const out = node.transform((n: MathNode, _path: string, parent: MathNode | null) => {
    if (n.type !== 'SymbolNode') return n
    const name = (n as SymbolNode).name
    // A function's own name (sin in sin(x)) is the function, not a letter.
    if (parent?.type === 'FunctionNode' && (parent as unknown as { fn: MathNode }).fn === n) return n
    if (allowed.has(name) || isBuiltIn(name)) return n
    const parts = splitIntoNames(name, [...allowed])
    if (parts && parts.length > 1) {
      return parts.slice(1).reduce<MathNode>((acc, p) => new math.OperatorNode('*', 'multiply', [acc, new math.SymbolNode(p)]), new math.SymbolNode(parts[0]))
    }
    unknown ??= name
    return n
  })
  if (unknown !== null) return { problem: `There is no variable called ${unknown}.` }
  // Written tidily, because the file is text a teacher may read and Numbas receives: the maths
  // field's own brackets came out as ((u ^ (2)) / (2 a)).
  return { expr: out.toString(TIDY) }
}

/**
 * A formula from the file as LaTeX for the maths field; '' for none or one it cannot read. A
 * variable with a longer name is set upright as one word (\mathrm{mu}): left to mathjs, `mu`
 * became the Greek μ, which the calculator reads as the prefix micro and turns into u.
 */
export function formulaLatex(expr: string | undefined, names: readonly string[] = []): string {
  if (!expr || expr.trim() === '') return ''
  try {
    return plainSpaces(
      math.parse(preprocess(expr)).toTex({
        // A one-letter name keeps mathjs's own spacing: returned bare, `v \cdot t` came out as
        // `v\cdott`, a command no one has heard of.
        handler: (n: MathNode) => {
          const name = n.type === 'SymbolNode' ? (n as SymbolNode).name : ''
          return name.length > 1 && names.includes(name) ? nameLatex(name) : undefined
        }
      })
    )
  } catch {
    return ''
  }
}

/**
 * mathjs writes a product with nothing between its factors (3x) as `3~x`, the TeX tie; the
 * calculator reads `~` as an operator, so 3x came back from the maths field as "cannot read".
 * A plain space sets the same and reads back as the product it is.
 */
// Its base of a power comes wrapped too (`{ x}^{2}`), which reads back as (x)^2 and made the
// Pure Math engine open with a line tidying the brackets away.
const plainSpaces = (tex: string): string =>
  tex
    .replace(/~/g, ' ')
    .replace(/\{\s*([A-Za-z]|\d+(?:\.\d+)?)\s*\}(?=\^)/g, '$1')
    .trim()

/** How a variable is written in the maths field: a letter as itself, a longer name upright. */
export function nameLatex(name: string): string {
  return name.length === 1 ? name : `\\mathrm{${name}}`
}

/** Greek letters the maths field writes as symbols; a variable may be named after one. */
const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', delta: 'δ', epsilon: 'ε', eta: 'η', theta: 'θ', kappa: 'κ', lambda: 'λ', mu: 'μ',
  nu: 'ν', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω'
}

// ---------------------------------------------------------------------------
// Chips in a step's maths
// ---------------------------------------------------------------------------

/**
 * How a chip is written in the maths field: the name in a rounded frame, which reads as "the
 * number goes here" and is what the chip buttons insert. The maths field hands its LaTeX over
 * unstyled, and that drops a `\boxed` frame — the chip came back as a bare letter and was never
 * filled in; `\fbox` survives but the field cannot draw it. `\enclose` does both, and the strut
 * gives the frame a line's height — without it the frame cut through a short letter such as u.
 */
export const chipTex = (name: string): string => `\\enclose{roundedbox}{\\mathstrut ${name}}`

/** The same chip for KaTeX, which sets the maths everywhere else and has no `\enclose`. */
export const chipKatex = (name: string): string => `\\boxed{${name}}`

/**
 * A chip as the maths field gives it back — it adds its own drawing options to `\enclose` — and
 * `\boxed` or `\fbox`, as a field or a paste may write it.
 */
const FRAMED = /\\(?:fbox|boxed|enclose\{roundedbox\}(?:\[[^\]]*\])?)\{(?:\\mathstrut\s*)?([A-Za-z][A-Za-z0-9_]*)\}/g

/**
 * A step's maths as the maths field shows it: each chip `{v}` framed (`frame` sets it for KaTeX
 * instead). A `{…}` that is a command's own argument (the `{avg}` of `\mathrm{avg}`) is LaTeX,
 * not a chip — the same rule the player uses.
 */
export function texForEditor(tex: string | undefined, names: readonly string[], frame: (name: string) => string = chipTex): string {
  if (!tex) return ''
  return tex.replace(CHIP, (whole, name: string, at: number) => (names.includes(name) && !isCommandArgument(tex, at) ? frame(name) : whole))
}

/**
 * The maths field's LaTeX back into a step's maths: a framed variable becomes its chip. A plain
 * letter the teacher typed stays a letter even where the player would take `{v}` for a chip —
 * the maths field writes `\frac{1}{v}`, whose `{v}` is no command's argument — by being set as
 * `\mathit{v}`, which looks the same and is never filled in.
 */
export function texFromEditor(latex: string, names: readonly string[]): string {
  // The frames are set aside first: the {u} inside \enclose{roundedbox}{u} is no command's own
  // argument by the player's rule, and was guarded as a typed letter.
  const framed: string[] = []
  const held = latex.replace(FRAMED, (whole, name: string) => (names.includes(name) ? `${HELD}${framed.push(name) - 1}${HELD}` : whole))
  const guarded = held.replace(CHIP, (whole, name: string, at: number) => (names.includes(name) && !isCommandArgument(held, at) ? `{\\mathit{${name}}}` : whole))
  // Straight after a command (\times\enclose…) the chip would read as the command's argument; a
  // space ends the command, as it does in the player's own rule.
  return guarded.replace(HELD_AT, (_whole, k: string, at: number) => `${/\\[A-Za-z]+$/.test(guarded.slice(0, at)) ? ' ' : ''}{${framed[Number(k)]}}`)
}

/** A character no LaTeX contains, marking where a chip was set aside. */
const HELD = String.fromCharCode(1)
const HELD_AT = new RegExp(`${HELD}(\\d+)${HELD}`, 'g')

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

/** Why a name cannot be a variable's, in a sentence; null when it can. */
export function nameProblem(name: string, others: readonly string[]): string | null {
  if (name === '') return 'Give this variable a name.'
  if (!VARIABLE_NAME.test(name)) return 'A name is a letter, then letters or digits.'
  if (RESERVED_NAMES.has(name) || isBuiltIn(name)) return `${name} already means something in maths; choose another letter.`
  if (others.includes(name)) return `There is already a variable called ${name}.`
  return null
}

/**
 * The next free single letter for a new variable: a, b, c … then a1, a2 … Never e or i (they are
 * numbers), nor t or x, which a push and a curve use as their own letter.
 */
export function nextVariableName(taken: readonly string[]): string {
  for (const c of 'abcdfghkmnpqrsuvwyzABCDFGHKLMNPQRSTUVWXYZ') if (!taken.includes(c) && nameProblem(c, taken) === null) return c
  for (let k = 1; ; k++) if (!taken.includes(`a${k}`)) return `a${k}`
}

/** A default for each way of choosing, so switching Range → List → Formula never leaves nothing. */
export function defaultDef(kind: VariableDef['kind']): VariableDef {
  if (kind === 'range') return { kind: 'range', from: 1, to: 10, step: 1 }
  if (kind === 'list') return { kind: 'list', items: [1, 2, 3] }
  return { kind: 'expr', expr: '' }
}

/** The palette's groups: every unit PhysLab knows, once, under what it measures. */
export const UNIT_GROUPS: readonly { label: string; units: readonly UnitId[] }[] = [
  { label: 'No unit', units: ['none'] },
  { label: 'Length', units: ['m', 'cm', 'mm', 'km'] },
  { label: 'Time', units: ['s', 'ms', 'min', 'h'] },
  { label: 'Mass', units: ['kg', 'g'] },
  { label: 'Speed and acceleration', units: ['m/s', 'km/h', 'm/s²', 'rad/s'] },
  { label: 'Force, energy and power', units: ['N', 'J', 'W', 'N·m', 'kg·m/s', 'Pa'] },
  { label: 'Angle and frequency', units: ['°', 'rad', 'Hz'] },
  { label: 'Electricity', units: ['C', 'V', 'A', 'Ω'] },
  { label: 'Heat and amount', units: ['K', '°C', 'mol'] },
  { label: 'Area and volume', units: ['m²', 'm³'] }
]

// ---------------------------------------------------------------------------
// The ten-variant preview
// ---------------------------------------------------------------------------

/** A change the preview offers for a failing variant: the sentence on its button and the edit. */
export interface Fix {
  text: string
  apply: (q: PQQuestion) => PQQuestion
}

export interface PreviewRow {
  seed: number
  /** Each variable's drawn value as the student would read it ("24 m/s"), in the author's order. */
  values: { name: string; text: string }[]
  /**
   * Each part's answer for these numbers: as words ("96 m") where it is a number or an option, and
   * always as maths; null for a part whose answer is not written yet.
   */
  answers: ({ text: string | null; tex: string } | null)[]
  /** Sentences about what went wrong in this variant; the row is red when there are any. */
  problems: string[]
  /** What would stop it happening, when PhysLab can tell. */
  fix: Fix | null
}

/** A part with nothing yet to work its answer out from. */
export function unanswered(p: PQPart): boolean {
  if (p.type === 'number' || p.type === 'expression') return p.answer.trim() === ''
  return p.distractors !== undefined && p.distractors.correct.trim() === ''
}

const SENTENCE: Pick<MeasureSettings, 'decimals' | 'precisionMode'> = { decimals: 4, precisionMode: 'dp' }

/**
 * The variable whose drawn 0 is the likely trouble, and the edit that stops it being drawn: a
 * range starting at 0 starts one step later ("t can be 0 — start it at 1?", FIG. 5 of the design),
 * one ending at 0 ends a step earlier, one passing through 0 leaves 0 out, and a list loses its 0.
 */
export function suggestFix(q: PQQuestion, v: Variant, problems: readonly string[]): Fix | null {
  if (problems.length === 0) return null
  // A variable named in the sentence first ("… when t = 0"), then any drawn as 0.
  const zeros = q.variables.filter((x) => v.values[x.name] === 0 && x.def.kind !== 'expr')
  const named = zeros.find((x) => problems.some((p) => p.includes(`${x.name} = 0`)))
  const target = named ?? zeros[0]
  if (!target) return null
  const n = (x: number): string => formatQuantity(x, 'none', SENTENCE)
  const def = target.def
  const edit = (next: VariableDef) => (question: PQQuestion): PQQuestion => ({
    ...question,
    variables: question.variables.map((x) => (x.name === target.name ? { ...x, def: next } : x))
  })
  if (def.kind === 'list') {
    const items = def.items.filter((x) => x !== 0)
    if (items.length === 0) return null
    return { text: `${target.name} can be 0 — take 0 out of its list?`, apply: edit({ kind: 'list', items }) }
  }
  if (def.kind !== 'range') return null
  if (def.from === 0 && def.to > 0) return { text: `${target.name} can be 0 — start it at ${n(def.step)}?`, apply: edit({ ...def, from: def.step }) }
  if (def.to === 0 && def.from < 0) return { text: `${target.name} can be 0 — end it at ${n(-def.step)}?`, apply: edit({ ...def, to: -def.step }) }
  return { text: `${target.name} can be 0 — never draw 0?`, apply: edit({ ...def, exclude: [...(def.exclude ?? []), 0] }) }
}

/**
 * The rows the Variables tab shows: seeds 1 to `count`, the same ten every time, each played the
 * way the Practice panel will play it — so a formula that divides by zero, an answer that cannot
 * be worked out and a push that names nothing all show here first, in red, with a fix where there
 * is an obvious one.
 */
export function previewRows(q: PQQuestion, settings: MeasureSettings, count = 10): PreviewRow[] {
  const rows: PreviewRow[] = []
  // A part whose answer is not written yet is not a failing row: a question just started showed
  // ten red rows saying PhysLab could not work out the answer to "". It is played without them,
  // and Export still names the missing answer.
  const ready = q.parts.map((p) => !unanswered(p))
  const playable: PQQuestion = { ...q, parts: q.parts.filter((_, k) => ready[k]) }
  for (let seed = 1; seed <= count; seed++) {
    const variant = drawVariables(q, seed)
    const values = q.variables.map((x) => {
      const v = variant.values[x.name]
      return { name: x.name, text: v === undefined || !Number.isFinite(v) ? '?' : formatQuantity(v, x.unit ?? 'none', settings) }
    })
    let answers: PreviewRow['answers'] = q.parts.map(() => null)
    let problems: string[] = [...variant.problems]
    try {
      const played = playQuestion(playable, seed, settings)
      problems = [...new Set(played.problems)]
      let k = 0
      answers = q.parts.map((_, j) => {
        if (!ready[j]) return null
        const p = played.parts[k++]
        return p ? { text: p.answerText ?? null, tex: p.answerTex } : null
      })
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e))
    }
    rows.push({ seed, values, answers, problems, fix: suggestFix(q, variant, problems) })
  }
  return rows
}

// ---------------------------------------------------------------------------
// What a question needs before it leaves PhysLab
// ---------------------------------------------------------------------------

/** How many draws Export tries beyond the preview's ten: enough to meet a 1-in-100 zero. */
const EXPORT_DRAWS = 500

const titled = (q: PQQuestion, i: number): string => (q.title.trim() ? `'${q.title.trim()}'` : `${i + 1}`)

/**
 * Everything that stops a question being exported, as sentences naming the question; empty when
 * it is ready. The file check is `parsePQFile` itself, so an exported file is one the Practice
 * panel is certain to open; then every part must be answerable, and the numbers must work out —
 * in the preview's ten variants and in 500 more draws, since a student may meet any of them.
 */
export function questionProblems(q: PQQuestion, i: number, settings: MeasureSettings): string[] {
  const who = `Question ${titled(q, i)}`
  const out: string[] = []
  if (q.title.trim() === '') out.push(`Question ${i + 1} needs a title.`)
  if (!isShippable(q.license)) out.push(`${who} needs the name of whoever holds its licence — yours, if you wrote it.`)
  if (q.parts.length === 0) out.push(`${who} has nothing for the student to answer. Add a part.`)
  q.parts.forEach((p, k) => {
    const part = q.parts.length > 1 ? ` part ${k + 1}` : ''
    if (p.prompt.trim() === '') out.push(`${who}${part} needs a question to ask.`)
    if ((p.type === 'number' || p.type === 'expression') && p.answer.trim() === '') out.push(`${who}${part} needs its answer.`)
    if (p.type === 'expression' && p.symbols.length === 0) out.push(`${who}${part} needs the letters the student may use.`)
    if (p.type === 'choice') {
      if (p.distractors) {
        if (p.distractors.correct.trim() === '') out.push(`${who}${part} needs the right answer its options are made from.`)
        if (p.distractors.rules.length === 0) out.push(`${who}${part} needs at least one kind of wrong option.`)
      } else {
        if (p.choices.length < 2) out.push(`${who}${part} needs at least two options.`)
        if (!p.choices.some((c) => c.correct)) out.push(`${who}${part} needs at least one right option.`)
        if (p.choices.some((c) => c.text.trim() === '')) out.push(`${who}${part} has an option with nothing written in it.`)
      }
    }
  })
  if (out.length > 0) return out

  try {
    parsePQFile(serializePQFile(questionFile([q])))
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)]
  }

  const bad = previewRows(q, settings).find((r) => r.problems.length > 0)
  if (bad) return [`${who}, preview row ${bad.seed}: ${bad.problems[0]}`]
  // Only what a number needs is drawn beyond the preview: the variables and every answer.
  for (let seed = 11; seed <= 10 + EXPORT_DRAWS; seed++) {
    const v = drawVariables(q, seed)
    let problem = v.problems[0]
    if (problem === undefined) {
      for (const p of q.parts) {
        const exprs = p.type === 'number' ? [p.answer] : p.type === 'choice' && p.distractors ? [p.distractors.correct] : []
        for (const e of exprs) {
          let value = NaN
          try {
            value = evaluateInVariables(e, v.values)
          } catch {
            // left NaN
          }
          if (!Number.isFinite(value)) {
            const when = q.variables
              .filter((x) => Number.isFinite(v.values[x.name]))
              .map((x) => `${x.name} = ${formatQuantity(v.values[x.name], 'none', SENTENCE)}`)
              .join(', ')
            problem = `the answer cannot be worked out when ${when}.`
            break
          }
        }
        if (problem !== undefined) break
      }
    }
    // A sentence of words starts with a capital; one that starts with a variable keeps its case (a is not A).
    if (problem !== undefined) return [`${who}: some numbers a student may be given do not work. ${problem.replace(/^the /, 'The ')}`]
  }
  return []
}

/** The set as a question file. */
export function questionFile(questions: readonly PQQuestion[]): PQFile {
  return { app: 'PhysLab', format: 'pqjson', version: 1, questions: [...questions] }
}

/** Every problem across the set, in order; empty when the whole set may be exported. */
export function setProblems(questions: readonly PQQuestion[], settings: MeasureSettings): string[] {
  if (questions.length === 0) return ['There are no questions to export yet.']
  return questions.flatMap((q, i) => questionProblems(q, i, settings))
}

/** A file name from the set's first title: "A braking train.pqjson". */
export function exportName(questions: readonly PQQuestion[], ext: 'pqjson' | 'exam'): string {
  const base = (questions[0]?.title.trim() || 'Questions').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
  return `${questions.length > 1 ? `${base} and ${questions.length - 1} more` : base}.${ext}`
}

/**
 * Questions opened from a file, ready to join the set: any whose id is already in the set gets a
 * fresh one, so a set imported twice is two copies a teacher can tell apart, not two questions
 * that edit each other.
 */
export function joinImported(
  existing: readonly PQQuestion[],
  incoming: readonly PQQuestion[],
  freshId: () => string,
  from?: { file: string; written: ReadonlySet<string> }
): PQQuestion[] {
  const taken = new Set(existing.map((q) => q.id))
  return incoming.map((q) => {
    const id = taken.has(q.id) ? freshId() : q.id
    taken.add(id)
    const license = from === undefined ? q.license : broughtInLicence(q.license, from.file, from.written.has(q.id))
    return id === q.id && license === q.license ? q : { ...q, id, license }
  })
}

/**
 * A licence as it joins the set. A question this computer exported as the teacher's own (its id
 * is in `writtenHereIds`' record: their own file opened again) is theirs to relicense, so the
 * licence text a Numbas exam kept goes and no source is set. Anything else names where it came
 * from when the file does not say — another teacher's .pqjson carries no source — so it is known
 * as brought in and keeps its licence. The teacher's saved name plays no part: set to someone
 * else's name, it would have let their question be relabelled, and left empty, it locked the
 * teacher's own file.
 */
function broughtInLicence(l: License, file: string, writtenHere: boolean): License {
  if (writtenHere && (l.source === undefined || l.source === 'PhysLab')) {
    const { found: _found, source: _source, ...own } = l
    return l.found === undefined && l.source === undefined ? l : own
  }
  return l.source === undefined ? { ...l, source: file } : l
}

/**
 * The ids an exported set's own questions will have when the file is opened again, for the
 * record of questions written here. A .pqjson keeps each id; a Numbas exam gives each question an
 * id from its own text, so that one is read back from the exam itself. A question brought in from
 * someone else is left out, so exporting it and opening it again never makes it the teacher's.
 */
export function writtenHereIds(questions: readonly PQQuestion[], ext: 'pqjson' | 'exam', text: string): string[] {
  const own = (q: PQQuestion): boolean => broughtInFrom(q) === null
  if (ext === 'pqjson') return questions.filter(own).map((q) => q.id)
  let back: readonly PQQuestion[]
  try {
    back = fromExam(text).file.questions
  } catch {
    return []
  }
  if (back.length !== questions.length) return []
  return back.filter((_, i) => own(questions[i])).map((q) => q.id)
}

/**
 * Where a question was brought in from, when it is someone else's: its licence and credit are
 * then its author's and stay as they are (ShareAlike forbids relabelling, and a teacher must not
 * put their own name on it). Null for a question the teacher wrote and for PhysLab's samples.
 */
export function broughtInFrom(q: PQQuestion): string | null {
  const l = q.license
  if (l.source !== undefined && l.source !== 'PhysLab') return l.source
  return l.found !== undefined ? 'another file' : null
}

/**
 * The licence with a new id. The licence text found at a source belongs to the old id, and a
 * Numbas exam writes that text when it is kept, so it goes: the exam then names the new licence.
 */
export function changeLicence(l: License, id: LicenseId): License {
  const { found: _found, ...rest } = l
  return { ...rest, id }
}

// ---------------------------------------------------------------------------
// Steps from the engine
// ---------------------------------------------------------------------------

/** The Pure Math job PhysLab would use for this input, and its name on the button. */
export function suggestAutoStep(input: string): { job: JobId; label: string } {
  const job = suggestJob(input)
  return { job, label: JOBS.find((j) => j.id === job)?.label ?? job }
}

/** "solveMagnitudeDirection" → "Magnitude and direction": a solver's name in words. */
export function solverLabel(name: string): string {
  const words = name.replace(/^solve/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace('magnitude direction', 'magnitude and direction')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export const SOLVERS: readonly { name: string; label: string }[] = VECTOR_SOLVER_NAMES.map((name) => ({ name, label: solverLabel(name) }))

/**
 * What one engine step will show for the first preview variant: the moves the engine writes, or
 * the one move saying it could not — the teacher sees the working before a student does.
 */
export function previewAutoStep(q: PQQuestion, step: PQStep, settings: MeasureSettings): Move[] {
  return stepsToWorking({ ...q, steps: { level: 'worked', items: [step] } }, drawVariables(q, 1), settings, 'worked').moves
}

// ---------------------------------------------------------------------------
// The statement as the editor shows it
// ---------------------------------------------------------------------------

/**
 * The statement in blocks: runs of sentences (words, chips and any inline maths a Numbas file
 * brought), and formula lines — a line the player sets as display maths, which the file writes
 * as `$$ … $$`. The teacher edits each block in its own field and never sees the dollars.
 */
export type StatementBlock = { kind: 'text'; text: string } | { kind: 'formula'; tex: string }

const FORMULA_LINE = /^\s*\$\$([\s\S]*?)(?:\$\$)?\s*$/

export function statementBlocks(statement: string): StatementBlock[] {
  const out: StatementBlock[] = []
  for (const line of statement.split('\n')) {
    const m = line.trim().startsWith('$$') ? FORMULA_LINE.exec(line) : null
    if (m) out.push({ kind: 'formula', tex: m[1].trim() })
    else {
      const last = out[out.length - 1]
      if (last?.kind === 'text') last.text += `\n${line}`
      else out.push({ kind: 'text', text: line })
    }
  }
  return out.length > 0 ? out : [{ kind: 'text', text: '' }]
}

/** The blocks back into the file's statement. An empty formula line is left out: it shows nothing. */
export function blocksStatement(blocks: readonly StatementBlock[]): string {
  return blocks
    .filter((b) => b.kind === 'text' || b.tex.trim() !== '')
    .map((b) => (b.kind === 'text' ? b.text : `$$ ${b.tex.trim()} $$`))
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
}

/** A run of a sentence with the inline maths a Numbas file may carry (`\(…\)`) kept whole. */
export type TextPiece = ChipPiece | { tex: string }

/**
 * Words, chips and inline maths. Inline maths is one piece the editor shows set, never as its
 * `\(` and `\)`: the teacher did not type it and must not have to edit around it.
 */
export function textPieces(text: string): TextPiece[] {
  const out: TextPiece[] = []
  text.split(/\\\(([\s\S]*?)\\\)/).forEach((piece, k) => {
    if (k % 2 === 1) out.push({ tex: piece })
    else out.push(...chipPieces(piece))
  })
  return out
}

export function textPiecesText(pieces: readonly TextPiece[]): string {
  return pieces.map((p) => ('tex' in p ? `\\(${p.tex}\\)` : 'chip' in p ? `{${p.chip}}` : p.text)).join('')
}

// ---------------------------------------------------------------------------
// Renaming and removing a variable
// ---------------------------------------------------------------------------

/** The same formula with every `from` read as `to`; unchanged text when it does not use `from`. */
export function renameInFormula(expr: string, from: string, to: string): string {
  if (!expr || !new RegExp(`\\b${from}\\b`).test(expr)) return expr
  try {
    let hit = false
    const out = math.parse(preprocess(expr)).transform((n: MathNode, _p: string, parent: MathNode | null) => {
      if (n.type !== 'SymbolNode' || (n as SymbolNode).name !== from) return n
      if (parent?.type === 'FunctionNode' && (parent as unknown as { fn: MathNode }).fn === n) return n
      hit = true
      return new math.SymbolNode(to)
    })
    return hit ? out.toString(TIDY) : expr
  } catch {
    return expr
  }
}

/** Chips of `from` in some LaTeX renamed; a command's own argument (`\mathrm{v}`) is LaTeX and stays. */
export function renameTexChips(tex: string, from: string, to: string): string {
  return tex.replace(CHIP, (whole, name: string, at: number) => (name === from && !isCommandArgument(tex, at) ? `{${to}}` : whole))
}

/** Words and inline maths: chips in the words, chips in the maths by the LaTeX rule. */
function renameInText(text: string, from: string, to: string): string {
  return textPiecesText(textPieces(text).map((p) => ('tex' in p ? { tex: renameTexChips(p.tex, from, to) } : 'chip' in p && p.chip === from ? { chip: to } : p)))
}

function renameInStatement(statement: string, from: string, to: string): string {
  return statement
    .split('\n')
    .map((line) => (line.trim().startsWith('$$') ? renameTexChips(line, from, to) : renameInText(line, from, to)))
    .join('\n')
}

/**
 * The question with a variable renamed everywhere it is used — its chips in the statement,
 * prompts, options and steps, and its letter in every formula — so renaming u to v never leaves
 * a formula asking for a u that is no longer there.
 */
export function renameVariable(q: PQQuestion, from: string, to: string): PQQuestion {
  if (from === to) return q
  const f = (e: string): string => renameInFormula(e, from, to)
  const t = (s: string): string => renameInText(s, from, to)
  const x = (s: string): string => renameTexChips(s, from, to)
  const out: PQQuestion = {
    ...q,
    statement: renameInStatement(q.statement, from, to),
    variables: q.variables.map((v) => ({ ...v, name: v.name === from ? to : v.name, def: v.def.kind === 'expr' ? { kind: 'expr', expr: f(v.def.expr) } : v.def })),
    parts: q.parts.map((p): PQPart => {
      if (p.type === 'number') return { ...p, prompt: t(p.prompt), answer: f(p.answer), ...(p.traps ? { traps: p.traps.map((tr) => ({ value: f(tr.value), why: t(tr.why) })) } : {}) }
      if (p.type === 'expression') return { ...p, prompt: t(p.prompt), answer: f(p.answer) }
      return {
        ...p,
        prompt: t(p.prompt),
        choices: p.choices.map((c) => ({ ...c, text: t(c.text), ...(c.why !== undefined ? { why: t(c.why) } : {}) })),
        ...(p.distractors ? { distractors: { ...p.distractors, correct: f(p.distractors.correct) } } : {})
      }
    })
  }
  if (q.steps) {
    out.steps = {
      ...q.steps,
      items: q.steps.items.map((s): PQStep => {
        const step: PQStep = { ...s, head: t(s.head) }
        if (s.tex !== undefined) step.tex = x(s.tex)
        if (s.rule !== undefined) step.rule = x(s.rule)
        if (s.note !== undefined) step.note = t(s.note)
        if (s.auto?.engine === 'pure') step.auto = { ...s.auto, input: renameChips(s.auto.input, from, to) }
        if (s.auto?.engine === 'vectors') step.auto = { ...s.auto, args: s.auto.args.map((a) => renameChips(a, from, to)) }
        return step
      })
    }
  }
  const pic = q.picture
  if (pic) {
    if (pic.kind === 'curve') out.picture = { ...pic, expr: f(pic.expr), ...(pic.xMin !== undefined ? { xMin: f(pic.xMin) } : {}), ...(pic.xMax !== undefined ? { xMax: f(pic.xMax) } : {}) }
    if (pic.kind === 'piecewise') out.picture = { ...pic, pieces: pic.pieces.map((p) => ({ expr: f(p.expr), from: f(p.from), to: f(p.to) })) }
    if (pic.kind === 'between') out.picture = { ...pic, upper: f(pic.upper), lower: f(pic.lower), from: f(pic.from), to: f(pic.to), ...(pic.label !== undefined ? { label: t(pic.label) } : {}) }
    if (pic.kind === 'tangent') out.picture = { ...pic, expr: f(pic.expr), at: f(pic.at) }
  }
  if (q.motion) {
    const m = q.motion
    out.motion = {
      ...m,
      ...(m.x0 !== undefined ? { x0: f(m.x0) } : {}),
      ...(m.v0 !== undefined ? { v0: f(m.v0) } : {}),
      ...(m.sampleEvery !== undefined ? { sampleEvery: f(m.sampleEvery) } : {}),
      segments: m.segments.map((s) => (s.kind === 'rest' ? { ...s, duration: f(s.duration) } : s.kind === 'uniform' ? { ...s, duration: f(s.duration), v: f(s.v) } : { ...s, duration: f(s.duration), a: f(s.a) }))
    }
  }
  if (q.sandbox) {
    out.sandbox = {
      ...q.sandbox,
      actuators: q.sandbox.actuators.map((a) => ({
        ...a,
        force: [f(a.force[0]), f(a.force[1]), f(a.force[2])],
        ...(a.from !== undefined ? { from: f(a.from) } : {}),
        ...(a.until !== undefined ? { until: f(a.until) } : {})
      }))
    }
  }
  return out
}

/**
 * Whether anything in the question still uses the variable: renaming it to a name nothing else
 * has and comparing is the one test that cannot miss a place, because it is the rename itself.
 */
export function variableInUse(q: PQQuestion, name: string): boolean {
  const probe = 'zzUnused9'
  const others = { ...q, variables: q.variables.filter((v) => v.name !== name) }
  return JSON.stringify(renameVariable(others, name, probe)) !== JSON.stringify(others)
}

// ---------------------------------------------------------------------------
// Small readers the fields use
// ---------------------------------------------------------------------------

/** "2, 4, 6" → [2, 4, 6]; a sentence for anything else. Each entry may be a sum the calculator works out. */
export function parseNumberList(text: string): { items: number[]; problem?: undefined } | { items?: undefined; problem: string } {
  const pieces = text
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
  if (pieces.length === 0) return { problem: 'Write at least one number.' }
  const items: number[] = []
  for (const p of pieces) {
    let v = NaN
    try {
      v = Number(math.evaluate(preprocess(p)))
    } catch {
      // v stays NaN
    }
    if (!Number.isFinite(v)) return { problem: `${p} is not a number.` }
    items.push(v)
  }
  return { items }
}

/** A list as the field shows it: numbers in the precision a sentence uses, separated by commas. */
export function numberListText(items: readonly number[]): string {
  return items.map((x) => formatQuantity(x, 'none', SENTENCE)).join(', ')
}

// ---------------------------------------------------------------------------
// The engine's own input, built in the maths field
// ---------------------------------------------------------------------------

/** A number no one types, standing in for a chip while the LaTeX is read. */
const HOLE = (k: number): string => `${90817263 + k}`

/**
 * The input of an engine step, built in the maths field with framed chips, as the file holds it:
 * the calculator's text with `{k}` where each chip goes. A chip that touches a digit, a letter or
 * a bracket is wrapped in brackets, because the number goes in as text: `3{k}` would read 36 for
 * k = 6, and `3({k})` reads 18.
 */
export function pureInputFromLatex(latex: string, names: readonly string[]): { input: string; problem?: undefined } | { input?: undefined; problem: string } {
  if (latex.trim() === '') return { input: '' }
  const used: string[] = []
  const holed = latex.replace(FRAMED, (whole, name: string) => {
    if (!names.includes(name)) return whole
    let k = used.indexOf(name)
    if (k < 0) k = used.push(name) - 1
    return `\\left(${HOLE(k)}\\right)`
  })
  const read = tryLatexToMath(holed)
  if (read.problem !== undefined) return { problem: read.problem }
  let src = read.src.trim()
  used.forEach((name, k) => {
    src = src.replace(new RegExp(`\\(\\s*${HOLE(k)}\\s*\\)`, 'g'), (whole: string, at: number, all: string) => {
      const before = all.slice(0, at).trimEnd().slice(-1)
      const after = all.slice(at + whole.length).trimStart()[0] ?? ''
      const touches = /[A-Za-z0-9)\]]/.test(before) || /[A-Za-z0-9([]/.test(after)
      return touches ? `({${name}})` : `{${name}}`
    })
  })
  if (used.some((_, k) => src.includes(HOLE(k)))) return { problem: 'PhysLab cannot read this yet.' }
  return { input: src }
}

/** An engine step's input shown in the maths field: its chips framed. '' when it cannot be shown. */
export function pureInputLatex(input: string, names: readonly string[], frame: (name: string) => string = chipTex): string {
  if (input.trim() === '') return ''
  // Each chip becomes a letter-name no one uses while mathjs writes the LaTeX; a number would be
  // written back as 9.08×10⁷.
  const holeName = (name: string): string => `zzchip${name}`
  const holed = input.replace(CHIP, (whole, name: string) => (names.includes(name) ? ` ${holeName(name)} ` : whole))
  const handler = (n: MathNode): string | undefined => {
    const name = n.type === 'SymbolNode' ? (n as SymbolNode).name : ''
    return name.startsWith('zzchip') ? frame(name.slice(6)) : undefined
  }
  try {
    return plainSpaces(
      holed
        .split('=')
        .map((side) => math.parse(preprocess(side)).toTex({ handler }))
        .join('=')
    )
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

/** A part turned into another type, keeping what both have: the prompt and the marks. */
export function changePartType(p: PQPart, type: PQPart['type']): PQPart {
  if (p.type === type) return p
  const { prompt, marks } = p
  const answer = p.type === 'choice' ? '' : p.answer
  if (type === 'number') return { type, prompt, answer, unit: 'none', tolerance: { kind: 'relative', value: 0.02 }, marks }
  if (type === 'expression') return { type, prompt, answer, symbols: ['x'], marks }
  return {
    type,
    prompt,
    choices: [
      { text: '', correct: true },
      { text: '', correct: false }
    ],
    shuffle: true,
    marks
  }
}

/** A new part: a number to 2 % (PROGRAM §5: one marking tolerance, 2 % by default), one mark. */
export function blankPart(): PQPart {
  return { type: 'number', prompt: '', answer: '', unit: 'none', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }
}

/**
 * The letters a student may use in a formula answer ("x, y" → ['x', 'y']), or a sentence: each is
 * a name the maths does not already own, and none is one of the question's variables, whose
 * number is put in before the answer is checked.
 */
export function parseLetters(text: string, variables: readonly string[]): { letters: string[]; problem?: undefined } | { letters?: undefined; problem: string } {
  const letters = [...new Set(text.split(/[\s,;]+/).filter((s) => s !== ''))]
  if (letters.length === 0) return { problem: 'Name at least one letter the student may use, such as x.' }
  for (const l of letters) {
    if (variables.includes(l)) return { problem: `${l} is a variable of this question, so it stands for a number, not a letter.` }
    const why = nameProblem(l, [])
    if (why) return { problem: why }
  }
  return { letters }
}
