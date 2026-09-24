// How the top bar switches modes: one control family at every width (Fix 13).
//
// Up to 0.7 the bar showed a row of mode tabs at 1500 px and wider, and below that swapped the
// whole row for a single "Mode ▾" dropdown — two different designs, chosen by window width, so
// screenshots from a monitor and from a laptop disagreed about how PhysLab is driven. Now it is
// always the tabs followed by a "More modes" menu (the "priority plus" pattern): as many tabs as
// the room allows, in their usual order, and the rest in the menu above the coming-soon modes.
// The mode that is open is always a tab, so the bar still says where the student is.
//
// Kept pure so the rule can be tested without a DOM; TopBar measures the room, and each tab and the
// More button as drawn, and passes them in.

/** A tab's label is 13 px: the widest word measured ("Geometry") averages 7.1 px a letter, so 7.5 is safe. */
export const MODE_TAB_CHAR = 7.5
/** 11 px of padding each side (8 px at 1440 px and below: the estimate keeps the larger). */
export const MODE_TAB_PAD = 22
/** `gap-1` between tabs. */
export const MODE_TAB_GAP = 4
/** The "More modes ▾" button and the gap before it. */
export const MODE_MORE_W = 116

/**
 * How wide a mode's tab is, estimated from its label. Only a fallback, for before the bar has drawn
 * its measuring row (TopBar measures every label as the app draws it): the estimate is a safe upper
 * bound, 25–30 % over the real width at 1440 px and below, so on its own it folded Problem Sets into
 * More modes at 1366 px with 167 px of bar left empty.
 */
export const modeTabWidth = (label: string): number => label.length * MODE_TAB_CHAR + MODE_TAB_PAD

/** Widths the app measured (px): each ready mode's tab, in order, and the More modes button. 0 or missing means not measured. */
export interface MeasuredModeWidths {
  tabs?: readonly number[]
  more?: number
}

export interface ModeTabs {
  /** Indices (into the ready modes) shown as tabs, in their usual order. */
  tabs: number[]
  /** Indices that do not fit and go in the More menu, in their usual order. */
  more: number[]
}

/**
 * Which of the ready modes are tabs and which go in the More menu, given the room the bar has for
 * them (`available`, px; 0 means not measured yet, when every tab shows, as the shelf does).
 * Tabs are taken in order while they fit; if the open mode is not among them, tabs are dropped
 * from the end until it fits, so it is always shown — even alone on the narrowest window.
 */
export function modeTabs(available: number, labels: readonly string[], current: number, measured: MeasuredModeWidths = {}): ModeTabs {
  const all = labels.map((_, i) => i)
  if (available <= 0) return { tabs: all, more: [] }
  // A measured width wins; the estimate stands in for one not measured yet. Each tab carries the
  // gap after it, so the last one's is the gap before the More button.
  const budget = available - (measured.more && measured.more > 0 ? measured.more : MODE_MORE_W)
  const tabW = (i: number) => {
    const m = measured.tabs?.[i]
    return m && m > 0 ? m : modeTabWidth(labels[i])
  }
  const w = (i: number) => tabW(i) + MODE_TAB_GAP
  const tabs: number[] = []
  let used = 0
  for (const i of all) {
    if (used + w(i) > budget) break
    tabs.push(i)
    used += w(i)
  }
  if (current >= 0 && current < labels.length && !tabs.includes(current)) {
    while (tabs.length && used + w(current) > budget) used -= w(tabs.pop()!)
    tabs.push(current)
    tabs.sort((a, b) => a - b)
  }
  return { tabs, more: all.filter((i) => !tabs.includes(i)) }
}
