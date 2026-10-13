// The Lever fold (SB59): live moments readout and hanger position controls.
// Shows left F·d and right F·d, balance status, 1 cm snapping slider for hanger position,
// and 0.5 kg slotted disc count.

import { engine, useSandbox } from '../../sim/store'
import type { BodyDef } from '../../sim/types'
import { discCountOf, leverMoments, slideHanger } from '../../sim/apparatus'
import { Fold, useNum } from './common'
import { formatMeasure } from '../../math/format'
import { useScene } from '../../core/store'

export function LeverFold({ sel }: { sel: BodyDef }) {
  const bodies = useSandbox((s) => s.bodies)
  const links = useSandbox((s) => s.links)
  const world = useSandbox((s) => s.world)
  const settings = useScene((s) => s.settings)
  const num = useNum()

  // Find the beam and hangers
  const beam = bodies.find((b) => b.name === 'Beam' || b.id.includes('beam'))
  if (!beam) return null

  const isHanger = sel.name.toLowerCase().includes('hanger') || sel.id.includes('hanger')
  const isBeam = sel.id === beam.id

  if (!isHanger && !isBeam) return null

  // Collect all hangers attached to the beam
  const hangerLinks = links.filter((l) => l.a === beam.id || l.b === beam.id)
  const hangersOnBeam = bodies.filter((b) => hangerLinks.some((l) => l.a === b.id || l.b === b.id))

  // Calculate moments
  const hangerData = hangersOnBeam.map((h) => ({
    mass: h.mass,
    x: h.position[0]
  }))

  const moments = leverMoments(beam, hangerData, world.gravity)

  // Current hanger controls (if a hanger is selected)
  const currentLink = isHanger ? links.find((l) => (l.a === beam.id && l.b === sel.id) || (l.b === beam.id && l.a === sel.id)) : null
  const currentPivotX = currentLink?.pivotA?.[0] ?? (sel.position[0] - beam.position[0])

  const onSlide = (targetRelX: number) => {
    if (!currentLink) return
    const targetAbsX = beam.position[0] + targetRelX
    const { hanger: nextHanger, link: nextLink } = slideHanger(beam, sel, currentLink, targetAbsX)

    // Update in store
    const nextBodies = bodies.map((b) => (b.id === sel.id ? nextHanger : b))
    const nextLinks = links.map((l) => (l.id === currentLink.id ? nextLink : l))

    useSandbox.getState().setScene(nextBodies, undefined, nextLinks)
    engine.world?.rebuild(nextBodies, nextLinks)
  }

  const onNudge = (deltaCm: number) => {
    const nextCm = Math.round(currentPivotX * 100) + deltaCm
    onSlide(nextCm / 100)
  }

  const onMassNudge = (deltaKg: number) => {
    const nextMass = Math.max(0.5, Math.round((sel.mass + deltaKg) * 2) / 2)
    useSandbox.getState().updateBody(sel.id, { mass: nextMass })
  }

  const leftStr = `${formatMeasure(moments.leftFd, 'number', settings)} N·m`
  const rightStr = `${formatMeasure(moments.rightFd, 'number', settings)} N·m`
  const discCount = discCountOf(sel.mass)

  return (
    <Fold id="lever" title="Lever: Moments & Hanger" open={true} lock={false}>
      <div className="flex flex-col gap-2 p-2 text-body">
        {/* Moments readout */}
        <div className="rounded border border-[color:var(--line-2)] bg-[var(--bg-2)] p-2">
          <div className="text-small font-semibold text-[color:var(--text-strong)]">Moments about pivot:</div>
          <div className="mt-1 flex justify-between text-fine tabular-nums">
            <span>Left: {leftStr}</span>
            <span>Right: {rightStr}</span>
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-[color:var(--line-2)] pt-1 text-fine">
            <span className="text-[color:var(--text-dim)]">Status:</span>
            <span
              className={`font-semibold ${
                moments.status === 'balanced'
                  ? 'text-[color:var(--accent)]'
                  : 'text-[color:var(--warn)]'
              }`}
            >
              {moments.status}
            </span>
          </div>
        </div>

        {/* Hanger controls */}
        {isHanger && (
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex items-center justify-between text-fine">
              <span className="text-[color:var(--text-dim)]">Distance from pivot:</span>
              <span className="font-semibold tabular-nums text-[color:var(--text-strong)]">
                {num(Math.abs(currentPivotX), 'm')} ({currentPivotX < 0 ? 'left' : 'right'})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="btn h-7 flex-1 text-fine"
                onClick={() => onNudge(-1)}
                title="Move 1 cm toward left"
              >
                −1 cm
              </button>
              <input
                type="range"
                className="flex-1"
                min={-0.48}
                max={0.48}
                step={0.01}
                value={currentPivotX}
                onChange={(e) => onSlide(parseFloat(e.target.value))}
              />
              <button
                className="btn h-7 flex-1 text-fine"
                onClick={() => onNudge(1)}
                title="Move 1 cm toward right"
              >
                +1 cm
              </button>
            </div>

            {/* Slotted discs count & quick mass change */}
            <div className="mt-1 flex items-center justify-between border-t border-[color:var(--line-2)] pt-1 text-fine">
              <span className="text-[color:var(--text-dim)]">Slotted discs (0.5 kg ea):</span>
              <span className="font-semibold tabular-nums text-[color:var(--text-strong)]">
                {discCount} disc{discCount > 1 ? 's' : ''} ({num(sel.mass, 'kg')})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="btn h-7 flex-1 text-fine"
                onClick={() => onMassNudge(-0.5)}
                disabled={sel.mass <= 0.5}
                title="Remove one 0.5 kg disc"
              >
                −0.5 kg disc
              </button>
              <button
                className="btn h-7 flex-1 text-fine"
                onClick={() => onMassNudge(0.5)}
                title="Add one 0.5 kg disc"
              >
                +0.5 kg disc
              </button>
            </div>
          </div>
        )}
      </div>
    </Fold>
  )
}
