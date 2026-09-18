// Draws the sandbox world and drives the engine: one step per frame while the timeline plays.
// The engine hands back a plain array of positions, so nothing here touches Jolt itself.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { useScene } from '../core/store'
import { useApp } from '../app/modes'
import { massOf, useSandbox } from '../sim/store'
import { SimWorld, STRIDE } from '../sim/world'
import type { BodyDef, BodyState, LinkKind } from '../sim/types'
import type { V3 } from '../math/vec'
import { energyOf, groundTopOf } from '../sim/energy'
import { sampleOf, type Sample } from '../sim/recording'
import { Arrow } from './ObjectViews'
import { overlay, SpanPool } from './overlay'
import { toScreen } from './cameraUtils'
import { formatMeasure } from '../math/format'
import { themeColor, useTheme } from '../app/theme'

/** Geometry for each shape, in metres. */
function geometryFor(def: BodyDef): THREE.BufferGeometry {
  const [a, b, c] = def.size
  switch (def.shape) {
    case 'sphere':
      return new THREE.SphereGeometry(a, 32, 16)
    case 'cylinder':
      return new THREE.CylinderGeometry(a, a, b, 28)
    case 'capsule':
      return new THREE.CapsuleGeometry(a, b, 8, 20)
    case 'cone':
      return new THREE.ConeGeometry(a / 2, b, 28)
    case 'ramp': {
      // A wedge with the right angle at the bottom left, matching the collision shape.
      const hx = a / 2
      const hy = b / 2
      const hz = c / 2
      const g = new THREE.BufferGeometry()
      const v = [
        [-hx, -hy, -hz],
        [hx, -hy, -hz],
        [-hx, hy, -hz],
        [-hx, -hy, hz],
        [hx, -hy, hz],
        [-hx, hy, hz]
      ]
      const tri = [
        [0, 1, 2],
        [3, 5, 4],
        [0, 2, 5],
        [0, 5, 3],
        [1, 4, 5],
        [1, 5, 2],
        [0, 3, 4],
        [0, 4, 1]
      ]
      const pos: number[] = []
      for (const [i, j, k] of tri) pos.push(...v[i], ...v[j], ...v[k])
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.computeVertexNormals()
      return g
    }
    default:
      return new THREE.BoxGeometry(a, b, c)
  }
}


/**
 * Picking things up and throwing them. The body follows a spring to the cursor, which is honest
 * physics (and lets it push other things on the way), and keeps the speed of the hand on release.
 */
function useGrabAndThrow(sim: React.RefObject<SimWorld | null>, group: React.RefObject<THREE.Group | null>) {
  const { gl, camera, size, controls } = useThree()
  const select = useSandbox((s) => s.select)
  const twoD = useSandbox((s) => s.world.twoD)
  const drag = useRef<{ id: string; plane: THREE.Plane; samples: { p: THREE.Vector3; t: number }[] } | null>(null)

  useEffect(() => {
    const el = gl.domElement
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const point = new THREE.Vector3()

    const pick = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const meshes = (group.current?.children ?? []).filter((c) => (c as THREE.Mesh).isMesh)
      const hit = raycaster.intersectObjects(meshes, false)[0]
      return hit ? { id: (hit.object.userData as { bodyId?: string }).bodyId, point: hit.point } : null
    }

    /** Where the cursor is, on the plane the drag happens in. */
    const onPlane = (e: PointerEvent, plane: THREE.Plane): THREE.Vector3 | null => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      return raycaster.ray.intersectPlane(plane, point.clone())
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || useApp.getState().mode !== 'sandbox') return
      const w = sim.current
      const hit = pick(e)
      if (!w || !hit?.id) return
      select(hit.id)
      const def = useSandbox.getState().bodies.find((b) => b.id === hit.id)
      if (!def || def.motion !== 'dynamic') return
      // In 2D everything lives in one flat plane; in 3D drag in the plane facing the camera.
      const plane = twoD
        ? new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
        : new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), hit.point)
      const start = onPlane(e, plane)
      if (!start) return
      drag.current = { id: hit.id, plane, samples: [{ p: start.clone(), t: performance.now() }] }
      w.grab(hit.id, [start.x, start.y, start.z])
      const c = controls as unknown as { enabled: boolean } | null
      if (c) c.enabled = false
      el.setPointerCapture(e.pointerId)
    }

    const onMove = (e: PointerEvent) => {
      const d = drag.current
      const w = sim.current
      if (!d || !w) return
      const p = onPlane(e, d.plane)
      if (!p) return
      w.moveGrab([p.x, p.y, p.z])
      d.samples.push({ p: p.clone(), t: performance.now() })
      if (d.samples.length > 8) d.samples.shift()
    }

    const onUp = (e: PointerEvent) => {
      const d = drag.current
      const w = sim.current
      drag.current = null
      const c = controls as unknown as { enabled: boolean } | null
      if (c) c.enabled = true
      if (!d || !w) return
      w.release_()
      // Throw: the speed of the hand over the last few samples, capped at something sensible.
      const first = d.samples[0]
      const last = d.samples[d.samples.length - 1]
      const dt = (last.t - first.t) / 1000
      if (dt > 0.008) {
        const v = last.p.clone().sub(first.p).divideScalar(dt)
        const speed = v.length()
        if (speed > 0.2) {
          if (speed > 25) v.multiplyScalar(25 / speed)
          w.setVelocity(d.id, [v.x, v.y, v.z])
        }
      }
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
    }
  }, [gl, camera, size, controls, select, twoD, sim, group])
}

export function SandboxView() {
  const bodies = useSandbox((s) => s.bodies)
  const world = useSandbox((s) => s.world)
  const selection = useSandbox((s) => s.selection)
  const links = useSandbox((s) => s.links)
  const pushContacts = useSandbox((s) => s.pushContacts)
  const playing = useScene((s) => s.playing)
  const settings = useScene((s) => s.settings)
  const mode = useApp((s) => s.mode)
  const sim = useRef<SimWorld | null>(null)
  const group = useRef<THREE.Group>(null)
  const [ready, setReady] = useState(false)
  const pool = useMemo(() => new SpanPool(() => overlay.labels, 'measure-label'), [])
  const { invalidate } = useThree()
  const check = useRef(location.hash.includes('sandbox') ? { last: -1, contacts: 0 } : null)
  /** Engine time the live values were last published at. */
  const published = useRef(0)
  useGrabAndThrow(sim, group)

  // Start the engine the first time the sandbox is opened.
  useEffect(() => {
    let alive = true
    SimWorld.create(world).then((w) => {
      if (!alive) return
      sim.current = w
      w.rebuild(bodies)
      if (import.meta.env?.DEV) (window as unknown as { __sim?: SimWorld }).__sim = w
      setReady(true)
      invalidate()
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A change to the objects is applied to the running world where it can be, and only forces a
  // rebuild when the change is structural. Rebuilding on every edit meant renaming a ball reset
  // every position in the scene — the single most confusing thing the Sandbox did.
  const applied = useRef<BodyDef[]>([])
  useEffect(() => {
    const w = sim.current
    if (!w || !ready) return
    const before = applied.current
    const sameBodies = before.length === bodies.length && bodies.every((b, i) => before[i]?.id === b.id)
    const inPlace = sameBodies && bodies.every((b, i) => before[i] === b || w.updateBody(b))
    if (!inPlace) w.rebuild(bodies, links)
    applied.current = bodies
    invalidate()
  }, [bodies, links, ready, invalidate])

  // Connections are cheap to rebuild and each one needs both of its bodies to exist, so they are
  // rebuilt on their own rather than dragging the whole world down with them.
  useEffect(() => {
    if (!sim.current || !ready) return
    sim.current.setLinks(links)
    invalidate()
  }, [links, ready, invalidate])

  useEffect(() => {
    if (!sim.current || !ready) return
    sim.current.setWorldSettings(world)
    invalidate()
  }, [world, ready, invalidate])

  useEffect(() => () => pool.dispose(), [pool])

  /** Heights are quoted above the floor, not above the world origin. */
  const groundTop = useMemo(() => groundTopOf(bodies), [bodies])

  const meshes = useMemo(() => {
    const geos = bodies.map(geometryFor)
    return { geos }
  }, [bodies])
  useEffect(() => () => meshes.geos.forEach((g) => g.dispose()), [meshes])

  useFrame((state, dt) => {
    const w = sim.current
    const g = group.current
    if (!w || !g) return
    if (playing && mode === 'sandbox') {
      const { transforms, contacts } = w.step(Math.min(dt, 0.1))
      applyTransforms(g, transforms)
      if (contacts.length) pushContacts(contacts)
      useSandbox.setState({ engineTime: w.time })
      // Live values for the panel, about ten times a second. Publishing every frame would
      // re-render the whole panel sixty times a second to move a digit no one can read that fast.
      if (w.time - published.current > 0.1) {
        published.current = w.time
        const live: Record<string, BodyState> = {}
        const samples: Record<string, Sample> = {}
        for (const d of bodies) {
          const s = w.state(d.id)
          if (!s) continue
          live[d.id] = s
          // The same tick records the run, so a student can plot what they just watched.
          if (d.motion === 'dynamic') samples[d.id] = sampleOf(d, s, w.time, world.gravity, groundTop)
        }
        useSandbox.setState({ live })
        useSandbox.getState().record(samples)
      }
      if (check.current && Math.floor(w.time) !== check.current.last) {
        check.current.last = Math.floor(w.time)
        const lines = bodies
          .filter((d) => d.motion === 'dynamic')
          .map((d) => {
            const st = w.state(d.id)
            if (!st) return ''
            // Where it lands on the screen, so a terminal check can tell it is actually in view.
            const sp = toScreen(state.camera, state.size, st.position)
            const onScreen = sp.visible && sp.x > 0 && sp.y > 0 && sp.x < state.size.width && sp.y < state.size.height
            const en = energyOf(d, st, world.gravity, groundTop)
            return `${d.name} pos=${st.position.map((n) => n.toFixed(2)).join(',')} v=${Math.hypot(...st.velocity).toFixed(2)} KE=${en.kinetic.toFixed(1)} PE=${en.potential.toFixed(1)} E=${en.total.toFixed(1)} screen=${sp.x.toFixed(0)},${sp.y.toFixed(0)} size=${state.size.width}x${state.size.height} cam=${state.camera.position.toArray().map((n) => n.toFixed(1)).join(',')}${onScreen ? '' : ' OFFSCREEN'}`
          })
        console.info(`PHYSLAB_CHECK sandbox t=${w.time.toFixed(1)} bodies=${bodies.length} contacts=${check.current.contacts} ${lines.join(' | ')}`)
      }
      if (check.current) check.current.contacts += contacts.length
    } else {
      applyTransforms(g, w.step(0).transforms)
    }

    // Live numbers next to each object, in the same chip style as the rest of PhysLab.
    pool.begin()
    if (settings.labelShow !== 'never') {
      bodies.forEach((def, i) => {
        if (def.motion === 'static') return
        const st = w.state(def.id)
        if (!st) return
        const show = settings.labelShow === 'always' || selection === def.id
        if (!show) return
        const p = toScreen(state.camera, state.size, st.position)
        if (!p.visible) return
        // Speed and mass alone could not answer the question a mechanics practical asks. Height
        // and kinetic energy are what a student needs to watch while something falls.
        const speed = Math.hypot(st.velocity[0], st.velocity[1], st.velocity[2])
        const e = energyOf(def, st, world.gravity, groundTop)
        const num = (v: number) => formatMeasure(v, 'number', settings)
        const text = `${def.name}  ${num(speed)} m/s  h ${num(st.position[1] - groundTop)} m  KE ${num(e.kinetic)} J`
        pool.place(text, p.x, p.y - 26, 'center', def.color)
      })
    }
    pool.end()
  })

  return (
    <group ref={group}>
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 12, 8]} intensity={1.3} />
      <directionalLight position={[-8, 5, -6]} intensity={0.35} />
      {bodies.map((def, i) => (
        <mesh key={def.id} geometry={meshes.geos[i]} userData={{ bodyId: def.id }}>
          <meshLambertMaterial
            color={def.color}
            emissive={selection === def.id ? '#ffd43b' : '#000000'}
            emissiveIntensity={selection === def.id ? 0.35 : 0}
          />
        </mesh>
      ))}
      <FloorGrid bodies={bodies} />
      {ready && <VelocityArrows sim={sim} />}
      {ready && <Traces sim={sim} />}
      {ready && <LinkLines sim={sim} />}
    </group>
  )
}

/**
 * Metre lines on the floor. Without them two balls three metres apart and two balls thirty
 * centimetres apart look the same, and every distance has to be read off the panel instead of
 * seen. The grid is drawn to the size of the floor and follows the theme.
 */
function FloorGrid({ bodies }: { bodies: BodyDef[] }) {
  const theme = useTheme((t) => t.theme)
  const floor = bodies.find((b) => b.shape === 'ground')
  const grid = useMemo(() => {
    if (!floor) return null
    const half = Math.min(20, Math.max(4, floor.size[0] / 2))
    const top = floor.position[1] + floor.size[1] / 2 + 0.002
    const pts: number[] = []
    for (let x = -half; x <= half + 1e-9; x += 1) pts.push(x, top, -half, x, top, half)
    for (let z = -half; z <= half + 1e-9; z += 1) pts.push(-half, top, z, half, top, z)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
    // The theme only changes the colour, but the geometry is cheap enough to rebuild with it.
  }, [floor?.size[0], floor?.size[1], floor?.position[1], floor])
  useEffect(() => () => grid?.dispose(), [grid])
  if (!grid) return null
  return (
    <lineSegments geometry={grid} renderOrder={1}>
      <lineBasicMaterial color={themeColor('--grid-major', theme === 'light' ? '#bcc8da' : '#34363d')} transparent opacity={0.85} />
    </lineSegments>
  )
}

/** How many positions a traced body remembers: about twenty seconds of flight. */
const TRACE_POINTS = 600

/**
 * The path a body has taken. `trace` has been a field on every body since the Sandbox was
 * written and nothing ever drew it, so a projectile left no parabola behind — the one picture a
 * student opens a physics sandbox to see.
 */
function Traces({ sim }: { sim: React.RefObject<SimWorld | null> }) {
  const bodies = useSandbox((s) => s.bodies)
  const playing = useScene((s) => s.playing)
  const paths = useRef(new Map<string, number[]>())
  const [, force] = useState(0)

  useFrame(() => {
    const w = sim.current
    if (!w) return
    let changed = false
    for (const def of bodies) {
      if (!def.trace || def.motion !== 'dynamic') {
        if (paths.current.delete(def.id)) changed = true
        continue
      }
      const st = w.state(def.id)
      if (!st || !playing) continue
      const path = paths.current.get(def.id) ?? []
      const n = path.length
      // Only record when it has actually moved, or a body at rest fills the buffer with one point.
      if (n < 3 || Math.hypot(path[n - 3] - st.position[0], path[n - 2] - st.position[1], path[n - 1] - st.position[2]) > 0.01) {
        path.push(st.position[0], st.position[1], st.position[2])
        if (path.length > TRACE_POINTS * 3) path.splice(0, 3)
        paths.current.set(def.id, path)
        changed = true
      }
    }
    if (changed) force((k) => (k + 1) % 1000)
  })

  return (
    <>
      {bodies.map((def) => {
        const path = paths.current.get(def.id)
        if (!path || path.length < 6) return null
        return <TraceLine key={def.id} points={path} color={def.color} />
      })}
    </>
  )
}

function TraceLine({ points, color }: { points: number[]; color: string }) {
  const geo = useMemo(() => {
    // Drawn as separate segments rather than one polyline: `<line>` in JSX means the SVG element,
    // and `<lineSegments>` is the R3F tag that does not collide with it.
    const pairs: number[] = []
    for (let i = 3; i < points.length; i += 3) {
      pairs.push(points[i - 3], points[i - 2], points[i - 1], points[i], points[i + 1], points[i + 2])
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(pairs), 3))
    return g
  }, [points, points.length])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <lineSegments geometry={geo} renderOrder={13}>
      <lineBasicMaterial color={color} transparent opacity={0.8} />
    </lineSegments>
  )
}

function applyTransforms(group: THREE.Group, transforms: Float32Array) {
  let i = 0
  for (const child of group.children) {
    if (!(child as THREE.Mesh).isMesh) continue
    const o = i * STRIDE
    if (o + 6 < transforms.length) {
      child.position.set(transforms[o], transforms[o + 1], transforms[o + 2])
      child.quaternion.set(transforms[o + 3], transforms[o + 4], transforms[o + 5], transforms[o + 6])
    }
    i++
  }
}

/** A velocity arrow on every moving object that asks for one. */
function VelocityArrows({ sim }: { sim: React.RefObject<SimWorld | null> }) {
  const bodies = useSandbox((s) => s.bodies)
  const [, force] = useState(0)
  useFrame(() => force((n) => (n + 1) % 1000))
  const w = sim.current
  if (!w) return null
  return (
    <>
      {bodies.map((def) => {
        if (!def.showArrows || def.motion === 'static') return null
        const st = w.state(def.id)
        if (!st) return null
        const speed = Math.hypot(st.velocity[0], st.velocity[1], st.velocity[2])
        if (speed < 0.05) return null
        // One metre of arrow for every two metres per second. At the old quarter-scale a ball
        // doing 4 m/s grew an arrow shorter than the ramp it had just left, which is not
        // something you can reason about at a glance.
        const k = 0.5
        return (
          <Arrow
            key={def.id}
            tail={st.position}
            comp={[st.velocity[0] * k, st.velocity[1] * k, st.velocity[2] * k]}
            color="#4dabf7"
            is3D
            thick={3.5}
            renderOrder={14}
          />
        )
      })}
    </>
  )
}

export { massOf }

/**
 * The rods, strings and springs themselves. A connection you cannot see is a mystery force, so
 * each one is drawn between the two bodies as they move — a spring as a coil, so it reads as a
 * spring rather than a stick.
 */
function LinkLines({ sim }: { sim: React.RefObject<SimWorld | null> }) {
  const links = useSandbox((s) => s.links)
  const theme = useTheme((t) => t.theme)
  const [, force] = useState(0)
  useFrame(() => force((n) => (n + 1) % 1000))
  const w = sim.current
  if (!w || !links.length) return null
  const colour = themeColor('--tick-text', theme === 'light' ? '#59647a' : '#8a8f98')
  return (
    <>
      {links.map((l) => {
        const a = w.state(l.a)
        const b = w.state(l.b)
        if (!a || !b) return null
        return <LinkLine key={l.id} kind={l.kind} from={a.position} to={b.position} colour={colour} />
      })}
    </>
  )
}

function LinkLine({ kind, from, to, colour }: { kind: LinkKind; from: V3; to: V3; colour: string }) {
  const geo = useMemo(() => {
    const pts: number[] = []
    if (kind === 'spring') {
      // A zigzag along the line, so it is obviously a spring: the number of coils stays the same
      // while it stretches, which is how a drawn spring behaves in a textbook.
      const coils = 12
      const dx = to[0] - from[0]
      const dy = to[1] - from[1]
      const dz = to[2] - from[2]
      const len = Math.hypot(dx, dy, dz) || 1
      // A unit vector across the spring, to zigzag along.
      const side = Math.abs(dy / len) < 0.9 ? [0, 1, 0] : [1, 0, 0]
      const nx = (dy / len) * side[2] - (dz / len) * side[1]
      const ny = (dz / len) * side[0] - (dx / len) * side[2]
      const nz = (dx / len) * side[1] - (dy / len) * side[0]
      const nl = Math.hypot(nx, ny, nz) || 1
      const amp = Math.min(0.12, len / 12)
      const pt = (t: number, s: number): [number, number, number] => [
        from[0] + dx * t + (nx / nl) * amp * s,
        from[1] + dy * t + (ny / nl) * amp * s,
        from[2] + dz * t + (nz / nl) * amp * s
      ]
      let prev = pt(0, 0)
      for (let i = 1; i <= coils; i++) {
        const next = pt(i / coils, i === coils ? 0 : i % 2 === 0 ? 1 : -1)
        pts.push(...prev, ...next)
        prev = next
      }
    } else {
      pts.push(...from, ...to)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [kind, from[0], from[1], from[2], to[0], to[1], to[2]])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <lineSegments geometry={geo} renderOrder={12}>
      <lineBasicMaterial color={colour} transparent opacity={kind === 'string' ? 0.7 : 1} />
    </lineSegments>
  )
}
