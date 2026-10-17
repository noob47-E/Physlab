// Decisions behind the top bar's number boxes, kept pure so a test can call the same code the boxes use.

/** The precision box: at least one figure in significant-figure mode (0 s.f. is meaningless and every number was
 *  silently written to 1 s.f. while the box said 0), 0 allowed in decimal places, never above 12. */
export function clampPrecision(n: number, mode: 'dp' | 'sf'): number {
  const min = mode === 'sf' ? 1 : 0
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(12, Math.round(n)))
}

/** The grid-scale box keeps whatever the student typed ("", "0", "0.", ".") and only commits a positive finite
 *  number. null = partial text, leave the stored scale alone. Before, `|| 1` turned every partial reading into 1. */
export function scaleFromText(text: string): number | null {
  const t = text.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Menu toggling in the top bar: opening any menu closes whatever was open before.
 *  Clicking the currently open menu closes it (returns null). */
export function toggleTopMenu<T extends string>(active: T | null, target: T): T | null {
  return active === target ? null : target
}

let activeMenuCloser: (() => boolean) | null = null

export function setActiveMenuCloser(closer: (() => boolean) | null): void {
  activeMenuCloser = closer
}

export function closeActiveMenu(): boolean {
  if (activeMenuCloser) return activeMenuCloser()
  return false
}

