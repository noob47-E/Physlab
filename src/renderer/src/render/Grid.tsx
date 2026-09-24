import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { FatLine } from './FatLine'
import { niceStep, orthoBounds, toScreen, worldPerPixel } from './cameraUtils'
import { abs, float, fract, fwidth, max, mix, positionLocal, saturate, uniform, vec4 } from 'three/tsl'
import { DOT_HALF_PX, dotQuads, finiteArea, GRID_LINE_PX, gridKey, gridShaderPlan, gridVertices, minorStepOf, needsGridRebuild, normaliseGridStyle, shaderGridQuad, styleFor3D, usableSize, type GridArea } from './gridMath'
import { useGpuInfo } from './renderer'
import { overlay, SpanPool } from './overlay'
import { useScene } from '../core/store'
import { themeColor, useTheme } from '../app/theme'
import { axisLabels, axisTitle, ringLabels, rulerLabels } from './gridLabels'
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

/** A float-valued TSL node, as the shader's arithmetic takes it. */
type TslFloat = typeof positionLocal.x

/**
 * The shader grid (0.9): one quad whose pixels are lit by their distance to the nearest line, so
 * every line is exactly one device pixel of ink at any zoom (see `lineCoverage` in gridMath.ts,
 * which this mirrors and which the tests check). Only the 2-D square styles use it — `gridShaderPlan`.
 */
interface ShaderGrid {
  mesh: THREE.Mesh
  major: { value: number }
  minor: { value: number }
}

function useShaderGrid(): ShaderGrid {
  const grid = useMemo(() => {
    const major = uniform(1)
    const minor = uniform(0.2)
    const minorColor = uniform(new THREE.Color(MINOR()))
    const majorColor = uniform(new THREE.Color(MAJOR()))
    // Step for step the same as lineCoverage. The quad's own coordinates are measured from a major
    // line near the view (shaderGridQuad), so they stay small enough for the GPU's 32-bit floats;
    // fwidth of them is the world width of one device pixel, whatever the zoom and the dpr.
    const coverNode = (p: TslFloat, step: TslFloat) => {
      const d = abs(fract(p.div(step).add(0.5)).sub(0.5)).mul(step)
      return saturate(float(GRID_LINE_PX * 0.5 + 0.5).sub(d.div(fwidth(p))))
    }
    const p = positionLocal
    const a = max(coverNode(p.x, minor), coverNode(p.y, minor))
    const b = max(coverNode(p.x, major), coverNode(p.y, major))
    // The larger coverage, as gridPixel: a major line is also a minor line, and stacking the two
    // counted it twice (a major line split across two pixels drew one and a half pixels of ink).
    const alpha = max(a, b)
    const material = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false, side: THREE.DoubleSide })
    material.colorNode = vec4(mix(minorColor, majorColor, b.div(max(alpha, 1e-6))), alpha)
    // Blended but not "transparent": a transparent material is drawn after every opaque one and
    // would lie over the shapes' fills; this way it stays first in the opaque pass, as the lines were.
    material.blending = THREE.CustomBlending
    material.blendSrc = THREE.SrcAlphaFactor
    material.blendDst = THREE.OneMinusSrcAlphaFactor
    material.blendSrcAlpha = THREE.OneFactor
    material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Array(12).fill(0), 3))
    geometry.setIndex([0, 1, 2, 0, 2, 3])
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.renderOrder = -10
    mesh.visible = false
    return { mesh, major, minor, minorColor, majorColor }
  }, [])
  const theme = useTheme((t) => t.theme)
  useEffect(() => repaintShaderGrid(grid), [theme, grid])
  useEffect(() => () => (grid.mesh.geometry.dispose(), (grid.mesh.material as THREE.Material).dispose()), [grid])
  return grid
}

/** Read the grid colours of the theme now showing into the shader. */
function repaintShaderGrid(g: { mesh: THREE.Mesh; minorColor: { value: THREE.Color }; majorColor: { value: THREE.Color } }) {
  g.minorColor.value.set(MINOR())
  g.majorColor.value.set(MAJOR())
  // Uniform colours reach the GPU without a rebuild, but the grid follows the rule every themed
  // WebGPU material here follows (AGENTS "WebGPU compiles a material's colour in").
  ;(g.mesh.material as THREE.Material).needsUpdate = true
}

/** Size the shader quad to the area and set its steps; the quad sits at a major line near the middle (shaderGridQuad). */
function fillShaderGrid(g: ShaderGrid, style: GridStyle, area: GridArea, majorStep: number, minorStep: number) {
  const q = shaderGridQuad(style, area, majorStep, minorStep)
  const [x0, y0, x1, y1] = q.corners
  const pos = g.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
  ;(pos.array as Float32Array).set([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0])
  pos.needsUpdate = true
  g.mesh.geometry.computeBoundingSphere()
  g.mesh.position.set(q.origin[0], q.origin[1], 0)
  g.major.value = q.major
  g.minor.value = q.minor
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

/** Show or hide the shader grid (the line path's twin is `showGridLines`). */
function showShaderGrid(g: ShaderGrid, show: boolean) {
  g.mesh.visible = show
}

/** Show or hide the grid. A part the style does not use is hidden rather than drawn empty: a zero-vertex draw call is still a draw call, and WebGPU warns about each one. */
function showGridLines(lines: GridLines, show: boolean) {
  for (const l of lines) l.visible = show && ((l.geometry.getAttribute('position') as THREE.BufferAttribute | undefined)?.count ?? 0) > 0
}

/** Adaptive 2D graph-paper grid with numbered axes. */
export function Grid2D() {
  const { camera, size } = useThree()
  const lines = useGridLines()
  const shader = useShaderGrid()
  const [minor] = lines
  const showGrid = useScene((s) => s.settings.showGrid)
  // A style this build does not know draws lines rather than nothing.
  const gridStyle = useScene((s) => normaliseGridStyle(s.settings.gridStyle))
  const backend = useGpuInfo((g) => g.backend)
  const path = gridShaderPlan(backend, gridStyle, false)
  const buildMs = useRef(0)
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
    // The path is part of the key: switching between the shader and the segments must rebuild the one now drawn.
    const key = `${gridKey(majorStep, size, zoom, gridStyle)}|${path}`
    if (needsGridRebuild(prev, b, key)) {
      const w = b.xMax - b.xMin
      const h = b.yMax - b.yMin
      const ext = { xMin: b.xMin - w, xMax: b.xMax + w, yMin: b.yMin - h, yMax: b.yMax + h }
      const t0 = performance.now()
      if (path === 'shader') fillShaderGrid(shader, gridStyle, ext, majorStep, minorStep)
      else {
        // The key holds the zoom, so the dots are re-sized whenever the zoom changes.
        const wpp = worldPerPixel(camera, size)
        fillGrid(lines, gridStyle, ext, majorStep, minorStep, DOT_HALF_PX * wpp, wpp)
      }
      buildMs.current = performance.now() - t0
      built.current = { key, ...ext }
      setAxes({ x: [[ext.xMin, 0, 0], [ext.xMax, 0, 0]], y: [[0, ext.yMin, 0], [0, ext.yMax, 0]] })
    }
    showGridLines(lines, showGrid && path === 'lines')
    showShaderGrid(shader, showGrid && path === 'shader')
    if (trace) {
      const verts = path === 'shader' ? 4 : ((minor.geometry.getAttribute('position') as THREE.BufferAttribute | undefined)?.count ?? 0)
      console.info(
        `PHYSLAB_CHECK grid f${trace} path=${path} backend=${backend} build=${buildMs.current.toFixed(2)}ms size=${size.width}x${size.height} zoom=${zoom} step=${majorStep}/${minorStep} x=[${b.xMin.toFixed(2)},${b.xMax.toFixed(2)}] y=[${b.yMin.toFixed(2)},${b.yMax.toFixed(2)}] key=${key} prev=${prev.key} verts=${verts} axes=${axes.x.length} grid=${showGrid} axesOn=${showAxes}`
      )
    }

    ticks.begin()
    if (showAxes) {
      const origin = toScreen(camera, size, [0, 0, 0])
      const axisY = Math.min(Math.max(origin.y + 14, 12), size.height - 10)
      const axisX = Math.min(Math.max(origin.x - 8, 30), size.width - 6)
      // Labels come from the Talbot search, not from every major line: never under 60 px apart,
      // always on a drawn line, and the same step on both axes.
      for (const { value, text } of axisLabels(b.xMin, b.xMax, size.width, majorStep, minorStep, settings)) {
        ticks.place(text, toScreen(camera, size, [value, 0, 0]).x, axisY)
      }
      for (const { value, text } of axisLabels(b.yMin, b.yMax, size.height, majorStep, minorStep, settings)) {
        ticks.place(text, axisX, toScreen(camera, size, [0, value, 0]).y, 'right')
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
      <primitive object={shader.mesh} />
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
      // Each axis is numbered for its own smallest size on screen, so under perspective its far
      // labels keep 60 px apart too; an axis seen end-on shows none rather than a pile on one spot.
      const screenOf = (p: V3) => toScreen(camera, size, p)
      const axes: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
      for (const dir of axes) {
        for (const { text, x, y } of rulerLabels(dir, half, step, screenOf, size, settings)) ticks.place(text, x, y, 'center')
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
