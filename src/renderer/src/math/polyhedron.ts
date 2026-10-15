// T974: a solid made from a shape in the 3-D Geometry view - a prism (an outline pushed up), a pyramid (an outline and an apex)
// and a polyhedron from typed corners (their convex hull). Each comes out as faces (the true polygons, and a triangulated
// copy for drawing), the edges, the face areas, the volume and the surface area. Pure maths, tests/polyhedron.test.ts.
import { cross, len, sub, type V3 } from './vec'

export interface Poly3 {
  vertices: V3[]
  /** The true faces, corner indices in order, every one wound so its normal points out of the solid. */
  polys: number[][]
  /** The same faces cut into triangles (a concave outline's cap is not one convex fan). */
  faces: number[][]
  /** Each side of each face once. */
  edges: [number, number][]
  faceAreas: number[]
  volume: number
  area: number
}

const EPS = 1e-9

/** A polygon's area vector by Newell's method (half the sum of cross products round the loop). */
function areaVector(poly: number[], v: V3[]): V3 {
  const n: V3 = [0, 0, 0]
  for (let i = 0; i < poly.length; i++) {
    const a = v[poly[i]]
    const b = v[poly[(i + 1) % poly.length]]
    n[0] += (a[1] - b[1]) * (a[2] + b[2])
    n[1] += (a[2] - b[2]) * (a[0] + b[0])
    n[2] += (a[0] - b[0]) * (a[1] + b[1])
  }
  return [n[0] / 2, n[1] / 2, n[2] / 2]
}

/** A face's unit outward normal (zero for a face with no area). */
export function faceNormal(poly: number[], v: V3[]): V3 {
  const a = areaVector(poly, v)
  const l = len(a)
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]
}

const fan = (p: number[]): number[][] => p.slice(2).map((_, k) => [p[0], p[k + 1], p[k + 2]])

/** Ear clipping of one planar polygon into triangles of its own winding. */
function triangulate(poly: number[], v: V3[]): number[][] {
  if (poly.length <= 3) return [poly]
  const n = areaVector(poly, v)
  const drop = Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2]) ? 0 : Math.abs(n[1]) >= Math.abs(n[2]) ? 1 : 2
  const [iu, iv] = drop === 0 ? [1, 2] : drop === 1 ? [2, 0] : [0, 1]
  const flip = n[drop] < 0 ? -1 : 1
  const turn = (a: number, b: number, c: number) =>
    flip * ((v[b][iu] - v[a][iu]) * (v[c][iv] - v[a][iv]) - (v[b][iv] - v[a][iv]) * (v[c][iu] - v[a][iu]))
  const inside = (p: number, a: number, b: number, c: number) => turn(a, b, p) >= -EPS && turn(b, c, p) >= -EPS && turn(c, a, p) >= -EPS
  const rest = [...poly]
  const out: number[][] = []
  let guard = rest.length * rest.length
  while (rest.length > 3 && guard-- > 0) {
    let clipped = false
    for (let i = 0; i < rest.length; i++) {
      const a = rest[(i + rest.length - 1) % rest.length]
      const b = rest[i]
      const c = rest[(i + 1) % rest.length]
      if (turn(a, b, c) <= EPS) continue
      if (rest.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c))) continue
      out.push([a, b, c])
      rest.splice(i, 1)
      clipped = true
      break
    }
    if (!clipped) break
  }
  if (rest.length >= 3) out.push(...fan(rest))
  return out
}

/** Finish a solid: wind the faces outward, cut them into triangles, list the edges, measure. */
function finish(vertices: V3[], polysIn: number[][]): Poly3 {
  let polys = polysIn
  const volumeOf = (ps: number[][]) => {
    let six = 0
    const o = vertices[0] // measured from a corner, so a solid far from the origin keeps its digits
    for (const p of ps) {
      for (const t of triangulate(p, vertices)) {
        const [a, b, c] = t.map((k) => [vertices[k][0] - o[0], vertices[k][1] - o[1], vertices[k][2] - o[2]])
        six += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])
      }
    }
    return six / 6
  }
  if (volumeOf(polys) < 0) polys = polys.map((p) => [...p].reverse())
  const faces = polys.flatMap((p) => triangulate(p, vertices))
  const seen = new Set<string>()
  const edges: [number, number][] = []
  for (const p of polys) {
    for (let i = 0; i < p.length; i++) {
      const a = Math.min(p[i], p[(i + 1) % p.length])
      const b = Math.max(p[i], p[(i + 1) % p.length])
      if (!seen.has(`${a}:${b}`)) {
        seen.add(`${a}:${b}`)
        edges.push([a, b])
      }
    }
  }
  const faceAreas = polys.map((p) => len(areaVector(p, vertices)))
  return { vertices, polys, faces, edges, faceAreas, volume: volumeOf(polys), area: faceAreas.reduce((s, x) => s + x, 0) }
}

/** An outline (on one horizontal plane) pushed straight up by h: a prism. */
export function extrudeOutline(base: V3[], h: number): Poly3 {
  if (base.length < 3) throw new Error('the outline needs at least three corners')
  if (!(h > 0)) throw new Error('the height must be more than 0')
  const n = base.length
  const vertices: V3[] = [...base, ...base.map((p): V3 => [p[0], p[1], p[2] + h])]
  const polys: number[][] = [Array.from({ length: n }, (_, i) => n - 1 - i), Array.from({ length: n }, (_, i) => n + i)]
  for (let i = 0; i < n; i++) polys.push([i, (i + 1) % n, n + ((i + 1) % n), n + i])
  return finish(vertices, polys)
}

/** An outline and a point off its plane: the pyramid between them. */
export function pyramidOver(base: V3[], apex: V3): Poly3 {
  if (base.length < 3) throw new Error('the outline needs at least three corners')
  const n = areaVector(base.map((_, i) => i), base)
  const l = len(n)
  const off = ((apex[0] - base[0][0]) * n[0] + (apex[1] - base[0][1]) * n[1] + (apex[2] - base[0][2]) * n[2]) / l
  if (!(l > EPS) || Math.abs(off) < 1e-7) throw new Error('the apex lies in the plane of the base, so there is no solid. Lift it off the plane')
  const k = base.length
  const polys: number[][] = [Array.from({ length: k }, (_, i) => i)]
  for (let i = 0; i < k; i++) polys.push([(i + 1) % k, i, k])
  return finish([...base, apex], polys)
}

/** Corners typed like "(0,0,0), (2,0,0), ...": each three numbers in brackets. */
export function parseCorners(text: string): V3[] {
  const groups = text.match(/\(([^()]*)\)/g) ?? []
  if (groups.length === 0 || text.replace(/\([^()]*\)/g, '').replace(/[\s,;]/g, '') !== '') throw new Error('write each corner as three numbers in brackets, like (0, 0, 0), (2, 0, 0)')
  return groups.map((g) => {
    const parts = g.slice(1, -1).split(',').map((s) => s.trim())
    const nums = parts.map(Number)
    if (parts.length !== 3 || parts.some((s) => s === '') || nums.some((x) => !Number.isFinite(x))) throw new Error(`${g} is not three numbers: write a corner like (1, 2, 3)`)
    return nums as V3
  })
}

/** The convex solid whose corners are the typed points: points inside it are left out, coplanar corners make one face. */
export function hullFromCorners(input: V3[]): Poly3 {
  const pts: V3[] = []
  for (const p of input) if (!pts.some((q) => len(sub(p, q)) < 1e-9)) pts.push(p)
  if (pts.length < 4) throw new Error('a solid needs at least four different corners')
  const scale = Math.max(...pts.map((p) => len(sub(p, pts[0])))) // the solid's own size, not its distance from the origin
  const tol = 1e-9 * scale
  const planes = new Map<string, { n: V3; on: number[] }>()
  let solid = false
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      for (let k = j + 1; k < pts.length; k++) {
        const c = cross(sub(pts[j], pts[i]), sub(pts[k], pts[i]))
        const l = len(c)
        if (l < tol * scale) continue
        const n: V3 = [c[0] / l, c[1] / l, c[2] / l]
        let pos = false
        let neg = false
        const on: number[] = []
        pts.forEach((p, m) => {
          const d = (p[0] - pts[i][0]) * n[0] + (p[1] - pts[i][1]) * n[1] + (p[2] - pts[i][2]) * n[2]
          if (d > tol) pos = true
          else if (d < -tol) neg = true
          else on.push(m)
        })
        if (pos && neg) {
          solid = true
          continue
        }
        if (!pos && !neg) continue
        solid = true
        planes.set(on.join(','), { n: pos ? [-n[0], -n[1], -n[2]] : n, on })
      }
    }
  }
  if (!solid) throw new Error('these corners all lie in one flat plane, so they make no solid. Move one corner off it')
  const used: number[] = []
  const polys: number[][] = []
  type Q = { m: number; x: number; y: number }
  for (const { n, on } of planes.values()) {
    const o = pts[on[0]]
    const u0 = Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0])
    const ul = len(u0)
    const u: V3 = [u0[0] / ul, u0[1] / ul, u0[2] / ul]
    const w = cross(n, u)
    const dot = (m: number, a: V3) => (pts[m][0] - o[0]) * a[0] + (pts[m][1] - o[1]) * a[1] + (pts[m][2] - o[2]) * a[2]
    const q: Q[] = on.map((m) => ({ m, x: dot(m, u), y: dot(m, w) }))
    q.sort((a, b) => a.x - b.x || a.y - b.y)
    const t = (a: Q, b: Q, c: Q) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    const half = (seq: Q[]) => {
      const h: Q[] = []
      for (const p of seq) {
        while (h.length >= 2 && t(h[h.length - 2], h[h.length - 1], p) <= tol * scale) h.pop()
        h.push(p)
      }
      h.pop()
      return h
    }
    const ring = [...half(q), ...half([...q].reverse())].map((p) => p.m)
    if (ring.length < 3) continue
    polys.push(ring)
    for (const m of ring) if (!used.includes(m)) used.push(m)
  }
  const index = new Map(used.map((m, i) => [m, i]))
  return finish(used.map((m) => pts[m]), polys.map((p) => p.map((m) => index.get(m) as number)))
}
