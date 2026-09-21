// The dependency evaluator on its own: objects may be listed in any order, a loop is reported in
// words and never spun on, and an object whose formula fails gets an error and no value (its
// dependents are told so, rather than being handed a stale number).

import { describe, expect, it } from 'vitest'
import { dependentsOf, directDependents, evaluateScene, exprRefs, isFree, parentRefs } from '../src/renderer/src/core/evaluate'
import type { ObjId, SceneObject } from '../src/renderer/src/core/types'

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false, color: '#000', showLabel: true })
const point = (id: string, name: string, p: [number, number, number]): SceneObject => ({ ...base(id, name), type: 'point', def: { kind: 'free', p } })
const exprPoint = (id: string, name: string, expr: string): SceneObject => ({ ...base(id, name), type: 'point', def: { kind: 'expr', expr } })
const number = (id: string, name: string, expr: string): SceneObject => ({ ...base(id, name), type: 'number', expr })
const segment = (id: string, name: string, a: ObjId, b: ObjId): SceneObject => ({ ...base(id, name), type: 'segment', a, b })

function run(list: SceneObject[], settings: { angleUnit: 'deg' | 'rad' } = { angleUnit: 'deg' }, time = 0) {
  const objects: Record<ObjId, SceneObject> = {}
  for (const o of list) objects[o.id] = o
  return evaluateScene(objects, list.map((o) => o.id), settings, time)
}

const value = (ev: ReturnType<typeof run>, id: ObjId) => ev.values.get(id)

describe('ordering', () => {
  it('works out a chain listed child-first', () => {
    const ev = run([
      number('n3', 'c', 'b + 1'),
      number('n2', 'b', 'a * 2'),
      number('n1', 'a', '5'),
      segment('s', 'd', 'pB', 'pA'),
      point('pB', 'B', [3, 4, 0]),
      point('pA', 'A', [0, 0, 0])
    ])
    expect(ev.errors.size).toBe(0)
    expect(ev.scope.a).toBe(5)
    expect(ev.scope.b).toBe(10)
    expect(ev.scope.c).toBe(11)
    expect(ev.scope.d).toBe(5)
  })

  it('a long chain in reverse still resolves, one level per pass', () => {
    const list: SceneObject[] = []
    for (let i = 60; i >= 1; i--) list.push(number(`n${i}`, `v${i}`, i === 1 ? '1' : `v${i - 1} + 1`))
    const ev = run(list)
    expect(ev.errors.size).toBe(0)
    expect(ev.scope.v60).toBe(60)
  })

  it('names map to ids, and an object named i, j or k shadows the unit vector', () => {
    const ev = run([number('n', 'k', '7'), exprPoint('p', 'P', 'k*i + 2*j')])
    expect(ev.names.get('k')).toBe('n')
    expect(ev.scope.k).toBe(7)
    expect(ev.scope.i).toEqual([1, 0, 0])
    expect(value(ev, 'p')).toEqual({ type: 'point', p: [7, 2, 0] })
  })

  it('later objects win a name clash, as the last one listed is the one on top', () => {
    const ev = run([number('n1', 'a', '1'), number('n2', 'a', '2'), number('n3', 'b', 'a + 10')])
    expect(ev.names.get('a')).toBe('n2')
    expect(ev.scope.b).toBe(12)
  })
})

describe('loops', () => {
  it('two formulas that need each other are both flagged, in words, and nothing hangs', () => {
    const ev = run([number('n1', 'a', 'b + 1'), number('n2', 'b', 'a + 1')])
    expect(ev.values.size).toBe(0)
    expect(ev.errors.get('n1')).toMatch(/^a needs b, which in turn needs a\. This is a loop/)
    expect(ev.errors.get('n2')).toMatch(/^b needs a, which in turn needs b\. This is a loop/)
  })

  it('a formula that needs itself is a loop too', () => {
    const ev = run([number('n1', 'a', 'a + 1')])
    expect(ev.errors.get('n1')).toMatch(/loop/)
  })

  it('a three-way loop names the objects involved and spares the rest of the scene', () => {
    const ev = run([number('n1', 'a', 'c'), number('n2', 'b', 'a'), number('n3', 'c', 'b'), number('n4', 'd', '4')])
    expect(ev.errors.size).toBe(3)
    expect(ev.errors.get('n1')).toMatch(/^a needs c, which in turn needs a\./)
    expect(ev.scope.d).toBe(4)
  })

  it('a loop through references (a midpoint of itself) is reported the same way', () => {
    const m: SceneObject = { ...base('m', 'M'), type: 'point', def: { kind: 'midpoint', a: 'pA', b: 'm' } }
    const ev = run([point('pA', 'A', [0, 0, 0]), m])
    expect(ev.errors.get('m')).toMatch(/loop|cannot be worked out yet/)
    expect(value(ev, 'pA')).toBeDefined()
  })
})

describe('failures', () => {
  it('a formula that fails has no value, and its dependents say why instead of using a stale number', () => {
    const ev = run([number('n1', 'a', 'sqrt('), number('n2', 'b', 'a * 2'), exprPoint('p', 'P', 'b*i')])
    expect(value(ev, 'n1')).toBeUndefined()
    expect(ev.errors.has('n1')).toBe(true)
    expect(ev.errors.get('n2')).toBe('a is undefined')
    expect(ev.errors.get('p')).toBe('b is undefined')
    expect('a' in ev.scope).toBe(false)
    expect('b' in ev.scope).toBe(false)
  })

  it('a formula that gives no number is an error, not NaN on the drawing', () => {
    const ev = run([number('n1', 'a', '1/0'), number('n2', 'b', '"hi"')])
    expect(ev.errors.get('n1')).toBe('not a number')
    expect(ev.errors.get('n2')).toBe('not a number')
  })

  it('a reference to something that is gone is reported as missing, not as a loop', () => {
    const ev = run([point('pA', 'A', [0, 0, 0]), segment('s', 'a', 'pA', 'ghost')])
    expect(ev.errors.get('s')).toBe('depends on an undefined object')
    expect(value(ev, 'pA')).toBeDefined()
  })

  it('a reference to the wrong kind of thing says which kind was wanted', () => {
    const ev = run([number('n', 'k', '1'), segment('s', 'a', 'n', 'n')])
    expect(ev.errors.get('s')).toBe('k is not a point')
  })

  it('an object that fails takes its dependents down but nothing else', () => {
    const ev = run([
      point('pA', 'A', [0, 0, 0]),
      { ...base('c', 'c1'), type: 'circle', def: { kind: 'centerRadius', c: 'pA', r: '-1' } },
      { ...base('ctr', 'C'), type: 'point', def: { kind: 'center', circle: 'c' } },
      number('n', 'k', '3')
    ])
    expect(ev.errors.get('c')).toBe('radius must be positive')
    expect(ev.errors.get('ctr')).toBe('depends on an undefined object')
    expect(ev.scope.k).toBe(3)
  })
})

describe('time and angle', () => {
  it('t is the scene time, and an animated slider sweeps its range', () => {
    const slider: SceneObject = { ...base('n', 'k'), type: 'number', expr: '0', slider: { min: 2, max: 6, step: 1 }, animate: true }
    expect(run([number('n', 'a', '2*t')], { angleUnit: 'deg' }, 1.5).scope.a).toBe(3)
    expect(run([slider], { angleUnit: 'deg' }, 0).scope.k).toBe(2)
    expect(run([slider], { angleUnit: 'deg' }, Math.PI / 0.8).scope.k).toBeCloseTo(6)
  })

  it('an angle is published in the chosen unit', () => {
    const list = [point('pA', 'A', [1, 0, 0]), point('pV', 'V', [0, 0, 0]), point('pB', 'B', [0, 1, 0]), { ...base('ang', 'θ'), type: 'angle', a: 'pA', vertex: 'pV', b: 'pB', oriented: false } as SceneObject]
    expect(run(list, { angleUnit: 'deg' }).scope['θ']).toBeCloseTo(90)
    expect(run(list, { angleUnit: 'rad' }).scope['θ']).toBeCloseTo(Math.PI / 2)
  })
})

describe('the dependency graph helpers', () => {
  const list = [point('pA', 'A', [0, 0, 0]), point('pB', 'B', [1, 1, 0]), segment('s', 'a', 'pA', 'pB'), number('n', 'k', '2*a'), number('bad', 'z', 'sqrt(')]
  const objects: Record<ObjId, SceneObject> = Object.fromEntries(list.map((o) => [o.id, o]))

  it('directDependents links by reference and by name, and skips a formula it cannot read', () => {
    const d = directDependents(objects)
    expect([...d.get('pA')!]).toEqual(['s'])
    expect([...d.get('s')!]).toEqual(['n'])
    expect(d.has('bad')).toBe(false)
  })

  it('dependentsOf follows the chain to the end', () => {
    expect([...dependentsOf('pA', objects)].sort()).toEqual(['n', 's'])
    expect([...dependentsOf('n', objects)]).toEqual([])
  })

  it('parentRefs, exprRefs and isFree describe each definition', () => {
    expect(parentRefs(objects.s)).toEqual(['pA', 'pB'])
    expect(parentRefs(objects.n)).toEqual([])
    expect(exprRefs(objects.n)).toEqual(['2*a'])
    expect(exprRefs(objects.s)).toEqual([])
    expect(isFree(objects.pA)).toBe(true)
    expect(isFree(objects.s)).toBe(false)
  })
})
