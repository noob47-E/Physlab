// One hint at a time under the drawing, for the simple Sandbox (SB63). Today's hint says four things at once (drag, Play,
// throw, turn the view); a first-time student needs the one next thing. Which sentence it is comes from the state alone,
// here, away from React, so the rule can be tested: every combination of the inputs lands on exactly one of four.

/** What the student is in the middle of: a fresh Sandbox, an experiment waiting for Play, a run going, a run paused. */
export type HintMoment = 'fresh' | 'loaded' | 'running' | 'paused'

export const SIMPLE_HINTS: Record<HintMoment, string> = {
  fresh: 'Pick an experiment, then press Play',
  loaded: 'Press Play to start',
  running: 'Click an object to see its speed',
  paused: 'Press Play to go on, or Reset to start again'
}

export interface HintInput {
  playing: boolean
  /** The run's clock: above zero means it has run and stands paused part-way. */
  engineTime: number
  /** The loaded experiment (sim/store.ts presetId), or null for the starting scene and a built one. */
  presetId: string | null
  /** The student has changed the scene by hand (added, moved, typed): their own experiment is as loaded as a tile's. */
  edited: boolean
}

export function hintMoment(i: HintInput): HintMoment {
  if (i.playing) return 'running'
  if (i.engineTime > 0) return 'paused'
  return i.presetId !== null || i.edited ? 'loaded' : 'fresh'
}

export const simpleHint = (i: HintInput): string => SIMPLE_HINTS[hintMoment(i)]
