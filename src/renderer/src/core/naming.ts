import type { ObjType, SceneObject } from './types'

const GREEK = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'φ', 'ψ', 'ω']

// Points and vectors share one alphabet (A, B, C … Z, then A1, B1 …) so every letter
// on the drawing is unique, like labels in a textbook figure.
const CAPITALS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'.split('')
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
    for (let i = 1; ; i++) {
      for (const c of CAPITALS) {
        const n = `${c}${i}`
        if (!used.has(n)) return n
      }
    }
  }
  const base = PREFERRED[type][0].replace(/\d+$/, '')
  for (let i = 1; ; i++) {
    const n = `${base}${i}`
    if (!used.has(n)) return n
  }
}

/** Returns `name` if free, otherwise name₁, name₂… style alternatives (A1, A2). */
export function uniqueName(name: string, objects: Record<string, SceneObject>, reserved: string[] = []): string {
  const used = new Set([...Object.values(objects).map((o) => o.name), ...reserved])
  if (!used.has(name) && !RESERVED.has(name)) return name
  for (let i = 1; ; i++) {
    const n = `${name}${i}`
    if (!used.has(n)) return n
  }
}

export function isValidName(name: string): boolean {
  return /^[A-Za-zͰ-Ͽ][A-Za-z0-9_Ͱ-Ͽ']*$/.test(name) && !RESERVED.has(name)
}

let counter = 0
export const newId = (): string => `o${Date.now().toString(36)}${(counter++).toString(36)}`

export const PALETTE = {
  vector: ['#4dabf7', '#ff6b6b', '#51cf66', '#fcc419', '#cc5de8', '#ff922b', '#22b8cf', '#f06595'],
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

export function nextColor(type: ObjType, objects: Record<string, SceneObject>): string {
  const list = PALETTE[type]
  const count = Object.values(objects).filter((o) => o.type === type).length
  return list[count % list.length]
}
