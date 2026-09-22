// Geometry Lego: the pieces of a shape taken apart, as maths.
//
// A decomposed shape's parts can be turned into separate polygons the student slides, turns and
// flips like bricks. This module answers the questions that game needs — where should a dragged
// piece snap so its corners meet a neighbour's exactly, what do the pieces on the table make
// together (nothing yet, the shape they came from, or a new shape with the same area), and how is
// "the shape they came from" remembered once the parent polygon is gone — on plain point lists,
// so every answer is testable without the scene.

import { add, dist, dot, mid, normalize, rotateZ, scale, sub, toDeg, toRad, type V3 } from './vec'
import { centroid, perimeter, polygonArea, signedArea2D } from './geometry'
import { classifyPolygon, cleanPolygon, interiorAngles, sideLengths } from './shapes'
import { formatColour, oklabToSrgb, parseColour, srgbToOklab } from '../render/colourMix'
import type { LegoRecord } from '../core/types'

export type { LegoRecord }

const EPS = 1e-6
const round9 = (v: number): number => Math.round(v * 1e9) / 1e9
const toCCW = (pts: V3[]): V3[] => (signedArea2D(pts) < 0 ? [...pts].reverse() : pts)

/** What the pieces on the table make together. */
export type LegoStatus =
  | { kind: 'apart' }
  | { kind: 'original'; outline: V3[] }
  /** One closed shape, but not the one the pieces came from; `name` is what it is ("Parallelogram"). */
  | { kind: 'different'; outline: V3[]; name: string }

/** The shape the pieces were cut from: its corners, or the signature `signatureOf` gave them. */
export type Original = V3[] | string

/**
 * The outline of pieces that tile one region without a gap or an overlap, or null when they do
 * not. Every edge of every piece is split at each corner that lies on it (a corner of one piece
 * often sits in the middle of another's side), then an edge shared by two pieces cancels out —
 * the two walk it in opposite directions, since every piece is taken anticlockwise — and what is
 * left must be one closed loop. The loop's area has to equal the pieces' areas added up, or the
 * pieces overlap somewhere the edges did not show (one piece lying across another).
 */
export function outlineOf(pieces: V3[][], eps = EPS): V3[] | null {
  const verts: V3[] = []
  const idx = (p: V3): number => {
    const i = verts.findIndex((q) => dist(p, q) <= eps)
    if (i >= 0) return i
    verts.push([round9(p[0]), round9(p[1]), 0])
    return verts.length - 1
  }
  const polys = pieces
    .map((pc) => toCCW(cleanPolygon(pc)))
    .filter((pc) => pc.length >= 3)
    .map((pc) => pc.map(idx))
  if (polys.length === 0) return null

  // The corners lying on the segment a–b, in order from a: the corners the edge is split at.
  const along = (a: number, b: number): number[] => {
    const A = verts[a]
    const B = verts[b]
    const d = sub(B, A)
    const l2 = d[0] * d[0] + d[1] * d[1]
    const inner: { k: number; t: number }[] = []
    verts.forEach((p, k) => {
      if (k === a || k === b) return
      const w = sub(p, A)
      const crossZ = d[0] * w[1] - d[1] * w[0]
      if (Math.abs(crossZ) > eps * Math.sqrt(l2)) return
      const t = (d[0] * w[0] + d[1] * w[1]) / l2
      if (t > eps && t < 1 - eps) inner.push({ k, t })
    })
    inner.sort((p, q) => p.t - q.t)
    return [a, ...inner.map((h) => h.k), b]
  }

  // Net direction of every sub-edge: +1 walked low→high index, −1 the other way. Shared edges
  // sum to 0; a sub-edge walked the same way by two pieces is an overlap.
  const net = new Map<string, number>()
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const chain = along(poly[i], poly[(i + 1) % poly.length])
      for (let k = 0; k + 1 < chain.length; k++) {
        const u = chain[k]
        const v = chain[k + 1]
        const key = u < v ? `${u}|${v}` : `${v}|${u}`
        const n = (net.get(key) ?? 0) + (u < v ? 1 : -1)
        if (Math.abs(n) > 1) return null
        net.set(key, n)
      }
    }
  }

  const next = new Map<number, number>()
  let boundary = 0
  for (const [key, n] of net) {
    if (n === 0) continue
    const [lo, hi] = key.split('|').map(Number)
    const [from, to] = n > 0 ? [lo, hi] : [hi, lo]
    // A corner two boundary edges leave from is a pinch: pieces touching at a single point, or a
    // hole between them. That is not one shape.
    if (next.has(from)) return null
    next.set(from, to)
    boundary++
  }
  if (boundary < 3) return null

  const start = next.keys().next().value as number
  const loop: V3[] = []
  let at = start
  do {
    loop.push(verts[at])
    const to = next.get(at)
    if (to === undefined) return null
    at = to
  } while (at !== start && loop.length <= boundary)
  // A second loop means two separate groups of pieces (or a hole): the walk did not use every edge.
  if (at !== start || loop.length !== boundary) return null

  // Cleaned with the same tolerance the vertices were merged at. Tighter (the 1e-9 default)
  // and a piece turned twenty-four times by 15° — rounded to 1e-9 on every turn — kept the two
  // collinear corners along its side, so a hexagon put back exactly was called a decagon.
  const outline = cleanPolygon(loop, eps)
  if (outline.length < 3) return null
  const total = pieces.reduce((s, pc) => s + polygonArea(pc), 0)
  if (Math.abs(polygonArea(outline) - total) > 1e-6 * Math.max(1, total)) return null
  return outline
}

/**
 * Are two polygons the same shape — congruent — wherever they lie and whichever way up? The
 * sides and the corner angles, read round the shape, have to agree from some starting corner;
 * reading the second polygon the other way round catches a mirror image (a flipped piece).
 */
export function sameShape(a: V3[], b: V3[], relTol = 1e-5, angTol = 1e-5): boolean {
  const A = cleanPolygon(a)
  const B = cleanPolygon(b)
  if (A.length < 3 || B.length !== A.length) return false
  return matchesWalk(sideLengths(A), interiorAngles(A), B, relTol, angTol)
}

/** Does polygon `B`, read either way round from some corner, have these sides and angles? */
function matchesWalk(sa: number[], aa: number[], B: V3[], relTol: number, angTol: number): boolean {
  const n = sa.length
  if (B.length !== n) return false
  const ref = Math.max(...sa)
  const matches = (sb: number[], ab: number[]): boolean => {
    for (let k = 0; k < n; k++) {
      let ok = true
      for (let i = 0; i < n && ok; i++) {
        const j = (i + k) % n
        ok = Math.abs(sa[i] - sb[j]) <= relTol * ref && Math.abs(aa[i] - ab[j]) <= angTol
      }
      if (ok) return true
    }
    return false
  }
  if (matches(sideLengths(B), interiorAngles(B))) return true
  const R = [...B].reverse()
  return matches(sideLengths(R), interiorAngles(R))
}

/**
 * A short text that names a shape wherever it lies and whichever way up: the side lengths and
 * the corner angles read round the shape, starting from the corner that makes the reading
 * smallest, over both directions. Two congruent polygons give the same text; a slide, a turn
 * or a flip changes nothing. A broken-apart shape carries this in every piece, so the pieces
 * can be recognised as the original after the parent polygon itself is gone.
 */
export function signatureOf(pts: V3[]): string {
  const P = toCCW(cleanPolygon(pts))
  if (P.length < 3) return ''
  const walk = (Q: V3[]): string[] => {
    const sides = sideLengths(Q)
    const angles = interiorAngles(Q)
    // Side i runs from corner i to corner i+1, whose angle is the one it arrives at.
    return sides.map((s, i) => `${Number(s.toPrecision(7))},${Math.round(toDeg(angles[(i + 1) % Q.length]) * 1e4) / 1e4}`)
  }
  let best: string | null = null
  for (const Q of [P, [...P].reverse()]) {
    const w = walk(Q)
    for (let k = 0; k < w.length; k++) {
      const text = [...w.slice(k), ...w.slice(0, k)].join(';')
      if (best === null || text < best) best = text
    }
  }
  return best ?? ''
}

/** The sides and angles a signature was written from, or null for text that is not one. */
function parseSignature(sig: string): { sides: number[]; angles: number[] } | null {
  const sides: number[] = []
  const angles: number[] = []
  for (const token of sig.split(';')) {
    const [s, a] = token.split(',').map(Number)
    if (!Number.isFinite(s) || !Number.isFinite(a)) return null
    sides.push(s)
    angles.push(toRad(a))
  }
  return sides.length >= 3 ? { sides, angles } : null
}

/**
 * Is this polygon the shape a signature names? Read with a tolerance, not by text equality,
 * because an outline rebuilt from pieces that were turned and slid carries floating-point dust
 * that a rounded digit could fall either side of.
 */
export function matchesSignature(pts: V3[], sig: string, relTol = 1e-5, angTol = 1e-5): boolean {
  const parsed = parseSignature(sig)
  const B = cleanPolygon(pts)
  if (!parsed || B.length !== parsed.sides.length) return false
  // The signature's angle for side i is the one at corner i+1; matchesWalk pairs side i with
  // corner i, so shift the angles back by one to compare like with like.
  const n = parsed.angles.length
  const aa = parsed.angles.map((_, i) => parsed.angles[(i - 1 + n) % n])
  return matchesWalk(parsed.sides, aa, B, relTol, angTol)
}

const isOriginal = (outline: V3[], original: Original): boolean =>
  typeof original === 'string' ? matchesSignature(outline, original) : sameShape(outline, original)

/** What the pieces make together, against the shape they were cut from. */
export function legoStatus(pieces: V3[][], original: Original): LegoStatus {
  const outline = pieces.length >= 2 ? outlineOf(pieces) : null
  if (!outline) return { kind: 'apart' }
  if (isOriginal(outline, original)) return { kind: 'original', outline }
  return { kind: 'different', outline, name: classifyPolygon(outline).name }
}

/** The pieces fused, with what a student is told about it. */
export type FuseResult =
  | { ok: true; kind: 'original' | 'different'; outline: V3[]; name: string; area: number; perimeter: number }
  | { ok: false; sentence: string }

export const GAP_SENTENCE = 'The pieces do not quite touch — there is a gap.'
export const OVERLAP_SENTENCE = 'Two pieces lie on top of each other.'
export const ONE_PIECE_SENTENCE = 'Pick at least two pieces to fuse.'

/** Is `p` strictly inside the polygon, not on its edge? */
function strictlyInside(p: V3, poly: V3[], eps: number): boolean {
  let inside = false
  const n = poly.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = poly[i]
    const b = poly[j]
    // On an edge (within eps) is not inside.
    const d = sub(b, a)
    const l2 = d[0] * d[0] + d[1] * d[1]
    if (l2 > 0) {
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2))
      if (dist(p, add(a, [d[0] * t, d[1] * t, 0])) <= eps) return false
    }
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

/** Do the segments a–b and c–d cross at a point inside both (not at an end, not along a shared line)? */
function properCross(a: V3, b: V3, c: V3, d: V3, eps: number): boolean {
  const side = (p: V3, q: V3, r: V3): number => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = side(c, d, a)
  const d2 = side(c, d, b)
  const d3 = side(a, b, c)
  const d4 = side(a, b, d)
  return ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))
}

/** Does any piece lie across another — a corner, the centre or the middle of a side of one inside the other, or two sides crossing? */
export function piecesOverlap(pieces: V3[][], eps = EPS): boolean {
  const polys = pieces.map((pc) => toCCW(cleanPolygon(pc))).filter((pc) => pc.length >= 3)
  for (let i = 0; i < polys.length; i++) {
    for (let j = 0; j < polys.length; j++) {
      if (i === j) continue
      const A = polys[i]
      const B = polys[j]
      if (strictlyInside(centroid(A), B, eps)) return true
      if (A.some((p) => strictlyInside(p, B, eps))) return true
      // Two equal rectangles half over each other have every corner on the other's edge and no
      // side crossing; the middle of a side gives them away.
      if (A.some((p, k) => strictlyInside(mid(p, A[(k + 1) % A.length]), B, eps))) return true
      if (j > i) {
        for (let u = 0; u < A.length; u++) {
          for (let v = 0; v < B.length; v++) {
            if (properCross(A[u], A[(u + 1) % A.length], B[v], B[(v + 1) % B.length], eps)) return true
          }
        }
      }
    }
  }
  return false
}

/**
 * What fusing these pieces gives: the one shape they make, named and measured, or the plain
 * sentence that says why they make none yet — a gap between them, or one lying on another.
 * The outline's area must agree with the pieces' areas added up to half a percent; a bigger
 * difference means a piece is hiding under another even though the edges closed up.
 */
export function fuseResult(pieces: V3[][], original: Original): FuseResult {
  if (pieces.length < 2) return { ok: false, sentence: ONE_PIECE_SENTENCE }
  if (piecesOverlap(pieces)) return { ok: false, sentence: OVERLAP_SENTENCE }
  const status = legoStatus(pieces, original)
  if (status.kind === 'apart') return { ok: false, sentence: GAP_SENTENCE }
  const area = polygonArea(status.outline)
  const total = pieces.reduce((s, pc) => s + polygonArea(pc), 0)
  if (Math.abs(area - total) > 0.005 * Math.max(total, 1e-12)) return { ok: false, sentence: OVERLAP_SENTENCE }
  const name = status.kind === 'different' ? status.name : classifyPolygon(status.outline).name
  return { ok: true, kind: status.kind, outline: status.outline, name, area, perimeter: perimeter(status.outline) }
}

/**
 * Adjust a piece's move so that whichever of its corners comes closest to a neighbour's corner
 * lands on it exactly, when one is within `tol` (world units). Pieces cut from one shape share
 * their corners to the last digit, so one corner meeting is enough for a whole side to meet.
 */
export function snapToCorners(corners: V3[], delta: V3, targets: V3[], tol: number): { delta: V3; snapped: boolean } {
  let best: { d: number; fix: V3 } | null = null
  for (const c of corners) {
    const moved = add(c, delta)
    for (const t of targets) {
      const d = dist(moved, t)
      if (d <= tol && (!best || d < best.d)) best = { d, fix: sub(t, moved) }
    }
  }
  return best ? { delta: add(delta, best.fix), snapped: true } : { delta, snapped: false }
}

/** How close a released piece's corner must come to a neighbour's to be pulled onto it: a fiftieth of its longest side. */
export function snapTolerance(pts: V3[]): number {
  return 0.02 * Math.max(...sideLengths(pts), 0)
}

/** How close, on screen, a dragged piece comes to a neighbour before it is pulled onto it. */
export const SNAP_PIECE_PX = 12

/** The screen tolerance as a distance on the drawing, at a zoom of `wpp` world units per pixel. */
export const pieceSnapTolerance = (wpp: number, px = SNAP_PIECE_PX): number => px * wpp

/**
 * Where a dragged piece was pulled to: a neighbour's corner, a neighbour's side, or nowhere. An
 * edge fit also says which way the side runs (`along`, a unit vector), so the caller can let the
 * grid tidy the piece's movement along the side while the fit keeps it glued across the side.
 */
export type LegoSnap =
  | { delta: V3; how: 'corner' }
  | { delta: V3; how: 'edge'; along: V3 }
  | { delta: V3; how: 'none' }

/** The point of the segment a–b nearest to `p`, with how far along it lies (0 at a, 1 at b). */
function footOn(p: V3, a: V3, b: V3): { foot: V3; t: number } {
  const d = sub(b, a)
  const l2 = d[0] * d[0] + d[1] * d[1]
  const t = l2 > 0 ? ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2 : 0
  return { foot: add(a, [d[0] * t, d[1] * t, 0]), t }
}

/**
 * Adjust a piece's move while it is being dragged so it lands on a neighbour the moment it comes
 * within `tol` (world units) of one. A corner meeting a neighbour's corner wins, because pieces
 * cut from one shape share their corners exactly and one corner meeting is a whole side meeting.
 * Failing that, a corner is pulled onto the middle of a neighbour's side, or a neighbour's corner
 * onto the middle of this piece's side, so a piece slid along another sticks to it and can be
 * run along the side without drifting off. Only the nearest fit is taken.
 */
export function legoSnap(corners: V3[], delta: V3, neighbours: V3[][], tol: number): LegoSnap {
  const byCorner = snapToCorners(corners, delta, neighbours.flat(), tol)
  if (byCorner.snapped) return { delta: byCorner.delta, how: 'corner' }
  const moved = corners.map((c) => add(c, delta))
  const fits: { d: number; fix: V3; along: V3 }[] = []
  const consider = (d: number, fix: V3, a: V3, b: V3) => {
    if (d <= tol) fits.push({ d, fix, along: normalize(sub(b, a)) })
  }
  for (const other of neighbours) {
    for (let k = 0; k < other.length; k++) {
      const a = other[k]
      const b = other[(k + 1) % other.length]
      // This piece's corner onto the neighbour's side: strictly between its ends, since an end
      // is a corner and corners were tried first.
      for (const c of moved) {
        const { foot, t } = footOn(c, a, b)
        if (t > EPS && t < 1 - EPS) consider(dist(c, foot), sub(foot, c), a, b)
      }
    }
    for (const q of other) {
      // The neighbour's corner onto this piece's side: the piece moves so its side runs through q.
      for (let k = 0; k < moved.length; k++) {
        const a = moved[k]
        const b = moved[(k + 1) % moved.length]
        const { foot, t } = footOn(q, a, b)
        if (t > EPS && t < 1 - EPS) consider(dist(q, foot), sub(q, foot), a, b)
      }
    }
  }
  if (fits.length === 0) return { delta, how: 'none' }
  const nearest = fits.reduce((p, q) => (q.d < p.d ? q : p))
  return { delta: add(delta, nearest.fix), how: 'edge', along: nearest.along }
}

/**
 * A piece glued to a neighbour's side is still free to run along it, and along it the grid keeps
 * its say: of a correction `corr` some other snap would make to the move `delta` (the grid pulling
 * the piece's first corner onto a line, say), only the part that runs along the side is taken, so
 * the piece stays exactly on the side and still lands on a grid line when let go part-way down it.
 */
export function slideAlong(delta: V3, along: V3, corr: V3): V3 {
  return add(delta, scale(along, dot(corr, along)))
}

/** How far, in pixels, the on-canvas handle floats above the top of a piece. */
export const HANDLE_GAP_PX = 30

/**
 * Where the turn-and-flip handle sits: above the highest corner (or below the lowest, when the
 * piece is up against the top of the view), over the piece's middle, a fixed number of pixels
 * clear of the piece at a zoom of `wpp` world units per pixel — so it never covers the piece
 * and never drifts away from it when the view is zoomed.
 */
export function handleAnchor(pts: V3[], wpp: number, side: 'above' | 'below' = 'above'): V3 {
  const c = centroid(pts)
  const ys = pts.map((p) => p[1])
  return side === 'above' ? [c[0], Math.max(...ys) + HANDLE_GAP_PX * wpp, 0] : [c[0], Math.min(...ys) - HANDLE_GAP_PX * wpp, 0]
}

/**
 * The turn a drag of the handle asks for: the angle swept about the piece's centre from where
 * the drag started to where the pointer is now, anticlockwise positive, rounded to the nearest
 * `step` degrees so a piece turned by hand lands on the same angles the buttons give. A pointer
 * sitting on the centre has no direction, and asks for no turn.
 */
export function turnFromDrag(centre: V3, from: V3, to: V3, step = 15): number {
  const a = sub(from, centre)
  const b = sub(to, centre)
  if (Math.hypot(a[0], a[1]) < EPS || Math.hypot(b[0], b[1]) < EPS) return 0
  let deg = toDeg(Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0]))
  deg = ((deg + 540) % 360) - 180
  const turned = Math.round(deg / step) * step
  // A half-turn either way is the same turn; say it one way so the piece never flickers between
  // them. A tiny clockwise wobble rounds to −0, which is 0 said with a sign.
  return turned <= -180 ? 180 : turned === 0 ? 0 : turned
}

/** The piece turned about its own centre, anticlockwise by `deg`. */
export function turnPiece(pts: V3[], deg: number): V3[] {
  const c = centroid(pts)
  return pts.map((p) => {
    const r = add(c, rotateZ(sub(p, c), toRad(deg)))
    return [round9(r[0]), round9(r[1]), 0]
  })
}

/** The piece's mirror image, left for right, about its own centre. */
export function flipPiece(pts: V3[]): V3[] {
  const c = centroid(pts)
  return pts.map((p) => [round9(2 * c[0] - p[0]), round9(p[1]), 0])
}

/**
 * The colour of piece `i` of `n` cut from a shape of colour `color`: the parent's own colour,
 * a shade lighter so a piece reads as "part of" rather than "the same", and turned a little
 * round the hue wheel per piece so two neighbours can be told apart. Worked in Oklab so the
 * lighter shade keeps its strength. A colour that cannot be read comes back as it was.
 */
export function tintPiece(color: string, i: number, n: number): string {
  const rgb = parseColour(color)
  if (!rgb) return color
  const [L, a, b] = srgbToOklab(rgb)
  const chroma = Math.hypot(a, b)
  const hue = Math.atan2(b, a) + toRad((i - (n - 1) / 2) * 16)
  const light = Math.min(0.92, L + 0.06)
  return formatColour(oklabToSrgb([light, chroma * Math.cos(hue), chroma * Math.sin(hue)]))
}
