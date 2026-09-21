// Which drawing an object belongs to. Vectors, Geometry, Graphing and Lab Data share one scene
// store, so a triangle drawn in Geometry used to turn up behind the vectors and the other way
// round. Every object now remembers the space it was made in and is only shown there. An object
// with no space is shown everywhere: that is what an object made where no drawing is active gets,
// and what a format-1 file's objects keep when nothing in the file says where they belong
// (`core/migrate.ts` stamps the ones it can tell).

import type { ModeId } from '../app/modes'
import type { ObjId, SceneObject } from './types'

export type Space = 'vectors' | 'shapes' | 'graphing' | 'lab'

/** The drawing a mode looks at; null means the mode has no drawing of its own and shows all. */
export function spaceOf(mode: ModeId): Space | null {
  switch (mode) {
    case 'calculator':
    case 'vectors':
    case 'problems':
      return 'vectors'
    case 'shapes':
      return 'shapes'
    case 'graphing':
      return 'graphing'
    case 'lab':
      return 'lab'
    default:
      return null
  }
}

/** The mode a space is shown in, for "go to" buttons. */
export const modeOfSpace: Record<Space, ModeId> = { vectors: 'vectors', shapes: 'shapes', graphing: 'graphing', lab: 'lab' }

export const SPACE_LABELS: Record<Space, string> = { vectors: 'Vectors', shapes: 'Geometry', graphing: 'Graphing', lab: 'Lab Data' }

export const visibleIn = (o: SceneObject | undefined, space: Space | null): boolean => !!o && (!space || !o.space || o.space === space)

/** The ids to draw, list and pick right now, in scene order. */
export const visibleOrder = (order: ObjId[], objects: Record<ObjId, SceneObject>, space: Space | null): ObjId[] =>
  space ? order.filter((id) => visibleIn(objects[id], space)) : order
