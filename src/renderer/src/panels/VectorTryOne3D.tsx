// 3D-1 (owner, Wed 14 Oct 21:51: "pre-made experiments"): the 'Try one' tiles at the top of the Vector Calculator in the
// 3-D view. Two columns of the eight gallery scenes; a tile puts its vectors on the panel as cards (they can be read and
// retyped), works its answer out with the steps open, and frames the arrows; its caption and what it works out are written
// under the tiles. Folds away to its heading, remembered.

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { playVectorTile, shownVectorTile, VECTOR_TILES_3D } from './vectorTiles3d'
import { useVC } from './vectorCalcStore'

const FOLD_KEY = 'physlab.vectors.tryOne3d'

function readFolded(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(FOLD_KEY) === 'folded'
  } catch {
    return false
  }
}

function writeFolded(folded: boolean): void {
  try {
    localStorage.setItem(FOLD_KEY, folded ? 'folded' : 'open')
  } catch {
    // Not remembered; the section still folds.
  }
}

/**
 * Scrolls the panel (only the panel) so the answer card's top is in sight. scrollIntoView also scrolled the dock that holds
 * the panel, which hid the dock's tab row.
 */
function showAnswer(): void {
  const card = document.querySelector<HTMLElement>('[data-vc-result]')
  const panel = card?.closest<HTMLElement>('.panel')
  if (!card || !panel) return
  const top = panel.scrollTop + card.getBoundingClientRect().top - panel.getBoundingClientRect().top - 8
  panel.scrollTo({ top, behavior: 'smooth' })
}

export function VectorTryOne3D({ onProblem }: { onProblem: (text: string) => void }) {
  const [folded, setFolded] = useState(readFolded)
  // Which tile is on the panel: worked out from the cards, so removing one of its cards clears it.
  const cards = useVC((s) => s.cards)
  const shown = shownVectorTile(cards)
  const tile = VECTOR_TILES_3D.find((t) => t.id === shown)
  const toggle = () => {
    setFolded((f) => {
      writeFolded(!f)
      return !f
    })
  }
  return (
    <div className="border-b border-[var(--line)] px-2 py-1.5" data-testid="vector-try-one-3d">
      <button type="button" className="flex min-h-[32px] w-full items-center gap-1 text-left font-semibold text-[var(--text-strong)]" onClick={toggle} aria-expanded={!folded}>
        {folded ? <ChevronRight size={14} /> : <ChevronDown size={14} />} Try one in 3D
      </button>
      {!folded && (
        <>
          <div className="grid grid-cols-2 gap-1">
            {VECTOR_TILES_3D.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`btn h-auto min-h-[40px] justify-start whitespace-normal px-2 py-1 text-left text-small ${t.id === shown ? 'primary' : ''}`}
                title={`${t.caption} (Replaces the vectors on the panel.)`}
                aria-pressed={t.id === shown}
                onClick={() => {
                  onProblem(playVectorTile(t) ?? '')
                  // The worked answer sits under the cards, below the fold with three of them: bring it into sight once drawn.
                  setTimeout(showAnswer, 120)
                }}
              >
                {t.title}
              </button>
            ))}
          </div>
          {tile && (
            <p className="px-1 pt-1.5 text-small text-[var(--text-dim)]">
              {tile.caption} <span className="text-[var(--text-faint)]">{tile.compute}. Units: {[...new Set(tile.cards.map((c) => c.units))].join(', ')}.</span>
            </p>
          )}
        </>
      )}
    </div>
  )
}
