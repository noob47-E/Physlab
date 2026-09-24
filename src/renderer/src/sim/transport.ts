// The Sandbox transport row (Play, Reset, step, undo, the clock) must keep its shape while a run
// plays (Fix 22). It wraps onto a second line when the panel is narrow, and it used to decide that
// afresh on every frame: "Play" became the wider "Pause" and "t = 0 s" grew to "t = 12.35 s", so
// on a 1280 px window (a 348 px panel) the clock dropped to a second line part-way through a run
// and the whole panel below it jumped 24 px down, and back up on Reset. The clock now keeps room
// for the widest time it will show, so whether the row wraps depends on the panel's width alone.

import { formatMeasure } from '../math/format'
import type { SceneSettings } from '../core/types'

/** The clock as the transport writes it, through the student's precision (rule 4). */
export const clockText = (t: number, settings: SceneSettings): string => `t = ${formatMeasure(t, 'number', settings)} s`

/**
 * Times whose text is the widest a run shows before 1000 s: one frame (with significant figures a
 * small time has the most digits), runs of eights (the longest integer part at each size) and a
 * hair under 1000 s, which rounds up to "1000" with no decimal places.
 */
const WIDEST_TIMES = [1 / 60, 8.88888888, 88.8888888, 888.888888, 999.9999999]

/**
 * The text the clock keeps room for: the widest any time under 1000 s can have at these settings,
 * or the current text if a very long run has grown past that. The transport lays it, invisible, in
 * the same cell as the real clock, so the browser sizes the cell by the wider of the two exactly.
 * Longest means most characters: the clock is drawn in tabular figures, where every digit is the
 * same width, and the rest ("t = ", " s", the point) is the same in every reading. A tie keeps
 * the sample, so the hidden text does not change from frame to frame.
 */
export function widestClockText(t: number, settings: SceneSettings): string {
  return [...WIDEST_TIMES.map((w) => clockText(w, settings)), clockText(t, settings)].reduce((a, b) => (b.length > a.length ? b : a))
}
