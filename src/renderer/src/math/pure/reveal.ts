// The Working panel's decisions, kept out of the panel so they can be tested without a browser.
//
// How many steps to show first, which job a piece of typing is treated as, what colour the check
// line gets, and what the "Allow i" offer runs — each is a small pure function here, and the panel
// only wires them to buttons.

import { latexToMath } from '../latexToMath'
import { suggestJob, type JobId } from './run'
import type { Working } from './work'

/**
 * Whether a maths field holds something worth running. A field the converter refuses still
 * counts: the run is what shows the student the refusal, so its button must not be greyed out.
 */
export function fieldHasText(latex: string): boolean {
  try {
    return latexToMath(latex).trim().length > 0
  } catch {
    return latex.trim().length > 0
  }
}

/** What the student wants to see first: nothing (work it out yourself) or every step. */
export type StepPref = 'try' | 'all'

export const STEP_PREF_KEY = 'physlab.pure.steps'

/**
 * Steps are hidden by default. Reading a worked answer feels like learning and is not;
 * trying first and then checking a step at a time is what sticks. A student who would rather
 * read everything says so once, and the panel remembers.
 */
export function stepPrefFrom(raw: string | null | undefined): StepPref {
  return raw === 'all' ? 'all' : 'try'
}

/** How many steps to reveal when a new piece of working arrives. */
export function initialShown(total: number, pref: StepPref): number {
  return pref === 'all' ? total : 0
}

/** "Treat as": the job chosen by hand, or the one guessed from what was typed. */
export type TreatAs = JobId | 'auto'

export function resolveJob(treatAs: TreatAs, text: string): JobId {
  return treatAs === 'auto' ? suggestJob(text) : treatAs
}

/**
 * The colour of the check line. `checked` is set by every generator that really verified its
 * answer; a line with no verdict behind it (a note such as "nothing to check") stays neutral.
 * The panel used to search the sentence for the word "suspicion", which is how a reworded
 * sentence could have turned a failed check green.
 */
export function checkTone(doc: Pick<Working, 'checked' | 'check'>): 'ok' | 'failed' | 'plain' {
  if (doc.checked === 'failed') return 'failed'
  if (doc.checked === 'ok') return 'ok'
  return 'plain'
}

/** The follow-up job a piece of working offers, as a JobId, or null when there is none. */
export function offeredJob(doc: Pick<Working, 'offer' | 'error'>, known: readonly JobId[]): JobId | null {
  if (doc.error || !doc.offer) return null
  return (known as readonly string[]).includes(doc.offer.job) ? (doc.offer.job as JobId) : null
}
