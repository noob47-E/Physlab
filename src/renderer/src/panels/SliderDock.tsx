import { Pause, Play } from 'lucide-react'
import { visibleIn } from '../core/visibility'
import { useScene } from '../core/store'
import type { NumberObj } from '../core/types'
import { sliderLabel, sliderPlayClick } from './shellLogic'

/** GeoGebra-style sliders floating over the viewport. */
export function SliderDock() {
  const objects = useScene((s) => s.objects)
  const order = useScene((s) => s.order)
  const ev = useScene((s) => s.ev)
  const update = useScene((s) => s.updateObject)
  const beginGesture = useScene((s) => s.beginGesture)
  const endGesture = useScene((s) => s.endGesture)
  const playing = useScene((s) => s.playing)
  const setPlaying = useScene((s) => s.setPlaying)
  const settings = useScene((s) => s.settings)

  const space = useScene((s) => s.activeSpace)
  const sliders = order.map((id) => objects[id]).filter((o): o is NumberObj => o?.type === 'number' && !!o.slider && o.visible && visibleIn(o, space))
  if (!sliders.length) return null

  return (
    <div className="absolute bottom-3 left-3 flex max-h-[45%] w-64 flex-col gap-1 overflow-auto rounded-lg border border-line-2 bg-label p-2">
      {sliders.map((o) => {
        const c = ev.values.get(o.id)
        const value = c?.type === 'number' ? c.value : 0
        const s = o.slider!
        return (
          <div key={o.id} className="flex items-center gap-2">
            <span className="w-8 truncate font-math font-semibold italic" style={{ color: o.color }}>
              {o.name}
            </span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={value}
              className="flex-1"
              onPointerDown={beginGesture}
              onPointerUp={endGesture}
              onChange={(e) => {
                const v = Number(e.target.value)
                update(o.id, (d) => {
                  if (d.type === 'number') {
                    d.expr = String(v)
                    d.animate = false
                  }
                }, false)
              }}
            />
            <span className="w-12 text-right tabular-nums text-ink">{sliderLabel(value, s.step, settings)}</span>
            <button
              className={`text-ink-dim hover:text-ink-strong ${o.animate ? 'text-accent' : ''}`}
              title="Animate"
              onClick={() => {
                // A sweeping slider on a paused clock resumes; it is not switched off.
                const next = sliderPlayClick(!!o.animate, playing)
                if (next.animate !== !!o.animate)
                  update(o.id, (d) => {
                    if (d.type === 'number') d.animate = next.animate
                  })
                if (next.playing !== playing) setPlaying(next.playing)
              }}
            >
              {o.animate && playing ? <Pause size={13} /> : <Play size={13} />}
            </button>
          </div>
        )
      })}
    </div>
  )
}
