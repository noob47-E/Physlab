// 3D-3B: solids and planes as scene objects - evaluated like every object (they follow their points and sliders), named,
// saved in the file and opened again, undone, and deleted with what they hang on.

import { beforeEach, describe, expect, it } from 'vitest'
import { scene } from '../src/renderer/src/core/store'
import { Builder } from '../src/renderer/src/core/factory'
import { displayName } from '../src/renderer/src/core/naming'
import type { SolidObj } from '../src/renderer/src/core/types'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  scene().newScene()
  scene().setActiveSpace('shapes')
})

const value = (id: string) => scene().ev.values.get(id)

describe('a solid', () => {
  it('a square pyramid 4 by 6 on the floor: its volume and corners', () => {
    const b = new Builder()
    const s = b.solid('pyramid', { b: '4', h: '6' }, [0, 0, 0])
    b.commit()
    const c = value(s.id)
    expect(c?.type).toBe('solid')
    if (c?.type !== 'solid') return
    expect(c.shape.volume).toBeCloseTo(32, 12)
    expect(c.shape.top).toEqual([0, 0, 6])
    expect(displayName(scene().objects[s.id], scene().objects, c)).toBe('Square pyramid')
  })

  it('a size may be a slider: the cylinder follows r', () => {
    const b = new Builder()
    const r = b.number('2', { name: 'r', slider: { min: 1, max: 5, step: 0.1 } })
    const s = b.solid('cylinder', { r: 'r', h: '3' }, [0, 0, 0])
    b.commit()
    const vol = () => {
      const c = value(s.id)
      return c?.type === 'solid' ? c.shape.volume : Number.NaN
    }
    expect(vol()).toBeCloseTo(Math.PI * 4 * 3, 12)
    scene().updateObject(r.id, (o) => {
      if (o.type === 'number') o.expr = '3'
    })
    expect(vol()).toBeCloseTo(Math.PI * 9 * 3, 12)
  })

  it('a size of 0 is the solid’s error in words, and the solid stays', () => {
    const b = new Builder()
    const s = b.solid('cube', { a: '0' }, [0, 0, 0])
    b.commit()
    expect(scene().ev.errors.get(s.id)).toMatch(/side a must be more than 0/)
  })

  it('is saved in the file and opens again the same', () => {
    const b = new Builder()
    const s = b.solid('cone', { r: '3', h: '4' }, [1, 2, 0])
    b.commit()
    const file = JSON.parse(JSON.stringify(scene().serialize()))
    scene().newScene()
    scene().loadScene(file)
    const back = Object.values(scene().objects).find((o) => o.type === 'solid') as SolidObj
    expect(back).toMatchObject({ kind: 'cone', size: { r: '3', h: '4' }, at: [1, 2, 0] })
    const c = value(back.id)
    expect(c?.type === 'solid' && c.shape.volume).toBeCloseTo(12 * Math.PI, 12)
    expect(s.id).toBe(back.id)
  })
})

describe('a plane through three points', () => {
  const three = () => {
    const b = new Builder()
    const A = b.point([0, 0, 0], { name: 'A' })
    const B = b.point([2, 0, 0], { name: 'B' })
    const C = b.point([0, 2, 0], { name: 'C' })
    const p = b.plane(A.id, B.id, C.id)
    b.commit()
    return { A, B, C, p }
  }

  it('is z = 0 for three points on the floor, and is called plane ABC', () => {
    const { p } = three()
    const c = value(p.id)
    expect(c?.type).toBe('plane')
    if (c?.type !== 'plane') return
    expect(Math.abs(c.n[2])).toBeCloseTo(1, 12)
    expect(c.d).toBeCloseTo(0, 12)
    expect(displayName(scene().objects[p.id], scene().objects, c)).toBe('plane ABC')
  })

  it('follows a point that is lifted', () => {
    const { C, p } = three()
    scene().updateObject(C.id, (o) => {
      if (o.type === 'point' && o.def.kind === 'free') o.def.p = [0, 0, 2]
    })
    const c = value(p.id)
    expect(c?.type === 'plane' && Math.abs(c.n[1])).toBeCloseTo(1, 12)
  })

  it('three points on one line make no plane, and say so', () => {
    const { C, p } = three()
    scene().updateObject(C.id, (o) => {
      if (o.type === 'point' && o.def.kind === 'free') o.def.p = [5, 0, 0]
    })
    expect(scene().ev.errors.get(p.id)).toMatch(/lie on one line/)
  })

  it('goes when one of its points is deleted', () => {
    const { A, p } = three()
    scene().removeObjects([A.id])
    expect(scene().objects[p.id]).toBeUndefined()
  })
})
