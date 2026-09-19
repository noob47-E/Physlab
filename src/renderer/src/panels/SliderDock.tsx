import { Pause, Play } from 'lucide-react'
import { useScene } from '../core/store'
import type { NumberObj } from '../core/types'
import { fmt } from '../math/format'

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

  const sliders = order.map((id) => objects[id]).filter((o): o is NumberObj => o?.type === 'number' && !!o.slider && o.visible)
  if (!sliders.length) return null

  return (
    <div className="absolute bottom-3 left-3 flex max-h-[45%] w-64 flex-col gap-1 overflow-auto rounded-lg border border-[#34363d] bg-[#1c1d21ee] p-2">
      {sliders.map((o) => {
        const c = ev.values.get(o.id)
        const value = c?.type === 'number' ? c.value : 0
        const s = o.slider!
        return (
          <div key={o.id} className="flex items-center gap-2">
            <span className="w-8 truncate font-semibold italic" style={{ color: o.color, fontFamily: 'Cambria, serif' }}>
              {o.name}
            </span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={value}
              className="flex-1 accent-[#4f8cff]"
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
            <span className="w-12 text-right tabular-nums text-zinc-300">{fmt(value, 2)}</span>
            <button
              className={`text-zinc-400 hover:text-white ${o.animate ? 'text-sky-400' : ''}`}
              title="Animate"
              onClick={() => {
                update(o.id, (d) => {
                  if (d.type === 'number') d.animate = !d.animate
                })
                if (!o.animate && !playing) setPlaying(true)
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
