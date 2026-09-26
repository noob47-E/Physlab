// Question Author's part-kind picker (rung 4–5): the answer kinds it offers besides the three
// format-1 ones (number, expression, choice) — a vector, a matrix, a set of roots, a function
// checked in its own equation, and a proof shown but never marked — and the pure logic behind
// switching a part between any of them, and behind the matrix editor's rows/columns stepper.
// Headless: no React, no store, no DOM, so it is tested directly rather than through the panel
// (`panels/AuthorSolution.tsx`'s MathInput fields need a real DOM and cannot be imported by a
// `tests/` file, which AGENTS.md keeps to pure logic).

import type { MathNode, SymbolNode } from 'mathjs'
import { math, preprocess } from '../math/expr'
import { changePartType, formulaLatex, nameProblem, readFormula, TIDY } from './authoring'
import { primed, type FunctionPart } from './odeCheck'
import type { Format1Part, PQPart, PQQuestion } from './pqjson'

export const PART_TYPES: { type: Format1Part['type']; label: string }[] = [
  { type: 'number', label: 'A number' },
  { type: 'expression', label: 'A formula' },
  { type: 'choice', label: 'A choice' }
]

/** The rung 4–5 answer kinds Question Author can build (format 2). Lego is rung 1's own tool, built in Geometry. */
export type NewPartType = Exclude<PQPart['type'], Format1Part['type'] | 'lego'>

export const NEW_PART_TYPES: { type: NewPartType; label: string }[] = [
  { type: 'vector', label: 'A vector' },
  { type: 'matrix', label: 'A matrix' },
  { type: 'roots', label: 'A set of roots' },
  { type: 'function', label: 'A function' },
  { type: 'proof', label: 'A proof' }
]

/** Every kind the part-kind picker's radiogroup offers, in the order it shows them. */
export const ALL_PART_TYPES: { type: PQPart['type']; label: string }[] = [...PART_TYPES, ...NEW_PART_TYPES]

/** The one marking tolerance PROGRAM §5 sets everywhere: 2 %, until the teacher changes it. */
const DEFAULT_BAND = { kind: 'relative' as const, value: 0.02 }

/** A blank part of a new kind, keeping the prompt and marks a switch from another kind carries over. */
export function blankPartOf(type: NewPartType, prompt: string, marks: number): PQPart {
  switch (type) {
    case 'vector':
      return { type, prompt, answer: ['', ''], unit: 'none', tolerance: DEFAULT_BAND, marks }
    case 'matrix':
      return {
        type,
        prompt,
        answer: [
          ['', ''],
          ['', '']
        ],
        tolerance: DEFAULT_BAND,
        marks
      }
    case 'roots':
      return { type, prompt, answer: [''], unit: 'none', tolerance: DEFAULT_BAND, marks }
    case 'function':
      return { type, prompt, x: 'x', y: 'y', ode: '', initial: [{ at: '0', order: 0, value: '' }], model: '', marks }
    case 'proof':
      return { type, prompt, model: '', selfCheck: [''], marks: 0 }
  }
}

/**
 * A part turned into any of the eight kinds Question Author offers (lego stays Geometry's own
 * tool). A proof is always worth 0 marks (the file format refuses anything else), so switching a
 * proof to another kind gives it back the usual one mark rather than carrying the 0 across.
 */
export function changeAnyPartType(p: PQPart, type: PQPart['type']): PQPart {
  if (p.type === type) return p
  if (type === 'lego') return p
  const from: PQPart = p.type === 'proof' && type !== 'proof' ? { ...p, marks: 1 } : p
  if (type === 'number' || type === 'expression' || type === 'choice') return changePartType(from, type)
  return blankPartOf(type, from.prompt, from.marks)
}

/** Resize a matrix answer to `rows` × `cols`, keeping what was already typed and padding the rest blank. */
export function resizeMatrix(answer: string[][], rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => answer[r]?.[c] ?? ''))
}

// ---------------------------------------------------------------------------
// A function part's equation, between the maths field and the file
// ---------------------------------------------------------------------------

/**
 * Every way the maths field writes a derivative's prime turned into the one spelling the marker
 * reads as part of a name (′ or ″). Left alone, MathLive's y^{\prime}^{\prime} became y'' in
 * latexToMath, which mathjs reads as y transposed twice, and ^{\prime\prime} became y^("").
 */
function primesAsNames(latex: string): string {
  const ticks = latex
    .replace(/\\doubleprime/g, "''")
    .replace(/\^\s*\{((?:\s*(?:\\prime|'|′|″)\s*)+)\}/g, (_, g: string) => "'".repeat((g.match(/\\prime|'|′/g) ?? []).length + 2 * (g.match(/″/g) ?? []).length))
    .replace(/\^\s*\\prime/g, "'")
    .replace(/\\prime/g, "'")
    .replace(/′/g, "'")
    .replace(/″/g, "''")
  // Three primes or more stay a run of ′ the reader does not know, so it says so rather than
  // quietly reading a third derivative as a second.
  return ticks.replace(/'+/g, (m) => (m.length === 1 ? '′' : m.length === 2 ? '″' : '′'.repeat(m.length)))
}

export type EquationRead = { expr: string; problem?: undefined } | { problem: string; expr?: undefined }

/**
 * The function part's equation as the maths field wrote it, read into the plain text the marker
 * (odeCheck) reads: "y″ + k * y = 0". Each side is read like any other formula — a variable chip
 * becomes its name, not the {k} a LaTeX field keeps — with the part's own letters and y's first
 * and second derivatives allowed besides the question's variables. '' for an empty field.
 */
export function readEquation(latex: string, names: readonly string[], x: string, y: string): EquationRead {
  if (latex.trim() === '') return { expr: '' }
  const example = `${y}″ + ${y} = 0`
  const plain = primesAsNames(latex)
  if (/′{3,}/.test(plain)) return { problem: `PhysLab checks an equation in ${y}, ${y}′ and ${y}″, not a higher derivative.` }
  const sides = plain.split('=')
  if (sides.length !== 2) return { problem: `Write the equation with one = sign, like ${example}.` }
  if (sides.some((s) => s.trim() === '')) return { problem: `Write both sides of the equation, like ${example}.` }
  const read = sides.map((s) => readFormula(s, names, [x, y, `${y}′`, `${y}″`]))
  for (const r of read) if (r.problem !== undefined) return { problem: r.problem }
  return { expr: `${read[0].expr} = ${read[1].expr}` }
}

/** A saved equation as LaTeX for the maths field; '' for none or one it cannot read. The primes come back as the field's own \prime. */
export function equationLatex(ode: string, names: readonly string[], y: string): string {
  if (ode.trim() === '') return ''
  const sides = primed(ode).split('=')
  if (sides.length !== 2) return ''
  const tex = sides.map((s) => formulaLatex(s, names))
  if (tex.some((t) => t === '')) return ''
  return tex
    .join('=')
    .split(`${y}″`)
    .join(`${y}^{\\prime\\prime}`)
    .split(`${y}′`)
    .join(`${y}^{\\prime}`)
}

/**
 * A formula with each name in `map` read as its new name, all at once, so swapping x and y does
 * not turn both into one letter; unchanged text when nothing in it is renamed or it does not read.
 */
function renameSymbols(expr: string, map: ReadonlyMap<string, string>): string {
  if (expr.trim() === '' || map.size === 0) return expr
  try {
    let hit = false
    const out = math.parse(preprocess(expr)).transform((n: MathNode, _path: string, parent: MathNode | null) => {
      if (n.type !== 'SymbolNode') return n
      // sin in sin(x) is the function, never a letter to rename.
      if (parent?.type === 'FunctionNode' && (parent as unknown as { fn: MathNode }).fn === n) return n
      const to = map.get((n as SymbolNode).name)
      if (to === undefined) return n
      hit = true
      return new math.SymbolNode(to)
    })
    return hit ? out.toString(TIDY) : expr
  } catch {
    return expr
  }
}

/**
 * A function part with its free letter and its own letter changed to `x` and `y`, and its
 * equation and the author's solution rewritten in the new letters in the same edit. Changing only
 * the letters left "y″ + y = 0" and sin(x) behind in a part now in v and t: every student answer
 * was marked wrong, the equation field refused any edit (it now allows only v, v′ and v″), and
 * the revealed solution was in a letter the part no longer has. The starting conditions are left
 * alone: they are numbers built from the question's variables, never from the part's letters.
 */
export function renameFunctionLetters(p: FunctionPart, x: string, y: string): FunctionPart {
  const letters = new Map<string, string>()
  if (p.x !== x) letters.set(p.x, x)
  if (p.y !== y) {
    letters.set(p.y, y)
    letters.set(`${p.y}′`, `${y}′`)
    letters.set(`${p.y}″`, `${y}″`)
  }
  if (letters.size === 0) return p
  let ode = p.ode
  const sides = primed(p.ode).split('=')
  if (sides.length === 2) {
    const renamed = sides.map((s) => renameSymbols(s.trim(), letters))
    if (renamed.some((s, i) => s !== sides[i].trim())) ode = `${renamed[0]} = ${renamed[1]}`
  }
  const model = p.x === x ? p.model : renameSymbols(p.model, new Map([[p.x, x]]))
  return { ...p, x, y, ode, model }
}

/**
 * Why a function part cannot take `x` and `y` as its free letter and its own letter, in a
 * sentence; null when it can. Each must be a name of its own — never the other, and never a
 * question variable's: renaming y to a variable k rewrote "y″ + k * y = 0" as "k″ + k * k = 0",
 * merging the two for good (renaming back turned every k into y), and every right answer was
 * marked wrong while Export still passed.
 */
export function functionLettersProblem(x: string, y: string, variables: readonly string[]): string | null {
  return nameProblem(x, [y, ...variables]) ?? (x === y ? null : nameProblem(y, [x, ...variables]))
}

/**
 * Why a question variable cannot be called `name` because a function part already uses it as a
 * letter, in a sentence; null when no part does. Renaming a variable k to v where a part's own
 * letter is v merged the two in the part's equation, as renaming the letter to k did.
 */
export function functionLetterClash(q: PQQuestion, name: string): string | null {
  const k = q.parts.findIndex((p) => p.type === 'function' && (p.x === name || p.y === name))
  if (k < 0) return null
  const p = q.parts[k] as FunctionPart
  const part = q.parts.length > 1 ? ` in part ${k + 1}` : ''
  const role = p.y === name ? 'the function’s own letter' : 'the free letter'
  return `${name} is ${role}${part}; choose another name.`
}

/** The letters the question's function parts use as their own, which a new variable must not take. */
export function functionLetters(q: PQQuestion): string[] {
  return q.parts.flatMap((p) => (p.type === 'function' ? [p.x, p.y] : []))
}

// ---------------------------------------------------------------------------
// The Variables tab's condition: how many draws before giving up
// ---------------------------------------------------------------------------

/**
 * The most draws the condition's try count allows. drawVariables makes up to that many draws per
 * seed, and the ten-row preview, every part's check and Export's 510 seeds all draw, so a
 * condition that is rarely met (a > 100 while a runs 1 to 10, as it is mid-typing) with 100 000
 * tries locked the panel for minutes; 1000 tries × 510 seeds takes about a second.
 */
export const MAX_CONDITION_RUNS = 1000

/** A try count typed in the condition's box, as a whole number from 1 to MAX_CONDITION_RUNS. */
export function conditionRuns(typed: number): number {
  if (!Number.isFinite(typed)) return 1
  return Math.min(MAX_CONDITION_RUNS, Math.max(1, Math.round(typed)))
}
