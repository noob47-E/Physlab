// Draws the sandbox world and drives the engine: one step per frame while the timeline plays.
// The engine hands back a plain array of positions, so nothing here touches Jolt itself.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { useScene } from '../core/store'
import { useApp } from '../app/modes'
import { massOf, useSandbox } from '../sim/store'
import { SimWorld, STRIDE } from '../sim/world'
import type { BodyDef } from '../sim/types'
import { Arrow } from './ObjectViews'
import { overlay, SpanPool } from './overlay'
import { toScreen } from './cameraUtils'
import { formatMeasure } from '../math/format'

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

  // Any change to the objects rebuilds the world from the definitions.
  useEffect(() => {
    if (!sim.current || !ready) return
    sim.current.rebuild(bodies)
    invalidate()
  }, [bodies, ready, invalidate])

  useEffect(() => {
    if (!sim.current || !ready) return
    sim.current.setWorldSettings(world)
    invalidate()
  }, [world, ready, invalidate])

  useEffect(() => () => pool.dispose(), [pool])

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
            return `${d.name} pos=${st.position.map((n) => n.toFixed(2)).join(',')} v=${Math.hypot(...st.velocity).toFixed(2)} screen=${sp.x.toFixed(0)},${sp.y.toFixed(0)} size=${state.size.width}x${state.size.height} cam=${state.camera.position.toArray().map((n) => n.toFixed(1)).join(',')}${onScreen ? '' : ' OFFSCREEN'}`
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
        const speed = Math.hypot(st.velocity[0], st.velocity[1], st.velocity[2])
        const text = `${def.name}  ${formatMeasure(speed, 'number', settings)} m/s  ${st.mass.toFixed(2)} kg`
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
      {ready && <VelocityArrows sim={sim} />}
    </group>
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
        // One metre of arrow for every 4 m/s, so a fast object has a long arrow.
        const k = 0.25
        return (
          <Arrow
            key={def.id}
            tail={st.position}
            comp={[st.velocity[0] * k, st.velocity[1] * k, st.velocity[2] * k]}
            color="#4dabf7"
            is3D
            thick={2}
            renderOrder={14}
          />
        )
      })}
    </>
  )
}

export { massOf }
