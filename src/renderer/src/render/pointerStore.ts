import { create } from 'zustand'

interface PointerState {
  x: number | null
  y: number | null
  setPointer: (x: number | null, y: number | null) => void
}

export const usePointerStore = create<PointerState>((set) => ({
  x: null,
  y: null,
  setPointer: (x, y) => set({ x, y })
}))
