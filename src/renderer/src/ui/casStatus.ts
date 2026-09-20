// The words the command bar uses for the algebra engine, kept pure so they can be tested.
//
// The badge used to read "CAS ● ready": an acronym and a symbol, in a bar that is supposed to feel
// like a calculator. A student needs to know only whether the algebra is ready, still starting,
// busy on their question, or not available — in plain words, and nothing at all when all is well.

export type CasState = 'idle' | 'loading' | 'ready' | 'error'
export type CasTone = 'good' | 'warn' | 'bad' | 'faint'

export interface CasStatusText {
  /** Colour of the quiet dot. */
  tone: CasTone
  /** Short words beside the dot; empty when there is nothing worth saying. */
  words: string
  /** The full sentence for the tooltip. */
  tip: string
}

export function describeCasStatus(status: CasState, busy: number, message?: string): CasStatusText {
  if (busy > 0) return { tone: 'warn', words: 'Working…', tip: 'The algebra engine is working on your question.' }
  switch (status) {
    case 'ready':
      return { tone: 'good', words: '', tip: 'Algebra: ready. Everything runs on this computer.' }
    case 'loading':
      return { tone: 'warn', words: 'Starting algebra…', tip: 'The algebra engine is loading. Drawing and arithmetic work meanwhile.' }
    case 'error':
      return { tone: 'bad', words: 'Algebra unavailable', tip: message ? `The algebra engine could not start: ${message}` : 'The algebra engine could not start.' }
    default:
      return { tone: 'faint', words: '', tip: message ? `Algebra: ${message}.` : 'Algebra starts the first time it is needed.' }
  }
}
