// GLM audit findings #3, #16, #17, #18 and #19 (glm-audit/CONFIRMED.md), each shown through the
// real stores: File ▸ New, File ▸ Open, an Example and the typed "clear" keep the student's
// Vector Calculator cards; × · and ∠ read a primed name such as A′; Draw on graph binds the card
// the student named; a head-to-tail picture never leaves an arrow it cannot move standing apart;
// and a graph card says why it has nothing to offer.

import { beforeEach, describe, expect, it } from 'vitest'
import { useScene, blankSceneFile } from '../src/renderer/src/core/store'
import type { SceneObject, SceneSettings, VectorObj } from '../src/renderer/src/core/types'
import { add, type V3 } from '../src/renderer/src/math/vec'
import * as VS from '../src/renderer/src/math/vectorSolver'
import { math, preprocess, toV3 } from '../src/renderer/src/math/expr'
import { runCommand } from '../src/renderer/src/lang/commands'
import { ALL_ARROWS_TAKEN, NO_ARROWS, drawAnswer, evaluateVectorLine, graphCardPrompt, ijkLatex, setResultOnly, startCardSync, useVC, type Card } from '../src/renderer/src/panels/vectorCalcStore'
import { readSource } from './helpers/repo'

const scene = () => useScene.getState()
const card = (id: number, name: string, extra: Partial<Card> = {}): Card => ({ id, name, entry: 'comp', latex: '', mag: '1', angle: '0', sceneId: '', ...extra })
const vecObj = (id: string, name: string, comp: V3, tail: V3 = [0, 0, 0]): SceneObject =>
  ({ id, name, visible: true, locked: false, color: '#4dabf7', showLabel: true, space: 'vectors', type: 'vector', def: { kind: 'free', tail, comp } }) as SceneObject
const pointObj = (id: string, name: string, p: V3): SceneObject =>
  ({ id, name, visible: true, locked: false, color: '#4dabf7', showLabel: true, space: 'vectors', type: 'point', def: { kind: 'free', p } }) as SceneObject
const vectors = () => Object.values(scene().objects).filter((o): o is VectorObj => o.type === 'vector')
const valueOf = (id: string) => {
  const c = scene().ev.values.get(id)
  return c?.type === 'vector' ? { tail: c.tail, comp: c.comp } : undefined
}
const byName = (name: string) => vectors().find((o) => o.name === name)
const cards = () => useVC.getState().cards

beforeEach(() => {
  useVC.setState({ cards: [], result: null, highlight: 0 })
  scene().newScene()
  startCardSync()
})

// ---------------------------------------------------------------------------
// #3 [MUST] — a whole new drawing never deletes the cards
// ---------------------------------------------------------------------------

describe('#3: File ▸ New, File ▸ Open, an Example and "clear" keep every Vector Calculator card', () => {
  /** A = 3i + 4j and B = 2A, typed, each with its arrow on the drawing: the record's own case. */
  const typeAandB = () => {
    useVC.setState({ cards: [card(301, 'A', { latex: '3\\hat{i}+4\\hat{j}' }), card(302, 'B', { latex: '2A' })] })
    expect(cards().every((c) => c.sceneId && scene().objects[c.sceneId])).toBe(true)
  }
  /** Both cards are there with what the student typed, and each is drawn again on the new drawing. */
  const expectKeptAndDrawn = () => {
    expect(cards().map((c) => [c.id, c.name, c.entry, c.latex])).toEqual([
      [301, 'A', 'comp', '3\\hat{i}+4\\hat{j}'],
      [302, 'B', 'comp', '2A']
    ])
    const [a, b] = cards().map((c) => c.sceneId)
    expect(scene().objects[a]?.name).toBe('A')
    expect(scene().objects[b]?.name).toBe('B')
    expect(valueOf(a)?.comp).toEqual([3, 4, 0])
    expect(valueOf(b)?.comp).toEqual([6, 8, 0])
  }

  it('File ▸ New (newScene) keeps A = 3i + 4j and B = 2A and draws them again', () => {
    typeAandB()
    scene().newScene()
    expectKeptAndDrawn()
  })

  it('the typed "clear" and "new" commands keep them too', async () => {
    typeAandB()
    await runCommand('clear')
    expectKeptAndDrawn()
    await runCommand('new')
    expectKeptAndDrawn()
  })

  it('File ▸ Open (loadScene) of another file keeps them, beside the file’s own drawing', () => {
    typeAandB()
    scene().loadScene({ ...blankSceneFile(), objects: [vecObj('gfvF', 'F', [1, 0, 0]), pointObj('gfvP', 'P', [2, 2, 0])] })
    expectKeptAndDrawn()
    // The file's own objects are all there, untouched.
    expect(byName('F')?.id).toBe('gfvF')
    expect(scene().objects.gfvP?.name).toBe('P')
  })

  it('reopening the file the cards were saved in finds their arrows again: no second copy', () => {
    typeAandB()
    const ids = cards().map((c) => c.sceneId)
    const saved = JSON.parse(JSON.stringify(scene().serialize()))
    scene().newScene()
    scene().loadScene(saved)
    expect(cards().map((c) => c.latex)).toEqual(['3\\hat{i}+4\\hat{j}', '2A'])
    expect(vectors().filter((o) => o.name === 'A' || o.name === 'B')).toHaveLength(2)
    // The saved arrows are the cards' arrows again, under the ids the file holds.
    expect(ids.every((id) => scene().objects[id])).toBe(true)
    expect(cards().map((c) => c.sceneId)).toEqual(ids)
  })

  it('an Example (a new drawing, then its commands) keeps them beside the example’s own vectors', async () => {
    typeAandB()
    // runExample in panels/Examples.tsx: newScene, then each of the example's commands. The
    // "two forces at 120°" example, whose names are its own.
    scene().newScene()
    for (const c of ['k = 120', 'F1 = <5, 0>', 'F2 = 5 ∠ k°', 'R = F1 + F2']) await runCommand(c)
    expectKeptAndDrawn()
    expect(['F1', 'F2', 'R'].every((n) => byName(n))).toBe(true)
    expect(readSource('src/renderer/src/panels/Examples.tsx')).toMatch(/s\.newScene\(\)\s*\n\s*s\.setViewMode/)
  })

  it('a graph card whose arrow left with the old drawing becomes a typed card holding its vector', () => {
    scene().addObjects([vecObj('gfvG', 'G', [2, 1, 0], [1, 1, 0])])
    useVC.setState({ cards: [card(311, 'G', { entry: 'scene', sceneId: 'gfvG' })] })
    expect(cards()[0].last).toEqual([2, 1, 0])
    scene().newScene()
    expect(cards()).toHaveLength(1)
    expect(cards()[0]).toMatchObject({ id: 311, name: 'G', entry: 'comp', latex: ijkLatex([2, 1, 0]) })
    expect(valueOf(cards()[0].sceneId)?.comp).toEqual([2, 1, 0])
  })

  it('a card deleted before File ▸ New does not come back when a later file reuses its arrow’s id', () => {
    scene().addObjects([vecObj('gfvH', 'H', [1, 1, 0])])
    useVC.setState({ cards: [card(321, 'H', { entry: 'scene', sceneId: 'gfvH' })] })
    // Deleting the arrow takes the card; undo would bring it back...
    scene().removeObjects(['gfvH'])
    expect(cards()).toEqual([])
    // ...but after File ▸ New there is no undo, so a file with an object of that id is not the card.
    scene().newScene()
    scene().loadScene({ ...blankSceneFile(), objects: [vecObj('gfvH', 'H', [5, 5, 0])] })
    expect(cards()).toEqual([])
  })

  it('an ordinary delete still takes the card with its arrow (Fix 25 is unchanged)', () => {
    typeAandB()
    scene().removeObjects([cards()[1].sceneId])
    expect(cards().map((c) => c.name)).toEqual(['A'])
    scene().undo()
    expect(cards().map((c) => c.name)).toEqual(['A', 'B'])
  })
})

// ---------------------------------------------------------------------------
// #16 — × · and ∠ with primed names (A′ is what the app calls the point after Z, and a copy of A)
// ---------------------------------------------------------------------------

describe('#16: × and · and ∠ read a primed name such as A′ whole', () => {
  it('rewrites × and · around A′ and B″ into one call each', () => {
    expect(preprocess('R = 2 × A′')).toBe('R = timesOrCross(2, A′)')
    expect(preprocess('A′ · B')).toBe('dot(A′, B)')
    expect(preprocess('A″ × B′')).toBe('timesOrCross(A″, B′)')
    expect(preprocess('10 ∠ θ′°')).not.toMatch(/\)′/)
    expect(preprocess('10 ∠ A′')).toBe('polarVec(10, A′)')
  })

  it('works them out: 2 × A′ = (6, 8, 0), A′ · B = 11, 10 ∠ a′ with a′ = 90° is (0, 10, 0)', () => {
    const A1 = math.matrix([3, 4, 0])
    const B = math.matrix([1, 2, 0])
    expect(toV3(math.evaluate(preprocess('2 × A′'), { 'A′': A1 }))).toEqual([6, 8, 0])
    expect(math.evaluate(preprocess('A′ · B'), { 'A′': A1, B })).toBe(11)
    const polar = toV3(math.evaluate(preprocess('10 ∠ a′°'), { 'a′': 90 }))
    expect(polar[0]).toBeCloseTo(0, 12)
    expect(polar[1]).toBeCloseTo(10, 12)
  })

  it('the command bar computes R = 2 × A′ from the drawing’s A′', async () => {
    scene().addObjects([vecObj('gfvA1', 'A′', [3, 4, 0])])
    await runCommand('R = 2 × A′')
    const r = byName('R')
    expect(r).toBeDefined()
    expect(valueOf(r!.id)?.comp).toEqual([6, 8, 0])
  })

  it('a Vector Calculator line 2 × A′ reads a card named A′', () => {
    const { out } = evaluateVectorLine('2\\times A′', { 'A′': [3, 4, 0] })
    expect(toV3(out)).toEqual([6, 8, 0])
  })
})

// ---------------------------------------------------------------------------
// #17 — Draw on graph binds the card the student named, not the first equal one
// ---------------------------------------------------------------------------

describe('#17: Draw on graph uses the arrow of the card it names', () => {
  it('with A = B = 3i + 4j, drawing "B" uses B’s arrow, and retyping B redraws the answer', () => {
    useVC.setState({ cards: [card(401, 'A', { latex: '3\\hat{i}+4\\hat{j}' }), card(402, 'B', { latex: '3\\hat{i}+4\\hat{j}' })] })
    const [a, b] = cards().map((c) => c.sceneId)
    // The expression box's "B": B is the one input, R = B the answer.
    const solve = (vs: VS.NamedVec[], settings: SceneSettings) => VS.solveAddition(vs, 'R', settings)
    const sol = solve([{ name: 'B', v: [3, 4, 0] }], scene().settings)
    useVC.setState({ result: { sol, label: 'Expression', from: { cards: [{ id: 402, name: 'B' }], solve } } })
    drawAnswer(sol, null)
    // Resultant only hides what the answer was drawn from: B, not A.
    setResultOnly(true)
    expect(scene().objects[b].visible).toBe(false)
    expect(scene().objects[a].visible).toBe(true)
    setResultOnly(false)
    // Retyping B is noticed: R follows B. It stayed at (3, 4) while A was the arrow watched.
    useVC.setState({ cards: cards().map((c) => (c.id === 402 ? { ...c, latex: '5\\hat{i}' } : c)) })
    const r = byName('R')!
    expect(valueOf(r.id)?.comp).toEqual([5, 0, 0])
  })
})

// ---------------------------------------------------------------------------
// #18 — head to tail with an arrow drawn between two points
// ---------------------------------------------------------------------------

describe('#18: a head-to-tail picture with an arrow that cannot be moved is still joined up', () => {
  it('A drawn from P(1, 1) to Q(4, 5) and B = 2i: A is drawn again at the start, B from its head, R closes it', () => {
    scene().addObjects([pointObj('gfvP1', 'P', [1, 1, 0]), pointObj('gfvQ1', 'Q', [4, 5, 0])])
    scene().addObjects([{ id: 'gfvPQ', name: 'A', visible: true, locked: false, color: '#ff6b6b', showLabel: true, space: 'vectors', type: 'vector', def: { kind: 'points', a: 'gfvP1', b: 'gfvQ1' } } as SceneObject])
    useVC.setState({ cards: [card(501, 'A', { entry: 'scene', sceneId: 'gfvPQ' }), card(502, 'B', { latex: '2\\hat{i}' })] })
    const b = cards()[1].sceneId
    const sol = VS.solveAddition([{ name: 'A', v: [3, 4, 0] }, { name: 'B', v: [2, 0, 0] }])
    drawAnswer(sol, 'head-to-tail')
    const picture = scene().past.length
    // The student's A stays between its points.
    expect(valueOf('gfvPQ')).toEqual({ tail: [1, 1, 0], comp: [3, 4, 0] })
    // A copy of A, in A's colour and labelled A, stands where the layout put A.
    const copy = vectors().find((o) => o.id !== 'gfvPQ' && o.id !== b && o.name !== 'R' && valueOf(o.id)?.comp.every((x, k) => x === [3, 4, 0][k]))
    expect(copy).toBeDefined()
    expect(copy!.color).toBe('#ff6b6b')
    expect(copy!.label ?? copy!.name).toBe('A')
    const copyAt = valueOf(copy!.id)!
    // B starts at the copy's head and R runs from the copy's tail to B's head: one closed triangle.
    expect(valueOf(b)?.tail).toEqual(add(copyAt.tail, copyAt.comp))
    const r = valueOf(byName('R')!.id)!
    expect(r.tail).toEqual(copyAt.tail)
    expect(add(r.tail, r.comp)).toEqual(add(valueOf(b)!.tail, valueOf(b)!.comp))
    // Resultant only hides the student's A as well as its copy.
    setResultOnly(true)
    expect(scene().objects.gfvPQ.visible).toBe(false)
    expect(scene().objects[copy!.id].visible).toBe(false)
    setResultOnly(false)
    // One undo takes the whole picture away, copy included (after the two Resultant only steps).
    while (scene().past.length > picture) scene().undo()
    scene().undo()
    expect(scene().objects[copy!.id]).toBeUndefined()
    expect(valueOf(b)?.tail).toEqual([0, 0, 0])
  })

  it('an arrow between points that already starts where the layout wants it is used as it is', () => {
    scene().addObjects([pointObj('gfvO2', 'O', [0, 0, 0]), pointObj('gfvQ2', 'Q', [3, 4, 0])])
    scene().addObjects([{ id: 'gfvOQ', name: 'A', visible: true, locked: false, color: '#ff6b6b', showLabel: true, space: 'vectors', type: 'vector', def: { kind: 'points', a: 'gfvO2', b: 'gfvQ2' } } as SceneObject])
    useVC.setState({ cards: [card(511, 'A', { entry: 'scene', sceneId: 'gfvOQ' }), card(512, 'B', { latex: '2\\hat{i}' })] })
    const before = vectors().length
    drawAnswer(VS.solveAddition([{ name: 'A', v: [3, 4, 0] }, { name: 'B', v: [2, 0, 0] }]), 'head-to-tail')
    // Only R is new: no copy of A.
    expect(vectors().length).toBe(before + 1)
    expect(valueOf(cards()[1].sceneId)?.tail).toEqual([3, 4, 0])
  })

  // Review round 1: the copy must be the only A the student sees, must not be offered to a graph
  // card, and a relayout after an edit must join the picture up the same way the first draw does.

  /** A drawn from P to Q as a points arrow, B = 2i, drawn head to tail with a recipe to follow. */
  const pointsAandB = (p: V3, q: V3) => {
    scene().addObjects([pointObj('gfvP3', 'P', p), pointObj('gfvQ3', 'Q', q)])
    scene().addObjects([{ id: 'gfvPQ3', name: 'A', visible: true, locked: false, color: '#ff6b6b', showLabel: true, space: 'vectors', type: 'vector', def: { kind: 'points', a: 'gfvP3', b: 'gfvQ3' } } as SceneObject])
    useVC.setState({ cards: [card(521, 'A', { entry: 'scene', sceneId: 'gfvPQ3' }), card(522, 'B', { latex: '2\\hat{i}' })] })
    const solve = (vs: VS.NamedVec[], settings: SceneSettings) => VS.solveAddition(vs, 'R', settings)
    const sol = solve([{ name: 'A', v: add(q, neg3(p)) }, { name: 'B', v: [2, 0, 0] }], scene().settings)
    useVC.setState({ result: { sol, label: 'Add all', from: { cards: [{ id: 521, name: 'A' }, { id: 522, name: 'B' }], solve } } })
    drawAnswer(sol, 'head-to-tail')
    return cards()[1].sceneId
  }
  const neg3 = (v: V3): V3 => [-v[0], -v[1], -v[2]]
  /** The visible arrows that read "A" on the graph. */
  const visibleAs = () => vectors().filter((o) => o.visible && (o.label ?? o.name) === 'A')
  /** R runs from the first arrow's tail to B's head, B from A's head: one joined triangle. */
  const expectJoined = (b: string, a: V3) => {
    const [shown] = visibleAs()
    const at = valueOf(shown.id)!
    expect(at.comp).toEqual(a)
    expect(at.tail).toEqual([0, 0, 0])
    expect(valueOf(b)?.tail).toEqual(add(at.tail, at.comp))
    const r = valueOf(byName('R')!.id)!
    expect(r.tail).toEqual(at.tail)
    expect(add(r.tail, r.comp)).toEqual(add(valueOf(b)!.tail, valueOf(b)!.comp))
  }

  it('the student’s own A is hidden while its copy stands in for it, so only one A shows', () => {
    const b = pointsAandB([1, 1, 0], [4, 5, 0])
    expect(scene().objects.gfvPQ3.visible).toBe(false)
    expect(visibleAs()).toHaveLength(1)
    expectJoined(b, [3, 4, 0])
    // Resultant only and back: the copy returns, the original stays hidden behind it.
    setResultOnly(true)
    setResultOnly(false)
    expect(scene().objects.gfvPQ3.visible).toBe(false)
    expect(visibleAs()).toHaveLength(1)
  })

  it('the original comes back when the picture is taken away, undone or its copy deleted', () => {
    // Taken away: B's arrow is deleted, so the answer can no longer be worked out.
    let b = pointsAandB([1, 1, 0], [4, 5, 0])
    scene().removeObjects([b])
    expect(byName('R')).toBeUndefined()
    expect(scene().objects.gfvPQ3.visible).toBe(true)
    expect(visibleAs()).toHaveLength(1)
    // Undone.
    useVC.setState({ cards: [], result: null })
    scene().newScene()
    b = pointsAandB([1, 1, 0], [4, 5, 0])
    expect(b).toBeTruthy()
    scene().undo()
    expect(scene().objects.gfvPQ3.visible).toBe(true)
    expect(visibleAs()).toHaveLength(1)
    // The copy deleted by hand.
    scene().redo()
    const copy = visibleAs()[0]
    expect(copy.id).not.toBe('gfvPQ3')
    scene().removeObjects([copy.id])
    expect(scene().objects.gfvPQ3.visible).toBe(true)
  })

  it('the copy is not offered to a graph card: it is auxiliary, yet keeps its label', () => {
    pointsAandB([1, 1, 0], [4, 5, 0])
    const [copy] = visibleAs()
    expect(copy.id).not.toBe('gfvPQ3')
    expect(copy.auxiliary).toBe(true)
    expect(copy.showLabel).toBe(true)
    expect(readSource('src/renderer/src/panels/VectorCalc.tsx')).toMatch(/o\.type === 'vector' && !o\.auxiliary/)
  })

  it('an edit that leaves A unable to sit at the start is laid out with a copy, not left apart', () => {
    // A from O to Q starts where the layout wants it, so the first draw uses it as it is.
    const b = pointsAandB([0, 0, 0], [3, 4, 0])
    expect(scene().objects.gfvPQ3.visible).toBe(true)
    expectJoined(b, [3, 4, 0])
    // Dragging P to (1, 1) changes A to 2i + 3j between its points: a copy stands at the start.
    scene().updateObject('gfvP3', (d) => {
      if (d.type === 'point' && d.def.kind === 'free') d.def = { kind: 'free', p: [1, 1, 0] }
    })
    expect(valueOf('gfvPQ3')).toEqual({ tail: [1, 1, 0], comp: [2, 3, 0] })
    expect(scene().objects.gfvPQ3.visible).toBe(false)
    expect(visibleAs()).toHaveLength(1)
    expectJoined(b, [2, 3, 0])
    expect(visibleAs()[0].auxiliary).toBe(true)
    // Undoing the drag brings the student's own A back at the start, the picture joined to it.
    scene().undo()
    expect(scene().objects.gfvPQ3.visible).toBe(true)
    expect(visibleAs().map((o) => o.id)).toEqual(['gfvPQ3'])
    expectJoined(b, [3, 4, 0])
    // Redoing it brings the same copy back, not a second one.
    const copies = () => vectors().filter((o) => o.id !== 'gfvPQ3' && (o.label ?? o.name) === 'A')
    scene().redo()
    expect(copies()).toHaveLength(1)
    expect(scene().objects.gfvPQ3.visible).toBe(false)
    expectJoined(b, [2, 3, 0])
  })

  it('a parallelogram’s far side follows the copy that replaces an arrow in a relayout', () => {
    scene().addObjects([pointObj('gfvP4', 'P', [0, 0, 0]), pointObj('gfvQ4', 'Q', [3, 4, 0])])
    scene().addObjects([{ id: 'gfvPQ4', name: 'A', visible: true, locked: false, color: '#ff6b6b', showLabel: true, space: 'vectors', type: 'vector', def: { kind: 'points', a: 'gfvP4', b: 'gfvQ4' } } as SceneObject])
    useVC.setState({ cards: [card(531, 'A', { entry: 'scene', sceneId: 'gfvPQ4' }), card(532, 'B', { latex: '2\\hat{i}' })] })
    const solve = (vs: VS.NamedVec[], settings: SceneSettings) => VS.solveAddition(vs, 'R', settings)
    const sol = solve([{ name: 'A', v: [3, 4, 0] }, { name: 'B', v: [2, 0, 0] }], scene().settings)
    useVC.setState({ result: { sol, label: 'Add all', from: { cards: [{ id: 531, name: 'A' }, { id: 532, name: 'B' }], solve } } })
    drawAnswer(sol, 'parallelogram')
    scene().updateObject('gfvP4', (d) => {
      if (d.type === 'point' && d.def.kind === 'free') d.def = { kind: 'free', p: [1, 1, 0] }
    })
    const [copy] = visibleAs()
    expect(copy.id).not.toBe('gfvPQ4')
    // No construction point hangs on the hidden original any more.
    const heads = Object.values(scene().objects).filter((o) => o.type === 'point' && o.def.kind === 'vectorHead')
    expect(heads.some((o) => o.type === 'point' && o.def.kind === 'vectorHead' && o.def.vector === 'gfvPQ4')).toBe(false)
    expect(heads.some((o) => o.type === 'point' && o.def.kind === 'vectorHead' && o.def.vector === copy.id)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// #19 — a graph card with nothing to offer says why
// ---------------------------------------------------------------------------

describe('#19: "no arrow on the graph yet" only when there is none', () => {
  it('says the arrows are all taken when every arrow belongs to another card', () => {
    expect(graphCardPrompt(0, 0, 'pick one')).toBe(NO_ARROWS)
    expect(graphCardPrompt(2, 0, 'pick one')).toBe(ALL_ARROWS_TAKEN)
    expect(graphCardPrompt(2, 1, 'pick one')).toBe('pick one')
    expect(ALL_ARROWS_TAKEN).not.toBe(NO_ARROWS)
    expect(ALL_ARROWS_TAKEN).toMatch(/already/)
  })

  it('the panel asks with the number of arrows on the graph, not only the ones on offer', () => {
    const src = readSource('src/renderer/src/panels/VectorCalc.tsx')
    expect(src).toMatch(/graphCardPrompt\(sceneVectors\.length, offered\(card\)\.length/)
    expect(src).not.toMatch(/\? \(v as string\) : NO_ARROWS/)
  })
})
