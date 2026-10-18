import { memo, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { FatLine } from './FatLine'
import { toScreen } from './cameraUtils'
import { labelAnchors, overlay, SpanPool } from './overlay'
import { crossingLabelsToShow } from './crossingLabels'
import { usePointerStore } from './pointerStore'
import { graphPolylines } from './picking'
import { useView } from './viewState'
import { QUALITY, qualityNow } from './renderer'
import { useScene } from '../core/store'
import type { GraphObj } from '../core/types'
import { solutionsInX } from '../core/visualize'
import { compileScalar, math, preprocess, sceneNames, symbolsOf } from '../math/expr'
import { betweenMesh, carriedSolutions, curveIntersections, implicitSegments, inequalityMesh, keyPointLabel, keyPoints, labelPoints, placeLabels, sampleExplicit, sampleParametric, samplePiecewise, shownKeyPoints, solvedLineXs, verticalLineXs, type KeyPoint, type LabelSpot } from '../math/graphs'
import { circleGraphIntersections } from '../math/intersections'
import { visibleIn } from '../core/visibility'
import { themeColor, useTheme, useThemed } from '../app/theme'
import type { V3 } from '../math/vec'
import { useReleaseLater } from './releaseLater'
import { ParamSurfaceView, PlaneView, SpaceCurveView, SurfaceView } from './Graph3DViews'

const scopeNow = () => useScene.getState().ev.scope

/**
 * Height of one key-point label in pixels: small text plus its padding and border (`.measure-label`),
 * 22 px as measured in the app. At 20, labels stacked a line apart overlapped by 2 px.
 */
const LABEL_LINE = 22
/** A key-point label's width in pixels, judged from its length; a little too wide only spreads labels a little more. */
const labelWidth = (text: string): number => text.length * 7 + 14

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
    const key: Record<KeyPoint['kind'], string> = { root: themeColor('--key-root'), yIntercept: themeColor('--key-intercept'), max: extremum, min: extremum, intersection: themeColor('--key-intercept') }
    return { select: themeColor('--sel-glow'), wireframe: themeColor('--wireframe'), key }
  })
  return { theme, colors }
}

export const GraphView = memo(function GraphView({ obj, selected, hovered, is3D }: { obj: GraphObj; selected: boolean; hovered: boolean; is3D: boolean }) {
  const view = useView()
  // Any scene change may move a slider the graph depends on.
  const evVersion = useScene((s) => s.ev)
  // Only the two settings the labels read, so changing any other setting does not redraw the graph.
  const decimals = useScene((s) => s.settings.decimals)
  const precisionMode = useScene((s) => s.settings.precisionMode)

  // What the scene's names stand for where a bracket is written against them (math/expr.ts preprocess): a
  // slider p in p(1 + x) multiplies, a graph f in f(x + 1) is called. evaluate.ts records them on every evaluation.
  const names = sceneNames()
  const fns = useMemo(() => {
    try {
      switch (obj.kind) {
        case 'explicit':
        case 'area':
          return { f: compileScalar(obj.exprs[0], ['x'], scopeNow, names) }
        case 'implicit':
        case 'inequality':
          // An equation in x alone (x² = 4, (x − 1)² = 0) has no y to plot against: it is a vertical
          // line at each solution, found from the roots of the formula (see `data`). Decided here,
          // once per formula, not on every frame. An inequality keeps its boundary as it was.
          return { F: compileScalar(obj.exprs[0], ['x', 'y'], scopeNow, names), vertical: obj.kind === 'implicit' && !symbolsOf(math.parse(preprocess(obj.exprs[0], names))).includes('y') }
        case 'surface':
          return { F: compileScalar(obj.exprs[0], ['x', 'y'], scopeNow, names) }
        // 3D-2: the graphs in space (render/Graph3DViews.tsx draws them).
        case 'plane':
          return { F: compileScalar(obj.exprs[0], ['x', 'y', 'z'], scopeNow, names) }
        case 'curve3d':
          return { fx: compileScalar(obj.exprs[0], ['t'], scopeNow, names), fy: compileScalar(obj.exprs[1], ['t'], scopeNow, names), fz: compileScalar(obj.exprs[2], ['t'], scopeNow, names) }
        case 'psurface':
          return { fx: compileScalar(obj.exprs[0], ['u', 'v'], scopeNow, names), fy: compileScalar(obj.exprs[1], ['u', 'v'], scopeNow, names), fz: compileScalar(obj.exprs[2], ['u', 'v'], scopeNow, names) }
        case 'polar':
          return { f: compileScalar(obj.exprs[0], ['theta', 't'], scopeNow, names) }
        case 'parametric':
          return { fx: compileScalar(obj.exprs[0], ['t'], scopeNow, names), fy: compileScalar(obj.exprs[1], ['t'], scopeNow, names) }
        case 'piecewise':
          // The formulas are read from exprs, which mirror the pieces one to one: renaming a slider
          // rewrites every graph's exprs, and a piece compiled from its own copy would go on
          // naming a slider that no longer exists and vanish.
          return { pieces: (obj.pieces ?? []).map((p, i) => ({ f: compileScalar(obj.exprs[i] ?? p.expr, ['x'], scopeNow, names), from: p.from, to: p.to })) }
        case 'between':
          return { f: compileScalar(obj.exprs[0], ['x'], scopeNow, names), g: compileScalar(obj.exprs[1], ['x'], scopeNow, names) }
      }
    } catch (e) {
      return { error: String(e) }
    }
    return {}
  }, [obj.kind, obj.exprs, obj.pieces, names])

  const is2DBounds = !is3D
  const b = is2DBounds ? view : { xMin: -10, xMax: 10, yMin: -10, yMax: 10, viewH: 20, wpp: 0.02, widthPx: 1000 }
  // The lines of an equation in x alone are drawn where the command bar said its solutions are: the
  // curve cannot show them all (x^200 underflows to a stretch of zeros, x^(10⁹) − 2 jumps within
  // 10⁻⁶ of 1). Worked out only for the graphs drawn this way, and only when the formula or a value it reads
  // changes (below), never in a frame.
  const formula = obj.exprs[0]
  const typedAs = obj.source
  // P4perf: solving sin(x) = a took 15–19 ms, and it ran on every drag frame and Play step (evVersion), even where
  // the graph carries the bar's own solutions. It runs now only without them, and again only when the formula or
  // the value of a name it reads changes — dragging anything else leaves the lines where they are.
  const carried = carriedSolutions(obj)
  const isCarried = carried !== undefined
  const reads = useMemo(() => {
    try {
      return symbolsOf(math.parse(preprocess(formula ?? '', names))).filter((s) => s !== 'x')
    } catch {
      return []
    }
  }, [formula, names])
  const scopeNowValues = scopeNow()
  const readsKey = reads.map((s) => JSON.stringify(scopeNowValues[s] ?? null)).join('|')
  const solved = useMemo(
    () => (fns.vertical && !isCarried ? solvedLineXs({ exprs: [formula], source: typedAs }, scopeNow(), solutionsInX) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above: readsKey stands for the scope this formula reads
    [fns.vertical, isCarried, formula, typedAs, readsKey]
  )
  const known = carried ?? solved

  const activeSpace = useScene((s) => s.activeSpace)
  const otherGraphsKey = useScene((s) =>
    s.order
      .map((id) => {
        if (id === obj.id) return ''
        const o = s.objects[id]
        return (o?.type === 'graph' || o?.type === 'circle') ? `${id}:${o.visible ? 1 : 0}:${visibleIn(o, s.activeSpace) ? 1 : 0}` : ''
      })
      .filter(Boolean)
      .join(',')
  )

  const data = useMemo(() => {
    const out: { polylines: V3[][]; segments?: V3[]; fill?: Float32Array; keys: KeyPoint[] } = { polylines: [], keys: [] }
    try {
      if (obj.kind === 'explicit' && fns.f) {
        const f = (x: number) => fns.f!({ x })
        const n = Math.min(4000, Math.max(300, Math.round(((b.xMax - b.xMin) / b.wpp / 2) * QUALITY[qualityNow()].samples)))
        out.polylines = sampleExplicit(f, b.xMin, b.xMax, n, b.viewH)
        if (obj.showRoots || obj.showExtrema || selected || hovered) {
          const raw = keyPoints(f, b.xMin, b.xMax, 1200)
          const interKeys: KeyPoint[] = []
          const s = useScene.getState()
          for (const otherId of s.order) {
            if (otherId === obj.id) continue
            const other = s.objects[otherId]
            if (other && other.visible && visibleIn(other, s.activeSpace)) {
              const c = s.ev.values.get(otherId)
              if (other.type === 'graph' && c?.type === 'graph' && c.f) {
                interKeys.push(...curveIntersections(f, c.f, b.xMin, b.xMax))
              } else if (other.type === 'circle' && c?.type === 'circle') {
                const pts = circleGraphIntersections(c.circle, f, { xMin: b.xMin, xMax: b.xMax }, obj)
                for (const p of pts) {
                  interKeys.push({ x: p[0], y: p[1], kind: 'intersection', kinds: ['intersection'] })
                }
              }
            }
          }
          out.keys = shownKeyPoints([...raw, ...interKeys], !!obj.showRoots || selected || hovered, !!obj.showExtrema || selected || hovered)
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
        if (fns.vertical) {
          // Marching squares needs a sign change, which (x − 1)² = 0 never has: the lines come from
          // the roots, touching ones included. Each is two halves out from the middle of the view,
          // so that the name (labelPoints takes the first point) sits beside the line, not on the
          // view's edge.
          const mid = (b.yMin + b.yMax) / 2
          out.segments = verticalLineXs((x) => F(x, 0), b.xMin, b.xMax, undefined, known).flatMap((x): V3[] => [[x, mid, 0], [x, b.yMax, 0], [x, mid, 0], [x, b.yMin, 0]])
        } else {
          const cell = Math.max((b.wpp * 4) / QUALITY[qualityNow()].samples, (b.xMax - b.xMin) / 900)
          const nx = Math.min(900, Math.ceil((b.xMax - b.xMin) / cell))
          const ny = Math.min(900, Math.ceil((b.yMax - b.yMin) / cell))
          out.segments = implicitSegments(F, b.xMin, b.xMax, b.yMin, b.yMax, nx, ny)
          if (obj.kind === 'inequality') out.fill = inequalityMesh(F, obj.op ?? '<', b.xMin, b.xMax, b.yMin, b.yMax, Math.ceil(nx / 1.5), Math.ceil(ny / 1.5))
        }
      } else if (obj.kind === 'piecewise' && fns.pieces) {
        // Sampled at the explicit curve's density over the widest piece, so a short piece is
        // never coarser than the curve beside it; the joins are made in samplePiecewise.
        const widest = Math.max(0, ...fns.pieces.map((p) => Math.abs(p.to - p.from)))
        const n = Math.min(2000, Math.max(100, Math.round((widest / b.wpp / 2) * QUALITY[qualityNow()].samples)))
        out.polylines = samplePiecewise(
          fns.pieces.map((p) => ({ f: (x: number) => p.f({ x }), from: p.from, to: p.to })),
          n,
          b.viewH
        )
      } else if (obj.kind === 'between' && fns.f && fns.g) {
        const region = betweenMesh((x) => fns.f!({ x }), (x) => fns.g!({ x }), obj.tMin ?? 0, obj.tMax ?? 1, 400, b.viewH)
        out.fill = region.fill
        out.polylines = region.outline
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
  }, [fns, obj.kind, b.xMin, b.xMax, b.yMin, b.yMax, b.viewH, b.wpp, evVersion, obj.showRoots, obj.showExtrema, obj.op, obj.tMin, obj.tMax, obj.pieces, known, selected, hovered, otherGraphsKey, activeSpace])

  useEffect(() => {
    const polys = data.segments ? pairsToPolys(data.segments) : data.polylines
    graphPolylines.set(obj.id, polys)
    return () => {
      graphPolylines.delete(obj.id)
    }
  }, [data, obj.id])

  // Worded once per set of points and precision, not on every frame.
  const keyLabels = useMemo(() => data.keys.map((k) => keyPointLabel(k, { decimals, precisionMode })), [data.keys, decimals, precisionMode])

  const width = (obj.width ?? 2.4) + (selected ? 1 : 0) + (hovered ? 0.6 : 0)
  const pool = useMemo(() => new SpanPool(() => overlay.labels, 'measure-label'), [])
  useEffect(() => () => pool.dispose(), [pool])
  // Kept though camera and size are not read: useThree() subscribes the graph to the canvas, so it redraws
  // its labels when the view is resized (removing it needs a test of that first; CW14 left it).
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
      // Get pointer position from store
      const pointerX = usePointerStore.getState().x
      const pointerY = usePointerStore.getState().y
      const pointer = pointerX !== null && pointerY !== null ? { x: pointerX, y: pointerY } : null

      // Build screen points for all keys
      const screenPoints = data.keys.map((k) => toScreen(cam, sz, [k.x, k.y, 0]))

      // Filter to show only the appropriate crossing labels
      const visibleKeyIndices = crossingLabelsToShow(data.keys, screenPoints, pointer, null)

      const onScreen: number[] = []
      const spots: LabelSpot[] = []
      visibleKeyIndices.forEach((i) => {
        const s = screenPoints[i]
        // A position that is not a number passes every bounds test below and would be written as
        // translate(NaNpx, …), which parks the label in the corner of the view.
        if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) return
        if (s.x < 0 || s.y < 0 || s.x > sz.width || s.y > sz.height) return
        onScreen.push(i)
        spots.push({ x: s.x, y: s.y, w: labelWidth(keyLabels[i]) })
      })
      // Two points close together on screen would otherwise print their labels over each other, and
      // one near the right edge of the view has its label to the left of it, not cut off by the edge.
      const placed = placeLabels(spots, LABEL_LINE, sz.width, sz.height)
      onScreen.forEach((i, j) => pool.place(keyLabels[i], placed[j].x, placed[j].y, placed[j].align, colors.key[data.keys[i].kind]))
    }
    pool.end()
  })
  void camera
  void size

  if (obj.kind === 'surface') return <SurfaceView obj={obj} F={fns.F} selected={selected} version={evVersion} theme={theme} />
  if (obj.kind === 'psurface') return <ParamSurfaceView obj={obj} fx={fns.fx} fy={fns.fy} fz={fns.fz} selected={selected} version={evVersion} theme={theme} />
  if (obj.kind === 'plane') return <PlaneView obj={obj} F={fns.F} selected={selected} version={evVersion} />
  if (obj.kind === 'curve3d') return <SpaceCurveView obj={obj} fx={fns.fx} fy={fns.fy} fz={fns.fz} width={width} selected={selected} selectColour={colors.select} version={evVersion} />

  return (
    <>
      {data.fill && data.fill.length > 0 && <FillMesh positions={data.fill} color={obj.color} />}
      {selected && data.polylines.map((p, i) => <FatLine key={`s${i}`} points={p} color={colors.select} width={width + 1.6} renderOrder={2} />)}
      {selected && data.segments && data.segments.length > 1 && (
        <FatLine points={data.segments} segments color={colors.select} width={width + 1.6} renderOrder={2} dashed={obj.op === '<' || obj.op === '>'} dashSize={8 * b.wpp} gapSize={5 * b.wpp} />
      )}
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
  useReleaseLater(geo, (g) => g.dispose())
  return (
    <mesh geometry={geo} renderOrder={0} frustumCulled={false}>
      <meshBasicMaterial color={color} transparent opacity={0.2} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}
