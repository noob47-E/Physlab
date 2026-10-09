// What the answer line under the command bar shows (P-GCALC GC3). The Console is closed by default
// now, so the bar's last answer or message must be on screen without it (answers are mandatory):
// the line shows the newest Console entry, with the same buttons the Console gives that entry.
//
// Its own file, not answerLine.ts beside AnswerLine.tsx: Windows file names ignore case, and the
// two names were one file to the type checker.

import type { LogEntry } from '../core/store'

export interface AnswerLineView {
  text?: string
  tex?: string
  kind: LogEntry['kind']
  /** The Console's "Steps" button. */
  steps: boolean
  /** The Console's "Show the working" button. */
  working: boolean
  /** The Console's "Visualize" button. */
  visualize: boolean
}

/** The newest entry of the Console's log, as the answer line shows it; null while nothing has been typed. */
export function answerLineOf(log: readonly LogEntry[]): AnswerLineView | null {
  const last = log.at(-1)
  if (!last || (!last.text && !last.tex)) return null
  return {
    text: last.text,
    tex: last.tex,
    kind: last.kind,
    steps: !!last.solution,
    working: !!last.working,
    visualize: !!last.visualize
  }
}

/** The colour token for each kind of line: an error in the error colour, a message quieter than an answer. */
export const ANSWER_COLOUR: Record<LogEntry['kind'], string> = {
  result: 'var(--text)',
  error: 'var(--bad)',
  info: 'var(--text-dim)'
}
