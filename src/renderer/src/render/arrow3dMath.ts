// 3D-1 (owner, Wed 14 Oct: "the vector becomes so much bigger and bulky"): the 3-D arrow's head, sized in pixels at its own
// tip. The old head and shaft were scaled by the world-per-pixel at the arrow's MIDPOINT, which for a long vector in
// perspective is far from the camera, so near the camera they were many pixels fat. Pure, so the tests can hold it.

/** World units per screen pixel at `distance` from a perspective camera (the same formula as cameraUtils.worldPerPixel). */
export function perspectiveWpp(distance: number, fovDeg: number, heightPx: number, zoom = 1): number {
  return (2 * distance * Math.tan((fovDeg * Math.PI) / 360)) / (heightPx * zoom)
}

/**
 * The cone's length and radius in world units for an arrow `L` long whose tip is `wppTip` world units a pixel: `headPx`
 * long and `radPx` wide on screen whatever the zoom, but never more than 40 % of a short arrow (which keeps its shape).
 */
export function arrowHead3D(L: number, wppTip: number, headPx = 12, radPx = 4): { headLen: number; radius: number } {
  const headLen = Math.min(headPx * wppTip, 0.4 * L)
  const radius = Math.min(radPx * wppTip, headLen * 0.6)
  return { headLen, radius }
}
