// 3D-3B: a tile of the 3D shapes row (and of the Shapes gallery) puts its solid on the floor, selected, beside any already
// there, says its volume, and hands the tool back to Move.

import { beforeEach, describe, expect, it } from 'vitest'
import { scene } from '../src/renderer/src/core/store'
import { addSolid } from '../src/renderer/src/panels/solids3d'
import type { SolidObj } from '../src/renderer/src/core/types'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  scene().setActiveSpace('shapes')
  scene().setTool('solids')
})

const solids = () => Object.values(scene().objects).filter((o): o is SolidObj => o.type === 'solid')

describe('a shape tile', () => {
  it('a pyramid 4 by 6 at the centre of the floor, selected, its volume said, Move again', () => {
    addSolid('pyramid')
    const [p] = solids()
    expect(p).toMatchObject({ kind: 'pyramid', size: { b: '4', h: '6' }, at: [0, 0, 0] })
    expect(scene().selection).toEqual([p.id])
    expect(scene().tool).toBe('select')
    expect(scene().log.at(-1)?.text).toMatch(/Square pyramid: V = 32/)
  })
  it('the next stands beside it, not inside it', () => {
    addSolid('cube')
    addSolid('sphere')
    const [, s] = solids()
    expect(s.at[0]).toBeGreaterThan(4)
  })
})
