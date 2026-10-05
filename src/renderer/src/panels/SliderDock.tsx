import { Pause, Play } from 'lucide-react'
import { visibleIn } from '../core/visibility'
import { useScene } from '../core/store'
import type { NumberObj } from '../core/types'
import { sliderLabel, sliderPlayClick } from './shellLogic'

/**
 * The width of every slider's value column, in `ch`: the longest label plus one for the wider
 * characters (−, ×). One width for all keeps the columns lined up, and because it is never less
 * than what a label needs, a value never wraps onto two lines or runs over the Play button — at
 * 4 d.p. "−12.3456" used to be 54 px in a 39 px box.
 */
export function valueColumnWidth(labels: string[]): string {
  const longest = labels.reduce((n, l) => Math.max(n, [...l].length), 1)
  return `${longest + 1}ch`
}

/**
 * The labels a slider's width is taken from: its value, both ends and one step in from each end.
 * A label grows and shrinks as the value moves (9.99 → 10), and sizing from the value alone resized
 * the dock under the pointer mid-drag. The longest label sits at an end or one step in from it
 * (10 is shorter than 9.99, −10 than −9.99), so the width holds still across a drag.
 */
export function widthLabels(value: number, s: { min: number; max: number; step: number }, settings: Parameters<typeof sliderLabel>[2]): string[] {
  return [value, s.min, s.max, s.min + s.step, s.max - s.step].map((v) => sliderLabel(v, s.step, settings))
}

/** Sliders floating over the viewport. */
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
  const valueOf = (o: NumberObj): number => {
    const c = ev.values.get(o.id)
    return c?.type === 'number' ? c.value : 0
  }
  const labels = new Map(sliders.map((o) => [o.id, sliderLabel(valueOf(o), o.slider!.step, settings)]))
  const valueWidth = valueColumnWidth(sliders.flatMap((o) => widthLabels(valueOf(o), o.slider!, settings)))

  return (
    // The dock grows (up to a limit) for long values instead of letting them overlap or scroll sideways.
    <div className="absolute bottom-3 left-3 flex max-h-[45%] w-max min-w-64 max-w-[min(90%,30rem)] flex-col gap-1 overflow-y-auto overflow-x-hidden rounded-lg border border-line-2 bg-label p-2">
      {sliders.map((o) => {
        const value = valueOf(o)
        const s = o.slider!
        return (
          <div key={o.id} className="flex items-center gap-2">
            {/* The name never shrinks away; the range gives up space instead. */}
            <span className="min-w-[1.5rem] max-w-[6rem] shrink-0 truncate font-math font-semibold italic" style={{ color: o.color }}>
              {o.name}
            </span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={value}
              className="min-w-[4rem] flex-1"
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
            <span className="shrink-0 whitespace-nowrap text-right tabular-nums text-ink" style={{ width: valueWidth }}>
              {labels.get(o.id)}
            </span>
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
