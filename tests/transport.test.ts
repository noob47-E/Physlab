// Fix 22 — the Sandbox panel jumped up and down around Play. Reproduced at 1280 × 720 (a 348 px
// panel): paused at t = 0 the transport row is 40 px; playing at t = 12.35 s the clock no longer
// fits, drops to a second line, the row is 64 px and the Objects heading moves from y = 188 to
// 212 — and back on Reset. Play → the wider Pause did the same on a slightly narrower panel, and a
// selected body's Position and Velocity rows lost 4.5 px each when their boxes became live text.

import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/renderer/src/core/store'
import type { SceneSettings } from '../src/renderer/src/core/types'
import { clockText, widestClockText } from '../src/renderer/src/sim/transport'
import { readSource } from './helpers/repo'
import { resetGlobals } from './helpers/globals'

beforeEach(() => resetGlobals())

const settingsFor = (precisionMode: 'dp' | 'sf', decimals: number): SceneSettings => ({ ...DEFAULT_SETTINGS, precisionMode, decimals })
const ALL: SceneSettings[] = [...[0, 1, 2, 3, 4, 6].map((d) => settingsFor('dp', d)), ...[1, 2, 3, 4, 6].map((d) => settingsFor('sf', d))]

describe('Fix 22: the transport keeps its shape while a run plays', () => {
  it('writes the clock the way it always has', () => {
    expect(clockText(0, settingsFor('dp', 2))).toBe('t = 0 s')
    expect(clockText(12.345, settingsFor('dp', 2))).toBe('t = 12.35 s')
  })

  it('keeps the same room for the clock at every frame of a run under 1000 s, at every precision', () => {
    for (const s of ALL) {
      const room = widestClockText(0, s)
      for (let frame = 0; frame < 60_000; frame += 7) {
        const t = frame / 60
        // Never less room than the text needs, and never a different amount: the row's wrapping
        // can then depend on the panel's width alone.
        expect(clockText(t, s).length, `${s.precisionMode} ${s.decimals} at t = ${t}`).toBeLessThanOrEqual(room.length)
        expect(widestClockText(t, s)).toBe(room)
      }
    }
  })

  it('keeps room for no more than a run under 1000 s needs, so a 1366 px laptop keeps the row on one line', () => {
    expect(widestClockText(0, settingsFor('dp', 2))).toBe('t = 888.89 s')
  })

  it('still grows for a run past 1000 s rather than cutting digits off', () => {
    const s = settingsFor('dp', 2)
    expect(widestClockText(12345.67, s)).toBe(clockText(12345.67, s))
  })

  it('draws the reserved room, a Play button as wide as Pause, and live rows as tall as the boxes', () => {
    const panel = readSource('src/renderer/src/panels/Sandbox.tsx')
    // The widest reading and the real one share a grid cell; only the real one is seen.
    expect(panel).toMatch(/<span className="invisible col-start-1 row-start-1" aria-hidden="true">\s*\{widestClockText\(engineTime, settings\)\}/)
    expect(panel).toMatch(/<span className="col-start-1 row-start-1">\{clockText\(engineTime, settings\)\}<\/span>/)
    // Both words are always laid out; only which one is visible changes.
    expect(panel).toMatch(/row-start-1 \$\{playing \? 'invisible' : ''\}`\}>Play</)
    expect(panel).toMatch(/row-start-1 \$\{playing \? '' : 'invisible'\}`\}>Pause</)
    // The live x, y, z line is the height of a .field (24 px), which is what the row held paused.
    expect(readSource('src/renderer/src/styles.css')).toMatch(/\.field \{\s*height: 24px;/)
    expect(panel).toMatch(/className="flex h-\[24px\] items-center gap-1 tabular-nums/)
  })
})
