// The drawing hint bar (Segment, Polygon, ...). An absolute box at left: 50% with a translate can
// only shrink-to-fit into the half of the viewport to its right, so "Click the next point. ..."
// wrapped to one or two words a line beside the buttons and covered the drawing; the Finish, Undo
// point and Cancel buttons were h-6, under the 44 px target. The browser check measures the real
// thing; this keeps the two causes from coming back.

import { describe, expect, it } from 'vitest'
import { readSource } from './helpers/repo'

const css = readSource('src/renderer/src/styles.css')
const block = css.slice(css.indexOf('.tool-hint {'), css.indexOf('}', css.indexOf('.tool-hint {'))).replace(/\/\*[\s\S]*?\*\//g, '')
const viewport = readSource('src/renderer/src/render/Viewport.tsx')

describe('the drawing hint bar', () => {
  it('is centred by margins at its own width, not placed at 50% and pulled back', () => {
    expect(block).not.toMatch(/left:\s*50%/)
    expect(block).not.toMatch(/translateX/)
    expect(block).toMatch(/margin-inline:\s*auto/)
    expect(block).toMatch(/width:\s*fit-content/)
    expect(block).toMatch(/max-width:\s*calc\(100% - 24px\)/)
  })

  it('gives Finish, Undo point and Cancel a 44 px target', () => {
    for (const action of ['finishTool()', 'undoLastPick()', 'cancelTool()']) {
      const at = viewport.indexOf(`onClick={() => ${action}}`)
      expect(at, action).toBeGreaterThan(0)
      const tag = viewport.slice(viewport.lastIndexOf('<button', at), at)
      expect(tag, action).toContain('min-h-[44px]')
      expect(tag, action).not.toMatch(/\bh-6\b/)
    }
  })
})
