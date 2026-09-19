import { useEffect, useRef, useState } from 'react'
import uPlot from 'uplot'
import { Plus, Trash2, X } from 'lucide-react'
import { useScene } from '../core/store'
import { math, preprocess } from '../math/expr'

const COLORS = ['#4dabf7', '#ff6b6b', '#51cf66', '#fcc419', '#cc5de8', '#22b8cf']

/** Live plots of any quantity against time (e.g. |R|, angle(A, B), P[1]). */
export function Graphs() {
  const [tracks, setTracks] = useState<string[]>(['|A|'])
  const [draft, setDraft] = useState('')
  const host = useRef<HTMLDivElement>(null)
  const plot = useRef<uPlot | null>(null)
  const data = useRef<number[][]>([[]])

  useEffect(() => {
    data.current = [[], ...tracks.map(() => [])]
    const el = host.current
    if (!el) return
    const opts: uPlot.Options = {
      width: el.clientWidth || 600,
      height: Math.max(120, (el.clientHeight || 200) - 10),
      scales: { x: { time: false } },
      axes: [
        { stroke: '#8a8f98', grid: { stroke: '#2a2c31' }, ticks: { stroke: '#2a2c31' }, label: 't (s)' },
        { stroke: '#8a8f98', grid: { stroke: '#2a2c31' }, ticks: { stroke: '#2a2c31' } }
      ],
      series: [{ label: 't' }, ...tracks.map((t, i) => ({ label: t, stroke: COLORS[i % COLORS.length], width: 2 }))],
      legend: { show: true }
    }
    plot.current?.destroy()
    plot.current = new uPlot(opts, data.current as uPlot.AlignedData, el)
    const ro = new ResizeObserver(() => plot.current?.setSize({ width: el.clientWidth, height: Math.max(120, el.clientHeight - 10) }))
    ro.observe(el)
    return () => {
      ro.disconnect()
      plot.current?.destroy()
      plot.current = null
    }
  }, [tracks])

  useEffect(() => {
    let lastT = -Infinity
    let lastDraw = 0
    return useScene.subscribe((s) => {
      if (s.time === lastT) return
      if (s.time < lastT) data.current = [[], ...tracks.map(() => [])]
      lastT = s.time
      const d = data.current
      d[0].push(s.time)
      tracks.forEach((expr, i) => {
        let v = NaN
        try {
          const r = math.evaluate(preprocess(expr), { ...s.ev.scope })
          v = typeof r === 'number' ? r : Number(r)
        } catch {
          /* undefined for now */
        }
        d[i + 1].push(v)
      })
      if (d[0].length > 5000) d.forEach((arr) => arr.splice(0, arr.length - 5000))
      const now = performance.now()
      if (now - lastDraw > 33) {
        lastDraw = now
        plot.current?.setData(d as uPlot.AlignedData)
      }
    })
  }, [tracks])

  return (
    <div className="panel flex flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#26272c] px-2 py-1.5">
        {tracks.map((t, i) => (
          <span key={i} className="flex items-center gap-1 rounded bg-[#26282d] px-2 py-0.5 font-mono" style={{ color: COLORS[i % COLORS.length] }}>
            {t}
            <button className="text-zinc-500 hover:text-white" onClick={() => setTracks(tracks.filter((_, j) => j !== i))}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          className="field w-44 font-mono"
          placeholder="e.g. |R| or angle(A,B)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter' && draft.trim()) {
              setTracks([...tracks, draft.trim().replace(/^angle\(/, 'angleBetween(')])
              setDraft('')
            }
          }}
        />
        <button
          className="btn h-6"
          onClick={() => {
            if (draft.trim()) setTracks([...tracks, draft.trim().replace(/^angle\(/, 'angleBetween(')])
            setDraft('')
          }}
        >
          <Plus size={12} /> Track
        </button>
        <div className="flex-1" />
        <button className="btn ghost h-6" onClick={() => (data.current = [[], ...tracks.map(() => [])], plot.current?.setData(data.current as uPlot.AlignedData))}>
          <Trash2 size={12} /> Reset
        </button>
        <span className="text-[11px] text-zinc-500">Values are recorded while the timeline plays.</span>
      </div>
      <div ref={host} className="min-h-0 flex-1 px-1" />
    </div>
  )
}
