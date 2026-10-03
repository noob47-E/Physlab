// Renaming rewrites the old name inside every formula, as a whole name. "Whole name" must mean
// what the expression parser reads as one name: A′, A″, Aα and θ′ are names of their own, and
// 2A is 2 times A.
import { describe, expect, it } from 'vitest'
import { renameInObjects } from '../src/renderer/src/core/rename'
import type { SceneObject } from '../src/renderer/src/core/types'

const num = (id: string, name: string, expr: string) => ({ id, type: 'number', name, expr }) as unknown as SceneObject

function exprAfter(objects: SceneObject[], id: string, next: string, of: string): string {
  const all = Object.fromEntries(objects.map((o) => [o.id, o]))
  const changed = renameInObjects(all, id, next).find((o) => o.id === of) ?? all[of]
  return changed.type === 'number' ? changed.expr : ''
}

describe('renameInObjects keeps other names whole', () => {
  it('renaming A leaves A′, A″ and Aα alone', () => {
    const objs = [num('a', 'A', '1'), num('a1', 'A′', '2'), num('a2', 'A″', '3'), num('a3', 'Aα', '4'), num('k', 'k', 'A + A′ + A″ + Aα')]
    expect(exprAfter(objs, 'a', 'P', 'k')).toBe('P + A′ + A″ + Aα')
  })

  it('renaming A does not touch a formula that only uses A′', () => {
    const objs = [num('a', 'A', '1'), num('a1', 'A′', '5'), num('k', 'k', 'xcomp(A′)')]
    const all = Object.fromEntries(objs.map((o) => [o.id, o]))
    expect(renameInObjects(all, 'a', 'P').map((o) => o.id)).toEqual(['a'])
  })

  it('renaming θ changes θ but not θ′, and renaming θ′ changes θ′ but not θ', () => {
    const objs = [num('t', 'θ', '1'), num('t1', 'θ′', '2'), num('k', 'k', 'θ′ + θ + 2θ′')]
    expect(exprAfter(objs, 't', 'φ', 'k')).toBe('θ′ + φ + 2θ′')
    expect(exprAfter(objs, 't1', 'φ', 'k')).toBe('φ + θ + 2φ')
  })

  it('renames a name next to brackets, operators, a function call and a number in front', () => {
    const objs = [num('a', 'A', '1'), num('k', 'k', 'sin(A) + A^2 + 2A + (A)*3 - A/2')]
    expect(exprAfter(objs, 'a', 'B', 'k')).toBe('sin(B) + B^2 + 2B + (B)*3 - B/2')
  })

  it('renaming a leaves tan, abs and names that only contain a (αa, a1, B2a) alone', () => {
    const objs = [num('a', 'a', '1'), num('k', 'k', 'tan(a) + abs(a) + αa + a1 + B2a + 2a')]
    expect(exprAfter(objs, 'a', 'b', 'k')).toBe('tan(b) + abs(b) + αa + a1 + B2a + 2b')
  })
})
