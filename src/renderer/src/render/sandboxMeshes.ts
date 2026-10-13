// The three.js side of the Sandbox's looks: the plain shape of each body, built with three's own
// primitives, and the geometries the view draws from the arrays render/sandboxLooks.ts works out.
// Kept apart from SandboxView so the tests can build exactly what the view draws.

import * as THREE from 'three/webgpu'
import type { BodyDef } from '../sim/types'
import { BALL_SEGMENTS, bodyLook, coilIndex, coilVertexCount, rampSurface, RIM_SEGMENTS, type CoilShape, type MeshData } from './sandboxLooks'

/** A three.js geometry's arrays, copied out, and the geometry let go. */
function dataOf(g: THREE.BufferGeometry): MeshData {
  const positions = Float32Array.from(g.getAttribute('position').array as ArrayLike<number>)
  const normals = Float32Array.from(g.getAttribute('normal').array as ArrayLike<number>)
  const count = positions.length / 3
  const index = g.getIndex()
  const source: ArrayLike<number> = index ? (index.array as ArrayLike<number>) : Array.from({ length: count }, (_, i) => i)
  const indices = count <= 65536 ? Uint16Array.from(source) : Uint32Array.from(source)
  g.dispose()
  return { positions, normals, indices }
}

/**
 * A body's plain shape, in metres, in its own frame: a sphere's size[0] is its radius; a cylinder
 * and a pulley are radius size[0], full height size[1] along y; a cone's size[0] is its base
 * WIDTH (the collision hull and the volume take it so); a ramp, box, plank, wall and the floor
 * are full widths. A sphere has 48 × 32 corners (BALL_SEGMENTS) so its band falls on a ring of
 * vertices, and a cylinder and a cone have RIM_SEGMENTS round, which their outlines follow.
 */
export function surfaceOf(def: BodyDef): MeshData {
  const [a, b, c] = def.size.map(Math.abs)
  switch (def.shape) {
    case 'sphere':
      return dataOf(new THREE.SphereGeometry(a, BALL_SEGMENTS[0], BALL_SEGMENTS[1]))
    case 'cylinder':
    case 'pulley':
      return dataOf(new THREE.CylinderGeometry(a, a, b, RIM_SEGMENTS))
    case 'capsule':
      return dataOf(new THREE.CapsuleGeometry(a, b, 8, 20))
    case 'cone':
      return dataOf(new THREE.ConeGeometry(a / 2, b, RIM_SEGMENTS))
    case 'ramp':
      return rampSurface([a, b, c])
    default:
      return dataOf(new THREE.BoxGeometry(a, b, c))
  }
}

/** A geometry holding a mesh's arrays as they are: positions, normals, the tint as `color`, and the triangles. */
function meshGeometry(m: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3))
  if (m.factors) g.setAttribute('color', new THREE.BufferAttribute(m.factors, 3))
  g.setIndex(new THREE.BufferAttribute(m.indices, 1))
  return g
}

/** The geometry a body is drawn with: its whole look (outline, marking, groove) in one mesh. */
export const bodyGeometry = (def: BodyDef): THREE.BufferGeometry => meshGeometry(bodyLook(def.shape, def.size, surfaceOf(def)))

/**
 * A spring's geometry: buffers the size of its coil, rewritten in place every frame by writeCoil,
 * over the one index buffer every length of that coil shares.
 */
export function coilGeometry(shape: CoilShape): THREE.BufferGeometry {
  const n = coilVertexCount(shape)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage))
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage))
  g.setIndex(new THREE.BufferAttribute(coilIndex(shape), 1))
  return g
}

/** A unit cylinder along y (radius 1, height 1, centred): a rod, a string, a rope's pieces and a pin are this, scaled. */
export const unitCylinder = (): THREE.BufferGeometry => new THREE.CylinderGeometry(1, 1, 1, 12, 1)

/** A unit ball: a rope's beads are this, scaled. */
export const unitBall = (): THREE.BufferGeometry => new THREE.SphereGeometry(1, 12, 8)
