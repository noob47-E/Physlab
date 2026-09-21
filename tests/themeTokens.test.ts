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

/** The custom properties declared inside the block that starts with `selector {`. */
export function declaredTokens(source: string, selector: string): Set<string> {
  const start = source.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no block for ${selector}`)
  const end = source.indexOf('\n}', start)
  const body = source.slice(start, end)
  return new Set([...body.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]))
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

  it('reads the reference forms the sources use', () => {
    expect([...referencedTokens("themeColor('--warn'); themeColor(k ? '--key-root' : '--key-extremum'); className=\"text-[var(--text-dim)]\"")]).toEqual(['--warn', '--key-root', '--key-extremum', '--text-dim'])
    expect([...referencedTokens('color: var(--x, red); border: var(--y , #000)')]).toEqual(['--x', '--y'])
  })
})
