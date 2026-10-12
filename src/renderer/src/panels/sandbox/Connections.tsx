// The Sandbox panel’s Connections section (moved word for word from panels/Sandbox.tsx, SB2).

import { Link2, X } from 'lucide-react'
import { useState } from 'react'
import { useSandbox } from '../../sim/store'
import { LINK_LABELS, type LinkKind } from '../../sim/types'
import { LINK_KINDS } from '../../sim/links'
import { connectionsProminent, joinCandidates } from '../../sim/inspector'
import { NumField } from '../../ui/fields'
import { Fold } from './common'

/**
 * Joining two objects. A pendulum and a spring-mass system are half of school mechanics and
 * neither was possible before: there was no way to connect anything to anything.
 */
export function Connections({ selected, partner }: { selected: string | null; partner: string | null }) {
  const bodies = useSandbox((s) => s.bodies)
  const links = useSandbox((s) => s.links)
  const addLink = useSandbox((s) => s.addLink)
  const updateLink = useSandbox((s) => s.updateLink)
  const removeLink = useSandbox((s) => s.removeLink)
  const setPartner = useSandbox((s) => s.setPartner)
  const joinMode = useSandbox((s) => s.joinMode)
  const [kind, setKind] = useState<LinkKind>('string')
  const [over, setOver] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const name = (id: string) => bodies.find((b) => b.id === id)?.name ?? '?'
  const others = joinCandidates(bodies, selected)
  // The partner is the store's, so a shift-click in the viewport and this dropdown agree.
  const target = others.some((b) => b.id === partner) ? (partner ?? '') : ''
  const wheels = bodies.filter((b) => b.shape === 'pulley')
  const wheel = wheels.some((b) => b.id === over) ? over : (wheels[0]?.id ?? '')
  // The guide above has its own cards while it is up; the fold stays where it was.
  const prominent = connectionsProminent(selected, partner) && !joinMode

  return (
    <Fold id="connections" open force={prominent}>
      {selected ? (
        <div className={`prop-row ${prominent ? 'mx-1 rounded-md border border-[color:var(--accent)]' : ''}`}>
          <label>Join {name(selected)} to</label>
          <div className="flex flex-wrap items-center gap-1">
            <select className="field w-auto" value={target} onChange={(e) => setPartner(e.target.value || null)}>
              <option value="">choose…</option>
              {others.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select className="field w-auto" value={kind} onChange={(e) => setKind(e.target.value as LinkKind)}>
              {LINK_KINDS.map((k) => (
                <option key={k} value={k} title={LINK_LABELS[k]}>
                  {LINK_LABELS[k].split(' — ')[0]}
                </option>
              ))}
            </select>
            {kind === 'pulley' && (
              <select className="field w-auto" value={wheel} onChange={(e) => setOver(e.target.value)} title="Which pulley the rope runs over">
                {wheels.length === 0 && <option value="">add a Pulley first</option>}
                {wheels.map((b) => (
                  <option key={b.id} value={b.id}>
                    over {b.name}
                  </option>
                ))}
              </select>
            )}
            <button
              className={`btn ${prominent ? 'primary' : ''}`}
              disabled={!target || (kind === 'pulley' && !wheel)}
              onClick={() => {
                if (!target) return
                const made = addLink(selected, target, kind, kind === 'pulley' ? wheel : undefined)
                setNote(made.ok ? null : made.why)
                if (made.ok) setPartner(null)
              }}
              title={LINK_LABELS[kind]}
            >
              <Link2 size={12} /> Join
            </button>
            {!target && <div className="w-full pt-0.5 text-fine text-[color:var(--text-faint)]">Or Shift+click the second object.</div>}
            {note && <div className="w-full pt-0.5 text-small text-[color:var(--warn)]">{note}</div>}
          </div>
        </div>
      ) : (
        <div className="px-3 pb-1 text-small text-[color:var(--text-faint)]">Pick an object, then Shift+click another to join them.</div>
      )}

      {links.map((l) => (
        <div key={l.id} className="prop-row">
          <label>
            {name(l.a)} – {name(l.b)} <span className="text-[color:var(--text-faint)]">{l.kind}</span>
          </label>
          <div className="flex items-center gap-1">
            {l.kind !== 'hinge' && l.kind !== 'weld' && (
              <>
                <span className="text-fine text-[color:var(--text-faint)]">L</span>
                <NumField value={l.length} onChange={(length) => updateLink(l.id, { length: Math.max(0.05, length) })} />
              </>
            )}
            {l.kind === 'spring' && (
              <>
                <span className="text-fine text-[color:var(--text-faint)]" title="Spring constant in newtons per metre">
                  k
                </span>
                <NumField value={l.stiffness} onChange={(stiffness) => updateLink(l.id, { stiffness: Math.max(0.01, stiffness) })} />
              </>
            )}
            <button className="icon-btn" title="Remove this connection" onClick={() => removeLink(l.id)}>
              <X size={13} />
            </button>
          </div>
        </div>
      ))}
    </Fold>
  )
}
