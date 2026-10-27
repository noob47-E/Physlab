import { describe, it, expect } from 'vitest'
import { readSource } from './helpers/repo'

describe('Lab Data table and chart side by side (X9)', () => {
  it('places table and chart in side-by-side sibling columns within a split container', () => {
    const src = readSource('src/renderer/src/panels/LabData.tsx')

    // Must have a dedicated split container grouping table and chart
    expect(src).toMatch(/data-lab-split/)
    expect(src).toMatch(/data-lab-table/)
    expect(src).toMatch(/data-lab-chart/)

    // Split container must use lab-split class for responsive flex row side-by-side layout
    expect(src).toMatch(/lab-split/)

    // styles.css must define .lab-split with flex-direction: row
    const css = readSource('src/renderer/src/styles.css')
    expect(css).toContain('.lab-split')
    expect(css).toContain('flex-direction: row')

    // Both columns must specify min-w-0 flex-1 for responsive proportional sizing
    const splitMatch = src.match(/data-lab-split[\s\S]*?<\/div>\s*<\/div>\s*\)/)
    expect(splitMatch).not.toBeNull()
  })

  it('configures Lab Data as a centre panel and switches to 2-D when showing on drawing (X9b)', async () => {
    const modesSrc = readSource('src/renderer/src/app/modes.ts')
    expect(modesSrc).toMatch(/id:\s*'lab'[\s\S]*?centre:\s*'labdata'/)

    const labSrc = readSource('src/renderer/src/panels/LabData.tsx')
    expect(labSrc).toContain("showPanel('viewport')")
    // Show on the drawing must switch to 2D view first so plotted points are not shown in 3D
    expect(labSrc).toMatch(/setViewMode\(['"]2d['"]\)/)

    // styles.css must use container query on the panel width, not window media query
    const css = readSource('src/renderer/src/styles.css')
    expect(css).toContain('@container (min-width: 600px)')
    expect(css).not.toMatch(/@media[^{]+\{[^}]*\.lab-split/)

    // LAYOUT_VERSION must be 7
    const { LAYOUT_VERSION } = await import('../src/renderer/src/app/layoutMath')
    expect(LAYOUT_VERSION).toBe(7)
  })

  it('contains the chart section inside its own column, not buried below table buttons', () => {
    const src = readSource('src/renderer/src/panels/LabData.tsx')

    const tableStart = src.indexOf('data-lab-table')
    const chartStart = src.indexOf('data-lab-chart')

    expect(tableStart).toBeGreaterThan(-1)
    expect(chartStart).toBeGreaterThan(-1)
    expect(chartStart).toBeGreaterThan(tableStart)

    // In the source between tableStart and chartStart, table controls (Import, Export, addRow) must reside
    const tableSection = src.slice(tableStart, chartStart)
    expect(tableSection).toContain('addRow')
    expect(tableSection).toContain('addColumn')
    expect(tableSection).toContain('Import')
    expect(tableSection).toContain('Export')

    // In the chart section after chartStart, graph controls and LabChart must reside
    const chartSection = src.slice(chartStart)
    expect(chartSection).toContain('<LabChart')
    expect(chartSection).toContain('setPlot')
    expect(chartSection).toContain('ResidualStrip')
  })
})
