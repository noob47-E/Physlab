// The Sandbox panel’s Transport section (moved word for word from panels/Sandbox.tsx, SB2). Play and Step go through
// sim/transportActions.ts (SB17), so in replay they play and step the recording, as the tape strip and the keys do.

import { Eraser, Pause, Play, Redo2, RotateCcw, SkipForward, Undo2 } from 'lucide-react'
import { useScene } from '../../core/store'
import { useSandbox } from '../../sim/store'
import { clockText, widestClockText } from '../../sim/transport'
import { useNum } from './common'
import { replayRefusal } from '../../sim/recorder'
import { shownTape, useTape } from '../../sim/tapeStore'
import { stepForward, stepOnTitle, togglePlay, useTransportFlags } from '../../sim/transportActions'
import { rateOf } from '../../sim/types'

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
  const setPlaying = useScene((s) => s.setPlaying)
  const settings = useScene((s) => s.settings)
  const world = useSandbox((s) => s.world)
  const num = useNum()
  // Live, Play and the clock are the engine's; in replay they are the recording's, and an edit is refused (D5).
  const flags = useTransportFlags()
  const playing = flags.playing
  const mode = useTape((s) => s.mode)
  const tape = shownTape()
  const refusal = mode === 'live' ? null : replayRefusal()
  const clock = mode !== 'live' && tape && flags.at !== null ? `${clockText(tape.timeOf(flags.at), settings)} · ${mode === 'fine' ? 'fine replay' : 'replay'}` : clockText(engineTime, settings)
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-[color:var(--line)] bg-[var(--bg-1)] px-3 py-2">
      <button className="btn primary" data-tour="play" onClick={togglePlay} title={playing ? 'Pause (Space or K)' : 'Play (Space or L)'}>
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
        onClick={stepForward}
        title={stepOnTitle(num(mode === 'live' || !tape ? rateOf(world) : tape.rate))}
      >
        <SkipForward size={13} />
      </button>
      <button className="icon-btn" disabled={past.length === 0 || refusal !== null} onClick={undo} title={refusal ?? 'Undo the last change to the objects (Ctrl+Z)'}>
        <Undo2 size={13} />
      </button>
      <button className="icon-btn" disabled={future.length === 0 || refusal !== null} onClick={redo} title={refusal ?? 'Redo (Ctrl+Y)'}>
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
        <span className="col-start-1 row-start-1">{clock}</span>
      </span>
    </div>
  )
}
