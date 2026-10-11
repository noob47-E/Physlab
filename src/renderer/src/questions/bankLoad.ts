// How Problem Sets reaches the bundled question sets: through a dynamic import started when the
// panel opens, so the six bundled files and their Numbas reader are a chunk of their own instead of
// half of the panel's (the owner asked for the banks to load when Problem Sets opens). The panel
// draws at once and says "Loading the questions…" until they arrive. This file is the only route to
// `bank.ts`, and it turns a failed load into a sentence a student can read, never the loader's own
// error (a chunk error names a file path). Headless: no React, no DOM.

import type { QuestionSet } from './bank'

/** Shown in place of the bundled sets while the bank is still arriving. */
export const LOADING_LINE = 'Loading the questions…'

/** Shown in place of the bundled sets when the bank did not load or a bundled file failed its checks. */
export const FAILED_LINE = 'The questions could not be loaded. Restart PhysLab to try again; Vector topics still work.'

/** What Practice needs from the bank module (a test hands in its own). */
export type BankModule = Pick<typeof import('./bank'), 'bundledSets' | 'loadTeacherFile'>

export type BankState = { status: 'loading' } | { status: 'ready'; sets: QuestionSet[] } | { status: 'failed' }

/**
 * A failed load as the sentence a student reads. The loader's own message is never shown: a chunk
 * that fails to fetch names its file path in that message, and a path has no place on the screen.
 */
export function plainFailure<T>(load: Promise<T>): Promise<T> {
  return load.catch(() => {
    throw new Error(FAILED_LINE)
  })
}

/**
 * The bank's own chunk, loaded on first use. The browser keeps the module after that, so every
 * later call gets it at once.
 */
export const loadBank = (): Promise<BankModule> => plainFailure(import('./bank'))

/**
 * The bundled sets, or 'failed' when the chunk did not load (the import rejects) or a bundled file
 * did not pass its checks (`bundledSets` throws). It never rejects, so the panel needs no catch of
 * its own.
 */
export async function loadBundledSets(load: () => Promise<BankModule> = loadBank): Promise<BankState> {
  try {
    const bank = await load()
    return { status: 'ready', sets: bank.bundledSets() }
  } catch {
    return { status: 'failed' }
  }
}

/**
 * The line shown where the bundled sets go: the loading sentence while they arrive, the failure
 * sentence if they did not, and nothing once they are there.
 */
export function bankLine(state: BankState): string | null {
  if (state.status === 'loading') return LOADING_LINE
  if (state.status === 'failed') return FAILED_LINE
  return null
}

/**
 * The set Start plays: the one the student chose, else the first there is. While the bundled sets
 * are still loading, a choice that is not among the sets yet (a bundled one) picks nothing, not the
 * first teacher's set: Start would otherwise offer that set until the bundled ones arrived.
 */
export function pickSet(sets: QuestionSet[], id: string, state: BankState): QuestionSet | undefined {
  return sets.find((s) => s.id === id) ?? (state.status === 'loading' ? undefined : sets[0])
}
