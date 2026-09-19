import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import { useScene } from '../core/store'

export function Timeline() {
  const time = useScene((s) => s.time)
  const playing = useScene((s) => s.playing)
  const speed = useScene((s) => s.speed)
  const setPlaying = useScene((s) => s.setPlaying)
  const setTime = useScene((s) => s.setTime)
  const setSpeed = useScene((s) => s.setSpeed)
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
        <span className="ml-3 w-24 font-mono text-[15px] tabular-nums text-white">t = {time.toFixed(2)} s</span>
        <span className="ml-4 text-zinc-400">Speed</span>
        <div className="seg">
          {[0.25, 0.5, 1, 2, 4].map((s) => (
            <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
      </div>
      <input type="range" min={0} max={duration} step={0.01} value={time} onChange={(e) => setTime(Number(e.target.value))} className="w-full accent-[#4f8cff]" />
      <p className="text-zinc-500">
        Use <code className="text-amber-200">t</code> in any formula to animate it, e.g. <code className="text-amber-200">P = (3cos(t), 3sin(t))</code> or{' '}
        <code className="text-amber-200">A = 5 ∠ (40t)°</code>, then press Play. Sliders can sweep too (▶ on the slider).
      </p>
    </div>
  )
}
