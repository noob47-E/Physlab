// The Vector Calculator's cards: the panel opens empty, an upgrade from 0.6.0 does not bring the
// old sample vectors back, and a vector selected on the drawing is the panel's business only
// when it is one the student drew.

import { describe, expect, it } from 'vitest'
import type { SceneObject } from '../src/renderer/src/core/types'
import { CARDS_KEY, OLD_CARDS_KEY, addVectorFromScene, cardForSelection, cardToReuse, cardsFromStorage, ijkLatex, isBlankCard, linkCardToScene, loadCardsFrom, newCardName, useVC, type Card, type CardStorage } from '../src/renderer/src/panels/vectorCalcStore'
import { readSource } from './helpers/repo'

const card = (id: number, name: string, extra: Partial<Card> = {}): Card => ({ id, name, entry: 'comp', latex: '', mag: '1', angle: '0', sceneId: '', ...extra })

/** The two cards 0.6.0 stored for everyone, exactly as it wrote them. */
const OLD_A = card(1, 'A', { latex: '3\\hat{i}+4\\hat{j}', mag: '10', angle: '30' })
const OLD_B = card(2, 'B', { entry: 'polar', mag: '5', angle: '120' })

describe('the panel opens empty', () => {
  it('has no cards on a fresh install', () => {
    expect(cardsFromStorage(null, null)).toEqual([])
    expect(useVC.getState().cards).toEqual([])
  })

  it('reads its cards from a new key, so 0.6.0 storage is never taken as-is', () => {
    expect(CARDS_KEY).not.toBe(OLD_CARDS_KEY)
    expect(CARDS_KEY.startsWith(OLD_CARDS_KEY)).toBe(true)
  })

  it('drops the 0.6.0 samples an upgrade finds under the old key', () => {
    expect(cardsFromStorage(null, JSON.stringify([OLD_A, OLD_B]))).toEqual([])
  })

  it('keeps a card the student changed, even beside an untouched sample', () => {
    const mine = card(2, 'B', { entry: 'polar', mag: '7', angle: '120' })
    expect(cardsFromStorage(null, JSON.stringify([OLD_A, mine]))).toEqual([mine])
    const renamed = { ...OLD_A, name: 'F' }
    expect(cardsFromStorage(null, JSON.stringify([renamed, OLD_B]))).toEqual([renamed])
  })

  it('prefers the new key once it exists, samples and all', () => {
    const v2 = [card(5, 'A', { latex: '3\\hat{i}+4\\hat{j}', mag: '10', angle: '30' })]
    expect(cardsFromStorage(JSON.stringify(v2), JSON.stringify([OLD_A, OLD_B]))).toEqual(v2)
    // An empty list under the new key is a choice, not an absence.
    expect(cardsFromStorage('[]', JSON.stringify([OLD_A, OLD_B]))).toEqual([])
  })

  it('shrugs off broken storage', () => {
    expect(cardsFromStorage('not json', null)).toEqual([])
    expect(cardsFromStorage(null, '{"a":1}')).toEqual([])
    expect(cardsFromStorage(JSON.stringify([{ id: 1 }, card(3, 'C')]), null)).toEqual([card(3, 'C')])
  })

  it('reads the old key once: what it keeps is written under the new key and the old key is removed', () => {
    const fake = (init: Record<string, string>): CardStorage & { data: Map<string, string> } => {
      const data = new Map(Object.entries(init))
      return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
    }
    const mine = card(2, 'B', { entry: 'polar', mag: '7', angle: '120' })
    const s = fake({ [OLD_CARDS_KEY]: JSON.stringify([OLD_A, mine]) })
    expect(loadCardsFrom(s)).toEqual([mine])
    expect(s.data.has(OLD_CARDS_KEY)).toBe(false)
    expect(JSON.parse(s.data.get(CARDS_KEY)!)).toEqual([mine])
    // The second launch reads only the new key, and finds the same cards.
    expect(loadCardsFrom(s)).toEqual([mine])
    // A fresh install writes nothing: an empty panel is not a choice to remember yet.
    const fresh = fake({})
    expect(loadCardsFrom(fresh)).toEqual([])
    expect(fresh.data.size).toBe(0)
    // Once the new key exists the old one is left alone (it is already gone in practice).
    const both = fake({ [CARDS_KEY]: '[]', [OLD_CARDS_KEY]: JSON.stringify([OLD_A]) })
    expect(loadCardsFrom(both)).toEqual([])
    expect(both.data.has(OLD_CARDS_KEY)).toBe(true)
  })

  it('shows one plain sentence and the add button when there are no cards', () => {
    const src = readSource('src/renderer/src/panels/VectorCalc.tsx')
    expect(src).toContain('Add a vector, or draw one on the graph.')
    expect(src).toMatch(/st\.cards\.length === 0 &&/)
    expect(src).toContain('Add vector')
    // A 44 px target for a finger, in pixels: the app's 13 px root font makes min-h-11 only 36 px.
    expect(src).toMatch(/className="btn min-h-\[44px\][^"]*" onClick=\{addCard\}/)
    // No card is ever seeded by the panel itself.
    expect(readSource('src/renderer/src/panels/vectorCalcStore.ts')).not.toMatch(/DEFAULT_CARDS/)
  })
})

describe('one way in', () => {
  it('names a new card with the first free letter, never i, j or k', () => {
    expect(newCardName([], 9)).toBe('A')
    expect(newCardName([card(1, 'A'), card(2, 'B')], 9)).toBe('C')
    expect(newCardName([card(1, 'A'), card(2, 'C')], 9)).toBe('B')
    expect(newCardName('ABCDEFGHLMNPQRSTUVW'.split('').map((l, i) => card(i, l)), 9)).toBe('V9')
    expect('ABCDEFGHLMNPQRSTUVW').not.toMatch(/[IJK]/)
  })

  it('opens a new card on the maths field, with size ∠ angle a chip away', () => {
    const src = readSource('src/renderer/src/panels/VectorCalc.tsx')
    expect(src).toMatch(/entry: 'comp', latex: '', mag: '1', angle: '0', sceneId: '' \}\] \}\)\n\s*\}/)
    expect(src).toContain("['polar', 'size ∠ angle'")
    expect(src).toContain('10∠30°')
  })

  it('keeps the Remove button inside the card at the smallest window', () => {
    // At the 960 px minimum the three switch labels once pushed the trash icon off the card.
    // The row wraps and the switch may shrink, so the button is always somewhere on the card.
    const src = readSource('src/renderer/src/panels/VectorCalc.tsx')
    const header = src.slice(src.indexOf('flex-wrap items-center gap-2'), src.indexOf('Remove this vector'))
    expect(header).toContain('seg min-w-0 shrink')
    for (const label of ['typed', 'size ∠ angle', 'graph']) expect(header).toContain(`'${label}'`)
  })

  it('writes a demoted card without float noise', () => {
    // A vector dragged to (2.875, 1.275) is stored as 2.875000000000001; the field the student
    // then edits must read 2.875, not the last bit of a double.
    expect(ijkLatex([2.875000000000001, 1.275, 0])).toBe('2.875\\hat{i}+1.275\\hat{j}')
    expect(ijkLatex([0.1 + 0.2, -0.30000000000000004, 0])).toBe('0.3\\hat{i}-0.3\\hat{j}')
    // Twelve digits keep anything a student can type or draw exactly.
    expect(ijkLatex([3, -4, 0])).toBe('3\\hat{i}-4\\hat{j}')
    expect(ijkLatex([1.23456789, 0, 2.5])).toBe('1.23456789\\hat{i}+2.5\\hat{k}')
    expect(ijkLatex([0, 0, 0])).toBe('0')
    expect(ijkLatex([1e-13, 0, 0])).toBe('0')
  })
})

describe('a vector selected on the drawing', () => {
  const base = (id: string, name: string) => ({ id, name, visible: true, locked: false, color: '#4dabf7', showLabel: true })
  const vec = (id: string, name: string, extra: Partial<SceneObject> = {}): SceneObject => ({ ...base(id, name), type: 'vector', def: { kind: 'free', tail: [0, 0, 0], comp: [3, 4, 0] }, ...extra } as SceneObject)
  const objects: Record<string, SceneObject> = {
    vA: vec('vA', 'A'),
    vB: vec('vB', 'B'),
    vAx: vec('vAx', 'Ax', { auxiliary: true }),
    vR: vec('vR', 'R'),
    pP: { ...base('pP', 'P'), type: 'point', def: { kind: 'free', p: [1, 1, 0] } }
  }
  const answers = (id: string) => id === 'vR'
  // B has something typed in it: a blank card would be taken over by the selection (below).
  const cards = [card(1, 'A', { entry: 'scene', sceneId: 'vA' }), card(2, 'B', { latex: '2\\hat{j}' })]

  it('points at the card that already reads it', () => {
    expect(cardForSelection(cards, ['vA'], objects, answers)).toEqual({ kind: 'card', cardId: 1 })
  })

  it('asks for a new card when none reads it, named after the vector', () => {
    expect(cardForSelection(cards, ['vB'], objects, answers)).toEqual({ kind: 'add', sceneId: 'vB', name: 'B' })
  })

  it('does nothing for a point, a helper, a drawn answer, several things or nothing', () => {
    expect(cardForSelection(cards, ['pP'], objects, answers)).toEqual({ kind: 'none' })
    expect(cardForSelection(cards, ['vAx'], objects, answers)).toEqual({ kind: 'none' })
    expect(cardForSelection(cards, ['vR'], objects, answers)).toEqual({ kind: 'none' })
    expect(cardForSelection(cards, ['vA', 'vB'], objects, answers)).toEqual({ kind: 'none' })
    expect(cardForSelection(cards, [], objects, answers)).toEqual({ kind: 'none' })
    expect(cardForSelection(cards, ['gone'], objects, answers)).toEqual({ kind: 'none' })
  })

  it('takes over a blank card rather than adding a second one beside it', () => {
    // "Add vector", then the Vector tool: the drawing names its vector A, and so is the blank card.
    const blank = card(3, 'A')
    expect(isBlankCard(blank)).toBe(true)
    expect(isBlankCard(card(3, 'A', { latex: '3\\hat{i}' }))).toBe(false)
    expect(isBlankCard(card(3, 'A', { last: [1, 2, 0] }))).toBe(false)
    expect(cardForSelection([blank], ['vA'], objects, answers)).toEqual({ kind: 'link', cardId: 3, sceneId: 'vA', name: 'A' })
    // A card with something typed in it is the student's, and is left alone.
    expect(cardForSelection([card(3, 'A', { latex: '3\\hat{i}' })], ['vB'], objects, answers)).toEqual({ kind: 'add', sceneId: 'vB', name: 'B' })
  })

  it('finds the card it was demoted from after undo and redo, before any blank card', () => {
    const demoted = card(4, 'B', { latex: '3\\hat{i}+4\\hat{j}', last: [3, 4, 0], wasSceneId: 'vB' })
    expect(cardToReuse([card(3, 'A'), demoted], 'vB')).toBe(demoted)
    expect(cardForSelection([card(3, 'A'), demoted], ['vB'], objects, answers)).toEqual({ kind: 'link', cardId: 4, sceneId: 'vB', name: 'B' })
    // The demotion keeps the vector's id for that purpose.
    expect(readSource('src/renderer/src/panels/VectorCalc.tsx')).toMatch(/entry: 'comp', sceneId: '', wasSceneId: c\.sceneId/)
  })

  it('links a card in the store: the blank A becomes the reader of the drawing’s A, keeping its letter', () => {
    useVC.setState({ cards: [card(3, 'A'), card(4, 'B', { latex: '\\hat{i}' })] })
    expect(linkCardToScene(3, 'vA', 'A')).toBe(3)
    const [a, b] = useVC.getState().cards
    expect(a).toMatchObject({ id: 3, name: 'A', entry: 'scene', sceneId: 'vA' })
    expect(a.wasSceneId).toBeUndefined()
    expect(b).toMatchObject({ id: 4, name: 'B', latex: '\\hat{i}' })
    // A name another card holds is not taken over: the next free letter is used, never V6.
    useVC.setState({ cards: [card(5, 'B', { latex: '\\hat{i}' }), card(6, 'C')] })
    linkCardToScene(6, 'vB', 'B')
    expect(useVC.getState().cards[1]).toMatchObject({ id: 6, name: 'A', entry: 'scene', sceneId: 'vB' })
    useVC.setState({ cards: [] })
  })

  it('adds from the right-click menu through the same reuse, and never names a card V-something while a letter is free', () => {
    useVC.setState({ cards: [card(7, 'A', { latex: '\\hat{i}' })] })
    const id = addVectorFromScene('vA', 'A')
    const added = useVC.getState().cards.find((c) => c.id === id)!
    expect(added).toMatchObject({ name: 'B', entry: 'scene', sceneId: 'vA' })
    expect(addVectorFromScene('vA', 'A')).toBe(id)
    // A blank card is filled rather than joined by a second card.
    useVC.setState({ cards: [card(8, 'A')] })
    expect(addVectorFromScene('vB', 'B')).toBe(8)
    expect(useVC.getState().cards).toHaveLength(1)
    expect(useVC.getState().cards[0]).toMatchObject({ id: 8, name: 'B', entry: 'scene', sceneId: 'vB' })
    useVC.setState({ cards: [] })
  })

  it('is what the panel watches: the scene selection, through the pure helper', () => {
    const src = readSource('src/renderer/src/panels/VectorCalc.tsx')
    expect(src).toMatch(/useScene\(\(s\) => s\.selection\)/)
    expect(src).toMatch(/cardForSelection\([^\n]*isDrawnAnswer\)/)
    expect(src).toMatch(/scrollIntoView/)
    expect(src).toMatch(/match\.kind === 'link'\) set\(\{ highlight: linkCardToScene\(match\.cardId, match\.sceneId, match\.name\) \}\)/)
    // Remove deselects the vector, since a click on something already selected does not re-select it.
    expect(src).toMatch(/if \(card\.sceneId && selection\.includes\(card\.sceneId\)\) useScene\.getState\(\)\.select\(\[\]\)/)
    // The drawn answers are told apart by the scene bridge that drew them.
    expect(readSource('src/renderer/src/core/visualize.ts')).toMatch(/export const isDrawnAnswer/)
  })
})
