import type { Computed, ObjId, ObjType, SceneObject, VectorObj } from './types'
import { classifyPolygon } from '../math/shapes'
import { fmtPoint, fmtPrecise, formatMeasure, type MeasureSettings } from '../math/format'

const GREEK = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'φ', 'ψ', 'ω']

// Points and vectors share one alphabet (A, B, C … Z, then A′, B′ … Z′, then A″ …) so every
// letter on the drawing is unique, like labels in a textbook figure. I is left out: the parts of a
// decomposed shape are numbered I, II, III on the same drawing. After Z the names used to carry a
// number (A1 … and, a few dozen points later, T3, U3, V3), which read "△V3T3U3" in a proof.
const CAPITALS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'.split('')

/** The marks after a letter on its `round`-th pass through the alphabet: none, ′, ″, ‴, ⁗, then more ′. */
export function primes(round: number): string {
  if (round <= 0) return ''
  return ['′', '″', '‴', '⁗'][round - 1] ?? '′'.repeat(round)
}

/** Every capital name in order: A … Z, A′ … Z′, A″ … Z″, and on. */
function* capitalNames(): Generator<string> {
  for (let round = 0; ; round++) for (const c of CAPITALS) yield `${c}${primes(round)}`
}
const PREFERRED: Record<ObjType, string[]> = {
  point: CAPITALS,
  vector: CAPITALS,
  segment: ['a', 'b', 'c', 'd', 'e', 'p', 'q', 's'],
  ray: ['r1'],
  line: ['f', 'g', 'h', 'l', 'm', 'n'],
  circle: ['c1'],
  polygon: ['poly1'],
  angle: GREEK,
  number: ['k', 'm', 'n', 'p', 'q', 's'],
  graph: ['f', 'g', 'h', 'p', 'q'],
  text: ['text1']
}

const RESERVED = new Set(['i', 'j', 'x', 'y', 'z', 't', 'e', 'pi', 'theta'])
/** Names skipped by auto-naming (still allowed when typed explicitly). */
const AVOID = new Set(['k', 'r'])

export function nextName(type: ObjType, objects: Record<string, SceneObject>, reserved: string[] = []): string {
  const used = new Set([...Object.values(objects).map((o) => o.name), ...reserved])
  for (const n of PREFERRED[type]) {
    if (!used.has(n) && !RESERVED.has(n) && !AVOID.has(n)) return n
  }
  if (type === 'point' || type === 'vector') {
    for (const n of capitalNames()) if (!used.has(n)) return n
  }
  const base = PREFERRED[type][0].replace(/\d+$/, '')
  for (let i = 1; ; i++) {
    const n = `${base}${i}`
    if (!used.has(n)) return n
  }
}

/** Returns `name` if free; otherwise a taken capital gets its primes (A′, A″) and anything else a number (poly11). */
export function uniqueName(name: string, objects: Record<string, SceneObject>, reserved: string[] = []): string {
  const used = new Set([...Object.values(objects).map((o) => o.name), ...reserved])
  if (!used.has(name) && !RESERVED.has(name)) return name
  if (/^[A-Z]$/.test(name)) {
    for (let round = 1; ; round++) {
      const n = `${name}${primes(round)}`
      if (!used.has(n)) return n
    }
  }
  for (let i = 1; ; i++) {
    const n = `${name}${i}`
    if (!used.has(n)) return n
  }
}

/** Capital names that no object is using, in the order new points take them: for corners created by a cut (F, G, H…). */
export function freeCapitals(used: Iterable<string>, count: number): string[] {
  const taken = new Set(used)
  const out: string[] = []
  if (count <= 0) return out
  for (const n of capitalNames()) {
    if (taken.has(n)) continue
    out.push(n)
    if (out.length >= count) break
  }
  return out
}

export function isValidName(name: string): boolean {
  // ′ ″ ‴ ⁗ are here because the app names points A′ and A″ after Z, and placed copies A′ itself.
  return /^[A-Za-zͰ-Ͽ][A-Za-z0-9_Ͱ-Ͽ'′″‴⁗]*$/.test(name) && !RESERVED.has(name)
}

let counter = 0
export const newId = (): string => `o${Date.now().toString(36)}${(counter++).toString(36)}`

export const PALETTE = {
  /**
   * Moonlight's values of the arrow tokens --vec-1 … --vec-6 (styles.css). An arrow stores one of
   * these and is drawn in its token's colour for the theme that is on (vectorToken), so it is 3:1
   * on every canvas. Six, not eight: eight could not all stay apart for colour-blind eyes (Fix 2).
   */
  vector: ['#0cdefd', '#eb7a1d', '#1fc092', '#f0e442', '#ba5382', '#975bce'],
  point: ['#e7f5ff'],
  segment: ['#ced4da'],
  ray: ['#ced4da'],
  line: ['#adb5bd'],
  circle: ['#63e6be'],
  polygon: ['#9775fa'],
  angle: ['#ffa94d'],
  number: ['#e9ecef'],
  graph: ['#4dabf7', '#ff6b6b', '#51cf66', '#fcc419', '#cc5de8', '#22b8cf'],
  text: ['#e9ecef']
} satisfies Record<ObjType, string[]>

/**
 * The 0.6.1–0.7 arrow colours, first to eighth, as files and autosaves hold them. They are turned
 * into tokens once, when a file is read (core/migrate.ts, format 4), not every time a colour is
 * read: the Properties swatches still offer these hexes, and a student who picks cyan for an arrow
 * must see cyan, not the token that took the old cyan's place.
 */
export const OLD_ARROW_COLOURS = ['#4dabf7', '#ff6b6b', '#51cf66', '#fcc419', '#cc5de8', '#ff922b', '#22b8cf', '#f06595']

/** The gold the command bar gives a sum it draws (R = A + B, lang/commands.ts), which is a resultant. */
const BAR_SUM_GOLD = '#ffd43b'

/** The resultant's token; its stored colour is Moonlight's value of it. */
export const RESULT_TOKEN = '--vec-result'
export const RESULT_COLOUR = '#cf79ff'

/**
 * The arrow token a stored vector colour stands for, if it is one the app hands out now (today's
 * palette, the resultant, or the command bar's gold sum). A colour the student picked themselves
 * is theirs and has none; an older version's colours were turned into tokens when the file was read.
 */
export function vectorToken(color: string): string | undefined {
  const c = color.trim().toLowerCase()
  const i = PALETTE.vector.indexOf(c)
  if (i >= 0) return `--vec-${i + 1}`
  if (c === RESULT_COLOUR || c === BAR_SUM_GOLD) return RESULT_TOKEN
  return undefined
}

export function nextColor(type: ObjType, objects: Record<string, SceneObject>): string {
  const list = PALETTE[type]
  const count = Object.values(objects).filter((o) => o.type === type).length
  return list[count % list.length]
}

// ---------------------------------------------------------------------------
// What a student reads an object as
// ---------------------------------------------------------------------------

/**
 * A point a student can name a thing by: one that is on the drawing. A hidden helper (a 0.7.0
 * piece's poly2_1, a vector's tail) is kept out, or "Side poly2_1poly2_2" reads like code.
 */
function lettered(id: ObjId, objects: Record<ObjId, SceneObject>): string | null {
  const p = objects[id]
  return p && p.type === 'point' && p.visible && !p.auxiliary ? p.name : null
}

/** The corners' letters in the order the corners were made, or null when one of them has none. */
function cornerLetters(points: ObjId[], objects: Record<ObjId, SceneObject>): string | null {
  const names = points.map((id) => lettered(id, objects))
  return names.every((n): n is string => n !== null) ? names.join('') : null
}

/**
 * An amount of a vector — its size or one component — in the vector's own unit when it has one
 * (a question's force arrow in N), else as a length in the drawing's unit. A force drawn from a
 * question used to read "mg1y = −9.81 u": a length in grid squares, not a weight.
 */
export function vectorAmount(v: number, o: VectorObj, s: MeasureSettings): string {
  return o.unit ? `${fmtPrecise(v, s)} ${o.unit}` : formatMeasure(v, 'length', s)
}

/**
 * The component labels drawn beside a selected vector, "m₂gx = 0 N" and "m₂gy = −9.81 N": its
 * display name (the author's m₂g, never the scene's sanitised mg1) and its own unit.
 */
export function componentTexts(o: VectorObj, comp: readonly number[], s: MeasureSettings): [string, string] {
  const name = o.label ?? o.name
  return [`${name}x = ${vectorAmount(comp[0], o, s)}`, `${name}y = ${vectorAmount(comp[1], o, s)}`]
}

/**
 * What the drawing, the Measure list and the selection header call an object: the short name a
 * textbook would print. The stored names (poly1, c1, a … q, r1) are internal and used to reach
 * the student as they were — "poly1 Area 6 u²", "Segment d" for the side the drawing called FC.
 *
 * A triangle is ΔGHJ, any other shape what it is and its corners (Rectangle CDEF), a segment its
 * two ends (FC), a ray the same (ray AB), a circle its centre (circle, centre J). Corners are read
 * in the order they were made, the same order the congruence card and the shape table use. A
 * label the student typed wins; anything with no letters to use keeps its own name.
 */
export function displayName(o: SceneObject, objects: Record<ObjId, SceneObject>, c?: Computed): string {
  if (o.type === 'polygon') {
    const letters = cornerLetters(o.points, objects)
    // A 0.7.0 piece's corners are hidden helpers: it is called what it was cut as.
    if (!letters) return o.label ?? o.name
    // A Lego piece's label is what it was cut as; any other polygon's label the student typed.
    if (o.label && !o.lego) return o.label
    if (o.points.length === 3) return `Δ${letters}`
    if (o.lego && o.label) return `${o.label} ${letters}`
    return `${c?.type === 'polygon' && c.pts.length >= 3 ? classifyPolygon(c.pts).name : 'Polygon'} ${letters}`
  }
  if (o.label) return o.label
  if (o.type === 'segment') {
    const [a, b] = [lettered(o.a, objects), lettered(o.b, objects)]
    if (a && b) return `${a}${b}`
  }
  if (o.type === 'ray') {
    const [a, b] = [lettered(o.a, objects), lettered(o.b, objects)]
    if (a && b) return `ray ${a}${b}`
  }
  if (o.type === 'circle') {
    const d = o.def
    if (d.kind === 'centerPoint' || d.kind === 'centerRadius') {
      const centre = lettered(d.c, objects)
      if (centre) return `circle, centre ${centre}`
      // A centre typed as a number pair is a hidden helper point: its place is the name.
      if (c?.type === 'circle') return `circle, centre ${fmtPoint(c.circle.c)}`
    }
    if (d.kind === 'threePoints') {
      const [a, b, t] = [lettered(d.a, objects), lettered(d.b, objects), lettered(d.c, objects)]
      if (a && b && t) return `circle through ${a}, ${b} and ${t}`
    }
  }
  return o.name
}
