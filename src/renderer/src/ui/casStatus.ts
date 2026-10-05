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

/** How many load stages the worker reports (workers/cas.worker.ts `boot`). */
export const CAS_BOOT_STAGES = 3

const STAGE_WORDS: Record<number, string> = {
  1: 'loading Python',
  2: 'loading the algebra library',
  3: 'getting it ready'
}

/**
 * The one sentence every place that waits on the algebra engine shows while it starts: the bar's
 * strip, the bar's "Solving…" line, the Maths screen and the Working panel. A bare "Working…" for
 * the whole first load read as a freeze; naming the stage shows it is moving.
 */
export function casStartingSentence(stage = 0): string {
  const what = STAGE_WORDS[stage]
  return what
    ? `Starting the algebra engine (${stage} of ${CAS_BOOT_STAGES}: ${what})…`
    : 'Starting the algebra engine (this takes a moment the first time)…'
}

/** What a waiting line adds while the engine is not ready yet; empty once it is. */
export function casWaitNote(st: { status: CasState; stage?: number }): string {
  return st.status === 'ready' ? '' : casStartingSentence(st.status === 'loading' ? st.stage : 0)
}

type CasStatusStore = {
  getState: () => { status: CasState; stage?: number }
  /** Optional so a stand-in store without updates (a test's mock) simply sends none. */
  subscribe?: (fn: (st: { status: CasState; stage?: number }, prev: { status: CasState; stage?: number }) => void) => () => void
}

/**
 * Hand each load-stage sentence to a line that waits on an answer (the bar's "Solving…", the
 * Working panel), and let go once the load is over — ready, failed, cancelled or timed out.
 * math/cas.ts always changes the status before it delivers a waiting answer, so the line is never
 * written after its answer has replaced it.
 */
export function followCasStart(store: CasStatusStore, onSentence: (text: string) => void): void {
  if (store.getState().status === 'ready' || !store.subscribe) return
  const stop = store.subscribe((st, prev) => {
    if (st.status === 'loading') {
      if (prev.status !== 'loading' || st.stage !== prev.stage) onSentence(casStartingSentence(st.stage))
    } else if (prev.status === 'loading') stop()
  })
}

export function describeCasStatus(status: CasState, busy: number, message?: string, stage = 0): CasStatusText {
  // During the first load a question is queued, not being worked on: say which stage it is at.
  if (status === 'loading') {
    return {
      tone: 'warn',
      words: stage > 0 ? `Starting algebra (${stage} of ${CAS_BOOT_STAGES})…` : 'Starting algebra…',
      tip: `${casStartingSentence(stage)} ${busy > 0 ? 'Your question is answered as soon as it is ready.' : 'Drawing and arithmetic work meanwhile.'}`
    }
  }
  if (busy > 0) return { tone: 'warn', words: 'Working…', tip: 'The algebra engine is working on your question.' }
  switch (status) {
    case 'ready':
      return { tone: 'good', words: '', tip: 'Algebra: ready. Everything runs on this computer.' }
    case 'error':
      // 'error' is set both when the engine never started and when it crashed mid-question, and
      // math/cas.ts restarts it on the next command either way, so the words cover both.
      return { tone: 'bad', words: 'Algebra unavailable', tip: `The algebra engine stopped${message ? `: ${message}` : ''}. It starts again with the next command.` }
    default:
      return { tone: 'faint', words: '', tip: message ? `Algebra: ${message}.` : 'Algebra starts the first time it is needed.' }
  }
}
