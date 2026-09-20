// A body's rotation as the student types it: three Euler angles in degrees, applied about world
// x, then y, then z. This is the one place that order is written down; the engine's quaternion
// and anything that needs a body-fixed point in world space (a pulley's rim) both come from here,
// so they cannot disagree.

import type { V3 } from '../math/vec'

/** x, y, z, w — the order Jolt's Quat takes them in. */
export type Quat = [number, number, number, number]

export function eulerToQuat(deg: V3): Quat {
  const [x, y, z] = deg.map((d) => (d * Math.PI) / 180)
  const cx = Math.cos(x / 2)
  const sx = Math.sin(x / 2)
  const cy = Math.cos(y / 2)
  const sy = Math.sin(y / 2)
  const cz = Math.cos(z / 2)
  const sz = Math.sin(z / 2)
  return [sx * cy * cz - cx * sy * sz, cx * sy * cz + sx * cy * sz, cx * cy * sz - sx * sy * cz, cx * cy * cz + sx * sy * sz]
}

/** `v` turned by `q`: the world position of a point given in the body's own frame. */
export function rotateVec(q: Quat, v: V3): V3 {
  const [qx, qy, qz, qw] = q
  // v' = v + 2 q_v × (q_v × v + w v)
  const tx = 2 * (qy * v[2] - qz * v[1])
  const ty = 2 * (qz * v[0] - qx * v[2])
  const tz = 2 * (qx * v[1] - qy * v[0])
  return [v[0] + qw * tx + (qy * tz - qz * ty), v[1] + qw * ty + (qz * tx - qx * tz), v[2] + qw * tz + (qx * ty - qy * tx)]
}

/** A body-frame offset in world space, for a body rotated by the given Euler degrees. */
export const rotateByEuler = (deg: V3, v: V3): V3 => rotateVec(eulerToQuat(deg), v)
