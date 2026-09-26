// A drawing colour lives in the stylesheet, once per theme, and nowhere else.
//
// themeColor('--name') returns a grey stand-in when the name is not declared, so a misspelt token
// or one added to only the dark block is invisible until someone toggles the theme with objects on
// screen. This reads styles.css and every renderer source and checks that (1) each token a file
// asks for is declared, and (2) every theme block declares the same set, so no colour can
// be right in one theme and missing in another.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RENDERER_SRC as ROOT } from './helpers/repo'
import { BLOCKS, THEME_CSS as css, contrast, declaredTokens, themeBlock, tokenValue } from './helpers/theme'

/** Every `--token` a source file reads, through themeColor('--x') or var(--x). */
function referencedTokens(source: string): Set<string> {
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

const dark = declaredTokens(css, BLOCKS.dark)
// Type tokens are declared once, outside the theme blocks (the @theme block at the top).
const anywhere = new Set([...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]))

describe('theme tokens', () => {
  it('declares the same colours in all four themes', () => {
    for (const [theme, selector] of Object.entries(BLOCKS)) {
      if (theme === 'dark') continue
      const other = declaredTokens(css, selector)
      expect([...dark].filter((t) => !other.has(t)), `dark only, missing from ${theme}`).toEqual([])
      expect([...other].filter((t) => !dark.has(t)), `${theme} only`).toEqual([])
    }
    // A block with no tokens at all would pass the check above against an empty set.
    expect(declaredTokens(css, BLOCKS.moonlight).size).toBeGreaterThan(40)
    expect(declaredTokens(css, BLOCKS.moongold).size).toBeGreaterThan(40)
  })

  it('gives each theme its own values, not a copy of another', () => {
    // A block pasted from another theme and left unedited would pass every other check here.
    const bg = Object.values(BLOCKS).map((sel) => tokenValue(themeBlock(css, sel), '--bg-0'))
    expect(new Set(bg).size).toBe(4)
  })

  it('tells the scrollbars and form controls whether each theme is light or dark', () => {
    // `color-scheme` accepts only light or dark; a third theme has to pick one.
    for (const [theme, selector] of Object.entries(BLOCKS)) {
      expect(themeBlock(css, selector), theme).toMatch(/color-scheme:\s*(dark|light);/)
    }
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

  it('draws selection and key-point marks that show against the canvas in every theme', () => {
    // The light theme's selection ring at 1.5:1 against the canvas was the faintest line on
    // screen. These marks are often drawn on their own, so the canvas is what they must beat.
    for (const [theme, selector] of Object.entries(BLOCKS)) {
      const block = themeBlock(css, selector)
      const canvas = tokenValue(block, '--canvas-bg')
      expect(canvas, `${theme} --canvas-bg`).toBeDefined()
      for (const t of ['--sel-glow', '--key-root', '--key-intercept', '--key-extremum', '--accent']) {
        const v = tokenValue(block, t)
        expect(v, `${theme} ${t}`).toBeDefined()
        expect(contrast(v!, canvas!), `${theme} ${t} ${v} on ${canvas}`).toBeGreaterThanOrEqual(2.5)
      }
    }
  })

  it('keeps the ink on the hovered Delete row readable in every theme', () => {
    // The row's red is mixed 60 % towards black, so it is dark in every theme, and the ink on it
    // must be light in every theme. --on-accent is not that: Moonlight's accent is light, so its
    // --on-accent is a dark ink, and the Delete row once borrowed it and read at 3.4:1.
    const danger = themeBlock(css, '.menu-item.is-danger.is-active')
    expect(danger).toMatch(/color: var\(--on-danger\)/)
    expect(danger).not.toMatch(/var\(--on-accent\)/)
    for (const [theme, selector] of Object.entries(BLOCKS)) {
      const block = themeBlock(css, selector)
      const bad = tokenValue(block, '--bad')
      const ink = tokenValue(block, '--on-danger')
      expect(bad, `${theme} --bad`).toBeDefined()
      expect(ink, `${theme} --on-danger`).toBeDefined()
      // color-mix(in srgb, --bad 60%, black), the row's background, channel by channel.
      const row = '#' + [1, 3, 5].map((i) => Math.round(parseInt(bad!.slice(i, i + 2), 16) * 0.6).toString(16).padStart(2, '0')).join('')
      expect(contrast(ink!, row), `${theme} ${ink} on ${row}`).toBeGreaterThanOrEqual(4.5)
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
