// The card engine's one door (I-7): every card, core and scene, in one list; a card found by id
// and evaluated on a Reading; and the Reading built from the scene by role.

import { CORE_CARDS } from './catalogue'
import { evaluateSpec } from './evaluate'
import { SCENE_CARDS } from './sceneCards'
import { COLLISION_CARDS } from './collisionCards'
import type { CardSpec, CardView, Reading } from './types'
import type { DigitSettings } from '../../math/format'

export { readingOf } from './reading'

/**
 * The lists as one, in order. A card id names one card everywhere (a scene's default cards, a
 * saved choice), so a second card with an id already taken is refused, not quietly shadowed.
 */
export function mergeCards(...lists: CardSpec[][]): CardSpec[] {
  const seen = new Set<string>()
  const out: CardSpec[] = []
  for (const list of lists) {
    for (const c of list) {
      if (seen.has(c.id)) throw new Error(`Two formula cards have the id "${c.id}".`)
      seen.add(c.id)
      out.push(c)
    }
  }
  return out
}

export const CARDS: readonly CardSpec[] = mergeCards(CORE_CARDS, SCENE_CARDS, COLLISION_CARDS)

const BY_ID = new Map(CARDS.map((c) => [c.id, c]))

export const cardById = (id: string): CardSpec | undefined => BY_ID.get(id)

/**
 * The card with this id on a reading, at the student's precision (decimals and decimal places or
 * significant figures — a whole SceneSettings will do). Null when there is no such card, or the
 * reading lacks a role it needs.
 */
export function evaluateCard(id: string, r: Reading, settings: DigitSettings): CardView | null {
  const spec = cardById(id)
  return spec ? evaluateSpec(spec, r, settings) : null
}
