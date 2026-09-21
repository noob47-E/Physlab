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

  it('has no step under fine any more: the keypad legends that used --text-micro are gone', () => {
    // 11 px is as small as anything in the app gets. The 9 px step existed for the SHIFT and
    // ALPHA legends in the corner of a key; with the popup keypad there are no legends, and a
    // second "just a bit smaller" step is how 8.5 px and 10.5 px labels crept in before.
    expect(css).not.toMatch(/--text-micro/)
    expect(css).not.toMatch(/font-size:\s*(?:9|10|10\.5)px/)
    // No panel may reach for it either, and no LCD survives anywhere in the stylesheet.
    for (const file of tsxFiles(ROOT)) expect(readFileSync(file, 'utf8'), file).not.toMatch(/\btext-micro\b|\blcd\b/)
    expect(css).not.toMatch(/\blcd\b/)
  })

  it('sizes the Maths section in named steps and theme tokens, never in pixels or hex', () => {
    const start = css.indexOf('/* ---------- Maths ---------- */')
    const end = css.indexOf('/* ---------- Pure Math')
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const section = css.slice(start, end)
    expect(section.match(/font-size:\s*[\d.]+px/g)).toBeNull()
    expect(section).not.toMatch(/font-family:\s*'/)
    // The keys are flat and themed: no hex, no rgba, no gradient — the old keypad was the same
    // grey-and-green in every theme.
    expect(section).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(section).not.toMatch(/rgba?\(|linear-gradient/)
    for (const cls of ['.maths', '.maths-field', '.maths-answer', '.keypad-pop', '.key', '.key.primary', '.key-more']) {
      expect(section, cls).toContain(`\n${cls} {`)
    }
    expect(section.match(/\n\.key \{[^}]*\}/)?.[0]).toMatch(/background: var\(--bg-3\)/)
    expect(section.match(/\n\.key \{[^}]*\}/)?.[0]).toMatch(/border: 1px solid var\(--line-2\)/)
    // The step numbers and the method badge of the working area sit past the Maths marker.
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
    const src = read('panels/WorkingView.tsx')
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
