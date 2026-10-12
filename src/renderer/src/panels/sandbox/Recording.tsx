// The Sandbox panel’s Recording section (moved word for word from panels/Sandbox.tsx, SB2).

import { TableProperties } from 'lucide-react'
import { useState } from 'react'
import { useSandbox } from '../../sim/store'
import { QUANTITIES, quantity, tableFrom, type QuantityKey } from '../../sim/recording'
import { useLab } from '../../lab/labStore'
import { LabChart } from '../LabChart'
import { enterMode } from '../../app/layout'

/**
 * The run, as a graph and then as readings.
 *
 * This is where the Sandbox stops being a demonstration. Everything the simulation knows is
 * sampled ten times a second; the graph shows it while it happens, and "Send to Lab Data" hands
 * the same numbers to the table that already knows how to fit a line and read a gradient. Drop a
 * ball, send it over, plot y against t², and g falls out — without a single reading typed in.
 */
export function Recording() {
  const bodies = useSandbox((s) => s.bodies)
  const recording = useSandbox((s) => s.recording)
  const selection = useSandbox((s) => s.selection)
  const clearRecording = useSandbox((s) => s.clearRecording)
  const [key, setKey] = useState<QuantityKey>('y')

  const moving = bodies.filter((b) => b.motion === 'dynamic')
  const watched = moving.find((b) => b.id === selection) ?? moving[0]
  const samples = watched ? (recording[watched.id] ?? []) : []
  const q = quantity(key)
  const xs = samples.map((s) => s.t)
  const ys = samples.map((s) => s[key])

  if (!watched) return null
  return (
    <>
      <div className="section-title mt-2 flex items-center">
        <span className="min-w-0 flex-1 truncate">Recording · {watched.name}</span>
        <span className="shrink-0 whitespace-nowrap normal-case tabular-nums tracking-normal text-[color:var(--text-faint)]">{samples.length} readings</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-3">
        <select className="field w-auto" value={key} onChange={(e) => setKey(e.target.value as QuantityKey)}>
          {QUANTITIES.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
        <span className="text-[color:var(--text-faint)]">against time</span>
      </div>
      {/* One fixed-height box for the hint and the chart alike: the one-line hint growing into a
          150 px chart when the first readings arrived moved every control below it (Fix 22). */}
      <div className="mt-1 h-[160px] overflow-hidden px-1">
        {samples.length > 1 ? (
          <LabChart xs={xs} ys={ys} fit={null} xLabel="t / s" yLabel={`${q.label} / ${q.unit}`} height={150} />
        ) : (
          <div className="flex h-full items-center justify-center px-3 text-small text-[color:var(--text-faint)]">Press Play and the readings start arriving.</div>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-2 px-3">
        <button
          className="btn"
          disabled={samples.length < 2}
          title="Put these readings in a new Lab Data table, ready to plot and fit"
          onClick={() => {
            // appendTable, not setTables: setTables replaces the file's tables, points at the
            // first one and forgets the undo history, so the send used to land its table at the
            // end of a list Lab Data had no way to reach — it looked like it did nothing.
            useLab.getState().appendTable(tableFrom(watched.name, samples))
            enterMode('lab')
          }}
        >
          <TableProperties size={13} /> Send to Lab Data
        </button>
        <button className="btn" disabled={!samples.length} onClick={clearRecording}>
          Clear readings
        </button>
      </div>
    </>
  )
}
