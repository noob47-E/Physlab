// What the Launcher's Set does (the owner, Tue 13 Oct 2026: "the launcher is not working, I am unable to launch the ball").
// Before a run has started, a launch speed is the object's start, like any number typed in the panel. Part-way through a run
// a typed number only moves the start (H20, the owner's choice), so Set used to change nothing the student could see until
// Reset. But Launch is an action, not a setting: part-way through a run it throws the object now, from where it is, and
// Reset still goes back to the start.

import type { V3 } from '../math/vec'
import { engine, useSandbox } from './store'

type Launched = 'start' | 'now'

export function launch(id: string, velocity: V3): Launched {
  const world = engine.world
  if (world && world.stepIndex > 0) {
    world.setVelocity(id, velocity)
    return 'now'
  }
  useSandbox.getState().updateBody(id, { velocity })
  return 'start'
}

/** The line under the Launcher after Set, or nothing when the speed simply became the start. */
export function launchNote(how: Launched): string | null {
  return how === 'now' ? 'Launched from where it is now. Reset puts it back at its start.' : null
}
