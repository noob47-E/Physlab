// The SymPy engine's first load, in the words every waiting line shows (ui/casStatus.ts): the
// worker reports each stage as it gets there (workers/cas.worker.ts `boot`).

/** How many load stages the worker reports. */
export const BOOT_STAGES = 3

/** What each stage is doing, in a student's words. */
export const STAGE_WORDS: Record<number, string> = {
  1: 'loading Python',
  2: 'loading the algebra library',
  3: 'getting it ready'
}
