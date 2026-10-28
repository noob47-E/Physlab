import { describe, expect, it, beforeEach } from 'vitest'
import { scene } from '../src/renderer/src/core/store'
import { useApp } from '../src/renderer/src/app/modes'
import { enterMode } from '../src/renderer/src/app/layout'
import { preComputeEngineTurn } from '../src/renderer/src/ai/bridge'
import { runTool } from '../src/renderer/src/ai/tools'

describe('Fix C: Constructions open their own mode from any mode', () => {
  beforeEach(() => {
    scene().newScene()
  })

  it('switches to geometry mode (shapes) when Ceva is requested from vectors mode', async () => {
    // 1. Start in Vectors mode
    enterMode('vectors')
    expect(useApp.getState().mode).toBe('vectors')

    // 2. Request Ceva's theorem construction
    const pre = preComputeEngineTurn("construct Ceva's theorem")
    expect(pre.actions.length).toBeGreaterThan(0)
    expect(pre.actions[0].tool).toBe('run_commands')
    expect(pre.actions[0].args?.mode).toBe('shapes')

    // 3. Mode is now shapes (Geometry)
    expect(useApp.getState().mode).toBe('shapes')

    // 4. Executing the commands creates the triangle and cevians
    const res = await runTool('run_commands', pre.actions[0].args)
    expect(res.ok).toBe(true)
    expect(Object.keys(scene().objects).length).toBeGreaterThanOrEqual(7)
  })
})
