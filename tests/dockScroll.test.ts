import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { readSource, repoPath, RENDERER_SRC } from './helpers/repo'
import { join } from 'node:path'

// P-FIX-SCROLL: the owner saw two scrollbars side by side in a right-side panel. The panel's own
// `.panel` is meant to be the one scroller; dockview's own stylesheet makes every split-view cell
// (`.dv-view`) `overflow: auto` as well, so a panel one pixel taller than its cell (a fractional
// window zoom is enough) grew a second scrollbar around the first.

const css = readSource('src/renderer/src/styles.css')
const dockCss = readFileSync(repoPath('node_modules', 'dockview-react', 'dist', 'styles', 'dockview.css'), 'utf8')

/** Every rule of a stylesheet as [selector, body]; comments removed first, @media/@layer blocks flattened. */
function rules(text: string): [string, string][] {
  const flat = text.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: [string, string][] = []
  for (const m of flat.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) out.push([m[1].trim(), m[2]])
  return out
}
const scrolls = (body: string): boolean => /overflow(-y)?\s*:\s*(auto|scroll)/.test(body)

describe('one vertical scroller per dock panel', () => {
  it('dockview itself makes its split-view cells scrollers (the premise of the fix)', () => {
    const cells = rules(dockCss).filter(([sel, body]) => /\.dv-view\b/.test(sel) && !/pane/.test(sel) && scrolls(body))
    expect(cells.length, 'if dockview stops doing this, the override below can go').toBeGreaterThan(0)
  })

  it('PhysLab overrides every dockview cell that scrolls, with !important so the unlayered rule loses', () => {
    const own = rules(css)
    const cellRules = rules(dockCss).filter(([sel, body]) => /\.dv-view\b/.test(sel) && !/pane/.test(sel) && scrolls(body))
    for (const [sel] of cellRules) {
      const beaten = own.some(([s, body]) => s.split(',').some((p) => p.trim() === sel.trim() || /^\.dv-view\b/.test(p.trim())) && /overflow\s*:\s*hidden\s*!important/.test(body))
      expect(beaten, `${sel} is a second scroller around the panel`).toBe(true)
    }
  })

  it('the panel stays the scroller (.panel scrolls, in the components layer)', () => {
    const panel = rules(css).find(([sel]) => sel === '.panel')!
    expect(panel[1]).toMatch(/overflow\s*:\s*auto/)
  })

  it.each(['Measurements', 'VectorCalc', 'Properties', 'Practice'])('%s has no scrolling box of its own inside the panel', (name) => {
    const src = readFileSync(join(RENDERER_SRC, 'panels', `${name}.tsx`), 'utf8')
    expect(src.match(/overflow-(y-)?(auto|scroll)/g) ?? []).toEqual([])
  })
})
