import { useEffect, useMemo } from 'react'
import * as THREE from 'three/webgpu'
import { Line2 } from 'three/addons/lines/webgpu/Line2.js'
import { LineSegments2 } from 'three/addons/lines/webgpu/LineSegments2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import type { V3 } from '../math/vec'

export interface FatLineProps {
  /** Polyline vertices, or pairs of segment endpoints when `segments` is true. */
  points: V3[] | Float32Array
  color: string
  width?: number
  dashed?: boolean
  dashSize?: number
  gapSize?: number
  closed?: boolean
  segments?: boolean
  depthTest?: boolean
  renderOrder?: number
  visible?: boolean
}

/** Constant-pixel-width line (GPU instanced ribbons, works in 2D and 3D). */
export function FatLine({
  points,
  color,
  width = 2,
  dashed = false,
  dashSize = 0.15,
  gapSize = 0.1,
  closed = false,
  segments = false,
  depthTest = false,
  renderOrder = 2,
  visible = true
}: FatLineProps) {
  const obj = useMemo(() => {
    const material = new THREE.Line2NodeMaterial({ color, linewidth: width, dashed, dashSize, gapSize })
    const geometry = segments ? new LineSegmentsGeometry() : new LineGeometry()
    // The node material compiles against the attributes present on first draw, so the
    // instanced attributes must exist before the line is ever rendered.
    geometry.setPositions([0, 0, 0, 0, 0, 0])
    const line = segments ? new LineSegments2(geometry, material) : new Line2(geometry as LineGeometry, material)
    if (dashed) line.computeLineDistances()
    line.frustumCulled = false
    return line
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashed, segments])

  useEffect(() => {
    let flat: Float32Array
    if (points instanceof Float32Array) flat = points
    else {
      const n = points.length + (closed && points.length > 2 ? 1 : 0)
      flat = new Float32Array(n * 3)
      points.forEach((p, i) => flat.set(p, i * 3))
      if (n > points.length) flat.set(points[0], points.length * 3)
    }
    const minCount = segments ? 6 : 6
    obj.visible = visible && flat.length >= minCount && flat.every(Number.isFinite)
    if (!obj.visible) return
    ;(obj.geometry as LineGeometry).setPositions(flat)
    if (dashed) obj.computeLineDistances()
  }, [obj, points, closed, segments, dashed, visible])

  useEffect(() => {
    const m = obj.material as THREE.Line2NodeMaterial
    m.color.set(color)
    m.needsUpdate = true
    m.linewidth = width
    m.depthTest = depthTest
    m.depthWrite = depthTest
    m.dashSize = dashSize
    m.gapSize = gapSize
    obj.renderOrder = renderOrder
  }, [obj, color, width, depthTest, dashSize, gapSize, renderOrder])

  useEffect(
    () => () => {
      obj.geometry.dispose()
      ;(obj.material as THREE.Material).dispose()
    },
    [obj]
  )

  return <primitive object={obj} />
}
