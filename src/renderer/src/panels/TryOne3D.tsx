// 3D-2 (owner, Wed 14 Oct 21:51: "beautiful 3D graphs"): the 'Try one' tiles at the top of Graphing's Expressions list in
// the 3-D view. Two columns of the twelve gallery graphs; a tile types its lines (they appear in the list below, where they
// can be read and changed), its slider appears with the others over the drawing, the view frames it, and its caption is
// written under the tiles. Folds away to its heading, remembered.

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { TILES_3D } from '../math/graph3dTiles'
import { playTile, shownTile } from './tiles3d'
import { useScene } from '../core/store'

const FOLD_KEY = 'physlab.graphing.tryOne3d'

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

export function TryOne3D() {
  const [folded, setFolded] = useState(readFolded)
  // Which tile is on the drawing: worked out from the scene, so deleting its lines or starting a new scene clears it.
  const objects = useScene((s) => s.objects)
  const [played, setPlayed] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- objects and played are the signals: shownTile reads the scene itself
  const shown = useMemo(() => shownTile(), [objects, played])
  const [busy, setBusy] = useState(false)
  const tile = TILES_3D.find((t) => t.id === shown)
  const toggle = () => {
    setFolded((f) => {
      writeFolded(!f)
      return !f
    })
  }
  return (
    <div className="border-b border-[var(--line)] px-2 py-1.5" data-testid="try-one-3d">
      <button type="button" className="flex min-h-[32px] w-full items-center gap-1 text-left font-semibold text-[var(--text-strong)]" onClick={toggle} aria-expanded={!folded}>
        {folded ? <ChevronRight size={14} /> : <ChevronDown size={14} />} Try one in 3D
      </button>
      {!folded && (
        <>
          <div className="grid grid-cols-2 gap-1">
            {TILES_3D.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`btn h-auto min-h-[40px] justify-start whitespace-normal px-2 py-1 text-left text-small ${t.id === shown ? 'primary' : ''}`}
                title={t.caption}
                aria-pressed={t.id === shown}
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await playTile(t)
                    setPlayed((n) => n + 1)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                {t.title}
              </button>
            ))}
          </div>
          {tile && (
            <p className="px-1 pt-1.5 text-small text-[var(--text-dim)]">
              {tile.caption} <span className="text-[var(--text-faint)]">Move the slider {tile.slider.name} to change it.</span>
            </p>
          )}
        </>
      )}
    </div>
  )
}
