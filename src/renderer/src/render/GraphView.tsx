import { memo, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { FatLine } from './FatLine'
import { toScreen } from './cameraUtils'
import { labelAnchors, overlay, SpanPool } from './overlay'
import { graphPolylines } from './picking'
import { useView } from './viewState'
import { QUALITY, qualityNow } from './renderer'
import { useScene } from '../core/store'
import type { GraphObj } from '../core/types'
import { compileScalar } from '../math/expr'
import { implicitSegments, inequalityMesh, keyPoints, labelPoints, sampleExplicit, sampleParametric, surfaceGeometry, type KeyPoint } from '../math/graphs'
import { fmt } from '../math/format'
import { themeColor, useTheme, useThemed, type Theme } from '../app/theme'
import type { V3 } from '../math/vec'

const scopeNow = () => useScene.getState().ev.scope

/**
 * The graph's own colours (a curve's colour is the object's) come from the stylesheet and are
 * re-read when the theme flips, so a root marked in the dark theme is still visible on the
 * light canvas. WebGPU compiles a material's colour in, so the materials below are keyed on the
 * theme and arrive new rather than being edited.
 */
function useGraphColors() {
  const theme = useTheme((t) => t.theme)
  const colors = useThemed(() => {
    // Resolved once per theme: reading the stylesheet inside useFrame for every key point made a
    // graph with many roots pay a style read per root per frame.
    const extremum = themeColor('--key-extremum')
    const key: Record<KeyPoint['kind'], string> = { root: themeColor('--key-root'), yIntercept: themeColor('--key-intercept'), max: extremum, min: extremum }
    return { select: themeColor('--sel-glow'), wireframe: themeColor('--wireframe'), key }
  })
  return { theme, colors }
}

export const GraphView = memo(function GraphView({ obj, selected, hovered, is3D }: { obj: GraphObj; selected: boolean; hovered: boolean; is3D: boolean }) {
  const view = useView()
  // Any scene change may move a slider the graph depends on.
  const evVersion = useScene((s) => s.ev)
  const decimals = useScene((s) => s.settings.decimals)

  const fns = useMemo(() => {
    try {
      switch (obj.kind) {
        case 'explicit':
        case 'area':
          return { f: compileScalar(obj.exprs[0], ['x'], scopeNow) }
        case 'implicit':
        case 'inequality':
          return { F: compileScalar(obj.exprs[0], ['x', 'y'], scopeNow) }
        case 'surface':
          return { F: compileScalar(obj.exprs[0], ['x', 'y'], scopeNow) }
        case 'polar':
          return { f: compileScalar(obj.exprs[0], ['theta', 't'], scopeNow) }
        case 'parametric':
          return { fx: compileScalar(obj.exprs[0], ['t'], scopeNow), fy: compileScalar(obj.exprs[1], ['t'], scopeNow) }
      }
    } catch (e) {
      return { error: String(e) }
    }
    return {}
  }, [obj.kind, obj.exprs])

  const is2DBounds = !is3D
  const b = is2DBounds ? view : { xMin: -10, xMax: 10, yMin: -10, yMax: 10, viewH: 20, wpp: 0.02, widthPx: 1000 }

  const data = useMemo(() => {
    const out: { polylines: V3[][]; segments?: V3[]; fill?: Float32Array; keys: KeyPoint[] } = { polylines: [], keys: [] }
    try {
      if (obj.kind === 'explicit' && fns.f) {
        const f = (x: number) => fns.f!({ x })
        const n = Math.min(4000, Math.max(300, Math.round(((b.xMax - b.xMin) / b.wpp / 2) * QUALITY[qualityNow()].samples)))
        out.polylines = sampleExplicit(f, b.xMin, b.xMax, n, b.viewH)
        if (obj.showRoots || obj.showExtrema) {
          out.keys = keyPoints(f, b.xMin, b.xMax, 1200).filter((k) => (k.kind === 'root' ? obj.showRoots : obj.showExtrema))
        }
      } else if (obj.kind === 'area' && fns.f) {
        const a = obj.tMin ?? 0
        const bnd = obj.tMax ?? 1
        const n = 400
        const tris: number[] = []
        const curve: V3[] = []
        for (let i = 0; i <= n; i++) {
          const x = a + ((bnd - a) * i) / n
          const y = fns.f({ x })
          curve.push([x, Number.isFinite(y) ? y : 0, 0])
        }
        for (let i = 0; i < n; i++) {
          const [x0, y0] = curve[i]
          const [x1, y1] = curve[i + 1]
          tris.push(x0, 0, 0, x1, 0, 0, x1, y1, 0, x0, 0, 0, x1, y1, 0, x0, y0, 0)
        }
        out.fill = new Float32Array(tris)
        out.polylines = [curve, [[a, 0, 0], curve[0]], [[bnd, 0, 0], curve[n]]]
      } else if ((obj.kind === 'implicit' || obj.kind === 'inequality') && fns.F) {
        const F = (x: number, y: number) => fns.F!({ x, y })
        const cell = Math.max((b.wpp * 4) / QUALITY[qualityNow()].samples, (b.xMax - b.xMin) / 900)
        const nx = Math.min(900, Math.ceil((b.xMax - b.xMin) / cell))
        const ny = Math.min(900, Math.ceil((b.yMax - b.yMin) / cell))
        out.segments = implicitSegments(F, b.xMin, b.xMax, b.yMin, b.yMax, nx, ny)
        if (obj.kind === 'inequality') out.fill = inequalityMesh(F, obj.op ?? '<', b.xMin, b.xMax, b.yMin, b.yMax, Math.ceil(nx / 1.5), Math.ceil(ny / 1.5))
      } else if (obj.kind === 'polar' && fns.f) {
        const t0 = obj.tMin ?? 0
        const t1 = obj.tMax ?? 2 * Math.PI
        const r = (t: number) => fns.f!({ theta: t, t })
        out.polylines = sampleParametric((t) => r(t) * Math.cos(t), (t) => r(t) * Math.sin(t), t0, t1, 3000, b.viewH)
      } else if (obj.kind === 'parametric' && fns.fx && fns.fy) {
        out.polylines = sampleParametric((t) => fns.fx!({ t }), (t) => fns.fy!({ t }), obj.tMin ?? 0, obj.tMax ?? 2 * Math.PI, 3000, b.viewH)
      }
    } catch {
      /* invalid function: draw nothing */
    }
    return out
    // `evVersion` is not read here: the compiled functions read the scene's scope through a
    // closure, so a moved slider changes the curve without changing `fns`.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [fns, obj.kind, b.xMin, b.xMax, b.yMin, b.yMax, b.viewH, b.wpp, evVersion, obj.showRoots, obj.showExtrema, obj.op, obj.tMin, obj.tMax])

  useEffect(() => {
    const polys = data.segments ? pairsToPolys(data.segments) : data.polylines
    graphPolylines.set(obj.id, polys)
    return () => {
      graphPolylines.delete(obj.id)
    }
  }, [data, obj.id])

  const width = (obj.width ?? 2.4) + (selected ? 1 : 0) + (hovered ? 0.6 : 0)
  const pool = useMemo(() => new SpanPool(() => overlay.labels, 'measure-label'), [])
  useEffect(() => () => pool.dispose(), [pool])
  const { camera, size } = useThree()
  const { theme, colors } = useGraphColors()

  useFrame(({ camera: cam, size: sz }) => {
    const firstPoly = labelPoints(data)
    if (firstPoly?.length) {
      // Anchor the name near the right edge of the visible part of the curve.
      const vis = firstPoly.filter((p) => {
        const s = toScreen(cam, sz, p)
        return s.x > 40 && s.x < sz.width - 60 && s.y > 30 && s.y < sz.height - 30
      })
      const p = vis[Math.floor(vis.length * 0.85)] ?? firstPoly[0]
      labelAnchors.set(obj.id, { p, dx: 12, dy: -14 })
    } else labelAnchors.delete(obj.id)
    pool.begin()
    if (selected || hovered) {
      for (const k of data.keys) {
        const s = toScreen(cam, sz, [k.x, k.y, 0])
        if (s.x < 0 || s.y < 0 || s.x > sz.width || s.y > sz.height) continue
        pool.place(`(${fmt(k.x, decimals)}, ${fmt(k.y, decimals)})`, s.x + 8, s.y - 14, 'left', colors.key[k.kind])
      }
    }
    pool.end()
  })
  void camera
  void size

  if (obj.kind === 'surface') return <SurfaceView obj={obj} F={fns.F} selected={selected} version={evVersion} wireframe={colors.wireframe} theme={theme} />

  return (
    <>
      {data.fill && data.fill.length > 0 && <FillMesh positions={data.fill} color={obj.color} />}
      {selected && data.polylines.map((p, i) => <FatLine key={`s${i}`} points={p} color={colors.select} width={width + 4} renderOrder={2} />)}
      {data.polylines.map((p, i) => (
        <FatLine key={i} points={p} color={obj.color} width={width} renderOrder={3} />
      ))}
      {data.segments && data.segments.length > 1 && (
        <FatLine points={data.segments} segments color={obj.color} width={width} renderOrder={3} dashed={obj.op === '<' || obj.op === '>'} dashSize={8 * b.wpp} gapSize={5 * b.wpp} />
      )}
      {data.keys.map((k, i) => (
        <KeyDot key={`${theme}${i}`} p={[k.x, k.y, 0]} color={colors.key[k.kind]} />
      ))}
    </>
  )
})

function pairsToPolys(seg: V3[]): V3[][] {
  const out: V3[][] = []
  for (let i = 0; i + 1 < seg.length; i += 2) out.push([seg[i], seg[i + 1]])
  return out
}

function KeyDot({ p, color }: { p: V3; color: string }) {
  return (
    <group
      ref={(g) => {
        if (g) g.position.set(p[0], p[1], p[2])
      }}
    >
      <ScaledDot color={color} />
    </group>
  )
}

function ScaledDot({ color }: { color: string }) {
  const wpp = useView((s) => s.wpp)
  return (
    <mesh scale={wpp} renderOrder={15}>
      <circleGeometry args={[3.6, 20]} />
      <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
    </mesh>
  )
}

function FillMesh({ positions, color }: { positions: Float32Array; color: string }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return g
  }, [positions])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <mesh geometry={geo} renderOrder={0} frustumCulled={false}>
      <meshBasicMaterial color={color} transparent opacity={0.2} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

function SurfaceView({ obj, F, selected, version, wireframe, theme }: { obj: GraphObj; F?: (v: Record<string, number>) => number; selected: boolean; version: unknown; wireframe: string; theme: Theme }) {
  const geo = useMemo(() => {
    if (!F) return null
    const s = surfaceGeometry((x, y) => F({ x, y }), 6, 140)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(s.positions, 3))
    g.setAttribute('color', new THREE.BufferAttribute(s.colors, 3))
    g.setIndex(s.indices)
    g.computeVertexNormals()
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` is the evaluator's result: F reads the scope through a closure, so the same F gives a new surface once a slider moves
  }, [F, version])
  useEffect(() => () => geo?.dispose(), [geo])
  useFrame(() => labelAnchors.set(obj.id, { p: [6, 6, 0] }))
  if (!geo) return null
  return (
    <group>
      <mesh geometry={geo}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.55} metalness={0.05} transparent opacity={selected ? 0.8 : 0.95} />
      </mesh>
      <mesh geometry={geo}>
        <meshBasicMaterial key={theme} color={wireframe} wireframe transparent opacity={0.12} />
      </mesh>
    </group>
  )
}
