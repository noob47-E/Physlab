// The `shell` sweep's inputs (CLEANUP-PLAN.md §2).

export const SHELL_PRECISION_INPUTS = [
  { val: 0, mode: 'sf' as const },
  { val: 0, mode: 'dp' as const },
  { val: 5, mode: 'sf' as const },
  { val: 15, mode: 'sf' as const },
  { val: -2, mode: 'dp' as const },
  { val: NaN, mode: 'sf' as const },
  { val: Infinity, mode: 'dp' as const }
]

export const SHELL_SCALE_INPUTS = [
  '', '0', '0.', '.', '2.5', '-1', 'abc', ' 3.14 ', '1e2'
]
