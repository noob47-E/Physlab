// The Sandbox HUD's top-left slot: the clock and Home (moved word for word from render/Viewport.tsx's SandboxStrip, SB2).

import { useEffect, useRef } from 'react'
import { Home } from 'lucide-react'
import { useScene } from '../../core/store'
import { useSandbox } from '../../sim/store'
import { formatMeasure } from '../../math/format'
import { resetCamera, shouldResetCameraOnPresetChange } from '../viewState'

/**
 * The clock and a way to find the objects again, on the drawing itself. Play, Step and Reset
 * live in the Sandbox panel's bar: this strip used to carry its own Play and Reset, so a student
 * saw two of each with different tooltips. Space still plays and pauses with the panel closed.
 */
export function HudTop() {
  const settings = useScene((s) => s.settings)
  const time = useSandbox((s) => s.engineTime)
  const presetId = useSandbox((s) => s.presetId)
  const prevPresetId = useRef<string | null>(null)

  useEffect(() => {
    if (shouldResetCameraOnPresetChange(prevPresetId.current, presetId)) {
      requestAnimationFrame(() => {
        resetCamera()
      })
    }
    prevPresetId.current = presetId
  }, [presetId])

  return (
    <div className="pointer-events-auto absolute left-3 top-3 flex items-center gap-1">
      <button className="icon-btn" onClick={resetCamera} title="Find the objects (Home)">
        <Home size={14} />
      </button>
      <span className="badge tabular-nums">t = {formatMeasure(time, 'number', settings)} s</span>
    </div>
  )
}
