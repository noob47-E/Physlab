// The command bar's graphs: y = f(x), f(x) = …, z = f(x, y), r = f(θ), implicit curves, inequalities, curves and their checks.
// Out of commands.ts as a pure move (CLEANUP-PLAN.md CW10).

import type { MathNode } from 'mathjs'
import { scene } from '../../core/store'
import { drawability, inXAlone, NO_REAL_X, solutionsInX, visualizeBetween, visualizeGraph, visualizePiecewise, visualizeTangentAt, type DrawSpec, type NamedGraphs, type XComplex, type XSolved } from '../../core/visualize'
import { inferKind, math, plainNumber, preprocess, sceneNames, splitArgs, symbolsOf, toV3 } from '../../math/expr'
import { fmtLabel, morePrecise, superscriptPowers } from '../../math/format'
import { calcNum, type CalcPrecision } from '../../calc/format'
import { exactPairFor, exactQuadratic, type ExactQuadratic } from '../../calc/exactComplex'
import { showBeside } from '../../app/panels'
import { enterMode } from '../../app/layout'
import { useApp } from '../../app/modes'
import { evaluateNode, freeLetterFor, GRAPH_VARS, kindOfName, type Node, parseNode, VECTOR_LITERAL } from './common'

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
export function namedGraphs(): NamedGraphs {
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
 *
 * `exact` is the quadratic's coefficients as typed, when they are whole numbers or simple fractions:
 * the one pair is then written as the = card writes it (x² − 2x + 8 = 0 is "x = 1 ± √7 i"), provided
 * the exact pair agrees with the search's to rounding. Otherwise the decimal pairs are said as before.
 */
function complexSentence(pairs: XComplex[], p: CalcPrecision, exact: ExactQuadratic | null): string {
  const exactPair = exact && pairs.length === 1 ? exactPairFor(exact, pairs[0]) : null
  if (exactPair) return ` In complex numbers: x = ${exactPair}.`
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
    throw new Error(r.reason + (none?.kind === 'none' ? complexSentence(none.complex, p, exactQuadratic(lhs, rhs)) : ''))
  }
  const note = r.note ? ` — ${r.note}` : ''
  visualizeGraph(input, [expr], 'implicit')
  const sol = note ? null : solutionsInX(expr, sides, namedScope())
  s.pushLog({ input, kind: 'result', text: withNote(solvedSentence(sol, p), note) + landInGraphing() })
}

export function tryGraph(input: string): boolean {
  let m: RegExpMatchArray | null
  const s = scene()

  // 3D-2: a curve in space written as its three coordinates, x = cos(t), y = sin(t), z = t/5 (t from 0 to 2π), before
  // the three = signs are taken for three relations.
  if ((m = input.match(/^\s*x\s*=\s*(.+?)\s*,\s*y\s*=\s*(.+?)\s*,\s*z\s*=\s*(.+?)\s*$/))) {
    graphSpaceCurve(input, [m[1], m[2], m[3]], 0, 2 * Math.PI)
    return true
  }

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
  // 3D-2: a surface given by its three coordinates, surface(x(u, v), y(u, v), z(u, v), u0, u1, v0, v1).
  if ((m = line.match(/^\s*surface\s*\((.+)\)\s*$/i))) {
    const parts = splitArgs(m[1])
    if (parts.length !== 3 && parts.length !== 7) throw new Error('surface(x(u, v), y(u, v), z(u, v), u from, u to, v from, v to)')
    const [tMin, tMax, vMin, vMax] = parts.length === 7 ? parts.slice(3).map(numberArg) : [0, 2 * Math.PI, 0, Math.PI]
    const exprs = parts.slice(0, 3)
    const note = mustDraw({ kind: 'psurface', exprs, tMin, tMax, vMin, vMax })
    visualizeGraph(input, exprs, 'psurface', { tMin, tMax, vMin, vMax })
    s.pushLog({ input, kind: 'result', text: withNote('Surface created in the 3D view.', note) + landInGraphing() })
    return true
  }
  if ((m = line.match(/^\s*z\s*=\s*(.+)$/))) {
    const note = mustDraw({ kind: 'surface', exprs: [m[1]] })
    visualizeGraph(input, [m[1]], 'surface')
    s.pushLog({ input, kind: 'result', text: withNote('Surface created in the 3D view.', note) + landInGraphing() })
    return true
  }
  // 3D-2: an equation in z with x or y that is not z = … is a plane, ax + by + cz = d; anything else in z cannot be drawn.
  // A name on the left (n = 2z, z1 = |√−4|) is a definition, not a plane: it goes on to the routes that answer those.
  const leftName = rel ? line.slice(0, rel.at).trim() : ''
  const definesName = /^[A-Za-z]\w*$/.test(leftName) && !['x', 'y', 'z'].includes(leftName)
  if (rel?.op === '=' && usesSymbol(line, 'z') && (usesSymbol(line, 'x') || usesSymbol(line, 'y')) && !definesName) {
    const expr = `(${line.slice(0, rel.at)}) - (${line.slice(rel.at + 1)})`
    const note = mustDraw({ kind: 'plane', exprs: [expr] })
    visualizeGraph(input, [expr], 'plane')
    s.pushLog({ input, kind: 'result', text: withNote('Plane created in the 3D view.', note) + landInGraphing() })
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
    // 3D-2: curve(x(t), y(t), z(t), tmin, tmax) is a curve in space: five inputs, or a third that is a formula of t
    // (curve(cos(t), sin(t), 0) is still the flat curve from t = 0).
    if (parts.length === 5 || (parts.length >= 3 && usesSymbol(parts[2], 't'))) {
      graphSpaceCurve(input, parts.slice(0, 3), parts[3] ? numberArg(parts[3]) : 0, parts[4] ? numberArg(parts[4]) : 2 * Math.PI)
      return true
    }
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
/** A curve in space (3D-2) from its three formulas of t, drawn over t from t0 to t1. */
function graphSpaceCurve(input: string, exprs: string[], tMin: number, tMax: number): void {
  const note = mustDraw({ kind: 'curve3d', exprs, tMin, tMax })
  visualizeGraph(input, exprs, 'curve3d', { tMin, tMax })
  scene().pushLog({ input, kind: 'result', text: withNote('Curve in space created in the 3D view.', note) + landInGraphing() })
}

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
