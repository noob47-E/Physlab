// SB66 (owner, Wed 14 Oct: "the bar should be hidden, it is so massive and looks bad"): whether the replay bar under the
// drawing is shown, and the simple view's one speed button. HIDDEN by default, in both views: a small "Replay" pill opens
// it, its Hide button folds it again, and the choice is remembered the way the Sandbox view is (sim/sandboxView.ts); a
// blocked or garbled storage means hidden, never a crash.

import { create } from 'zustand'
import type { FoldStore } from './inspector'
import type { ReplaySpeed } from './tapeStore'

export const TAPE_BAR_KEY = 'physlab.sandbox.replayBar'

/** The remembered choice, or hidden. Only the word 'shown' shows the bar. */
export function readTapeBarShown(store: FoldStore | null): boolean {
  try {
    return store?.getItem(TAPE_BAR_KEY) === 'shown'
  } catch {
    return false
  }
}

export function writeTapeBarShown(shown: boolean, store: FoldStore | null): void {
  try {
    store?.setItem(TAPE_BAR_KEY, shown ? 'shown' : 'hidden')
  } catch {
    // Not remembered; the bar still opens or folds.
  }
}

/** The browser's storage when there is one; the test runner has none, and a blocked one throws on the very access. */
const barStore = (): FoldStore | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export const useTapeBar = create<{
  shown: boolean
  setShown: (shown: boolean) => void
  more: boolean
  setMore: (more: boolean) => void
}>((set) => ({
  shown: readTapeBarShown(barStore()),
  setShown: (shown) => {
    writeTapeBarShown(shown, barStore())
    set({ shown, ...(shown ? {} : { more: false }) })
  },
  more: false,
  setMore: (more) => set({ more })
}))

/** The simple view's one speed button: ×1 → ×½ → ×¼ → ×1 (any other speed, set in All tools, goes back to ×1). */
export function nextSimpleSpeed(speed: number): ReplaySpeed {
  return speed === 1 ? 0.5 : speed === 0.5 ? 0.25 : 1
}
