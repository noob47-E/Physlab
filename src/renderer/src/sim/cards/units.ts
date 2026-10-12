// The units check on a card (Idea #39 F55), by scaling: measure mass, length and time in other
// units (multiply every kilogram by one random factor, every metre by another, every second by a
// third), put the scaled values into the formula, and the result must come out scaled by its own
// unit's factor. A formula with the wrong power (½mv for ½mv²) scales the wrong way and is caught,
// whatever numbers the run happens to hold. A symbol must also carry the unit of the quantity it is
// bound to: a speed labelled "m" would otherwise pass.

import type { CardSpec, Source } from './types'

/** Powers of kilogram, metre, second and kelvin. */
type Dims = { kg: number; m: number; s: number; K: number }

const NONE: Dims = { kg: 0, m: 0, s: 0, K: 0 }

/** The units a card may name, as powers of kg, m, s and K. Products and quotients of these are read too. */
const BASE: Record<string, Dims> = {
  kg: { ...NONE, kg: 1 },
  m: { ...NONE, m: 1 },
  s: { ...NONE, s: 1 },
  K: { ...NONE, K: 1 },
  N: { kg: 1, m: 1, s: -2, K: 0 },
  J: { kg: 1, m: 2, s: -2, K: 0 },
  W: { kg: 1, m: 2, s: -3, K: 0 },
  Pa: { kg: 1, m: -1, s: -2, K: 0 },
  Hz: { ...NONE, s: -1 },
  rad: NONE,
  '°': NONE,
  '%': NONE
}

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹'

/** One factor such as "s²" or "m⁻¹": its name and power. */
function factor(text: string): { name: string; power: number } {
  const m = /^([^⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)(⁻?)([⁰¹²³⁴⁵⁶⁷⁸⁹]*)$/.exec(text)
  if (!m) throw new Error(`a unit card cannot read "${text}"`)
  const digits = m[3] ? Number([...m[3]].map((c) => SUPERSCRIPT.indexOf(c)).join('')) : 1
  return { name: m[1], power: m[2] ? -digits : digits }
}

/** "kg m/s²" as powers of kg, m, s, K. Throws on a unit it does not know. */
function dimsOf(unit: string): Dims {
  const out: Dims = { ...NONE }
  const [top, ...bottoms] = unit.trim().split('/')
  const add = (part: string, sign: number) => {
    for (const piece of part.split(/[\s·]+/).filter(Boolean)) {
      const { name, power } = factor(piece)
      const base = BASE[name]
      if (!base) throw new Error(`a unit card cannot read "${name}" in "${unit}"`)
      out.kg += sign * power * base.kg
      out.m += sign * power * base.m
      out.s += sign * power * base.s
      out.K += sign * power * base.K
    }
  }
  add(top ?? '', 1)
  for (const b of bottoms) add(b, -1)
  return out
}

/** How much a value in `unit` grows when a kilogram, a metre, a second and a kelvin grow by these factors. */
export function unitFactor(unit: string, f: Dims): number {
  const d = dimsOf(unit)
  return f.kg ** d.kg * f.m ** d.m * f.s ** d.s * f.K ** d.K
}

const sameDims = (a: Dims, b: Dims): boolean => a.kg === b.kg && a.m === b.m && a.s === b.s && a.K === b.K

/**
 * A unit after a number in LaTeX: "\,\text{m/s}^{2}", an angle's "^{\circ}" with no space. The
 * raised digits a student sees in "m/s²" become KaTeX powers, so nothing raised is drawn as text.
 */
export function unitTex(unit: string): string {
  if (unit === '') return ''
  if (unit === '°') return '^{\\circ}'
  if (unit === '%') return '\\,\\%'
  let out = ''
  for (const [, words, raised] of unit.matchAll(/([^⁰¹²³⁴⁵⁶⁷⁸⁹⁻]*)([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]*)/g)) {
    if (words) out += `\\text{${words}}`
    if (raised) out += `^{${[...raised].map((c) => (c === '⁻' ? '-' : String(SUPERSCRIPT.indexOf(c)))).join('')}}`
  }
  return `\\,${out}`
}

/** A unit after a number in a sentence: " m/s²", and an angle's "°" with no space. */
export function unitPlain(unit: string): string {
  if (unit === '') return ''
  if (unit === '°') return '°'
  return ` ${unit}`
}

/** The unit of the quantity a source gives, or null for a plain number (which may stand for anything). */
export function naturalUnit(src: Source): string | null {
  if ('value' in src) return null
  if ('pair' in src) return ''
  if ('world' in src) return src.world === 'g' ? 'm/s²' : src.world === 't' ? 's' : 'kg/m³'
  if ('link' in src || 'startLink' in src) return src.get === 'k' ? 'N/m' : src.get === 'angle' ? '°' : 'm'
  switch (src.get) {
    case 'mass':
      return 'kg'
    case 'speed':
    case 'vx':
    case 'vy':
      return 'm/s'
    case 'x':
    case 'height':
    case 'bottom':
    case 'radius':
      return 'm'
    case 'KE':
    case 'PE':
      return 'J'
    case 'p':
      return 'kg m/s'
    case 'a':
    case 'ax':
    case 'ay':
      return 'm/s²'
    case 'cd':
      return ''
    case 'area':
      return 'm²'
    case 'slopeAngle':
    case 'vAngle':
      return '°'
  }
}

/** A small seeded generator (mulberry32): the check is the same on every run and every machine. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** How close a scaled result must come to the expected one, relative to its size: far above a double's rounding, far below any real mistake. */
const SCALE_AGREES = 1e-9
const TRIALS = 4
const DRAWS = 40

function check(spec: CardSpec): boolean {
  try {
    for (const s of spec.symbols) {
      const natural = naturalUnit(s.from)
      if (natural !== null && !sameDims(dimsOf(s.unit), dimsOf(natural))) return false
    }
    const rand = seeded(55)
    const between = (lo: number, hi: number) => lo + (hi - lo) * rand()
    for (let trial = 0; trial < TRIALS; trial++) {
      const f: Dims = { kg: between(0.3, 3.7), m: between(0.3, 3.7), s: between(0.3, 3.7), K: between(0.3, 3.7) }
      // Values that give a result worth scaling: not zero, not infinite (an angle's sine of 0 would).
      let found = false
      for (let draw = 0; draw < DRAWS && !found; draw++) {
        const plain: Record<string, number> = {}
        const scaled: Record<string, number> = {}
        for (const s of spec.symbols) {
          const v = 'value' in s.from ? s.from.value : s.unit === '°' ? between(10, 80) : between(0.5, 2.5)
          plain[s.key] = v
          scaled[s.key] = v * unitFactor(s.unit, f)
        }
        const r0 = spec.compute(plain)
        if (!Number.isFinite(r0) || r0 === 0) continue
        found = true
        const want = r0 * unitFactor(spec.result.unit, f)
        const got = spec.compute(scaled)
        if (!(Math.abs(got - want) <= SCALE_AGREES * Math.max(Math.abs(got), Math.abs(want)))) return false
      }
      if (!found) return false
    }
    return true
  } catch {
    // A unit the check cannot read is a unit no student can be told is right.
    return false
  }
}

const checked = new WeakMap<CardSpec, boolean>()

/** Whether the card's units agree (the "units ✓" on a card). Worked out once per card. */
export function unitsCheck(spec: CardSpec): boolean {
  let ok = checked.get(spec)
  if (ok === undefined) {
    ok = check(spec)
    checked.set(spec, ok)
  }
  return ok
}
