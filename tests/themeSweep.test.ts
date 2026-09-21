// The last of the theme-token sweep, and the two small Working/Practice fixes that rode with it.
//
// The stylesheet is checked by reading it, because tests/colours.test.ts only scans .tsx. The
// decisions the panels make live in pure functions and are tested as such; the one source check
// left on a panel is the class name that makes the invitation the primary button.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { expectedText } from '../src/renderer/src/math/checkAnswer'
import { initialShown, invitesTry } from '../src/renderer/src/math/pure/reveal'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer', 'src')
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8')

const tsxFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? tsxFiles(full) : name.endsWith('.tsx') ? [full] : []
  })

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
    // The @theme block also makes a `text-micro` utility, which the colours test does not know
    // about; no panel may reach for it.
    for (const file of tsxFiles(ROOT)) expect(readFileSync(file, 'utf8'), file).not.toMatch(/\btext-micro\b/)
  })

  it('sizes the Calculator section in named steps, never in pixels', () => {
    const start = css.indexOf('/* ---------- Calculator ---------- */')
    const end = css.indexOf('/* ---------- Pure Math')
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const section = css.slice(start, end)
    expect(section.match(/font-size:\s*[\d.]+px/g)).toBeNull()
    expect(section).not.toMatch(/font-family:\s*'/)
    // The step numbers and the method badge of the working area sit past the Calculator marker.
    const pure = css.slice(end)
    for (const cls of ['pure-num', 'pure-method']) {
      const block = pure.match(new RegExp(`\\.${cls} \\{[^}]*\\}`))?.[0] ?? ''
      expect(block, cls).toMatch(/font-size:\s*var\(--text-fine\)/)
      expect(block, cls).not.toMatch(/font-size:\s*[\d.]+px/)
    }
  })

  it('keeps the menu height rule in one place', () => {
    const shell = read('app/shell.css')
    expect(shell).not.toMatch(/\.menu \{/)
    expect(css.match(/max-height: calc\(100vh - 80px\)/g)).toHaveLength(1)
  })
})

describe('the Working panel', () => {
  it('invites the student to try when a new answer arrives with its steps hidden', () => {
    expect(invitesTry(3, initialShown(3, 'try'), false)).toBe(true)
  })

  it('never invites when every step is already showing', () => {
    expect(invitesTry(3, initialShown(3, 'all'), false)).toBe(false)
    expect(invitesTry(3, 3, false)).toBe(false)
  })

  it('stops inviting once the student has said "let me try", and after a step is shown', () => {
    expect(invitesTry(3, 0, true)).toBe(false)
    expect(invitesTry(3, 1, false)).toBe(false)
  })

  it('has nothing to invite for a refusal or an answer with no steps', () => {
    expect(invitesTry(0, 0, false)).toBe(false)
    expect(invitesTry(0, initialShown(0, 'all'), false)).toBe(false)
  })

  it('makes the invitation the primary button and leaves the reveal beside it plain', () => {
    // So Enter after "Work it out" chooses trying, never a step. The finished-state button of the
    // same name stays a ghost.
    const src = read('panels/Working.tsx')
    const invite = src.match(/\{inviting && \([\s\S]*?<\/button>/)?.[0] ?? ''
    expect(invite).toContain('className="btn primary"')
    expect(invite).toContain('Let me try first')
    const reveal = src.match(/\{hidden > 0 && \([\s\S]*?Show a step/)?.[0] ?? ''
    expect(reveal).toContain('className="btn"')
    expect(reveal).not.toContain('primary')
  })
})

describe('the Practice panel', () => {
  it('reveals the answer at the scene precision, not a fixed four places', () => {
    const f = { key: 'a', label: 'A', value: 2 / 3, tol: 0.01 }
    expect(expectedText(f, { decimals: 2, precisionMode: 'dp' })).toBe('0.67')
    expect(expectedText(f, { decimals: 3, precisionMode: 'sf' })).toBe('0.667')
  })
})
