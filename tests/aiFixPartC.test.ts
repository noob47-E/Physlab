import { describe, it, expect, beforeEach } from 'vitest'
import { runCommand } from '../src/renderer/src/lang/commands'
import { runTool } from '../src/renderer/src/ai/tools'
import { useScene } from '../src/renderer/src/core/store'
import { enterMode } from '../src/renderer/src/app/layout'
import { visibleIn, visibleOrder } from '../src/renderer/src/core/visibility'
import type { SceneObject } from '../src/renderer/src/core/types'

describe('Part C: Geometry <-> Graphing Space Isolation', () => {
  beforeEach(() => {
    useScene.getState().newScene()
  })

  describe('By hand (runCommand with enterMode)', () => {
    it('point, segment, and circle created in Geometry never appear in Graphing', async () => {
      enterMode('shapes')
      const s = useScene.getState()
      expect(s.activeSpace).toBe('shapes')

      await runCommand('A = (0, 0)')
      await runCommand('B = (4, 0)')
      await runCommand('s = Segment(A, B)')
      await runCommand('c = Circle(A, 3)')

      const currentScene = useScene.getState()
      const geomVisible = visibleOrder(currentScene.order, currentScene.objects, 'shapes')
      const geomNames = geomVisible.map((id) => currentScene.objects[id]?.name)
      expect(geomNames).toContain('A')
      expect(geomNames).toContain('B')
      expect(geomNames).toContain('s')
      expect(geomNames).toContain('c')

      // Switch to Graphing
      enterMode('graphing')
      const graphScene = useScene.getState()
      expect(graphScene.activeSpace).toBe('graphing')

      const graphVisible = visibleOrder(graphScene.order, graphScene.objects, 'graphing')
      const graphNames = graphVisible.map((id) => graphScene.objects[id]?.name)
      expect(graphNames).not.toContain('A')
      expect(graphNames).not.toContain('B')
      expect(graphNames).not.toContain('s')
      expect(graphNames).not.toContain('c')
    })

    it('y = x^2 created in Graphing never appears in Geometry', async () => {
      enterMode('graphing')
      await runCommand('y = x^2')

      const currentScene = useScene.getState()
      const graphVisible = visibleOrder(currentScene.order, currentScene.objects, 'graphing')
      expect(graphVisible.length).toBeGreaterThan(0)
      expect(currentScene.objects[graphVisible[0]]?.type).toBe('graph')

      // Switch to Geometry
      enterMode('shapes')
      const geomScene = useScene.getState()
      const geomVisible = visibleOrder(geomScene.order, geomScene.objects, 'shapes')
      const geomTypes = geomVisible.map((id) => geomScene.objects[id]?.type)
      expect(geomTypes).not.toContain('graph')
    })
  })

  describe('Through run_commands with mode', () => {
    it('objects created with mode: "geometry" never appear in Graphing', async () => {
      const res = await runTool('run_commands', {
        mode: 'geometry',
        commands: ['P = (1, 2)', 'Q = (5, 2)', 'seg = Segment(P, Q)', 'circ = Circle(P, 2)']
      })
      expect(res.ok).toBe(true)

      const s = useScene.getState()
      const geomVisible = visibleOrder(s.order, s.objects, 'shapes')
      const geomNames = geomVisible.map((id) => s.objects[id]?.name)
      expect(geomNames).toContain('P')
      expect(geomNames).toContain('Q')
      expect(geomNames).toContain('seg')
      expect(geomNames).toContain('circ')

      // Switch to Graphing
      enterMode('graphing')
      const graphScene = useScene.getState()
      const graphVisible = visibleOrder(graphScene.order, graphScene.objects, 'graphing')
      const graphNames = graphVisible.map((id) => graphScene.objects[id]?.name)
      expect(graphNames).not.toContain('P')
      expect(graphNames).not.toContain('Q')
      expect(graphNames).not.toContain('seg')
      expect(graphNames).not.toContain('circ')
    })

    it('y = x^3 created with mode: "graphing" never appears in Geometry', async () => {
      const res = await runTool('run_commands', {
        mode: 'graphing',
        commands: ['y = x^3']
      })
      expect(res.ok).toBe(true)

      const s = useScene.getState()
      const graphVisible = visibleOrder(s.order, s.objects, 'graphing')
      expect(graphVisible.some((id) => s.objects[id]?.type === 'graph')).toBe(true)

      // Switch to Geometry
      enterMode('shapes')
      const geomScene = useScene.getState()
      const geomVisible = visibleOrder(geomScene.order, geomScene.objects, 'shapes')
      expect(geomVisible.some((id) => geomScene.objects[id]?.type === 'graph')).toBe(false)
    })
  })

  describe('Backward compatibility for legacy files without space', () => {
    it('objects without a space remain visible across modes (rule for format-1 files)', () => {
      const legacyObj: SceneObject = {
        id: 'legacy_point',
        name: 'LegacyPoint',
        type: 'point',
        color: '#ff0000',
        visible: true,
        locked: false,
        showLabel: true,
        def: { kind: 'free', p: [0, 0, 0] }
        // space is undefined
      } as any

      expect(visibleIn(legacyObj, 'graphing')).toBe(true)
      expect(visibleIn(legacyObj, 'shapes')).toBe(true)
      expect(visibleIn(legacyObj, 'vectors')).toBe(true)
    })
  })
})
