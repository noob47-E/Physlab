// How the Sandbox's things look: pure geometry. No three.js objects, no React, nothing here
// touches the engine. Every function takes plain numbers and fills plain arrays, so it is tested in
// node and the view hands the results straight to a BufferGeometry or an InstancedMesh.
//
// Why this exists (item P28, "the balls and the spring are just straight-shaped objects"):
//  - Under WebGPU a THREE.Line is one device pixel wide whatever the camera does, and Points are one
//    pixel too. The spring, the string and the rope were lines, so they vanished when zoomed out and
//    never looked like anything when zoomed in. Anything that must read at any zoom is a MESH, so
//    every link and every outline here is a tube.
//  - A spring was a 12-segment zigzag. A real one is a helix with a fixed number of turns whose wire
//    keeps its thickness as it stretches. Scaling one prebuilt coil along its axis would squash the
//    wire along with the turns, so the coil is rewritten vertex by vertex for the length it has now.
//  - A ball of one colour shows no spin. Two tones and a dark band do, and the colours are factors
//    that multiply the body's own colour, so a colour the student chose still shows.
//  - Lit faces of one colour run together on a box. A thin dark outline along the edges separates
//    them, and it is built for each size: scaling a unit outline would thicken the lines of a long
//    plank and thin the ones of a cube.
//
// Conventions follow the body surfaces (sandboxMeshes.surfaceOf) exactly: a sphere's size[0] is its radius; a cylinder
// and a pulley are radius size[0] and full height size[1] along their own y axis; a cone's size[0]
// is its base DIAMETER (the mesh uses a / 2) and its apex points up; a ramp, box, plank and wall
// are full widths. Triangles wind counter-clockwise seen from outside, as three.js culls the rest.

import type { V3 } from '../math/vec'
import type { ShapeKind } from '../sim/types'

/** A rotation as x, y, z, w: the order THREE.Quaternion.set takes. */
type Quat = [number, number, number, number]

/**
 * The arrays a BufferGeometry is made of. `factors` (three per vertex, grey) are vertex-colour
 * multipliers for the shapes that mark themselves; a shape without them is one tone.
 */
export interface MeshData {
  positions: Float32Array
  normals: Float32Array
  indices: Uint16Array | Uint32Array
  factors?: Float32Array
}

const TAU = Math.PI * 2

/** An index array that fits `vertices`: 16 bits while it can, 32 once it cannot. */
const indexArray = (vertices: number, length: number): Uint16Array | Uint32Array => (vertices <= 65536 ? new Uint16Array(length) : new Uint32Array(length))

/** cos and sin of j/n of a turn, interleaved, cached: a ring's corners are the same for every ring. */
const ringCache = new Map<number, Float64Array>()
function ringTable(n: number): Float64Array {
  let t = ringCache.get(n)
  if (!t) {
    t = new Float64Array(n * 2)
    for (let j = 0; j < n; j++) {
      t[2 * j] = Math.cos((TAU * j) / n)
      t[2 * j + 1] = Math.sin((TAU * j) / n)
    }
    ringCache.set(n, t)
  }
  return t
}

// =============================================================================================
// A. The spring coil
// =============================================================================================

/** How a coil is cut into triangles. The turns are fixed, which is how a drawn spring behaves. */
export interface CoilShape {
  /** Whole turns between the two ends, the same for every length. */
  turns: number
  /** Samples along the helix per turn: more is rounder and dearer. */
  segmentsPerTurn: number
  /** Corners of the wire's round cross-section. */
  radialSegments: number
}

/**
 * Ten turns whether the spring is 0.3 m or 3 m long: it is the spring that stretches, not the
 * count of its turns. 16 samples a turn read as round from any distance a spring is seen at.
 */
export const SPRING_COIL: CoilShape = { turns: 10, segmentsPerTurn: 16, radialSegments: 8 }

/**
 * The thickest wire a coil is drawn with, as a fraction of the coil radius. The tightest bend of
 * the thread is the end hook, about half the coil radius across; a wire thicker than that turns
 * its inner side inside out there (from 0.5 it does). visibleRadius can ask for a wire as wide as
 * the coil when the camera is far back, so writeCoil holds it to this.
 */
export const MAX_WIRE = 0.4

/** How one spring is drawn: its coil, how wide the coil is and how thick its wire. */
interface SpringLook {
  shape: CoilShape
  coilRadius: number
  wireRadius: number
}

/**
 * A spring's look from its natural length, never from its length now: the turns and the width
 * stay as they are while it stretches and squeezes, which is what makes the stretch visible.
 *
 * At rest its turns stand about one coil width apart, so a spring at its natural length reads as
 * one at rest and a stretched one as stretched. The width is 6 % of the length, between 5 and
 * 12 cm, so a short spring is not a fat drum and a long one not a thread; the wire is an eighth of
 * the width.
 */
export function springLook(naturalLength: number): SpringLook {
  const L = Number.isFinite(naturalLength) && naturalLength > 0 ? naturalLength : 1
  const coilRadius = Math.min(0.12, Math.max(0.05, 0.06 * L))
  const turns = Math.min(40, Math.max(6, Math.round(L / coilRadius)))
  return { shape: { turns, segmentsPerTurn: 20, radialSegments: 8 }, coilRadius, wireRadius: 0.12 * coilRadius }
}

function checkShape(s: CoilShape): void {
  if (!Number.isInteger(s.turns) || s.turns < 1 || !Number.isInteger(s.segmentsPerTurn) || s.segmentsPerTurn < 4 || !Number.isInteger(s.radialSegments) || s.radialSegments < 3) {
    throw new RangeError('A coil needs whole turns, at least 4 samples a turn and at least 3 corners round the wire.')
  }
}

const ringsOf = (s: CoilShape): number => s.turns * s.segmentsPerTurn + 1

/** How many vertices `writeCoil` fills: size the position and normal arrays three times this. */
export function coilVertexCount(shape: CoilShape = SPRING_COIL): number {
  checkShape(shape)
  return ringsOf(shape) * shape.radialSegments
}

/**
 * The triangles of the coil, once: the wire's corners are joined ring to ring the same way for
 * every length, so only the positions move each frame and this array never changes.
 */
export function coilIndex(shape: CoilShape = SPRING_COIL): Uint16Array | Uint32Array {
  checkShape(shape)
  const R = shape.radialSegments
  const N = shape.turns * shape.segmentsPerTurn
  const out = indexArray(coilVertexCount(shape), N * R * 6)
  let k = 0
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < R; j++) {
      const a = i * R + j
      const d = i * R + ((j + 1) % R)
      const b = (i + 1) * R + j
      const c = (i + 1) * R + ((j + 1) % R)
      // Rings run along the wire and the corners run (normal → binormal), a right-handed pair, so
      // this order is the one that faces outward.
      out[k++] = a
      out[k++] = d
      out[k++] = b
      out[k++] = d
      out[k++] = c
      out[k++] = b
    }
  }
  return out
}

/**
 * How far out the end lead has come, 0 at the attachment point and 1 on the coil: x(2 − x) on
 * [0, 1], with its slope. It leaves the axis at a slope of 2, straight ACROSS the axis, and
 * arrives at the coil level, so the lead is a hook from the attachment point out to the coil
 * that meets it without a kink — the shape a real spring's end wire has.
 *
 * It used to be a smoothstep (3x² − 2x³), flat at both ends. That made the thread leave ALONG the
 * axis and then swing out to the coil within a few millimetres of travel on a short spring: a bend
 * far tighter than the wire is thick, so the tube folded through itself there and showed
 * inside-out triangles (nine on a 0.3 m spring). Leaving across the axis, the tightest bend of the
 * lead is about half the coil radius whatever the length, comfortably wider than the wire.
 */
const lead = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * (2 - x))
const leadSlope = (x: number): number => (x <= 0 ? 2 : x >= 1 ? 0 : 2 - 2 * x)

/** The axis frame, in module scratch so a frame allocates nothing: d (0–2), u (3–5), v (6–8), length (9). */
const FRAME = new Float64Array(10)
/** The thread at one parameter: centre (0–2) and unit tangent (3–5). */
const THREAD = new Float64Array(6)
/** The wire's cross-section frame at the current ring: centre (0–2), normal (3–5), binormal (6–8), tangent (9–11). */
const RING = new Float64Array(12)

/**
 * The unit axis a → b, two unit vectors across it, and the length. With a == b there is no axis;
 * it then points up with length 0, so a spring squeezed to nothing is a flat knot rather than NaN.
 * The across-axis pair is built from world up, or world x once the axis is nearly vertical, so a
 * horizontal spring keeps one steady turn of the thread and a hanging one another.
 */
function axisFrame(a: V3, b: V3, f: Float64Array): void {
  const ex = b[0] - a[0]
  const ey = b[1] - a[1]
  const ez = b[2] - a[2]
  const len = Math.hypot(ex, ey, ez)
  let dx = 0
  let dy = 1
  let dz = 0
  let L = 0
  if (len > 1e-9) {
    dx = ex / len
    dy = ey / len
    dz = ez / len
    L = len
  }
  // u = d × reference, for a reference that is not along d; its length is at least 0.19 either way.
  let ux = -dz
  let uy = 0
  let uz = dx
  if (Math.abs(dy) > 0.98) {
    ux = 0
    uy = dz
    uz = -dy
  }
  const ul = Math.hypot(ux, uy, uz)
  ux /= ul
  uy /= ul
  uz /= ul
  f[0] = dx
  f[1] = dy
  f[2] = dz
  f[3] = ux
  f[4] = uy
  f[5] = uz
  // v = d × u, so (u, v, d) is right-handed.
  f[6] = dy * uz - dz * uy
  f[7] = dz * ux - dx * uz
  f[8] = dx * uy - dy * ux
  f[9] = L
}

/**
 * The thread at t in [0, 1]: its centre (slots 0–2 of `o`) and its unit tangent (3–5).
 *
 * P(t) = a + (b − a) t + ρ(t) (cos θ u + sin θ v), θ = 2π · turns · t, where ρ is the coil radius
 * times a lead that is 0 at both ends and 1 after the first and before the last quarter turn.
 * So the thread STARTS EXACTLY AT a AND ENDS EXACTLY AT b, leaves across the axis (see `lead`)
 * and hooks round on to the coil the way a real spring's end wire does.
 */
function thread(a: V3, b: V3, f: Float64Array, coilRadius: number, turns: number, t: number, o: Float64Array): void {
  const dx = f[0]
  const dy = f[1]
  const dz = f[2]
  const ux = f[3]
  const uy = f[4]
  const uz = f[5]
  const vx = f[6]
  const vy = f[7]
  const vz = f[8]
  const theta = TAU * turns * t
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const quarter = Math.min(0.5, 0.25 / turns)
  const x1 = t / quarter
  const x2 = (1 - t) / quarter
  const k1 = lead(x1)
  const k2 = lead(x2)
  const rho = coilRadius * k1 * k2
  const dRho = (coilRadius * (leadSlope(x1) * k2 - k1 * leadSlope(x2))) / quarter
  // Outward and along-the-thread unit vectors, both across the axis.
  const rx = c * ux + s * vx
  const ry = c * uy + s * vy
  const rz = c * uz + s * vz
  const gx = -s * ux + c * vx
  const gy = -s * uy + c * vy
  const gz = -s * uz + c * vz
  const ex = b[0] - a[0]
  const ey = b[1] - a[1]
  const ez = b[2] - a[2]
  o[0] = a[0] + ex * t + rho * rx
  o[1] = a[1] + ey * t + rho * ry
  o[2] = a[2] + ez * t + rho * rz
  const spin = TAU * turns
  const tx = ex + dRho * rx + rho * spin * gx
  const ty = ey + dRho * ry + rho * spin * gy
  const tz = ez + dRho * rz + rho * spin * gz
  const tl = Math.hypot(tx, ty, tz)
  if (tl > 1e-9) {
    o[3] = tx / tl
    o[4] = ty / tl
    o[5] = tz / tl
  } else {
    // A spring squeezed to a point has no direction of travel at its very ends.
    o[3] = dx
    o[4] = dy
    o[5] = dz
  }
}

/**
 * Moves the wire's cross-section frame (RING) on from the previous ring to the thread point just
 * computed (THREAD), turning it as little as it can: a double reflection (Wang et al., 2008)
 * carries the normal along the thread without any twist of its own.
 *
 * The obvious frame, the helix's outward direction made perpendicular to the tangent, is
 * ill-conditioned exactly where the thread bends hardest. In the end leads the thread runs out
 * from the axis almost along the outward direction itself, so what is left of it after taking the
 * tangent out is a few percent and flips between neighbouring rings, twisting the wire's corners
 * round from one ring to the next.
 */
function carryFrame(first: boolean): void {
  const cx = THREAD[0]
  const cy = THREAD[1]
  const cz = THREAD[2]
  const tx = THREAD[3]
  const ty = THREAD[4]
  const tz = THREAD[5]
  let nx: number
  let ny: number
  let nz: number
  if (first) {
    // The thread leaves a in the plane of the axis and u (along the axis and out along u, see
    // `lead`), so v, square to both, is square to it too. u itself is nearly along the tangent
    // there and would leave next to nothing once the tangent was taken out of it.
    nx = FRAME[6]
    ny = FRAME[7]
    nz = FRAME[8]
  } else {
    const v1x = cx - RING[0]
    const v1y = cy - RING[1]
    const v1z = cz - RING[2]
    const c1 = v1x * v1x + v1y * v1y + v1z * v1z
    let rx = RING[3]
    let ry = RING[4]
    let rz = RING[5]
    let sx = RING[9]
    let sy = RING[10]
    let sz = RING[11]
    if (c1 > 1e-24) {
      const kr = (2 * (v1x * rx + v1y * ry + v1z * rz)) / c1
      const ks = (2 * (v1x * sx + v1y * sy + v1z * sz)) / c1
      rx -= kr * v1x
      ry -= kr * v1y
      rz -= kr * v1z
      sx -= ks * v1x
      sy -= ks * v1y
      sz -= ks * v1z
    }
    const v2x = tx - sx
    const v2y = ty - sy
    const v2z = tz - sz
    const c2 = v2x * v2x + v2y * v2y + v2z * v2z
    if (c2 > 1e-24) {
      const k = (2 * (v2x * rx + v2y * ry + v2z * rz)) / c2
      rx -= k * v2x
      ry -= k * v2y
      rz -= k * v2z
    }
    nx = rx
    ny = ry
    nz = rz
  }
  // Exactly perpendicular to the tangent and exactly unit, whatever the rounding did on the way.
  const along = nx * tx + ny * ty + nz * tz
  nx -= along * tx
  ny -= along * ty
  nz -= along * tz
  const nl = Math.hypot(nx, ny, nz) || 1
  nx /= nl
  ny /= nl
  nz /= nl
  RING[0] = cx
  RING[1] = cy
  RING[2] = cz
  RING[3] = nx
  RING[4] = ny
  RING[5] = nz
  RING[6] = ty * nz - tz * ny
  RING[7] = tz * nx - tx * nz
  RING[8] = tx * ny - ty * nx
  RING[9] = tx
  RING[10] = ty
  RING[11] = tz
}

/**
 * The centre line of the coil as x, y, z triples (float64), one per ring: the thread itself,
 * without the wire's thickness. The mesh rings are centred on these points; the tests and any
 * picking read the geometry from here rather than from the float32 vertices.
 */
export function coilCentreline(a: V3, b: V3, coilRadius: number, shape: CoilShape = SPRING_COIL): Float64Array {
  checkShape(shape)
  const N = shape.turns * shape.segmentsPerTurn
  const out = new Float64Array((N + 1) * 3)
  axisFrame(a, b, FRAME)
  for (let i = 0; i <= N; i++) {
    thread(a, b, FRAME, coilRadius, shape.turns, i / N, THREAD)
    out[3 * i] = THREAD[0]
    out[3 * i + 1] = THREAD[1]
    out[3 * i + 2] = THREAD[2]
  }
  return out
}

/**
 * Writes a spring between `a` and `b` into `positions` and `normals`, in place, allocating nothing:
 * the view owns one geometry per spring and calls this each frame, then flags both attributes.
 *
 * The axial extent is exactly |b − a| and the turn count is `shape.turns` for any length. The wire
 * keeps `wireRadius` however far the spring is stretched or squeezed, which is the whole reason
 * this is rewritten each frame instead of scaling one unit coil along the axis. Pass
 * `visibleRadius(...)` as the wire radius to keep it from thinning to nothing when zoomed out;
 * it is held to MAX_WIRE of the coil radius, past which the end hooks would fold.
 */
export function writeCoil(a: V3, b: V3, coilRadius: number, wireRadius: number, positions: Float32Array, normals: Float32Array, shape: CoilShape = SPRING_COIL): void {
  checkShape(shape)
  const R = shape.radialSegments
  const N = shape.turns * shape.segmentsPerTurn
  const need = (N + 1) * R * 3
  if (positions.length < need || normals.length < need) throw new RangeError(`writeCoil needs arrays of ${need} numbers; got ${positions.length} and ${normals.length}.`)
  const wire = coilRadius > 0 ? Math.min(wireRadius, MAX_WIRE * coilRadius) : wireRadius
  axisFrame(a, b, FRAME)
  const ring = ringTable(R)
  let o = 0
  for (let i = 0; i <= N; i++) {
    thread(a, b, FRAME, coilRadius, shape.turns, i / N, THREAD)
    carryFrame(i === 0)
    const cx = RING[0]
    const cy = RING[1]
    const cz = RING[2]
    const nx = RING[3]
    const ny = RING[4]
    const nz = RING[5]
    const bx = RING[6]
    const by = RING[7]
    const bz = RING[8]
    for (let j = 0; j < R; j++) {
      const cj = ring[2 * j]
      const sj = ring[2 * j + 1]
      const px = cj * nx + sj * bx
      const py = cj * ny + sj * by
      const pz = cj * nz + sj * bz
      normals[o] = px
      normals[o + 1] = py
      normals[o + 2] = pz
      positions[o] = cx + wire * px
      positions[o + 1] = cy + wire * py
      positions[o + 2] = cz + wire * pz
      o += 3
    }
  }
}

// =============================================================================================
// B. Rods, strings and the links of a rope
// =============================================================================================

/** Where to put a unit cylinder (radius 1, height 1, along y, centred) so it runs from a to b. */
export interface LinkPlacement {
  mid: V3
  /** Turns +y onto b − a. */
  quat: Quat
  length: number
}

/**
 * Rotation taking +y onto the unit direction (x, y, z), written into `q`. Two forms, each stable
 * where it is used: from straight up the shortest arc is (d × ŷ, 1 + y); near straight down that
 * loses all its digits, so the turn goes by way of a half-turn about x instead.
 */
function quatFromY(x: number, y: number, z: number, q: Quat): void {
  if (y > -0.5) {
    const w = 1 + y
    const n = Math.hypot(z, x, w)
    q[0] = z / n
    q[1] = 0
    q[2] = -x / n
    q[3] = w / n
  } else {
    const w = 1 - y
    const n = Math.hypot(w, x, z)
    q[0] = w / n
    q[1] = x / n
    q[2] = 0
    q[3] = z / n
  }
}

/**
 * Midpoint, rotation and length for a rod, string or spring-less link from a to b, for a unit
 * cylinder scaled (radius, length, radius). Pass the same `out` every frame to allocate nothing.
 * With a == b there is no direction: the rotation is the identity and the length 0.
 */
export function linkPlacement(a: ArrayLike<number>, b: ArrayLike<number>, out: LinkPlacement = { mid: [0, 0, 0], quat: [0, 0, 0, 1], length: 0 }): LinkPlacement {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const dz = b[2] - a[2]
  const L = Math.hypot(dx, dy, dz)
  out.mid[0] = (a[0] + b[0]) / 2
  out.mid[1] = (a[1] + b[1]) / 2
  out.mid[2] = (a[2] + b[2]) / 2
  out.length = L
  if (L > 1e-9) quatFromY(dx / L, dy / L, dz / L, out.quat)
  else {
    out.quat[0] = 0
    out.quat[1] = 0
    out.quat[2] = 0
    out.quat[3] = 1
  }
  return out
}

/**
 * How each kind of connection is drawn: the theme token of its colour, its radius in metres and
 * the fewest pixels it may be across on screen (see visibleRadius). They were all one-pixel lines
 * in one grey, so a rod, a string and a spring looked alike; now a rod is a solid bar, a rope a
 * thick chain of links with a bead at every joint, a string a thin thread and a spring a coil. A
 * rope over a pulley is a rope, and a hinge's pin is drawn in the rod's steel. A spring's wire is
 * sized from its natural length by springLook, so its radius here is unused.
 */
export const LINK_LOOK = {
  spring: { token: '--sim-spring', radius: 0, minPixels: 2 },
  rod: { token: '--sim-rod', radius: 0.025, minPixels: 4 },
  string: { token: '--sim-string', radius: 0.006, minPixels: 2 },
  rope: { token: '--sim-rope', radius: 0.022, minPixels: 3 },
  pulley: { token: '--sim-rope', radius: 0.022, minPixels: 3 },
  hinge: { token: '--sim-rod', radius: 0.035, minPixels: 4 }
} as const

/** A rope's beads are this much wider than the rope, so a joint shows as a knot in the line. */
export const BEAD_SCALE = 1.35

const ROPE_SCRATCH: LinkPlacement = { mid: [0, 0, 0], quat: [0, 0, 0, 1], length: 0 }
const NO_TURN: Quat = [0, 0, 0, 1]

/** A 4×4 matrix, column-major as three.js keeps them: Matrix4.compose without the objects. */
function composeInto(out: Float32Array, o: number, px: number, py: number, pz: number, q: Quat, sx: number, sy: number, sz: number): void {
  const x = q[0]
  const y = q[1]
  const z = q[2]
  const w = q[3]
  const x2 = x + x
  const y2 = y + y
  const z2 = z + z
  const xx = x * x2
  const xy = x * y2
  const xz = x * z2
  const yy = y * y2
  const yz = y * z2
  const zz = z * z2
  const wx = w * x2
  const wy = w * y2
  const wz = w * z2
  out[o] = (1 - (yy + zz)) * sx
  out[o + 1] = (xy + wz) * sx
  out[o + 2] = (xz - wy) * sx
  out[o + 3] = 0
  out[o + 4] = (xy - wz) * sy
  out[o + 5] = (1 - (xx + zz)) * sy
  out[o + 6] = (yz + wx) * sy
  out[o + 7] = 0
  out[o + 8] = (xz + wy) * sz
  out[o + 9] = (yz - wx) * sz
  out[o + 10] = (1 - (xx + yy)) * sz
  out[o + 11] = 0
  out[o + 12] = px
  out[o + 13] = py
  out[o + 14] = pz
  out[o + 15] = 1
}

/**
 * Instance matrices (16 numbers each) for a rope drawn through `points`, one unit cylinder per
 * gap, each `fill` of its gap long and centred in it: the whole gap by default, so the pieces
 * meet end to end and the rope is one unbroken line. (Gaps between them made it a dashed line,
 * which reads as a path or a guide, not as a rope.) Writes into `out` (an InstancedMesh's
 * instanceMatrix.array) without allocating, and returns how many were written: points − 1, or as
 * many as `out` has room for, so a longer rope than the buffer cannot write past its end.
 * A zero-length gap still gets a matrix a hair thick rather than a singular one, which the
 * lighting cannot invert.
 */
export function ropeMatrices(points: ReadonlyArray<ArrayLike<number>>, radius: number, out: Float32Array, fill = 1): number {
  const room = Math.floor(out.length / 16)
  const n = Math.min(Math.max(points.length - 1, 0), room)
  const r = Math.max(radius, 1e-6)
  for (let i = 0; i < n; i++) {
    const pl = linkPlacement(points[i], points[i + 1], ROPE_SCRATCH)
    composeInto(out, i * 16, pl.mid[0], pl.mid[1], pl.mid[2], pl.quat, r, Math.max(pl.length * fill, 1e-6), r)
  }
  return n
}

/**
 * Instance matrices for the beads of a rope: a unit ball scaled to `radius` on every joint between
 * two pieces (the path's points but its two ends). A rope is a chain of 20 cm links in the engine,
 * and the beads show where they join; they also round off the notch a bend leaves between two
 * straight pieces. Returns how many were written, never more than `out` has room for.
 */
export function beadMatrices(points: ReadonlyArray<ArrayLike<number>>, radius: number, out: Float32Array): number {
  const room = Math.floor(out.length / 16)
  const n = Math.min(Math.max(points.length - 2, 0), room)
  const r = Math.max(radius, 1e-6)
  for (let i = 0; i < n; i++) {
    const p = points[i + 1]
    composeInto(out, i * 16, p[0], p[1], p[2], NO_TURN, r, r, r)
  }
  return n
}

/**
 * The line a rope over a pulley is drawn along: from the first body up to the rim, half way round
 * the wheel, and down to the second. The engine's rope is two straight runs from the rim points
 * (`p1`, `p2`, opposite ends of a diameter across the axle); drawn as given, the piece between
 * them cut straight through the middle of the wheel. The arc goes round the side of the wheel away
 * from the bodies — over the top when they hang below it — in the wheel's own plane, square to
 * `axle`, in `segments` equal steps. A wheel of no size is drawn as the straight runs it is.
 */
export function pulleyRopePath(pa: V3, p1: V3, p2: V3, pb: V3, axle: V3, segments = 16): V3[] {
  const c: V3 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2]
  const r = Math.hypot(p1[0] - c[0], p1[1] - c[1], p1[2] - c[2])
  if (!(r > 1e-9)) return [pa, p1, p2, pb]
  const e1: V3 = [(p1[0] - c[0]) / r, (p1[1] - c[1]) / r, (p1[2] - c[2]) / r]
  // Across the wheel in its own plane: the axle crossed with the rim direction. An axle along the
  // rope itself has no such plane; then the wheel is taken to stand upright.
  let e2: V3 = [axle[1] * e1[2] - axle[2] * e1[1], axle[2] * e1[0] - axle[0] * e1[2], axle[0] * e1[1] - axle[1] * e1[0]]
  if (Math.hypot(...e2) < 1e-9) e2 = [-e1[1] * e1[0], 1 - e1[1] * e1[1], -e1[1] * e1[2]]
  if (Math.hypot(...e2) < 1e-9) e2 = across(e1)
  const l2 = Math.hypot(...e2)
  e2 = [e2[0] / l2, e2[1] / l2, e2[2] / l2]
  // Away from the bodies; with the bodies level with the axle, over the top.
  const toward = (pa[0] - c[0] + pb[0] - c[0]) * e2[0] + (pa[1] - c[1] + pb[1] - c[1]) * e2[1] + (pa[2] - c[2] + pb[2] - c[2]) * e2[2]
  if (toward > 1e-9 || (Math.abs(toward) <= 1e-9 && e2[1] < 0)) e2 = [-e2[0], -e2[1], -e2[2]]
  const path: V3[] = [pa, p1]
  for (let k = 1; k < segments; k++) {
    const phi = (Math.PI * k) / segments
    const cs = Math.cos(phi)
    const sn = Math.sin(phi)
    path.push([c[0] + r * (cs * e1[0] + sn * e2[0]), c[1] + r * (cs * e1[1] + sn * e2[1]), c[2] + r * (cs * e1[2] + sn * e2[2])])
  }
  path.push(p2, pb)
  return path
}

/** A vector turned by a unit quaternion (x, y, z, w): v + 2w(q × v) + 2 q × (q × v). */
function turn(q: Quat, v: ArrayLike<number>): V3 {
  const [x, y, z, w] = q
  const tx = 2 * (y * v[2] - z * v[1])
  const ty = 2 * (z * v[0] - x * v[2])
  const tz = 2 * (x * v[1] - y * v[0])
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)]
}

/**
 * Where to put the pin of a hinge: through the pivot, along the hinge axis (each body's own z, as
 * world.ts builds the hinge), `halfLength` out each way, for a unit cylinder as linkPlacement
 * gives. `position` and `rotation` are the body's drawn pose and `pivot` the hinge point in the
 * body's own frame measured from its position. The seesaw's plank turned about nothing anyone
 * could see; drawn, its pin says where the lever turns.
 */
export function hingePin(position: V3, rotation: Quat, pivot: V3, halfLength: number, out?: LinkPlacement): LinkPlacement {
  const p = turn(rotation, pivot)
  const axis = turn(rotation, [0, 0, 1])
  const c: V3 = [position[0] + p[0], position[1] + p[1], position[2] + p[2]]
  return linkPlacement([c[0] - axis[0] * halfLength, c[1] - axis[1] * halfLength, c[2] - axis[2] * halfLength], [c[0] + axis[0] * halfLength, c[1] + axis[1] * halfLength, c[2] + axis[2] * halfLength], out)
}

// =============================================================================================
// C. Minimum thickness on screen
// =============================================================================================

/**
 * A radius that is never thinner than `minPixels` across on screen. A string a centimetre thick
 * is a fraction of a pixel once the camera is a few metres back, and a line that disappears is
 * the very fault this replaces; the view passes its own pixels-per-metre each frame. A camera
 * that reports no scale (zero, NaN) leaves the world radius alone.
 */
export function visibleRadius(worldRadius: number, minPixels: number, pixelsPerMetre: number): number {
  if (!(pixelsPerMetre > 0)) return worldRadius
  return Math.max(worldRadius, minPixels / 2 / pixelsPerMetre)
}

// =============================================================================================
// D. Marking a ball so its spin shows
// =============================================================================================

/**
 * What the ball's colour is multiplied by: the upper half is the body colour untouched, the lower
 * half is darker, and a thin band on the equator is darker still. These are LINEAR factors (the
 * shader multiplies them into the linear colour), so the lower half reads about three quarters as
 * bright on screen and the band about half, enough to see from a distance, not enough to hide the
 * colour the student chose.
 */
export const BALL_TONES = { light: 1, dark: 0.5, band: 0.15 } as const

/** Half the band's height, as a fraction of the radius: one ring of vertices on an even-ringed sphere. */
const BAND_HALF = 0.07

/**
 * Sphere resolution (around, from pole to pole). The band is one ring of vertices, so the rings
 * must be an even number or there is no ring on the equator and the band is lost; 48 × 32 puts
 * the equator ring on the equator and makes the band a thin stripe, not a smear.
 */
export const BALL_SEGMENTS: [number, number] = [48, 32]

/**
 * Per-vertex colour factors (r = g = b, three per vertex) for a sphere whose poles lie on its own
 * y axis. Pass the radius if it is known; otherwise it is the farthest vertex from the centre.
 *
 * The marking shows spin about any axis across the poles, which is what rolling is. A ball turning
 * about its own pole axis looks the same at every angle: that is the cost of a marking that reads
 * as a ball and not as a patterned bauble.
 */
export function ballFactors(positions: ArrayLike<number>, radius?: number): Float32Array {
  const n = Math.floor(positions.length / 3)
  let r = radius ?? 0
  if (radius === undefined) for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]))
  const out = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const s = r > 0 ? positions[3 * i + 1] / r : 0
    const f = s > BAND_HALF ? BALL_TONES.light : s < -BAND_HALF ? BALL_TONES.dark : BALL_TONES.band
    out[3 * i] = f
    out[3 * i + 1] = f
    out[3 * i + 2] = f
  }
  return out
}

// =============================================================================================
// Building meshes from scratch (outlines, the pulley)
// =============================================================================================

/** Collects vertices and triangles, then hands back typed arrays. Built once per shape, not per frame. */
class MeshBuilder {
  private pos: number[] = []
  private nor: number[] = []
  private fac: number[] = []
  private idx: number[] = []

  vertex(px: number, py: number, pz: number, nx: number, ny: number, nz: number, factor = 1): number {
    const i = this.pos.length / 3
    this.pos.push(px, py, pz)
    this.nor.push(nx, ny, nz)
    this.fac.push(factor, factor, factor)
    return i
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c)
  }

  build(withFactors = false): MeshData {
    const count = this.pos.length / 3
    const indices = indexArray(count, this.idx.length)
    indices.set(this.idx)
    const data: MeshData = { positions: Float32Array.from(this.pos), normals: Float32Array.from(this.nor), indices }
    if (withFactors) data.factors = Float32Array.from(this.fac)
    return data
  }
}

/**
 * Joins several meshes into one, shifting each one's indices. A body that is drawn as a surface
 * plus its outline, or a wheel plus its axle, is then one geometry on one mesh, so the engine's
 * transforms and the picking keep treating it as the one body it is. A part without `factors`
 * counts as 1 (untouched) when another part has them.
 */
export function mergeMeshes(parts: MeshData[]): MeshData {
  let vertices = 0
  let triangles = 0
  let tinted = false
  for (const p of parts) {
    vertices += p.positions.length / 3
    triangles += p.indices.length
    if (p.factors) tinted = true
  }
  const positions = new Float32Array(vertices * 3)
  const normals = new Float32Array(vertices * 3)
  const indices = indexArray(vertices, triangles)
  const factors = tinted ? new Float32Array(vertices * 3).fill(1) : undefined
  let v = 0
  let t = 0
  for (const p of parts) {
    positions.set(p.positions, v * 3)
    normals.set(p.normals, v * 3)
    if (factors && p.factors) factors.set(p.factors, v * 3)
    for (let i = 0; i < p.indices.length; i++) indices[t + i] = p.indices[i] + v
    v += p.positions.length / 3
    t += p.indices.length
  }
  return factors ? { positions, normals, indices, factors } : { positions, normals, indices }
}

/** A unit vector across `d` (unit): the world axis least along it, crossed with it. */
function across(d: V3): V3 {
  const ax = Math.abs(d[0])
  const ay = Math.abs(d[1])
  const az = Math.abs(d[2])
  const ref: V3 = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1]
  const x = d[1] * ref[2] - d[2] * ref[1]
  const y = d[2] * ref[0] - d[0] * ref[2]
  const z = d[0] * ref[1] - d[1] * ref[0]
  const l = Math.hypot(x, y, z)
  return [x / l, y / l, z / l]
}

/**
 * A straight tube of radius r from p to q with open ends. The open ends are hidden inside the
 * ball put at each corner, so no cap is needed and the joint is round at any angle. Skipped when
 * p and q coincide (a flat body has edges of no length).
 */
function addTube(m: MeshBuilder, p: V3, q: V3, r: number, sides: number): void {
  const ex = q[0] - p[0]
  const ey = q[1] - p[1]
  const ez = q[2] - p[2]
  const len = Math.hypot(ex, ey, ez)
  if (!(len > 1e-9)) return
  const d: V3 = [ex / len, ey / len, ez / len]
  const e1 = across(d)
  // e1 × e2 = d, so the corners run counter-clockwise looking along d.
  const e2: V3 = [d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]]
  const table = ringTable(sides)
  const first = [0, 0]
  for (let ring = 0; ring < 2; ring++) {
    const c = ring === 0 ? p : q
    first[ring] = -1
    for (let j = 0; j < sides; j++) {
      const cj = table[2 * j]
      const sj = table[2 * j + 1]
      const nx = cj * e1[0] + sj * e2[0]
      const ny = cj * e1[1] + sj * e2[1]
      const nz = cj * e1[2] + sj * e2[2]
      const i = m.vertex(c[0] + r * nx, c[1] + r * ny, c[2] + r * nz, nx, ny, nz)
      if (first[ring] < 0) first[ring] = i
    }
  }
  for (let j = 0; j < sides; j++) {
    const a = first[0] + j
    const d2 = first[0] + ((j + 1) % sides)
    const b = first[1] + j
    const c = first[1] + ((j + 1) % sides)
    m.tri(a, d2, b)
    m.tri(d2, c, b)
  }
}

/** A small ball of radius r at c: the round joint where tubes meet. */
function addBall(m: MeshBuilder, c: V3, r: number, sides: number, rows: number): void {
  const table = ringTable(sides)
  const base = m.vertex(c[0], c[1] + r, c[2], 0, 1, 0)
  // Ring k runs from the top pole (k = 0) to the bottom pole (k = rows).
  const start: number[] = [base]
  for (let k = 0; k <= rows; k++) {
    const psi = (Math.PI * k) / rows
    const sp = Math.sin(psi)
    const cp = Math.cos(psi)
    let first = -1
    for (let j = 0; j < sides; j++) {
      // x = sin ψ sin φ, z = sin ψ cos φ, the layout three.js's own sphere has.
      const nx = sp * table[2 * j + 1]
      const ny = cp
      const nz = sp * table[2 * j]
      const i = m.vertex(c[0] + r * nx, c[1] + r * ny, c[2] + r * nz, nx, ny, nz)
      if (first < 0) first = i
    }
    start[k] = first
  }
  for (let k = 0; k < rows; k++) {
    for (let j = 0; j < sides; j++) {
      const a = start[k] + j
      const d = start[k] + ((j + 1) % sides)
      const b = start[k + 1] + j
      const c2 = start[k + 1] + ((j + 1) % sides)
      m.tri(a, b, d)
      m.tri(b, c2, d)
    }
  }
}

/**
 * A ring of tube round a circle in the horizontal plane at `centre`: the rim of a cylinder or
 * cone. The ring's corners sit at x = R sin θ, z = R cos θ, the same corners three.js gives a
 * cylinder, so the tube follows the mesh's own rim and not a smoother circle just outside it.
 */
function addTorus(m: MeshBuilder, centre: V3, major: number, minor: number, majorSegments: number, minorSides: number): void {
  const table = ringTable(minorSides)
  const starts: number[] = []
  for (let i = 0; i < majorSegments; i++) {
    const theta = (TAU * i) / majorSegments
    const sx = Math.sin(theta)
    const sz = Math.cos(theta)
    let first = -1
    for (let j = 0; j < minorSides; j++) {
      // e1 = outward (sin θ, 0, cos θ), e2 = −y, so e1 × e2 points the way θ grows.
      const nx = table[2 * j] * sx
      const ny = -table[2 * j + 1]
      const nz = table[2 * j] * sz
      const v = m.vertex(centre[0] + major * sx + minor * nx, centre[1] + minor * ny, centre[2] + major * sz + minor * nz, nx, ny, nz)
      if (first < 0) first = v
    }
    starts.push(first)
  }
  for (let i = 0; i < majorSegments; i++) {
    const next = (i + 1) % majorSegments
    for (let j = 0; j < minorSides; j++) {
      const a = starts[i] + j
      const d = starts[i] + ((j + 1) % minorSides)
      const b = starts[next] + j
      const c = starts[next] + ((j + 1) % minorSides)
      m.tri(a, d, b)
      m.tri(d, c, b)
    }
  }
}

/**
 * A surface of revolution about the y axis from a profile of (radius, height) points, with a hard
 * edge at every corner of the profile (each piece has its own vertices and a flat normal), so a
 * wheel's flanges and groove are crisp. The profile is walked counter-clockwise with the axis on
 * its left (out along the bottom, up the side, in along the top), which makes the outward normal
 * the tangent turned a quarter turn to the right. `tones[i]` tints profile piece i.
 */
function addLathe(m: MeshBuilder, profile: [number, number][], segments: number, tones: number[]): void {
  const table = ringTable(segments)
  for (let s = 0; s + 1 < profile.length; s++) {
    const [r0, y0] = profile[s]
    const [r1, y1] = profile[s + 1]
    const tr = r1 - r0
    const ty = y1 - y0
    const tl = Math.hypot(tr, ty)
    if (!(tl > 1e-9)) continue
    const nr = ty / tl
    const ny = -tr / tl
    const tone = tones[s] ?? 1
    const first = [0, 0]
    for (let end = 0; end < 2; end++) {
      const r = end === 0 ? r0 : r1
      const y = end === 0 ? y0 : y1
      first[end] = -1
      for (let j = 0; j < segments; j++) {
        // x = sin θ, z = cos θ, as three.js's cylinder lays its corners out.
        const sx = table[2 * j + 1]
        const sz = table[2 * j]
        const v = m.vertex(r * sx, y, r * sz, nr * sx, ny, nr * sz, tone)
        if (first[end] < 0) first[end] = v
      }
    }
    for (let j = 0; j < segments; j++) {
      const a = first[0] + j
      const d = first[0] + ((j + 1) % segments)
      const b = first[1] + j
      const c = first[1] + ((j + 1) % segments)
      m.tri(a, d, b)
      m.tri(d, c, b)
    }
  }
}

// =============================================================================================
// E. Edge outlines
// =============================================================================================

/** Corners of the tube joints, and how round the outline's tubes are. Low: a line this thin is a few pixels across. */
const EDGE_SIDES = 8
const JOINT_ROWS = 4

/**
 * The outline's tube radius in metres. A line of this thickness is the same on a 6 cm pivot and
 * a 4 m wall, which is the point of an outline: it does not grow with the body. 1 cm reads as a
 * thin edge on a crate half a metre across.
 */
export const EDGE_RADIUS = 0.01

/** The corners of a cylinder's and a cone's rim, as many as surfaceOf cuts them into. */
export const RIM_SEGMENTS = 28

/**
 * The six corners of a ramp of full size (a, b, c), in the order the collision hull (world.ts) lists
 * them: the right angle is at x = −a/2, the slope falls from the top of that wall to the floor at
 * x = +a/2, and corners 0–2 are the z = −c/2 end, 3–5 the z = +c/2 end. Written once here so the
 * wedge's outline and its surface cannot drift apart.
 */
export function rampCorners(size: V3): V3[] {
  const hx = Math.abs(size[0]) / 2
  const hy = Math.abs(size[1]) / 2
  const hz = Math.abs(size[2]) / 2
  return [
    [-hx, -hy, -hz],
    [hx, -hy, -hz],
    [-hx, hy, -hz],
    [-hx, -hy, hz],
    [hx, -hy, hz],
    [-hx, hy, hz]
  ]
}

/**
 * The ramp's eight triangles over `rampCorners`, wound counter-clockwise seen from outside.
 *
 * These are the triangles of the old SandboxView wedge's table with each one reversed. That table
 * was wound the other way, clockwise from outside, so three.js (which culls clockwise faces)
 * showed a ramp seen from outside as the inside of its far faces, and computeVertexNormals gave
 * every normal pointing inward: the ramp was drawn inside-out. From the side view it looked right
 * (the far end triangle was the one that showed); orbited round in 3-D, the hollow showed.
 */
export const RAMP_TRIANGLES: [number, number, number][] = [
  [0, 2, 1],
  [3, 4, 5],
  [0, 5, 2],
  [0, 3, 5],
  [1, 5, 4],
  [1, 2, 5],
  [0, 4, 3],
  [0, 1, 4]
]

/** The wedge's nine edges as pairs of `rampCorners` indices: both triangles and the three that join them. */
export const RAMP_EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 0],
  [3, 4],
  [4, 5],
  [5, 3],
  [0, 3],
  [1, 4],
  [2, 5]
]

/** The side an outline must stay small against: the shortest length that matters for the shape. */
function smallestSide(shape: ShapeKind, size: V3): number {
  const [a, b, c] = size.map(Math.abs)
  const lengths = shape === 'cylinder' ? [2 * a, b] : shape === 'cone' ? [a, b] : [a, b, c]
  const real = lengths.filter((x) => x > 0)
  return real.length ? Math.min(...real) : Infinity
}

/**
 * The outline radius for a body: EDGE_RADIUS, but never more than 6 % of the body's shortest
 * side. On a 6 cm pivot a full 1 cm tube would be a third of its width and the pivot would read
 * as nothing but outline.
 */
export function edgeRadiusFor(shape: ShapeKind, size: V3, wanted: number = EDGE_RADIUS): number {
  return Math.min(wanted, 0.06 * smallestSide(shape, size))
}

/**
 * Thin dark tubes along the edges where two lit faces of one colour would otherwise merge, as one
 * mesh of exactly this size. Box, plank and wall: the twelve cuboid edges. Ramp: the wedge's nine.
 * Cylinder: its two rims. Cone: its base rim. Anything else (ground, sphere, capsule, pulley) has
 * no outline and gets null: the floor is too big for one, and the round shapes have no edge.
 *
 * Built for the size, never scaled from a unit cage: a non-uniform scale would also scale the
 * tubes' thickness. The tubes are centred on the edges, so half of each lies outside the body.
 */
export function edgeCage(shape: ShapeKind, size: V3, radius: number = edgeRadiusFor(shape, size)): MeshData | null {
  const [a, b, c] = size.map(Math.abs)
  const m = new MeshBuilder()
  switch (shape) {
    case 'box':
    case 'plank':
    case 'wall': {
      const hx = a / 2
      const hy = b / 2
      const hz = c / 2
      const corner = (k: number): V3 => [k & 1 ? hx : -hx, k & 2 ? hy : -hy, k & 4 ? hz : -hz]
      for (let k = 0; k < 8; k++) {
        for (const bit of [1, 2, 4]) if (!(k & bit)) addTube(m, corner(k), corner(k | bit), radius, EDGE_SIDES)
        addBall(m, corner(k), radius, EDGE_SIDES, JOINT_ROWS)
      }
      break
    }
    case 'ramp': {
      const v = rampCorners(size)
      for (const [i, j] of RAMP_EDGES) addTube(m, v[i], v[j], radius, EDGE_SIDES)
      for (const p of v) addBall(m, p, radius, EDGE_SIDES, JOINT_ROWS)
      break
    }
    case 'cylinder':
      addTorus(m, [0, b / 2, 0], a, radius, RIM_SEGMENTS, EDGE_SIDES)
      addTorus(m, [0, -b / 2, 0], a, radius, RIM_SEGMENTS, EDGE_SIDES)
      break
    case 'cone':
      // The cone's size[0] is its base width: the rim's radius is half of it.
      addTorus(m, [0, -b / 2, 0], a / 2, radius, RIM_SEGMENTS, EDGE_SIDES)
      break
    default:
      return null
  }
  return m.build()
}

// =============================================================================================
// F. The pulley
// =============================================================================================

/** Corners round the wheel and its axle: the same fineness as a cylinder, a touch rounder. */
const PULLEY_SEGMENTS = 32

/** How far the axle shows beyond each flat face of the wheel, as a multiple of the wheel's thickness. */
const AXLE_REACH = 0.6

/** The wheel's tint where the rope runs, and the axle's: darker than the rim, so the hub reads face-on. */
const GROOVE_TONE = 0.75
const AXLE_TONE = 0.45

/**
 * A pulley wheel with a groove round its rim for the rope and a thin axle through its centre,
 * as one mesh. Radius size[0], thickness size[1], along its own y axis: the sizes and the turn
 * that stands it facing the camera are exactly those of the plain cylinder it replaces.
 *
 * Seen face-on, which is how the pulley is almost always seen (the side view looks straight down
 * its axle), a bare axle would be a disc of the wheel's own colour on the wheel's own face and
 * vanish. So the mesh carries `factors`: the axle and the groove are tinted darker, to be drawn
 * with vertexColors the way a marked ball is.
 */
export function pulleyMesh(size: V3): MeshData {
  const a = Math.abs(size[0])
  const b = Math.abs(size[1])
  const h = b / 2
  // The groove is the rope's seat: as deep as a seventh of the radius, but never deeper than half
  // the wheel is thick, so a thin wheel keeps a rim.
  const depth = Math.min(0.14 * a, 0.45 * b)
  const wheel: [number, number][] = [
    [0, -h],
    [a, -h],
    [a, -0.42 * h],
    [a - depth, -0.14 * h],
    [a - depth, 0.14 * h],
    [a, 0.42 * h],
    [a, h],
    [0, h]
  ]
  const reach = h + AXLE_REACH * b
  const ra = 0.14 * a
  const axle: [number, number][] = [
    [0, -reach],
    [ra, -reach],
    [ra, reach],
    [0, reach]
  ]
  const m = new MeshBuilder()
  addLathe(m, wheel, PULLEY_SEGMENTS, [1, 1, GROOVE_TONE, GROOVE_TONE, GROOVE_TONE, 1, 1])
  addLathe(m, axle, PULLEY_SEGMENTS, [AXLE_TONE, AXLE_TONE, AXLE_TONE])
  return m.build(true)
}

// =============================================================================================
// G. A body's whole look
// =============================================================================================

/**
 * The outline's tint: it is the body's own colour times this, so it is darker than the faces in
 * any theme and with any colour a student picks, and needs no colour of its own.
 */
export const EDGE_TONE = 0.35

/**
 * A ramp's surface: the eight triangles of RAMP_TRIANGLES over the six corners of `rampCorners`,
 * each with its own three vertices and its face's normal, so the faces are flat and the edges
 * crisp. It replaces SandboxView's old wedge, whose table was wound clockwise from outside: three.js
 * culled every face seen from outside and showed the inside of the far ones instead.
 */
export function rampSurface(size: V3): MeshData {
  const v = rampCorners(size)
  const m = new MeshBuilder()
  for (const [i, j, k] of RAMP_TRIANGLES) {
    const a = v[i]
    const b = v[j]
    const c = v[k]
    const ux = b[0] - a[0]
    const uy = b[1] - a[1]
    const uz = b[2] - a[2]
    const wx = c[0] - a[0]
    const wy = c[1] - a[1]
    const wz = c[2] - a[2]
    let nx = uy * wz - uz * wy
    let ny = uz * wx - ux * wz
    let nz = ux * wy - uy * wx
    const nl = Math.hypot(nx, ny, nz) || 1
    nx /= nl
    ny /= nl
    nz /= nl
    const first = m.vertex(a[0], a[1], a[2], nx, ny, nz)
    m.vertex(b[0], b[1], b[2], nx, ny, nz)
    m.vertex(c[0], c[1], c[2], nx, ny, nz)
    m.tri(first, first + 1, first + 2)
  }
  return m.build()
}

/** A surface untinted, with its outline (if it has one) after it in EDGE_TONE, as one mesh. */
function withOutline(surface: MeshData, cage: MeshData | null): MeshData {
  const plain: MeshData = { ...surface, factors: new Float32Array(surface.positions.length).fill(1) }
  if (!cage) return plain
  return mergeMeshes([plain, { ...cage, factors: new Float32Array(cage.positions.length).fill(EDGE_TONE) }])
}

/**
 * Everything one body is drawn with, as one mesh with a tint on every vertex: the factors the
 * body's colour is multiplied by, so a colour the theme or the student gives it still shows.
 * `surface` is the body's plain shape (the view builds it with three.js: sphere, cylinder, box…).
 *
 *  - a box, plank, wall, ramp, cylinder or cone gets its outline (edgeCage) in EDGE_TONE, where
 *    faces of one colour would otherwise run together;
 *  - a sphere gets its two tones and its band (ballFactors), so its spin shows;
 *  - a pulley is the wheel with its groove and axle (pulleyMesh), whatever surface is given;
 *  - a ramp is drawn from its own corners (rampSurface), whatever surface is given;
 *  - a capsule and the floor are drawn plain: the capsule's round ends are its look, and an
 *    outline round a floor kilometres across would never be seen.
 */
export function bodyLook(shape: ShapeKind, size: V3, surface: MeshData | null): MeshData {
  if (shape === 'pulley') return pulleyMesh(size)
  if (shape === 'ramp') return withOutline(rampSurface(size), edgeCage('ramp', size))
  if (!surface) throw new RangeError(`A ${shape} needs its surface to be drawn.`)
  if (shape === 'sphere') return { ...surface, factors: ballFactors(surface.positions, Math.abs(size[0])) }
  return withOutline(surface, edgeCage(shape, size))
}
