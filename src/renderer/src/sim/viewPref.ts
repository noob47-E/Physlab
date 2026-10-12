import { create } from 'zustand'

export type ViewKind = '3d' | '2d'

export interface ViewPrefState {
  view: ViewKind
  setView: (v: ViewKind) => void
  toggle: () => void
}

export const useViewPref = create<ViewPrefState>((set, get) => ({
  view: '3d',
  setView: (view) => set({ view }),
  toggle: () => set({ view: get().view === '3d' ? '2d' : '3d' })
}))

export type LookKind = 'real' | 'diagram'

export function effectiveLook(view: ViewKind, look: LookKind): LookKind {
  return view === '2d' ? 'diagram' : look
}

export const PRESET_VIEW: Readonly<Record<string, ViewKind>> = {
  lab1d: '2d',
  lab2d: '2d',
  labcradle: '2d',
  swingbridge: '3d'
}

export function viewForPreset(presetId: string | null | undefined, current: ViewKind): ViewKind {
  if (presetId && presetId in PRESET_VIEW) {
    return PRESET_VIEW[presetId]
  }
  return current
}
