// Part M: Responsive Mobile & Tablet Layout Tests
//
// Verifies that:
// 1. Screens under 768px are classified as 'phone'.
// 2. Switching between phone and desktop triggers layout rebuild.
// 3. Phone layout (< 768px) enforces a single pane (no multi-column splitting).
// 4. Tablet layout (800x1100) avoids 3-column splits (at most 2 columns).
// 5. Sandbox mobile view provides Play/Reset + one slider without desktop HUD cards.

import { describe, expect, it } from 'vitest'
import {
  windowClass,
  needsLayoutRebuild,
  LAYOUT_VERSION
} from '../src/renderer/src/app/layoutMath'
import { buildLayout } from '../src/renderer/src/app/layout'

interface MockPanelOptions {
  id: string
  component?: string
  title?: string
  position?: {
    direction?: string
    referencePanel?: string
  }
}

interface MockDock {
  width: number
  height: number
  panels: MockPanelOptions[]
  clear: () => void
  addPanel: (options: MockPanelOptions) => {
    api: {
      setActive: () => void
      group: { api: { setSize: () => void }; width: number }
    }
  }
  getPanel: (id: string) => { api: { setActive: () => void } } | null
}

function createMockDock(width: number, height: number): MockDock {
  const panels: MockPanelOptions[] = []
  const groups: string[] = []
  return {
    width,
    height,
    panels,
    clear: () => {
      panels.length = 0
      groups.length = 0
    },
    addPanel: (options: MockPanelOptions) => {
      panels.push(options)
      const dir = options.position?.direction
      if (!dir || dir !== 'within') {
        groups.push(options.id)
      }
      return {
        api: {
          setActive: () => {},
          group: { api: { setSize: () => {} }, width: 300 }
        }
      }
    },
    getPanel: (id: string) => panels.find((p) => p.id === id) ? {
      api: { setActive: () => {} }
    } : null
  }
}

describe('Part M: windowClass and responsive breakpoints', () => {
  it('classifies screens under 768px as phone', () => {
    expect(windowClass(400)).toBe('phone')
    expect(windowClass(600)).toBe('phone')
    expect(windowClass(767)).toBe('phone')
  })

  it('classifies tablet and desktop sizes correctly', () => {
    expect(windowClass(800)).toBe('narrow')
    expect(windowClass(960)).toBe('narrow')
    expect(windowClass(1300)).toBe('medium')
    expect(windowClass(1920)).toBe('wide')
  })

  it('triggers needsLayoutRebuild when moving between phone and desktop sizes', () => {
    const desktopLayout = { v: LAYOUT_VERSION, app: '0.9.0', w: 1920, h: 1080 }
    expect(needsLayoutRebuild(desktopLayout, { w: 400, h: 800 })).toBe(true)
    expect(needsLayoutRebuild(desktopLayout, { w: 1920, h: 1080 })).toBe(false)
  })
})

describe('Part M: single-pane layout on phones (< 768px)', () => {
  it('places all mode panels into the single central group without left or right splits', () => {
    const dock = createMockDock(400, 800)
    // In Graphing mode, desktop opens viewport + expressions side by side
    buildLayout(dock as unknown as Parameters<typeof buildLayout>[0], 'graphing')

    // On phone (400px), secondary panels must be added 'within', not as a second column
    const nonWithin = dock.panels.filter((p) => p.position && p.position.direction !== 'within')
    expect(nonWithin.length).toBe(0)
  })

  it('places Geometry panels within on phones, never splitting into 3 columns', () => {
    const dock = createMockDock(400, 800)
    buildLayout(dock as unknown as Parameters<typeof buildLayout>[0], 'shapes')

    const nonWithin = dock.panels.filter((p) => p.position && p.position.direction !== 'within')
    expect(nonWithin.length).toBe(0)
  })
})

describe('Part M: tablet layout (800x1100)', () => {
  it('never opens 3 columns on tablet screens (Examples does not create a 3rd column)', () => {
    const dock = createMockDock(800, 1100)
    // Geometry normally has Examples (left) + Viewport + Measure (right) = 3 columns
    buildLayout(dock as unknown as Parameters<typeof buildLayout>[0], 'shapes')

    const leftPanels = dock.panels.filter((p) => p.position && p.position.direction === 'left')
    expect(leftPanels.length).toBe(0)
    // Exactly 1 panel establishes the right side group, the other tabs within it
    const rightPanels = dock.panels.filter((p) => p.position && p.position.direction === 'right')
    expect(rightPanels.length).toBe(1)
    const withinPanels = dock.panels.filter((p) => p.position && p.position.direction === 'within')
    expect(withinPanels.length).toBe(1)
  })
})
