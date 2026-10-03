// P-FIX-VIEW VA, W1 and W2: finishing a drawing or stepping back with Backspace may only take away
// what that drawing itself made. Finish (Enter, right-click, double-click) and Backspace used to
// drop any "unused" point the tool had been clicked on, so a point placed earlier, and a midpoint
// built on it, vanished. Backspace with the Segment tool called the scene's undo, which reverted
// whatever was done last — an earlier circle, say — and then ended the drawing instead of stepping
// back one point. These drive the real tool functions and the real scene store, as the canvas does.

import { beforeEach, describe, expect, it } from 'vitest'
import { Builder } from '../src/renderer/src/core/factory'
import { scene } from '../src/renderer/src/core/store'
import type { ObjId } from '../src/renderer/src/core/types'
import { advanceTool, finishTool, undoLastPick, useTool } from '../src/renderer/src/render/tools'
import type { V3 } from '../src/renderer/src/math/vec'

/** A point placed before the drawing began (its own undo step, as the Point tool makes it). */
function placeEarlier(p: V3): ObjId {
  const b = new Builder()
  const pt = b.point(p)
  b.commit(false)
  return pt.id
}

/** A click on empty space with a drawing tool: the point is made, remembered as the tool's own, and picked. */
function clickEmpty(p: V3): ObjId {
  const b = new Builder()
  const pt = b.point(p)
  b.commit(false)
  useTool.setState((t) => ({ created: [...t.created, pt.id] }))
  return pick(pt.id)
}

/** A click on something already there: picked, nothing made. */
function pick(id: ObjId): ObjId {
  const next = [...useTool.getState().picks, id]
  useTool.setState({ picks: next })
  advanceTool(scene().tool, next)
  return id
}

const has = (id: ObjId) => !!scene().objects[id]
const segmentsBetween = (a: ObjId, b: ObjId) =>
  Object.values(scene().objects).filter((o) => o.type === 'segment' && ((o.a === a && o.b === b) || (o.a === b && o.b === a)))

beforeEach(() => {
  scene().newScene()
  useTool.setState({ picks: [], created: [], stroke: [], dragStart: null, firstTail: null, snap: null, marquee: null })
})

describe('W1: finishing or stepping back never removes a point placed earlier', () => {
  it('Circle tool on an earlier point A, then finish: A and its midpoint stay', () => {
    const A = placeEarlier([0, 0, 0])
    const B = placeEarlier([4, 0, 0])
    const mb = new Builder()
    const C = mb.point({ kind: 'midpoint', a: A, b: B })
    mb.commit(false)
    const steps = scene().past.length
    scene().setTool('circle')
    pick(A)
    expect(finishTool()).toBe(true)
    expect(has(A)).toBe(true)
    expect(has(C.id)).toBe(true)
    expect(scene().past.length).toBe(steps)
  })

  it('Line tool on an earlier point B, then Backspace: B and its midpoint stay', () => {
    const A = placeEarlier([0, 0, 0])
    const B = placeEarlier([4, 0, 0])
    const mb = new Builder()
    const C = mb.point({ kind: 'midpoint', a: A, b: B })
    mb.commit(false)
    const steps = scene().past.length
    scene().setTool('line')
    pick(B)
    expect(undoLastPick()).toBe(true)
    expect(has(B)).toBe(true)
    expect(has(C.id)).toBe(true)
    expect(useTool.getState().picks).toEqual([])
    expect(scene().past.length).toBe(steps)
  })

  it('a point the drawing made itself still goes on Backspace', () => {
    scene().setTool('triangle')
    const P = clickEmpty([0, 0, 0])
    const Q = clickEmpty([1, 0, 0])
    undoLastPick()
    expect(has(Q)).toBe(false)
    expect(has(P)).toBe(true)
    expect(useTool.getState().picks).toEqual([P])
  })
})

describe('W2: Backspace with the Segment tool steps back one point of this drawing only', () => {
  it('an earlier circle survives Backspace on a Segment drawing started on an existing point', () => {
    const b = new Builder()
    const c0 = b.point([0, 0, 0])
    const c1 = b.point([2, 0, 0])
    const circle = b.circle({ kind: 'centerPoint', c: c0.id, p: c1.id })
    b.commit()
    const steps = scene().past.length
    const corner = placeEarlier([5, 5, 0])
    const stepsWithCorner = scene().past.length
    expect(stepsWithCorner).toBe(steps + 1)
    scene().setTool('segment')
    pick(corner)
    undoLastPick()
    expect(has(circle.id)).toBe(true)
    expect(has(c0.id) && has(c1.id) && has(corner)).toBe(true)
    // Nothing of the history before the drawing was taken.
    expect(scene().past.length).toBe(stepsWithCorner)
    expect(useTool.getState().picks).toEqual([])
  })

  it('A, B, C on empty space, then Backspace: side BC and C go, drawing goes on from B', () => {
    scene().setTool('segment')
    const A = clickEmpty([0, 0, 0])
    const B = clickEmpty([3, 0, 0])
    const C = clickEmpty([3, 3, 0])
    expect(segmentsBetween(B, C)).toHaveLength(1)
    undoLastPick()
    expect(segmentsBetween(B, C)).toHaveLength(0)
    expect(has(C)).toBe(false)
    expect(segmentsBetween(A, B)).toHaveLength(1)
    expect(useTool.getState().picks).toEqual([B])
    // Again: AB and B go, drawing goes on from A; once more and A goes and the drawing ends.
    undoLastPick()
    expect(segmentsBetween(A, B)).toHaveLength(0)
    expect(has(B)).toBe(false)
    expect(useTool.getState().picks).toEqual([A])
    undoLastPick()
    expect(has(A)).toBe(false)
    expect(useTool.getState().picks).toEqual([])
  })

  it('a side drawn from an earlier point back to it: Backspace keeps the earlier point', () => {
    const E = placeEarlier([9, 9, 0])
    scene().setTool('segment')
    pick(E)
    const F = clickEmpty([9, 6, 0])
    undoLastPick()
    expect(has(F)).toBe(false)
    expect(segmentsBetween(E, F)).toHaveLength(0)
    expect(useTool.getState().picks).toEqual([E])
    undoLastPick()
    expect(has(E)).toBe(true)
    expect(useTool.getState().picks).toEqual([])
  })
})
