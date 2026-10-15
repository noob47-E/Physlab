// 3-axis angle measurement for any moving body: the angle the body has turned from its start
// orientation, on each world axis. Uses axis-angle extraction: for a quaternion q = [w, x, y, z],
// the rotation angle about each axis is 2 * atan2(q_axis, w), giving angles directly without
// gimbal lock. This keeps unwrapped angles continuous and avoids decomposition ambiguity.

import { eulerToQuat } from './rotate'

const DEG = 180 / Math.PI

/** Quaternion in [w, x, y, z] format. */
type Quat4 = readonly [number, number, number, number]

/**
 * The angle in degrees a body has turned from identity on three axes, derived from a quaternion
 * (typically q_now * inverse(q_start)). Returns [x, y, z] in degrees. Handles non-unit
 * quaternions by normalizing, and avoids NaN.
 */
export function angleDegrees(quat: readonly [number, number, number, number]): [number, number, number] {
  // Normalize the quaternion to handle slightly denormalized values from the engine
  let [w, x, y, z] = quat
  const mag = Math.hypot(w, x, y, z)
  if (mag > 0) {
    w /= mag
    x /= mag
    y /= mag
    z /= mag
  }

  // Extract rotation angle about each world axis using axis-angle decomposition:
  // For a quaternion [w, x, y, z], the rotation angle about each axis is 2 * atan2(q_axis, w)
  // This gives continuous angles and handles unwrapping naturally.
  // Past half a turn w is negative, and 2 atan2(c, w) of an axis the body barely turned about is ±360° (0j2: a box spun
  // 200° about y read +360° about x and z). The axis it turns about most keeps the unwrapped reading, and so does any axis
  // whose part is at least |w| (a slanting axis, past half a turn on each); a smaller part is read from the same turn
  // written the other way round (−q), which is under 90° then.
  const v = [x, y, z]
  const sizes = v.map(Math.abs)
  const main = w < 0 ? sizes.indexOf(Math.max(...sizes)) : -1
  const minor = (i: number): boolean => main >= 0 && i !== main && sizes[i] < -w
  const about = (i: number): number => (minor(i) ? 2 * Math.atan2(-v[i], -w) : 2 * Math.atan2(v[i], w)) * DEG
  return [about(0), about(1), about(2)]
}

/**
 * The turning speed in degrees per second about three axes, from the angular velocity vector (rad/s).
 */
export function angularSpeedDegrees(angularVel: readonly [number, number, number]): [number, number, number] {
  return [angularVel[0] * DEG, angularVel[1] * DEG, angularVel[2] * DEG]
}

/** Quaternion conjugate (inverse for unit quaternions): [w, -x, -y, -z]. */
function quatInverse(q: Quat4): [number, number, number, number] {
  return [q[0], -q[1], -q[2], -q[3]]
}

/** Quaternion multiplication q_a * q_b in [w, x, y, z] format. */
function quatMul(a: Quat4, b: Quat4): [number, number, number, number] {
  const [wa, xa, ya, za] = a
  const [wb, xb, yb, zb] = b
  return [
    wa * wb - xa * xb - ya * yb - za * zb,
    wa * xb + xa * wb + ya * zb - za * yb,
    wa * yb - xa * zb + ya * wb + za * xb,
    wa * zb + xa * yb - ya * xb + za * wb
  ]
}

/**
 * Convert from [x, y, z, w] (Jolt format) to [w, x, y, z] (our format).
 */
function joltToOurQuat(jq: readonly [number, number, number, number]): [number, number, number, number] {
  return [jq[3], jq[0], jq[1], jq[2]]
}

/**
 * The 3-axis angles a body has rotated from its start orientation to now.
 * Takes the current quaternion (Jolt [x,y,z,w] format) and start Euler angles (degrees).
 */
export function angleDifference(
  currentRotQuatJolt: readonly [number, number, number, number],
  startEulerDegrees: readonly [number, number, number]
): [number, number, number] {
  // Convert start Euler to our quat format via Jolt format
  const startQuatJolt = eulerToQuat(startEulerDegrees as [number, number, number])
  const startQuat = joltToOurQuat(startQuatJolt)

  // Convert current quat from Jolt to our format
  const currentQuat = joltToOurQuat(currentRotQuatJolt)

  // Calculate the difference: q_diff = q_current * inverse(q_start)
  const invStart = quatInverse(startQuat)
  const diffQuat = quatMul(currentQuat, invStart)

  return angleDegrees(diffQuat)
}

// Cache for largestAngleSoFar results: per tape (0j2: keyed by a string alone, a new run of the same body read the last
// run's maxima), then by (bodyId, startRotation); stores a map of whole step to cached maxima. An entry is thrown away when
// the tape's first step, its revision or the branch changes (a branch rewrites the same tape after its step).
interface AngleCacheEntry {
  first: number
  revision: number
  branch: unknown
  stepToMaxima: Map<number, [number, number, number]>
}
const largestAngleSoFarCache = new WeakMap<object, Map<string, AngleCacheEntry>>()

/**
 * The largest absolute angle per axis from the start of the tape to the playhead.
 * Uses caching to avoid recomputing: caches results at each visited playhead and reuses
 * previously computed maxima when moving to new playheads.
 * @param tape - TapeView with first, last, layout, and record() method
 * @param playhead - Step position in the tape (clamped to first..last)
 * @param bodyId - ID of the body to read
 * @param startRotation - Start rotation in Euler degrees [x, y, z] format (from BodyDef)
 * @param branch - What the tape was branched from (the recorder's `tapes.parent`): a new one means its records changed
 * @returns [maxAbsX, maxAbsY, maxAbsZ] in degrees
 */
export function largestAngleSoFar(
  tape: { first: number; last: number; layout: { bodies: readonly string[] }; record(step: number): Float32Array | null; revision?: number },
  playhead: number,
  bodyId: string,
  startRotation: readonly [number, number, number],
  branch: unknown = null
): [number, number, number] {
  if (tape.last < tape.first) return [0, 0, 0]
  const index = tape.layout.bodies.indexOf(bodyId)
  if (index < 0) return [0, 0, 0]

  // The whole step at or before the playhead (0j2): a fractional one, every frame of a slow replay, was cached as a step of
  // its own, and the scan from it began a fraction past the next whole step, so it skipped steps and then froze.
  const at = Math.floor(Math.min(tape.last, Math.max(tape.first, playhead)))
  const revision = tape.revision ?? 0
  const cacheKey = `${bodyId}:${JSON.stringify(startRotation)}`

  // Get or create cache entry for this tape/body/rotation combo
  let perTape = largestAngleSoFarCache.get(tape)
  if (!perTape) {
    perTape = new Map()
    largestAngleSoFarCache.set(tape, perTape)
  }
  let entry = perTape.get(cacheKey)
  if (!entry || entry.revision !== revision || entry.first !== tape.first || entry.branch !== branch) {
    entry = { first: tape.first, revision, branch, stepToMaxima: new Map() }
    perTape.set(cacheKey, entry)
  }

  // Check if we already have this playhead cached
  if (entry.stepToMaxima.has(at)) {
    return [...entry.stepToMaxima.get(at)!]
  }

  // Find the largest cached step before 'at' to reuse its maxima (none: the scan starts at the tape's first record)
  let startStep = tape.first - 1
  let maxX = 0, maxY = 0, maxZ = 0

  for (const [step, maxima] of entry.stepToMaxima.entries()) {
    if (step < at && step >= startStep) {
      startStep = step
      maxX = maxima[0]
      maxY = maxima[1]
      maxZ = maxima[2]
    }
  }

  // Compute startQuat once, outside the loop (optimization: avoid recomputing per step)
  const startQuatJolt = eulerToQuat(startRotation as [number, number, number])
  const startQuat = joltToOurQuat(startQuatJolt)

  // Scan from startStep + 1 to 'at', computing only new steps
  for (let step = startStep + 1; step <= at; step++) {
    const rec = tape.record(step)
    if (!rec) continue

    const o = index * 13
    const quatJolt = [rec[o + 3], rec[o + 4], rec[o + 5], rec[o + 6]] as const
    const currentQuat = joltToOurQuat(quatJolt)

    // Calculate the difference: q_diff = q_current * inverse(q_start)
    const invStart = quatInverse(startQuat)
    const diffQuat = quatMul(currentQuat, invStart)

    const angles = angleDegrees(diffQuat)

    maxX = Math.max(maxX, Math.abs(angles[0]))
    maxY = Math.max(maxY, Math.abs(angles[1]))
    maxZ = Math.max(maxZ, Math.abs(angles[2]))
  }

  const result: [number, number, number] = [maxX, maxY, maxZ]
  entry.stepToMaxima.set(at, result)
  return result
}

/**
 * A body's turn at a recorded step: its rotation (Jolt [x, y, z, w]) and its spin (rad/s), as the engine gave them; the spin
 * reversed while the recording plays backwards, as the Selected panel shows it. Null when the step or the body is not on
 * the tape. 0j2: the Angle fold showed 0 °/s on every axis in every replay.
 */
export function turnAt(
  tape: { layout: { bodies: readonly string[] }; record(step: number): Float32Array | null },
  step: number,
  bodyId: string,
  reversed = false
): { rotation: [number, number, number, number]; angularVelocity: [number, number, number] } | null {
  const i = tape.layout.bodies.indexOf(bodyId)
  const rec = i < 0 ? null : tape.record(step)
  if (!rec) return null
  const o = i * 13
  const sign = reversed ? -1 : 1
  return {
    rotation: [rec[o + 3], rec[o + 4], rec[o + 5], rec[o + 6]],
    angularVelocity: [sign * rec[o + 10], sign * rec[o + 11], sign * rec[o + 12]]
  }
}
