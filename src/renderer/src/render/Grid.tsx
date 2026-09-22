import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { FatLine } from './FatLine'
import { niceStep, orthoBounds, toScreen, worldPerPixel } from './cameraUtils'
import { DOT_HALF_PX, dotQuads, finiteArea, gridKey, gridVertices, minorStepOf, needsGridRebuild, normaliseGridStyle, styleFor3D, usableSize, type GridArea } from './gridMath'
import { overlay, SpanPool } from './overlay'
import { useScene } from '../core/store'
import { themeColor, useTheme } from '../app/theme'
import { axisTitle, ringLabels, tickText } from './gridLabels'
import type { V3 } from '../math/vec'
import type { GridStyle } from '../core/types'

// Grid colours come from the stylesheet so they follow the light/dark theme.
const MINOR = () => themeColor('--grid-minor')
const MAJOR = () => themeColor('--grid-major')
const AXIS = () => themeColor('--grid-axis')

// The axis colours are read when needed rather than once: a theme switch changes them.
const AXIS_COLORS = {
  get x() {
    return themeColor('--axis-x')
  },
  get y() {
    return themeColor('--axis-y')
  },
  get z() {
    return themeColor('--axis-z')
  }
}

/** The three drawables a grid is made of: minor lines, major lines and (for the dots style) a dot at each crossing. */
type GridLines = [THREE.LineSegments, THREE.LineSegments, THREE.Mesh]

function useGridLines(): GridLines {
  const lines = useMemo(() => {
    const geom = () => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3))
      return g
    }
    const mk = (color: string) => {
      const m = new THREE.LineBasicMaterial({ color, depthTest: false, depthWrite: false })
      const l = new THREE.LineSegments(geom(), m)
      l.frustumCulled = false
      l.renderOrder = -10
      return l
    }
    // Each dot is a small square mesh, not a THREE.Points vertex: WebGPU draws a point primitive
    // as exactly one device pixel and ignores PointsMaterial.size, so the dots style was a field
    // of invisible specks on the default renderer. `fillGrid` sizes the squares from the zoom.
    const pm = new THREE.MeshBasicMaterial({ color: MAJOR(), side: THREE.DoubleSide, depthTest: false, depthWrite: false })
    const dots = new THREE.Mesh(geom(), pm)
    dots.frustumCulled = false
    dots.renderOrder = -10
    return [mk(MINOR()), mk(MAJOR()), dots] as GridLines
  }, [])
  // Repaint the grid when the theme changes.
  const theme = useTheme((t) => t.theme)
  useEffect(() => {
    const colors = [MINOR(), MAJOR(), MAJOR()]
    lines.forEach((l, i) => {
      const m = l.material as THREE.LineBasicMaterial | THREE.MeshBasicMaterial
      m.color.set(colors[i])
      // The WebGPU backend compiles the colour into the material, so it has to be told.
      m.needsUpdate = true
    })
  }, [theme, lines])
  useEffect(() => () => lines.forEach((l) => (l.geometry.dispose(), (l.material as THREE.Material).dispose())), [lines])
  return lines
}

/** Rebuild the grid for one style; `dotHalf` is half a dot's side in world units (see `dotQuads`), `wpp` the world units one pixel spans (it sizes the chords of the polar circles). */
function fillGrid([minor, major, dots]: GridLines, style: GridStyle, area: GridArea, majorStep: number, minorStep: number, dotHalf: number, wpp: number, z = 0) {
  const v = gridVertices(style, area, majorStep, minorStep, z, wpp)
  const put = (obj: THREE.Object3D & { geometry: THREE.BufferGeometry }, pos: number[]) => {
    obj.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    obj.geometry.computeBoundingSphere()
  }
  put(minor, v.minor)
  put(major, v.major)
  put(dots, dotQuads(v.dots, dotHalf))
}

/** Show or hide the grid. A part the style does not use is hidden rather than drawn empty: a zero-vertex draw call is still a draw call, and WebGPU warns about each one. */
function showGridLines(lines: GridLines, show: boolean) {
  for (const l of lines) l.visible = show && ((l.geometry.getAttribute('position') as THREE.BufferAttribute | undefined)?.count ?? 0) > 0
}

/** Adaptive 2D graph-paper grid with numbered axes. */
export function Grid2D() {
  const { camera, size } = useThree()
  const lines = useGridLines()
  const [minor] = lines
  const showGrid = useScene((s) => s.settings.showGrid)
  // A style this build does not know draws lines rather than nothing.
  const gridStyle = useScene((s) => normaliseGridStyle(s.settings.gridStyle))
  const showAxes = useScene((s) => s.settings.showAxes)
  // Ticks are written in the drawing's unit and scale, like every other number on screen.
  const settings = useScene((s) => s.settings)
  const built = useRef({ key: '', xMin: 0, xMax: 0, yMin: 0, yMax: 0 })
  const [axes, setAxes] = useState<{ x: V3[]; y: V3[] }>({ x: [], y: [] })
  const ticks = useMemo(() => new SpanPool(() => overlay.ticks, 'tick-label'), [])
  useEffect(() => () => ticks.dispose(), [ticks])
  const traced = useRef(0)

  useFrame(() => {
    // A frame can arrive before the canvas has been measured: the dock panel is still settling, or
    // the renderer has only just finished starting. Building from a zero size gives zero-length
    // lines and caches them as done, which is what used to leave the viewport black on first open.
    const trace = traced.current < 8 ? ++traced.current : 0
    const zoom = (camera as THREE.OrthographicCamera).zoom
    if (!usableSize(size)) {
      if (trace) console.info(`PHYSLAB_CHECK grid f${trace} SKIP size=${size.width}x${size.height} zoom=${zoom}`)
      return
    }
    const b = orthoBounds(camera, size)
    if (!finiteArea(b)) {
      if (trace) console.info(`PHYSLAB_CHECK grid f${trace} SKIP-area size=${size.width}x${size.height} zoom=${zoom} x=[${b.xMin},${b.xMax}] y=[${b.yMin},${b.yMax}]`)
      return
    }
    const majorStep = niceStep(100 / zoom)
    const minorStep = minorStepOf(majorStep)
    const prev = built.current
    const key = gridKey(majorStep, size, zoom, gridStyle)
    if (needsGridRebuild(prev, b, key)) {
      const w = b.xMax - b.xMin
      const h = b.yMax - b.yMin
      const ext = { xMin: b.xMin - w, xMax: b.xMax + w, yMin: b.yMin - h, yMax: b.yMax + h }
      // The key holds the zoom, so the dots are re-sized whenever the zoom changes.
      const wpp = worldPerPixel(camera, size)
      fillGrid(lines, gridStyle, ext, majorStep, minorStep, DOT_HALF_PX * wpp, wpp)
      built.current = { key, ...ext }
      setAxes({ x: [[ext.xMin, 0, 0], [ext.xMax, 0, 0]], y: [[0, ext.yMin, 0], [0, ext.yMax, 0]] })
    }
    showGridLines(lines, showGrid)
    if (trace) {
      const verts = (minor.geometry.getAttribute('position') as THREE.BufferAttribute | undefined)?.count ?? 0
      console.info(
        `PHYSLAB_CHECK grid f${trace} size=${size.width}x${size.height} zoom=${zoom} step=${majorStep}/${minorStep} x=[${b.xMin.toFixed(2)},${b.xMax.toFixed(2)}] y=[${b.yMin.toFixed(2)},${b.yMax.toFixed(2)}] key=${key} prev=${prev.key} verts=${verts} axes=${axes.x.length} grid=${showGrid} axesOn=${showAxes}`
      )
    }

    ticks.begin()
    if (showAxes) {
      const origin = toScreen(camera, size, [0, 0, 0])
      const axisY = Math.min(Math.max(origin.y + 14, 12), size.height - 10)
      const axisX = Math.min(Math.max(origin.x - 8, 30), size.width - 6)
      for (let i = Math.ceil(b.xMin / majorStep); i <= Math.floor(b.xMax / majorStep); i++) {
        if (i === 0) continue
        const sx = toScreen(camera, size, [i * majorStep, 0, 0]).x
        ticks.place(tickText(i * majorStep, majorStep, settings), sx, axisY)
      }
      for (let j = Math.ceil(b.yMin / majorStep); j <= Math.floor(b.yMax / majorStep); j++) {
        if (j === 0) continue
        const sy = toScreen(camera, size, [0, j * majorStep, 0]).y
        ticks.place(tickText(j * majorStep, majorStep, settings), axisX, sy, 'right')
      }
      ticks.place('0', origin.x - 8, origin.y + 12, 'right')
      if (showGrid && gridStyle === 'polar') {
        // The angle of each ray, written just outside the biggest major circle that fits in the
        // view whole (or the first circle when none does), and only where that point is on screen.
        // "Grid: off" clears showGrid and leaves gridStyle alone, so the labels must follow the circles.
        const fits = Math.min(b.xMax, -b.xMin, b.yMax, -b.yMin)
        const r = Math.max(majorStep, Math.floor(fits / majorStep) * majorStep)
        for (const { angle, text } of ringLabels(settings.angleUnit)) {
          const p = toScreen(camera, size, [r * Math.cos(angle), r * Math.sin(angle), 0])
          const sx = p.x + 16 * Math.cos(angle)
          const sy = p.y - 16 * Math.sin(angle)
          if (sx >= 12 && sx <= size.width - 12 && sy >= 10 && sy <= size.height - 10) ticks.place(text, sx, sy)
        }
      }
      ticks.place(axisTitle('x', settings), size.width - 12, Math.min(Math.max(origin.y - 12, 12), size.height - 20), 'right', AXIS_COLORS.x)
      ticks.place(axisTitle('y', settings), Math.min(Math.max(origin.x + 12, 12), size.width - 12), 14, 'left', AXIS_COLORS.y)
    }
    ticks.end()
  })

  return (
    <>
      {lines.map((l) => (
        <primitive key={l.uuid} object={l} />
      ))}
      {showAxes && axes.x.length > 0 && (
        <>
          <FatLine points={axes.x} color={AXIS()} width={1.6} renderOrder={-5} />
          <FatLine points={axes.y} color={AXIS()} width={1.6} renderOrder={-5} />
        </>
      )}
    </>
  )
}

/** Floor grid on the xy-plane with coloured x, y, z axes (z is up). */
export function Grid3D() {
  const { camera, size, invalidate } = useThree()
  const lines = useGridLines()
  const showGrid = useScene((s) => s.settings.showGrid)
  // The floor knows only the square styles: circles and lattices are drawing paper, so it draws lines for them.
  const gridStyle = useScene((s) => styleFor3D(normaliseGridStyle(s.settings.gridStyle)))
  const showAxes = useScene((s) => s.settings.showAxes)
  const settings = useScene((s) => s.settings)
  const [extent, setExtent] = useState({ size: 10, step: 1 })
  const ticks = useMemo(() => new SpanPool(() => overlay.ticks, 'tick-label'), [])
  useEffect(() => () => ticks.dispose(), [ticks])

  useFrame(() => {
    if (!usableSize(size)) return
    const dist = camera.position.length()
    const step = niceStep(dist / 12)
    const half = step * 10
    if (step !== extent.step) setExtent({ size: half, step })
    showGridLines(lines, showGrid)
    ticks.begin()
    if (showAxes) {
      const put = (label: string, p: V3, color?: string) => {
        const s = toScreen(camera, size, p)
        if (s.visible) ticks.place(label, s.x, s.y, 'center', color)
      }
      put(axisTitle('x', settings), [half * 1.08, 0, 0], AXIS_COLORS.x)
      put(axisTitle('y', settings), [0, half * 1.08, 0], AXIS_COLORS.y)
      put(axisTitle('z', settings), [0, 0, half * 1.08], AXIS_COLORS.z)
      for (let i = -10; i <= 10; i += 2) {
        if (i === 0) continue
        const label = tickText(i * step, step, settings)
        put(label, [i * step, 0, 0])
        put(label, [0, i * step, 0])
        put(label, [0, 0, i * step])
      }
    }
    ticks.end()
  })

  useEffect(() => {
    const { size: half, step } = extent
    // The dots are sized for the camera's distance when the step last changed; in a perspective
    // view they shrink and grow with the rest of the floor between steps, which is what a floor does.
    const wpp = worldPerPixel(camera, size)
    fillGrid(lines, gridStyle, { xMin: -half, xMax: half, yMin: -half, yMax: half }, step * 2, step / 2, DOT_HALF_PX * wpp, wpp)
    // The parts a style uses changed with the vertex lists; the canvas draws on demand.
    showGridLines(lines, useScene.getState().settings.showGrid)
    invalidate()
  }, [extent, lines, gridStyle, camera, size, invalidate])

  const h = extent.size
  return (
    <>
      {lines.map((l) => (
        <primitive key={l.uuid} object={l} />
      ))}
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
