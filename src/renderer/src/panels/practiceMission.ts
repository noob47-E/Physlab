import { create } from 'zustand'

interface PracticeMissionState {
  marked: boolean
  mark: () => void
  reset: () => void
}

export const usePracticeMission = create<PracticeMissionState>((set) => ({
  marked: false,
  mark: () => set({ marked: true }),
  reset: () => set({ marked: false })
}))
