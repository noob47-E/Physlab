// The hover card itself: a title, a key cap, a looping picture of the tool at work and one sentence.
//
// One host draws whichever card useToolCard (useToolCard.ts) says is due, through a portal so a
// scrolling shelf or a clipped panel cannot cut it off. It is placed like the tour's card, by
// measuring itself and asking placeTourCard for a spot inside the window. It takes no pointer
// events and no focus: a tooltip that could be clicked would steal the click from the button.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { placeTourCard } from '../app/layoutMath'
import { toolCard } from '../app/toolCards/registry'
import { useToolCardStore } from './useToolCard'

export function ToolCardHost() {
  const shown = useToolCardStore((s) => s.shown)
  const hide = useToolCardStore((s) => s.hide)

  // Esc closes the card without stopping anything else Esc does (a tool in progress, a menu).
  useEffect(() => {
    if (!shown) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide()
    }
    const onBlur = () => hide()
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [shown, hide])

  const card = shown ? toolCard(shown.key) : undefined
  if (!shown || !card) return null
  return createPortal(<ToolCard key={shown.key} anchor={shown.anchor} title={card.title} shortcut={card.shortcut} sentence={card.sentence} Animation={card.Animation} />, document.body)
}

function ToolCard({ anchor, title, shortcut, sentence, Animation }: { anchor: { left: number; top: number; width: number; height: number }; title: string; shortcut?: string; sentence: string; Animation: React.ComponentType }) {
  // Measured, not guessed, for the same reason as the tour card: a longer sentence or a bigger
  // window zoom changes the height, and a guessed height put the card off the bottom of the screen.
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 240, h: 220 })
  useLayoutEffect(() => {
    const el = ref.current
    if (el) setSize({ w: el.offsetWidth, h: el.offsetHeight })
  }, [title, sentence])
  const at = placeTourCard(anchor, size, { w: window.innerWidth, h: window.innerHeight }, 8)
  return (
    <div ref={ref} className="tool-card" role="tooltip" style={at}>
      <div className="flex items-center gap-2">
        <span className="text-body font-semibold text-[var(--text-strong)]">{title}</span>
        {shortcut && <kbd className="rounded border border-[var(--line)] bg-[var(--bg-3)] px-1 text-fine text-[var(--text-dim)]">{shortcut}</kbd>}
      </div>
      <div className="tool-card-anim">
        <Animation />
      </div>
      <p className="text-small text-[var(--text)]">{sentence}</p>
    </div>
  )
}
