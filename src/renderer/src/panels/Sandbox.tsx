// The sandbox control panel: what is in the world, and how the world behaves.

import { useScene } from '../core/store'
import { useSandbox } from '../sim/store'
import { showsLive } from '../sim/inspector'
import { useJoltState } from '../sim/jolt'
import { Transport } from './sandbox/Transport'
import { Presets } from './sandbox/Presets'
import { AddRow } from './sandbox/AddRow'
import { JoinGuide } from './sandbox/JoinGuide'
import { BodyList } from './sandbox/BodyList'
import { Pushes } from './sandbox/Pushes'
import { Selected } from './sandbox/Selected'
import { Connections } from './sandbox/Connections'
import { EnergyReadout } from './sandbox/EnergyReadout'
import { Recording } from './sandbox/Recording'
import { WorldSection } from './sandbox/WorldSection'
import { Collisions } from './sandbox/Collisions'
import { ReplayBanner, ReplayLock } from './sandbox/ReplayLock'

export function Sandbox() {
  const bodies = useSandbox((s) => s.bodies)
  const selection = useSandbox((s) => s.selection)
  const partner = useSandbox((s) => s.partner)
  const live = useSandbox((s) => s.live)
  const update = useSandbox((s) => s.updateBody)
  const joinMode = useSandbox((s) => s.joinMode)
  const playing = useScene((s) => s.playing)
  const engineTime = useSandbox((s) => s.engineTime)
  const sel = bodies.find((b) => b.id === selection)
  const loading = useJoltState() !== 'ready'

  return (
    <div className="panel pb-6">
      <Transport />
      {/* Replay is read-only (D5): the edit controls below are locked while a recording is shown, and this says why. */}
      <ReplayBanner />
      {loading && <div className="px-3 pt-3 text-[color:var(--text-dim)]">Starting the physics engine…</div>}

      <div className="section-title">Objects</div>
      <Presets />
      <ReplayLock>
        <AddRow />
        {joinMode && <JoinGuide />}
      </ReplayLock>
      {/* A row only chooses the object, which still works in replay; its Delete is locked inside the list. */}
      <BodyList />

      <ReplayLock>
        <Pushes />
      </ReplayLock>

      {sel && <Selected sel={sel} live={showsLive(playing, engineTime) ? (live[sel.id] ?? null) : null} update={update} />}

      <Connections selected={selection} partner={partner} />
      <EnergyReadout />
      <Recording />
      <WorldSection />
      {/* Below World on purpose: the list starts at the first bounce and grows to six rows, and
          above World it pushed Gravity down mid-run (Fix 22). */}
      <Collisions />
    </div>
  )
}
