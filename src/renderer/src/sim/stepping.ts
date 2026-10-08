// What a step of the Sandbox's engine hands to the rest of the app: its readings into the recording,
// and (for "Step one frame") the live values and contacts the panel shows. The frame loop in
// render/SandboxView.tsx and the panel's Step button share it, so a stepped frame is recorded and
// shown exactly as a played one is.

import { useSandbox, engine } from './store'
import { sampleOf, type Sample } from './recording'
import { groundTopOf } from './energy'
import type { BodyDef, BodyState } from './types'
import type { SimSample } from './world'

/** How far below the floor a body may fall before it is put back where it started. */
export const FALL_LIMIT = 10

/**
 * Puts the engine's readings into the recording, each on the time the engine gave it. Heights and
 * energies are the panel's (the floor is the datum, g is the world's), which is why the engine
 * hands back states and this turns them into Samples. The frame's own time is never used: a frame
 * can hold several steps, and the recorded run must be on the grid 0, 0.1, 0.2 … of the sim clock.
 */
export function recordReadings(readings: SimSample[], bodies: BodyDef[], gravity: number, groundTop: number): void {
  for (const reading of readings) {
    const batch: Record<string, Sample> = {}
    for (const d of bodies) {
      const s = reading.states[d.id]
      // A body that has fallen off the world is put back by the next live publish; its plunge is
      // not part of the run, as it never was.
      if (!s || d.motion !== 'dynamic' || s.position[1] < groundTop - FALL_LIMIT) continue
      batch[d.id] = sampleOf(d, s, reading.t, gravity, groundTop)
    }
    if (Object.keys(batch).length) useSandbox.getState().record(batch)
  }
}

/**
 * The Step button: one fixed step of 1/60 s of simulated time, whatever the slow-motion setting,
 * recorded and published like a played frame. It used to call step(1/60) and drop what came back,
 * so a step at t = 0 used up the run's t = 0 reading, the panel's numbers stood still, and in slow
 * motion the step was a tenth of a step and nothing moved.
 */
export function stepOneFrame(): void {
  const w = engine.world
  if (!w) return
  const { bodies, world } = useSandbox.getState()
  const groundTop = groundTopOf(bodies)
  const { contacts, samples } = w.stepOnce()
  if (contacts.length) useSandbox.getState().pushContacts(contacts)
  recordReadings(samples, bodies, world.gravity, groundTop)
  const live: Record<string, BodyState> = {}
  for (const d of bodies) {
    const s = w.state(d.id)
    if (s) live[d.id] = s
  }
  useSandbox.setState({ live, engineTime: w.time })
}
