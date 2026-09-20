// The shell's layout decisions. The old default layout opened all sixteen panels at fixed pixel
// widths, "Reset the panel layout" never reset anything, and a 1366-pixel laptop was handed a
// window wider than its screen: every rule here is one of those, stated as a number.

import { describe, expect, it } from 'vitest'
import {
  LAYOUT_VERSION,
  barDensity,
  clampZoom,
  columns,
  needsLayoutRebuild,
  panelHome,
  panelsForMode,
  placeTourCard,
  shelfMode,
  shelfWidth,
  windowClass,
  zoomPercent
} from '../src/renderer/src/app/layoutMath'
import { MODES } from '../src/renderer/src/app/modes'
import { WELCOME_JOB } from '../src/renderer/src/app/tour/steps'
import { JOBS, runPure } from '../src/renderer/src/math/pure/run'

describe('how much of the top bar fits', () => {
  it('folds the mode tabs into a menu under 1500 px and goes to icons under 1150 px', () => {
    expect(barDensity(1920)).toBe('full')
    expect(barDensity(1500)).toBe('full')
    expect(barDensity(1499)).toBe('compact')
    expect(barDensity(1150)).toBe('compact')
    // A 1366×768 laptop at 125 % Windows scaling is 1093 DIP wide.
    expect(barDensity(1093)).toBe('tight')
    expect(barDensity(960)).toBe('tight')
  })

  it('shows everything until the bar has been measured (width 0)', () => {
    expect(barDensity(0)).toBe('full')
  })
})

describe('column sizes', () => {
  it('are fractions of the window, clamped', () => {
    const wide = columns(1920, 1080)
    expect(wide.side).toBe(460)
    expect(wide.examples).toBe(280)
    const laptop = columns(1093, 650)
    expect(laptop.side).toBe(306)
    expect(laptop.examples).toBe(200)
    const min = columns(960, 600)
    expect(min.side).toBe(300)
    expect(min.examples).toBe(200)
    expect(min.bottom).toBe(156)
  })

  it('always leave the drawing at least its minimum on the smallest window', () => {
    const c = columns(960, 600)
    expect(960 - c.side - c.examples).toBeGreaterThanOrEqual(c.viewportMin)
  })

  it('never let a minimum exceed the initial size', () => {
    for (const w of [960, 1093, 1366, 1920, 2560]) {
      const c = columns(w, 800)
      expect(c.sideMin).toBeLessThanOrEqual(c.side)
      expect(c.examplesMin).toBeLessThanOrEqual(c.examples)
      expect(c.bottomMin).toBeLessThanOrEqual(c.bottom)
    }
  })
})

describe('when a saved layout is used again', () => {
  const now = { w: 1920, h: 1080 }

  it('is rebuilt when there is no stamp (the old unversioned JSON)', () => {
    expect(needsLayoutRebuild(null, now)).toBe(true)
    expect(needsLayoutRebuild({}, now)).toBe(true)
    expect(needsLayoutRebuild({ v: LAYOUT_VERSION }, now)).toBe(true)
  })

  it('is rebuilt when the schema changed', () => {
    expect(needsLayoutRebuild({ v: LAYOUT_VERSION - 1, app: '0.3.6', w: 1920, h: 1080 }, now)).toBe(true)
  })

  it('is kept across an app update on the same class of window', () => {
    expect(needsLayoutRebuild({ v: LAYOUT_VERSION, app: '0.3.6', w: 1680, h: 1020 }, now)).toBe(false)
  })

  it('is rebuilt when the window moved to another class (monitor to laptop)', () => {
    expect(needsLayoutRebuild({ v: LAYOUT_VERSION, app: '0.3.6', w: 1920, h: 1080 }, { w: 1093, h: 650 })).toBe(true)
    expect(needsLayoutRebuild({ v: LAYOUT_VERSION, app: '0.3.6', w: 1200, h: 800 }, { w: 1300, h: 800 })).toBe(false)
  })

  it('classes windows the same way the bar folds', () => {
    expect(windowClass(960)).toBe('narrow')
    expect(windowClass(1300)).toBe('medium')
    expect(windowClass(1920)).toBe('wide')
  })
})

describe('what a mode opens by default', () => {
  it('opens three panels for a drawing mode with lessons, not sixteen', () => {
    const vectors = MODES.find((m) => m.id === 'vectors')!
    expect(panelsForMode(vectors)).toEqual(['viewport', 'examples', 'vectorcalc'])
  })

  it('opens the calculator with its working in the centre and the keypad beside it', () => {
    const calc = MODES.find((m) => m.id === 'calculator')!
    expect(panelsForMode(calc)).toEqual(['viewport', 'working', 'calculator'])
  })

  it('gives the sandbox just the world and its panel', () => {
    const sandbox = MODES.find((m) => m.id === 'sandbox')!
    expect(panelsForMode(sandbox)).toEqual(['viewport', 'sandbox'])
  })

  it('never opens more than four panels for any mode', () => {
    for (const m of MODES) expect(panelsForMode(m).length).toBeLessThanOrEqual(4)
  })

  it('never lists a panel twice', () => {
    for (const m of MODES) {
      const ids = panelsForMode(m)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('knows where each panel lives when it has no neighbour', () => {
    expect(panelHome('viewport')).toBe('centre')
    expect(panelHome('working')).toBe('centre')
    expect(panelHome('examples')).toBe('left')
    expect(panelHome('console')).toBe('below')
    expect(panelHome('labdata')).toBe('right')
    expect(panelHome('vectorcalc')).toBe('right')
  })
})

describe('the tool shelf', () => {
  const shapes = MODES.find((m) => m.id === 'shapes')!.tools
  const vectors = MODES.find((m) => m.id === 'vectors')!.tools

  it('is hidden in a mode whose only tool is Move', () => {
    expect(shelfMode(1920, ['select'])).toBe('hidden')
    for (const id of ['sandbox', 'gpu', 'lab'] as const) {
      expect(shelfMode(1920, MODES.find((m) => m.id === id)!.tools)).toBe('hidden')
    }
  })

  it('shows labels when they fit and icons when they do not', () => {
    expect(shelfMode(1920, shapes)).toBe('full')
    // Geometry's 20 tools and 6 separators need about 1130 px with labels.
    expect(shelfWidth(shapes, 'full')).toBeGreaterThan(1093)
    expect(shelfMode(1093, shapes)).toBe('icons')
    expect(shelfWidth(shapes, 'icons')).toBeLessThan(960)
    expect(shelfMode(960, shapes)).toBe('icons')
    expect(shelfMode(960, vectors)).toBe('full')
  })

  it('shows labels until it has been measured', () => {
    expect(shelfMode(0, shapes)).toBe('full')
  })
})

describe('the tour card', () => {
  const win = { w: 1366, h: 768 }
  const card = { w: 352, h: 200 }

  it('goes under the highlighted thing when there is room', () => {
    const p = placeTourCard({ left: 300, top: 40, width: 400, height: 30 }, card, win)
    expect(p).toEqual({ left: 300, top: 82 })
  })

  it('goes above it near the bottom of the screen', () => {
    const p = placeTourCard({ left: 300, top: 700, width: 400, height: 40 }, card, win)
    expect(p.top).toBe(700 - 12 - 200)
  })

  it('stays inside the window on the right', () => {
    const p = placeTourCard({ left: 1300, top: 40, width: 50, height: 30 }, card, win)
    expect(p.left + card.w + 8).toBeLessThanOrEqual(win.w)
  })

  it('measures the card rather than assuming a height', () => {
    const tall = { w: 352, h: 500 }
    const p = placeTourCard({ left: 300, top: 300, width: 400, height: 30 }, tall, win)
    expect(p.top + tall.h + 8).toBeLessThanOrEqual(win.h)
    expect(p.top).toBeGreaterThanOrEqual(8)
  })
})

describe('window zoom', () => {
  it('moves in half steps inside its range', () => {
    expect(clampZoom(0.5)).toBe(0.5)
    expect(clampZoom(0.3)).toBe(0.5)
    expect(clampZoom(7)).toBe(3)
    expect(clampZoom(-9)).toBe(-3)
    expect(clampZoom(NaN)).toBe(0)
  })

  it('is shown as the percentage a student recognises', () => {
    expect(zoomPercent(0)).toBe(100)
    expect(zoomPercent(1)).toBe(120)
    expect(zoomPercent(-1)).toBe(83)
  })
})

describe('the Welcome screen tile "Show your working"', () => {
  it('opens on a job that exists and whose own example produces checked working', () => {
    const job = JOBS.find((j) => j.id === WELCOME_JOB)
    expect(job).toBeDefined()
    const w = runPure(job!.id, job!.example)
    expect(w.error).toBeUndefined()
    expect(w.answers.length).toBeGreaterThan(0)
    expect(w.moves.length).toBeGreaterThan(0)
    expect(w.noWorking).toBeFalsy()
  })
})
