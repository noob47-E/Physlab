// W10 and W11: the grid and the fat lines made a new GPU buffer on every rebuild. On the WebGL2
// fallback three caches a vertex array for every new attribute and never lets it go, so GPU
// memory grew with every zoom step and every mouse move. These tests rebuild through the same
// helpers the components call and count the buffer objects that come out.

import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { LineSegments2 } from 'three/addons/lines/webgpu/LineSegments2.js'
import { Line2 } from 'three/addons/lines/webgpu/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { drawnVertices, writeLinePoints, writePositions, type FatLineObject } from '../src/renderer/src/render/gpuBuffers'
import { dotQuads, gridVertices, minorStepOf } from '../src/renderer/src/render/gridMath'
import { niceStep } from '../src/renderer/src/render/cameraUtils'
import type { GridStyle } from '../src/renderer/src/core/types'

/** A geometry as `useGridLines` makes it: two placeholder vertices. */
function gridGeometry() {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3))
  return g
}

/** The grid Grid2D builds for a 1200 × 800 px view at `zoom` (the view plus one view each side). */
function gridAt(style: GridStyle, zoom: number) {
  const w = 1200 / zoom
  const h = 800 / zoom
  const area = { xMin: -1.5 * w, xMax: 1.5 * w, yMin: -1.5 * h, yMax: 1.5 * h }
  const major = niceStep(100 / zoom)
  const wpp = 1 / zoom
  const v = gridVertices(style, area, major, minorStepOf(major), 0, wpp)
  return { minor: v.minor, major: v.major, dots: dotQuads(v.dots, 2 * wpp) }
}

describe('grid rebuilds reuse their buffers (W10)', () => {
  it('a Polar grid rebuilt at two zooms keeps the same position attribute on each part', () => {
    const minor = gridGeometry()
    const major = gridGeometry()
    const a = gridAt('polar', 50)
    writePositions(minor, a.minor)
    writePositions(major, a.major)
    const firstMinor = minor.getAttribute('position')
    const firstMajor = major.getAttribute('position')
    const b = gridAt('polar', 55)
    // Same grid size or smaller at the second zoom, so nothing has to grow.
    expect(b.minor.length).toBeLessThanOrEqual(a.minor.length)
    expect(b.major.length).toBeLessThanOrEqual(a.major.length)
    writePositions(minor, b.minor)
    writePositions(major, b.major)
    expect(minor.getAttribute('position')).toBe(firstMinor)
    expect(major.getAttribute('position')).toBe(firstMajor)
    // What is drawn is the new grid, vertex for vertex.
    expect(drawnVertices(minor)).toBe(b.minor.length / 3)
    expect(Array.from(minor.getAttribute('position').array.slice(0, b.minor.length))).toEqual(Array.from(Float32Array.from(b.minor)))
  })

  it('forty zoom steps with the Dots grid make only a handful of buffers, not one per step', () => {
    const dots = gridGeometry()
    const seen = new Set<unknown>()
    for (let i = 0; i < 40; i++) {
      // Wheel steps in and out between zoom 40 and 60.
      const zoom = 40 + 20 * Math.abs(Math.sin(i / 3))
      const v = gridAt('dots', zoom)
      writePositions(dots, v.dots)
      seen.add(dots.getAttribute('position'))
      expect(drawnVertices(dots)).toBe(v.dots.length / 3)
    }
    // A buffer is replaced only when the grid outgrows it, and it grows by doubling.
    expect(seen.size).toBeLessThanOrEqual(4)
  })

  it('an empty grid part draws nothing, so the part is hidden rather than drawn empty', () => {
    const g = gridGeometry()
    writePositions(g, gridAt('dots', 50).dots)
    writePositions(g, [])
    expect(drawnVertices(g)).toBe(0)
  })
})

/** A fat line as `FatLine` builds it, before any points arrive. */
function fatLine(segments: boolean, dashed: boolean): FatLineObject {
  const material = new THREE.Line2NodeMaterial({ dashed })
  const geometry = segments ? new LineSegmentsGeometry() : new LineGeometry()
  geometry.setPositions([0, 0, 0, 0, 0, 0])
  const line = segments ? new LineSegments2(geometry, material) : new Line2(geometry as LineGeometry, material)
  if (dashed) line.computeLineDistances()
  return line as unknown as FatLineObject
}

const ring = (r: number, n: number) => {
  const out = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) out.set([r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n), 0], i * 3)
  return out
}

describe('fat lines update their buffer in place (W11)', () => {
  it('two point lists of the same length keep the same instanceStart buffer', () => {
    const line = fatLine(false, false)
    writeLinePoints(line, ring(1, 24), false, false)
    const first = (line.geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute).data
    writeLinePoints(line, ring(2, 24), false, false)
    const start = line.geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute
    expect(start.data).toBe(first)
    // The polyline's 24 points are 23 segments, and the second ring is the one drawn.
    expect(line.geometry.instanceCount).toBe(23)
    expect(start.getX(0)).toBeCloseTo(2)
    expect((line.geometry.attributes.instanceEnd as THREE.InterleavedBufferAttribute).getY(22)).toBeCloseTo(2 * Math.sin((2 * Math.PI * 23) / 24), 5)
  })

  it('a rubber band dragged across 50 mouse moves makes at most a few buffers', () => {
    const line = fatLine(true, false)
    const seen = new Set<unknown>()
    for (let i = 0; i < 50; i++) {
      writeLinePoints(line, Float32Array.from([0, 0, 0, i, i / 2, 0]), true, false)
      seen.add((line.geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute).data)
    }
    expect(seen.size).toBe(1)
    expect(line.geometry.instanceCount).toBe(1)
  })

  it('a dashed line keeps its distance buffer and the distances follow the new points', () => {
    const line = fatLine(false, true)
    writeLinePoints(line, Float32Array.from([0, 0, 0, 3, 0, 0, 3, 4, 0]), false, true)
    const first = (line.geometry.attributes.instanceDistanceStart as THREE.InterleavedBufferAttribute).data
    writeLinePoints(line, Float32Array.from([0, 0, 0, 0, 2, 0, 0, 2, 5]), false, true)
    const d0 = line.geometry.attributes.instanceDistanceStart as THREE.InterleavedBufferAttribute
    const d1 = line.geometry.attributes.instanceDistanceEnd as THREE.InterleavedBufferAttribute
    expect(d0.data).toBe(first)
    expect([d0.getX(0), d1.getX(0), d0.getX(1), d1.getX(1)]).toEqual([0, 2, 2, 7])
  })

  it('a line that grows gets a bigger buffer and still draws every segment', () => {
    const line = fatLine(true, false)
    writeLinePoints(line, Float32Array.from([0, 0, 0, 1, 0, 0]), true, false)
    const many = new Float32Array(6 * 40).map((_, i) => i)
    writeLinePoints(line, many, true, false)
    const start = line.geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute
    expect(line.geometry.instanceCount).toBe(40)
    expect(start.getX(39)).toBe(234)
  })
})
