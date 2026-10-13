// The Sandbox panel's Energy section: the energy ledger (SB10). It was EnergyReadout (moved from panels/Sandbox.tsx
// by SB2); it now also says where every joule went, from the recorded run (sim/ledger.ts).

import { floorOf, momentumSize, sceneEnergy, systemMomentum } from '../../sim/energy'
import { massOf, useSandbox } from '../../sim/store'
import { ledgerAt, ledgerStart, statesAt, type LedgerReading } from '../../sim/ledger'
import { shownTape, useTape } from '../../sim/tapeStore'
import { useScene } from '../../core/store'
import type { SceneSettings } from '../../core/types'
import { formatMeasure } from '../../math/format'
import { useNum } from './common'

/** What the ledger's fixed lines say. Each is always there (Fix 22): before a run they read the start, and nothing lost. */
export function ledgerText(r: LedgerReading | null, now: number, rate: number, settings: SceneSettings, warmest: { name: string; deltaT: number } | null): { start: string; pushed: string; lost: string; heat: string } {
  const num = (v: number, unit = '') => `${formatMeasure(v, 'number', settings)}${unit ? ` ${unit}` : ''}`
  // A temperature rise of a hundredth of a kelvin reads "0.01" to two places: two figures say "0.011".
  const figures = (v: number) => formatMeasure(v, 'number', { ...settings, precisionMode: 'sf', decimals: 2 })
  const start = r ? ledgerStart(r) : now
  const lost = `lost to air ${num(r?.drag ?? 0)} · rolling ${num(r?.rolling ?? 0)} · dampers ${num(r?.damper ?? 0, 'J')}`
  let heat = `heat ${num(0, 'J')} · nothing lost yet`
  if (r && r.drift !== null) {
    const share = Math.abs(start) > 1e-9 ? (r.drift / start) * 100 : 0
    heat = `drift ${num(r.drift, 'J')} (${num(share, '%')}): the 1/${rate} s step, not physics`
  } else if (r) {
    const rise = warmest && warmest.deltaT > 0 ? ` · ${warmest.name} ΔT ≈ ${figures(warmest.deltaT)} K` : ''
    heat = `heat ${num(r.heat, 'J')}${rise}`
  }
  return { start: `at the start ${num(start, 'J')}`, pushed: `pushed in ${num(r ? r.pushedIn + r.hand : 0, 'J')}`, lost, heat }
}

/**
 * Where the energy is, right now, and where the rest of it went. This is the thing the Sandbox was missing: you
 * could watch a ball fall and learn nothing from it, because nothing on screen said whether energy was conserved —
 * the one question every mechanics practical is really asking.
 */
export function EnergyLedger() {
  const bodies = useSandbox((s) => s.bodies)
  const links = useSandbox((s) => s.links)
  const live = useSandbox((s) => s.live)
  const world = useSandbox((s) => s.world)
  const selection = useSandbox((s) => s.selection)
  // Live, the card moves with the panel's live values (ten times a second), not with every recorded step; in replay
  // it follows the playhead.
  const mode = useTape((s) => s.mode)
  const playhead = useTape((s) => (s.mode === 'live' ? -1 : s.playhead))
  const settings = useScene((s) => s.settings)
  const num = useNum()

  // The card reads the recorded run: the shown tape at the playhead, or its end while live, every row from that one
  // step. Before the first step there is nothing recorded, and the rows read the typed start (Fix 22): rendering
  // nothing until the engine reported made the Energy bar, a row per body and the floor note appear all at once on
  // Play, and everything below — Gravity, Slow motion — dropped 276 px under the student's pointer. A spring is in
  // the scene from the start too, so its line and its row never wait for Play.
  const shown = shownTape()
  const tape = shown && shown.last > shown.first ? shown : null
  const step = tape ? (mode === 'live' ? tape.last : playhead) : 0
  const scene = { bodies, links, world, massOf }
  const states = tape ? statesAt(tape, step, scene) : live
  const { known, springs, total } = sceneEnergy(bodies, links, states, world.gravity, massOf)
  if (!known.length) return null
  const reading = tape ? ledgerAt(tape, step, scene) : null
  // The vector sum, not the sum of the sizes: after a head-on bounce the two momenta point
  // opposite ways and it is their difference that a collision leaves unchanged. Every preset
  // sentence that quotes a kg m/s quotes this number; the per-body lines below only had to be
  // added up by hand.
  const momentum = Math.hypot(...systemMomentum(known.map((p) => p.state)))
  const kinetic = reading?.kinetic ?? total.kinetic
  const height = reading?.height ?? total.potential
  const spring = reading?.spring ?? total.elastic
  const now = kinetic + height + spring
  // The ΔT shown is the selected body's, or the first moving body's.
  const warm = reading ? (bodies.find((b) => b.id === selection && reading.deltaT[b.id] !== undefined) ?? bodies.find((b) => reading.deltaT[b.id] !== undefined)) : undefined
  const text = ledgerText(reading, now, tape?.rate ?? world.stepRate, settings, warm && reading ? { name: warm.name, deltaT: reading.deltaT[warm.id] } : null)
  // One bar for where it all is: motion, height, the spring, the heat, and what PhysLab's own forces took out. Every
  // part is always there (an empty one has no width), so nothing appears or jumps when the run starts.
  const lostOwn = reading ? Math.max(0, reading.drag + reading.rolling + reading.damper) : 0
  const parts = [Math.max(0, kinetic), Math.max(0, height), Math.max(0, spring), reading ? Math.max(0, reading.heat) : 0, lostOwn]
  const sum = parts.reduce((a, b) => a + b, 0)
  const part = (v: number) => `${sum > 1e-9 ? (v / sum) * 100 : 0}%`
  const springy = springs.length > 0

  return (
    <>
      <div className="section-title mt-2">Energy</div>
      <div className="px-3 pb-2">
        <div className="flex h-2 overflow-hidden rounded-full border border-[color:var(--line-2)]">
          <div className="bg-[var(--q-vel)]" style={{ width: part(parts[0]) }} title="Kinetic: the energy of moving and spinning" />
          <div className="bg-[var(--q-pos)]" style={{ width: part(parts[1]) }} title="Potential: the energy of height above the floor" />
          <div className="bg-[var(--q-spring)]" style={{ width: part(parts[2]) }} title="Spring: what the springs hold, ½kx²" />
          <div className="bg-[var(--q-heat)]" style={{ width: part(parts[3]) }} title="Heat: made where surfaces rubbed or hit" />
          <div className="bg-[var(--q-work)]" style={{ width: part(parts[4]) }} title="Taken out by the air, rolling and dampers" />
        </div>
        {/* Fixed lines, never wrapped and never cut short: a reading that grows a digit mid-run and wraps pushes every
            control below it down (Fix 22), and a number cut to "3.48×10^-1…" reads as a different number. */}
        <div className="mt-1 flex justify-between gap-2 whitespace-nowrap text-small">
          <span className="shrink-0 tabular-nums text-[color:var(--q-vel)]" title="Kinetic energy: ½mv² and ½Iω² of every moving body">
            KE {num(kinetic, 'J')}
          </span>
          <span className="shrink-0 tabular-nums text-[color:var(--q-pos)]" title="Potential energy: mgh, height measured from the top of the floor">
            PE {num(height, 'J')}
          </span>
        </div>
        {springy && (
          <div className="mt-0.5 whitespace-nowrap text-small">
            <span className="tabular-nums text-[color:var(--q-spring)]" title="What the springs hold: ½kx²">
              Spring {num(spring, 'J')}
            </span>
          </div>
        )}
        <div className="mt-0.5 flex justify-between gap-2 whitespace-nowrap text-small">
          <span className="shrink-0 tabular-nums font-semibold text-[color:var(--text-strong)]" title="Kinetic, potential and spring energy together, now">
            total {num(now, 'J')}
          </span>
          <span className="shrink-0 tabular-nums text-[color:var(--text)]" title="Momentum of everything together: the size of the vector sum of every mass × velocity">
            p {num(momentum, 'kg m/s')}
          </span>
        </div>
        <div className="mt-0.5 flex justify-between gap-2 whitespace-nowrap text-small text-[color:var(--text)]">
          <span className="shrink-0 tabular-nums" title="The total when the recording began">
            {text.start}
          </span>
          <span className="shrink-0 tabular-nums text-[color:var(--q-work)]" title="Energy put in since the recording began: by pushes, by your hand while dragging, and by any object moved or typed part-way">
            {text.pushed}
          </span>
        </div>
        <div className="mt-0.5 whitespace-nowrap text-small tabular-nums text-[color:var(--q-work)]" title="Energy PhysLab's own forces took out: air resistance, rolling resistance and springs' dampers">
          {text.lost}
        </div>
        <div
          className="mt-0.5 whitespace-nowrap text-small tabular-nums text-[color:var(--q-heat)]"
          title={reading?.sources.length ? `Lost to: ${reading.sources.join(', ')}.` : 'Nothing in the scene takes energy out, so what is left over is the step’s own error.'}
        >
          {text.heat}
        </div>
      </div>
      {/* Every body gets the same two lines before Play and during the run: its name and momentum,
          then its KE and PE. Only the name may be cut short; a number never is. */}
      {known.map(({ def, state, energy }) => (
        <div key={def.id} className="px-3 pb-0.5 text-small text-[color:var(--text-dim)]">
          <div className="flex justify-between gap-2 whitespace-nowrap">
            <span className="min-w-0 truncate text-[color:var(--text)]">{def.name}</span>
            <span className="shrink-0 tabular-nums" title="Momentum, mass × velocity">
              p {num(momentumSize(state), 'kg m/s')}
            </span>
          </div>
          <div className="flex justify-between gap-2 whitespace-nowrap">
            <span className="shrink-0 tabular-nums">KE {num(energy.kinetic)}</span>
            <span className="shrink-0 tabular-nums">PE {num(energy.potential)}</span>
          </div>
        </div>
      ))}
      {/* A spring gets the same two lines: what it joins and what it holds, then how far it is
          pulled out or squeezed, which is the x in the ½kx² it is holding. */}
      {springs.map(({ link, a, b, stretch, energy }) => (
        <div key={link.id} className="px-3 pb-0.5 text-small text-[color:var(--text-dim)]">
          <div className="flex justify-between gap-2 whitespace-nowrap">
            <span className="min-w-0 truncate text-[color:var(--text)]">
              {a.name} to {b.name} spring
            </span>
            <span className="shrink-0 tabular-nums">holds {num(energy.elastic, 'J')}</span>
          </div>
          <div className="whitespace-nowrap">
            <span className="tabular-nums">{Math.abs(stretch) < 1e-9 ? 'at its natural length' : `${stretch > 0 ? 'stretched' : 'squeezed'} ${num(Math.abs(stretch), 'm')}`}</span>
          </div>
        </div>
      ))}
      <div className="px-3 pt-1 text-fine text-[color:var(--text-faint)]">
        {floorOf(bodies) ? 'Heights are measured from the top of the floor.' : 'There is no floor, so heights are measured from zero.'} Simplified: all the heat stays in the bodies that rubbed or hit.
      </div>
    </>
  )
}
