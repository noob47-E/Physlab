import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { FatLine } from './FatLine'
import { toScreen, worldPerPixel } from './cameraUtils'
import { labelAnchors, overlay, SpanPool } from './overlay'
import { useScene } from '../core/store'
import type { AngleObj, CircleObj, Computed, ObjId, PointObj, PolygonObj, SceneObject, TextObj, VectorObj } from '../core/types'
import { isFree } from '../core/evaluate'
import { freeCapitals } from '../core/naming'
import { angleAt, centroid, orientedAngleAt, triangleInfo } from '../math/geometry'
import { add, angleBetween, dot, heading, len, normalize, scale, sub, toDeg, type V3 } from '../math/vec'
import { formatMeasure } from '../math/format'
import { decompose } from '../math/decompose'
import { headingArc } from '../math/vectorSolver'
import { seriesColor, themeColor, useTheme } from '../app/theme'

const UP = new THREE.Vector3(0, 1, 0)

/**
 * The drawing's colours come from the stylesheet so both themes work; every view re-reads them
 * when the theme flips. Literal hex values here were invisible in the light theme, and WebGPU
 * compiles a material's colour in, so a colour change must arrive as a new material.
 */
function useDrawingColors() {
  const theme = useTheme((s) => s.theme)
  return useMemo(
    () => ({
      select: themeColor('--sel-glow'),
      xComp: themeColor('--bad'),
      yComp: themeColor('--good'),
      arc: themeColor('--warn'),
      dashed: themeColor('--text-faint'),
      outline: themeColor('--bg-0'),
      derived: themeColor('--text-faint'),
      strong: themeColor('--text-strong'),
      /** Fill colours for the parts of a decomposed shape: the stylesheet's series colours in turn. */
      part: (i: number) => seriesColor(i)
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme]
  )
}

export interface ViewProps<T extends SceneObject, C extends Computed> {
  obj: T
  c: C
  selected: boolean
  hovered: boolean
  is3D: boolean
  /** Changes when the camera zooms; forces pixel-sized decorations to rebuild. */
  zoom?: number
}

// ---------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------

export const PointView = memo(function PointView({ obj, c, selected, hovered, is3D }: ViewProps<PointObj, Extract<Computed, { type: 'point' }>>) {
  const group = useRef<THREE.Group>(null)
  const free = isFree(obj)
  const r = (obj.size ?? (free ? 5 : 4)) + (hovered ? 1 : 0)
  const pos = c.p

  useFrame(({ camera, size }) => {
    const g = group.current
    if (!g) return
    g.position.set(pos[0], pos[1], pos[2])
    g.scale.setScalar(worldPerPixel(camera, size, pos))
    if (!is3D) g.quaternion.identity()
    else g.quaternion.copy(camera.quaternion)
    labelAnchors.set(obj.id, { p: pos, dx: 10, dy: -12 })
  })

  const colors = useDrawingColors()
  const fill = free ? obj.color : colors.derived
  return (
    <group ref={group}>
      {selected && (
        <mesh renderOrder={20}>
          <ringGeometry args={[r + 3, r + 6, 32]} />
          <meshBasicMaterial color={colors.select} transparent opacity={0.85} depthTest={false} depthWrite={false} />
        </mesh>
      )}
      <mesh renderOrder={21}>
        <circleGeometry args={[r + 1.6, 28]} />
        <meshBasicMaterial color={colors.outline} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh renderOrder={22}>
        <circleGeometry args={[r, 28]} />
        <meshBasicMaterial color={fill} depthTest={false} depthWrite={false} />
      </mesh>
    </group>
  )
})

// ---------------------------------------------------------------------------
// Vectors
// ---------------------------------------------------------------------------

function useArrowMaterials(color: string, is3D: boolean) {
  const mat = useMemo(() => {
    if (is3D) {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05 })
      m.emissive = new THREE.Color(color).multiplyScalar(0.35)
      return m
    }
    return new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false })
  }, [color, is3D])
  useEffect(() => () => mat.dispose(), [mat])
  return mat
}

const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 14)
const coneGeo = new THREE.ConeGeometry(1, 1, 18)

/** Imperatively positions a shaft+head arrow mesh pair. */
function placeArrow(shaft: THREE.Mesh, head: THREE.Mesh, tail: V3, comp: V3, wpp: number, thick: number, headPx = 15, headRadPx = 6) {
  const L = len(comp)
  const visible = L > 1e-9
  shaft.visible = head.visible = visible
  if (!visible) return
  const dir = new THREE.Vector3(comp[0] / L, comp[1] / L, comp[2] / L)
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir)
  const headLen = Math.min(headPx * wpp, L * 0.45)
  const shaftLen = Math.max(L - headLen, 1e-6)
  shaft.quaternion.copy(q)
  shaft.position.set(tail[0] + dir.x * shaftLen * 0.5, tail[1] + dir.y * shaftLen * 0.5, tail[2] + dir.z * shaftLen * 0.5)
  shaft.scale.set(thick * wpp, shaftLen, thick * wpp)
  head.quaternion.copy(q)
  head.position.set(tail[0] + dir.x * (L - headLen / 2), tail[1] + dir.y * (L - headLen / 2), tail[2] + dir.z * (L - headLen / 2))
  const hr = Math.min(headRadPx * wpp, headLen * 0.6)
  head.scale.set(hr, headLen, hr)
}

export function Arrow({ tail, comp, color, is3D, thick = 1.7, renderOrder = 12, headPx, headRadPx }: { tail: V3; comp: V3; color: string; is3D: boolean; thick?: number; renderOrder?: number; headPx?: number; headRadPx?: number }) {
  const shaft = useRef<THREE.Mesh>(null)
  const head = useRef<THREE.Mesh>(null)
  const mat = useArrowMaterials(color, is3D)
  useFrame(({ camera, size }) => {
    if (!shaft.current || !head.current) return
    placeArrow(shaft.current, head.current, tail, comp, worldPerPixel(camera, size, add(tail, scale(comp, 0.5))), thick, headPx, headRadPx)
  })
  return (
    <>
      <mesh ref={shaft} geometry={cylGeo} material={mat} renderOrder={renderOrder} />
      <mesh ref={head} geometry={coneGeo} material={mat} renderOrder={renderOrder} />
    </>
  )
}

function arcPoints(center: V3, r: number, from: number, to: number, steps = 48): V3[] {
  const pts: V3[] = []
  for (let i = 0; i <= steps; i++) {
    const t = from + ((to - from) * i) / steps
    pts.push([center[0] + r * Math.cos(t), center[1] + r * Math.sin(t), center[2]])
  }
  return pts
}

/** Arc in the plane spanned by two directions u, v starting at a vertex (3D-safe). */
function arcBetween(vertex: V3, u: V3, v: V3, r: number, steps = 40): V3[] {
  const a = normalize(u)
  const total = angleBetween(u, v)
  let perp = sub(normalize(v), scale(a, Math.cos(total)))
  const pl = len(perp)
  if (pl < 1e-9) perp = Math.abs(a[2]) < 0.9 ? [-a[1], a[0], 0] : [0, -a[2], a[1]]
  perp = normalize(perp)
  const pts: V3[] = []
  for (let i = 0; i <= steps; i++) {
    const t = (total * i) / steps
    pts.push(add(vertex, add(scale(a, r * Math.cos(t)), scale(perp, r * Math.sin(t)))))
  }
  return pts
}

export const VectorView = memo(function VectorView({ obj, c, selected, hovered, is3D }: ViewProps<VectorObj, Extract<Computed, { type: 'vector' }>>) {
  const { tail, comp } = c
  const head = add(tail, comp)
  const settings = useScene((s) => s.settings)
  const base = useScene((s) => s.baseline?.get(obj.id))
  const dragging = useScene((s) => s.gesture) && selected
  const { camera, size } = useThree()
  const pool = useMemo(() => new SpanPool(() => overlay.labels, 'measure-label'), [])
  useEffect(() => () => pool.dispose(), [pool])
  const wpp = worldPerPixel(camera, size, head)

  const colors = useDrawingColors()
  const showComps = obj.showComponents || selected
  const L = len(comp)
  const theta = heading(comp)
  // From the +x axis the short way round: a vector at 300° gets a 60° arc below the axis, not
  // a 300° sweep with the label stranded on the far side.
  const arc = headingArc(theta)
  const planar = Math.abs(comp[2]) < 1e-9 && Math.abs(tail[2]) < 1e-9

  useFrame(({ camera: cam, size: sz }) => {
    const a = toScreen(cam, sz, tail)
    const b = toScreen(cam, sz, head)
    let nx = -(b.y - a.y)
    let ny = b.x - a.x
    const nl = Math.hypot(nx, ny) || 1
    nx /= nl
    ny /= nl
    if (ny > 0) {
      nx = -nx
      ny = -ny
    }
    labelAnchors.set(obj.id, { p: add(tail, scale(comp, 0.55)), dx: nx * 16, dy: ny * 16 })

    pool.begin()
    {
      // The name/size/angle chip comes from the label layer; here only drag changes and components.
      if (dragging && base?.type === 'vector' && b.visible) {
        const dTheta = angleBetween(base.comp, comp)
        const sign = Math.sign(base.comp[0] * comp[1] - base.comp[1] * comp[0]) || 1
        const parts = [`Δθ = ${sign < 0 ? '−' : '+'}${formatMeasure(dTheta, 'angle', settings)}`, `ΔL = ${formatMeasure(L - len(base.comp), 'length', settings)}`]
        pool.place(parts.join('   '), b.x + 16, b.y + 22, 'left')
      }
      if (showComps && planar) {
        const ax = toScreen(cam, sz, [tail[0] + comp[0], tail[1], tail[2]])
        const ay = toScreen(cam, sz, [tail[0], tail[1] + comp[1], tail[2]])
        pool.place(`${obj.name}x = ${formatMeasure(comp[0], 'length', settings)}`, (a.x + ax.x) / 2, ax.y + (comp[1] >= 0 ? 16 : -16), 'center', colors.xComp)
        pool.place(`${obj.name}y = ${formatMeasure(comp[1], 'length', settings)}`, ay.x + (comp[0] >= 0 ? -10 : 10), (a.y + ay.y) / 2, comp[0] >= 0 ? 'right' : 'left', colors.yComp)
        if (L > 1e-9) {
          const mid = arc.mid
          const lp = toScreen(cam, sz, [tail[0] + Math.cos(mid) * 46 * worldPerPixel(cam, sz, tail), tail[1] + Math.sin(mid) * 46 * worldPerPixel(cam, sz, tail), tail[2]])
          pool.place(`θ`, lp.x, lp.y, 'center', colors.arc)
        }
      }
    }
    pool.end()
  })

  const thick = selected ? 2.4 : hovered ? 2.1 : 1.7
  return (
    <>
      {selected && <Arrow tail={tail} comp={comp} color={colors.select} is3D={is3D} thick={thick + 2.2} renderOrder={11} headPx={19} headRadPx={8.5} />}
      <Arrow tail={tail} comp={comp} color={obj.color} is3D={is3D} thick={thick} />
      {showComps && planar && L > 1e-9 && (
        <>
          <Arrow tail={tail} comp={[comp[0], 0, 0]} color={colors.xComp} is3D={is3D} thick={1.2} renderOrder={8} headPx={10} headRadPx={4.5} />
          <Arrow tail={tail} comp={[0, comp[1], 0]} color={colors.yComp} is3D={is3D} thick={1.2} renderOrder={8} headPx={10} headRadPx={4.5} />
          <FatLine points={[[tail[0] + comp[0], tail[1], tail[2]], head, [tail[0], tail[1] + comp[1], tail[2]]]} color={colors.dashed} width={1.2} dashed dashSize={6 * wpp} gapSize={4 * wpp} renderOrder={7} />
          <FatLine points={arcPoints(tail, 30 * wpp, arc.from, arc.to)} color={colors.arc} width={1.6} renderOrder={9} />
        </>
      )}
      {showComps && !planar && L > 1e-9 && (
        <FatLine points={[head, [head[0], head[1], tail[2]], tail]} color={colors.dashed} width={1.2} dashed dashSize={0.12} gapSize={0.08} renderOrder={7} />
      )}
    </>
  )
})

// ---------------------------------------------------------------------------
// Lines, segments, rays
// ---------------------------------------------------------------------------

export const LineLikeView = memo(function LineLikeView({ obj, c, selected, hovered }: ViewProps<SceneObject, Extract<Computed, { type: 'segment' | 'ray' | 'line' }>>) {
  const { camera, size } = useThree()
  const colors = useDrawingColors()
  const wpp = worldPerPixel(camera, size)
  const big = Math.max(wpp * 40000, 200)
  const { p, d } = c.line
  const u = normalize(d)
  const pts: V3[] =
    c.type === 'segment' ? [p, add(p, d)] : c.type === 'ray' ? [p, add(p, scale(u, big))] : [add(p, scale(u, -big)), add(p, scale(u, big))]
  const width = selected ? 3.2 : hovered ? 2.8 : 2.2

  useFrame(({ camera: cam, size: sz }) => {
    // Put the label beside the middle of the segment, on the side away from the screen centre.
    const mid = c.type === 'segment' ? add(p, scale(d, 0.5)) : add(p, scale(u, 1.5))
    const a = toScreen(cam, sz, p)
    const b = toScreen(cam, sz, add(p, d))
    let nx = -(b.y - a.y)
    let ny = b.x - a.x
    const nl = Math.hypot(nx, ny) || 1
    nx /= nl
    ny /= nl
    if (ny > 0) {
      nx = -nx
      ny = -ny
    }
    labelAnchors.set(obj.id, { p: mid, dx: nx * 14, dy: ny * 14 })
  })
  return (
    <>
      {selected && <FatLine points={pts} color={colors.select} width={width + 4} renderOrder={4} />}
      <FatLine points={pts} color={obj.color} width={width} renderOrder={5} />
    </>
  )
})

// ---------------------------------------------------------------------------
// Circles
// ---------------------------------------------------------------------------

export const CircleView = memo(function CircleView({ obj, c, selected, hovered }: ViewProps<CircleObj, Extract<Computed, { type: 'circle' }>>) {
  const { c: center, r } = c.circle
  const colors = useDrawingColors()
  const pts = useMemo(() => arcPoints(center, r, 0, Math.PI * 2, 160), [center, r])
  useFrame(() => labelAnchors.set(obj.id, { p: [center[0] + r * Math.SQRT1_2, center[1] + r * Math.SQRT1_2, center[2]], dx: 10, dy: -10 }))
  return (
    <>
      {obj.fill && (
        <mesh position={center} scale={[r, r, 1]} renderOrder={1}>
          <circleGeometry args={[1, 96]} />
          <meshBasicMaterial color={obj.color} transparent opacity={0.12} depthTest={false} depthWrite={false} />
        </mesh>
      )}
      {selected && <FatLine points={pts} color={colors.select} width={6} renderOrder={4} />}
      <FatLine points={pts} color={obj.color} width={hovered ? 2.8 : 2.2} renderOrder={5} />
    </>
  )
})

// ---------------------------------------------------------------------------
// Polygons & triangles (with live side lengths and angles)
// ---------------------------------------------------------------------------

export const PolygonView = memo(function PolygonView({ obj, c, selected, hovered }: ViewProps<PolygonObj, Extract<Computed, { type: 'polygon' }>>) {
  const pts = c.pts
  const settings = useScene((s) => s.settings)
  const sideSelected = useScene((s) => s.selection.some((id) => {
    const o = s.objects[id]
    return o?.type === 'segment' && obj.points.includes(o.a) && obj.points.includes(o.b)
  }))
  const pool = useMemo(() => new SpanPool(() => overlay.labels, 'measure-label'), [])
  useEffect(() => () => pool.dispose(), [pool])
  const { camera, size } = useThree()
  const colors = useDrawingColors()
  const wpp = worldPerPixel(camera, size, centroid(pts))

  const geometry = useMemo(() => {
    if (pts.length < 3) return null
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])))
    const g = new THREE.ShapeGeometry(shape)
    const z = pts[0][2]
    if (z) g.translate(0, 0, z)
    return g
  }, [pts])
  useEffect(() => () => geometry?.dispose(), [geometry])

  const showMeasures = selected || sideSelected || obj.showAngles
  const orientation = pts.length >= 3 ? Math.sign(signedArea(pts)) || 1 : 1

  useFrame(({ camera: cam, size: sz }) => {
    labelAnchors.set(obj.id, { p: centroid(pts) })
    pool.begin()
    // Side lengths come from the side segments' own labels and the area from the polygon label,
    // so only interior angles are drawn here.
    if (showMeasures && pts.length >= 3) {
      pts.forEach((v, i) => {
        const prev = pts[(i - 1 + pts.length) % pts.length]
        const next = pts[(i + 1) % pts.length]
        const ang = pts.length === 3 ? angleAt(prev, v, next) : interiorAngle(prev, v, next, orientation)
        let bis = normalize(add(normalize(sub(prev, v)), normalize(sub(next, v))))
        if (pts.length > 3 && ang > Math.PI) bis = scale(bis, -1)
        const w = worldPerPixel(cam, sz, v)
        const lp = toScreen(cam, sz, add(v, scale(bis, 42 * w)))
        pool.place(formatMeasure(ang, 'angle', settings), lp.x, lp.y, 'center', colors.arc)
      })
    }
    pool.end()
  })

  const arcs = showMeasures && pts.length >= 3
    ? pts.map((v, i) => {
        const prev = pts[(i - 1 + pts.length) % pts.length]
        const next = pts[(i + 1) % pts.length]
        const ang = angleAt(prev, v, next)
        const r = 22 * wpp
        if (Math.abs(toDeg(ang) - 90) < 1e-6) {
          const u1 = scale(normalize(sub(prev, v)), r * 0.6)
          const u2 = scale(normalize(sub(next, v)), r * 0.6)
          return [add(v, u1), add(add(v, u1), u2), add(v, u2)] as V3[]
        }
        return arcBetween(v, sub(prev, v), sub(next, v), r)
      })
    : []

  return (
    <>
      {geometry && !obj.decomposed && (
        <mesh geometry={geometry} renderOrder={0}>
          <meshBasicMaterial color={obj.color} transparent opacity={selected ? 0.3 : hovered ? 0.24 : obj.fill ? 0.16 : 0} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {obj.decomposed && pts.length >= 3 && <DecomposedParts obj={obj} pts={pts} wpp={wpp} />}
      {arcs.map((a, i) => (
        <FatLine key={i} points={a} color={colors.arc} width={1.6} renderOrder={6} />
      ))}
    </>
  )
})

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

/** Right-angle marks where a cut meets a side of the shape at 90°. */
function rightAngleMarks(cuts: [V3, V3][], pts: V3[], size: number): V3[][] {
  const marks: V3[][] = []
  for (const [p, q] of cuts) {
    const d = normalize(sub(q, p))
    for (const end of [p, q] as V3[]) {
      const dir = end === p ? d : scale(d, -1)
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]
        const b = pts[(i + 1) % pts.length]
        const e = normalize(sub(b, a))
        const along = dot(sub(end, a), e)
        if (along < -1e-7 || along > len(sub(b, a)) + 1e-7) continue
        if (len(sub(end, add(a, scale(e, along)))) > 1e-7) continue
        if (Math.abs(dot(dir, e)) > 1e-6) continue
        // Point the mark into the side, on whichever end has room.
        const side = along > len(sub(b, a)) / 2 ? scale(e, -1) : e
        marks.push([add(end, scale(side, size)), add(add(end, scale(side, size)), scale(dir, size)), add(end, scale(dir, size))])
        break
      }
    }
  }
  return marks
}

/** Component shapes drawn slightly apart, with dashed cut ("gap") lines and Roman numerals. */
function DecomposedParts({ obj, pts, wpp }: { obj: PolygonObj; pts: V3[]; wpp: number }) {
  const dec = useMemo(() => decompose(pts, obj.decomposeGoal ?? 'basic', obj.decomposeIndex ?? 0), [pts, obj.decomposeGoal, obj.decomposeIndex])
  const objects = useScene((s) => s.objects)
  const letters = useMemo(
    () => freeCapitals(Object.values(objects).map((o) => o.name), dec.newPoints.length),
    [objects, dec.newPoints.length]
  )
  const marks = useMemo(() => rightAngleMarks(dec.cuts, pts, 14 * wpp), [dec.cuts, pts, wpp])
  const colors = useDrawingColors()
  const pool = useMemo(() => new SpanPool(() => overlay.labels, 'measure-label part-label'), [])
  useEffect(() => () => pool.dispose(), [pool])
  const gap = 4 * wpp
  const geos = useMemo(
    () =>
      dec.parts.map((part) => {
        const c = centroid(part.pts)
        const inset = part.pts.map((p) => {
          const d = sub(p, c)
          const l = len(d)
          return l > gap * 2 ? add(c, scale(d, (l - gap) / l)) : p
        })
        return new THREE.ShapeGeometry(new THREE.Shape(inset.map((p) => new THREE.Vector2(p[0], p[1]))))
      }),
    [dec, gap]
  )
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos])
  useFrame(({ camera, size }) => {
    pool.begin()
    if (dec.parts.length > 1) {
      dec.parts.forEach((part, i) => {
        const s = toScreen(camera, size, centroid(part.pts))
        pool.place(ROMAN[i] ?? String(i + 1), s.x, s.y, 'center', colors.part(i))
      })
      // Letters for the corners the cut created.
      dec.newPoints.forEach((p, i) => {
        const s = toScreen(camera, size, p)
        pool.place(letters[i] ?? '', s.x + 12, s.y - 12, 'center', colors.strong)
      })
    }
    pool.end()
  })
  return (
    <>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} renderOrder={0}>
          <meshBasicMaterial color={colors.part(i)} transparent opacity={0.28} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {dec.cuts.map((cut, i) => (
        <FatLine key={`c${i}`} points={cut} color={colors.strong} width={2} dashed dashSize={8 * wpp} gapSize={6 * wpp} renderOrder={7} />
      ))}
      {marks.map((m, i) => (
        <FatLine key={`m${i}`} points={m} color={colors.arc} width={1.6} renderOrder={8} />
      ))}
    </>
  )
}

function signedArea(pts: V3[]) {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    s += p[0] * q[1] - q[0] * p[1]
  }
  return s
}

function interiorAngle(prev: V3, v: V3, next: V3, orientation: number) {
  const a = orientedAngleAt(next, v, prev)
  return orientation > 0 ? a : 2 * Math.PI - a
}

// ---------------------------------------------------------------------------
// Angles
// ---------------------------------------------------------------------------

export const AngleView = memo(function AngleView({ obj, c, selected }: ViewProps<AngleObj, Extract<Computed, { type: 'angle' }>>) {
  const { camera, size } = useThree()
  const wpp = worldPerPixel(camera, size, c.vertex)
  const r = 32 * wpp
  const u = sub(c.a, c.vertex)
  const w = sub(c.b, c.vertex)
  const isRight = Math.abs(toDeg(c.value) - 90) < 1e-6
  let pts: V3[]
  if (obj.oriented) {
    const from = Math.atan2(u[1], u[0])
    pts = arcPoints(c.vertex, r, from, from + c.value)
  } else if (isRight) {
    const u1 = scale(normalize(u), r * 0.6)
    const u2 = scale(normalize(w), r * 0.6)
    pts = [add(c.vertex, u1), add(add(c.vertex, u1), u2), add(c.vertex, u2)]
  } else {
    pts = arcBetween(c.vertex, u, w, r)
  }
  const midIdx = Math.floor(pts.length / 2)
  const labelDir = normalize(sub(pts[midIdx], c.vertex))
  useFrame(({ camera: cam, size: sz }) => {
    labelAnchors.set(obj.id, { p: add(c.vertex, scale(labelDir, 52 * worldPerPixel(cam, sz, c.vertex))) })
  })
  const sector = useMemo(() => {
    if (pts.length < 3 || isRight) return null
    const shape = new THREE.Shape([new THREE.Vector2(c.vertex[0], c.vertex[1]), ...pts.map((p) => new THREE.Vector2(p[0], p[1]))])
    return new THREE.ShapeGeometry(shape)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts.map((p) => p.join(',')).join(';')])
  useEffect(() => () => sector?.dispose(), [sector])
  return (
    <>
      {sector && (
        <mesh geometry={sector} renderOrder={1}>
          <meshBasicMaterial color={obj.color} transparent opacity={selected ? 0.4 : 0.22} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      <FatLine points={pts} color={obj.color} width={selected ? 3 : 2} renderOrder={6} />
    </>
  )
})

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export const TextView = memo(function TextView({ obj, c }: ViewProps<TextObj, Extract<Computed, { type: 'text' }>>) {
  useFrame(() => labelAnchors.set(obj.id, { p: c.p }))
  return null
})

export type { ObjId }
