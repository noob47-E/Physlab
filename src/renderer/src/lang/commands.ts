// The PhysLab command bar: calculator-style one-liners that create live objects.
//   A = (3, 4)      B = 10 N ∠ 30°     R = A + B      A × B      |R|
//   Triangle((0,0), (4,0), (0,3))      Circle(P, 3)   y = sin(x)  solve(x^2 - 5x + 6 = 0)

import type { MathNode } from 'mathjs'
import { Builder } from '../core/factory'
import { scene } from '../core/store'
import { freeCapitals, isValidName } from '../core/naming'
import { evaluateScene } from '../core/evaluate'
import type { Computed, ObjId, SceneObject } from '../core/types'
import { drawability, inXAlone, NO_REAL_X, plainParseError, solutionsInX, visualizeBetween, visualizeGraph, visualizePiecewise, visualizePoint, visualizeSolution, visualizeTangentAt, visualizeVector, type DrawSpec, type NamedGraphs, type XComplex, type XSolved } from '../core/visualize'
import { ask, useEngineStatus, type EngineJob, type EngineRequest } from '../math/engine'
import { casWaitNote, followCasStart } from '../ui/casStatus'
import { inferKind, isUnit, math, plainNumber, preprocess, sceneNames, splitArgs, symbolsOf, toV3, type ValueKind } from '../math/expr'
import { fmtLabel, fmtPrecise, morePrecise, superscriptPowers, tex, texIJK, texMeasure, texPrecise, type Precision } from '../math/format'
import { heading, len, type V3 } from '../math/vec'
import { polygonArea } from '../math/geometry'
import { isPieceCorner } from '../math/lego'
import * as VS from '../math/vectorSolver'
import { linearToLatex, runPure, type JobId } from '../math/pure/run'
import { normalRefusal, parseNormalQuery } from '../math/pure/zscore'
import { calculusUnitNote, casInDegrees } from '../calc/angle'
import { orderRoots } from '../calc/roots'
import { calcNum, formatComplex, type CalcPrecision } from '../calc/format'
import { evaluateWithRealRoots } from '../calc/engine'
import { unknownFunctionSentence, unknownNameSentence } from '../calc/errors'
import { TYPE_INSTEAD, unitRefusal, unknownUnit } from '../calc/units'
import { isNoise } from '../math/noise'
import { calculusJobFor, engineRequestFor, spelledOut, usePure } from '../math/pure/store'
import { showBeside, showPanel } from '../app/panels'
import { enterMode } from '../app/layout'
import { useApp } from '../app/modes'

type Node = MathNode & Record<string, unknown>

const GRAPH_VARS = new Set(['x', 'y'])

function logError(input: string, message: string) {
  scene().pushLog({ input, kind: 'error', text: message })
}

const kindOfName = (name: string): ValueKind | undefined => {
  const { ev, objects } = scene()
  const id = ev.names.get(name)
  if (!id) return undefined
  const o = objects[id]
  if (o.type === 'point') return 'point'
  if (o.type === 'vector') return 'vector'
  return 'number'
}

/**
 * A name for an example in a sentence ("call it something else, e.g. P = (1, 2)"): the first of these
 * letters that no object in the scene has, else a free capital. Typing an example with a name that is
 * taken would redefine that object, and the student may copy the example as it stands.
 */
function freeLetterFor(letters: string): string {
  const names = scene().ev.names
  return letters.split('').find((n) => !names.has(n)) ?? freeCapitals(names.keys(), 1)[0]
}

/** True when the expression uses no scene objects or variables (only numbers, π, e and units). */
const isConstant = (node: MathNode) => {
  const names = scene().ev.names
  return symbolsOf(node).every((s) => !names.has(s) && (s === 'pi' || s === 'e' || s === 'deg' || isUnitName(s)))
}

function isUnitName(s: string): boolean {
  try {
    return math.Unit.isValuelessUnit(s)
  } catch {
    return false
  }
}

const KNOWN_SYMBOLS = new Set(['pi', 'e', 'i', 'j', 'k', 't', 'x', 'y', 'z', 'deg', 'rad', 'theta', 'Infinity', 'phi', 'tau'])

/**
 * Names that are neither scene objects nor constants. Physical units (N, m/s…) are only
 * accepted right after a number ("10 N"), so an undefined vector B is not mistaken for "byte".
 */
function unknownSymbols(node: MathNode): string[] {
  const names = scene().ev.names
  const out = new Set<string>()
  node.traverse((child, path, parent) => {
    if (child.type !== 'SymbolNode') return
    if (parent?.type === 'FunctionNode' && path === 'fn') return
    const name = (child as unknown as { name: string }).name
    // A θ slider is in the scope as theta too (core/evaluate.ts publish, P-PARSE W2).
    if (names.has(name) || Object.prototype.hasOwnProperty.call(scene().ev.scope, name) || KNOWN_SYMBOLS.has(name)) return
    const p = parent as (MathNode & { fn?: string | { name?: string }; implicit?: boolean; args?: MathNode[] }) | null
    // A function's name as the size before ∠ ("sin at 30"): polarVec says the size must be a number,
    // which is the sentence that helps (browser check BAR-16, F4). Only there: elsewhere a function
    // name typed as a value (a = gamma, 5 * distance) keeps "does not exist yet" (it is not a value).
    const fnName = p?.type === 'FunctionNode' && typeof p.fn === 'object' ? p.fn?.name : undefined
    if (fnName === 'polarVec' && path === 'args[0]' && typeof (math as unknown as Record<string, unknown>)[name] === 'function') return
    const afterNumber = p?.type === 'OperatorNode' && (p.fn === 'multiply' || p.fn === 'divide') && p.args?.some((a) => a.type === 'ConstantNode' || a.type === 'OperatorNode')
    const compoundUnit = p?.type === 'OperatorNode' && (p.fn === 'divide' || p.fn === 'pow') && isUnitName(name)
    const inConversion = p?.type === 'OperatorNode' && p.fn === 'to'
    if (isUnitName(name) && (afterNumber || compoundUnit || inConversion)) return
    out.add(name)
  })
  return [...out]
}

function assertKnown(node: MathNode) {
  const unknown = unknownSymbols(node)
  if (unknown.length) {
    const n = unknown[0]
    if (n in TYPE_INSTEAD) throw new Error(unknownUnit(n, true))
    throw new Error(`"${n}" does not exist yet. Create it first, for example  ${n} = <1, 2>  or  ${n} = (1, 2)  or  ${n} = 5`)
  }
}

// An odd root of a negative number is the real root, (−8)^(1/3) = −2, as on the Calculator (owner, 2026-10-08).
const evaluateNode = (node: MathNode) => evaluateWithRealRoots(node, { ...scene().ev.scope }).value

const isGeo = (node: MathNode) => {
  const k = inferKind(node, kindOfName)
  return k === 'vector' || k === 'point'
}

/**
 * The × key is parsed as `timesOrCross`, which only decides what it means at evaluation time.
 * Kind inference and the step solver never learned that name, so `A × B` printed a bare
 * `[0, 0, -11]` with no steps and `C = A × B` refused with "not a number". Once the operands are
 * known the call is rewritten into the cross product or the ordinary product it stands for.
 * The · key (dot) is the same: between two vectors it stays the dot product, and with a number on
 * either side it is the ordinary product — `2·A` printed a vector with no steps and `C = 2·A` made
 * one with none, because only a `*` reaches the scalar-multiple steps.
 */
function resolveTimes(node: MathNode): MathNode {
  return node.transform((n) => {
    const fn = n as Node
    if (fn.type !== 'FunctionNode') return n
    const fname = (fn.fn as { name?: string }).name
    const args = fn.args as MathNode[]
    // A word-form dot(A) or dot(A, B, C) is left to say in its own words what it is missing.
    if ((fname !== 'timesOrCross' && fname !== 'dot') || args.length !== 2) return n
    const a = resolveTimes(args[0])
    const b = resolveTimes(args[1])
    if (isGeo(a) && isGeo(b)) return new math.FunctionNode(fname === 'dot' ? 'dot' : 'cross', [a, b])
    return new math.OperatorNode('*', 'multiply', [a, b])
  })
}

const parseNode = (src: string): Node => resolveTimes(math.parse(preprocess(src, sceneNames()))) as Node

/** A number in LaTeX at a fixed number of decimals, or in the student's own precision. */
const texAt = (n: number, p: Precision): string => (typeof p === 'number' ? tex(n, p) : texPrecise(n, p))

export function describeComputed(c: Computed | undefined, decimals: Precision = 3): string {
  if (!c) return '—'
  switch (c.type) {
    case 'point':
      return `(${c.p.map((v) => texAt(v, decimals)).join(', ')})`
    case 'vector':
      return `${texIJK(c.comp, decimals)}`
    case 'number':
      return texAt(c.value, decimals)
    case 'segment':
      return `\\text{length } ${texAt(len(c.line.d), decimals)}`
    case 'ray':
    case 'line':
      return `\\text{line through } (${c.line.p.slice(0, 2).map((v) => texAt(v, decimals)).join(', ')})`
    case 'circle':
      return `\\text{circle, } r = ${texAt(c.circle.r, decimals)}`
    case 'polygon':
      return `\\text{${c.pts.length === 3 ? 'triangle' : 'polygon'}, area } ${texAt(polygonArea(c.pts), decimals)}`
    case 'angle':
      return texMeasure(c.value, 'angle', scene().settings)
    default:
      return ''
  }
}

// ---------------------------------------------------------------------------

export async function runCommand(raw: string): Promise<void> {
  const input = raw.trim()
  if (!input) return
  const lower = input.toLowerCase()
  const s = scene()

  if (lower === 'clear' || lower === 'new') {
    s.newScene()
    s.pushLog({ input, kind: 'info', text: 'Scene cleared.' })
    return
  }
  if (lower === 'undo') return s.undo()
  if (lower === 'redo') return s.redo()
  if (lower === 'play') return s.setPlaying(true)
  if (lower === 'pause' || lower === 'stop') return s.setPlaying(false)
  if (lower === '2d' || lower === '3d') return s.setViewMode(lower)
  if (lower === 'help' || lower === '?') {
    s.pushLog({ input, kind: 'info', text: HELP })
    return
  }
  const del = input.match(/^(?:delete|del|remove)\s+(.+)$/i)
  if (del) {
    const ids = del[1].split(/[,\s]+/).map((n) => s.ev.names.get(n)).filter(Boolean) as ObjId[]
    if (!ids.length) return logError(input, 'Nothing with that name.')
    s.removeObjects(ids)
    s.pushLog({ input, kind: 'info', text: `Deleted ${del[1]}.` })
    return
  }

  try {
    if (tryPureMath(input)) return
    if (await tryCas(input)) return
    if (tryGraph(input)) return
    if (tryAssignment(input)) return
    if (tryGeometryCommand(input, undefined)) return
    if (trySolverCommand(input)) return
    evaluatePlain(input)
  } catch (e) {
    logError(input, friendlyError(e, input))
  }
}

/** The parser's own words, which a student is never shown: "Parenthesis ) expected (char 7)". */
const PARSER_WORDS = /\(char \d+\)|Value expected|Parenthesis [)\]] expected|Unexpected operator|Syntax ?error|End of (matrix|string)/i

function friendlyError(e: unknown, input = ''): string {
  const msg = e instanceof Error ? e.message : String(e)
  const unknown = msg.match(/Undefined symbol (\w+)/)?.[1]
  if (unknown) return unknownNameSentence(unknown, freeLetterFor('abcmn'))
  // f(2) after f(x) = x^2: the evaluator keeps no value for a graph, so it has no function f to call
  // and says "Undefined function f", which is neither a graph's nor a typo's way of putting it.
  const called = msg.match(/Undefined function (\S+)/)?.[1]
  if (called) return Object.keys(namedGraphs()).includes(called) ? `${called} is a graph, so it cannot be used as a number in a formula yet.` : unknownFunctionSentence(called)
  if (/Units do not match|in function to\b|Unit "[^"]+" not found/.test(msg)) {
    return unitRefusal(e, undefined, undefined, true)
  }
  if (/Unexpected end/.test(msg)) return 'The expression is incomplete. Check your brackets.'
  // mathjs reads 2 + 3 = 5 as an assignment to 2, and said so in its own words.
  if (/Invalid left hand side/.test(msg)) return `Only a name can stand on the left of =, as in k = 2. To solve an equation, type it inside solve( ): solve(${input}).`
  if (/Unexpected type of argument/.test(msg)) return 'A function was given the wrong kind of value — a vector or a point where it needs a number, for example.'
  if (PARSER_WORDS.test(msg)) {
    const why = plainParseError(msg)
    return `${why.charAt(0).toUpperCase()}${why.slice(1)}.`
  }
  return msg
}

// ---------------------------------------------------------------------------
// Graphs: y = f(x), f(x) = ..., z = f(x,y), r = f(θ), implicit, inequalities, curves
// ---------------------------------------------------------------------------

const isFunctionName = (name: string): boolean => typeof (math as unknown as Record<string, unknown>)[name] === 'function'

/**
 * A polar formula with θ spelt theta, as the graph stores it, and a product wherever θ touches a
 * name. The bare replace glued them: r = aθ (slider a) became "atheta", a name nobody has, and was
 * refused as one. A space is the product the parser reads between two names (r = a θ already
 * drew). A function name such as sin is left as typed — sinθ is no product.
 */
function thetaSpelt(text: string): string {
  return text
    .replace(/[A-Za-zπ]+(?=θ)/g, (run) => (isFunctionName(run) ? run : `${run} `))
    .replace(/θ(?=[A-Za-zπθ])/g, 'θ ')
    .replace(/θ/g, 'theta')
}

/**
 * A graph is stamped 'graphing' wherever it was typed (Builder.base), but nothing used to follow
 * it there: y = x² − 3 typed in Vectors mode cleared the bar, logged "Graph created" to a Console
 * that was not open, and drew nothing until the student found Graphing by hand. Called after the
 * graph exists, so a refused line (an unknown name) leaves the student where they were.
 */
function landInGraphing(): string {
  if (scene().activeSpace === 'graphing') {
    // The Calculator looks at the Graphing drawing too (P-GCALC GC1): the picture opens beside the
    // Maths screen there, instead of switching away from the working.
    if (useApp.getState().mode === 'calculator') showBeside('viewport', 'maths')
    return ''
  }
  enterMode('graphing')
  return ' Switched to Graphing to show it.'
}

/** A relation sign in a typed line: what it means (≤ is <=, ≠ is !=), where it stands, and its length as typed. */
interface Relation {
  op: '=' | '==' | '!=' | '<' | '>' | '<=' | '>='
  at: number
  len: number
}

const SPELT: Record<string, Relation['op']> = { '≤': '<=', '=<': '<=', '≥': '>=', '=>': '>=', '≠': '!=' }
const INEQUALITY_OPS = new Set<Relation['op']>(['<', '>', '<=', '>='])

/**
 * The line with the words inside its quotes blanked out, every character kept as a space so a
 * position found in the result is the same position in the line. A label says what it likes —
 * Text("F = ma = 10 N") — and none of its signs is an equation: counting them turned that line away
 * as "several equations", where it made a label before the refusal existed. A quote left open runs
 * to the end of the line, as the Text command reads it (it strips a quote that is not closed too).
 * A single quote is a label's only where it starts an argument; after a name or a bracket it is the
 * prime of f'(x) = f''(x).
 */
function withoutQuotedText(line: string): string {
  const blank = (words: string): string => ' '.repeat(words.length)
  return line
    .replace(/"([^"]*)(")?/g, (_all: string, words: string, close?: string) => `"${blank(words)}${close ?? ''}`)
    .replace(/([(,]\s*)'([^']*)'(?=\s*[,)])/g, (_all: string, lead: string, words: string) => `${lead}'${blank(words)}'`)
}

/**
 * A bracket the bar takes for a vector literal: a comma inside, and no <, >, = or angle bracket within.
 * relationsIn and splitInputs share it. It is a copy of preprocess's own rule (math/expr.ts
 * angleVectors), not a call to it, and the two differ on a few lines — B = k<1, 2> + <3, 4> is one
 * assignment to preprocess and "several equations" here — so one rule for both would change what the
 * bar says: parked for the owner (OWNER-APPROVALS CW6a-2, tests/readerRules.test.ts).
 */
const VECTOR_LITERAL = /[⟨<][^<>=⟨⟩]*,[^<>=⟨⟩]*[⟩>]/g

/**
 * The relation signs in a line, each counted once (<= is one sign, not < and =). Quoted words are
 * blanked out first (withoutQuotedText). A vector literal brings a < and a > of its own, so it is
 * blanked out too (VECTOR_LITERAL) — unless its < follows a name or a closing bracket and no operand
 * ends after its >: y < x, y > 2 is two inequalities, not y times the vector <x, y>.
 */
function relationsIn(line: string): Relation[] {
  const unquoted = withoutQuotedText(line)
  // A vector literal is no relation. One written against a name or a bracket is a vector too when the
  // line ends or an operand ends after its > (k<1, 2>: the signs math/expr.ts lists in AFTER_VECTOR, but
  // not a sign before another vector or a closing |, as preprocess also allows); otherwise that < and >
  // compare, as in x < 3, x > 1. B = k<1, 2> was "several equations".
  const masked = unquoted.replace(VECTOR_LITERAL, (lit: string, at: number) =>
    lit.startsWith('<') &&
    /[A-Za-zͰ-Ͽ_)\]'′″‴⁗]$/.test(unquoted.slice(0, at).trimEnd()) &&
    !/^\s*(?:$|[,;)\]}*/÷×·⋅^=?:])/.test(unquoted.slice(at + lit.length))
      ? lit
      : ' '.repeat(lit.length)
  )
  return [...masked.matchAll(/<=|>=|=<|=>|==|!=|≤|≥|≠|<|>|=/g)].map((m) => ({ op: SPELT[m[0]] ?? (m[0] as Relation['op']), at: m.index ?? 0, len: m[0].length }))
}

const COUNTED = ['', 'one', 'two', 'three', 'four']

/**
 * The owner typed the help's graph examples run together and was told "Shaded region created."
 * with nothing drawn: the inequality pattern took the first > and refused only when two more angle
 * brackets remained, never for an =, and a line with two = went on to the calculator, which quoted
 * mathjs. 1 < x < 3 was stored as one inequality with the true-or-false of x < 3 inside it. Each
 * relation is a graph of its own, so the line is refused; a chain is split into the inequalities
 * the student can type one by one.
 */
function refuseSeveral(input: string, rels: Relation[]): never {
  if (!rels.every((r) => INEQUALITY_OPS.has(r.op))) throw new Error('That line holds several equations — type one at a time.')
  const parts = chainParts(input, rels)
  throw new Error(`That line holds ${COUNTED[rels.length] ?? 'several'} inequalities — type one at a time${parts.length ? `: ${parts.join(', then ')}` : ''}.`)
}

/** A chain's inequalities as each would be typed alone: 1 < x < 3 is 1 < x, then x < 3. */
function chainParts(input: string, rels: Relation[]): string[] {
  // y < x, y > 2: the student has separated them already.
  const pieces = splitArgs(input)
  if (pieces.length === rels.length && pieces.every((p) => relationsIn(p).length === 1)) return pieces
  const ends = [0, ...rels.map((r) => r.at + r.len)]
  const terms = [...rels.map((r, i) => input.slice(ends[i], r.at)), input.slice(ends[rels.length])].map((t) => t.trim())
  if (terms.some((t) => !t || t.includes(','))) return []
  return rels.map((r, i) => `${terms[i]} ${input.slice(r.at, r.at + r.len)} ${terms[i + 1]}`)
}

/**
 * y ≠ x was split at the = of its != and drew the factorial curve y! = x, and y == x answered
 * "Value expected (char 1)". A "not equal" region is the whole plane less one curve, and == is a
 * programming language's equals.
 */
function refuseSign(input: string, rel: Relation): never {
  const l = input.slice(0, rel.at).trim()
  const r = input.slice(rel.at + rel.len).trim()
  if (rel.op === '==') throw new Error(`One = sign is enough for an equation: type ${l} = ${r}.`)
  throw new Error(`A "not equal" sign is true everywhere except along one curve, so there is no region to shade. Type < or > instead: ${l} < ${r} or ${l} > ${r}.`)
}

/**
 * x, y and z are a graph's letters, and tryAssignment leaves them to the graph routes on purpose
 * (y = 2x must stay a graph). So `y = (1, 2)` reached a route that could only say the graph had no
 * real value for any x. A value that is a point or a vector on its own, with no x or y in it, is a
 * name for one, whatever the student meant by the letter: say so, and offer a letter that no object
 * in the scene has, because P = (1, 2) would move a point P that is already there.
 */
function refuseGraphLetterAsName(letter: string, rhs: string): void {
  if (letter !== 'x' && letter !== 'y' && letter !== 'z') return
  let node: Node
  try {
    node = parseNode(rhs)
  } catch {
    return // a formula that does not parse has the graph routes' own words
  }
  if (symbolsOf(node).some((s) => GRAPH_VARS.has(s))) return
  // An unknown k stays a number here: on the bar it is the unit vector, in a graph a slider to make.
  const kind = inferKind(node, (name) => kindOfName(name) ?? 'number')
  if (kind !== 'point' && kind !== 'vector') return
  // The example has the student's own number of coordinates: z = (1, 2, 3) was offered P = (1, 2).
  const three = isThreeD(node)
  const example = kind === 'point' ? (three ? '(1, 2, 3)' : '(1, 2)') : three ? '<1, 2, 3>' : '<1, 2>'
  throw new Error(`${letter} is the letter a graph uses, so it cannot name a ${kind} — call it something else, e.g. ${freeLetterFor(kind === 'point' ? 'PQRST' : 'ABCDF')} = ${example}.`)
}

/** Whether a point or a vector is in three dimensions: typed with three coordinates, or with a part along z. */
function isThreeD(node: Node): boolean {
  const call = node as MathNode & { fn?: { name?: string }; args?: MathNode[] }
  if (call.type === 'FunctionNode' && (call.fn?.name === 'pt' || call.fn?.name === 'vec') && call.args?.length === 3) return true
  try {
    // eslint-disable-next-line no-restricted-syntax -- mirrors the number writer's display floor: a z that math/format.ts does not write (fmtPoint, texIJK: under 10⁻¹²) is no third coordinate; not at exactly 10⁻¹², which the writer shows (a found bug, tests/noiseFloors.test.ts)
    return Math.abs(toV3(evaluateNode(node))[2]) > 1e-12
  } catch {
    return false // a sum that cannot be worked out has no third coordinate to go by
  }
}

/** Only the scene's own names: the evaluator's scope also holds the clock t and the unit vectors i, j, k, which no graph reads as a slider. */
function namedScope(): Record<string, unknown> {
  const { names, scope } = scene().ev
  const out: Record<string, unknown> = {}
  for (const n of names.keys()) out[n] = scope[n]
  return out
}

/**
 * The scene's graphs by name, each with its formula when it is a plain y = f(x). The evaluator keeps
 * no value for a graph, so a call such as g(x) looked like a slider's and was told to type g*(x).
 */
function namedGraphs(): NamedGraphs {
  const out: NamedGraphs = {}
  for (const o of Object.values(scene().objects)) if (o.type === 'graph') out[o.name] = o.kind === 'explicit' ? (o.exprs[0] ?? null) : null
  return out
}

/**
 * Refuses, in its own sentence, a graph that would show nothing (core/visualize.ts, drawability);
 * otherwise returns what to add to the message — " — at k = −1 there is nothing to draw…" when it is
 * empty only at the sliders' current values, or ''.
 */
function mustDraw(spec: DrawSpec): string {
  const r = drawability(spec, namedScope(), scene().settings, namedGraphs())
  if (!r.ok) throw new Error(r.reason)
  return r.note ? ` — ${r.note}` : ''
}

const withNote = (text: string, note: string): string => (note ? `${text.replace(/\.$/, '')}${note}.` : text)

/**
 * sin(x) = 2 is an equation about the function sin, not the definition of a new function called
 * sin: it made a graph named sin, the horizontal line y = 2. A name mathjs already has as a
 * function (sin, cos, sqrt, ln, log, exp, abs…) is never a definition.
 */
const isBuiltinFunction = (name: string): boolean => Object.prototype.hasOwnProperty.call(math, name) && typeof (math as unknown as Record<string, unknown>)[name] === 'function'

/** "a", "a and b", "a, b and c". */
const listAnd = (items: string[]): string => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

/**
 * The complex solutions of a polynomial with no real one, as the PhysLab Calculator's polynomial
 * mode gives them (polyRoots, written with calcNum in the student's precision), each conjugate pair
 * once with ±: x² + 4x + 13 = 0 is "x = −2 ± 3i".
 */
function complexSentence(pairs: XComplex[], p: CalcPrecision): string {
  const said = pairs.map(({ re, im }) => {
    const a = sayNum(re, p)
    const b = sayNum(im, p)
    const i = b === '1' ? 'i' : `${b}i`
    return a === '0' ? `x = ±${i}` : `x = ${a} ± ${i}`
  })
  return said.length ? ` In complex numbers: ${listAnd(said)}.` : ''
}

/** A number in a sentence about solutions: the calculator's own digits, the power of ten raised ("1 × 10⁻⁸", never "1×10^-8"). */
const sayNum = (x: number, p: CalcPrecision): string => superscriptPowers(calcNum(x, p))

/** How many digits past the student's own a list of solutions may add to tell two apart: past this they are one number to the last digit a double holds. */
const MAX_EXTRA_DIGITS = 12

/**
 * The solutions as numbers in the student's precision. Two that print alike — x = 3 and x = 3.005
 * are both "3" at two places — were listed as "x = 3 and x = 3", one solution said twice. Just
 * those get digits added, all the same number of them and one more at a time, until the list tells
 * apart (morePrecise); a solution that already looked different stays as it was.
 */
function solutionNumbers(xs: number[], p: CalcPrecision): string[] {
  const base = xs.map((x) => sayNum(x, p))
  const alike = base.map((l) => base.indexOf(l) !== base.lastIndexOf(l))
  if (!alike.some(Boolean)) return base
  let labels = base
  for (let extra = 1; extra <= MAX_EXTRA_DIGITS; extra++) {
    labels = xs.map((x, i) => (alike[i] ? sayNum(x, morePrecise(p, extra)) : base[i]))
    if (new Set(labels).size === labels.length) break
  }
  return labels
}

/** What an equation in x alone came to, for the student: its solutions, ascending, each a vertical line. */
function solvedSentence(sol: XSolved | null, p: CalcPrecision): string {
  // Not named: a formula too slow to solve in time, or one that is empty only for now (the note says so).
  if (sol?.kind !== 'real') return 'Drawn as a vertical line at each solution.'
  const listed = listAnd(solutionNumbers(sol.xs, p).map((n) => `x = ${n}`))
  if (sol.more) {
    const again = sol.more === 'further' ? 'There are more solutions further out.' : `The pattern repeats every ${sayNum(sol.more.period, p)}.`
    return `The solutions nearest 0 are ${listed} — each drawn as a vertical line. ${again}`
  }
  return sol.xs.length === 1 ? `The solution is ${listed} — drawn as a vertical line.` : `The solutions are ${listed} — each drawn as a vertical line.`
}

/**
 * An equation in x alone: x² = 4, (x − 1)² = 0, sin(x) = 0.5, x² + 4x + 13 = 0. Nothing ties y to
 * x, so it is a vertical line at each x that makes it true, and nothing at all when no real x does.
 * That last was announced "Implicit curve created." with nothing on the screen; it is refused in a
 * sentence that says why, with the complex solutions when it is a polynomial. One graph is made, with
 * the student's own formula, so a slider in it still moves the lines (render/GraphView.tsx).
 */
function equationInX(input: string, lhs: string, rhs: string, expr: string): void {
  const s = scene()
  const p = s.settings
  const sides: [string, string] = [lhs, rhs]
  const r = drawability({ kind: 'implicit', exprs: [expr], sides }, namedScope(), p, namedGraphs())
  if (!r.ok) {
    const none = r.reason === NO_REAL_X ? solutionsInX(expr, sides, namedScope()) : null
    throw new Error(r.reason + (none?.kind === 'none' ? complexSentence(none.complex, p) : ''))
  }
  const note = r.note ? ` — ${r.note}` : ''
  visualizeGraph(input, [expr], 'implicit')
  const sol = note ? null : solutionsInX(expr, sides, namedScope())
  s.pushLog({ input, kind: 'result', text: withNote(solvedSentence(sol, p), note) + landInGraphing() })
}

function tryGraph(input: string): boolean {
  let m: RegExpMatchArray | null
  const s = scene()

  // curve(…), piecewise(…), between(…) and tangent(…) read their own arguments and say how they are written.
  const rels = /^\s*(curve|piecewise|between|tangent)\s*\(/i.test(input) ? [] : relationsIn(input)
  if (rels.length > 1) refuseSeveral(input, rels)
  const rel = rels.length ? rels[0] : undefined
  // ≤ and ≥ (the Calculator writes its inequality answers with them) were turned into <= and >= only
  // after this had looked for a relation, so y ≥ 2x answered: I don't know "y".
  const line = rel ? input.slice(0, rel.at) + rel.op + input.slice(rel.at + rel.len) : input
  const graphish = usesSymbol(line, 'x') || usesSymbol(line, 'y')
  if (rel && graphish && (rel.op === '!=' || rel.op === '==')) refuseSign(input, rel)
  if (rel?.op === '=') refuseGraphLetterAsName(line.slice(0, rel.at).trim(), line.slice(rel.at + 1))

  if ((m = line.match(/^\s*y\s*=\s*(.+)$/)) && !usesSymbol(m[1], 'y')) {
    graphIfFunctionOfX(input, m[1], undefined)
    return true
  }
  if ((m = line.match(/^\s*([A-Za-z]\w*)\s*\(\s*x\s*\)\s*=\s*(.+)$/)) && !isBuiltinFunction(m[1])) {
    graphIfFunctionOfX(input, m[2], m[1])
    return true
  }
  // Every route below asks mustDraw before it makes anything: each used to store the formula and
  // announce it, and the viewport, compiling it later, drew nothing without a word.
  if ((m = line.match(/^\s*z\s*=\s*(.+)$/))) {
    const note = mustDraw({ kind: 'surface', exprs: [m[1]] })
    visualizeGraph(input, [m[1]], 'surface')
    s.pushLog({ input, kind: 'result', text: withNote('Surface created in the 3D view.', note) + landInGraphing() })
    return true
  }
  if ((m = line.match(/^\s*r\s*=\s*(.+)$/)) && /θ|theta/.test(m[1])) {
    const expr = thetaSpelt(m[1])
    const note = mustDraw({ kind: 'polar', exprs: [expr], tMin: 0, tMax: 2 * Math.PI })
    visualizeGraph(input, [expr], 'polar', { tMin: 0, tMax: 2 * Math.PI })
    s.pushLog({ input, kind: 'result', text: withNote('Polar curve created.', note) + landInGraphing() })
    return true
  }
  if ((m = line.match(/^\s*curve\s*\((.+)\)\s*$/i))) {
    const parts = splitArgs(m[1])
    if (parts.length < 2) throw new Error('curve(x(t), y(t), tmin, tmax)')
    // numberArg reads a slider, as every other bound on the bar does; math.evaluate without the
    // scope answered curve(cos(t), sin(t), 0, k) with I don't know "k" while k was on the screen.
    const tMin = parts[2] ? numberArg(parts[2]) : 0
    const tMax = parts[3] ? numberArg(parts[3]) : 2 * Math.PI
    const note = mustDraw({ kind: 'parametric', exprs: [parts[0], parts[1]], tMin, tMax })
    visualizeGraph(input, [parts[0], parts[1]], 'parametric', { tMin, tMax })
    s.pushLog({ input, kind: 'result', text: withNote('Parametric curve created.', note) + landInGraphing() })
    return true
  }
  // Question pictures, spelt the way they are said: a curve in pieces, the region between two
  // curves, the tangent at a point.
  if ((m = line.match(/^\s*piecewise\s*\((.+)\)\s*$/i))) {
    const pieces = splitArgs(m[1]).map((part) => {
      const piece = part.match(/^(.+?)\s+from\s+(.+?)\s+to\s+(.+)$/i)
      if (!piece) throw new Error('Each piece is a formula and its stretch of x: piecewise(x^2 from -3 to 0, x from 0 to 2)')
      return { expr: piece[1].trim(), from: numberArg(piece[2]), to: numberArg(piece[3]) }
    })
    const note = mustDraw({ kind: 'piecewise', exprs: pieces.map((p) => p.expr), pieces })
    visualizePiecewise(pieces, undefined, input)
    s.pushLog({ input, kind: 'result', text: withNote(`Piecewise curve created with ${pieces.length} ${pieces.length === 1 ? 'piece' : 'pieces'}.`, note) + landInGraphing() })
    return true
  }
  if ((m = line.match(/^\s*between\s*\((.+)\)\s*$/i))) {
    const parts = splitArgs(m[1])
    if (parts.length !== 4) throw new Error('between(first curve, second curve, from x, to x), e.g. between(x^2, x + 2, -1, 2)')
    const a = numberArg(parts[2])
    const bnd = numberArg(parts[3])
    // betweenArea leaves out a column where a curve has no value, so a region with no value
    // anywhere had an area of 0 and was announced: "Region shaded. … 0".
    const note = mustDraw({ kind: 'between', exprs: [parts[0], parts[1]], tMin: Math.min(a, bnd), tMax: Math.max(a, bnd) })
    // Empty at the sliders' values, the area is 0 and the label would say so: it stays off.
    const area = visualizeBetween(parts[0], parts[1], a, bnd, undefined, note !== '')
    const p = s.settings
    const said = note ? `Region shaded${note}.` : `Region shaded. Area between the curves from x = ${fmtLabel(Math.min(a, bnd), p)} to ${fmtLabel(Math.max(a, bnd), p)}: ${fmtLabel(area, p)}.`
    s.pushLog({ input, kind: 'result', text: said + landInGraphing() })
    return true
  }
  // tangent(P, c) — a point and a circle — is the geometry command; this is a formula and a number.
  const tan = line.match(/^\s*tangent\s*\((.+)\)\s*$/i)
  if (tan) {
    const [expr, at, ...rest] = splitArgs(tan[1])
    if (at !== undefined && rest.length === 0 && kindOfName(expr) === undefined && usesSymbol(expr, 'x')) {
      // tangent(q*x, 1) with no slider q said the curve "has no value at x = 1". A refusal that writes
      // the line out writes this one: tangent(sin(x), 1) for tangent(g(x), 1), not "y = sin(x)".
      mustDraw({ kind: 'explicit', exprs: [expr], lineWith: (formula) => `tangent(${formula}, ${at})` })
      const a = numberArg(at)
      const { slope } = visualizeTangentAt(expr, a)
      const p = s.settings
      // The x the student typed is named as typed: 0.001 at two places read "x = 0", a point the tangent is not at.
      const atLabel = fmtLabel(a, p)
      const typed = at.trim()
      const xSaid =
        a !== 0 && /^[−-]?0(?:\.0*)?$/.test(atLabel)
          ? /^-?\d*\.?\d+$/.test(typed)
            ? typed.replace(/^-/, '−')
            : fmtLabel(a, { decimals: 3, precisionMode: 'sf' })
          : atLabel
      s.pushLog({ input, kind: 'result', text: `Tangent drawn at x = ${xSaid}. Its slope is ${fmtLabel(slope, p)}.` + landInGraphing() })
      return true
    }
  }
  if (rel && INEQUALITY_OPS.has(rel.op) && graphish) {
    const op = rel.op as '<' | '<=' | '>' | '>='
    const expr = `(${line.slice(0, rel.at)}) - (${line.slice(rel.at + op.length)})`
    // y > sin(x was shaded as nothing under "Shaded region created.": the viewport compiled it later and drew nothing.
    const note = mustDraw({ kind: 'inequality', exprs: [expr], op })
    visualizeGraph(input, [expr], 'inequality', { op })
    s.pushLog({ input, kind: 'result', text: withNote('Shaded region created.', note) + landInGraphing() })
    return true
  }
  if (rel?.op === '=' && graphish) {
    const lhs = line.slice(0, rel.at)
    const rhs = line.slice(rel.at + 1)
    // Primes as core/naming.ts isValidName allows them: points after Z are A′, A″ (Fix 11).
    const isName = /^[A-Za-zͰ-Ͽ][\w'′″‴⁗]*$/.test(lhs.trim()) && !GRAPH_VARS.has(lhs.trim())
    if (!isName) {
      const expr = `(${lhs}) - (${rhs})`
      if (inXAlone(expr)) {
        equationInX(input, lhs, rhs, expr)
        return true
      }
      const note = mustDraw({ kind: 'implicit', exprs: [expr], sides: [lhs, rhs] })
      visualizeGraph(input, [expr], 'implicit')
      s.pushLog({ input, kind: 'result', text: withNote('Implicit curve created.', note) + landInGraphing() })
      return true
    }
  }
  return false
}

/** A number typed as an argument, which may use a slider's name; anything else is refused in a sentence. */
function numberArg(text: string): number {
  let v: unknown
  try {
    v = math.evaluate(preprocess(text, sceneNames()), { ...scene().ev.scope })
  } catch {
    throw new Error(`"${text.trim()}" is not a number.`)
  }
  const n = Number(plainNumber(v))
  if (!Number.isFinite(n)) throw new Error(`"${text.trim()}" is not a number.`)
  return n
}

/**
 * y = f(x). The unknown-name check is mustDraw's, shared with every route: this one's own exempted
 * only pi and e, so y = tau was told to make a slider while tau alone on the bar answered 6.283.
 */
function graphIfFunctionOfX(input: string, rhs: string, name?: string) {
  const note = mustDraw({ kind: 'explicit', exprs: [rhs] })
  visualizeGraph(input, [rhs], 'explicit', { name })
  scene().pushLog({ input, kind: 'result', text: (note ? `Graph created${note}.` : 'Graph created. Roots and turning points are marked.') + landInGraphing() })
}

function usesSymbol(src: string, sym: string): boolean {
  try {
    return symbolsOf(math.parse(preprocess(src.replace(/(<=|>=|<|>|=)/g, ','), sceneNames()))).includes(sym)
  } catch {
    return new RegExp(`(^|[^A-Za-z_])${sym}([^A-Za-z_(]|$)`).test(src)
  }
}

// ---------------------------------------------------------------------------
// Assignments: name = expression | geometry command
// ---------------------------------------------------------------------------

/** The prime signs a name may carry (core/naming.ts), at the end of it. */
const PRIME_CHARS = /['′″‴⁗]+$/

/** How many primes a name carries: ' and ′ one each, ″ two, ‴ three, ⁗ four. */
const primesIn = (name: string): number => [...(name.match(PRIME_CHARS)?.[0] ?? '')].reduce((n, c) => n + ({ "'": 1, '′': 1, '″': 2, '‴': 3, '⁗': 4 }[c] ?? 0), 0)

/**
 * A full turn for every slider a line uses as an angle in degrees — the k of B = 3 ∠ k°, which
 * preprocess writes k deg. A slider's range comes from its value, so the cross-product lesson's
 * k = 60 stopped at 120 while the lesson says "Past 180°, C flips downward". The range only grows,
 * so the value and a wider range the slider already had stay inside it. It rides on the line's own
 * undo step: one undo takes back the line and the wider range together.
 */
function widenDegreeSliders(node: MathNode): void {
  const s = scene()
  const isDeg = (n: MathNode | undefined): boolean => n?.type === 'SymbolNode' && (n as unknown as { name: string }).name === 'deg'
  node.traverse((n) => {
    const op = n as MathNode & { fn?: string; args?: MathNode[] }
    if (n.type !== 'OperatorNode' || op.fn !== 'multiply' || op.args?.length !== 2) return
    let angle = isDeg(op.args[1]) ? op.args[0] : isDeg(op.args[0]) ? op.args[1] : undefined
    while (angle?.type === 'ParenthesisNode') angle = (angle as unknown as { content: MathNode }).content
    if (angle?.type !== 'SymbolNode') return
    const id = s.ev.names.get((angle as unknown as { name: string }).name)
    const o = id ? s.objects[id] : undefined
    if (o?.type !== 'number' || !o.slider || (o.slider.min <= 0 && o.slider.max >= 360)) return
    s.updateObject(o.id, (d) => {
      if (d.type !== 'number' || !d.slider) return
      d.slider.min = Math.min(d.slider.min, 0)
      d.slider.max = Math.max(d.slider.max, 360)
    }, false)
  })
}

function tryAssignment(input: string): boolean {
  // ′ ″ ‴ ⁗ as in core/naming.ts isValidName: after Z the app names points A′, A″ (Fix 11), and a
  // student must be able to move or redefine them from the bar like any other point.
  const m = input.match(/^\s*([A-Za-zͰ-Ͽ][\wͰ-Ͽ'′″‴⁗]*)\s*=(?!=)\s*(.+)$/)
  if (!m) return false
  const [, name, rhs] = m
  if (GRAPH_VARS.has(name) || name === 'z') return false
  if (!isValidName(name)) throw new Error(`"${name}" is a reserved name. Try another.`)
  // y'' = -y is a differential equation as a physics student writes one: a small letter with two
  // primes, and no such letter in the scene to carry them (the bar names points A′ and A″, and a
  // v′ beside a v is a name like any other). It cannot be solved, and the number it made could
  // only be wrong, so it is said in a sentence and nothing is made.
  if (primesIn(name) >= 2 && /^\p{Ll}/u.test(name) && !scene().ev.names.has(name.replace(PRIME_CHARS, ''))) {
    throw new Error(`${name} = ${rhs.trim()} looks like a differential equation, and the bar cannot solve those. Type the graph you expect instead, e.g. y = sin(x).`)
  }
  // A Lego piece's corners carry ordinary letters since Fix 17, so "E = (9, 9)" typed to make a
  // new point E would redefine one corner and bend the piece. It moves only as a whole.
  const taken = scene().ev.names.get(name)
  if (taken && isPieceCorner(taken, scene().objects)) throw new Error(`${name} is a corner of a piece. Slide, turn or flip the piece to move it, or choose another letter.`)
  if (tryGeometryCommand(rhs, name, input)) return true

  // The line is kept as typed: the runtime × (math/expr.ts, timesOrCross) reads every case the
  // bar does, so `C = 2 × A` stays `2 × A` in the Properties field instead of becoming `2 * A`.
  const node = parseNode(rhs)
  const expr = rhs
  const unknown = unknownSymbols(node).filter((s) => s !== name)
  if (unknown.length) assertKnown(node)
  const kind = inferKind(node, kindOfName)
  const existing = scene().ev.names.get(name)
  const b = new Builder()
  let obj: SceneObject

  if (kind === 'point') {
    obj = isConstant(node) ? b.point(toV3(evaluateNode(node)), { name }) : b.point({ kind: 'expr', expr }, { name })
  } else if (kind === 'vector') {
    const unit = unitOf(node)
    if (isConstant(node)) {
      obj = b.vector({ kind: 'free', tail: [0, 0, 0], comp: toV3(evaluateNode(node)) }, { name, unit })
    } else {
      const addends = sumOperands(node)
      const first = addends?.[0] ? scene().ev.names.get(addends[0]) : undefined
      obj = b.vector({ kind: 'expr', expr, tailOf: first }, { name, unit, color: addends ? '#ffd43b' : undefined })
      if (addends && addends.length >= 2) addHeadToTailHelpers(b, addends)
    }
  } else {
    const constant = isConstant(node)
    const value = constant ? Number(evaluateNode(node)) : NaN
    if (constant && Number.isFinite(value)) {
      const span = Math.max(10, Math.ceil(Math.abs(value) * 2))
      obj = b.number(expr, { name, slider: { min: value < 0 ? -span : Math.min(0, -span / 2), max: span, step: Math.abs(value) < 1 && value !== 0 ? 0.01 : 0.1 } })
    } else {
      obj = b.number(expr, { name })
    }
  }

  // The object is tried on a copy of the scene first: a line that can never work (y is no value, a
  // needs itself) is refused with the scene as it was, where it was added and then reported, and what
  // it made stayed. A value that mends when something moves is kept and said below.
  const adds = existing ? replacement(existing, obj, b) : b.created
  const failed = errorOnTrial(adds, existing ?? obj.id)
  if (failed && !(MENDS_WHEN_THINGS_MOVE.test(failed) && !isConstant(node))) throw new Error(`${name}: ${failed}`)
  if (existing) scene().addObjects(adds, { select: true })
  else b.commit()
  widenDegreeSliders(node)

  const c = scene().ev.values.get(scene().ev.names.get(name) ?? '')
  const err = scene().ev.errors.get(scene().ev.names.get(name) ?? '')
  if (err) {
    scene().pushLog({ input, kind: 'error', text: `${name}: ${err}` })
    return true
  }
  const solution = solutionFor(node, name)
  scene().pushLog({
    input,
    kind: 'result',
    tex: `${name} = ${describeComputed(c, scene().settings)}${c?.type === 'vector' ? vectorExtras(c.comp) : ''}`,
    solution: solution ?? undefined
  })
  return true
}

function vectorExtras(v: V3): string {
  const s = scene().settings
  const m = texPrecise(len(v), s)
  // eslint-disable-next-line no-restricted-syntax -- mirrors the number writer's display floor: θ is given while texIJK writes no z (under 10⁻¹²); a z of exactly 10⁻¹², and a vector wholly under the floor, are found bugs (tests/noiseFloors.test.ts)
  if (Math.abs(v[2]) > 1e-12) return `,\\quad \\text{magnitude } ${m}`
  return `,\\quad \\text{magnitude } ${m},\\ \\theta = ${texMeasure(heading(v), 'direction', s)}`
}

function unitOf(node: MathNode): string | undefined {
  let unit: string | undefined
  node.traverse((n) => {
    if (n.type === 'SymbolNode') {
      const nm = (n as unknown as { name: string }).name
      if (nm !== 'deg' && nm !== 'rad' && !scene().ev.names.has(nm) && isUnitName(nm)) unit ??= nm
    }
  })
  return unit
}

/** For `A + B + C` with vector symbols returns ['A','B','C']. */
function sumOperands(node: MathNode): string[] | null {
  const out: string[] = []
  const walk = (n: Node): boolean => {
    if (n.type === 'ParenthesisNode') return walk(n.content as Node)
    if (n.type === 'OperatorNode' && n.fn === 'add') return (n.args as Node[]).every(walk)
    if (n.type === 'SymbolNode' && kindOfName(n.name as string) === 'vector') {
      out.push(n.name as string)
      return true
    }
    return false
  }
  return walk(node as Node) && out.length >= 2 ? out : null
}

/** Faint copies of B, C… placed head-to-tail after A, linked live. */
function addHeadToTailHelpers(b: Builder, names: string[]) {
  const ids = names.map((n) => scene().ev.names.get(n)!)
  let prev = ids[0]
  for (let i = 1; i < ids.length; i++) {
    // The hidden tail point is named after the copy it carries, not from the shared A, B, C…
    // alphabet: after `R = A + B` it used to take the name C, and the student's next line
    // `C = <-1, 2>` quietly replaced it, leaving B′ hanging off a vector instead of a point.
    const head = b.point({ kind: 'vectorHead', vector: prev }, { name: `${names[i]}′tail`, auxiliary: true, visible: false })
    const placed = b.vector({ kind: 'placed', vector: ids[i], tail: head.id }, { name: `${names[i]}′`, color: '#868e96', auxiliary: true })
    prev = placed.id
  }
}

/** Replace one object id with another wherever it is used, without touching text or colours. */
function remapIds<T>(value: T, from: ObjId, to: ObjId): T {
  if (typeof value === 'string') return (value === from ? to : value) as T
  if (Array.isArray(value)) return value.map((v) => remapIds(v, from, to)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = remapIds(v, from, to)
    return out as T
  }
  return value
}

/** What stands in the scene once `obj` has redefined `existingId`: the object under the old id, and the helpers made with it. */
function replacement(existingId: ObjId, obj: SceneObject, b: Builder): SceneObject[] {
  const old = scene().objects[existingId]
  const replaced = { ...obj, id: existingId, name: old.name, color: old.type === obj.type ? old.color : obj.color } as SceneObject
  const others = b.created.filter((o) => o.id !== obj.id)
  // Children created alongside (e.g. helper points) that referenced the new id must point at the old id.
  const fixed = others.map((o) => remapIds(o, obj.id, existingId) as SceneObject)
  return [replaced, ...fixed]
}

function redefine(existingId: ObjId, obj: SceneObject, b: Builder) {
  scene().addObjects(replacement(existingId, obj, b), { select: true })
}

/**
 * The error `id` would have, found on a copy of the scene before the scene is touched. A line that
 * failed used to be added first and reported after, and what it made stayed: `y'' = -y` left a
 * number y'' beside "Undefined symbol y", and `a = a + y` turned a good a into a broken one.
 */
function errorOnTrial(adds: SceneObject[], id: ObjId): string | undefined {
  const s = scene()
  const objects = { ...s.objects }
  const order = [...s.order]
  for (const o of adds) {
    objects[o.id] = o
    if (!order.includes(o.id)) order.push(o.id)
  }
  return evaluateScene(objects, order, s.settings, s.time).errors.get(id)
}

/**
 * A value that is not a number for now, or hangs on an object that is not (1/k while the slider k
 * is at 0): moving something mends it, so the object stays and the error is said. Everything else
 * the evaluator reports is the definition's own and never mends.
 */
const MENDS_WHEN_THINGS_MOVE = /^(not a number|depends on an undefined object|.+ is undefined)$/

// ---------------------------------------------------------------------------
// Geometry commands
// ---------------------------------------------------------------------------

const GEO_ALIASES: Record<string, string> = {
  point: 'Point', segment: 'Segment', line: 'Line', ray: 'Ray', circle: 'Circle', polygon: 'Polygon', triangle: 'Triangle',
  midpoint: 'Midpoint', perpendicular: 'Perpendicular', parallel: 'Parallel', perpendicularbisector: 'PerpendicularBisector',
  perpbisector: 'PerpendicularBisector', anglebisector: 'AngleBisector', intersect: 'Intersect', intersection: 'Intersect',
  angle: 'Angle', vector: 'Vector', slider: 'Slider', tangent: 'Tangent', centroid: 'Centroid', circumcenter: 'Circumcenter',
  incenter: 'Incenter', orthocenter: 'Orthocenter', text: 'Text', square: 'Square', regularpolygon: 'RegularPolygon'
}

/**
 * The most inputs a command reads, where it reads fewer than it was given without saying so:
 * Square(P, (1, 0), 3) dropped the 3 and built a square. The others refuse a wrong count already.
 */
const MOST_INPUTS: Partial<Record<string, number>> = { Square: 2, RegularPolygon: 3, Triangle: 3, Intersect: 3, Slider: 4, Text: 2 }

/**
 * A command's inputs with a vector typed in angle brackets kept whole: angle(<1, 0>, <0, 1>) was once
 * four inputs, "<1" among them. splitArgs (math/expr.ts) now keeps a vector whole by preprocess's own
 * rule; this holds every bracket VECTOR_LITERAL takes for one, a comparison too (angle(x < 3, y > 1)
 * is one input here and two to splitArgs), so splitArgs alone would change a command's inputs: parked
 * with relationsIn (OWNER-APPROVALS CW6a-2).
 */
function splitInputs(s: string): string[] {
  const held = s.replace(VECTOR_LITERAL, (vector) => vector.replace(/,/g, '\u0001'))
  // split/join, not a regex: a control character in a regex literal is a lint error (no-control-regex).
  return splitArgs(held).map((a) => a.split('\u0001').join(','))
}

/** Whether an input stands for a vector: a vector's name, or what it is made of (<1, 0>, 2A, A + B). */
function isVectorInput(text: string): boolean {
  const k = kindOfName(text)
  if (k !== undefined) return k === 'vector'
  try {
    return inferKind(parseNode(text), kindOfName) === 'vector'
  } catch {
    return false
  }
}

function tryGeometryCommand(src: string, name: string | undefined, fullInput = src): boolean {
  const m = src.match(/^\s*([A-Za-z]+)\s*\((.*)\)\s*$/)
  if (!m) return false
  const cmd = GEO_ALIASES[m[1].toLowerCase()]
  if (!cmd) return false
  // `angle(A, B)` with two vectors is a solver request, not a geometry angle — and so is one of two
  // vectors typed out: decided by the names alone, angle(<1, 0>, <0, 1>) was "Wrong inputs for Angle".
  // Vector( ) keeps the names-only rule: no solver reads it, and two vector names already end in
  // "Undefined function Vector", which typed vectors should not be sent to.
  const inputs = splitInputs(m[2])
  if (cmd === 'Angle' && inputs.length === 2 && inputs.every(isVectorInput)) return false
  const rawArgs = splitArgs(m[2])
  // Two vectors are no tail and tip: the command says what it takes, where it went on to "PhysLab does not know a
  // function called Vector" (H28).
  if (cmd === 'Vector' && rawArgs.length === 2 && rawArgs.every((a) => kindOfName(a) === 'vector')) {
    const [p, q] = rawArgs.map((a) => a.trim())
    throw new Error(`Vector( ) takes two points — its tail and its tip — or one vector, and ${p} and ${q} are vectors. For the vector from the tip of ${p} to the tip of ${q}, type ${q} - ${p}.`)
  }

  const b = new Builder()
  const names = scene().ev.names
  const objects = () => ({ ...scene().objects, ...Object.fromEntries(b.created.map((o) => [o.id, o])) })

  // Square(P) read a second point that was never typed and showed the student JavaScript's
  // "Cannot read properties of undefined (reading 'trim')". Every case reads its points through
  // ref, so one left out, or left blank as in Square(, P), is refused here in the command's words.
  const wrongInputs = `Wrong inputs for ${cmd}. Type "help" to see examples.`
  if (rawArgs.length > (MOST_INPUTS[cmd] ?? Infinity)) throw new Error(wrongInputs)
  const ref = (arg: string | undefined): ObjId => {
    if (!arg?.trim()) throw new Error(wrongInputs)
    const trimmed = arg.trim()
    const id = names.get(trimmed)
    if (id) return id
    const node = parseNode(trimmed)
    const kind = inferKind(node, kindOfName)
    if (kind === 'point' || kind === 'vector') {
      return isConstant(node)
        ? b.point(toV3(evaluateNode(node))).id
        : b.point({ kind: 'expr', expr: trimmed }).id
    }
    throw new Error(`"${trimmed}" is not a point or object`)
  }
  const typeOf = (id: ObjId) => objects()[id]?.type
  const opts = name ? { name } : {}
  let primary: SceneObject | undefined
  const a = rawArgs

  switch (cmd) {
    case 'Point':
      primary = a.length >= 2 ? b.point(toV3(math.evaluate(preprocess(`pt(${a.join(',')})`), { ...scene().ev.scope })), opts) : undefined
      break
    case 'Segment':
      if (a.length === 2) primary = b.segment(ref(a[0]), ref(a[1]), opts)
      break
    case 'Ray':
      if (a.length === 2) primary = b.ray(ref(a[0]), ref(a[1]), opts)
      break
    case 'Line': {
      if (a.length !== 2) break
      const p = ref(a[0])
      const q = ref(a[1])
      const qt = typeOf(q)
      primary = qt === 'line' || qt === 'segment' || qt === 'ray' || qt === 'vector'
        ? b.line({ kind: 'parallel', through: p, line: q }, opts)
        : b.line({ kind: 'twoPoints', a: p, b: q }, opts)
      break
    }
    case 'Circle': {
      if (a.length === 3) primary = b.circle({ kind: 'threePoints', a: ref(a[0]), b: ref(a[1]), c: ref(a[2]) }, opts)
      else if (a.length === 2) {
        const c = ref(a[0])
        const second = a[1].trim()
        const kind = names.has(second) ? kindOfName(second) : inferKind(parseNode(second), kindOfName)
        primary = kind === 'point'
          ? b.circle({ kind: 'centerPoint', c, p: ref(second) }, opts)
          : b.circle({ kind: 'centerRadius', c, r: second }, opts)
      }
      break
    }
    case 'Polygon':
    case 'Triangle': {
      if (a.length < 3) throw new Error(`${cmd} needs at least 3 points`)
      const pts = (cmd === 'Triangle' ? a.slice(0, 3) : a).map(ref)
      primary = b.polygon(pts, { ...opts, withSides: true })
      break
    }
    case 'Square':
    case 'RegularPolygon': {
      const p = ref(a[0])
      const q = ref(a[1])
      const n = cmd === 'Square' ? 4 : Number(math.evaluate(a[2] ?? '4'))
      // 2 sides made a "polygon, area 0", 2.5 a triangle, and 0 or a negative number a polygon of two corners.
      if (!Number.isInteger(n) || n < 3) throw new Error('A regular polygon needs a whole number of sides, 3 or more.')
      const P = b.created.find((o) => o.id === p) ?? scene().objects[p]
      const Q = b.created.find((o) => o.id === q) ?? scene().objects[q]
      const pn = P.name
      const qn = Q.name
      const ids = [p, q]
      // Each next vertex is the previous one rotated about the vertex before it by the exterior angle.
      let prevName = pn
      let curName = qn
      for (let i = 2; i < n; i++) {
        const turn = (Math.PI * 2) / n
        const expr = `${curName} + [[cos(${turn} rad), -sin(${turn} rad), 0], [sin(${turn} rad), cos(${turn} rad), 0], [0, 0, 1]] * (${curName} - ${prevName})`
        const v = b.point({ kind: 'expr', expr })
        ids.push(v.id)
        prevName = curName
        curName = v.name
      }
      primary = b.polygon(ids, { ...opts, withSides: true })
      break
    }
    case 'Midpoint': {
      if (a.length === 2) primary = b.point({ kind: 'midpoint', a: ref(a[0]), b: ref(a[1]) }, opts)
      else if (a.length === 1) {
        const seg = objects()[ref(a[0])]
        if (seg?.type === 'segment') primary = b.point({ kind: 'midpoint', a: seg.a, b: seg.b }, opts)
      }
      break
    }
    case 'Perpendicular':
      if (a.length === 2) primary = b.line({ kind: 'perpendicular', through: ref(a[0]), line: ref(a[1]) }, opts)
      break
    case 'Parallel':
      if (a.length === 2) primary = b.line({ kind: 'parallel', through: ref(a[0]), line: ref(a[1]) }, opts)
      break
    case 'PerpendicularBisector': {
      if (a.length === 2) primary = b.line({ kind: 'perpBisector', a: ref(a[0]), b: ref(a[1]) }, opts)
      else if (a.length === 1) {
        const seg = objects()[ref(a[0])]
        if (seg?.type === 'segment') primary = b.line({ kind: 'perpBisector', a: seg.a, b: seg.b }, opts)
      }
      break
    }
    case 'AngleBisector':
      if (a.length === 3) primary = b.line({ kind: 'angleBisector', a: ref(a[0]), vertex: ref(a[1]), b: ref(a[2]) }, opts)
      break
    case 'Intersect': {
      if (a.length < 2) break
      const p = ref(a[0])
      const q = ref(a[1])
      const circles = [typeOf(p), typeOf(q)].filter((t) => t === 'circle').length
      if (a[2] !== undefined) primary = b.point({ kind: 'intersection', a: p, b: q, index: Number(a[2]) - 1 }, opts)
      else {
        primary = b.point({ kind: 'intersection', a: p, b: q, index: 0 }, opts)
        if (circles > 0) b.point({ kind: 'intersection', a: p, b: q, index: 1 })
      }
      break
    }
    case 'Angle':
      if (a.length === 3) primary = b.angle(ref(a[0]), ref(a[1]), ref(a[2]), opts)
      break
    case 'Vector': {
      if (a.length === 2) primary = b.vector({ kind: 'points', a: ref(a[0]), b: ref(a[1]) }, opts)
      else if (a.length === 1) {
        const node = parseNode(a[0])
        primary = b.vector({ kind: 'free', tail: [0, 0, 0], comp: toV3(evaluateNode(node)) }, opts)
      }
      break
    }
    case 'Slider': {
      const [val, min, max, step] = a.map((x) => Number(math.evaluate(preprocess(x))))
      primary = b.number(String(val ?? 1), { ...opts, slider: { min: min ?? -10, max: max ?? 10, step: step ?? 0.1 } })
      break
    }
    case 'Tangent': {
      if (a.length !== 2) break
      const p = ref(a[0])
      const c = ref(a[1])
      primary = b.line({ kind: 'tangent', point: p, circle: c, index: 0 }, opts)
      b.line({ kind: 'tangent', point: p, circle: c, index: 1 })
      break
    }
    case 'Centroid':
    case 'Circumcenter':
    case 'Incenter':
    case 'Orthocenter': {
      if (a.length !== 1) break
      const poly = ref(a[0])
      // The evaluator refuses anything else only after the point is made, so "B: needs a triangle"
      // was said about a point that stayed in the drawing as an error.
      const corners = scene().ev.values.get(poly)
      if (typeOf(poly) !== 'polygon' || (corners?.type === 'polygon' && corners.pts.length !== 3)) {
        const tri = freeLetterFor('TUVW')
        throw new Error(`${cmd} needs a triangle, and ${a[0].trim()} is not one. Make a triangle first, e.g. ${tri} = Triangle((0, 0), (4, 0), (0, 3)), then ${cmd}(${tri}).`)
      }
      primary = b.point({ kind: 'triangleCenter', poly, which: cmd.toLowerCase() as 'centroid' }, opts)
      break
    }
    case 'Text': {
      const text = a[0]?.replace(/^["']|["']$/g, '') ?? ''
      if (!text.trim()) throw new Error('Text needs something to show, e.g. Text("label").')
      // The position reads the scene's names like every other input: Text("hi", P) put the label at P.
      const pos = a[1] ? toV3(math.evaluate(preprocess(a[1]), { ...scene().ev.scope })) : ([0, 0, 0] as V3)
      primary = b.text(pos, text, opts)
      break
    }
  }

  if (!primary) throw new Error(wrongInputs)
  const existing = name ? scene().ev.names.get(name) : undefined
  if (existing) redefine(existing, primary, b)
  else b.commit()
  const id = existing ?? primary.id
  const err = scene().ev.errors.get(id)
  scene().pushLog(
    err
      ? { input: fullInput, kind: 'error', text: `${scene().objects[id]?.name}: ${err}` }
      : { input: fullInput, kind: 'result', tex: `${scene().objects[id]?.name} = ${describeComputed(scene().ev.values.get(id), scene().settings)}` }
  )
  return true
}

// ---------------------------------------------------------------------------
// Vector solver commands with steps
// ---------------------------------------------------------------------------

interface VecArg {
  name: string
  v: V3
}

/**
 * Names the operands of one command for its steps. A symbol keeps its own name; anything else —
 * a literal `<1, 0>`, a sum `A + B` — needs a letter, and it must be one no object in the drawing
 * has: falling back to a fixed A or B put "B = 1i" in the working of `A × <1, 0>` while the
 * student's B was <2, −1>, and titled `cross(A + B, A)` "Vector product A×A". The result's own
 * letter goes through the same namer so it cannot collide with an operand either.
 */
function operandNamer(): { arg: (node: Node, preferred: string) => VecArg; letter: (preferred: string) => string } {
  const taken = new Set(scene().ev.names.keys())
  const letter = (preferred: string): string => {
    const name = taken.has(preferred) ? freeCapitals(taken, 1)[0] : preferred
    taken.add(name)
    return name
  }
  const arg = (node: Node, preferred: string): VecArg => {
    const name = node.type === 'SymbolNode' ? (node.name as string) : letter(preferred)
    return { name, v: toV3(evaluateNode(node)) }
  }
  return { arg, letter }
}

/**
 * Recognises vector operations written directly (A + B, A × B, |A|…) and builds a step-by-step
 * solution. `name` is what the result is being assigned to, so the steps say F for
 * `F = 10 N ∠ 30°` rather than the solver's default A.
 */
function solutionFor(root: MathNode, name?: string): VS.Solution | null {
  let node = root as Node
  // The command bar answers in the student's own precision and angle unit, like the panels.
  const settings = scene().settings
  const result = name ?? 'R'
  while (node.type === 'ParenthesisNode') node = node.content as Node
  const vecSym = (n: Node) => n.type === 'SymbolNode' && kindOfName(n.name as string) === 'vector'
  const { arg: vecArg, letter } = operandNamer()
  try {
    if (node.type === 'OperatorNode') {
      const args = node.args as Node[]
      const sum = sumOperands(node)
      // A real SymbolNode, because vecArg evaluates it: a plain object shaped like one has no
      // compile(), and the throw was swallowed below, so `R = A + B` never had any steps.
      if (sum) return VS.solveAddition(sum.map((n) => vecArg(new math.SymbolNode(n) as unknown as Node, n)), result, settings)
      if (node.fn === 'subtract' && args.every(vecSym)) return VS.solveSubtraction(vecArg(args[0], 'A'), vecArg(args[1], 'B'), result, settings)
      if (node.fn === 'multiply' && args.length === 2) {
        if (vecSym(args[1]) && isConstant(args[0])) return VS.solveScalarMultiply(Number(evaluateNode(args[0])), vecArg(args[1], 'A'), result, settings)
        if (vecSym(args[0]) && isConstant(args[1])) return VS.solveScalarMultiply(Number(evaluateNode(args[1])), vecArg(args[0], 'A'), result, settings)
        if (vecSym(args[0]) && vecSym(args[1])) return VS.solveDot(vecArg(args[0], 'A'), vecArg(args[1], 'B'), settings)
      }
    }
    if (node.type === 'FunctionNode') {
      const fname = (node.fn as { name: string }).name
      const args = node.args as Node[]
      if (fname === 'polarVec' && args.length === 2) return VS.solveResolve({ name: name ?? 'A', v: toV3(evaluateNode(node)) }, settings)
      // A compound operand such as `(A + B) × A` gets the answer without working: the steps
      // would have to call A + B by a letter of their own, and a line typed as an expression
      // reads better with the answer alone than with a name the student never gave.
      if (!args.every((a) => vecSym(a) || isConstant(a))) return null
      if (fname === 'cross' && args.length === 2 && args.every(isGeo)) return VS.solveCross(vecArg(args[0], 'A'), vecArg(args[1], 'B'), name ?? letter('C'), settings)
      if (fname === 'dot' && args.length === 2 && args.every(isGeo)) return VS.solveDot(vecArg(args[0], 'A'), vecArg(args[1], 'B'), settings)
      if (fname === 'mag' && args.length === 1 && isGeo(args[0])) return VS.solveMagnitudeDirection(vecArg(args[0], 'A'), settings)
      if (fname === 'unitVec' && args.length === 1) return VS.solveUnitVector(vecArg(args[0], 'A'), settings)
      if (fname === 'proj' && args.length === 2) return VS.solveProjection(vecArg(args[0], 'B'), vecArg(args[1], 'A'), settings)
      if (fname === 'angleBetween' && args.length === 2) return VS.solveAngleBetween(vecArg(args[0], 'A'), vecArg(args[1], 'B'), settings)
    }
  } catch {
    return null
  }
  return null
}

const SOLVER_FNS = new Set(['components', 'resolve', 'magnitude', 'magdir', 'direction', 'unit', 'angle', 'resultant', 'twoforces', 'equilibrium', 'torque', 'work', 'magforce', 'projection', 'add', 'subtract', 'dot', 'cross'])

/** The most inputs each of them reads; add and equilibrium take any number. cross(A, r, F) answered A × r and left F out without a word. */
const MOST_SOLVER_INPUTS: Partial<Record<string, number>> = {
  components: 2, resolve: 2, magnitude: 1, magdir: 1, direction: 1, unit: 1, angle: 2, dot: 2, cross: 2, subtract: 2, projection: 2, resultant: 3, twoforces: 3, torque: 2, work: 2, magforce: 3
}

function trySolverCommand(input: string): boolean {
  const m = input.match(/^\s*([A-Za-z]+)\s*\((.*)\)\s*$/)
  if (!m || !SOLVER_FNS.has(m[1].toLowerCase())) return false
  const fn = m[1].toLowerCase()
  const settings = scene().settings
  // cross(A) and resultant(5) read an input that was never typed and showed the student
  // JavaScript's "Cannot read properties of undefined (reading 'type')"; a blank one, as in
  // resultant(, 5, 3), was answered "R = undefined N". Every case reads its inputs through num and
  // v, so one left out or left blank is refused there in the command's words — and so is a line
  // with none at all, where add() and equilibrium() answered a sum and a balance of nothing.
  const wrongInputs = `Wrong inputs for ${m[1]}. Type "help" for examples.`
  // A vector typed in angle brackets is one input: angle(<1, 0>, <0, 1>) was read as "<1", "0>", …
  const args = splitInputs(m[2]).map((a) => (a ? parseNode(a) : undefined))
  if (!args.length || args.length > (MOST_SOLVER_INPUTS[fn] ?? Infinity)) throw new Error(wrongInputs)
  const given = (n: Node | undefined): Node => {
    if (!n) throw new Error(wrongInputs)
    return n
  }
  const num = (n: Node | undefined) => Number(evaluateNode(given(n)))
  const namer = operandNamer()
  const v = (i: number, name: string) => namer.arg(given(args[i]), name)
  let sol: VS.Solution | null = null
  switch (fn) {
    case 'components':
    case 'resolve':
      if (args.length === 2) sol = VS.solveComponents('A', num(args[0]), num(args[1]), '', settings)
      else if (args.length === 1) {
        // A 3-D vector's components are read off directly; resolving it at its heading in the
        // plane reported Ax = 4.24 for 3i + 4j + 5k.
        sol = VS.solveResolve(v(0, 'A'), settings)
      }
      break
    case 'magnitude':
    case 'magdir':
    case 'direction':
      sol = VS.solveMagnitudeDirection(v(0, 'A'), settings)
      break
    case 'unit':
      sol = VS.solveUnitVector(v(0, 'A'), settings)
      break
    case 'angle':
      sol = VS.solveAngleBetween(v(0, 'A'), v(1, 'B'), settings)
      break
    case 'dot':
      sol = VS.solveDot(v(0, 'A'), v(1, 'B'), settings)
      break
    case 'cross':
      sol = VS.solveCross(v(0, 'A'), v(1, 'B'), namer.letter('C'), settings)
      break
    case 'add':
      sol = VS.solveAddition(args.map((_, i) => v(i, String.fromCharCode(65 + i))), 'R', settings)
      break
    case 'subtract':
      sol = VS.solveSubtraction(v(0, 'A'), v(1, 'B'), 'R', settings)
      break
    case 'projection':
      sol = VS.solveProjection(v(0, 'B'), v(1, 'A'), settings)
      break
    case 'resultant':
    case 'twoforces':
      sol = VS.solveTwoForces(num(args[0]), num(args[1]), num(args[2]), 'N', settings)
      break
    case 'equilibrium':
      sol = VS.solveEquilibrium(args.map((_, i) => v(i, `F${i + 1}`)), settings)
      break
    case 'torque':
      sol = VS.solveTorque(v(0, 'r').v, v(1, 'F').v, settings)
      break
    case 'work':
      sol = VS.solveWork(v(0, 'F').v, v(1, 'd').v, settings)
      break
    case 'magforce':
      sol = VS.solveMagneticForce(num(args[0]), v(1, 'v').v, v(2, 'B').v, settings)
      break
  }
  if (!sol) throw new Error(wrongInputs)
  const finalSol = sol
  scene().pushLog({
    input,
    kind: 'result',
    tex: finalSol.answers.map((a) => `${a.label} = ${a.tex}`).join(',\\quad '),
    solution: finalSol,
    visualize: finalSol.visual ? () => visualizeSolution(finalSol) : undefined
  })
  scene().showSolution(finalSol)
  return true
}

// ---------------------------------------------------------------------------
// CAS: solve, diff, integrate, limit, series, simplify, expand, factor
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Pure Math: factorise, divide, partial fractions, HCF/LCM, complex numbers.
// These run offline and instantly, and they write out their working, so they are tried before
// the algebra engine. Anything they cannot do falls through to tryCas, which still gives an answer.
// ---------------------------------------------------------------------------

const PURE_WORDS: Record<string, JobId> = {
  factorise: 'factor',
  factorize: 'factor',
  factor: 'factor',
  expand: 'expand',
  divide: 'divide',
  partial: 'partial',
  partialfractions: 'partial',
  hcf: 'hcf',
  gcd: 'hcf',
  lcm: 'lcm',
  primes: 'primes',
  primefactors: 'primes',
  complex: 'complex',
  solve: 'solve',
  // prove(sin 2x = 2 sin x cos x). A plain calculation such as mathjs's identity(3) still works:
  // a refused identity with no algebra-engine fallback is tried as a calculation below.
  prove: 'trigidentity',
  identity: 'trigidentity'
}

/**
 * The Greek names the expression parser spells out (θ → theta), shown as the letter again. All of
 * them: a list of the common few left a student's sigma or rho rendered as the word. pi is a
 * constant and omicron has no KaTeX command, so neither is a name an unknown can carry.
 */
const GREEK = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi',
  'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega'
])

/**
 * The standard normal table, from the bar: `normal(...)` is shorthand for `P(...)`, `invnorm(...)`
 * and `phi(...)` are read as themselves, and a bare `P(...)` is tried only when what is inside
 * names Z or X with a comparison — `parseNormalQuery` says no to anything else, so a student's own
 * function called p (`p(2)`, `p(x) = x^2`) is left for the rest of the bar to read as a function,
 * never hijacked. Tried outside the generic `word(args)` dispatch below because a distribution
 * query can carry a trailing "= 0.05" or a comma-joined "X ~ N(50, 10^2)" that the generic pattern
 * (the whole line is one word and one bracket) does not allow.
 */
function tryNormalQuery(input: string): boolean {
  const shorthand = /^normal\s*\((.*)\)$/i.exec(input.trim())
  const direct = parseNormalQuery(input)
  const query = direct ?? (shorthand ? parseNormalQuery(`P(${shorthand[1]})`) : null)
  if (!query) {
    // "1 - P(Z < 1.96)" holds a question but is not one: refused in words, never answered with
    // the arithmetic dropped (and not handed on, since the calculator cannot read P(Z < 1.96)).
    const why = normalRefusal(input)
    if (why) logError(input, why)
    return why !== null
  }
  const src = direct ? input : `P(${shorthand![1]})`
  const doc = runPure('normal', src)
  const s = scene()
  if (doc.error) {
    logError(input, doc.error)
    return true
  }
  // In LaTeX a bare "~" is a non-breaking space, so "X ~ N(50, 5^2)" would show in the Maths field
  // as "X N(50, 5²)". \sim is the "is distributed as" sign, and parseNormalQuery reads it back.
  // x_1 in P(x_1 < X < x_2) arrives escaped as x\_1, which the field would show as "x_1": it is
  // the subscript x₁.
  const latex = linearToLatex(src)
    .replace(/\s*~\s*/g, '\\sim ')
    .replace(/([a-zA-Z])\\_(\d)/g, '$1_{$2}')
  s.pushLog({
    input,
    kind: 'result',
    tex: doc.answers.map((a) => (a.label !== 'Answer' ? `\\text{${a.label}} = ${a.tex}` : a.tex)).join(String.raw`,\quad `),
    working: () => {
      usePure.getState().run('normal', src, latex)
      showPanel('maths')
    }
  })
  usePure.getState().run('normal', src, latex)
  showPanel('maths')
  return true
}

function tryPureMath(input: string): boolean {
  if (tryNormalQuery(input)) return true
  const m = input.match(/^\s*([a-z]+)\s*\((.*)\)\s*$/i)
  if (!m) return false
  const job = PURE_WORDS[m[1].toLowerCase().replace(/[\s_-]/g, '')]
  if (!job) return false

  const args = splitArgs(m[2])
  // A third argument has no meaning here, and sent on as it was, `x^3-1,x-1,3` reached the algebra engine as
  // one string and came back as a parser complaint rather than the shape the bar wants.
  if ((job === 'divide' || job === 'partial') && args.length > 2) throw new Error(`${m[1]}(numerator, denominator) or ${m[1]}(fraction)`)
  // solve(x^2-4, x) names the unknown; the pure solver works that out for itself.
  // divide(x^3-1, x-1) and partial(3x+5, (x+1)(x+2)) are the fraction written as two arguments.
  const body =
    job === 'hcf' || job === 'lcm'
      ? args.join(', ')
      : job === 'solve'
        ? args[0] ?? ''
        : (job === 'divide' || job === 'partial') && args.length === 2
          ? `(${args[0]})/(${args[1]})`
          : m[2]
  if (!body.trim()) return false

  const doc = runPure(job, body)
  if (doc.error) {
    // A fraction of plain numbers is arithmetic: the refusal itself says "the calculator will do
    // that one", so it does, and divide(10, 2) answers 5 as it did before the two-argument form.
    // "Plain" is decided by parsing, not by looking for letters: the e of 2e3 and the name pi
    // are numbers too, and divide(2e3, 4) was being sent to the algebra engine for a 500 the calculator had.
    if ((job === 'divide' || job === 'partial') && isPlainArithmetic(body)) {
      evaluatePlain(body, input)
      return true
    }
    // Not something the step engine can do. The Working panel's own fallback table
    // (math/pure/store.ts) says which jobs the algebra engine can take over, and the caller sends those on so
    // an answer still appears. The rest are tried as a plain calculation, which is where
    // complex(3, 4) is answered; only when that fails too is the refusal the last word, because
    // its reason ("needs a whole number") is worth more than `I don't know "x"`.
    if (engineRequestFor(job, body, casInDegrees(scene().settings.angleUnit))) return false
    try {
      evaluatePlain(input)
    } catch {
      logError(input, doc.error)
    }
    return true
  }

  const s = scene()
  // The Working panel's maths field reads LaTeX, so the linear form typed here has to be
  // converted or 6x^2 arrives on screen as x^(2) with a stray bracket.
  // A trig identity is not mathjs syntax (sin 2x would come back as sin(2)·x), so the field gets
  // the proof's own LaTeX of what it read instead.
  const latex = job === 'trigidentity' ? doc.input : linearToLatex(body)
  // A label is a word ("Quotient", "HCF =") or a symbol ("x_1 =", "theta_2 ="). The word goes in
  // \text{}; the symbol must not, because KaTeX refuses an underscore inside \text and every
  // solve line rendered red — and it still did for θ, which the parser spells "theta", until the
  // subscript was split off the name. The = stays where the label has one, so it reads x_1 = 3,
  // not x_1 3; and a label that is only the number itself (primes(7) → "7") is not repeated.
  const label = (text: string): string => {
    const eq = text.trim().endsWith('=')
    const bare = text.replace(/=/g, '').trim()
    if (/^-?\d+$/.test(bare)) return eq ? `${bare} = ` : ''
    const sym = /^([A-Za-z]+)(_\d+)?$/.exec(bare)
    const shown = !sym
      ? String.raw`\text{${bare}}`
      : (GREEK.has(sym[1]) ? '\\' + sym[1] : sym[1].length === 1 ? sym[1] : String.raw`\text{${sym[1]}}`) + (sym[2] ?? '')
    return eq ? `${shown} = ` : shown + String.raw`\;`
  }
  s.pushLog({
    input,
    kind: 'result',
    tex: doc.answers.map((a) => `${a.label === 'Answer' ? '' : label(a.label)}${a.tex}`).join(String.raw`,\quad `),
    working: () => {
      usePure.getState().run(job, body, latex)
      showPanel('maths')
    }
  })
  usePure.getState().run(job, body, latex)
  showPanel('maths')
  return true
}

async function tryCas(input: string): Promise<boolean> {
  const m = input.match(/^\s*(solve|nsolve|diff|derivative|d\/dx|integrate|integral|limit|series|simplify|expand|factor|factorise|factorize|divide|partial|partialfractions|exact)\s*\((.*)\)\s*$/i)
  if (!m) return false
  // The step engine spells it three ways; the algebra engine knows one.
  const op = m[1].toLowerCase().replace(/^factori[sz]e$/, 'factor')
  const args = splitArgs(m[2])
  const s = scene()
  // In DEG mode the calculator's own d/dx works in degrees; the algebra engine must agree.
  const deg = casInDegrees(s.settings.angleUnit)
  // On the first use the line names the load stage as it moves, so it never reads as a freeze; it
  // lets go of the status before the answer replaces it (followCasStart in ui/casStatus.ts).
  const id = s.pushLog({ input, kind: 'info', text: `Solving… ${casWaitNote(useEngineStatus.getState())}`.trim() })
  followCasStart(useEngineStatus, (note) => s.updateLog(id, { text: `Solving… ${note}` }))
  let payload: Omit<EngineRequest, 'deg'>
  let casOp = op
  switch (op) {
    case 'solve':
    case 'nsolve': {
      casOp = 'solve'
      // solve({x + y = 3, x - y = 1}, {x, y}): splitArgs keeps a braced list whole, so each argument
      // has its braces taken off and is split at its own commas before the pieces are sorted
      // (with the braces left on, "{x" was once sent as an equation with no letters at all). The two
      // braces are taken off without checking they are one pair: {a, b} * {c, d} = 1 is split at
      // "b} * {c". A paired strip is parked for the owner (CW6a-4).
      const items = args.flatMap((a) => splitArgs(a.replace(/^\s*\{/, '').replace(/\}\s*$/, ''))).map((a) => a.trim()).filter(Boolean)
      const isLetter = (a: string): boolean => /^[a-z]$/.test(a)
      payload = { eqs: items.filter((a) => a.includes('=') || !isLetter(a)), vars: items.filter(isLetter) }
      break
    }
    case 'diff':
    case 'derivative':
    case 'd/dx':
      casOp = 'diff'
      payload = { expr: args[0], var: args[1] ?? 'x', order: args[2] ? Number(args[2]) : 1 }
      break
    case 'integrate':
    case 'integral':
      casOp = 'integrate'
      payload = args.length >= 3 ? { expr: args[0], var: 'x', lower: args[1], upper: args[2] } : { expr: args[0], var: args[1] ?? 'x' }
      break
    case 'limit':
      payload = { expr: args[0], var: 'x', to: args[1] ?? '0' }
      break
    case 'series':
      // A term count that is not a whole number (3.5, or left empty after its comma) is refused, as
      // it always was: it goes as NaN, which the engine cannot count with.
      payload = { expr: args[0], var: 'x', at: args[1] ?? '0', n: args[2] === undefined ? 6 : /^\s*\d+\s*$/.test(args[2]) ? Number(args[2]) : NaN }
      break
    case 'divide':
    case 'partial':
    case 'partialfractions':
      // What the step engine refused (divide(sin(x), x)) goes to the algebra engine's apart, the same route
      // the Working panel takes, as the one fraction the two arguments stand for.
      casOp = 'apart'
      payload = { expr: args.length === 2 ? `(${args[0]})/(${args[1]})` : args.join(',') }
      break
    default:
      payload = { expr: args.join(',') }
  }
  const r = await ask(casOp as Exclude<EngineJob, 'integralSteps' | 'diffSteps'>, { ...payload, deg })
  if (r.error) {
    s.updateLog(id, { kind: 'error', text: r.error })
    return true
  }
  if (casOp === 'solve') {
    const rows = r.solutions ?? []
    if (!rows.length) {
      s.updateLog(id, { kind: 'result', text: 'No solution.' })
      return true
    }
    const texOut = solveRowsTex(rows, s.settings)
    const single = args.length === 1 && rows.every((row) => Object.keys(row).length === 1 && 'x' in row)
    const roots = single ? rows.map((row) => row.x.numeric).filter((n) => n && n.im === undefined).map((n) => n!.re) : []
    s.updateLog(id, {
      kind: 'result',
      tex: texOut,
      text: undefined,
      visualize: single && args[0].includes('=')
        ? () => {
            const [l, rr] = args[0].split('=')
            // Pressed again, the graph already drawn is shown, and its roots are already marked.
            if (visualizeGraph(`y = ${l} - (${rr})`, [`(${l}) - (${rr})`], 'explicit', { reuse: true })) roots.forEach((x0) => visualizePoint([x0, 0, 0]))
          }
        : undefined
    })
    return true
  }
  const numeric = r.numeric && casOp !== 'diff' && casOp !== 'series' && casOp !== 'expand' && casOp !== 'factor' ? ` \\approx ${fmtNumeric(r.numeric, s.settings)}` : ''
  // The space after \int is not decoration: \int glued to integrate(x^2)'s x read as the unknown
  // command \intx, and every indefinite integral from the bar rendered as a red KaTeX error.
  // The label names the letter the answer was worked in: diff(t^3, t) = 3t² used to read d/dx, and
  // diff(θ^2, θ) = 2θ read d/dx(θ²), which is 0. θ and theta are one letter, written \theta, as in
  // the working behind the same line (spelledOut spells θ theta for it).
  const byLetter = spelledOut((args[1] ?? '').trim())
  const letter =
    casOp === 'integrate' && args.length >= 3
      ? 'x'
      : /^[A-Za-z]$/.test(byLetter)
        ? byLetter
        : GREEK.has(byLetter)
          ? `\\${byLetter}`
          : 'x'
  // diff(x^3, x, 2) = 6x is the second derivative, so it reads d²/dx², not d/dx(x³) = 6x, which is
  // false (GLM #24). An order the label cannot write truthfully (0, or not a whole number) gets none.
  const order = casOp === 'diff' && args[2] ? Number(args[2]) : 1
  const dBy = order === 1 ? `\\frac{d}{d${letter}}` : Number.isInteger(order) && order >= 2 ? `\\frac{d^{${order}}}{d${letter}^{${order}}}` : ''
  const label = casOp === 'diff' ? (dBy ? `${dBy}\\left(${args[0]}\\right)` : '') : casOp === 'integrate' ? (args.length >= 3 ? `\\int_{${args[1]}}^{${args[2]}}` : '\\int ') + `${args[0]}\\,d${letter}` : ''
  const isFunctionResult = (casOp === 'diff' || (casOp === 'integrate' && args.length < 3)) && /x/.test(r.text)
  const unitNote = calculusUnitNote(casOp, args[0] ?? '', deg)
  // An indefinite integral carries its + C, as its working and every textbook do; the engine leaves
  // it off, so the bar said ∫x eˣ dx = (x − 1)eˣ while "Show the working" said (x − 1)eˣ + C.
  // An integral the engine could not do comes back still written as one, and gets no + C.
  const plusC = casOp === 'integrate' && args.length < 3 && !/\\int/.test(r.latex) ? ' + C' : ''
  // The answer stays the engine's own; its steps are one tap away in the Working panel (spec decision 3:
  // no calculus words for the step engine, which runs first and would take diff/integrate over).
  const steps = calculusJobFor(casOp, args)
  s.updateLog(id, {
    kind: 'result',
    text: undefined,
    tex: `${label ? label + ' = ' : ''}${r.latex}${plusC}${numeric && !/^-?\d+$/.test(r.text) ? numeric : ''}${unitNote ? `\\quad\\text{(${unitNote})}` : ''}`,
    visualize: isFunctionResult ? () => void visualizeGraph(`y = ${r.text}`, [r.text], 'explicit', { reuse: true }) : undefined,
    working: steps
      ? () => {
          usePure.getState().run(steps.job, steps.input, linearToLatex(steps.input))
          showPanel('maths')
        }
      : undefined
  })
  return true
}

/**
 * The decimal beside an exact answer, in the student's precision (rule 4), real or complex. A complex
 * one is written by the same formatter as on the Maths screen (2i, never 0 + 2i or 0 + 1i).
 */
const fmtNumeric = (n: { re: number; im?: number }, p: Precision) => formatComplex(n.re, n.im ?? 0, (v) => texAt(v, p), 'tex')

/** One value of an engine's solve row (EngineValue in math/engine/types.ts). */
type SolveValue = { latex: string; text: string; numeric: { re: number; im?: number } | null }

/** A decimal beside a value that is already whole says nothing: x = 3, x = −2 + 3i. */
const isWholeValue = (v: SolveValue): boolean => /^-?\d+$/.test(v.text) || (!!v.numeric && Number.isInteger(v.numeric.re) && Number.isInteger(v.numeric.im ?? 0))

/**
 * The bar's answer line for the engine's solve rows: each letter with its exact value, and the
 * decimal beside a value that is not whole. The engine lists roots in an order of its own (−2i before 2i),
 * so the roots of one unknown are put in the order every other route uses: real roots smallest
 * first, then each conjugate pair with the +i root first. (A quadratic reaches the engine only when the
 * Solve job refuses it; the Solve job's own answers keep their formula order.) Pure, so the line can
 * be compared with the other routes that answer the same equation (x = ?, Equations mode, the Solve job).
 */
export function solveRowsTex(rows: Record<string, SolveValue>[], p: Precision): string {
  const valueOf = (row: Record<string, SolveValue>): { re: number; im: number } | null => {
    const n = Object.values(row)[0].numeric
    return n ? { re: n.re, im: n.im ?? 0 } : null
  }
  // A system's solution (x and y in one row) has no single root to order by: the engine's order stays.
  const ordered = rows.every((row) => Object.keys(row).length === 1) ? orderRoots(rows, valueOf) : rows
  return ordered
    .map((row) => Object.entries(row).map(([k, v]) => `${k} = ${v.latex}${v.numeric && !isWholeValue(v) ? ` \\approx ${fmtNumeric(v.numeric, p)}` : ''}`).join(',\\ '))
    .join('\\quad\\text{or}\\quad ')
}

// ---------------------------------------------------------------------------
// Plain expressions
// ---------------------------------------------------------------------------

/** True when the text is a calculation in numbers, constants and units alone, with nothing to solve for. */
function isPlainArithmetic(src: string): boolean {
  try {
    return isConstant(parseNode(src))
  } catch {
    return false
  }
}

/** `shown` is the line the log quotes when the maths evaluated is a rewrite of what was typed. */
function evaluatePlain(expr: string, shown = expr) {
  const input = shown
  const node = parseNode(expr)
  assertKnown(node)
  const kind = inferKind(node, kindOfName)
  const value = evaluateNode(node)
  const solution = solutionFor(node)
  const s = scene()
  if (kind === 'vector' || kind === 'point') {
    const v = toV3(value)
    s.pushLog({
      input,
      kind: 'result',
      tex: kind === 'vector' ? `${texIJK(v, s.settings)}${vectorExtras(v)}` : `(${v.map((c) => texPrecise(c, s.settings)).join(', ')})`,
      solution: solution ?? undefined,
      visualize: () => (kind === 'vector' ? (solution ? visualizeSolution(solution) : visualizeVector(v)) : visualizePoint(v))
    })
    return
  }
  // The student's precision, not a fixed ten digits (rule 4): with decimals set to 2, `1/3` used
  // to answer 0.3333333333 beside a panel showing |A| = 5.00. The ≈ tail after an exact form is
  // in the same precision: it was kept at ten places on purpose, and read "= 1/3 ≈ 0.3333333333"
  // at 2 d.p. (the wave head overruled that, polish H16).
  const text = typeof value === 'number' ? fmtPrecise(value, s.settings) : isUnit(value) ? `${fmtPrecise(plainNumber(value), s.settings)} ${value.formatUnits()}` : math.format(value, { precision: 10 })
  const id = s.pushLog({ input, kind: 'result', text: `= ${text}`, solution: solution ?? undefined })
  if (typeof value === 'number' && !Number.isInteger(value) && Number.isFinite(value) && isConstant(node)) {
    ask('exact', { expr: preprocess(expr), deg: casInDegrees(s.settings.angleUnit) }).then((r) => {
      // An exact form is shown only when it is the number beside it: the engine takes an odd root of a negative
      // number as its principal value, so it gave (−8)^(−1/3), which is −0.5 here, as 1/4 − (√3/4)i.
      const complex = r.numeric?.im !== undefined && !isNoise(r.numeric.im, r.numeric.re)
      if (!r.error && r.latex && !/\./.test(r.text) && r.text !== text && !complex) {
        s.updateLog(id, { text: undefined, tex: `= ${r.latex} \\approx ${texPrecise(value, s.settings)}` })
      }
    })
  }
}

export const HELP = `Examples (press Enter after each):
  A = (3, 4)                 point
  A = <3, 4>   or  A = 3i + 4j   or   F = 10 N ∠ 30°     vector
  R = A + B                  live resultant (updates when you drag A or B)
  A · B    A × B    |A|    unit(A)    angle(A, B)    proj(B, A)     with steps
  components(10, 30)         resolve 10 at 30° into x and y parts
  resultant(5, 5, 120)       two forces and the angle between them
  equilibrium(A, B, C)       the force that balances them
  torque(r, F)   work(F, d)   magforce(q, v, B)
  Triangle((0,0), (4,0), (0,3))   Segment(P, Q)   Line(P, Q)   Circle(P, 3)
  Midpoint(P, Q)  Perpendicular(P, f)  Intersect(f, g)  Angle(P, Q, S)
  y = x^2 - 4      f(x) = sin(x)      x^2 + y^2 = 9      y > x^2
  r = 2cos(θ)      curve(cos(t), sin(t), 0, 2π)      z = sin(x)cos(y)
  piecewise(x^2 from -3 to 0, x from 0 to 2, 2 from 2 to 4)     one curve in pieces
  between(x^2, x + 2, -1, 2)   shade between two curves      tangent(x^2, 1)   the tangent at a point
  k = 2  (makes a slider you can drag)
  solve(x^2 - 5x + 6 = 0)   diff(x^3)   integrate(x^2, 0, 3)   factor(x^2-1)
  P(Z < 1.96)   P(45 < X < 60), X ~ N(50, 5^2)     the standard normal table, with steps
  invnorm(0.975)   invnorm(0.9), X ~ N(50, 10^2)     the z (or x) for a given area
  prove(sin 2x = 2 sin x cos x)   a trig identity, proved one named step at a time
  delete A     undo     clear     2d / 3d     play / pause`
