// The Sandbox panel’s Transport section (moved word for word from panels/Sandbox.tsx, SB2).

import { Eraser, Pause, Play, Redo2, RotateCcw, SkipForward, Undo2 } from 'lucide-react'
import { useScene } from '../../core/store'
import { useSandbox } from '../../sim/store'
import { clockText, widestClockText } from '../../sim/transport'
import { stepOneFrame } from '../../sim/stepping'

/**
 * Play, Reset, undo and the clock, pinned to the top so they are never below three screens of
 * settings. The row keeps its shape while a run plays (Fix 22, sim/transport.ts); its 4 px gaps
 * keep it, with room for a 888.89 s clock, on one line in the 372 px panel of a 1366 px window.
 */
export function Transport() {
  const engineTime = useSandbox((s) => s.engineTime)
  const past = useSandbox((s) => s.past)
  const future = useSandbox((s) => s.future)
  const undo = useSandbox((s) => s.undo)
  const redo = useSandbox((s) => s.redo)
  const resetRun = useSandbox((s) => s.resetRun)
  const clearTrails = useSandbox((s) => s.clearTrails)
  const anyTrail = useSandbox((s) => s.bodies.some((b) => b.trace))
  const playing = useScene((s) => s.playing)
  const setPlaying = useScene((s) => s.setPlaying)
  const settings = useScene((s) => s.settings)
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-[color:var(--line)] bg-[var(--bg-1)] px-3 py-2">
      <button className="btn primary" data-tour="play" onClick={() => setPlaying(!playing)} title="Play / pause (Space)">
        {playing ? <Pause size={13} /> : <Play size={13} />}
        {/* Both words share one cell and the other one is hidden, so the button is as wide as
            "Pause" either way: "Play" turning into the wider "Pause" was enough to push the row
            onto a second line on a narrow panel and jolt everything below it (Fix 22). */}
        <span className="grid">
          <span className={`col-start-1 row-start-1 ${playing ? 'invisible' : ''}`}>Play</span>
          <span className={`col-start-1 row-start-1 ${playing ? '' : 'invisible'}`}>Pause</span>
        </span>
      </button>
      <button
        className="btn"
        onClick={() => {
          setPlaying(false)
          resetRun()
        }}
        title="Every object back to its starting position, t = 0"
      >
        <RotateCcw size={13} /> Reset
      </button>
      <button
        className="icon-btn"
        onClick={() => {
          setPlaying(false)
          stepOneFrame()
        }}
        title="Step one frame (1/60 s)"
      >
        <SkipForward size={13} />
      </button>
      <button className="icon-btn" disabled={past.length === 0} onClick={undo} title="Undo the last change to the objects (Ctrl+Z)">
        <Undo2 size={13} />
      </button>
      <button className="icon-btn" disabled={future.length === 0} onClick={redo} title="Redo (Ctrl+Y)">
        <Redo2 size={13} />
      </button>
      <button className="icon-btn" disabled={!anyTrail} onClick={clearTrails} title="Clear every trail">
        <Eraser size={13} />
      </button>
      {/* The clock is the number every kinematics question needs; it used to be the hardest
          thing on the panel to read. */}
      {/* Room kept for the widest time a run shows, so the row wraps (or not) by the panel's
          width alone and never mid-run as the digits grow (sim/transport.ts). */}
      <span className="ml-auto grid justify-items-end tabular-nums text-[color:var(--text-strong)]">
        <span className="invisible col-start-1 row-start-1" aria-hidden="true">
          {widestClockText(engineTime, settings)}
        </span>
        <span className="col-start-1 row-start-1">{clockText(engineTime, settings)}</span>
      </span>
    </div>
  )
}
