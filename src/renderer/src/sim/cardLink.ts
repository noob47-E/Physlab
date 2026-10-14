// The card-link store (SB18): a tiny store tracking which quantity (QKey) is currently
// highlighted. When a student taps or enters on a symbol in a formula card, this store updates;
// arrows (SB20) and graphs (SB19) read it to glow in the matching colour token, and the card
// symbol shows a ring. Tapping again clears the highlight.

import { create } from 'zustand'
import type { QKey } from './cards/types'

interface CardLinkStore {
  highlighted: QKey | null
  setHighlight: (q: QKey | null) => void
  toggleHighlight: (q: QKey) => void
  clear: () => void
}

export const useCardLink = create<CardLinkStore>((set) => ({
  highlighted: null,
  setHighlight: (q) => set({ highlighted: q }),
  toggleHighlight: (q) => set((s) => ({ highlighted: s.highlighted === q ? null : q })),
  clear: () => set({ highlighted: null })
}))

/** Non-React accessor for procedural renderers (three.js arrow batch, canvas, tests). */
export const cardLink = {
  get highlighted(): QKey | null {
    return useCardLink.getState().highlighted
  },
  set(q: QKey | null): void {
    useCardLink.getState().setHighlight(q)
  },
  toggle(q: QKey): void {
    useCardLink.getState().toggleHighlight(q)
  },
  clear(): void {
    useCardLink.getState().clear()
  }
}
