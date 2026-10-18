// Tests for Part L3:
// 1. Dock tab headers hidden unless two tabs share one place.
// 2. Panels on the side only (no panels docked below or above).
// 3. Rounded corners on panels.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { panelHome } from '../src/renderer/src/app/layoutMath'
import { updateTabHeaderVisibility, preventTopBottomDrop } from '../src/renderer/src/app/layout'

interface FakeGroup {
  id: string
  panels: { id: string }[]
  header: { hidden: boolean }
}

function fakeGroup(id: string, panelIds: string[], initialHidden = false): FakeGroup {
  return {
    id,
    panels: panelIds.map((p) => ({ id: p })),
    header: { hidden: initialHidden }
  }
}

describe('Part L3: Dock tab headers hidden unless two tabs share one place', () => {
  it('hides header for single-panel groups', () => {
    const g1 = fakeGroup('g1', ['viewport'], false)
    const g2 = fakeGroup('g2', ['measure'], false)
    const api = { groups: [g1, g2] }

    updateTabHeaderVisibility(api as never)
    expect(g1.header.hidden).toBe(true)
    expect(g2.header.hidden).toBe(true)
  })

  it('shows header when two or more tabs share one group', () => {
    const g1 = fakeGroup('g1', ['viewport', 'maths'], true)
    const g2 = fakeGroup('g2', ['expressions', 'examples'], true)
    const api = { groups: [g1, g2] }

    updateTabHeaderVisibility(api as never)
    expect(g1.header.hidden).toBe(false)
    expect(g2.header.hidden).toBe(false)
  })

  it('updates header visibility when panels are added or removed from a group', () => {
    const g = fakeGroup('g', ['viewport'], false)
    const api = { groups: [g] }

    updateTabHeaderVisibility(api as never)
    expect(g.header.hidden).toBe(true)

    // Add a second tab to the group
    g.panels.push({ id: 'maths' })
    updateTabHeaderVisibility(api as never)
    expect(g.header.hidden).toBe(false)

    // Remove the second tab
    g.panels.pop()
    updateTabHeaderVisibility(api as never)
    expect(g.header.hidden).toBe(true)
  })
})

describe('Part L3: Panels on the side only', () => {
  it('assigns all standard and tool panels to left or right sides (or centre), never below', () => {
    expect(panelHome('viewport')).toBe('centre')
    expect(panelHome('maths')).toBe('centre')
    expect(panelHome('labdata')).toBe('centre')
    expect(panelHome('examples')).toBe('left')
    expect(panelHome('expressions')).toBe('left')
    expect(panelHome('outliner')).toBe('left')
    expect(panelHome('measure')).toBe('right')
    expect(panelHome('sandbox')).toBe('right')
    expect(panelHome('practice')).toBe('right')
    expect(panelHome('vectorcalc')).toBe('right')
    expect(panelHome('solver')).toBe('right')
    expect(panelHome('properties')).toBe('right')
    expect(panelHome('gpulab')).toBe('right')
    expect(panelHome('timeline')).toBe('right')
    expect(panelHome('graphs')).toBe('right')
  })

  it('prevents drag-and-drop docking to top or bottom positions', () => {
    let topPrevented = false
    let bottomPrevented = false
    let leftPrevented = false
    let rightPrevented = false
    let centerPrevented = false

    preventTopBottomDrop({ position: 'top', preventDefault: () => { topPrevented = true } } as never)
    preventTopBottomDrop({ position: 'bottom', preventDefault: () => { bottomPrevented = true } } as never)
    preventTopBottomDrop({ position: 'left', preventDefault: () => { leftPrevented = true } } as never)
    preventTopBottomDrop({ position: 'right', preventDefault: () => { rightPrevented = true } } as never)
    preventTopBottomDrop({ position: 'center', preventDefault: () => { centerPrevented = true } } as never)

    expect(topPrevented).toBe(true)
    expect(bottomPrevented).toBe(true)
    expect(leftPrevented).toBe(false)
    expect(rightPrevented).toBe(false)
    expect(centerPrevented).toBe(false)
  })

  it('showBeside docks to the right on wide screens, and below on narrow screens', async () => {
    const { showBeside, setDockApi } = await import('../src/renderer/src/app/panels')
    let addedDirection: string | undefined
    let movedPosition: string | undefined

    const besideGroup = { id: 'beside-group' }
    const fakeBeside = { id: 'maths', api: { group: besideGroup } }

    // Test 1: Narrow screen (e.g. 960 px), adding a new panel beside maths
    setDockApi({
      width: 960,
      height: 600,
      panels: [fakeBeside],
      getPanel: (id: string) => (id === 'maths' ? fakeBeside : undefined),
      addPanel: (options: { position?: { direction?: string } }) => {
        addedDirection = options.position?.direction
      }
    } as never)

    showBeside('viewport', 'maths')
    expect(addedDirection).toBe('below')

    // Test 2: Moving an existing panel from same group on narrow screen
    const sameGroupPanel = {
      id: 'viewport',
      api: {
        group: besideGroup,
        moveTo: (options: { position?: string }) => {
          movedPosition = options.position
        },
        setActive: () => {}
      }
    }
    setDockApi({
      width: 960,
      height: 600,
      panels: [fakeBeside, sameGroupPanel],
      getPanel: (id: string) => (id === 'maths' ? fakeBeside : id === 'viewport' ? sameGroupPanel : undefined)
    } as never)

    showBeside('viewport', 'maths')
    expect(movedPosition).toBe('bottom')

    // Test 3: Wide screen (e.g. 1600 px)
    setDockApi({
      width: 1600,
      height: 900,
      panels: [fakeBeside],
      getPanel: (id: string) => (id === 'maths' ? fakeBeside : undefined),
      addPanel: (options: { position?: { direction?: string } }) => {
        addedDirection = options.position?.direction
      }
    } as never)

    showBeside('viewport', 'maths')
    expect(addedDirection).toBe('right')
  })

  it('invalidates older layouts with version < 6 so pre-X9b panels rebuild to centre layout', async () => {
    const { LAYOUT_VERSION, needsLayoutRebuild } = await import('../src/renderer/src/app/layoutMath')
    expect(LAYOUT_VERSION).toBe(6)
    expect(needsLayoutRebuild({ v: 5, w: 1366, h: 768 }, { w: 1366, h: 768 })).toBe(true)
    expect(needsLayoutRebuild({ v: 4, w: 1366, h: 768 }, { w: 1366, h: 768 })).toBe(true)
    expect(needsLayoutRebuild({ v: 3, w: 1366, h: 768 }, { w: 1366, h: 768 })).toBe(true)
    expect(needsLayoutRebuild({ v: 6, w: 1366, h: 768 }, { w: 1366, h: 768 })).toBe(false)
  })
})

describe('Part L3: CSS rules for rounded panels and tab header suppression', () => {
  const css = readFileSync(resolve(__dirname, '../src/renderer/src/styles.css'), 'utf-8')

  it('suppresses single-tab dock headers via CSS', () => {
    expect(css).toMatch(/\.dv-tabs-and-actions-container:not\(:has\(\.dv-tab\s*~\s*\.dv-tab\)\)/)
  })

  it('defines rounded corners on dockview groupviews', () => {
    expect(css).toMatch(/\.dv-groupview[\s\S]*?border-radius:\s*(?:6px|7px|8px|10px)/)
  })
})
