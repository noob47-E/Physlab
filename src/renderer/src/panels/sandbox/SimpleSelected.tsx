// The simple panel's selected object (SB63): its name, the Now box (its speed, large), its mass and Delete — the full panel's
// own pieces (NowBox, MassRow), so the two views cannot disagree about a number. Nothing selected: one muted line that
// says what to do. The floor is left out on purpose: a press on it is a press on empty space (sim/inspector.ts
// grabAction), and a first-time student deleting the floor by accident would have nothing to put it back with here.

import { Trash2 } from 'lucide-react'
import { useScene } from '../../core/store'
import { showsLive } from '../../sim/inspector'
import { useSandbox } from '../../sim/store'
import { SIMPLE_HINTS } from '../../sim/simpleHint'
import { NowBox } from './NowBox'
import { MassRow } from './Selected'
import { ReplayLock, useReplayLocked } from './ReplayLock'

export function SimpleSelected() {
  const bodies = useSandbox((s) => s.bodies)
  const selection = useSandbox((s) => s.selection)
  const live = useSandbox((s) => s.live)
  const update = useSandbox((s) => s.updateBody)
  const remove = useSandbox((s) => s.removeBody)
  const engineTime = useSandbox((s) => s.engineTime)
  const playing = useScene((s) => s.playing)
  // Replay is read-only (D5): the mass and Delete wait for Branch from here or Back to live.
  const locked = useReplayLocked()
  const sel = bodies.find((b) => b.id === selection)
  // The same words as the viewport's hint while a run plays: one instruction, said in one way.
  if (!sel || sel.shape === 'ground') return <div className="px-3 pt-3 text-small text-[color:var(--text-dim)]">{SIMPLE_HINTS.running}</div>
  const moves = sel.motion === 'dynamic'
  return (
    <>
      <div className="flex items-center px-3 pt-3">
        <span className="min-w-0 flex-1 truncate font-semibold text-[color:var(--text-strong)]">{sel.name}</span>
      </div>
      {/* The object's numbers, standing still and large (the owner, 13 Oct); a fixed ramp has no speed to show. */}
      {moves && <NowBox sel={sel} live={showsLive(playing, engineTime) ? (live[sel.id] ?? null) : null} />}
      <ReplayLock>
        <MassRow sel={sel} update={update} />
        <div className="px-3 pb-1 pt-1">
          <button
            className="btn pointer-coarse:min-h-[44px] hover:text-[color:var(--bad)]"
            disabled={locked}
            title={locked ? 'Replaying: Branch from here or Back to live to delete' : 'Take this object out of the world (Delete key does the same)'}
            onClick={() => remove(sel.id)}
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </ReplayLock>
    </>
  )
}
