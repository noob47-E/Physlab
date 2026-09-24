import { describe, expect, it } from 'vitest'
import {
  borisStep,
  CPU_DEFAULT_COUNT,
  CPU_GPU_TOLERANCE_M,
  CPU_GPU_TOLERANCE_SECONDS,
  CPU_COUNTS,
  cpuPathSentence,
  initSwarm,
  largestGap,
  particleCount,
  particlePath,
  pcgHash,
  PARTICLE_BOX,
  type Swarm
} from '../src/renderer/src/render/particleMath'
import { readSource } from './helpers/repo'

// Fix 10: GPU Lab ran its particles only in a WebGPU compute shader, so a computer without WebGPU
// drew empty axes. These hold the processor's path to the physics and to the GPU's own start.

const DT = 1 / 60

/** One particle, placed by hand. */
const one = (p: [number, number, number], v: [number, number, number]): Swarm => ({ count: 1, pos: new Float32Array(p), vel: new Float32Array(v) })

/** PCG hash in BigInt arithmetic, written from pcg-random.org's description, not from the port. */
function pcgReference(seed: number): number {
  const M = 0xffffffffn
  const state = (BigInt(seed) * 747796405n + 2891336453n) & M
  const word = (((state >> ((state >> 28n) + 4n)) ^ state) * 277803737n) & M
  const result = ((word >> 22n) ^ word) & M
  return Math.fround(Math.fround(Number(result)) / 2 ** 32)
}

describe('the starting swarm is the GPU’s own', () => {
  it('the hash matches an independent 64-bit reference for the first 5000 seeds', () => {
    for (let s = 0; s < 5000; s++) {
      const h = pcgHash(s)
      expect(h).toBe(pcgReference(s))
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(1)
    }
  })

  it('fills the box evenly: positions within ±7 m (±3.5 m in z), speeds within ±3 m/s (±1 in z), centred on zero', () => {
    const sw = initSwarm(20_000)
    const mean = [0, 0, 0]
    for (let i = 0; i < sw.count; i++) {
      for (let k = 0; k < 3; k++) {
        const half = k === 2 ? PARTICLE_BOX / 4 : PARTICLE_BOX / 2
        expect(Math.abs(sw.pos[i * 3 + k])).toBeLessThanOrEqual(half)
        expect(Math.abs(sw.vel[i * 3 + k])).toBeLessThanOrEqual(k === 2 ? 1 : 3)
        mean[k] += sw.pos[i * 3 + k] / sw.count
      }
    }
    for (const m of mean) expect(Math.abs(m)).toBeLessThan(0.1)
  })
})

describe('the processor’s Boris push gives the textbook answers', () => {
  it('cyclotron period: q/m = 1, B = 2 T along z gives T = 2π m/(qB) = π s', () => {
    const sw = one([0, 0, 0], [1, 0, 0])
    let turned = 0
    let prev = Math.atan2(sw.vel[1], sw.vel[0])
    let steps = 0
    while (turned < 2 * Math.PI) {
      borisStep(sw, [0, 0, 2], [0, 0, 0], 1, DT)
      const a = Math.atan2(sw.vel[1], sw.vel[0])
      let d = a - prev
      if (d > Math.PI) d -= 2 * Math.PI
      if (d < -Math.PI) d += 2 * Math.PI
      turned += Math.abs(d)
      prev = a
      steps++
    }
    // Boris turns by 2·atan(ω dt / 2) a step, a hair short of ω dt: within 0.01 % of π s.
    const perStep = 2 * Math.atan(DT)
    const period = (2 * Math.PI) / (perStep / DT)
    expect(Math.abs(period - Math.PI) / Math.PI).toBeLessThan(1e-4)
    expect(Math.abs(steps * DT - Math.PI)).toBeLessThan(DT)
  })

  it('keeps each particle’s speed in a magnetic field alone (the spirals neither grow nor shrink)', () => {
    const sw = initSwarm(2_000)
    const speed = (i: number) => Math.hypot(sw.vel[i * 3], sw.vel[i * 3 + 1], sw.vel[i * 3 + 2])
    const before = Array.from({ length: sw.count }, (_, i) => speed(i))
    for (let n = 0; n < 600; n++) borisStep(sw, [0.4, -0.7, 2], [0, 0, 0], 1, DT)
    for (let i = 0; i < sw.count; i++) expect(Math.abs(speed(i) - before[i])).toBeLessThan(1e-5 * Math.max(1, before[i]))
  })

  it('E × B drift with the GPU Lab’s own fields: E = 0.3 V/m along x, B = 2 T along z drift at E/B = 0.15 m/s along −y', () => {
    const sw = one([0, 0, 0], [0, 0, 0])
    const periods = 10
    const steps = Math.round((periods * Math.PI) / DT)
    for (let n = 0; n < steps; n++) borisStep(sw, [0, 0, 2], [0.3, 0, 0], 1, DT)
    const t = steps * DT
    expect(sw.pos[1] / t).toBeCloseTo(-0.15, 3)
    expect(Math.abs(sw.pos[0] / t)).toBeLessThan(0.15 * 0.005)
    expect(sw.pos[2]).toBe(0)
  })

  it('wraps round the box instead of letting the swarm escape', () => {
    const sw = one([6.99, 0, 0], [3, 0, 0])
    borisStep(sw, [0, 0, 0], [0, 0, 0], 1, DT)
    expect(sw.pos[0]).toBeCloseTo(6.99 + 3 * DT - PARTICLE_BOX, 5)
  })
})

describe('the processor follows the graphics card within the stated tolerance', () => {
  /** The GPU's sums, every one rounded to 32 bits as a WGSL f32 shader rounds them. */
  function gpuLikeStep(sw: Swarm, B: number[], E: number[], qm: number, dt: number) {
    const f = Math.fround
    const h = f(f(qm * dt) * 0.5)
    for (let i = 0; i < sw.count; i++) {
      const v = [0, 1, 2].map((k) => sw.vel[i * 3 + k])
      const m = v.map((x, k) => f(x + f(E[k] * h)))
      const t = B.map((b) => f(b * h))
      const cr = (a: number[], b: number[]) => [f(f(a[1] * b[2]) - f(a[2] * b[1])), f(f(a[2] * b[0]) - f(a[0] * b[2])), f(f(a[0] * b[1]) - f(a[1] * b[0]))]
      const mt = cr(m, t)
      const p = m.map((x, k) => f(x + mt[k]))
      const tt = f(f(f(t[0] * t[0]) + f(t[1] * t[1])) + f(t[2] * t[2]))
      const s = t.map((x) => f(x * f(2 / f(1 + tt))))
      const ps = cr(p, s)
      const nv = m.map((x, k) => f(f(x + ps[k]) + f(E[k] * h)))
      for (let k = 0; k < 3; k++) {
        sw.vel[i * 3 + k] = nv[k]
        const np = f(sw.pos[i * 3 + k] + f(nv[k] * dt))
        sw.pos[i * 3 + k] = f(np - f(Math.floor(f(np / PARTICLE_BOX) + 0.5) * PARTICLE_BOX))
      }
    }
  }

  it(`after ${CPU_GPU_TOLERANCE_SECONDS} s of the default fields no particle is more than ${CPU_GPU_TOLERANCE_M} m from its 32-bit twin`, () => {
    const a = initSwarm(3_000)
    const b = initSwarm(3_000)
    for (let n = 0; n < Math.round(CPU_GPU_TOLERANCE_SECONDS / DT); n++) {
      borisStep(a, [0, 0, 2], [0.3, 0, 0], 1, DT)
      gpuLikeStep(b, [0, 0, 2], [0.3, 0, 0], 1, DT)
    }
    expect(largestGap(a.pos, b.pos)).toBeLessThan(CPU_GPU_TOLERANCE_M)
  })

  it('the panel promises the millimetre for the time the test holds it, and says the gap grows after', () => {
    const text = cpuPathSentence()
    expect(text).toContain('WebGPU')
    expect(text).toContain(`up to ${Math.max(...CPU_COUNTS) / 1000} thousand`)
    expect(text).toContain(`After ${CPU_GPU_TOLERANCE_SECONDS} seconds each particle is within ${CPU_GPU_TOLERANCE_M * 1000} mm`)
    expect(text).toMatch(/grow slowly after that/)
    const panel = readSource('src/renderer/src/panels/GpuLab.tsx')
    expect(panel).toContain('cpuPathSentence()')
    expect(panel).not.toMatch(/50 000|within a millimetre/)
  })

  it('largestGap measures the short way round the box', () => {
    expect(largestGap(new Float32Array([6.9]), new Float32Array([-6.9]))).toBeCloseTo(0.2, 5)
  })
})

describe('which path runs, and how many particles', () => {
  it('WebGPU runs on the graphics card, WebGL2 on the processor, nothing while the renderer starts', () => {
    expect(particlePath('WebGPU')).toBe('gpu')
    expect(particlePath('WebGL2')).toBe('cpu')
    expect(particlePath('starting')).toBeNull()
  })

  it('the processor runs 20 000 unless one of its own counts was chosen; the graphics card runs what was asked', () => {
    expect(particleCount('cpu', 500_000)).toBe(CPU_DEFAULT_COUNT)
    expect(particleCount('cpu', 60_000)).toBe(CPU_DEFAULT_COUNT)
    expect(particleCount('cpu', 50_000)).toBe(50_000)
    expect(particleCount('gpu', 2_000_000)).toBe(2_000_000)
  })

  it('GpuParticles no longer draws nothing without WebGPU, and the panel no longer says compute needs it', () => {
    expect(readSource('src/renderer/src/render/GpuParticles.tsx')).not.toMatch(/!isWebGPU\) return null/)
    expect(readSource('src/renderer/src/panels/GpuLab.tsx')).not.toContain('GPU compute needs WebGPU')
  })
})
