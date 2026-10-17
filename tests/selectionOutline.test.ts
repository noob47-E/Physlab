// L4: selection = thin grey outline (light themes) / thin white (dark), never thick yellow
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RENDERER_SRC } from './helpers/repo'
import { BLOCKS, THEME_CSS as css, themeBlock, tokenValue } from './helpers/theme'

describe('L4: selection outline styling and drawing', () => {
  it('uses thin white for dark themes and thin grey for light themes, never yellow', () => {
    const moonlight = tokenValue(themeBlock(css, BLOCKS.moonlight), '--sel-glow')
    const dark = tokenValue(themeBlock(css, BLOCKS.dark), '--sel-glow')
    const moongold = tokenValue(themeBlock(css, BLOCKS.moongold), '--sel-glow')
    const light = tokenValue(themeBlock(css, BLOCKS.light), '--sel-glow')

    // Dark themes must be white
    expect(moonlight, 'moonlight --sel-glow should be white').toBe('#ffffff')
    expect(dark, 'dark --sel-glow should be white').toBe('#ffffff')
    expect(moongold, 'moongold --sel-glow should be white').toBe('#ffffff')

    // Light theme must be a clean grey (never yellow or amber)
    expect(light, 'light --sel-glow should be thin grey').toBe('#6e7681')

    // None should be yellow/gold
    for (const val of Object.values({ moonlight, dark, moongold, light })) {
      expect(['#ffd43b', '#c48600', '#f5c76b', '#ffdb7a']).not.toContain(val)
    }
  })

  it('draws a thin outline instead of thick yellow glow on 2-D graphs and 3-D curves', () => {
    const graphViewSrc = readFileSync(join(RENDERER_SRC, 'render/GraphView.tsx'), 'utf8')
    const graph3dSrc = readFileSync(join(RENDERER_SRC, 'render/Graph3DViews.tsx'), 'utf8')

    // Must not have thick width + 4
    expect(graphViewSrc).not.toMatch(/color=\{colors\.select\}\s+width=\{width \+ 4\}/)
    expect(graphViewSrc).toMatch(/color=\{colors\.select\}\s+width=\{width \+ 1\.6\}/)

    expect(graph3dSrc).not.toMatch(/color=\{selectColour\}\s+width=\{width \+ 4\}/)
    expect(graph3dSrc).toMatch(/color=\{selectColour\}\s+width=\{width \+ 1\.6\}/)
  })

  it('draws a thin outline on geometry lines and circles', () => {
    const objectViewsSrc = readFileSync(join(RENDERER_SRC, 'render/ObjectViews.tsx'), 'utf8')

    // LineLikeView: must not have width + 4
    expect(objectViewsSrc).not.toMatch(/color=\{colors\.select\}\s+width=\{width \+ 4\}/)
    expect(objectViewsSrc).toMatch(/color=\{colors\.select\}\s+width=\{width \+ 1\.6\}/)

    // CircleView: must not have fixed thick width={6}
    expect(objectViewsSrc).not.toMatch(/color=\{colors\.select\}\s+width=\{6\}/)
    expect(objectViewsSrc).toMatch(/color=\{colors\.select\}\s+width=\{width \+ 1\.6\}/)
  })
})
