// Hover a tool button for half a second and its card appears; move off, press, or Esc and it goes.
//
// A button spreads the handlers this hook returns; the one store below says which card is due,
// and ToolCardHost (ToolCard.tsx) draws it. Nothing here focuses anything: the card is a picture
// beside the pointer, and the keyboard stays wherever the student left it.

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { create } from 'zustand'
import type { Box } from '../app/layoutMath'

/** How long the pointer rests on a button before its card opens. Shorter and every pass across the shelf flickers cards. */
export const TOOL_CARD_DELAY = 500

export interface ShownCard {
  key: string
  /** The button's box in window coordinates, which the card is placed beside. */
  anchor: Box
}

/** The card that should be on screen after `key` has been hovered on `anchor` for long enough. */
export const showCard = (key: string, anchor: Box): ShownCard => ({ key, anchor })

/**
 * The card after `key`'s button was left, pressed or unmounted. Only that key's card goes: a
 * leave from the previous button can arrive after the next button's card has opened, and must
 * not take the new card with it. With no key (Esc), whatever is showing goes.
 */
export const hideCard = (shown: ShownCard | null, key?: string): ShownCard | null => (shown && (key === undefined || shown.key === key) ? null : shown)

interface ToolCardStore {
  shown: ShownCard | null
  show: (key: string, anchor: Box) => void
  hide: (key?: string) => void
}

export const useToolCardStore = create<ToolCardStore>((set) => ({
  shown: null,
  show: (key, anchor) => set({ shown: showCard(key, anchor) }),
  hide: (key) => set((s) => ({ shown: hideCard(s.shown, key) }))
}))

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/** Handlers for a button that has a card in the registry: spread them onto the button. */
export function useToolCard(key: string): {
  onPointerEnter: (e: { currentTarget: Element }) => void
  onPointerLeave: () => void
  onPointerDown: () => void
} {
  const timer = useRef<number | undefined>(undefined)
  const cancel = useCallback(() => {
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = undefined
  }, [])

  // A button that unmounts mid-hover (the shelf changing with the mode) must not leave its card
  // behind, and must not open one after it has gone.
  useEffect(
    () => () => {
      cancel()
      useToolCardStore.getState().hide(key)
    },
    [key, cancel]
  )

  return useMemo(
    () => ({
      onPointerEnter: (e: { currentTarget: Element }) => {
        cancel()
        const el = e.currentTarget
        timer.current = window.setTimeout(() => {
          timer.current = undefined
          useToolCardStore.getState().show(key, boxOf(el))
        }, TOOL_CARD_DELAY)
      },
      onPointerLeave: () => {
        cancel()
        useToolCardStore.getState().hide(key)
      },
      // A press means the student has chosen; the card would only sit over what they clicked for.
      onPointerDown: () => {
        cancel()
        useToolCardStore.getState().hide(key)
      }
    }),
    [key, cancel]
  )
}
