// The decisions the grid makes every frame, kept pure so they can be tested without a canvas.
// They exist because of a real bug: a frame drawn before the canvas had been measured built a grid
// of zero-length lines, cached it as done, and left the viewport black until something else asked
// for a new frame.

import type { GridStyle } from '../core/types'
import type { ViewSize } from './cameraUtils'
import type { V3 } from '../math/vec'

export interface GridArea {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

/** Is the canvas big enough to build anything from? */
export const usableSize = (s: ViewSize): boolean =>
  Number.isFinite(s.width) && Number.isFinite(s.height) && s.width >= 2 && s.height >= 2

/** A camera or a canvas that is not ready yet can hand back NaNs or an empty rectangle. */
export const finiteArea = (a: GridArea): boolean =>
  Number.isFinite(a.xMin) && Number.isFinite(a.xMax) && Number.isFinite(a.yMin) && Number.isFinite(a.yMax) && a.xMax > a.xMin && a.yMax > a.yMin

/** Rebuild when the spacing changed, or when the view has moved outside what was built. */
export function needsGridRebuild(prev: GridArea & { key: string }, view: GridArea, key: string): boolean {
  if (key !== prev.key) return true
  return view.xMin < prev.xMin || view.xMax > prev.xMax || view.yMin < prev.yMin || view.yMax > prev.yMax
}

/**
 * What was built is remembered under this key. The size is part of it because a panel that grew
 * needs more grid, and the zoom is part of it because the very first frame uses a stand-in camera
 * whose zoom is 1 — a grid built for that must not be mistaken for the real one.
 */
export const gridKey = (majorStep: number, size: ViewSize, zoom = 1, style: GridStyle = 'lines'): string =>
  `${majorStep}|${size.width}x${size.height}|${zoom}|${style}`

/** The styles in the order every picker lists them, with the word a student sees. "Off" is `showGrid: false`, not a style. */
export const GRID_STYLES: { id: GridStyle; label: string; hint: string }[] = [
  { id: 'lines', label: 'Lines', hint: 'Squared, with a heavier line every few squares' },
  { id: 'dots', label: 'Dots', hint: 'A dot at each crossing and nothing else, so the drawing stands out' },
  { id: 'fine', label: 'Fine', hint: 'Squares half the size, for detailed work' },
  { id: 'paper', label: 'Paper', hint: 'Squared paper: lines on a tinted page' },
  { id: 'polar', label: 'Polar — circles and angles', hint: 'Circles at every major step and a ray every 15°, labelled in radians or degrees' },
  { id: 'isometric', label: 'Isometric — 60° triangles', hint: 'Lines at 0°, 60° and 120°, for drawing solids by hand' },
  { id: 'hex', label: 'Hexagons', hint: 'Regular hexagons edge to edge, for tilings and patterns' }
]

/**
 * The style a saved file asks for, or 'lines' when it names one this build has never heard of.
 * A drawing saved by a newer build (or a hand-edited file) used to reach `gridVertices` with a
 * word no branch matched and draw nothing at all; reading through this means a grid is always
 * drawn, so no file-format step is needed for a new style.
 */
export function normaliseGridStyle(raw: unknown): GridStyle {
  return typeof raw === 'string' && GRID_STYLES.some((g) => g.id === raw) ? (raw as GridStyle) : 'lines'
}

/** The 3D floor knows only the square styles: circles and lattices are 2D drawing paper, so it draws lines for them. */
export const styleFor3D = (style: GridStyle): GridStyle => (style === 'polar' || style === 'isometric' || style === 'hex' ? 'lines' : style)

/**
 * The minor step that goes with a major step: four squares to a major line when the major step
 * starts with a 2 (0.2, 2, 20 …), five otherwise. The grid and the snap both use it, so a point
 * always snaps to a line the student can see.
 */
export const minorStepOf = (major: number): number => major / (String(major).replace(/[0.]/g, '').startsWith('2') ? 4 : 5)

/**
 * The step a point snaps to: the minor step, halved for the "fine" style. `gridVertices` draws
 * the fine grid at half the minor step, and snapping used to ignore the style, so with Fine on a
 * point snapped to every second crossing the student could see.
 */
export const snapStep = (minor: number, style: GridStyle): number => (style === 'fine' ? minor / 2 : minor)

/** Half the width of a grid dot on screen, in pixels: a 3 px square. A 2 px square that does not sit on pixel boundaries blends into a faint smudge under MSAA. */
export const DOT_HALF_PX = 1.5

/**
 * The dots of the dots style as small squares, two triangles each (18 numbers per dot), `h` being
 * half the square's side in world units. WebGPU draws a point primitive as exactly one device
 * pixel and ignores `PointsMaterial.size` (three.js says so in `PointsNodeMaterial`), so the
 * dots were invisible specks on the default renderer; a square the caller sizes from
 * `worldPerPixel` reads the same on both backends.
 */
export function dotQuads(dots: number[], h: number): number[] {
  const out: number[] = []
  for (let i = 0; i < dots.length; i += 3) {
    const x = dots[i]
    const y = dots[i + 1]
    const z = dots[i + 2]
    out.push(x - h, y - h, z, x + h, y - h, z, x + h, y + h, z)
    out.push(x - h, y - h, z, x + h, y + h, z, x - h, y + h, z)
  }
  return out
}

/** Flat xyz triples: line ends for `minor` and `major` (two per line), one point per dot. */
export interface GridVertices {
  minor: number[]
  major: number[]
  dots: number[]
}


/** Pixels a minor step must span before the minor lines or circles are drawn at all; below this the grid is a solid block of colour. */
export const MIN_MINOR_PX = 8

/** Rays of the polar grid: one every 15°, so the 30° and 45° families both fall on a ray. */
export const POLAR_RAYS = 24

/** How far a drawn chord may sit inside its circle, in pixels: a fifth of a pixel is not visible at any zoom. */
const SAGITTA_PX = 0.2

/**
 * Chords per full circle for a radius of `rPx` pixels. Fixed pixel-length chords waste vertices on
 * a big circle and look polygonal on a small one; keeping the chord's bulge (the sagitta) under
 * a fifth of a pixel gives a count that grows with √r, never fewer than 48 so the smallest ring
 * is still round.
 */
export function circleSegments(rPx: number): number {
  if (!Number.isFinite(rPx) || rPx <= 0) return 48
  return Math.min(4096, Math.max(48, Math.ceil(2 * Math.PI * Math.sqrt(rPx / (8 * SAGITTA_PX)))))
}

/** cos 60° and sin 60°: the two numbers every 60° lattice is built from. */
const HALF = 0.5
const ROOT3_2 = Math.sqrt(3) / 2

/**
 * A polar grid over an area: which angles it must cover and which radii it can hold. An area
 * that does not contain the origin only sees a slice of every circle (less than a half turn),
 * so only that slice is drawn — a view panned far from the origin would otherwise spend its
 * whole vertex budget on the parts of huge circles nobody can see.
 */
export function polarRange(area: GridArea): { rMin: number; rMax: number; start: number; span: number } {
  const dx = Math.max(area.xMin, 0, -area.xMax)
  const dy = Math.max(area.yMin, 0, -area.yMax)
  const corners: [number, number][] = [[area.xMin, area.yMin], [area.xMax, area.yMin], [area.xMax, area.yMax], [area.xMin, area.yMax]]
  const rMax = Math.max(...corners.map(([x, y]) => Math.hypot(x, y)))
  if (dx === 0 && dy === 0) return { rMin: 0, rMax, start: 0, span: 2 * Math.PI }
  // The directions to the corners, sorted; the largest gap between neighbours is the part of the
  // turn no point of the area lies in, and the arc to draw is everything else.
  const angles = corners.map(([x, y]) => Math.atan2(y, x)).sort((a, b) => a - b)
  let gapAt = 0
  let gap = angles[0] + 2 * Math.PI - angles[3]
  for (let i = 0; i < 3; i++) {
    const g = angles[i + 1] - angles[i]
    if (g > gap) {
      gap = g
      gapAt = i + 1
    }
  }
  return { rMin: Math.hypot(dx, dy), rMax, start: angles[gapAt % 4], span: 2 * Math.PI - gap }
}

/** Append the arc of the circle of radius `r` covering `start … start + span` as line segments. */
function pushArc(out: number[], r: number, start: number, span: number, segments: number, z: number) {
  const dTheta = (2 * Math.PI) / segments
  const n = Math.max(1, Math.ceil(span / dTheta - 1e-9))
  let px = r * Math.cos(start)
  let py = r * Math.sin(start)
  for (let i = 1; i <= n; i++) {
    const t = start + Math.min(span, i * dTheta)
    const x = r * Math.cos(t)
    const y = r * Math.sin(t)
    out.push(px, py, z, x, y, z)
    px = x
    py = y
  }
}

/**
 * Where the line through `p` in direction `d` enters and leaves the area, as a segment, or
 * nothing when it misses. Every lattice line is clipped this way rather than drawn from one far
 * corner to the other, so a lattice covers exactly the area asked for.
 */
export function clipLine(p: [number, number], d: [number, number], area: GridArea): [number, number, number, number] | null {
  let t0 = -Infinity
  let t1 = Infinity
  const clip = (p0: number, dir: number, lo: number, hi: number): boolean => {
    if (Math.abs(dir) < 1e-15) return p0 >= lo && p0 <= hi
    const a = (lo - p0) / dir
    const b = (hi - p0) / dir
    t0 = Math.max(t0, Math.min(a, b))
    t1 = Math.min(t1, Math.max(a, b))
    return true
  }
  if (!clip(p[0], d[0], area.xMin, area.xMax) || !clip(p[1], d[1], area.yMin, area.yMax) || t0 > t1) return null
  return [p[0] + t0 * d[0], p[1] + t0 * d[1], p[0] + t1 * d[0], p[1] + t1 * d[1]]
}

/** The three directions of the 60° lattice: 0°, 60° and 120°. */
const ISO_DIRS: [number, number][] = [[1, 0], [HALF, ROOT3_2], [-HALF, ROOT3_2]]

/** A 60° lattice point: `s·(i + j/2, j·√3/2)`. Snapping and drawing both read it from here so they cannot disagree. */
export const isoPoint = (i: number, j: number, s: number): [number, number] => [s * (i + j * HALF), s * j * ROOT3_2]

/** The six corners of a hexagon of edge `a` centred at (cx, cy), flat sides top and bottom (a corner at 0°). */
export const hexCorners = (cx: number, cy: number, a: number): [number, number][] =>
  [0, 1, 2, 3, 4, 5].map((k) => [cx + a * Math.cos((k * Math.PI) / 3), cy + a * Math.sin((k * Math.PI) / 3)])

/** A hexagon centre of the tiling with edge `a`: columns 1.5a apart, every second column half a row (√3a/2) higher; (0, 0) is a centre. */
export const hexCentre = (i: number, j: number, a: number): [number, number] => [1.5 * a * i, ROOT3_2 * a * (2 * j + (i & 1))]

/**
 * Where the lattice lines of a family sit inside the area: for a family through the points
 * `origin + k·pitch` with direction `dir`, the k range whose lines touch the box.
 */
function familyRange(pitch: [number, number], dir: [number, number], area: GridArea): [number, number] {
  // Each line is p·n = k·(pitch·n) for the normal n of the family; the box's corners give the
  // extreme k values.
  const n: [number, number] = [-dir[1], dir[0]]
  const pn = pitch[0] * n[0] + pitch[1] * n[1]
  const corners: [number, number][] = [[area.xMin, area.yMin], [area.xMax, area.yMin], [area.xMax, area.yMax], [area.xMin, area.yMax]]
  const ks = corners.map(([x, y]) => (x * n[0] + y * n[1]) / pn)
  return [Math.ceil(Math.min(...ks) - 1e-9), Math.floor(Math.max(...ks) + 1e-9)]
}

/**
 * The grid for one style over one area, as vertex lists. Lines: a minor line every `minor`, a
 * major line every `major`. Dots: nothing but a dot at every minor crossing, so the drawing shows
 * through. Fine: the minor step halved, for a drawing that needs finer squares than the zoom
 * gives. Paper: the same lines as 'lines' — the paper tint is the canvas colour, not a vertex.
 * Polar: a circle at every minor step (major circles in the major list) and a ray every 15°.
 * Isometric: three line families at 0°, 60° and 120°, triangles of side `minor`, heavier every
 * `major`. Hex: regular hexagons of edge `major`, each shared edge drawn once, a dot at each
 * centre. `worldPerPixel` decides how many chords a circle needs and when minor detail would
 * be too dense to see.
 */
export function gridVertices(style: GridStyle, area: GridArea, major: number, minor: number, z = 0, worldPerPixel = minor / 20): GridVertices {
  const out: GridVertices = { minor: [], major: [], dots: [] }
  const minorVisible = minor / worldPerPixel >= MIN_MINOR_PX
  if (style === 'polar') {
    const { rMin, rMax, start, span } = polarRange(area)
    const isMajor = (r: number) => Math.abs(r / major - Math.round(r / major)) < 1e-9
    if (minorVisible) {
      for (let k = Math.max(1, Math.ceil(rMin / minor - 1e-9)); k * minor <= rMax; k++) {
        const r = k * minor
        if (!isMajor(r)) pushArc(out.minor, r, start, span, circleSegments(r / worldPerPixel), z)
      }
    }
    for (let k = Math.max(1, Math.ceil(rMin / major - 1e-9)); k * major <= rMax; k++) {
      const r = k * major
      pushArc(out.major, r, start, span, circleSegments(r / worldPerPixel), z)
    }
    for (let n = 0; n < POLAR_RAYS; n++) {
      const t = (n * 2 * Math.PI) / POLAR_RAYS
      out.major.push(rMin * Math.cos(t), rMin * Math.sin(t), z, rMax * Math.cos(t), rMax * Math.sin(t), z)
    }
    return out
  }
  if (style === 'isometric') {
    // Every family passes through the lattice points on the x axis, `minor` apart, and repeats
    // every `ratio` lines in the heavier colour so the big triangles have side `major`.
    const ratio = Math.max(1, Math.round(major / minor))
    for (const dir of ISO_DIRS) {
      const pitch: [number, number] = dir[0] === 1 ? [0, minor * ROOT3_2] : [minor, 0]
      const [k0, k1] = familyRange(pitch, dir, area)
      for (let k = k0; k <= k1; k++) {
        const heavy = k % ratio === 0
        if (!heavy && !minorVisible) continue
        const seg = clipLine([k * pitch[0], k * pitch[1]], dir, area)
        if (seg) (heavy ? out.major : out.minor).push(seg[0], seg[1], z, seg[2], seg[3], z)
      }
    }
    return out
  }
  if (style === 'hex') {
    const a = major
    const seen = new Set<string>()
    const key = (x: number, y: number) => `${Math.round(x / a / 1e-6)},${Math.round(y / a / 1e-6)}`
    const i0 = Math.floor(area.xMin / (1.5 * a)) - 1
    const i1 = Math.ceil(area.xMax / (1.5 * a)) + 1
    const j0 = Math.floor(area.yMin / (2 * ROOT3_2 * a)) - 1
    const j1 = Math.ceil(area.yMax / (2 * ROOT3_2 * a)) + 1
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const [cx, cy] = hexCentre(i, j, a)
        // A hexagon whose centre is more than an edge outside the box cannot reach into it.
        if (cx + a < area.xMin || cx - a > area.xMax || cy + a < area.yMin || cy - a > area.yMax) continue
        if (cx >= area.xMin && cx <= area.xMax && cy >= area.yMin && cy <= area.yMax) out.dots.push(cx, cy, z)
        const c = hexCorners(cx, cy, a)
        for (let k = 0; k < 6; k++) {
          const p = c[k]
          const q = c[(k + 1) % 6]
          // The same edge seen from the neighbouring hexagon is the same two corners in the other order.
          const ka = key(p[0], p[1])
          const kb = key(q[0], q[1])
          const edge = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
          if (seen.has(edge)) continue
          seen.add(edge)
          out.major.push(p[0], p[1], z, q[0], q[1], z)
        }
      }
    }
    return out
  }
  const step = snapStep(minor, style)
  const x0 = Math.ceil(area.xMin / step)
  const x1 = Math.floor(area.xMax / step)
  const y0 = Math.ceil(area.yMin / step)
  const y1 = Math.floor(area.yMax / step)
  if (style === 'dots') {
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) out.dots.push(i * step, j * step, z)
    return out
  }
  for (let i = x0; i <= x1; i++) out.minor.push(i * step, area.yMin, z, i * step, area.yMax, z)
  for (let j = y0; j <= y1; j++) out.minor.push(area.xMin, j * step, z, area.xMax, j * step, z)
  for (let i = Math.ceil(area.xMin / major); i <= Math.floor(area.xMax / major); i++) out.major.push(i * major, area.yMin, z, i * major, area.yMax, z)
  for (let j = Math.ceil(area.yMin / major); j <= Math.floor(area.yMax / major); j++) out.major.push(area.xMin, j * major, z, area.xMax, j * major, z)
  return out
}

/** The closest of some candidate points to (x, y). */
function nearest(x: number, y: number, candidates: [number, number][]): [number, number] {
  let best = candidates[0]
  let bestD = Infinity
  for (const c of candidates) {
    const d = Math.hypot(c[0] - x, c[1] - y)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

/**
 * The grid point nearest to `p` for a style — the crossing a student sees, so a snapped point
 * always lands on the drawn grid. Square styles: the nearest multiple of the snap step on each
 * axis. Polar: the nearest crossing of a circle (every minor step) and a ray (every 15°).
 * Isometric: the nearest lattice point. Hex: the nearest hexagon centre or corner, whichever is
 * closer. The height is left alone.
 */
export function snapToGrid(style: GridStyle, p: V3, major: number, minor: number): V3 {
  const [x, y, z] = p
  if (style === 'polar') {
    const r = Math.round(Math.hypot(x, y) / minor) * minor
    if (r === 0) return [0, 0, z]
    const sector = (2 * Math.PI) / POLAR_RAYS
    const t = Math.round(Math.atan2(y, x) / sector) * sector
    // cos(π/2) is 6×10⁻¹⁷, not 0: a point snapped onto the y axis must sit on it exactly.
    const clean = (v: number) => (Math.abs(v) < 1e-12 * r ? 0 : v)
    return [clean(r * Math.cos(t)), clean(r * Math.sin(t)), z]
  }
  if (style === 'isometric') {
    const s = minor
    const jf = y / (s * ROOT3_2)
    const candidates: [number, number][] = []
    for (const j of [Math.floor(jf), Math.ceil(jf)]) {
      const ifl = x / s - j * HALF
      for (const i of [Math.floor(ifl), Math.ceil(ifl)]) candidates.push(isoPoint(i, j, s))
    }
    const q = nearest(x, y, candidates)
    return [q[0], q[1], z]
  }
  if (style === 'hex') {
    const a = major
    const ifl = x / (1.5 * a)
    const candidates: [number, number][] = []
    for (const i of [Math.floor(ifl), Math.ceil(ifl)]) {
      const jf = y / (2 * ROOT3_2 * a) - (i & 1) * HALF
      for (const j of [Math.floor(jf), Math.ceil(jf)]) {
        const c = hexCentre(i, j, a)
        candidates.push(c, ...hexCorners(c[0], c[1], a))
      }
    }
    const q = nearest(x, y, candidates)
    // Every centre and corner is a multiple of a/2 across and of a·√3/2 up; rounding onto those
    // multiples takes out the cos/sin dust (a corner at 1.9999999999999991, 4×10⁻¹⁶) so the
    // same corner reached from two neighbouring hexagons is the same point.
    const hx = a * HALF
    const hy = a * ROOT3_2
    return [Math.round(q[0] / hx) * hx, Math.round(q[1] / hy) * hy, z]
  }
  const step = snapStep(minor, style)
  return [Math.round(x / step) * step, Math.round(y / step) * step, z]
}
