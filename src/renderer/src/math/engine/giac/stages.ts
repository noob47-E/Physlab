// Giac's first load, in the words every waiting line shows (ui/casStatus.ts, once a job is on Giac):
// the worker reports each stage as it gets there (workers/giac.worker.ts).

/** How many load stages the worker reports. */
export const BOOT_STAGES = 2

/** What each stage is doing, in a student's words. */
export const STAGE_WORDS: Record<number, string> = {
  1: 'loading the algebra library',
  2: 'getting it ready'
}
