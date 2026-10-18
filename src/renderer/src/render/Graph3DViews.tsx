// 3D-2 (owner, Wed 14 Oct: "graphing 3D ... make their interface good too"; "beautiful 3D graphs"): the graphs that live in
// space. A surface z = f(x, y) and a parametric surface x(u, v), y(u, v), z(u, v), shaded smoothly in the theme's three
// height colours (--surface-low, --surface-mid, --surface-high) with thin mesh lines; a plane ax + by + cz = d as a clear
// sheet with its edge; a curve in space as a line. Hovering a surface shows (x, y, z) there. Each records the box it draws
// (drawnBoxes) so Home frames what is on screen. The maths is math/graph3d.ts.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { FatLine } from './FatLine'
import { toScreen } from './cameraUtils'
import { labelAnchors, overlay, SpanPool } from './overlay'
import { useReleaseLater } from './releaseLater'
import { useScene } from '../core/store'
import type { GraphObj } from '../core/types'
import { formatMeasure } from '../math/format'
import { surfaceGeometry } from '../math/graphs'
import { boxOf, heightColours, meshLines, parametricSurface, planeOf, planePatch, rgbOf, spaceCurve, type RGB } from '../math/graph3d'
import { themeColor, useThemed, type Theme } from '../app/theme'
import type { V3 } from '../math/vec'

type Box = { min: V3; max: V3 }

/** What each 3-D graph draws, by id, for Home to frame (render/CameraRig.tsx sceneBounds). */
export const drawnBoxes = new Map<string, Box>()

/** A graph taken away (or its view gone) leaves Home's box. */
function useForgetBox(id: string): void {
  useEffect(() => () => void drawnBoxes.delete(id), [id])
}

/** The square a surface z = f(x, y) is drawn over, and the grid it is sampled on (core/visualize/roots.ts uses the same). */
const HALF = 6
const GRID = 140
/** Every MESH_EVERY-th row and column gets a thin line: 15 each way over the 140 × 140 grid. */
const MESH_EVERY = 10

/** Half the side of the square a surface z = f(x, y) is drawn over. */
const surfaceHalf = (o: Pick<GraphObj, 'tMin' | 'tMax'>): number => {
  const h = Math.max(Math.abs(o.tMin ?? NaN), Math.abs(o.tMax ?? NaN))
  return Number.isFinite(h) && h > 0 ? h : HALF
}

/** The theme's three height colours and its mesh-line colour, read once per theme. */
function useSurfaceColours(): { low: RGB; mid: RGB; high: RGB; mesh: string } {
  return useThemed(() => ({
    low: rgbOf(themeColor('--surface-low')),
    mid: rgbOf(themeColor('--surface-mid')),
    high: rgbOf(themeColor('--surface-high')),
    mesh: themeColor('--surface-mesh')
  }))
}

/** A smooth-shaded mesh from positions, triangles and per-vertex colours. */
function shadedGeometry(positions: Float32Array, indices: number[], colours: Float32Array): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

/** The (x, y, z) read-out where the pointer is on a surface, written beside the pointer at the student's precision. */
function useHoverReadout(id: string) {
  const at = useRef<V3 | null>(null)
  const lastCam = useRef<{ pos: THREE.Vector3; quat: THREE.Quaternion; zoom: number; init: boolean }>({
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    zoom: 1,
    init: false
  })
  const settings = useScene((s) => s.settings)
  const activeSpace = useScene((s) => s.activeSpace)
  const viewMode = useScene((s) => s.viewMode)
  const pool = useMemo(() => new SpanPool(() => overlay.labels, 'measure-label'), [])
  const { invalidate } = useThree()

  // Dispose DOM spans when unmounting so no pills linger across views.
  useEffect(() => {
    return () => {
      at.current = null
      pool.dispose()
    }
  }, [pool])

  // Clear immediately when space or view mode changes.
  useEffect(() => {
    at.current = null
    pool.begin()
    pool.end()
    invalidate()
  }, [activeSpace, viewMode, pool, invalidate])

  // Clear when the pointer leaves the browser window, cancels, or loses focus.
  useEffect(() => {
    const clear = () => {
      if (at.current) {
        at.current = null
        pool.begin()
        pool.end()
        invalidate()
      }
    }
    window.addEventListener('pointerleave', clear)
    window.addEventListener('pointercancel', clear)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('pointerleave', clear)
      window.removeEventListener('pointercancel', clear)
      window.removeEventListener('blur', clear)
    }
  }, [pool, invalidate])

  useFrame(({ camera, size }) => {
    // If camera moved (orbit, pan, zoom), clear the hover readout
    const c = lastCam.current
    if (c.init) {
      const moved =
        camera.position.distanceToSquared(c.pos) > 1e-6 ||
        Math.abs(camera.zoom - c.zoom) > 1e-4 ||
        1 - Math.abs(camera.quaternion.dot(c.quat)) > 1e-6
      if (moved) {
        at.current = null
      }
    }
    c.pos.copy(camera.position)
    c.quat.copy(camera.quaternion)
    c.zoom = camera.zoom
    c.init = true

    pool.begin()
    const p = at.current
    if (p) {
      const s = toScreen(camera, size, p)
      if (s.visible) {
        const n = (v: number) => formatMeasure(v, 'number', settings)
        pool.place(`(${n(p[0])}, ${n(p[1])}, ${n(p[2])})`, s.x + 14, s.y - 16, 'left')
      }
    }
    pool.end()
  })
  void id
  return {
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      at.current = [e.point.x, e.point.y, e.point.z]
    },
    onPointerOut: () => {
      at.current = null
      pool.begin()
      pool.end()
      invalidate()
    }
  }
}

/** The shaded surface, its thin mesh lines and the hover read-out: shared by z = f(x, y) and x(u, v), y(u, v), z(u, v). */
function ShadedSurface({ obj, geo, lines, selected, theme }: { obj: GraphObj; geo: THREE.BufferGeometry; lines: Float32Array; selected: boolean; theme: Theme }) {
  const { mesh } = useSurfaceColours()
  const hover = useHoverReadout(obj.id)
  return (
    <group>
      <mesh geometry={geo} onPointerMove={hover.onPointerMove} onPointerOut={hover.onPointerOut}>
        {/* Keyed on the theme: WebGPU compiles a material in, so a new look needs a new one. */}
        <meshStandardMaterial key={theme} vertexColors side={THREE.DoubleSide} roughness={0.62} metalness={0.04} transparent opacity={selected ? 0.82 : 0.97} />
      </mesh>
      {lines.length >= 6 && <FatLine points={lines} segments color={mesh} width={selected ? 1.1 : 0.8} depthTest renderOrder={3} />}
    </group>
  )
}

/** z = f(x, y) over the square from −6 to 6, or the square a graph is given (tMin to tMax for x and y: a tile's domain). */
export function SurfaceView({ obj, F, selected, version, theme }: { obj: GraphObj; F?: (v: Record<string, number>) => number; selected: boolean; version: unknown; theme: Theme }) {
  useForgetBox(obj.id)
  const { low, mid, high } = useSurfaceColours()
  const half = surfaceHalf(obj)
  const built = useMemo(() => {
    if (!F) return null
    const s = surfaceGeometry((x, y) => F({ x, y }), half, GRID)
    const zs: number[] = []
    for (let k = 2; k < s.positions.length; k += 3) zs.push(s.positions[k])
    const ok = (i: number) => Number.isFinite(F({ x: s.positions[i * 3], y: s.positions[i * 3 + 1] }))
    return { geo: shadedGeometry(s.positions, s.indices, heightColours(zs, low, mid, high)), lines: meshLines(s.positions, GRID, GRID, MESH_EVERY, ok), box: boxOf(s.positions) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` is the evaluator's result: F reads the scope through a closure, so the same F gives a new surface once a slider moves
  }, [F, version, low, mid, high, half])
  useReleaseLater(built?.geo, (g) => g.dispose())
  useFrame(() => {
    labelAnchors.set(obj.id, { p: [half, half, built?.box?.max[2] ?? 0] })
    if (built?.box) drawnBoxes.set(obj.id, built.box)
  })
  if (!built) return null
  return <ShadedSurface obj={obj} geo={built.geo} lines={built.lines} selected={selected} theme={theme} />
}

/** x(u, v), y(u, v), z(u, v) over the u and v the graph was given. */
export function ParamSurfaceView({ obj, fx, fy, fz, selected, version, theme }: { obj: GraphObj; fx?: (v: Record<string, number>) => number; fy?: (v: Record<string, number>) => number; fz?: (v: Record<string, number>) => number; selected: boolean; version: unknown; theme: Theme }) {
  useForgetBox(obj.id)
  const { low, mid, high } = useSurfaceColours()
  const built = useMemo(() => {
    if (!fx || !fy || !fz) return null
    const nu = 120
    const nv = 60
    const s = parametricSurface((u, v) => fx({ u, v }), (u, v) => fy({ u, v }), (u, v) => fz({ u, v }), obj.tMin ?? 0, obj.tMax ?? 2 * Math.PI, obj.vMin ?? 0, obj.vMax ?? Math.PI, nu, nv)
    const ok = (i: number) => Number.isFinite(s.heights[i])
    return { geo: shadedGeometry(s.positions, s.indices, heightColours(s.heights, low, mid, high)), lines: meshLines(s.positions, nu, nv, 6, ok), box: boxOf(s.positions) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version`: see SurfaceView
  }, [fx, fy, fz, version, obj.tMin, obj.tMax, obj.vMin, obj.vMax, low, mid, high])
  useReleaseLater(built?.geo, (g) => g.dispose())
  useFrame(() => {
    if (built?.box) {
      labelAnchors.set(obj.id, { p: built.box.max })
      drawnBoxes.set(obj.id, built.box)
    }
  })
  if (!built) return null
  return <ShadedSurface obj={obj} geo={built.geo} lines={built.lines} selected={selected} theme={theme} />
}

/** The plane ax + by + cz = d inside the cube from −6 to 6: a clear sheet in the graph's colour with its edge. */
export function PlaneView({ obj, F, selected, version }: { obj: GraphObj; F?: (v: Record<string, number>) => number; selected: boolean; version: unknown }) {
  useForgetBox(obj.id)
  const hover = useHoverReadout(obj.id)
  const built = useMemo(() => {
    const p = F ? planeOf((x, y, z) => F({ x, y, z })) : null
    if (!p) return null
    const quad = planePatch(p, HALF)
    if (quad.length < 3) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(quad.flat()), 3))
    // A fan over the section (3 to 6 corners, convex).
    g.setIndex(quad.slice(2).flatMap((_, k) => [0, k + 1, k + 2]))
    g.computeVertexNormals()
    return { geo: g, quad, box: boxOf(quad.flat()) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version`: see SurfaceView
  }, [F, version])
  useReleaseLater(built?.geo, (g) => g.dispose())
  useFrame(() => {
    if (built?.box) {
      labelAnchors.set(obj.id, { p: built.quad[2] })
      drawnBoxes.set(obj.id, built.box)
    }
  })
  if (!built) return null
  return (
    <group>
      <mesh geometry={built.geo} onPointerMove={hover.onPointerMove} onPointerOut={hover.onPointerOut}>
        <meshStandardMaterial key={obj.color} color={obj.color} side={THREE.DoubleSide} transparent opacity={selected ? 0.5 : 0.35} depthWrite={false} roughness={0.7} />
      </mesh>
      <FatLine points={built.quad} closed color={obj.color} width={selected ? 2.6 : 1.8} depthTest renderOrder={3} />
    </group>
  )
}

/** x(t), y(t), z(t): a line in the graph's colour, constant in width on screen. */
export function SpaceCurveView({ obj, fx, fy, fz, width, selected, selectColour, version }: { obj: GraphObj; fx?: (v: Record<string, number>) => number; fy?: (v: Record<string, number>) => number; fz?: (v: Record<string, number>) => number; width: number; selected: boolean; selectColour: string; version: unknown }) {
  useForgetBox(obj.id)
  const runs = useMemo(() => {
    if (!fx || !fy || !fz) return []
    const span = Math.abs((obj.tMax ?? 2 * Math.PI) - (obj.tMin ?? 0))
    const n = Math.min(4000, Math.max(400, Math.round(span * 120)))
    return spaceCurve((t) => fx({ t }), (t) => fy({ t }), (t) => fz({ t }), obj.tMin ?? 0, obj.tMax ?? 2 * Math.PI, n)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version`: see SurfaceView
  }, [fx, fy, fz, version, obj.tMin, obj.tMax])
  useFrame(() => {
    const flat = runs.flat().flat()
    const box = boxOf(flat)
    if (box) drawnBoxes.set(obj.id, box)
    const last = runs[runs.length - 1]
    if (last?.length) labelAnchors.set(obj.id, { p: last[last.length - 1], dx: 10, dy: -12 })
  })
  return (
    <>
      {selected && runs.map((r, i) => <FatLine key={`s${i}`} points={r} color={selectColour} width={width + 1.6} depthTest renderOrder={2} />)}
      {runs.map((r, i) => (
        <FatLine key={i} points={r} color={obj.color} width={width} depthTest renderOrder={3} />
      ))}
    </>
  )
}
