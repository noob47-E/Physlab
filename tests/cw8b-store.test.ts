// CW8b, the store leads (CLEANUP-PLAN.md §2 "CW8b Shell: the store leads"). Each lead is proved
// here first. A fix a student would see is not applied: its test is `it.fails` and the item waits
// in the owner's list (polish\pro-account\OWNER-APPROVALS.md, CW8b-n).

import { beforeEach, describe, expect, it } from 'vitest'
import { useScene } from '../src/renderer/src/core/store'
import type { SceneObject } from '../src/renderer/src/core/types'
import type { V3 } from '../src/renderer/src/math/vec'
import { hasWork } from '../src/renderer/src/app/autosave'
import { menuForObject } from '../src/renderer/src/app/contextActions'
import { routeHistory, runHistory } from '../src/renderer/src/app/undoRoute'

const sc = () => useScene.getState()
const base = (id: string, name: string, space?: 'vectors' | 'shapes') => ({
  id,
  name,
  visible: true,
  locked: false,
  color: '#9775fa',
  showLabel: true,
  ...(space ? { space } : {})
})
const point = (id: string, name: string, p: V3, space?: 'vectors' | 'shapes'): SceneObject => ({ ...base(id, name, space), type: 'point', def: { kind: 'free', p } })
const labels = (id: string) => menuForObject(id).flatMap((g) => g.items.map((i) => i.label))

beforeEach(() => {
  sc().newScene()
  sc().setActiveSpace('vectors')
})

describe('CW8b: Clear this drawing', () => {
  it('keeps the objects of the other drawings', () => {
    sc().addObjects([point('pV', 'A', [1, 0, 0], 'vectors'), point('pS', 'B', [2, 0, 0], 'shapes')], { record: false })
    sc().clearDrawing()
    expect(Object.keys(sc().objects)).toEqual(['pS'])
  })

  // CW8b-1: an object with no drawing (a number typed in the Console while no drawing was open, or
  // anything from a file saved before drawings were separate) shows in every drawing, and Clear
  // removes it from all of them. Fixed in Bug 22.
  it('CW8b-1: leaves an object that belongs to no drawing alone', () => {
    sc().addObjects([point('pV', 'A', [1, 0, 0], 'vectors'), { ...base('nK', 'k'), type: 'number', expr: '2' }], { record: false })
    sc().clearDrawing()
    expect(Object.keys(sc().objects)).toEqual(['nK'])
  })
})

describe('CW8b: what counts as unsaved', () => {
  it('a change of units or precision is saved in the file', () => {
    sc().setSettings({ decimals: 4 })
    expect(sc().serialize().settings.decimals).toBe(4)
  })

  // CW8b-2: the precision and the units go into the file, yet changing them leaves the project
  // "saved": no • in the title, no autosave copy, and closing asks nothing.
  it.fails('CW8b-2: changing the precision marks the project unsaved', () => {
    sc().setSettings({ decimals: 4 })
    expect(sc().dirty).toBe(true)
  })

  // CW8b-4: the close prompt and the autosave follow `dirty`; the recovery strip follows `hasWork`.
  // A line drawn and undone leaves `dirty` on an empty File ▸ New: closing asks "unsaved changes?"
  // about nothing. (`dirty` is right for an opened file — deleting all of it is a change.)
  it.fails('CW8b-4: a drawing made and undone on a new project leaves nothing to save', () => {
    sc().addObjects([point('pA', 'A', [1, 0, 0], 'vectors')])
    sc().undo()
    expect(hasWork(sc().serialize())).toBe(false)
    expect(sc().dirty).toBe(false)
  })
})

describe('CW8b: Undo steps', () => {
  // CW8b-3: an edit that changes nothing still costs an Undo step, so the next Ctrl+Z seems to do nothing.
  it.fails('CW8b-3: an update that changes nothing records no Undo step', () => {
    sc().addObjects([point('pA', 'A', [1, 0, 0], 'vectors')], { record: false })
    const before = sc().past.length
    sc().updateObject('pA', (d) => {
      if (d.type === 'point' && d.def.kind === 'free') d.def.p = [1, 0, 0]
    })
    expect(sc().past.length).toBe(before)
  })
})

describe('CW8b: Break apart', () => {
  const ell: V3[] = [
    [0, 0, 0],
    [4, 0, 0],
    [4, 2, 0],
    [2, 2, 0],
    [2, 4, 0],
    [0, 4, 0]
  ]
  // CW8b-5: the broken shape's name is free again once it is gone, so the first piece takes it:
  // poly1 broken apart gives a piece called poly1, read as the whole shape come back.
  it.fails('CW8b-5: no piece takes the name of the shape it was broken from', () => {
    sc().setActiveSpace('shapes')
    const ids = ell.map((_, i) => `c${i}`)
    const objs: SceneObject[] = ell.map((p, i) => point(ids[i], 'ABCDEF'[i], p, 'shapes'))
    objs.push({ ...base('poly', 'poly1', 'shapes'), type: 'polygon', points: ids, fill: true, decomposed: true })
    sc().addObjects(objs, { record: false })
    sc().breakApart('poly')
    const names = Object.values(sc().objects)
      .filter((o) => o.type === 'polygon')
      .map((o) => o.name)
    expect(names.length).toBeGreaterThan(1)
    expect(names).not.toContain('poly1')
  })
})

describe('CW8b: the right-click menu at the origin', () => {
  it('offers no "Move to the origin" for a point already there', () => {
    sc().addObjects([point('pO', 'O', [0, 0, 0], 'vectors')], { record: false })
    expect(labels('pO')).not.toContain('Move to the origin')
  })

  // CW8b-6: a vector whose tail is already at the origin still offers "Move tail to the origin",
  // which does nothing but cost an Undo step.
  it.fails('CW8b-6: offers no "Move tail to the origin" for a vector whose tail is there', () => {
    sc().addObjects([{ ...base('vF', 'F', 'vectors'), type: 'vector', def: { kind: 'free', tail: [0, 0, 0], comp: [3, 4, 0] } } as SceneObject], {
      record: false
    })
    expect(labels('vF')).not.toContain('Move tail to the origin')
  })
})

describe('CW8b: which history Undo reaches', () => {
  it('Lab Data and the Sandbox undo their own history, the drawing modes the drawing', () => {
    expect(routeHistory('lab', { key: 'z', shift: false })?.stack).toBe('lab')
    expect(routeHistory('sandbox', { key: 'y', shift: false })?.stack).toBe('sandbox')
    expect(routeHistory('shapes', { menu: 'undo' })?.stack).toBe('scene')
  })

  // CW8b-7: the drawings share one history. The GPU Lab has no drawing of its own (it shows only the
  // objects with none), yet Ctrl+Z there undoes the last edit made in Geometry, out of sight; the
  // student finds it changed on going back. (The same holds between two drawing modes.)
  it.fails('CW8b-7: Undo in the GPU Lab leaves an edit in a drawing that is not on screen alone', () => {
    sc().setActiveSpace('shapes')
    sc().addObjects([point('pS', 'A', [1, 0, 0], 'shapes')])
    sc().setActiveSpace(null)
    runHistory('gpu', { menu: 'undo' })
    expect(Object.keys(sc().objects)).toEqual(['pS'])
  })
})
