// 3D-3B: what a student types in Geometry's 3-D view - a point in space P(1, 2, 3), a plane through three points, and the
// solids by their sizes. A plane typed as an equation stays 3D-2's typed plane.

import { beforeEach, describe, expect, it } from 'vitest'
import { runCommand } from '../src/renderer/src/lang/commands'
import { scene } from '../src/renderer/src/core/store'
import type { SceneObject } from '../src/renderer/src/core/types'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  scene().setActiveSpace('shapes')
})

const said = (): string => scene().log[scene().log.length - 1]?.text ?? scene().log[scene().log.length - 1]?.tex ?? ''
const all = (type: SceneObject['type']) => Object.values(scene().objects).filter((o) => o.type === type)
const named = (n: string) => scene().objects[scene().ev.names.get(n)!]

describe('a point in space', () => {
  it('P(1, 2, 3) is the point P at (1, 2, 3)', async () => {
    await runCommand('P(1, 2, 3)')
    const c = scene().ev.values.get(named('P').id)
    expect(c?.type === 'point' && c.p).toEqual([1, 2, 3])
  })
  it('Q(1/2, -2) is a point on the floor', async () => {
    await runCommand('Q(1/2, -2)')
    const c = scene().ev.values.get(named('Q').id)
    expect(c?.type === 'point' && c.p).toEqual([0.5, -2, 0])
  })
  it('f(2) for a function f is still the function', async () => {
    await runCommand('f(x) = x^2')
    await runCommand('f(2)')
    expect(all('point')).toHaveLength(0)
  })
})

describe('a plane', () => {
  it('Plane(A, B, C) is the plane through the three points', async () => {
    await runCommand('A(0, 0, 0)')
    await runCommand('B(2, 0, 0)')
    await runCommand('C(0, 2, 1)')
    await runCommand('Plane(A, B, C)')
    const [p] = all('plane')
    expect(p).toBeDefined()
    const c = scene().ev.values.get(p.id)
    expect(c?.type).toBe('plane')
  })
  it('Plane(A, B) is refused in words', async () => {
    await runCommand('A(0, 0, 0)')
    await runCommand('B(2, 0, 0)')
    await runCommand('Plane(A, B)')
    expect(all('plane')).toHaveLength(0)
    expect(said()).toMatch(/Plane needs three points/)
  })
})

describe('the solids by their sizes', () => {
  it.each([
    ['Cube(2)', 'cube', { a: '2' }],
    ['Cuboid(5, 3, 4)', 'cuboid', { l: '5', w: '3', h: '4' }],
    ['Prism(4, 6)', 'prism', { b: '4', h: '6' }],
    ['Pyramid(4, 6)', 'pyramid', { b: '4', h: '6' }],
    ['Sphere(3)', 'sphere', { r: '3' }],
    ['Cylinder(2.5, 5)', 'cylinder', { r: '2.5', h: '5' }],
    ['Cone(3, 4)', 'cone', { r: '3', h: '4' }]
  ])('%s', async (line, kind, size) => {
    await runCommand(line)
    const [s] = all('solid')
    expect(s).toMatchObject({ kind, size, at: [0, 0, 0] })
  })
  it('a pyramid says its volume when it is made', async () => {
    await runCommand('Pyramid(4, 6)')
    expect(said()).toMatch(/square pyramid, volume } 32/)
  })
  it('a size may be a slider: r = 2, then Sphere(r)', async () => {
    await runCommand('r = 2')
    await runCommand('Sphere(r)')
    const [s] = all('solid')
    const c = scene().ev.values.get(s.id)
    expect(c?.type === 'solid' && c.shape.volume).toBeCloseTo((32 / 3) * Math.PI, 12)
  })
  it('Cube() and Cuboid(1, 2) are refused in words', async () => {
    await runCommand('Cube()')
    expect(said()).toMatch(/Cube needs its side/)
    await runCommand('Cuboid(1, 2)')
    expect(said()).toMatch(/Cuboid needs its length, width and height/)
    expect(all('solid')).toHaveLength(0)
  })
})
