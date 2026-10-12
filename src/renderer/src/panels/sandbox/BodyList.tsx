// The Sandbox panel’s BodyList section (moved word for word from panels/Sandbox.tsx, SB2).

import { Trash2 } from 'lucide-react'
import { useScene } from '../../core/store'
import { massOf, useSandbox } from '../../sim/store'
import { useNum } from './common'

/** The objects in the world, one row each: click to select, Shift+click to pair, hover to delete. */
export function BodyList() {
  const bodies = useSandbox((s) => s.bodies)
  const selection = useSandbox((s) => s.selection)
  const partner = useSandbox((s) => s.partner)
  const live = useSandbox((s) => s.live)
  const remove = useSandbox((s) => s.removeBody)
  const select = useSandbox((s) => s.select)
  const setPartner = useSandbox((s) => s.setPartner)
  const joinMode = useSandbox((s) => s.joinMode)
  const joinPick = useSandbox((s) => s.joinPick)
  const playing = useScene((s) => s.playing)
  const num = useNum()
  return (
    <>
      {bodies.map((b) => {
        const chosen = b.id === selection
        const paired = b.id === partner
        const asleep = playing && live[b.id]?.asleep && b.motion === 'dynamic'
        return (
          <div
            key={b.id}
            className={`group flex h-7 cursor-pointer items-center gap-2 px-3 ${chosen ? 'bg-[var(--sel-row)]' : 'hover:bg-[var(--bg-3)]'}`}
            title={joinMode ? 'Click to choose it' : selection && !chosen ? 'Click to select; Shift+click to join it to the selected object' : undefined}
            onClick={(e) => {
              // While connecting, a click is a pick — here or in the drawing, the same.
              if (joinMode) joinPick(b.id)
              // Shift-click chooses the second object of a pair, the same as in the viewport.
              else if (e.shiftKey && selection && !chosen) setPartner(paired ? null : b.id)
              else select(chosen ? null : b.id)
            }}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color }} />
            <span className="w-14 shrink-0 truncate font-semibold text-[color:var(--text-strong)]">{b.name}</span>
            <span className="min-w-0 flex-1 truncate text-small text-[color:var(--text-dim)]">
              {/* A bolted-down floor reporting "9408 kg" only invites the question "why does the
                  ground weigh nine tonnes?" — for a static body the mass means nothing. */}
              {b.shape} {b.motion === 'static' ? '· fixed' : `· ${num(massOf(b), 'kg')}`}
              {asleep && <span title="At rest: the engine has let it settle. Drag it or press Reset to wake it."> · asleep</span>}
              {paired && <span className="text-[color:var(--accent)]"> · joining</span>}
            </span>
            <button
              className="hidden text-[color:var(--text-dim)] hover:text-[color:var(--bad)] group-hover:block"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation()
                remove(b.id)
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        )
      })}
    </>
  )
}
