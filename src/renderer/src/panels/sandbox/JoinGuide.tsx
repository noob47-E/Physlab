// The Sandbox panel’s JoinGuide section (moved word for word from panels/Sandbox.tsx, SB2).

import { Link2, X } from 'lucide-react'
import { useEffect } from 'react'
import { useSandbox } from '../../sim/store'
import { type LinkKind } from '../../sim/types'
import { joinPrompt, LINK_CARDS, linkCard, noWheelNote, wheelsAbove } from '../../sim/join'
import { useToolCard } from '../../ui/useToolCard'

/**
 * The three steps of Connect: which object, which other object, and what joins them — each kind
 * on a card that says in one line what it does. The picks come from the drawing or the list;
 * the rules (no floor, not the same object twice, a wheel above both for a pulley) live in
 * sim/join.ts and the store, so a refused click always comes with the reason.
 */
export function JoinGuide() {
  const joinMode = useSandbox((s) => s.joinMode)
  const joinNote = useSandbox((s) => s.joinNote)
  const bodies = useSandbox((s) => s.bodies)
  const finishJoin = useSandbox((s) => s.finishJoin)
  const cancelJoin = useSandbox((s) => s.cancelJoin)
  // Esc stops connecting, from anywhere in the window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelJoin()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancelJoin])
  if (!joinMode) return null
  const paired = joinMode.a && joinMode.b ? { a: joinMode.a, b: joinMode.b } : null
  const wheels = paired ? wheelsAbove(bodies, paired.a, paired.b) : []
  return (
    <div className="mx-2 mb-2 rounded-md border border-[color:var(--accent)] px-2 py-1.5">
      <div className="flex items-center gap-2">
        <Link2 size={13} className="shrink-0 text-[color:var(--accent)]" />
        <span className="flex-1 font-semibold text-[color:var(--text-strong)]">{joinPrompt(joinMode, bodies)}</span>
        <button className="icon-btn" title="Stop connecting (Esc)" onClick={cancelJoin}>
          <X size={13} />
        </button>
      </div>
      {joinMode.step !== 'kind' && <div className="text-small text-[color:var(--text-faint)]">Click it in the drawing or in the list below. Esc stops.</div>}
      {joinNote && <div className="pt-0.5 text-small text-[color:var(--warn)]">{joinNote}</div>}
      {joinMode.step === 'kind' && paired && (
        <div className="mt-1 flex flex-col gap-1">
          {LINK_CARDS.map((c) =>
            c.kind === 'pulley' ? (
              <KindCard key={c.kind} kind={c.kind}>
                {wheels.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {wheels.map((w) => (
                      <button key={w.id} className="btn" onClick={() => finishJoin('pulley', w.id)} title={`Run the rope over ${w.name}`}>
                        over {w.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="pt-0.5 text-small text-[color:var(--text-faint)]">{noWheelNote(bodies, paired.a, paired.b)}</div>
                )}
              </KindCard>
            ) : (
              <KindCard key={c.kind} kind={c.kind} onPick={() => finishJoin(c.kind)} />
            )
          )}
        </div>
      )}
    </div>
  )
}

/**
 * One way of joining, in the Connect flow. With `onPick` it is the button that finishes the join;
 * without, it is the pulley's card, whose choice is one of the wheel buttons in `children`.
 * Resting on either opens the link's card with its picture, beside the one-line rule already shown.
 */
function KindCard({ kind, onPick, children }: { kind: LinkKind; onPick?: () => void; children?: React.ReactNode }) {
  const card = useToolCard(`link:${kind}`)
  const c = linkCard(kind)
  const text = (
    <>
      <div className="font-semibold text-[color:var(--text-strong)]">{c.title}</div>
      <div className="text-small leading-snug text-[color:var(--text-dim)]">{c.line}</div>
    </>
  )
  if (onPick)
    return (
      <button className="rounded-md border border-[color:var(--line-2)] px-2 py-1 text-left hover:bg-[var(--bg-3)]" onClick={onPick} {...card}>
        {text}
      </button>
    )
  return (
    <div className="rounded-md border border-[color:var(--line-2)] px-2 py-1" {...card}>
      {text}
      {children}
    </div>
  )
}
