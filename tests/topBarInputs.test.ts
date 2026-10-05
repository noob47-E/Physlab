// Top-bar number boxes and the Ctrl+K palette (batch SC): precision 0 in s.f. mode, the grid-scale
// box that snapped back to 1 while typing a decimal, "hide grid" finding the Axes row, and the
// drawing tools opening the Calculator over the drawing.

import { describe, expect, it } from 'vitest'
import { clampPrecision, scaleFromText } from '../src/renderer/src/app/topBarInputs'

describe('precision box', () => {
  it('refuses 0 and a cleared box in significant-figure mode (one figure at least)', () => {
    expect(clampPrecision(0, 'sf')).toBe(1)
    expect(clampPrecision(Number(''), 'sf')).toBe(1)
    expect(clampPrecision(Number('abc'), 'sf')).toBe(1)
  })
  it('keeps 0 in decimal-places mode and caps at 12', () => {
    expect(clampPrecision(0, 'dp')).toBe(0)
    expect(clampPrecision(3.4, 'dp')).toBe(3)
    expect(clampPrecision(99, 'sf')).toBe(12)
  })
})

describe('grid-scale box', () => {
  it('typing 0, 0., 0.5 never commits 0 and ends at 0.5', () => {
    let committed = 1
    for (const typed of ['0', '0.', '0.5']) {
      const c = scaleFromText(typed)
      if (c !== null) committed = c
    }
    expect(committed).toBe(0.5)
  })
  it('typing .5 (via ".") ends at 0.5; empty and lone dot commit nothing', () => {
    expect(scaleFromText('')).toBeNull()
    expect(scaleFromText('.')).toBeNull()
    expect(scaleFromText('0')).toBeNull()
    expect(scaleFromText('-2')).toBeNull()
    expect(scaleFromText('.5')).toBe(0.5)
    expect(scaleFromText('2.5')).toBe(2.5)
    expect(scaleFromText('1e999')).toBeNull()
  })
})

describe('Ctrl+K palette', () => {
  // Loading the palette pulls in much of the app (~3 s alone), so on a busy machine the 5 s default
  // timed out in merge gates: the rows are built once, and the test gets the same 30 s as questionPlayer.
  it('"hide grid" ranks Grid: off first, "show grid" finds grid rows', async () => {
    const { buildItems, score } = await import('../src/renderer/src/app/SearchPalette')
    const items = buildItems()
    const rank = (q: string) =>
      items
        .map((i) => ({ i, s: score(i, q) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s)
    expect(rank('hide grid')[0]?.i.title).toBe('Grid: off')
    const show = rank('show grid').map((r) => r.i.title)
    expect(show.some((t) => t.startsWith('Grid') || t === 'Toggle grid')).toBe(true)
  }, 30000)
  it('Point, Measure and Delete never open the Calculator (its Maths screen covers the drawing)', async () => {
    const { modeForTool } = await import('../src/renderer/src/app/SearchPalette')
    for (const t of ['point', 'distance', 'delete'] as const) {
      for (const cur of ['sandbox', 'gpu', 'lab', 'calculator', 'vectors'] as const) {
        const m = modeForTool(t, cur)
        expect(m, `${t} from ${cur}`).not.toBe('calculator')
      }
    }
    expect(modeForTool('point', 'sandbox')).toBe('vectors')
    expect(modeForTool('point', 'shapes')).toBeNull() // already has it: stay
  })
})
