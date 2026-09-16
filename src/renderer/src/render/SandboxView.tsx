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
            return st ? `${d.name} y=${st.position[1].toFixed(2)} v=${Math.hypot(...st.velocity).toFixed(2)}` : ''
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
