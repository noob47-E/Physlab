// Four themes, and the joins that carry the choice: what a stored value means, how the cycle
// walks, which color-scheme each theme maps to, and how the desktop window learns the page colour
// so the next launch does not flash the wrong one.
//
// theme.ts touches document and localStorage only when they exist, so it imports cleanly here.

import { describe, expect, it } from 'vitest'
import { COLOR_SCHEME, DEFAULT_THEME, THEMES, THEME_LABELS, nextTheme, readTheme, type Theme } from '../src/renderer/src/app/theme'
import { readSource } from './helpers/repo'

describe('reading the stored theme', () => {
  it('keeps a stored choice', () => {
    expect(readTheme('moonlight')).toBe('moonlight')
    expect(readTheme('moongold')).toBe('moongold')
    expect(readTheme('dark')).toBe('dark')
    expect(readTheme('light')).toBe('light')
  })

  it('opens a fresh install, or a corrupt value, in Moonlight', () => {
    expect(DEFAULT_THEME).toBe('moonlight')
    expect(readTheme(null)).toBe('moonlight')
    expect(readTheme(undefined)).toBe('moonlight')
    expect(readTheme('')).toBe('moonlight')
    expect(readTheme('Dark')).toBe('moonlight')
    expect(readTheme('purple')).toBe('moonlight')
  })
})

describe('the theme cycle', () => {
  it('visits every theme once and comes back round', () => {
    const seen: Theme[] = []
    let t: Theme = DEFAULT_THEME
    for (let i = 0; i < THEMES.length; i++) {
      seen.push(t)
      t = nextTheme(t)
    }
    expect(t).toBe(DEFAULT_THEME)
    expect(new Set(seen).size).toBe(THEMES.length)
    expect(seen).toEqual([...THEMES])
  })

  it('walks Moonlight → Moonlight Gold → Dark → Light, the order the View menu and the settings seg list', () => {
    // The walk above is defined by THEMES, so it would pass in any order; this pins the order.
    expect(nextTheme('moonlight')).toBe('moongold')
    expect(nextTheme('moongold')).toBe('dark')
    expect(nextTheme('dark')).toBe('light')
    expect(nextTheme('light')).toBe('moonlight')
    expect(THEMES).toEqual(['moonlight', 'moongold', 'dark', 'light'])
  })

  it('lists four themes, each with a plain name', () => {
    expect([...THEMES].sort()).toEqual(['dark', 'light', 'moongold', 'moonlight'])
    for (const t of THEMES) expect(THEME_LABELS[t]).toMatch(/^[A-Z][a-z]+( [A-Z][a-z]+)?$/)
  })
})

describe('color-scheme', () => {
  it('maps every theme to light or dark, because the browser knows no third value', () => {
    expect(COLOR_SCHEME.moonlight).toBe('dark')
    expect(COLOR_SCHEME.moongold).toBe('dark')
    expect(COLOR_SCHEME.dark).toBe('dark')
    expect(COLOR_SCHEME.light).toBe('light')
    for (const t of THEMES) expect(['dark', 'light']).toContain(COLOR_SCHEME[t])
  })

  it('never hands the browser the theme name itself', () => {
    // `style.colorScheme = 'moonlight'` is silently ignored, which is how the scrollbars stayed
    // white on a night-blue page.
    const src = readSource('src/renderer/src/app/theme.ts')
    expect(src).toMatch(/style\.colorScheme = COLOR_SCHEME\[/)
    expect(src).not.toMatch(/style\.colorScheme = theme\b/)
  })
})

describe('the window background hand-off', () => {
  const main = readSource('src/main/index.ts')
  const preload = readSource('src/preload/index.ts')
  const renderer = readSource('src/renderer/src/app/theme.ts')
  const css = readSource('src/renderer/src/styles.css')

  it('goes renderer → preload → main on one channel', () => {
    expect(renderer).toMatch(/setThemeBackground\?\.\(/)
    expect(preload).toMatch(/setThemeBackground: \(hex: string\)[^\n]*ipcRenderer\.send\('app:theme', hex\)/)
    expect(main).toMatch(/ipcMain\.on\('app:theme'/)
    expect(main).toMatch(/setBackgroundColor\(/)
  })

  it('remembers the colour beside the autosave and reads it back before the window is made', () => {
    expect(main).toMatch(/theme\.json/)
    expect(main).toMatch(/backgroundColor: readThemeBackground\(\)/)
  })

  it('writes the file only when the colour changes, and never in place', () => {
    // The renderer reports its colour on every launch, not only on a switch, so without the
    // early return the file was rewritten at every start with what it already held.
    const handler = main.slice(main.indexOf("ipcMain.on('app:theme'"), main.indexOf("ipcMain.handle('zoom:get'"))
    expect(handler).toMatch(/if \(background === rememberedBackground\) return/)
    // Written beside and renamed over, like the autosave, so a crash mid-write leaves the old file.
    expect(handler).toMatch(/writeFileSync\(tmp,/)
    expect(handler).toMatch(/renameSync\(tmp, themeFile\(\)\)/)
    expect(handler).not.toMatch(/writeFileSync\(themeFile\(\)/)
  })

  it("falls back to Moonlight's page colour, the same one the stylesheet declares", () => {
    const fallback = /DEFAULT_BACKGROUND = '(#[0-9a-f]{6})'/.exec(main)?.[1]
    const moonlight = css.slice(css.indexOf(":root[data-theme='moonlight'] {"))
    const bg0 = /--bg-0:\s*(#[0-9a-f]{6})/.exec(moonlight)?.[1]
    expect(fallback).toBeDefined()
    expect(fallback).toBe(bg0)
  })
})
