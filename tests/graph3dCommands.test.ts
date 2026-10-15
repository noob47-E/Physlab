// 3D-2: the graphs in space as a student types them in Graphing (the Expressions panel and the command bar run the same
// line): a curve in space, a plane, a parametric surface; z = f(x, y) and the 2-D curves as before.

import { beforeEach, describe, expect, it } from 'vitest'
import { runCommand } from '../src/renderer/src/lang/commands'
import { scene } from '../src/renderer/src/core/store'
import { is3DGraph, type GraphObj } from '../src/renderer/src/core/types'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  scene().setActiveSpace('graphing')
  scene().setViewMode('2d')
})

const graphs = (): GraphObj[] => Object.values(scene().objects).filter((o): o is GraphObj => o.type === 'graph')
const said = (): string => scene().log[scene().log.length - 1]?.text ?? ''
async function one(line: string): Promise<GraphObj> {
  await runCommand(line)
  const g = graphs()
  expect(g, `${line}: ${said()}`).toHaveLength(1)
  return g[0]
}

describe('a curve in space', () => {
  it('curve(cos(t), sin(t), t/5, 0, 4π) is a helix in the 3-D view', async () => {
    const g = await one('curve(cos(t), sin(t), t/5, 0, 4pi)')
    expect(g.kind).toBe('curve3d')
    expect(g.exprs).toEqual(['cos(t)', 'sin(t)', 't/5'])
    expect(g.tMin).toBe(0)
    expect(g.tMax).toBeCloseTo(4 * Math.PI, 12)
    expect(scene().viewMode).toBe('3d')
    expect(said()).toMatch(/Curve in space created/)
  })
  it('x = cos(t), y = sin(t), z = t/5 is the same curve, t from 0 to 2π', async () => {
    const g = await one('x = cos(t), y = sin(t), z = t/5')
    expect(g.kind).toBe('curve3d')
    expect(g.exprs).toEqual(['cos(t)', 'sin(t)', 't/5'])
    expect([g.tMin, g.tMax]).toEqual([0, 2 * Math.PI])
  })
  it('curve(cos(t), sin(t), 0) (three inputs, the third a number) is still the flat curve from t = 0', async () => {
    const g = await one('curve(cos(t), sin(t), 0)')
    expect(g.kind).toBe('parametric')
    expect(g.tMin).toBe(0)
  })
  it('curve(cos(t), sin(t), 0, 6) is still the flat curve, t from 0 to 6', async () => {
    const g = await one('curve(cos(t), sin(t), 0, 6)')
    expect(g.kind).toBe('parametric')
    expect(scene().viewMode).toBe('2d')
  })
})

describe('a plane', () => {
  it('2x + y − z = 3 is a plane in the 3-D view', async () => {
    const g = await one('2x + y - z = 3')
    expect(g.kind).toBe('plane')
    expect(scene().viewMode).toBe('3d')
    expect(said()).toMatch(/Plane created/)
  })
  it('x + z = 1 (a plane standing up) too', async () => {
    expect((await one('x + z = 1')).kind).toBe('plane')
  })
  it('x² + y² + z² = 9 is not a plane, and is refused in words', async () => {
    await runCommand('x^2 + y^2 + z^2 = 9')
    expect(graphs()).toHaveLength(0)
    expect(said()).toMatch(/cannot be drawn: it is not a plane/)
  })
})

describe('a surface', () => {
  it('surface(3 sin(v) cos(u), 3 sin(v) sin(u), 3 cos(v), 0, 2π, 0, π) is the sphere of radius 3', async () => {
    const g = await one('surface(3 sin(v) cos(u), 3 sin(v) sin(u), 3 cos(v), 0, 2pi, 0, pi)')
    expect(g.kind).toBe('psurface')
    expect([g.tMin, g.vMin]).toEqual([0, 0])
    expect(g.tMax).toBeCloseTo(2 * Math.PI, 12)
    expect(g.vMax).toBeCloseTo(Math.PI, 12)
    expect(scene().viewMode).toBe('3d')
  })
  it('z = sin(x) cos(y) is the surface it always was', async () => {
    expect((await one('z = sin(x) cos(y)')).kind).toBe('surface')
  })
  it('every graph in space opens the 3-D view; the flat ones do not', () => {
    expect(['surface', 'curve3d', 'plane', 'psurface'].every((k) => is3DGraph(k as GraphObj['kind']))).toBe(true)
    expect(['explicit', 'parametric', 'implicit', 'polar'].some((k) => is3DGraph(k as GraphObj['kind']))).toBe(false)
  })
})
