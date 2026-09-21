// A drawing colour lives in the stylesheet, once per theme, and nowhere else.
//
// themeColor('--name') returns a grey stand-in when the name is not declared, so a misspelt token
// or one added to only the dark block is invisible until someone toggles the theme with objects on
// screen. This reads styles.css and every renderer source and checks that (1) each token a file
// asks for is declared, and (2) the dark and light blocks declare the same set, so no colour can
// be right in one theme and missing in the other.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer', 'src')
const css = readFileSync(join(ROOT, 'styles.css'), 'utf8')

/** The text of the block that starts with `selector {`, up to its closing brace. */
function themeBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no block for ${selector}`)
  return source.slice(start, source.indexOf('\n}', start))
}

/** The custom properties declared inside the block that starts with `selector {`. */
export function declaredTokens(source: string, selector: string): Set<string> {
  return new Set([...themeBlock(source, selector).matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]))
}

/** The #rrggbb value a theme block gives a token, if it is a plain hex colour. */
function tokenValue(block: string, name: string): string | undefined {
  return new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(block)?.[1]
}

/** Every `--token` a source file reads, through themeColor('--x') or var(--x). */
export function referencedTokens(source: string): Set<string> {
  const out = new Set<string>()
  for (const m of source.matchAll(/themeColor\(\s*['"`](--[a-z0-9-]+)['"`]/g)) out.add(m[1])
  // A conditional inside the call: themeColor(kind === 'root' ? '--key-root' : '--key-extremum').
  for (const m of source.matchAll(/themeColor\(([^)]*)\)/g)) for (const t of m[1].matchAll(/['"`](--[a-z0-9-]+)['"`]/g)) out.add(t[1])
  // var(--x) and var(--x, fallback) alike: a fallback would otherwise hide a misspelt token.
  for (const m of source.matchAll(/var\((--[a-z0-9-]+)\s*[,)]/g)) out.add(m[1])
  return out
}

function sources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...sources(p))
    else if (name.endsWith('.tsx') || name.endsWith('.ts')) out.push(p)
  }
  return out
}

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two #rrggbb colours, 1 (same) to 21 (black on white). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const dark = declaredTokens(css, ':root')
const light = declaredTokens(css, ":root[data-theme='light']")
// Type tokens and the calculator's LCD colours are declared once, outside the theme blocks: the
// LCD looks the same in a bright room, so those are deliberately not themed.
const anywhere = new Set([...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]))

describe('theme tokens', () => {
  it('declares the same colours for the dark and the light theme', () => {
    expect([...dark].filter((t) => !light.has(t)), 'dark only').toEqual([])
    expect([...light].filter((t) => !dark.has(t)), 'light only').toEqual([])
  })

  it('has every token the viewport and the panels ask for', () => {
    const missing: string[] = []
    for (const p of sources(ROOT)) {
      const src = readFileSync(p, 'utf8')
      for (const t of referencedTokens(src)) {
        // --series-${n} is built at run time and checked below.
        if (t.startsWith('--series-') || anywhere.has(t) || src.includes(`${t}:`)) continue
        missing.push(`${p.slice(ROOT.length + 1)} → ${t}`)
      }
    }
    expect(missing).toEqual([])
    for (let i = 1; i <= 6; i++) expect(dark.has(`--series-${i}`), `--series-${i}`).toBe(true)
  })

  it('carries the drawing colours the three.js views read', () => {
    for (const t of ['--sel-glow', '--key-root', '--key-intercept', '--key-extremum', '--wireframe', '--light-fill', '--grid-major', '--tick-text', '--canvas-bg']) {
      expect(dark.has(t), t).toBe(true)
    }
  })

  it('draws selection and key-point marks that show against the canvas in both themes', () => {
    // The light theme's selection ring at 1.5:1 against the canvas was the faintest line on
    // screen. These marks are often drawn on their own, so the canvas is what they must beat.
    const blocks = { dark: themeBlock(css, ':root'), light: themeBlock(css, ":root[data-theme='light']") }
    for (const [theme, block] of Object.entries(blocks)) {
      const canvas = tokenValue(block, '--canvas-bg')
      expect(canvas, `${theme} --canvas-bg`).toBeDefined()
      for (const t of ['--sel-glow', '--key-root', '--key-intercept', '--key-extremum', '--accent']) {
        const v = tokenValue(block, t)
        expect(v, `${theme} ${t}`).toBeDefined()
        expect(contrast(v!, canvas!), `${theme} ${t} ${v} on ${canvas}`).toBeGreaterThanOrEqual(2.5)
      }
    }
  })

  it('reads the reference forms the sources use', () => {
    expect([...referencedTokens("themeColor('--warn'); themeColor(k ? '--key-root' : '--key-extremum'); className=\"text-[var(--text-dim)]\"")]).toEqual(['--warn', '--key-root', '--key-extremum', '--text-dim'])
    expect([...referencedTokens('color: var(--x, red); border: var(--y , #000)')]).toEqual(['--x', '--y'])
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#777777')).toBe(1)
  })
})
