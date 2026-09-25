import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { FatLine } from './FatLine'
import { toScreen, worldPerPixel } from './cameraUtils'
import { labelAnchors, overlay, SpanPool } from './overlay'
import { useScene } from '../core/store'
import type { AngleObj, CircleObj, Computed, ObjId, PointObj, PolygonObj, SceneObject, TextObj, VectorObj } from '../core/types'
import { isFree } from '../core/evaluate'
import { visibleIn } from '../core/visibility'
import { componentTexts, freeCapitals } from '../core/naming'
import { angleAt, centroid, orientedAngleAt } from '../math/geometry'
import { add, angleBetween, dot, heading, len, normalize, scale, sub, toDeg, type V3 } from '../math/vec'
import { formatMeasure } from '../math/format'
import { decompose, type Decomposition } from '../math/decompose'
import { fillOutline, fillsWhole } from './fillMath'
import { headingArc } from '../math/vectorSolver'
import { SERIES_COUNT, seriesColor, shownColor, themeColor, useTheme } from '../app/theme'
import { isResultArrow, RESULT_HEAD_GAP_PX } from './colourMix'
import { arrowHead, HALO_TIP_PX, HEAD_PX, pickLabelOffset, pointHalo, pointRadius, type Px } from './viewMath'
import { pieceNameAnchor } from './pieceLabels'
import { BatchedArrow, useArrowBatched } from './ArrowBatch'

const UP = new THREE.Vector3(0, 1, 0)

/**
 * Every point on the drawing being looked at, projected to the screen once per frame and shared
 * by every point's label placement. Each point used to project every other point for itself:
 * n² projections a frame, 90 000 for a 300-point scatter sent to the drawing. R3F advances the
 * clock once before any useFrame runs, so its reading tells one frame from the next.
 */
const pointsOnScreen = { at: -1, w: 0, h: 0, pts: [] as (Px & { id: ObjId })[] }
function projectPoints(camera: THREE.Camera, size: { width: number; height: number }, at: number): (Px & { id: ObjId })[] {
  const cache = pointsOnScreen
  if (cache.at === at && cache.w === size.width && cache.h === size.height) return cache.pts
  const { objects, order, ev, activeSpace } = useScene.getState()
  const pts: (Px & { id: ObjId })[] = []
  for (const id of order) {
    const o = objects[id]
    const oc = ev.values.get(id)
    // The same rule SceneObjects draws by: a point in another drawing's space is not on screen
    // and must not push a letter off its corner.
    if (!o || !o.visible || !visibleIn(o, activeSpace) || oc?.type !== 'point') continue
    const sp = toScreen(camera, size, oc.p)
    if (sp.visible) pts.push({ id, x: sp.x, y: sp.y })
  }
  cache.at = at
  cache.w = size.width
  cache.h = size.height
  cache.pts = pts
  return pts
}

/**
 * The drawing's colours come from the stylesheet so both themes work; every view re-reads them
 * when the theme flips. Literal hex values here were invisible in the light theme, and WebGPU
 * compiles a material's colour in, so a colour change must arrive as a new material.
 */
function useDrawingColors() {
  const theme = useTheme((s) => s.theme)
  return useMemo(
    () => ({
      theme,
      select: themeColor('--sel-glow'),
      // Their own pair, apart for colour-blind eyes too: --bad and --good were 3.1 apart for a
      // deuteranope in Moonlight Gold (Fix 2).
      xComp: themeColor('--vec-x'),
      yComp: themeColor('--vec-y'),
      result: themeColor('--vec-result'),
      arc: themeColor('--warn'),
      dashed: themeColor('--text-faint'),
      outline: themeColor('--bg-0'),
      derived: themeColor('--text-faint'),
      strong: themeColor('--text-strong'),
      /**
       * Fill colours for the parts of a decomposed shape: the stylesheet's series colours in turn,
       * read once here rather than through getComputedStyle for every part on every frame.
       */
      series: Array.from({ length: SERIES_COUNT }, (_, i) => seriesColor(i))
    }),
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
  const r = pointRadius(obj.size, free, hovered)
  const pos = c.p

  useFrame(({ camera, size, clock }) => {
    const g = group.current
    if (!g) return
    g.position.set(pos[0], pos[1], pos[2])
    g.scale.setScalar(worldPerPixel(camera, size, pos))
    if (!is3D) g.quaternion.identity()
    else g.quaternion.copy(camera.quaternion)
    // The letter sits up and to the right unless another point is there; then it takes the next
    // free corner. Only points within reach are offered, so a crowded drawing costs little.
    const me = toScreen(camera, size, pos)
    const near: Px[] = []
    for (const sp of projectPoints(camera, size, clock.elapsedTime)) {
      if (sp.id !== obj.id && Math.abs(sp.x - me.x) < 40 && Math.abs(sp.y - me.y) < 40) near.push(sp)
    }
    labelAnchors.set(obj.id, { p: pos, ...pickLabelOffset({ x: me.x, y: me.y, r }, near) })
  })

  const colors = useDrawingColors()
  const fill = free ? shownColor(obj) : colors.derived
  return (
    <group ref={group}>
      {selected && (
        <mesh renderOrder={20}>
          <ringGeometry args={[r + 3, r + 6, 32]} />
          <meshBasicMaterial key={colors.theme} color={colors.select} transparent opacity={0.85} depthTest={false} depthWrite={false} />
        </mesh>
      )}
      <mesh renderOrder={21}>
        <circleGeometry args={[pointHalo(r), 28]} />
        <meshBasicMaterial key={colors.theme} color={colors.outline} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh renderOrder={22}>
        <circleGeometry args={[r, 28]} />
        {/* Keyed like its siblings: a derived point's grey follows the theme, and a free point's
            colour can be edited; WebGPU ignores either change without a fresh material. */}
        <meshBasicMaterial key={`${colors.theme}${fill}`} color={fill} depthTest={false} depthWrite={false} />
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
    // Double-sided so the flat head is never culled when the quaternion that turns it flips it over.
    return new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, side: THREE.DoubleSide })
  }, [color, is3D])
  useEffect(() => () => mat.dispose(), [mat])
  return mat
}

const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 14)
const coneGeo = new THREE.ConeGeometry(1, 1, 18)
/** A flat 2-D head: base across the x axis, apex at +y, scaled to the head's width and length. */
const flatHeadGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 0, 1, 0], 3))

/**
 * Imperatively positions a shaft+head arrow mesh pair. In 2-D the head is a flat triangle that
 * keeps its pixel size at every zoom (`arrowHead`, 12 px and 25° unless told otherwise); the 3-D
 * view keeps a cone, whose radius is `headRadPx`. `tipPx` pushes the tip that many pixels past
 * the vector's end, for a halo that has to show all round the head. Exported so
 * tests/arrowBatch.test.ts can hold the batched path (render/arrowBatchMath.ts) to it.
 */
export function placeArrow(shaft: THREE.Mesh, head: THREE.Mesh, tail: V3, comp: V3, wpp: number, thick: number, is3D: boolean, headPx?: number, headRadPx = 6, tipPx = 0) {
  // The 2-D camera looks straight down z, so the arrow is laid out from its projection: turning
  // the flat head to a direction with a z component tilts its base out of the screen plane, and
  // what is seen of it is a skewed sliver (the cone was round, so this never showed).
  const flat: V3 = is3D ? comp : [comp[0], comp[1], 0]
  const L0 = len(flat)
  const visible = L0 > 1e-9
  shaft.visible = head.visible = visible
  if (!visible) return
  const L = L0 + tipPx * wpp
  const dir = new THREE.Vector3(flat[0] / L0, flat[1] / L0, flat[2] / L0)
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir)
  // The 3-D cone keeps the 15 px it always had; the flat head is the 12 px the 2-D drawing uses.
  const { headLen, halfWidth, shaftLen } = arrowHead(L, wpp, headPx ?? (is3D ? 15 : HEAD_PX))
  shaft.quaternion.copy(q)
  shaft.position.set(tail[0] + dir.x * shaftLen * 0.5, tail[1] + dir.y * shaftLen * 0.5, tail[2] + dir.z * shaftLen * 0.5)
  shaft.scale.set(thick * wpp, shaftLen, thick * wpp)
  head.quaternion.copy(q)
  if (is3D) {
    // The cone is centred on its own origin, so it sits half a head back from the tip.
    head.position.set(tail[0] + dir.x * (L - headLen / 2), tail[1] + dir.y * (L - headLen / 2), tail[2] + dir.z * (L - headLen / 2))
    const hr = Math.min(headRadPx * wpp, headLen * 0.6)
    head.scale.set(hr, headLen, hr)
  } else {
    // The triangle's base is its origin, so it starts where the shaft ends.
    head.position.set(tail[0] + dir.x * shaftLen, tail[1] + dir.y * shaftLen, tail[2] + dir.z * shaftLen)
    head.scale.set(halfWidth, headLen, 1)
  }
}

type ArrowProps = { tail: V3; comp: V3; color: string; is3D: boolean; thick?: number; renderOrder?: number; headPx?: number; headRadPx?: number; tipPx?: number }

/**
 * One arrow. From ARROW_BATCH_MIN 2-D arrows on screen it is drawn by the instanced batch
 * (render/ArrowBatch.tsx) with the same maths; below that, or in 3-D, as its own two meshes.
 * 500 separate arrows cost 1005 draw calls and 3–4.5 ms of JavaScript a frame (arrow spike).
 * A new 2-D arrow draws nothing until it has been counted (a microtask), so a big picture never
 * builds mesh arrows only to swap them for the batch.
 */
export function Arrow(props: ArrowProps) {
  const batched = useArrowBatched(props.is3D)
  if (batched === null) return null
  return batched ? <BatchedArrow {...props} /> : <MeshArrow {...props} />
}

function MeshArrow({ tail, comp, color, is3D, thick = 1.7, renderOrder = 12, headPx, headRadPx, tipPx }: ArrowProps) {
  const shaft = useRef<THREE.Mesh>(null)
  const head = useRef<THREE.Mesh>(null)
  const mat = useArrowMaterials(color, is3D)
  useFrame(({ camera, size }) => {
    if (!shaft.current || !head.current) return
    placeArrow(shaft.current, head.current, tail, comp, worldPerPixel(camera, size, add(tail, scale(comp, 0.5))), thick, is3D, headPx, headRadPx, tipPx)
  })
  return (
    <>
      <mesh ref={shaft} geometry={cylGeo} material={mat} renderOrder={renderOrder} />
      <mesh ref={head} geometry={is3D ? coneGeo : flatHeadGeo} material={mat} renderOrder={renderOrder} />
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
  // A resultant is drawn in its own token, not mixed between its parents: the mix of A and B sat
  // 1.4 from A for a deuteranope. It has its parents' weight and a second head instead of a
  // heavier shaft (Fix 2). Every other arrow is drawn in its theme token (shownColor).
  const result = isResultArrow(obj)
  const color = useMemo(
    () => (result ? colors.result : shownColor(obj)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- colors.theme is the signal that the stylesheet changed, not a value read here
    [result, obj.color, obj.themed, colors.theme]
  )
  const showComps = obj.showComponents || selected
  // The θ arc from the x-axis is an angle mark; a student who wants a bare drawing turns it off.
  const showArc = useScene((s) => s.settings.showAngleMarks)
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
        const [xText, yText] = componentTexts(obj, comp, settings)
        pool.place(xText, (a.x + ax.x) / 2, ax.y + (comp[1] >= 0 ? 16 : -16), 'center', colors.xComp)
        pool.place(yText, ay.x + (comp[0] >= 0 ? -10 : 10), (a.y + ay.y) / 2, comp[0] >= 0 ? 'right' : 'left', colors.yComp)
        if (showArc && L > 1e-9) {
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
      {/* The halo's head shares the arrow head's 25° edges, so it is pushed past the tip by enough
          for its outline to be as wide along those edges as it is beside the shaft. */}
      {selected && <Arrow tail={tail} comp={comp} color={colors.select} is3D={is3D} thick={thick + 2.2} renderOrder={11} headPx={15} headRadPx={8.5} tipPx={HALO_TIP_PX} />}
      <Arrow tail={tail} comp={comp} color={color} is3D={is3D} thick={thick} />
      {/* The resultant's second head, one head length and a gap back from the tip: a mark that
          does not depend on seeing its colour. Left off an arrow too short to carry two. */}
      {result && L / wpp > 4 * RESULT_HEAD_GAP_PX && <Arrow tail={tail} comp={comp} color={color} is3D={is3D} thick={thick} tipPx={-RESULT_HEAD_GAP_PX} />}
      {showComps && planar && L > 1e-9 && (
        <>
          <Arrow tail={tail} comp={[comp[0], 0, 0]} color={colors.xComp} is3D={is3D} thick={1.2} renderOrder={8} headPx={10} headRadPx={4.5} />
          <Arrow tail={tail} comp={[0, comp[1], 0]} color={colors.yComp} is3D={is3D} thick={1.2} renderOrder={8} headPx={10} headRadPx={4.5} />
          <FatLine points={[[tail[0] + comp[0], tail[1], tail[2]], head, [tail[0], tail[1] + comp[1], tail[2]]]} color={colors.dashed} width={1.2} dashed dashSize={6 * wpp} gapSize={4 * wpp} renderOrder={7} />
          {showArc && <FatLine points={arcPoints(tail, 30 * wpp, arc.from, arc.to)} color={colors.arc} width={1.6} renderOrder={9} />}
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
      <FatLine points={pts} color={shownColor(obj)} width={width} renderOrder={5} />
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
  const fillColor = shownColor(obj)
  const wpp = worldPerPixel(camera, size, centroid(pts))

  // Only a decomposed shape is split into parts. evaluateScene hands every polygon a fresh `pts` on
  // every evaluation (each drag frame), and decompose tries up to 2000 triangulations of a shape
  // with ten corners or fewer, so running it for every polygon cost up to ~120 ms a frame.
  const dec = useMemo(
    () => (obj.decomposed ? decompose(pts, obj.decomposeGoal ?? 'basic', obj.decomposeIndex ?? 0) : null),
    [obj.decomposed, pts, obj.decomposeGoal, obj.decomposeIndex]
  )
  const whole = fillsWhole(obj.decomposed, dec?.parts.length ?? 1)

  const geometry = useMemo(() => {
    if (pts.length < 3) return null
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])))
    const g = new THREE.ShapeGeometry(shape)
    const z = pts[0][2]
    if (z) g.translate(0, 0, z)
    return g
  }, [pts])
  useEffect(() => () => geometry?.dispose(), [geometry])

  // The viewer's "angle marks" switch wins over every polygon's own setting.
  const showMeasures = (selected || sideSelected || obj.showAngles) && settings.showAngleMarks
  const orientation = pts.length >= 3 ? Math.sign(signedArea(pts)) || 1 : 1

  // A piece's name stands away from the cut (render/pieceLabels.ts); worked out once per evaluation.
  const nameAt = useRef<{ key: unknown; p: V3 } | null>(null)
  const anchor = (): V3 => {
    if (!obj.lego) return centroid(pts)
    const { objects, ev } = useScene.getState()
    if (nameAt.current?.key !== ev) {
      const others: V3[][] = []
      for (const o of Object.values(objects)) {
        const oc = o.type === 'polygon' && o.lego && o.id !== obj.id ? ev.values.get(o.id) : undefined
        if (oc?.type === 'polygon') others.push(oc.pts)
      }
      nameAt.current = { key: ev, p: pieceNameAnchor(pts, others) }
    }
    return nameAt.current.p
  }

  useFrame(({ camera: cam, size: sz }) => {
    labelAnchors.set(obj.id, { p: anchor() })
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
      {geometry && whole && (
        <mesh geometry={geometry} renderOrder={0}>
          {/* Keyed on the colour: WebGPU compiles it in, and a themed shape changes colour with the theme. */}
          <meshBasicMaterial key={fillColor} color={fillColor} transparent opacity={selected ? 0.3 : hovered ? 0.24 : obj.fill ? 0.16 : 0} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {!whole && dec && pts.length >= 3 && <DecomposedParts obj={obj} dec={dec} pts={pts} wpp={wpp} />}
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

/** Component shapes filled edge to edge, with dashed cut lines and Roman numerals. */
function DecomposedParts({ dec, pts, wpp }: { obj: PolygonObj; dec: Decomposition; pts: V3[]; wpp: number }) {
  const objects = useScene((s) => s.objects)
  const letters = useMemo(
    () => freeCapitals(Object.values(objects).map((o) => o.name), dec.newPoints.length),
    [objects, dec.newPoints.length]
  )
  const marks = useMemo(() => rightAngleMarks(dec.cuts, pts, 14 * wpp), [dec.cuts, pts, wpp])
  const colors = useDrawingColors()
  const pool = useMemo(() => new SpanPool(() => overlay.labels, 'measure-label part-label'), [])
  useEffect(() => () => pool.dispose(), [pool])
  // Each part is filled to its own corners (fillOutline says why), so the geometry no longer
  // depends on the zoom and is not rebuilt on every wheel step.
  const geos = useMemo(() => dec.parts.map((part) => new THREE.ShapeGeometry(new THREE.Shape(fillOutline(part.pts).map(([x, y]) => new THREE.Vector2(x, y))))), [dec])
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos])
  useFrame(({ camera, size }) => {
    pool.begin()
    if (dec.parts.length > 1) {
      dec.parts.forEach((part, i) => {
        const s = toScreen(camera, size, centroid(part.pts))
        pool.place(ROMAN[i] ?? String(i + 1), s.x, s.y, 'center', colors.series[i % SERIES_COUNT])
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
        // Keyed on the theme because WebGPU compiles the colour in; the series repeat after six,
        // so a seventh part takes the first colour again at a lighter tint to stay tellable apart.
        <mesh key={`${colors.theme}${i}`} geometry={g} renderOrder={0}>
          <meshBasicMaterial color={colors.series[i % SERIES_COUNT]} transparent opacity={i < SERIES_COUNT ? 0.28 : 0.16} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the arc's coordinates: `pts` is a fresh array every render, and keying on it would rebuild the geometry each time
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
