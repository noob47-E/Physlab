// H13c (owner's browser check, 2026-10-06): in the Light theme a slider made in Moonlight kept its near-white colour
// rgb(233, 236, 239) for its name on the light dock — about 1.1 : 1, "almost invisible" — and an object of that colour
// showed an invisible dot in the Outliner. The dock's names are written in the text token made for the label
// background (declared in all four themes), and the Outliner's dot carries a thin outline in the theme's line colour.
import { describe, expect, it } from 'vitest'
import { readSource } from './helpers/repo'
import { BLOCKS, THEME_CSS, declaredTokens, tokenValue, themeBlock } from './helpers/theme'

const dock = readSource('src/renderer/src/panels/SliderDock.tsx')
const outliner = readSource('src/renderer/src/panels/Outliner.tsx')

describe('H13c — slider names and Outliner dots are seen in every theme', () => {
  it('the slider dock writes a name in the label text token, never in the object colour', () => {
    const name = /<span[^>]*font-math[^>]*>\s*\{o\.name\}/.exec(dock)?.[0] ?? ''
    expect(name, 'the name span').not.toBe('')
    expect(name).not.toMatch(/o\.color/)
    expect(name).toMatch(/var\(--label-text\)|text-label/)
  })

  it('the label text and its background are declared in all four themes', () => {
    for (const [theme, selector] of Object.entries(BLOCKS)) {
      const declared = declaredTokens(THEME_CSS, selector)
      expect(declared.has('--label-text'), theme).toBe(true)
      expect(declared.has('--label-bg'), theme).toBe(true)
      // The text itself is a plain colour in every theme, never left to the object's own.
      expect(tokenValue(themeBlock(THEME_CSS, selector), '--label-text'), theme).toBeTruthy()
    }
  })

  it('the Outliner dot has a thin outline in the theme line colour', () => {
    const dot = /<span className="[^"]*rounded-full[^"]*"[^>]*cssColor\(o\)[^>]*\/>/.exec(outliner)?.[0] ?? ''
    expect(dot, 'the dot span').not.toBe('')
    expect(dot).toMatch(/border|outline|boxShadow/)
    expect(dot).toMatch(/--line/)
  })
})
