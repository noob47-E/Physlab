// Writing new vertices into the grid's and the fat lines' geometry. The writes live here, not in
// the components, so a test can rebuild a grid or move a line many times and count the buffers.
//
// Why the buffers are reused: on the WebGL2 fallback three caches a vertex array object for every
// new attribute it meets and never deletes one, and each cached array keeps its buffers alive.
// A new attribute per grid rebuild (every zoom step) or per fat-line change (every mouse move
// while drawing) therefore leaked GPU memory for as long as the app was open. WebGPU frees them,
// but reusing the buffer is cheaper there too. So the data is written into the existing buffer,
// and only the part in use is drawn. A new, doubled buffer is made only when the data outgrows
// the old one, which bounds the leftovers on WebGL2 to a few per object.

import type * as THREE from 'three/webgpu'
import * as T from 'three/webgpu'
import type { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'

/** Room for `n` items: the next power of two, so a slowly growing grid or line rarely reallocates. */
function capacityFor(n: number): number {
  return n <= 1 ? 1 : 2 ** Math.ceil(Math.log2(n))
}

/** Writes a vertex list (x, y, z, x, y, z, …) as the geometry's positions. */
export function writePositions(geometry: THREE.BufferGeometry, pos: ArrayLike<number>): void {
  const n = pos.length / 3
  let attr = geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!attr || attr.array.length < pos.length) {
    attr = new T.Float32BufferAttribute(new Float32Array(capacityFor(n) * 3), 3)
    geometry.setAttribute('position', attr)
  }
  ;(attr.array as Float32Array).set(pos)
  attr.needsUpdate = true
  // Only the vertices just written are drawn; whatever an earlier, bigger grid left past them is not.
  geometry.setDrawRange(0, n)
  // The grid's objects are never frustum-culled, so a sphere that also covers the unused tail is harmless.
  geometry.computeBoundingSphere()
}

/** How many vertices the geometry draws now (its draw range, not the size of its buffer). */
export function drawnVertices(geometry: THREE.BufferGeometry): number {
  const count = (geometry.getAttribute('position') as THREE.BufferAttribute | undefined)?.count ?? 0
  return Math.max(0, Math.min(count, geometry.drawRange.count))
}

/** The parts of a fat line this module touches. */
export interface FatLineObject {
  geometry: LineSegmentsGeometry
}

/** A polyline's points as segment pairs, the layout `LineGeometry.setPositions` makes. */
function polylineSegments(flat: Float32Array): Float32Array {
  const n = Math.max(0, flat.length / 3 - 1)
  const out = new Float32Array(n * 6)
  for (let i = 0; i < n; i++) out.set(flat.subarray(i * 3, i * 3 + 6), i * 6)
  return out
}

/** The interleaved buffer behind a pair of instanced attributes, if it has room for `floats`. */
function roomIn(geometry: LineSegmentsGeometry, name: string, floats: number): T.InstancedInterleavedBuffer | null {
  const attr = geometry.attributes[name] as THREE.InterleavedBufferAttribute | undefined
  const data = attr?.data as T.InstancedInterleavedBuffer | undefined
  return data && data.array.length >= floats ? data : null
}

/**
 * Writes a fat line's points: pairs of segment ends when `segments`, else a polyline. Replaces
 * three's `setPositions` and `computeLineDistances`, which make new instanced buffers on every call.
 */
export function writeLinePoints(line: FatLineObject, flat: Float32Array, segments: boolean, dashed: boolean): void {
  const geometry = line.geometry
  const segs = segments ? flat : polylineSegments(flat)
  const n = segs.length / 6
  let buf = roomIn(geometry, 'instanceStart', segs.length)
  if (!buf) {
    buf = new T.InstancedInterleavedBuffer(new Float32Array(capacityFor(n) * 6), 6, 1) // xyz, xyz
    geometry.setAttribute('instanceStart', new T.InterleavedBufferAttribute(buf, 3, 0))
    geometry.setAttribute('instanceEnd', new T.InterleavedBufferAttribute(buf, 3, 3))
  }
  ;(buf.array as Float32Array).set(segs)
  buf.needsUpdate = true
  // Only the segments just written are drawn. The line is never frustum-culled or ray-cast, so
  // its bounds (which would also cover the unused tail) are not needed.
  geometry.instanceCount = n
  if (!dashed) return
  let dist = roomIn(geometry, 'instanceDistanceStart', 2 * n)
  if (!dist) {
    dist = new T.InstancedInterleavedBuffer(new Float32Array(capacityFor(n) * 2), 2, 1) // d0, d1
    geometry.setAttribute('instanceDistanceStart', new T.InterleavedBufferAttribute(dist, 1, 0))
    geometry.setAttribute('instanceDistanceEnd', new T.InterleavedBufferAttribute(dist, 1, 1))
  }
  // The distance along the line at each segment's ends, as computeLineDistances writes it.
  const d = dist.array as Float32Array
  let along = 0
  for (let i = 0; i < n; i++) {
    const k = i * 6
    d[i * 2] = along
    along += Math.hypot(segs[k + 3] - segs[k], segs[k + 4] - segs[k + 1], segs[k + 5] - segs[k + 2])
    d[i * 2 + 1] = along
  }
  dist.needsUpdate = true
}
