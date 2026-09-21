// The last of the theme-token sweep, and the two small Working/Practice fixes that rode with it.
//
// The panels themselves cannot be imported here (MathLive wants a window), so what a panel does
// with a pure function is checked the way tests/colours.test.ts checks colours: by reading the
// source. Each check names the bug it keeps out.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { expectedText } from '../src/renderer/src/math/checkAnswer'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer', 'src')
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8')

describe('the type scale', () => {
  const css = read('styles.css')

  it('has exactly one step under fine, and only the keypad legends use it', () => {
    // 9 px is as small as anything in the app gets; a second "just a bit smaller" step is how
    // 8.5 px and 10.5 px labels crept in before.
    expect(css.match(/--text-micro:\s*9px;/g)).toHaveLength(1)
    const uses = [...css.matchAll(/var\(--text-micro\)/g)].length
    expect(uses).toBe(2)
    const legends = css.match(/\.key \.(?:shift|alpha) \{[^}]*var\(--text-micro\)/g) ?? []
    expect(legends).toHaveLength(2)
  })

  it('sizes the Calculator section in named steps, never in pixels', () => {
    const start = css.indexOf('/* ---------- Calculator ---------- */')
    const end = css.indexOf('/* ---------- Pure Math')
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const section = css.slice(start, end)
    expect(section.match(/font-size:\s*[\d.]+px/g)).toBeNull()
    expect(section).not.toMatch(/font-family:\s*'/)
  })

  it('keeps the menu height rule in one place', () => {
    const shell = read('app/shell.css')
    expect(shell).not.toMatch(/\.menu \{/)
    expect(css.match(/max-height: calc\(100vh - 80px\)/g)).toHaveLength(1)
  })
})

describe('the Working panel', () => {
  const src = read('panels/Working.tsx')

  it('offers "Let me try first" as the primary, focused button when a new answer arrives with its steps hidden', () => {
    // The finished-state button of the same name stays a ghost; only the invitation is primary.
    const invite = src.match(/\{inviting && \([\s\S]*?<\/button>/)?.[0] ?? ''
    expect(invite).toContain('ref={tryBtn}')
    expect(invite).toContain('className="btn primary"')
    expect(invite).toContain('Let me try first')
    expect(src).toMatch(/if \(inviting\) tryBtn\.current\?\.focus\(\)/)
    // The reveal buttons beside it stay plain, so Enter after "Work it out" does not show a step.
    const reveal = src.match(/\{hidden > 0 && \([\s\S]*?Show a step/)?.[0] ?? ''
    expect(reveal).toContain('className="btn"')
    expect(reveal).not.toContain('primary')
  })
})

describe('the Practice panel', () => {
  it('reveals the answer at the scene precision, not a fixed four places', () => {
    const src = read('panels/Practice.tsx')
    expect(src).toContain('expectedText(f, settings)')
    expect(src).not.toMatch(/expectedText\(f\)/)
    // And the function it hands them to really honours them.
    const f = { key: 'a', label: 'A', value: 2 / 3, tol: 0.01 }
    expect(expectedText(f, { decimals: 2, precisionMode: 'dp' })).toBe('0.67')
    expect(expectedText(f, { decimals: 3, precisionMode: 'sf' })).toBe('0.667')
  })
})
