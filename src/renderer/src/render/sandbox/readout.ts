// I-6: what the Sandbox's drawing reads. Every sub-view (bodies, links, trails, arrows, labels, the join
// preview) takes the run from `readoutRef.current` and never from the engine: SandboxView puts the live world
// here, and in replay the tape goes here instead, so the same drawing serves both.

import type { BodyId, BodyState, Link } from '../../sim/types'
import type { V3 } from '../../math/vec'

export interface SimReadout {
  readonly time: number
  readonly bodyOrder: BodyId[]
  readonly transforms: Float32Array
  state(id: BodyId): BodyState | null
  drawn(id: BodyId): BodyState | null
  linkPath(link: Link): V3[]
}

export const readoutRef: { current: SimReadout | null } = { current: null }
