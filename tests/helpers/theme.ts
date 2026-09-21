// Reading the theme blocks of styles.css, shared by the token test and the contrast test.
//
// These used to live in tests/themeTokens.test.ts and be imported from there; importing a test
// file runs its `describe` a second time inside the importer, so every themeTokens test was
// counted and reported twice. A helper module is collected by nothing.

import { readSource } from './repo'

/** The stylesheet's text, read once. */
export const THEME_CSS = readSource('src/renderer/src/styles.css')

/** The selector of each theme's block; the dark theme is the bare :root, so it needs no attribute. */
export const BLOCKS = { dark: ':root', light: ":root[data-theme='light']", moonlight: ":root[data-theme='moonlight']", moongold: ":root[data-theme='moongold']" } as const

/** The text of the block that starts with `selector {`, up to its closing brace. */
export function themeBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no block for ${selector}`)
  return source.slice(start, source.indexOf('\n}', start))
}

/** The custom properties declared inside the block that starts with `selector {`. */
export function declaredTokens(source: string, selector: string): Set<string> {
  return new Set([...themeBlock(source, selector).matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]))
}

/** The #rrggbb value a theme block gives a token, if it is a plain hex colour. */
export function tokenValue(block: string, name: string): string | undefined {
  return new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(block)?.[1]
}

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two #rrggbb colours, 1 (same) to 21 (black on white). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
