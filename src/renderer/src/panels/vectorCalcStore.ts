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
import { inDegrees, toV3 } from '../math/expr'
import { texMeasure, texPrecise, texSci } from '../math/format'
import { ZERO, add, heading, layoutVectors, len, neg, toDeg, type V3 } from '../math/vec'
import * as VS from '../math/vectorSolver'
import { cardValues, cardWalk, DIVIDED_BY_ZERO, evalNumber, evaluateVectorLine, explainVectorError, flatName, namesIn, NOTHING_PICKED, PlainError, putInScope, UNIT_VECTORS } from './vectorLine'
import { texVector } from './cardLine'
export { ALL_ARROWS_TAKEN, cardValue, cardValues, droppedUnits, droppedUnitsSentence, evalNumber, evaluateVectorLine, explainVectorError, graphCardPrompt, namesIn, NO_ARROWS, NOTHING_PICKED, PlainError, unknownNames, unknownNameSentence } from './vectorLine'
export { cardLineTex, MIN_ZOOM_2D, nextStepHint, tooBigToDraw } from './cardLine'

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
  /**
   * A size ∠ angle card's boxes are filled at the student's precision (5.66 ∠ 45° for 4i + 4j), so
   * the card also keeps the vector they were filled from, with the two texts it wrote. While both
   * boxes still read as written the card's value is that vector, not what the rounded texts say;
   * editing either box makes what is typed rule again (V6).
   */
  exact?: { v: V3; mag: string; angle: string }
  /**
   * 3D-1: a typed card entered as three boxes, x, y and z (the 3-D view's "x, y, z" switch). The boxes' own texts; the card's
   * line is their tuple (panels/vectorParts.ts partsLatex), so the vector is read as any typed line is.
   */
  parts?: [string, string, string]
}

/**
 * A number for a maths field at twelve significant digits and in no programming notation: String
 * writes 10²¹ as "1e+21" and 1.6×10⁻¹⁹ as "1.6e-19", which a field would show as typed (H8).
 */
export const exactNumber = (x: number): string => {
  // eslint-disable-next-line no-restricted-syntax -- not the student's precision: a card's own field text, at 12 figures so it reads back as the same vector (H8); math/format.ts has no writer for a field
  const text = String(Number(x.toPrecision(12)))
  const sci = /^(-?[\d.]+)e([+-]\d+)$/.exec(text)
  return sci ? `${sci[1]}\\times 10^{${Number(sci[2])}}` : text
}

/**
 * A vector written the way a card is typed, so nothing is lost in the copy. Twelve significant
 * digits keep any coordinate a student can draw or type exact while dropping the last-bit error
 * a drag leaves behind: a vector drawn to (2.875, 1.275) is stored as 2.875000000000001, and a
 * demoted card used to hand that string to the student's own field.
 *
 * What is noise depends on where the vector came from. One read off the drawing (the default) can
 * carry a drag's 10⁻¹⁶, so anything under 10⁻¹² is dropped, and a vector wholly under that is 0. A
 * vector a card holds (`held`) was typed or worked out: only a component under 10⁻¹² of its own
 * size is noise (the 3.06×10⁻¹⁶ that 5∠90° leaves beside its 5), so 1.6×10⁻¹⁹ î is kept (H8).
 */
export const ijkLatex = (v: V3, held = false): string => {
  const big = Math.max(...v.map(Math.abs))
  // eslint-disable-next-line no-restricted-syntax -- drawn: a drag's noise, 10⁻¹² of a grid square or of the vector's own size once it is longer; held: 10⁻¹² of its own size; the panel's rule, its number CW9's (P-CW2-REPORT class 1)
  const floor = 1e-12 * (held ? big : Math.max(1, big))
  return (
    v
      .map((c, i) => (c === 0 || Math.abs(c) < floor ? '' : `${c < 0 ? '-' : '+'}${exactNumber(Math.abs(c))}\\hat{${'ijk'[i]}}`))
      .join('')
      .replace(/^\+/, '') || '0'
  )
}

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
type SelectionMatch =
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
interface Recipe {
  cards: { id: number; name: string }[]
  /** The same working, from those cards' values now (named as they were then). */
  solve: (vs: VS.NamedVec[], settings: SceneSettings) => VS.Solution | null
  /**
   * The box the working also reads, k for Scalar × and q for Magnetic force. `solve` takes the
   * number from that box each time it works the answer out, and the answer is followed when the box
   * is retyped, as it is when a card is (H9); so is its picture left on the graph once another
   * answer is shown (G4a).
   */
  scalar?: 'k' | 'q'
}

/**
 * Why an answer no longer follows from the cards: a card it was worked out from was removed, cannot
 * be read for now (half typed), or every card can be read but the working fails on them (A/(A·B)
 * with A ⟂ B). One sentence for all three told a student whose cards were all there and readable
 * that a vector had been removed.
 */
type StaleReason = 'removed' | 'unreadable' | 'unworkable'

interface Answer {
  sol: VS.Solution
  label: string
  from?: Recipe
  /** The cards no longer give it (see `staleWhy`). */
  stale?: boolean
  staleWhy?: StaleReason
  /** For 'unreadable' when every vector reads but the k or q box does not: which box. */
  staleBox?: 'k' | 'q'
  /**
   * Its picture was on the graph and was taken off when a card it was worked out from was removed.
   * The card said "its picture was taken off the graph" of every stale answer, drawn or not.
   */
  pictureTakenOff?: boolean
}

interface VCState {
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
// Working an answer out (the panel's buttons, and again when a drawn answer's vectors change)
// ---------------------------------------------------------------------------

/**
 * One vector operation: its button's name, how many cards from the top it reads ('all' takes every
 * card), the box (k or q) it also reads, the maths and the help its button shows, and how its answer
 * is worked out from the vectors it reads, in order. The Vector Calculator's buttons, the Vector
 * Solver and the Calculator's VECTOR screen all work an operation out from this one table, so the
 * names a student sees, the ones an error sentence uses and the answers cannot differ (CW16).
 */
export interface VectorOperation {
  label: string
  need: number | 'all'
  field?: 'k' | 'q'
  tex: string
  help: string
  /** Throws a PlainError or a parser error. `k` and `q` are the boxes' numbers, where the operation reads one. */
  solve: (vs: VS.NamedVec[], settings: SceneSettings, k?: number, q?: number) => VS.Solution
}

export const OPERATIONS: Record<string, VectorOperation> = {
  sum: { label: 'Add all', need: 'all', tex: '\\vec{A}+\\vec{B}+\\dots', help: 'Resultant by rectangular components', solve: (vs, s) => VS.solveAddition(vs, 'R', s) },
  sub: { label: 'Subtract', need: 2, tex: '\\vec{A}-\\vec{B}', help: 'A + (−B)', solve: ([A, B], s) => VS.solveSubtraction(A, B, 'R', s) },
  dot: { label: 'Dot', need: 2, tex: '\\vec{A}\\cdot\\vec{B}', help: 'Scalar product and angle between', solve: ([A, B], s) => VS.solveDot(A, B, s) },
  cross: { label: 'Cross', need: 2, tex: '\\vec{A}\\times\\vec{B}', help: 'Vector product and parallelogram area', solve: ([A, B], s) => VS.solveCross(A, B, 'C', s) },
  mag: { label: 'Size & angle', need: 1, tex: '|\\vec{A}|,\\ \\theta', help: 'Magnitude and direction', solve: ([A], s) => VS.solveMagnitudeDirection(A, s) },
  resolve: { label: 'Components', need: 1, tex: 'A_x,\\ A_y', help: 'Aₓ = A cos θ, A_y = A sin θ', solve: ([A], s) => VS.solveResolve(A, s) },
  scale: { label: 'Scalar ×', need: 1, field: 'k', tex: 'k\\vec{A}', help: 'Multiply by k', solve: ([A], s, k = 0) => VS.solveScalarMultiply(k, A, 'R', s) },
  unit: { label: 'Unit vector', need: 1, tex: '\\hat{A}', help: 'Direction with length 1', solve: ([A], s) => VS.solveUnitVector(A, s) },
  angle: { label: 'Angle between', need: 2, tex: '\\theta_{AB}', help: 'cos θ = A·B / AB', solve: ([A, B], s) => VS.solveAngleBetween(A, B, s) },
  proj: { label: 'Projection', need: 2, tex: '\\mathrm{proj}_{A}\\vec{B}', help: 'Shadow of B on A', solve: ([A, B], s) => VS.solveProjection(B, A, s) },
  equil: { label: 'Equilibrium', need: 'all', tex: '\\vec{E}=-\\sum\\vec{F}', help: 'Force that balances all', solve: (vs, s) => VS.solveEquilibrium(vs, s) },
  torque: { label: 'Torque', need: 2, tex: '\\vec{\\tau}=\\vec{r}\\times\\vec{F}', help: 'First card = r, second = F', solve: ([A, B], s) => VS.solveTorque(A.v, B.v, s) },
  work: { label: 'Work', need: 2, tex: 'W=\\vec{F}\\cdot\\vec{d}', help: 'First card = F, second = d', solve: ([A, B], s) => VS.solveWork(A.v, B.v, s) },
  lorentz: {
    label: 'Magnetic force',
    need: 2,
    field: 'q',
    tex: 'q(\\vec{v}\\times\\vec{B})',
    help: 'First card = v, second = B, charge q',
    solve: ([A, B], s, _k, q = 0) => VS.solveMagneticForce(q, A.v, B.v, s)
  },
  relvel: { label: 'Relative velocity', need: 2, tex: '\\vec{v}_{AB}=\\vec{v}_A-\\vec{v}_B', help: 'Velocity of A as seen from B', solve: ([A, B], s) => VS.solveRelativeVelocity(A, B, s) }
}

/** An operation's answer from the vectors it reads, in order; null for a name that is not one. Throws a PlainError or a parser error. */
export function solveOperation(op: string, vs: VS.NamedVec[], settings: SceneSettings, k = 0, q = 0): VS.Solution | null {
  return Object.hasOwn(OPERATIONS, op) ? OPERATIONS[op].solve(vs, settings, k, q) : null
}

/** An answer worked out again from its recipe and the cards as they are now; null when it cannot be. */
function solveAgain(from: Recipe, cards: Card[], values: (V3 | string)[], settings: SceneSettings): VS.Solution | null {
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

/**
 * What the panel's operation buttons do: works the operation out from the cards it reads, in order
 * from the top, and shows its answer; returns the sentence to tell the student when it cannot, else
 * null. "First card = r, second = F" has to mean the cards the student can see, so a card that
 * cannot be read stops the operation rather than being skipped (the third card would become F).
 *
 * The answer's recipe takes k or q from its box every time it works the answer out again, and the
 * store follows those boxes as it follows the cards (keepAnswerTrue): retyping k moves R = kA (H9).
 */
export function runOperation(opId: string): string | null {
  const rule = OPERATIONS[opId]
  if (!rule) return null
  const st = useVC.getState()
  const sc = useScene.getState()
  const values = cardValues(st.cards, sc.ev)
  const wanted = rule.need === 'all' ? st.cards : st.cards.slice(0, rule.need)
  if (rule.need !== 'all' && wanted.length < rule.need) return `${rule.label} needs ${rule.need} vectors. Add another card.`
  if (rule.need === 'all' && wanted.length < 1) return 'Add a vector first.'
  const named: VS.NamedVec[] = []
  for (const c of wanted) {
    const v = values[st.cards.indexOf(c)]
    if (typeof v === 'string') return `Card ${c.name} cannot be read: ${v}`
    named.push({ name: c.name, v })
  }
  try {
    const solve = (vs: VS.NamedVec[], now: SceneSettings): VS.Solution | null => {
      const boxes = useVC.getState()
      return solveOperation(opId, vs, now, rule.field === 'k' ? evalNumber(boxes.k) : 0, rule.field === 'q' ? evalNumber(boxes.q) : 0)
    }
    const sol = solve(named, sc.settings)
    if (!sol) return null
    useVC.setState({ result: { sol, label: rule.label, from: { cards: wanted.map((c) => ({ id: c.id, name: c.name })), solve, scalar: rule.field } } })
    return null
  } catch (e) {
    return explainVectorError(e)
  }
}

/**
 * A typed expression worked out from the cards' values, with the names of the cards it used.
 * Names are checked first: an unknown letter would otherwise be one of mathjs's units. A line that
 * works out to a number or a vector with a division by zero in it is refused, not answered "∞".
 */
export function exprSolution(expr: string, cards: { name: string; v: V3 | string }[], settings: SceneSettings): { sol: VS.Solution; used: string[] } {
  const scope: Record<string, unknown> = { ...UNIT_VECTORS }
  const names = cards.map((c) => c.name)
  cards.forEach((c) => {
    if (typeof c.v !== 'string') putInScope(scope, c.name, c.v, names)
  })
  const unreadable = cards.filter((c) => typeof c.v === 'string').map((c) => c.name)
  const { src, out } = inDegrees(() => evaluateVectorLine(expr, scope, [], unreadable))
  const named = namesIn(src)
  const inputs = cards.filter((x): x is { name: string; v: V3 } => typeof x.v !== 'string' && (named.includes(x.name) || named.includes(flatName(x.name))))
  const used = inputs.map((x) => x.name)
  if (typeof out === 'number') {
    // 1/0 answered ∞ and 0/0 "undefined" (H6).
    if (!Number.isFinite(out)) throw new PlainError(DIVIDED_BY_ZERO)
    // Both strings are KaTeX: the plain-text form's "×10^-5" put only the minus in the superscript.
    // What is left of the noise of its arithmetic is exactly 0 by now (evaluateVectorLine), so a number
    // under texMeasure's floor is a real one, 1.6×10⁻¹⁹ from A·B of two tiny cards, and written as itself.
    // eslint-disable-next-line no-restricted-syntax -- the number writer's own display floor (texMeasure), as the lines above say
    const shown = out !== 0 && Math.abs(out) < 1e-12 ? texSci(out, settings) : texMeasure(out, 'number', settings)
    return { used, sol: { title: 'Result', steps: [{ tex: `${expr} = ${shown}` }], answers: [{ label: 'value', tex: shown }] } }
  }
  const v = toV3(out)
  if (!v.every(Number.isFinite)) throw new PlainError(DIVIDED_BY_ZERO)
  const md = VS.solveMagnitudeDirection({ name: 'R', v }, settings)
  const shownV = texVector(v, settings)
  const sol: VS.Solution = {
    title: 'Resultant of the expression',
    steps: [{ text: 'Evaluate component by component:', tex: `\\vec{R} = ${expr} = ${shownV}` }, ...md.steps.slice(1)],
    answers: [{ label: 'R', tex: shownV }, ...md.answers],
    visual: { vectors: [...inputs.map((x) => ({ name: x.name, v: x.v, role: 'input' as const })), { name: 'R', v, role: 'result' as const }], mode: 'common-tail' }
  }
  return { sol, used }
}

/** The line under an answer: where to look next (only an answer with a picture can be drawn). */
export const answerHint = (drawable: boolean): string =>
  drawable ? 'Next: Draw on graph shows it on the graph, and Steps shows how it was worked out.' : 'Next: Steps shows how it was worked out.'

/**
 * Whether the answer card offers Draw on graph and its layouts. A stale answer is not drawn: it is
 * not the answer for the cards as they are, and drawing one put a second arrow A′ at A's old value
 * beside the card's own A.
 */
export const canDraw = (a: Answer): boolean => !!a.sol.visual && !a.stale

/**
 * What a stale answer card says, for its reason. The picture is only mentioned when one was taken
 * off the graph, and the button named is the one that works the answer out again (the expression
 * box's is =). A card that cannot be read for now needs no button: the answer comes back by itself.
 */
export function staleSentence(a: Answer): string {
  const button = a.label === 'Expression' ? '=' : a.label
  // Every vector reads and the box beside the button does not: say which box, not a vector.
  if (a.staleWhy === 'unreadable' && a.staleBox) return `The ${a.staleBox} box cannot be read now. Once it can, this answer is worked out again.`
  if (a.staleWhy === 'unreadable') return 'A vector this was worked out from cannot be read now. Once it can, this answer is worked out again.'
  if (a.staleWhy === 'unworkable') return `This answer cannot be worked out from the vectors as they are now. Press ${button} again to see why.`
  return `A vector this was worked out from was removed${a.pictureTakenOff ? ', so its picture was taken off the graph' : ''}. Press ${button} again for the answer from the vectors you have now.`
}

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

/**
 * Components equal to the last bits a drag or a sum leaves: within a part in 10⁹ of the two
 * vectors' own size. A drag's 2.875000000000001 for 2.875 is no change, while 1.6×10⁻¹⁹ î and
 * 3.2×10⁻¹⁹ î are two vectors — an absolute 10⁻⁹ called everything under it the same (H12).
 */
const near = (a: V3, b: V3): boolean => {
  const size = Math.max(...a.map(Math.abs), ...b.map(Math.abs))
  return a.every((x, k) => Math.abs(x - b[k]) <= 1e-9 * size)
}

const same = (a: V3, b?: V3): boolean => !!b && near(a, b)

/**
 * A number written for a size ∠ angle box at the student's precision, in LaTeX and never as 1e+21:
 * 5.66, 45, 8.89×10¹⁸ (V6, H8). Never a real number written as 0 either (the precision or the
 * noise floor would round 0.004 or 1.6×10⁻¹⁹ away): that one is written in scientific form.
 */
const fieldText = (x: number, s: SceneSettings): string => {
  const text = texPrecise(x, s)
  return x !== 0 && /^-?0$/.test(text) ? texSci(x, s) : text
}

/** A size ∠ angle card's boxes for a vector, with the vector itself kept for them (V6). */
function polarFields(v: V3, s: SceneSettings): Pick<Card, 'mag' | 'angle' | 'exact'> {
  const mag = fieldText(len(v), s)
  const angle = fieldText(toDeg(heading(v)), s)
  return { mag, angle, exact: { v: [v[0], v[1], v[2]], mag, angle } }
}

/** What reconciling the cards with the drawing asks for. */
interface SyncPlan {
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
 * name is the card's name; and a readable card with no arrow gets one, named after the card. A size ∠
 * angle card rewritten from a drag is written at the student's precision, `settings`.
 */
export function planSync(cards: Card[], objects: Record<ObjId, SceneObject>, ev: EvalResult, settings: SceneSettings = useScene.getState().settings): SyncPlan {
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
        patch(card.entry === 'polar' ? { ...polarFields(drawn, settings), last: drawn } : { latex: ijkLatex(drawn), last: drawn })
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
/**
 * Set while the sync follows a change that took the drawn picture off the graph on its own: a redo
 * of a card's removal takes the card's arrow and the picture keepAnswerTrue took away with it in
 * one step, so the picture is already gone when the answer is looked at, and was taken off all the same.
 */
let pictureWentWithIt = false

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
    const plan = planSync(cards, sc.objects, sc.ev, sc.settings)
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
const sceneReplaced = (s: { past: unknown[]; future: unknown[] }, prev: { past: unknown[] }): boolean => s.past !== prev.past && !s.past.length && !s.future.length

/**
 * A card carried into a new drawing: its arrow went with the old one, but the card is the
 * student's work and is not tied to any file. A typed or size-and-angle card keeps its text; a
 * graph card keeps the vector it last read as typed components. Either is drawn again on the new
 * drawing by the sync, as the cards are after a restart, and under the same id: opening the file
 * the cards were saved in then finds their arrows again instead of drawing a second A beside the
 * file's own and renaming the card A′ (which left B = 2A unreadable).
 */
function carryOver(c: Card): Card {
  return c.entry === 'scene' && c.last ? { ...c, entry: 'comp', latex: ijkLatex(c.last, true) } : c
}

/** Forgets what the last Draw on graph put on a drawing that is no longer there. */
function forgetDrawn(): void {
  Object.assign(drawn, { added: [], parents: [], results: [], slots: [], notes: [], sources: [], hidden: new Map(), inputs: new Map(), comps: new Map(), sol: null, style: null, from: undefined, waiting: false, resultOnly: false, depth: 0 })
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

/**
 * Which layout style each state of the drawing showed its drawn answer in. The style is the panel's
 * (the chip lit, and the layout the next retype lays the picture out in again), so it sits outside
 * the drawing's undo history: undoing a layout chip put the old layout back under the chip that was
 * undone, and the next retype put the undone layout back. Keyed on the state itself, because an undo
 * or a redo hands back the very same `objects`, and nothing else the student does is a state seen
 * before.
 */
const styleAt = new WeakMap<object, DrawStyle | null>()

/**
 * The drawing went from one state to another. The state it leaves keeps the style it showed (a redo
 * comes back to it), and one seen before shows its own again, while an answer is on it.
 */
function followStyle(prev: Record<ObjId, SceneObject>, next: Record<ObjId, SceneObject>): void {
  styleAt.set(prev, drawn.style)
  if (!styleAt.has(next) || !answerOnGraph(next)) return
  const style = styleAt.get(next) ?? null
  if (style === drawn.style && style === useVC.getState().style) return
  drawn.style = style
  useVC.setState({ style })
}

useScene.subscribe((s, prev) => {
  if (busy || relaying) return
  // Set before anything follows the change: removing the card in followDrawing already works the
  // answer out again. A change this makes itself (showParents) is followed too, and hands it back.
  const outer = pictureWentWithIt
  pictureWentWithIt = s.objects !== prev.objects && pictureOnGraph(prev.objects) && !pictureOnGraph(s.objects)
  try {
    // First of all: the sync that follows lays a picture out in this style.
    if (s.objects !== prev.objects) followStyle(prev.objects, s.objects)
    if (s.objects !== prev.objects) followDrawing(prev.objects, s.objects, sceneReplaced(s, prev))
    // The answer went (deleted, or undone) while its parents were hidden: they come back, or they
    // would stay hidden with nothing on screen to say why.
    if (s.objects !== prev.objects && answerOnGraph(prev.objects) && !answerOnGraph(s.objects) && !s.gesture) showParents()
    // A copy that stood in for a card arrow went: the student's own arrow shows again.
    if (s.objects !== prev.objects && drawn.hidden.size && !s.gesture) showOriginals(prev.objects, s.objects)
    if (s.objects !== prev.objects || s.ev !== prev.ev) syncCards()
  } finally {
    pictureWentWithIt = outer
  }
})

useVC.subscribe((s, prev) => {
  // Noted as it arrives: the sync next sees it only after a card has changed, too late to tell
  // what the card held when the button was pressed.
  if (s.result !== prev.result) noteAnswer(s.result)
  if (s.cards !== prev.cards) syncCards()
  else if (drawing && !busy) {
    // The box the shown answer reads was retyped (k for Scalar ×, q for Magnetic force): the answer
    // and its picture follow it, as they follow a card, and wait while it cannot be read (H9). So does
    // an older picture still on the graph whose own working reads that box, though another answer is
    // shown now: it followed its cards only, and jumped to the new k at the next card edit (G4a).
    const retyped = (box?: 'k' | 'q') => !!box && s[box] !== prev[box]
    if (retyped(s.result?.from?.scalar) || retyped(drawn.from?.scalar)) followAnswer()
  }
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
 * what the card last showed, so a graph card switched to "typed" keeps its arrow where it was. The
 * size ∠ angle boxes are written at the student's precision and the card keeps the exact vector
 * (V6); the typed box is written as the vector itself, even one as small as 1.6×10⁻¹⁹ î (H8).
 */
export function setEntry(cardId: number, entry: Entry): void {
  const settings = useScene.getState().settings
  useVC.setState({
    cards: useVC.getState().cards.map((c) => {
      if (c.id !== cardId || c.entry === entry) return c
      const v = c.last
      if (!v) return { ...c, entry }
      if (entry === 'comp') return { ...c, entry, latex: ijkLatex(v, true) }
      if (entry === 'polar') return { ...c, entry, ...polarFields(v, settings) }
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
  /**
   * The card arrow a 2D Components picture shows the components of, with its own showComponents
   * before (undefined stays undefined): left on, every later picture showed A's components too,
   * and a student's own "Always show components" must outlast the picture.
   */
  comps: new Map<ObjId, boolean | undefined>(),
  sol: null as VS.Solution | null,
  style: null as DrawStyle | null,
  from: undefined as Recipe | undefined,
  /**
   * The picture was seen on the graph and its answer, worked out again, has nothing to put there
   * for now (the zero vector has no unit vector): it is drawn again as soon as the working has a
   * picture, never lost on the way through zero. Set by drawAgain, ended by the next Draw on graph.
   */
  waiting: false,
  /**
   * Resultant only was on when the picture last had to wait, with no answer left on the graph to
   * show beside the arrows it hides: it goes back on when the answer is drawn again. Read only
   * while `waiting`.
   */
  resultOnly: false,
  /** How many undo steps the last Draw on graph left, so a waiting picture ends with its undo. */
  depth: 0
}

/**
 * Whether an object is something Draw on graph added: the cards leave those out. `drawn` lasts only
 * this session, so an answer is also known by the resultant's token, which only drawAnswer sets on
 * an arrow: after a reopen, selecting the saved R made it a card and the next Add all counted it
 * twice. The command bar's own R = A + B has no token (only its old gold colour) and still gets one.
 */
export const isCalcAnswer = (id: ObjId): boolean => drawn.added.includes(id) || useScene.getState().objects[id]?.themed === RESULT_TOKEN

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
 * Whether a picture is one vector in the plane with its x- and y-components (2D Components): what
 * an arrow draws by itself when it shows its components.
 */
function inPlaneComponents(vis: NonNullable<VS.Solution['visual']>): boolean {
  const [a, x, y, ...more] = vis.vectors
  return !more.length && a?.role === 'input' && !a.drawn && x?.role === 'helper' && y?.role === 'helper' && Math.abs(a.v[2]) <= 1e-9 && near(x.v, [a.v[0], 0, 0]) && near(y.v, [0, a.v[1], 0])
}

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
 * Computes a bounding box framing all vectors (solution arrows, cards, origin, and scene vectors)
 * with comfortable top padding so tall vectors (like Vector A) and their labels are never cut off by
 * the viewport's top HUD controls.
 */
function vectorsFrameBox(sol?: VS.Solution, style?: DrawStyle | null): { min: [number, number, number]; max: [number, number, number] } {
  const pts: V3[] = [[0, 0, 0]]
  if (sol?.visual) {
    const vis = sol.visual
    const lay = layoutVectors(layoutInput(vis), style ?? vis.mode ?? 'common-tail')
    for (const a of lay.arrows) {
      pts.push(a.tail)
      pts.push(add(a.tail, a.comp))
    }
  }
  const sc = useScene.getState()
  for (const o of Object.values(sc.objects)) {
    if (o.type === 'vector' && o.visible && (o.space === 'vectors' || !o.space || o.space === sc.activeSpace)) {
      const val = sc.ev.values.get(o.id)
      const tail = val?.type === 'vector' ? val.tail : (o.def.kind === 'free' ? o.def.tail : ZERO)
      const comp = val?.type === 'vector' ? val.comp : (o.def.kind === 'free' ? o.def.comp : ZERO)
      pts.push(tail)
      pts.push(add(tail, comp))
    }
  }
  let minX = 0, maxX = 0, minY = 0, maxY = 0, minZ = 0, maxZ = 0
  for (const p of pts) {
    if (Number.isFinite(p[0])) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]) }
    if (Number.isFinite(p[1])) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]) }
    if (Number.isFinite(p[2])) { minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]) }
  }
  const spanX = Math.max(maxX - minX, 1)
  const spanY = Math.max(maxY - minY, 1)
  const spanZ = maxZ - minZ
  const span = Math.max(spanX, spanY, spanZ, 2)
  const padX = Math.max(span * 0.15, 0.8)
  const padBottom = Math.max(span * 0.15, 0.8)
  const padTop = Math.max(span * 0.35, 1.8)
  const padZ = Math.max(span * 0.15, 0.8)
  return {
    min: [minX - padX, minY - padBottom, minZ - (spanZ > 0 ? padZ : 0)],
    max: [maxX + padX, maxY + padTop, maxZ + (spanZ > 0 ? padZ : 0)]
  }
}

/**
 * Draws an answer with the cards' own arrows. `style` is the student's choice of picture, or
 * null for the answer's own. One undo step takes the drawing away (with a second for clearing
 * the drawing before it, when there was one).
 */
export function drawAnswer(sol: VS.Solution, style: DrawStyle | null): void {
  const vis = sol.visual
  if (!vis) return
  // The answer already on the graph, under a layout chip or Draw on graph again: its own arrows
  // are laid out again in place (switchLayout), so what a student built on them stays.
  if (drawn.sol === sol && switchLayout(sol, vis, style)) {
    useScene.getState().select([])
    fitCamera(vectorsFrameBox(sol, style))
    return
  }
  // Only the answer the panel shows has a recipe: a picture of anything else is not worked out again.
  const shown = useVC.getState().result
  drawPicture(sol, vis, style, shown?.sol === sol ? shown.from : undefined, true)
  // Nothing is left selected: a selected answer wears the selection band and looks heavier than
  // its parents.
  useScene.getState().select([])
  fitCamera(vectorsFrameBox(sol, style))
}

/**
 * Puts an answer's picture on the graph and notes what it put there. `record` false is for the
 * picture of a re-worked answer drawn again (drawAgain): the change that caused it is the undo
 * step, so it is no step of its own, and the camera, the selection and the view mode stay as they
 * are while a student types. `resultOnly` is for that silent picture only: Resultant only was on
 * for the picture it replaces, and goes back on for this one (see drawAgain).
 */
function drawPicture(sol: VS.Solution, vis: NonNullable<VS.Solution['visual']>, style: DrawStyle | null, from: Recipe | undefined, record: boolean, resultOnly = false): void {
  relaying = true
  try {
    // The previous drawing goes first; the arrows it moved go back to where the student had them.
    const stale = drawn.added.filter((id) => useScene.getState().objects[id])
    if (stale.length) useScene.getState().removeObjects(stale, { record })
    if (record) useScene.getState().beginGesture()
    try {
      for (const id of drawn.parents) setVisible(id, true, record)
      for (const id of drawn.hidden.keys()) setVisible(id, true, record)
      drawn.hidden.clear()
      for (const [id, tail] of drawn.moved) moveTail(id, tail, record)
      drawn.moved.clear()
      for (const [id, was] of drawn.comps) showComponentsOf(id, was, record)
      drawn.comps.clear()

      // 2D Components is the card's own arrow showing its components: the renderer draws Ax and Ay,
      // their dashed guides and "Ax = …" labels from the arrow itself and follows it when it is
      // dragged or retyped. Ax and Ay used to be added as arrows of their own, each selectable with
      // a chip and, once selected, components of its own: "Axx = 4 cm", "Axy = 0 cm".
      const own = inPlaneComponents(vis) ? cardArrowFor(vis.vectors[0].v, new Set(), vis.vectors[0].name) : undefined
      const lay = layoutVectors(own ? [] : layoutInput(vis), style ?? vis.mode ?? 'common-tail')
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
      const comps = new Map<ObjId, boolean | undefined>()
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
            if (near(tail, a.tail) || moveTail(id, a.tail, record)) {
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
            setVisible(id, false, record)
          }
        }
        // A helper such as −B takes the colour of the arrow it is the negative of.
        const of = a.role === 'helper' ? vis.vectors.findIndex((x) => x.role === 'input' && near(neg(x.v), src.v)) : -1
        const ofId = of >= 0 ? idOf.get(vis.vectors[of].name) : undefined
        const color = a.role === 'result' ? RESULT_COLOUR : ofId ? useScene.getState().objects[ofId]?.color : undefined
        // An input no card arrow holds is still drawn, so the picture stays joined up, but auxiliary
        // as a copy is (its chip shows only while it is selected): drawn as an ordinary arrow it was
        // a second A′ at a value the card no longer had, beside the card's own A, and a waiting
        // graph card was offered it.
        const o = copyOf
          ? copyArrow(b, copyOf, a, standIn)
          : b.vector({ kind: 'free', tail: a.tail, comp: a.comp }, { name: VS.sceneName(a.name), color, auxiliary: a.role !== 'result' || standIn, showLabel: a.role !== 'helper' && !standIn })
        if (copyOf) hidden.set(copyOf, o.id)
        const label = VS.sceneLabel(a.name)
        if (label && !copyOf) o.label = label
        if (a.role === 'result') o.themed = RESULT_TOKEN
        if (standIn) o.labelMode = 'name'
        idOf.set(a.name, o.id)
        slots.push(o.id)
        sources.push(copyOf)
        // An answer drawn at a stand-in length is still the answer. Filed with the parents, it was
        // never laid out again when v was retyped, and Resultant only was never offered for it.
        if (a.role === 'result') results.push(o.id)
        else parents.push(o.id)
        const note = standIn && src.note ? b.text(add(a.tail, a.comp), src.note, { name: `${o.name}note`, auxiliary: true }).id : undefined
        notes.push(note)
        // An answer's note stays with it: Resultant only would hide "arrow not to scale" exactly when
        // the stand-in is shown alone.
        if (note && a.role !== 'result') parents.push(note)
      })
      const answer = results[0]
      if (answer && lay.sides.length) parents.push(...farSides(b, answer, lay.sides.flatMap((name) => idOf.get(name) ?? [])))
      if (own) {
        const o = useScene.getState().objects[own]
        comps.set(own, o?.type === 'vector' ? o.showComponents : undefined)
        showComponentsOf(own, true, record)
        parents.push(own)
        slots.push(own)
        sources.push(own)
        notes.push(undefined)
        inputs.set(own, compOf(own) ?? vis.vectors[0].v)
      }
      if (b.created.length) useScene.getState().addObjects(b.created, { select: false, record })
      Object.assign(drawn, {
        // Drawn again in silence, the picture it replaces stays listed: an undo of an earlier step
        // can bring its arrows back, and they are still the picture's to take away (as takePictureOff
        // leaves them), not a second answer beside the new one.
        added: [...(record ? [] : drawn.added), ...b.created.map((o) => o.id)],
        parents,
        results: [...(record ? [] : drawn.results), ...results],
        slots,
        notes,
        sources,
        hidden,
        inputs,
        comps,
        sol,
        style,
        from,
        waiting: false,
        // With no answer in this picture (the zero vector's unit vector) there is nothing to show
        // alone: the arrows stay as they are, and Resultant only is kept for the picture that comes back.
        resultOnly: resultOnly && !results.length,
        depth: record ? useScene.getState().past.length : drawn.depth
      })
      // Drawn again, the arrows it hid showed again; they are hidden again with the new picture.
      if (resultOnly && results.length) for (const id of parents) setVisible(id, false, false)
      if (record && vis.vectors.some((x) => Math.abs((x.drawn ?? x.v)[2]) > 1e-9)) useScene.getState().setViewMode('3d')
    } finally {
      if (record) useScene.getState().endGesture()
    }
  } finally {
    relaying = false
  }
}

/**
 * A parallelogram's far sides, built into `b`: construction lines from each side's head to the
 * answer's head, tied to the heads so they follow a drag. Returns the lines.
 */
function farSides(b: Builder, answer: ObjId, sides: ObjId[]): ObjId[] {
  // Named, so the hidden points do not take the capitals the next card would be offered.
  const head = (id: ObjId) => b.point({ kind: 'vectorHead', vector: id }, { name: 'head', auxiliary: true, visible: false, showLabel: false }).id
  const r = head(answer)
  return sides.map((id) => {
    const s = b.segment(head(id), r, { auxiliary: true, showLabel: false })
    s.themed = '--text-faint'
    return s.id
  })
}

/**
 * A layout chip under the answer already on the graph, or Draw on graph pressed for it again: the
 * same arrows are laid out again in place, the card arrows and the answer keeping their ids, as a
 * retyped card lays them out (V5). Drawn afresh, the answer R was removed and a new R made, and
 * removeObjects took with the old R whatever a student had built on it: a point on its head and
 * the angle measured there. A parallelogram's far sides are added on the way into Parallelogram
 * and taken away on the way out, and the vectors "Resultant only" hid show again, as in a fresh
 * drawing. One undo step, and none when nothing would change (the chip already shown). False when
 * the picture cannot be laid out again, for drawAnswer to draw it afresh.
 */
function switchLayout(sol: VS.Solution, vis: NonNullable<VS.Solution['visual']>, style: DrawStyle | null): boolean {
  const sc = useScene.getState()
  if (!pictureOnGraph(sc.objects) || !canLayOutAgain(vis)) return false
  const lay = layoutVectors(drawn.comps.size ? [] : layoutInput(vis), style ?? vis.mode ?? 'common-tail')
  // Only far sides are segments among what Draw on graph added.
  const sides = drawn.added.filter((id) => sc.objects[id]?.type === 'segment')
  const answer = drawn.results.find((id) => sc.objects[id])
  const want = answer ? lay.sides.length : 0
  const changes =
    sides.length !== want ||
    drawn.parents.some((id) => sc.objects[id] && !sc.objects[id].visible) ||
    lay.arrows.some((a, i) => {
      const c = sc.ev.values.get(drawn.slots[i])
      // A card arrow keeps its own components: only its tail is laid out (placeInput).
      return c?.type !== 'vector' || !near(c.tail, a.tail) || (drawn.slots[i] !== drawn.sources[i] && !near(c.comp, a.comp))
    })
  const was = drawn.style
  drawn.style = style
  if (!changes) return true
  // The chip is one step of the drawing, but its style is not: the state its undo comes back to
  // showed the style that was lit before it (followStyle puts that back, and the chip's own state
  // when the chip is redone). Done here because the drawing's subscriber does not see a chip.
  styleAt.set(sc.objects, was)
  relaying = true
  sc.beginGesture()
  try {
    for (const id of drawn.parents) setVisible(id, true)
    layOutAgain(sol, true)
    if (sides.length !== want) {
      // The far sides there go with their hidden head points (only they are head points among what
      // was added). Their ids stay in `drawn.added`, so far sides an undo brings back are still the
      // picture's to take away. removeObjects records a step of its own even inside a gesture, and
      // the chip is one step.
      const objects = useScene.getState().objects
      const old = drawn.added.filter((id) => {
        const o = objects[id]
        return o?.type === 'segment' || (o?.type === 'point' && o.def.kind === 'vectorHead')
      })
      if (old.length) useScene.getState().removeObjects(old, { record: false })
      if (answer && want) {
        const b = new Builder()
        const lines = farSides(
          b,
          answer,
          lay.sides.flatMap((name) => {
            const i = lay.arrows.findIndex((a) => a.name === name)
            return i >= 0 ? [drawn.slots[i]] : []
          })
        )
        b.commit(false)
        drawn.added.push(...b.created.map((o) => o.id))
        drawn.parents.push(...lines)
      }
    }
  } finally {
    useScene.getState().endGesture()
    relaying = false
  }
  return true
}

/**
 * The card values (and the number in its k or q box) each answer was worked out from, so it is
 * worked out again only when they change. Keyed on the working rather than the answer card, which is
 * a new object each time it goes stale or comes back.
 */
const workedFrom = new WeakMap<VS.Solution, { vectors: (V3 | string | undefined)[]; scalar?: number | string }>()

/** What a recipe's cards hold among every card's values, in its order; undefined for a card that went. */
const recipeValues = (from: Recipe, cards: Card[], values: (V3 | string)[]) => from.cards.map(({ id }) => values[cards.findIndex((c) => c.id === id)])

/**
 * The number in the box a recipe also reads (k or q), or the sentence that says why it cannot be
 * read; undefined when the working reads neither (H9).
 */
function scalarNow(from: Recipe): number | string | undefined {
  if (!from.scalar) return undefined
  try {
    return evalNumber(useVC.getState()[from.scalar])
  } catch (e) {
    return explainVectorError(e)
  }
}

const isVec = (v: V3 | string | undefined): v is V3 => Array.isArray(v)

/** The same vectors, every one of them readable. */
const sameVectors = (a: (V3 | string | undefined)[], b: (V3 | string | undefined)[]): boolean =>
  a.length === b.length &&
  a.every((v, i) => {
    const w = b[i]
    return isVec(v) && isVec(w) && near(v, w)
  })

/** Notes what a newly shown answer's cards hold, which is what it was worked out from. */
function noteAnswer(a: Answer | null): void {
  if (!a?.from || workedFrom.has(a.sol)) return
  const cards = useVC.getState().cards
  workedFrom.set(a.sol, { vectors: recipeValues(a.from, cards, cardValues(cards, useScene.getState().ev)), scalar: scalarNow(a.from) })
}

/** Keeps the answer the panel shows, and any older picture still on the graph, true to the cards. */
function followAnswer(): void {
  if (relaying) return
  const shown = useVC.getState().result
  if (shown?.from) keepAnswerTrue(shown, shown.from)
  // The shown answer's own picture was looked after with it; any other follows its own recipe.
  if (!shown?.from || drawn.sol !== useVC.getState().result?.sol) followPicture()
}

/**
 * Keeps the answer under the cards true to them, drawn or not. A drawn answer reuses the cards' own
 * arrows, so retyping or dragging A used to leave R at the old sum and B's tail at A's old head; and
 * only a drawn answer with a result arrow was ever worked out again, so retyping A left "Ax = 4,
 * Ay = 4" under a card reading 8i + 2j, and blanking or removing A left R = A + B with no A. When a
 * card it was worked out from changes, it is worked out again and its picture laid out again in
 * place, with no undo step of its own (the change that caused it is the step, and undoing that
 * brings the old picture back with the old vectors). A picture that cannot be laid out in place,
 * because the new working has other arrows (the zero vector has no unit vector) or none, is drawn
 * again from it (drawAgain): a picture is never lost while its answer is shown. When one is
 * removed, the answer is marked stale and its picture taken off the graph; when one cannot be read
 * for now, or the working fails on the cards as they are, it is marked stale and its picture waits
 * where it is.
 */
function keepAnswerTrue(shown: Answer, from: Recipe): void {
  const sc = useScene.getState()
  const cards = useVC.getState().cards
  const values = cardValues(cards, sc.ev)
  const now = recipeValues(from, cards, values)
  const mine = drawn.sol === shown.sol
  // A picture that waits for something to show ends with the Draw on graph that made it: undone,
  // the student has taken it off themselves.
  if (drawn.waiting && sc.past.length < drawn.depth) drawn.waiting = false
  const there = mine && pictureOnGraph(sc.objects)
  const wanted = there || (mine && drawn.waiting)
  // k or q, for the working that reads one: a number, or the sentence that says it cannot be read.
  const scalar = scalarNow(from)
  const was = workedFrom.get(shown.sol)
  if (was && sameVectors(now, was.vectors) && was.scalar === scalar) {
    // Its vectors and its k or q are as they were: an undo brought a removed card back, or a
    // half-typed one was finished as it had been.
    if (shown.stale) useVC.setState({ result: { ...shown, stale: false, staleWhy: undefined, staleBox: undefined, pictureTakenOff: false } })
    return
  }
  // Only a removed card takes the picture off: nothing but an undo brings that card back. A waiting
  // picture shows nothing, but the arrows it moved are given back all the same; the undo that brings
  // the card back brings it back too, as it brings back a picture that was showing.
  if (now.some((v) => v === undefined)) {
    if (wanted && !there) relay(takePictureOff)
    // A redo takes the card and its picture away together, so no picture is left to take off here:
    // it was taken off all the same, and the card says so as it did the first time.
    return goStale(shown, 'removed', there, undefined, mine && pictureWentWithIt)
  }
  // A card that cannot be read for a moment ("3i+", or "8" before the i) keeps its arrow at its last
  // value, so the picture still agrees with the drawing and waits where it is. Taken off, it was
  // lost for good on the way from "3i+" to "3i+1j".
  if (!now.every(isVec)) return goStale(shown, 'unreadable', false)
  // The same for a k or q box left blank or half typed: the answer waits for a number (H9).
  if (typeof scalar === 'string') return goStale(shown, 'unreadable', false, from.scalar)
  const sol = solveAgain(from, cards, values, sc.settings)
  // Every card readable but the working fails on them (A/(A·B) with A ⟂ B): the picture waits too,
  // so a drag through such a point does not lose it.
  if (!sol) return goStale(shown, 'unworkable', false)
  workedFrom.set(sol, { vectors: now, scalar })
  if (wanted)
    relay(() => {
      if (!layOutAgain(sol)) drawAgain(sol, from)
    })
  // In step with the answer card, so the picture is still known as this answer's.
  if (mine) drawn.sol = sol
  useVC.setState({ result: { ...shown, sol, stale: false, staleWhy: undefined, staleBox: undefined, pictureTakenOff: false } })
}

/**
 * The picture of a re-worked answer that cannot be laid out where it is — the new working has a
 * different number of arrows (one where the unit vector had two, once A is the zero vector) or
 * none — replaced by one drawn from the new working, in the layout the student chose, with no undo
 * step as typing is none. Taken off instead, it was lost for good: nothing drew it again when the
 * size was typed on from 0 to 0.8. A working with nothing to draw leaves the picture waiting
 * (drawn.waiting), to be drawn again, quietly, as soon as the working has one. Runs inside `relay`.
 */
function drawAgain(sol: VS.Solution, from: Recipe): void {
  const vis = sol.visual
  // Resultant only is read from the drawing, and drawing again shows the arrows it hid: read it
  // first, to put it back on the new picture, or on the one that comes back after a wait.
  const only = resultOnlyOn(useScene.getState().objects) || (drawn.waiting && drawn.resultOnly)
  if (vis) drawPicture(sol, vis, drawn.style, from, false, only)
  else {
    takePictureOff()
    Object.assign(drawn, { sol, from, resultOnly: only })
  }
  // Nothing of its own on the graph (the zero vector's unit vector, a working with no picture) is
  // not a picture the student took away: it is waited for.
  drawn.waiting = !pictureOnGraph(useScene.getState().objects)
}

/**
 * Marks the answer the panel shows stale, taking its picture off the graph first when told to. `box`
 * is the k or q box that cannot be read, when that and not a vector is why. `wentOff` is for a
 * picture that has just gone from the graph without this taking it off (a redo of the removal).
 */
function goStale(shown: Answer, why: StaleReason, takeOff: boolean, box?: 'k' | 'q', wentOff = false): void {
  if (takeOff) relay(takePictureOff)
  // Once its picture has come off, the card says so until the answer comes back: an undo can bring
  // the picture back, to be taken off again with the card still missing.
  const off = why === 'removed' && (takeOff || wentOff || !!shown.pictureTakenOff)
  if (shown.stale && shown.staleWhy === why && shown.staleBox === box && !!shown.pictureTakenOff === off) return
  useVC.setState({ result: { ...shown, stale: true, staleWhy: why, staleBox: box, pictureTakenOff: off } })
}

/**
 * A picture still on the graph of an answer the panel no longer shows follows its own recipe, as
 * every picture did before: laid out again when one of its arrows changes, or taken off. The same
 * when the k or q box its working reads is retyped (G4a), in place and with no undo step. While one
 * of its cards cannot be read for a moment, or its k or q box cannot, it waits where it is, as the
 * shown answer's picture does (keepAnswerTrue): only a card that is gone takes it off.
 */
function followPicture(): void {
  const sc = useScene.getState()
  if (!pictureOnGraph(sc.objects)) return
  const from = drawn.from
  // A k or q box left blank or half typed: the picture stays as it is, as the shown answer's does.
  // It is laid out again once the box reads, the cards it was drawn from still differing by then.
  const scalar = from ? scalarNow(from) : undefined
  if (typeof scalar === 'string') return
  // The box its working reads (k or q) holds another number than the one it was last worked out with (G4a).
  const was = drawn.sol ? workedFrom.get(drawn.sol) : undefined
  const retyped = !!from?.scalar && !!was && was.scalar !== scalar
  const changed = [...drawn.inputs].some(([id, v]) => {
    const c = compOf(id)
    return !c || !near(c, v)
  })
  if (!changed && !retyped) return
  const cards = useVC.getState().cards
  const values = cardValues(cards, sc.ev)
  // A card that cannot be read for a moment ("3i+" on the way to "3i+1j") keeps its arrow at its last
  // value: the picture waits where it is, as the shown answer's does, and follows once the card reads.
  // The retyped k or q was taking it off the graph for good here, with nothing to draw it again.
  if (from) {
    const now = recipeValues(from, cards, values)
    if (!now.some((v) => v === undefined) && !now.every(isVec)) return
  }
  const sol = from ? solveAgain(from, cards, values, sc.settings) : null
  relay(() => {
    if (!sol || !layOutAgain(sol)) takePictureOff()
  })
  // Noted as every working is, so the next retype of k or q is told from this one.
  if (sol && from) workedFrom.set(sol, { vectors: recipeValues(from, cards, values), scalar })
}

/** Runs a change to the picture with `relaying` set, so the drawing's subscriber leaves it alone. */
function relay(change: () => void): void {
  relaying = true
  try {
    change()
  } finally {
    relaying = false
  }
}

/**
 * Whether the last Draw on graph's picture is still on the drawing: its answer arrow, or, for a
 * picture with none (Components is a vector and its parts), what it added or the components it
 * turned on. Only an answer arrow counted, so a Components picture never followed its card.
 */
function pictureOnGraph(objects: Record<ObjId, SceneObject>): boolean {
  if (drawn.results.length) return answerOnGraph(objects)
  return (
    drawn.added.some((id) => objects[id]) ||
    [...drawn.comps.keys()].some((id) => {
      const o = objects[id]
      return o?.type === 'vector' && !!o.showComponents
    })
  )
}

/** Whether the drawn picture can show `vis` with the arrows it has. */
function canLayOutAgain(vis: NonNullable<VS.Solution['visual']>): boolean {
  const sc = useScene.getState()
  // A Components picture is its arrow's own components, which follow the arrow by themselves; a
  // vector gone 3D needs an Az that only helper arrows show.
  if (drawn.comps.size) return inPlaneComponents(vis) && drawn.slots.every((id) => sc.objects[id])
  // Every arrow must still be there; a copy may be missing (an undo took it), its card arrow not.
  return vis.vectors.length === drawn.slots.length && drawn.slots.every((id, i) => sc.objects[drawn.sources[i] ?? id])
}

/**
 * Moves the drawn picture's arrows to match a new working of its answer; false when it cannot show
 * it. `record` is for a layout chip, whose one undo step (its gesture) the moves belong to; a
 * picture laid out again after a change that is already an undo step records nothing.
 */
function layOutAgain(sol: VS.Solution, record = false): boolean {
  const vis = sol.visual
  if (!vis || !canLayOutAgain(vis)) return false
  const lay = layoutVectors(drawn.comps.size ? [] : layoutInput(vis), drawn.style ?? vis.mode ?? 'common-tail')
  lay.arrows.forEach((a, i) => {
    const src = drawn.sources[i]
    if (src) placeInput(i, src, a, !!vis.vectors[i].drawn && !near(vis.vectors[i].drawn!, vis.vectors[i].v), record)
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
        record
      )
    }
  })
  drawn.inputs = new Map([...drawn.inputs.keys()].map((id) => [id, compOf(id) ?? ZERO]))
  drawn.sol = sol
  return true
}

/**
 * Lays one card arrow of a drawn answer out again. It moves to where the layout puts it when it
 * can; when it cannot — an arrow between two points whose tail was dragged off the start — a copy
 * stands there instead and the original is hidden, as the first Draw on graph does. This ignored
 * the failed move before, and B and R were laid out as if A had moved: #18's broken head-to-tail
 * figure, reached through an edit instead of the first draw. `record` as for layOutAgain.
 */
function placeInput(i: number, src: ObjId, a: { name: string; tail: V3; comp: V3 }, standIn: boolean, record = false): void {
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
    if (moveTail(src, a.tail, record)) {
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
      useScene.getState().addObjects(b.created, { record })
      drawn.added.push(copy.id)
      drawn.hidden.set(src, copy.id)
      slot = copy.id
    }
    setVisible(src, false, record)
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

/**
 * Takes a drawn picture off the graph when its vectors no longer give it, and puts the arrows back
 * as the student had them. Whether that makes the answer stale is the caller's to say: the picture
 * of an answer the panel no longer shows, whose vector went 3D under it (Components), goes while
 * its answer stays true; the shown answer's picture is drawn again instead (drawAgain).
 */
function takePictureOff(): void {
  const sc = useScene.getState()
  const gone = drawn.added.filter((id) => sc.objects[id])
  if (gone.length) sc.removeObjects(gone, { record: false })
  for (const [id, tail] of drawn.moved) moveTail(id, tail, false)
  for (const id of drawn.hidden.keys()) setVisible(id, true, false)
  drawn.hidden.clear()
  for (const [id, was] of drawn.comps) showComponentsOf(id, was, false)
  // Given back once: kept, the next Draw on graph gave it back again and switched off a "show
  // components" the student had turned on since.
  drawn.comps.clear()
  showParents()
}

function setVisible(id: ObjId, visible: boolean, record = true): void {
  const o = useScene.getState().objects[id]
  if (o && o.visible !== visible) useScene.getState().updateObject(id, (d) => void (d.visible = visible), record)
}

/** Whether an arrow draws its own components; undefined gives back an arrow that never said either way. */
function showComponentsOf(id: ObjId, on: boolean | undefined, record = true): void {
  const o = useScene.getState().objects[id]
  if (o?.type !== 'vector' || o.showComponents === on) return
  useScene.getState().updateObject(
    id,
    (d) => {
      if (d.type !== 'vector') return
      if (on === undefined) delete d.showComponents
      else d.showComponents = on
    },
    record
  )
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
