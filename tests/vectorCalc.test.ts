// The Vector Calculator's cards: the panel opens empty, an upgrade from 0.6.0 does not bring the
// old sample vectors back, and a vector selected on the drawing is the panel's business only
// when it is one the student drew.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useScene } from '../src/renderer/src/core/store'
import type { EvalResult, SceneObject, SceneSettings, VectorObj } from '../src/renderer/src/core/types'
import { add, layoutVectors, type V3 } from '../src/renderer/src/math/vec'
import * as VS from '../src/renderer/src/math/vectorSolver'
import { isResultArrow } from '../src/renderer/src/render/colourMix'
import { CARDS_KEY, OLD_CARDS_KEY, NOTHING_PICKED, NO_ARROWS, PlainError, addVectorFromScene, cardValues, planSync, drawAnswer, isCalcAnswer, resultOnlyOn, setResultOnly, answerHint, cardValue, evalNumber, explainVectorError, nextStepHint, removeCard, renameCard, startCardSync, unknownNameSentence, unknownNames, cardForSelection, cardToReuse, cardsFromStorage, ijkLatex, isBlankCard, linkCardToScene, loadCardsFrom, newCardName, useVC, type Card, type CardStorage } from '../src/renderer/src/panels/vectorCalcStore'
import { readSource } from './helpers/repo'
import { math } from '../src/renderer/src/math/expr'

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

  it('greets a new blank card with a dim hint, not a red error', () => {
    // "Add vector" is the one button on an empty panel; its reward used to be a --bad border and
    // a red sentence under a field nobody had typed in. Red waits for a vector that cannot be
    // read, or for an operation that reaches the empty card.
    const src = readSource('src/renderer/src/panels/VectorCalc.tsx')
    expect(src).toMatch(/const waiting = !ok && \(isBlankCard\(card\) \|\| \(card\.entry === 'scene' && !card\.sceneId\)\)/)
    expect(src).toMatch(/\$\{ok \|\| waiting \? '' : 'border-\[color:var\(--bad\)\]'\}/)
    expect(src).toMatch(/waiting \? \(\s*<span className="text-\[color:var\(--text-dim\)\]">/)
    expect(src).toContain('Type a vector above, like 3i + 4j or 10∠30°. It is drawn on the graph as you type.')
    expect(src).not.toContain('Type the vector, e.g.')
    // The field's placeholder carries the example, once.
    expect(src).toContain('placeholder="3i + 4j  or  10∠30°"')
    // An operation that reads the empty card still says so, in plain words.
    const store = readSource('src/renderer/src/panels/vectorCalcStore.ts')
    expect(store).toContain("NOTHING_TYPED = 'nothing typed yet'")
    expect(store).toContain('return NOTHING_TYPED')
    expect(src).toMatch(/Card \$\{wanted\[i\]\.name\} cannot be read: \$\{v\}/)
  })

  it('shows all four drawing styles under the answer, two by two', () => {
    // .seg is a nowrap row that clips its overflow, so at the panel's default width the fourth
    // choice read "From origi". The same two-column grid the theme chooser uses fits all four.
    const src = readSource('src/renderer/src/panels/VectorCalc.tsx')
    const seg = src.slice(src.indexOf('STYLES.map') - 200, src.indexOf('STYLES.map'))
    expect(seg).toContain('className="seg grid basis-full grid-cols-2"')
    expect(src).toMatch(/\[null, 'Auto'\],\s*\['head-to-tail', 'Head-to-tail'\],\s*\['parallelogram', 'Parallelogram'\],\s*\['common-tail', 'From origin'\]/)
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

  it('points at a typed card whose own arrow is selected, before any blank card', () => {
    // A typed card draws its own arrow (Fix 26); selecting that arrow is selecting the card.
    const typed = card(4, 'B', { latex: '3\\hat{i}+4\\hat{j}', last: [3, 4, 0], sceneId: 'vB', own: true })
    expect(cardToReuse([card(3, 'A'), typed])).toMatchObject({ id: 3 })
    expect(cardForSelection([card(3, 'A'), typed], ['vB'], objects, answers)).toEqual({ kind: 'card', cardId: 4 })
  })

  it('links a card in the store: the blank A becomes the reader of the drawing’s A, keeping its letter', () => {
    useVC.setState({ cards: [card(3, 'A'), card(4, 'B', { latex: '\\hat{i}' })] })
    expect(linkCardToScene(3, 'vA', 'A')).toBe(3)
    const [a, b] = useVC.getState().cards
    expect(a).toMatchObject({ id: 3, name: 'A', entry: 'scene', sceneId: 'vA' })
    expect(a.own).toBe(false)
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
    // The answers Draw on graph adds (Fix 2) are left out as the scene bridge's are.
    expect(src).toMatch(/cardForSelection\([^\n]*\(id\) => isDrawnAnswer\(id\) \|\| isCalcAnswer\(id\)\)/)
    expect(src).toMatch(/scrollIntoView/)
    expect(src).toMatch(/match\.kind === 'link'\) set\(\{ highlight: linkCardToScene\(match\.cardId, match\.sceneId, match\.name\) \}\)/)
    // Remove takes the card's arrow off the drawing too (Fix 25); deleting an object drops it
    // from the selection, so a later click on the vector re-selects it.
    expect(src).toMatch(/onClick=\{\(\) => removeCard\(card\.id\)\}/)
    // The drawn answers are told apart by the scene bridge that drew them.
    expect(readSource('src/renderer/src/core/visualize.ts')).toMatch(/export const isDrawnAnswer/)
  })
})

// ---------------------------------------------------------------------------
// Fix 25 and Fix 26: the drawing and the cards are one set of vectors
// ---------------------------------------------------------------------------

describe('the graph and the cards stay in step (Fix 25, Fix 26)', () => {
  const scene = () => useScene.getState()
  const vecObj = (id: string, name: string, comp: [number, number, number]): SceneObject =>
    ({ id, name, visible: true, locked: false, color: '#4dabf7', showLabel: true, space: 'vectors', type: 'vector', def: { kind: 'free', tail: [0, 0, 0], comp } }) as SceneObject
  const vectorsOnGraph = () => Object.values(scene().objects).filter((o) => o.type === 'vector' && !o.auxiliary)
  const compOf = (id: string) => {
    const c = scene().ev.values.get(id)
    return c?.type === 'vector' ? c.comp : undefined
  }

  beforeEach(() => {
    useVC.setState({ cards: [], result: null, highlight: 0 })
    scene().newScene()
    startCardSync()
  })

  it('deleting a vector on the graph removes its card, and one undo brings both back', () => {
    scene().addObjects([vecObj('g25a', 'A', [3, 4, 0])])
    useVC.setState({ cards: [card(51, 'A', { entry: 'scene', sceneId: 'g25a' }), card(52, 'B', { latex: '2\\hat{j}' })] })
    scene().removeObjects(['g25a'])
    expect(useVC.getState().cards.map((c) => c.name)).toEqual(['B'])
    scene().undo()
    expect(useVC.getState().cards.map((c) => c.name)).toEqual(['A', 'B'])
    expect(useVC.getState().cards[0]).toMatchObject({ id: 51, entry: 'scene', sceneId: 'g25a' })
    scene().redo()
    expect(useVC.getState().cards.map((c) => c.name)).toEqual(['B'])
  })

  it('removing a card removes its vector from the graph, and one undo brings both back', () => {
    scene().addObjects([vecObj('g25b', 'B', [1, 2, 0])])
    useVC.setState({ cards: [card(53, 'B', { entry: 'scene', sceneId: 'g25b' })] })
    removeCard(53)
    expect(scene().objects.g25b).toBeUndefined()
    expect(useVC.getState().cards).toEqual([])
    scene().undo()
    expect(scene().objects.g25b).toBeDefined()
    expect(useVC.getState().cards.map((c) => c.id)).toEqual([53])
  })

  it('draws a vector typed into a new card, under the card’s own name (Fix 26)', () => {
    useVC.setState({ cards: [card(61, 'A')] })
    // Blank: nothing to draw yet.
    expect(vectorsOnGraph()).toEqual([])
    useVC.setState({ cards: [card(61, 'A', { latex: '3\\hat{i}+4\\hat{j}' })] })
    const drawn = vectorsOnGraph()
    expect(drawn.map((o) => o.name)).toEqual(['A'])
    expect(compOf(drawn[0].id)).toEqual([3, 4, 0])
    expect(useVC.getState().cards[0].sceneId).toBe(drawn[0].id)
    expect(drawn[0].space).toBe('vectors')
  })

  it('typing moves the arrow, dragging the arrow rewrites the card, renaming renames both (Fix 26)', () => {
    useVC.setState({ cards: [card(62, 'A', { latex: '3\\hat{i}+4\\hat{j}' })] })
    const id = useVC.getState().cards[0].sceneId
    expect(compOf(id)).toEqual([3, 4, 0])
    // Typing a new value moves the arrow.
    useVC.setState({ cards: useVC.getState().cards.map((c) => ({ ...c, latex: '6\\hat{i}' })) })
    expect(compOf(id)).toEqual([6, 0, 0])
    // Dragging the arrow (the drawing changes, the card does not) rewrites the card.
    scene().updateObject(id, (d) => {
      if (d.type === 'vector') d.def = { kind: 'free', tail: [0, 0, 0], comp: [1, 2, 0] }
    })
    expect(useVC.getState().cards[0].latex).toBe(ijkLatex([1, 2, 0]))
    expect(compOf(id)).toEqual([1, 2, 0])
    // Renaming the card renames its arrow.
    expect(renameCard(62, 'F')).toBeNull()
    expect(scene().objects[id].name).toBe('F')
    expect(useVC.getState().cards[0].name).toBe('F')
  })

  it('a card that uses another (B = 2A) follows it when A is dragged, undone and redone', () => {
    useVC.setState({ cards: [card(64, 'A', { latex: '3\\hat{i}' }), card(65, 'B', { latex: '2A' })] })
    const [a, b] = useVC.getState().cards.map((c) => c.sceneId)
    expect(compOf(b)).toEqual([6, 0, 0])
    // A's arrow dragged to (1, 1): A's card is rewritten and B's arrow follows in the same pass.
    // It used to be worked out from A's old text and stayed at (6, 0, 0) beside a card saying (2, 2).
    scene().beginGesture()
    scene().updateObject(a, (d) => {
      if (d.type === 'vector') d.def = { kind: 'free', tail: [0, 0, 0], comp: [1, 1, 0] }
    })
    scene().endGesture()
    expect(useVC.getState().cards.map((c) => c.latex)).toEqual([ijkLatex([1, 1, 0]), '2A'])
    expect(compOf(b)).toEqual([2, 2, 0])
    // Undo puts both arrows back; B is still twice A, so its card keeps 2A rather than numbers.
    scene().undo()
    expect(compOf(a)).toEqual([3, 0, 0])
    expect(compOf(b)).toEqual([6, 0, 0])
    expect(useVC.getState().cards.map((c) => c.latex)).toEqual([ijkLatex([3, 0, 0]), '2A'])
    scene().redo()
    expect(compOf(b)).toEqual([2, 2, 0])
    expect(useVC.getState().cards[1].latex).toBe('2A')
    // Retyping A moves B too.
    useVC.setState({ cards: useVC.getState().cards.map((c) => (c.name === 'A' ? { ...c, latex: '5\\hat{j}' } : c)) })
    expect(compOf(b)).toEqual([0, 10, 0])
  })

  it('works the cards out once each, from the top: a chain of 14 cards is 14 evaluations, not 2^14', () => {
    const names = 'ABCDEFGHLMNPQR'.split('')
    const chain = names.map((n, i) => card(700 + i, n, { latex: i === 0 ? '\\hat{i}' : `2${names[i - 1]}` }))
    const spy = vi.spyOn(math, 'evaluate')
    try {
      const values = cardValues(chain, scene().ev)
      expect(values[13]).toEqual([2 ** 13, 0, 0])
      expect(spy.mock.calls.length).toBe(14)
      spy.mockClear()
      planSync(chain, {}, scene().ev)
      expect(spy.mock.calls.length).toBe(14)
      // With no cards, the sync that runs on every drag frame does no work at all.
      spy.mockClear()
      const none = planSync([], scene().objects, scene().ev)
      expect(none).toEqual({ cards: [], create: [], write: [] })
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('a size-and-angle card 5∠30° is drawn at 5 units, 30° above the x-axis', () => {
    useVC.setState({ cards: [card(63, 'A', { entry: 'polar', mag: '5', angle: '30' })] })
    const c = compOf(useVC.getState().cards[0].sceneId)!
    expect(c[0]).toBeCloseTo(5 * Math.cos(Math.PI / 6), 9)
    expect(c[1]).toBeCloseTo(2.5, 9)
  })
})

// ---------------------------------------------------------------------------
// Fix 24: a beginner is told what is wrong, how to fix it, and what to do next
// ---------------------------------------------------------------------------

describe('plain-English guidance (Fix 24)', () => {
  const ev = { values: new Map() } as unknown as EvalResult
  const A = card(71, 'A', { latex: '3\\hat{i}+4\\hat{j}' })
  const typedB = (latex: string, below: Card[] = []) => {
    const B = card(72, 'B', { latex })
    return cardValue(B, [A, B, ...below], ev)
  }
  /** Nothing a student reads carries the parser's own words. */
  const technical = /char \d|Unexpected|Undefined symbol|addScalar|expected:|Unit|index:|null|undefined|Syntax error/

  it('translates every parser message into what is wrong and how to fix it', () => {
    const cases: [string, RegExp][] = [
      ['3\\hat{i}+', /stops short.*Finish it/],
      ['3\\hat{i}+4\\hat{j})', /“\)” with no “\(”/],
      ['(3\\hat{i}+4\\hat{j}', /never closed.*Add the “\)”/],
      ['A\\cdot', /waiting for a vector or number after it/],
      ['A\\times/B', /waiting for a vector or number after it/],
      ['A^2', /cannot be squared.*A · A/],
      ['3,4', /comma cannot go there/],
      ['3=4', /Leave out the = sign/],
      ['3 4', /number, not a vector/],
      ['\\frac{1}{0}\\hat{i}', /divided by zero/],
      ['5\\angle', /10∠30°/]
    ]
    for (const [latex, want] of cases) {
      const v = typedB(latex)
      expect(typeof v, latex).toBe('string')
      expect(v, latex).toMatch(want)
      expect(v, latex).not.toMatch(technical)
    }
  })

  it('refuses a name no card gives a value to, instead of reading it as a mathjs unit', () => {
    // B is mathjs's byte and C its coulomb: "A/B" used to read as A itself and "C + A" failed
    // with a message about addScalar.
    const C = card(73, 'C', { latex: '\\hat{i}' })
    expect(typedB('A/B')).toMatch(/There is no vector called B/)
    expect(typedB('C+A', [C])).toMatch(/C is a card further down.*only use the vectors above it/)
    expect(unknownNameSentence('AB', { A: 1, B: 1 })).toMatch(/“AB” is not one name.*A × B.*A · B/)
    expect(typedB('\\hat{i}\\hat{j}')).toMatch(/“ij” is not one name/)
    // A card above that cannot be read is named as the problem.
    const bad = card(74, 'A', { latex: '3\\hat{i}+' })
    const B = card(75, 'B', { latex: '2A' })
    expect(cardValue(B, [bad, B], ev)).toMatch(/Card A cannot be read yet/)
    // Units written after a number, the maths constants and the unit vectors still work.
    expect(typedB('10 N\\angle30°')).toEqual(expect.any(Array))
    expect(typedB('2A+\\hat{i}')).toEqual([7, 8, 0])
    expect(unknownNames('pi * e * 30 deg', {})).toEqual([])
    expect(unknownNames('2*A + i', { A: 1, i: 1 })).toEqual([])
  })

  it('a size-and-angle card says why an empty or lettered box cannot be read', () => {
    const P = card(76, 'P', { entry: 'polar', mag: '', angle: '30' })
    expect(cardValue(P, [P], ev)).toMatch(/This box is empty\. Type a number in it, like 5\./)
    // A lone A is mathjs's ampere with no number: it used to draw a vector of size 0.
    expect(cardValue({ ...P, mag: 'A' }, [P], ev)).toMatch(/“A” is not a number/)
    expect(() => evalNumber('A')).toThrow(PlainError)
    expect(evalNumber('5')).toBe(5)
  })

  it('the tester’s “Unexpected part "/B"” reads as a sentence', () => {
    expect(explainVectorError(new Error('Unexpected part "/B" (char 3)'))).toBe('A vector cannot be divided by a vector. Divide by a number instead, like A/2, or use · or × between two vectors.')
    expect(explainVectorError(new Error('Unexpected part "x" (char 3)'))).toMatch(/“x” cannot be read here\. Put a sign/)
    // A sentence already written for the student passes through; the ± refusal is one.
    expect(explainVectorError(new Error('Choose + or −: PhysLab works one case at a time, so ask for the + answer and the − answer separately.'))).toMatch(/^Choose \+ or −/)
    expect(explainVectorError(new Error('Cannot read properties of undefined'))).toMatch(/Type it like 3i \+ 4j/)
  })

  it('a graph card says why to pick an arrow and what follows; with no arrows it says how to get one', () => {
    expect(NOTHING_PICKED).toMatch(/x- and y-components, size and angle/)
    expect(NOTHING_PICKED).toMatch(/follows the arrow when you drag it/)
    expect(NO_ARROWS).toMatch(/Draw one with the Vector tool/)
    const src = readSource('src/renderer/src/panels/VectorCalc.tsx')
    expect(src).toContain('— choose an arrow from the graph —')
    expect(src).toMatch(/offered\(card\)\.length \? \(v as string\) : NO_ARROWS/)
    // The panel shows the translated words, never the parser's.
    expect(src).not.toMatch(/friendly|Undefined symbol/)
    expect(src).toMatch(/setError\(explainVectorError\(e\)\)/)
  })

  it('each card and each answer carries a short next step', () => {
    expect(nextStepHint(['A'], 0)).toBe('Next: Size & angle or Components take A apart, or add a second vector to combine with it.')
    expect(nextStepHint(['A', 'B'], 0)).toMatch(/Subtract, Dot and Cross use A and B, in that order/)
    expect(nextStepHint(['A', 'B'], 1)).toMatch(/Add all gives the resultant.*A − B/)
    expect(nextStepHint(['A', 'B', 'F'], 2)).toMatch(/F too.*only A and B/)
    expect(answerHint(true)).toMatch(/Draw on graph/)
    expect(answerHint(false)).not.toMatch(/Draw on graph/)
    const src = readSource('src/renderer/src/panels/VectorCalc.tsx')
    expect(src).toMatch(/nextStepHint\(readable, readable\.indexOf\(card\.name\)\)/)
    expect(src).toMatch(/answerHint\(!!st\.result\.sol\.visual\)/)
  })
})

// ---------------------------------------------------------------------------
// Fix 2: Draw on graph uses the cards' own arrows, as a textbook draws them
// ---------------------------------------------------------------------------

describe('the textbook layout (Fix 2, math/vec.ts)', () => {
  const A = { name: 'A', v: [3, 1, 0] as V3, role: 'input' as const }
  const B = { name: 'B', v: [1, 2, 0] as V3, role: 'input' as const }
  const at = (l: ReturnType<typeof layoutVectors>, name: string) => l.arrows.find((a) => a.name === name)!

  it('head-to-tail: A from the origin, B from A’s head, R closing the triangle at B’s head', () => {
    const l = layoutVectors([A, B, { name: 'R', v: [4, 3, 0], role: 'result' }], 'head-to-tail')
    expect(at(l, 'A').tail).toEqual([0, 0, 0])
    expect(at(l, 'B').tail).toEqual([3, 1, 0])
    expect(at(l, 'R').tail).toEqual([0, 0, 0])
    expect(add(at(l, 'R').tail, at(l, 'R').comp)).toEqual(add(at(l, 'B').tail, at(l, 'B').comp))
    expect(l.sides).toEqual([])
  })

  it('subtraction chains A and −B: B stays at the origin and R ends at −B’s head (it used to start B at A’s head too)', () => {
    const vs = [A, B, { name: '−B', v: [-1, -2, 0] as V3, tail: [3, 1, 0] as V3, role: 'helper' as const }, { name: 'R', v: [2, -1, 0] as V3, role: 'result' as const }]
    for (const style of ['head-to-tail', 'common-tail'] as const) {
      const l = layoutVectors(vs, style)
      expect(at(l, 'B').tail, style).toEqual([0, 0, 0])
      expect(at(l, '−B').tail, style).toEqual([3, 1, 0])
      expect(add(at(l, 'R').tail, at(l, 'R').comp), style).toEqual(add(at(l, '−B').tail, at(l, '−B').comp))
    }
    // As a parallelogram, the sides are A and −B, both from the origin.
    const p = layoutVectors(vs, 'parallelogram')
    expect(p.style).toBe('parallelogram')
    expect(at(p, '−B').tail).toEqual([0, 0, 0])
    expect(p.sides).toEqual(['A', '−B'])
  })

  it('parallelogram: both from the origin, R along the diagonal; three vectors fall back to head-to-tail', () => {
    const l = layoutVectors([A, B, { name: 'R', v: [4, 3, 0], role: 'result' }], 'parallelogram')
    expect(l.arrows.map((a) => a.tail)).toEqual([[0, 0, 0], [0, 0, 0], [0, 0, 0]])
    expect(l.sides).toEqual(['A', 'B'])
    const C = { name: 'C', v: [0, 1, 0] as V3, role: 'input' as const }
    const three = layoutVectors([A, B, C, { name: 'R', v: [4, 4, 0], role: 'result' }], 'parallelogram')
    expect(three.style).toBe('head-to-tail')
    expect(at(three, 'C').tail).toEqual([4, 3, 0])
  })
})

describe('Draw on graph and Resultant only (Fix 2)', () => {
  const scene = () => useScene.getState()
  const vectors = () => Object.values(scene().objects).filter((o): o is VectorObj => o.type === 'vector')
  const shown = () => vectors().filter((o) => o.visible).map((o) => o.label ?? o.name).sort()
  const tailOf = (id: string) => {
    const c = scene().ev.values.get(id)
    return c?.type === 'vector' ? c.tail : undefined
  }

  beforeEach(() => {
    useVC.setState({ cards: [], result: null, highlight: 0 })
    scene().newScene()
    startCardSync()
    // A = 3i + j and B = i + 2j, the record's own example.
    useVC.setState({ cards: [card(81, 'A', { latex: '3\\hat{i}+\\hat{j}' }), card(82, 'B', { latex: '\\hat{i}+2\\hat{j}' })] })
  })

  it('draws R once beside the student’s A and B — no A1 or B1 — head to tail, and selects nothing', () => {
    const [a, b] = useVC.getState().cards.map((c) => c.sceneId)
    const sol = VS.solveAddition([{ name: 'A', v: [3, 1, 0] }, { name: 'B', v: [1, 2, 0] }])
    drawAnswer(sol, null)
    expect(shown()).toEqual(['A', 'B', 'R'])
    expect(tailOf(b)).toEqual([3, 1, 0])
    const r = vectors().find((o) => o.name === 'R')!
    expect(r.themed).toBe('--vec-result')
    expect(isResultArrow(r)).toBe(true)
    expect(isCalcAnswer(r.id)).toBe(true)
    expect(isCalcAnswer(a)).toBe(false)
    expect(scene().selection).toEqual([])
    // Drawing again replaces the answer rather than stacking a second R.
    drawAnswer(sol, 'parallelogram')
    expect(vectors().filter((o) => !o.auxiliary).map((o) => o.name).sort()).toEqual(['A', 'B', 'R'])
    expect(tailOf(b)).toEqual([0, 0, 0])
    // The far sides are construction lines, not arrows.
    expect(Object.values(scene().objects).filter((o) => o.type === 'segment')).toHaveLength(2)
    // Their hidden corner points leave the capitals free for the next card.
    expect(Object.values(scene().objects).filter((o) => o.type === 'point' && /^[A-Z]\d*$/.test(o.name))).toEqual([])
    // The cards still read their own vectors.
    expect(useVC.getState().cards.map((c) => c.latex)).toEqual(['3\\hat{i}+\\hat{j}', '\\hat{i}+2\\hat{j}'])
  })

  it('draws Subtract as A + (−B): −B from A’s head in B’s colour, B left where it is', () => {
    const [, b] = useVC.getState().cards.map((c) => c.sceneId)
    drawAnswer(VS.solveSubtraction({ name: 'A', v: [3, 1, 0] }, { name: 'B', v: [1, 2, 0] }), 'head-to-tail')
    expect(tailOf(b)).toEqual([0, 0, 0])
    const negB = vectors().find((o) => o.label === '−B')!
    expect(tailOf(negB.id)).toEqual([3, 1, 0])
    expect(negB.color).toBe(scene().objects[b].color)
    const r = vectors().find((o) => o.name === 'R')!
    const rv = scene().ev.values.get(r.id)
    expect(rv?.type === 'vector' && add(rv.tail, rv.comp)).toEqual([2, -1, 0])
  })

  it('Resultant only hides A and B together and shows them again, one undo step each way', () => {
    drawAnswer(VS.solveAddition([{ name: 'A', v: [3, 1, 0] }, { name: 'B', v: [1, 2, 0] }]), null)
    const on = () => resultOnlyOn(scene().objects)
    expect(on()).toBe(false)
    setResultOnly(true)
    expect(shown()).toEqual(['R'])
    expect(on()).toBe(true)
    // The button reads the drawing: undo shows A and B and the button is no longer pressed. It
    // was a flag of its own, left pressed, and the next click changed nothing on the graph.
    scene().undo()
    expect(shown()).toEqual(['A', 'B', 'R'])
    expect(on()).toBe(false)
    scene().redo()
    expect(on()).toBe(true)
    setResultOnly(false)
    expect(shown()).toEqual(['A', 'B', 'R'])
    expect(on()).toBe(false)
    // Asking for what is already so is no undo step.
    const steps = scene().past.length
    setResultOnly(false)
    expect(scene().past.length).toBe(steps)
    // Hiding A and B one at a time with their eye buttons presses it too.
    for (const o of vectors().filter((x) => x.name === 'A' || x.name === 'B')) scene().updateObject(o.id, (d) => void (d.visible = false))
    expect(on()).toBe(true)
    setResultOnly(false)
    // Deleting the answer while the parents are hidden brings them back.
    setResultOnly(true)
    scene().removeObjects(vectors().filter((o) => o.name === 'R').map((o) => o.id))
    expect(shown()).toEqual(['A', 'B'])
    expect(on()).toBe(false)
    expect(readSource('src/renderer/src/panels/VectorCalc.tsx')).toMatch(/aria-pressed=\{onlyR\}/)
  })

  it('knows a saved answer after the file is reopened, so R never becomes a card counted twice by Add all', () => {
    const sol = VS.solveAddition([{ name: 'A', v: [3, 1, 0] }, { name: 'B', v: [1, 2, 0] }])
    drawAnswer(sol, null)
    const saved = JSON.stringify(scene().serialize())
    const r = vectors().find((o) => o.name === 'R')!.id
    // A later drawing this session: the first R is no longer one this session's Draw on graph holds.
    drawAnswer(VS.solveSubtraction({ name: 'A', v: [3, 1, 0] }, { name: 'B', v: [1, 2, 0] }), null)
    scene().loadScene(JSON.parse(saved))
    expect(scene().objects[r]?.themed).toBe('--vec-result')
    expect(isCalcAnswer(r)).toBe(true)
    expect(cardForSelection(useVC.getState().cards, [r], scene().objects, isCalcAnswer)).toEqual({ kind: 'none' })
    // The command bar's own R = A + B (gold, no token) is the student's and still gets a card.
    scene().addObjects([{ ...scene().objects[r], id: 'barR', name: 'S', color: '#ffd43b', themed: undefined } as SceneObject])
    expect(isCalcAnswer('barR')).toBe(false)
    expect(cardForSelection(useVC.getState().cards, ['barR'], scene().objects, isCalcAnswer).kind).toBe('add')
  })

  it('keeps the picture true to the cards: retyping or dragging A moves B’s tail and R, and a removed A takes R away', () => {
    const [a, b] = useVC.getState().cards.map((c) => c.sceneId)
    const solve = (vs: VS.NamedVec[], settings: SceneSettings) => VS.solveAddition(vs, 'R', settings)
    const sol = solve([{ name: 'A', v: [3, 1, 0] }, { name: 'B', v: [1, 2, 0] }], scene().settings)
    useVC.setState({ result: { sol, label: 'Add all', from: { cards: useVC.getState().cards.map((c) => ({ id: c.id, name: c.name })), solve } } })
    drawAnswer(sol, 'head-to-tail')
    const r = vectors().find((o) => o.name === 'R')!.id
    const headOf = (id: string) => {
      const c = scene().ev.values.get(id)
      return c?.type === 'vector' ? add(c.tail, c.comp) : undefined
    }
    const answer = () => useVC.getState().result!.sol.visual!.vectors.find((x) => x.role === 'result')!.v
    // Card A retyped to 5i: B's tail stays on A's head and R closes the triangle at B's new head.
    // R used to stay at (4, 3) and B's tail at (3, 1): R ≠ A + B beside a card saying R = A + B.
    useVC.setState({ cards: useVC.getState().cards.map((c) => (c.name === 'A' ? { ...c, latex: '5\\hat{i}' } : c)) })
    expect(tailOf(b)).toEqual([5, 0, 0])
    expect(tailOf(r)).toEqual([0, 0, 0])
    expect(headOf(r)).toEqual([6, 2, 0])
    expect(answer()).toEqual([6, 2, 0])
    // A's arrow dragged: the same, and one undo puts the drag and its picture back together.
    scene().beginGesture()
    scene().updateObject(a, (d) => {
      if (d.type === 'vector') d.def = { kind: 'free', tail: [0, 0, 0], comp: [2, 2, 0] }
    })
    scene().endGesture()
    expect(tailOf(b)).toEqual([2, 2, 0])
    expect(headOf(r)).toEqual([3, 4, 0])
    scene().undo()
    expect(tailOf(b)).toEqual([5, 0, 0])
    expect(headOf(r)).toEqual([6, 2, 0])
    expect(answer()).toEqual([6, 2, 0])
    // Removing card A leaves nothing R is the sum of: R goes, B goes back to where it was, and
    // the answer card says why. One undo brings A, R and the picture back.
    removeCard(81)
    expect(vectors().some((o) => o.id === r)).toBe(false)
    expect(tailOf(b)).toEqual([0, 0, 0])
    expect(useVC.getState().result!.stale).toBe(true)
    scene().undo()
    expect(headOf(r)).toEqual([6, 2, 0])
    expect(tailOf(b)).toEqual([5, 0, 0])
    expect(useVC.getState().result!.stale).toBe(false)
    expect(readSource('src/renderer/src/panels/VectorCalc.tsx')).toMatch(/st\.result\.stale &&/)
  })

  it('makes every button in the panel a 44 px target', () => {
    const src = readSource('src/renderer/src/panels/VectorCalc.tsx')
    expect(src).not.toMatch(/min-h-\[36px\]|\bh-9\b/)
    const buttons = [...src.matchAll(/<button[\s\S]*?className=\{?[`"]([^`"]*)[`"]/g)].map((m) => m[1])
    expect(buttons.length).toBeGreaterThanOrEqual(8)
    for (const cls of buttons) expect(cls).toMatch(/min-h-\[44px\]/)
    expect(src).toMatch(/drawAnswer\(st\.result!\.sol, st\.style\)/)
    expect(src).not.toMatch(/visualizeSolution/)
  })
})
