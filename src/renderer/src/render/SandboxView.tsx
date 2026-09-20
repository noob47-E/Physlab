// Draws the sandbox world and drives the engine: one step per frame while the timeline plays.
// The engine hands back a plain array of positions, so nothing here touches Jolt itself.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { useScene } from '../core/store'
import { useApp } from '../app/modes'
import { engine, massOf, useSandbox } from '../sim/store'
import { grabForceCap, SimWorld, STRIDE } from '../sim/world'
import type { BodyDef, BodyId, BodyState, Link, LinkKind } from '../sim/types'
import type { V3 } from '../math/vec'
import { energyOf, groundTopOf } from '../sim/energy'
import { sampleOf, type Sample } from '../sim/recording'
import { Arrow } from './ObjectViews'
import { overlay, SpanPool } from './overlay'
import { niceStep, toScreen } from './cameraUtils'
import { formatMeasure } from '../math/format'
import { themeColor, useTheme } from '../app/theme'

/** Geometry for each shape, in metres. */
function geometryFor(def: BodyDef): THREE.BufferGeometry {
  const [a, b, c] = def.size
  switch (def.shape) {
    case 'sphere':
      return new THREE.SphereGeometry(a, 32, 16)
    case 'cylinder':
    case 'pulley':
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

// What the engine was last told to hold. These live outside the component so that leaving the
// Sandbox for another mode and coming back does not throw the run away: the world is created
// once and kept in `engine.world`.
let applied: BodyDef[] = []
let appliedNonce = -1
/** Engine time the live values were last published at. */
let published = 0

/** How far below the floor a body may fall before it is put back where it started. */
const FALL_LIMIT = 10

type Drag = {
  id: BodyId
  plane: THREE.Plane
  /** Centre of the body minus the point that was clicked: the grabbed spot stays under the cursor. */
  offset: THREE.Vector3
  /** Arranging (moving the definition) rather than pulling with the hand. */
  place: boolean
  samples: { p: THREE.Vector3; t: number }[]
}

/**
 * The mouse in the sandbox. Paused, dragging arranges: any object — a wall or the floor too — goes
 * straight to where the cursor puts it and the scene definition follows, so Reset, undo and the
 * save file all know. Playing, dragging is a hand: a spring to the cursor that can push other
 * things on the way and keeps the hand's speed on release.
 */
function useGrabAndThrow(sim: React.RefObject<SimWorld | null>, group: React.RefObject<THREE.Group | null>) {
  const { gl, camera, size, controls, invalidate } = useThree()
  const select = useSandbox((s) => s.select)
  const setPartner = useSandbox((s) => s.setPartner)
  const twoD = useSandbox((s) => s.world.twoD)
  const drag = useRef<Drag | null>(null)

  useEffect(() => {
    const el = gl.domElement
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const point = new THREE.Vector3()

    const aim = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
    }
    const pick = (e: PointerEvent) => {
      aim(e)
      // Only the body meshes: the velocity arrows share this group and used to swallow the click.
      const meshes = (group.current?.children ?? []).filter((c) => (c as THREE.Mesh).isMesh && (c.userData as { bodyId?: string }).bodyId)
      const hit = raycaster.intersectObjects(meshes, false)[0]
      return hit ? { id: (hit.object.userData as { bodyId: string }).bodyId, point: hit.point } : null
    }
    /** Where the cursor is, on the plane the drag happens in. */
    const onPlane = (e: PointerEvent, plane: THREE.Plane): THREE.Vector3 | null => {
      aim(e)
      return raycaster.ray.intersectPlane(plane, point.clone())
    }
    const setControls = (enabled: boolean) => {
      const c = controls as unknown as { enabled: boolean } | null
      if (c) c.enabled = enabled
    }
    const defOf = (id: BodyId) => useSandbox.getState().bodies.find((b) => b.id === id)

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || useApp.getState().mode !== 'sandbox') return
      const w = sim.current
      const hit = pick(e)
      if (!w || !hit) {
        if (!e.shiftKey) select(null)
        return
      }
      // Shift-click on a second body chooses it as the partner to join to, and does not drag.
      const chosen = useSandbox.getState().selection
      if (e.shiftKey && chosen && chosen !== hit.id) {
        setPartner(hit.id)
        return
      }
      select(hit.id)
      const def = defOf(hit.id)
      if (!def) return
      const place = !useScene.getState().playing || def.motion !== 'dynamic'
      // In 2D everything lives in one flat plane; in 3D drag in the plane facing the camera.
      const plane = twoD
        ? new THREE.Plane(new THREE.Vector3(0, 0, 1), -def.position[2])
        : new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), hit.point)
      const start = onPlane(e, plane)
      if (!start) return
      const st = w.state(hit.id)
      const centre = st ? new THREE.Vector3(st.position[0], st.position[1], st.position[2]) : hit.point.clone()
      const offset = centre.sub(start)
      drag.current = { id: hit.id, plane, offset, place, samples: [{ p: start.clone(), t: performance.now() }] }
      if (!place) w.grab(hit.id, [start.x + offset.x, start.y + offset.y, start.z + offset.z])
      setControls(false)
      el.setPointerCapture(e.pointerId)
      el.style.cursor = place ? 'grabbing' : 'grabbing'
    }

    const onMove = (e: PointerEvent) => {
      const d = drag.current
      const w = sim.current
      if (!w) return
      if (!d) {
        if (useApp.getState().mode !== 'sandbox') return
        // Say what a click would do: arrange, or pull.
        const hit = pick(e)
        const playing = useScene.getState().playing
        el.style.cursor = hit ? (playing && defOf(hit.id)?.motion === 'dynamic' ? 'grab' : 'move') : ''
        return
      }
      const p = onPlane(e, d.plane)
      if (!p) return
      const target: V3 = [p.x + d.offset.x, p.y + d.offset.y, p.z + d.offset.z]
      if (d.place) {
        // Nothing asks for a frame while the run is paused, so ask for one.
        w.placeBody(d.id, target)
        invalidate()
      } else w.moveGrab(target)
      d.samples.push({ p: p.clone(), t: performance.now() })
      if (d.samples.length > 8) d.samples.shift()
    }

    const onUp = (e: PointerEvent) => {
      const d = drag.current
      const w = sim.current
      drag.current = null
      setControls(true)
      el.style.cursor = ''
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      if (!d || !w) return
      if (d.place) {
        // The definition follows the drag, so Reset, undo and the file all agree with the screen.
        const st = w.state(d.id)
        if (st) useSandbox.getState().updateBody(d.id, { position: [st.position[0], st.position[1], st.position[2]] })
        invalidate()
        return
      }
      w.release_()
      // Throw: the speed of the hand over the last few samples. A hand that could barely move the
      // object cannot fling it either, so the speed is bounded by what the grab force could give
      // it in a moment — a two-tonne block no longer leaves at 25 m/s from a flick.
      const first = d.samples[0]
      const last = d.samples[d.samples.length - 1]
      const dt = (last.t - first.t) / 1000
      const def = defOf(d.id)
      if (dt > 0.008 && def) {
        const v = last.p.clone().sub(first.p).divideScalar(dt)
        const speed = v.length()
        const m = massOf(def)
        const cap = Math.min(25, (grabForceCap(m, useSandbox.getState().world.gravity) * 0.15) / m)
        if (speed > 0.2) {
          if (speed > cap) v.multiplyScalar(cap / speed)
          w.setVelocity(d.id, [v.x, v.y, v.z])
        }
      }
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('lostpointercapture', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('lostpointercapture', onUp)
      // Unmounting mid-drag (a mode switch) must not leave the hand closed and the camera locked.
      if (drag.current) {
        drag.current = null
        sim.current?.release_()
        setControls(true)
        el.style.cursor = ''
      }
    }
  }, [gl, camera, size, controls, select, setPartner, twoD, sim, group, invalidate])
}

export function SandboxView() {
  const bodies = useSandbox((s) => s.bodies)
  const world = useSandbox((s) => s.world)
  const selection = useSandbox((s) => s.selection)
  const partner = useSandbox((s) => s.partner)
  const links = useSandbox((s) => s.links)
  const runNonce = useSandbox((s) => s.runNonce)
  const pushContacts = useSandbox((s) => s.pushContacts)
  const playing = useScene((s) => s.playing)
  const settings = useScene((s) => s.settings)
  const mode = useApp((s) => s.mode)
  const theme = useTheme((t) => t.theme)
  const sim = useRef<SimWorld | null>(null)
  const group = useRef<THREE.Group>(null)
  const [ready, setReady] = useState(false)
  const pool = useMemo(() => new SpanPool(() => overlay.labels, 'measure-label'), [])
  const { invalidate } = useThree()
  const check = useRef(location.hash.includes('sandbox') ? { last: -1, contacts: 0 } : null)
  useGrabAndThrow(sim, group)
  const selectColour = useMemo(() => themeColor('--warn', '#ffd43b'), [theme])

  // Start the engine the first time the sandbox is opened; afterwards pick the running one up
  // again, so switching modes and back does not restart the experiment.
  useEffect(() => {
    let alive = true
    if (engine.world) {
      sim.current = engine.world
      setReady(true)
      invalidate()
      return () => {
        alive = false
      }
    }
    SimWorld.create(useSandbox.getState().world).then((w) => {
      if (!alive) return
      engine.world = w
      sim.current = w
      const s = useSandbox.getState()
      w.rebuild(s.bodies, s.links)
      applied = s.bodies
      appliedNonce = s.runNonce
      published = 0
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
  // rebuild when the change is structural — and even then the untouched bodies keep going.
  // Rebuilding on every edit meant renaming a ball reset every position in the scene.
  useEffect(() => {
    const w = sim.current
    if (!w || !ready) return
    const before = applied
    const sameBodies = before.length === bodies.length && bodies.every((b, i) => before[i]?.id === b.id)
    const inPlace = sameBodies && bodies.every((b, i) => before[i] === b || w.updateBody(b))
    if (!inPlace) w.rebuild(bodies, links, true)
    applied = bodies
    invalidate()
  }, [bodies, links, ready, invalidate])

  // Reset: everything back to its definition, clock at zero. This is the only path that rebuilds
  // without preserving; it is keyed on a counter because comparing the objects proved nothing.
  useEffect(() => {
    const w = sim.current
    if (!w || !ready || appliedNonce === runNonce) return
    const s = useSandbox.getState()
    w.rebuild(s.bodies, s.links)
    applied = s.bodies
    appliedNonce = runNonce
    published = 0
    invalidate()
  }, [runNonce, ready, invalidate])

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
      applyTransforms(g, transforms, w.bodyOrder)
      if (contacts.length) pushContacts(contacts)
      // Live values for the panel, about ten times a second. Publishing every frame would
      // re-render the whole panel sixty times a second to move a digit no one can read that fast.
      if (w.time - published > 0.1 || w.time < published) {
        published = w.time
        const live: Record<string, BodyState> = {}
        const samples: Record<string, Sample> = {}
        for (const d of bodies) {
          const s = w.state(d.id)
          if (!s) continue
          if (d.motion === 'dynamic' && s.position[1] < groundTop - FALL_LIMIT) {
            // Off the edge of the world. Put it back at rest where it started and say so, rather
            // than let it fall for ever below a floor the student can no longer see.
            w.placeBody(d.id, d.position)
            useScene.getState().pushLog({ input: 'sandbox', kind: 'info', text: `${d.name} fell off the floor and was put back where it started.` })
            continue
          }
          live[d.id] = s
          // The same tick records the run, so a student can plot what they just watched.
          if (d.motion === 'dynamic') samples[d.id] = sampleOf(d, s, w.time, world.gravity, groundTop)
        }
        useSandbox.setState({ live, engineTime: w.time })
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
      applyTransforms(g, w.step(0).transforms, w.bodyOrder)
    }

    // Live numbers next to each object, in the same chip style as the rest of PhysLab.
    pool.begin()
    if (settings.labelShow !== 'never') {
      bodies.forEach((def) => {
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
          {/* A gold tint at a third strength was all but invisible on steel, concrete and lead —
              the three darkest materials and the three most used. The selected object is lit
              properly instead, so you can tell at a glance which one the panel is describing. */}
          <meshLambertMaterial color={def.color} emissive={selectColour} emissiveIntensity={selection === def.id ? 0.95 : partner === def.id ? 0.45 : 0} />
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
 * seen. Fine lines near the origin, coarser ones out to the edge; the grid follows the theme.
 */
function FloorGrid({ bodies }: { bodies: BodyDef[] }) {
  const theme = useTheme((t) => t.theme)
  const floor = bodies.find((b) => b.shape === 'ground')
  const grid = useMemo(() => {
    if (!floor) return null
    const half = Math.max(4, floor.size[0] / 2)
    const top = floor.position[1] + floor.size[1] / 2 + 0.002
    const fine = Math.min(20, half)
    const coarse = niceStep(half / 10)
    const pts: number[] = []
    for (let x = -fine; x <= fine + 1e-9; x += 1) pts.push(x, top, -fine, x, top, fine)
    for (let z = -fine; z <= fine + 1e-9; z += 1) pts.push(-fine, top, z, fine, top, z)
    if (half > fine) {
      for (let x = -half; x <= half + 1e-9; x += coarse) pts.push(x, top, -half, x, top, half)
      for (let z = -half; z <= half + 1e-9; z += coarse) pts.push(-half, top, z, half, top, z)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [floor?.size[0], floor?.size[1], floor?.position[1], floor])
  useEffect(() => () => grid?.dispose(), [grid])
  if (!grid) return null
  return (
    <lineSegments geometry={grid} renderOrder={1}>
      <lineBasicMaterial color={themeColor('--grid-major', theme === 'light' ? '#bcc8da' : '#34363d')} transparent opacity={0.85} />
    </lineSegments>
  )
}

/** How many segments a traced body remembers: about twenty seconds of flight. */
const TRACE_POINTS = 600

/**
 * The path a body has taken. Drawn into a buffer that is updated in place each frame: the old
 * version rebuilt a React tree per frame for every moving trail, which kept the whole canvas busy
 * even while paused.
 */
function Traces({ sim }: { sim: React.RefObject<SimWorld | null> }) {
  const bodies = useSandbox((s) => s.bodies)
  const traced = bodies.filter((d) => d.trace && d.motion === 'dynamic')
  return (
    <>
      {traced.map((def) => (
        <TraceLine key={def.id} sim={sim} def={def} />
      ))}
    </>
  )
}

function TraceLine({ sim, def }: { sim: React.RefObject<SimWorld | null>; def: BodyDef }) {
  const playing = useScene((s) => s.playing)
  const runNonce = useSandbox((s) => s.runNonce)
  const trailNonce = useSandbox((s) => s.trailNonce)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(TRACE_POINTS * 6), 3))
    g.setDrawRange(0, 0)
    return g
  }, [])
  useEffect(() => () => geo.dispose(), [geo])
  const count = useRef(0)
  const last = useRef<V3 | null>(null)
  const line = useRef<THREE.LineSegments>(null)
  // Reset, a new scene or "Clear trails": start the line again.
  useEffect(() => {
    count.current = 0
    last.current = null
    geo.setDrawRange(0, 0)
    if (line.current) line.current.visible = false
  }, [runNonce, trailNonce, geo])

  useFrame(() => {
    if (!playing) return
    const st = sim.current?.state(def.id)
    if (!st) return
    const p = st.position
    const l = last.current
    // Only record when it has actually moved, or a body at rest fills the buffer with one point.
    if (l && Math.hypot(l[0] - p[0], l[1] - p[1], l[2] - p[2]) < 0.01) return
    if (l) {
      const attr = geo.getAttribute('position') as THREE.BufferAttribute
      const i = (count.current % TRACE_POINTS) * 6
      attr.array.set([l[0], l[1], l[2], p[0], p[1], p[2]], i)
      attr.needsUpdate = true
      count.current++
      geo.setDrawRange(0, Math.min(count.current, TRACE_POINTS) * 2)
      // An empty geometry drawn every frame makes WebGPU warn every frame.
      if (line.current) line.current.visible = true
    }
    last.current = [p[0], p[1], p[2]]
  })

  return (
    <lineSegments ref={line} geometry={geo} renderOrder={13} frustumCulled={false} visible={false}>
      <lineBasicMaterial color={def.color} transparent opacity={0.8} />
    </lineSegments>
  )
}

/** Meshes are matched to the engine by body id, not by their place in the list. */
function applyTransforms(group: THREE.Group, transforms: Float32Array, order: BodyId[]) {
  const index = new Map(order.map((id, i) => [id, i]))
  for (const child of group.children) {
    const id = (child.userData as { bodyId?: string }).bodyId
    if (!id) continue
    const i = index.get(id)
    if (i === undefined) continue
    const o = i * STRIDE
    if (o + 6 >= transforms.length) continue
    child.position.set(transforms[o], transforms[o + 1], transforms[o + 2])
    child.quaternion.set(transforms[o + 3], transforms[o + 4], transforms[o + 5], transforms[o + 6])
  }
}

/**
 * A velocity arrow on every moving object that asks for one. Each arrow reads its tail and
 * components from an array that is updated in place every frame, so no React work happens
 * while things move.
 */
function VelocityArrows({ sim }: { sim: React.RefObject<SimWorld | null> }) {
  const bodies = useSandbox((s) => s.bodies)
  const theme = useTheme((t) => t.theme)
  const colour = useMemo(() => themeColor('--accent', '#4dabf7'), [theme])
  const shown = bodies.filter((d) => d.showArrows && d.motion !== 'static')
  const key = shown.map((d) => d.id).join(',')
  const slots = useMemo(() => new Map(shown.map((d) => [d.id, { tail: [0, 0, 0] as V3, comp: [0, 0, 0] as V3 }])), [key])
  useFrame(() => {
    const w = sim.current
    if (!w) return
    for (const [id, slot] of slots) {
      const st = w.state(id)
      if (!st) continue
      const speed = Math.hypot(st.velocity[0], st.velocity[1], st.velocity[2])
      if (speed < 0.05) {
        slot.comp[0] = slot.comp[1] = slot.comp[2] = 0
        continue
      }
      // One metre of arrow for every two metres per second. At the old quarter-scale a ball
      // doing 4 m/s grew an arrow shorter than the ramp it had just left.
      const k = 0.5
      slot.tail[0] = st.position[0]
      slot.tail[1] = st.position[1]
      slot.tail[2] = st.position[2]
      slot.comp[0] = st.velocity[0] * k
      slot.comp[1] = st.velocity[1] * k
      slot.comp[2] = st.velocity[2] * k
    }
  })
  return (
    <>
      {shown.map((def) => {
        const s = slots.get(def.id)
        if (!s) return null
        return <Arrow key={def.id} tail={s.tail} comp={s.comp} color={colour} is3D thick={3.5} renderOrder={14} />
      })}
    </>
  )
}

export { massOf }

/** The points of a connection between two positions: a straight line, or a zigzag for a spring. */
export function linkSegments(kind: LinkKind, from: V3, to: V3): number[] {
  if (kind !== 'spring') return [...from, ...to]
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
  const pt = (t: number, s: number): V3 => [from[0] + dx * t + (nx / nl) * amp * s, from[1] + dy * t + (ny / nl) * amp * s, from[2] + dz * t + (nz / nl) * amp * s]
  const pts: number[] = []
  let prev = pt(0, 0)
  for (let i = 1; i <= coils; i++) {
    const next = pt(i / coils, i === coils ? 0 : i % 2 === 0 ? 1 : -1)
    pts.push(...prev, ...next)
    prev = next
  }
  return pts
}

/**
 * The rods, strings and springs themselves. A connection you cannot see is a mystery force, so
 * each one is drawn between the two bodies as they move, into a buffer updated in place.
 */
function LinkLines({ sim }: { sim: React.RefObject<SimWorld | null> }) {
  const links = useSandbox((s) => s.links)
  const theme = useTheme((t) => t.theme)
  const colour = useMemo(() => themeColor('--tick-text', theme === 'light' ? '#59647a' : '#8a8f98'), [theme])
  return (
    <>
      {links.map((l) => (
        <LinkLine key={l.id} sim={sim} link={l} colour={colour} />
      ))}
    </>
  )
}

/** A rope, drawn through the centres of its links; a pulley rope as two straight runs. */
function RopeLine({ sim, link, colour }: { sim: React.RefObject<SimWorld | null>; link: Link; colour: string }) {
  const capacity = 64
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(capacity * 6), 3))
    g.setDrawRange(0, 0)
    return g
  }, [])
  useEffect(() => () => geo.dispose(), [geo])
  const line = useRef<THREE.LineSegments>(null)
  useFrame(() => {
    const w = sim.current
    if (!w) return
    const pts = w.linkPath(link)
    const attr = geo.getAttribute('position') as THREE.BufferAttribute
    const n = Math.min(capacity, pts.length - 1)
    for (let i = 0; i < n; i++) attr.array.set([...pts[i], ...pts[i + 1]], i * 6)
    attr.needsUpdate = true
    geo.setDrawRange(0, Math.max(0, n) * 2)
    if (line.current) line.current.visible = n > 0
  })
  return (
    <lineSegments ref={line} geometry={geo} renderOrder={12} frustumCulled={false} visible={false}>
      <lineBasicMaterial color={colour} />
    </lineSegments>
  )
}

function LinkLine({ sim, link, colour }: { sim: React.RefObject<SimWorld | null>; link: Link; colour: string }) {
  if (link.kind === 'rope' || link.kind === 'pulley') return <RopeLine sim={sim} link={link} colour={colour} />
  if (link.kind === 'hinge' || link.kind === 'weld') return null
  return <StraightLink sim={sim} link={link} colour={colour} />
}

function StraightLink({ sim, link, colour }: { sim: React.RefObject<SimWorld | null>; link: Link; colour: string }) {
  const segments = link.kind === 'spring' ? 12 : 1
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(segments * 6), 3))
    return g
  }, [segments])
  useEffect(() => () => geo.dispose(), [geo])
  useFrame(() => {
    const w = sim.current
    if (!w) return
    const a = w.state(link.a)
    const b = w.state(link.b)
    if (!a || !b) return
    const attr = geo.getAttribute('position') as THREE.BufferAttribute
    attr.array.set(linkSegments(link.kind, a.position, b.position))
    attr.needsUpdate = true
  })
  return (
    <lineSegments geometry={geo} renderOrder={12} frustumCulled={false}>
      <lineBasicMaterial color={colour} transparent opacity={link.kind === 'string' ? 0.7 : 1} />
    </lineSegments>
  )
}
