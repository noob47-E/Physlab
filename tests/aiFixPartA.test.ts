import { describe, it, expect, beforeEach } from 'vitest'
import { runCommand } from '../src/renderer/src/lang/commands'
import { runTool } from '../src/renderer/src/ai/tools'
import { useScene } from '../src/renderer/src/core/store'
import { useSandbox } from '../src/renderer/src/sim/store'
import { enterMode } from '../src/renderer/src/app/layout'
import { verifyMessage } from '../src/renderer/src/ai/truthCheck'
import type { PhysLabAction } from '../src/renderer/src/ai/types'

describe('Part A: Honest Actions & Truth Check', () => {
  beforeEach(() => {
    useScene.getState().newScene()
    useSandbox.getState().setScene([])
    enterMode('shapes')
  })

  describe('runCommand honest result', () => {
    it('returns ok: true and lists created ObjIds on valid command', async () => {
      const res = await runCommand('A = (1, 2)')
      expect(res.ok).toBe(true)
      expect(res.created.length).toBeGreaterThan(0)
      expect(res.removed.length).toBe(0)
      const name = useScene.getState().objects[res.created[0]]?.name
      expect(name).toBe('A')
    })

    it('returns ok: false with helpful message when command fails or is misunderstood', async () => {
      const res = await runCommand('nonexistent_command_1234(1, 2)')
      expect(res.ok).toBe(false)
      expect(res.created.length).toBe(0)
      expect(res.message.length).toBeGreaterThan(0)
    })

    it('returns ok: false when referencing undefined point in geometry', async () => {
      const res = await runCommand('Segment(P, NonexistentQ)')
      expect(res.ok).toBe(false)
      expect(res.created.length).toBe(0)
      expect(res.message).toMatch(/not a point|know a point/i)
    })

    it('returns ok: false when deleting non-existent object', async () => {
      const res = await runCommand('delete NonexistentObj')
      expect(res.ok).toBe(false)
      expect(res.message).toMatch(/Nothing with that name/i)
    })
  })

  describe('run_commands tool', () => {
    it('returns real result and fails when any command fails', async () => {
      const res = await runTool('run_commands', {
        mode: 'shapes',
        commands: ['A = (0, 0)', 'bad_syntax(((', 'B = (3, 4)']
      })
      expect(res.ok).toBe(false)
      expect(res.failingCommand).toBe('bad_syntax(((')
      expect(res.error).toBeDefined()
    })

    it('returns visibleObjects by name and type on success', async () => {
      const res = await runTool('run_commands', {
        mode: 'shapes',
        commands: ['P = (1, 2)', 'Q = (3, 4)', 's = Segment(P, Q)']
      })
      expect(res.ok).toBe(true)
      const visible = res.visibleObjects as Array<{ id: string; name: string; type: string }>
      expect(visible).toBeDefined()
      const names = visible.map((v) => v.name)
      expect(names).toContain('P')
      expect(names).toContain('Q')
      expect(names).toContain('s')
    })
  })

  describe('list_objects tool', () => {
    it('lists visible objects in Geometry mode', async () => {
      await runCommand('A = (0, 0)')
      await runCommand('c = Circle(A, 5)')
      const res = await runTool('list_objects', { mode: 'shapes' })
      expect(res.ok).toBe(true)
      const objs = res.objects as Array<{ name: string; type: string }>
      expect(objs.some((o) => o.name === 'A' && o.type === 'point')).toBe(true)
      expect(objs.some((o) => o.name === 'c' && o.type === 'circle')).toBe(true)
    })

    it('lists bodies in Sandbox mode', async () => {
      useSandbox.getState().addBody('sphere', [0, 5, 0])
      const res = await runTool('list_objects', { mode: 'sandbox' })
      expect(res.ok).toBe(true)
      expect(res.count).toBe(1)
      const bodies = res.objects as Array<{ type: string; position: number[] }>
      expect(bodies[0].type).toBe('sphere')
    })
  })

  describe('remove tool and undo restoration', () => {
    it('removes objects in Geometry mode and undo() restores them', async () => {
      enterMode('shapes')
      await runCommand('A = (0, 0)')
      await runCommand('c = Circle(A, 5)')
      expect(useScene.getState().order.length).toBe(2)

      // Remove the circle
      const removeRes = await runTool('remove', { mode: 'shapes', names: ['c'] })
      expect(removeRes.ok).toBe(true)
      expect(useScene.getState().order.length).toBe(1)
      expect(useScene.getState().ev.names.has('c')).toBe(false)

      // Undo restores the circle
      useScene.getState().undo()
      expect(useScene.getState().order.length).toBe(2)
      expect(useScene.getState().ev.names.has('c')).toBe(true)
    })

    it('removes all in Graphing mode and undo() restores them', async () => {
      enterMode('graphing')
      await runCommand('y = x^2')
      await runCommand('y = 2x + 1')
      expect(useScene.getState().order.length).toBe(2)

      // Clear the graph
      const removeRes = await runTool('remove', { mode: 'graphing', names: 'all' })
      expect(removeRes.ok).toBe(true)
      expect(useScene.getState().order.length).toBe(0)

      // Undo restores the graphs
      useScene.getState().undo()
      expect(useScene.getState().order.length).toBe(2)
    })

    it('removes bodies in Sandbox mode and undo() restores them', async () => {
      enterMode('sandbox')
      const b1 = useSandbox.getState().addBody('sphere', [0, 2, 0])
      useSandbox.getState().addBody('box', [1, 2, 0])
      expect(useSandbox.getState().bodies.length).toBe(2)

      // Remove single body
      const rem1 = await runTool('remove', { mode: 'sandbox', names: [b1.name] })
      expect(rem1.ok).toBe(true)
      expect(useSandbox.getState().bodies.length).toBe(1)

      // Undo restores body
      useSandbox.getState().undo()
      expect(useSandbox.getState().bodies.length).toBe(2)

      // Remove all bodies
      const remAll = await runTool('remove', { mode: 'sandbox', names: 'all' })
      expect(remAll.ok).toBe(true)
      expect(useSandbox.getState().bodies.length).toBe(0)

      // Undo restores bodies
      useSandbox.getState().undo()
      expect(useSandbox.getState().bodies.length).toBe(2)
    })
  })

  describe('truthCheck / verifyMessage honest correction', () => {
    it('corrects a reply claiming a drawing when nothing was created', async () => {
      const dishonestContent = "Let's construct it live! I have constructed triangle ABC on screen."
      const failedAction: PhysLabAction = {
        id: 'act1',
        tool: 'run_commands',
        args: { mode: 'shapes', commands: ['Triangle((0,0), (4,0), (0,3))'] },
        result: {
          ok: false,
          error: 'Syntax error in command',
          failingCommand: 'Triangle((0,0), (4,0), (0,3))'
        }
      }

      const v = await verifyMessage(dishonestContent, [failedAction])
      expect(v.state).toBe('disagrees')
      expect(v.badgeText).toBe('Not checked')
      expect(v.correctedContent).toBeDefined()
      expect(v.correctedContent).toMatch(/I couldn't draw the construction because/i)
      expect(v.correctedContent).not.toMatch(/Let's construct it live/i)
      expect(v.correctedContent).not.toMatch(/I have constructed/i)
    })

    it('corrects a reply claiming a drawing when no action was even executed', async () => {
      const dishonestContent = 'The circle is constructed on screen and shown on screen.'
      const v = await verifyMessage(dishonestContent, [])
      expect(v.state).toBe('disagrees')
      expect(v.badgeText).toBe('Not checked')
      expect(v.correctedContent).toBeDefined()
      expect(v.correctedContent).toMatch(/I couldn't draw the construction because nothing was created on screen/i)
      expect(v.correctedContent).not.toMatch(/shown on screen/i)
    })

    it('keeps honest reply unchanged when objects were actually created', async () => {
      const honestContent = 'I have constructed triangle ABC on screen.'
      const successfulAction: PhysLabAction = {
        id: 'act2',
        tool: 'run_commands',
        args: { mode: 'shapes', commands: ['A=(0,0)', 'B=(4,0)', 'C=(0,3)'] },
        result: {
          ok: true,
          created: ['idA', 'idB', 'idC'],
          visibleObjects: [{ id: 'idA', name: 'A', type: 'point' }]
        }
      }

      const v = await verifyMessage(honestContent, [successfulAction])
      expect(v.state).not.toBe('disagrees')
      expect(v.correctedContent).toBeUndefined()
    })
  })
})
