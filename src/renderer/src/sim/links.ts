// How a connection between two bodies is worked out from where they are: the natural length of a
// string, the segments of a rope, the rim points of a pulley, the pivot of a hinge. Pure, so the
// panel, the presets and the tests all build links the same way.

import type { BodyDef, Link, LinkKind } from './types'
import type { V3 } from '../math/vec'
import { rotateByEuler } from './rotate'

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

const dist = (p: V3, q: V3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])

/**
 * Where a rope over the wheel leaves its rim: the side nearer each body.
 *
 * The rim points are ±r along the level direction across the wheel's axle: a rope hangs off the
 * two sides of a wheel, whichever way the wheel is turned. Turning the wheel about its own axle
 * (rotation z on a default pulley) must not move them — the first rule after "±r along world x"
 * used the wheel's own x axis, which spun with the axle and sent the rope out of the top and
 * bottom of the wheel. Only a wheel lying flat has no level direction across its axle; then the
 * wheel's own x axis is the best there is.
 */
export function pulleyRim(wheel: BodyDef, posA: V3, posB: V3): { p1: V3; p2: V3 } {
  const r = wheel.size[0]
  const w = wheel.position
  // A pulley is a cylinder, so its axle is its own y axis.
  const axle = rotateByEuler(wheel.rotation, [0, 1, 0])
  const across: V3 = [axle[2], 0, -axle[0]]
  const flat = Math.hypot(across[0], across[2])
  const arm: V3 = flat < 1e-6 ? rotateByEuler(wheel.rotation, [r, 0, 0]) : [(r * across[0]) / flat, 0, (r * across[2]) / flat]
  const one: V3 = [w[0] + arm[0], w[1] + arm[1], w[2] + arm[2]]
  const other: V3 = [w[0] - arm[0], w[1] - arm[1], w[2] - arm[2]]
  // Whichever assignment keeps the two straight runs shortest is the one that does not cross.
  const straight = dist(posA, one) + dist(posB, other)
  const crossed = dist(posA, other) + dist(posB, one)
  return straight <= crossed ? { p1: one, p2: other } : { p1: other, p2: one }
}

/**
 * Mass of each link of a rope carrying `loads` (the dynamic bodies it ties to), cut into `n`
 * segments. A rope that weighs a tenth of what it carries hangs and swings like one; far lighter
 * and the solver loses the fight against the mass ratio and the rope stretches. The old rule
 * capped the whole rope at 5 kg, so under a heavy load it stretched anyway — the floor at a
 * twentieth of the lightest load is what keeps the ratio the solver can hold.
 */
export function ropeLinkMass(loads: number[], n: number): number {
  const lightest = loads.length ? Math.min(...loads) : 4
  const total = Math.max(lightest / 20, Math.min(5, 0.1 * lightest))
  return Math.max(0.02, total / Math.max(1, n))
}

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
