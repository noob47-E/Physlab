// The Vector Calculator's cards and state, apart from the panel that draws them.
//
// This is a module of its own because the right-click menu (app/contextActions.ts) adds a card
// for a vector in the drawing, and importing the panel for that dragged the panel's MathLive
// field into the start-up bundle — 1.4 MB before the first frame, for a menu item.

import { create } from 'zustand'
import type { DrawStyle } from '../core/visualize'
import type { EvalResult, ObjId, SceneObject, SceneSettings, VectorObj } from '../core/types'
import { useScene } from '../core/store'
import { RESULT_COLOUR, RESULT_TOKEN, newId, nextColor, uniqueName } from '../core/naming'
import { Builder } from '../core/factory'
import { fitCamera } from '../render/viewState'
import { latexToMath } from '../math/latexToMath'
import { inDegrees, isUnit, math, preprocess, toV3 } from '../math/expr'
import { ZERO, add, fromPolar, heading, layoutVectors, len, neg, toDeg, toRad, type V3 } from '../math/vec'
import * as VS from '../math/vectorSolver'

export type Entry = 'comp' | 'polar' | 'scene'

export interface Card {
  id: number
  name: string
  entry: Entry
  latex: string
  mag: string
  angle: string
  /**
   * The arrow on the drawing that is this card's vector. A graph card reads it; a typed or
   * size-and-angle card writes it. Every readable card has one, so the drawing and the panel
   * always show the same vectors (Fix 25, Fix 26).
   */
  sceneId: string
  /**
   * The components the card and its arrow last agreed on. When the arrow changes and this does
   * not match it, the arrow was dragged (or undone) and the card follows; when the card's own
   * value no longer matches it, the student typed and the arrow follows.
   */
  last?: V3
  /** The card drew its arrow itself, so picking another arrow for it takes the old one away. */
  own?: boolean
}

/**
 * A vector written the way a card is typed, so nothing is lost in the copy. Twelve significant
 * digits keep any coordinate a student can draw or type exact while dropping the last-bit error
 * a drag leaves behind: a vector drawn to (2.875, 1.275) is stored as 2.875000000000001, and a
 * demoted card used to hand that string to the student's own field.
 */
export const ijkLatex = (v: V3): string =>
  v
    .map((c, i) => (Math.abs(c) < 1e-12 ? '' : `${c < 0 ? '-' : '+'}${Number(Math.abs(c).toPrecision(12))}\\hat{${'ijk'[i]}}`))
    .join('')
    .replace(/^\+/, '') || '0'

/** The letters a new card is offered, in order; i, j and k are the unit vectors and never a name. */
const CARD_LETTERS = 'ABCDEFGHLMNPQRSTUVW'

/** The name a new typed card gets: the first free letter, or V7 when every letter is taken. */
export function newCardName(cards: Card[], fallbackId: number): string {
  const used = new Set(cards.map((c) => c.name))
  return CARD_LETTERS.split('').find((l) => !used.has(l)) ?? `V${fallbackId}`
}

// ---------------------------------------------------------------------------
// The cards survive a restart: a student comes back to the vectors of the problem they were on.
// ---------------------------------------------------------------------------

/**
 * 0.6.1 opens the panel empty. 0.6.0 stored two sample cards (A = 3i + 4j, B = 5 ∠ 120°) under
 * the old key for everyone, typed or not, so reading that key back would put the samples in
 * front of every student who had upgraded. The new key starts empty; the old one is read once
 * and only the cards a student actually changed are carried over.
 */
export const CARDS_KEY = 'physlab.vectors.cards.v2'
export const OLD_CARDS_KEY = 'physlab.vectors.cards'

/** The 0.6.0 sample cards, as they were stored, so an upgrade can tell them from a student's own. */
const OLD_SAMPLES: Card[] = [
  { id: 1, name: 'A', entry: 'comp', latex: '3\\hat{i}+4\\hat{j}', mag: '10', angle: '30', sceneId: '' },
  { id: 2, name: 'B', entry: 'polar', latex: '', mag: '5', angle: '120', sceneId: '' }
]

const isCard = (c: unknown): c is Card => !!c && typeof (c as Card).name === 'string' && typeof (c as Card).latex === 'string'

/** Whether a stored card is one of the 0.6.0 samples, untouched. */
const isOldSample = (c: Card): boolean =>
  OLD_SAMPLES.some((s) => s.name === c.name && s.entry === c.entry && s.latex === c.latex && s.mag === c.mag && s.angle === c.angle && !c.sceneId)

function parseCards(raw: string | null): Card[] | null {
  if (!raw) return null
  try {
    const cards = JSON.parse(raw) as unknown
    // A card keeps its link to its arrow. If the app restarted with an empty drawing, the card
    // sync draws the arrow again from the components it last held (planSync) — demoting every
    // linked card here once left a red, empty card on every restart.
    return Array.isArray(cards) ? cards.filter(isCard) : null
  } catch {
    return null
  }
}

/**
 * The cards to open with, from what is stored under the new key and, failing that, the old one.
 * Pure, so the upgrade path is testable: the old samples are dropped, anything else is kept.
 */
export function cardsFromStorage(rawV2: string | null, rawV1: string | null): Card[] {
  const v2 = parseCards(rawV2)
  if (v2) return v2
  return (parseCards(rawV1) ?? []).filter((c) => !isOldSample(c))
}

/** What the store needs of localStorage, so the upgrade can be run against a stand-in. */
export type CardStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/**
 * The cards to open with. The first launch after 0.6.0 reads the old key once, writes what it
 * kept under the new key and removes the old one: the new key was only written when a card
 * changed, so a student who never touched the panel had the old list parsed and the samples
 * dropped again on every start.
 */
export function loadCardsFrom(storage: CardStorage): Card[] {
  const rawV2 = storage.getItem(CARDS_KEY)
  const rawV1 = storage.getItem(OLD_CARDS_KEY)
  const cards = cardsFromStorage(rawV2, rawV1)
  if (rawV2 === null && rawV1 !== null) {
    storage.setItem(CARDS_KEY, JSON.stringify(cards))
    storage.removeItem(OLD_CARDS_KEY)
  }
  return cards
}

function loadCards(): Card[] {
  try {
    return loadCardsFrom(localStorage)
  } catch {
    return []
  }
}

function saveCards(cards: Card[]): void {
  try {
    localStorage.setItem(CARDS_KEY, JSON.stringify(cards))
  } catch {
    // Not remembered; the panel still works.
  }
}

// ---------------------------------------------------------------------------
// Which card the drawing's selection means
// ---------------------------------------------------------------------------

/** What the panel does when the drawing's selection changes. */
export type SelectionMatch =
  /** The selected vector already has a card: highlight that one. */
  | { kind: 'card'; cardId: number }
  /** A card is waiting for this vector (blank, or demoted from it): make it read the vector, then highlight it. */
  | { kind: 'link'; cardId: number; sceneId: ObjId; name: string }
  /** The selected vector has no card yet: add one that reads it, then highlight it. */
  | { kind: 'add'; sceneId: ObjId; name: string }
  /** Nothing to do: no selection, several things, not a vector, or a helper. */
  | { kind: 'none' }

/** A typed card nothing has been typed into yet: "Add vector" then the Vector tool means this card. */
export const isBlankCard = (c: Card): boolean => c.entry === 'comp' && !c.latex.trim() && !c.sceneId && !c.last

/**
 * The card a vector should take over rather than get a new one beside: a blank one. Pressing
 * "Add vector" and then drawing the vector used to leave a red empty card A above a second card
 * reading the drawing's A.
 */
export const cardToReuse = (cards: Card[]): Card | undefined => cards.find(isBlankCard)

/**
 * The card a selection on the drawing points at. Exactly one object must be selected and it must
 * be a vector a student drew or typed: helpers (a component, a dashed parallelogram side) and the
 * drawn answers of the panel's own solutions are left alone, or "Draw on graph" would add its own
 * answer R as a fourth card and the next "Add all" would count it twice.
 */
export function cardForSelection(cards: Card[], selection: ObjId[], objects: Record<ObjId, SceneObject>, isAnswer: (id: ObjId) => boolean): SelectionMatch {
  if (selection.length !== 1) return { kind: 'none' }
  const id = selection[0]
  const o = objects[id]
  if (!o || o.type !== 'vector' || o.auxiliary || isAnswer(id)) return { kind: 'none' }
  // Any card whose arrow this is, typed or read off the graph.
  const linked = cards.find((c) => c.sceneId === id)
  if (linked) return { kind: 'card', cardId: linked.id }
  const reuse = cardToReuse(cards)
  if (reuse) return { kind: 'link', cardId: reuse.id, sceneId: id, name: o.name }
  return { kind: 'add', sceneId: id, name: o.name }
}

/**
 * How an answer was worked out: the operation, the cards it read (by id, under the names they had)
 * and the numbers it used. A picture of the answer is worked out again from it when one of those
 * vectors changes, so the graph never shows R ≠ A + B beside a card that says R = A + B.
 */
export interface Recipe {
  cards: { id: number; name: string }[]
  /** The same working, from those cards' values now (named as they were then). */
  solve: (vs: VS.NamedVec[], settings: SceneSettings) => VS.Solution | null
}

export interface Answer {
  sol: VS.Solution
  label: string
  from?: Recipe
  /** Its picture was taken off the graph because a vector it was worked out from went or cannot be read. */
  stale?: boolean
}

export interface VCState {
  cards: Card[]
  expr: string
  k: string
  q: string
  /** null = the solution's own picture; a style only overrides when the student chose one. */
  style: DrawStyle | null
  result: Answer | null
  showSteps: boolean
  showMore: boolean
  /** The card the drawing's selection points at, drawn with a ring; 0 when none. */
  highlight: number
}

const initialCards = loadCards()
let nextCard = Math.max(2, ...initialCards.map((c) => c.id)) + 1

/** The id the next card gets; ids are never reused so React keys stay honest. */
export const nextCardId = (): number => nextCard++
/** The id the next card will get, for a name like V7 before the card exists. */
export const peekCardId = (): number => nextCard

export const useVC = create<VCState>(() => ({
  cards: initialCards,
  expr: '\\vec{A}+\\vec{B}',
  k: '2',
  q: '1.6\\times10^{-19}',
  style: null,
  result: null,
  showSteps: false,
  showMore: false,
  highlight: 0
}))

useVC.subscribe((s, prev) => {
  if (s.cards !== prev.cards) saveCards(s.cards)
})

/**
 * Make an existing card read one of the scene's vectors, named after it where the name is free.
 * The card's own old name is not "taken": a blank card A becomes the reader of the drawing's A.
 */
export function linkCardToScene(cardId: number, sceneId: string, name: string): number {
  const st = useVC.getState()
  const others = st.cards.filter((c) => c.id !== cardId)
  const taken = others.map((c) => c.name)
  useVC.setState({
    cards: st.cards.map((c) => (c.id === cardId ? { ...c, entry: 'scene', sceneId, name: VS.safeCardName(name, newCardName(others, c.id), taken), own: false, last: undefined } : c))
  })
  return cardId
}

/**
 * A card that reads one of the scene's vectors (the right-click menu, and a fresh drawing): the
 * one already reading it, else a card waiting for it, else a new one. A vector whose name a card
 * already has takes the next free letter, not V6.
 */
export function addVectorFromScene(sceneId: string, name: string): number {
  const st = useVC.getState()
  const linked = st.cards.find((c) => c.sceneId === sceneId)
  if (linked) return linked.id
  const reuse = cardToReuse(st.cards)
  if (reuse) return linkCardToScene(reuse.id, sceneId, name)
  const safe = VS.safeCardName(name, newCardName(st.cards, peekCardId()), st.cards.map((c) => c.name))
  const id = nextCardId()
  useVC.setState({ cards: [...st.cards, { id, name: safe, entry: 'scene', latex: '', mag: '1', angle: '0', sceneId }] })
  return id
}

// ---------------------------------------------------------------------------
// What a card holds
// ---------------------------------------------------------------------------

const UNIT_VECTORS = { i: [1, 0, 0], j: [0, 1, 0], k: [0, 0, 1] }

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
export const NOTHING_TYPED = 'nothing typed yet'
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
  math.parse(src).traverse((node, path, parent) => {
    const n = node as unknown as { type: string; name?: string }
    // A function's own name (sqrt, dot, polarVec) is not a value.
    if (n.type !== 'SymbolNode' || path === 'fn' || !n.name) return
    if (n.name in scope || KNOWN_NAMES.has(n.name) || out.includes(n.name)) return
    // 2A is twice card A even when card A cannot be read: a card's name is never a unit.
    if (!cardNames.includes(n.name) && isUnitAfterNumber(n.name, parent)) return
    out.push(n.name)
  })
  return out
}

/** "10 N at 30°": a unit written straight after a number is a unit, not a missing vector. */
function isUnitAfterNumber(name: string, parent: unknown): boolean {
  const p = parent as { type?: string; implicit?: boolean; args?: { type: string }[] } | null
  if (p?.type !== 'OperatorNode' || !p.implicit || p.args?.[0]?.type !== 'ConstantNode') return false
  try {
    return (math as unknown as { Unit: { isValuelessUnit: (s: string) => boolean } }).Unit.isValuelessUnit(name)
  } catch {
    return false
  }
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
  if (/Unexpected type of argument|Too few arguments|Too many arguments|Dimension mismatch/.test(raw))
    return 'Something here mixes a number and a vector in a way that has no meaning, like adding 3 to a vector. Check each part is a vector, like 3i, or a named card.'
  // A converter refusal (the ± rule) is already a sentence for the student.
  if (/^[A-Z][^()]*[.:]/.test(raw) && !/\(char \d+\)|function|expected:|undefined/.test(raw)) return raw
  return 'This cannot be read as a vector. Type it like 3i + 4j, or as a size and angle like 10∠30°.'
}

/**
 * Evaluates a typed vector line against the vectors it may use, refusing a name nothing gives a
 * value to (see unknownNames) with a sentence rather than a unit.
 */
export function evaluateVectorLine(latex: string, scope: Record<string, unknown>, below: string[] = [], unreadable: string[] = []): { src: string; out: unknown } {
  const src = preprocess(latexToMath(latex, { vectorOps: true }))
  const unknown = unknownNames(src, scope, [...below, ...unreadable])
  if (unknown.length) throw new PlainError(unknownNameSentence(unknown[0], scope, below, unreadable))
  return { src, out: math.evaluate(src, scope) }
}

/**
 * The cards worked out from the top, one at a time, each against the ones above it: `value` works
 * out the next card, `keep` puts what that card finally holds into the scope of the cards below.
 * They are two steps because the sync may rewrite a card (its arrow was dragged) after reading it,
 * and the cards below must see the rewritten card: B = 2A kept A's old value after A was dragged.
 * Working each card out again from the top for every card below it cost 2^n evaluations — 368 ms
 * for fourteen cards, on every frame of every drag once the panel had been opened.
 */
function cardWalk(cards: Card[], ev: EvalResult) {
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
  if (card.entry === 'polar') return fromPolar(evalNumber(card.mag), toRad(evalNumber(card.angle)))
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

/**
 * One short line under a card saying what a student can do next with it. The panel's operations
 * read the cards from the top, which nothing on screen said.
 */
export function nextStepHint(names: string[], index: number): string {
  const me = names[index]
  if (names.length === 1) return `Next: Size & angle or Components take ${me} apart, or add a second vector to combine with it.`
  if (index === 0) return `${me} is the first vector: Subtract, Dot and Cross use ${me} and ${names[1]}, in that order.`
  if (index === 1) return `Next: Add all gives the resultant of every card; Subtract gives ${names[0]} − ${me}.`
  return `Add all and Equilibrium use every card, ${me} too; the two-vector operations use only ${names[0]} and ${names[1]}.`
}

// ---------------------------------------------------------------------------
// Working an answer out (the panel's buttons, and again when a drawn answer's vectors change)
// ---------------------------------------------------------------------------

/** An operation's answer from the vectors it reads, in order; throws a PlainError or a parser error. */
export function solveOperation(op: string, vs: VS.NamedVec[], settings: SceneSettings, k = 0, q = 0): VS.Solution | null {
  const [A, B] = vs
  switch (op) {
    case 'sum':
      return VS.solveAddition(vs, 'R', settings)
    case 'sub':
      return VS.solveSubtraction(A, B, 'R', settings)
    case 'scale':
      return VS.solveScalarMultiply(k, A, 'R', settings)
    case 'dot':
      return VS.solveDot(A, B, settings)
    case 'angle':
      return VS.solveAngleBetween(A, B, settings)
    case 'cross':
      return VS.solveCross(A, B, 'C', settings)
    case 'mag':
      return VS.solveMagnitudeDirection(A, settings)
    case 'unit':
      return VS.solveUnitVector(A, settings)
    case 'proj':
      return VS.solveProjection(B, A, settings)
    case 'resolve':
      return VS.solveResolve(A, settings)
    case 'equil':
      return VS.solveEquilibrium(vs, settings)
    case 'torque':
      return VS.solveTorque(A.v, B.v, settings)
    case 'work':
      return VS.solveWork(A.v, B.v, settings)
    case 'lorentz':
      return VS.solveMagneticForce(q, A.v, B.v, settings)
    case 'relvel':
      return VS.solveRelativeVelocity(A, B, settings)
    default:
      return null
  }
}

/** An answer worked out again from its recipe and the cards as they are now; null when it cannot be. */
export function solveAgain(from: Recipe, cards: Card[], values: (V3 | string)[], settings: SceneSettings): VS.Solution | null {
  const named: VS.NamedVec[] = []
  for (const { id, name } of from.cards) {
    const v = values[cards.findIndex((c) => c.id === id)]
    if (v === undefined || typeof v === 'string') return null
    named.push({ name, v })
  }
  try {
    return from.solve(named, settings)
  } catch {
    return null
  }
}

/** The line under an answer: where to look next (only an answer with a picture can be drawn). */
export const answerHint = (drawable: boolean): string =>
  drawable ? 'Next: Draw on graph shows it on the graph, and Steps shows how it was worked out.' : 'Next: Steps shows how it was worked out.'

// ---------------------------------------------------------------------------
// One set of vectors: every readable card is an arrow on the drawing (Fix 25, Fix 26)
// ---------------------------------------------------------------------------
//
// The cards used to live apart from the drawing. A typed card was only ever arithmetic, so
// "Add vector" and 3i + 4j drew nothing; deleting an arrow turned its card into a typed copy
// that stayed in the panel; and Remove on a card left its arrow on the drawing. Now each card
// owns exactly one arrow (`sceneId`), the drawing's undo history is the only history, and the
// panel follows the drawing: an arrow that goes takes its card, an arrow that comes back (undo,
// redo) brings its card back where it was.

/** Components equal to the last bits a typed number can carry. */
const same = (a: V3, b?: V3): boolean => !!b && a.every((x, k) => Math.abs(x - b[k]) <= 1e-9 * Math.max(1, Math.abs(x)))

/** A number written for a card's field: twelve significant digits, no float noise. */
const fieldNumber = (x: number): string => String(Number(x.toPrecision(12)))

/** What reconciling the cards with the drawing asks for. */
export interface SyncPlan {
  /** The cards afterwards; the same array when nothing about them changed. */
  cards: Card[]
  /** Arrows to add for cards that have none on the drawing. */
  create: VectorObj[]
  /** Arrows whose components follow what was typed in their card. */
  write: { id: ObjId; comp: V3 }[]
}

/**
 * The one decision behind keeping the cards and the drawing in step, as a pure function of both.
 * For each card: a graph card reads its arrow; a typed card whose value changed moves its arrow;
 * an arrow that moved while its card did not (a drag, an undo) rewrites the card; the arrow's
 * name is the card's name; and a readable card with no arrow gets one, named after the card.
 */
export function planSync(cards: Card[], objects: Record<ObjId, SceneObject>, ev: EvalResult): SyncPlan {
  const create: VectorObj[] = []
  const write: SyncPlan['write'] = []
  // Runs on every change to the drawing, a drag's every frame included: nothing to do, nothing copied.
  if (!cards.length) return { cards, create, write }
  // The names taken so far, copied only when an arrow has to be made.
  let pool: Record<ObjId, SceneObject> | null = null
  let changed = false
  // Each card is worked out against the cards above it as this pass leaves them, so B = 2A
  // follows A in the same pass when A's arrow is dragged or undone and A's card is rewritten.
  const walk = cardWalk(cards, ev)
  const out = cards.map((card) => {
    const obj = card.sceneId ? objects[card.sceneId] : undefined
    const shown = obj?.type === 'vector' ? ev.values.get(obj.id) : undefined
    const drawn = shown?.type === 'vector' ? shown.comp : undefined
    let next = card
    const patch = (p: Partial<Card>) => {
      next = { ...next, ...p }
      changed = true
    }
    const done = (v: V3 | string | undefined): Card => {
      walk.keep(next.name, v ?? NOTHING_PICKED)
      return next
    }
    if (obj?.type === 'vector') {
      if (obj.name !== card.name) patch({ name: obj.name })
      if (!drawn) return done(walk.value(next))
      if (card.entry === 'scene') {
        if (!same(drawn, card.last)) patch({ last: drawn })
        return done(drawn)
      }
      const v = walk.value(next)
      if (typeof v !== 'string' && same(v, drawn)) {
        // Card and arrow agree. Checked first: an undo that puts A back also puts B = 2A's arrow
        // back, and B is still twice A — reading that as a drag would overwrite 2A with numbers.
        if (!same(v, card.last)) patch({ last: v })
        return done(v)
      }
      if (card.last && !same(drawn, card.last)) {
        // The arrow moved and the card did not: the card now says what the drawing says.
        patch(card.entry === 'polar' ? { mag: fieldNumber(len(drawn)), angle: fieldNumber(toDeg(heading(drawn))), last: drawn } : { latex: ijkLatex(drawn), last: drawn })
        return done(drawn)
      }
      if (typeof v === 'string') {
        if (!card.last) patch({ last: drawn })
        return done(v)
      }
      write.push({ id: obj.id, comp: v })
      if (!same(v, card.last)) patch({ last: v })
      return done(v)
    }
    // No arrow for this card on the drawing. A graph card with nothing picked waits; anything
    // else that has a value is drawn, under the card's own id when it had one (so an arrow saved
    // in a recovered drawing is found again rather than drawn twice).
    const v = card.entry === 'scene' ? card.last : walk.value(card)
    if (!v || typeof v === 'string') {
      if (card.sceneId && card.entry === 'scene') patch({ sceneId: '' })
      return done(v)
    }
    pool ??= { ...objects }
    const id = card.sceneId || newId()
    const name = uniqueName(card.name, pool)
    const o: VectorObj = {
      id,
      name,
      visible: true,
      locked: false,
      color: nextColor('vector', pool),
      showLabel: true,
      space: 'vectors',
      type: 'vector',
      def: { kind: 'free', tail: [0, 0, 0], comp: v }
    }
    pool[id] = o
    create.push(o)
    patch({ sceneId: id, name, last: v, own: true })
    return done(v)
  })
  return { cards: changed ? out : cards, create, write }
}

/** Cards whose arrow went, by the arrow's id, with where they stood: undo brings them back there. */
const departed = new Map<ObjId, { card: Card; index: number }>()
/** Arrows are only drawn for cards once the panel has been opened; removal is followed always. */
let drawing = false
/** Set while the sync itself writes, so its own writes do not start it again. */
let busy = false
/** Set while Draw on graph lays out, lays out again or takes away its picture, for the same reason. */
let relaying = false

/** Starts drawing the cards on the drawing; the panel calls it when it opens. Safe to call again. */
export function startCardSync(): void {
  drawing = true
  syncCards()
}

/** Where an arrow's tail is now, whatever kind of arrow it is. */
function tailOf(id: ObjId): V3 {
  const c = useScene.getState().ev.values.get(id)
  return c?.type === 'vector' ? c.tail : [0, 0, 0]
}

/** Applies planSync to the two stores. */
function syncCards(): void {
  if (!drawing || busy) return
  busy = true
  try {
    const cards = useVC.getState().cards
    const sc = useScene.getState()
    const plan = planSync(cards, sc.objects, sc.ev)
    if (plan.create.length) {
      // A new arrow is an undo step, so Ctrl+Z takes it (and its card) away and Ctrl+Y brings both
      // back. With no history yet there is no older drawing an undo could restore without it,
      // so the arrows of the cards a student comes back to after a restart are not a step.
      sc.addObjects(plan.create, { record: sc.past.length > 0 || sc.future.length > 0 })
    }
    for (const w of plan.write) {
      const tail = tailOf(w.id)
      // Typing is not an undo step of the drawing: every keystroke would be one.
      useScene.getState().updateObject(
        w.id,
        (d) => {
          if (d.type === 'vector') d.def = { kind: 'free', tail, comp: w.comp }
        },
        false
      )
    }
    if (plan.cards !== cards) useVC.setState({ cards: plan.cards })
  } finally {
    busy = false
  }
  // Last, once every card and arrow agrees: a drawn answer whose vectors moved is worked out again.
  followAnswer()
}

/**
 * Whether a change to the drawing replaced it whole: File ▸ New, File ▸ Open, an Example and the
 * typed "clear" (newScene / loadScene) start a new history in the same step as the new objects.
 * Nothing else leaves both histories empty — an edit adds to the past, undo adds to the future.
 */
export const sceneReplaced = (s: { past: unknown[]; future: unknown[] }, prev: { past: unknown[] }): boolean => s.past !== prev.past && !s.past.length && !s.future.length

/**
 * A card carried into a new drawing: its arrow went with the old one, but the card is the
 * student's work and is not tied to any file. A typed or size-and-angle card keeps its text; a
 * graph card keeps the vector it last read as typed components. Either is drawn again on the new
 * drawing by the sync, as the cards are after a restart, and under the same id: opening the file
 * the cards were saved in then finds their arrows again instead of drawing a second A beside the
 * file's own and renaming the card A′ (which left B = 2A unreadable).
 */
function carryOver(c: Card): Card {
  return c.entry === 'scene' && c.last ? { ...c, entry: 'comp', latex: ijkLatex(c.last) } : c
}

/** Forgets what the last Draw on graph put on a drawing that is no longer there. */
function forgetDrawn(): void {
  Object.assign(drawn, { added: [], parents: [], results: [], slots: [], notes: [], sources: [], hidden: new Map(), inputs: new Map(), sol: null, style: null, from: undefined })
  drawn.moved.clear()
}

/** The drawing changed: cards whose arrow went go with it, cards whose arrow came back return. */
function followDrawing(prev: Record<ObjId, SceneObject>, next: Record<ObjId, SceneObject>, replaced = false): void {
  const cards = useVC.getState().cards
  if (replaced) {
    // A new drawing is not a delete: every card whose arrow left with the old one stays. Deleting
    // them here was File ▸ New wiping the panel, with no undo and the loss saved at once. The
    // old drawing's undo is gone too, so no departed card can come back and nothing of the old
    // Draw on graph is left to lay out.
    departed.clear()
    forgetDrawn()
    const out = cards.map((c) => (c.sceneId && prev[c.sceneId] && !next[c.sceneId] ? carryOver(c) : c))
    if (out.some((c, i) => c !== cards[i])) useVC.setState({ cards: out })
    // The sync (run next by the caller) draws every card that has no arrow now.
    return
  }
  let out = cards
  const gone = cards.filter((c) => c.sceneId && prev[c.sceneId] && !next[c.sceneId])
  if (gone.length) {
    for (const c of gone) departed.set(c.sceneId, { card: c, index: cards.indexOf(c) })
    out = cards.filter((c) => !gone.includes(c))
  }
  const back = [...departed.entries()].filter(([id]) => next[id] && !prev[id] && !out.some((c) => c.sceneId === id)).sort((a, b) => a[1].index - b[1].index)
  for (const [id, { card, index }] of back) {
    out = [...out.slice(0, index), card, ...out.slice(index)]
    departed.delete(id)
  }
  if (out !== cards) useVC.setState({ cards: out })
}

useScene.subscribe((s, prev) => {
  if (busy || relaying) return
  if (s.objects !== prev.objects) followDrawing(prev.objects, s.objects, sceneReplaced(s, prev))
  // The answer went (deleted, or undone) while its parents were hidden: they come back, or they
  // would stay hidden with nothing on screen to say why.
  if (s.objects !== prev.objects && answerOnGraph(prev.objects) && !answerOnGraph(s.objects) && !s.gesture) showParents()
  // A copy that stood in for a card arrow went: the student's own arrow shows again.
  if (s.objects !== prev.objects && drawn.hidden.size && !s.gesture) showOriginals(prev.objects, s.objects)
  if (s.objects !== prev.objects || s.ev !== prev.ev) syncCards()
})

useVC.subscribe((s, prev) => {
  if (s.cards !== prev.cards) syncCards()
})

/**
 * Removes a card and its arrow together, as one undo step of the drawing: the arrow is deleted
 * and the card follows it, so Ctrl+Z brings both back. A card with no arrow simply goes.
 */
export function removeCard(cardId: number): void {
  const c = useVC.getState().cards.find((x) => x.id === cardId)
  if (!c) return
  const sc = useScene.getState()
  if (c.sceneId && sc.objects[c.sceneId]) sc.removeObjects([c.sceneId])
  const cards = useVC.getState().cards
  if (cards.some((x) => x.id === cardId)) useVC.setState({ cards: cards.filter((x) => x.id !== cardId) })
}

/**
 * Renames a card and its arrow together. The drawing decides whether the name is free (a point
 * may already be called F); its sentence comes back when it is not, and the card keeps its name.
 */
export function renameCard(cardId: number, typed: string): string | null {
  const st = useVC.getState()
  const c = st.cards.find((x) => x.id === cardId)
  if (!c) return null
  const name = VS.safeCardName(typed, c.name, st.cards.filter((x) => x.id !== cardId).map((x) => x.name))
  if (name === c.name) return null
  const sc = useScene.getState()
  if (c.sceneId && sc.objects[c.sceneId]) {
    const problem = sc.renameObject(c.sceneId, name)
    if (problem) return problem
  }
  useVC.setState({ cards: useVC.getState().cards.map((x) => (x.id === cardId ? { ...x, name } : x)) })
  return null
}

/**
 * Points a graph card at another arrow. An arrow the card drew itself is taken away, or it would
 * stay on the drawing with no card; one the student drew is theirs and stays.
 */
export function pickArrow(cardId: number, sceneId: ObjId): void {
  const c = useVC.getState().cards.find((x) => x.id === cardId)
  if (!c || c.sceneId === sceneId) return
  const old = c.own ? c.sceneId : ''
  useVC.setState({ cards: useVC.getState().cards.map((x) => (x.id === cardId ? { ...x, sceneId, own: false, last: undefined } : x)) })
  const sc = useScene.getState()
  if (old && sc.objects[old]) sc.removeObjects([old])
}

/**
 * Switches how a card is entered without changing its vector: the new fields are filled from
 * what the card last showed, so a graph card switched to "typed" keeps its arrow where it was.
 */
export function setEntry(cardId: number, entry: Entry): void {
  useVC.setState({
    cards: useVC.getState().cards.map((c) => {
      if (c.id !== cardId || c.entry === entry) return c
      const v = c.last
      if (!v) return { ...c, entry }
      if (entry === 'comp') return { ...c, entry, latex: ijkLatex(v) }
      if (entry === 'polar') return { ...c, entry, mag: fieldNumber(len(v)), angle: fieldNumber(toDeg(heading(v))) }
      return { ...c, entry }
    })
  })
}

// ---------------------------------------------------------------------------
// Draw on graph: the answer drawn with the cards' own arrows (Fix 2)
// ---------------------------------------------------------------------------
//
// The scene bridge (core/visualize) draws a fresh copy of every input, so Draw on graph after
// Add all put A1 on top of A and B1 beside B, in other colours, and the answer was left selected
// — a 2.4 px arrow inside the 4.6 px selection band, which is what read as "R is too thick". The
// Vector Calculator's inputs are already on the drawing as the cards' arrows, so it lays those
// out (math/vec.ts layoutVectors) and adds only what is new: the answer, a helper such as −B, and
// a parallelogram's far sides.

/** What the last Draw on graph put on the graph, so it can be laid out again, taken away or shown alone. */
const drawn = {
  /** What it added: the answer, a helper such as −B, a stand-in's note and a parallelogram's far sides. */
  added: [] as ObjId[],
  /** The card arrows it moved, with the tails the student had them at. */
  moved: new Map<ObjId, V3>(),
  /** Everything drawn but the answer, which "Resultant only" hides together. */
  parents: [] as ObjId[],
  results: [] as ObjId[],
  /** The arrow standing for each arrow of the layout, in the layout's order, and its note if any. */
  slots: [] as ObjId[],
  notes: [] as (ObjId | undefined)[],
  /** The card arrow each input slot was drawn for (the slot itself, or a copy standing in for it). */
  sources: [] as (ObjId | undefined)[],
  /**
   * Card arrows hidden because a copy stands where the layout puts them, each with its copy: the
   * student saw two arrows both reading A, one of them apart from the picture.
   */
  hidden: new Map<ObjId, ObjId>(),
  /** The card arrows the answer was worked out from, with the components they had then. */
  inputs: new Map<ObjId, V3>(),
  sol: null as VS.Solution | null,
  style: null as DrawStyle | null,
  from: undefined as Recipe | undefined
}

/**
 * Whether an object is something Draw on graph added: the cards leave those out. `drawn` lasts only
 * this session, so an answer is also known by the resultant's token, which only drawAnswer sets on
 * an arrow: after a reopen, selecting the saved R made it a card and the next Add all counted it
 * twice. The command bar's own R = A + B has no token (only its old gold colour) and still gets one.
 */
export const isCalcAnswer = (id: ObjId): boolean => drawn.added.includes(id) || useScene.getState().objects[id]?.themed === RESULT_TOKEN

/** Components equal to the last bits a drag or a sum leaves. */
const near = (a: V3, b: V3): boolean => a.every((x, k) => Math.abs(x - b[k]) <= 1e-9 * Math.max(1, Math.abs(x)))

/** An arrow's components now, if it is still on the drawing. */
function compOf(id: ObjId): V3 | undefined {
  const c = useScene.getState().ev.values.get(id)
  return c?.type === 'vector' ? c.comp : undefined
}

/**
 * Moves a free arrow's tail, keeping its components; other kinds of arrow cannot be moved this way.
 * `record` false is for a picture laid out again after a change that is already an undo step.
 */
function moveTail(id: ObjId, tail: V3, record = true): boolean {
  const o = useScene.getState().objects[id]
  if (o?.type !== 'vector' || o.def.kind !== 'free') return false
  if (near(o.def.tail, tail)) return true
  useScene.getState().updateObject(
    id,
    (d) => {
      if (d.type === 'vector' && d.def.kind === 'free') d.def = { kind: 'free', tail, comp: d.def.comp }
    },
    record
  )
  return true
}

/** Puts an arrow Draw on graph added at a new tail and components, without an undo step. */
function setArrow(id: ObjId, tail: V3, comp: V3): void {
  const o = useScene.getState().objects[id]
  if (o?.type !== 'vector' || (o.def.kind === 'free' && near(o.def.tail, tail) && near(o.def.comp, comp))) return
  useScene.getState().updateObject(
    id,
    (d) => {
      if (d.type === 'vector') d.def = { kind: 'free', tail, comp }
    },
    false
  )
}

/**
 * The card arrow that is an input of the answer: the arrow of the card the answer names, else the
 * first one not yet used whose vector it is. By value alone, A = B = 3i + 4j and "B" drawn bound
 * A's arrow, and retyping B then left the picture at the old value with no word why.
 */
function cardArrowFor(v: V3, used: Set<ObjId>, name: string): ObjId | undefined {
  const sc = useScene.getState()
  const fits = (c: Card) => {
    if (!c.sceneId || used.has(c.sceneId) || !sc.objects[c.sceneId]) return false
    const got = sc.ev.values.get(c.sceneId)
    return got?.type === 'vector' && near(got.comp, v)
  }
  const cards = useVC.getState().cards
  return (cards.find((c) => c.name === name && fits(c)) ?? cards.find(fits))?.sceneId
}

/** What layoutVectors is given for a solution's picture: a stand-in length where there is one. */
const layoutInput = (vis: NonNullable<VS.Solution['visual']>) => vis.vectors.map((x) => ({ name: x.name, v: x.drawn ?? x.v, role: x.role, tail: x.tail }))

/**
 * A copy of a card arrow that cannot be moved to where the layout puts it, standing there in its
 * colour. Its own name is A′ (A is taken by the original); it reads A, the vector it is. It is
 * auxiliary like the other things Draw on graph adds: a waiting graph card was offered it, and the
 * next Draw on graph took it away with that card's arrow.
 */
function copyArrow(b: Builder, of: ObjId, a: { name: string; tail: V3; comp: V3 }, standIn: boolean): VectorObj {
  const o = b.vector(
    { kind: 'free', tail: a.tail, comp: a.comp },
    { name: VS.sceneName(a.name), color: useScene.getState().objects[of]?.color, auxiliary: true, showLabel: true }
  )
  o.label = VS.sceneLabel(a.name) ?? a.name
  if (standIn) o.labelMode = 'name'
  return o
}

/**
 * Draws an answer with the cards' own arrows. `style` is the student's choice of picture, or
 * null for the answer's own. One undo step takes the drawing away (with a second for clearing
 * the drawing before it, when there was one).
 */
export function drawAnswer(sol: VS.Solution, style: DrawStyle | null): void {
  const vis = sol.visual
  if (!vis) return
  relaying = true
  try {
    // The previous drawing goes first; the arrows it moved go back to where the student had them.
    const stale = drawn.added.filter((id) => useScene.getState().objects[id])
    if (stale.length) useScene.getState().removeObjects(stale)
    useScene.getState().beginGesture()
    try {
      for (const id of drawn.parents) setVisible(id, true)
      for (const id of drawn.hidden.keys()) setVisible(id, true)
      drawn.hidden.clear()
      for (const [id, tail] of drawn.moved) moveTail(id, tail)
      drawn.moved.clear()

      const lay = layoutVectors(layoutInput(vis), style ?? vis.mode ?? 'common-tail')
      const b = new Builder()
      const used = new Set<ObjId>()
      const idOf = new Map<string, ObjId>()
      const parents: ObjId[] = []
      const results: ObjId[] = []
      const slots: ObjId[] = []
      const notes: (ObjId | undefined)[] = []
      const sources: (ObjId | undefined)[] = []
      const hidden = new Map<ObjId, ObjId>()
      const inputs = new Map<ObjId, V3>()
      const faint = (o: SceneObject) => {
        o.themed = '--text-faint'
        o.auxiliary = true
        o.showLabel = false
      }
      lay.arrows.forEach((a, i) => {
        const src = vis.vectors[i]
        const standIn = !!src.drawn && !near(src.drawn, src.v)
        /** A card arrow that cannot be moved to where the layout puts it, drawn again there instead. */
        let copyOf: ObjId | undefined
        if (a.role === 'input') {
          const id = cardArrowFor(src.v, used, src.name)
          if (id) {
            used.add(id)
            // Watched either way: a change to it lays the picture out again.
            inputs.set(id, compOf(id) ?? src.v)
            const was = useScene.getState().ev.values.get(id)
            const tail = was?.type === 'vector' ? was.tail : ZERO
            if (near(tail, a.tail) || moveTail(id, a.tail)) {
              if (!near(tail, a.tail)) drawn.moved.set(id, tail)
              parents.push(id)
              idOf.set(a.name, id)
              slots.push(id)
              sources.push(id)
              notes.push(undefined)
              return
            }
            // An arrow drawn between two points (or from a formula) moves only with what it hangs
            // on. It used to stay where it was while B and R were laid out as if it had moved: a
            // head-to-tail figure broken apart with no word why. A copy in its colour, under its
            // name, stands where the layout puts it, and the original is hidden while it does:
            // left showing, two arrows both read A. It comes back with the picture's going.
            copyOf = id
            setVisible(id, false)
          }
        }
        // A helper such as −B takes the colour of the arrow it is the negative of.
        const of = a.role === 'helper' ? vis.vectors.findIndex((x) => x.role === 'input' && near(neg(x.v), src.v)) : -1
        const ofId = of >= 0 ? idOf.get(vis.vectors[of].name) : undefined
        const color = a.role === 'result' ? RESULT_COLOUR : ofId ? useScene.getState().objects[ofId]?.color : undefined
        const o = copyOf
          ? copyArrow(b, copyOf, a, standIn)
          : b.vector({ kind: 'free', tail: a.tail, comp: a.comp }, { name: VS.sceneName(a.name), color, auxiliary: a.role === 'helper' || standIn })
        if (copyOf) hidden.set(copyOf, o.id)
        const label = VS.sceneLabel(a.name)
        if (label && !copyOf) o.label = label
        if (a.role === 'result') o.themed = RESULT_TOKEN
        if (standIn) o.labelMode = 'name'
        idOf.set(a.name, o.id)
        slots.push(o.id)
        sources.push(copyOf)
        if (a.role === 'result' && !standIn) results.push(o.id)
        else parents.push(o.id)
        const note = standIn && src.note ? b.text(add(a.tail, a.comp), src.note, { name: `${o.name}note`, auxiliary: true }).id : undefined
        notes.push(note)
        if (note) parents.push(note)
      })
      // A parallelogram's far sides: construction lines from each side's head to the answer's head,
      // tied to the heads so they follow a drag.
      const answer = results[0]
      if (answer && lay.sides.length) {
        // Named, so the hidden points do not take the capitals the next card would be offered.
        const head = (id: ObjId) => b.point({ kind: 'vectorHead', vector: id }, { name: 'head', auxiliary: true, visible: false, showLabel: false }).id
        const r = head(answer)
        for (const name of lay.sides) {
          const id = idOf.get(name)
          if (!id) continue
          const s = b.segment(head(id), r, { auxiliary: true, showLabel: false })
          faint(s)
          parents.push(s.id)
        }
      }
      b.commit(false)
      const shown = useVC.getState().result
      Object.assign(drawn, {
        added: b.created.map((o) => o.id),
        parents,
        results,
        slots,
        notes,
        sources,
        hidden,
        inputs,
        sol,
        style,
        // Only the answer the panel shows has a recipe: a picture of anything else is not worked out again.
        from: shown?.sol === sol ? shown.from : undefined
      })
      if (shown?.sol === sol && shown.stale) useVC.setState({ result: { ...shown, stale: false } })
      if (vis.vectors.some((x) => Math.abs((x.drawn ?? x.v)[2]) > 1e-9)) useScene.getState().setViewMode('3d')
    } finally {
      useScene.getState().endGesture()
    }
  } finally {
    relaying = false
  }
  // Nothing is left selected: a selected answer wears the selection band and looks heavier than
  // its parents.
  useScene.getState().select([])
  fitCamera()
}

/**
 * Keeps a drawn answer true to its vectors. It reuses the cards' own arrows, so retyping or dragging
 * A used to leave R at the old sum and B's tail at A's old head: R ≠ A + B on the graph beside a
 * card saying R = A + B. When an input's components change, the answer is worked out again from
 * its recipe and laid out in place, with no undo step of its own (the change that caused it is
 * the step, and undoing it brings the old picture back with the old vectors). When it cannot be
 * worked out again — an input went, or cannot be read — the picture is taken away and the answer
 * card says why.
 */
function followAnswer(): void {
  if (relaying || !drawn.results.length) return
  const sc = useScene.getState()
  if (!answerOnGraph(sc.objects)) return
  const shown = useVC.getState().result
  // An undo brought a picture back that had been taken away.
  if (shown?.stale && shown.sol === drawn.sol) useVC.setState({ result: { ...shown, stale: false } })
  const changed = [...drawn.inputs].some(([id, v]) => {
    const c = compOf(id)
    return !c || !near(c, v)
  })
  if (!changed) return
  relaying = true
  try {
    if (!layOutAgain()) retireAnswer()
  } finally {
    relaying = false
  }
}

/** Works the drawn answer out again and moves its arrows to match; false when it cannot. */
function layOutAgain(): boolean {
  const from = drawn.from
  if (!from) return false
  const sc = useScene.getState()
  const cards = useVC.getState().cards
  const sol = solveAgain(from, cards, cardValues(cards, sc.ev), sc.settings)
  const vis = sol?.visual
  // Every arrow must still be there; a copy may be missing (an undo took it), its card arrow not.
  if (!sol || !vis || vis.vectors.length !== drawn.slots.length || drawn.slots.some((id, i) => !sc.objects[drawn.sources[i] ?? id])) return false
  const lay = layoutVectors(layoutInput(vis), drawn.style ?? vis.mode ?? 'common-tail')
  lay.arrows.forEach((a, i) => {
    const src = drawn.sources[i]
    if (src) placeInput(i, src, a, !!vis.vectors[i].drawn && !near(vis.vectors[i].drawn!, vis.vectors[i].v))
    else setArrow(drawn.slots[i], a.tail, a.comp)
    const note = drawn.notes[i]
    const o = note ? useScene.getState().objects[note] : undefined
    const text = vis.vectors[i].note ?? ''
    const p = add(a.tail, a.comp)
    if (o?.type === 'text' && (!near(o.p, p) || o.text !== text)) {
      useScene.getState().updateObject(
        o.id,
        (d) => {
          if (d.type === 'text') Object.assign(d, { p, text })
        },
        false
      )
    }
  })
  drawn.inputs = new Map([...drawn.inputs.keys()].map((id) => [id, compOf(id) ?? ZERO]))
  const shown = useVC.getState().result
  if (shown && shown.sol === drawn.sol) useVC.setState({ result: { ...shown, sol, stale: false } })
  drawn.sol = sol
  return true
}

/**
 * Lays one card arrow of a drawn answer out again. It moves to where the layout puts it when it
 * can; when it cannot — an arrow between two points whose tail was dragged off the start — a copy
 * stands there instead and the original is hidden, as the first Draw on graph does. This ignored
 * the failed move before, and B and R were laid out as if A had moved: #18's broken head-to-tail
 * figure, reached through an edit instead of the first draw.
 */
function placeInput(i: number, src: ObjId, a: { name: string; tail: V3; comp: V3 }, standIn: boolean): void {
  const objects = () => useScene.getState().objects
  let slot = drawn.slots[i]
  // Its copy went with an undo, which also put the card arrow back as it was: that arrow again.
  if (slot !== src && !objects()[slot]) {
    retarget(slot, src)
    slot = src
  }
  if (slot === src) {
    const was = useScene.getState().ev.values.get(src)
    const tail = was?.type === 'vector' ? was.tail : ZERO
    if (near(tail, a.tail)) return
    const moved = drawn.moved.has(src)
    if (moveTail(src, a.tail, false)) {
      if (!moved) drawn.moved.set(src, tail)
      return
    }
    // A redo brought its copy back: that copy again, not a second one.
    const back = drawn.hidden.get(src)
    if (back && objects()[back]) slot = back
    else {
      const b = new Builder()
      const copy = copyArrow(b, src, a, standIn)
      copy.visible = !resultOnlyOn(objects())
      useScene.getState().addObjects(b.created, { record: false })
      drawn.added.push(copy.id)
      drawn.hidden.set(src, copy.id)
      slot = copy.id
    }
    setVisible(src, false, false)
    retarget(src, slot)
  }
  setArrow(slot, a.tail, a.comp)
}

/** Hands a slot of the drawn answer from one arrow to another, with the construction points on its head. */
function retarget(from: ObjId, to: ObjId): void {
  const swap = (ids: ObjId[]) => ids.map((id) => (id === from ? to : id))
  drawn.slots = swap(drawn.slots)
  drawn.parents = swap(drawn.parents)
  for (const id of drawn.added) {
    const o = useScene.getState().objects[id]
    if (o?.type === 'point' && o.def.kind === 'vectorHead' && o.def.vector === from) {
      useScene.getState().updateObject(
        id,
        (d) => {
          if (d.type === 'point' && d.def.kind === 'vectorHead') d.def = { ...d.def, vector: to }
        },
        false
      )
    }
  }
}

/** Takes a drawn answer off the graph when its vectors no longer give it, and puts the arrows back. */
function retireAnswer(): void {
  const sc = useScene.getState()
  const gone = drawn.added.filter((id) => sc.objects[id])
  if (gone.length) sc.removeObjects(gone, { record: false })
  for (const [id, tail] of drawn.moved) moveTail(id, tail, false)
  for (const id of drawn.hidden.keys()) setVisible(id, true, false)
  drawn.hidden.clear()
  showParents()
  const shown = useVC.getState().result
  if (shown && shown.sol === drawn.sol) useVC.setState({ result: { ...shown, stale: true } })
}

function setVisible(id: ObjId, visible: boolean, record = true): void {
  const o = useScene.getState().objects[id]
  if (o && o.visible !== visible) useScene.getState().updateObject(id, (d) => void (d.visible = visible), record)
}

/**
 * Shows each card arrow whose stand-in copy has just left the drawing (deleted by hand, say) while
 * it was still hidden. An undo that takes the copy puts the arrow back as it was by itself, and
 * the pair is kept so a redo finds its copy again; a copy long gone never shows an arrow the
 * student has since hidden.
 */
function showOriginals(prev: Record<ObjId, SceneObject>, objects: Record<ObjId, SceneObject>): void {
  for (const [id, copy] of drawn.hidden) {
    if (!prev[copy] || objects[copy] || !objects[id] || objects[id].visible) continue
    drawn.hidden.delete(id)
    setVisible(id, true, false)
  }
}

/** Whether the drawn answer is still on the drawing, so "Resultant only" has something to show. */
export const answerOnGraph = (objects: Record<ObjId, SceneObject>): boolean => drawn.results.some((id) => objects[id])

/**
 * Shows only the answer, hiding every arrow it was worked from together, or shows them all
 * again — one undo step either way. Arrows could only be hidden one at a time before, by each
 * one's eye button in the Outliner.
 */
export function setResultOnly(on: boolean): void {
  const sc = useScene.getState()
  if (on && !answerOnGraph(sc.objects)) return
  // Nothing to change is no undo step: an empty one would make the next Ctrl+Z seem to do nothing.
  if (!drawn.parents.some((id) => sc.objects[id] && sc.objects[id].visible === on)) return
  sc.beginGesture()
  try {
    for (const id of drawn.parents) setVisible(id, !on)
  } finally {
    useScene.getState().endGesture()
  }
}

/**
 * Whether "Resultant only" is on, read from the drawing: the answer is on the graph and every
 * arrow it was drawn with is hidden. It was a flag of the panel's own, so an undo, a redo or an
 * eye button in the Outliner left the button pressed over parents that were showing, and the
 * next click only turned the flag off.
 */
export function resultOnlyOn(objects: Record<ObjId, SceneObject>): boolean {
  if (!answerOnGraph(objects)) return false
  const there = drawn.parents.filter((id) => objects[id])
  return there.length > 0 && there.every((id) => !objects[id].visible)
}

/** Shows the parents again without an undo step of its own: the answer they belonged to is gone. */
function showParents(): void {
  for (const id of drawn.parents) {
    const o = useScene.getState().objects[id]
    if (o && !o.visible) useScene.getState().updateObject(id, (d) => void (d.visible = true), false)
  }
}
