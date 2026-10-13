// Where the Sandbox's camera looks from, as plain numbers: the view it opens in and the view Home
// (Find the objects) frames. CameraRig applies these; tests/sandboxFloor.test.ts reads the same
// numbers to check that the floor fills everything below the horizon from each of them, which is
// why they live here and not inside the component.

import type { V3 } from '../math/vec'
import type { BodyDef } from '../sim/types'

/** The perspective camera's vertical field of view, in degrees, in every 3-D view. */
export const SANDBOX_FOV = 45

/** Its far plane, in metres: the ground beyond it is not drawn, so nothing past it can show an edge. */
export const SANDBOX_FAR = 5000

/** A camera place and the point it looks at. */
export interface CameraView {
  position: V3
  target: V3
}

/** The views the Sandbox opens in: side-on like a textbook figure, or turned to show depth. */
export const SANDBOX_START_VIEW: { side: CameraView; turned: CameraView } = {
  side: { position: [0, 2.5, 16], target: [0, 1.2, 0] },
  turned: { position: [9, 6, 13], target: [0, 1.2, 0] }
}

/**
 * Home in the Sandbox: frame every object (not the floor) where it is now, with the floor's top in
 * view. The maths views' Home put the camera twelve metres under the floor. `positionOf` is where a
 * body is at this moment: the engine's live state while a run is on, the definition otherwise.
 */
export function sandboxHomeView(bodies: BodyDef[], positionOf: (b: BodyDef) => V3, sideView: boolean): CameraView {
  const min: V3 = [Infinity, Infinity, Infinity]
  const max: V3 = [-Infinity, -Infinity, -Infinity]
  for (const b of bodies) {
    if (b.shape === 'ground') continue
    const p = positionOf(b)
    const r = Math.max(...b.size) / 2
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[k] - r)
      max[k] = Math.max(max[k], p[k] + r)
    }
  }
  const floor = bodies.find((b) => b.shape === 'ground')
  const top = floor ? floor.position[1] + floor.size[1] / 2 : 0
  if (!Number.isFinite(min[0])) {
    min[0] = -4
    max[0] = 4
    min[1] = top
    max[1] = top + 3
    min[2] = -1
    max[2] = 1
  }
  min[1] = Math.min(min[1], top)
  const cx = (min[0] + max[0]) / 2
  const cy = (min[1] + max[1]) / 2
  const cz = (min[2] + max[2]) / 2
  // At least 1.5 m across: a 1 m lever or a pendulum then fills the view when it is loaded (SB63), where
  // the old 3 m floor left a metre-rule lever small in the middle of a wide floor.
  const r = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1.5)
  return {
    position: sideView ? [cx, cy + r * 0.25, cz + r * 1.6] : [cx + r * 0.9, cy + r * 0.7, cz + r * 1.2],
    target: [cx, cy, cz]
  }
}
