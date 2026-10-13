// The selected object's numbers in one calm place (the owner, 13 Oct 2026: "instead of giving the speed on the panel it is
// giving it on the bob; when it speeds up it becomes really difficult to see the speed because it is stuck to the bob").
// A number riding on a fast ball cannot be read; here it stands still, large, at the top of the object's panel. Before Play it
// shows the typed start; during a run, the live values.

import { useMemo } from 'react'
import { massOf, useSandbox } from '../../sim/store'
import { energyOf, groundTopOf, startStateOf } from '../../sim/energy'
import type { BodyDef, BodyState } from '../../sim/types'
import { useNum } from './common'

export function NowBox({ sel, live }: { sel: BodyDef; live: BodyState | null }) {
  const num = useNum()
  const bodies = useSandbox((s) => s.bodies)
  const gravity = useSandbox((s) => s.world.gravity)
  const groundTop = useMemo(() => groundTopOf(bodies), [bodies])
  const st = live ?? startStateOf(sel, massOf(sel))
  const [vx, vy, vz] = st.velocity
  const speed = Math.hypot(vx, vy, vz)
  const kinetic = energyOf(sel, st, gravity, groundTop).kinetic
  return (
    <div className="mx-3 my-2 rounded-md border border-[color:var(--line)] px-3 py-2">
      <div className="text-small text-[color:var(--text-faint)]">{live ? 'Now' : 'At the start'}</div>
      <div className="text-title leading-tight tabular-nums" title="Speed: how fast, in any direction">
        {num(speed, 'm/s')}
      </div>
      <div className="text-small tabular-nums text-[color:var(--text-dim)]">
        vₓ {num(vx, 'm/s')} · vᵧ {num(vy, 'm/s')}
      </div>
      <div className="text-small tabular-nums text-[color:var(--text-dim)]">
        height {num(st.position[1] - groundTop, 'm')} · KE {num(kinetic, 'J')}
      </div>
    </div>
  )
}
