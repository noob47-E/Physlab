import { describe, expect, it, beforeEach } from 'vitest'
import { scene } from '../src/renderer/src/core/store'
import { Builder } from '../src/renderer/src/core/factory'
import { useSandbox } from '../src/renderer/src/sim/store'
import { useLab } from '../src/renderer/src/lab/labStore'
import { runTool } from '../src/renderer/src/ai/tools'
import { runToolLoop, ACTION_LOOP_MAX_ROUNDS } from '../src/renderer/src/ai/client'
import { checkDrawingClaims, checkMeasuredClaims, verifyMessage } from '../src/renderer/src/ai/truthCheck'
import { extractAiDidChips } from '../src/renderer/src/panels/ai/MarkdownView'
import type { PhysLabAction } from '../src/renderer/src/ai/types'

describe('Part 4: The Honest Action Loop & Undo Collapse', () => {
  beforeEach(() => {
    scene().newScene()
    useSandbox.getState().loadSandbox(undefined)
    useLab.getState().setTables([])
  })

  describe('Multi-round Tool Loop', () => {
    it('enforces maximum of 3 tool rounds', () => {
      expect(ACTION_LOOP_MAX_ROUNDS).toBe(3)
    })

    it('terminates cleanly within 3 rounds when simulated model requests tools', async () => {
      let callCount = 0
      const mockChatFn = async ({ messages: _messages }: { messages: any[] }) => {
        callCount++
        if (callCount <= 2) {
          return {
            ok: true,
            message: {
              role: 'assistant' as const,
              content: null,
              tool_calls: [
                {
                  id: `call_${callCount}`,
                  type: 'function' as const,
                  function: {
                    name: 'describe_screen',
                    arguments: JSON.stringify({ mode: 'graphing' })
                  }
                }
              ]
            }
          }
        }
        return {
          ok: true,
          message: {
            role: 'assistant' as const,
            content: 'Screen inspected and ready.'
          }
        }
      }

      const res = await runToolLoop([], mockChatFn)
      expect(res.roundCount).toBeLessThanOrEqual(3)
      expect(res.content).toBe('Screen inspected and ready.')
      expect(res.actions.length).toBe(2)
    })
  })

  describe('Honesty Enforcement in Code', () => {
    it('replaces false drawing claims with honest line when command fails', async () => {
      const actions: PhysLabAction[] = [
        {
          id: 'act_fail',
          tool: 'run_commands',
          args: { commands: ['invalid_command_xyz'] },
          status: 'failed',
          result: {
            ok: false,
            error: 'Unknown command: invalid_command_xyz',
            failures: [{ command: 'invalid_command_xyz', error: 'Unknown command' }]
          }
        }
      ]

      const check = checkDrawingClaims(
        'I have constructed the triangle ABC and drawn the circle live on screen.',
        actions
      )
      expect(check.claimedDrawing).toBe(true)
      expect(check.honest).toBe(false)
      expect(check.honestLine).toContain("I couldn't draw the construction because")
      expect(check.correctedContent).toContain("I couldn't draw the construction because Unknown command: invalid_command_xyz")
      expect(check.correctedContent).not.toContain('I have constructed')
    })

    it('detects when named objects claimed by the model do not exist on screen', () => {
      // Scene has only point A
      const bld = new Builder()
      bld.point([0, 0, 0], { name: 'A' })
      bld.commit()

      const actions: PhysLabAction[] = [
        {
          id: 'act_1',
          tool: 'run_commands',
          args: { commands: ['A = (0, 0)'] },
          status: 'success',
          result: { ok: true, created: ['A'] }
        }
      ]

      // Model claims it drew circle c and point P, which do not exist
      const check = checkDrawingClaims(
        "I have drawn circle c and point P on the canvas.",
        actions
      )
      expect(check.claimedDrawing).toBe(true)
      expect(check.honest).toBe(false)
      expect(check.honestLine).toContain("I couldn't create")
      expect(check.honestLine).toMatch(/circle c|point P/)
    })

    it('replaces unverified measurements with honest notes', () => {
      const screenText = 'curves: [ y = x^2 - 4 ] area = 12.50'
      const actions: PhysLabAction[] = [
        {
          id: 'act_1',
          tool: 'run_commands',
          args: { commands: ['area 0 2'] },
          status: 'success',
          result: { ok: true, area: 12.50 }
        }
      ]

      // Accurate measurement passes
      const accurate = checkMeasuredClaims('The area is 12.50.', actions, screenText)
      expect(accurate.honest).toBe(true)

      // Hallucinated measurement fails
      const falseClaim = checkMeasuredClaims('The measured area is 99.99.', actions, screenText)
      expect(falseClaim.honest).toBe(false)
      expect(falseClaim.honestLine).toContain("I couldn't verify the measured value on screen")
      expect(falseClaim.correctedContent).toContain('(unverified)')
    })

    it('verifyMessage integrates drawing and measurement honesty', async () => {
      const actions: PhysLabAction[] = [
        {
          id: 'act_fail',
          tool: 'run_commands',
          args: { commands: ['foo'] },
          status: 'failed',
          result: { ok: false, error: 'Command foo failed' }
        }
      ]

      const ver = await verifyMessage('Here is the construction of triangle ABC on screen.', actions)
      expect(ver.state).toBe('disagrees')
      expect(ver.correctedContent).toContain("I couldn't draw the construction because Command foo failed")
    })
  })

  describe('One AI Turn = One Undo Step', () => {
    it('collapses multiple commands in a turn into a single undo step', async () => {
      const initialCount = Object.keys(scene().objects).length
      expect(initialCount).toBe(0)

      // AI executes a 3-command construction turn
      const res = await runTool('run_commands', {
        mode: 'shapes',
        commands: [
          'A = (0, 0)',
          'B = (4, 0)',
          'C = (2, 3)'
        ]
      })

      if (!res.ok) {
        console.error('run_commands error:', res)
      }
      expect(res.ok).toBe(true)
      const afterCount = Object.keys(scene().objects).length
      expect(afterCount).toBe(3)

      // Executing scene().undo() ONCE should revert the whole AI turn back to initial empty state!
      scene().undo()
      const revertedCount = Object.keys(scene().objects).length
      expect(revertedCount).toBe(initialCount)
    })
  })

  describe('Bulk Deletion Safeguard', () => {
    it('refuses to delete >5 objects without confirmation', async () => {
      const bld = new Builder()
      for (let i = 1; i <= 6; i++) {
        bld.point([i, i, 0], { name: `P${i}` })
      }
      bld.commit()
      expect(Object.keys(scene().objects).length).toBe(6)

      // Unconfirmed bulk delete attempt
      const res = await runTool('run_commands', {
        commands: ['delete P1, P2, P3, P4, P5, P6']
      })

      expect(res.ok).toBe(false)
      expect(res.requiresConfirmation).toBe(true)
      expect(res.error).toContain('confirmation')
      // Objects must remain untouched
      expect(Object.keys(scene().objects).length).toBe(6)
    })

    it('allows bulk delete when confirmed is true', async () => {
      const bld = new Builder()
      for (let i = 1; i <= 6; i++) {
        bld.point([i, i, 0], { name: `Q${i}` })
      }
      bld.commit()
      expect(Object.keys(scene().objects).length).toBe(6)

      // Confirmed bulk delete attempt
      const res = await runTool('run_commands', {
        commands: ['delete Q1, Q2, Q3, Q4, Q5, Q6'],
        confirmed: true
      })

      expect(res.ok).toBe(true)
      expect(Object.keys(scene().objects).length).toBe(0)
    })

    it('refuses unconfirmed clear when scene has more than 5 objects', async () => {
      const bld = new Builder()
      for (let i = 1; i <= 6; i++) {
        bld.point([i, i, 0], { name: `Pt${i}` })
      }
      bld.commit()
      expect(Object.keys(scene().objects).length).toBe(6)

      const res = await runTool('run_commands', {
        commands: ['clear']
      })

      expect(res.ok).toBe(false)
      expect(res.requiresConfirmation).toBe(true)
      expect(res.error).toContain('confirmation')
      expect(Object.keys(scene().objects).length).toBe(6)
    })
  })

  describe('Calm "AI did:" Chips Generation', () => {
    it('extracts concise chips for created and removed objects', () => {
      const bld = new Builder()
      const p = bld.point([1, 2, 0], { name: 'A' })
      bld.commit()

      const actions: PhysLabAction[] = [
        {
          id: 'act_1',
          tool: 'run_commands',
          args: { commands: ['A = (1, 2)', 'delete D'] },
          status: 'success',
          result: {
            ok: true,
            created: [p.id],
            removed: ['D']
          }
        }
      ]

      const chips = extractAiDidChips(actions)
      expect(chips.length).toBe(2)
      expect(chips[0].label).toBe('+ point A')
      expect(chips[0].kind).toBe('add')
      expect(chips[1].label).toBe('− D')
      expect(chips[1].kind).toBe('remove')
    })

    it('extracts command chips when no objects were explicitly created or removed', () => {
      const actions: PhysLabAction[] = [
        {
          id: 'act_plot',
          tool: 'plot',
          args: { expression: 'y = sin x' },
          status: 'success'
        }
      ]

      const chips = extractAiDidChips(actions)
      expect(chips.length).toBe(1)
      expect(chips[0].label).toBe('plot y = sin x')
    })
  })
})
