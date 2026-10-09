// P-GCALC GC5: Expressions is Graphing's own panel and the Console opens only from the View menu.
// The owner saw the Console under the drawing in Geometry too: enterMode never closes the last
// mode's panel, so a Console opened by Graphing stayed. No mode opens it now, and the layout
// version bump rebuilds the saved layouts that still hold it.

import { describe, expect, it } from 'vitest'
import { LAYOUT_VERSION, needsLayoutRebuild, panelHome, panelsForMode } from '../src/renderer/src/app/layoutMath'
import { MODES } from '../src/renderer/src/app/modes'
import { PANEL_LIST, PANEL_TITLES } from '../src/renderer/src/app/panels'
import { readSource } from './helpers/repo'

describe('the Console is closed by default', () => {
  it('no mode opens it', () => {
    for (const m of MODES) expect(panelsForMode(m), m.id).not.toContain('console')
  })

  it('the View menu still lists it, so it can be opened', () => {
    expect(PANEL_LIST.map((p) => p.id)).toContain('console')
  })

  it('a layout saved before (version 3) is rebuilt once', () => {
    expect(LAYOUT_VERSION).toBe(4)
    expect(needsLayoutRebuild({ v: 3, app: '0.9', w: 1920, h: 1080 }, { w: 1920, h: 1080 })).toBe(true)
  })
})

describe('Expressions is Graphing\'s own panel', () => {
  it('Graphing opens it, on the left of the drawing', () => {
    const graphing = MODES.find((m) => m.id === 'graphing')!
    expect(panelsForMode(graphing)).toContain('expressions')
    expect(panelHome('expressions')).toBe('left')
    expect(PANEL_TITLES.expressions).toBe('Expressions')
  })

  it('the panel is registered, loaded with its mode', () => {
    expect(readSource('src/renderer/src/app/App.tsx')).toMatch(/expressions: Expressions,/)
    expect(readSource('src/renderer/src/app/App.tsx')).toContain("import('../panels/Expressions')")
  })
})
