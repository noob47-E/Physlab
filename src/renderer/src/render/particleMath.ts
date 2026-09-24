// The GPU Lab's physics without the graphics card's compute: the same starting swarm and the same
// Boris push that GpuParticles.tsx runs in a WebGPU compute shader, worked out on the processor.
//
// Fix 10: a laptop whose graphics do not offer WebGPU (Chromium turns it off on many older Intel
// drivers) drew the axes and nothing else — GpuParticles returned null without WebGPU and the
// panel said "(GPU compute needs WebGPU)". WebGL2 draws the particles well enough; it is only the
// compute step that it cannot run, so the step comes here.
//
// Kept free of three.js so the tests can hold it to the analytic answers.

import { fmt } from '../math/format'

/** Side of the periodic box the swarm lives in, in metres (the z side is half of it at the start). */
export const PARTICLE_BOX = 14

/** Particle counts offered when the graphics card does the work. */
export const GPU_COUNTS = [100_000, 500_000, 1_000_000, 2_000_000] as const
/**
 * Particle counts offered when the processor does the work. 20 000 particles cost a few
 * milliseconds a frame on a 2016 dual-core laptop; the push is a few dozen multiplications per
 * particle and the positions go to the graphics card once a frame.
 */
export const CPU_COUNTS = [5_000, 10_000, 20_000, 50_000] as const
export const CPU_DEFAULT_COUNT = 20_000

export type ParticlePath = 'gpu' | 'cpu'

/** Which way the particles are moved: on the graphics card with WebGPU, on the processor with WebGL2, not yet while the renderer is starting. */
export function particlePath(backend: 'WebGPU' | 'WebGL2' | 'starting'): ParticlePath | null {
  return backend === 'WebGPU' ? 'gpu' : backend === 'WebGL2' ? 'cpu' : null
}

/** The number of particles actually run: the processor runs one of its own counts, 20 000 unless one of those was chosen. */
export function particleCount(path: ParticlePath, asked: number): number {
  if (path === 'gpu') return asked
  return (CPU_COUNTS as readonly number[]).includes(asked) ? asked : CPU_DEFAULT_COUNT
}

const f32 = Math.fround

/**
 * three.js's TSL `hash` (PCG, from pcg-random.org via shadertoy XlGcRh), bit for bit: the GPU's
 * starting swarm is built from it, so the processor's swarm starts from the same places.
 */
export function pcgHash(seed: number): number {
  const state = (Math.imul(seed >>> 0, 747796405) + 2891336453) >>> 0
  const word = Math.imul(((state >>> ((state >>> 28) + 4)) ^ state) >>> 0, 277803737) >>> 0
  const result = ((word >>> 22) ^ word) >>> 0
  // uint → float rounds to 24 bits on the GPU; the power of two after it is exact.
  return f32(f32(result) * 2 ** -32)
}

export interface Swarm {
  count: number
  pos: Float32Array
  vel: Float32Array
}

/** The starting swarm, particle for particle the one GpuParticles' `init` compute pass makes. */
export function initSwarm(count: number): Swarm {
  const pos = new Float32Array(count * 3)
  const vel = new Float32Array(count * 3)
  const sp = [PARTICLE_BOX, PARTICLE_BOX, PARTICLE_BOX * 0.5]
  const sv = [6, 6, 2]
  const pOff = [0, 11, 23]
  const vOff = [37, 53, 71]
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) {
      pos[i * 3 + k] = f32(f32(pcgHash(i + pOff[k]) - 0.5) * sp[k])
      vel[i * 3 + k] = f32(f32(pcgHash(i + vOff[k]) - 0.5) * sv[k])
    }
  }
  return { count, pos, vel }
}

/**
 * One Boris step for every particle, in place: half an electric kick, the magnetic rotation, the
 * other half kick, then the move, with the box wrapping round. The same sums, in the same order,
 * as GpuParticles' `update` pass. Boris keeps a particle's speed exactly in a magnetic field
 * alone, which is why the spirals neither grow nor shrink however long it runs.
 */
export function borisStep(sw: Swarm, B: readonly number[], E: readonly number[], qm: number, dt: number): void {
  const { pos, vel, count } = sw
  const h = qm * dt * 0.5
  const eh0 = E[0] * h
  const eh1 = E[1] * h
  const eh2 = E[2] * h
  const t0 = B[0] * h
  const t1 = B[1] * h
  const t2 = B[2] * h
  const k = 2 / (1 + t0 * t0 + t1 * t1 + t2 * t2)
  const s0 = t0 * k
  const s1 = t1 * k
  const s2 = t2 * k
  const L = PARTICLE_BOX
  for (let i = 0, j = 0; i < count; i++, j += 3) {
    const m0 = vel[j] + eh0
    const m1 = vel[j + 1] + eh1
    const m2 = vel[j + 2] + eh2
    const p0 = m0 + (m1 * t2 - m2 * t1)
    const p1 = m1 + (m2 * t0 - m0 * t2)
    const p2 = m2 + (m0 * t1 - m1 * t0)
    const v0 = m0 + (p1 * s2 - p2 * s1) + eh0
    const v1 = m1 + (p2 * s0 - p0 * s2) + eh1
    const v2 = m2 + (p0 * s1 - p1 * s0) + eh2
    vel[j] = v0
    vel[j + 1] = v1
    vel[j + 2] = v2
    const x = pos[j] + v0 * dt
    const y = pos[j + 1] + v1 * dt
    const z = pos[j + 2] + v2 * dt
    pos[j] = x - Math.floor(x / L + 0.5) * L
    pos[j + 1] = y - Math.floor(y / L + 0.5) * L
    pos[j + 2] = z - Math.floor(z / L + 0.5) * L
  }
}

/** The largest gap between two swarms' positions, measured the short way round the box. */
export function largestGap(a: Float32Array, b: Float32Array): number {
  let worst = 0
  for (let j = 0; j < Math.min(a.length, b.length); j++) {
    let d = Math.abs(a[j] - b[j]) % PARTICLE_BOX
    d = Math.min(d, PARTICLE_BOX - d)
    if (d > worst) worst = d
  }
  return worst
}

/**
 * How closely the processor's swarm follows the graphics card's: after CPU_GPU_TOLERANCE_SECONDS
 * of 1/60 s steps (600 steps of the default fields) no particle is further apart than this, in
 * metres. The GPU does every sum in 32-bit floats and the processor in 64-bit ones, so they part by
 * rounding alone. The gap grows roughly in step with time: the 32-bit model in the tests is about
 * 0.04 mm apart at 10 s, 0.2 mm at a minute and 1.8 mm at ten minutes, so the promise is for the
 * first ten seconds only and the panel says so.
 */
export const CPU_GPU_TOLERANCE_M = 1e-3
/** The running time, in seconds, that CPU_GPU_TOLERANCE_M is promised for. */
export const CPU_GPU_TOLERANCE_SECONDS = 10

/**
 * GPU Lab's sentence for the processor path: which path runs, how many particles at most, and how
 * far it may be from the graphics card's answer, and for how long. Numbers come from the constants
 * above through fmt, so the words cannot drift from what the tests hold.
 */
export function cpuPathSentence(): string {
  const most = Math.max(...CPU_COUNTS)
  const mm = fmt(CPU_GPU_TOLERANCE_M * 1000)
  return (
    "This computer's graphics do not offer WebGPU, so the processor moves the particles instead: the same physics from the same start, " +
    `with fewer particles (up to ${fmt(most / 1000)} thousand). After ${fmt(CPU_GPU_TOLERANCE_SECONDS)} seconds each particle is within ` +
    `${mm} mm of where the graphics card would put it; tiny rounding differences grow slowly after that.`
  )
}

/** How the swarm is painted in one theme: the blend, the slow and fast colours (0–1 RGB) and a brightness gain. */
export interface ParticleLook {
  blending: 'additive' | 'normal'
  slow: [number, number, number]
  fast: [number, number, number]
  gain: number
}

const rgb01 = (hex: string): [number, number, number] => {
  const h = hex.trim().replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6)
  const n = Number.parseInt(full, 16)
  return Number.isNaN(n) ? [0.5, 0.5, 0.5] : [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/**
 * The swarm's look for a theme whose canvas is `scheme`. On a dark canvas the sprites are added
 * together, so a dense knot glows, and each is dimmed by the count so millions do not saturate.
 * On the Light theme's pale canvas added light can only go whiter — 500 000 blue and orange dots
 * summed to a faint white haze and the student saw empty axes — so there each sprite is painted
 * over what is behind it, at full strength, in the theme's darker pair.
 */
export function particleLook(scheme: 'dark' | 'light', slowHex: string, fastHex: string, count: number): ParticleLook {
  const slow = rgb01(slowHex)
  const fast = rgb01(fastHex)
  if (scheme === 'light') return { blending: 'normal', slow, fast, gain: 1 }
  return { blending: 'additive', slow, fast, gain: Math.min(0.9, 60_000 / Math.max(1, count)) }
}
