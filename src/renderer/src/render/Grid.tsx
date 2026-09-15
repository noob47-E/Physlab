import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { FatLine } from './FatLine'
import { niceStep, orthoBounds, toScreen } from './cameraUtils'
import { overlay, SpanPool } from './overlay'
import { useScene } from '../core/store'
import type { V3 } from '../math/vec'

const MINOR = '#26282d'
const MAJOR = '#33363c'
const AXIS = '#7d828c'

export const AXIS_COLORS = { x: '#ff4d6a', y: '#8fd12e', z: '#3b9dff' }

function fmtTick(v: number, step: number): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)))
  const s = v.toFixed(decimals)
  return s === '-0' ? '0' : s.replace('-', '−')
}

function useGridLines(): [THREE.LineSegments, THREE.LineSegments] {
  const lines = useMemo(() => {
    const mk = (color: string) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3))
      const m = new THREE.LineBasicMaterial({ color, depthTest: false, depthWrite: false })
      const l = new THREE.LineSegments(g, m)
      l.frustumCulled = false
      l.renderOrder = -10
      return l
    }
    return [mk(MINOR), mk(MAJOR)] as [THREE.LineSegments, THREE.LineSegments]
  }, [])
  useEffect(() => () => lines.forEach((l) => (l.geometry.dispose(), (l.material as THREE.Material).dispose())), [lines])
  return lines
}

function fillGrid(line: THREE.LineSegments, xMin: number, xMax: number, yMin: number, yMax: number, step: number, skip?: number, z = 0) {
  const pos: number[] = []
  const x0 = Math.ceil(xMin / step)
  const x1 = Math.floor(xMax / step)
  const y0 = Math.ceil(yMin / step)
  const y1 = Math.floor(yMax / step)
  for (let i = x0; i <= x1; i++) {
    if (skip && i % skip === 0) continue
    pos.push(i * step, yMin, z, i * step, yMax, z)
  }
  for (let j = y0; j <= y1; j++) {
    if (skip && j % skip === 0) continue
    pos.push(xMin, j * step, z, xMax, j * step, z)
  }
  line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  line.geometry.computeBoundingSphere()
}

/** Adaptive 2D graph-paper grid with numbered axes. */
export function Grid2D() {
  const { camera, size } = useThree()
  const [minor, major] = useGridLines()
  const showGrid = useScene((s) => s.settings.showGrid)
  const showAxes = useScene((s) => s.settings.showAxes)
  const built = useRef({ key: '', xMin: 0, xMax: 0, yMin: 0, yMax: 0 })
  const [axes, setAxes] = useState<{ x: V3[]; y: V3[] }>({ x: [], y: [] })
  const ticks = useMemo(() => new SpanPool(() => overlay.ticks, 'tick-label'), [])
  useEffect(() => () => ticks.dispose(), [ticks])

  useFrame(() => {
    const b = orthoBounds(camera, size)
    const zoom = (camera as THREE.OrthographicCamera).zoom
    const majorStep = niceStep(100 / zoom)
    const minorStep = majorStep / (String(majorStep).replace(/[0.]/g, '').startsWith('2') ? 4 : 5)
    const prev = built.current
    const outside = b.xMin < prev.xMin || b.xMax > prev.xMax || b.yMin < prev.yMin || b.yMax > prev.yMax
    const key = `${majorStep}`
    if (outside || key !== prev.key) {
      const w = b.xMax - b.xMin
      const h = b.yMax - b.yMin
      const ext = { xMin: b.xMin - w, xMax: b.xMax + w, yMin: b.yMin - h, yMax: b.yMax + h }
      fillGrid(minor, ext.xMin, ext.xMax, ext.yMin, ext.yMax, minorStep)
      fillGrid(major, ext.xMin, ext.xMax, ext.yMin, ext.yMax, majorStep)
      built.current = { key, ...ext }
      setAxes({ x: [[ext.xMin, 0, 0], [ext.xMax, 0, 0]], y: [[0, ext.yMin, 0], [0, ext.yMax, 0]] })
    }
    minor.visible = showGrid
    major.visible = showGrid

    ticks.begin()
    if (showAxes) {
      const origin = toScreen(camera, size, [0, 0, 0])
      const axisY = Math.min(Math.max(origin.y + 14, 12), size.height - 10)
      const axisX = Math.min(Math.max(origin.x - 8, 30), size.width - 6)
      for (let i = Math.ceil(b.xMin / majorStep); i <= Math.floor(b.xMax / majorStep); i++) {
        if (i === 0) continue
        const sx = toScreen(camera, size, [i * majorStep, 0, 0]).x
        ticks.place(fmtTick(i * majorStep, majorStep), sx, axisY)
      }
      for (let j = Math.ceil(b.yMin / majorStep); j <= Math.floor(b.yMax / majorStep); j++) {
        if (j === 0) continue
        const sy = toScreen(camera, size, [0, j * majorStep, 0]).y
        ticks.place(fmtTick(j * majorStep, majorStep), axisX, sy, 'right')
      }
      ticks.place('0', origin.x - 8, origin.y + 12, 'right')
      ticks.place('x', size.width - 12, Math.min(Math.max(origin.y - 12, 12), size.height - 20), 'center', AXIS_COLORS.x)
      ticks.place('y', Math.min(Math.max(origin.x + 12, 12), size.width - 12), 14, 'center', AXIS_COLORS.y)
    }
    ticks.end()
  })

  return (
    <>
      <primitive object={minor} />
      <primitive object={major} />
      {showAxes && axes.x.length > 0 && (
        <>
          <FatLine points={axes.x} color={AXIS} width={1.6} renderOrder={-5} />
          <FatLine points={axes.y} color={AXIS} width={1.6} renderOrder={-5} />
        </>
      )}
    </>
  )
}

/** Floor grid on the xy-plane with coloured x, y, z axes (z is up). */
export function Grid3D() {
  const { camera, size } = useThree()
  const [minor, major] = useGridLines()
  const showGrid = useScene((s) => s.settings.showGrid)
  const showAxes = useScene((s) => s.settings.showAxes)
  const [extent, setExtent] = useState({ size: 10, step: 1 })
  const ticks = useMemo(() => new SpanPool(() => overlay.ticks, 'tick-label'), [])
  useEffect(() => () => ticks.dispose(), [ticks])

  useFrame(() => {
    const dist = camera.position.length()
    const step = niceStep(dist / 12)
    const half = step * 10
    if (step !== extent.step) setExtent({ size: half, step })
    minor.visible = showGrid
    major.visible = showGrid
    ticks.begin()
    if (showAxes) {
      const put = (label: string, p: V3, color?: string) => {
        const s = toScreen(camera, size, p)
        if (s.visible) ticks.place(label, s.x, s.y, 'center', color)
      }
      put('x', [half * 1.08, 0, 0], AXIS_COLORS.x)
      put('y', [0, half * 1.08, 0], AXIS_COLORS.y)
      put('z', [0, 0, half * 1.08], AXIS_COLORS.z)
      for (let i = -10; i <= 10; i += 2) {
        if (i === 0) continue
        put(fmtTick(i * step, step), [i * step, 0, 0])
        put(fmtTick(i * step, step), [0, i * step, 0])
        put(fmtTick(i * step, step), [0, 0, i * step])
      }
    }
    ticks.end()
  })

  useEffect(() => {
    const { size: half, step } = extent
    fillGrid(minor, -half, half, -half, half, step / 2)
    fillGrid(major, -half, half, -half, half, step * 2)
  }, [extent, minor, major])

  const h = extent.size
  return (
    <>
      <primitive object={minor} />
      <primitive object={major} />
      {showAxes && (
        <>
          <FatLine points={[[-h, 0, 0], [h, 0, 0]]} color={AXIS_COLORS.x} width={2} renderOrder={-4} depthTest />
          <FatLine points={[[0, -h, 0], [0, h, 0]]} color={AXIS_COLORS.y} width={2} renderOrder={-4} depthTest />
          <FatLine points={[[0, 0, -h], [0, 0, h]]} color={AXIS_COLORS.z} width={2} renderOrder={-4} depthTest />
        </>
      )}
    </>
  )
}
