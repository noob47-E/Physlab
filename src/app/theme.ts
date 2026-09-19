// Dark (default) or light for bright rooms and projectors.

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

/** Colours the viewport uses; they come from the stylesheet so both themes stay in one place. */
export function themeColor(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

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

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

apply(read())
