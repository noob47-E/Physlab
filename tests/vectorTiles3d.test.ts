// 3D-1 'Try one' tiles (owner, Wed 14 Oct 21:51: "pre-made experiments"): each of lane K's eight vector scenes puts its
// vectors on the panel as cards the panel reads, and works out the answer the gallery says it has, with steps.

import { beforeEach, describe, expect, it } from 'vitest'
import { playVectorTile, shownVectorTile, tileCardName, VECTOR_TILES_3D } from '../src/renderer/src/panels/vectorTiles3d'
import { cardValues, exprSolution, removeCard, useVC, type Card } from '../src/renderer/src/panels/vectorCalcStore'
import { safeCardName } from '../src/renderer/src/math/vectorSolver'
import { DEFAULT_SETTINGS, scene } from '../src/renderer/src/core/store'

beforeEach(() => useVC.setState({ cards: [], result: null }))

describe('the vector tiles in 3D', () => {
  it('are the eight gallery scenes, each with a working', () => {
    expect(VECTOR_TILES_3D.map((t) => t.id)).toEqual(['equilibrium', 'torque', 'plane-normal', 'work', 'direction-cosines', 'tripod', 'relative-velocity', 'parallelepiped'])
  })

  it('name their cards so the panel keeps the names: F₁ is F_1, v_A stays v_A', () => {
    expect(tileCardName('F₁')).toBe('F_1')
    expect(tileCardName('v_A')).toBe('v_A')
    for (const t of VECTOR_TILES_3D) for (const c of t.cards) expect(safeCardName(c.name, '?', [])).toBe(c.name)
  })

  it.each(VECTOR_TILES_3D.map((t) => [t.id, t] as const))('%s: its cards read as its vectors and its answer is the gallery\'s', (_id, tile) => {
    expect(playVectorTile(tile)).toBeNull()
    const st = useVC.getState()
    expect(st.cards.map((c) => c.name)).toEqual(tile.cards.map((c) => c.name))
    expect(cardValues(st.cards, scene().ev)).toEqual(tile.cards.map((c) => c.v))
    const sol = st.result!.sol
    expect(sol.steps.length).toBeGreaterThan(0)
    expect(st.showSteps).toBe(true)
    const want = tile.expected
    if (typeof want === 'object') {
      const r = sol.visual!.vectors.find((v) => v.role === 'result')!.v
      r.forEach((x, i) => expect(x).toBeCloseTo([want.x, want.y, want.z][i], 9))
    } else if (typeof want === 'number') {
      expect(sol.answers.map((a) => a.tex).join(' ')).toMatch(new RegExp(`(^|[^\\d.])${want}(\\.0+)?([^\\d]|$)`))
    } else {
      // Direction angles: alpha, beta and gamma are answered.
      expect(sol.answers.map((a) => a.label + a.tex).join(' ')).toMatch(/alpha|α/)
    }
    expect(shownVectorTile(useVC.getState().cards)).toBe(tile.id)
  })

  it('a card named with a subscript (v_A, F_1) can be used in the expression box and in a card below it', () => {
    const named = [
      { name: 'v_A', v: [4, 2, 1] as [number, number, number] },
      { name: 'v_B', v: [1, 6, 3] as [number, number, number] }
    ]
    const { sol, used } = exprSolution(String.raw`\vec{v_B}-\vec{v_A}`, named, DEFAULT_SETTINGS)
    expect(sol.visual!.vectors.find((v) => v.role === 'result')!.v).toEqual([-3, 4, 2])
    expect(used).toEqual(['v_A', 'v_B'])
    const cards: Card[] = [
      { id: 1, name: 'F_1', entry: 'comp', latex: '(1, 2, 3)', mag: '', angle: '', sceneId: '' },
      { id: 2, name: 'B', entry: 'comp', latex: String.raw`2F_{1}`, mag: '', angle: '', sceneId: '' }
    ]
    expect(cardValues(cards, scene().ev)).toEqual([[1, 2, 3], [2, 4, 6]])
  })

  it('a tile replaces the cards (their arrows go too), and removing one of its cards clears the shown tile', () => {
    playVectorTile(VECTOR_TILES_3D[0])
    playVectorTile(VECTOR_TILES_3D[1])
    const cards = useVC.getState().cards
    expect(cards.map((c) => c.name)).toEqual(['r', 'F'])
    expect(shownVectorTile(cards)).toBe('torque')
    removeCard(cards[0].id)
    expect(shownVectorTile(useVC.getState().cards)).toBeNull()
  })
})
