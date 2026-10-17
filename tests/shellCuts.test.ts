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
import { buildItems, searchPlaceholder } from '../src/renderer/src/app/SearchPalette'
import { CATALOG } from '../src/renderer/src/app/CommandBar'
import { SHOW_COMMAND_BAR } from '../src/renderer/src/app/shellFlags'
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
    // The bar and the Console are hidden, so a Commands row would run a line whose answer has nowhere to show.
    expect(groups).not.toContain('Commands')
    expect(groups).toContain('Settings')

    const modeTitles = items.filter((i) => i.group === 'Modes').map((i) => i.title)
    expect(modeTitles).not.toContain('GPU Lab')
    expect(modeTitles).toContain('Problem Sets')

    const panelTitles = items.filter((i) => i.group === 'Panels').map((i) => i.title)
    expect(panelTitles).not.toContain('Console')
    expect(panelTitles).not.toContain('GPU Lab')
  })

  // SHELLFIX: Ctrl+K used to list a Commands group that ran a typed line while the command bar and the
  // Console were both hidden, so a student picked "solve(x^2 = 4)" and saw nothing happen.
  it('Ctrl+K offers no Commands rows while the command bar is hidden, and every other row stays', () => {
    expect(SHOW_COMMAND_BAR).toBe(false)
    const shown = buildItems()
    expect(shown.some((i) => i.group === 'Commands')).toBe(false)
    // The group is only gated: turn the bar on and every catalogue line is back.
    const withBar = buildItems(true)
    const commandRows = withBar.filter((i) => i.group === 'Commands')
    expect(CATALOG.length).toBeGreaterThan(0)
    expect(commandRows.map((i) => i.title)).toEqual(CATALOG.map((c) => c.insert))
    // Nothing else is lost: the two lists differ by exactly the Commands rows.
    expect(withBar.filter((i) => i.group !== 'Commands').map((i) => `${i.group}/${i.title}`)).toEqual(shown.map((i) => `${i.group}/${i.title}`))
  })

  it('the search box does not promise commands while the bar is hidden', () => {
    expect(searchPlaceholder(false)).not.toMatch(/command/i)
    expect(searchPlaceholder(true)).toMatch(/commands/)
    expect(searchPlaceholder(SHOW_COMMAND_BAR)).toBe(searchPlaceholder(false))
    for (const word of ['modes', 'tools', 'examples', 'settings']) expect(searchPlaceholder(false), word).toContain(word)
  })

  it('the palette and App.tsx follow the same switch for the bar', () => {
    const app = readSource('src/renderer/src/app/App.tsx')
    const local = app.match(/const SHOW_COMMAND_BAR = (true|false)/)
    // Either App.tsx still holds the literal (then it must agree), or it imports the shared one.
    if (local) expect(local[1]).toBe(String(SHOW_COMMAND_BAR))
    else expect(app).toMatch(/import \{[^}]*\bSHOW_COMMAND_BAR\b[^}]*\} from '\.\/shellFlags'/)
    const palette = readSource('src/renderer/src/app/SearchPalette.tsx')
    expect(palette).toMatch(/import \{ SHOW_COMMAND_BAR \} from '\.\/shellFlags'/)
    // SearchPalette must never import App: App imports the palette (the cycle AGENTS.md warns about).
    expect(palette).not.toMatch(/from '\.\/App'/)
  })
})
