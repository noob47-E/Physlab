// SB51: the Collision Lab's controls. Each setting's range (what the panel's sliders offer), the clamp that keeps a typed value
// in it and says so, the refusal of two carts that would meet too slowly to bounce (the engine does not bounce below 1 m/s, so
// they must come together at 1.5 m/s or more), and LabWatch, the pure rule behind "Pause just after the hit".

import type { BodyDef } from './types'
import { LAB_DEFAULTS, type LabId, type LabParams } from './labScenes'

interface LabRange {
  min: number
  max: number
  step: number
  /** How the panel and a sentence call it. */
  label: string
}

export const LAB_RANGES: Record<'e' | 'mA' | 'mB' | 'uA' | 'uB' | 'phi' | 'n', LabRange> = {
  e: { min: 0, max: 1, step: 0.05, label: 'Bounciness e' },
  mA: { min: 0.5, max: 5, step: 0.5, label: 'Mass of A' },
  mB: { min: 0.5, max: 5, step: 0.5, label: 'Mass of B' },
  uA: { min: 1.5, max: 6, step: 0.5, label: 'Speed of A' },
  uB: { min: -3, max: 3, step: 0.5, label: 'Speed of B' },
  phi: { min: 0, max: 80, step: 5, label: 'Impact angle' },
  n: { min: 1, max: 3, step: 1, label: 'Balls lifted' }
}

/** The lowest speed two carts may come together at: the engine does not bounce at all below 1 m/s. */
const MIN_APPROACH = 1.5

const UNIT: Record<keyof typeof LAB_RANGES, string> = { e: '', mA: ' kg', mB: ' kg', uA: ' m/s', uB: ' m/s', phi: '°', n: '' }

interface Clamped {
  params: LabParams
  /** The sentence to show when something was changed or refused; null when the settings stood as they were. */
  note: string | null
  refused: boolean
}

/**
 * The settings as the lab will build them: each kept in its range (and said); for the two carts, a meeting slower than
 * MIN_APPROACH refused - the settings go back to `was`, and the sentence says why.
 */
export function clampLab(id: LabId, p: LabParams, was: LabParams = p): Clamped {
  const out: LabParams = { ...p }
  const notes: string[] = []
  for (const key of Object.keys(LAB_RANGES) as (keyof typeof LAB_RANGES)[]) {
    const r = LAB_RANGES[key]
    const v = out[key]
    const kept = Math.min(r.max, Math.max(r.min, Number.isFinite(v) ? v : r.min))
    const whole = key === 'n' ? Math.round(kept) : kept
    if (whole !== v) notes.push(`${r.label} goes from ${r.min}${UNIT[key]} to ${r.max}${UNIT[key]}.`)
    out[key] = whole
  }
  if (id === 'lab1d' && out.uA - out.uB < MIN_APPROACH) {
    return { params: { ...was }, note: `The carts must come together at ${MIN_APPROACH} m/s or more here, to stay clear of the engine’s limit: it does not bounce at all below 1 m/s.`, refused: true }
  }
  return { params: out, note: notes.length ? notes.join(' ') : null, refused: false }
}

/**
 * "Pause just after the hit": fed every engine step with whether two lab bodies touch, it says when to pause - `after`
 * seconds of simulated time past the last contact of the first meeting. One meeting only: once it has said pause, a later
 * meeting does not arm it again.
 */
export class LabWatch {
  private lastContact: number | null = null
  private done = false
  private readonly wait: number

  constructor(rate: number, after: number) {
    this.wait = Math.round(after * rate)
  }

  /** Feed one step; true on the one step to pause at. */
  step(stepIndex: number, touching: boolean): boolean {
    if (this.done) return false
    if (touching) {
      this.lastContact = stepIndex
      return false
    }
    if (this.lastContact !== null && stepIndex >= this.lastContact + this.wait) {
      this.done = true
      return true
    }
    return false
  }
}

/**
 * A lab's settings as its loaded scene has them (the panel shows what is on the drawing, not its defaults): masses and speeds
 * from the bodies, e the larger of their bounciness values, the impact angle from where A starts beside B, how many cradle
 * balls move and whether they hang.
 */
export function paramsFromBuild(id: LabId, bodies: readonly BodyDef[]): LabParams {
  const p: LabParams = { ...LAB_DEFAULTS[id] }
  const named = (n: string) => bodies.find((b) => b.name === n)
  if (id === 'labcradle') {
    const balls = [1, 2, 3, 4, 5].map((i) => named(`B${i}`)).filter((b): b is BodyDef => !!b)
    if (!balls.length) return p
    p.e = Math.max(...balls.map((b) => b.restitution))
    p.n = balls.filter((b) => b.velocity[0] !== 0).length || 1
    p.uA = Math.abs(balls[0].velocity[0]) || p.uA
    p.strings = bodies.some((b) => /^P\d$/.test(b.name) && b.motion === 'static')
    return p
  }
  const [A, B] = [named('A'), named('B')]
  if (!A || !B) return p
  p.e = Math.max(A.restitution, B.restitution)
  p.mA = A.mass
  p.mB = B.mass
  p.uA = A.velocity[0]
  p.uB = B.velocity[0]
  if (id === 'lab2d') {
    const R = A.size[0] + B.size[0]
    // To a hundredth of a degree: the build's sine and back leave 29.9999 in the box.
    p.phi = Math.round(((Math.asin(Math.max(-1, Math.min(1, (B.position[1] - A.position[1]) / R))) * 180) / Math.PI) * 100) / 100
  }
  return p
}
