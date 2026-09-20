import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import { useScene } from '../core/store'
import { useApp } from '../app/modes'
import { engine, useSandbox } from '../sim/store'
import { formatMeasure } from '../math/format'

export function Timeline() {
  const mode = useApp((s) => s.mode)
  return mode === 'sandbox' ? <SandboxTimeline /> : <MathsTimeline />
}

/**
 * In the Sandbox the clock belongs to the physics engine, not to the animated drawing. This
 * panel used to show the drawing's clock here and its Reset did nothing to the experiment.
 */
function SandboxTimeline() {
  const time = useSandbox((s) => s.engineTime)
  const timeScale = useSandbox((s) => s.world.timeScale)
  const setWorld = useSandbox((s) => s.setWorld)
  const resetRun = useSandbox((s) => s.resetRun)
  const playing = useScene((s) => s.playing)
  const setPlaying = useScene((s) => s.setPlaying)
  const settings = useScene((s) => s.settings)
  return (
    <div className="panel flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn primary" onClick={() => setPlaying(!playing)} title="Play / pause (Space)">
          {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? 'Pause' : 'Play'}
        </button>
        <button
          className="btn"
          onClick={() => {
            setPlaying(false)
            engine.world?.step(1 / 60)
            useSandbox.setState({ engineTime: engine.world?.time ?? 0 })
          }}
          title="Step one frame (1/60 s)"
        >
          <SkipForward size={14} />
        </button>
        <button
          className="btn"
          onClick={() => {
            setPlaying(false)
            resetRun()
          }}
          title="Everything back to the start, t = 0"
        >
          <RotateCcw size={14} /> Reset
        </button>
        <span className="ml-3 font-mono text-[15px] tabular-nums text-[color:var(--text-strong)]">t = {formatMeasure(time, 'number', settings)} s</span>
        <span className="ml-4 text-[color:var(--text-dim)]">Speed</span>
        <div className="seg">
          {[0.1, 0.25, 0.5, 1].map((t) => (
            <button key={t} className={timeScale === t ? 'on' : ''} onClick={() => setWorld({ timeScale: t })}>
              {t === 1 ? 'normal' : `×${t}`}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[color:var(--text-dim)]">The Sandbox clock. Slow motion is the same setting as in the Sandbox panel.</p>
    </div>
  )
}

function MathsTimeline() {
  const time = useScene((s) => s.time)
  const playing = useScene((s) => s.playing)
  const speed = useScene((s) => s.speed)
  const setPlaying = useScene((s) => s.setPlaying)
  const setTime = useScene((s) => s.setTime)
  const setSpeed = useScene((s) => s.setSpeed)
  const settings = useScene((s) => s.settings)
  const duration = Math.max(10, Math.ceil(time / 10) * 10)

  return (
    <div className="panel flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <button className="btn" onClick={() => setPlaying(!playing)} title="Play / pause (Space)">
          {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? 'Pause' : 'Play'}
        </button>
        <button className="btn" onClick={() => setTime(time + 1 / 60)} title="Step one frame">
          <SkipForward size={14} />
        </button>
        <button
          className="btn"
          onClick={() => {
            setPlaying(false)
            setTime(0)
          }}
          title="Back to t = 0"
        >
          <RotateCcw size={14} />
        </button>
        <span className="ml-3 w-24 font-mono text-[15px] tabular-nums text-[color:var(--text-strong)]">t = {formatMeasure(time, 'number', settings)} s</span>
        <span className="ml-4 text-[color:var(--text-dim)]">Speed</span>
        <div className="seg">
          {[0.25, 0.5, 1, 2, 4].map((s) => (
            <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
      </div>
      <input type="range" min={0} max={duration} step={0.01} value={time} onChange={(e) => setTime(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
      <p className="text-[color:var(--text-dim)]">
        Use <code className="text-[color:var(--code-text)]">t</code> in any formula to animate it, e.g. <code className="text-[color:var(--code-text)]">P = (3cos(t), 3sin(t))</code> or{' '}
        <code className="text-[color:var(--code-text)]">A = 5 ∠ (40t)°</code>, then press Play. Sliders can sweep too (▶ on the slider).
      </p>
    </div>
  )
}
