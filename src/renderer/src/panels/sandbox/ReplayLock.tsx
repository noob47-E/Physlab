// Replay is read-only (the owner's D5, SB17): while a recording is shown (replay or fine replay) the Sandbox panel's edit controls
// are locked, and a line says why with the recorder's own sentence (replayRefusal). Branch from here or Back to live gives
// editing back. A lock is a disabled <fieldset>: the browser greys and blocks every button, field, select and slider inside it,
// by mouse, keyboard and touch alike. Controls that only change what is shown (selecting an object, the camera, a fold's arrow,
// Send to Lab Data) stay outside the locks.

import { replayRefusal } from '../../sim/recorder'
import { useTape } from '../../sim/tapeStore'

/** True while a recording (replay or the fast re-run) is on screen. */
export const useReplayLocked = (): boolean => useTape((s) => s.mode !== 'live')

/** Locks the edit controls inside it while a recording is shown; a plain block (no box of its own) while live. */
export function ReplayLock({ children }: { children: React.ReactNode }) {
  const locked = useReplayLocked()
  return (
    <fieldset disabled={locked} className={`m-0 min-w-0 border-0 p-0 ${locked ? 'opacity-60' : ''}`}>
      {children}
    </fieldset>
  )
}

/**
 * The sentence the panel's locked controls stand for. Two lines tall whatever the time reads, so the panel under it does not
 * move as the playhead runs; nothing at all while live.
 */
export function ReplayBanner() {
  const locked = useReplayLocked()
  // The sentence names the playhead's time, so it follows the playhead; live it needs nothing.
  useTape((s) => (s.mode === 'live' ? 0 : s.playhead))
  const sentence = locked ? replayRefusal() : null
  if (sentence === null) return null
  return (
    <p role="status" className="mx-3 mt-2 h-[34px] overflow-hidden text-small text-[color:var(--text-dim)]" title={sentence}>
      {sentence}
    </p>
  )
}
