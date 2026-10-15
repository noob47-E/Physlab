import { describe, it, expect } from 'vitest'
import {
  pointDistance,
  lineLineAngle,
  linePlaneAngle,
  planePlaneAngle,
  pointPlaneDistance,
  planeThrough3Points,
  planeFromEquation,
  cuboidVolume,
  cuboidSurfaceArea,
  sphereVolume,
  sphereSurfaceArea,
  cylinderVolume,
  cylinderSurfaceArea,
  coneVolume,
  coneSurfaceArea,
  coneSlantHeight,
  squarePyramidVolume,
  squarePyramidSurfaceArea,
  triangularPrismVolume,
  triangularPrismSurfaceArea
} from '../src/renderer/src/math/geometry3d'

describe('geometry3d', () => {
  describe('pointDistance', () => {
    it('should calculate distance between (1,2,3) and (4,6,3) as 5', () => {
      const result = pointDistance([1, 2, 3], [4, 6, 3])
      expect(result.value).toBeCloseTo(5, 5)
      expect(result.steps).toBeDefined()
      expect(result.steps.length).toBeGreaterThan(0)
    })
  })

  describe('lineLineAngle', () => {
    it('should calculate angle between lines along (1,0,0) and (1,1,0) as 45 degrees', () => {
      const result = lineLineAngle([1, 0, 0], [1, 1, 0])
      expect(result.value).toBeCloseTo(Math.PI / 4, 5) // 45 degrees in radians
      expect(result.steps).toBeDefined()
      expect(result.steps.length).toBeGreaterThan(0)
    })
  })

  describe('linePlaneAngle', () => {
    it('should calculate angle between line (0,0,1) and plane z=0 as 90 degrees', () => {
      // Line along (0,0,1), plane z=0 has normal (0,0,1)
      const result = linePlaneAngle([0, 0, 1], [0, 0, 1])
      expect(result.value).toBeCloseTo(Math.PI / 2, 5) // 90 degrees in radians
      expect(result.steps).toBeDefined()
      expect(result.steps.length).toBeGreaterThan(0)
    })
  })

  describe('planePlaneAngle', () => {
    it('should calculate angle between planes z=0 and x+z=0 as 45 degrees', () => {
      // z = 0 has normal (0, 0, 1)
      // x + z = 0 has normal (1, 0, 1)
      const result = planePlaneAngle([0, 0, 1], [1, 0, 1])
      expect(result.value).toBeCloseTo(Math.PI / 4, 5) // 45 degrees in radians
      expect(result.steps).toBeDefined()
      expect(result.steps.length).toBeGreaterThan(0)
    })
  })

  describe('cuboid', () => {
    it('should calculate volume of 2 x 3 x 4 cuboid as 24', () => {
      const result = cuboidVolume(2, 3, 4)
      expect(result.value).toBeCloseTo(24, 5)
      expect(result.steps).toBeDefined()
      expect(result.steps.length).toBeGreaterThan(0)
    })

    it('should calculate surface area of 2 x 3 x 4 cuboid as 52', () => {
      const result = cuboidSurfaceArea(2, 3, 4)
      expect(result.value).toBeCloseTo(52, 5)
      expect(result.steps).toBeDefined()
      expect(result.steps.length).toBeGreaterThan(0)
    })
  })

  describe('sphere', () => {
    it('should calculate volume of sphere r=3 as 36π', () => {
      const result = sphereVolume(3)
      expect(result.value).toBeCloseTo(36 * Math.PI, 5)
      expect(result.steps).toBeDefined()
      expect(result.steps.length).toBeGreaterThan(0)
    })

    it('should calculate surface area of sphere r=3 as 36π', () => {
      const result = sphereSurfaceArea(3)
      expect(result.value).toBeCloseTo(36 * Math.PI, 5)
      expect(result.steps).toBeDefined()
      expect(result.steps.length).toBeGreaterThan(0)
    })
  })

  describe('cylinder', () => {
    it('should calculate volume of cylinder r=2, h=5 as 20π', () => {
      const result = cylinderVolume(2, 5)
      expect(result.value).toBeCloseTo(20 * Math.PI, 5)
      expect(result.steps).toBeDefined()
      expect(result.steps.length).toBeGreaterThan(0)
    })

    it('should calculate surface area of cylinder r=2, h=5 as 28π', () => {
      const result = cylinderSurfaceArea(2, 5)
      expect(result.value).toBeCloseTo(28 * Math.PI, 5)
      expect(result.steps).toBeDefined()
      expect(result.steps.length).toBeGreaterThan(0)
    })
  })

  describe('cone', () => {
    it('should calculate slant height of cone r=3, h=4 as 5', () => {
      const result = coneSlantHeight(3, 4)
      expect(result.value).toBeCloseTo(5, 5)
      expect(result.steps).toBeDefined()
      expect(result.steps.length).toBeGreaterThan(0)
    })

    it('should calculate volume of cone r=3, h=4 as 12π', () => {
      const result = coneVolume(3, 4)
      expect(result.value).toBeCloseTo(12 * Math.PI, 5)
      expect(result.steps).toBeDefined()
      expect(result.steps.length).toBeGreaterThan(0)
    })

    it('should calculate surface area of cone r=3, h=4 as 24π', () => {
      const result = coneSurfaceArea(3, 4)
      expect(result.value).toBeCloseTo(24 * Math.PI, 5)
      expect(result.steps).toBeDefined()
      expect(result.steps.length).toBeGreaterThan(0)
    })
  })

  describe('squarePyramid', () => {
    it('should calculate volume of square pyramid base=6, height=4 as 48', () => {
      const result = squarePyramidVolume(6, 4)
      expect(result.value).toBeCloseTo(48, 5)
      expect(result.steps).toBeDefined()
      expect(result.steps.length).toBeGreaterThan(0)
    })

    it('should calculate surface area of square pyramid base=6, height=4 as 96', () => {
      const result = squarePyramidSurfaceArea(6, 4)
      expect(result.value).toBeCloseTo(96, 5)
      expect(result.steps).toBeDefined()
      expect(result.steps.length).toBeGreaterThan(0)
    })
  })

  describe('triangularPrism', () => {
    it('should calculate volume of triangular prism with 3-4-5 right-triangle end and length 10 as 60', () => {
      const result = triangularPrismVolume(3, 4, 5, 10)
      expect(result.value).toBeCloseTo(60, 5)
      expect(result.steps).toBeDefined()
      expect(result.steps.length).toBeGreaterThan(0)
    })

    it('3D-3B: any triangle end, by its three sides (Heron): an equilateral end of side 4 and length 6 is V = 24√3, A = 8√3 + 72', () => {
      expect(triangularPrismVolume(4, 4, 4, 6).value).toBeCloseTo(24 * Math.sqrt(3), 12)
      expect(triangularPrismSurfaceArea(4, 4, 4, 6).value).toBeCloseTo(8 * Math.sqrt(3) + 72, 12)
    })

    it('should calculate surface area of triangular prism with 3-4-5 right-triangle end and length 10 as 132', () => {
      const result = triangularPrismSurfaceArea(3, 4, 5, 10)
      expect(result.value).toBeCloseTo(132, 5)
      expect(result.steps).toBeDefined()
      expect(result.steps.length).toBeGreaterThan(0)
    })
  })

  describe('planeThrough3Points', () => {
    it('should find plane through (1,0,0), (0,1,0), (0,0,1) as x+y+z=1', () => {
      const result = planeThrough3Points([1, 0, 0], [0, 1, 0], [0, 0, 1])
      expect(result).toBeDefined()
      if (result) {
        // Plane should satisfy: a*x + b*y + c*z = d
        // For (1,0,0): a = d
        // For (0,1,0): b = d
        // For (0,0,1): c = d
        // So x + y + z = d
        expect(Math.abs(result.a - result.d)).toBeLessThan(1e-6)
        expect(Math.abs(result.b - result.d)).toBeLessThan(1e-6)
        expect(Math.abs(result.c - result.d)).toBeLessThan(1e-6)
      }
    })
  })

  describe('planeFromEquation', () => {
    it('should parse plane equation from ax+by+cz=d form', () => {
      const result = planeFromEquation('x+y+z=1')
      expect(result).toBeDefined()
      if (result) {
        expect(result.a).toBeCloseTo(1, 5)
        expect(result.b).toBeCloseTo(1, 5)
        expect(result.c).toBeCloseTo(1, 5)
        expect(result.d).toBeCloseTo(1, 5)
      }
    })
  })

  describe('pointPlaneDistance', () => {
    it('should calculate distance from (0,0,0) to plane x+y+z=3 as sqrt(3)', () => {
      const result = pointPlaneDistance([0, 0, 0], 1, 1, 1, 3)
      expect(result.value).toBeCloseTo(Math.sqrt(3), 5)
      expect(result.steps).toBeDefined()
      expect(result.steps.length).toBeGreaterThan(0)
    })
  })
})
