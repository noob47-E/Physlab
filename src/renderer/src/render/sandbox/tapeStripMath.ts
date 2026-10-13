import { fmtLabel } from '../../math/format'

export interface StripView {
  first: number
  last: number
  rate: number
  startStep: number
  startTime: number
  width: number /* px */
}

export function stepToX(v: StripView, step: number): number {
  if (v.first >= v.last) return 0
  const f = (step - v.first) / (v.last - v.first)
  return Math.max(0, Math.min(v.width, f * v.width))
}

export function xToStep(v: StripView, x: number): number {
  if (v.width <= 0) return v.first
  const f = x / v.width
  const s = Math.round(v.first + f * (v.last - v.first))
  return Math.max(v.first, Math.min(v.last, s))
}

export function ticks(v: StripView, minGapPx = 60): { step: number; x: number; label: string }[] {
  if (v.width <= 0 || v.last <= v.first) return []
  const dt = (v.last - v.first) / v.rate
  const dtPx = dt / v.width
  const minDt = dtPx * minGapPx
  
  const m = Math.pow(10, Math.floor(Math.log10(minDt)))
  const f = minDt / m
  const stepT = m * (f <= 1 + 1e-9 ? 1 : f <= 2 + 1e-9 ? 2 : f <= 5 + 1e-9 ? 5 : 10)
  
  const t0 = v.startTime + (v.first - v.startStep) / v.rate
  const t1 = v.startTime + (v.last - v.startStep) / v.rate
  
  const firstTick = Math.ceil((t0 - 1e-9) / stepT) * stepT
  const res: { step: number; x: number; label: string }[] = []
  
  for (let t = firstTick; t <= t1 + 1e-9; t += stepT) {
    const step = Math.round(v.startStep + (t - v.startTime) * v.rate)
    if (step >= v.first && step <= v.last) {
      res.push({ step, x: stepToX(v, step), label: durationWords(t) })
    }
  }
  return res
}

export function markerXs(v: StripView, steps: number[], minGapPx = 3): { step: number; x: number }[] {
  const res: { step: number; x: number }[] = []
  for (const step of steps) {
    if (step < v.first || step > v.last) continue
    const x = stepToX(v, step)
    if (res.length === 0 || x - res[res.length - 1].x >= minGapPx) {
      res.push({ step, x })
    }
  }
  return res
}

export function hitTest(v: StripView, x: number, markers: { step: number; x: number }[], radiusPx = 8): number | null {
  if (v.width < 0) return null
  let nearest: number | null = null
  let minDist = radiusPx + 1e-9
  for (const m of markers) {
    const d = Math.abs(m.x - x)
    if (d <= minDist) {
      minDist = d
      nearest = m.step
    }
  }
  return nearest
}

export function timeText(seconds: number, step: number): string {
  return `t = ${fmtLabel(seconds, 3)} s · step ${fmtLabel(step, 0)}`
}

export function durationWords(seconds: number): string {
  const isNeg = seconds < -1e-9
  const abs = Math.abs(seconds)
  if (abs < 60 - 1e-9) {
    return `${isNeg ? '-' : ''}${fmtLabel(abs, 3)} s`
  }
  const m = Math.floor((abs + 1e-9) / 60)
  const s = abs - m * 60
  if (m < 60) {
    return `${isNeg ? '-' : ''}${fmtLabel(m, 0)} min${s > 1e-9 ? ` ${fmtLabel(s, 3)} s` : ''}`
  }
  const h = Math.floor(m / 60)
  const remM = m - h * 60
  return `${isNeg ? '-' : ''}${fmtLabel(h, 0)} h${remM > 0 ? ` ${fmtLabel(remM, 0)} min` : ''}`
}
