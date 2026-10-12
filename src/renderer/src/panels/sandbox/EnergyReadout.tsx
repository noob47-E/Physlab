// The Sandbox panel’s EnergyReadout section (moved word for word from panels/Sandbox.tsx, SB2).

import { floorOf, momentumSize, sceneEnergy, systemMomentum } from '../../sim/energy'
import { massOf, useSandbox } from '../../sim/store'
import { useNum } from './common'

/**
 * Where the energy is, right now. This is the thing the Sandbox was missing: you could watch a
 * ball fall and learn nothing from it, because nothing on screen said whether energy was
 * conserved — the one question every mechanics practical is really asking.
 */
export function EnergyReadout() {
  const bodies = useSandbox((s) => s.bodies)
  const links = useSandbox((s) => s.links)
  const live = useSandbox((s) => s.live)
  const gravity = useSandbox((s) => s.world.gravity)
  const num = useNum()

  // Before Play the rows read the typed start (Fix 22): rendering nothing until the engine
  // reported made the Energy bar, a row per body and the floor note appear all at once on Play,
  // and everything below — Gravity, Slow motion — dropped 276 px under the student's pointer.
  // A spring is in the scene from the start too, so its line and its row never wait for Play.
  const { known, springs, total } = sceneEnergy(bodies, links, live, gravity, massOf)
  if (!known.length) return null
  // The vector sum, not the sum of the sizes: after a head-on bounce the two momenta point
  // opposite ways and it is their difference that a collision leaves unchanged. Every preset
  // sentence that quotes a kg m/s quotes this number; the per-body lines below only had to be
  // added up by hand.
  const momentum = Math.hypot(...systemMomentum(known.map((p) => p.state)))
  // The split between movement, height and the spring, as a bar: watching it tip over as something
  // falls, or the energy pass between the blue and the green as a block swings on a spring, is the
  // whole lesson. The green part is only drawn when the scene has a spring, so any other scene
  // reads exactly as it did.
  const pe = Math.max(0, total.potential)
  const sum = total.kinetic + pe + total.elastic
  const part = (v: number) => `${sum > 1e-9 ? (v / sum) * 100 : 0}%`
  const springy = springs.length > 0

  return (
    <>
      <div className="section-title mt-2">Energy</div>
      <div className="px-3 pb-2">
        <div className="flex h-2 overflow-hidden rounded-full border border-[color:var(--line-2)]">
          <div className="bg-[var(--accent)]" style={{ width: part(total.kinetic) }} title="Kinetic" />
          {springy ? (
            <>
              <div className="bg-[var(--warn)]" style={{ width: part(pe) }} title="Potential" />
              <div className="flex-1 bg-[var(--good)]" title="Spring" />
            </>
          ) : (
            <div className="flex-1 bg-[var(--warn)]" title="Potential" />
          )}
        </div>
        {/* Two fixed lines (three with a spring), never wrapped and never cut short: a reading that
            grows a digit mid-run and wraps pushes every control below it down (Fix 22), and a number
            cut to "3.48×10^-1…" reads as a different number. Each reading keeps its full width. */}
        <div className="mt-1 flex justify-between gap-2 whitespace-nowrap text-small">
          <span className="shrink-0 tabular-nums text-[color:var(--accent)]">KE {num(total.kinetic, 'J')}</span>
          <span className="shrink-0 tabular-nums text-[color:var(--warn)]">PE {num(total.potential, 'J')}</span>
        </div>
        {springy && (
          <div className="mt-0.5 whitespace-nowrap text-small">
            <span className="tabular-nums text-[color:var(--good)]">Spring {num(total.elastic, 'J')}</span>
          </div>
        )}
        <div className="mt-0.5 flex justify-between gap-2 whitespace-nowrap text-small">
          <span className="shrink-0 tabular-nums font-semibold text-[color:var(--text-strong)]">total {num(total.total, 'J')}</span>
          <span className="shrink-0 tabular-nums text-[color:var(--text)]" title="Momentum of everything together: the size of the vector sum of every mass × velocity">
            p {num(momentum, 'kg m/s')}
          </span>
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
        {floorOf(bodies) ? 'Heights are measured from the top of the floor.' : 'There is no floor, so heights are measured from zero.'}
      </div>
    </>
  )
}
