// The graph under the cards (SB19): energy, position or velocity against time, drawn from the recording, with a
// playhead that follows the scene and a click or a drag that takes the scene there. Drawn with uPlot the way
// panels/LabChart.tsx draws, every colour from the stylesheet.

import { useEffect, useMemo, useRef, useState } from 'react'
import uPlot from 'uplot'
import { themeColor, useTheme } from '../../app/theme'
import { massOf, useSandbox } from '../../sim/store'
import { shownTape, useTape } from '../../sim/tapeStore'
import { useScene } from '../../core/store'
import { useSandboxView } from '../../sim/sandboxView'
import { GRAPH_CHOICES, graphBody, graphChoices, graphLines, nearestStep, tickText, type GraphChoice } from '../../sim/graphSeries'

/** What the dock remembers between sessions: open or folded, and the graph chosen. */
const PREF_KEY = 'physlab.graphDock'
/** The plot's own height: the box never grows or shrinks while a run plays (Fix 22). */
const PLOT_HEIGHT = 184

function readPref(): { open: boolean; choice: GraphChoice } {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as { open?: boolean; choice?: string }
    const choice = GRAPH_CHOICES.find((c) => c.id === p.choice)?.id ?? 'energy'
    return { open: p.open !== false, choice }
  } catch {
    return { open: true, choice: 'energy' }
  }
}

function writePref(p: { open: boolean; choice: GraphChoice }): void {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p))
  } catch {
    // No storage (a private window): the dock still works, it just forgets.
  }
}

export function GraphDock() {
  const view = useSandboxView((s) => s.view)
  const [open, setOpen] = useState(() => readPref().open)
  const [picked, setChoice] = useState<GraphChoice>(() => readPref().choice)
  useEffect(() => writePref({ open, choice: picked }), [open, picked])

  const bodies = useSandbox((s) => s.bodies)
  const links = useSandbox((s) => s.links)
  const world = useSandbox((s) => s.world)
  const selection = useSandbox((s) => s.selection)
  // The graphs this scene offers (SB60: Gap in place of Energy beside the chaos twins); a choice it does not offer
  // shows its first, and the student's own choice comes back in the next scene that has it.
  const offered = graphChoices({ bodies, links })
  const choice: GraphChoice = offered.some((c) => c.id === picked) ? picked : offered[0].id
  // Live, the lines follow the panel's live values (ten times a second), not every recorded step; in replay the tape
  // does not grow, and its revision says when it changed (a branch, a fine replay).
  const live = useSandbox((s) => s.live)
  // A pause ends the live values' ten-a-second flow: one more build reaches the step it stopped on.
  const playing = useScene((s) => s.playing)
  const mode = useTape((s) => s.mode)
  const revision = useTape((s) => (s.mode === 'live' ? -1 : s.revision))
  const playhead = useTape((s) => s.playhead)
  const theme = useTheme((t) => t.theme)

  const shown = shownTape()
  const tape = shown && shown.last > shown.first ? shown : null
  const body = graphBody(bodies, selection)
  const bodyId = body?.id ?? null
  const choiceInfo = GRAPH_CHOICES.find((c) => c.id === choice)!

  // The lines come from the recording: rebuilt when it grows or changes and when the choice or the body does, never on
  // a theme switch (the Graphs trap in AGENTS.md: a rebuild there used to lose what had been recorded).
  const data = useMemo(
    () => (tape ? graphLines(tape, choice, { bodies, links, world, massOf }, bodyId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `live` and `revision` are the tape's change signals: the tape object stays the same while it grows
    [tape, live, playing, revision, choice, bodyId, bodies, links, world])

  const host = useRef<HTMLDivElement>(null)
  const plot = useRef<uPlot | null>(null)
  /** Where the playhead line is drawn, in seconds; read by the draw hook so moving it needs only a redraw. */
  const head = useRef<number | null>(null)

  useEffect(() => {
    const el = host.current
    if (!el || !open || !data) return
    const axis = themeColor('--tick-text')
    const grid = themeColor('--grid-major')
    const headColour = themeColor('--tape-head')
    const opts: uPlot.Options = {
      width: Math.max(160, el.clientWidth || 340),
      height: PLOT_HEIGHT,
      scales: { x: { time: false } },
      legend: { show: false },
      cursor: { drag: { x: false, y: false }, points: { show: false } },
      hooks: {
        draw: [
          (u) => {
            const t = head.current
            if (t === null) return
            const x = u.valToPos(t, 'x', true)
            u.ctx.save()
            u.ctx.strokeStyle = headColour
            u.ctx.lineWidth = Math.max(1, Math.round((window.devicePixelRatio || 1) * 1.5))
            u.ctx.beginPath()
            u.ctx.moveTo(x, u.bbox.top)
            u.ctx.lineTo(x, u.bbox.top + u.bbox.height)
            u.ctx.stroke()
            u.ctx.restore()
          }
        ]
      },
      axes: [
        // Ticks on a 0.1 s grid: a whole number of tenths of a second, whatever the zoom.
        { stroke: axis, label: 't / s', labelSize: 20, incrs: [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30, 60, 120, 300], values: (_u, splits) => tickText(splits), grid: { stroke: grid, width: 1 }, ticks: { stroke: grid } },
        { stroke: axis, label: choiceInfo.axis, labelSize: 24, size: 52, values: (_u, splits) => tickText(splits), grid: { stroke: grid, width: 1 }, ticks: { stroke: grid } }
      ],
      series: [{}, ...data.lines.map((l) => ({ label: l.label, stroke: themeColor(l.token), width: 1.5, dash: l.dash ? [6, 4] : undefined, points: { show: false } }))]
    }
    plot.current?.destroy()
    const u = new uPlot(opts, [data.t, ...data.lines.map((l) => l.values)] as unknown as uPlot.AlignedData, el)
    plot.current = u
    // A click or a drag on the graph takes the scene to that moment.
    const seek = (e: PointerEvent) => {
      const t = shownTape()
      if (!t) return
      const rect = u.over.getBoundingClientRect()
      useTape.getState().scrubTo(nearestStep(t, u.posToVal(e.clientX - rect.left, 'x')))
    }
    const down = (e: PointerEvent) => {
      u.over.setPointerCapture(e.pointerId)
      seek(e)
    }
    const move = (e: PointerEvent) => {
      if (u.over.hasPointerCapture(e.pointerId)) seek(e)
    }
    u.over.addEventListener('pointerdown', down)
    u.over.addEventListener('pointermove', move)
    const ro = new ResizeObserver(() => u.setSize({ width: Math.max(160, el.clientWidth), height: PLOT_HEIGHT }))
    ro.observe(el)
    return () => {
      ro.disconnect()
      u.over.removeEventListener('pointerdown', down)
      u.over.removeEventListener('pointermove', move)
      u.destroy()
      if (plot.current === u) plot.current = null
    }
  }, [data, theme, open, choiceInfo.axis])

  // The playhead follows the scene: live, the last point drawn (the tape runs up to a tenth of a second ahead of the
  // lines, and a line past their end is off the plot); in replay, the replayed moment.
  useEffect(() => {
    head.current = !tape || !data ? null : mode === 'live' ? data.t[data.t.length - 1] : tape.timeOf(playhead)
    plot.current?.redraw(false)
  }, [tape, mode, playhead, data])

  if (view === 'simple') {
    return (
      <button className="pointer-events-auto absolute right-3 top-3 h-6 rounded-md border border-[color:var(--line-2)] bg-[var(--bg-2)] px-2 text-small" onClick={() => setOpen((v) => !v)} title={open ? 'Fold the graph away' : 'Show the graph'} aria-expanded={open}>
        Graph
      </button>
    )
  }

  return (
    <div className="pointer-events-auto absolute right-3 top-3 w-[360px] rounded-md border border-[color:var(--line-2)] bg-[var(--bg-2)] text-small shadow-md">
      <div className="flex h-[30px] items-center gap-1 px-2">
        <button className="btn h-6 px-1" onClick={() => setOpen((v) => !v)} title={open ? 'Fold the graph away' : 'Show the graph'} aria-expanded={open}>
          {open ? '▾' : '▸'}
        </button>
        <span className="mr-auto font-semibold text-[color:var(--text-strong)]">Graph{body && (choice === 'position' || choice === 'velocity') ? ` · ${body.name}` : ''}</span>
        {offered.map((c) => (
          <button key={c.id} className={`btn h-6 px-2 ${c.id === choice ? 'primary' : ''}`} onClick={() => setChoice(c.id)} title={`${c.label} against time (${c.axis})`} aria-pressed={c.id === choice}>
            {c.label}
          </button>
        ))}
      </div>
      {open && (
        <div className="relative h-[190px] px-1 pb-1">
          {data ? <div ref={host} className="w-full" /> : <div className="flex h-full items-center justify-center text-[color:var(--text-dim)]">Press Play and the graph draws itself</div>}
        </div>
      )}
    </div>
  )
}
