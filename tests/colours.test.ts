// Nothing on screen may carry a colour of its own.
//
// Several bugs were a literal colour that was invisible in the light theme: menus, popups, the
// focused tab, a chart with dark-grey axes on a white background. The rule in AGENTS.md says
// "never hardcode a colour"; this test is what makes the rule hold. It reads every .tsx file under
// the renderer and fails on a hex value or a fixed Tailwind palette utility (text-zinc-400,
// bg-[#26282d], text-amber-300…). The token utilities declared at the top of styles.css
// (text-ink-dim, bg-surface-2, text-warn…) resolve through the theme and are the way to do it.
//
// The same goes for type: a size is one of the named steps (text-fine … text-display), never a
// pixel value in a class or an inline font, so a panel cannot quietly invent a 10.5 px label.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer', 'src')

/**
 * Files that still carry their own colours, waiting on the phase that owns them. Tighten after
 * merge: remove every entry that has become clean, and never add one for a new file.
 */
const COLOUR_ALLOW = new Set([
  'render/CameraRig.tsx',
  'render/GraphView.tsx',
  'render/Interaction.tsx',
  'render/Marks.tsx',
  'render/ObjectViews.tsx',
  'render/SandboxView.tsx',
  'render/Viewport.tsx'
])

/** Files that still size text in pixels. Tighten after merge, as above. */
const SIZE_ALLOW = new Set([
  'panels/Sandbox.tsx',
  'panels/Solver.tsx',
  'panels/Timeline.tsx',
  'panels/VectorCalc.tsx',
  'render/Viewport.tsx'
])

const PALETTE = 'gray|zinc|neutral|slate|stone|white|black|amber|emerald|sky|violet|red|rose|green|blue|yellow|orange|indigo|lime|cyan|teal|pink|fuchsia|purple'
const PROPS = 'text|bg|border|ring|divide|placeholder|outline|fill|stroke|accent|shadow|from|to|via|caret|decoration'

const LEAKS: { what: string; re: RegExp }[] = [
  { what: 'hex colour', re: /#[0-9a-fA-F]{3,8}\b/g },
  { what: 'palette utility', re: new RegExp(`\\b(?:${PROPS})-(?:${PALETTE})\\b(?:-\\d+)?(?:/\\d+)?`, 'g') },
  { what: 'arbitrary colour utility', re: new RegExp(`\\b(?:${PROPS})-\\[#[^\\]]*\\]`, 'g') },
  // A colour function or a named colour in a style object is the same leak without the hash.
  { what: 'colour function', re: /\b(?:rgba?|hsla?)\(/g },
  { what: 'named colour', re: /\b(?:color|background|fill|stroke)\s*:\s*['"`](?:white|black|red|grey|gray|transparent)['"`]/g }
]

const SIZES: { what: string; re: RegExp }[] = [
  // Tailwind's own text-xs and text-sm are pixel sizes with a nicer name, not one of the steps.
  { what: 'pixel text size', re: /\b(?:text|leading)-\[[0-9.]+(?:px|rem|em)\]/g },
  { what: 'built-in text size', re: /\btext-(?:xs|sm|base|lg|xl|\dxl)\b/g },
  { what: 'inline font', re: /\bfont(?:Family|Size)\s*:/g },
  { what: 'inline font shorthand', re: /\bfont\s*:\s*['"`]/g }
]

/** Every match of every pattern, with its line number, so a failure says where to look. */
export function findLeaks(source: string, patterns: { what: string; re: RegExp }[]): string[] {
  const out: string[] = []
  source.split('\n').forEach((line, i) => {
    for (const { what, re } of patterns) {
      for (const m of line.matchAll(re)) out.push(`${i + 1}: ${what} ${m[0]}`)
    }
  })
  return out
}

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p))
    else if (name.endsWith('.tsx')) out.push(p)
  }
  return out
}

const files = tsxFiles(ROOT).map((p) => ({ rel: relative(ROOT, p).split(sep).join('/'), text: readFileSync(p, 'utf8') }))

describe('the renderer has no colour of its own', () => {
  it('finds at least the shell, so the scan is looking in the right place', () => {
    expect(files.map((f) => f.rel)).toContain('app/CommandBar.tsx')
  })

  it('uses theme tokens, never a hex value or a fixed palette class', () => {
    const offending = files.filter((f) => !COLOUR_ALLOW.has(f.rel)).map((f) => ({ file: f.rel, leaks: findLeaks(f.text, LEAKS) })).filter((f) => f.leaks.length)
    expect(offending, offending.map((f) => `${f.file}\n  ${f.leaks.join('\n  ')}`).join('\n')).toEqual([])
  })

  it('sizes text in named steps, never in pixels', () => {
    const offending = files.filter((f) => !SIZE_ALLOW.has(f.rel)).map((f) => ({ file: f.rel, leaks: findLeaks(f.text, SIZES) })).filter((f) => f.leaks.length)
    expect(offending, offending.map((f) => `${f.file}\n  ${f.leaks.join('\n  ')}`).join('\n')).toEqual([])
  })

  it('keeps the allow-lists honest: every entry still exists and still needs to be there', () => {
    // The lists may only shrink. An entry for a file that was renamed or deleted, or one that a
    // later phase has cleaned, fails here so it gets removed rather than quietly outliving its reason.
    const names = new Set(files.map((f) => f.rel))
    const missing = [...COLOUR_ALLOW, ...SIZE_ALLOW].filter((rel) => !names.has(rel))
    expect(missing, 'allow-listed but no such file any more').toEqual([])
    const cleanColour = [...COLOUR_ALLOW].filter((rel) => files.some((f) => f.rel === rel && findLeaks(f.text, LEAKS).length === 0))
    const cleanSize = [...SIZE_ALLOW].filter((rel) => files.some((f) => f.rel === rel && findLeaks(f.text, SIZES).length === 0))
    expect(cleanColour, 'now clean — remove these from COLOUR_ALLOW').toEqual([])
    expect(cleanSize, 'now clean — remove these from SIZE_ALLOW').toEqual([])
  })
})

describe('the scan itself', () => {
  it('catches every way a colour has leaked before', () => {
    // An arbitrary utility is reported twice, once as the utility and once for the hex inside it.
    expect(findLeaks('className="bg-[#26282d] text-zinc-400"', LEAKS)).toEqual(['1: hex colour #26282d', '1: palette utility text-zinc-400', '1: arbitrary colour utility bg-[#26282d]'])
    expect(findLeaks("const COLORS = ['#4dabf7']", LEAKS)).toEqual(['1: hex colour #4dabf7'])
    expect(findLeaks('className="hover:bg-[#2f4a7a55] text-amber-300/80"', LEAKS)).toHaveLength(3)
    expect(findLeaks("className='border-black/20'", LEAKS)).toEqual(['1: palette utility border-black/20'])
  })

  it('lets token utilities and element ids through', () => {
    expect(findLeaks('className="bg-surface-2 text-ink-dim border-line hover:text-ink-strong"', LEAKS)).toEqual([])
    expect(findLeaks("document.getElementById('#command-input')", LEAKS)).toEqual([])
    expect(findLeaks("style={{ color: o.color }}", LEAKS)).toEqual([])
  })

  it('catches pixel sizes and inline fonts', () => {
    expect(findLeaks('className="text-[11px]"', SIZES)).toHaveLength(1)
    expect(findLeaks("style={{ fontFamily: 'Cambria, serif' }}", SIZES)).toHaveLength(1)
    expect(findLeaks('className="text-fine font-math"', SIZES)).toEqual([])
  })

  it('catches the sizes and colours that have no hash or px to give them away', () => {
    expect(findLeaks('className="text-xs leading-[10px] text-[0.7rem]"', SIZES)).toHaveLength(3)
    expect(findLeaks("style={{ font: '11px Cambria' }}", SIZES)).toEqual(["1: inline font shorthand font: '"])
    expect(findLeaks("style={{ color: 'white', background: 'rgba(0,0,0,0.5)' }}", LEAKS)).toHaveLength(2)
    expect(findLeaks('className="text-lead font-mono"', SIZES)).toEqual([])
    // "context" and "textarea" contain text-, and a fill from a token is not a colour of its own.
    expect(findLeaks("const context = 'textarea'; fill={themeColor('--accent')}", [...LEAKS, ...SIZES])).toEqual([])
  })
})
