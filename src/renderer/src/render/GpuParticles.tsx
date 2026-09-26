// GPU compute demo & benchmark: up to millions of charged particles moving in
// uniform E and B fields (Lorentz force, Boris integrator) — run on the GPU with WebGPU, and on
// the processor (fewer particles, the same start and the same push) where only WebGL2 is offered.

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { cross, dot, float, floor, Fn, hash, instancedArray, instancedDynamicBufferAttribute, instanceIndex, length, mix, smoothstep, uniform, uv, vec3 } from 'three/tsl'
import { create } from 'zustand'
import { borisStep, initSwarm, PARTICLE_BOX, particleCount, particleLook, particlePath, type ParticleLook } from './particleMath'
import { COLOR_SCHEME, themeColor, useTheme } from '../app/theme'

export const useParticleLab = create<{
  enabled: boolean
  count: number
  B: [number, number, number]
  E: [number, number, number]
  qm: number
  resetNonce: number
}>(() => ({ enabled: false, count: 500_000, B: [0, 0, 2], E: [0.3, 0, 0], qm: 1, resetNonce: 0 }))

export function GpuParticles() {
  const { enabled, count } = useParticleLab()
  const renderer = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer
  // Without WebGPU there is no compute pass, but WebGL2 draws the sprites perfectly well: the
  // processor moves the particles instead (Fix 10). Until 0.9 this drew nothing at all.
  const path = particlePath((renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2')
  if (!enabled || !path) return null
  const n = particleCount(path, count)
  return path === 'gpu' ? <ParticleSystem key={n} count={n} renderer={renderer} /> : <CpuParticleSystem key={n} count={n} />
}

type TslNode = Parameters<typeof length>[0]

/**
 * The material both paths draw with: one soft dot per particle, the theme's slow colour shading
 * to its fast one. The blend and the colours come from the theme (particleMath.ts), and a theme
 * change builds a new material, because WebGPU compiles colours and the blend into the pipeline.
 */
function particleMaterial(position: TslNode, velocity: TslNode, look: ParticleLook) {
  const blending = look.blending === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending
  const material = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending })
  material.positionNode = position as never
  const speed = length(velocity)
  material.colorNode = mix(vec3(...look.slow), vec3(...look.fast), speed.div(5).clamp()).mul(look.gain)
  material.opacityNode = smoothstep(float(0.5), float(0.1), uv().sub(0.5).length())
  material.scaleNode = float(0.05)
  return material
}

function particleSprite(count: number) {
  const sprite = new THREE.Sprite()
  sprite.count = count
  sprite.frustumCulled = false
  /** Puts the theme's material on; the sprite is built once per count and outlives a theme change. */
  const wear = (m: THREE.SpriteNodeMaterial) => void (sprite.material = m as never)
  return { sprite, wear }
}

/** The swarm's material for the current theme, swapped onto the sprite before it is drawn. */
function useParticleMaterial(wear: (m: THREE.SpriteNodeMaterial) => void, position: TslNode, velocity: TslNode, count: number) {
  const theme = useTheme((t) => t.theme)
  const material = useMemo(
    () => particleMaterial(position, velocity, particleLook(COLOR_SCHEME[theme], themeColor('--particle-slow'), themeColor('--particle-fast'), count)),
    [theme, position, velocity, count]
  )
  useLayoutEffect(() => {
    wear(material)
    return () => material.dispose()
  }, [wear, material])
}

/**
 * A dev-only handle for the browser check that holds the two paths to each other: hold the frame
 * loop, reset, take a fixed number of 1/60 s steps, read the positions back.
 */
type LabProbe = { path: 'gpu' | 'cpu'; count: number; hold: (on: boolean) => void; reset: () => void; step: (n: number) => void; read: () => Promise<Float32Array> }
const probe = { held: false }
const setProbe = (p: LabProbe | null) => {
  if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __gpuLab?: LabProbe | null }).__gpuLab = p
}

function ParticleSystem({ count, renderer }: { count: number; renderer: THREE.WebGPURenderer }) {
  const sim = useMemo(() => {
    const pos = instancedArray(count, 'vec3')
    const vel = instancedArray(count, 'vec3')
    const uB = uniform(new THREE.Vector3(0, 0, 2))
    const uE = uniform(new THREE.Vector3(0.3, 0, 0))
    const uDt = uniform(1 / 60)
    const uQm = uniform(1)
    // particleMath.ts builds the processor's swarm from the same hash and the same box.
    const BOX = PARTICLE_BOX

    const init = Fn(() => {
      const i = instanceIndex
      const p = pos.element(i)
      const v = vel.element(i)
      p.assign(vec3(hash(i).sub(0.5), hash(i.add(11)).sub(0.5), hash(i.add(23)).sub(0.5)).mul(vec3(BOX, BOX, BOX * 0.5)))
      v.assign(vec3(hash(i.add(37)).sub(0.5), hash(i.add(53)).sub(0.5), hash(i.add(71)).sub(0.5)).mul(vec3(6, 6, 2)))
    })().compute(count)

    const update = Fn(() => {
      const p = pos.element(instanceIndex)
      const v = vel.element(instanceIndex)
      const h = uQm.mul(uDt).mul(0.5)
      // Boris push: half electric kick, magnetic rotation, half electric kick.
      const vMinus = v.add(uE.mul(h)).toVar()
      const tv = uB.mul(h).toVar()
      const vPrime = vMinus.add(cross(vMinus, tv)).toVar()
      const sv = tv.mul(float(2).div(float(1).add(dot(tv, tv))))
      const vNew = vMinus.add(cross(vPrime, sv)).add(uE.mul(h)).toVar()
      v.assign(vNew)
      const np = p.add(vNew.mul(uDt))
      // Periodic box so the swarm never escapes.
      p.assign(np.sub(floor(np.div(BOX).add(0.5)).mul(BOX)))
    })().compute(count)

    const { sprite, wear } = particleSprite(count)
    const position = pos.toAttribute()
    const velocity = vel.toAttribute()
    /** One step of `dt` seconds with the fields as they are in the panel now. */
    const push = (dt: number) => {
      const st = useParticleLab.getState()
      uB.value.set(...st.B)
      uE.value.set(...st.E)
      uQm.value = st.qm
      uDt.value = dt
      renderer.compute(update)
    }
    return { init, push, sprite, wear, position, velocity, pos }
  }, [count, renderer])

  const resetNonce = useParticleLab((s) => s.resetNonce)
  useEffect(() => {
    renderer.compute(sim.init)
  }, [sim, renderer, resetNonce])

  useParticleMaterial(sim.wear, sim.position, sim.velocity, count)

  useEffect(() => {
    setProbe({
      path: 'gpu',
      count,
      hold: (on) => void (probe.held = on),
      reset: () => void renderer.compute(sim.init),
      step: (n) => {
        for (let i = 0; i < n; i++) sim.push(1 / 60)
      },
      read: async () => new Float32Array(await renderer.getArrayBufferAsync(sim.pos.value))
    })
    return () => setProbe(null)
  })

  useFrame((_s, dt) => {
    if (!probe.held) sim.push(Math.min(dt, 1 / 30))
  })

  return <primitive object={sim.sprite} />
}

/**
 * The particles moved on the processor: the swarm lives in two plain arrays, one Boris step a
 * frame (particleMath.ts), and the new positions go to the graphics card as instanced sprite
 * positions. It starts from the very places the GPU's init pass puts them.
 */
function CpuParticleSystem({ count }: { count: number }) {
  const sim = useMemo(() => {
    const swarm = initSwarm(count)
    // An *instanced* interleaved buffer: the WebGL2 backend steps a plain one per vertex, so the
    // four corners of every sprite took four different particles' positions and the swarm drew
    // as a few huge white triangles (WebGLBackend checks data.isInstancedInterleavedBuffer).
    const posBuf = new THREE.InstancedInterleavedBuffer(swarm.pos, 3, 1)
    const velBuf = new THREE.InstancedInterleavedBuffer(swarm.vel, 3, 1)
    const { sprite, wear } = particleSprite(count)
    const position: TslNode = instancedDynamicBufferAttribute(posBuf, 'vec3')
    const velocity: TslNode = instancedDynamicBufferAttribute(velBuf, 'vec3')
    // The positions change on the processor; the graphics card's copy is uploaded again.
    const uploaded = () => {
      posBuf.needsUpdate = true
      velBuf.needsUpdate = true
    }
    /** One step of `dt` seconds with the fields as they are in the panel now. */
    const push = (dt: number) => {
      const st = useParticleLab.getState()
      borisStep(swarm, st.B, st.E, st.qm, dt)
      uploaded()
    }
    const reset = () => {
      const fresh = initSwarm(count)
      swarm.pos.set(fresh.pos)
      swarm.vel.set(fresh.vel)
      uploaded()
    }
    return { swarm, push, reset, sprite, wear, position, velocity }
  }, [count])

  const resetNonce = useParticleLab((s) => s.resetNonce)
  const first = useRef(true)
  useEffect(() => {
    // The swarm was just built fresh; only a later Reset has anything to put back.
    if (first.current) {
      first.current = false
      return
    }
    sim.reset()
  }, [sim, resetNonce])

  useParticleMaterial(sim.wear, sim.position, sim.velocity, count)

  useEffect(() => {
    setProbe({
      path: 'cpu',
      count,
      hold: (on) => void (probe.held = on),
      reset: sim.reset,
      step: (n) => {
        for (let i = 0; i < n; i++) sim.push(1 / 60)
      },
      read: async () => sim.swarm.pos.slice()
    })
    return () => setProbe(null)
  })

  useFrame((_s, dt) => {
    if (!probe.held) sim.push(Math.min(dt, 1 / 30))
  })

  return <primitive object={sim.sprite} />
}
