import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scene } from '../src/renderer/src/core/store'
import { useCameraCommand } from '../src/renderer/src/render/viewState'
import { drawAnswer, useVC } from '../src/renderer/src/panels/vectorCalcStore'
import * as VS from '../src/renderer/src/math/vectorSolver'

describe('vector "Draw on graph" camera framing (X8)', () => {
  beforeEach(() => {
    scene().newScene()
    scene().setActiveSpace('vectors')
    useVC.setState({
      cards: [
        { id: 1, name: 'A', entry: 'comp', latex: '3\\hat{i}+4\\hat{j}', mag: '5', angle: '53.13', sceneId: '' },
        { id: 2, name: 'B', entry: 'comp', latex: '1\\hat{i}-2\\hat{j}', mag: '2.24', angle: '296.57', sceneId: '' }
      ],
      result: null,
      highlight: 0
    })
    useCameraCommand.setState({ nonce: 0, kind: 'home', box: undefined })
  })

  it('passes an explicit bounding box with comfortable top padding so tall vectors are never cut off', () => {
    vi.useFakeTimers()
    try {
      const sol = VS.solveAddition(
        [
          { name: 'A', v: [3, 4, 0] },
          { name: 'B', v: [1, -2, 0] }
        ],
        'R'
      )
      useVC.setState({ result: { sol, label: 'Resultant R = A + B', from: { cards: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }], solve: () => sol } } })

      drawAnswer(sol, null)
      vi.runAllTimers()

      const cmd = useCameraCommand.getState()
      expect(cmd.kind).toBe('fit')
      // Currently on unfixed code, cmd.box is undefined (fitCamera called with no arguments)
      expect(cmd.box).toBeDefined()
      const box = cmd.box!

      // Origin and all vector endpoints must be fully inside the framed box
      // In head-to-tail, A is (0,0)->(3,4), B is (3,4)->(4,2), R is (0,0)->(4,2)
      expect(box.min[0]).toBeLessThanOrEqual(0)
      expect(box.min[1]).toBeLessThanOrEqual(0)
      expect(box.max[0]).toBeGreaterThanOrEqual(4)

      // Vector A's tip is at y = 4. To avoid being cut off by the top HUD controls / tabs,
      // the top of the box must have significant clearance above y = 4 (at least 1.5 units above y=4)
      expect(box.max[1]).toBeGreaterThanOrEqual(4 + 1.5)
    } finally {
      vi.useRealTimers()
    }
  })

  it('frames all vectors with top margin when switching layouts or with tall vertical vectors', () => {
    vi.useFakeTimers()
    try {
      const sol = VS.solveAddition(
        [
          { name: 'A', v: [0, 8, 0] },
          { name: 'B', v: [3, 0, 0] }
        ],
        'R'
      )
      useVC.setState({ result: { sol, label: 'Resultant R = A + B', from: { cards: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }], solve: () => sol } } })

      drawAnswer(sol, 'parallelogram')
      vi.runAllTimers()

      const cmd = useCameraCommand.getState()
      expect(cmd.box).toBeDefined()
      const box = cmd.box!

      // Vector A tip is at y = 8, box must clear it with ample top padding
      expect(box.max[1]).toBeGreaterThanOrEqual(8 + 2.0)
      expect(box.min[1]).toBeLessThanOrEqual(-0.5)
      expect(box.max[0]).toBeGreaterThanOrEqual(3 + 0.5)
      expect(box.min[0]).toBeLessThanOrEqual(-0.5)
    } finally {
      vi.useRealTimers()
    }
  })
})
