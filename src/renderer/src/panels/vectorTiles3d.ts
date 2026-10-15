// 3D-1 (owner, Wed 14 Oct 21:51: "pre-made experiments"): what a 'Try one' tile of the Vector Calculator does in 3D. The
// eight scenes of math/vectorScenes3d.ts (lane K) each become cards, typed as the student would type them, and the one
// operation the scene is about, worked out with its steps; the view frames the arrows. A tile replaces the cards on the
// panel (their arrows go with them, as Remove does), so "first card = r, second = F" reads the scene's own vectors.

import { vectorScenes3d, type VectorScene } from '../math/vectorScenes3d'
import type { V3 } from '../math/vec'
import { scene } from '../core/store'
import { fitCamera } from '../render/viewState'
import { partsLatex, partsOf } from './vectorParts'
import { cardValues, exprSolution, explainVectorError, nextCardId, removeCard, runOperation, useVC, type Card } from './vectorCalcStore'

/** How a tile's answer is worked out: one of the panel's operation buttons, or a line in the expression box. */
type Work = { op: string } | { expr: string }

interface VectorTile3D {
  id: string
  title: string
  caption: string
  /** The cards it puts on the panel, named so the panel and the drawing accept the names (F_1, v_A, τ). */
  cards: { name: string; v: V3; units: string }[]
  /** What the scene works out, in the gallery's words. */
  compute: string
  work: Work
  expected: VectorScene['expectedResult']
}

/** Each scene's working, by its id: the operation the scene names, or the expression where no button does it. */
const WORK: Record<string, Work> = {
  equilibrium: { op: 'sum' },
  torque: { op: 'torque' },
  'plane-normal': { op: 'cross' },
  work: { op: 'work' },
  'direction-cosines': { op: 'mag' },
  tripod: { op: 'sum' },
  // v_B − v_A, the velocity of B as Jet A sees it: Relative velocity works out first − second, the other way round.
  'relative-velocity': { expr: String.raw`\vec{v_B}-\vec{v_A}` },
  parallelepiped: { expr: String.raw`\vec{A}\cdot\left(\vec{B}\times\vec{C}\right)` }
}

/** A card name from the gallery's: a subscript digit is written after an underscore (F₁ → F_1), which a card name allows. */
export const tileCardName = (name: string): string => name.replace(/[₀-₉]/g, (d) => `_${d.charCodeAt(0) - 0x2080}`)

/** The eight tiles, in the gallery's order. */
export const VECTOR_TILES_3D: VectorTile3D[] = vectorScenes3d.map((s) => ({
  id: s.id,
  title: s.title,
  caption: s.caption,
  cards: s.vectors.map((v) => ({ name: tileCardName(v.name), v: [v.components.x, v.components.y, v.components.z], units: v.units })),
  compute: s.compute,
  work: WORK[s.id] ?? { op: 'sum' },
  expected: s.expectedResult
}))

/** The tile on the panel and the cards it put there; it stays "shown" while those cards are all still there. */
let lastTile: { id: string; cards: number[] } | null = null

/** The tile shown now (its caption is written under the tiles), or null once the student has removed one of its cards. */
export const shownVectorTile = (cards: Card[]): string | null =>
  lastTile && lastTile.cards.every((id) => cards.some((c) => c.id === id)) ? lastTile.id : null

/** A box round the origin and every arrow tip, the answer's too, for the camera to frame. */
function boxOf(vs: V3[]): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [0, 0, 0]
  const max: [number, number, number] = [0, 0, 0]
  for (const v of vs) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], v[i])
      max[i] = Math.max(max[i], v[i])
    }
  }
  return { min, max }
}

/** Puts a tile's vectors on the panel and works its answer out; returns why not, as the panel says it, or null. */
export function playVectorTile(tile: VectorTile3D): string | null {
  for (const c of useVC.getState().cards) removeCard(c.id)
  const cards: Card[] = tile.cards.map((c) => ({ id: nextCardId(), name: c.name, entry: 'comp', latex: partsLatex(partsOf(c.v)), mag: '1', angle: '0', sceneId: '' }))
  useVC.setState({ cards, result: null, showSteps: true, highlight: 0 })
  lastTile = { id: tile.id, cards: cards.map((c) => c.id) }
  let problem: string | null
  if ('op' in tile.work) problem = runOperation(tile.work.op)
  else {
    const expr = tile.work.expr
    useVC.setState({ expr })
    try {
      const values = cardValues(cards, scene().ev)
      const { sol, used } = exprSolution(expr, cards.map((c, i) => ({ name: c.name, v: values[i] })), scene().settings)
      const from = cards.filter((c) => used.includes(c.name)).map((c) => ({ id: c.id, name: c.name }))
      useVC.setState({ result: { sol, label: 'Expression', from: { cards: from, solve: (named, now) => exprSolution(expr, named, now).sol } } })
      problem = null
    } catch (e) {
      problem = explainVectorError(e)
    }
  }
  const answer = useVC.getState().result?.sol.visual?.vectors.map((v) => v.v) ?? []
  fitCamera(boxOf([...tile.cards.map((c) => c.v), ...answer]))
  return problem
}
