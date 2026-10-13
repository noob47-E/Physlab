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
  const angleX = 2 * Math.atan2(x, w) * DEG
  const angleY = 2 * Math.atan2(y, w) * DEG
  const angleZ = 2 * Math.atan2(z, w) * DEG

  return [angleX, angleY, angleZ]
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

// Cache for largestAngleSoFar results: keyed by (revision, bodyId, startRotation)
// stores a map of playhead position to cached maxima
const largestAngleSoFarCache = new Map<string, { revision: number; stepToMaxima: Map<number, [number, number, number]> }>()

/**
 * The largest absolute angle per axis from the start of the tape to the playhead.
 * Uses caching to avoid recomputing: caches results at each visited playhead and reuses
 * previously computed maxima when moving to new playheads.
 * @param tape - TapeView with first, last, layout, and record() method
 * @param playhead - Step position in the tape (clamped to first..last)
 * @param bodyId - ID of the body to read
 * @param startRotation - Start rotation in Euler degrees [x, y, z] format (from BodyDef)
 * @returns [maxAbsX, maxAbsY, maxAbsZ] in degrees
 */
export function largestAngleSoFar(
  tape: { first: number; last: number; layout: { bodies: readonly string[] }; record(step: number): Float32Array | null; revision?: number },
  playhead: number,
  bodyId: string,
  startRotation: readonly [number, number, number]
): [number, number, number] {
  if (tape.last < tape.first) return [0, 0, 0]
  const index = tape.layout.bodies.indexOf(bodyId)
  if (index < 0) return [0, 0, 0]

  const at = Math.min(tape.last, Math.max(tape.first, playhead))
  const revision = tape.revision ?? 0
  const cacheKey = `${revision}:${bodyId}:${JSON.stringify(startRotation)}`

  // Get or create cache entry for this tape/body/rotation combo
  let entry = largestAngleSoFarCache.get(cacheKey)
  if (!entry || entry.revision !== revision) {
    entry = { revision, stepToMaxima: new Map() }
    largestAngleSoFarCache.set(cacheKey, entry)
  }

  // Check if we already have this playhead cached
  if (entry.stepToMaxima.has(at)) {
    return [...entry.stepToMaxima.get(at)!]
  }

  // Find the largest cached step before 'at' to reuse its maxima
  let startStep = tape.first
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
