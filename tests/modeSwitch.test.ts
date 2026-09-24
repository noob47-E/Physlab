// Fix 13 — two navigation styles. Confirmed in 0.7.0: TopBar drew a row of mode tabs at 1500 px
// and wider (barDensity 'full') and swapped it for a single "Mode ▾" dropdown below that, so a
// monitor and a 1366 px laptop showed two different designs. Now there is one family at every
// width: tabs for as many modes as fit, the rest in "More modes", the open mode always a tab.

import { describe, expect, it } from 'vitest'
import { MODES } from '../src/renderer/src/app/modes'
import { MODE_MORE_W, MODE_TAB_GAP, modeTabs, modeTabWidth } from '../src/renderer/src/app/modeSwitch'
import { readSource } from './helpers/repo'

const ready = MODES.filter((m) => m.ready)
const labels = ready.map((m) => m.label)
const idx = (id: string) => ready.findIndex((m) => m.id === id)
/** Real tab widths measured in the app at 1920 px (13 px Segoe UI, 11 px padding). */
/** The same tabs measured at 1366 × 768 (8 px padding at 1440 px and below), and the More modes button. */
// Question Author (added by 0.9-AUTH after these were measured) is its 13 px Segoe UI text width,
// 95.2 px, plus the padding — the same sum gives every measured tab above to 0.1 px.
const MEASURED_1366: Record<string, number> = { Calculator: 74, Vectors: 59, Geometry: 73, Graphing: 70, Sandbox: 66, 'GPU Lab': 66, 'Lab Data': 67, 'Problem Sets': 92, 'Question Author': 112 }
const MEASURED_1366_MORE = 104
const MEASURED: Record<string, number> = { Calculator: 79.5, Vectors: 64.1, Geometry: 78.5, Graphing: 75.2, Sandbox: 71.8, 'GPU Lab': 71.1, 'Lab Data': 72.7, 'Problem Sets': 97.4, 'Question Author': 117.2 }

describe('Fix 13: one way to switch modes', () => {
  it('shows every mode as a tab when there is room, and before the bar is measured', () => {
    const all = ready.map((_, i) => i)
    expect(modeTabs(0, labels, 0)).toEqual({ tabs: all, more: [] })
    expect(modeTabs(1268, labels, idx('shapes'))).toEqual({ tabs: all, more: [] })
  })

  it('folds the tabs that do not fit into More modes, in order, keeping the open mode a tab', () => {
    // The room 0.7.0 left at 960 px was about 250 px: two tabs and the menu.
    const narrow = modeTabs(330, labels, idx('lab'))
    expect(narrow.tabs).toContain(idx('lab'))
    expect([...narrow.tabs, ...narrow.more].sort((a, b) => a - b)).toEqual(ready.map((_, i) => i))
    expect(narrow.tabs).toEqual([...narrow.tabs].sort((a, b) => a - b))
    expect(narrow.more).toEqual([...narrow.more].sort((a, b) => a - b))
    // The tabs taken still fit beside the More button.
    const used = narrow.tabs.reduce((w, i) => w + modeTabWidth(labels[i]) + MODE_TAB_GAP, 0)
    expect(used + MODE_MORE_W).toBeLessThanOrEqual(330)
  })

  it('keeps the open mode even when nothing else fits', () => {
    const tiny = modeTabs(60, labels, idx('problems'))
    expect(tiny.tabs).toEqual([idx('problems')])
    expect(tiny.more).not.toContain(idx('problems'))
  })

  it('never estimates a tab narrower than the app draws it', () => {
    for (const [label, w] of Object.entries(MEASURED)) expect(modeTabWidth(label), label).toBeGreaterThanOrEqual(w)
    for (const l of labels) expect(MEASURED[l], `${l} was measured`).toBeDefined()
  })

  it('at 1366 px, measured as drawn, every student mode is a tab and only Question Author folds into More (the estimate alone folded Problem Sets away too)', () => {
    // Measured in the app at 1366 × 768: 8 px padding at 1440 px and below; the modes box is 760 px.
    const at1366 = { tabs: labels.map((l) => MEASURED_1366[l]), more: MEASURED_1366_MORE }
    for (const l of labels) expect(MEASURED_1366[l], `${l} was measured at 1366 px`).toBeDefined()
    const all = ready.map((_, i) => i)
    expect(modeTabs(760, labels, idx('calculator'), at1366)).toEqual({ tabs: all.filter((i) => i !== idx('author')), more: [idx('author')] })
    expect(modeTabs(760, labels, idx('calculator')).more).toEqual([idx('problems'), idx('author')])
    // A teacher in Question Author keeps it as a tab; Problem Sets makes room for it.
    expect(modeTabs(760, labels, idx('author'), at1366)).toEqual({ tabs: all.filter((i) => i !== idx('problems')), more: [idx('problems')] })
    // 1180 px leaves a 574 px box: six tabs, and Lab Data (70.7 px with its gap) would not fit in the 51 px left.
    expect(modeTabs(574, labels, idx('calculator'), at1366).tabs).toEqual(all.slice(0, 6))
    // The tabs taken and the More button never run past the box.
    for (const room of [300, 450, 574, 684, 760]) {
      const { tabs } = modeTabs(room, labels, idx('calculator'), at1366)
      expect(tabs.reduce((w, i) => w + at1366.tabs[i] + MODE_TAB_GAP, 0) + at1366.more, `${room} px`).toBeLessThanOrEqual(room)
    }
  })

  it('falls back to the estimate for a width not measured yet', () => {
    const partial = { tabs: labels.map((l, i) => (i === idx('problems') ? 0 : MEASURED_1366[l])), more: 0 }
    const used = (tabs: number[]) => tabs.reduce((w, i) => w + (partial.tabs[i] || modeTabWidth(labels[i])) + MODE_TAB_GAP, 0)
    const { tabs } = modeTabs(700, labels, idx('calculator'), partial)
    expect(used(tabs) + MODE_MORE_W).toBeLessThanOrEqual(700)
  })

  it('TopBar measures each tab and the More button in a hidden row drawn with their own classes', () => {
    const bar = readSource('src/renderer/src/app/TopBar.tsx')
    expect(bar).toMatch(/modeTabs\(modesWidth, [^\n]*, measured\)/)
    expect(bar).toMatch(/className="mode-measure" aria-hidden="true"/)
    expect(bar).toMatch(/tabIndex=\{-1\} className="mode-tab"/)
    expect(bar).toMatch(/tabIndex=\{-1\} className="menu-btn"/)
  })

  it('is one control family in the bar: no width-switched "Mode" dropdown is left', () => {
    const bar = readSource('src/renderer/src/app/TopBar.tsx')
    expect(bar).toMatch(/modeTabs\(modesWidth, /)
    expect(bar).not.toMatch(/density === 'full' \? \(/)
    expect(bar).not.toMatch(/>Mode<\/span>/)
    expect(bar).toMatch(/More modes/)
  })
})
