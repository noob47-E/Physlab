// C-shell cuts tests:
// 1. Top command bar and its status line removed from student view (Ctrl+K stays)
// 2. Search button in top bar removed
// 3. GPU Lab mode hidden
// 4. Console panel hidden
// 5. All 8 "coming soon" items hidden
// 6. Problem Sets in main mode list right after Sandbox (P3)

import { describe, expect, it } from 'vitest'
import { comingSoonModes, isModeHidden, readyModes } from '../src/renderer/src/app/modes'
import { isPanelHidden, PANEL_LIST } from '../src/renderer/src/app/panels'
import { buildItems } from '../src/renderer/src/app/SearchPalette'
import { readSource } from './helpers/repo'

describe('C-shell cuts (Phase 0.9)', () => {
  it('readyModes excludes gpu and puts problems right after sandbox', () => {
    const ready = readyModes().map((m) => m.id)
    expect(ready).not.toContain('gpu')
    expect(isModeHidden('gpu')).toBe(true)
    expect(ready).toEqual(['calculator', 'vectors', 'shapes', 'graphing', 'sandbox', 'problems', 'lab'])
  })

  it('all 8 coming soon modes are hidden, so comingSoonModes is empty', () => {
    expect(comingSoonModes()).toEqual([])
    for (const id of ['proofs', 'mechanics', 'instruments', 'electricity', 'optics', 'waves', 'heat', 'nuclear'] as const) {
      expect(isModeHidden(id), id).toBe(true)
    }
  })

  it('console and gpulab panels are hidden from student view', () => {
    expect(isPanelHidden('console')).toBe(true)
    expect(isPanelHidden('gpulab')).toBe(true)
    const panelIds = PANEL_LIST.map((p) => p.id)
    expect(panelIds).not.toContain('console')
    expect(panelIds).not.toContain('gpulab')
  })

  it('Search button is removed from TopBar.tsx', () => {
    const topBar = readSource('src/renderer/src/app/TopBar.tsx')
    expect(topBar).not.toMatch(/data-tour="search"/)
    expect(topBar).not.toMatch(/title="Search everything \(Ctrl\+K\)"/)
  })

  it('CommandBar is not rendered in App.tsx', () => {
    const app = readSource('src/renderer/src/app/App.tsx')
    // CommandBar shouldn't be unconditionally rendered in the JSX tree
    expect(app).not.toMatch(/<ToolShelf \/>\s*<CommandBar \/>/)
  })

  it('Ctrl+K search palette stays functional and excludes hidden modes and panels', () => {
    const items = buildItems()
    const groups = new Set(items.map((i) => i.group))
    expect(groups).toContain('Modes')
    expect(groups).toContain('Tools')
    expect(groups).toContain('Panels')
    expect(groups).toContain('Commands')
    expect(groups).toContain('Settings')

    const modeTitles = items.filter((i) => i.group === 'Modes').map((i) => i.title)
    expect(modeTitles).not.toContain('GPU Lab')
    expect(modeTitles).toContain('Problem Sets')

    const panelTitles = items.filter((i) => i.group === 'Panels').map((i) => i.title)
    expect(panelTitles).not.toContain('Console')
    expect(panelTitles).not.toContain('GPU Lab')
  })
})
