// The simple Sandbox panel (SB63, the owner's option A, 13 Oct 2026: "everything looks complex and a person using it the first
// time will get confused"). Top to bottom: Play and Reset with the clock; six picture tiles of experiments and a quiet "More
// experiments"; three add buttons; the selected object's name, speed and mass; the energy line; and "All tools", which is the
// full panel. Every piece is the full panel's own component or handler, so the two views cannot drift apart.

import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useJoltState } from '../../sim/jolt'
import { useSandbox } from '../../sim/store'
import { useSandboxView } from '../../sim/sandboxView'
import { loadExperiment } from '../../sim/transportActions'
import { Transport } from './Transport'
import { ReplayBanner, ReplayLock } from './ReplayLock'
import { ExperimentTiles } from './ExperimentTiles'
import { PresetList } from './Presets'
import { SimpleAddRow } from './AddRow'
import { JoinGuide } from './JoinGuide'
import { SimpleSelected } from './SimpleSelected'
import { SimpleEnergy } from './EnergyLedger'

export function SimplePanel() {
  const setView = useSandboxView((s) => s.setView)
  const joinMode = useSandbox((s) => s.joinMode)
  const loading = useJoltState() !== 'ready'
  const [more, setMore] = useState(false)
  return (
    <div className="panel pb-6">
      <Transport simple />
      {/* Replay is read-only (D5): the edit controls below are locked while a recording is shown, and this says why. */}
      <ReplayBanner />
      {loading && <div className="px-3 pt-3 text-[color:var(--text-dim)]">Starting the physics engine…</div>}

      <div className="section-title mt-1">Try an experiment</div>
      <ReplayLock>
        <ExperimentTiles />
        <div className="px-2 pt-1">
          {/* The same list as the full panel's "Start from an experiment" (Presets.tsx), not a second one. */}
          <button className="btn ghost h-8 w-full justify-start text-[color:var(--text-dim)] pointer-coarse:min-h-[44px]" aria-expanded={more} onClick={() => setMore((v) => !v)} title="Every ready-made experiment, with a search">
            More experiments
            <ChevronDown size={13} className={`ml-auto transition-transform ${more ? 'rotate-180' : ''}`} />
          </button>
          {more && (
            <PresetList
              onLoad={(id) => {
                loadExperiment(id)
                setMore(false)
              }}
            />
          )}
        </div>
      </ReplayLock>

      <div className="section-title mt-2">Add</div>
      <ReplayLock>
        <SimpleAddRow />
        {/* Connect lives in All tools; a join begun there and brought here still shows its steps, so Esc and Cancel work. */}
        {joinMode && <JoinGuide />}
      </ReplayLock>

      <SimpleSelected />
      <SimpleEnergy />

      <div className="px-2 pt-4">
        <button className="btn ghost min-h-[44px] w-full justify-center text-[color:var(--text-dim)]" onClick={() => setView('all')} title="Every setting: shapes, connections, world, recording, collisions">
          <SlidersHorizontal size={13} /> All tools
        </button>
      </div>
    </div>
  )
}
