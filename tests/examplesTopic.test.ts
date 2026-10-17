import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import {
  areaForMode,
  orderedAreasForMode,
  filterExamples,
  EXAMPLES,
  type Example
} from '../src/renderer/src/panels/Examples'

describe('Part X6: Examples panel opens on the current mode topic', () => {
  it('maps each mode to its corresponding area in Examples', () => {
    expect(areaForMode('shapes')).toBe('Shapes & geometry')
    expect(areaForMode('graphing')).toBe('Graphs & functions')
    expect(areaForMode('vectors')).toBe('Vectors')
    // Default fallback for other modes is Vectors
    expect(areaForMode('calculator')).toBe('Vectors')
    expect(areaForMode('problems')).toBe('Vectors')
  })

  it('places the current mode topic first in the list of areas', () => {
    // In Geometry mode, Shapes & geometry must be first (not Vectors)
    const shapesAreas = orderedAreasForMode('shapes')
    expect(shapesAreas[0]).toBe('Shapes & geometry')
    expect(shapesAreas).toContain('Vectors')
    expect(shapesAreas).toContain('Graphs & functions')

    // In Graphing mode, Graphs & functions must be first (not Vectors)
    const graphingAreas = orderedAreasForMode('graphing')
    expect(graphingAreas[0]).toBe('Graphs & functions')
    expect(graphingAreas).toContain('Vectors')
    expect(graphingAreas).toContain('Shapes & geometry')

    // In Vectors mode, Vectors is first
    const vectorsAreas = orderedAreasForMode('vectors')
    expect(vectorsAreas[0]).toBe('Vectors')
    expect(vectorsAreas).toContain('Shapes & geometry')
    expect(vectorsAreas).toContain('Graphs & functions')
  })

  it('filters examples by query across title, topic, what, and area', () => {
    const sampleExamples: Example[] = [
      {
        title: 'Circle tangents',
        topic: 'Tangent lines',
        area: 'Shapes & geometry',
        level: 'Basic',
        what: 'A line tangent to a circle touches at exactly one point.',
        tryThis: 'Drag point P.',
        commands: []
      },
      {
        title: 'Dot product',
        topic: 'Projection',
        area: 'Vectors',
        level: 'Intermediate',
        what: 'The dot product gives the projection length.',
        tryThis: 'Vary angle.',
        commands: []
      },
      {
        title: 'Quadratic curves',
        topic: 'Parabolas',
        area: 'Graphs & functions',
        level: 'Advanced',
        what: 'Plot y = a x^2.',
        tryThis: 'Adjust slider a.',
        commands: []
      }
    ]

    // Search matching title
    expect(filterExamples(sampleExamples, 'Circle', 'All')).toHaveLength(1)
    expect(filterExamples(sampleExamples, 'Circle', 'All')[0].title).toBe('Circle tangents')

    // Search matching topic
    expect(filterExamples(sampleExamples, 'parabolas', 'All')).toHaveLength(1)
    expect(filterExamples(sampleExamples, 'parabolas', 'All')[0].title).toBe('Quadratic curves')

    // Search matching what explanation
    expect(filterExamples(sampleExamples, 'projection', 'All')).toHaveLength(1)
    expect(filterExamples(sampleExamples, 'projection', 'All')[0].title).toBe('Dot product')

    // Search matching area
    expect(filterExamples(sampleExamples, 'vectors', 'All')).toHaveLength(1)
    expect(filterExamples(sampleExamples, 'vectors', 'All')[0].title).toBe('Dot product')

    // Level filtering
    expect(filterExamples(sampleExamples, '', 'Basic')).toHaveLength(1)
    expect(filterExamples(sampleExamples, '', 'Intermediate')).toHaveLength(1)
    expect(filterExamples(sampleExamples, '', 'Advanced')).toHaveLength(1)
    expect(filterExamples(sampleExamples, '', 'All')).toHaveLength(3)

    // Combined query + level
    expect(filterExamples(sampleExamples, 'tangent', 'Intermediate')).toHaveLength(0)
    expect(filterExamples(sampleExamples, 'tangent', 'Basic')).toHaveLength(1)
  })

  it('determines the top section rendered according to the mode order', () => {
    // With all examples present, the first section rendered must match the prioritized area
    const shapesAreas = orderedAreasForMode('shapes')
    const visibleShapesAreas = shapesAreas.filter((a) => EXAMPLES.some((ex) => ex.area === a))
    expect(visibleShapesAreas[0]).toBe('Shapes & geometry')

    const graphingAreas = orderedAreasForMode('graphing')
    const visibleGraphingAreas = graphingAreas.filter((a) => EXAMPLES.some((ex) => ex.area === a))
    expect(visibleGraphingAreas[0]).toBe('Graphs & functions')

    const vectorsAreas = orderedAreasForMode('vectors')
    const visibleVectorsAreas = vectorsAreas.filter((a) => EXAMPLES.some((ex) => ex.area === a))
    expect(visibleVectorsAreas[0]).toBe('Vectors')
  })

  it('wires scroll reset and topic prioritization properly in source', () => {
    const srcPath = path.resolve(__dirname, '../src/renderer/src/panels/Examples.tsx')
    const src = fs.readFileSync(srcPath, 'utf-8')

    // Uses useLayoutEffect so that scroll reset occurs before browser paint
    expect(src).toContain('useLayoutEffect')
    expect(src).toMatch(/useLayoutEffect\(\(\)\s*=>\s*\{[\s\S]*?panelRef\.current\?\.scrollTo\(\{\s*top:\s*0\s*\}\)[\s\S]*?\},\s*\[mode\]\)/)

    // Attaches panelRef to the scrollable container
    expect(src).toMatch(/<div\s+className=["']panel pb-6["']\s+ref=\{panelRef\}/)

    // Uses orderedAreasForMode(mode) to compute sections
    expect(src).toContain('const areas = orderedAreasForMode(mode)')
  })
})
