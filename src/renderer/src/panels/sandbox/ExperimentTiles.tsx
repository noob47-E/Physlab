// Six picture tiles of experiments (SB63, the simple panel): a pendulum, a mass on a spring, a bouncing ball, a collision, a
// projectile and a lever, each a small drawing and a short word. A first-time student picks one and presses Play; the
// twenty-nine-experiment list with its search stays behind "More experiments". A tile loads its experiment by the one path
// the list takes (loadExperiment), and the loaded one is lit, so the panel always says which experiment is on the drawing.
//
// The drawings are inline SVG in the theme's own colours: the lines take the tile's text colour (currentColor) and the
// moving body is the accent, so every one reads in Light, Dark, Moonlight and Moonlight Gold alike. No hex, no image files.

import { presetById } from '../../sim/presets'
import { useSandbox } from '../../sim/store'
import { loadExperiment } from '../../sim/transportActions'

/**
 * The six tiles, in order: the preset's id (sim/presets.ts) and the word on the tile. Four are the preset's own label;
 * "Head-on collision" is shortened for a tile, and Seesaw is named for the physics it teaches, the owner's word (Lever).
 * tests/simpleSandbox.test.ts holds every id to a real preset and the four plain labels to the presets' own.
 */
export const EXPERIMENT_TILES: { id: string; label: string }[] = [
  { id: 'pendulum', label: 'Pendulum' },
  { id: 'spring', label: 'Mass on a spring' },
  { id: 'bounce', label: 'Bouncing ball' },
  { id: 'collision', label: 'Collision' },
  { id: 'projectile', label: 'Projectile' },
  { id: 'seesaw', label: 'Lever' }
]

/** The accent-coloured body of a drawing: the thing that moves. */
const BODY = 'fill-[var(--accent)] stroke-[var(--accent)]'
/** A guide line: the path a body will take, drawn fainter than the apparatus. */
const GUIDE = 'stroke-[var(--text-faint)]'

/** One drawing, 48 × 36, round strokes, in the colour of the text around it. */
function Picture({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 48 36" width="48" height="36" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

const PICTURES: Record<string, () => React.ReactNode> = {
  pendulum: () => (
    <Picture>
      <line x1="17" y1="4" x2="31" y2="4" />
      <path d="M14.3 24.8A23 23 0 0 0 33.7 24.8" strokeDasharray="2 3" className={GUIDE} />
      <line x1="24" y1="4" x2="33.7" y2="24.8" />
      <circle cx="33.7" cy="24.8" r="4" className={BODY} />
    </Picture>
  ),
  spring: () => (
    <Picture>
      <line x1="15" y1="3" x2="33" y2="3" />
      <path d="M24 3v3l-4 2 8 3-8 3 8 3-8 3 4 2v2" />
      <rect x="18" y="24" width="12" height="9" rx="1.5" className={BODY} />
    </Picture>
  ),
  bounce: () => (
    <Picture>
      <line x1="4" y1="32" x2="44" y2="32" />
      <path d="M6 31Q13 -11 20 31Q26 7 32 31Q36 19 40 31" strokeDasharray="2.5 2.5" className={GUIDE} />
      <circle cx="13" cy="10" r="3.5" className={BODY} />
    </Picture>
  ),
  collision: () => (
    <Picture>
      <line x1="4" y1="30" x2="44" y2="30" />
      <circle cx="15" cy="24" r="5.5" className={BODY} />
      <circle cx="33" cy="24" r="5.5" />
      <path d="M9 12h10m-3-3 3 3-3 3" />
      <path d="M39 12h-10m3-3-3 3 3 3" />
    </Picture>
  ),
  projectile: () => (
    <Picture>
      <line x1="4" y1="32" x2="44" y2="32" />
      <path d="M7 32Q24 -16 41 32" strokeDasharray="2.5 2.5" className={GUIDE} />
      <path d="M8 31 13 18m-3.5 2.5L13 18l1.2 4.1" />
      <circle cx="24" cy="8" r="3.5" className={BODY} />
    </Picture>
  ),
  seesaw: () => (
    <Picture>
      <path d="M18 33 24 21 30 33Z" />
      <line x1="5" y1="29" x2="43" y2="13" />
      <rect x="6.45" y="18.36" width="8" height="8" rx="1" transform="rotate(-22.8 10.45 22.36)" className={BODY} />
      <circle cx="35.45" cy="11.8" r="4" />
    </Picture>
  )
}

export function ExperimentTiles() {
  const presetId = useSandbox((s) => s.presetId)
  return (
    <div className="grid grid-cols-2 gap-1.5 px-2" role="group" aria-label="Try an experiment">
      {EXPERIMENT_TILES.map((t) => {
        const preset = presetById(t.id)
        if (!preset) return null
        const lit = presetId === t.id
        return (
          <button
            key={t.id}
            data-experiment={t.id}
            aria-pressed={lit}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-md border px-2 py-2 text-small ${
              lit ? 'border-[color:var(--accent)] bg-[var(--sel-row)] text-[color:var(--text-strong)]' : 'border-[color:var(--line-2)] text-[color:var(--text)] hover:bg-[var(--bg-3)]'
            }`}
            title={`${preset.label}: ${preset.about}`}
            onClick={() => loadExperiment(t.id)}
          >
            <span className={lit ? 'text-[color:var(--text-strong)]' : 'text-[color:var(--text-dim)]'}>{PICTURES[t.id]()}</span>
            <span>{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}
