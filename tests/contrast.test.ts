// A colour that reads fine to the person who picked it can still fail a student with low vision.
// This checks the pairs a screen actually shows: body text and dimmed text against every surface
// a panel sits on, the ink on an accent-coloured button, and the warn / good / bad inks that panels
// write a verdict or an error line in, for every theme — including Moonlight Gold, whose warm
// palette needed its own numbers, not a guess by eye.

import { describe, expect, it } from 'vitest'
import { BLOCKS, THEME_CSS as css, contrast, themeBlock, tokenValue } from './helpers/theme'
import { PALETTE, vectorToken } from '../src/renderer/src/core/naming'
import { colourDistance, type Vision } from '../src/renderer/src/render/colourMix'
import { particleLook } from '../src/renderer/src/render/particleMath'
import { COLOR_SCHEME } from '../src/renderer/src/app/theme'

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

// ---------------------------------------------------------------------------
// Arrows (Fix 2): seen in every theme, and told apart by colour-blind eyes too
// ---------------------------------------------------------------------------

const ARROWS = ['--vec-1', '--vec-2', '--vec-3', '--vec-4', '--vec-5', '--vec-6']
const VISIONS: Vision[] = ['normal', 'protanopia', 'deuteranopia', 'tritanopia']
/** The record's scale: about 8 apart reads as two colours, below about 6 as one. */
const APART = 8

describe('arrow colours (Fix 2)', () => {
  it('reproduces the record’s measurements of the 0.6.1 colours, so the method is the record’s', () => {
    const lightCanvas = tokenValue(themeBlock(css, BLOCKS.light), '--canvas-bg')!
    // On Light, the old yellow was 1.38:1 and the command bar's gold resultant 1.22:1.
    expect(contrast('#fcc419', lightCanvas)).toBeCloseTo(1.38, 2)
    expect(contrast('#ffd43b', lightCanvas)).toBeCloseTo(1.22, 2)
    // Red and green 3.8 apart for a deuteranope (32.5 for normal eyes), blue and purple 4.3.
    expect(colourDistance('#ff6b6b', '#51cf66', 'deuteranopia')).toBeCloseTo(3.8, 1)
    expect(colourDistance('#ff6b6b', '#51cf66')).toBeCloseTo(32.5, 1)
    expect(colourDistance('#4dabf7', '#cc5de8', 'deuteranopia')).toBeCloseTo(4.3, 1)
    expect(colourDistance('#51cf66', '#fcc419', 'protanopia')).toBeCloseTo(5.2, 1)
  })

  it('draws every arrow, the resultant and both components at 3:1 or better on the canvas, in all four themes', () => {
    for (const [theme, selector] of Object.entries(BLOCKS)) {
      const block = themeBlock(css, selector)
      const canvas = tokenValue(block, '--canvas-bg')!
      for (const t of [...ARROWS, '--vec-result', '--vec-x', '--vec-y']) {
        const v = tokenValue(block, t)
        expect(v, `${theme} ${t}`).toBeDefined()
        expect(contrast(v!, canvas), `${theme} ${t} ${v} on ${canvas}`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('keeps the six arrow colours and the resultant apart for normal, protanope, deuteranope and tritanope eyes', () => {
    for (const [theme, selector] of Object.entries(BLOCKS)) {
      const block = themeBlock(css, selector)
      const set = [...ARROWS, '--vec-result'].map((t) => [t, tokenValue(block, t)!] as const)
      for (const vision of VISIONS) {
        for (let i = 0; i < set.length; i++) {
          for (let j = i + 1; j < set.length; j++) {
            const d = colourDistance(set[i][1], set[j][1], vision)
            expect(d, `${theme} ${vision}: ${set[i][0]} ${set[i][1]} and ${set[j][0]} ${set[j][1]}`).toBeGreaterThanOrEqual(APART)
          }
        }
      }
    }
  })

  it('keeps the x and y components apart for every kind of eye (Moonlight Gold’s were 3.1 for a deuteranope)', () => {
    expect(colourDistance('#f28474', '#7ac488', 'deuteranopia')).toBeLessThan(6)
    for (const [theme, selector] of Object.entries(BLOCKS)) {
      const block = themeBlock(css, selector)
      for (const vision of VISIONS) {
        expect(colourDistance(tokenValue(block, '--vec-x')!, tokenValue(block, '--vec-y')!, vision), `${theme} ${vision}`).toBeGreaterThanOrEqual(APART)
      }
    }
  })

  it('hands out the arrow colours from the stylesheet: the palette is Moonlight’s values, one per token', () => {
    const moon = themeBlock(css, BLOCKS.moonlight)
    expect(PALETTE.vector).toEqual(ARROWS.map((t) => tokenValue(moon, t)))
    expect(PALETTE.vector.map((c) => vectorToken(c))).toEqual(ARROWS)
  })
})

describe('GPU Lab swarm colours (Light theme haze)', () => {
  const SWARM = ['--particle-slow', '--particle-fast']

  it('draws the slow and the fast particle colour at 3:1 or better on the canvas, in all four themes', () => {
    for (const theme of THEMES) {
      const block = themeBlock(css, BLOCKS[theme])
      const bg = tokenValue(block, '--canvas-bg')!
      for (const t of SWARM) {
        const c = tokenValue(block, t)
        expect(c, `${theme} ${t}`).toBeDefined()
        expect(contrast(c!, bg), `${theme} ${t} (${c} on ${bg})`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('paints over the Light canvas instead of adding light, and adds light in the three dark themes', () => {
    const light = themeBlock(css, BLOCKS.light)
    const look = particleLook(COLOR_SCHEME.light, tokenValue(light, '--particle-slow')!, tokenValue(light, '--particle-fast')!, 500_000)
    // Added together, 500 000 sprites on #e9eef6 can only go whiter: the haze the record saw.
    expect(look.blending).toBe('normal')
    expect(look.gain).toBe(1)
    for (const theme of ['dark', 'moonlight', 'moongold'] as const) {
      const block = themeBlock(css, BLOCKS[theme])
      const dark = particleLook(COLOR_SCHEME[theme], tokenValue(block, '--particle-slow')!, tokenValue(block, '--particle-fast')!, 500_000)
      expect(dark.blending, theme).toBe('additive')
      expect(dark.gain, theme).toBeCloseTo(0.12, 12)
    }
  })

  it('reads the stylesheet colours into the shader as 0–1 channels', () => {
    const look = particleLook('dark', '#2680ff', '#ff661f', 20_000)
    expect(look.slow).toEqual([0x26 / 255, 0x80 / 255, 1])
    expect(look.fast).toEqual([1, 0x66 / 255, 0x1f / 255])
    expect(look.gain).toBe(0.9)
  })
})
