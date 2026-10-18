// X10 (wave head, 18 Oct; report 11.3): in the Light theme the 3-D floor's grid lines were nearly the colour of the floor
// (1.2:1 and 1.45:1 on the canvas), and thin lines seen at a slant fade further. The floor has its own grid colours now: darker
// in Light, the same as the 2-D grid in the three dark themes, which nobody found faint.

import { describe, expect, it } from 'vitest'
import { readSource } from './helpers/repo'

const css = readSource('src/renderer/src/styles.css')
const grid = readSource('src/renderer/src/render/Grid.tsx')

/** The custom properties of one theme block (the first rule whose selector is exactly `selector`). */
function themeBlock(selector: string): Record<string, string> {
  const at = css.indexOf(`${selector} {`)
  if (at < 0) throw new Error(`no ${selector} block`)
  const body = css.slice(at, css.indexOf('}', at))
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

/** WCAG contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('X10: the 3-D floor grid reads on the Light theme', () => {
  const light = themeBlock(":root[data-theme='light']")

  it('Light: the floor grid stands out from the floor (major at least 2:1, minor at least 1.4:1), and more than the 2-D grid did', () => {
    expect(contrast(light['--grid-3d-major'], light['--canvas-bg'])).toBeGreaterThanOrEqual(2)
    expect(contrast(light['--grid-3d-minor'], light['--canvas-bg'])).toBeGreaterThanOrEqual(1.4)
    expect(contrast(light['--grid-3d-major'], light['--canvas-bg'])).toBeGreaterThan(contrast(light['--grid-major'], light['--canvas-bg']))
  })

  it('…and stays calm: the major line is no darker than the theme’s faint text', () => {
    expect(contrast(light['--grid-3d-major'], light['--canvas-bg'])).toBeLessThanOrEqual(contrast(light['--text-faint'], light['--canvas-bg']))
  })

  it('the three dark themes keep their floor exactly as it was (the same colours as their 2-D grid)', () => {
    for (const sel of [':root', ":root[data-theme='moonlight']", ":root[data-theme='moongold']"]) {
      const t = themeBlock(sel)
      expect(t['--grid-3d-minor'], sel).toBe(t['--grid-minor'])
      expect(t['--grid-3d-major'], sel).toBe(t['--grid-major'])
    }
  })

  it('the 3-D floor and its walls draw with the floor colours; the 2-D grid keeps its own', () => {
    expect(grid).toMatch(/export function Grid3D\(\)[\s\S]{0,200}useGridLines\(true\)/)
    expect(grid).toMatch(/export function Grid2D\(\)[\s\S]{0,200}useGridLines\(\)/)
    expect(grid).toMatch(/function WallGrids[\s\S]{0,900}color: FLOOR_MINOR\(\)/)
    expect(grid).toMatch(/color\.set\(FLOOR_MINOR\(\)\)/)
  })
})
