import { describe, it, expect } from 'vitest'
import { ALWAYS_ON_MANUAL, MANUAL_BY_MODE, getModeManual } from '../src/renderer/src/ai/manual.generated'
import { runTool } from '../src/renderer/src/ai/tools'

describe('AI Manual System (Part 2 - ALWAYS_ON_MANUAL & getModeManual)', () => {
  it('ALWAYS_ON_MANUAL satisfies strict token and character limits (<12,000 chars / <3,000 tokens)', () => {
    expect(ALWAYS_ON_MANUAL).toBeDefined()
    expect(typeof ALWAYS_ON_MANUAL).toBe('string')
    expect(ALWAYS_ON_MANUAL.length).toBeGreaterThan(500)
    expect(ALWAYS_ON_MANUAL.length).toBeLessThan(12000)

    // Token estimate: ~3.5 to 4 characters per token
    const estimatedTokens = Math.ceil(ALWAYS_ON_MANUAL.length / 3.5)
    expect(estimatedTokens).toBeLessThan(3000)
  })

  it('ALWAYS_ON_MANUAL contains all 6 primary modes and critical tools', () => {
    expect(ALWAYS_ON_MANUAL).toContain('calculator')
    expect(ALWAYS_ON_MANUAL).toContain('graphing')
    expect(ALWAYS_ON_MANUAL).toContain('shapes')
    expect(ALWAYS_ON_MANUAL).toContain('vectors')
    expect(ALWAYS_ON_MANUAL).toContain('sandbox')
    expect(ALWAYS_ON_MANUAL).toContain('lab')

    expect(ALWAYS_ON_MANUAL).toContain('run_commands')
    expect(ALWAYS_ON_MANUAL).toContain('describe_screen')
    expect(ALWAYS_ON_MANUAL).toContain('manual')

    expect(ALWAYS_ON_MANUAL).toContain('plot')
    expect(ALWAYS_ON_MANUAL).toContain('midpoint')
    expect(ALWAYS_ON_MANUAL).toContain('resolve')
    expect(ALWAYS_ON_MANUAL).toContain('body')
    expect(ALWAYS_ON_MANUAL).toContain('table')
  })

  it('MANUAL_BY_MODE covers every mode with detailed command definitions', () => {
    const requiredModes = ['graphing', 'shapes', 'vectors', 'sandbox', 'calculator', 'pure', 'lab', 'view', 'app', 'all']
    for (const m of requiredModes) {
      const doc = MANUAL_BY_MODE[m]
      expect(doc, `MANUAL_BY_MODE should contain ${m}`).toBeDefined()
      expect(doc.length).toBeGreaterThan(100)
    }
  })

  it('getModeManual normalizes aliases correctly', () => {
    const geom1 = getModeManual('geometry')
    const geom2 = getModeManual('shapes')
    const geom3 = getModeManual('GEOM')
    expect(geom1).toContain('distance')
    expect(geom1).toContain('midpoint')
    expect(geom1).toEqual(geom2)
    expect(geom1).toEqual(geom3)

    const sb1 = getModeManual('sandbox')
    const sb2 = getModeManual('sim')
    const sb3 = getModeManual('physics')
    expect(sb1).toContain('body')
    expect(sb1).toContain('gravity')
    expect(sb1).toEqual(sb2)
    expect(sb1).toEqual(sb3)

    const lab1 = getModeManual('lab')
    const lab2 = getModeManual('data')
    expect(lab1).toContain('table')
    expect(lab1).toContain('fit')
    expect(lab1).toEqual(lab2)

    const graph = getModeManual('graphing')
    expect(graph).toContain('plot')
    expect(graph).toContain('roots')
    expect(graph).toContain('tangent')
  })

  it('runTool executes manual tool for specific modes', async () => {
    const resGeom = await runTool('manual', { mode: 'geometry' })
    expect(resGeom.ok).toBe(true)
    expect(resGeom.manual).toContain('perpendicular')
    expect(resGeom.manual).toContain('midpoint')

    const resSandbox = await runTool('manual', { mode: 'sandbox' })
    expect(resSandbox.ok).toBe(true)
    expect(resSandbox.manual).toContain('link')
    expect(resSandbox.manual).toContain('gravity')

    const resGraph = await runTool('manual', { mode: 'graphing' })
    expect(resGraph.ok).toBe(true)
    expect(resGraph.manual).toContain('plot')
    expect(resGraph.manual).toContain('roots')

    const resDefault = await runTool('manual', {})
    expect(resDefault.ok).toBe(true)
    expect(resDefault.manual).toBeDefined()
  })
})
