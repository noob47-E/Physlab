// Fix 11: point names a proof can be read in. After Z the drawing used to go on with A1, B1 … and
// then T3, U3, V3 — the congruence card read "△V3T3U3 and △T3W3U3". A new point now takes the next
// letter with a prime (A′ … Z′, then A″ …), never a number, the names still work in a typed
// formula, and a saved file keeps whatever names it was saved with.

import { beforeEach, describe, expect, it } from 'vitest'
import { freeCapitals, isValidName, nextName, uniqueName } from '../src/renderer/src/core/naming'
import { math, symbolsOf } from '../src/renderer/src/math/expr'
import { evaluateScene } from '../src/renderer/src/core/evaluate'
import { blankSceneFile, useScene } from '../src/renderer/src/core/store'
import type { SceneObject } from '../src/renderer/src/core/types'

/** A pool of points with these names, the way nextName sees a scene. */
const pool = (names: string[]): Record<string, SceneObject> =>
  Object.fromEntries(
    names.map((n, i) => [`p${i}`, { id: `p${i}`, name: n, type: 'point', def: { kind: 'free', p: [i, 0, 0] }, color: '#fff', visible: true, locked: false, showLabel: true } as SceneObject])
  )

/** The first `n` names nextName hands out, one after another. */
function run(type: 'point' | 'vector', n: number): string[] {
  const names: string[] = []
  for (let i = 0; i < n; i++) names.push(nextName(type, pool(names)))
  return names
}

describe('automatic point names', () => {
  it('go A to Z (I is skipped: it is the first part of a decomposed shape), then A′ to Z′, then A″, never with a number', () => {
    const names = run('point', 25 * 3 + 2)
    expect(names.slice(0, 25).join('')).toBe('ABCDEFGHJKLMNOPQRSTUVWXYZ')
    expect(names[25]).toBe('A′')
    expect(names[49]).toBe('Z′')
    expect(names[50]).toBe('A″')
    expect(names[75]).toBe('A‴')
    expect(names.some((n) => /\d/.test(n))).toBe(false)
    expect(new Set(names).size).toBe(names.length)
  })

  it('share one alphabet with vectors, so every letter on the drawing is unique', () => {
    const used = run('point', 25)
    expect(nextName('vector', pool(used))).toBe('A′')
  })

  it('reuse a free letter before reaching for a prime', () => {
    const used = run('point', 30).filter((n) => n !== 'C')
    expect(nextName('point', pool(used))).toBe('C')
  })

  it('are every one a name the app accepts', () => {
    for (const n of run('point', 80)) expect(isValidName(n)).toBe(true)
  })

  it('give a corner made by a cut the same kind of name', () => {
    const taken = run('point', 24)
    expect(freeCapitals(taken, 3)).toEqual(['Z', 'A′', 'B′'])
    expect(freeCapitals([], 27).at(-1)).toBe('B′')
    expect(freeCapitals([], 60).some((n) => /\d/.test(n))).toBe(false)
  })

  it('give a taken capital its prime, not a number, when a name is asked for by letter', () => {
    expect(uniqueName('A', pool(['A']))).toBe('A′')
    expect(uniqueName('A', pool(['A', 'A′']))).toBe('A″')
    // Anything else keeps the old numbered rule.
    expect(uniqueName('poly1', pool(['poly1']))).toBe('poly11')
  })
})

describe('a primed name in a typed formula', () => {
  it('is one symbol to the parser, as A1 was', () => {
    expect(symbolsOf(math.parse('A′ + B″'))).toEqual(['A′', 'B″'])
    expect(symbolsOf(math.parse('2 A‴'))).toEqual(['A‴'])
  })

  it('reaches the point it names', () => {
    const base = { color: '#fff', visible: true, locked: false, showLabel: true }
    const objects: Record<string, SceneObject> = {
      a: { ...base, id: 'a', name: 'A′', type: 'point', def: { kind: 'free', p: [1, 2, 0] } },
      b: { ...base, id: 'b', name: 'M', type: 'point', def: { kind: 'expr', expr: 'A′ + (1, 1)' } }
    }
    const ev = evaluateScene(objects, ['a', 'b'], { angleUnit: 'deg' }, 0)
    expect(ev.errors.get('b')).toBeUndefined()
    expect(ev.values.get('b')).toMatchObject({ type: 'point', p: [2, 3, 0] })
  })
})

describe('a saved file', () => {
  beforeEach(() => useScene.getState().newScene())

  it('keeps the names it was saved with: nothing is renamed on open', () => {
    const file = blankSceneFile()
    const base = { color: '#fff', visible: true, locked: false, showLabel: true, space: 'shapes' as const }
    file.objects = [
      { ...base, id: 't', name: 'T3', type: 'point', def: { kind: 'free', p: [0, 0, 0] } },
      { ...base, id: 'u', name: 'U3', type: 'point', def: { kind: 'free', p: [1, 0, 0] } },
      { ...base, id: 'v', name: 'V3', type: 'point', def: { kind: 'free', p: [0, 1, 0] } }
    ]
    useScene.getState().loadScene(JSON.parse(JSON.stringify(file)))
    const names = useScene.getState().order.map((id) => useScene.getState().objects[id].name)
    expect(names).toEqual(['T3', 'U3', 'V3'])
    // A point added afterwards takes the first free letter, not the file's numbering.
    expect(nextName('point', useScene.getState().objects)).toBe('A')
  })
})
