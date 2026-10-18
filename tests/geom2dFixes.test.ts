// Geometry 2D fixes for Finding 5.1: crossed polygons should not show area, angles, fill, or decompose
// and Finding 5.2: Break apart then Fuse renames corners - they should keep their original labels
// and Finding 5.4: Shoelace formula wrapping and diagonal card duplication
// and Finding 5.3: area label placement to avoid angle badges

import { describe, it, expect, beforeEach } from 'vitest'
import { classifyPolygon, sidesCross } from '../src/renderer/src/math/shapes'
import { polygonReport } from '../src/renderer/src/math/shapeFormulas'
import type { V3 } from '../src/renderer/src/math/vec'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import { useScene } from '../src/renderer/src/core/store'
import type { SceneObject, PointObj, PolygonObj } from '../src/renderer/src/core/types'

const sc = () => useScene.getState()
const base = (id: string, name: string, space: 'shapes' = 'shapes') => ({
  id,
  name,
  visible: true,
  locked: false,
  color: '#9775fa',
  showLabel: true,
  space
})
const point = (id: string, name: string, p: V3): PointObj => ({
  ...base(id, name),
  type: 'point',
  def: { kind: 'free', p }
})

beforeEach(() => {
  sc().newScene()
  sc().setActiveSpace('shapes')
})

describe('Crossing polygon detection (bow-tie)', () => {
  // Bow-tie: points (0,0), (2,2), (2,0), (0,2) - sides cross
  const bowtie: V3[] = [[0, 0, 0], [2, 2, 0], [2, 0, 0], [0, 2, 0]]

  it('sidesCross detects bow-tie polygon', () => {
    expect(sidesCross(bowtie)).toBe(true)
  })

  it('classifyPolygon marks crossing polygon as "crossed"', () => {
    const cls = classifyPolygon(bowtie)
    expect(cls.kind).toBe('crossed')
  })

  // Regular square for comparison
  const square: V3[] = [[-1, 1, 0], [1, 1, 0], [1, -1, 0], [-1, -1, 0]]

  it('sidesCross does not detect regular square', () => {
    expect(sidesCross(square)).toBe(false)
  })

  it('classifyPolygon marks regular square as "square"', () => {
    const cls = classifyPolygon(square)
    expect(cls.kind).toBe('square')
  })

  // Another bow-tie: (0,0), (1,1), (1,0), (0,1)
  const bowtie2: V3[] = [[0, 0, 0], [1, 1, 0], [1, 0, 0], [0, 1, 0]]

  it('sidesCross detects second bow-tie', () => {
    expect(sidesCross(bowtie2)).toBe(true)
  })

  it('classifyPolygon marks second bow-tie as "crossed"', () => {
    const cls = classifyPolygon(bowtie2)
    expect(cls.kind).toBe('crossed')
  })
})

describe('Break apart then Fuse preserves labels (Finding 5.2)', () => {
  it('break and fuse a triangle: corners from pieces are reused, not replaced', () => {
    // Create a right-angled triangle with labeled corners A, B, C
    const cornerIds = ['cA', 'cB', 'cC']
    const cornerNames = ['A', 'B', 'C']
    const pts: V3[] = [[-6, 1, 0], [-2, 1, 0], [-6, 4, 0]]

    const objs: SceneObject[] = []
    cornerNames.forEach((name, i) => {
      objs.push(point(cornerIds[i], name, pts[i]))
    })

    // Add the polygon (marked as decomposed so it can be broken apart)
    const polyId = 'tri1'
    objs.push({
      ...base(polyId, 'tri1'),
      type: 'polygon' as const,
      points: cornerIds,
      fill: true,
      decomposed: true
    } as PolygonObj)

    sc().addObjects(objs, { record: false })

    // Get the original corner names and positions
    const originalCornersByPos = new Map<string, string>()
    pts.forEach((p, i) => {
      originalCornersByPos.set(JSON.stringify(p), cornerNames[i])
    })

    // Break it apart
    sc().breakApart(polyId)
    const objsAfterBreak = Object.values(sc().objects)
    const pieces = objsAfterBreak.filter((o) => o.type === 'polygon' && o.lego)
    expect(pieces.length).toBeGreaterThan(0)
    const pieceIds = pieces.map((o) => o.id)

    // Get the corner IDs from the pieces
    const pieceCornerIds = new Set<string>()
    pieces.forEach((piece) => {
      if (piece.type === 'polygon') {
        piece.points.forEach((cid) => {
          pieceCornerIds.add(cid)
        })
      }
    })
    expect(pieceCornerIds.size).toBeGreaterThan(0)

    // Fuse the pieces back
    sc().fusePieces(pieceIds)

    // Get the new polygon (not a piece)
    const objsAfterFuse = Object.values(sc().objects)
    const newPoly = objsAfterFuse.find((o) => o.type === 'polygon' && !o.lego) as PolygonObj | undefined
    expect(newPoly).toBeDefined()
    expect(newPoly?.type).toBe('polygon')

    if (newPoly?.type === 'polygon') {
      // After fusing back to the original shape, the labels at each coordinate should be preserved
      // Check that the fused polygon's corners have the same labels at the same coordinates as the original
      const newCornersByPos = new Map<string, string>()
      newPoly.points.forEach((cid) => {
        const c = sc().objects[cid]
        if (c?.type === 'point' && c.def.kind === 'free') {
          const posKey = JSON.stringify(c.def.p)
          newCornersByPos.set(posKey, c.name)
        }
      })

      // The fix: labels at the same coordinates should be unchanged
      originalCornersByPos.forEach((expectedLabel, posKey) => {
        expect(newCornersByPos.get(posKey)).toBe(expectedLabel)
      })
    }
  })
})

describe('Diagonal card and Shoelace formula (Finding 5.4)', () => {
  const settings: MeasureSettings = {
    unit: 'mm',
    decimals: 2,
    precisionMode: 'dp',
    unitPerSquare: 1,
    angleUnit: 'deg'
  }

  it('square diagonal row does not include diagonal in symbols', () => {
    // Square with corners at (-1,1), (1,1), (1,-1), (-1,-1)
    const square: V3[] = [[-1, 1, 0], [1, 1, 0], [1, -1, 0], [-1, -1, 0]]
    const report = polygonReport(square, ['A', 'B', 'C', 'D'], settings)

    // Find the diagonal row
    const diagonalRow = report.rows.find((r) => r.title === 'Diagonal')
    expect(diagonalRow).toBeDefined()

    // The diagonal row should NOT include the diagonal (d) in symbols
    // Only the side length should be in symbols
    if (diagonalRow) {
      const hasDiagonalSymbol = diagonalRow.symbols.some((s) => s.sym === 'd')
      expect(hasDiagonalSymbol).toBe(false)
    }
  })

  it('rectangle diagonal row does not include diagonal in symbols', () => {
    // Rectangle with corners at (-1,1), (1,1), (1,-1), (-1,-1)
    const rect: V3[] = [[-2, 1, 0], [2, 1, 0], [2, -1, 0], [-2, -1, 0]]
    const report = polygonReport(rect, ['A', 'B', 'C', 'D'], settings)

    // Find the diagonal row
    const diagonalRow = report.rows.find((r) => r.title === 'Diagonal')
    expect(diagonalRow).toBeDefined()

    // The diagonal row should NOT include the diagonal (d) in symbols
    // Only the dimensions should be in symbols
    if (diagonalRow) {
      const hasDiagonalSymbol = diagonalRow.symbols.some((s) => s.sym === 'd')
      expect(hasDiagonalSymbol).toBe(false)
    }
  })

  it('shoelace formula substitution is limited to 6 terms', () => {
    // An irregular 8-point polygon to test the shoelace formula truncation
    const polygon: V3[] = [
      [0, 0, 0],
      [1, 0.5, 0],
      [2, 0, 0],
      [3, 1, 0],
      [2.5, 2, 0],
      [1, 2.5, 0],
      [0.5, 2, 0],
      [0, 1, 0]
    ]
    const report = polygonReport(polygon, Array.from({ length: 8 }, (_, i) => String.fromCharCode(65 + i)), settings)

    // Find the shoelace formula row
    const shoelaceRow = report.rows.find((r) => r.title.includes('shoelace formula'))
    expect(shoelaceRow).toBeDefined()

    if (shoelaceRow) {
      // The substitution should include the truncation indicator "... + \dots"
      expect(shoelaceRow.substitution).toContain('+ \\dots')
    }
  })
})

// Finding 5.3 (the area label against the angle badges) is held in pixels, at several zooms, by
// tests/geom2dV2.test.ts: the first version of these tests measured the label's distance in drawing
// units, which is how a label 3000 px off the screen passed.
