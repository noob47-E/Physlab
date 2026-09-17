import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import { themeColor, useTheme } from '../app/theme'
import { chartSeries } from '../lab/chartData'
import type { Fit } from '../lab/fit'

interface Props {
  xs: number[]
  ys: number[]
  fit: Fit | null
  /** Axis captions, written the way the table writes them: "t / s". */
  xLabel: string
  yLabel: string
  height?: number
}

/**
 * The readings as dots with the fitted curve through them.
 *
 * Unlike the older Graphs panel, every colour here comes from the stylesheet, so the graph is
 * readable in the light theme as well — a chart with hardcoded dark greys disappears on a light
 * background, which is exactly the bug the light theme had elsewhere.
 */
export function LabChart({ xs, ys, fit, xLabel, yLabel, height = 240 }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const plot = useRef<uPlot | null>(null)
  const theme = useTheme((t) => t.theme)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const axis = themeColor('--tick-text', '#8a8f98')
    const grid = themeColor('--grid-major', '#2a2c31')
    const point = themeColor('--accent', '#4dabf7')
    const line = '#fcc419'
    const series = chartSeries(xs, ys, fit)

    const opts: uPlot.Options = {
      width: Math.max(160, el.clientWidth || 360),
      height,
      scales: { x: { time: false } },
      legend: { show: false },
      cursor: { drag: { x: false, y: false } },
      axes: [
        { stroke: axis, label: xLabel, labelSize: 22, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid } },
        { stroke: axis, label: yLabel, labelSize: 26, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid } }
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
    // The chart is rebuilt when the readings, the fit, the captions or the theme change.
  }, [xs, ys, fit, xLabel, yLabel, height, theme])

  return <div ref={host} className="w-full" />
}
