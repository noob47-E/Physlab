import { describe, expect, it } from 'vitest'
import { EXPRESSION_WORDS } from '../src/renderer/src/panels/expressionRows'
import { TOOLS } from '../src/renderer/src/render/tools'
import { TOOL_CARDS } from '../src/renderer/src/app/toolCards/registry'
import { readSource } from './helpers/repo'

describe('Part L5: label unlabelled buttons on expression rows', () => {
  it('EXPRESSION_WORDS defines move label and aria tooltips for row reordering', () => {
    const words = EXPRESSION_WORDS as Record<string, string>
    expect(words.move).toBe('Move')
    expect(words.moveUp).toBe('Move up')
    expect(words.moveDown).toBe('Move down')
  })

  it('Expressions.tsx renders a visible text label for the move buttons', () => {
    const src = readSource('src/renderer/src/panels/Expressions.tsx')
    // Must render {W.move} before the arrow buttons
    expect(src).toMatch(/\{W\.move\}/)
  })

  it('every row with move arrows has the label, the slider rows (G2, merged after L5) too', () => {
    const src = readSource('src/renderer/src/panels/Expressions.tsx')
    const arrowRows = src.match(/onClick=\{\(\) => onMove\(-1\)\}/g)?.length ?? 0
    expect(arrowRows).toBeGreaterThanOrEqual(2)
    expect(src.match(/\{W\.move\}/g)?.length).toBe(arrowRows)
    expect(src).not.toContain('title="Move up"')
  })
})

describe('Part L6: Measure used for one thing only (outside Calculator)', () => {
  it('the 2-D distance drawing tool is named Distance, not Measure', () => {
    const tool = TOOLS.find((t) => t.id === 'distance')
    expect(tool).toBeDefined()
    expect(tool?.label).toBe('Distance')
    expect(tool?.key).toBe('D')
  })

  it('tool card for tool:distance is titled Distance', () => {
    const card = TOOL_CARDS['tool:distance']
    expect(card).toBeDefined()
    expect(card.title).toBe('Distance')
  })
})
