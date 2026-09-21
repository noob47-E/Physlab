// The scene store: undo and redo must bring back not just the objects but everything worked out
// from them (names, values, who depends on whom) and the order they are drawn in; renaming an
// object must reach every formula that mentioned it.

import { beforeEach, describe, expect, it } from 'vitest'
import { dependentsOf } from '../src/renderer/src/core/evaluate'
import { useScene } from '../src/renderer/src/core/store'
import type { SceneObject } from '../src/renderer/src/core/types'

const scene = () => useScene.getState()

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false, color: '#000', showLabel: true })
const point = (id: string, name: string, p: [number, number, number]): SceneObject => ({ ...base(id, name), type: 'point', def: { kind: 'free', p } })
const number = (id: string, name: string, expr: string): SceneObject => ({ ...base(id, name), type: 'number', expr })

/** A, B, the segment a = AB, k = 2a and a vector F = k i + 3 j: a small chain of dependencies. */
function chain(): SceneObject[] {
  return [
    point('pA', 'A', [1, 2, 0]),
    point('pB', 'B', [4, 6, 0]),
    { ...base('sAB', 'a'), type: 'segment', a: 'pA', b: 'pB' },
    number('nK', 'k', '2*a'),
    { ...base('vF', 'F'), type: 'vector', def: { kind: 'expr', expr: 'k*i + 3*j' } }
  ]
}

/** Everything the evaluator worked out, in a shape that can be compared. */
const graph = () => {
  const { ev, objects, order } = scene()
  return {
    order: [...order],
    names: [...ev.names.entries()],
    errors: [...ev.errors.entries()],
    scope: { ...ev.scope },
    dependents: order.map((id) => [id, [...dependentsOf(id, objects)].sort()])
  }
}

beforeEach(() => {
  scene().newScene()
})

describe('undo and redo', () => {
  it('put back the values, the names and the dependency graph after a delete', () => {
    scene().addObjects(chain())
    const before = graph()
    expect(before.scope.k).toBe(10)
    expect(before.dependents.find(([id]) => id === 'pA')![1]).toEqual(['nK', 'sAB', 'vF'])

    scene().removeObjects(['pA'])
    // Deleting A takes everything that needed it.
    expect(scene().order).toEqual(['pB'])
    expect(scene().ev.names.has('k')).toBe(false)

    scene().undo()
    expect(graph()).toEqual(before)

    scene().redo()
    expect(scene().order).toEqual(['pB'])
    // With no object called k, the name goes back to being the unit vector k̂.
    expect(scene().ev.scope.k).toEqual([0, 0, 1])

    scene().undo()
    expect(graph()).toEqual(before)
  })

  it('restore the order objects are drawn in, not just the set of them', () => {
    scene().addObjects(chain())
    const [pA, pB, sAB, nK, vF] = scene().order
    scene().removeObjects(['vF'])
    scene().addObjects([point('pC', 'C', [0, 0, 0])])
    scene().addObjects([chain()[4]])
    expect(scene().order).toEqual([pA, pB, sAB, nK, 'pC', vF])
    scene().undo()
    scene().undo()
    scene().undo()
    expect(scene().order).toEqual([pA, pB, sAB, nK, vF])
    scene().redo()
    scene().redo()
    scene().redo()
    expect(scene().order).toEqual([pA, pB, sAB, nK, 'pC', vF])
  })

  it('an edit that broke a dependent is undone all the way back to a working scene', () => {
    scene().addObjects(chain())
    const before = graph()
    scene().updateObject('nK', (d) => {
      if (d.type === 'number') d.expr = 'nosuchthing * 2'
    })
    expect(scene().ev.errors.has('nK')).toBe(true)
    expect(scene().ev.errors.has('vF')).toBe(true)
    scene().undo()
    expect(graph()).toEqual(before)
    expect(scene().ev.errors.size).toBe(0)
  })

  it('a drag is one undo step however many moves it took, and the values follow', () => {
    scene().addObjects(chain())
    scene().beginGesture()
    for (const x of [2, 3, 4, 5]) scene().updateObject('pA', (d) => {
      if (d.type === 'point' && d.def.kind === 'free') d.def.p = [x, 2, 0]
    })
    scene().endGesture()
    expect(scene().ev.scope.A).toEqual([5, 2, 0])
    expect(scene().past).toHaveLength(2) // add, then the whole drag
    scene().undo()
    expect(scene().ev.scope.A).toEqual([1, 2, 0])
    expect(scene().ev.scope.k).toBe(10)
  })

  it('does nothing at either end of the history', () => {
    scene().undo()
    expect(scene().order).toEqual([])
    scene().addObjects(chain())
    scene().redo()
    expect(scene().order).toHaveLength(5)
  })

  it('a new edit after an undo throws the redo branch away', () => {
    scene().addObjects(chain())
    scene().removeObjects(['vF'])
    scene().undo()
    scene().addObjects([point('pC', 'C', [0, 0, 0])])
    expect(scene().future).toEqual([])
    scene().redo()
    expect(scene().order).toContain('pC')
    expect(scene().order).toContain('vF')
  })
})

describe('renameObject', () => {
  it('renames inside every formula that used the old name, as one undo step', () => {
    scene().addObjects(chain())
    expect(scene().renameObject('nK', 'm')).toBeNull()
    const { objects, ev } = scene()
    expect(objects.nK.name).toBe('m')
    expect(objects.vF.type === 'vector' && objects.vF.def.kind === 'expr' ? objects.vF.def.expr : '').toBe('m*i + 3*j')
    expect(ev.names.get('m')).toBe('nK')
    expect(ev.names.has('k')).toBe(false)
    expect(ev.errors.size).toBe(0)
    expect(ev.scope.F).toEqual([10, 3, 0])
    expect([...dependentsOf('nK', objects)]).toEqual(['vF'])

    scene().undo()
    expect(scene().objects.nK.name).toBe('k')
    expect(scene().ev.scope.F).toEqual([10, 3, 0])
  })

  it('renames a segment used by name, and only whole words', () => {
    scene().addObjects([...chain(), number('nA1', 'a1', '1'), number('nSum', 's', 'a + a1 + 2*a')])
    expect(scene().renameObject('sAB', 'len')).toBeNull()
    const sum = scene().objects.nSum
    expect(sum.type === 'number' ? sum.expr : '').toBe('len + a1 + 2*len')
    const k = scene().objects.nK
    expect(k.type === 'number' ? k.expr : '').toBe('2*len')
    expect(scene().ev.scope.s).toBe(16)
  })

  it('renames inside a graph, its source line included', () => {
    scene().addObjects([number('nM', 'm', '3'), { ...base('g1', 'f'), type: 'graph', kind: 'explicit', source: 'y = m*x + m', exprs: ['m*x + m'] }])
    expect(scene().renameObject('nM', 'slope')).toBeNull()
    const g = scene().objects.g1
    expect(g.type === 'graph' ? g.exprs : []).toEqual(['slope*x + slope'])
    expect(g.type === 'graph' ? g.source : '').toBe('y = slope*x + slope')
  })

  it('renaming an object whose name a later object shadows leaves every formula alone', () => {
    // A loaded file may list two objects called a; the evaluator gives the name to the later
    // one, so b = a + 1 is 3. Renaming the first used to rewrite b to "c + 1" and make it 2.
    scene().addObjects([number('n1', 'a', '1'), number('n2', 'a', '2'), number('n3', 'b', 'a + 1')])
    expect(scene().ev.names.get('a')).toBe('n2')
    expect(scene().ev.scope.b).toBe(3)
    expect(scene().renameObject('n1', 'c')).toBeNull()
    expect(scene().objects.n1.name).toBe('c')
    const b = scene().objects.n3
    expect(b.type === 'number' ? b.expr : '').toBe('a + 1')
    expect(scene().ev.scope.b).toBe(3)
    expect(scene().ev.scope.c).toBe(1)
  })

  it('renaming the object that does own a shared name carries its dependents with it', () => {
    scene().addObjects([number('n1', 'a', '1'), number('n2', 'a', '2'), number('n3', 'b', 'a + 1')])
    expect(scene().renameObject('n2', 'c')).toBeNull()
    const b = scene().objects.n3
    expect(b.type === 'number' ? b.expr : '').toBe('c + 1')
    expect(scene().ev.scope.b).toBe(3)
    // The first a is now the only a.
    expect(scene().ev.names.get('a')).toBe('n1')
  })

  it('refuses a taken name, a reserved name or a name that is not a word, and changes nothing', () => {
    scene().addObjects(chain())
    const before = scene().objects
    expect(scene().renameObject('nK', 'A')).toMatch(/already the name/)
    expect(scene().renameObject('nK', 'x')).toMatch(/not available/)
    expect(scene().renameObject('nK', '2k')).toMatch(/not available/)
    expect(scene().renameObject('nK', 'k')).toBeNull()
    expect(scene().renameObject('nope', 'k')).toMatch(/no longer exists/)
    expect(scene().objects).toBe(before)
  })
})
