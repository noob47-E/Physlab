// How a connection between two bodies is worked out from where they are: the natural length of a
// string, the segments of a rope, the rim points of a pulley, the pivot of a hinge. Pure, so the
// panel, the presets and the tests all build links the same way.

import type { BodyDef, Link, LinkKind } from './types'
import type { V3 } from '../math/vec'

export const LINK_KINDS: LinkKind[] = ['string', 'rod', 'spring', 'rope', 'pulley', 'hinge', 'weld']

/** How far a body reaches from its centre along a rope: a rope ties to the surface, not the middle. */
export function reachOf(b: BodyDef): number {
  const [a, h, c] = b.size
  switch (b.shape) {
    case 'sphere':
    case 'cylinder':
    case 'capsule':
    case 'pulley':
      return a
    default:
      return Math.min(a, h, c) / 2
  }
}

/** Segments a rope of this length is cut into: short enough to bend, few enough to stay stiff. */
export const ropeSegments = (length: number): number => Math.max(3, Math.min(30, Math.round(length / 0.2)))

/** Where a rope over the wheel leaves its rim: the side nearer each body. */
export function pulleyRim(wheel: BodyDef, posA: V3, posB: V3): { p1: V3; p2: V3 } {
  const r = wheel.size[0]
  const w = wheel.position
  const aLeft = posA[0] <= posB[0]
  const left: V3 = [w[0] - r, w[1], w[2]]
  const right: V3 = [w[0] + r, w[1], w[2]]
  return aLeft ? { p1: left, p2: right } : { p1: right, p2: left }
}

const dist = (p: V3, q: V3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])

/**
 * A link between a and b of the given kind, sized from where the bodies are now (the live
 * positions when a run is playing, the definitions otherwise), so joining never yanks anything.
 * Returns null when the kind needs something that is missing — a pulley without a wheel.
 */
export function makeLink(id: string, kind: LinkKind, a: BodyDef, b: BodyDef, opts: { over?: BodyDef; posA?: V3; posB?: V3 } = {}): Link | null {
  const pa = opts.posA ?? a.position
  const pb = opts.posB ?? b.position
  const gap = dist(pa, pb)
  const base: Link = { id, kind, a: a.id, b: b.id, length: Math.max(0.05, gap), stiffness: 200, damping: 0.5 }
  switch (kind) {
    case 'rope': {
      const length = Math.max(0.2, gap - reachOf(a) - reachOf(b))
      return { ...base, length, segments: ropeSegments(length) }
    }
    case 'pulley': {
      if (!opts.over) return null
      const { p1, p2 } = pulleyRim(opts.over, pa, pb)
      return { ...base, over: opts.over.id, length: dist(pa, p1) + dist(pb, p2) }
    }
    case 'hinge':
      // The hinge sits at b's centre: join a plank to its pivot, a door to its post.
      return { ...base, pivotA: [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], pivotB: [0, 0, 0] }
    default:
      return base
  }
}
