// 3D-3B: Geometry's 3-D tool row and what its tools do with a click - the row itself (2-D unchanged), Plane's three
// points, Measure and Angle picking objects into the selection, and the handles' arithmetic (lift a point, grow a solid).

import { beforeEach, describe, expect, it } from 'vitest'
import { modeById, toolsFor } from '../src/renderer/src/app/modes'
import { TOOLS, acceptsFor, advanceTool, createsPointsOnEmpty, resetTool, useTool } from '../src/renderer/src/render/tools'
import { TOOL_GROUP } from '../src/renderer/src/app/toolCards/anims/tools'
import { scene } from '../src/renderer/src/core/store'
import { Builder } from '../src/renderer/src/core/factory'
import { handlesOf, heightFromHandle, measurePicks, nextSolidSpot, sizeFromHandle } from '../src/renderer/src/render/handles3d'
import { solidShape } from '../src/renderer/src/math/solidShape'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  scene().newScene()
  scene().setActiveSpace('shapes')
  resetTool()
})

describe('the 3-D tool row', () => {
  it('Geometry in 3-D: Move, Point, Segment, Line, Plane, 3D shapes, Measure, Angle, Delete', () => {
    const row = toolsFor(modeById('shapes'), '3d').filter((t) => t !== '|')
    expect(row.map((id) => TOOLS.find((t) => t.id === id)!.label)).toEqual(['Move', 'Point', 'Segment', 'Line', 'Plane', '3D shapes', 'Measure', 'Angle', 'Delete'])
  })
  it('Geometry in 2-D keeps its row; another mode keeps its row in 3-D', () => {
    expect(toolsFor(modeById('shapes'), '2d')).toEqual(modeById('shapes').tools)
    expect(toolsFor(modeById('graphing'), '3d')).toEqual(modeById('graphing').tools)
  })
  it('every new tool has a card with its label as title and a sentence that ends with a full stop', () => {
    for (const id of ['plane', 'solids', 'measure3d', 'angle3d'] as const) {
      const card = TOOL_GROUP[`tool:${id}`]
      expect(card.title).toBe(TOOLS.find((t) => t.id === id)!.label)
      expect(card.sentence).toMatch(/\.$/)
      expect(card.sentence.length).toBeLessThanOrEqual(120)
    }
  })
})

describe('Plane', () => {
  it('takes three points, and makes points on an empty floor', () => {
    expect(createsPointsOnEmpty('plane')).toBe(true)
    const b = new Builder()
    const ids = [b.point([0, 0, 0]), b.point([1, 0, 0]), b.point([0, 1, 1])].map((p) => p.id)
    b.commit()
    expect(advanceTool('plane', ids.slice(0, 2))).toBe(false)
    expect(advanceTool('plane', ids)).toBe(true)
    expect(Object.values(scene().objects).filter((o) => o.type === 'plane')).toHaveLength(1)
    expect(useTool.getState().picks).toEqual([])
  })
})

describe('Measure and Angle pick objects', () => {
  it('Measure takes points, lines, planes and solids; Angle lines and planes only; neither makes points', () => {
    const b = new Builder()
    const A = b.point([0, 0, 0])
    const B = b.point([1, 0, 0])
    const f = b.line({ kind: 'twoPoints', a: A.id, b: B.id })
    const cube = b.solid('cube', {}, [5, 0, 0])
    b.commit()
    const get = (id: string) => [scene().objects[id], scene().ev.values.get(id)!] as const
    const m = acceptsFor('measure3d', [])
    const a = acceptsFor('angle3d', [])
    expect([A.id, f.id, cube.id].map((id) => m(...get(id)))).toEqual([true, true, true])
    expect([A.id, f.id, cube.id].map((id) => a(...get(id)))).toEqual([false, true, false])
    expect(createsPointsOnEmpty('measure3d') || createsPointsOnEmpty('angle3d') || createsPointsOnEmpty('solids')).toBe(false)
  })
  it('a click adds to the selection (two at most, the older one going), on what is picked again takes it off, on nothing clears', () => {
    expect(measurePicks([], 'a')).toEqual(['a'])
    expect(measurePicks(['a'], 'b')).toEqual(['a', 'b'])
    expect(measurePicks(['a', 'b'], 'c')).toEqual(['b', 'c'])
    expect(measurePicks(['a', 'b'], 'a')).toEqual(['b'])
    expect(measurePicks(['a', 'b'], null)).toEqual([])
  })
})

describe('the handles', () => {
  it('a selected free point has a lift handle straight above it; a solid its size handle on the base and height handle on top', () => {
    const b = new Builder()
    const P = b.point([1, 2, 0])
    const cone = b.solid('cone', { r: '2', h: '3' }, [0, 0, 0])
    const cube = b.solid('cube', { a: '2' }, [6, 0, 0])
    b.commit()
    const h = (id: string) => handlesOf(scene().objects[id], scene().ev.values.get(id)!, 0.01)
    expect(h(P.id)).toEqual([{ part: 'lift', at: [1, 2, 0.36], from: [1, 2, 0] }])
    expect(h(cone.id).map((x) => [x.part, x.at])).toEqual([
      ['size', [2, 0, 0]],
      ['height', [0, 0, 3]]
    ])
    // A cube has one size: its side; no height handle of its own.
    expect(h(cube.id).map((x) => x.part)).toEqual(['size'])
  })
  it('the size handle scales the first size by how far it is pulled out, to 0.1; the height handle reads its height above the base', () => {
    expect(sizeFromHandle(2, 2, 3)).toBe(3)
    expect(sizeFromHandle(4, 2, 2.53)).toBe(5.1)
    expect(sizeFromHandle(4, 2, 0)).toBe(0.1)
    expect(heightFromHandle(0, 4.26)).toBe(4.3)
    expect(heightFromHandle(1, 0.2)).toBe(0.1)
  })
  it('a new solid stands beside the ones already there, not inside them', () => {
    expect(nextSolidSpot([])).toEqual([0, 0, 0])
    const one = solidShape('cube', { a: 4 }, [0, 0, 0])
    const spot = nextSolidSpot([one])
    expect(spot[0]).toBeGreaterThanOrEqual(2 + 2)
    expect(spot.slice(1)).toEqual([0, 0])
  })
})
