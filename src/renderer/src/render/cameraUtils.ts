import * as THREE from 'three/webgpu'
import type { V3 } from '../math/vec'

export interface ViewSize {
  width: number
  height: number
}

const tmp = new THREE.Vector3()

/** World units covered by one screen pixel at `pos`. */
export function worldPerPixel(camera: THREE.Camera, size: ViewSize, pos?: V3): number {
  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    const c = camera as THREE.OrthographicCamera
    return (c.top - c.bottom) / c.zoom / size.height
  }
  const c = camera as THREE.PerspectiveCamera
  const d = pos ? tmp.set(pos[0], pos[1], pos[2]).distanceTo(c.position) : c.position.length()
  return (2 * d * Math.tan(THREE.MathUtils.degToRad(c.fov) / 2)) / (size.height * c.zoom)
}

/** Screen pixel coordinates (origin top-left). `visible` is false behind the camera. */
export function toScreen(camera: THREE.Camera, size: ViewSize, p: V3): { x: number; y: number; visible: boolean } {
  tmp.set(p[0], p[1], p[2]).project(camera)
  return {
    x: ((tmp.x + 1) / 2) * size.width,
    y: ((1 - tmp.y) / 2) * size.height,
    visible: tmp.z > -1 && tmp.z < 1
  }
}

const ray = new THREE.Raycaster()
const ndc = new THREE.Vector2()
const hit = new THREE.Vector3()

/** Intersects the pointer ray with a plane. */
export function screenToPlane(camera: THREE.Camera, size: ViewSize, sx: number, sy: number, plane: THREE.Plane): V3 | null {
  ndc.set((sx / size.width) * 2 - 1, -(sy / size.height) * 2 + 1)
  ray.setFromCamera(ndc, camera)
  const r = ray.ray.intersectPlane(plane, hit)
  return r ? [r.x, r.y, r.z] : null
}

export const XY_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)

/** Visible world rectangle of an orthographic top-down camera. */
export function orthoBounds(camera: THREE.Camera, size: ViewSize) {
  const c = camera as THREE.OrthographicCamera
  const halfW = size.width / 2 / c.zoom
  const halfH = size.height / 2 / c.zoom
  return {
    xMin: c.position.x - halfW,
    xMax: c.position.x + halfW,
    yMin: c.position.y - halfH,
    yMax: c.position.y + halfH
  }
}

/** A "nice" step (1, 2, 5 × 10ⁿ) close to `raw`. */
export function niceStep(raw: number): number {
  const exp = Math.floor(Math.log10(raw))
  const base = raw / Math.pow(10, exp)
  const nice = base < 1.5 ? 1 : base < 3.5 ? 2 : base < 7.5 ? 5 : 10
  return nice * Math.pow(10, exp)
}
