// The Sandbox panel’s Pushes section (moved word for word from panels/Sandbox.tsx, SB2).

import { Trash2 } from 'lucide-react'
import { useSandbox } from '../../sim/store'

/**
 * A question's pushes on the loaded experiment, each with a Remove. They used to act with nothing
 * on screen: the crate sped up for no visible reason and stayed pushed through the student's own
 * edits until another experiment was loaded.
 */
export function Pushes() {
  const actuators = useSandbox((s) => s.actuators)
  const bodies = useSandbox((s) => s.bodies)
  const removeActuator = useSandbox((s) => s.removeActuator)
  if (actuators.length === 0) return null
  return (
    <>
      <div className="section-title mt-2">Pushes</div>
      {actuators.map((a, i) => (
        <div key={i} className="flex items-center gap-2 px-3">
          <span className="min-w-0 flex-1 text-small text-[color:var(--text)]">{a.label ?? `Push from the question on ${bodies.find((b) => b.id === a.bodyId)?.name ?? 'a body'}`}</span>
          <button className="btn ghost min-h-[44px]" onClick={() => removeActuator(i)} title="Take this push off; Undo puts it back">
            <Trash2 size={13} /> Remove
          </button>
        </div>
      ))}
    </>
  )
}
