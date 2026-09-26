// Textbook names for what the student drew. The Measure list used to print the stored names —
// "poly1 Area 6 u²", segments "a, b, c, d, p, q", "c1" for a circle — and clicking a rectangle's
// side titled the box "Segment d" while the drawing and the shape table called it FC. One
// displayName (core/naming.ts) now serves the drawing's chips, the Measure list and the headings.
// Typed lines go through the real command bar and scene store.

import { beforeEach, describe, expect, it } from 'vitest'
import { useScene } from '../src/renderer/src/core/store'
import type { PolygonObj, SceneObject } from '../src/renderer/src/core/types'
import type { V3 } from '../src/renderer/src/math/vec'
import { displayName } from '../src/renderer/src/core/naming'
import { displayName as chipName } from '../src/renderer/src/render/Labels'
import { rowsFor } from '../src/renderer/src/panels/Measurements'
import { runCommand } from '../src/renderer/src/lang/commands'

const sc = () => useScene.getState()
const byName = (name: string): SceneObject => Object.values(sc().objects).find((o) => o.name === name)!
const nameOf = (o: SceneObject) => displayName(o, sc().objects, sc().ev.values.get(o.id))
const titleOf = (o: SceneObject) => rowsFor(o, (id) => sc().ev.values.get(id), sc().objects)[0].title
/** Stored names a student should never read: poly1, c1, r1, text1, and the one-letter segment names. */
const INTERNAL = /^(poly|c|r|text)\d+$|^[a-q]$/

async function rectangle4x3() {
  for (const l of ['F = (0, 3)', 'C = (0, 0)', 'D = (4, 0)', 'E = (4, 3)', 'Polygon(C, D, E, F)']) await runCommand(l)
}

describe('displayName: what the student reads an object as', () => {
  beforeEach(() => sc().newScene())

  it('a rectangle reads Rectangle CDEF and its left side FC, in the list and in the heading', async () => {
    await rectangle4x3()
    const poly = Object.values(sc().objects).find((o) => o.type === 'polygon')!
    expect(poly.name).toBe('poly1')
    expect(nameOf(poly)).toBe('Rectangle CDEF')
    const left = Object.values(sc().objects).find((o) => o.type === 'segment' && nameOf(o) === 'FC')
    expect(left, 'the side from F to C').toBeDefined()
    expect(INTERNAL.test(left!.name)).toBe(true)
    expect(titleOf(left!)).toBe('Segment FC')
    // The chip on the drawing is the same function.
    expect(chipName(left!, sc().objects)).toBe('FC')
  })

  it('a triangle reads ΔGHJ with its corners in the order they were made', async () => {
    for (const l of ['G = (0, 0)', 'H = (3, 0)', 'J = (0, 4)', 'Triangle(G, H, J)']) await runCommand(l)
    const tri = Object.values(sc().objects).find((o) => o.type === 'polygon')!
    expect(nameOf(tri)).toBe('ΔGHJ')
  })

  it('a circle reads by its centre: a lettered one, or the number pair it was typed with', async () => {
    await runCommand('J = (1, 2)')
    await runCommand('Circle(J, 2)')
    const k = Object.values(sc().objects).find((o) => o.type === 'circle')!
    expect(k.name).toBe('c1')
    expect(nameOf(k)).toBe('circle, centre J')
    expect(titleOf(k)).toBe('Circle, centre J')
    await runCommand('Circle((-4, -1), 2)')
    const m = Object.values(sc().objects).filter((o) => o.type === 'circle')[1]
    // The typed pair becomes a lettered point of its own, and the circle reads by it.
    expect(nameOf(m)).toMatch(/^circle, centre [A-Z]$/)
    // A centre that is a hidden helper has no letter to read: its place is the name.
    const d = m.type === 'circle' ? m.def : null
    if (d && 'c' in d) sc().updateObject(d.c, (o) => void (o.auxiliary = true))
    expect(nameOf(sc().objects[m.id])).toBe('circle, centre (−4, −1)')
  })

  it('a ray reads ray AB, headed Ray AB', async () => {
    for (const l of ['A = (0, 0)', 'B = (1, 1)', 'Ray(A, B)']) await runCommand(l)
    const r = Object.values(sc().objects).find((o) => o.type === 'ray')!
    expect(nameOf(r)).toBe('ray AB')
    expect(titleOf(r)).toBe('Ray AB')
  })

  it('a label the student typed wins, and a point keeps its letter', async () => {
    await rectangle4x3()
    const poly = Object.values(sc().objects).find((o) => o.type === 'polygon')!
    sc().updateObject(poly.id, (o) => void (o.label = 'Garden'))
    expect(nameOf(sc().objects[poly.id])).toBe('Garden')
    expect(nameOf(byName('F'))).toBe('F')
  })

  it('after Break apart nothing in the Measure list reads as a stored name', () => {
    const base = (id: string, name: string) => ({ id, name, visible: true, locked: false, color: '#9775fa', showLabel: true, space: 'shapes' as const })
    const P: V3[] = [[0, 3, 0], [4, 3, 0], [4, 0, 0], [0, 0, 0]]
    const ids = ['A', 'B', 'C', 'D'].map((n) => `pt${n}`)
    const objs: SceneObject[] = P.map((p, i) => ({ ...base(ids[i], 'ABCD'[i]), type: 'point', def: { kind: 'free', p } }))
    ids.forEach((a, i) => objs.push({ ...base(`seg${i}`, 'abcd'[i]), type: 'segment', a, b: ids[(i + 1) % 4] }))
    objs.push({ ...base('rect', 'poly1'), type: 'polygon', points: ['ptD', 'ptC', 'ptB', 'ptA'], fill: true, decomposed: true } as PolygonObj)
    sc().addObjects(objs)
    sc().breakApart('rect')
    const listed = Object.values(sc().objects).filter((o) => ['segment', 'polygon', 'circle'].includes(o.type))
    expect(listed.length).toBeGreaterThan(2)
    for (const o of listed) expect(INTERNAL.test(nameOf(o)), `${o.name} reads ${nameOf(o)}`).toBe(false)
    const pieces = listed.filter((o): o is PolygonObj => o.type === 'polygon')
    for (const p of pieces) expect(nameOf(p)).toMatch(/^Δ[A-Z]{3}$/)
  })
})
