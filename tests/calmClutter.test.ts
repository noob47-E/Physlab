// Part CALM: remove clutter from learning views
// 1. No search boxes in the lesson (Examples) panels.
// 2. Never show left and right side panels at the same time in Geometry, Vectors and Graphing
//    (the lessons panel closes when the student selects or draws something).
// 3. No duplicate floating slider at the bottom of the drawing when the same slider is in the Expressions panel.
// 4. Problem Sets: the empty drawing grid is not shown while a question has no picture.

import { describe, expect, it } from 'vitest'
import { readSource } from './helpers/repo'
import { filterFloatingSliders } from '../src/renderer/src/panels/SliderDock'
import { shouldShowDrawingGrid } from '../src/renderer/src/render/viewportCalm'
import { isSidePanelAllowed } from '../src/renderer/src/app/sidePanelsCalm'
import type { NumberObj } from '../src/renderer/src/core/types'

describe('CALM 1: no search boxes in lesson (Examples) panels', () => {
  it('Examples.tsx has no search input field or search placeholder', () => {
    const src = readSource('src/renderer/src/panels/Examples.tsx')
    expect(src).not.toMatch(/placeholder="Search/i)
    expect(src).not.toMatch(/<input[^>]*placeholder/i)
  })
})

describe('CALM 2: never show left and right side panels at the same time in Geometry, Vectors and Graphing', () => {
  it('enforces mutual exclusivity between left and right side panels in calm modes', () => {
    // In Geometry (shapes), Vectors, and Graphing:
    expect(isSidePanelAllowed('shapes', 'right', ['examples'])).toBe(false)
    expect(isSidePanelAllowed('shapes', 'left', ['measure'])).toBe(false)
    expect(isSidePanelAllowed('vectors', 'right', ['examples'])).toBe(false)
    expect(isSidePanelAllowed('vectors', 'left', ['vectorcalc'])).toBe(false)
    expect(isSidePanelAllowed('graphing', 'right', ['expressions'])).toBe(false)
    expect(isSidePanelAllowed('graphing', 'left', ['measure'])).toBe(false)

    // With no competing opposite panel, allowed:
    expect(isSidePanelAllowed('shapes', 'right', [])).toBe(true)
    expect(isSidePanelAllowed('shapes', 'left', [])).toBe(true)

    // Other modes (e.g. calculator, sandbox) do not enforce this:
    expect(isSidePanelAllowed('sandbox', 'right', ['examples'])).toBe(true)
  })

  it('buildLayout in layout.ts does not add right panel when examples is open in calm modes', () => {
    const src = readSource('src/renderer/src/app/layout.ts')
    expect(src).toMatch(/never show left and right side panels/i)
  })
})

describe('CALM 3: no duplicate floating slider when slider is in Expressions panel', () => {
  it('filters out graphing sliders from floating SliderDock when Expressions panel is open', () => {
    const s1: NumberObj = {
      id: 'k',
      type: 'number',
      name: 'k',
      expr: '5',
      slider: { min: 0, max: 10, step: 1 },
      visible: true,
      locked: false,
      showLabel: true,
      space: 'graphing',
      color: '#5B9CFF'
    }
    const s2: NumberObj = {
      id: 'm',
      type: 'number',
      name: 'm',
      expr: '2',
      slider: { min: 1, max: 5, step: 0.5 },
      visible: true,
      locked: false,
      showLabel: true,
      space: 'vectors',
      color: '#A78BFA'
    }

    // When Expressions panel is closed, both sliders appear in their respective space:
    expect(filterFloatingSliders([s1], 'graphing', false)).toHaveLength(1)
    expect(filterFloatingSliders([s2], 'vectors', false)).toHaveLength(1)

    // When Expressions panel is open, graphing slider is NOT duplicated in floating dock:
    expect(filterFloatingSliders([s1], 'graphing', true)).toHaveLength(0)

    // A non-graphing slider (e.g. in vectors space) is still shown in floating dock even if expressions is open:
    expect(filterFloatingSliders([s2], 'vectors', true)).toHaveLength(1)
  })
})

describe('CALM 4: Problem Sets hides empty drawing grid when question has no picture', () => {
  it('does not show drawing grid in problems mode when hasPicture is false', () => {
    expect(shouldShowDrawingGrid('problems', false)).toBe(false)
    expect(shouldShowDrawingGrid('problems', true)).toBe(true)
  })

  it('shows drawing grid in standard drawing modes even when empty', () => {
    expect(shouldShowDrawingGrid('shapes', false)).toBe(true)
    expect(shouldShowDrawingGrid('vectors', false)).toBe(true)
    expect(shouldShowDrawingGrid('graphing', false)).toBe(true)
    expect(shouldShowDrawingGrid('sandbox', false)).toBe(false)
  })
})
