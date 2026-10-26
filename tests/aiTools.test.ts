import { describe, it, expect, beforeEach } from 'vitest'
import { runTool } from '../src/renderer/src/ai/tools'
import { scene } from '../src/renderer/src/core/store'
import { useCalc } from '../src/renderer/src/calc/calcStore'
import { useSandbox } from '../src/renderer/src/sim/store'

describe('AI Tools Layer (src/renderer/src/ai/tools.ts)', () => {
  beforeEach(() => {
    scene().newScene()
    useCalc.setState({ input: '', mode: 'COMP', history: [] })
    useSandbox.getState().resetRun()
  })

  it('solve gives answers 2 and 3 with checked: true for x^2 - 5x + 6 = 0', async () => {
    const res = await runTool('solve', { expression: 'x^2 - 5x + 6 = 0' })
    expect(res.ok).toBe(true)
    expect(res.checked).toBe(true)
    const ansText = String(res.answer)
    expect(ansText).toMatch(/2/)
    expect(ansText).toMatch(/3/)
    expect(res.steps).toBeDefined()
    expect(Array.isArray(res.steps)).toBe(true)
    expect((res.steps as any[]).length).toBeGreaterThan(0)
  })

  it('solve gives 1 ± √7 i for x^2 - 2x + 8 = 0', async () => {
    const res = await runTool('solve', { expression: 'x^2 - 2x + 8 = 0' })
    expect(res.ok).toBe(true)
    const ansText = String(res.answer)
    expect(ansText).toMatch(/1/)
    expect(ansText).toMatch(/7/)
    expect(ansText).toMatch(/i/)
  })

  it('plot adds a line to the scene in 2D mode', async () => {
    const res = await runTool('plot', { expression: 'y = x^2', dim: '2d' })
    expect(res.ok).toBe(true)
    const objects = Object.values(scene().objects)
    const graphObj = objects.find((o) => o.type === 'graph')
    expect(graphObj).toBeDefined()
  })

  it('load_experiment + play(1) + get_readings gives real falling ball kinematics', async () => {
    const loadRes = await runTool('load_experiment', { id: 'drop' })
    expect(loadRes.ok).toBe(true)

    // Play for 1 second of simulation time
    const playRes = await runTool('play', { seconds: 1 })
    expect(playRes.ok).toBe(true)

    const readingsRes = await runTool('get_readings', {})
    expect(readingsRes.ok).toBe(true)
    const rows = readingsRes.rows as Array<{ t: number; y: number; v: number }>
    expect(rows.length).toBeGreaterThan(3)

    // Verify time is monotonic increasing
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].t).toBeGreaterThan(rows[i - 1].t)
    }

    // Verify y falls (starts at e.g. 5m and decreases)
    const yStart = rows[0].y
    const yEnd = rows[rows.length - 1].y
    expect(yEnd).toBeLessThan(yStart)
  })

  it('export_readings returns CSV text with a header and data rows', async () => {
    // Run an experiment first to have readings
    await runTool('load_experiment', { id: 'drop' })
    await runTool('play', { seconds: 0.5 })

    const exportRes = await runTool('export_readings', { format: 'csv', title: 'Falling Ball Test' })
    expect(exportRes.ok).toBe(true)
    expect(exportRes.format).toBe('csv')
    expect(exportRes.tableId).toBeDefined()
  })

  it('prompts to call play first when get_readings has no samples', async () => {
    // Reset sandbox
    useSandbox.getState().resetRun()
    useSandbox.getState().clearRecording()

    const res = await runTool('get_readings', {})
    expect(res.ok).toBe(false)
    expect(res.error).toContain('play')
  })
})
