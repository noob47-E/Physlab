// Small decisions of the Graphs, Slider and Timeline panels, kept out of the components so vitest
// (which has no DOM) can test the same functions the components call.
import { fmtLabel, type MeasureSettings } from '../math/format'

/** Graph history after the clock moves to `t`: samples strictly before `t` stay, later ones go.
 *  Scrubbing back used to wipe everything; the sample at `t` itself is pushed again by the caller. */
export function keepBefore(data: number[][], t: number): number[][] {
  const times = data[0]
  let n = times.length
  while (n > 0 && times[n - 1] >= t) n--
  return data.map((col) => col.slice(0, n))
}

/** What the slider's play button does. Paused-but-sweeping resumes; it must not turn the sweep off. */
export function sliderPlayClick(animate: boolean, playing: boolean): { animate: boolean; playing: boolean } {
  if (animate && !playing) return { animate: true, playing: true }
  return { animate: !animate, playing: animate ? playing : true }
}

/** The timeline's scale only grows while time runs or is dragged, so the thumb cannot jump when
 *  the time crosses a multiple of 10 s; it goes back to 10 s when the clock is at 0 (Reset). */
export function nextTimelineMax(prev: number, time: number): number {
  if (time <= 0) return 10
  return Math.max(prev, 10, Math.ceil(time / 10) * 10)
}

/** The number beside a slider: the student's precision, with at least the places the step shows. It is panel
 *  text, so a power of ten is raised (1.00 × 10¹²) — fmtPrecise's caret form is for text read back, not shown. */
export function sliderLabel(value: number, step: number, s: Pick<MeasureSettings, 'decimals' | 'precisionMode'>): string {
  const stepText = String(step)
  const stepPlaces = stepText.includes('.') && !stepText.includes('e') ? stepText.split('.')[1].length : 0
  const decimals = s.precisionMode === 'dp' ? Math.max(s.decimals, stepPlaces) : s.decimals
  return fmtLabel(value, { precisionMode: s.precisionMode, decimals })
}
