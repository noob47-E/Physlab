// 3D-3B: a solid as the Geometry 3-D view draws and measures it. The corners and faces come from math/solids3d.ts (lane J);
// here they are stood on the floor with the centre of the base at `at`, the edges a student should see are picked out (every
// edge of a polyhedron, only the rims of a round solid: its facets would be a dense wireframe), and the two handles placed.

import type { Vector3 } from 'three'
import {
  createCone,
  createCube,
  createCuboid,
  createCylinder,
  createFrustum,
  createHemisphere,
  createRegularDodecahedron,
  createRegularIcosahedron,
  createRegularOctahedron,
  createRegularTetrahedron,
  createSphere,
  createSquarePyramid,
  createTriangularPrism,
  type Polyhedron
} from './solids3d'
import { cross, len, sub, type V3 } from './vec'
import { isNoise } from './noise'
import { extrudeOutline, pyramidOver, hullFromCorners, type Poly3 } from './polyhedron'

export const SOLID_KINDS = ['cube', 'cuboid', 'prism', 'pyramid', 'sphere', 'cylinder', 'cone', 'tetrahedron', 'octahedron', 'dodecahedron', 'icosahedron', 'frustum', 'hemisphere'] as const
/** T974: the solids made from a shape (Extrude, Apex, From corners); not tiles of the gallery. */
const FROM_SHAPE_KINDS = ['extrusion', 'apex', 'corners'] as const
export type SolidKind = (typeof SOLID_KINDS)[number] | (typeof FROM_SHAPE_KINDS)[number]
export const isFromShape = (k: SolidKind): boolean => (FROM_SHAPE_KINDS as readonly string[]).includes(k)

/** The seven of the 3D shapes row; the rest are in the Shapes gallery. */
export const BASIC_SOLIDS: readonly SolidKind[] = ['cube', 'cuboid', 'prism', 'pyramid', 'sphere', 'cylinder', 'cone']

/** What a student calls each kind. */
export const SOLID_NAMES: Record<SolidKind, string> = {
  cube: 'Cube',
  cuboid: 'Cuboid',
  prism: 'Triangular prism',
  pyramid: 'Square pyramid',
  sphere: 'Sphere',
  cylinder: 'Cylinder',
  cone: 'Cone',
  tetrahedron: 'Tetrahedron',
  octahedron: 'Octahedron',
  dodecahedron: 'Dodecahedron',
  icosahedron: 'Icosahedron',
  frustum: 'Frustum of a cone',
  hemisphere: 'Hemisphere',
  extrusion: 'Prism',
  apex: 'Pyramid',
  corners: 'Polyhedron'
}

interface SolidSize {
  key: string
  /** "side a", "height h": how a sentence names it. */
  label: string
  value: number
  /** Which size the height handle drags (the rest: the size handle drags the first). */
  height?: boolean
}

const S = (key: string, label: string, value: number, height = false): SolidSize => ({ key, label, value, height })

const SIZES: Record<SolidKind, SolidSize[]> = {
  cube: [S('a', 'side a', 4)],
  cuboid: [S('l', 'length l', 5), S('w', 'width w', 3), S('h', 'height h', 4, true)],
  prism: [S('b', 'side b', 4), S('h', 'height h', 6, true)],
  pyramid: [S('b', 'base side b', 4), S('h', 'height h', 6, true)],
  sphere: [S('r', 'radius r', 3)],
  cylinder: [S('r', 'radius r', 2.5), S('h', 'height h', 5, true)],
  cone: [S('r', 'radius r', 3), S('h', 'height h', 4, true)],
  tetrahedron: [S('a', 'edge a', 5)],
  octahedron: [S('a', 'edge a', 4)],
  dodecahedron: [S('a', 'edge a', 2.5)],
  icosahedron: [S('a', 'edge a', 3.5)],
  frustum: [S('R', 'base radius R', 3.5), S('r', 'top radius r', 1.5), S('h', 'height h', 4, true)],
  hemisphere: [S('r', 'radius r', 3)],
  extrusion: [S('h', 'height h', 4, true)],
  apex: [],
  corners: []
}

/** A kind's sizes, in order, each with its default. */
export const sizesOf = (kind: SolidKind): SolidSize[] => SIZES[kind].map((s) => ({ ...s }))

export interface SolidShape {
  vertices: V3[]
  faces: number[][]
  /** The edges drawn, as segments. */
  edges: [V3, V3][]
  volume: number
  area: number
  /** From the floor of the solid to its top. */
  height: number
  /** The centre of the base (`at`) and the point straight above it at the top: the dashed height line and the height handle. */
  base: V3
  top: V3
  /** Where the size handle sits: the base's farthest point along +x. */
  sizeHandle: V3
  /** T974: a solid made from a shape also keeps its true faces (the `faces` above are triangles), edges and face areas. */
  poly?: { polys: number[][]; edges: [number, number][]; faceAreas: number[] }
}

/** T974: the outline or corners (and apex) of a solid made from a shape, each relative to the solid's `at`. */
interface ShapeSource {
  pts: V3[]
  apex?: V3
}

function build(kind: SolidKind, v: Record<string, number>): Polyhedron {
  switch (kind) {
    case 'cube':
      return createCube(v.a)
    case 'cuboid':
      return createCuboid(v.l, v.w, v.h)
    case 'prism':
      return createTriangularPrism(v.b, v.h)
    case 'pyramid':
      return createSquarePyramid(v.b, v.h)
    case 'sphere':
      return createSphere(v.r)
    case 'cylinder':
      return createCylinder(v.r, v.h)
    case 'cone':
      return createCone(v.r, v.h)
    case 'tetrahedron':
      return createRegularTetrahedron(v.a)
    case 'octahedron':
      return createRegularOctahedron(v.a)
    case 'dodecahedron':
      return createRegularDodecahedron(v.a)
    case 'icosahedron':
      return createRegularIcosahedron(v.a)
    case 'frustum':
      return createFrustum(v.R, v.r, v.h)
    case 'hemisphere':
      return createHemisphere(v.r)
    default:
      throw new Error('a solid made from a shape is built from its outline')
  }
}

/** A face's normal by Newell's method (any polygon, any winding the faces share). */
function normalOf(face: number[], pts: V3[]): V3 {
  const n: V3 = [0, 0, 0]
  for (let i = 0; i < face.length; i++) {
    const a = pts[face[i]]
    const b = pts[face[(i + 1) % face.length]]
    n[0] += (a[1] - b[1]) * (a[2] + b[2])
    n[1] += (a[2] - b[2]) * (a[0] + b[0])
    n[2] += (a[0] - b[0]) * (a[1] + b[1])
  }
  const l = len(n)
  return l > 0 ? [n[0] / l, n[1] / l, n[2] / l] : n
}

/** Two faces meeting at more than this turn make an edge a student sees; the facets of a round solid turn about 11°. */
const FEATURE_TURN = (25 * Math.PI) / 180

function featureEdges(faces: number[][], pts: V3[]): [number, number][] {
  const normals = faces.map((f) => normalOf(f, pts))
  const at = new Map<string, { a: number; b: number; faces: number[] }>()
  faces.forEach((f, fi) => {
    for (let i = 0; i < f.length; i++) {
      const a = f[i]
      const b = f[(i + 1) % f.length]
      const key = a < b ? `${a}:${b}` : `${b}:${a}`
      const e = at.get(key) ?? { a: Math.min(a, b), b: Math.max(a, b), faces: [] }
      e.faces.push(fi)
      at.set(key, e)
    }
  })
  const out: [number, number][] = []
  for (const e of at.values()) {
    if (e.faces.length !== 2) {
      out.push([e.a, e.b])
      continue
    }
    const [n1, n2] = [normals[e.faces[0]], normals[e.faces[1]]]
    const turn = Math.acos(Math.max(-1, Math.min(1, n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2])))
    if (turn > FEATURE_TURN) out.push([e.a, e.b])
  }
  return out
}

function fromShape(kind: SolidKind, v: Record<string, number>, at: V3, from?: ShapeSource): SolidShape {
  if (!from || from.pts.length < 3) throw new Error('this solid has lost its outline')
  const abs = (p: V3): V3 => [p[0] + at[0], p[1] + at[1], p[2] + at[2]]
  const base = from.pts.map(abs)
  let poly: Poly3
  if (kind === 'extrusion') poly = extrudeOutline(base, v.h)
  else if (kind === 'apex') poly = pyramidOver(base, abs(from.apex ?? [0, 0, 1]))
  else poly = hullFromCorners(base)
  const zs = poly.vertices.map((p) => p[2])
  const zLow = Math.min(...zs)
  const height = Math.max(...zs) - zLow
  return {
    vertices: poly.vertices,
    faces: poly.faces,
    edges: poly.edges.map(([a, b]) => [poly.vertices[a], poly.vertices[b]]),
    volume: poly.volume,
    area: poly.area,
    height,
    base: [at[0], at[1], zLow],
    top: [at[0], at[1], Math.max(...zs)],
    sizeHandle: [...at],
    poly: { polys: poly.polys, edges: poly.edges, faceAreas: poly.faceAreas }
  }
}

/**
 * A kind's solid with the given sizes (any left out take their default), standing on the floor at `at`. A size that is not
 * a number above 0 is refused in words ("the side a must be more than 0").
 */
export function solidShape(kind: SolidKind, size: Record<string, number>, at: V3, from?: ShapeSource): SolidShape {
  const v: Record<string, number> = {}
  for (const s of SIZES[kind]) {
    const x = size[s.key] ?? s.value
    if (!(x > 0)) throw new Error(`the ${s.label} must be more than 0`)
    v[s.key] = x
  }
  if (isFromShape(kind)) return fromShape(kind, v, at, from)
  const poly = build(kind, v)
  const raw: V3[] = poly.vertices.map((p: Vector3) => [p.x, p.y, p.z])
  const xs = raw.map((p) => p[0])
  const ys = raw.map((p) => p[1])
  const zs = raw.map((p) => p[2])
  const shift: V3 = [at[0] - (Math.min(...xs) + Math.max(...xs)) / 2, at[1] - (Math.min(...ys) + Math.max(...ys)) / 2, at[2] - Math.min(...zs)]
  const vertices: V3[] = raw.map((p) => [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]])
  let pairs = featureEdges(poly.faces, vertices)
  if (kind === 'sphere') {
    // A sphere has no edge at all: its equator is drawn, the middle ring of math/solids3d.ts's 16 (index 8 of 1..15).
    const ring = 32
    const first = 1 + 7 * ring
    pairs = Array.from({ length: ring }, (_, i): [number, number] => [first + i, first + ((i + 1) % ring)])
  }
  const zLow = Math.min(...zs)
  const height = Math.max(...zs) - zLow
  return {
    vertices,
    faces: poly.faces,
    edges: pairs.map(([a, b]) => [vertices[a], vertices[b]]),
    volume: poly.volume,
    area: poly.surfaceArea,
    height,
    base: [...at],
    top: [at[0], at[1], at[2] + height],
    sizeHandle: [Math.max(...vertices.map((p) => p[0])), at[1], at[2]]
  }
}

/**
 * The sheet a plane through three points is drawn as: a rectangle on the plane round the three, a third wider than they
 * are each way and at least a square more, so it reads as a plane and not as their triangle. Empty when they lie on a line.
 */
export function planeSheet(a: V3, b: V3, c: V3): V3[] {
  const p = planeThrough(a, b, c)
  if (!p) return []
  const ab = sub(b, a)
  const u: V3 = [ab[0] / len(ab), ab[1] / len(ab), ab[2] / len(ab)]
  const v = cross(p.n, u)
  const along = (q: V3, w: V3) => (q[0] - a[0]) * w[0] + (q[1] - a[1]) * w[1] + (q[2] - a[2]) * w[2]
  const us = [a, b, c].map((q) => along(q, u))
  const vs = [a, b, c].map((q) => along(q, v))
  const pad = (lo: number, hi: number): [number, number] => {
    const m = Math.max((hi - lo) / 3, 1)
    return [lo - m, hi + m]
  }
  const [u0, u1] = pad(Math.min(...us), Math.max(...us))
  const [v0, v1] = pad(Math.min(...vs), Math.max(...vs))
  const at = (s: number, t: number): V3 => [a[0] + s * u[0] + t * v[0], a[1] + s * u[1] + t * v[1], a[2] + s * u[2] + t * v[2]]
  return [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]
}

/** The plane through three points as n · x = d, with n a unit vector; null when they lie on one line. */
export function planeThrough(a: V3, b: V3, c: V3): { n: V3; d: number } | null {
  const n = cross(sub(b, a), sub(c, a))
  const l = len(n)
  const size = Math.max(len(sub(b, a)), len(sub(c, a)))
  // The cross product is a product of two sides: judged against their product (math/noise.ts).
  if (!(size > 0) || isNoise(l, size * size)) return null
  const u: V3 = [n[0] / l, n[1] / l, n[2] / l]
  return { n: u, d: u[0] * a[0] + u[1] * a[1] + u[2] * a[2] }
}
