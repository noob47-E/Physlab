// The Vector Calculator's cards: the panel opens empty, an upgrade from 0.6.0 does not bring the
// old sample vectors back, and a vector selected on the drawing is the panel's business only
// when it is one the student drew.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useScene } from '../src/renderer/src/core/store'
import type { EvalResult, SceneObject, SceneSettings, TextObj, VectorObj } from '../src/renderer/src/core/types'
import { componentTexts } from '../src/renderer/src/core/naming'
import { add, layoutVectors, type V3 } from '../src/renderer/src/math/vec'
import * as VS from '../src/renderer/src/math/vectorSolver'
import { isResultArrow, showsComponents } from '../src/renderer/src/render/colourMix'
import { CARDS_KEY, OLD_CARDS_KEY, NOTHING_PICKED, NO_ARROWS, PlainError, addVectorFromScene, answerOnGraph, canDraw, cardValues, planSync, drawAnswer, evaluateVectorLine, isCalcAnswer, namesIn, resultOnlyOn, setResultOnly, answerHint, cardValue, evalNumber, explainVectorError, nextStepHint, removeCard, renameCard, setEntry, solveOperation, staleSentence, startCardSync, unknownNameSentence, unknownNames, cardForSelection, cardToReuse, cardsFromStorage, ijkLatex, isBlankCard, linkCardToScene, loadCardsFrom, newCardName, useVC, type Card, type CardStorage } from '../src/renderer/src/panels/vectorCalcStore'
import { readSource } from './helpers/repo'
import { inDegrees, math, toV3 } from '../src/renderer/src/math/expr'
import { texIJK } from '../src/renderer/src/math/format'
import fs from 'fs'
import path from 'path'

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
    // The operations' picking moved into the store with runOperation (H9, tests/vectorPolish.test.ts runs it).
    expect(store).toMatch(/Card \$\{c\.name\} cannot be read: \$\{v\}/)
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
    expect(src).toMatch(/graphCardPrompt\(sceneVectors\.length, offered\(card\)\.length, v as string\)/)
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
    // The hint names Draw on graph only when the card offers it: a stale answer is not drawn (V3).
    expect(src).toMatch(/answerHint\(canDraw\(st\.result\)\)/)
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

// ---------------------------------------------------------------------------
// 0.9 polish (P-VEC): an answer card and its picture follow the cards they were worked out from
// ---------------------------------------------------------------------------

describe('an answer and its picture follow their cards (V1, H2, V3, V4, H1)', () => {
  const scene = () => useScene.getState()
  const vectors = () => Object.values(scene().objects).filter((o): o is VectorObj => o.type === 'vector')
  const compOf = (id: string) => {
    const c = scene().ev.values.get(id)
    return c?.type === 'vector' ? c.comp : undefined
  }
  const tailOf = (id: string) => {
    const c = scene().ev.values.get(id)
    return c?.type === 'vector' ? c.tail : undefined
  }
  /** Equal but for the last bits cos and sin leave; −0 is written 0, which toEqual would not take. */
  const near = (a: readonly number[] | undefined, b: readonly number[]) => !!a && a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-9)
  const round = (v: readonly number[]) => v.map((x) => Math.round(x * 1e6) / 1e6 + 0)
  /** The names of the arrows on the graph whose components are one of these vectors. */
  const holding = (...vs: V3[]) => vectors().filter((o) => vs.some((v) => near(compOf(o.id), v))).map((o) => o.name)
  /**
   * The components a picture shows on the graph: a helper arrow drawn for one, or an arrow drawing
   * its own (showComponents: the renderer draws Ax along x and Ay along y from the arrow itself,
   * render/ObjectViews.tsx). Either way of drawing them counts; what they show is what is tested.
   */
  const componentsShown = () =>
    vectors()
      .filter((o) => o.visible)
      .flatMap((o) => {
        const c = compOf(o.id)
        if (!c) return []
        if (o.auxiliary) return [round(c)]
        return o.showComponents ? [round([c[0], 0, 0]), round([0, c[1], 0])] : []
      })
  const arrowOf = (name: string) => useVC.getState().cards.find((c) => c.name === name)!.sceneId
  const result = () => useVC.getState().result!
  const answers = () => result().sol.answers.map((a) => [a.label, a.tex])
  const answer = (label: string) => result().sol.answers.find((a) => a.label === label)?.tex
  /** A card's field changed, as the panel's updateCard does it: one new cards array. */
  const edit = (name: string, patch: Partial<Card>) => useVC.setState({ cards: useVC.getState().cards.map((c) => (c.name === name ? { ...c, ...patch } : c)) })

  /** The buttons used here, as VectorCalc.tsx's OPS has them: the label and how many cards each reads. */
  const OPS: Record<string, [string, number | 'all']> = { sum: ['Add all', 'all'], mag: ['Size & angle', 1], resolve: ['Components', 1], lorentz: ['Magnetic force', 2], unit: ['Unit vector', 1], proj: ['Projection', 2] }
  /**
   * An operation button, pressed exactly as VectorCalc.tsx `run` makes its answer: the cards' values
   * in one pass, solveOperation with k and q read from the panel's own fields, and a recipe naming
   * the cards it read.
   */
  const press = (opId: string) => {
    const [label, need] = OPS[opId]
    const st = useVC.getState()
    const values = cardValues(st.cards, scene().ev)
    const wanted = need === 'all' ? st.cards : st.cards.slice(0, need)
    const vs = wanted.map((c) => {
      const v = values[st.cards.indexOf(c)]
      if (typeof v === 'string') throw new Error(`Card ${c.name} cannot be read: ${v}`)
      return { name: c.name, v }
    })
    const k = opId === 'scale' ? evalNumber(st.k) : 0
    const q = opId === 'lorentz' ? evalNumber(st.q) : 0
    const solve = (named: VS.NamedVec[], now: SceneSettings) => solveOperation(opId, named, now, k, q)
    const sol = solve(vs, scene().settings)
    if (!sol) throw new Error(`${label} gave no answer`)
    useVC.setState({ result: { sol, label, from: { cards: wanted.map((c) => ({ id: c.id, name: c.name })), solve } } })
  }
  /** "Draw on graph" under the answer card: drawAnswer(st.result!.sol, st.style). */
  const drawShown = () => drawAnswer(useVC.getState().result!.sol, useVC.getState().style)
  /** A = 3i + 4j and B = 5j, the crew lead's example for H2. */
  const AB = () => useVC.setState({ cards: [card(911, 'A', { latex: '3\\hat{i}+4\\hat{j}' }), card(912, 'B', { latex: '5\\hat{j}' })] })

  const reset = () => {
    useVC.setState({ cards: [], result: null, highlight: 0, style: null, k: '2', q: '1.6\\times10^{-19}' })
    scene().newScene()
    // Two decimal places, degrees: the numbers below are what a student with these settings reads.
    scene().setSettings({ decimals: 2, precisionMode: 'dp', angleUnit: 'deg', unit: 'unit' })
    startCardSync()
  }
  beforeEach(reset)

  it('a result card follows its card when the card is retyped, with no picture on the graph (V1)', () => {
    useVC.setState({ cards: [card(901, 'A', { latex: '4\\hat{i}+4\\hat{j}' })] })
    press('resolve')
    expect(answers()).toEqual([['Ax', '4'], ['Ay', '4']])
    expect(result().sol.steps[0].text).toBe('Given: magnitude A = 5.66 at θ = 45° with the +x axis.')
    // The owner's report: the card read 8.25 ∠ 14.04° while the answer under it still said Ax = 4,
    // Ay = 4 and "magnitude A = 5.66 at θ = 45°". Only followAnswer → layOutAgain ever worked an
    // answer out again, and it returns at once unless the answer is drawn with a result arrow.
    edit('A', { latex: '8\\hat{i}+2\\hat{j}' })
    expect(compOf(arrowOf('A'))).toEqual([8, 2, 0])
    expect(answers()).toEqual([['Ax', '8'], ['Ay', '2']])
    expect(result().sol.steps[0].text).toBe('Given: magnitude A = 8.25 at θ = 14.04° with the +x axis.')
    expect(result().sol.title).toBe('Resolve A into rectangular components')
    expect(result().stale).toBeFalsy()
  })

  it('a result card follows its card when the card is switched to size ∠ angle 6∠0° (V1)', () => {
    useVC.setState({ cards: [card(902, 'A', { latex: '4\\hat{i}+4\\hat{j}' })] })
    press('resolve')
    // The chip fills the two boxes from the vector (5.66 ∠ 45°); the student then types 6 and 0.
    setEntry(902, 'polar')
    edit('A', { mag: '6' })
    edit('A', { angle: '0' })
    expect(round(compOf(arrowOf('A'))!)).toEqual([6, 0, 0])
    expect(answers()).toEqual([['Ax', '6'], ['Ay', '0']])
    expect(result().sol.steps[0].text).toBe('Given: magnitude A = 6 at θ = 0° with the +x axis.')
  })

  it('a result card with no picture is marked stale when a card it was worked out from is blanked (H2)', () => {
    AB()
    press('sum')
    // A blank field cannot be read, but its arrow keeps (3, 4): nothing followAnswer compares changed.
    edit('A', { latex: '' })
    expect(result().stale).toBe(true)
  })

  it('a drawn answer is marked stale and stays where it is while a card it was worked out from is blanked (H2, R2)', () => {
    AB()
    press('sum')
    drawShown()
    const r = vectors().find((o) => o.name === 'R')!.id
    const b = arrowOf('B')
    expect(tailOf(b)).toEqual([3, 4, 0])
    edit('A', { latex: '' })
    expect(result().stale).toBe(true)
    // Corrected in round 2 (the head's decision): a card that cannot be read for a moment keeps its
    // arrow at its last value, so the picture still agrees with the drawing and stays. Taken off as
    // a removed card's picture is, it was lost for good on the way from "3i+" to "3i+1j".
    expect(scene().objects[r]).toBeDefined()
    expect(tailOf(b)).toEqual([3, 4, 0])
    expect(staleSentence(result())).not.toMatch(/picture/)
  })

  it('a result card is marked stale when a card it was worked out from is removed, drawn or not (H2)', () => {
    // With its picture on the graph this already works (followAnswer → layOutAgain fails → retireAnswer)…
    AB()
    press('sum')
    drawShown()
    removeCard(911)
    expect(vectors().some((o) => o.name === 'R')).toBe(false)
    expect(result().stale).toBe(true)
    // …with none, nothing looks: the card kept "R = A + B" with no card A left to be its A.
    reset()
    AB()
    press('sum')
    removeCard(911)
    expect(useVC.getState().cards.map((c) => c.name)).toEqual(['B'])
    expect(result().stale).toBe(true)
  })

  it('Draw on graph after a retype draws the vector the card holds now, never a second arrow at the old value (V3)', () => {
    useVC.setState({ cards: [card(921, 'A', { latex: '4\\hat{i}+4\\hat{j}' })] })
    press('resolve')
    edit('A', { latex: '8\\hat{i}+2\\hat{j}' })
    drawShown()
    // It drew A′ = (4, 4), not auxiliary, beside the card's own A = (8, 2), with the old Ax and Ay:
    // cardArrowFor matches by value, found no arrow at (4, 4) and a fresh one was made.
    expect(compOf(arrowOf('A'))).toEqual([8, 2, 0])
    expect(holding([4, 4, 0], [4, 0, 0], [0, 4, 0])).toEqual([])
    expect(vectors().filter((o) => !o.auxiliary).map((o) => o.name)).toEqual(['A'])
  })

  it('the Components picture on the graph follows a retype of its card (V3)', () => {
    useVC.setState({ cards: [card(922, 'A', { latex: '4\\hat{i}+4\\hat{j}' })] })
    press('resolve')
    drawShown()
    expect(componentsShown()).toEqual(expect.arrayContaining([[4, 0, 0], [0, 4, 0]]))
    // solveResolve's picture has no result arrow, so drawn.results is empty and followAnswer returns
    // at once: Ax and Ay stayed at (4, 0) and (0, 4) under an arrow that now reads (8, 2).
    edit('A', { latex: '8\\hat{i}+2\\hat{j}' })
    expect(compOf(arrowOf('A'))).toEqual([8, 2, 0])
    expect(holding([4, 4, 0], [4, 0, 0], [0, 4, 0])).toEqual([])
    expect(componentsShown()).toEqual(expect.arrayContaining([[8, 0, 0], [0, 2, 0]]))
  })

  it('Draw on graph for 2D Components adds no arrows: the card’s own arrow shows its components, and gives them back when the picture goes (V4)', () => {
    useVC.setState({ cards: [card(941, 'A', { latex: '4\\hat{i}+4\\hat{j}' })] })
    const a = arrowOf('A')
    const arrow = () => scene().objects[a] as VectorObj
    press('resolve')
    const count = Object.keys(scene().objects).length
    drawShown()
    // Two selectable helper arrows Ax (4, 0) and Ay (0, 4) were added, each with its own chip and
    // its own components "Axx = 4", "Axy = 0" when selected — components of a component.
    expect(Object.keys(scene().objects).length).toBe(count)
    expect(Object.values(scene().objects).filter((o) => /^A(x|y|xx|xy)$/.test(o.name)).map((o) => o.name)).toEqual([])
    expect(arrow().showComponents).toBe(true)
    expect(componentTexts(arrow(), compOf(a)!, scene().settings)).toEqual(['Ax = 4 u', 'Ay = 4 u'])
    // One undo step takes the picture away, and redo brings it back.
    scene().undo()
    expect(!!arrow().showComponents).toBe(false)
    scene().redo()
    expect(arrow().showComponents).toBe(true)
    // Another answer drawn: the arrow goes back to what it was (no components of its own).
    press('mag')
    drawShown()
    expect(!!arrow().showComponents).toBe(false)
    // A student who had "Always show components" on keeps it after the Components picture goes.
    scene().updateObject(a, (d) => void (d.type === 'vector' && (d.showComponents = true)))
    press('resolve')
    drawShown()
    press('mag')
    drawShown()
    expect(arrow().showComponents).toBe(true)
  })

  it('a magnetic force drawn at a stand-in length follows its card when v is retyped (H1)', () => {
    // q is the panel's own 1.6×10⁻¹⁹ C and v × B = k̂: |F| is far too short to see beside v, so it is
    // drawn at the reference length with a note giving its true size.
    useVC.setState({ cards: [card(951, 'v', { latex: '\\hat{i}' }), card(952, 'B', { latex: '\\hat{j}' })] })
    press('lorentz')
    expect(answer('|F|')).toBe('1.6\\times 10^{-19}\\,\\text{N}')
    drawShown()
    const F = vectors().find((o) => o.name === 'F')!.id
    const note = () => Object.values(scene().objects).find((o): o is TextObj => o.type === 'text')
    expect(round(compOf(F)!)).toEqual([0, 0, 1])
    expect(note()?.text).toBe('|F| = 1.6\u00a0×\u00a010⁻¹⁹ N — arrow not to scale')
    // v retyped as 2i doubles F. A stand-in is filed under drawn.parents, never drawn.results, so
    // followAnswer returned at once; and nothing works out an answer card on its own (V1).
    edit('v', { latex: '2\\hat{i}' })
    const now = solveOperation('lorentz', [{ name: 'v', v: [2, 0, 0] }, { name: 'B', v: [0, 1, 0] }], scene().settings, 0, evalNumber(useVC.getState().q))!
    expect(answer('|F|')).toBe('3.2\\times 10^{-19}\\,\\text{N}')
    expect(result().sol.answers).toEqual(now.answers)
    // The drawn stand-in follows (the reference length is now v's 2, the note 3.2×10⁻¹⁹ N), or it
    // is taken off and the answer card says why.
    if (scene().objects[F]) {
      expect(round(compOf(F)!)).toEqual([0, 0, 2])
      expect(note()?.text).toBe('|F| = 3.2\u00a0×\u00a010⁻¹⁹ N — arrow not to scale')
    } else expect(result().stale).toBe(true)
  })

  // Guards added by the fixer: the decisions behind the panel's words and buttons, and the edges.

  it('a stale answer says why — a card unreadable for now, or removed (with its picture only when one came off) — and is not offered for drawing (H2, R2)', () => {
    AB()
    press('sum')
    edit('A', { latex: '' })
    expect(staleSentence(result())).toBe('A vector this was worked out from cannot be read now. Once it can, this answer is worked out again.')
    expect(canDraw(result())).toBe(false)
    // A typed back as it was: the answer follows from the cards again and can be drawn.
    edit('A', { latex: '3\\hat{i}+4\\hat{j}' })
    expect(result().stale).toBe(false)
    expect(canDraw(result())).toBe(true)
    removeCard(912)
    expect(staleSentence(result())).toBe('A vector this was worked out from was removed. Press Add all again for the answer from the vectors you have now.')
    scene().undo()
    expect(result().stale).toBe(false)
    drawShown()
    removeCard(912)
    expect(staleSentence(result())).toBe('A vector this was worked out from was removed, so its picture was taken off the graph. Press Add all again for the answer from the vectors you have now.')
    // The expression box's button is =.
    expect(staleSentence({ ...result(), label: 'Expression' })).toMatch(/Press = again/)
    const src = readSource('src/renderer/src/panels/VectorCalc.tsx')
    expect(src).toMatch(/st\.result\.stale && <div[^>]*>\{staleSentence\(st\.result\)\}/)
    // Draw on graph and the layout chips both ask canDraw.
    expect(src.match(/canDraw\(st\.result\) && \(/g)).toHaveLength(2)
  })

  it('Draw on graph handed a working of vectors no card holds draws them as auxiliary arrows (no chip unless selected, Labels.tsx), never as a second A (V3)', () => {
    useVC.setState({ cards: [card(961, 'A', { latex: '4\\hat{i}+4\\hat{j}' })] })
    drawAnswer(VS.solveAddition([{ name: 'A', v: [1, 2, 0] }, { name: 'B', v: [2, 0, 0] }]), null)
    expect(vectors().filter((o) => !o.auxiliary).map((o) => o.name).sort()).toEqual(['A', 'R'])
    const old = vectors().filter((o) => o.auxiliary && near(compOf(o.id), [1, 2, 0]))
    expect(old).toHaveLength(1)
    expect(old[0].showLabel).toBe(true)
  })

  it('a stand-in answer is the answer: Resultant only is offered for it and keeps its not-to-scale note in view (H1)', () => {
    useVC.setState({ cards: [card(953, 'v', { latex: '\\hat{i}' }), card(954, 'B', { latex: '\\hat{j}' })] })
    press('lorentz')
    drawShown()
    expect(answerOnGraph(scene().objects)).toBe(true)
    setResultOnly(true)
    expect(resultOnlyOn(scene().objects)).toBe(true)
    const inView = Object.values(scene().objects).filter((o) => o.visible && (o.type === 'vector' || o.type === 'text'))
    expect(inView.map((o) => (o.type === 'text' ? 'note' : o.name)).sort()).toEqual(['F', 'note'])
  })

  it('Components gone 3D and back: the picture follows its answer — the 3D picture keeps Ax, Ay and Az, which follow the card, and A shows its own components again once it is in the plane (V3, V4, R6)', () => {
    useVC.setState({ cards: [card(971, 'A', { latex: '4\\hat{i}+4\\hat{j}' })] })
    const arrow = () => scene().objects[arrowOf('A')] as VectorObj
    press('resolve')
    drawShown()
    expect(arrow().showComponents).toBe(true)
    const steps = scene().past.length
    // An arrow's own components have no Az: the picture is drawn again as the 3D one, by itself and
    // with no undo step. It used to come off here and was never drawn again.
    edit('A', { latex: '3\\hat{i}+4\\hat{j}+5\\hat{k}' })
    expect(!!arrow().showComponents).toBe(false)
    expect(result().stale).toBeFalsy()
    expect(answer('Az')).toBe('5')
    expect(holding([3, 0, 0], [0, 4, 0], [0, 0, 5]).sort()).toEqual(['Ax', 'Ay', 'Az'])
    edit('A', { latex: '\\hat{i}+2\\hat{j}+3\\hat{k}' })
    expect(holding([1, 0, 0], [0, 2, 0], [0, 0, 3]).sort()).toEqual(['Ax', 'Ay', 'Az'])
    edit('A', { latex: '5\\hat{i}' })
    expect(arrow().showComponents).toBe(true)
    expect(vectors().map((o) => o.name)).toEqual(['A'])
    expect(scene().past.length).toBe(steps)
  })

  // Round 2 (the checker's FAIL): R1–R5.

  /**
   * The expression box's =, as VectorCalc.tsx `runExpr` and `exprSolution` make the answer: the line
   * worked out from the readable cards, the cards it uses read off its parse tree (namesIn), and a
   * recipe that works the same line out again from them.
   */
  const exprAnswer = (latex: string, named: VS.NamedVec[]) => {
    const scope: Record<string, unknown> = { i: [1, 0, 0], j: [0, 1, 0], k: [0, 0, 1] }
    for (const c of named) scope[c.name] = c.v
    const { src, out } = inDegrees(() => evaluateVectorLine(latex, scope))
    const v = toV3(out)
    if (!v.every(Number.isFinite)) throw new PlainError('This cannot be worked out: something in it is divided by zero.')
    const inputs = named.filter((c) => namesIn(src).includes(c.name))
    const sol: VS.Solution = {
      title: 'Resultant of the expression',
      steps: [],
      answers: [{ label: 'R', tex: texIJK(v, scene().settings) }],
      visual: { vectors: [...inputs.map((x) => ({ name: x.name, v: x.v, role: 'input' as const })), { name: 'R', v, role: 'result' as const }], mode: 'common-tail' }
    }
    return { sol, used: inputs.map((x) => x.name) }
  }
  const typeExpr = (latex: string) => {
    const st = useVC.getState()
    const values = cardValues(st.cards, scene().ev)
    const named = st.cards.flatMap((c, i) => {
      const v = values[i]
      return typeof v === 'string' ? [] : [{ name: c.name, v }]
    })
    const { sol, used } = exprAnswer(latex, named)
    const cards = st.cards.filter((c) => used.includes(c.name)).map((c) => ({ id: c.id, name: c.name }))
    useVC.setState({ result: { sol, label: 'Expression', from: { cards, solve: (n: VS.NamedVec[]) => exprAnswer(latex, n).sol } } })
  }
  /** The vector the shown answer gives, rounded. */
  const resultVector = () => round(result().sol.visual!.vectors.find((x) => x.role === 'result')!.v)

  it('an expression answer uses every card its line names, 2B included: retyping B moves it and its picture, removing B makes it stale (R1)', () => {
    for (const [line, before, after] of [
      ['\\vec{A}+2\\vec{B}', [3, 14, 0], [5, 4, 0]],
      ['2\\vec{A}+\\vec{B}', [6, 13, 0], [7, 8, 0]]
    ] as [string, V3, V3][]) {
      reset()
      AB()
      // A word-boundary search found no B in "A+2B" (2B is one word to it), nor A in "2A+B".
      expect(namesIn(evaluateVectorLine(line, { A: [3, 4, 0], B: [0, 5, 0] }).src)).toEqual(['A', 'B'])
      typeExpr(line)
      expect(result().from!.cards.map((c) => c.name)).toEqual(['A', 'B'])
      expect(resultVector()).toEqual(before)
      drawShown()
      const r = vectors().find((o) => o.name === 'R')!.id
      edit('B', { latex: '\\hat{i}' })
      expect(resultVector()).toEqual(after)
      expect(round(compOf(r)!)).toEqual(after)
      removeCard(912)
      expect(result().stale).toBe(true)
      expect(scene().objects[r]).toBeUndefined()
    }
    // exprSolution moved from the panel into the store (H6): the names are read off its parse tree there.
    const src = readSource('src/renderer/src/panels/vectorCalcStore.ts')
    expect(src).toMatch(/namesIn\(src\)/)
    expect(src).not.toMatch(/\\\\b\$\{/)
  })

  it('typing A through "3i+" to "3i+1j" keeps the Add all picture, then lays it out again in place, with no undo step (R2)', () => {
    AB()
    press('sum')
    drawShown()
    const r = vectors().find((o) => o.name === 'R')!.id
    const b = arrowOf('B')
    const steps = scene().past.length
    edit('A', { latex: '3\\hat{i}+' })
    // Half typed: the answer is stale and the picture waits where it was, as A's arrow does.
    expect(result().stale).toBe(true)
    expect(round(compOf(r)!)).toEqual([3, 9, 0])
    edit('A', { latex: '3\\hat{i}+1\\hat{j}' })
    expect(result().stale).toBe(false)
    expect(resultVector()).toEqual([3, 6, 0])
    expect(round(compOf(r)!)).toEqual([3, 6, 0])
    expect(tailOf(b)).toEqual([3, 1, 0])
    expect(scene().past.length).toBe(steps)
  })

  it('Components drawn, A typed 4i+4j → "8" → "8i": the picture waits through "8", then A shows its components (8, 0) (R2)', () => {
    useVC.setState({ cards: [card(981, 'A', { latex: '4\\hat{i}+4\\hat{j}' })] })
    press('resolve')
    drawShown()
    const steps = scene().past.length
    edit('A', { latex: '8' })
    expect(result().stale).toBe(true)
    expect(componentsShown()).toEqual([[4, 0, 0], [0, 4, 0]])
    edit('A', { latex: '8\\hat{i}' })
    expect(result().stale).toBe(false)
    expect(answers()).toEqual([['Ax', '8'], ['Ay', '0']])
    expect(componentsShown()).toEqual([[8, 0, 0], [0, 0, 0]])
    expect(scene().past.length).toBe(steps)
  })

  it('a selected arrow shows its components; a selected helper such as 3D Components’ Ax does not unless they were turned on (R3, V4)', () => {
    useVC.setState({ cards: [card(985, 'A', { latex: '3\\hat{i}+4\\hat{j}+5\\hat{k}' })] })
    press('resolve')
    drawShown()
    const a = scene().objects[arrowOf('A')] as VectorObj
    const ax = vectors().find((o) => o.name === 'Ax')!
    expect(ax.auxiliary).toBe(true)
    // Selected, Ax was resolved again: "Axx = 3 cm", "Axy = 0 cm" — components of a component.
    expect(showsComponents(ax, true)).toBe(false)
    expect(showsComponents(a, true)).toBe(true)
    expect(showsComponents(a, false)).toBe(false)
    expect(showsComponents({ ...ax, showComponents: true }, false)).toBe(true)
    expect(readSource('src/renderer/src/render/ObjectViews.tsx')).toMatch(/const showComps = showsComponents\(obj, selected\)/)
  })

  it('a Components picture taken off gives its arrow back once: "show components" turned on afterwards outlasts the next Draw on graph (R4)', () => {
    useVC.setState({ cards: [card(991, 'A', { latex: '4\\hat{i}+4\\hat{j}' })] })
    const arrow = () => scene().objects[arrowOf('A')] as VectorObj
    press('resolve')
    drawShown()
    // Another answer is shown now, so Components is an older picture (the shown answer's picture
    // follows its vector into 3D and back, R6): into 3D and back, it comes off on the way and gives
    // the arrow its own setting.
    press('mag')
    edit('A', { latex: '3\\hat{i}+4\\hat{j}+5\\hat{k}' })
    edit('A', { latex: '5\\hat{i}' })
    expect(!!arrow().showComponents).toBe(false)
    // The student turns "Always show components" on for A, then draws the answer shown.
    scene().updateObject(arrowOf('A'), (d) => void (d.type === 'vector' && (d.showComponents = true)))
    drawShown()
    expect(arrow().showComponents).toBe(true)
  })

  it('an answer that cannot be worked out from readable vectors says so, not that one was removed; its picture waits in place (R5)', () => {
    AB()
    typeExpr('\\vec{A}/(\\vec{A}\\cdot\\vec{B})')
    expect(resultVector()).toEqual([0.15, 0.2, 0])
    drawShown()
    const r = vectors().find((o) => o.name === 'R')!.id
    // B turned at right angles to A: A · B = 0, and A/0 cannot be worked out.
    edit('B', { latex: '4\\hat{i}-3\\hat{j}' })
    expect(result().stale).toBe(true)
    expect(staleSentence(result())).toBe('This answer cannot be worked out from the vectors as they are now. Press = again to see why.')
    expect(scene().objects[r]).toBeDefined()
    // B turned back: worked out again, the picture laid out again in place.
    edit('B', { latex: '5\\hat{j}' })
    expect(result().stale).toBe(false)
    expect(round(compOf(r)!)).toEqual([0.15, 0.2, 0])
  })

  // Round 3 (the checker's FAIL): a picture is never lost while its answer is shown and its cards are there.

  /** The scene's own arrow of this name (â is "ahat" there), if it is on the drawing. */
  const arrowNamed = (name: string) => vectors().find((o) => o.name === name)
  const roundedOf = (name: string) => round(compOf(arrowNamed(name)!.id)!)

  it('Unit vector drawn, A switched to size ∠ angle and its size retyped 5 → 0 → 0.8: â is gone while A is the zero vector, drawn again at 0.8, and typing adds no undo step (R6)', () => {
    useVC.setState({ cards: [card(1001, 'A', { latex: '3\\hat{i}+4\\hat{j}' })] })
    press('unit')
    drawShown()
    expect(roundedOf('ahat')).toEqual([0.6, 0.8, 0])
    const steps = scene().past.length
    const redo = scene().future.length
    setEntry(1001, 'polar')
    edit('A', { mag: '0' })
    // The zero vector has no unit vector: the answer says so, and is still the answer for the card.
    expect(answers()).toEqual([['unit vector', '\\text{none: a zero vector has no direction}']])
    expect(result().stale).toBeFalsy()
    expect(arrowNamed('ahat')).toBeUndefined()
    edit('A', { mag: '0.8' })
    // Its picture was lost here for good: layOutAgain refused one arrow where there had been two,
    // the picture was taken off, and nothing ever drew it again.
    expect(result().stale).toBeFalsy()
    expect(answer('unit vector')).toMatch(/0\.6.*0\.8/)
    expect(roundedOf('ahat')).toEqual([0.6, 0.8, 0])
    const a = compOf(arrowOf('A'))!
    expect(Math.hypot(...a)).toBeCloseTo(0.8, 9)
    expect((Math.atan2(a[1], a[0]) * 180) / Math.PI).toBeCloseTo(53.13, 2)
    // Nothing of it is a step of its own: Ctrl+Z still takes the Draw on graph and nothing else.
    expect(scene().past.length).toBe(steps)
    expect(scene().future.length).toBe(redo)
  })

  it('Projection drawn in the student’s layout, A retyped through the zero vector: the picture comes back in the same layout with its arrows at their tails, and typing adds no undo step (R6)', () => {
    AB()
    useVC.setState({ style: 'head-to-tail' })
    press('proj')
    drawShown()
    const b = arrowOf('B')
    expect(roundedOf('proj')).toEqual([2.4, 3.2, 0])
    expect(tailOf(b)).toEqual([3, 4, 0])
    const steps = scene().past.length
    setEntry(911, 'polar')
    edit('A', { mag: '0' })
    expect(answers().map(([label]) => label)).toEqual(['B cos θ', 'proj of B on A'])
    expect(result().stale).toBeFalsy()
    // There is nothing to project onto: no shadow arrow, and B still at A's head (the layout kept).
    expect(arrowNamed('proj')).toBeUndefined()
    expect(tailOf(b)).toEqual([0, 0, 0])
    edit('A', { mag: '0.8' })
    expect(roundedOf('proj')).toEqual([2.4, 3.2, 0])
    expect(round(tailOf(b)!)).toEqual([0.48, 0.64, 0])
    expect(result().stale).toBeFalsy()
    expect(scene().past.length).toBe(steps)
  })

  it('a working with no picture at all takes the picture off quietly, and it is drawn again as soon as the working has one (R6)', () => {
    useVC.setState({ cards: [card(1002, 'A', { latex: '3\\hat{i}+4\\hat{j}' })] })
    // Unit vector, but with no picture for the zero vector, as a working may have none.
    const solve = (vs: VS.NamedVec[], now: SceneSettings) => {
      const sol = solveOperation('unit', vs, now)!
      return vs[0].v.every((x) => x === 0) ? { ...sol, visual: undefined } : sol
    }
    const sol = solve([{ name: 'A', v: [3, 4, 0] }], scene().settings)
    useVC.setState({ result: { sol, label: 'Unit vector', from: { cards: [{ id: 1002, name: 'A' }], solve } } })
    drawShown()
    const steps = scene().past.length
    setEntry(1002, 'polar')
    edit('A', { mag: '0' })
    expect(result().sol.visual).toBeUndefined()
    expect(result().stale).toBeFalsy()
    expect(arrowNamed('ahat')).toBeUndefined()
    edit('A', { mag: '0.8' })
    expect(roundedOf('ahat')).toEqual([0.6, 0.8, 0])
    expect(scene().past.length).toBe(steps)
  })

  it('a card removed while the picture waits gives the arrows it moved back to their tails and nothing is drawn; the undo that brings the card back brings the waiting picture back (R6)', () => {
    AB()
    // B starts at (1, 1), where the student put it; head-to-tail moves it to A's head.
    scene().updateObject(arrowOf('B'), (d) => void (d.type === 'vector' && (d.def = { kind: 'free', tail: [1, 1, 0], comp: [0, 5, 0] })))
    useVC.setState({ style: 'head-to-tail' })
    press('proj')
    drawShown()
    const b = arrowOf('B')
    expect(tailOf(b)).toEqual([3, 4, 0])
    setEntry(911, 'polar')
    edit('A', { mag: '0' })
    expect(arrowNamed('proj')).toBeUndefined()
    removeCard(911)
    expect(result().stale).toBe(true)
    expect(tailOf(b)).toEqual([1, 1, 0])
    expect(arrowNamed('proj')).toBeUndefined()
    scene().undo()
    expect(result().stale).toBe(false)
    edit('A', { mag: '0.8' })
    expect(roundedOf('proj')).toEqual([2.4, 3.2, 0])
  })

  it('an earlier step undone after the picture was drawn again leaves one picture, still the card’s: the older arrows are taken away, not left beside the new ones (R6)', () => {
    useVC.setState({ cards: [card(1004, 'A', { latex: '3\\hat{i}+4\\hat{j}' })] })
    press('unit')
    drawShown()
    // Something the student does after drawing (an empty step is enough): its snapshot holds the picture.
    scene().beginGesture()
    scene().endGesture()
    setEntry(1004, 'polar')
    edit('A', { mag: '0' })
    edit('A', { mag: '0.8' })
    // The undo brings the older arrows back with the older vector, 5 ∠ 53.13°.
    scene().undo()
    expect(vectors().filter((o) => o.name === 'ahat')).toHaveLength(1)
    // The picture is still followed: A turned to 0° gives (1, 0), and there is still one â.
    edit('A', { angle: '0' })
    expect(vectors().filter((o) => o.name === 'ahat')).toHaveLength(1)
    expect(roundedOf('ahat')).toEqual([1, 0, 0])
  })

  it('undoing the Draw on graph of a waiting picture is respected: typing the vector back does not draw it again (R6)', () => {
    useVC.setState({ cards: [card(1003, 'A', { latex: '3\\hat{i}+4\\hat{j}' })] })
    press('unit')
    drawShown()
    setEntry(1003, 'polar')
    edit('A', { mag: '0' })
    scene().undo()
    expect(arrowNamed('ahat')).toBeUndefined()
    edit('A', { mag: '0.8' })
    expect(arrowNamed('ahat')).toBeUndefined()
    expect(result().stale).toBeFalsy()
  })

  // Three minor findings of the independent checkers: what lives outside the drawing's undo history
  // (the lit layout chip and the style of the next lay-out; the card's sentence; Resultant only)
  // must still agree with the drawing after an undo, a redo or a silent redraw.

  /** A layout chip under the answer, as VectorCalc.tsx presses it: the choice is kept, a picture on the graph is laid out again. */
  const chip = (k: Parameters<typeof drawAnswer>[1]) => {
    useVC.setState({ style: k })
    if (answerOnGraph(scene().objects)) drawAnswer(result().sol, k)
  }

  it('a layout chip undone puts the lit chip and the layout of the next retype back with the picture, and a redo brings them forward (M1)', () => {
    AB()
    press('sum')
    drawShown()
    const b = arrowOf('B')
    // Auto is the sum's own head-to-tail: B at A's head.
    expect(tailOf(b)).toEqual([3, 4, 0])
    expect(useVC.getState().style).toBeNull()
    chip('common-tail')
    expect(tailOf(b)).toEqual([0, 0, 0])
    scene().undo()
    expect(tailOf(b)).toEqual([3, 4, 0])
    // The undone chip stayed lit, and the next retype laid the picture out in its layout again.
    expect(useVC.getState().style).toBeNull()
    scene().redo()
    expect(tailOf(b)).toEqual([0, 0, 0])
    expect(useVC.getState().style).toBe('common-tail')
    scene().undo()
    edit('A', { latex: '5\\hat{i}' })
    expect(tailOf(b)).toEqual([5, 0, 0])
    expect(useVC.getState().style).toBeNull()
  })

  it('an undone chip lights the chip that was lit before it, even one whose own layout is the same as another’s, and a chip that changes nothing is no step (M1)', () => {
    AB()
    press('sum')
    drawShown()
    const b = arrowOf('B')
    // Head-to-tail pressed over Auto draws what is there already: no undo step, but it is the choice.
    const steps = scene().past.length
    chip('head-to-tail')
    expect(scene().past.length).toBe(steps)
    chip('parallelogram')
    expect(tailOf(b)).toEqual([0, 0, 0])
    expect(scene().past.length).toBe(steps + 1)
    scene().undo()
    expect(tailOf(b)).toEqual([3, 4, 0])
    expect(useVC.getState().style).toBe('head-to-tail')
    scene().redo()
    expect(useVC.getState().style).toBe('parallelogram')
    // Pressed back and forth, each undo and redo lights the chip its layout was drawn by.
    chip('common-tail')
    chip('head-to-tail')
    scene().undo()
    expect(useVC.getState().style).toBe('common-tail')
    scene().undo()
    expect(useVC.getState().style).toBe('parallelogram')
    scene().undo()
    expect(useVC.getState().style).toBe('head-to-tail')
    scene().redo()
    scene().redo()
    scene().redo()
    expect(useVC.getState().style).toBe('head-to-tail')
    expect(tailOf(b)).toEqual([3, 4, 0])
  })

  it('a redo of a chip after the cards were retyped in between still lights the chip (M1)', () => {
    AB()
    press('sum')
    drawShown()
    chip('common-tail')
    // Typing is no undo step, but it is a change of the drawing: the state the redo comes back to is this one.
    edit('A', { latex: '5\\hat{i}' })
    expect(tailOf(arrowOf('B'))).toEqual([0, 0, 0])
    scene().undo()
    expect(useVC.getState().style).toBeNull()
    scene().redo()
    expect(useVC.getState().style).toBe('common-tail')
  })

  it('a redo of a card’s removal says again that its picture was taken off the graph (M2)', () => {
    AB()
    press('sum')
    drawShown()
    const clause = /, so its picture was taken off the graph\./
    removeCard(912)
    expect(result().stale).toBe(true)
    expect(staleSentence(result())).toMatch(clause)
    scene().undo()
    expect(result().stale).toBe(false)
    expect(result().pictureTakenOff).toBe(false)
    scene().redo()
    expect(result().stale).toBe(true)
    expect(staleSentence(result())).toMatch(clause)
    // And once more round: the card says so every time, not just the second.
    scene().undo()
    scene().redo()
    expect(staleSentence(result())).toMatch(clause)
  })

  it('a redo of a card’s removal never claims a picture that was not on the graph (M2)', () => {
    AB()
    press('sum')
    // Never drawn.
    removeCard(912)
    scene().undo()
    scene().redo()
    expect(result().stale).toBe(true)
    expect(staleSentence(result())).not.toMatch(/picture/)
    // Drawn, and taken away by hand before the card went.
    reset()
    AB()
    press('sum')
    drawShown()
    scene().removeObjects(vectors().filter((o) => o.name === 'R').map((o) => o.id))
    removeCard(912)
    expect(staleSentence(result())).not.toMatch(/picture/)
    scene().undo()
    scene().redo()
    expect(result().stale).toBe(true)
    expect(staleSentence(result())).not.toMatch(/picture/)
  })

  it('Resultant only stays on while a Unit vector picture goes through the zero vector and comes back, with no undo step of its own (M3)', () => {
    useVC.setState({ cards: [card(1011, 'A', { latex: '3\\hat{i}+4\\hat{j}' })] })
    press('unit')
    drawShown()
    setResultOnly(true)
    const a = arrowOf('A')
    expect(resultOnlyOn(scene().objects)).toBe(true)
    const steps = scene().past.length
    const redo = scene().future.length
    setEntry(1011, 'polar')
    edit('A', { mag: '0' })
    // The zero vector has no unit vector: with no answer on the graph nothing is left hidden.
    expect(arrowNamed('ahat')).toBeUndefined()
    expect(scene().objects[a].visible).toBe(true)
    edit('A', { mag: '0.8' })
    expect(roundedOf('ahat')).toEqual([0.6, 0.8, 0])
    // The picture is drawn again with A showing: Resultant only was lost here.
    expect(scene().objects[a].visible).toBe(false)
    expect(arrowNamed('ahat')!.visible).toBe(true)
    expect(resultOnlyOn(scene().objects)).toBe(true)
    expect(scene().past.length).toBe(steps)
    expect(scene().future.length).toBe(redo)
    // The button still works on the picture drawn again.
    setResultOnly(false)
    expect(scene().objects[a].visible).toBe(true)
    expect(resultOnlyOn(scene().objects)).toBe(false)
  })

  it('a picture that was not on Resultant only does not come back on it (M3)', () => {
    useVC.setState({ cards: [card(1012, 'A', { latex: '3\\hat{i}+4\\hat{j}' })] })
    press('unit')
    drawShown()
    // On, and then turned off before the zero vector: nothing is remembered.
    setResultOnly(true)
    setResultOnly(false)
    setEntry(1012, 'polar')
    edit('A', { mag: '0' })
    edit('A', { mag: '0.8' })
    expect(resultOnlyOn(scene().objects)).toBe(false)
    expect(scene().objects[arrowOf('A')].visible).toBe(true)
    // A fresh Draw on graph ends the wait: nothing is held over from the earlier one.
    setResultOnly(true)
    edit('A', { mag: '0' })
    drawShown()
    edit('A', { mag: '0.8' })
    expect(resultOnlyOn(scene().objects)).toBe(false)
  })

  it('Resultant only stays on when a picture is drawn again while its answer is still on the graph (M3)', () => {
    AB()
    // Add all, but a working that leaves a zero B out of its picture, so it cannot be laid out in place.
    const solve = (vs: VS.NamedVec[], now: SceneSettings) => {
      const sol = solveOperation('sum', vs, now)!
      const noB = vs.some((x) => x.name === 'B' && x.v.every((c) => c === 0))
      return noB && sol.visual ? { ...sol, visual: { ...sol.visual, vectors: sol.visual.vectors.filter((x) => x.name !== 'B') } } : sol
    }
    const cards = useVC.getState().cards
    const sol = solve(cards.map((c, i) => ({ name: c.name, v: i ? [0, 5, 0] : [3, 4, 0] })), scene().settings)
    useVC.setState({ result: { sol, label: 'Add all', from: { cards: cards.map((c) => ({ id: c.id, name: c.name })), solve } } })
    drawShown()
    setResultOnly(true)
    expect(resultOnlyOn(scene().objects)).toBe(true)
    const steps = scene().past.length
    edit('B', { latex: '0\\hat{i}+0\\hat{j}' })
    // R is still drawn, now from A alone: A hidden, R shown, as before.
    const r = vectors().find((o) => o.name === 'R')!
    expect(r.visible).toBe(true)
    expect(round(compOf(r.id)!)).toEqual([3, 4, 0])
    expect(scene().objects[arrowOf('A')].visible).toBe(false)
    expect(resultOnlyOn(scene().objects)).toBe(true)
    expect(scene().past.length).toBe(steps)
  })
})

describe('fixb-f9-vector-space — the Vector card keeps typed spaces', () => {
  describe('F9: Vector card maths field dropped typed spaces', () => {
    it('evaluateVectorLine fails on "10Nm\\angle30^{\\circ}" with missing vector Nm error', () => {
      expect(() => evaluateVectorLine('10Nm\\angle30^{\\circ}', {})).toThrow(/Nm/)
    })

    it('evaluateVectorLine succeeds on "10\\;N\\;m\\angle30^{\\circ}" with magnitude 10 and angle 30°', () => {
      const res = evaluateVectorLine('10\\;N\\;m\\angle30^{\\circ}', {})
      expect(res.out).toEqual([expect.closeTo(8.66, 1), expect.closeTo(5, 1), 0])
    })

    it('MathInput.tsx configures mathModeSpace so MathLive inserts space on spacebar', () => {
      const target = process.env.TEST_PATCHED_MATHINPUT
        ? path.resolve(__dirname, '../patch2/MathInput.tsx')
        : path.resolve(__dirname, '../src/renderer/src/ui/MathInput.tsx')
      const code = fs.readFileSync(target, 'utf8')
      expect(code).toContain('mathModeSpace')
    })
  })
})
