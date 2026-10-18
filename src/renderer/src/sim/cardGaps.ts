// SB18: what the cards dock shows beside its cards. The gap rows (SB15's honest gap, one line per quantity the run has
// measured so far), which cards a view opens with, and which of them start open.

import type { RunTape } from './recorder'
import { gapOf, type Built, type Theory } from './theory'
import type { SandboxView } from './sandboxView'

export interface GapRow {
  key: string
  /** "Range: formula 17.30 m · measured 17.25 m · gap −0.29 %: the 1/240 s step (it lands v₀ₓΔt = 5.1 cm short)" */
  text: string
  within: boolean
}

const MINUS = '−'

/**
 * One row for each of the theory's predictions that the tape has measured up to `step` (its end when left out). The
 * numbers go through `num` (the student's precision setting); a quantity not reached yet (the ball still in the air)
 * has no row.
 */
export function gapRows(theory: Theory, built: Built, tape: RunTape, rate: number, num: (v: number) => string, step?: number): GapRow[] {
  if (tape.last <= tape.first) return []
  const measured = theory.measure(tape, built, step)
  const rows: GapRow[] = []
  for (const p of theory.predict(built)) {
    const m = measured.find((x) => x.key === p.key)
    if (!m || !Number.isFinite(m.value)) continue
    const g = gapOf(p, m, rate, built)
    const label = p.label.charAt(0).toUpperCase() + p.label.slice(1)
    // The sign after rounding: a gap that reads 0 at the student's precision has none (never −0.00 %).
    const shown = num(Math.abs(g.percent))
    const zero = Number(shown.replace(/[^0-9.]/g, '')) === 0
    const sign = zero ? '' : g.percent < 0 ? MINUS : '+'
    const unit = p.unit ? ` ${p.unit}` : ''
    rows.push({ key: p.key, within: g.within, text: `${label}: formula ${num(p.value)}${unit} · measured ${num(m.value)}${unit} · gap ${sign}${shown} %: ${g.reason}` })
  }
  return rows
}

/** The cards a view shows: the simple Sandbox one card for the loaded experiment (its first), All tools every card. */
export function cardsInView(ids: string[], view: SandboxView): string[] {
  if (view === 'simple') {
    // S2b: For lever moments, show both left and right turning moments side by side
    if (ids.includes('lever-left-moment') && ids.includes('lever-right-moment')) {
      return ['lever-left-moment', 'lever-right-moment']
    }
    return ids.slice(0, 1)
  }
  return ids
}

/** How many cards start open; the rest start folded to their title line (a lab may list up to 7, SB18 amended). */
export const OPEN_CARDS = 3
