// Driving a drawing from its measurements.
//
// The Measure panel could only ever report. A student who wants BC to be exactly 6.4, or angle
// ACD to be exactly 40°, had to nudge a point with the mouse until the number looked right. These
// work out where the free end has to go for the number to be what was typed, and say plainly when
// nothing can move — a length that is a consequence of other things must not pretend to be
// editable.

import { add, cross, dist, len, normalize, scale, sub, type V3 } from './vec'

/**
 * Where B has to be for the distance from A to be `wanted`, keeping the direction it already has.
 * Returns null when the two points sit on top of each other, since there is then no direction to
 * move along, or when the length asked for is not a usable number.
 */
export function pointAtLength(a: V3, b: V3, wanted: number): V3 | null {
  if (!Number.isFinite(wanted) || wanted <= 0) return null
  const current = dist(a, b)
  if (current < 1e-9) return null
  return add(a, scale(normalize(sub(b, a)), wanted))
}

/**
 * Where C has to be for the angle at the vertex B, between BA and BC, to be `wanted` radians —
 * turning C about the vertex and keeping its distance. The arm turns in the plane the three
 * points already make, so a flat drawing stays flat.
 */
export function pointAtAngle(vertex: V3, fixedArm: V3, moving: V3, wanted: number): V3 | null {
  if (!Number.isFinite(wanted)) return null
  const u = sub(fixedArm, vertex)
  const w = sub(moving, vertex)
  const radius = Math.hypot(w[0], w[1], w[2])
  const uLen = Math.hypot(u[0], u[1], u[2])
  if (radius < 1e-9 || uLen < 1e-9) return null

  const uh = normalize(u)
  // A direction across the fixed arm, in the plane of the three points: the arm is turned in that
  // plane, so a drawing that was flat does not suddenly leave the page.
  const along = uh[0] * w[0] + uh[1] * w[1] + uh[2] * w[2]
  const across: V3 = [w[0] - uh[0] * along, w[1] - uh[1] * along, w[2] - uh[2] * along]
  const acrossLen = Math.hypot(across[0], across[1], across[2])
  // The two arms are already in line, so there is no plane to turn in: fall back to the xy-plane,
  // which is where a flat drawing lives. An arm standing along z has no xy-perpendicular at all
  // (`normalize` hands back the zero vector, never NaN, so a finiteness check did not notice and
  // the point collapsed onto the arm); it turns in the xz-plane instead. "In line" is judged
  // against the arm's own length, because a drawing measured in micrometres is not collinear
  // just because its across-component is small in absolute terms.
  const inPlane: V3 = [-uh[1], uh[0], 0]
  let perp: V3 = acrossLen > 1e-9 * radius ? normalize(across) : len(inPlane) > 1e-9 ? normalize(inPlane) : normalize(cross([0, 1, 0], uh))
  if (len(perp) < 0.5) return null
  // Whatever side the arm was on, however slightly, it stays on: an arm a hair below the fixed
  // arm used to be opened upwards by the fallback, which always pointed to +y.
  if (acrossLen > 0 && perp[0] * across[0] + perp[1] * across[1] + perp[2] * across[2] < 0) perp = scale(perp, -1)

  const c = Math.cos(wanted)
  const s = Math.sin(wanted)
  return add(vertex, [radius * (uh[0] * c + perp[0] * s), radius * (uh[1] * c + perp[1] * s), radius * (uh[2] * c + perp[2] * s)])
}
