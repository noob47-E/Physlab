// Which Sandbox panel a student sees (SB63, the owner's option A): the SIMPLE view — Play and Reset, six picture tiles,
// three add buttons, the selected object's speed and mass, the energy line — or ALL TOOLS, today's full panel. Simple is
// the default for everyone, a profile that has used the full panel included; the choice is remembered in localStorage the
// way a fold's state is (sim/inspector.ts), and a blocked or garbled storage means Simple, never a crash.

import { create } from 'zustand'
import type { FoldStore } from './inspector'

export type SandboxView = 'simple' | 'all'

export const SANDBOX_VIEW_KEY = 'physlab.sandbox.view'

/** The remembered view, or Simple. Only the word 'all' means the full panel; anything else is the default. */
export function readSandboxView(store: FoldStore | null): SandboxView {
  try {
    return store?.getItem(SANDBOX_VIEW_KEY) === 'all' ? 'all' : 'simple'
  } catch {
    return 'simple'
  }
}

export function writeSandboxView(view: SandboxView, store: FoldStore | null): void {
  try {
    store?.setItem(SANDBOX_VIEW_KEY, view)
  } catch {
    // Not remembered; the panel still switches.
  }
}

/** The browser's storage when there is one; the test runner has none (as panels/sandbox/common.tsx guards its folds). */
const viewStore = (): FoldStore | null => (typeof localStorage === 'undefined' ? null : localStorage)

export const useSandboxView = create<{
  view: SandboxView
  setView: (view: SandboxView, opts?: { remember?: boolean }) => void
}>((set) => ({
  view: readSandboxView(viewStore()),
  setView: (view, opts = {}) => {
    if (opts.remember !== false) writeSandboxView(view, viewStore())
    set({ view })
  }
}))
