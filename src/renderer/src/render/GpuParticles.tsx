// GPU compute demo & benchmark: up to millions of charged particles moving in
// uniform E and B fields (Lorentz force, Boris integrator) — runs entirely on the GPU.

import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { cross, dot, float, floor, Fn, hash, instancedArray, instanceIndex, length, mix, smoothstep, uniform, uv, vec3 } from 'three/tsl'
import { create } from 'zustand'

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
  const isWebGPU = !!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
  if (!enabled || !isWebGPU) return null
  return <ParticleSystem key={count} count={count} renderer={renderer} />
}

function ParticleSystem({ count, renderer }: { count: number; renderer: THREE.WebGPURenderer }) {
  const sim = useMemo(() => {
    const pos = instancedArray(count, 'vec3')
    const vel = instancedArray(count, 'vec3')
    const uB = uniform(new THREE.Vector3(0, 0, 2))
    const uE = uniform(new THREE.Vector3(0.3, 0, 0))
    const uDt = uniform(1 / 60)
    const uQm = uniform(1)
    const BOX = 14

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

    const material = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    material.positionNode = pos.toAttribute()
    const speed = length(vel.toAttribute())
    // Brightness scales down with particle count so millions of particles do not saturate to white.
    const gain = Math.min(0.9, 60_000 / count)
    material.colorNode = mix(vec3(0.15, 0.5, 1.0), vec3(1.0, 0.4, 0.12), speed.div(5).clamp()).mul(gain)
    material.opacityNode = smoothstep(float(0.5), float(0.1), uv().sub(0.5).length())
    material.scaleNode = float(0.05)
    const sprite = new THREE.Sprite(material)
    sprite.count = count
    sprite.frustumCulled = false
    return { init, update, sprite, material, uB, uE, uDt, uQm }
  }, [count])

  const resetNonce = useParticleLab((s) => s.resetNonce)
  useEffect(() => {
    renderer.compute(sim.init)
  }, [sim, renderer, resetNonce])

  useEffect(() => () => sim.material.dispose(), [sim])

  useFrame((_s, dt) => {
    const st = useParticleLab.getState()
    sim.uB.value.set(...st.B)
    sim.uE.value.set(...st.E)
    sim.uQm.value = st.qm
    sim.uDt.value = Math.min(dt, 1 / 30)
    renderer.compute(sim.update)
  })

  return <primitive object={sim.sprite} />
}
