import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { valueColumnWidth, widthLabels } from '../src/renderer/src/panels/SliderDock'
import { sliderLabel } from '../src/renderer/src/panels/shellLogic'

// H13b (wave head's browser check of P-FIX-SHELL): at 4 d.p. "−12.3456" was 54 px in a 39 px box and ran over
// Play, power-of-ten labels wrapped onto 2–3 lines, and the name column shrank to 0–9 px so names vanished.
// vitest has no DOM: the width rule is tested directly, and the layout classes are read from the source.
const chOf = (w: string): number => Number(w.replace('ch', ''))

describe('H13b the slider value column fits its label', () => {
  it('is wider than the longest label, in characters', () => {
    const labels = [
      sliderLabel(-12.3456, 0.0001, { decimals: 4, precisionMode: 'dp' }),
      sliderLabel(1e12, 1, { decimals: 3, precisionMode: 'sf' }),
      sliderLabel(2, 1, { decimals: 2, precisionMode: 'dp' }),
    ]
    const width = chOf(valueColumnWidth(labels))
    for (const l of labels) expect(width, l).toBeGreaterThan([...l].length)
  })
  it('one width for every slider, so the columns line up', () => {
    expect(valueColumnWidth(['1', '−12.3456'])).toBe(valueColumnWidth(['−12.3456', '1']))
  })
  it('a short label still gets a sensible box', () => {
    expect(chOf(valueColumnWidth(['0']))).toBeGreaterThanOrEqual(2)
    expect(chOf(valueColumnWidth([]))).toBeGreaterThanOrEqual(2)
  })
  it('keeps one width while the slider is dragged (9.99 → 10 must not resize the dock under the pointer)', () => {
    const slider = { min: 0, max: 10, step: 0.01 }
    const s = { decimals: 2, precisionMode: 'dp' as const }
    const at = (v: number) => valueColumnWidth(widthLabels(v, slider, s))
    expect(at(9.99)).toBe(at(10))
    expect(at(0)).toBe(at(10))
    expect(at(-0.5)).not.toBe('')
  })
})

describe('H13b the dock layout never wraps a value or hides a name', () => {
  const src = readFileSync('src/renderer/src/panels/SliderDock.tsx', 'utf8')
  const valueSpan = /<span[^>]*tabular-nums[^>]*>/.exec(src)?.[0] ?? ''
  const nameSpan = /<span[^>]*font-math[^>]*>/.exec(src)?.[0] ?? ''
  it('the value never wraps and is sized from the labels, not a fixed w-12', () => {
    expect(valueSpan).toContain('whitespace-nowrap')
    expect(valueSpan).toContain('shrink-0')
    expect(valueSpan).not.toMatch(/\bw-12\b/)
    expect(valueSpan).toContain('valueWidth')
  })
  it('the name keeps a width of its own', () => {
    expect(nameSpan).toContain('shrink-0')
    expect(nameSpan).toMatch(/min-w-/)
  })
  it('the dock does not scroll sideways', () => {
    expect(src).toContain('overflow-x-hidden')
  })
})
