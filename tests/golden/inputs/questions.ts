// The `questions` sweep's inputs (CLEANUP-PLAN.md §2).

/** The seeds to run every bundled question through. */
export const SEEDS: number[] = Array.from({ length: 20 }, (_, i) => i + 1)

/**
 * Where to try an answer around the tolerance edge, as multiples of the part's tolerance away from
 * the right value: well inside, just inside, just outside, twice out, and past "close" (four times).
 */
export const EDGE_FACTORS: number[] = [0.5, 0.999, 1.001, 2, 4.01]
