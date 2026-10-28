import { describe, expect, it, beforeEach } from 'vitest'
import { scene } from '../src/renderer/src/core/store'
import { Builder } from '../src/renderer/src/core/factory'
import { useSandbox } from '../src/renderer/src/sim/store'
import { useVC } from '../src/renderer/src/panels/vectorCalcStore'
import { checkDrawingClaims, isCandidateObjectName } from '../src/renderer/src/ai/truthCheck'
import type { PhysLabAction } from '../src/renderer/src/ai/types'

describe('Fix B: Eliminate false red uncreated boxes for valid vectors and constructions', () => {
  beforeEach(() => {
    scene().newScene()
    useSandbox.getState().loadSandbox(undefined)
    useVC.setState({ cards: [], result: null })
  })

  it('filters out English words like "addition" from candidate object names', () => {
    expect(isCandidateObjectName('addition')).toBe(false)
    expect(isCandidateObjectName('sum')).toBe(false)
    expect(isCandidateObjectName('product')).toBe(false)
    expect(isCandidateObjectName('resultant')).toBe(false)
    expect(isCandidateObjectName('diagram')).toBe(false)
    expect(isCandidateObjectName('construction')).toBe(false)
    expect(isCandidateObjectName('theorem')).toBe(false)
    expect(isCandidateObjectName('method')).toBe(false)
    expect(isCandidateObjectName('components')).toBe(false)

    // Valid object names
    expect(isCandidateObjectName('u')).toBe(true)
    expect(isCandidateObjectName('v')).toBe(true)
    expect(isCandidateObjectName('R')).toBe(true)
    expect(isCandidateObjectName('A')).toBe(true)
    expect(isCandidateObjectName('A1')).toBe(true)
    expect(isCandidateObjectName("P'")).toBe(true)
    expect(isCandidateObjectName('FB')).toBe(true)
    expect(isCandidateObjectName('ABC')).toBe(true)
  })

  it('gives no red box for vector addition when arrows are present', () => {
    // Vectors present in useVC or actions
    useVC.setState({
      cards: [
        { id: 1, name: 'u', v: [2, 1, 0], entry: 'comp' },
        { id: 2, name: 'v', v: [1, 3, 0], entry: 'comp' },
        { id: 3, name: 'R', v: [3, 4, 0], entry: 'comp' }
      ]
    })

    const actions: PhysLabAction[] = [
      {
        id: 'act_vec',
        tool: 'run_commands',
        args: { commands: ['u = <2, 1>', 'v = <1, 3>'] },
        status: 'success',
        result: {
          ok: true,
          created: ['u', 'v', 'R'],
          visibleObjects: [
            { id: 'u', name: 'u', type: 'vector' },
            { id: 'v', name: 'v', type: 'vector' },
            { id: 'R', name: 'R', type: 'vector' }
          ]
        }
      }
    ]

    const content = `I added the vectors in PhysLab.
Vector addition is component-wise. No domain restrictions apply.
u = 2i + j, v = i + 3j
So the resultant is R = 3i + 4j.`

    const res = checkDrawingClaims(content, actions)
    expect(res.honest).toBe(true)
    expect(res.honestLine).toBeUndefined()
  })

  it('gives no red box for Ceva construction when objects are present in scene', () => {
    // Add Ceva points and segments to scene
    const bld = new Builder()
    bld.point([0, 4, 0], { name: 'A' })
    bld.point([-3, -2, 0], { name: 'B' })
    bld.point([3, -2, 0], { name: 'C' })
    bld.point([0, -2, 0], { name: 'D' })
    bld.point([1.5, 1, 0], { name: 'E' })
    bld.point([-1.5, 1, 0], { name: 'F' })
    bld.point([0, 0, 0], { name: 'P' })
    bld.commit()

    const actions: PhysLabAction[] = [
      {
        id: 'act_ceva',
        tool: 'run_commands',
        args: { commands: ['triangle A B C'] },
        status: 'success',
        result: {
          ok: true,
          created: ['A', 'B', 'C', 'D', 'E', 'F', 'P'],
          visibleObjects: [
            { id: 'A', name: 'A', type: 'point' },
            { id: 'P', name: 'P', type: 'point' }
          ]
        }
      }
    ]

    const content = `Ceva's theorem has been constructed in Geometry mode.
In a triangle, three cevians are concurrent if the product of the three side-segment ratios equals 1.`

    const res = checkDrawingClaims(content, actions)
    expect(res.honest).toBe(true)
    expect(res.honestLine).toBeUndefined()
  })

  it('still gives red box when drawing is claimed with zero objects created', () => {
    // 0 objects in scene, 0 in sandbox, no actions
    const content = `I have drawn the construction and triangle on screen.`
    const res = checkDrawingClaims(content, [])
    expect(res.claimedDrawing).toBe(true)
    expect(res.honest).toBe(false)
    expect(res.honestLine).toContain("I couldn't draw the construction because nothing was created on screen.")
  })
})
