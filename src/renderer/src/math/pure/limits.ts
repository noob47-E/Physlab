// How long a search may run before it gives up.
//
// Every Pure Math tool runs synchronously on the renderer's own thread, so an unbounded trial
// division is not slow — it is a frozen window with no way out. A student typing a big number is
// not doing anything unusual, so each search that scales with the size of a number carries the
// same ceiling and the same honest message when it stops early.
//
// Roughly a fifth of a second of bigint work on a modern machine. No imports, so nothing can
// create a cycle by depending on it.

export const MAX_TRIAL = 2_000_000

/** What a search reports when it ran out of budget rather than out of candidates. */
export interface Truncated {
  /** True when the search stopped early, so a negative result means "did not find", not "none". */
  tooBig?: boolean
}

/** The sentence shown when a search was cut short. Never claim there is nothing to find. */
export const TOO_BIG_TO_SEARCH =
  'The numbers here are too large for me to search all the way through. There may be factors I did not find.'
