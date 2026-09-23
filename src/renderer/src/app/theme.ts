// Four themes: Moonlight (the default: a calm, cool night blue), Moonlight Gold (the same warm
// dim room, but candlelight instead of moonlight), dark, and light for bright rooms and projectors.

import { useMemo } from 'react'
import { create } from 'zustand'

export type Theme = 'dark' | 'light' | 'moonlight' | 'moongold'
const KEY = 'physlab.theme'

/** Every theme, in the order the menu lists them and `cycle` walks through them. */
export const THEMES: readonly Theme[] = ['moonlight', 'moongold', 'dark', 'light']

/** What a fresh install opens in. A stored choice always wins over this. */
export const DEFAULT_THEME: Theme = 'moonlight'

/** What a student calls each theme; the menu and the settings popover both read this. */
export const THEME_LABELS: Record<Theme, string> = { moonlight: 'Moonlight', moongold: 'Moonlight Gold', dark: 'Dark', light: 'Light' }

/**
 * `style.colorScheme` accepts only "light" or "dark" and silently ignores anything else, so a
 * third (or fourth) theme has to say which of the two its scrollbars and form controls follow.
 */
export const COLOR_SCHEME: Record<Theme, 'dark' | 'light'> = { moonlight: 'dark', moongold: 'dark', dark: 'dark', light: 'light' }

const isTheme = (v: unknown): v is Theme => typeof v === 'string' && (THEMES as readonly string[]).includes(v)

/** The theme a stored value names; anything unknown, including nothing at all, is the default. */
export const readTheme = (stored: string | null | undefined): Theme => (isTheme(stored) ? stored : DEFAULT_THEME)

/** The theme after `t` in the cycle, wrapping round at the end. */
export const nextTheme = (t: Theme): Theme => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]

const read = (): Theme => {
  try {
    return readTheme(localStorage.getItem(KEY))
  } catch {
    return DEFAULT_THEME
  }
}

/**
 * Colours the viewport and the charts use; they come from the stylesheet so every theme stays in
 * one place. The fallback is only reached when the stylesheet has not loaded, so callers need not
 * repeat a hex value next to every token name (tests/colours.test.ts keeps hex out of the .tsx files).
 */
export function themeColor(name: string, fallback = '#888888'): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

/** A token name a file may carry in `themed`; anything else is ignored rather than handed to CSS. */
const isToken = (t: string | undefined): t is string => !!t && /^--[a-z0-9-]+$/.test(t)

/** The colour an object is drawn in now: its theme token's when it has one (`themed`), else its own. */
export const shownColor = (o: { color: string; themed?: string }): string => (isToken(o.themed) && typeof document !== 'undefined' ? themeColor(o.themed, o.color) : o.color)

/** The same for a style attribute: the token itself, so the page follows a theme switch without a render. */
export const cssColor = (o: { color: string; themed?: string }): string => (isToken(o.themed) ? `var(${o.themed}, ${o.color})` : o.color)

/** How many `--series-N` colours the stylesheet defines for plotted quantities. */
export const SERIES_COUNT = 6

/** The stylesheet's colour for the i-th plotted quantity, wrapping round after SERIES_COUNT. */
export const seriesColor = (i: number): string => themeColor(`--series-${(((i % SERIES_COUNT) + SERIES_COUNT) % SERIES_COUNT) + 1}`)

export const useTheme = create<{ theme: Theme; set: (t: Theme) => void; cycle: () => void }>((set, get) => ({
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
  cycle: () => get().set(nextTheme(get().theme))
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

type Bridge = { setThemeBackground?: (hex: string) => void }

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = COLOR_SCHEME[theme]
  // The desktop window paints its own background before the page does; telling it the theme's
  // colour is what stops a flash of the wrong theme on the next launch.
  const bg = themeColor('--bg-0', '')
  if (bg) (window as unknown as { physlab?: Bridge }).physlab?.setThemeBackground?.(bg)
}

// The test runner imports this file with no document; the pure helpers above are all it needs there.
if (typeof document !== 'undefined') apply(read())
