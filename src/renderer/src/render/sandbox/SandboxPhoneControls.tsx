// Part M: Sandbox Phone Controls
//
// In phone view (< 768px), the viewport is clean and spacious (no colliding formula cards
// or multi-column docks). It displays only the experiment canvas, Play/Pause, Reset,
// and one primary parameter slider (Gravity from 0 to 20 m/s²).

import { memo } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { useScene } from '../../core/store'
import { useSandbox } from '../../sim/store'
import { togglePlay, useTransportFlags } from '../../sim/transportActions'
import { fmtPrecise } from '../../math/format'

export const SandboxPhoneControls = memo(function SandboxPhoneControls() {
  const flags = useTransportFlags()
  const playing = flags.playing
  const setPlaying = useScene((s) => s.setPlaying)
  const resetRun = useSandbox((s) => s.resetRun)
  const world = useSandbox((s) => s.world)
  const setWorld = useSandbox((s) => s.setWorld)
  const gravity = world.gravity ?? 9.8

  return (
    <div
      data-testid="sandbox-phone-controls"
      className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 rounded-full border border-[var(--line-2)] bg-[var(--bg-1)] shadow-lg backdrop-blur-md z-30 select-none max-w-[92vw]"
    >
      <button
        type="button"
        className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--accent)] text-[var(--on-accent)] shadow hover:opacity-90 active:scale-95 transition-transform"
        onClick={togglePlay}
        title={playing ? 'Pause' : 'Play'}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>

      <button
        type="button"
        className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--bg-2)] text-[var(--text-strong)] hover:bg-[var(--bg-3)] active:scale-95 transition-transform"
        onClick={() => {
          setPlaying(false)
          resetRun()
        }}
        title="Reset"
        aria-label="Reset simulation"
      >
        <RotateCcw size={15} />
      </button>

      <div className="h-5 w-px bg-[var(--line-2)] mx-0.5" />

      <div className="flex items-center gap-2 min-w-0">
        <label htmlFor="phone-gravity-slider" className="text-fine font-medium text-[var(--text-dim)] whitespace-nowrap">
          g: <span className="text-[var(--text-strong)] font-mono">{fmtPrecise(gravity, { decimals: 1, precisionMode: 'dp' })}</span>
        </label>
        <input
          id="phone-gravity-slider"
          type="range"
          min="0"
          max="20"
          step="0.5"
          value={gravity}
          onChange={(e) => setWorld({ gravity: Number(e.target.value) })}
          className="w-24 sm:w-32 accent-[var(--accent)] cursor-pointer"
          aria-label="Gravity slider"
        />
      </div>
    </div>
  )
})
