// Fix 7 — tool labels ran into each other on Geometry's shelf at about 1350 px. The shelf's
// description line has a big flex basis, the buttons shrank with it down to their bare min-width
// (a set min-width removes the automatic "never below the content" floor), and "Perpendicular"
// hung 6 px out of each side of its 53 px button over Midpoint and Parallel. The two-word
// bisector labels wrapped and squeezed their icons to nothing. Measured in the running app at
// 1350 × 768 before the fix: Midpoint's label ended at x = 556, Perpendicular's began at 552.

import { describe, expect, it } from 'vitest'
import { MODES } from '../src/renderer/src/app/modes'
import { shelfMode, shelfWidth } from '../src/renderer/src/app/layoutMath'
import { shelfFitLabel, TOOLS } from '../src/renderer/src/render/tools'
import { readSource } from './helpers/repo'

/** The real shelf, as measured in the browser: 11 px Segoe UI (13 letters of "Perpendicular" = 66 px),
 *  4 px side padding and a 44 px floor at ≤ 1440 px (6 px and 50 px above), 2 px gaps, 13 px separators, 16 px padding. */
const REAL_CHAR = 66 / 13
function realWidth(tools: readonly string[], window: number): number {
  const pad = window <= 1440 ? 4 : 6
  const floor = window <= 1440 ? 44 : 50
  let w = 16
  for (const t of tools) {
    if (t === '|') w += 13 + 2
    else w += Math.max(floor, (TOOLS.find((x) => x.id === t)?.label.length ?? 0) * REAL_CHAR + 2 * pad) + 2
  }
  return w
}

const geometry = MODES.find((m) => m.id === 'shapes')!

describe('Fix 7: tool labels never overlap', () => {
  it('reads every label whole: the fit estimate sees a two-word label as one line', () => {
    expect(shelfFitLabel('perpBisector')).toBe('Perp._bisector')
    expect(shelfFitLabel('perpendicular')).toBe('Perpendicular')
    for (const t of TOOLS) expect(shelfFitLabel(t.id)?.length).toBe(t.label.length)
  })

  it('shows Geometry’s labels at the 1366 × 768 the README promises, and at 1350', () => {
    expect(shelfMode(1366, geometry.tools, shelfFitLabel)).toBe('full')
    expect(shelfMode(1350, geometry.tools, shelfFitLabel)).toBe('full')
    // And they really fit there, every button at its label's own width.
    expect(realWidth(geometry.tools, 1350)).toBeLessThanOrEqual(1350)
  })

  it('never claims labels fit where the real buttons would not, in any mode, from the 960 px minimum up', () => {
    for (const m of MODES) {
      for (let w = 960; w <= 1920; w += 2) {
        const mode = shelfMode(w, m.tools, shelfFitLabel)
        if (mode === 'full') expect(realWidth(m.tools, w), `${m.id} at ${w} px`).toBeLessThanOrEqual(w)
        // Icons only always fit the narrowest window the app allows (main/index.ts minWidth).
        if (mode === 'icons') expect(shelfWidth(m.tools, 'icons'), `${m.id} icons at ${w} px`).toBeLessThanOrEqual(w)
      }
    }
  })

  it('drops to icons, each named in full for a screen reader, when Geometry’s labels cannot fit', () => {
    expect(shelfMode(1100, geometry.tools, shelfFitLabel)).toBe('icons')
    expect(readSource('src/renderer/src/app/TopBar.tsx')).toMatch(/aria-label=\{label \? undefined : info\.label\}/)
  })

  it('keeps the stylesheet rules the estimate relies on: no shrinking, one line per label', () => {
    const css = readSource('src/renderer/src/app/shell.css')
    expect(css).toMatch(/\.toolshelf \.tool \{\s*flex-shrink: 0;\s*\}/)
    expect(css).toMatch(/\.toolshelf \.tool span \{\s*white-space: nowrap;/)
    expect(readSource('src/renderer/src/app/TopBar.tsx')).toMatch(/shelfMode\(width, def\.tools, shelfFitLabel\)/)
  })
})
