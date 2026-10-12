// The tape strip's maths: where a step sits on the bar, the tick marks, the markers and hit-testing (no React, no DOM).
// STAND-IN (SB17) with the names and signatures of SB34's contract; SB34 owns this file. When it merges, take SB34's.

import { fmtLabel } from '../../math/format'

/** A tape holds steps first..last at `rate` steps a second; the time of step s is startTime + (s − startStep) / rate. */
export interface StripView {
  first: number
  last: number
  rate: number
  startStep: number
  startTime: number
  /** The bar's width in px. */
  width: number
}

/** first → 0, last → width, linear; clamps outside. */
export function stepToX(v: StripView, step: number): number {
  if (v.last <= v.first) return 0
  const x = ((step - v.first) / (v.last - v.first)) * v.width
  return Math.max(0, Math.min(v.width, x))
}

/** The inverse of stepToX, rounded to the nearest whole step and clamped to first..last. */
export function xToStep(v: StripView, x: number): number {
  if (v.last <= v.first || v.width <= 0) return v.first
  const step = Math.round(v.first + (x / v.width) * (v.last - v.first))
  return Math.max(v.first, Math.min(v.last, step))
}

const timeOfStep = (v: StripView, step: number): number => v.startTime + (step - v.startStep) / v.rate

/** The 1-2-5 series (0.1, 0.2, 0.5, 1, 2, 5, 10 …) from the smallest value that is at least `atLeast`. */
function niceSeconds(atLeast: number): number {
  let decade = 0.1
  for (let guard = 0; guard < 40; guard++) {
    for (const m of [1, 2, 5]) if (decade * m >= atLeast * (1 - 1e-9)) return decade * m
    decade *= 10
  }
  return decade
}

/** Tick marks on a 1-2-5 series of seconds with at least `minGapPx` between them, labelled in words ("0.5 s", "1 min 20 s"). */
export function ticks(v: StripView, minGapPx = 60): { step: number; x: number; label: string }[] {
  if (v.last <= v.first || v.width <= 0 || v.rate <= 0) return []
  const seconds = (v.last - v.first) / v.rate
  const every = niceSeconds((minGapPx / v.width) * seconds)
  const t0 = timeOfStep(v, v.first)
  const t1 = timeOfStep(v, v.last)
  const out: { step: number; x: number; label: string }[] = []
  for (let k = Math.ceil((t0 - 1e-9) / every); k * every <= t1 + 1e-9; k++) {
    const t = k * every
    const step = Math.round((t - v.startTime) * v.rate + v.startStep)
    out.push({ step, x: stepToX(v, step), label: durationWords(t) })
  }
  return out
}

/** Marker steps placed on the bar; a marker closer than minGapPx to the one before it is merged into it (the first stays). */
export function markerXs(v: StripView, steps: number[], minGapPx = 3): { step: number; x: number }[] {
  const out: { step: number; x: number }[] = []
  for (const step of [...steps].sort((a, b) => a - b)) {
    if (step < v.first || step > v.last) continue
    const x = stepToX(v, step)
    const prev = out[out.length - 1]
    if (prev && x - prev.x < minGapPx) continue
    out.push({ step, x })
  }
  return out
}

/** The step of the marker nearest to x within radiusPx, else null. */
export function hitTest(_v: StripView, x: number, markers: { step: number; x: number }[], radiusPx = 8): number | null {
  let best: { step: number; d: number } | null = null
  for (const m of markers) {
    const d = Math.abs(m.x - x)
    if (d <= radiusPx && (!best || d < best.d)) best = { step: m.step, d }
  }
  return best ? best.step : null
}

/** "t = 0.783 s · step 188": the time to three places and the step, through the app's number writer. */
export function timeText(seconds: number, step: number): string {
  return `t = ${fmtLabel(seconds, 3)} s · step ${fmtLabel(step, 0)}`
}

/** A length of time in words: "45 s", "1 min 40 s", "2 h 5 min". */
export function durationWords(seconds: number): string {
  const total = Math.round(Math.max(0, seconds) * 1000) / 1000
  const h = Math.floor(total / 3600)
  const m = Math.floor((total - h * 3600) / 60)
  const s = Math.round((total - h * 3600 - m * 60) * 1000) / 1000
  const parts: string[] = []
  if (h > 0) parts.push(`${fmtLabel(h, 0)} h`)
  if (m > 0) parts.push(`${fmtLabel(m, 0)} min`)
  if (s > 0 || parts.length === 0) parts.push(`${fmtLabel(s, 3)} s`)
  return parts.join(' ')
}
