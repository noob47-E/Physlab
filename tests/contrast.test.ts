// A colour that reads fine to the person who picked it can still fail a student with low vision.
// This checks the pairs a screen actually shows: body text and dimmed text against every surface
// a panel sits on, the ink on an accent-coloured button, and the warn / good / bad inks that panels
// write a verdict or an error line in, for every theme — including Moonlight Gold, whose warm
// palette needed its own numbers, not a guess by eye.

import { describe, expect, it } from 'vitest'
import { BLOCKS, THEME_CSS as css, contrast, themeBlock, tokenValue } from './helpers/theme'

const AA = 4.5

// Pairings that pre-date Moonlight Gold and fail the 4.5:1 bar on the shipped themes, with the
// ratio each measured when it was listed. The tokens belong to no track in this phase, so they
// are not changed here; they are carried as found bugs for a theme fix of their own. An entry is
// not a skip: the pair must still fail, so the day a theme is fixed the stale entry fails this
// test and has to be deleted — the same rule COLOUR_ALLOW and the lint suppressions live by.
const KNOWN_PREEXISTING_SHORTFALLS = new Map<string, string>([
  ['dark --on-accent on --accent', '#ffffff on #4f8cff ≈ 3.22:1'],
  ['dark --text-dim on --bg-4', '#9a9ea8 on #35363c ≈ 4.49:1'],
  ['light --warn on --bg-0', '#b26a00 on #eceef1 ≈ 3.65:1'],
  ['light --warn on --bg-1', '≈ 3.95:1'],
  ['light --warn on --bg-2', '≈ 4.24:1'],
  ['light --warn on --bg-3', '≈ 3.52:1'],
  ['light --good on --bg-0', '#1f8a4c on #eceef1 ≈ 3.77:1'],
  ['light --good on --bg-1', '≈ 4.08:1'],
  ['light --good on --bg-2', '≈ 4.38:1'],
  ['light --good on --bg-3', '≈ 3.63:1']
])

const THEMES = Object.keys(BLOCKS) as (keyof typeof BLOCKS)[]
const SURFACES = [0, 1, 2, 3, 4].map((i) => `--bg-${i}`)

/** The pairs this file checks: [theme, ink, surface]. */
const PAIRS: [keyof typeof BLOCKS, string, string][] = THEMES.flatMap((theme) => [
  ...['--text', '--text-dim'].flatMap((ink) => SURFACES.map((bg): [keyof typeof BLOCKS, string, string] => [theme, ink, bg])),
  [theme, '--on-accent', '--accent'] as [keyof typeof BLOCKS, string, string],
  // bg-0 to bg-3: the page, the panels, the cards and the keys. A verdict line or an error line
  // (`text-bad`, `.log-out.err`) is written on each of these.
  ...['--warn', '--good', '--bad'].flatMap((ink) => SURFACES.slice(0, 4).map((bg): [keyof typeof BLOCKS, string, string] => [theme, ink, bg]))
])

/** Asserts one ink on one surface reaches AA, or, for a listed shortfall, that it still does not. */
function expectPair(theme: keyof typeof BLOCKS, ink: string, surface: string): void {
  const block = themeBlock(css, BLOCKS[theme])
  const fg = tokenValue(block, ink)
  const bg = tokenValue(block, surface)
  expect(fg, `${theme} ${ink}`).toBeDefined()
  expect(bg, `${theme} ${surface}`).toBeDefined()
  const key = `${theme} ${ink} on ${surface}`
  const ratio = contrast(fg!, bg!)
  if (KNOWN_PREEXISTING_SHORTFALLS.has(key)) {
    expect(ratio, `${key} (${fg} on ${bg}) now passes — remove it from KNOWN_PREEXISTING_SHORTFALLS`).toBeLessThan(AA)
  } else {
    expect(ratio, `${key} (${fg} on ${bg})`).toBeGreaterThanOrEqual(AA)
  }
}

describe('WCAG contrast across all four themes', () => {
  it('reads --text and --text-dim at 4.5:1 or better on every surface, bg-0 through bg-4', () => {
    for (const [theme, ink, bg] of PAIRS) if (ink === '--text' || ink === '--text-dim') expectPair(theme, ink, bg)
  })

  it('reads --on-accent at 4.5:1 or better on --accent', () => {
    for (const [theme, ink, bg] of PAIRS) if (ink === '--on-accent') expectPair(theme, ink, bg)
  })

  it('reads the warn, good and bad inks at 4.5:1 or better on the surfaces a panel writes them on', () => {
    for (const [theme, ink, bg] of PAIRS) if (ink === '--warn' || ink === '--good' || ink === '--bad') expectPair(theme, ink, bg)
  })

  it('lists no exemption for Moonlight Gold, whose tokens this test was written for', () => {
    expect([...KNOWN_PREEXISTING_SHORTFALLS.keys()].filter((k) => k.startsWith('moongold'))).toEqual([])
  })

  it('lists only pairs the assertions above actually visit', () => {
    // A misspelt key would exempt nothing and fail nothing — it would just sit there.
    const visited = new Set(PAIRS.map(([theme, ink, bg]) => `${theme} ${ink} on ${bg}`))
    expect([...KNOWN_PREEXISTING_SHORTFALLS.keys()].filter((k) => !visited.has(k))).toEqual([])
  })
})
