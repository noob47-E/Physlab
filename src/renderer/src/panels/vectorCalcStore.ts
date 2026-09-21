// The Vector Calculator's cards and state, apart from the panel that draws them.
//
// This is a module of its own because the right-click menu (app/contextActions.ts) adds a card
// for a vector in the drawing, and importing the panel for that dragged the panel's MathLive
// field into the start-up bundle — 1.4 MB before the first frame, for a menu item.

import { create } from 'zustand'
import type { DrawStyle } from '../core/visualize'
import type { ObjId, SceneObject } from '../core/types'
import type { V3 } from '../math/vec'
import * as VS from '../math/vectorSolver'

export type Entry = 'comp' | 'polar' | 'scene'

export interface Card {
  id: number
  name: string
  entry: Entry
  latex: string
  mag: string
  angle: string
  sceneId: string
  /** The components a drawing card last read, so it stays readable if that vector is deleted. */
  last?: V3
  /**
   * The vector a demoted card used to read. Undo takes the vector away and the card becomes a
   * typed copy; redo brings the vector back with the same id, and selecting it must find this
   * card again rather than add a second one beside it.
   */
  wasSceneId?: string
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
    // A card linked to a drawing's vector stays linked while the drawing still has it. If the
    // vector is gone (the app restarted with an empty drawing, or it was deleted) the staleness
    // check in the panel turns it into a typed card holding the last components it read —
    // demoting every linked card here left a red, empty card on every restart.
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
 * The card a vector should take over rather than get a new one beside: the card that read this
 * very vector before it was demoted, else a blank one. Pressing "Add vector" and then drawing
 * the vector used to leave a red empty card A above a second card reading the drawing's A.
 */
export const cardToReuse = (cards: Card[], sceneId: ObjId): Card | undefined => cards.find((c) => c.wasSceneId === sceneId) ?? cards.find(isBlankCard)

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
  const linked = cards.find((c) => c.entry === 'scene' && c.sceneId === id)
  if (linked) return { kind: 'card', cardId: linked.id }
  const reuse = cardToReuse(cards, id)
  if (reuse) return { kind: 'link', cardId: reuse.id, sceneId: id, name: o.name }
  return { kind: 'add', sceneId: id, name: o.name }
}

export interface VCState {
  cards: Card[]
  expr: string
  k: string
  q: string
  /** null = the solution's own picture; a style only overrides when the student chose one. */
  style: DrawStyle | null
  result: { sol: VS.Solution; label: string } | null
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
    cards: st.cards.map((c) => (c.id === cardId ? { ...c, entry: 'scene', sceneId, name: VS.safeCardName(name, newCardName(others, c.id), taken), wasSceneId: undefined } : c))
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
  const linked = st.cards.find((c) => c.entry === 'scene' && c.sceneId === sceneId)
  if (linked) return linked.id
  const reuse = cardToReuse(st.cards, sceneId)
  if (reuse) return linkCardToScene(reuse.id, sceneId, name)
  const safe = VS.safeCardName(name, newCardName(st.cards, peekCardId()), st.cards.map((c) => c.name))
  const id = nextCardId()
  useVC.setState({ cards: [...st.cards, { id, name: safe, entry: 'scene', latex: '', mag: '1', angle: '0', sceneId }] })
  return id
}
