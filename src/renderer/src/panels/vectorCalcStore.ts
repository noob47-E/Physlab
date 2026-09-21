// The Vector Calculator's cards and state, apart from the panel that draws them.
//
// This is a module of its own because the right-click menu (app/contextActions.ts) adds a card
// for a vector in the drawing, and importing the panel for that dragged the panel's MathLive
// field into the start-up bundle — 1.4 MB before the first frame, for a menu item.

import { create } from 'zustand'
import type { DrawStyle } from '../core/visualize'
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
}

/** A vector written the way a card is typed, at full precision, so nothing is lost in the copy. */
export const ijkLatex = (v: V3): string =>
  v
    .map((c, i) => (Math.abs(c) < 1e-12 ? '' : `${c < 0 ? '-' : '+'}${Math.abs(c)}\\hat{${'ijk'[i]}}`))
    .join('')
    .replace(/^\+/, '') || '0'

const DEFAULT_CARDS: Card[] = [
  { id: 1, name: 'A', entry: 'comp', latex: '3\\hat{i}+4\\hat{j}', mag: '10', angle: '30', sceneId: '' },
  { id: 2, name: 'B', entry: 'polar', latex: '', mag: '5', angle: '120', sceneId: '' }
]

// ---------------------------------------------------------------------------
// The cards survive a restart: a student comes back to the vectors of the problem they were on.
// ---------------------------------------------------------------------------

const CARDS_KEY = 'physlab.vectors.cards'

function loadCards(): Card[] {
  try {
    const raw = localStorage.getItem(CARDS_KEY)
    if (!raw) return DEFAULT_CARDS
    const cards = JSON.parse(raw) as Card[]
    // A card linked to a drawing's vector stays linked while the drawing still has it. If the
    // vector is gone (the app restarted with an empty drawing, or it was deleted) the staleness
    // check in the panel turns it into a typed card holding the last components it read —
    // demoting every linked card here left a red, empty card on every restart.
    const usable = cards.filter((c) => c && typeof c.name === 'string' && typeof c.latex === 'string')
    return usable.length ? usable : DEFAULT_CARDS
  } catch {
    return DEFAULT_CARDS
  }
}

function saveCards(cards: Card[]): void {
  try {
    localStorage.setItem(CARDS_KEY, JSON.stringify(cards))
  } catch {
    // Not remembered; the panel still works.
  }
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
  showMore: false
}))

useVC.subscribe((s, prev) => {
  if (s.cards !== prev.cards) saveCards(s.cards)
})

/** Add a card that reads one of the scene's vectors (used by the right-click menu). */
export function addVectorFromScene(sceneId: string, name: string): void {
  const st = useVC.getState()
  if (st.cards.some((c) => c.entry === 'scene' && c.sceneId === sceneId)) return
  const safe = VS.safeCardName(name, `V${peekCardId()}`, st.cards.map((c) => c.name))
  useVC.setState({ cards: [...st.cards, { id: nextCardId(), name: safe, entry: 'scene', latex: '', mag: '1', angle: '0', sceneId }] })
}
