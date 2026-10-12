// The Sandbox panel’s Collisions section (moved word for word from panels/Sandbox.tsx, SB2).

import { useSandbox } from '../../sim/store'
import { useNum, Fold } from './common'

/** The last few collisions: recorded from the first version, shown for the first time. */
export function Collisions() {
  const contacts = useSandbox((s) => s.contacts)
  const bodies = useSandbox((s) => s.bodies)
  const num = useNum()
  const name = (id: string) => bodies.find((b) => b.id === id)?.name ?? '?'
  const shown = contacts.filter((c) => c.approachSpeed > 0.05).slice(0, 6)
  if (!shown.length) return null
  return (
    <Fold id="collisions" title={`Collisions · ${contacts.length}`}>
      {shown.map((c, i) => (
        <div key={i} className="flex items-center gap-2 px-3 text-small text-[color:var(--text-dim)]">
          <span className="w-16 tabular-nums">t = {num(c.t)} s</span>
          <span className="text-[color:var(--text)]">
            {name(c.a)} – {name(c.b)}
          </span>
          <span className="ml-auto tabular-nums" title="How fast they were closing">
            {num(c.approachSpeed, 'm/s')}
          </span>
        </div>
      ))}
    </Fold>
  )
}
