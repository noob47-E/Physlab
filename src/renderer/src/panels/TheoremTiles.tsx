// 3D-3B: the Theorems tiles of the 3-D Measure panel - two columns of the ten theorems (math/theorems3d.ts). A tile sets up its
// scene and slider (panels/theoremScenes.ts); under the tiles the shown theorem's statement, its live numbers at the slider's
// value, and its 'aha' sentence.

import { useEffect, useMemo, useState } from 'react'
import { useScene } from '../core/store'
import { theorems3D } from '../math/theorems3d'
import { useNum } from './sandbox/common'
import { liveNumbers, playTheorem, shownTheorem, syncTheorem, THEOREM_SCENES } from './theoremScenes'

export function TheoremTiles() {
  const objects = useScene((s) => s.objects)
  const scope = useScene((s) => s.ev.scope)
  const [played, setPlayed] = useState(0)
  const [busy, setBusy] = useState(false)
  const num = useNum()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- objects and played are the signals: shownTheorem reads the scene itself
  const shown = useMemo(() => shownTheorem(), [objects, played])
  const t = theorems3D.find((x) => x.id === shown)
  const slider = t ? THEOREM_SCENES[t.id]?.slider : undefined
  const value = slider ? scope[slider] : undefined
  useEffect(() => {
    if (t && typeof value === 'number') syncTheorem(t, value)
  }, [t, value])
  return (
    <div>
      {t && (
        <div className="mb-2 flex flex-col gap-1 text-small" data-theorem={t.id}>
          <p className="text-ink">{t.statement}</p>
          <p className="text-ink-faint">Move the slider {slider} on the drawing.</p>
          <ul className="flex flex-col">
            {liveNumbers(t).map((q) => (
              <li key={q.name} className="flex justify-between gap-2">
                <span className="text-ink-faint">{q.name}</span>
                <span className="tabular-nums text-ink-strong">{typeof q.value === 'number' ? num(q.value, q.unit) : q.value}</span>
              </li>
            ))}
          </ul>
          <p className="text-[color:var(--good)]">{t.ahaSentence}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-1">
        {theorems3D.map((x) => (
          <button
            key={x.id}
            type="button"
            className={`btn h-auto min-h-[40px] justify-start whitespace-normal px-2 py-1 text-left text-small ${x.id === shown ? 'primary' : ''}`}
            title={x.statement}
            aria-pressed={x.id === shown}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await playTheorem(x)
                setPlayed((n) => n + 1)
              } finally {
                setBusy(false)
              }
            }}
          >
            {x.title}
          </button>
        ))}
      </div>
    </div>
  )
}
