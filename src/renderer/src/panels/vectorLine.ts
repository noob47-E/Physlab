// The Vector Calculator: what a card holds — reading a card's line, its names and units, into a vector or a sentence that says why not.
// Out of vectorCalcStore.ts as a pure move (CLEANUP-PLAN.md CW10).

import type { MathNode } from 'mathjs'
import type { EvalResult } from '../core/types'
import { latexToMath } from '../math/latexToMath'
import { inDegrees, isUnit, math, plainNumber, preprocess, toV3 } from '../math/expr'
import { fromPolar, heading, len, toRad, type V3 } from '../math/vec'
import type { Card } from './vectorCalcStore'

// ---------------------------------------------------------------------------
// What a card holds
// ---------------------------------------------------------------------------

export const UNIT_VECTORS = { i: [1, 0, 0], j: [0, 1, 0], k: [0, 0, 1] }

/**
 * A sentence already written for the student: what is wrong and how to put it right. The
 * translator below passes it through untouched; anything else is the shared parser's own wording.
 */
export class PlainError extends Error {}

/** A number typed in a maths field (a size, an angle, k or q). */
export function evalNumber(latex: string): number {
  if (!latex.trim()) throw new PlainError('This box is empty. Type a number in it, like 5.')
  const v = math.evaluate(preprocess(latexToMath(latex)))
  // A lone letter such as A is one of mathjs's units (the ampere) with no number in front of it;
  // it used to read as a size of 0 and draw nothing, with no word why.
  if (isUnit(v) && (v as { value?: unknown }).value == null) throw new PlainError(`“${latex}” is not a number. Type a number here, like 5.`)
  const n = typeof v === 'number' ? v : Number((v as { toNumber?: () => number }).toNumber?.() ?? v)
  if (!Number.isFinite(n)) throw new PlainError('This number cannot be worked out: something is divided by zero, or is the square root of a negative number.')
  return n
}

/** What a card waiting for its vector says instead of a value: not an error, a prompt. */
const NOTHING_TYPED = 'nothing typed yet'
export const NOTHING_PICKED = 'Choose an arrow from the graph in the list above: this card then shows its x- and y-components, size and angle, and follows the arrow when you drag it.'
/** The graph card's prompt when the graph has no arrow to offer yet. */
export const NO_ARROWS = 'There is no arrow on the graph yet. Draw one with the Vector tool and it appears in the list above, or switch this card to “typed”.'
/** The graph card's prompt when the graph has arrows but each one already belongs to another card. */
export const ALL_ARROWS_TAKEN = 'Every arrow on the graph already belongs to another card. Draw a new one with the Vector tool and it appears in the list above, or switch this card to “typed”.'

/**
 * What a waiting graph card says: its own prompt while there is an arrow to choose, else why there
 * is none. "No arrow on the graph yet" was shown whenever the list was empty, including when the
 * graph had arrows that other cards had already taken.
 */
export function graphCardPrompt(arrowsOnGraph: number, arrowsOffered: number, prompt: string): string {
  if (arrowsOffered > 0) return prompt
  return arrowsOnGraph > 0 ? ALL_ARROWS_TAKEN : NO_ARROWS
}

/** Names the maths field may use that are neither a card nor a unit vector. */
const KNOWN_NAMES = new Set(['pi', 'e', 'tau', 'phi', 'deg', 'rad'])

/**
 * The names in a typed line that nothing gives a value to. mathjs fills an unknown single letter
 * with one of its units — B is the byte, C the coulomb — so "A/B" with no card B above read as
 * A itself and "C + A" failed with a message about addScalar and Unit. Checked before evaluating.
 */
export function unknownNames(src: string, scope: Record<string, unknown>, cardNames: string[] = []): string[] {
  const out: string[] = []
  const root = math.parse(src)
  const units = unitsAfterNumbers(root)
  root.traverse((node, path, parent) => {
    const n = node as unknown as { type: string; name?: string }
    // A function's own name (sqrt, dot, polarVec) is not a value.
    if (n.type !== 'SymbolNode' || path === 'fn' || !n.name) return
    if (n.name in scope || KNOWN_NAMES.has(n.name) || out.includes(n.name)) return
    // 2A is twice card A even when card A cannot be read: a card's name is never a unit.
    if (isUnitName(n.name, cardNames) && (afterNumber(parent) || units.has(node))) return
    out.push(n.name)
  })
  return out
}

type UnitNode = { type: string; name?: string; op?: string; implicit?: boolean; args?: UnitNode[] }

const isValuelessUnit = (name: string): boolean => {
  try {
    return (math as unknown as { Unit: { isValuelessUnit: (s: string) => boolean } }).Unit.isValuelessUnit(name)
  } catch {
    return false
  }
}

/**
 * Which typed name is a unit, one rule for the reader (unknownNames) and the note (droppedUnits):
 * a name mathjs knows as a unit that is not a card's name (mathjs reads B as the byte and N as the
 * newton), a unit vector or a known name (deg and rad are units to mathjs). Where a unit may stand
 * is the reader's own rule — straight after a number, or the line is refused — so on a component
 * line that reads, the note names exactly the units the reader let through.
 */
const isUnitName = (name: string, cardNames: readonly string[]): boolean =>
  !(name in UNIT_VECTORS) && !KNOWN_NAMES.has(name) && !cardNames.includes(name) && isValuelessUnit(name)

/** A unit and nothing else: N, m/s, s^2, kg m. */
const isUnitOnly = (n: UnitNode | undefined): boolean =>
  !!n &&
  ((n.type === 'SymbolNode' && !!n.name && isValuelessUnit(n.name)) ||
    (n.type === 'ParenthesisNode' && isUnitOnly((n as unknown as { content: UnitNode }).content)) ||
    (n.type === 'OperatorNode' && ((n.op === '*' && !!n.implicit) || n.op === '/') && (n.args ?? []).every(isUnitOnly)) ||
    (n.type === 'OperatorNode' && n.op === '^' && isUnitOnly(n.args?.[0]) && n.args?.[1]?.type === 'ConstantNode'))

/** A number with its units after it: 10 N, 10 N m, 10 kg m/s, 9.8 m/s^2. */
const isMeasure = (n: UnitNode | undefined): boolean =>
  !!n &&
  n.type === 'OperatorNode' &&
  ((n.op === '*' && !!n.implicit) || n.op === '/') &&
  (n.args?.[0]?.type === 'ConstantNode' || isMeasure(n.args?.[0])) &&
  isUnitOnly(n.args?.[1])

/**
 * The unit symbols of every number-with-units in a line — "10 kg m/s ∠ 30°", "10 N m at 30°". Only
 * the unit straight after the number was known (afterNumber), so once a size could carry more
 * than one unit word the second one, m, was refused as "There is no vector called m".
 */
function unitsAfterNumbers(root: unknown): Set<unknown> {
  const found = new Set<unknown>()
  ;(root as { traverse: (cb: (node: unknown) => void) => void }).traverse((node) => {
    const n = node as UnitNode
    if (!isMeasure(n)) return
    const mark = (u: UnitNode | undefined): void => {
      if (!u) return
      if (u.type === 'SymbolNode') found.add(u)
      else if (u.type === 'ParenthesisNode') mark((u as unknown as { content: UnitNode }).content)
      else if (u.op === '^') mark(u.args?.[0])
      else for (const a of u.args ?? []) mark(a)
    }
    mark(n.args?.[1])
  })
  return found
}

/**
 * The names a worked-out line uses, read off its parse tree. A word-boundary search found no B in
 * "A+2B" (2B is one word to it), so B was left out of the answer's recipe and picture: retyping or
 * removing B changed nothing.
 */
export function namesIn(src: string): string[] {
  const out: string[] = []
  math.parse(src).traverse((node, path) => {
    const n = node as unknown as { type: string; name?: string }
    // A function's own name (sqrt, dot, polarVec) is not a value.
    if (n.type === 'SymbolNode' && path !== 'fn' && n.name && !out.includes(n.name)) out.push(n.name)
  })
  return out
}

/** "10 N at 30°": a unit written straight after a number is a unit, not a missing vector. */
function afterNumber(parent: unknown): boolean {
  const p = parent as { type?: string; implicit?: boolean; args?: { type: string }[] } | null
  return p?.type === 'OperatorNode' && !!p.implicit && p.args?.[0]?.type === 'ConstantNode'
}

/** The sentence for a name nothing gives a value to, in a card or in the expression box. */
export function unknownNameSentence(name: string, scope: Record<string, unknown>, below: string[] = [], unreadable: string[] = []): string {
  if (below.includes(name)) return `${name} is a card further down. A card can only use the vectors above it, so type ${name}'s value here or use a card higher up.`
  if (unreadable.includes(name)) return `Card ${name} cannot be read yet, so it cannot be used here. Put card ${name} right first.`
  // "AB" or "ij": two names written with no sign between them.
  const parts = name.split('')
  if (name.length > 1 && parts.every((p) => p in scope)) return `“${name}” is not one name. Put a sign between ${parts.join(' and ')}: ${parts.join(' × ')} for the cross product, ${parts.join(' · ')} for the dot product.`
  return `There is no vector called ${name}. Use a card's name (the letter on its left), or the unit vectors i, j and k.`
}

/** A number added to or taken from a vector: said in one place, for the parser's own refusals and for evaluateVectorLine's (H11). */
const NUMBER_AND_VECTOR = 'Something here mixes a number and a vector in a way that has no meaning, like adding 3 to a vector. Check each part is a vector, like 3i, or a named card.'

/** The sentence for a division by zero in a line that works out to a number or a vector (H6). */
export const DIVIDED_BY_ZERO = 'This cannot be worked out: something in it is divided by zero.'

/**
 * The shared parser's messages, in words a beginner can act on: what is wrong, then how to put it
 * right. The command bar keeps its own wording; this is only for the Vector Calculator.
 */
export function explainVectorError(e: unknown): string {
  if (e instanceof PlainError) return e.message
  const raw = e instanceof Error ? e.message : String(e)
  const part = /(?:Unexpected part|Syntax error in part) "([^"]*)"/.exec(raw)?.[1]
  if (part !== undefined) {
    if (/^[/÷]/.test(part)) return 'A vector cannot be divided by a vector. Divide by a number instead, like A/2, or use · or × between two vectors.'
    if (part.includes('∠')) return 'Write a size and an angle as 10∠30°: the size, then ∠, then the angle.'
    return `“${part}” cannot be read here. Put a sign (+, −, × or ·) between the parts, like 2A + B.`
  }
  if (/^Unexpected end of expression/.test(raw)) return 'The line stops short: something is missing after the last sign. Finish it, like 3i + 4j.'
  if (/^Value expected/.test(raw)) return 'A sign is waiting for a vector or number after it. Finish it, like A · B, or remove the sign.'
  if (/^Parenthesis \) expected/.test(raw)) return 'A bracket “(” is never closed. Add the “)” that closes it.'
  const op = /^Unexpected operator (\S+)/.exec(raw)?.[1]
  if (op === ')') return 'There is a “)” with no “(” to match it. Remove it, or add the “(” it closes.'
  if (op === ',') return 'A comma cannot go there. Write a vector with i and j, like 3i + 4j, or in brackets, like (3, 4).'
  if (op) return `The sign “${op}” cannot go there. Check the signs around it.`
  const name = /^Undefined symbol (\S+)/.exec(raw)?.[1]
  if (name) return unknownNameSentence(name, UNIT_VECTORS)
  if (/^For A\^b/.test(raw)) return 'A vector cannot be squared. For its size squared, use A · A; for its size, use |A|.'
  if (/^Invalid left hand side|assignment/.test(raw)) return 'Leave out the = sign: type only the vector, like 3i + 4j.'
  if (/^Expected a vector or point/.test(raw)) return 'This works out to a number, not a vector. Give it a direction with i and j (3i + 4j) or an angle (10∠30°). A · B is a number; A × B is a vector.'
  if (/^Vectors need 2 or 3 components/.test(raw)) return 'A vector has 2 or 3 parts (x, y and z). Check the brackets hold 2 or 3 numbers.'
  if (/Unexpected type of argument|Too few arguments|Too many arguments|Dimension mismatch/.test(raw)) return NUMBER_AND_VECTOR
  // A converter refusal (the ± rule) is already a sentence for the student.
  if (/^[A-Z][^()]*[.:]/.test(raw) && !/\(char \d+\)|function|expected:|undefined/.test(raw)) return raw
  return 'This cannot be read as a vector. Type it like 3i + 4j, or as a size and angle like 10∠30°.'
}

/**
 * Refuses a number added to a vector or taken from it. mathjs adds the number to every part, so
 * "8i + 2" (on the way to 8i + 2j) read 10i + 2j + 2k and "A − 1" 2i + 3j − k, and the arrow and
 * every answer jumped to 3D; no textbook sum has such a term. Each + and − is judged on what its two
 * sides work out to, so 2A, A − i, A/2 and |A| i are read as before (H11).
 */
function refuseNumberWithVector(src: string, scope: Record<string, unknown>): void {
  if (!/[+-]/.test(src)) return
  const isVector = (x: unknown): boolean => Array.isArray(x) || typeof (x as { toArray?: unknown } | null)?.toArray === 'function'
  const isNumber = (x: unknown): boolean => typeof x === 'number' || isUnit(x)
  math.parse(src).traverse((node: MathNode) => {
    const op = node as unknown as { type: string; fn?: string; args?: { evaluate: (scope: Record<string, unknown>) => unknown }[] }
    if (op.type !== 'OperatorNode' || (op.fn !== 'add' && op.fn !== 'subtract') || op.args?.length !== 2) return
    let left: unknown
    let right: unknown
    try {
      // Copies: working a side out must never leave a name behind in the scope.
      left = op.args[0].evaluate({ ...scope })
      right = op.args[1].evaluate({ ...scope })
    } catch {
      // A side that cannot be worked out is the evaluation's own error to report, in its own words.
      return
    }
    if ((isVector(left) && isNumber(right)) || (isNumber(left) && isVector(right))) throw new PlainError(NUMBER_AND_VECTOR)
  })
}

/**
 * How big the quantities a typed line works with are, to tell the rounding noise its arithmetic
 * leaves from what it gives (H17). 5∠30° + 5∠210° adds two vectors of 5 and leaves 8.9×10⁻¹⁶: no
 * vector, but the last bits of a sum that cancels; 1.6×10⁻¹⁹ î is a vector of exactly that size.
 * As the solver's isNoise reads a product against |A||B|: a sum is as big as its larger term, a
 * product as its factors multiplied (× and · too), sin, cos and tan are 1, a vector or a number
 * the line writes is its own size. Only what is added, multiplied or written as a size counts, so
 * the angle of 5∠30° and the exponent of 10^{-19} do not.
 */
function lineScale(tree: MathNode, scope: Record<string, unknown>): number {
  type N = { type: string; fn?: unknown; name?: string; value?: unknown; content?: N; args?: N[]; evaluate: (scope: Record<string, unknown>) => unknown }
  const sizeOf = (x: unknown): number => {
    if (typeof x === 'number') return Math.abs(x)
    if (isUnit(x)) {
      // A valueless unit (the N of "5 N") is a factor of 1.
      try {
        const n = Math.abs(plainNumber(x))
        return Number.isFinite(n) ? n : 1
      } catch {
        return 1
      }
    }
    const list = typeof (x as { toArray?: unknown } | null)?.toArray === 'function' ? (x as { toArray: () => unknown }).toArray() : x
    return Array.isArray(list) ? Math.max(0, ...list.flat(2).map(sizeOf)) : 0
  }
  // A part of the line worked out whole: what a function of it, or a power, is worth.
  const worth = (n: N): number => {
    try {
      return sizeOf(n.evaluate({ ...scope }))
    } catch {
      return 0
    }
  }
  const walk = (n: N): number => {
    const arg = (i: number): number => (n.args?.[i] ? walk(n.args[i]) : 0)
    if (n.type === 'ConstantNode') return sizeOf(n.value)
    if (n.type === 'SymbolNode') return n.name !== undefined && n.name in scope ? sizeOf(scope[n.name]) : worth(n) || 1
    if (n.type === 'ParenthesisNode') return n.content ? walk(n.content) : 0
    if (n.type === 'OperatorNode') {
      if (n.args?.length === 1) return arg(0)
      if (n.fn === 'add' || n.fn === 'subtract') return Math.max(arg(0), arg(1))
      if (n.fn === 'multiply') return arg(0) * arg(1)
      if (n.fn === 'divide') {
        const by = n.args?.[1] ? worth(n.args[1]) : 0
        return by > 0 ? arg(0) / by : arg(0)
      }
    }
    if (n.type === 'FunctionNode') {
      const name = (n.fn as { name?: string } | undefined)?.name ?? n.name
      if (name === 'dot' || name === 'cross' || name === 'timesOrCross') return arg(0) * arg(1)
      if (name === 'mag' || name === 'polarVec') return arg(0)
      if (name === 'vec' || name === 'pt') return Math.max(0, ...(n.args ?? []).map(walk))
      if (name === 'sin' || name === 'cos' || name === 'tan' || name === 'sec' || name === 'csc' || name === 'cot') return 1
    }
    return worth(n)
  }
  try {
    const scale = walk(tree as unknown as N)
    return Number.isFinite(scale) ? scale : 0
  } catch {
    return 0
  }
}

/**
 * What a line gives with the noise of its arithmetic taken out: a number or a part of a vector
 * under a part in 10¹² of the line's scale (or of the result itself, when that is bigger) is
 * exactly 0, so the card, its arrow, its answers and its card line all read the same (H17).
 */
function withoutNoise(out: unknown, scale: number): unknown {
  const list = typeof (out as { toArray?: unknown } | null)?.toArray === 'function' ? (out as { toArray: () => unknown }).toArray() : out
  const numbers = (x: unknown): number[] => (typeof x === 'number' ? [x] : Array.isArray(x) ? x.flatMap(numbers) : [])
  const all = numbers(list)
  // A division by zero is the caller's to report, not noise.
  if (!all.length || !all.every(Number.isFinite)) return out
  // eslint-disable-next-line no-restricted-syntax -- relative already; tests/noise.test.ts measures this rule against isNoise's 10⁻¹⁵, and the number is CW9's (P-CW2-REPORT class 1)
  const floor = 1e-12 * Math.max(scale, ...all.map(Math.abs))
  const clean = (x: unknown): unknown => (typeof x === 'number' ? (Math.abs(x) < floor ? 0 : x) : Array.isArray(x) ? x.map(clean) : x)
  return clean(list)
}

/**
 * The units a typed vector line leaves out (R2-2). A vector holds plain numbers: "<3 m, 4 m>" is
 * worked as 3, 4 and its size 5 has no unit, which the student could not tell. Which names are
 * units is isUnitName's rule, the reader's own; they are named wherever they stand, because the
 * size box of a size ∠ angle card reads a unit anywhere (evalNumber). Null when nothing was dropped
 * or the line cannot be read.
 */
export function droppedUnits(text: string, names: string[] = []): string[] | null {
  if (!text.trim()) return null
  const raised = text.replace(/[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (run) => `^{${run.replace(/[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => (c === '⁻' ? '-' : '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c).toString()))}}`)
  const found: string[] = []
  try {
    math.parse(preprocess(latexToMath(raised, { vectorOps: true }))).traverse((node, path) => {
      const n = node as unknown as { type: string; name?: string }
      if (n.type !== 'SymbolNode' || path === 'fn' || !n.name || found.includes(n.name)) return
      if (isUnitName(n.name, names)) found.push(n.name)
    })
  } catch {
    return null
  }
  return found.length ? found : null
}

/**
 * The one line that tells the student typed units were left out. It does not name them: typed
 * spaces vanish before the line is read, so "3 m s⁻²" is read as the one unit ms, and naming that
 * ("the ms you typed") would be false.
 */
export function droppedUnitsSentence(units: string[]): string {
  return `Units are left out in Vectors: the ${units.length === 1 ? 'unit' : 'units'} you typed ${units.length === 1 ? 'is' : 'are'} ignored, and only the numbers are used.`
}

/**
 * Evaluates a typed vector line against the vectors it may use, refusing a name nothing gives a
 * value to (see unknownNames) with a sentence rather than a unit, and a number added to a vector.
 * What it gives is free of the noise its own arithmetic left (see lineScale).
 */
export function evaluateVectorLine(latex: string, scope: Record<string, unknown>, below: string[] = [], unreadable: string[] = []): { src: string; out: unknown } {
  const src = preprocess(latexToMath(latex, { vectorOps: true }))
  const unknown = unknownNames(src, scope, [...below, ...unreadable])
  if (unknown.length) throw new PlainError(unknownNameSentence(unknown[0], scope, below, unreadable))
  refuseNumberWithVector(src, scope)
  // math.evaluate itself: a test counts its calls to see each card is worked out once.
  const out = math.evaluate(src, scope)
  return { src, out: withoutNoise(out, lineScale(math.parse(src), scope)) }
}

/**
 * The cards worked out from the top, one at a time, each against the ones above it: `value` works
 * out the next card, `keep` puts what that card finally holds into the scope of the cards below.
 * They are two steps because the sync may rewrite a card (its arrow was dragged) after reading it,
 * and the cards below must see the rewritten card: B = 2A kept A's old value after A was dragged.
 * Working each card out again from the top for every card below it cost 2^n evaluations — 368 ms
 * for fourteen cards, on every frame of every drag once the panel had been opened.
 */
export function cardWalk(cards: Card[], ev: EvalResult) {
  const scope: Record<string, unknown> = { ...UNIT_VECTORS }
  const unreadable: string[] = []
  const names = cards.map((c) => c.name)
  let at = 0
  return {
    value: (card: Card): V3 | string => {
      try {
        // A copy: an evaluation must never leave a name behind in the cards below.
        return inDegrees(() => cardValueNow(card, { ...scope }, [...unreadable], names.slice(at + 1), ev))
      } catch (e) {
        return explainVectorError(e)
      }
    },
    keep: (name: string, v: V3 | string): void => {
      if (typeof v !== 'string') scope[name] = v
      else unreadable.push(name)
      at++
    }
  }
}

/**
 * Every card's vector value, or the reason it has none in plain words, in one pass from the top.
 * A card may use the cards above it by name (B = 2A); the ones below are not yet known, as on paper.
 */
export function cardValues(cards: Card[], ev: EvalResult): (V3 | string)[] {
  const walk = cardWalk(cards, ev)
  return cards.map((c) => {
    const v = walk.value(c)
    walk.keep(c.name, v)
    return v
  })
}

/** One card's value among the cards (by its id), or on its own when it is not one of them. */
export function cardValue(card: Card, cards: Card[], ev: EvalResult): V3 | string {
  const at = cards.findIndex((c) => c.id === card.id)
  if (at < 0) return cardValues([card], ev)[0]
  return cardValues(cards.map((c, i) => (i === at ? card : c)), ev)[at]
}

function cardValueNow(card: Card, scope: Record<string, unknown>, unreadable: string[], below: string[], ev: EvalResult): V3 | string {
  if (card.entry === 'polar') {
    // The vector the boxes were filled from, while both still read as they were written: 5.66 ∠ 45°
    // is the 4i + 4j it was rounded from, not 3.9999…i + 4.0000…j (V6). A box the student has not
    // touched is still that vector's own size or angle, so retyping the size of 5 ∠ 53.13° keeps the
    // direction it had and does not turn it by the 0.0001° the box rounded away; a box that was
    // edited is what was typed.
    const kept = card.exact
    if (kept && Array.isArray(kept.v) && kept.v.length === 3 && kept.v.every(Number.isFinite)) {
      const sizeKept = kept.mag === card.mag
      const angleKept = kept.angle === card.angle
      if (sizeKept && angleKept) return kept.v
      return fromPolar(sizeKept ? len(kept.v) : evalNumber(card.mag), angleKept ? heading(kept.v) : toRad(evalNumber(card.angle)))
    }
    return fromPolar(evalNumber(card.mag), toRad(evalNumber(card.angle)))
  }
  if (card.entry === 'scene') {
    const c = card.sceneId ? ev.values.get(card.sceneId) : undefined
    if (c?.type === 'vector') return c.comp
    return NOTHING_PICKED
  }
  if (!card.latex.trim()) return NOTHING_TYPED
  const v = toV3(evaluateVectorLine(card.latex, scope, below, unreadable).out)
  // 1/0 gave components of Infinity, which the panel printed as "null".
  if (!v.every(Number.isFinite)) throw new PlainError('This vector cannot be worked out: something in it is divided by zero.')
  return v
}
