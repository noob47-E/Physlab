import { describe, it, expect, beforeEach } from 'vitest'
import { describeScreen, fmtSig } from '../src/renderer/src/ai/describeScreen'
import { runTool } from '../src/renderer/src/ai/tools'
import { scene } from '../src/renderer/src/core/store'
import { Builder } from '../src/renderer/src/core/factory'
import { enterMode } from '../src/renderer/src/app/layout'
import { useCalc } from '../src/renderer/src/calc/calcStore'
import { usePure } from '../src/renderer/src/math/pure/store'
import { useSandbox } from '../src/renderer/src/sim/store'
import { useLab, emptyTable } from '../src/renderer/src/lab/labStore'
import { runCommand } from '../src/renderer/src/lang/commands'

describe('Eyes - describeScreen tool (src/renderer/src/ai/describeScreen.ts)', () => {
  beforeEach(() => {
    scene().newScene()
    useCalc.setState({ input: '', ans: 0, history: [] })
    usePure.setState({ working: null as any })
    useSandbox.getState().resetRun()
    useLab.getState().setTables([])
  })

  it('fmtSig formats numbers to 3 significant figures accurately', () => {
    expect(fmtSig(0)).toBe('0')
    expect(fmtSig(9.81)).toBe('9.81')
    expect(fmtSig(12.3456)).toMatch(/12\.3/)
    expect(fmtSig(0.004567)).toMatch(/0\.00457|4\.57/)
  })

  it('describes Calculator mode with input, answer, and history', () => {
    enterMode('calculator')
    useCalc.setState({
      input: 'x^2 - 5x + 6 = 0',
      ans: 2,
      history: [{ input: '2 + 2', result: '4', mode: 'COMP' }]
    })
    usePure.setState({
      working: {
        answers: [{ tex: 'x = 2, x = 3' }]
      } as any
    })

    const text = describeScreen('calculator')
    expect(text).toContain('Mode: calculator')
    expect(text).toContain('Input: x^2 - 5x + 6 = 0')
    expect(text).toContain('Answer: x = 2, x = 3')
    expect(text).toContain('Angle: deg')
    expect(text).toContain('2 + 2 = 4')
  })

  it('describes Graphing mode with curves, sliders, and points', async () => {
    enterMode('graphing')
    await runCommand('y = x^2 - 4')
    await runCommand('a = 3.5')
    await runCommand('P = (2, 0)')

    const text = describeScreen('graphing')
    expect(text).toContain('Mode: graphing')
    expect(text).toContain('Curve')
    expect(text).toContain('x^2 - 4')
    expect(text).toContain('Number/Slider a')
    expect(text).toContain('3.5')
    expect(text).toContain('Point P')
    expect(text).toContain('(2.00, 0)')
  })

  it('describes Geometry mode with points, segments, and polygons', async () => {
    enterMode('shapes')
    await runCommand('A = (0, 0)')
    await runCommand('B = (4, 0)')
    await runCommand('C = (0, 3)')
    await runCommand('s = Segment(A, B)')

    const text = describeScreen('shapes')
    expect(text).toContain('Mode: shapes')
    expect(text).toContain('Point A')
    expect(text).toContain('Point B')
    expect(text).toContain('Segment s')
    expect(text).toContain('endpoints (A, B)')
  })

  it('describes Vectors mode with components and magnitudes', async () => {
    enterMode('vectors')
    await runCommand('u = <3, 4>')

    const text = describeScreen('vectors')
    expect(text).toContain('Mode: vectors')
    expect(text).toContain('Vector u')
    expect(text).toContain('<3.00, 4.00>')
    expect(text).toContain('magnitude = 5.00')
  })

  it('describes Sandbox mode with simulation state, world settings, and bodies', async () => {
    enterMode('sandbox')
    const sb = useSandbox.getState()
    sb.resetRun()
    const b = sb.addBody('sphere', [0, 5, 0])
    sb.updateBody(b.id, { name: 'BowlingBall', mass: 10, velocity: [0, -2, 0] })
    sb.setWorld({ gravity: 9.81 })

    const text = describeScreen('sandbox')
    expect(text).toContain('Mode: sandbox')
    expect(text).toContain('Simulation: paused')
    expect(text).toContain('gravity = 9.81 m/s²')
    expect(text).toContain('floor = enabled')
    expect(text).toContain('Body "BowlingBall" (sphere)')
    expect(text).toContain('mass = 10.0 kg')
    expect(text).toContain('pos = (0, 5.00)')
    expect(text).toMatch(/vel = <0, [−-]2\.00>/)
  })

  it('describes Lab Data mode with tables, columns, and rows', () => {
    enterMode('lab')
    const lab = useLab.getState()
    const t = emptyTable('Pendulum Data')
    lab.setTables([t])

    const text = describeScreen('lab')
    expect(text).toContain('Mode: lab')
    expect(text).toContain('Tables (1)')
    expect(text).toContain('Pendulum Data')
    expect(text).toContain('t')
  })

  it('filters objects correctly by search term', async () => {
    enterMode('shapes')
    await runCommand('Alpha = (1, 2)')
    await runCommand('Beta = (3, 4)')
    await runCommand('Gamma = (5, 6)')

    const filtered = describeScreen('shapes', 'alpha')
    expect(filtered).toContain('Alpha')
    expect(filtered).not.toContain('Beta')
    expect(filtered).not.toContain('Gamma')

    const none = describeScreen('shapes', 'nonexistent')
    expect(none).toContain('(no objects match filter "nonexistent")')
  })

  it('handles scenes with >40 objects by summarizing and allowing filter', () => {
    enterMode('shapes')
    const b = new Builder()
    for (let i = 1; i <= 45; i++) {
      b.point([i, i, 0], { name: `Pt${i}` })
    }
    b.commit()

    const full = describeScreen('shapes')
    expect(full).toContain('Objects (45 total: 45 points):')
    expect(full).toContain('Showing first 15 objects')
    expect(full).toContain('[...30 more objects omitted]')

    // Filtering finds specific point
    const filtered = describeScreen('shapes', 'pt42')
    expect(filtered).toContain('Point Pt42')
  })

  it('runs describe_screen tool through runTool registry', async () => {
    enterMode('graphing')
    await runCommand('y = 2*x + 1')

    const res = await runTool('describe_screen', { mode: 'graphing' })
    expect(res.ok).toBe(true)
    expect(res.screen).toBeDefined()
    expect(typeof res.screen).toBe('string')
    expect(res.screen).toContain('Mode: graphing')
    expect(res.screen).toContain('2*x + 1')
  })

  it('run_commands attaches describe_screen automatically and reports created/changed', async () => {
    enterMode('graphing')
    const res = await runTool('run_commands', {
      mode: 'graphing',
      commands: ['y = cos(x)', 'P = (1, 2)']
    })

    expect(res.ok).toBe(true)
    expect(res.screen).toBeDefined()
    expect(typeof res.screen).toBe('string')
    expect(res.screen).toContain('cos(x)')
    expect(res.screen).toContain('Point P')
    expect(res.created).toBeDefined()
    expect((res.created as any[]).length).toBeGreaterThan(0)
  })

  it('run_commands on error attaches screen description and failures array', async () => {
    enterMode('graphing')
    const res = await runTool('run_commands', {
      mode: 'graphing',
      commands: ['invalid_gibberish_syntax%%%&&&']
    })

    expect(res.ok).toBe(false)
    expect(res.screen).toBeDefined()
    expect(res.failures).toBeDefined()
    expect(Array.isArray(res.failures)).toBe(true)
  })
})
