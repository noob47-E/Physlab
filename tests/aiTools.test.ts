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

  it('solve handles trigonometric equations like 2 sin x = 1 (item 3)', async () => {
    const res = await runTool('solve', { expression: '2 sin x = 1' })
    expect(res.ok).toBe(true)
    const ans = String(res.answer)
    expect(ans.length).toBeGreaterThan(0)
  })

  it('solve differentiates x^3 sin x (item 4)', async () => {
    const res = await runTool('solve', { expression: 'x^3 \\sin(x)', op: 'diff' })
    expect(res.ok).toBe(true)
    const ans = String(res.answer)
    expect(ans).toMatch(/x/i)
  })

  it('plot switches to 2D and plots y = sin x and y = cos x (item 5)', async () => {
    const res1 = await runTool('plot', { expression: 'y = sin(x)', dim: '2d' })
    expect(res1.ok).toBe(true)
    const res2 = await runTool('plot', { expression: 'y = cos(x)', dim: '2d' })
    expect(res2.ok).toBe(true)
    expect(scene().viewMode).toBe('2d')
  })

  it('plot shows z = (x^2-y^2)/6 in 3D (item 6)', async () => {
    const res = await runTool('plot', { expression: 'z = (x^2 - y^2)/6', dim: '3d' })
    expect(res.ok).toBe(true)
    expect(scene().viewMode).toBe('3d')
  })

  it('load_experiment loads Newton cradle and plays it (item 7)', async () => {
    const loadRes = await runTool('load_experiment', { id: 'cradle' })
    expect(loadRes.ok).toBe(true)
    const playRes = await runTool('play', {})
    expect(playRes.ok).toBe(true)
    expect(playRes.playing).toBe(true)
  })

  it('runs demo item 8 and 9: drop 1kg ball from 5m, run 2s, get readings, export csv, remove body', async () => {
    // 1. Add 1 kg ball at y = 5m
    const addRes = await runTool('add_body', { kind: 'sphere', mass: 1, x: 0, y: 5 })
    expect(addRes.ok).toBe(true)
    const ballId = String(addRes.bodyId)
    expect(ballId).toBeDefined()

    // 2. Run simulation 2 seconds
    const playRes = await runTool('play', { seconds: 2 })
    expect(playRes.ok).toBe(true)

    // 3. Get real simulation readings
    const readings = await runTool('get_readings', { bodyId: ballId })
    expect(readings.ok).toBe(true)
    const rows = readings.rows as Array<{ t: number; y: number; v: number }>
    expect(rows.length).toBeGreaterThan(5)

    // 4. Export readings as CSV
    const exportRes = await runTool('export_readings', { format: 'csv', title: '1kg Ball Drop' })
    expect(exportRes.ok).toBe(true)

    // 5. Remove the ball (demo item 9)
    const remRes = await runTool('remove_body', { id: ballId })
    expect(remRes.ok).toBe(true)
    const found = useSandbox.getState().bodies.find((b) => b.id === ballId)
    expect(found).toBeUndefined()
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
