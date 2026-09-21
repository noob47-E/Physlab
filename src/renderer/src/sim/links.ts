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
export const ropeSegments = (length: number): number => Math.max(3, Math.min(60, Math.round(length / 0.2)))

const dist = (p: V3, q: V3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])

/** Length of a polyline through these points. */
export const polylineLength = (pts: V3[]): number => pts.reduce((sum, p, i) => (i ? sum + dist(pts[i - 1], p) : 0), 0)

/**
 * The way a slack rope hangs from a chord: with gravity, as far as the chord allows. A level rope
 * sags straight down; a vertical one has nowhere to sag but sideways, because "down" is along
 * the chord and would fold the rope on top of itself.
 */
function sagDirection(chord: V3, gap: number): V3 {
  if (gap < 1e-9) return [0, -1, 0]
  const u: V3 = [chord[0] / gap, chord[1] / gap, chord[2] / gap]
  // Gravity with its along-the-chord part taken out.
  const perp: V3 = [0 + u[1] * u[0], -1 + u[1] * u[1], 0 + u[1] * u[2]]
  const size = Math.hypot(...perp)
  if (size > 1e-6) return [perp[0] / size, perp[1] / size, perp[2] / size]
  const side: V3 = [u[1], -u[0], 0]
  const s = Math.hypot(...side) || 1
  return [side[0] / s, side[1] / s, side[2] / s]
}

/**
 * Where the joints of a rope of `length`, cut into `n` links, sit when it is first laid between
 * `start` and `end`: n + 1 points, the two ends included.
 *
 * A rope no longer than the gap is laid straight along it. A longer one hangs: the slack goes
 * into a sag below the chord — a parabola, close enough to how a rope hangs — deep enough that
 * the joints are one rope's length apart along the polyline. Without this the chain was laid
 * straight across the gap whatever length was typed, so lengthening a rope could not make it
 * hang and shortening it could not lift.
 */
export function ropeLayout(start: V3, end: V3, length: number, n: number): V3[] {
  const count = Math.max(1, Math.round(n))
  const chord: V3 = [end[0] - start[0], end[1] - start[1], end[2] - start[2]]
  const gap = Math.hypot(...chord)
  const along = (t: number): V3 => [start[0] + chord[0] * t, start[1] + chord[1] * t, start[2] + chord[2] * t]
  if (length <= gap + 1e-9) return Array.from({ length: count + 1 }, (_, i) => along(i / count))
  const down = sagDirection(chord, gap)
  // The parabola of depth d, sampled finely and then resampled at equal steps of arc length,
  // so every link is the same length whichever part of the curve it lies on.
  const fine = Math.max(200, 10 * count)
  const shape = (d: number): V3[] => {
    const curve: V3[] = []
    for (let i = 0; i <= fine; i++) {
      const t = i / fine
      const sag = d * 4 * t * (1 - t)
      const p = along(t)
      curve.push([p[0] + down[0] * sag, p[1] + down[1] * sag, p[2] + down[2] * sag])
    }
    const cum = [0]
    for (let i = 1; i < curve.length; i++) cum.push(cum[i - 1] + dist(curve[i - 1], curve[i]))
    const total = cum[cum.length - 1]
    const out: V3[] = []
    let k = 0
    for (let i = 0; i <= count; i++) {
      const s = (total * i) / count
      while (k + 1 < cum.length - 1 && cum[k + 1] < s) k++
      const span = cum[k + 1] - cum[k] || 1
      const f = Math.min(1, Math.max(0, (s - cum[k]) / span))
      const p = curve[k]
      const q = curve[k + 1]
      out.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f])
    }
    out[0] = [...start]
    out[count] = [...end]
    return out
  }
  // Deeper is longer, so the depth that gives the rope its length lies between none and the
  // length itself (a rope folded double).
  let lo = 0
  let hi = length
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2
    if (polylineLength(shape(mid)) < length) lo = mid
    else hi = mid
  }
  return shape((lo + hi) / 2)
}

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
