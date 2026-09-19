import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import { themeColor, useTheme } from '../app/theme'
import { chartSeries, residualSeries } from '../lab/chartData'
import type { Fit } from '../lab/fit'

interface Props {
  xs: number[]
  ys: number[]
  fit: Fit | null
  /** Axis captions, written the way the table writes them: "t / s". */
  xLabel: string
  yLabel: string
  /** Half-widths of the error bars, one per reading; empty when the table has no ± column. */
  xErr?: number[]
  yErr?: number[]
  height?: number
}

/** Both charts reserve the same width for the y axis, so the residuals line up under the graph. */
const Y_AXIS_WIDTH = 58

const ratio = (): number => (typeof window !== 'undefined' && window.devicePixelRatio) || 1

/**
 * Error bars, which uPlot has no series type for: they are drawn straight onto the canvas once the
 * points are in place. Positions come from valToPos(…, true), which is already in canvas pixels, so
 * nothing here has to know about the device pixel ratio except the widths.
 */
function drawErrorBars(u: uPlot, xs: number[], ys: number[], xErr: number[], yErr: number[], colour: string): void {
  if (!xErr.some(Boolean) && !yErr.some(Boolean)) return
  const ctx = u.ctx
  const dpr = ratio()
  ctx.save()
  ctx.beginPath()
  ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height)
  ctx.clip()
  ctx.strokeStyle = colour
  ctx.lineWidth = Math.max(1, Math.round(dpr))
  const cap = 4 * dpr
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  for (let i = 0; i < xs.length; i++) {
    const cx = u.valToPos(xs[i], 'x', true)
    const cy = u.valToPos(ys[i], 'y', true)
    const ey = yErr[i] ?? 0
    if (ey > 0) {
      const top = u.valToPos(ys[i] + ey, 'y', true)
      const bottom = u.valToPos(ys[i] - ey, 'y', true)
      line(cx, top, cx, bottom)
      line(cx - cap, top, cx + cap, top)
      line(cx - cap, bottom, cx + cap, bottom)
    }
    const ex = xErr[i] ?? 0
    if (ex > 0) {
      const left = u.valToPos(xs[i] - ex, 'x', true)
      const right = u.valToPos(xs[i] + ex, 'x', true)
      line(left, cy, right, cy)
      line(left, cy - cap, left, cy + cap)
      line(right, cy - cap, right, cy + cap)
    }
  }
  ctx.restore()
}

/**
 * The readings as dots with the fitted curve through them.
 *
 * Unlike the older Graphs panel, every colour here comes from the stylesheet, so the graph is
 * readable in the light theme as well — a chart with hardcoded dark greys disappears on a light
 * background, which is exactly the bug the light theme had elsewhere.
 */
export function LabChart({ xs, ys, fit, xLabel, yLabel, xErr = [], yErr = [], height = 240 }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const plot = useRef<uPlot | null>(null)
  const theme = useTheme((t) => t.theme)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const axis = themeColor('--tick-text', '#8a8f98')
    const grid = themeColor('--grid-major', '#2a2c31')
    const point = themeColor('--accent', '#4dabf7')
    // The fitted curve follows the theme's warning amber: the hardcoded yellow it used to be is
    // washed out on a light background, which is the bug this project keeps re-learning.
    const line = themeColor('--warn', '#fcc419')
    const series = chartSeries(xs, ys, fit)
    const spread = Math.max(0, ...yErr)

    const opts: uPlot.Options = {
      width: Math.max(160, el.clientWidth || 360),
      height,
      scales: {
        x: { time: false },
        // A bar that reaches past the top of the scale would be cut off, so the scale is widened by
        // the largest uncertainty before uPlot picks its ticks.
        y: { range: (_u, min, max) => uPlot.rangeNum(min - spread, max + spread, 0.1, true) }
      },
      legend: { show: false },
      cursor: { drag: { x: false, y: false } },
      hooks: { draw: [(u) => drawErrorBars(u, xs, ys, xErr, yErr, point)] },
      axes: [
        { stroke: axis, label: xLabel, labelSize: 22, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid } },
        { stroke: axis, label: yLabel, labelSize: 26, size: Y_AXIS_WIDTH, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid } }
      ],
      series: [
        {},
        // The readings: dots only, never joined up — joining them would draw a shape the
        // experiment did not measure.
        { label: 'readings', stroke: point, fill: point, paths: () => null, points: { show: true, size: 7, stroke: point, fill: point } },
        { label: 'fit', stroke: line, width: 2, points: { show: false } }
      ]
    }

    const data = [series.x, series.points, series.curve.length ? series.curve : series.x.map(() => null)] as unknown as uPlot.AlignedData
    plot.current?.destroy()
    plot.current = new uPlot(opts, data, el)
    const ro = new ResizeObserver(() => plot.current?.setSize({ width: Math.max(160, el.clientWidth), height }))
    ro.observe(el)
    return () => {
      ro.disconnect()
      plot.current?.destroy()
      plot.current = null
    }
    // The chart is rebuilt when the readings, the fit, the captions, the bars or the theme change.
  }, [xs, ys, fit, xLabel, yLabel, xErr, yErr, height, theme])

  return <div ref={host} className="w-full" />
}

/**
 * Reading minus fit, one bar per point. A good fit scatters these evenly about zero; a pattern in
 * them (a smile, a drift) is the sign that the shape is wrong even when r² looks respectable — so
 * the strip is what turns "the line looks fine" into something a student can argue about.
 */
export function ResidualStrip({ xs, fit, xLabel, height = 96 }: { xs: number[]; fit: Fit | null; xLabel: string; height?: number }) {
  const host = useRef<HTMLDivElement>(null)
  const plot = useRef<uPlot | null>(null)
  const theme = useTheme((t) => t.theme)

  useEffect(() => {
    const el = host.current
    if (!el || !fit) return
    const axis = themeColor('--tick-text', '#8a8f98')
    const grid = themeColor('--grid-major', '#2a2c31')
    const point = themeColor('--accent', '#4dabf7')
    const { x, e } = residualSeries(xs, fit)
    const biggest = Math.max(1e-9, ...e.map(Math.abs))

    const opts: uPlot.Options = {
      width: Math.max(160, el.clientWidth || 360),
      height,
      scales: {
        x: { time: false },
        // Zero always in the middle: that is what makes an uneven scatter visible at a glance.
        y: { range: () => [-biggest * 1.3, biggest * 1.3] as uPlot.Range.MinMax }
      },
      legend: { show: false },
      cursor: { drag: { x: false, y: false } },
      // Zero is the line the residuals are judged against, so it is drawn rather than left to
      // whether a tick happens to land there.
      hooks: {
        draw: [
          (u) => {
            const y = u.valToPos(0, 'y', true)
            u.ctx.save()
            u.ctx.strokeStyle = axis
            u.ctx.lineWidth = Math.max(1, Math.round(ratio()))
            u.ctx.beginPath()
            u.ctx.moveTo(u.bbox.left, y)
            u.ctx.lineTo(u.bbox.left + u.bbox.width, y)
            u.ctx.stroke()
            u.ctx.restore()
          }
        ]
      },
      axes: [
        { stroke: axis, label: xLabel, labelSize: 20, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid } },
        { stroke: axis, label: 'residual', labelSize: 24, size: Y_AXIS_WIDTH, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid } }
      ],
      series: [{}, { label: 'residual', stroke: point, fill: point, paths: () => null, points: { show: true, size: 6, stroke: point, fill: point } }]
    }

    plot.current?.destroy()
    plot.current = new uPlot(opts, [x, e] as unknown as uPlot.AlignedData, el)
    const ro = new ResizeObserver(() => plot.current?.setSize({ width: Math.max(160, el.clientWidth), height }))
    ro.observe(el)
    return () => {
      ro.disconnect()
      plot.current?.destroy()
      plot.current = null
    }
  }, [xs, fit, xLabel, height, theme])

  if (!fit) return null
  return <div ref={host} className="w-full" />
}
