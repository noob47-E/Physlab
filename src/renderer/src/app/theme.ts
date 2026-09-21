// Dark (default) or light for bright rooms and projectors.

import { useMemo } from 'react'
import { create } from 'zustand'

export type Theme = 'dark' | 'light'
const KEY = 'physlab.theme'

const read = (): Theme => {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

/**
 * Colours the viewport and the charts use; they come from the stylesheet so both themes stay in
 * one place. The fallback is only reached when the stylesheet has not loaded, so callers need not
 * repeat a hex value next to every token name (tests/colours.test.ts keeps hex out of the .tsx files).
 */
export function themeColor(name: string, fallback = '#888888'): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

/** How many `--series-N` colours the stylesheet defines for plotted quantities. */
export const SERIES_COUNT = 6

/** The stylesheet's colour for the i-th plotted quantity, wrapping round after SERIES_COUNT. */
export const seriesColor = (i: number): string => themeColor(`--series-${(((i % SERIES_COUNT) + SERIES_COUNT) % SERIES_COUNT) + 1}`)

export const useTheme = create<{ theme: Theme; set: (t: Theme) => void; toggle: () => void }>((set, get) => ({
  theme: read(),
  set: (theme) => {
    apply(theme)
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      // Not remembered, but the app still switches.
    }
    set({ theme })
  },
  toggle: () => get().set(get().theme === 'dark' ? 'light' : 'dark')
}))

/**
 * Something read from the stylesheet (usually through `themeColor`), re-read when the theme flips.
 * The demand-driven canvas only repaints when something renders, so a plain `themeColor()` call
 * in a component would keep the old theme's colour on screen until the next unrelated redraw.
 */
export function useThemed<T>(read: () => T): T {
  const theme = useTheme((t) => t.theme)
  // The stylesheet is the real dependency and `theme` is the signal that it changed; `read` is an
  // inline closure with a new identity every render, so listing it would defeat the memo.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  return useMemo(() => read(), [theme])
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

apply(read())
