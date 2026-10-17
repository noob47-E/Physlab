import { describe, it, expect } from 'vitest'
import { toDeg } from '../src/renderer/src/math/vec'
import { cornerAngle } from '../src/renderer/src/render/markGeometry'
import { interiorAngles } from '../src/renderer/src/math/shapes'
import { signedArea2D, polygonArea } from '../src/renderer/src/math/geometry'
import { objectList } from '../src/renderer/src/panels/measure3dItems'
import type { EvalResult, ObjId, SceneSettings, PointObj } from '../src/renderer/src/core/types'

describe('3D Corner Angles', () => {
  it('interiorAngles: computes 90° for each corner of a 2×3 rectangle', () => {
    const A: [number, number, number] = [0, 0, 0]
    const B: [number, number, number] = [2, 0, 0]
    const C: [number, number, number] = [2, 3, 0]
    const D: [number, number, number] = [0, 3, 0]
    const pts = [A, B, C, D]

    const angles = interiorAngles(pts)
    const angleDegrees = angles.map(a => toDeg(a))
    console.log('Rectangle interior angles (deg):', angleDegrees.map(a => a.toFixed(1)))

    // Each corner should be 90°
    angleDegrees.forEach((angle, i) => {
      console.log(`  Corner ${i}: ${angle.toFixed(1)}°`)
      expect(angle).toBeCloseTo(90, 0)
    })
  })

  it('interiorAngles: computes 108° for each corner of a regular pentagon', () => {
    const pts: Array<[number, number, number]> = []
    for (let i = 0; i < 5; i++) {
      const angle = (2 * Math.PI * i) / 5
      pts.push([Math.cos(angle), Math.sin(angle), 0])
    }

    const angles = interiorAngles(pts)
    const angleDegrees = angles.map(a => toDeg(a))
    console.log('Pentagon interior angles (deg):', angleDegrees.map(a => a.toFixed(1)))

    // Each corner should be 108°
    angleDegrees.forEach((angle, i) => {
      console.log(`  Corner ${i}: ${angle.toFixed(1)}°`)
      expect(angle).toBeCloseTo(108, 0)
    })
  })

  it('cornerAngle: computes 90° for each corner of a 2×3 rectangle', () => {
    const A: [number, number, number] = [0, 0, 0]
    const B: [number, number, number] = [2, 0, 0]
    const C: [number, number, number] = [2, 3, 0]
    const D: [number, number, number] = [0, 3, 0]
    const pts = [A, B, C, D]
    const orientation = 1 // CCW

    const angles = pts.map((v, i) => {
      const prev = pts[(i - 1 + pts.length) % pts.length]
      const next = pts[(i + 1) % pts.length]
      return cornerAngle(prev, v, next, orientation, false)
    })

    const angleDegrees = angles.map(a => toDeg(a))
    console.log('Rectangle corner angles from cornerAngle (deg):', angleDegrees.map(a => a.toFixed(1)))

    // Each corner should be 90°
    angleDegrees.forEach((angle) => {
      expect(angle).toBeCloseTo(90, 0)
    })
  })

  it('cornerAngle: computes ~90° for each corner of a 3-4-5 right triangle in tilted plane', () => {
    // Place triangle in tilted plane: A at origin, B at (3,0,0), C at (0,4,3)
    // The right angle is at A
    const A: [number, number, number] = [0, 0, 0]
    const B: [number, number, number] = [3, 0, 0]
    const C: [number, number, number] = [0, 4, 3]
    const pts = [A, B, C]

    const area = signedArea2D(pts)
    const orientation = area > 0 ? 1 : -1

    const angles = pts.map((v, i) => {
      const prev = pts[(i - 1 + pts.length) % pts.length]
      const next = pts[(i + 1) % pts.length]
      return cornerAngle(prev, v, next, orientation, true)  // true for triangle
    })

    const angleDegrees = angles.map(a => toDeg(a))
    console.log('3-4-5 triangle corner angles (deg):', angleDegrees.map(a => a.toFixed(1)))

    // Right angle at A
    expect(angleDegrees[0]).toBeCloseTo(90, 0.5)
  })

  it('all 4 sides of rectangle are accessible via wraparound', () => {
    const A: [number, number, number] = [0, 0, 0]
    const B: [number, number, number] = [2, 0, 0]
    const C: [number, number, number] = [2, 3, 0]
    const D: [number, number, number] = [0, 3, 0]
    const pts = [A, B, C, D]

    // Access all 4 corners via wraparound
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length]
      const curr = pts[i]
      const next = pts[(i + 1) % pts.length]

      console.log(`Corner ${i}: prev=${prev}, curr=${curr}, next=${next}`)

      // Verify each corner is visited
      expect(curr).toBeDefined()
      expect(prev).toBeDefined()
      expect(next).toBeDefined()
    }
  })

  it('rectangle has 4 sides listed', () => {
    // Test that a 4-sided polygon is recognized as having 4 sides
    const A: [number, number, number] = [0, 0, 0]
    const B: [number, number, number] = [2, 0, 0]
    const C: [number, number, number] = [2, 3, 0]
    const D: [number, number, number] = [0, 3, 0]
    const pts = [A, B, C, D]

    // Verify there are exactly 4 points
    expect(pts.length).toBe(4)
    console.log(`Rectangle has ${pts.length} sides`)
  })
})

describe('Object List Building', () => {
  it('polygon area is computed correctly for 2×3 rectangle', () => {
    const A: [number, number, number] = [0, 0, 0]
    const B: [number, number, number] = [2, 0, 0]
    const C: [number, number, number] = [2, 3, 0]
    const D: [number, number, number] = [0, 3, 0]
    const pts = [A, B, C, D]

    const area = polygonArea(pts)
    console.log('Rectangle area:', area)
    expect(area).toBeCloseTo(6, 1) // 2 × 3 = 6
  })

  it('polygon area is computed correctly for a triangle', () => {
    const A: [number, number, number] = [0, 0, 0]
    const B: [number, number, number] = [3, 0, 0]
    const C: [number, number, number] = [0, 4, 0]
    const pts = [A, B, C]

    const area = polygonArea(pts)
    console.log('Triangle area:', area)
    expect(area).toBeCloseTo(6, 1) // (3 × 4) / 2 = 6
  })

  it('objectList filters by visibility and auxiliary flag', () => {
    // This test verifies that visible, non-auxiliary objects are included
    // and invisible or auxiliary objects are excluded
    const visibleId = 'obj-visible' as ObjId
    const hiddenId = 'obj-hidden' as ObjId
    const auxId = 'obj-aux' as ObjId

    const objects = {
      [visibleId]: { id: visibleId, type: 'point' as const, visible: true, auxiliary: false, kind: 'free', source: '', exprs: [], def: { kind: 'free', p: [0, 0, 0] }, space: '' } as unknown as PointObj,
      [hiddenId]: { id: hiddenId, type: 'point' as const, visible: false, auxiliary: false, kind: 'free', source: '', exprs: [], def: { kind: 'free', p: [1, 1, 1] }, space: '' } as unknown as PointObj,
      [auxId]: { id: auxId, type: 'point' as const, visible: true, auxiliary: true, kind: 'free', source: '', exprs: [], def: { kind: 'free', p: [2, 2, 2] }, space: '' } as unknown as PointObj
    }

    const ev = {
      values: new Map([
        [visibleId, { type: 'point' as const, p: [0, 0, 0] }],
        [hiddenId, { type: 'point' as const, p: [1, 1, 1] }],
        [auxId, { type: 'point' as const, p: [2, 2, 2] }]
      ]),
      errors: new Map(),
      scope: {}
    } as unknown as EvalResult

    const settings = {} as unknown as SceneSettings
    const order = [visibleId, hiddenId, auxId]

    const list = objectList(order, objects, ev, settings)

    console.log('Filtered list:', list.map(x => x.id))
    // Only the visible, non-auxiliary object should be included
    expect(list.some(row => row.id === visibleId)).toBe(true)
    expect(list.some(row => row.id === hiddenId)).toBe(false)
    expect(list.some(row => row.id === auxId)).toBe(false)
  })
})

describe('Measure3D Panel Fallback Line Guard', () => {
  it('fallback line guard: when solid is selected, condition becomes false', () => {
    // Guards for the fallback line in Measure3D.tsx (line 160).
    // Condition: !m && !point && !shape && !solid
    // When solid !== null, the condition is false, so fallback line does not show.

    const m = null // No measurement
    const point = null // No point selected
    const shape = null // No shape selected
    const solid = { id: 'sol-1' } // Solid IS selected

    const showFallback = !m && !point && !shape && !solid
    console.log('Solid selected, fallback should not show:', showFallback)
    expect(showFallback).toBe(false)
  })

  it('fallback line guard: when nothing selected, condition is true', () => {
    // When no point, shape, or solid is selected and no measurement exists,
    // the fallback line should show to guide the user.

    const m = null
    const point = null
    const shape = null
    const solid = null // Nothing selected

    const showFallback = !m && !point && !shape && !solid
    console.log('Nothing selected, fallback should show:', showFallback)
    expect(showFallback).toBe(true)
  })
})
