import type { ObjType, SceneObject } from './types'

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
